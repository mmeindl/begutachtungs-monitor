/**
 * Identity of a procedure root (`ProcedureRoot`) — the cache key, the path
 * segment and the Parliament address, in one place.
 *
 * Pure module: no Nuxt auto-imports, so both runtimes and vitest read it.
 */
import type { ProcedureItemType, ProcedureRoot, VorlageKind } from '../types'

/**
 * The cache key of a root. A Ministerialentwurf keeps the key every derived
 * cache has used since it existed — `${gp}-${inr}` — so introducing the other
 * two roots invalidates nothing and changes no ME answer. The other two
 * carry their type, because `(gp, inr)` is shared across types: without it
 * 97 d.B. would read XXVIII/97/ME's cached comparison.
 */
export function rootKey(root: ProcedureRoot): string {
  return root.ityp === 'ME' ? `${root.gp}-${root.inr}` : `${root.gp}-${root.ityp}-${root.inr}`
}

export function meRoot(gp: string, inr: number): ProcedureRoot {
  return { gp, ityp: 'ME', inr }
}

const KIND_ITYP: Record<VorlageKind, ProcedureItemType> = { vorlage: 'I', antrag: 'A' }

/** `vorlage` → `I`, `antrag` → `A`; null for anything else. */
export function itypOfKind(kind: string): 'I' | 'A' | null {
  return kind === 'vorlage' || kind === 'antrag' ? (KIND_ITYP[kind] as 'I' | 'A') : null
}

export function kindOfItyp(ityp: 'I' | 'A'): VorlageKind {
  return ityp === 'I' ? 'vorlage' : 'antrag'
}

/** Our page of a Vorlage or Antrag without a Begutachtung. */
export function vorlagePath(gp: string, ityp: 'I' | 'A', inr: number): string {
  return `/entwuerfe/${gp}/${kindOfItyp(ityp)}/${inr}`
}

/** Its API base, the sibling of `/api/drafts/<gp>/<inr>`. */
export function vorlageApiBase(gp: string, ityp: 'I' | 'A', inr: number): string {
  return `/api/verfahren/${gp}/${kindOfItyp(ityp)}/${inr}`
}

/** The item's own page at Parliament. */
export function parliamentItemUrl(root: ProcedureRoot): string {
  return `https://www.parlament.gv.at/gegenstand/${root.gp}/${root.ityp}/${root.inr}`
}

/** „589 d.B." for a Vorlage, „1007/A" for an Antrag, „133/ME" for a draft. */
export function rootCitation(root: ProcedureRoot): string {
  return root.ityp === 'I' ? `${root.inr} d.B.` : `${root.inr}/${root.ityp}`
}
