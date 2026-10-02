/**
 * Nuxt's own scroll behaviour (4.5, `nuxt/dist/pages/runtime/router.options`)
 * with one rule added in front: a change of the query alone, on the same
 * page, is a change of state and not a navigation, and never scrolls.
 *
 * Why (02.10.2026): the step toggle of the § comparison writes `?von=…&bis=…`
 * with `router.replace`. On a page reached by a deep link
 * (`#textvergleich-parlament`) the first switch also dropped the hash, and
 * Nuxt reads „same path, hash gone" as a link to the top of the page — the
 * reader landed at the page header. Keeping the hash is no way out either:
 * then every switch scrolls to that anchor, which may be another section.
 *
 * Nuxt does not export its default, and a `scrollBehavior` here replaces it
 * whole, so the rest is a copy. On a Nuxt upgrade, compare it with the file
 * named above.
 */
import type { RouterConfig } from 'nuxt/schema'
import { START_LOCATION, type RouteLocationNormalized } from 'vue-router'
import { isChangingPage } from '#app/components/utils'

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
      // The added rule; everything below it is Nuxt's.
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
        const scroll = () =>
          requestAnimationFrame(() => resolve(router.currentRoute.value.fullPath === to.fullPath ? position() : false))
        const transition = (nuxtApp as unknown as { '~transitionPromise'?: Promise<void> })['~transitionPromise']
        if (transition) void transition.then(scroll)
        else scroll()
      })
    })
  },
}
