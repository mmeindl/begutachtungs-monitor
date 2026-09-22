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
 * `scripts/rv-latency.mjs` measured by hand into `app/utils/outcomes.ts`,
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
import type { DraftChain } from '#shared/types'
import { furtherChain, stationFor } from '#shared/utils/draftStations'
import type { VorlageRow } from './mappers'
import { mapWithConcurrency } from './pool'

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
    if (!rv) return nothing

    let bgblNumber: string | null = null
    let filingOpen = false
    try {
      const rvDetail = await getGegenstand(rv.gp, 'I', rv.inr)
      bgblNumber = extractBgblLink(rvDetail.content?.status?.bgbllinks)?.number ?? null
      filingOpen = isFilingOpen(rvDetail.content)
    } catch {
      // The Vorlage exists — the stage record says so. Only what the Vorlage
      // itself would have added is missing, so the station stays `rv`: the
      // weakest claim the evidence supports.
    }

    /* One row, two facts: what the house did with the Vorlage, and when it
     * arrived there. Both come from the same list-101 row, so asking for
     * the row rather than the status alone costs nothing. */
    const row = await houseRow(rv.gp, rv.inr)
    const station = stationFor(bgblNumber, row?.status ?? null)
    return { station, rvCitation: rv.label, rvDate: row?.date || null, bgblNumber, filingOpen }
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
    const { items } = await getDraftsForGp(gp)

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
      chainOf(item.gp, item.inr, houseRow),
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
