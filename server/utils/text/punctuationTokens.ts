/**
 * Words without their punctuation, as two engines compare them.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * A phrase inserted before a comma turns „Wort" into „Wort," in the diff,
 * which is not a changed word. Comparing raw tokens flagged 41 of 267 correct
 * paragraphs as unexplained (2026-09-09); the annex side has the same
 * property the other way round, where „36," and „36" are the same word.
 *
 * `applyReport.words` looks similar and is NOT this: it lowercases and
 * normalises hyphens, because it holds two different sources against each
 * other rather than two readings of one.
 */

/**
 * Split on whitespace, strip opening and closing punctuation from each
 * token's edges, drop what is left empty.
 */
export function punctuationTokens(t: string): string[] {
  return t
    .split(/\s+/)
    .map((w) => w.replace(/^[„"'([]+|["'),.;:\]]+$/g, ''))
    .filter(Boolean)
}
