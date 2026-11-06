/**
 * Where a draft comes from, as tokens of the Entwurf station's fact line —
 * beside „ändert 1 Gesetz" (docs/architecture.md §12.66, §12.67): EU law it
 * implements or accompanies, a Grundsatzgesetz of the Bund it carries out,
 * an Art.-15a agreement it implements. Short, lower case, each a link to
 * the block that details it (or to the act's page); a Sammelnovelle may
 * carry all three. Every token is an in-page anchor: links in the spine jump
 * to a section below, never to another page (owner, 06.11.2026).
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

/** The in-page anchors of the two blocks (`DraftEuFact`, `DraftBundesrechtFact`). */
export const EU_FACT_ANCHOR = '#eu-recht-fakt'
export const BUNDESRECHT_FACT_ANCHOR = '#bundesrecht-fakt'

export type OriginToken = NonNullable<Station['factLinks']>[number]

/** The origin tokens of a draft, in the order EU, Grundsatzgesetz, agreement. */
export function originTokens(eu: EuRechtResponse | null | undefined, bund?: LandBundesrechtResponse | null): OriginToken[] {
  const out: OriginToken[] = []
  const lead = eu?.available ? euLeadOf(eu.marker) : null
  if (lead) out.push({ label: lead[0]!.toLowerCase() + lead.slice(1), href: EU_FACT_ANCHOR })
  const gg = (bund?.findings ?? []).filter((f) => f.kind === 'grundsatzgesetz')
  // In-page, as every link in the spine; the act page is linked from the block.
  if (gg.length === 1 && gg[0]!.name) out.push({ label: `führt das ${gg[0]!.name} aus`, href: BUNDESRECHT_FACT_ANCHOR })
  else if (gg.length) out.push({ label: gg.length === 1 ? 'führt ein Grundsatzgesetz aus' : 'führt Grundsatzgesetze aus', href: BUNDESRECHT_FACT_ANCHOR })
  if ((bund?.findings ?? []).some((f) => f.kind === 'vereinbarung')) out.push({ label: 'setzt eine Art.-15a-Vereinbarung um', href: BUNDESRECHT_FACT_ANCHOR })
  return out
}

/** The stations with the origin tokens at „Entwurf". */
export function withOrigin(stations: readonly Station[], tokens: readonly OriginToken[]): Station[] {
  return tokens.length ? stations.map((s) => (s.id === 'entwurf' ? { ...s, factLinks: [...tokens] } : s)) : [...stations]
}
