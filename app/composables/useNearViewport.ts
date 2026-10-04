/**
 * Call `onNear` once, when an element comes within `rootMargin` of the
 * viewport — the „ask on approach" of a request most readers never need:
 * a Stellungnahme's PDF tag (`StatementDocumentTag`) and the second and
 * third comparison of a draft page (`LawDiffSection`). Both wrote the same
 * observer out (04.10.2026).
 *
 * Once, then the observer goes: what was asked for stays asked for.
 *
 * No IntersectionObserver (old browser, jsdom), or no element: `onNear`
 * runs straight away — slower for the page, never broken.
 *
 * `skip`, read at mount: nothing to ask for, or it was asked already.
 */
import type { MaybeRefOrGetter } from 'vue'

export function useNearViewport(
  target: MaybeRefOrGetter<HTMLElement | null | undefined>,
  onNear: () => void,
  rootMargin: string,
  skip?: () => boolean,
) {
  let observer: IntersectionObserver | null = null

  function stop() {
    observer?.disconnect()
    observer = null
  }

  onMounted(() => {
    if (skip?.()) return
    const el = toValue(target)
    if (!el || typeof IntersectionObserver === 'undefined') {
      onNear()
      return
    }
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        stop()
        onNear()
      },
      { rootMargin },
    )
    observer.observe(el)
  })

  onBeforeUnmount(stop)
}
