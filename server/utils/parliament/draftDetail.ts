/**
 * The uncached assemblies: everything a detail page and the outcome
 * sections put together out of the leaf caches.
 */
import type {
  DraftDetail,
  DraftSummary,
  EnactmentInfo,
  NoPromulgation,
  ProcedureRoot,
  RelatedDraft,
} from '#shared/types'
import { antragPathFor, carriesDraft } from '#shared/utils/antragPath'
import { STATUS_AT_BUNDESRAT, STATUS_FINISHED } from '#shared/utils/draftStations'
import { gpHasEnded, intToRoman, romanToInt } from '#shared/utils/gp'
import { mergedWithOf, mergedWithRefOf } from '#shared/utils/miterledigung'
import {
  amendedStationsOf,
  extractBgblLink,
  findBundesratArrival,
  findCommitteeReport,
  findHouseDecisionDate,
  findNoPromulgation,
  findPlenaryAmendments,
  findLastRvLink,
  findRvLinks,
  isVorlageFilingOpen,
  isVorlageGpEnded,
  parseStages,
  parseVote,
  type RawPhase,
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
import { bundesratDecisionOf, objectionBlocksPromulgation, readBundesratObjection } from './bundesratObjection'
import { findRelatedDrafts } from './related'
import { stripHtmlToText } from './htmlText'
import { answerWithinBudget, withinBudget, type Budgeted } from '../http/budget'
import { treatyKindOf } from './vorlageDetailAssembly'
import { resolveTreatyBgbl } from './staatsvertraege'
import { resolveMergedInto } from './mergedInto'

/**
 * How long a page waits for the RIS join before rendering without it.
 *
 * The join is enrichment: matched, unmatched and "we could not ask" all end
 * up as a block that either shows RIS links or isn't there. The cold cost is
 * not: the corpus is ~46 paged RIS requests, and on 2026-09-07 the first
 * detail-page hit after a deploy took **61 s** in production while the
 * prewarm unit was still running (it starts with --no-block after the
 * restart, so a visitor can arrive first). The 20 h corpus TTL expires
 * during the day too; until 12.11.2026, under `swr: false`, the next
 * request then paid the fetch. Now a visitor is served the expired corpus
 * while it refreshes, up to its two-day limit (`RIS_CORPUS_STALE_S`), so
 * the budget bites where there is no corpus at all or one past that limit.
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
 * all? Per draft the question is undecidable — an archive gap and a
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
 * How long the Kundmachung's issue date may take — one cached RIS record
 * (`bgbl-dokument`, the same the station map reads for the list's „Neu"
 * mark), so warm it costs nothing and cold one request. A date that does
 * not arrive leaves `bgblDate` null, and the EU timeline's dot stands at
 * the Beschluss instead of the Kundmachung: slower, not false.
 */
const BGBL_DATE_BUDGET_MS = 2_000

/**
 * How long the page waits for the period's „genannt" index
 * (`namedInRvIndex.ts`) — asked only by a closed draft without a Vorlage.
 * Warm it is a lookup; cold it is the period's Erläuterungen, which the
 * prewarm reads for the running period. Past the budget the draft shows
 * what it showed before the index existed, and the build fills the cache.
 */
const NAMED_IN_RV_BUDGET_MS = 2_000

/**
 * The Kundmachung of a Vorlage or Antrag whose record at Parliament carries
 * no link — from RIS, by the exact key of period and item
 * (`findBgblIForItem`: `Regierungsvorlage` or `Initiativantrag`, 03.10.2026
 * and 14.11.2026) — or null.
 *
 * Asked only where a Kundmachung can exist: a „Beschluss im Nationalrat" in
 * the record, or a status that means one (`5`, `4`). Enrichment like the
 * RIS join above, so the same budget: past it, or on any failure, the
 * fields stay what Parliament said. (Nitro auto-import from ./ris, for the
 * reason given at `getRisMapForGp` below.)
 */
async function bgblFromRis(
  item: Pick<ProcedureRoot, 'gp' | 'ityp' | 'inr'>,
  date: string | null,
  content: { doktyp?: string | null; phase?: RawPhase[] | null; status?: { number?: unknown } | null } | null | undefined,
): Promise<{ number: string; url: string } | null> {
  if (item.ityp !== 'I' && item.ityp !== 'A') return null
  const decidedAt = findHouseDecisionDate(content?.phase)
  const status = content?.status?.number == null ? null : String(content.status.number)
  if (!decidedAt && status !== STATUS_FINISHED && status !== STATUS_AT_BUNDESRAT) return null
  const from = decidedAt ?? date
  if (!from) return null
  // A treaty's Vorlage (`RVS`, 14.11.2026): BGBl. III or I by the same key
  // (`findBgblForTreaty`); a law's: Teil I.
  if (item.ityp === 'I' && treatyKindOf(content)) {
    return withinBudget(findBgblForTreaty(item.gp, item.inr, from), RIS_JOIN_BUDGET_MS)
  }
  return withinBudget(findBgblIForItem(item.gp, { ityp: item.ityp, inr: item.inr }, from), RIS_JOIN_BUDGET_MS)
}

/**
 * A treaty's Kundmachung by RIS's key, where „no answer in time" and „no
 * record" are NOT the same (14.11.2026): Parliament's link stands only on
 * the second (`resolveTreatyBgbl`). Null where RIS is not asked — the
 * treaty is not approved yet, so no Kundmachung can exist; otherwise what
 * `answerWithinBudget` saw. Same budget as `bgblFromRis`; the lookup runs
 * on and fills its cache for the next request.
 */
async function treatyBgblFromRis(
  item: Pick<ProcedureRoot, 'gp' | 'inr'>,
  date: string | null,
  content: { phase?: RawPhase[] | null; status?: { number?: unknown } | null } | null | undefined,
): Promise<Budgeted<{ number: string; url: string; datum: string } | null> | null> {
  const decidedAt = findHouseDecisionDate(content?.phase)
  const status = content?.status?.number == null ? null : String(content.status.number)
  if (!decidedAt && status !== STATUS_FINISHED && status !== STATUS_AT_BUNDESRAT) return null
  const from = decidedAt ?? date
  if (!from) return null
  return answerWithinBudget(findBgblForTreaty(item.gp, item.inr, from), RIS_JOIN_BUDGET_MS)
}

/**
 * The Antrag a not-promulgated Gesetzesbeschluss names as its successor
 * (`NoPromulgation.successorAntrag`, 80 d.B. → 416/A), with its Kundmachung
 * read from ITS record — or null without a named successor.
 *
 * One extra fetch, only in this rare case. Its failure keeps what the
 * Vorlage's record already said — the Antrag's citation and page — and
 * leaves the BGBl fields null: the successor is Parliament's statement, its
 * Kundmachung our enrichment.
 */
async function successorOf(notPromulgated: NoPromulgation | null): Promise<EnactmentInfo['successor']> {
  const a = notPromulgated?.successorAntrag
  if (!a) return null
  const base = { citation: a.citation, url: `https://www.parlament.gv.at/gegenstand/${a.gp}/A/${a.inr}` }
  try {
    const antrag = await getGegenstand(a.gp, 'A', a.inr)
    const link = extractBgblLink(antrag.content?.status?.bgbllinks)
    return { ...base, bgblNumber: link?.number ?? null, bgblRisUrl: link?.url ?? null }
  } catch {
    return { ...base, bgblNumber: null, bgblRisUrl: null }
  }
}

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
    // No link at Parliament: where the record says the Beschluss was not
    // promulgated, the Kundmachung of the successor it names (the same
    // route the station map takes); otherwise RIS, where one can exist.
    const notPromulgated = findNoPromulgation(rv.content?.phase, rvLink.gp)
    if (!bgblNumber && notPromulgated) bgblNumber = (await successorOf(notPromulgated))?.bgblNumber ?? null
    else if (!bgblNumber) {
      // An Einspruch of the Bundesrat: Parliament links the Kundmachung on
      // the Einspruch's own item; none can come while it stands undecided.
      const objection = await readBundesratObjection({ gp: rvLink.gp, ityp: 'I', inr: rvLink.inr }, rv.content?.phase, null, RIS_JOIN_BUDGET_MS)
      bgblNumber = objection?.bgbl?.number ??
        (objectionBlocksPromulgation(objection?.objection)
          ? null
          : (await bgblFromRis({ gp: rvLink.gp, ityp: 'I', inr: rvLink.inr }, rvLink.date, rv.content))?.number ?? null)
    }
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
 * Vorlage among several whenever a draft produced more than one. On
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
  currentGp: string,
): Promise<EnactmentInfo | null> {
  const rvLink = rvLinks.at(-1)
  if (!rvLink) return null
  return enactmentOfItem(
    { gp: rvLink.gp, ityp: 'I', inr: rvLink.inr },
    rvLink,
    // Everything before the latest one — the 1:n split, which used to be
    // visible only in the raw stage list.
    rvLinks.slice(0, -1).map((rv) => ({ label: rv.label, url: rv.url })),
    currentGp,
  )
}

