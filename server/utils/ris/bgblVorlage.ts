/**
 * From a Regierungsvorlage to its Kundmachung in BGBl I, through RIS — the
 * second source for the BGBl number, used where Parliament's record of the
 * Vorlage carries no `bgbllinks` (docs/architecture.md §12.33, Nachtrag
 * 03.10.2026).
 *
 * PURE MODULE — relative imports only, so vitest can execute it directly.
 *
 * AN EXACT JOIN, unlike `bgblJoin.ts` beside it. RIS keys a Teil-I law by
 * the Gesetzgebungsperiode and the Vorlagen it enacts
 * (`BgblAuth.Gesetzgebungsperiode`, `BgblAuth.Regierungsvorlage.item`), so
 * no title is compared and no threshold is set. Measured 03.10.2026 against
 * the BGBl numbers Parliament itself links for GP XXVIII's enacted drafts:
 * the key returns the same number in 81 of 81, no second hit, no miss.
 *
 * What it cannot find, and must not: a Vorlage whose own text was never
 * promulgated. 80 d.B. (XXVIII) and 1435 d.B. (XXVII) were decided in both
 * chambers and carry no link — and no Teil-I record names either of them;
 * a law with the same short title came months later from another
 * Beschluss each time (BGBl. I Nr. 65/2025 from Initiativantrag 416/A; BGBl.
 * I Nr. 18/2023 with no Vorlage named). Matching those by title would state
 * a Kundmachung for a text that never had one.
 */
import type { BgblRecord } from './bgblJoin'

/**
 * The Kundmachung of Vorlage `rvInr` of period `gp`, or null.
 *
 * Teil I only — a Vorlage is a federal law, and a Teil-II record carries no
 * Vorlage anyway. Should two laws name the same Vorlage, the earliest issue
 * wins: the Vorlage reached the Bundesgesetzblatt with it, and a later one
 * naming it again is a correction, not its arrival.
 */
export function pickBgblIForVorlage(
  records: readonly BgblRecord[],
  gp: string,
  rvInr: number,
): BgblRecord | null {
  let first: BgblRecord | null = null
  for (const r of records) {
    if (r.teil !== 'Teil1' || r.gp !== gp || !r.regierungsvorlagen.includes(rvInr)) continue
    if (!first || r.datum < first.datum) first = r
  }
  return first
}
