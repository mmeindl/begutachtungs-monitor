<script setup lang="ts">
import type { LandCode } from '#shared/types'
import type { SourceCode } from '#shared/utils/laender'
import { LAND_CODES, LAND_NAME } from '#shared/utils/laender'

/**
 * Bund · Länder — which sources the list draws from (22.10.2026), in the
 * list's own box since the same day: the box's head is where a list's
 * controls stand (`ListBox`).
 *
 * IN EVERY BOX WHOSE ROWS THE CHOICE DECIDES (30.10.2026): on the homepage
 * the open list („Stellung nehmen zu einem Entwurf") and „Zuletzt Gesetz
 * geworden" (and the ranking, with every Land dashed) — so a list that
 * reacts to the choice always shows it, and a control stands at what it
 * changes. The homepage's other doors (16.11.2026) are the Bund's and the
 * EU's alone and carry none.
 *
 * Checkboxes that ADD to the one list, not a Bund/Länder switch: the
 * question the list answers — where can I still say something, and what is
 * due first — is one question, and two lists would each show half of what
 * is urgent. The Bund is one of them since the closed Länder drafts came,
 * so a list can show one Land alone.
 *
 * THE BUND A CHIP, THE LÄNDER ONE CONTROL (25.11.2026). Ten chips in a row
 * took two lines on a phone and three times the homepage, and every further
 * level (Gemeinden) would have added to the row. The Länder now sit behind
 * one button that opens them IN PLACE, below the row — not a floating
 * popover or a listbox: what a control changes sits at it or below it, a
 * phone has no hover, and a plain group of the same `ToggleChip`s is what a
 * screen reader announces well (the /entwuerfe „Filter" button is the same
 * pattern). The closed button says what is chosen („Länder: Salzburg,
 * Wien", „Länder: 4 von 9"), so a closed control never hides a choice. What
 * it gives up: the nine names are no longer seen at a glance. The level is
 * a filter across the site's sections, never a section of its own; a
 * future level (Gemeinden) is a kind of its own, chosen by place, and does
 * not join this row.
 *
 * The open panel is edged by a rule on its left (25.11.2026): its chips
 * and the filter chips below are the same control, and without the rule
 * „Wien" read as the first filter. The rule says where the Länder end; a
 * tinted ground would have said it louder than the rest of the box.
 *
 * While a Land is chosen, the button is drawn as a ticked chip — tinted
 * ground and ink ring (26.11.2026). The ring alone read as off beside a
 * ticked „Bund". No box in it: a press opens the panel, it switches
 * nothing, and the label already says what is chosen. „keine", the
 * default, stays an outline.
 *
 * Where every Land is unavailable with one reason (the homepage ranking),
 * the button itself is drawn unavailable and opens nothing: nine dashed
 * chips behind a click would say nine times what one sentence says.
 *
 * The choice is the site's (`useSourceChoice`), so this component only
 * shows it and toggles it. What changes stands directly below: the box's
 * list — and, the choice being one, every other box that carries the chips.
 * The list is never empty by choice: turning off the last Land brings
 * the Bund back, and the Bund alone stays ticked and says why.
 *
 * No lead („Entwürfe von:"): the chips name themselves.
 */
const props = defineProps<{
  /** Per source, why it cannot join this view; absent where it can. */
  unavailable?: Partial<Record<SourceCode, string | null>>
}>()

const { chosen, laender, isLocked, toggle, setLaender } = useSourceChoice()

const LOCKED = 'Ohne andere Quelle bleibt der Bund ausgewählt'

const open = ref(false)
const panelId = useId()

/**
 * What the closed button says: none, all, the names up to a limit, else a
 * count. Two limits (25.11.2026): two names on a phone, four from `md` up,
 * where the four longest (about 450 px) still fit beside the Bund in the
 * narrowest box. Both labels are rendered and CSS shows one, so the server
 * sends the right one and nothing jumps at hydration — measuring the free
 * space would. Past four, a count reads faster than a list, and the panel
 * shows the names.
 */
