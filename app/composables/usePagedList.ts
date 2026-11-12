/**
 * How much of a client-side list stands on the page — the state behind a
 * `ListMore`.
 *
 * `/entwuerfe` and the Stellungnahmen panel each kept a count, a slice and
 * a reset watcher per input until 03.10.2026; the panel had three watchers
 * for one rule. The rule is one: a narrower set, another segment or a new
 * order is a new first page — otherwise three matches arrive on page four of
 * the old list, i.e. as an empty list, and a re-sort keeps the middle of one
 * order open under the top of the other.
 *
 * NO `paged` SWITCH since 12.11.2026. It existed to leave `/entwuerfe` uncut
 * under a search query; typing „S", „St", „Str" then put hundreds of rows on
 * the page per settled step. A query is a new first page like any other
 * filter now (`resetOn`), with the same pager.
 *
 * „ALLE" STAYS ALL (12.11.2026): `all()` without a total opens the list to
 * its end however long it grows — `/entwuerfe` grows once per page load,
 * when a late half sorts its rows in, and an opened „Alle" pinned to the
 * old length would close behind the reader. `visible` is then `Infinity`,
 * which `ListMore` reads as „everything shown". With a total the count is
 * the caller's (the panel counts a set that is not `source` while that is
 * still loading).
 *
 * The cut that keeps shown rows when a late half sorts in is pure and lives
 * in `app/utils/pagedList.ts` (`cutKeeping`), where vitest reaches it; the
 * composable itself runs on Nuxt's auto-imports.
 */
import type { MaybeRefOrGetter, WatchSource } from 'vue'

export function usePagedList<T>(
  source: MaybeRefOrGetter<T[]>,
  step: number,
  resetOn: WatchSource[],
) {
  const visible = ref(step)
  watch(resetOn, () => {
    visible.value = step
  })

  const shown = computed(() => toValue(source).slice(0, visible.value))

  function more(): void {
    visible.value += step
  }

  function all(total: number = Infinity): void {
    visible.value = total
  }

  return { visible, shown, more, all }
}
