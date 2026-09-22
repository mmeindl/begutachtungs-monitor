/**
 * The uncached assemblies: everything a detail page and the outcome
 * sections put together out of the leaf caches.
 */
import type {
  DraftDetail,
  DraftDocument,
  DraftSummary,
  EnactmentInfo,
  RelatedDraft,
} from '#shared/types'
import { chainCoverageOf } from '#shared/utils/draftStations'
import { gpEndedOn, gpHasEnded, intToRoman, romanToInt } from '#shared/utils/gp'
import {
  extractBgblLink,
  findHandoff,
  findLastRvLink,
  findRvLinks,
  isFilingOpen,
  mapDocuments,
  mapInvitedBy,
  mapTextEvolution,
  RV_STATION,
  parseShortinfo,
  parseStages,
  type RvLink,
} from './detailJson'
import {
  getCurrentGp,
  getDraftsForGp,
  getGegenstand,
  OLDEST_GP_WITH_ME,
  requireDraft,
} from './drafts'
import { deriveShortTitle } from './list81'
import { buildStatementsSummary, getStatementsWithFallback } from './statements'
import { withinBudget } from '../budget'
import { findRelatedDrafts } from '../related'

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
 * The Regierungsvorlage's half of the outcome: its Kundmachung and whether
 * the Nationalrat still takes Stellungnahmen on it.
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
    filingOpen: false,
  }
  try {
    const rv = await getGegenstand(rvLink.gp, 'I', rvLink.inr)
    const bgbl = extractBgblLink(rv.content?.status?.bgbllinks)
    if (bgbl) {
      enactment.bgblNumber = bgbl.number
      enactment.bgblRisUrl = bgbl.url
    }
    // The second window for input, from the same payload as the BGBl
    // link — no request of its own. Only while the GP runs: a Vorlage
    // that lapsed with its GP takes nothing, whatever a stale flag says.
    enactment.filingOpen = isFilingOpen(rv.content) && !gpHasEnded(gp, currentGp)
  } catch {
    // RV enrichment is optional: bgblNumber/bgblRisUrl stay null, filingOpen false.
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

  // The list-81 counter (row[13]) is dropped here: the detail response
  // carries exactly ONE statements number — from list 142, the same source
  // as the breakdown below it. Sole exception: when list 142 is down, the
  // list-81 count is the only truth left and travels flagged as `degraded`.
  const { statementCount: listCount, ...base } = summary

  const documents = mapDocuments(content.documents)
  // The draft's own document URLs are what upstream repeats while no RV
  // exists — excluded, so only what really came after the ME survives.
  const versions = mapTextEvolution(
    content.statements?.documents,
    new Set(documents.flatMap((doc) => doc.formats.map((f) => f.url))),
  )
  if (enactment) {
    enactment.rvTextUrl =
      versions.find((v) => v.station === RV_STATION && v.url.endsWith('.pdf'))?.url ??
      versions.find((v) => v.station === RV_STATION)?.url ??
      null
  }

  return {
    ...base,
    shortTitle: deriveShortTitle(summary.title),
    description: parseShortinfo(content.shortinfo),
    invitedBy: mapInvitedBy(content.names),
    documents,
    handoff: findHandoff(trace),
    // Later stations only: the RV's own text is enactment.rvTextUrl, where
    // the comparison offers it — listing it here too put the same link
    // under two headings.
    textEvolution: groupVersionsByStation(versions.filter((v) => v.station !== RV_STATION)),
    risDraft: risMap?.rows.find((r) => r.inr === inr) ?? null,
    gpEnded: gpHasEnded(gp, currentGp),
    gpEndedOn: gpEndedOn(gp),
    chainCoverage: chainCoverageOf(
      stationMap ? Object.values(stationMap) : null,
      gpHasEnded(gp, currentGp),
    ),
    predecessor: related.predecessor,
    successor: related.successor,
    statements: statementsResult
      ? {
          ...buildStatementsSummary(statementsResult.items),
          overviewTotal: listCount,
          staleAsOf: statementsResult.staleAsOf,
        }
      : {
          total: listCount,
          organisations: 0,
          privatePersons: 0,
          nonPublic: 0,
          organisationList: [],
          degraded: true,
        },
    enactment,
  }
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

/** One DocumentList row per station ("Geändert im Plenum") with its PDF/HTML formats. */
function groupVersionsByStation(versions: readonly { station: string; url: string }[]): DraftDocument[] {
  const out: DraftDocument[] = []
  for (const v of versions) {
    let doc = out.find((d) => d.title === v.station)
    if (!doc) {
      doc = { title: v.station, formats: [] }
      out.push(doc)
    }
    doc.formats.push({ type: v.url.toLowerCase().endsWith('.html') ? 'html' : 'pdf', url: v.url })
  }
  return out
}
