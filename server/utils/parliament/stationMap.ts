/**
 * Where every Ministerialentwurf of one Gesetzgebungsperiode stands — the
 * station map behind the station filter on `/entwuerfe`
 * (docs/architecture.md §12.26).
 *
 * The four stations are the detail page's own (`app/utils/spine.ts`,
 * minus `entwurf`, which is not a place a draft can stand): Begutachtung,
 * Regierungsvorlage, Parlament, Bundesgesetzblatt. One vocabulary for the
 * list and the spine — a reader who learns the stations on one page reads
 * the other.
 *
 * WHY IT WALKS FROM THE DRAFT, not from list 101 via `preconst`. The list
 * route is half the fetches: one call for every Vorlage of the period, each
 * carrying a pointer back to the Ministerialentwurf it came from. But
 * `preconst` is not a universal field (docs/api-exploration.md §101), so a
 * missing pointer is indistinguishable from "this draft never became a
 * Vorlage" — and that difference is exactly the claim this product must not
 * get wrong. "Bisher keine Regierungsvorlage" on a draft that has one is a
 * false accusation, produced to save a fetch. So each draft is asked about
 * itself, through its own stage record (`findLastRvLink`), the same source
 * the detail page states its chain from.
 *
 * WHAT IT IS WORTH, measured 18.09.2026: over GP XXVII the map finds a
 * Regierungsvorlage for **296 of 353** drafts — the same 296/353 that
 * `scripts/corpus/rvLatency.ts` measured by hand into `app/utils/outcomes.ts`,
 * reproduced live on a different path. And it is not merely as good as the
 * `preconst` route: 592 d.B. carries TWO Ministerialentwürfe (96/ME and
 * 103/ME), of which the Vorlage names one — the draft-side walk finds both.
 *
 * COST, measured the same day: GP XXVIII is 135 drafts → 135 draft details
 * + 91 Vorlagen details + 1 list = 227 upstream requests; GP XXVII is 353
 * drafts → 650 requests, 35.6 s wall at 12 in flight when nothing is cached,
 * 8 ms warm. 35 s is a number that may never land on a visitor, which is the
 * whole reason for the cache below and the prewarm call beside it —
 * `app/utils/outcomes.ts` states the rule this obeys: no page may depend
 * on 350 upstream fetches *while someone waits*.
 *
 * Derived layer: `mapVorlageRow`, `parseStages` and the folding below are
 * ours, so an edit to any of them must not survive in dev
 * (`server/utils/cache/base.ts`).
 */
import type { DraftChain, NoPromulgation } from '#shared/types'
import { STATUS_AT_BUNDESRAT, STATUS_FINISHED, furtherChain, stationFor } from '#shared/utils/draftStations'
import { antragPathFor, carriesDraft } from '#shared/utils/antragPath'
import type { VorlageRow } from './list101'
import { mapWithConcurrency } from '../pool'
import { withinBudget } from '../http/budget'

/** Six hours: a station moves on the scale of days, and this way at most
 *  four cold builds a day can land on a visitor — the nightly prewarm
 *  takes the first (`deploy/systemd/…-prewarm.service`). */
const STATION_MAP_TTL_S = 60 * 60 * 6

/** How many drafts are asked about at once. The annex pipeline uses the
 *  same worker-pool shape; 12 builds GP XXVII's 650 requests in 35.6 s
 *  without opening 353 sockets on a service that documents no rate limit
 *  (§13.6). */
const CONCURRENCY = 12

/**
 * How long one chain waits for RIS — for its Kundmachung's date, and where
 * Parliament has no link, for the Kundmachung itself. Answered in 0.16 s
 * when RIS is well (03.10.2026); the bound exists for when it is not — a
 * lookup that times out takes 20 s (`bgblService.ts`), and every enacted
 * draft of a period would pay that inside the cold build.
 */
const BGBL_DATE_BUDGET_MS = 5_000

/**
 * The Kundmachung's issue date, for the list's „Neu" mark — or null.
 *
 * One cached RIS lookup per enacted Vorlage (`bgbl-dokument`, a month's
 * lifetime), in the background build only: the list waits for this map at
 * most its budget and answers without it, so no row waits for a date. Null
 * on any failure and past the budget — the chain must never fail, nor
 * stall, for its date.
 */
function kundmachungDateOf(bgblNumber: string): Promise<string | null> {
  return withinBudget(getBgblIssueDate(bgblNumber), BGBL_DATE_BUDGET_MS)
}

