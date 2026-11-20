/**
 * What the Länder station harness judges across pairs, as functions a test
 * reaches (`scripts/harness/landStations.ts`).
 *
 * PURE MODULE — no imports that decide: the harness loads and prints, the
 * judgement is here.
 */

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
 * LGBl number filled in), at most 40 characters, the same side, one Land.
 *
 * A word does recur, as wording does: „der", „die", „Im" corrected in a
 * few instructions. So a hit is read, and accepted with its reason where
 * the documents carry it.
 */
export function recurringRuns<T extends RunUnit>(units: readonly T[]): RecurringRun<T>[] {
  const groups = new Map<string, { land: string; side: 'inserted' | 'removed'; text: string; drafts: Set<string>; units: number; only: T[] }>()
  for (const u of units) {
    if (u.change !== 'changed') continue
    const runs = u.segments.filter((s) => s.type !== 'equal').map((s) => ({ side: s.type as 'inserted' | 'removed', text: s.text.trim() }))
    const seen = new Set<string>()
    for (const r of runs) {
      if (!r.text || r.text.length > RECURRING_MAX_LENGTH || /\d/.test(r.text)) continue
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
