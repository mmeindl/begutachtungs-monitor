/**
 * The number of a § as every reader reads it — one pattern, because each
 * reader that kept its own drifted from the others.
 *
 * „§ 54c." → „54c", „§ 8.03." → „8.03", „§ 6.01a" → „6.01a", „§ 243ba" →
 * „243ba", „§ 365m1" → „365m1", „§ 5." → „5": the digits, the decimal of a
 * Verordnung that numbers its §§ by Kapitel, then one or two letters and the
 * digits a law sets behind them. Every part counts: 707EA278
 * (Wasserstraßen-Verkehrsordnung) has „§ 6.01a" beside „§ 6.01", the
 * Gewerbeordnung „§ 365m1" beside „§ 365m", the EU-JZG „§ 52a1" beside
 * „§ 52a" — and the engine, the grammar, the Beilage readers and the page key
 * each dropped one part or another, so the one § fell onto the other
 * (26.10.2026). Only `annex/annexText.ts` read them whole already.
 *
 * A word glued to the number is no part of it — „§ 42wird" is § 42,
 * „§ 31Abs. 3" § 31 — so the letters may not run on into a third. With the
 * `i` flag a reader takes them in either case („§ 54C"); without it only
 * lowercase.
 *
 * A source string, not a RegExp: each reader builds its own around it, with
 * its own anchors, flags and what may follow. Only a digit behind the point
 * continues the number, so the full stop of „§ 5." stays out of it.
 */
export const PARAGRAPH_NUMBER = String.raw`\d+(?:\.\d+)?(?:[a-z]{1,2}\d*(?![a-zäöüß]))?`
