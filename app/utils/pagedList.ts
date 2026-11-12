/**
 * The pure half of a paged list — the cut a re-sorted list keeps. The state
 * around it is `app/composables/usePagedList.ts`, which runs on Nuxt's
 * auto-imports and is out of vitest's and the tools program's reach; this
 * file imports nothing, so both read it as it is.
 */

/**
 * The cut after rows sorted in among the shown ones (12.11.2026): wide
 * enough that every row shown before stays shown.
 *
 * Re-taking the first `visible` rows of the grown list would push the last
 * rows the reader saw behind the pager — they move AND vanish. So the cut
 * grows to the last of them; „Weitere" and „Alle N" then count from there.
 * An open „Alle" (`Infinity`) stays open.
 */
export function cutKeeping(before: readonly string[], after: readonly string[], visible: number): number {
  if (!Number.isFinite(visible)) return visible
  const shownBefore = new Set(before.slice(0, visible))
  let last = -1
  after.forEach((key, index) => {
    if (shownBefore.has(key)) last = index
  })
  return Math.max(visible, last + 1)
}
