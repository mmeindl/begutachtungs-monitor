/**
 * Identity of a procedure root (`ProcedureRoot`) — the cache key, the path
 * segment and the Parliament address, in one place.
 *
 * Pure module: no Nuxt auto-imports, so both runtimes and vitest read it.
 */
import type { ProcedureItemKind, ProcedureRoot, VorlageKind } from '../types'

/**
 * The cache key of a root. A Ministerialentwurf keeps the key every derived
 * cache has used since it existed — `${gp}-${inr}` — so introducing the other
 * two roots invalidates nothing and changes no ME answer. The other two
 * carry their type, because `(gp, inr)` is shared across types: without it
 * 97 d.B. would read XXVIII/97/ME's cached comparison. Every item kind of
 * type `I` shares the type's number space (one d.B. number per item), so
 * the key needs no kind.
 */
export function rootKey(root: ProcedureRoot): string {
  return root.ityp === 'ME' ? `${root.gp}-${root.inr}` : `${root.gp}-${root.ityp}-${root.inr}`
}

export function meRoot(gp: string, inr: number): ProcedureRoot {
  return { gp, ityp: 'ME', inr }
}

/**
 * The path segment of each item kind (decision 4 of 14.11.2026): the address
 * names what the item is. „vorlage" and „antrag" keep the segments in
 * circulation since 10.11.2026.
 */
const KIND_SEGMENT: Readonly<Record<ProcedureItemKind, VorlageKind>> = {
  regierungsvorlage: 'vorlage',
  initiativantrag: 'antrag',
  ausschussantrag: 'ausschussantrag',
  bundesratsantrag: 'bundesratsantrag',
  staatsvertrag: 'staatsvertrag',
}

const SEGMENT_KIND = new Map<string, ProcedureItemKind>(
  (Object.entries(KIND_SEGMENT) as [ProcedureItemKind, VorlageKind][]).map(([kind, segment]) => [segment, kind]),
)

/** The item type of a kind: only the members' Antrag is `A`. */
export function itypOfItemKind(kind: ProcedureItemKind): 'I' | 'A' {
  return kind === 'initiativantrag' ? 'A' : 'I'
}

/** `ausschussantrag` → `ausschussantrag`, `vorlage` → `regierungsvorlage`; null for anything else. */
export function itemKindOfSegment(segment: string): ProcedureItemKind | null {
  return SEGMENT_KIND.get(segment) ?? null
}

export function segmentOfItemKind(kind: ProcedureItemKind): VorlageKind {
  return KIND_SEGMENT[kind]
}

/** A segment's item type — `vorlage`, `ausschussantrag`, … → `I`, `antrag` → `A`; null for anything else. */
export function itypOfKind(segment: string): 'I' | 'A' | null {
  const kind = itemKindOfSegment(segment)
  return kind ? itypOfItemKind(kind) : null
}

/** The default segment of a type, where the kind is not known: the Regierungsvorlage's and the Antrag's. */
export function kindOfItyp(ityp: 'I' | 'A'): VorlageKind {
  return ityp === 'I' ? 'vorlage' : 'antrag'
}

/** Our page of a Vorlage or Antrag without a Begutachtung. */
export function vorlagePath(gp: string, ityp: 'I' | 'A', inr: number): string {
  return `/entwuerfe/${gp}/${kindOfItyp(ityp)}/${inr}`
}

/** Our page of an item of a known kind — `/entwuerfe/XXVIII/ausschussantrag/14`. */
export function itemPath(gp: string, kind: ProcedureItemKind, inr: number): string {
  return `/entwuerfe/${gp}/${segmentOfItemKind(kind)}/${inr}`
}

/**
 * The kind of a law's carrying item as the list of laws without a
 * Begutachtung names it (`LawWithoutBegutachtung.item.kind`: `rv`, `antrag`,
 * `ausschussantrag`, `bundesratsantrag`) — for its page (`itemPath`).
 */
export function itemKindOfLawItem(kind: LawItemKind): ProcedureItemKind {
  return kind === 'rv' ? 'regierungsvorlage' : kind === 'antrag' ? 'initiativantrag' : kind
}

/** The kinds a law of that list can come as; `itemKindOfLawItem` backwards. */
export type LawItemKind = 'rv' | 'antrag' | 'ausschussantrag' | 'bundesratsantrag'

/** An item kind as that list names it, or null for a kind no law of the list
 *  comes as (a treaty is no Bundesgesetz). */
export function lawItemKindOf(kind: ProcedureItemKind): LawItemKind | null {
  if (kind === 'staatsvertrag') return null
  return kind === 'regierungsvorlage' ? 'rv' : kind === 'initiativantrag' ? 'antrag' : kind
}

/** Its API base, the sibling of `/api/drafts/<gp>/<inr>`. The API is keyed
 *  by the type: every kind of `I` answers under `vorlage`. */
export function vorlageApiBase(gp: string, ityp: 'I' | 'A', inr: number): string {
  return `/api/verfahren/${gp}/${kindOfItyp(ityp)}/${inr}`
}

/** The item's own page at Parliament. */
export function parliamentItemUrl(root: ProcedureRoot): string {
  return `https://www.parlament.gv.at/gegenstand/${root.gp}/${root.ityp}/${root.inr}`
}

/** „589 d.B." for a Vorlage, „1007/A" for an Antrag, „133/ME" for a draft.
 *  A committee's motion and a motion of the Bundesrat are Beilagen too:
 *  Parliament cites them „14 d.B.", „21 d.B.". */
export function rootCitation(root: ProcedureRoot): string {
  return root.ityp === 'I' ? `${root.inr} d.B.` : `${root.inr}/${root.ityp}`
}
