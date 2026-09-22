/**
 * The open/closed state of the groups in a comparison section, and how much
 * of a long group is printed before the reader asks for the rest.
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
 */
import type { Ref } from 'vue'

/** Changes rendered before the "show the rest" line. 74/ME has 366 of them. */
const SHOWN_CHANGES = 30

export function useFoldedGroups(query: Ref<string>) {
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

  return { openGroups, toggleGroup, groupOpen, fullyShown, showAll, limitFor }
}
