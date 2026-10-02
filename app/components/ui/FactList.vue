<script setup lang="ts">
/**
 * Facts that differ from draft to draft, one per line, the value first —
 * not as a sentence (01.10.2026). In prose the date stood wherever the
 * sentence put it, and the sentence changed shape with every draft (a
 * comparison here, none there, a ministry name of any length), so the eye
 * found no place to look.
 *
 * Each fact in the rail's grammar: a name in the station style
 * („Begutachtungsfrist", „Übermittelt"), the fact under it in plain ink —
 * so a card of facts reads like stations, in a style the page already has.
 * The forms before it each added a style: a label column read as a form,
 * small uppercase labels were a third heading style between the section's
 * h2 and its h3, and bold values read as one more heading, because on this
 * page semibold is what headings wear. A fact may carry more under its
 * line through the slot `after-<key>` — a bar, typically.
 *
 * Only what the section shows nowhere else: a count the list below states
 * already does not belong here.
 *
 * `card` is the station card (01.10.2026): every station section of the
 * draft page opens with one — the section's state and its facts, before
 * any comparison or list. Neutral on purpose: the page has three kinds of
 * box (the rail, the door that asks for action, and these), and only the
 * door wears a colour. A fact whose value carries a link fills the slot
 * `value-<key>`.
 *
 * No footer (02.10.2026). Its one user put „Verlauf auf parlament.gv.at"
 * inside the card under a hairline, while every other box on the page says
 * where it comes from and what leads on below itself, in the credit line.
 * Inside a box stands its content, and its provenance stands under it.
 */
export interface Fact {
  key: string
  /** A name over the fact, in the rail's station style: the card's rows
   *  read like the rail's stations — name, then the fact under it. */
  title?: string
  /** Optional where the slot `value-<key>` carries the value. */
  text?: string
}

defineProps<{
  facts: readonly Fact[]
  /** Hairlines between the facts instead of space — for a list on a card,
   *  where the facts are one object's parts. */
  divided?: boolean
  /** The station card: surface, hairline, divided rows. */
  card?: boolean
}>()
</script>

<template>
  <div
    :class="card ? 'rounded-xl border border-hairline bg-surface px-4 [--frist-cut:var(--color-surface)]' : ''"
  >
    <ul
      role="list"
      class="flex flex-col text-sm text-ink"
      :class="divided || card ? 'divide-y divide-hairline' : 'gap-4'"
    >
      <li v-for="fact in facts" :key="fact.key" :class="divided || card ? 'py-4' : ''">
        <p v-if="fact.title" class="font-medium text-ink">{{ fact.title }}</p>
        <div v-if="$slots[`value-${fact.key}`]" :class="fact.title ? 'mt-0.5' : ''">
          <slot :name="`value-${fact.key}`" />
        </div>
        <p v-else-if="fact.text" :class="fact.title ? 'mt-0.5' : ''">{{ fact.text }}</p>
        <slot :name="`after-${fact.key}`" />
      </li>
    </ul>
  </div>
</template>
