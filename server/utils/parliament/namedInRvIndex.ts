/**
 * The period's „genannt" index — which drafts the Erläuterungen of another
 * draft's Regierungsvorlage name (`namedInRv.ts` holds the rule; this file
 * fetches and caches).
 *
 * WHAT IT READS: list 81 (and the next period's, for successors), list 101,
 * the station map (whom Parliament links each Vorlage to), and for every
 * Vorlage inside a candidate's window its detail JSON (`getGegenstand`) and
 * its Erläuterungen' HTML (`fetchDocument`, on disk for a month) — four at a
 * time, each document let go once its matches are taken. A PDF only where
 * it could be the second witness of an otherwise accepted draft
 * (`buildNamedIndex`). GP XXVIII: 131 Vorlagen, 9 of them PDF only.
 *
 * WHAT IT KEEPS: draft → { Vorlage, Erläuterungen URL, one quote, the
 * Vorlage's linked drafts } — a few hundred bytes per accepted draft, never
 * a text.
 *
 * HOW LONG: the documents are immutable, so the index changes only when
 * what it was built from does — a new Vorlage, a draft, a Frist. The
 * fingerprint of the two lists is that signal (`listsFingerprint`): a
 * different one counts the entry as expired, and Nitro serves the old index
 * while it rebuilds (SWR; the old index stays true — a Vorlage that named a
 * draft still does). Otherwise a week (`SETTLED_TTL_S`), as our reading of
 * settled documents.
 *
 * FAILURE IS AN ANSWER: a Vorlage whose record or document could not be
 * fetched, a draft the station map could not read, a list that failed — the index is
 * incomplete, kept ten minutes so a failing upstream is not asked again on
 * every page, and NEVER read (`namedInRvFor`): a partial scan could miss the
 * second witness that would have refused the state. The page then shows what
 * it showed before the index existed.
 */
import { createHash } from 'node:crypto'
import type { DraftSummary, NamedInRv } from '#shared/types'
import { gpHasEnded, intToRoman, romanToInt } from '#shared/utils/gp'
import { DERIVED_CACHE } from '../cache/base'
import { keepIncompleteFor, type Gathered } from '../cache/gathered'
import { staleWithin } from '../cache/stale'
import { SETTLED_STALE_S, SETTLED_TTL_S } from '../cache/ttl'
import { withinBudget } from '../http/budget'
import { upstreamBytes, type UpstreamPolicy } from '../upstream/fetch'
import { fetchDocument } from '../upstream/fetchDocument'
import { mapDocuments } from './detailJson'
import { dedupeDraftList } from './draftList'
import { getCurrentGp, getDraftsForGp, getGegenstand, getVorlagenForGp } from './drafts'
import { buildNamedIndex, explanationsFormats, pdfParagraphs, type LinkedDraft, type VorlageReading, type WitnessVorlage } from './namedInRv'
import { getStationMapForGp } from './stationMap'

/** Vorlagen read at once — the documents are on disk after the first build, the records in memory. */
const CONCURRENCY = 4

/** An incomplete index is kept this long, and never read. */
const INCOMPLETE_INDEX_TTL_MS = 10 * 60 * 1000

/** A PDF read for the second witness: a Budgetbegleitgesetz's Erläuterungen are about 5 MB. */
const PDF_POLICY: UpstreamPolicy = {
  timeoutMs: 30_000,
  retries: 2,
  backoffMs: (attempt) => 600 * attempt,
  maxBytes: 24 * 1024 * 1024,
  // The URL comes out of Parliament's record.
  upstreamHostsOnly: true,
}

/** The index of one period; `fingerprint` names the lists it was built from. */
interface NamedIndex {
  named: Record<number, NamedInRv>
  fingerprint: string
}

/** The lists the index rests on, as one hash: the Vorlagen (number, Einlangen) and the drafts (number, title, Frist). */
function listsFingerprint(drafts: readonly DraftSummary[], vorlagen: readonly { inr: number; date: string }[]): string {
  const h = createHash('sha1')
  for (const v of vorlagen) h.update(`v${v.inr}|${v.date};`)
  for (const d of drafts) h.update(`d${d.inr}|${d.title}|${d.deadline};`)
  return h.digest('hex')
}

/** The fingerprint each period's index was last built from — the expiry signal; dies with the memory cache. */
const builtFrom = new Map<string, string>()

