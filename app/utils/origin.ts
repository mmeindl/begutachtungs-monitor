/**
 * Where a draft comes from, as facts of the Entwurf station's line — beside
 * „ändert 1 Gesetz" (docs/architecture.md §12.66, §12.67): EU law it
 * implements or accompanies, a Grundsatzgesetz of the Bund it carries out,
 * an Art.-15a agreement it implements. Short, lower case; a Sammelnovelle
 * may carry all three. Plain text like every fact of the spine: a link there
 * gets its own line with an arrow („Was ändert der Entwurf? →"), and the
 * sections in „Der Entwurf" that detail these facts follow right after the
 * comparison that line leads to (owner, 06.11.2026).
 *
 * WHY AT THE ENTWURF STATION. The origin is a property of the text like
 * the laws it amends, not a step of this procedure, and it runs on its own
 * time scale — the EU strip shows the magnitude, the spine does not try to.
 * No station before „Entwurf" (spine decisions of September 2026); the
 * Bundesgesetzblatt station carries the follow-up downstream (§12.67), so
 * the spine reads origin → … → follow-up.
 *
 * Pure: the pages pass their facts, the tests read it without one.
 */
import type { EuRechtResponse, LandBundesrechtResponse } from '#shared/types'
import { euLeadOf } from './euRecht'
import type { Station } from './spine'

/** The ids of the EU row and the Bund rows in „Der Entwurf"'s opening frame (`EntwurfFrame`). */
export const EU_FACT_ANCHOR = '#eu-recht-fakt'
export const BUNDESRECHT_FACT_ANCHOR = '#bundesrecht-fakt'

/** The origin facts of a draft, in the order EU, Grundsatzgesetz, agreement. */
export function originTokens(eu: EuRechtResponse | null | undefined, bund?: LandBundesrechtResponse | null): string[] {
  const out: string[] = []
  const lead = eu?.available ? euLeadOf(eu.marker) : null
  if (lead) out.push(lead[0]!.toLowerCase() + lead.slice(1))
  const gg = (bund?.findings ?? []).filter((f) => f.kind === 'grundsatzgesetz')
  if (gg.length === 1 && gg[0]!.name) out.push(`führt das ${gg[0]!.name} aus`)
  else if (gg.length) out.push(gg.length === 1 ? 'führt ein Grundsatzgesetz aus' : 'führt Grundsatzgesetze aus')
  if ((bund?.findings ?? []).some((f) => f.kind === 'vereinbarung')) out.push('setzt eine Art.-15a-Vereinbarung um')
  return out
}

/** The stations with the origin facts after the Entwurf station's own. */
export function withOrigin(stations: readonly Station[], tokens: readonly string[]): Station[] {
  return tokens.length ? stations.map((s) => (s.id === 'entwurf' ? { ...s, facts: [...s.facts, ...tokens] } : s)) : [...stations]
}
