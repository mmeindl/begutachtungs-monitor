/**
 * Picking one law name out of several — the rule both name joins share.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * "Clearly better than every other" is the whole test. Two laws of one BGBl
 * are often near-namesakes („Umsatzsteuergesetz 1994" and „Umsatzsteuergesetz
 * 1994 – Anhang (Binnenmarkt)"), and so are two Artikel of one package, so a
 * tie has to end in a refusal rather than in whichever candidate came first.
 *
 * The threshold is the caller's: it stays at the call site, under its own
 * name, because it was measured there.
 */
import { lawNameScore } from '../lawTitles'

/**
 * The one candidate whose name matches `name` best — null if the best is
 * below `threshold`, or no better than the runner-up.
 *
 * Candidates a caller does not want scored are filtered out before the call;
 * a skipped candidate is no runner-up either.
 */
export function pickClearWinner<T>(
  candidates: Iterable<T>,
  name: string,
  nameOf: (candidate: T) => string,
  threshold: number,
): T | null {
  let best: { candidate: T; score: number } | null = null
  let runnerUp = 0
  for (const candidate of candidates) {
    const score = lawNameScore(name, nameOf(candidate))
    if (!best || score > best.score) {
      runnerUp = best?.score ?? 0
      best = { candidate, score }
    } else if (score > runnerUp) runnerUp = score
  }
  if (!best || best.score < threshold || best.score <= runnerUp) return null
  return best.candidate
}
