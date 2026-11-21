/**
 * What the Länder station harness judges across pairs, as functions a test
 * reaches (`scripts/harness/landStations.ts`).
 *
 * PURE MODULE — no imports that decide: the harness loads and prints, the
 * judgement is here; what decides (`comparedText`) is passed in.
 */
import type { LawDiffUnit } from '../../shared/types'
import { completeness, headingBreaches, reconstructionBreaches, symmetryBreaches, type Breach, type HeadedUnit } from './stationChecks'

/** A changed unit's run, as the comparison shows it. */
export interface RunSegment {
  type: 'equal' | 'inserted' | 'removed'
  text: string
}

/** The fields of a station pair's unit the run check reads. */
export interface RunUnit {
  land: string
  draft: string
  change: string
  segments: readonly RunSegment[]
}

/** A short run one Land's drafts insert or remove again and again. */
export interface RecurringRun<T extends RunUnit> {
  land: string
  side: 'inserted' | 'removed'
  text: string
  /** Drafts and units that carry the run on that side. */
  drafts: number
  units: number
  /** The units it is the only change of — the ones the page shows as changed by nothing else. */
  only: T[]
}

/** A run longer than this is a sentence part, not furniture. */
export const RECURRING_MAX_LENGTH = 40
/**
 * A run shorter than this is a word, not furniture: an article, a verb, a
 * mark („der", „ist", „Im", „(§)") recurs as wording does (20.11.2026).
 */
export const RECURRING_MIN_LENGTH = 6
/** In fewer drafts than this, a run is a coincidence of wording. */
export const RECURRING_MIN_DRAFTS = 3

/**
 * The same short run inserted, or removed, in changed units of at least
 * three drafts of one Land, and in at least one of them the only change
 * (20.11.2026).
 *
 * What a page's furniture read as law looks like from the outside: no
 * draft has a reason to add the same few words where every other draft of
 * its Land adds them too. Kärnten's session stamp „REG.SITZG." stood in 198
 * units of 20 drafts, the only change of 128, and no invariant knew it —
 * the running-head check knows Salzburg's head by its shape. This one knows
 * no shape: no digit (a number recurs for its own reasons — a year, an
 * LGBl number filled in), six to 40 characters, the same side, one Land.
 *
 * Six, because a short word recurs as wording does: with no lower bound
 * the check found the stamp and ten corrected function words and marks
 * („der", „die", „ist", „Im", „Die", „(§)"), each accepted by hand. A hit
 * is still read, and accepted with its reason where the documents carry it.
 */
export function recurringRuns<T extends RunUnit>(units: readonly T[]): RecurringRun<T>[] {
  const groups = new Map<string, { land: string; side: 'inserted' | 'removed'; text: string; drafts: Set<string>; units: number; only: T[] }>()
  for (const u of units) {
    if (u.change !== 'changed') continue
    const runs = u.segments.filter((s) => s.type !== 'equal').map((s) => ({ side: s.type as 'inserted' | 'removed', text: s.text.trim() }))
    const seen = new Set<string>()
    for (const r of runs) {
      if (r.text.length < RECURRING_MIN_LENGTH || r.text.length > RECURRING_MAX_LENGTH || /\d/.test(r.text)) continue
      const key = `${u.land}\u0001${r.side}\u0001${r.text}`
      if (seen.has(key)) continue
      seen.add(key)
      const g = groups.get(key) ?? { land: u.land, side: r.side, text: r.text, drafts: new Set<string>(), units: 0, only: [] }
      groups.set(key, g)
      g.drafts.add(u.draft)
      g.units++
      if (runs.every((x) => x.side === r.side && x.text === r.text)) g.only.push(u)
    }
  }
  return [...groups.values()]
    .filter((g) => g.drafts.size >= RECURRING_MIN_DRAFTS && g.only.length > 0)
    .map((g) => ({ land: g.land, side: g.side, text: g.text, drafts: g.drafts.size, units: g.units, only: g.only }))
}

/** A run of bare numbers: digits, with the dots, commas, percent signs and spaces between them. */
const BARE_NUMBERS_RE = /^[\s\d.,%]+$/

/**
 * A changed unit whose every run is bare numbers inserted („neu") or removed
 * („weg"), or null. Inserted: a table value or an enumerator the earlier
 * side's reader dropped (Salzburg 34234 § 130, 19.11.2026). Removed — the
 * mirror, 20.11.2026: the same fault in the later side's reader, or a
 * value the Landtag struck. Either is read before it is accepted.
 */
export function numbersOnly(change: string, segments: readonly RunSegment[]): 'neu' | 'weg' | null {
  if (change !== 'changed') return null
  const runs = segments.filter((s) => s.type !== 'equal')
  if (!runs.length || !runs.every((s) => BARE_NUMBERS_RE.test(s.text) && /\d/.test(s.text))) return null
  if (runs.every((s) => s.type === 'inserted')) return 'neu'
  if (runs.every((s) => s.type === 'removed')) return 'weg'
  return null
}

