/**
 * Whether Back or Forward is putting a position back right now
 * (`router.options.ts`, `restorePosition`) — for the sections that fetch
 * only on approach (`useNearViewportSection`, 12.11.2026).
 *
 * A restore waits until the page has grown back to the remembered position.
 * A section that asks only once it nears the viewport would never grow it:
 * the page stands at its top while its skeletons wait for a reader who is
 * further down, and the restore ends where the short page ends. So while a
 * restore runs, those sections ask at once, as every section did before.
 *
 * A point in time, not a flag cleared by the restore, and set twice: by
 * `plugins/scroll-restore.client.ts` on `popstate`, which the browser fires
 * at the very start of Back or Forward, before the router resolves anything
 * — so the mark stands before the new page's sections mount, whatever the
 * router's order — and again by the router's `scrollBehavior`, which extends
 * it to the restore's own window. Client-only state; the server never
 * scrolls.
 */
let restoringUntil = 0

/** How long a restore holds its position — the reasons are at `restorePosition` in `router.options.ts`. */
export const RESTORE_MS = 2_500

export function markScrollRestore(ms: number): void {
  restoringUntil = Date.now() + ms
}

export function isRestoringScroll(): boolean {
  return Date.now() < restoringUntil
}
