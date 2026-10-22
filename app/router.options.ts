/**
 * Nuxt's own scroll behaviour (4.5, `nuxt/dist/pages/runtime/router.options`)
 * with two rules added.
 *
 * One in front: a change of the query alone, on the same page, is a change
 * of state and not a navigation, and never scrolls. Why (02.10.2026): the
 * step toggle of the § comparison writes `?von=…&bis=…` with
 * `router.replace`. On a page reached by a deep link
 * (`#textvergleich-parlament`) the first switch also dropped the hash, and
 * Nuxt reads „same path, hash gone" as a link to the top of the page — the
 * reader landed at the page header. Keeping the hash is no way out either:
 * then every switch scrolls to that anchor, which may be another section.
 *
 * One at the end: Back and Forward restore their position only once the page
 * can hold it again, and hold it while the page settles (22.10.2026,
 * `restorePosition`).
 *
 * Nuxt does not export its default, and a `scrollBehavior` here replaces it
 * whole, so the rest is a copy. On a Nuxt upgrade, compare it with the file
 * named above.
 */
import type { RouterConfig } from 'nuxt/schema'
import { START_LOCATION, type RouteLocationNormalized } from 'vue-router'
import { isChangingPage } from '#app/components/utils'

/**
 * Back and Forward land where the reader left: once the page has grown back
 * to that position, and held there while it settles.
 *
 * Every page fetches `lazy` since 04.10.2026, so after Back it stands first
 * as its loading state, and Nuxt's signal (`page:loading:end`) comes before
 * the data. `/entwuerfe` was 813 px tall at that moment; the browser clamped
 * the remembered 2,500 px to 0, and 40 ms later the list was 5,664 px long.
 * Every Back landed at the top, every Forward onto a draft page too
 * (measured 22.10.2026). So the position is applied once the page can
 * scroll that far.
 *
 * And held, the way `hash-anchor.client.ts` holds a deep link's anchor: a
 * draft page loads sections above the position after its data — 249 px on
 * 134/ME XXVIII — and the browser's scroll anchoring then keeps the half-built
 * page's content in view, a quarter screen below where the reader left. Each
 * change of the page's height puts the position back.
 *
 * Until the reader does anything (their scrolling wins over a position nobody
 * has chosen yet), a newer navigation starts, or two and a half seconds have
 * passed. A warm page — the normal case, the caches are prewarmed — holds its
 * position within some 50 ms; the window is for the sections that load after
 * it, and it is short because two inputs pass unseen: dragging the scrollbar
 * and find-in-page, which a late section could otherwise pull back once.
 * Five seconds, enough for a cold cache's one to four, was the first choice
 * and too long (22.10.2026). A page still too short when the window closes
 * scrolls as far as it reaches, the nearest point to where the reader was.
 */
const RESTORE_MS = 2_500
const USER_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

function restorePosition({ left, top }: { left: number; top: number }, isCurrent: () => boolean): void {
  const root = document.documentElement
  const reaches = () => root.scrollHeight - root.clientHeight >= top
  // Instant, the way a browser restores a position: `main.css` makes
  // scrolling smooth for anchor jumps, and a glide would replay the way down.
  const apply = () => {
    if (scrollX !== left || scrollY !== top) scrollTo({ left, top, behavior: 'instant' })
  }
  if (typeof ResizeObserver === 'undefined') return apply()

  const stop = () => {
    observer.disconnect()
    clearTimeout(timer)
    for (const type of USER_INPUT) removeEventListener(type, stop, true)
  }
  const observer = new ResizeObserver(() => {
    if (!isCurrent()) stop()
    else if (reaches()) apply()
  })
  const timer = setTimeout(() => {
    if (isCurrent()) apply()
    stop()
  }, RESTORE_MS)
  for (const type of USER_INPUT) addEventListener(type, stop, { capture: true, passive: true })
  observer.observe(document.body)
}

const samePath = (a: RouteLocationNormalized, b: RouteLocationNormalized) =>
  a.path.replace(/\/$/, '') === b.path.replace(/\/$/, '')

const queryChanged = (a: RouteLocationNormalized, b: RouteLocationNormalized) =>
  JSON.stringify(a.query) !== JSON.stringify(b.query)

function hashScrollMarginTop(selector: string): number {
  try {
    const el = document.querySelector(selector)
    if (el) {
      return (
        (Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0) +
        (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0)
      )
    }
  } catch {
    // An id that is no valid selector: no margin to add.
  }
  return 0
}

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    const nuxtApp = useNuxtApp()
    const router = useRouter()
    const hashBehavior = (router.options as { scrollBehaviorType?: 'auto' | 'smooth' }).scrollBehaviorType ?? 'auto'

    if (samePath(to, from)) {
      // The rule added in front; below it is Nuxt's, up to the restore at the end.
      if (!to.hash && queryChanged(to, from)) return false
      if (from.hash && !to.hash) return savedPosition ?? { left: 0, top: 0 }
      if (to.hash) return { el: to.hash, top: hashScrollMarginTop(to.hash), behavior: hashBehavior }
      return false
    }

    const scrollToTop = typeof to.meta.scrollToTop === 'function' ? to.meta.scrollToTop(to, from) : to.meta.scrollToTop
    if (scrollToTop === false) return false

    const position = () => {
      if (savedPosition) return savedPosition
      if (to.hash) {
        return {
          el: to.hash,
          top: hashScrollMarginTop(to.hash),
          behavior: isChangingPage(to, from) ? hashBehavior : ('instant' as const),
        }
      }
      return { left: 0, top: 0 }
    }
    if (from === START_LOCATION) return position()

    // Scroll once the new page is in place, not while the old one still is.
    return new Promise((resolve) => {
      nuxtApp.hooks.hookOnce('page:loading:end', () => {
        const isCurrent = () => router.currentRoute.value.fullPath === to.fullPath
        const scroll = () =>
          requestAnimationFrame(() => {
            if (!isCurrent()) return resolve(false)
            if (!savedPosition) return resolve(position())
            // Restored here rather than by the router, which scrolls once:
            // this waits for the page and holds the position while it settles.
            restorePosition(savedPosition, isCurrent)
            resolve(false)
          })
        const transition = (nuxtApp as unknown as { '~transitionPromise'?: Promise<void> })['~transitionPromise']
        if (transition) void transition.then(scroll)
        else scroll()
      })
    })
  },
}