/** One Land pair, as the harness holds it. */
export interface LandPairInput {
  /** Each side's units as its reader gave them. */
  from: readonly HeadedUnit[]
  to: readonly HeadedUnit[]
  /** The units the route serves (`compareReadTexts`). */
  served: readonly LawDiffUnit[]
  /** The comparison before it withholds what `announcedText.ts` settles (`diffLandDraft`). */
  before: readonly LawDiffUnit[]
  /** The served comparison the other way round, or null where it is unavailable. */
  back: readonly LawDiffUnit[] | null
  /** The text a unit is compared as (`comparedText`): a diff unit's `fromText`/`toText`. */
  compared: (text: string) => string
}

/**
 * The Bund's checks (`stationChecks.ts`) over a Land pair, as `station.ts`
 * runs them over the Bund's (20.11.2026): reconstruction over the units
 * served; completeness and the later side's heading over the comparison
 * before it withholds; symmetry against the comparison the other way round.
 * `breaches` must be empty; `symmetry` is listed.
 *
 * Completeness and heading are blind to the law: the comparison names an
 * earlier Artikel by its partner's title (`landArticlePairs`), so a unit is
 * found by its id and its compared text alone — a unit filed under the
 * wrong law passes, a unit lost or doubled does not.
 */
export function landPairChecks(i: LandPairInput): { breaches: Breach[]; symmetry: Breach[] } {
  const side = (units: readonly HeadedUnit[]) => units.map((u) => ({ article: null, id: u.id, text: i.compared(u.text), heading: u.heading }))
  const blind = { units: i.before.map((u) => ({ ...u, article: null })), lawsOnlyInFrom: [], lawsOnlyInTo: [] }
  const pkg = (units: readonly LawDiffUnit[]) => ({ units, lawsOnlyInFrom: [], lawsOnlyInTo: [] })
  return {
    breaches: [
      ...reconstructionBreaches(i.served),
      ...completeness(side(i.from), side(i.to), blind, () => false).breaches,
      ...headingBreaches(side(i.to), blind),
    ],
    symmetry: i.back ? symmetryBreaches(pkg(i.served), pkg(i.back)) : [],
  }
}

/** How a pair of the harness ended: compared, no comparison to offer, a PDF not in the cache, or an error. */
export type PairState = 'verglichen' | 'nicht verfügbar' | 'fehlt' | 'Fehler'

/** Per Land: its drafts, those whose detail the cache lacks, those offering pairs; the pairs requested, and how many were compared, unavailable, missing a PDF, errored. */
export interface LandPairCount {
  drafts: number
  uncached: number
  withPairs: number
  requested: number
  compared: number
  unavailable: number
  missing: number
  errored: number
}

/**
 * Per Land, what was requested and what was reached, the Länder in code
 * order (20.11.2026). The table per station pair adds the Länder up, and a
 * Land that reached nothing vanished in it: Tirol's three pairs, each
 * missing a PDF the cache does not hold, stood as three „fehlt" among 372;
 * a Land whose drafts offer no pair, or whose draft detail the cache lacks
 * (30 of Steiermark's 40), stood nowhere at all.
 */
export function pairsPerLand(drafts: readonly { land: string; cached: boolean; pairs: number }[], lines: readonly { land: string; state: PairState }[]): Record<string, LandPairCount> {
  const out: Record<string, LandPairCount> = {}
  const of = (land: string) => (out[land] ??= { drafts: 0, uncached: 0, withPairs: 0, requested: 0, compared: 0, unavailable: 0, missing: 0, errored: 0 })
  for (const d of [...drafts].sort((a, b) => a.land.localeCompare(b.land))) {
    const c = of(d.land)
    c.drafts++
    if (!d.cached) c.uncached++
    if (d.pairs > 0) c.withPairs++
  }
  for (const l of lines) {
    const c = of(l.land)
    c.requested++
    if (l.state === 'verglichen') c.compared++
    else if (l.state === 'nicht verfügbar') c.unavailable++
    else if (l.state === 'fehlt') c.missing++
    else c.errored++
  }
  return out
}

/**
 * The pairs to the Landesgesetzblatt in which no unit stands unchanged
 * (21.11.2026), listed for reading by hand, not asserted. A draft held
 * against the next amendment of the same law pairs its Ziffern by place,
 * one reads „geändert", and the comparison's only refusal — no unit
 * unchanged or changed (`NOTHING_PAIRS`, `landLawDiffService.ts`) — never
 * fires; the defence is upstream, in a certain Kundmachung. No floor on the
 * unchanged share can take its place: of the 240 cached pairs to the
 * Landesgesetzblatt 12 have no unit unchanged, and each is the draft's own
 * Kundmachung — a placeholder filled in, an amount brought up to date.
 */
export function lgblNoneUnchanged<T extends { pair: string; state: PairState; stats: { unchanged: number } | null }>(lines: readonly T[]): T[] {
  return lines.filter((l) => l.pair.endsWith('→lgbl') && l.state === 'verglichen' && l.stats?.unchanged === 0)
}
