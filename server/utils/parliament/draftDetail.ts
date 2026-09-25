/**
 * The uncached assemblies: everything a detail page and the outcome
 * sections put together out of the leaf caches.
 */
import type {
  DraftDetail,
  DraftSummary,
  EnactmentInfo,
  RelatedDraft,
} from '#shared/types'
import { gpHasEnded, intToRoman, romanToInt } from '#shared/utils/gp'
import {
  amendedStationsOf,
  extractBgblLink,
  findLastRvLink,
  findRvLinks,
  isFilingOpen,
  parseStages,
  parseVote,
  type RvLink,
} from './detailJson'
import { assembleDraftDetail } from './draftDetailAssembly'
import {
  getCurrentGp,
  getDraftsForGp,
  getGegenstand,
  OLDEST_GP_WITH_ME,
  requireDraft,
} from './drafts'
import { getStatementsWithFallback } from './statements'
import { findRelatedDrafts } from './related'
import { stripHtmlToText } from './htmlText'
import { withinBudget } from '../http/budget'

/**
 * How long a page waits for the RIS join before rendering without it.
 *
 * The join is enrichment: matched, unmatched and "we could not ask" all end
 * up as a block that either shows RIS links or isn't there. The cold cost is
 * not: the corpus is ~46 paged RIS requests, and on 2026-09-07 the first
 * detail-page hit after a deploy took **61 s** in production while the
 * prewarm unit was still running (it starts with --no-block after the
 * restart, so a visitor can arrive first — and the 20 h corpus TTL expires
 * during the day too, where swr:false makes the next request pay).
 *
 * Past the budget the reader gets the page and the fetch keeps running, so
 * the cache still fills — whoever pays the cold cost, it is never a visitor.
 * The unbounded call stays where it belongs: /api/ris-map, which is what the
 * prewarm timer hits.
 */
const RIS_JOIN_BUDGET_MS = 2_000

/**
 * Same bargain for the period's station map, which the detail page needs for
 * one question only: may this page say „bisher keine Regierungsvorlage" at
 * all (§12.27)? Per draft the question is undecidable — an archive gap and a
 * shelved draft leave the identical two-entry stage record — so the answer
 * has to come from the period.
 *
 * Enrichment, never a precondition: past the budget the answer is `unknown`,
 * which silences the claim rather than risking a false one. Cold this costs
 * the same hundreds of fetches as on the list, and the same background fill
 * pays for the next visitor. Warm it is 8 ms, and the current GP is prewarmed
 * anyway, so the branch that matters most is the one that is never cold.
 */
const STATION_MAP_BUDGET_MS = 2_000

/**
 * Chain state of one consultation (RV citation + BGBl number) WITHOUT the
 * statements fetch — the dashboard's recently-closed section needs only
 * the outcome, and getDraftDetail would drag list 142 along for
 * every pool item. Pure composition over the Gegenstand leaf caches,
 * deliberately uncached (same reasoning as getDraftDetail below).
 */
export async function getDraftOutcome(
  gp: string,
  inr: number,
): Promise<{ rvCitation: string | null; bgblNumber: string | null }> {
  const detail = await getGegenstand(gp, 'ME', inr)
  const rvLink = findLastRvLink(parseStages(detail.content?.stages))
  if (!rvLink) return { rvCitation: null, bgblNumber: null }
  let bgblNumber: string | null = null
  try {
    const rv = await getGegenstand(rvLink.gp, 'I', rvLink.inr)
    bgblNumber = extractBgblLink(rv.content?.status?.bgbllinks)?.number ?? null
  } catch {
    // RV enrichment is optional: the RV citation alone is still an answer.
  }
  return { rvCitation: rvLink.label, bgblNumber }
}

