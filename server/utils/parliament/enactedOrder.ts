/**
 * Which laws the „Zuletzt Gesetz geworden" section shows, and in which
 * order (docs/architecture.md §12.23).
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest can
 * execute the module directly. It sat inside `enacted.ts` until 23.09.2026,
 * between two upstream fetches, and was therefore asserted by nothing —
 * although the whole point of the section is that **selection is never a
 * judgement**: it is the BGBl number, descending, and nothing else.
 */

/** As much of a candidate as the order and the deduplication read. */
export interface EnactedCandidate {
  /** `bgblOrderKey` of the Kundmachung — year and number in one sortable integer. */
  order: number
  /** The Ministerialentwurf this law came out of; the identity of a row. */
  draft: { gp: string; inr: number }
}

/**
 * Newest Kundmachung first, one row per Ministerialentwurf.
 *
 * THE ORDER IS THE BGBl NUMBER, not a date: a Kundmachung's number is the
 * sequence the Bundesgesetzblatt itself publishes in, while the dates
 * available upstream are the Vorlage's Einlangen, which does not order
 * promulgations at all (up to 91 days apart, measured 18.09.2026).
 *
 * THE DEDUPLICATION is not cosmetic. ME → RV is 1:n and both strands can
 * reach the Bundesgesetzblatt — 74/ME produced 443 and 444 d.B., promulgated
 * as BGBl. I 81/2026 and 39/2026 (§13.4) — so as soon as two laws of one
 * draft fall into the same window the same card would render twice. The
 * NEWEST Kundmachung wins, which needs no extra rule: the list is already in
 * that order, so the first occurrence is the newest one.
 *
 * NO LIMIT HERE, deliberately. The caller cuts the list once it has the
 * list-81 row for each draft, because a candidate whose row it cannot fetch
 * is a card it cannot render — and must not consume one of the slots.
 */
export function pickEnacted<T extends EnactedCandidate>(candidates: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const c of [...candidates].sort((a, b) => b.order - a.order)) {
    const key = `${c.draft.gp}-${c.draft.inr}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}
