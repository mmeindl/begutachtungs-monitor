/**
 * Keeps a deep link's anchor in view while the page grows above it.
 *
 * A draft page loads most of its sections on the client — the comparisons,
 * the Vorlage's Stellungnahmen — after the browser has already jumped to the
 * hash. Each block that arrives above the anchor pushes it down, and a link to
 * `#parlament` landed 498 px below the top of the window, one to
 * `#textvergleich-parlament` 773 px (115/ME XXVIII, measured 01.10.2026). The
 * reader followed a link to a section and saw the one before it.
 *
 * So on the first load with a hash, every change of the page's height scrolls
 * the anchor back to the top — until the reader does anything (wheel, touch,
 * key, pointer), or after ten seconds. Their own scrolling always wins: the
 * plugin holds a position nobody has chosen yet, never one somebody left.
 *
 * The anchor is looked up again on each pass, not once: a component may
 * rewrite the hash while the page settles (`LawDiffSection` sends a link from
 * before 01.10.2026 on to the section that now holds its comparison).
 * Client-side navigation is the router's business and is left alone — there
 * the sections above have usually loaded already.
 */
const SETTLE_MS = 10_000
const USER_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

function anchor(): HTMLElement | null {
  if (!location.hash) return null
  try {
    return document.getElementById(decodeURIComponent(location.hash.slice(1)))
  } catch {
    return null
  }
}

function holdAnchor() {
  if (!anchor() || typeof ResizeObserver === 'undefined') return
  const keep = () => anchor()?.scrollIntoView({ block: 'start' })
  const observer = new ResizeObserver(keep)
  const stop = () => {
    observer.disconnect()
    clearTimeout(timer)
    for (const type of USER_INPUT) removeEventListener(type, stop, true)
  }
  const timer = setTimeout(stop, SETTLE_MS)
  for (const type of USER_INPUT) addEventListener(type, stop, { capture: true, passive: true, once: true })
  observer.observe(document.body)
}

export default defineNuxtPlugin((nuxtApp) => {
  // Once: the first load is the only one the browser scrolled for itself.
  let done = false
  nuxtApp.hook('app:suspense:resolve', () => {
    if (done) return
    done = true
    holdAnchor()
  })
})
