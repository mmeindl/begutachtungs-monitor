/**
 * The reversible order of a list (`SortHeader`, 06.11.2026): one column
 * orders, in its own direction or turned round.
 *
 * A click on the column that orders turns it round; a click on another
 * starts that one in its own direction — every list the same, so this lives
 * once. The refs are the caller's: `/entwuerfe` keeps them in its URL
 * filters, the panels in their own state.
 *
 * `selectValue` is the phone's select, where no header is drawn: one option
 * per column and direction, „frist" and „frist:umgekehrt".
 */
export function useReversibleSort<K extends string>(sort: Ref<K>, reversed: Ref<boolean>) {
  function choose(key: K) {
    if (sort.value === key) {
      reversed.value = !reversed.value
      return
    }
    sort.value = key
    reversed.value = false
  }

  const selectValue = computed({
    get: () => (reversed.value ? `${sort.value}${REVERSED_SUFFIX}` : sort.value),
    set: (v: string) => {
      reversed.value = v.endsWith(REVERSED_SUFFIX)
      sort.value = v.replace(REVERSED_SUFFIX, '') as K
    },
  })

  return { choose, selectValue }
}

const REVERSED_SUFFIX = ':umgekehrt'

/** The select's option value for a column turned round. */
export function reversedOption(key: string): string {
  return `${key}${REVERSED_SUFFIX}`
}
