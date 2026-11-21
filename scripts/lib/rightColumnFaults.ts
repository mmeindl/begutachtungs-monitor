/**
 * The faults a reader makes in a right column's new text, as edits of that
 * text: a figure, a word, the last sentence. Built for the Länder harness
 * (`harness/landGuard.ts`, 19.11.2026) and asked of the Bund's annex gate
 * too (`harness/faultInjection.ts`, 21.11.2026), so both measure the same
 * fault. Each edit returns null where the text has nothing to break.
 *
 * The sentence splitter is the caller's: each harness keeps the one its
 * published figures were measured with.
 */

/** Zahl: the first number of the text, plus seven. */
export function raisedNumber(text: string): string | null {
  return /\d+/.test(text) ? text.replace(/\d+/, (d) => String(Number(d) + 7)) : null
}

/** Wort: the longest word of the text swapped for one no draft uses. */
export function swappedWord(text: string): string | null {
  const longest = text.split(/\s+/).filter((w) => /^\p{L}{6,}$/u.test(w)).sort((a, b) => b.length - a.length)[0]
  return longest ? text.replace(longest, 'Bewilligungsvoraussetzung') : null
}

/** Satz weg: the text's last sentence gone. */
export function lastSentenceGone(text: string, split: RegExp): string | null {
  const parts = text.split(split)
  return parts.length > 1 ? parts.slice(0, -1).join(' ') : null
}
