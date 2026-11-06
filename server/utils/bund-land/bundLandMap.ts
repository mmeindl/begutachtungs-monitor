/**
 * The Bund-zu-Land map: per Grundsatzgesetz — keyed by its Kundmachung in
 * BGBl I, never by the Ministerialentwurf (§12.66 Nachtrag 10, correction
 * 1) — the Land drafts of the window that carry it out
 * (docs/architecture.md §12.67).
 *
 * PURE MODULE — the stored findings, the Länder' list and the federal acts
 * in; the map out. Relative imports only.
 *
 * WHICH ACTS: every Grundsatzgesetz a stored finding cites, and every
 * Grundsatzgesetz the Bund promulgated in the window (`federal`, from a
 * RIS full-text search) — with or without a Land draft yet, so the
 * Ministerialentwurf's line can say „noch kein Entwurf im Fenster" for an
 * act the Länder have not reached. Agreements (Art. 15a) have no act page
 * in v1: they stay a fact on the Land's draft.
 */
import type { BgblICitation, BundLandActDraft, LandCode, LandConsultation } from '../../../shared/types'
import { LAND_CODES, landDraftPath } from '../../../shared/utils/laender'
import { landKey } from '../eu/euMapStore'
import { landNumberOf, standOfLand } from '../eu/euMap'
import type { BundLandStoreFile } from './bundLandStore'
import { bgblKeyOf } from './bundesgesetzblatt'

export interface BundLandMapAct {
  key: string
  bgbl: BgblICitation
  /** The names the Länder' drafts write it under, most frequent first. */
  names: string[]
  drafts: BundLandActDraft[]
}

export interface BundLandMap {
  gp: string
  window: { from: string; to: string | null }
  builtAt: string
  acts: Record<string, BundLandMapAct>
  /** Länder the last build could not read whole. */
  incomplete: LandCode[]
}

export interface BundLandMapInputs {
  gp: string
  window: { from: string; to: string | null }
  store: BundLandStoreFile
  laender: readonly LandConsultation[]
  unavailableLands: readonly LandCode[]
  /** Grundsatzgesetze the Bund promulgated in the window. */
  federal: readonly BgblICitation[]
  today: string
}

/** Strips the EU token: on the act's page every row carries the act out. */
function withoutEu<T extends { eu?: unknown }>(row: T): T {
  const { eu: _eu, ...rest } = row
  return rest as T
}

export function assembleBundLandMap(inputs: BundLandMapInputs): BundLandMap {
  const acts: Record<string, BundLandMapAct> = {}
  const nameCount = new Map<string, Map<string, number>>()
  const actOf = (bgbl: BgblICitation): BundLandMapAct => {
    const key = bgblKeyOf(bgbl)
    acts[key] ??= { key, bgbl: { number: bgbl.number, year: bgbl.year }, names: [], drafts: [] }
    return acts[key]
  }
  for (const b of inputs.federal) actOf(b)

  for (const l of inputs.laender) {
    const key = landKey(l.land, landNumberOf(l.id))
    const fact = inputs.store.entries[key]?.fact
    for (const f of fact?.findings ?? []) {
      if (f.kind !== 'grundsatzgesetz' || !f.act.bgbl) continue
      const act = actOf(f.act.bgbl)
      if (act.drafts.some((d) => d.key === key)) continue
      if (f.act.name) {
        const counts = nameCount.get(act.key) ?? new Map<string, number>()
        counts.set(f.act.name, (counts.get(f.act.name) ?? 0) + 1)
        nameCount.set(act.key, counts)
      }
      act.drafts.push({
        key,
        publisher: l.land,
        path: landDraftPath(l.land, l.id),
        title: l.title,
        begutachtung: { start: l.startedAt, end: l.deadline },
        stand: standOfLand(l.stage, inputs.today),
        partial: f.act.partial,
        row: { kind: 'land', key, item: withoutEu(l) },
      })
    }
  }
  for (const act of Object.values(acts)) {
    act.names = [...(nameCount.get(act.key) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n)
    // The Länder in display order, then by the Begutachtung's start.
    act.drafts.sort((a, b) => LAND_CODES.indexOf(a.publisher) - LAND_CODES.indexOf(b.publisher) || (a.begutachtung.start ?? a.begutachtung.end ?? '').localeCompare(b.begutachtung.start ?? b.begutachtung.end ?? ''))
  }
  const incomplete = new Set<LandCode>([...inputs.store.incomplete, ...inputs.unavailableLands])
  return {
    gp: inputs.gp,
    window: inputs.window,
    builtAt: inputs.store.builtAt ?? inputs.today,
    acts,
    incomplete: LAND_CODES.filter((l) => incomplete.has(l)),
  }
}