/**
 * The chain of one draft, read from its own stage record.
 *
 * Every failure is a station of `begutachtung` with no claim attached, never
 * a thrown error: one unreachable Gegenstand must not cost the whole list
 * its filter. The row then says what a row without a Vorlage says, which is
 * what the page said before this map existed.
 */
async function chainOf(
  gp: string,
  inr: number,
  houseRow: (gp: string, inr: number) => Promise<VorlageRow | null>,
  currentGp: string,
): Promise<DraftChain> {
  const nothing: DraftChain = {
    station: 'begutachtung',
    rvCitation: null,
    rvDate: null,
    bgblNumber: null,
    filingOpen: false,
  }
  try {
    const detail = await getGegenstand(gp, 'ME', inr)
    const rv = findLastRvLink(parseStages(detail.content?.stages))
    if (!rv) {
      /* No Vorlage in the stage record — but the text may have come as an
       * Initiativantrag, which no pointer records (`antragPath.ts`). Only
       * where the Antrag carries the draft does the station move; the
       * Antrag route skips the Vorlage, so `rvCitation` stays null and the
       * Kundmachung is the Antrag's. A table lookup, no request. */
      const path = antragPathFor(gp, inr)
      return carriesDraft(path)
        ? {
            ...nothing,
            station: 'bgbl',
            bgblNumber: path.antrag.bgblNumber,
            antragCitation: path.antrag.citation,
            bgblDate: await kundmachungDateOf(path.antrag.bgblNumber),
          }
        : nothing
    }

    /* The Vorlage's OWN period, not the draft's: a carry-over names the
     * next one, and there the Vorlage is alive (docs/architecture.md
     * §12.10, 30.09.2026). The same function the detail page's headline
     * and rail read (`enactmentOf`), so row and page say the same word. */
    const rvGpEnded = isVorlageGpEnded(rv.gp, currentGp)
    let bgblNumber: string | null = null
    let filingOpen = false
    let decidedAt: string | null = null
    let bundesratArrivedAt: string | null = null
    let bundesratDecidedAt: string | null = null
    let notPromulgated: NoPromulgation | null = null
    let antragCitation: string | undefined
    try {
      const rvDetail = await getGegenstand(rv.gp, 'I', rv.inr)
      const phase = rvDetail.content?.phase
      bgblNumber = extractBgblLink(rvDetail.content?.status?.bgbllinks)?.number ?? null
      /* The same function as the detail page (`draftDetail.ts`), so door and
       * row cannot disagree: a Vorlage that lapsed with its period takes
       * nothing, whatever a stale flag says. Otherwise the flag decides, and
       * it stays "1" through the Bundesrat's phase — by design, not by lag:
       * Parliament describes the window as open until the end of the
       * parliamentary procedure (parlament.gv.at, „Stellung nehmen zu
       * Gesetzesinitiativen"), and § 23b Abs. 1 GOG-NR admits Stellungnahmen
       * „während des parlamentarischen Gesetzgebungsverfahrens" (BGBl. I Nr.
       * 81/2024). A gate that closed it with the Nationalrat's Beschluss
       * stood here for an afternoon on 03.10.2026 and went the same day
       * (docs/architecture.md §12.26). */
      filingOpen = isVorlageFilingOpen(rvDetail.content, rv.gp, currentGp)
      // The procedure's dates after the Ausschuss — the `parlament`
      // station's fact and dates (`stationFor`, the „Neu" mark, the open
      // window's „im Bundesrat seit …") — from the record already in hand,
      // so they cost no request.
      decidedAt = findHouseDecisionDate(phase)
      bundesratArrivedAt = findBundesratArrival(phase)
      bundesratDecidedAt = findBundesratDecisionDate(phase)
      notPromulgated = findNoPromulgation(phase, rv.gp)
      /* A Gesetzesbeschluss Parliament records as not promulgated, and the
       * Antrag it names as the text's successor (80 d.B. → 416/A, §12.33,
       * Nachtrag 03.10.2026). Where that Antrag's own record links a
       * Kundmachung, the draft did reach the Bundesgesetzblatt — on the
       * route Parliament states, not one we infer — and the chain says so
       * the way the Antrag route does. One extra fetch, only in this rare
       * case; its failure leaves the Vorlage's own facts standing. */
      const successor = notPromulgated?.successorAntrag
      if (!bgblNumber && successor) {
        try {
          const antrag = await getGegenstand(successor.gp, 'A', successor.inr)
          const link = extractBgblLink(antrag.content?.status?.bgbllinks)
          if (link?.number) {
            bgblNumber = link.number
            antragCitation = successor.citation
          }
        } catch {
          // Per-item tolerance: the stated successor is enrichment.
        }
      }
    } catch {
      // The Vorlage exists — the stage record says so. Only what the Vorlage
      // itself would have added is missing, so the station stays `rv`: the
      // weakest claim the evidence supports.
    }

    /* One row, two facts: what the house did with the Vorlage, and when it
     * arrived there. Both come from the same list-101 row, so asking for
     * the row rather than the status alone costs nothing. */
    const row = await houseRow(rv.gp, rv.inr)

    /* THE SECOND SOURCE FOR THE KUNDMACHUNG (03.10.2026): RIS, where
     * Parliament's record of a decided Vorlage carries no link. RIS keys a
     * law by period and Vorlage — an exact join, no title similarity
     * (`bgblVorlage.ts`), and it returned Parliament's own number for 81 of
     * 81 enacted drafts of GP XXVIII. What it guards is the lag between a
     * Kundmachung and Parliament's link to it; it does NOT resolve the two
     * decided Vorlagen known to lack one (80 d.B., XXVIII; 1435 d.B., XXVII),
     * because no Kundmachung names them (docs/architecture.md §12.33,
     * Nachtrag 03.10.2026). Asked only where a Kundmachung can exist — a
     * Beschluss, or a status that means one — and within the date lookup's
     * budget; the Jahrgang pages are the Verordnung join's, cached. */
    let bgblDate: string | null = null
    const decided = decidedAt || row?.status === STATUS_FINISHED || row?.status === STATUS_AT_BUNDESRAT
    const from = decidedAt || row?.date || rv.date
    // Not where Parliament says this Vorlage's text was not promulgated:
    // there is no Kundmachung of it to find.
    if (!bgblNumber && !notPromulgated && decided && from) {
      const ris = await withinBudget(findBgblIForVorlage(rv.gp, rv.inr, from), BGBL_DATE_BUDGET_MS)
      if (ris) {
        bgblNumber = ris.number
        bgblDate = ris.datum
      }
    }

    const station = stationFor(bgblNumber, row?.status ?? null, decidedAt)
    if (bgblNumber && !bgblDate) bgblDate = await kundmachungDateOf(bgblNumber)
    return {
      station,
      rvCitation: rv.label,
      rvDate: row?.date || null,
      bgblNumber,
      filingOpen,
      rvGpEnded,
      decidedAt,
      bgblDate,
      bundesratArrivedAt,
      bundesratDecidedAt,
      notPromulgated,
      ...(antragCitation ? { antragCitation } : {}),
    }
  } catch {
    return nothing
  }
}

