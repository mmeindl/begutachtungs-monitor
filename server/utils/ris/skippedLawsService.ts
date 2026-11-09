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
import type { LawWithoutBegutachtung, LawsWithoutBegutachtung, LawsWithoutBegutachtungGap } from '#shared/types'
import { ANTRAG_PARTIAL, ANTRAG_PATHS } from '#shared/utils/antragPathTable'
import { chainCoverageOf, mayClaimOutcome } from '#shared/utils/draftStations'
import { gpHasEnded, previousGp } from '#shared/utils/gp'
import { todayIso } from '#shared/utils/format'
import { DERIVED_CACHE } from '../cache/base'
import { keepIncompleteFor, type Gathered } from '../cache/gathered'
import { withinBudget } from '../http/budget'
import { getAntraegeForGp, getDraftsForGp, getVorlagenForGp } from '../parliament/drafts'
import { getStationMapForGp } from '../parliament/stationMap'
import { getBgblTeil1Year } from './bgblService'
import { classifySkippedLaws, yearsOfPeriod, type ParliamentItem } from './skippedLaws'

/** Six hours, the station map's lifetime: a law arrives a few times a week. */
const SKIPPED_TTL_S = 60 * 60 * 6
/** Ten minutes for an answer that rests on a failed read — the station map's rule. */
const INCOMPLETE_TTL_MS = 10 * 60 * 1000
/**
 * How long the station maps may take. They are prewarmed for the running
 * period and the one before; cold, GP XXVII costs 35 s (§12.26), and the
 * chip must not wait that long — the build carries on and fills the cache.
 */
const STATION_MAP_BUDGET_MS = 2_500

/** `null` → the gap it stands for; anything else → the chains. */
async function chainsOf(gp: string): Promise<
  | { ok: true; chains: Awaited<ReturnType<typeof getStationMapForGp>>; complete: boolean }
  | { ok: false }
> {
  const [chains, drafts] = await Promise.all([
    withinBudget(getStationMapForGp(gp), STATION_MAP_BUDGET_MS),
    getDraftsForGp(gp).then((d) => d.items).catch(() => null),
  ])
  if (!chains || !drafts) return { ok: false }
  // A draft without a chain is a record that could not be read — and could
  // be the very draft behind a law (`stationMap.chainOf`).
  return { ok: true, chains, complete: drafts.every((d) => chains[d.inr] !== undefined) }
}

function unavailable(gp: string, gap: LawsWithoutBegutachtungGap, complete: boolean): Gathered<LawsWithoutBegutachtung> {
  return { value: { gp, available: false, gap, items: [] }, complete }
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
    if (!own.ok || (before && !before.ok)) return unavailable(gp, 'unread', false)
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

    const items: LawWithoutBegutachtung[] = []
    for (const { record, class: c } of classified) {
      if (c.kind !== 'none') continue
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
      })
    }
    items.sort((a, b) => b.bgblDate.localeCompare(a.bgblDate) || b.bgblNumber.localeCompare(a.bgblNumber, 'de-AT', { numeric: true }))

    return {
      value: { gp, available: true, gap: null, items },
      complete: vorlagen !== null && antraege !== null && drafts !== null,
    }
  },
  {
    name: 'ohne-begutachtung-gp',
    base: DERIVED_CACHE,
    getKey: (gp: string) => gp,
    maxAge: SKIPPED_TTL_S,
    swr: false,
    validate: keepIncompleteFor(INCOMPLETE_TTL_MS),
  },
)

/** The period's laws without a Begutachtung — the cached half's value. */
export async function getLawsWithoutBegutachtung(gp: string): Promise<LawsWithoutBegutachtung> {
  return (await buildSkippedLaws(gp)).value
}
