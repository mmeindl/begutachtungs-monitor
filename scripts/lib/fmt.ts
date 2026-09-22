/**
 * The number formats a report prints.
 *
 * Only the ones that were written more than once live here. Several scripts
 * carry a `pct` of their own with a different column width or a different
 * dash for "no denominator", and those stay where they are: a table's
 * alignment is part of that report, not a shared rule.
 */

/** `12.3 %`, or an em dash where there is nothing to divide by. */
export function pct(n: number, of: number): string {
  return of === 0 ? '—' : `${((n / of) * 100).toFixed(1)} %`
}

/**
 * The `q` quantile of `xs`, by the lower index — `0.5` of ten values is the
 * fifth, not the mean of the fifth and sixth. Sorts a copy; `xs` is left alone.
 */
export function quantile(xs: readonly number[], q: number): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!
}

/**
 * The same quantile by NEAREST RANK, over an already sorted array.
 *
 * Kept apart from `quantile` rather than folded into it, because the two
 * disagree: over 37 values, `q = 0.1` is the fourth here and the third there.
 * Which one a published number was measured with is not a detail, so the
 * rounding rule stays visible in the name of the function the script calls.
 */
export function quantileOfSorted(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))]!
}
