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
 * so a list of facts reads like stations, in a style the page already has.
 * The forms before it each added a style: a label column read as a form,
 * small uppercase labels were a third heading style between the section's
 * h2 and its h3, and bold values read as one more heading, because on this
 * page semibold is what headings wear. A fact may carry more under its
 * line through the slot `after-<key>` — a bar, typically.
 *
 * Only what the section shows nowhere else: a count the list below states
 * already does not belong here. A fact whose value carries a link fills the
 * slot `value-<key>`.
 *
 * The facts stand in an unfilled hairline frame (03.10.2026), and every
 * station section of the draft page opens with one — the section's state
 * and its facts, before any comparison or list. The pages box by what the reader
 * does with a thing: the accent-washed box is the door you act on, the
 * white card the instrument you operate (the rail, the comparison, the
 * statement tables), the frame the facts you consult, and prose you read
 * stands bare, its caption attached by proximity. Facts are delimited so
 * the credit line under them has an object; they are not filled, because
 * the white surface belongs to what you work with. The frame replaced the
 * white station card of 01.10.2026, which gave facts the instruments'
 * surface and so made the two look alike. Transparent, it leaves the
 * page as the ground the FristBar's page-coloured ring cuts against.
 * Always framed since 04.10.2026: every caller passed `frame`, so the bare
 * form it switched off was a second layout nobody rendered.
 *
 * No footer (02.10.2026). Its one user put „Verlauf auf parlament.gv.at"
 * inside the box under a hairline, while every other box on the page says
 * where it comes from and what leads on below itself, in the credit line.
 * Inside a box stands its content, and its provenance stands under it.
 */
export interface Fact {
  key: string
  /** A name over the fact, in the rail's station style: the rows read like
   *  the rail's stations — name, then the fact under it. */
  title?: string
  /** Optional where the slot `value-<key>` carries the value. */
  text?: string
}

defineProps<{
  facts: readonly Fact[]
}>()
</script>

<template>
  <div class="rounded-xl border border-hairline px-4">
    <ul role="list" class="flex flex-col divide-y divide-hairline text-sm text-ink">
      <li v-for="fact in facts" :key="fact.key" class="py-4">
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
