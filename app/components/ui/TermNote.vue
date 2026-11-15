<script setup lang="ts">
/**
 * A tag that opens its definition in place, below its row (14.11.2026):
 * „redaktionell", „nicht gezählt", „kurz". The reader meets the word at the
 * tag, so the definition is there too, not on a method page. The help-text
 * rule in docs/decisions.md: no tooltip, no (i) icon, no `title`.
 *
 * Usage: a direct child of a `flex flex-wrap` row (a block container works
 * too, it stacks). The default slot is the visible tag, typically a pill;
 * `term` picks its definition from `app/utils/terms.ts`, or a `#note` slot
 * brings richer content and styles it itself (`SectionCredits`' „Methode").
 *
 * TWO ELEMENTS, NOT ONE <details>. The definition has to take the whole row
 * width beneath the row, but a <details> in a row of pills is only as wide as
 * its pill, and its content would open inside that box — a column of one
 * word per line. So the <details> holds the summary alone, and the note is
 * its next sibling, shown by CSS while the <details> is open (`[open]+`).
 * `basis-full` puts it on a line of its own, `order-last` after everything
 * else in the row, so the row above it never moves. Still native: no
 * hydration, keyboard by the browser, the summary's expanded state read out
 * by a screen reader, which reaches the note next in the reading order.
 * What it gives up: find-in-page does not open it, since the note is not
 * inside the <details>. A definition is not what anyone searches for.
 *
 * The target: the summary carries the target height (`min-h-target`) and
 * cancels it in the layout with `-my-2`, as `tap-target` does for links, so
 * a pill row keeps its height while the hit area meets the house rule. The
 * chevron AFTER the tag, unlike `Disclosure`: the tag is the row's first
 * word and stays aligned with the text under it; the chevron is the
 * affordance, muted.
 *
 * THE RULE ON THE LEFT (15.11.2026). Open help text stood bare under its
 * row and read as the section's own content, with no edge where it ended.
 * A 4 px rule in `baseline` grey with an indent sets it apart. That is the
 * GOV.UK „Details" pattern, chosen over a hairline frame because a frame
 * means "facts to consult" (FactList `frame`) and the note often opens right
 * under one, and over an (i) icon, which would say nothing the rule doesn't.
 * 4 px, not 2: the diff gutters and the caveat list use 2 px, so the help
 * reads as its own thing next to them. The rule is on an inner box so the
 * spacing around it stays outside the rule.
 */
import { TERMS, type TermKey } from '~/utils/terms'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  /** The definition to open; omit it and give `#note` instead. */
  term?: TermKey
}>()

const entry = computed(() => (props.term ? TERMS[props.term] : null))
</script>

<template>
  <details class="group inline-block" v-bind="$attrs">
    <summary
      class="-mx-1 -my-2 inline-flex min-h-target cursor-pointer list-none items-center gap-1 rounded px-1 py-2 hover:bg-hover [&::-webkit-details-marker]:hidden"
    >
      <slot>{{ entry?.label }}</slot>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-3.5 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
        aria-hidden="true"
      />
    </summary>
  </details>
  <div class="order-last mt-1 hidden w-full basis-full pb-2 [[open]+&]:block">
    <div class="border-l-4 border-baseline pl-4">
      <slot name="note">
        <p v-if="entry" class="max-w-prose hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ entry.definition }}</p>
      </slot>
    </div>
  </div>
</template>
