/**
 * Die Kundmachung eines Verordnungsentwurfs im BGBl II
 * (docs/architecture.md §12.32).
 *
 * Nuxt-aware glue um das reine Modul `bgblJoin.ts`.
 *
 * NACH JAHRGANG GESCHNITTEN, nicht nach „von heute zurück". `BgblAuth` kennt
 * keinen Teil- und keinen Jahrgangsfilter — `Teil=Teil2` und `Jahrgang=2025`
 * liefern alle 18.925 Sätze (geprüft 18.09.2026) —, es wirken nur
 * `VonKundmachungsdatum`/`BisKundmachungsdatum`. Ein gleitendes Fenster wäre
 * damit jeden Tag ein neuer Cache-Schlüssel und jeden Tag ein neuer Abruf des
 * ganzen Fensters. Ein Jahrgang ist ein stabiler Schlüssel: Vergangene Jahre
 * ändern sich nie mehr, das laufende wächst.
 *
 * ZWEI LAYER, wie überall (`cache/base.ts`): die Seite, wie das RIS sie
 * geschickt hat, dauerhaft; die Zuordnung darüber abgeleitet, weil
 * `bgblJoin.ts` genau die Art Regel ist, die sich noch ändert.
 */
import type { BgblOutcome, BgblOutcomeState, RisConsultation } from '#shared/types'
import { joinDraftToBgbl, type BgblJoinDraft, type BgblRecord } from './bgblJoin'
import { DERIVED_CACHE } from '../cache/base'
import { PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import { getRisConsultation, getRisOnlyForGp } from './risOnly'
import { withRisActiveOn } from './risRecord'
import { RIS_API_BASE, risJson, type UpstreamPolicy } from '../upstream/fetch'
import { bgblShort } from '#shared/utils/format'

const TIMEOUT_MS = 20_000
/**
 * Ohne Wiederholungsversuch, wie vor dem gemeinsamen Client: Beide Abfragen
 * hängen unter einer gecachten Funktion, und ein Fehler wird geworfen, nie
 * gecacht (`cache/base.ts`).
 */
const BGBL_POLICY: UpstreamPolicy = { timeoutMs: TIMEOUT_MS, retries: 0, accept: 'application/json' }
const PAGE_SIZE = 100
const MAX_PAGES = 20
/**
 * Der laufende Jahrgang wächst — ein paar Mal pro Woche kommt ein Stück
 * dazu. Der abgeschlossene nicht, der bekommt deshalb die Frist eines
 * veröffentlichten Dokuments (`cache/ttl.ts`).
 */
const CURRENT_YEAR_TTL_S = 60 * 60 * 6
const JOIN_TTL_S = 60 * 60 * 6

/**
 * Ab wann das Schweigen des Bundesgesetzblatts etwas bedeutet.
 *
 * Gemessen (`pnpm audit:bgbl2`): Zwischen Fristende und Kundmachung liegen im
 * Median 57 Tage, p90 197. Nach Alter des Fristendes finden 0 % der Entwürfe
 * aus den letzten 30 Tagen eine Kundmachung, 31,6 % nach 31–90 Tagen, 71,4 %
 * nach 91–180 und 92,3 % nach 181–365. „Bisher keine Kundmachung" vor diesem
 * Punkt wäre also keine Aussage über das Ressort, sondern über die Uhr.
 */
const BGBL_SILENCE_MEANS_SOMETHING_DAYS = 180

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
  // Ein Fehler im 200er-Umschlag ist ein Fehler, keine leere Seite — sonst
  // wird aus einer schlechten Minute des RIS ein „nicht kundgemacht".
  // `risJson` prüft den Umschlag für alle drei RIS-Clients.
  return risJson<any>(`${RIS_API_BASE}?${params}`, BGBL_POLICY)
}

/**
 * Dieselbe Seite, zwei Haltbarkeiten — und deshalb zwei Funktionen.
 *
 * Ein abgeschlossener Jahrgang ist fertig: Er darf einen Monat stehen. Der
 * laufende wächst ein paar Mal pro Woche, und eine Kundmachung, die einen
 * Monat lang nicht erscheint, ist genau der Fehler, den dieses Modul
 * vermeiden soll. `defineCachedFunction` nimmt eine feste `maxAge`, also
 * entscheidet der Aufrufer, welche der beiden er fragt — das ist ehrlicher
 * als ein Prädikat, das so tut, als könnte es die Frist beugen.
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
  return year >= new Date().getFullYear() ? fetchCurrentYearPage(key) : fetchClosedYearPage(key)
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

/** Teil II eines Jahrgangs — abgeleitet, weil `mapRecord` unser Code ist. */
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
 * Zwei Haltbarkeiten, zwei Funktionen — dieselbe Teilung wie bei den Seiten
 * darunter, und aus demselben Grund.
 *
 * Bis 22.09.2026 lief dieser abgeleitete Jahrgang für JEDES Jahr auf der
 * Frist des laufenden: Ein abgeschlossener Jahrgang wurde viermal am Tag neu
 * aus seinen bis zu zwanzig Seiten zusammengesetzt, obwohl sich an ihm nichts
 * mehr ändern kann. Die Seiten darunter wussten es längst besser — nur die
 * Ableitung darüber nicht.
 *
 * Ein Monat auf einem abgeleiteten Wert ist hier kein Widerspruch zu
 * `cache/base.ts`: Die abgeleitete Schicht liegt im Speicher, stirbt also mit
 * dem Worker — und ein `mapRecord`, das sich ändert, ist eine Codeänderung
 * und damit genau dieser Neustart.
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
  return year >= new Date().getFullYear() ? getCurrentTeil2Year(year) : getClosedTeil2Year(year)
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Die Suche nach EINER Kundmachung, über ihre Zitierung.
 *
 * `Bgblnummer` ist der eine exakte Filter, den `BgblAuth` hat — „BGBl. I Nr.
 * 69/2026" liefert genau einen Satz (geprüft 18.09.2026). Für die
 * BGBl-Station des §-Vergleichs ist das der ganze Weg: Das Parlament nennt
 * die Fundstelle strukturiert, wir schlagen das Dokument dazu nach. Kein
 * Join, keine Ähnlichkeit (§12.33).
 */
