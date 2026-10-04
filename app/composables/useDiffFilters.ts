/**
 * What a reader does to a comparison section's list: the search, the kinds
 * of change switched off in the legend, the open/closed state of the groups,
 * and how much of a long group is printed before the reader asks for the
 * rest.
 *
 * Both sections had this verbatim, and it stays specific to them: one law
 * (or one Artikel of the package) per group, everything closed until asked,
 * and a running search opens every group — then the reader has named what
 * they are looking for, and hunting for the group that holds the hits is
 * work the page can do for them.
 *
 * Why closed by default (08.09.2026): the header row IS the survey — law
 * name plus the count pills — and a single law is no guarantee of a short
 * page; 58/ME is one law with 413 units. Nothing opens unasked.
 *
 * The search and the hidden kinds joined on 04.10.2026: both sections
 * declared them, and `folding`, identically, and each half of the state
 * only means something with the other.
 *
 * `folding`: searching IS the reader asking for specific units — then
 * nothing gets folded away behind a context line that says only how many
 * there were, and an unchanged hit gets a block of its own.
 */
import type { DiffBadge } from '~/utils/diffBadges'

/** Changes rendered before the "show the rest" line. 74/ME has 366 of them. */
const SHOWN_CHANGES = 30

export function useDiffFilters() {
  const query = ref('')
  const hiddenKinds = ref<DiffBadge[]>([])
  const folding = computed(() => !query.value.trim())

  const openGroups = ref<Set<string>>(new Set())
  const fullyShown = ref<Set<string>>(new Set())

  function toggleGroup(key: string) {
    const next = new Set(openGroups.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    openGroups.value = next
  }

  function groupOpen(key: string): boolean {
    return openGroups.value.has(key) || query.value.trim().length > 0
  }

  function showAll(key: string) {
    fullyShown.value = new Set(fullyShown.value).add(key)
  }

  /** How many changes this group still prints — everything, once asked. */
  function limitFor(key: string): number {
    return fullyShown.value.has(key) ? Number.POSITIVE_INFINITY : SHOWN_CHANGES
  }

  return { query, hiddenKinds, folding, toggleGroup, groupOpen, showAll, limitFor }
}