/**
 * The Regierungsvorlage's half of the outcome: its Kundmachung, what the
 * house did with it, how the clubs voted on it, where it was changed, and
 * whether the Nationalrat still takes Stellungnahmen on it.
 *
 * ALL OF IT FROM THE SAME VORLAGE. The BGBl number was always read from the
 * last Vorlage in the stage list; what parliament did with the text was read
 * from the draft's own mirror of a document list — which belongs to one
 * Vorlage among several whenever a draft produced more than one (§13.4). On
 * XXVIII/26/ME those are two different Vorlagen, and the page put one's
 * silence under the other's Kundmachung: „Text unverändert beschlossen"
 * about a text the Ausschuss and the Plenum had both changed. Five fields,
 * one record, one fetch.
 *
 * Enrichment, never a dependency — a failing RV fetch leaves null fields
 * and no error, because the stations the stage list already names stand
 * without it. `rvTextUrl` is filled by the caller, once the text versions
 * are mapped.
 */
async function enactmentOf(
  rvLinks: readonly RvLink[],
  gp: string,
  currentGp: string,
): Promise<EnactmentInfo | null> {
  const rvLink = rvLinks.at(-1)
  if (!rvLink) return null
  const enactment: EnactmentInfo = {
    rvCitation: rvLink.label,
    rvUrl: rvLink.url,
    rvTextUrl: null,
    rvDate: rvLink.date,
    // Everything before the latest one — the 1:n split, which used to be
    // visible only in the raw stage list.
    furtherRv: rvLinks.slice(0, -1).map((rv) => ({ label: rv.label, url: rv.url })),
    bgblNumber: null,
    bgblRisUrl: null,
    amendedIn: null,
    houseStatus: null,
    houseStatusText: null,
    vote: null,
    filingOpen: false,
  }
  try {
    const rv = await getGegenstand(rvLink.gp, 'I', rvLink.inr)
    const bgbl = extractBgblLink(rv.content?.status?.bgbllinks)
    if (bgbl) {
      enactment.bgblNumber = bgbl.number
      enactment.bgblRisUrl = bgbl.url
    }
    // An empty array is an answer — „this Vorlage published no changed
    // text" — and null is the absence of one. Only the second lets the
    // spine fall back to the draft's mirror.
    enactment.amendedIn = amendedStationsOf(rv.content?.statements?.documents)
    // The house status, from the same payload: without it a decided, a
    // rejected and a withdrawn Vorlage all looked like „im Parlament in
    // Behandlung" — and once the GP was over, all three like „Ohne
    // Beschluss". The reading happens in `app/utils/spine.ts`; what
    // travels is what upstream said.
    const status = rv.content?.status
    enactment.houseStatus = status?.number == null ? null : String(status.number)
    enactment.houseStatusText = status?.description
      ? stripHtmlToText(status.description) || null
      : null
    // Who voted how, from the same payload — the one fact the page was
    // missing at the end of the chain. The status prose above carries it
    // too, in a sentence we do not print; this is the record behind it.
    enactment.vote = parseVote(rv.content?.vote)
    // The second window for input, from the same payload as the BGBl
    // link — no request of its own. Only while the GP runs: a Vorlage
    // that lapsed with its GP takes nothing, whatever a stale flag says.
    enactment.filingOpen = isFilingOpen(rv.content) && !gpHasEnded(gp, currentGp)
  } catch {
    // RV enrichment is optional: bgblNumber/bgblRisUrl, amendedIn, both
    // status fields and the vote stay null, filingOpen false.
  }
  return enactment
}

/**
 * Detail assembly (docs/architecture.md §5):
 * list-81 row (404 if absent) + detail JSON + statements summary +
 * RV enrichment (latest RV; BGBl via Abfrage=BgblAuth; RV errors → nulls).
 *
 * DELIBERATELY UNCACHED. A cache on top of a derived aggregate freezes a
 * snapshot of its inputs and stamps it as fresh — exactly how a days-old
 * statements count was once passed on as a current result here. The function
 * is pure composition over the leaf caches and costs nothing without a
 * cache of its own.
 */