/**
 * The same five-fields-one-record reading for ANY item that went through the
 * Nationalrat as a Gesetzesvorschlag — a Regierungsvorlage, or a
 * selbständiger Antrag (10.11.2026, the page of a law without a
 * Begutachtung). The Antrag's record carries the same `phase`, `status`,
 * `vote` and `statements.documents` as a Vorlage's (read live on six of each
 * kind's laws of GP XXVIII, 09.11.2026), so every reader below applies as
 * is. RIS is asked for a missing Kundmachung for both kinds since
 * 14.11.2026: it keys a law by its Antrag too (`BgblAuth.Initiativantrag`,
 * `findBgblIForItem`). The item's record is read through the Gegenstand
 * leaf cache, so a caller that fetched it already pays nothing here.
 *
 * The Bundesrat's Einspruch (14.11.2026, `readBundesratObjection`): where
 * the record names one, the Kundmachung comes from the Einspruch's own item
 * — Parliament links it there —, no Kundmachung is looked for while the
 * Nationalrat has not decided on it, and the Bundesrat's „Beschluss" of the
 * law's record is not taken for a Beschluss: it was the Einspruch.
 */
export async function enactmentOfItem(
  item: ProcedureRoot,
  link: { label: string; url: string; date: string | null },
  furtherRv: EnactmentInfo['furtherRv'],
  currentGp: string,
): Promise<EnactmentInfo> {
  const rvLink = { gp: item.gp, inr: item.inr, date: link.date }
  const enactment: EnactmentInfo = {
    rvCitation: link.label,
    rvUrl: link.url,
    rvTextUrl: null,
    rvDate: link.date,
    furtherRv,
    bgblNumber: null,
    bgblRisUrl: null,
    amendedIn: null,
    committeeReport: null,
    plenaryAmendments: null,
    houseStatus: null,
    houseStatusText: null,
    vote: null,
    filingOpen: false,
    // A calendar fact about the link, not about the record behind it — so
    // it stands even when the fetch below fails. The VORLAGE's period, by
    // the same function the station map asks: judged by the draft's, a
    // carried-over Vorlage the house still has read as „Ohne Beschluss –
    // Gesetzgebungsperiode beendet" while its list row said „liegt vor".
    rvGpEnded: isVorlageGpEnded(rvLink.gp, currentGp),
    notPromulgated: null,
    successor: null,
  }
  try {
    const rv = await getGegenstand(item.gp, item.ityp, item.inr)
    // Parliament's link first; without one, RIS by the exact key — the
    // address is then RIS's own document page, the same shape as the link.
    // The procedure's dates after the Ausschuss, and whether Parliament
    // records the Gesetzesbeschluss as not promulgated — all from the same
    // `phase` record, so they are about the Vorlage the fields above are.
    const phase = rv.content?.phase
    // A treaty's Vorlage (14.11.2026): its Kundmachung is in BGBl. III or I,
    // and none is ever overdue (`promulgationOverdue`).
    enactment.treaty = item.ityp === 'I' ? treatyKindOf(rv.content) : null
    enactment.decidedAt = findHouseDecisionDate(phase)
    enactment.bundesratArrivedAt = findBundesratArrival(phase)
    enactment.notPromulgated = findNoPromulgation(phase, rvLink.gp)
    const [successor, objection] = await Promise.all([
      successorOf(enactment.notPromulgated),
      readBundesratObjection(item, phase, currentGp, RIS_JOIN_BUDGET_MS),
    ])
    enactment.successor = successor
    enactment.bundesratObjection = objection?.objection ?? null
    enactment.bundesratDecidedAt = bundesratDecisionOf(phase, objection)
    // No RIS lookup where Parliament says this text was not promulgated, or
    // while an Einspruch stands undecided: there is no Kundmachung of it to
    // find.
    // A treaty: RIS's exact key first, Parliament's link only where RIS has
    // no record (`resolveTreatyBgbl`, the list's rule too).
    // RIS asked and silent past its budget: neither number — the link is
    // not RIS's „no record" — and the page says the Kundmachung cannot be
    // told just now (`bgblUnread`).
    const link = extractBgblLink(rv.content?.status?.bgbllinks)
    const treatyRis = enactment.treaty ? await treatyBgblFromRis(item, rvLink.date, rv.content) : null
    if (treatyRis && !treatyRis.answered) enactment.bgblUnread = true
    const bgbl = enactment.treaty
      ? treatyRis && !treatyRis.answered ? null : resolveTreatyBgbl(treatyRis?.value ?? null, link)
      : link ??
        objection?.bgbl ??
        (enactment.notPromulgated || objectionBlocksPromulgation(objection?.objection)
          ? null
          : await bgblFromRis(item, rvLink.date, rv.content))
    if (bgbl) {
      enactment.bgblNumber = bgbl.number
      enactment.bgblRisUrl = bgbl.url
      // Its issue date, for the EU timeline's stand (auto-imported from
      // ../ris/bgblService, as `findBgblIForItem` above).
      if (bgbl.number) enactment.bgblDate = await withinBudget(getBgblIssueDate(bgbl.number), BGBL_DATE_BUDGET_MS)
    }
    // Three cases (14.11.2026): stations where the record's text list names
    // them; an empty array where a list is there and names neither —
    // „this Vorlage published no changed text"; null where the record was
    // unreadable or carries no list at all (306 of GP XXVII, e.g. 770 d.B.,
    // changed in committee by report 786 d.B.). Only null lets the spine fall
    // back to the draft's mirror, and without one the change is unknown.
    enactment.amendedIn = amendedStationsOf(rv.content?.statements?.documents)
    // Where the committee's changes are explained — the report it filed,
    // linked from the Verlauf of the same payload.
    enactment.committeeReport = findCommitteeReport(rv.content?.phase)
    enactment.plenaryAmendments = findPlenaryAmendments(rv.content?.phase)
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
    // A Miterledigung's other item (14.11.2026): from the status, else from
    // the Verlauf, where the committee's step names it.
    enactment.mergedWith = mergedWithOf(status?.description, rv.content?.phase)
    // Its item with our page of it — a report resolved to the item it is on
    // (`resolveMergedInto`). Only for a Miterledigung; past the budget the
    // citation stands unlinked, and the reads fill the cache for the next.
    const mergedRef = mergedWithRefOf(status?.description, rv.content?.phase)
    if (mergedRef) enactment.mergedInto = await withinBudget(resolveMergedInto(mergedRef, getGegenstand), RIS_JOIN_BUDGET_MS)
    // Who voted how, from the same payload — the one fact the page was
    // missing at the end of the chain. The status prose above carries it
    // too, in a sentence we do not print; this is the record behind it.
    enactment.vote = parseVote(rv.content?.vote)
    // The second window for input, from the same payload as the BGBl
    // link — no request of its own. Only while the VORLAGE's GP runs, by
    // the same function the station map asks: judged by the draft's GP, a
    // carried-over Vorlage's open window read as closed.
    enactment.filingOpen = isVorlageFilingOpen(rv.content, rvLink.gp, currentGp)
  } catch {
    // RV enrichment is optional: bgblNumber/bgblRisUrl, amendedIn,
    // committeeReport, plenaryAmendments, both status fields, the vote, the
    // procedure's later dates, notPromulgated, successor and the Einspruch
    // stay null, filingOpen false.
  }
  return enactment
}

