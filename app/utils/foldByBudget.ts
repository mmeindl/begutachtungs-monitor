/**
 * Where the fold goes in the Erläuterungen's Allgemeiner Teil
 * (`ExplanationsSection`; out of the component on 04.10.2026, so the rule is
 * pinned by tests/foldByBudget.test.ts).
 *
 * The Allgemeiner Teil is a median 2.359 characters long, p90 7.727 and at
 * most 40.335 (`pnpm corpus:erlaeuterungen`, window from 2024) — a
 * distribution in which „show everything" makes the page unusable for half
 * the drafts and „always fold" puts a click in front of two paragraphs for
 * the other half.
 *
 * Hence a character budget rather than a paragraph count: one long paragraph
 * is capped like twenty short ones. And the budget is checked BEFORE a
 * paragraph is added, not after — otherwise exactly the long paragraph the
 * exercise was about slips in whole (132/ME: 3.000 characters in one run,
 * checked on the page).
 *
 * The first paragraph always stands, however long it is: a disclosure as the
 * first element would be the page hiding its own answer. A paragraph is never
 * cut mid-sentence — it is the Ressort's text, not ours.
 */
export interface FoldItem {
  kind: 'heading' | 'text'
  text: string
}

export function foldByBudget<T extends FoldItem>(items: readonly T[], budget: number): { visible: T[]; folded: T[] } {
  let spent = 0
  let shown = 0
  let paragraphs = 0
  for (const [i, item] of items.entries()) {
    if (paragraphs >= 1 && spent + item.text.length > budget) break
    spent += item.text.length
    if (item.kind === 'text') paragraphs += 1
    shown = i + 1
  }
  // No dangling heading at the cut: it belongs to what stands below it, so
  // it moves into the disclosure with it.
  if (shown < items.length && items[shown - 1]?.kind === 'heading') shown -= 1
  return { visible: items.slice(0, shown), folded: items.slice(shown) }
}