function laenderLabel(maxNames: number): string {
  const n = laender.value.length
  if (n === 0) return 'keine'
  if (n === LAND_CODES.length) return 'alle'
  if (n <= maxNames) return laender.value.map((land: LandCode) => LAND_NAME[land]).join(', ')
  return `${n} von ${LAND_CODES.length}`
}
const shortLabel = computed(() => laenderLabel(2))
const longLabel = computed(() => laenderLabel(4))

/**
 * „Alle Länder", the first chip of the panel (25.11.2026): the select-all
 * box. Ticked when all nine are chosen, and then a press clears them; else a
 * press adds the rest. Some but not all chosen, its box carries a dash
 * (`mixed`, 25.11.2026): it then reads as the select-all it is, not as a
 * tenth Land that happens to be off. Not two text buttons „Alle" and „Keine" after the
 * chips (built and dropped the same day): bare words in a row of chips read
 * as two more items without a box, a disabled one as broken, and clearing
 * is one or two presses anyway.
 */
const allLaender = computed(() => laender.value.length === LAND_CODES.length)

/** The one reason when every Land is out of this view for the same one. */
const allUnavailable = computed(() => {
  const reasons = LAND_CODES.map((land) => props.unavailable?.[land] ?? null)
  return reasons.every((r) => r !== null && r === reasons[0]) ? reasons[0] : null
})
</script>

<template>
  <div role="group" aria-label="Quellen der Liste" class="flex flex-wrap items-center gap-2">
    <ToggleChip
      :pressed="chosen.includes('bund')"
      :unavailable="props.unavailable?.bund ?? null"
      :locked="isLocked('bund') ? LOCKED : null"
      @toggle="toggle('bund')"
    >
      Bund
    </ToggleChip>
    <UButton
      color="neutral"
      :variant="laender.length && !allUnavailable ? 'subtle' : 'outline'"
      class="shrink-0"
      :class="allUnavailable ? 'cursor-not-allowed outline-1 outline-dashed -outline-offset-1 outline-baseline bg-page text-ink-muted ring-0 hover:bg-page' : laender.length && 'ring-ink'"
      :aria-expanded="allUnavailable ? undefined : open"
      :aria-controls="allUnavailable ? undefined : panelId"
      :aria-disabled="allUnavailable ? true : undefined"
      :title="allUnavailable ?? undefined"
      @click="allUnavailable || (open = !open)"
    >
      <span v-if="shortLabel === longLabel">Länder: {{ shortLabel }}</span>
      <template v-else>
        <span class="md:hidden">Länder: {{ shortLabel }}</span>
        <span class="hidden md:inline">Länder: {{ longLabel }}</span>
      </template>
      <span v-if="allUnavailable" class="sr-only">({{ allUnavailable }})</span>
      <UIcon
        v-else
        name="i-lucide-chevron-down"
        class="size-4 shrink-0 text-ink-muted transition-transform"
        :class="open && 'rotate-180'"
        aria-hidden="true"
      />
    </UButton>
    <div
      v-if="open && !allUnavailable"
      :id="panelId"
      role="group"
      aria-label="Länder"
      class="flex basis-full flex-wrap items-center gap-2 border-l-2 border-baseline pl-3"
    >
      <ToggleChip :pressed="allLaender" :mixed="laender.length > 0" class="me-2" @toggle="setLaender(allLaender ? [] : LAND_CODES)">
        Alle Länder
      </ToggleChip>
      <ToggleChip
        v-for="land in LAND_CODES"
        :key="land"
        :pressed="laender.includes(land)"
        :unavailable="props.unavailable?.[land] ?? null"
        @toggle="toggle(land)"
      >
        {{ LAND_NAME[land] }}
      </ToggleChip>
    </div>
  </div>
</template>
