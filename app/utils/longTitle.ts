/**
 * The RIS long title as the draft page's lede (14.11.2026).
 *
 * On an ordinary Verordnung the long title is one sentence and says what the
 * Kurztitel does not: the subject matter. On a Sammelverordnung it is the
 * promulgation title and names every act it amends, repeals or issues — the
 * FinanzOnline-Verordnung 2027-Anpassungsverordnung lists about 25, 2,338
 * characters. Two things follow, both for display only: the record keeps
 * the full `longTitle`, because the BGBl join reads its names and
 * abbreviation (`bgblJoin.bgblNames`) and search finds the acts in it.
 */

/**
 * Above this many characters the lede is clamped to three lines and opens
 * in place. Measured 14.11.2026 over the 189 RIS records with a long title:
 * median 172, p90 300, maximum 2,338; 18 are longer. 300 is about three
 * lines at the page's measure, so the clamp never hides less than a line.
 */
export const LONG_TITLE_CLAMP_CHARS = 300

const TRAILING_PAREN = /\s*\(([^()]*)\)\s*$/

/** Whitespace collapsed and „ - " read as „ – ": RIS writes both. */
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/\s-\s/g, ' – ').trim()

/**
 * The long title without the trailing „(Kurztitel – Abkürzung)" the heading
 * already says. Measured 14.11.2026: 46 of 189 long titles end that way.
 *
 * - The parenthetical is contained in the heading → it goes.
 * - It is the heading plus „– Abkürzung" → only the abbreviation stays,
 *   the one thing in it the heading does not say.
 * - Anything else stays as written („(17. Novelle zur ZustV)" under
 *   „17. Novelle zur Zulassungsstellenverordnung" is a different name).
 *
 * `null` when nothing is left that the heading does not already say.
 */
export function ledeLongTitle(longTitle: string | null | undefined, title: string): string | null {
  if (!longTitle) return null
  const heading = norm(title)
  let text = longTitle.trim()
  const m = TRAILING_PAREN.exec(text)
  if (m) {
    const inner = norm(m[1]!)
    const head = text.slice(0, m.index)
    if (heading.includes(inner)) {
      text = head
    } else if (inner.startsWith(`${heading} – `)) {
      text = `${head} (${inner.slice(heading.length + 3)})`
    }
  }
  text = text.trim()
  return text && norm(text) !== heading ? text : null
}