export async function getDraftDetail(
  gp: string,
  inr: number,
): Promise<DraftDetail> {
  // All three leaf calls are independent → parallel. For an unknown INR the
  // first failing 404 wins (list 81 or Gegenstand) — equivalent for the
  // client. List 142 then just returns zero rows.
  const [summary, detail, statementsResult, risMap, stationMap, currentGp] = await Promise.all([
    requireDraft(gp, inr),
    getGegenstand(gp, 'ME', inr),
    // Statements must not take the whole page down: on failure (including
    // the list-142 inconsistency guard) the last-good aggregation is
    // served with visible staleness, and only without one does the page
    // degrade to the list-81 count.
    getStatementsWithFallback(gp, inr).catch(() => null),
    // RIS is a second upstream; neither its outage nor its latency must
    // cost the page. (Nitro auto-import from ./ris — an explicit import
    // would be a cycle.)
    withinBudget(getRisMapForGp(gp), RIS_JOIN_BUDGET_MS),
    // Whether the period links its drafts to Vorlagen at all — the gate on
    // every "no Regierungsvorlage" sentence below (§12.27). Auto-imported
    // from ./stationMap for the same reason as the RIS map above: an
    // explicit import would be a cycle.
    withinBudget(getStationMapForGp(gp), STATION_MAP_BUDGET_MS),
    // Whether this draft's GP is over is decided against the running one
    // (24 h leaf cache; the fallback value can only err towards "läuft").
    getCurrentGp(),
  ])
  const content = detail.content ?? {}

  const trace = parseStages(content.stages)

  const rvLinks = findRvLinks(trace)
  // ONE ROUND TRIP, NOT TWO. `findRelated` needs a single fact about the
  // outcome — whether a Regierungsvorlage exists — and the stage list says
  // that before the Vorlage's own detail JSON is fetched. Awaiting the RV
  // leg first and `findRelated` after it made every detail page pay two
  // sequential upstream hops for one answer each.
  const [enactment, related] = await Promise.all([
    enactmentOf(rvLinks, gp, currentGp),
    findRelated(summary, currentGp, rvLinks.length > 0),
  ])

  // Everything is here; what the page says out of it is
  // `draftDetailAssembly.ts`, where it can be executed without a network.
  return assembleDraftDetail({
    gp,
    summary,
    content,
    trace,
    currentGp,
    statements: statementsResult,
    risMap,
    stationMap,
    enactment,
    related,
  })
}

/**
 * Same-title drafts in this, the previous and — once this GP is over — the
 * next Gesetzgebungsperiode (docs/architecture.md §12.10). Pure composition
 * over the list-81 leaf caches: the extra lists cost one upstream call per
 * GP per TTL, the adjacent GPs are where re-submissions happen (310/ME
 * XXVII → 32/ME XXVIII after the change of government), and further back
 * a same title is a routine repeat amendment, not a relation.
 *
 * Enrichment, never a dependency: a failing list or Gegenstand claims no
 * relation. A predecessor is kept only when it produced NO
 * Regierungsvorlage — that is the "second attempt" fact; a predecessor
 * that passed is a different amendment cycle and stays silent.
 */
async function findRelated(
  summary: DraftSummary,
  currentGp: string,
  hasRv: boolean,
): Promise<{ predecessor: RelatedDraft | null; successor: RelatedDraft | null }> {
  const n = romanToInt(summary.gp)
  const gps = [summary.gp]
  if (n !== null && n - 1 >= OLDEST_GP_WITH_ME) gps.push(intToRoman(n - 1))
  if (n !== null && gpHasEnded(summary.gp, currentGp)) gps.push(intToRoman(n + 1))
  const lists = await Promise.all(
    gps.map((g) =>
      getDraftsForGp(g)
        .then((r) => r.items)
        .catch(() => [] as DraftSummary[]),
    ),
  )
  const { predecessor, successor } = findRelatedDrafts(summary, lists.flat())

  let checkedPredecessor: RelatedDraft | null = null
  if (predecessor) {
    try {
      const prev = await getGegenstand(predecessor.gp, 'ME', predecessor.inr)
      const prevHasRv = findLastRvLink(parseStages(prev.content?.stages)) !== null
      if (!prevHasRv) checkedPredecessor = { ...predecessor, hasRv: false }
    } catch {
      // Unknown outcome → no claim.
    }
  }
  return { predecessor: checkedPredecessor, successor: hasRv ? null : successor }
}
