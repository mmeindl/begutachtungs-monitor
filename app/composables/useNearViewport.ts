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
import { isRestoringScroll } from '~/utils/scrollRestore'

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

/**
 * A section of a page that asks for its content on approach — 600 px ahead,
 * so a reader scrolling at reading speed meets a list, not a skeleton
 * (`LawDiffSection` first; the Textgegenüberstellung, a Land's comparisons
 * and „Im Bundesgesetzblatt" since 12.11.2026, when a cold draft page sent
 * nine to twelve requests on mount to one single-core server, most of them
 * for sections below the fold).
 *
 * Its root must stand in the page before the answer, at its place: an
 * anchor jump or a deep link to the section scrolls to it, and the
 * observer then sees it.
 *
 * While Back or Forward puts a position back, the section asks at once
 * (`scrollRestore.ts`): the restore waits for the page to grow back to it,
 * and a section waiting for the reader would never let it. Not for the
 * Stellungnahmen's PDF tags — fifty of them asking at once is what the
 * plain `useNearViewport` is there to avoid.
 */
const SECTION_NEAR_MARGIN = '600px 0px'

export function useNearViewportSection(
  target: MaybeRefOrGetter<HTMLElement | null | undefined>,
  onNear: () => void,
  skip?: () => boolean,
) {
  useNearViewport(target, onNear, SECTION_NEAR_MARGIN, () => {
    if (skip?.()) return true
    if (!isRestoringScroll()) return false
    onNear()
    return true
  })
}
