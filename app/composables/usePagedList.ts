/**
 * How much of a client-side list stands on the page — the state behind a
 * `ListMore` (docs/architecture.md §12.24).
 *
 * `/entwuerfe` and the Stellungnahmen panel each kept a count, a slice and
 * a reset watcher per input until 03.10.2026; the panel had three watchers
 * for one rule. The rule is one: a narrower set, another segment or a new
 * order is a new first page — otherwise three matches arrive on page four of
 * the old list, i.e. as an empty list, and a re-sort keeps the middle of one
 * order open under the top of the other.
 *
 * `paged` switches the cut off without forgetting the count: uncut under a
 * search query on `/entwuerfe` (§12.15).
 */
import type { MaybeRefOrGetter, WatchSource } from 'vue'

export function usePagedList<T>(
  source: MaybeRefOrGetter<T[]>,
  step: number,
  resetOn: WatchSource[],
  paged: MaybeRefOrGetter<boolean> = true,
) {
  const visible = ref(step)
  watch(resetOn, () => {
    visible.value = step
  })

  const shown = computed(() => {
    const all = toValue(source)
    return toValue(paged) ? all.slice(0, visible.value) : all
  })

  function more(): void {
    visible.value += step
  }

  /* The pager's total is the caller's to say: on the panel it counts a set
   * that is not `source` while that is still loading. */
  function all(total: number = toValue(source).length): void {
    visible.value = total
  }

  return { visible, shown, more, all }
}
