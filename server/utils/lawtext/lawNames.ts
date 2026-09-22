/**
 * Reading a law's name — the shared arithmetic behind three name joins.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 */

/**
 * Jaccard over two token sets: shared / (all distinct).
 *
 * Zero when either side is empty, which is the answer every caller wants —
 * an unnamed law matches nothing rather than everything.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / (a.size + b.size - shared)
}
