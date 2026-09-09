/**
 * The identity of one unit in a law comparison — shared by the diff view and
 * the § title lookup, because two independent guesses at a key is how a name
 * lands on the wrong change.
 */
import type { LawDiffUnit } from '../types'

/**
 * `article|id|change`.
 *
 * The `change` is not decoration. A Regierungsvorlage may drop the draft's
 * Ziffer 5 and introduce its own, and the comparison then carries **two**
 * units with id "Z 5" in the same Artikel — one removed, one inserted.
 * Keyed on `article|id` alone they collide, and the § heading looked up for
 * one appears on the other (SNG 8/ME, caught on screen 2026-09-09).
 */
export function unitKey(unit: Pick<LawDiffUnit, 'article' | 'id' | 'change'>): string {
  return `${unit.article ?? ''}|${unit.id}|${unit.change}`
}
