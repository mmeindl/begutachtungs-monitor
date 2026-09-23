/**
 * The Kundmachung of a Verordnungsentwurf in BGBl II
 * (docs/architecture.md §12.32).
 *
 * Nuxt-aware glue around the pure module `bgblJoin.ts`.
 *
 * CUT BY YEAR, not by „from today backwards". `BgblAuth` has neither a Teil
 * nor a Jahrgang filter — `Teil=Teil2` and `Jahrgang=2025` return all 18,925
 * records (checked 18.09.2026) —, only
 * `VonKundmachungsdatum`/`BisKundmachungsdatum` take effect. A sliding
 * window would therefore be a new cache key every day and a new fetch of the
 * whole window every day. A year is a stable key: past years never change
 * again, the running one grows.
 *
 * TWO LAYERS, as everywhere (`cache/base.ts`): the page as RIS sent it,
 * persistent; the mapping above it derived, because `bgblJoin.ts` is exactly
 * the kind of rule that still changes.
 */
import type { BgblOutcome, BgblOutcomeState, RisConsultation } from '#shared/types'
import { isRunningYear, joinDraftToBgbl, type BgblJoinDraft, type BgblRecord } from './bgblJoin'
import { DERIVED_CACHE } from '../cache/base'
import { PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import { getRisConsultation, getRisOnlyForGp } from './risOnly'
import { withRisActiveOn } from './risRecord'
import { RIS_API_BASE, risJson, type UpstreamPolicy } from '../upstream/fetch'
import { bgblShort, daysUntil, todayIso } from '#shared/utils/format'

const TIMEOUT_MS = 20_000
/**
 * No retry, as before the shared client: both queries hang under a cached
 * function, and an error is thrown, never cached (`cache/base.ts`).
 */
const BGBL_POLICY: UpstreamPolicy = { timeoutMs: TIMEOUT_MS, retries: 0, accept: 'application/json' }
const PAGE_SIZE = 100
const MAX_PAGES = 20
/**
 * The running year grows — a few times a week another piece arrives. The
 * closed one does not, so it gets the lifetime of a published document
 * (`cache/ttl.ts`).
 */
const CURRENT_YEAR_TTL_S = 60 * 60 * 6
const JOIN_TTL_S = 60 * 60 * 6

/**
 * From when on the Bundesgesetzblatt's silence means something.
 *
 * Measured (`pnpm corpus:bgbl2`): between the end of the Frist and the
 * Kundmachung lie a median of 57 days, p90 197. By age of the Frist's end,
 * 0 % of the drafts from the last 30 days find a Kundmachung, 31,6 % after
 * 31–90 days, 71,4 % after 91–180 and 92,3 % after 181–365. „Bisher keine
 * Kundmachung" before that point would therefore be a statement about the
 * clock, not about the Ressort.
 */
const BGBL_SILENCE_MEANS_SOMETHING_DAYS = 180

/**
 * Today's Jahrgang — the newest year a Kundmachung can carry.
 *
 * Vienna's year, like every other day decision here
 * (`#shared/utils/format.todayIso`): on New Year's night the UTC year lags
 * Austria's by an hour, and in that hour the fresh Jahrgang would not exist
 * yet for us.
 *
 * This is the CEILING only, for `yearsFor`. Which years are still asked on
 * the running lifetime is a second and wider question, and it is answered
 * where it is argued (`bgblJoin.isRunningYear`).
 */
function currentYear(): number {
  return Number(todayIso().slice(0, 4))
}

/** The split both cache pairs below run on — see `bgblJoin.isRunningYear`. */
function stillRunning(year: number): boolean {
  return isRunningYear(year, todayIso())
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function loadBgblPage(key: string): Promise<any> {
  const [year, page] = key.split(':')
  const params = new URLSearchParams({
    Applikation: 'BgblAuth',
    DokumenteProSeite: 'OneHundred',
    Seitennummer: String(page),
    VonKundmachungsdatum: `${year}-01-01`,
    BisKundmachungsdatum: `${year}-12-31`,
  })
  // An error inside the 200 envelope is an error, not an empty page —
  // otherwise a bad minute of the RIS turns into a „nicht kundgemacht".
  // `risJson` checks the envelope for all three RIS clients.
  return risJson<any>(`${RIS_API_BASE}?${params}`, BGBL_POLICY)
}

/**
 * The same page, two lifetimes — and therefore two functions.
 *
 * A closed year is finished: it may stand for a month. The running one grows
 * a few times a week, and a Kundmachung that does not show up for a month is
 * exactly the error this module is meant to avoid. `defineCachedFunction`
 * takes one fixed `maxAge`, so the caller decides which of the two it asks
 * — which is more honest than a predicate pretending it could bend the
 * lifetime.
 */
const fetchClosedYearPage = defineCachedFunction(loadBgblPage, {
  name: 'bgbl-jahrgang-seite',
  getKey: (key: string) => key,
  maxAge: PUBLISHED_DOCUMENT_TTL_S,
  swr: false,
})

const fetchCurrentYearPage = defineCachedFunction(loadBgblPage, {
  name: 'bgbl-jahrgang-seite-laufend',
  getKey: (key: string) => key,
  maxAge: CURRENT_YEAR_TTL_S,
  swr: false,
})

function fetchBgblPage(key: string): Promise<any> {
  const year = Number(key.split(':')[0])
  return stillRunning(year) ? fetchCurrentYearPage(key) : fetchClosedYearPage(key)
}

function mapRecord(doc: any): BgblRecord | null {
  const m = doc?.Data?.Metadaten
  const b = m?.Bundesrecht?.BgblAuth
  const id = String(m?.Technisch?.ID ?? '')
  if (!id) return null
  return {
    id,
    teil: String(b?.Teil ?? ''),
    nummer: String(b?.Bgblnummer ?? ''),
    datum: String(b?.Ausgabedatum ?? '').slice(0, 10),
    kurztitel: m?.Bundesrecht?.Kurztitel ?? null,
    titel: m?.Bundesrecht?.Titel ?? null,
    stelle: m?.Technisch?.Einbringer ?? m?.Technisch?.Organ ?? null,
  }
}

/** Teil II of one year — derived, because `mapRecord` is our code. */
async function loadTeil2Year(year: number): Promise<BgblRecord[]> {
  const out: BgblRecord[] = []
  const seen = new Set<string>()
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchBgblPage(`${year}:${page}`)
    const docs: any[] = [result.OgdDocumentResults?.OgdDocumentReference ?? []].flat()
    const hits = Number(result.OgdDocumentResults?.Hits?.['#text'] ?? 0)
    for (const doc of docs) {
      const rec = mapRecord(doc)
      if (rec && rec.teil === 'Teil2' && !seen.has(rec.id)) {
        seen.add(rec.id)
        out.push(rec)
      }
    }
    if (docs.length < PAGE_SIZE || page * PAGE_SIZE >= hits) break
  }
  return out
}

/**
 * Two lifetimes, two functions — the same split as for the pages underneath,
 * and for the same reason.
 *
 * Until 22.09.2026 this derived year ran on the running year's lifetime for
 * EVERY year: a closed year was reassembled from its up to twenty pages four
 * times a day, although nothing about it can change any more. The pages
 * underneath had long known better — only the derivation above them did not.
 *
 * A month on a derived value is no contradiction to `cache/base.ts` here:
 * the derived layer lives in memory and dies with the worker — and a
 * `mapRecord` that changes is a code change, which is to say exactly that
 * restart.
 */
const getClosedTeil2Year = defineCachedFunction(loadTeil2Year, {
  name: 'bgbl-teil2-jahrgang',
  base: DERIVED_CACHE,
  getKey: (year: number) => String(year),
  maxAge: PUBLISHED_DOCUMENT_TTL_S,
  swr: false,
})

const getCurrentTeil2Year = defineCachedFunction(loadTeil2Year, {
  name: 'bgbl-teil2-jahrgang-laufend',
  base: DERIVED_CACHE,
  getKey: (year: number) => String(year),
  maxAge: CURRENT_YEAR_TTL_S,
  swr: false,
})

export function getBgblTeil2Year(year: number): Promise<BgblRecord[]> {
  return stillRunning(year) ? getCurrentTeil2Year(year) : getClosedTeil2Year(year)
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The search for ONE Kundmachung, by its citation.
 *
 * `Bgblnummer` is the one exact filter `BgblAuth` has — „BGBl. I Nr.
 * 69/2026" returns exactly one record (checked 18.09.2026). For the BGBl
 * station of the § comparison that is the whole path: Parliament names the
 * citation in structured form, we look the document up. No join, no
 * similarity (§12.33).
 */
const fetchBgblByNumber = defineCachedFunction(
  async (nummer: string): Promise<any> => {
    const params = new URLSearchParams({
      Applikation: 'BgblAuth',
      DokumenteProSeite: 'Ten',
      Seitennummer: '1',
      // Parliament writes „Bundesgesetzblatt I Nr. 69/2026", RIS expects its
      // own short form.
      Bgblnummer: bgblShort(nummer),
    })
    return risJson<any>(`${RIS_API_BASE}?${params}`, BGBL_POLICY)
  },
  { name: 'bgbl-nummer-suche', getKey: (nummer: string) => nummer, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/** A Kundmachung's main document, in the formats the comparison needs. */
interface BgblDocument {
  id: string
  /** The legistic XML — the same shape as in Begut, so readable without a new parser. */
  xml: string | null
  /** The human-readable version, for the source credit. */
  html: string | null
  /** The document's page in RIS. */
  page: string
}

/**
 * The Kundmachung for a citation — derived, because walking the document
 * list is our code and can change.
 */
export const getBgblDocument = defineCachedFunction(
  async (nummer: string): Promise<BgblDocument | null> => {
    const result = await fetchBgblByNumber(nummer)
    const refs = [result.OgdDocumentResults?.OgdDocumentReference ?? []].flat()
    const ref = refs[0]
    if (!ref) return null
    const id = String(ref?.Data?.Metadaten?.Technisch?.ID ?? '')
    if (!id) return null
    const crs = [ref?.Data?.Dokumentliste?.ContentReference ?? []].flat()
    const main = crs.find((c: any) => c?.ContentType === 'MainDocument')
    const urls = [main?.Urls?.ContentUrl ?? []].flat()
    return {
      id,
      xml: urls.find((u: any) => u?.DataType === 'Xml')?.Url ?? null,
      html: urls.find((u: any) => u?.DataType === 'Html')?.Url ?? null,
      page: `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=${id}`,
    }
  },
  { name: 'bgbl-dokument', base: DERIVED_CACHE, getKey: (nummer: string) => nummer, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/** The years a Frist's Kundmachung can fall into. */
function yearsFor(ende: string): number[] {
  const y = Number(ende.slice(0, 4))
  const now = currentYear()
  // The window reaches 540 days forward, so at most into the year after
  // next — and never past the running one, where nothing stands yet.
  //
  // The grace period of `isRunningYear` has no business here. This is the
  // list of years ASKED, and January's extra year is already in it: on
  // 15.01.2027 a Frist from 2026 yields [2026, 2027], and the grace only
  // decides that the 2026 half of that pair is still read on the short
  // lifetime. Stretching the ceiling instead would ask RIS for 2028, where
  // by construction nothing can stand yet.
  return [y, y + 1, y + 2].filter((v) => v <= now)
}

function stateOf(ende: string | null, active: boolean, found: boolean): BgblOutcomeState {
  if (found) return 'kundgemacht'
  if (active || !ende) return 'begutachtung'
  // Whole calendar days since the Frist ended, counted like everywhere else
  // (`daysUntil`). The rounded millisecond difference this used to take
  // crossed the threshold in the middle of the afternoon, and a day early on
  // the UTC server. A Frist that will not parse now reads as young rather
  // than as „keine": a failure is not an answer (§12.13).
  const days = -(daysUntil(ende) ?? 0)
  return days < BGBL_SILENCE_MEANS_SOMETHING_DAYS ? 'ausstehend' : 'keine'
}

/**
 * What became of a Verordnungsentwurf.
 *
 * **A failure is not an answer** (§12.13), and here that rule has a name:
 * `ausstehend`. A draft whose Frist ended six weeks ago is not „nicht
 * kundgemacht" — it is young. Telling the two apart is the whole difference
 * between an accountability statement and an insinuation.
 */
const UNKNOWN: BgblOutcome = { state: 'unbekannt', nummer: null, datum: null, url: null, days: null }

function draftOf(c: Pick<RisConsultation, 'title' | 'longTitle' | 'ministryCode' | 'ministryName' | 'deadline'>): BgblJoinDraft {
  return {
    kurztitel: c.title,
    titel: c.longTitle ?? c.title,
    stelle: c.ministryCode ? `${c.ministryCode} (${c.ministryName})` : c.ministryName,
    ende: c.deadline,
  }
}

/** The match as an answer — one place, so list and detail page say the same. */
function outcomeOf(
  c: Pick<RisConsultation, 'deadline' | 'active'>,
  hit: ReturnType<typeof joinDraftToBgbl>,
): BgblOutcome {
  return {
    state: stateOf(c.deadline, c.active, hit !== null),
    nummer: hit?.record.nummer ?? null,
    datum: hit?.record.datum ?? null,
    url: hit ? `https://www.ris.bka.gv.at/eli/bgbl/II/${hit.record.datum.slice(0, 4)}/${numberOf(hit.record.nummer)}` : null,
    days: hit?.days ?? null,
  }
}

export const getBgblOutcome = defineCachedFunction(
  async (risId: string): Promise<BgblOutcome> => {
    const detail = await getRisConsultation(risId)
    if (!detail?.deadline) return UNKNOWN
    const records = (await Promise.all(yearsFor(detail.deadline).map((y) => getBgblTeil2Year(y)))).flat()
    return outcomeOf(detail, joinDraftToBgbl(draftOf(detail), records))
  },
  { name: 'bgbl-outcome', base: DERIVED_CACHE, getKey: (risId: string) => risId, maxAge: JOIN_TTL_S, swr: false },
)

/**
 * The outcome for a whole Gesetzgebungsperiode, in ONE pass.
 *
 * The list shows two thirds of the corpus, and until 19.09.2026 the column
 * „Stand" read „Begutachtung abgeschlossen" on every one of those rows —
 * including where the Verordnung had long been in force. That is the
 * accountability layer failing exactly where someone skims it.
 *
 * Why not `getBgblOutcome` per row: every call would pull the corpus and the
 * years through the cache again, two hundred times over. Here the years are
 * loaded ONCE and every draft is joined against them; the title comparisons
 * themselves are cheap, because `titleTokens` has a cache of its own.
 */
export const getBgblOutcomesForGp = defineCachedFunction(
  async (gp: string): Promise<Record<string, BgblOutcome>> => {
    // `active` does not belong in the record `getRisOnlyForGp` caches —
    // `stateOf` reads it, so the day is decided here
    // (`risRecord.withRisActiveOn`).
    const items = withRisActiveOn((await getRisOnlyForGp(gp)).items)
    // Verordnungen only: a Gesetzesentwurf without a Gegenstand is
    // promulgated in Teil I, and this join does not search that.
    const relevant = items.filter((i) => i.kind === 'verordnung' && i.deadline)
    const years = [...new Set(relevant.flatMap((i) => yearsFor(i.deadline!)))]
    const byYear = new Map(
      await Promise.all(years.map(async (y) => [y, await getBgblTeil2Year(y)] as const)),
    )
    const out: Record<string, BgblOutcome> = {}
    for (const item of relevant) {
      const records = yearsFor(item.deadline!).flatMap((y) => byYear.get(y) ?? [])
      out[item.id] = outcomeOf(item, joinDraftToBgbl(draftOf(item), records))
    }
    return out
  },
  { name: 'bgbl-outcomes-gp', base: DERIVED_CACHE, getKey: (gp: string) => gp, maxAge: JOIN_TTL_S, swr: false },
)

/** „BGBl. II Nr. 50/2026" → „50". For the ELI address RIS itself keeps. */
function numberOf(nummer: string): string {
  return /Nr\.\s*(\d+)/.exec(nummer)?.[1] ?? ''
}
