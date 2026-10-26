/**
 * The draft page's decision about a title search's find, for the lists
 * (23.10.2026).
 *
 * The page decides a Kundmachung by text (`texts/kundmachung.ts`): it
 * confirms the find, puts another Landesgesetzblatt in its place, or refutes
 * it. The lists read the title search alone (`lgblAssignment`), so a draft the
 * page calls „keine Kundmachung gefunden" stood in the list as „Kundgemacht"
 * — sbg-32570 as LGBl. Nr. 30/2026, whose Regierungsvorlage holds 13,5 % of
 * it — and one the page assigns to LGBl. Nr. 115/2022 as LGBl. Nr. 40/2024.
 *
 * THE BUND'S STATION MAP, FOR THE LÄNDER (`parliament/stationMap.ts`): one
 * decision per draft costs a draft PDF and up to five Vorlagen, so it must
 * never be paid while a list waits. The map holds the decisions of one Land
 * for one period's window, built in the background one at a time; the
 * list waits for it at most `VERDICT_BUDGET_MS` and otherwise answers as
 * before — with the title search, which is what the list said until now and
 * never worse than that. Each decision is the page's own cached one
 * (`resolveKundmachung`, a week), so the map and the page cannot disagree,
 * and a map rebuilt after six hours asks only for what expired.
 *
 * A map in which a decision failed, or rests on a failed read, is kept ten
 * minutes (`Gathered.complete`); such a decision refutes nothing
 * (`texts/kundmachung.ts`).
 */
import type { LandCode, LandConsultation, LandStage } from '#shared/types'
import { DERIVED_CACHE } from '../cache/base'
import { keepIncompleteFor, type Gathered } from '../cache/gathered'
import { withinBudget } from '../http/budget'
import { mapWithConcurrency } from '../pool'
import { createSlots } from '../upstream/slots'
import { RESOLVED, resolveKundmachung, type KundmachungVerdict } from './texts/kundmachung'

/** What the page decided, as much of it as a list row shows. */
export type ListVerdict =
  | { kind: 'widerlegt' }
  | { kind: 'entschieden'; stage: Required<Pick<LandStage, 'detail' | 'certainBy'>> & Pick<LandStage, 'date' | 'url' | 'searched'> }

/** The page's decision in the list's terms; null where it decided nothing. */
export function listVerdictOf(resolved: KundmachungVerdict, stage: LandStage): ListVerdict | null {
  if (resolved === null) return null
  if (resolved === 'widerlegt') return { kind: 'widerlegt' }
  return {
    kind: 'entschieden',
    stage: {
      detail: resolved.record.nr,
      date: resolved.record.datum ?? stage.date,
      url: resolved.record.url ?? stage.url,
      certainBy: resolved.certainBy,
      ...(resolved.searched ? { searched: resolved.searched } : {}),
    },
  }
}

/**
 * A draft with the decision laid on: refuted, the find goes and the draft
 * says which one the search had; decided, the stage names the decided
 * Landesgesetzblatt. The one rule for the page (`readLandDraft`) and the
 * lists.
 */
export function withVerdict(d: LandConsultation, v: ListVerdict | null | undefined): LandConsultation {
  const s = d.stage
  if (!v || !s || s === 'unknown' || !s.detail) return d
  if (v.kind === 'widerlegt') return { ...d, stage: undefined, lgblSearch: 'widerlegt', lgblRefuted: s.detail }
  return { ...d, stage: { ...s, ...v.stage } }
}

/** Whether the page decides this draft's find by text — the drafts the map holds. */
export function decidedByText(land: LandCode, d: LandConsultation): boolean {
  const s = d.stage
  return !d.active && !!s && s !== 'unknown' && s.via === 'suche' && !!s.detail && (RESOLVED[land]?.includes(d.kind) ?? false)
}

/**
 * One decision at a time: each reads PDFs, which pdf.js parses on the event
 * loop, and a Regierungsvorlage may weigh up to 30 MB. Measured under the
 * prewarm's sequence with the production heap (384 MB, 23.10.2026): the
 * build lifted the heap's peak from 212 to 315 MB; one at a time keeps two
 * large Vorlagen from being parsed at once, at the price of a slower build
 * nobody waits for.
 *
 * And one at a time ACROSS the builds (26.10.2026). Every period's list
 * starts the map of its own window — nine periods have one (`gpWindow`),
 * and Salzburg's register reaches back to 2004 — and each Land decided by
 * text builds its own, so a reader stepping through the period chooser set
 * as many builds deciding side by side, each parsing its Vorlagen:
 * `CONCURRENCY` held every build to one decision, and nothing held the
 * builds to one another. The slot below is the process's: builds take turns
 * decision by decision, so a short one is not stuck behind a long one. A
 * draft's own page decides without it — that is the read a reader waits for.
 */
const CONCURRENCY = 1
const DECIDING = createSlots(1)
const VERDICT_MAP_TTL_S = 60 * 60 * 6
const INCOMPLETE_MAP_TTL_MS = 10 * 60 * 1000
/** How long a list waits for the map before it answers with the title search. */
const VERDICT_BUDGET_MS = 2_000

/**
 * The decisions for one Land's drafts in one window. Keyed by Land and
 * window, not by the drafts handed in: a draft new since the build waits
 * for the next one (six hours) and shows the title search meanwhile.
 */
const landVerdictMap = defineCachedFunction(
  async (land: LandCode, windowKey: string, drafts: readonly LandConsultation[]): Promise<Gathered<Record<string, ListVerdict>>> => {
    const reads = await mapWithConcurrency(drafts, CONCURRENCY, async (d) => {
      const stage = d.stage as LandStage
      const release = await DECIDING.acquire()
      const resolved = await resolveKundmachung(land, d).catch(() => null).finally(release)
      if (!resolved) return { id: d.id, verdict: null, complete: false }
      // As the page applies it: a refutation needs every read anyway, and a
      // decision whose side reads failed (the committee's report) stands.
      return { id: d.id, verdict: listVerdictOf(resolved.value, stage), complete: resolved.complete }
    })
    const value: Record<string, ListVerdict> = {}
    for (const r of reads) if (r.verdict) value[r.id] = r.verdict
    return { value, complete: reads.every((r) => r.complete) }
  },
  {
    name: 'land-verdicts',
    base: DERIVED_CACHE,
    getKey: (land: LandCode, windowKey: string) => `${land}-${windowKey}`,
    maxAge: VERDICT_MAP_TTL_S,
    swr: true,
    validate: keepIncompleteFor(INCOMPLETE_MAP_TTL_MS),
  },
)

/**
 * The lists' drafts with the page's decisions laid on, where the map is
 * there in time. Never waits longer than the budget, never fails the list.
 */
export async function withListVerdicts(items: readonly LandConsultation[], windowKey: string): Promise<LandConsultation[]> {
  const byLand = new Map<LandCode, LandConsultation[]>()
  for (const d of items) {
    if (!decidedByText(d.land, d)) continue
    byLand.set(d.land, [...(byLand.get(d.land) ?? []), d])
  }
  if (!byLand.size) return [...items]
  const maps = new Map(await Promise.all([...byLand].map(async ([land, drafts]) =>
    [land, await withinBudget(landVerdictMap(land, windowKey, drafts), VERDICT_BUDGET_MS)] as const)))
  return items.map((d) => withVerdict(d, maps.get(d.land)?.value[d.id]))
}
