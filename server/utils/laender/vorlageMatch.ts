/**
 * Which Landesgesetzblatt is a draft's own? Decided by its text: the
 * Regierungsvorlage the Landtag received is the draft, bar what changed
 * after the Begutachtung, and RIS links each Salzburg Landesgesetzblatt to
 * its Regierungsvorlage (22.10.2026, docs/architecture.md §12.47–48).
 *
 * PURE MODULE — no imports, so vitest runs it directly.
 */

/** Words as both PDFs print them: lower case, no quotes, a line-break hyphen closed. */
export function matchWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[„“”"»«‚‘]/g, '')
    .replace(/-\s+(?=\p{Ll})/gu, '')
    .split(/[^\p{L}\p{N}§]+/u)
    .filter(Boolean)
}

/** Every run of five words — long enough that two texts share it only by being one text. */
export function shingles(text: string): Set<string> {
  const w = matchWords(text)
  const out = new Set<string>()
  for (let i = 0; i + 5 <= w.length; i++) out.add(w.slice(i, i + 5).join(' '))
  return out
}

/** The share of the draft's five-word runs that stand in the other text. */
export function containedIn(draft: ReadonlySet<string>, other: ReadonlySet<string>): number {
  if (!draft.size) return 0
  let hit = 0
  for (const s of draft) if (other.has(s)) hit++
  return hit / draft.size
}

/** A draft shorter than this says too little to be recognised in anything. */
export const MIN_SHINGLES = 20
/** The oracle's threshold and margin (§12.47): at least 60 % of the draft, and twice the runner-up. */
export const VORLAGE_CONTAINED = 0.6

/**
 * The candidate whose Regierungsvorlage holds the draft: at least
 * `VORLAGE_CONTAINED` of it, and twice as much as any other candidate.
 * Null where none does or two come close — then nothing is decided here.
 */
export function pickByVorlage<T>(scored: readonly { candidate: T; share: number }[]): T | null {
  const sorted = [...scored].sort((a, b) => b.share - a.share)
  const [best, second] = sorted
  if (!best || best.share < VORLAGE_CONTAINED) return null
  if (second && second.share > best.share / 2) return null
  return best.candidate
}

/** Title words two Landesgesetzblätter must share to be candidates for one Verordnung (§12.50: covers 356 of 357). */
export const SAME_TITLE_JACCARD = 0.6

export function titleJaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let both = 0
  for (const w of a) if (b.has(w)) both++
  return both / (a.size + b.size - both || 1)
}
