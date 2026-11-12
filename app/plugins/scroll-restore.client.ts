/**
 * Marks the window of a Back/Forward restore from `popstate`
 * (`utils/scrollRestore.ts`), so the sections that ask only on approach
 * (`useNearViewportSection`) ask at once on the page Back or Forward lands on.
 *
 * The router's `scrollBehavior` marks it too, but vue-router calls that after
 * a `nextTick` of the navigation, and whether that comes before the new
 * page's sections mount is an order nobody has watched in a browser. The
 * browser fires `popstate` synchronously at the very start of Back or
 * Forward, before vue-router's own listener resolves a single guard — so the
 * mark stands before anything of the new page exists, whatever the order
 * after it. `scrollBehavior` then extends the window from its own moment.
 *
 * `popstate` also fires for Back and Forward between two hashes of the same
 * page. Marking then is harmless: no page is mounted, the sections already
 * on it read the mark only at their mount and have long since decided, and
 * a section that happens to mount within the window asks at once — what
 * every section did before 12.11.2026, one request early, never a wrong one.
 *
 * Client only (`.client.ts`): the server has no history and never scrolls.
 */
import { RESTORE_MS, markScrollRestore } from '~/utils/scrollRestore'

export default defineNuxtPlugin(() => {
  addEventListener('popstate', () => markScrollRestore(RESTORE_MS))
})