const fetchBgblByNumber = defineCachedFunction(
  async (nummer: string): Promise<any> => {
    const params = new URLSearchParams({
      Applikation: 'BgblAuth',
      DokumenteProSeite: 'Ten',
      Seitennummer: '1',
      // Das Parlament schreibt „Bundesgesetzblatt I Nr. 69/2026", das RIS
      // erwartet seine eigene Kurzform.
      Bgblnummer: bgblShort(nummer),
    })
    return risJson<any>(`${RIS_API_BASE}?${params}`, BGBL_POLICY)
  },
  { name: 'bgbl-nummer-suche', getKey: (nummer: string) => nummer, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/** Das Hauptdokument einer Kundmachung, in den Formaten, die der Vergleich braucht. */
interface BgblDocument {
  id: string
  /** Das legistische XML — dieselbe Form wie bei Begut, also ohne neuen Parser lesbar. */
  xml: string | null
  /** Die menschenlesbare Fassung, für den Quellenverweis. */
  html: string | null
  /** Die Seite des Dokuments im RIS. */
  page: string
}

/**
 * Die Kundmachung zu einer Zitierung — abgeleitet, weil das Abtragen der
 * Dokumentliste unser Code ist und sich ändern kann.
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

/** Die Jahrgänge, in denen die Kundmachung zu einer Frist liegen kann. */
function yearsFor(ende: string): number[] {
  const y = Number(ende.slice(0, 4))
  const now = new Date().getFullYear()
  // Das Fenster reicht 540 Tage nach vorn, also höchstens in das übernächste
  // Jahr — und nie über das laufende hinaus, denn dort steht nichts.
  return [y, y + 1, y + 2].filter((v) => v <= now)
}

function stateOf(ende: string | null, active: boolean, found: boolean): BgblOutcomeState {
  if (found) return 'kundgemacht'
  if (active || !ende) return 'begutachtung'
  const days = Math.round((Date.now() - Date.parse(ende)) / 86_400_000)
  return days < BGBL_SILENCE_MEANS_SOMETHING_DAYS ? 'ausstehend' : 'keine'
}

/**
 * Was aus einem Verordnungsentwurf geworden ist.
 *
 * **Ein Fehlschlag ist keine Antwort** (§12.13), und hier hat diese Regel
 * einen Namen: `ausstehend`. Ein Entwurf, dessen Frist vor sechs Wochen
 * endete, ist nicht „nicht kundgemacht" — er ist jung. Die beiden
 * auseinanderzuhalten ist der ganze Unterschied zwischen einer
 * Rechenschaftsaussage und einer Unterstellung.
 */
const UNKNOWN: BgblOutcome = { state: 'unbekannt', nummer: null, datum: null, url: null, days: null }

/** Ein Satz, wie der Join ihn liest. */
function draftOf(c: Pick<RisConsultation, 'title' | 'longTitle' | 'ministryCode' | 'ministryName' | 'deadline'>): BgblJoinDraft {
  return {
    kurztitel: c.title,
    titel: c.longTitle ?? c.title,
    stelle: c.ministryCode ? `${c.ministryCode} (${c.ministryName})` : c.ministryName,
    ende: c.deadline,
  }
}

/** Der Treffer als Auskunft — eine Stelle, damit Liste und Detailseite dasselbe sagen. */
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
 * Der Ausgang für eine ganze Gesetzgebungsperiode, in EINEM Durchgang.
 *
 * Die Liste zeigt zwei Drittel des Korpus, und bis 19.09.2026 stand in der
 * Spalte „Stand" auf jeder dieser Zeilen „Begutachtung abgeschlossen" —
 * auch dort, wo die Verordnung längst galt. Das ist die Rechenschaftsschicht
 * genau an der Stelle, an der sie jemand überfliegt.
 *
 * Warum nicht `getBgblOutcome` je Zeile: Jeder Aufruf zöge den Korpus und
 * die Jahrgänge erneut durch den Cache, zweihundertmal. Hier werden die
 * Jahrgänge EINMAL geladen und alle Entwürfe dagegen gejoint; die
 * Titelvergleiche selbst sind billig, weil `titleTokens` seinen eigenen
 * Cache hat.
 */
export const getBgblOutcomesForGp = defineCachedFunction(
  async (gp: string): Promise<Record<string, BgblOutcome>> => {
    // `active` gehört nicht in den Satz, den `getRisOnlyForGp` cacht —
    // `stateOf` liest es, also wird der Tag hier entschieden
    // (`risRecord.withRisActiveOn`).
    const items = withRisActiveOn((await getRisOnlyForGp(gp)).items)
    // Nur Verordnungen: Ein Gesetzesentwurf ohne Gegenstand wird in Teil I
    // kundgemacht, und den durchsucht dieser Join nicht.
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

/** „BGBl. II Nr. 50/2026" → „50". Für die ELI-Adresse, die RIS selbst führt. */
function numberOf(nummer: string): string {
  return /Nr\.\s*(\d+)/.exec(nummer)?.[1] ?? ''
}
