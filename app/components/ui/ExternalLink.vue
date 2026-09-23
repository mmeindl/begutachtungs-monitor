<script setup lang="ts">
/**
 * A link that leaves the site, with the a11y contract fixed in ONE place:
 * a new window, the decorative ↗ arrow (aria-hidden) and the warning that
 * owes for it. The label comes through the slot; styling and aria-label via
 * attribute fallthrough from the caller.
 *
 * ALWAYS `target="_blank"` since 23.09.2026, and uniformly: every link that
 * leaves the site opens a tab of its own. Between 18. and 23.09.2026 the
 * opposite held — references stayed in the tab and only documents and
 * actions got a window — and the argument then was the repetition this
 * one accepts: a draft page renders roughly twenty-five of these, one on
 * every statement row, so the warning below is read two dozen times in a
 * row. That cost is real and it is the price of the rule, not an oversight.
 *
 * What does NOT change is the warning itself. A new window is a change of
 * context, and one that arrives unannounced is what WCAG 2.2 3.2.5 is about
 * and what /ueber's AAA claim reads as promising. The ↗ is `aria-hidden`, so
 * it warns nobody who cannot see it; the sr-only clause is the whole of the
 * announcement, it stays attached to `target` here, and a call site can take
 * neither without the other. That pairing is what this component is for.
 *
 * The same rule, hand-built, in the places that cannot use this component:
 * `EntryItem` (the whole row is the link), `DocumentList` and
 * `StatementDocumentTag` (they announce it inside their `aria-label`), and
 * the `UButton` call sites on the draft pages.
 */
defineProps<{
  href: string
}>()
</script>

<template>
  <a
    :href="href"
    target="_blank"
    rel="noopener"
  >
    <slot /><span aria-hidden="true"> ↗</span><span class="sr-only"> (neues Fenster)</span>
  </a>
</template>
