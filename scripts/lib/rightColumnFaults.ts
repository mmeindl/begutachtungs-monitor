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
import { MIN_STANDING_STRETCH } from '../../server/utils/annex/rightColumn'

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

/*
 * The Bund's own classes, asked of the Länder too (21.11.2026): L, R-alt and
 * U (`harness/faultInjection.ts`, 2026-09-10). The edits and their
 * conditions are kept here once, so both harnesses inject the same fault;
 * the splitter and the word counter are the caller's.
 */

/** A donor sentence has to carry enough words to be evidence of anything (R-alt, U). */
const MIN_DONOR_TOKENS = 8
/** The injection site's left column: three sentences to lose the middle one of… */
const MIN_SITE_SENTENCES = 3
/** …and enough prose that losing one sentence still leaves a judgeable §. */
const MIN_SITE_TOKENS = 30

/**
 * L: a left column without its second sentence — what a reader does when it
 * files a line into the wrong column, and the word diff then paints
 * standing law as new. Only where the column has three sentences and thirty
 * words and the second is six words at least: a shorter one is a fault the
 * rules are not built to see (`MIN_STANDING_STRETCH`), and counting it as a miss would measure the
 * injector. Null elsewhere.
 */
export function secondSentenceGone(text: string, split: RegExp, words: (s: string) => readonly string[]): string | null {
  const sentences = text.split(split)
  if (sentences.length < MIN_SITE_SENTENCES || words(text).length < MIN_SITE_TOKENS || words(sentences[1]!).length < MIN_STANDING_STRETCH) return null
  return sentences.filter((_, i) => i !== 1).join(' ')
}

/** The donor of R-alt and U: the first sentence of another §'s standing text with `MIN_DONOR_TOKENS` words, or null. */
export function donorSentence(text: string, split: RegExp, words: (s: string) => readonly string[]): string | null {
  return text.split(split).find((s) => words(s).length >= MIN_DONOR_TOKENS) ?? null
}