/**
 * Detail assembly:
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
  // The list of the period before, which `findRelated` reads after the
  // calls below: it depends on nothing they answer, so it starts with them
  // and `findRelated` joins the call in flight (or finds it cached) instead
  // of opening a second upstream hop after them. Only a head start —
  // nothing is decided on this promise: `findRelated` reads the list
  // itself, and a failure (never cached) reaches it there, as before.
  // A small saving: the hop is on the critical path only where the draft
  // has no Vorlage (the RV leg is longer otherwise) and the list has gone
  // cold — the carry-over read of `/api/dashboard` keeps it warm.
  const previous = relatedPreviousGp(gp)
  if (previous) void getDraftsForGp(previous).catch(() => {})
  // All three leaf calls are independent → parallel. For an unknown INR the
  // first failing 404 wins (list 81 or Gegenstand) — equivalent for the
  // client. List 142 refuses an unknown INR as well, and caches nothing.
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
    // every "no Regierungsvorlage" sentence below. Auto-imported
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
  //
  // The „genannt" index in the same round, and only where it can matter: a
  // closed draft whose stage record names no Vorlage. (Auto-imported from
  // ./namedInRvIndex, as the station map above.)
  const [enactment, related, namedIndex] = await Promise.all([
    enactmentOf(rvLinks, currentGp),
    findRelated(summary, currentGp, rvLinks.length > 0),
    rvLinks.length > 0 || summary.active ? Promise.resolve(null) : namedInRvWithin(gp, NAMED_IN_RV_BUDGET_MS),
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
    namedIndex,
  })
}

/** The period before `gp` that `findRelated` searches — none before the
 *  first period with Ministerialentwürfe in list 81. */
function relatedPreviousGp(gp: string): string | null {
  const n = romanToInt(gp)
  return n !== null && n - 1 >= OLDEST_GP_WITH_ME ? intToRoman(n - 1) : null
}

/**
 * Same-title drafts in this, the previous and — once this GP is over — the
 * next Gesetzgebungsperiode. Pure composition
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
  const previous = relatedPreviousGp(summary.gp)
  if (previous) gps.push(previous)
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
      // A predecessor whose text became law as an Initiativantrag passed
      // too — a different cycle, not a second attempt (`antragPath.ts`).
      if (!prevHasRv && !carriesDraft(antragPathFor(predecessor.gp, predecessor.inr))) {
        checkedPredecessor = { ...predecessor, hasRv: false }
      }
    } catch {
      // Unknown outcome → no claim.
    }
  }
  const passed = hasRv || carriesDraft(antragPathFor(summary.gp, summary.inr))
  return { predecessor: checkedPredecessor, successor: passed ? null : successor }
}
