/**
 * Where a draft comes from, as tokens of the Entwurf station's fact line —
 * beside „ändert 1 Gesetz" (docs/architecture.md §12.66, §12.67): EU law it
 * implements or accompanies, a Grundsatzgesetz of the Bund it carries out,
 * an Art.-15a agreement it implements. Short, lower case, each a link to
 * the section in „Der Entwurf" that details it — or plain text where no act
 * is named and so no section exists; a Sammelnovelle may
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
import { isNamedFinding } from './bundesrecht'
import type { Station } from './spine'

/** The in-page anchors of the two sections in „Der Entwurf" (`DraftEuSection`, `DraftBundesrechtSection`). */
export const EU_FACT_ANCHOR = '#eu-recht-fakt'
export const BUNDESRECHT_FACT_ANCHOR = '#bundesrecht-fakt'

export type OriginToken = NonNullable<Station['factLinks']>[number]

/** The origin tokens of a draft, in the order EU, Grundsatzgesetz, agreement. */
export function originTokens(eu: EuRechtResponse | null | undefined, bund?: LandBundesrechtResponse | null): OriginToken[] {
  const out: OriginToken[] = []
  const lead = eu?.available ? euLeadOf(eu.marker) : null
  // A token links only where its section exists — a named act (06.11.2026); else plain text.
  if (lead) out.push({ label: lead[0]!.toLowerCase() + lead.slice(1), href: eu!.acts.length ? EU_FACT_ANCHOR : null })
  const gg = (bund?.findings ?? []).filter((f) => f.kind === 'grundsatzgesetz')
  const bundHref = (named: boolean) => (named ? BUNDESRECHT_FACT_ANCHOR : null)
  // In-page, as every link in the spine; the act page is linked from the section.
  if (gg.length === 1 && gg[0]!.name) out.push({ label: `führt das ${gg[0]!.name} aus`, href: BUNDESRECHT_FACT_ANCHOR })
  else if (gg.length) out.push({ label: gg.length === 1 ? 'führt ein Grundsatzgesetz aus' : 'führt Grundsatzgesetze aus', href: bundHref(gg.some(isNamedFinding)) })
  const va = (bund?.findings ?? []).filter((f) => f.kind === 'vereinbarung')
  if (va.length) out.push({ label: 'setzt eine Art.-15a-Vereinbarung um', href: bundHref(va.some(isNamedFinding)) })
  return out
}

/** The stations with the origin tokens at „Entwurf". */
export function withOrigin(stations: readonly Station[], tokens: readonly OriginToken[]): Station[] {
  return tokens.length ? stations.map((s) => (s.id === 'entwurf' ? { ...s, factLinks: [...tokens] } : s)) : [...stations]
}
