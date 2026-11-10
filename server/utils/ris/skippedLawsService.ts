/**
 * The laws of one period without a Begutachtung, gathered for the list
 * (docs/architecture.md §12.68). Nuxt-aware glue around the pure module
 * `skippedLaws.ts`, which decides every class.
 *
 * WHAT IT READS, all of it cached elsewhere already: the BGBl Teil-I
 * Jahrgänge (the Verordnung join's pages), the station maps of the period
 * and the one before (prewarmed nightly), list 81 and list 101's Vorlagen of
 * the period (every list page reads them) — and one list call of its own,
 * the period's Anträge (`getAntraegeForGp`). No detail call per Gegenstand.
 *
 * A FAILURE IS NOT AN ANSWER (§12.13), and here it has two forms:
 *  - a source the WHOLE claim stands on — the Jahrgänge, a station map —
 *    did not answer, or a map lacks a draft whose record could not be read:
 *    no rows at all, `available: false`, `gap: 'unread'`. A missing chain
 *    could be exactly the draft behind a law.
 *  - a source only SOME rows stand on — list 81, the Vorlagen, the Anträge:
 *    the rows it would have checked are `unknown` and left out
 *    (`skippedLaws.ts`), the rest stand.
 * Either way the answer is incomplete and stays in the cache for minutes,
 * not hours (`keepIncompleteFor`).
 */
import type { CommitteeConsultation, LawWithoutBegutachtung, LawsWithoutBegutachtung, LawsWithoutBegutachtungGap } from '#shared/types'
import { ANTRAG_PARTIAL, ANTRAG_PATHS } from '#shared/utils/antragPathTable'
import { chainCoverageOf, mayClaimOutcome } from '#shared/utils/draftStations'
import { gpHasEnded, previousGp } from '#shared/utils/gp'
import { todayIso } from '#shared/utils/format'
import { DERIVED_CACHE } from '../cache/base'
import { keepIncompleteFor, type Gathered } from '../cache/gathered'
import { settleWithinBudget } from '../http/budget'
import { getAntraegeForGp, getDraftsForGp, getGegenstand, getVorlagenForGp } from '../parliament/drafts'
import { getStationMapForGp } from '../parliament/stationMap'
import { getBgblTeil1Year } from './bgblService'
import { classifySkippedLaws, refineByCommittee, yearsOfPeriod, type CarryingItem, type ParliamentItem } from './skippedLaws'
import { readCommitteeConsultation } from '../parliament/detailJson'
import { mapWithConcurrency } from '../pool'

/** Six hours, the station map's lifetime: a law arrives a few times a week. */
const SKIPPED_TTL_S = 60 * 60 * 6
/** Ten minutes for an answer that rests on a failed read — the station map's rule. */
const INCOMPLETE_TTL_MS = 10 * 60 * 1000
/**
 * Five seconds for an answer that only waited for a station map still being
 * built (`gap: 'pending'`): after a cold start the maps take 10 and 44 s
 * (09.11.2026), and the ten minutes of a failure kept the chip unavailable
 * long after they were done. Short enough that the next request after the
 * build answers; long enough that the readers of one moment share one
 * answer. A new attempt costs little: the map's build is one per key, and
 * Nitro hands every concurrent caller the same pending call.
 */
const PENDING_TTL_MS = 5_000
/**
 * How long the station maps may take. They are prewarmed for the running
 * period and the one before; cold, GP XXVII costs 35 s (§12.26), and the
 * chip must not wait that long — the build carries on and fills the cache.
 */
const STATION_MAP_BUDGET_MS = 2_500

/**
 * The committee check (10.11.2026): one detail record per `none` candidate
 * (67 in GP XXVIII, ~340 in XXVII), through the Gegenstand leaf cache, four
 * at a time like the station maps' detail reads. Within the same budget as a
 * station map; past it the answer is `pending` — not stored, the page asks
 * again — and the reads go on filling the leaf cache, so the next request
 * finds them warm.
 */
const COMMITTEE_BUDGET_MS = 2_500
const COMMITTEE_CONCURRENCY = 4

/** The chains of a period, or why there are none: still building (`pending`) or failed. */
async function chainsOf(gp: string): Promise<
  | { ok: true; chains: Awaited<ReturnType<typeof getStationMapForGp>>; complete: boolean }
  | { ok: false; pending: boolean }
> {
  const [map, drafts] = await Promise.all([
    settleWithinBudget(getStationMapForGp(gp), STATION_MAP_BUDGET_MS),
    getDraftsForGp(gp).then((d) => d.items).catch(() => null),
  ])
  if (!drafts || map.state === 'failed') return { ok: false, pending: false }
  if (map.state === 'pending') return { ok: false, pending: true }
  const chains = map.value
  // A draft without a chain is a record that could not be read — and could
  // be the very draft behind a law (`stationMap.chainOf`).
  return { ok: true, chains, complete: drafts.every((d) => chains[d.inr] !== undefined) }
}

function unavailable(gp: string, gap: LawsWithoutBegutachtungGap, complete: boolean): Gathered<LawsWithoutBegutachtung> {
  return { value: { gp, available: false, gap, items: [] }, complete, ...(gap === 'pending' ? { pending: true } : {}) }
}

const toItem = (v: { inr: number; citation: string; title: string; date: string }): ParliamentItem => ({
  inr: v.inr,
  citation: v.citation,
  title: v.title,
  date: v.date,
})