const buildIndex = defineCachedFunction(
  async (gp: string, fingerprint: string): Promise<Gathered<NamedIndex>> => {
    const n = romanToInt(gp)
    const [own, vorlagen, currentGp] = await Promise.all([getDraftsForGp(gp), getVorlagenForGp(gp), getCurrentGp()])
    // The successor of a draft of an ENDED period is filed in the next one (`findRelated`).
    const next = n !== null && gpHasEnded(gp, currentGp) ? intToRoman(n + 1) : null
    let complete = true
    const [laterDrafts, stations] = await Promise.all([
      next
        ? getDraftsForGp(next)
            .then((r) => r.items)
            .catch(() => {
              complete = false
              return [] as DraftSummary[]
            })
        : Promise.resolve([] as DraftSummary[]),
      getStationMapForGp(gp).catch(() => null),
    ])
    const chains = stations ?? {}
    const drafts = dedupeDraftList(own.items)
    /* A draft missing from the station map (its record could not be read)
     * could be linked to a Vorlage we would then call unlinked — the index
     * needs every draft's chain. Whatever else the map lacks (a Kundmachung's
     * date, a Vorlage's house status) the index does not read. */
    if (!stations || drafts.some((d) => !chains[d.inr])) complete = false

    // Whom the station map links each Vorlage to — beside the Vorlage's own
    // `preconst`, which 32 of 117 Vorlagen of GP XXVIII do not carry.
    const linkedTo = new Map<string, LinkedDraft[]>()
    for (const d of drafts) {
      for (const l of chains[d.inr]?.rvLinks ?? []) {
        const key = `${l.gp}/${l.inr}`
        linkedTo.set(key, [...(linkedTo.get(key) ?? []), { gp: d.gp, inr: d.inr, citation: d.citation, title: d.title }])
      }
    }

    const result = await buildNamedIndex({
      gp,
      drafts,
      laterDrafts,
      // The map's word where it has the draft: a Vorlage, or the Antrag route.
      linked: (inr) => {
        const c = chains[inr]
        return c ? Boolean(c.rvCitation || c.antragCitation) : null
      },
      vorlagen,
      linksOf: (v: WitnessVorlage) => linkedTo.get(`${v.gp}/${v.inr}`) ?? [],
      read: async (v): Promise<VorlageReading> => {
        const detail = await getGegenstand(v.gp, 'I', v.inr)
        const linkedDrafts: LinkedDraft[] = (detail.content?.preconst ?? [])
          .filter((p) => p?.ityp === 'ME' && p.gp_code && p.inr != null)
          .map((p) => ({ gp: String(p.gp_code), inr: Number(p.inr), citation: String(p.zitation ?? `${p.inr}/ME`), title: String(p.betreff ?? '') }))
        const { html, pdf: pdfUrl } = explanationsFormats(mapDocuments(detail.content?.documents))
        return { explanationsUrl: html, html: html ? await fetchDocument(html) : null, pdfUrl, linkedDrafts }
      },
      readPdf: async (url) => pdfParagraphs(new Uint8Array((await upstreamBytes(url, PDF_POLICY)).bytes)),
      limit: CONCURRENCY,
    })
    builtFrom.set(gp, fingerprint)
    return { value: { named: result.named, fingerprint }, complete: complete && result.complete }
  },
  {
    name: 'rv-genannt-gp',
    base: DERIVED_CACHE,
    // One entry per period: a new fingerprint replaces the old index rather than adding a key.
    getKey: (gp: string) => gp,
    // Rebuilt behind the request where the lists moved (SWR serves the old one meanwhile).
    shouldInvalidateCache: (gp: string, fingerprint: string) => {
      const built = builtFrom.get(gp)
      return built !== undefined && built !== fingerprint
    },
    ...staleWithin(SETTLED_TTL_S, SETTLED_STALE_S, keepIncompleteFor(INCOMPLETE_INDEX_TTL_MS)),
  },
)

/**
 * The period's index, or null where it is incomplete or could not be built —
 * never a partial one. Waits as long as the build takes: the prewarm's call,
 * and the caller's own budget (`namedInRvWithin`).
 */
export async function getNamedInRvIndex(gp: string): Promise<Record<number, NamedInRv> | null> {
  const [{ items }, vorlagen] = await Promise.all([getDraftsForGp(gp), getVorlagenForGp(gp)])
  const built = await buildIndex(gp, listsFingerprint(items, vorlagen))
  return built.complete ? built.value.named : null
}

/**
 * The index within `ms`, else null — the draft page and the lists read it as
 * enrichment: a cold build carries on behind the request and fills the
 * cache, and until then the page says what it said before.
 */
export function namedInRvWithin(gp: string, ms: number): Promise<Record<number, NamedInRv> | null> {
  return withinBudget(getNamedInRvIndex(gp), ms)
}