/**
 * Every draft of the period, keyed by its `inr`.
 *
 * Keyed by number rather than citation because that is what the list rows
 * carry and what `/api/drafts` joins on.
 */
export const getStationMapForGp = defineCachedFunction(
  async (gp: string): Promise<Record<number, DraftChain>> => {
    const [{ items }, currentGp] = await Promise.all([getDraftsForGp(gp), getCurrentGp()])

    /* The Vorlagen list of a period, for the two facts the Vorlage's own
     * detail JSON does not carry in a form we read: whether the house is
     * done with it, and when it arrived there. One call per period, cached
     * — and a period is fetched only if a Vorlage actually points into it,
     * which for the carry-over case (§13.4) is at most one extra list. */
    const houseLists = new Map<string, Promise<Map<number, VorlageRow>>>()
    const houseRow = async (rvGp: string, rvInr: number): Promise<VorlageRow | null> => {
      let list = houseLists.get(rvGp)
      if (!list) {
        list = getVorlagenForGp(rvGp)
          .then((rows) => new Map(rows.map((r) => [r.inr, r])))
          .catch(() => new Map<number, VorlageRow>())
        houseLists.set(rvGp, list)
      }
      return (await list).get(rvInr) ?? null
    }

    const chains = await mapWithConcurrency(items, CONCURRENCY, (item) =>
      chainOf(item.gp, item.inr, houseRow, currentGp),
    )

    // Duplicate rows exist upstream (dual-ministry drafts, `outcomes.ts`);
    // the further chain is the true one for the draft.
    const out: Record<number, DraftChain> = {}
    items.forEach((item, i) => {
      out[item.inr] = furtherChain(out[item.inr], chains[i]!)
    })
    return out
  },
  {
    name: 'stations-gp',
    base: DERIVED_CACHE,
    getKey: (gp: string) => gp,
    maxAge: STATION_MAP_TTL_S,
    swr: false,
  },
)