const buildSkippedLaws = defineCachedFunction(
  async (gp: string): Promise<Gathered<LawsWithoutBegutachtung>> => {
    const currentGp = await getCurrentGp()
    const prev = previousGp(gp)

    const [own, before] = await Promise.all([chainsOf(gp), prev ? chainsOf(prev) : null])
    /* A map that only did not answer in time is still building (a cold
     * start): `pending`, kept seconds. A map or list that failed: `unread`,
     * kept ten minutes. A failure on either side outranks a pending one. */
    if (!own.ok || (before && !before.ok)) {
      const failed = (!own.ok && !own.pending) || (before !== null && !before.ok && !before.pending)
      return unavailable(gp, failed ? 'unread' : 'pending', false)
    }
    /* A period whose drafts are not linked to Vorlagen (§12.27) cannot say
     * that no draft stood behind a law — the link is missing, not the
     * draft. The same gate for the period before: a carry-over from an
     * unlinked archive would be invisible. Stable, so it is kept. */
    const ownCoverage = chainCoverageOf(Object.values(own.chains), gpHasEnded(gp, currentGp))
    const beforeCoverage = before?.ok ? chainCoverageOf(Object.values(before.chains), true) : 'linked'
    if (!mayClaimOutcome(ownCoverage) || !mayClaimOutcome(beforeCoverage)) return unavailable(gp, 'unlinked', true)
    if (!own.complete || (before?.ok && !before.complete)) return unavailable(gp, 'unread', false)

    const years = yearsOfPeriod(gp, todayIso())
    if (!years) return unavailable(gp, 'unlinked', true)
    let records
    try {
      records = (await Promise.all(years.map((y) => getBgblTeil1Year(y)))).flat()
    } catch {
      return unavailable(gp, 'unread', false)
    }

    const [vorlagen, antraege, drafts] = await Promise.all([
      getVorlagenForGp(gp).then((rows) => rows.map(toItem)).catch(() => null),
      getAntraegeForGp(gp).then((rows) => rows.map(toItem)).catch(() => null),
      getDraftsForGp(gp).then((d) => d.items).catch(() => null),
    ])

    const classified = classifySkippedLaws({
      gp,
      records,
      chains: [...Object.values(own.chains), ...(before?.ok ? Object.values(before.chains) : [])],
      antragPaths: ANTRAG_PATHS,
      antragPartial: ANTRAG_PARTIAL,
      vorlagen,
      antraege,
      drafts,
    })

    // Every `none` against its carrying item's own Verlauf: a committee that
    // invited written Stellungnahmen ran an Ausschussbegutachtung. A record
    // that cannot be read leaves its law out (`refineByCommittee`).
    const candidates = classified.flatMap((l) => (l.class.kind === 'none' ? [l.class.item] : []))
    const keyOf = (item: CarryingItem) => `${item.kind}-${item.inr}`
    const readings = await settleWithinBudget(
      mapWithConcurrency(candidates, COMMITTEE_CONCURRENCY, async (item) => {
        try {
          const detail = await getGegenstand(gp, item.kind === 'rv' ? 'I' : 'A', item.inr)
          return [keyOf(item), readCommitteeConsultation(detail.content?.phase)] as const
        } catch {
          return [keyOf(item), undefined] as const
        }
      }),
      COMMITTEE_BUDGET_MS,
    )
    if (readings.state === 'pending') return unavailable(gp, 'pending', false)
    if (readings.state === 'failed') return unavailable(gp, 'unread', false)
    const consultations = new Map<string, CommitteeConsultation | null | undefined>(readings.value)
    const refined = refineByCommittee(classified, (item) => consultations.get(keyOf(item)))
    const unread = [...consultations.values()].some((c) => c === undefined)

    const items: LawWithoutBegutachtung[] = []
    for (const { record, class: c } of refined) {
      if (c.kind !== 'none' && c.kind !== 'committee') continue
      const ityp = c.item.kind === 'rv' ? 'I' : 'A'
      items.push({
        bgblNumber: record.nummer,
        bgblDate: record.datum,
        item: {
          kind: c.item.kind,
          gp,
          inr: c.item.inr,
          citation: c.item.citation,
          parliamentUrl: `https://www.parlament.gv.at/gegenstand/${gp}/${ityp}/${c.item.inr}`,
        },
        title: c.title,
        decidedAt: record.datumNationalrat,
        consultation: c.kind,
        committee: c.kind === 'committee' ? c.consultation : null,
      })
    }
    items.sort((a, b) => b.bgblDate.localeCompare(a.bgblDate) || b.bgblNumber.localeCompare(a.bgblNumber, 'de-AT', { numeric: true }))

    return {
      value: { gp, available: true, gap: null, items },
      complete: vorlagen !== null && antraege !== null && drafts !== null && !unread,
    }
  },
  {
    name: 'ohne-begutachtung-gp',
    base: DERIVED_CACHE,
    getKey: (gp: string) => gp,
    maxAge: SKIPPED_TTL_S,
    swr: false,
    validate: keepIncompleteFor(INCOMPLETE_TTL_MS, PENDING_TTL_MS),
  },
)

/** The period's laws without a Begutachtung — the cached half's value. */
export async function getLawsWithoutBegutachtung(gp: string): Promise<LawsWithoutBegutachtung> {
  return (await buildSkippedLaws(gp)).value
}
