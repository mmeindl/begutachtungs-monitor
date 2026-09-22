<script setup lang="ts">
/**
 * A link that leaves the site, with the a11y contract fixed in ONE place:
 * the decorative ↗ arrow (aria-hidden). The label comes through the slot;
 * styling and aria-label via attribute fallthrough from the caller.
 *
 * NO `target="_blank"` since 18.09.2026, and that is the point of this
 * component now. It opened every reference in a new window without telling
 * anyone who could not see the arrow — a change of context with no warning,
 * which is what WCAG 2.2 3.2.5 is about and what /ueber's AAA claim reads
 * as promising. Announcing it was the obvious repair and the wrong one: a
 * draft page renders roughly twenty-five of these, one of them on every
 * statement row, so a screen reader would end two dozen links in a row with
 * the same clause.
 *
 * The better answer is that these links do not need a new window. They are
 * references — „Im RIS ansehen", „Auf parlament.gv.at ansehen", the source
 * notes — followed and returned from, and the back button is the natural
 * way back; browsers restore the scroll position. Whoever wants a tab
 * still has cmd- or middle-click, which is their decision rather than ours.
 *
 * Where a new window DOES earn its place it is set at the call site and
 * announced there, because there it fires once or twice rather than
 * twenty-five times: the Stellungnahme buttons (the draft has to stay open
 * beside the form) and the document links (a PDF replacing the page is not
 * a navigation anyone can reliably undo).
 */
defineProps<{
  href: string
  /**
   * Opt in to a new window, WITH the warning that owes — the pair stays
   * together here so a call site cannot take the one without the other.
   *
   * Only for links that are an action on the other side: filing a
   * Stellungnahme, where the draft has to stay readable beside the form.
   * A reference does not qualify, however official its destination.
   */
  newWindow?: boolean
}>()
</script>

<template>
  <a
    :href="href"
    :target="newWindow ? '_blank' : undefined"
    :rel="newWindow ? 'noopener' : undefined"
  >
    <slot /><span aria-hidden="true"> ↗</span><span v-if="newWindow" class="sr-only"> (neues Fenster)</span>
  </a>
</template>
