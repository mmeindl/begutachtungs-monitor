/**
 * From a Regierungsvorlage to its Kundmachung in BGBl I, through RIS — the
 * second source for the BGBl number, used where Parliament's record of the
 * Vorlage carries no `bgbllinks` (03.10.2026).
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
  return pickBgblIForItem(records, gp, { ityp: 'I', inr: rvInr })
}

/**
 * The same exact join for an item of either kind (14.11.2026): a Vorlage by
 * `BgblAuth.Regierungsvorlage`, a selbständiger Antrag by
 * `BgblAuth.Initiativantrag` („84/A" — RIS names it on BGBl. I Nr. 11/2020,
 * whose own link at Parliament sits on the Bundesrat's Einspruch, 20 d.B.,
 * not on the Antrag; read 14.11.2026 on BGBl. I Nr. 11, 41 and 158/2020).
 * Never a title, never a number of the other kind: Vorlage 84 and Antrag 84
 * of one period are different bills.
 */
export function pickBgblIForItem(
  records: readonly BgblRecord[],
  gp: string,
  item: { ityp: 'I' | 'A'; inr: number },
): BgblRecord | null {
  let first: BgblRecord | null = null
  for (const r of records) {
    const named = item.ityp === 'I' ? r.regierungsvorlagen : r.initiativantraege
    if (r.teil !== 'Teil1' || r.gp !== gp || !named.includes(item.inr)) continue
    if (!first || r.datum < first.datum) first = r
  }
  return first
}

/**
 * The Kundmachung of a treaty's Vorlage (`RVS`, 14.11.2026), or null — the
 * same exact key as a law's: `Gesetzgebungsperiode` and
 * `Regierungsvorlage.item`, which RIS writes on Teil III records too
 * (BGBl. III Nr. 66/2026 ⇒ XXVIII, 119; read 14.11.2026). Teil III for a
 * Staatsvertrag, Teil I for an Art.-15a-Vereinbarung (388 d.B. XXVIII ⇒
 * BGBl. I Nr. 16/2026); both Teile are searched, because the key names one
 * item of the period whichever Teil carries it — a d.B. number is never a
 * law's and a treaty's at once. Never a title: treaty titles repeat
 * („Abkommen … über soziale Sicherheit"). The earliest issue wins, as for a
 * law: a later record naming the Vorlage again is no arrival.
 */
export function pickBgblForTreaty(
  records: readonly BgblRecord[],
  gp: string,
  rvInr: number,
): BgblRecord | null {
  let first: BgblRecord | null = null
  for (const r of records) {
    if ((r.teil !== 'Teil1' && r.teil !== 'Teil3') || r.gp !== gp || !r.regierungsvorlagen.includes(rvInr)) continue
    if (!first || r.datum < first.datum) first = r
  }
  return first
}
