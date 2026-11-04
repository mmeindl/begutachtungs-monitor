<script setup lang="ts">
/**
 * One fact in the ProcedureCard: whether the draft implements EU law, which
 * act, and the act's transposition deadline beside the day the Begutachtung
 * began (docs/architecture.md §12.66).
 *
 * BARE, LIKE THE PREDECESSOR LINE ABOVE IT. No pill, no colour, no icon: the
 * box grammar of this site reads a bare line as „read this", and a coloured
 * marker would make a property of the draft look like a status of the
 * procedure. Bold lead words, the acts as links to EUR-Lex, and under them
 * the two dates as one row in the spine's idiom — „Umsetzungsfrist bis … ·
 * Begutachtung ab …" — with no verdict between them (`utils/euRecht.ts`).
 * A row of its own, so that a long act list (32/ME names 28) cannot bury it.
 *
 * Renders nothing while the answer is out, and nothing where the draft is no
 * EU matter — most drafts are not, and a line saying so on every page would be
 * noise where it is not a finding.
 *
 * THE DATES AS A PICTURE where the page hands over its side (`timeline`):
 * the deadline, the Begutachtung and where the procedure stands, on one
 * calendar track (`DraftEuTimeline`), labelled under the marks as the Frist
 * bar is. The row „Umsetzungsfrist bis … · Begutachtung ab …" is the text
 * form where the track cannot be drawn.
 *
 * FOLDED PAST FIVE ACTS (04.11.2026). The Elektrizitätswirtschaftsgesetz
 * (32/ME) names 28, the Vergaberechtsgesetz 24: a sentence of 28 links is
 * a wall, not a fact. The first five stand, then „Alle 28 anzeigen" in the
 * site's list idiom — all at once, never ten more. Six acts are not folded
 * to five and one.
 */
import type { EuRechtResponse } from '#shared/types'
import { euFactView, euTimeline, type EuTimelineContext } from '~/utils/euRecht'

const props = defineProps<{
  data: EuRechtResponse | null | undefined
  /** The page's side of the EU timeline; without it the dates stay a row of text. */
  timeline?: EuTimelineContext | null
}>()

const view = computed(() => euFactView(props.data))
/** The bar under the fact, where a directive's deadline and adoption day are known (`DraftEuTimeline`). */
const timeline = computed(() => (props.timeline ? euTimeline(view.value, props.timeline) : null))

const SUPERSCRIPT = ['', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

/** The Vorblatt's sentence without its own full stop — the line adds one after the quote. */
const quote = computed(() => view.value?.quote?.replace(/[.\s]+$/, '') ?? null)

const FOLD_AT = 5
const expanded = ref(false)
/** The acts the line prints: all, or the first five with the rest behind „Alle N anzeigen". */
const shownActs = computed(() => {
  const acts = view.value?.acts ?? []
  return expanded.value || acts.length <= FOLD_AT + 1 ? acts : acts.slice(0, FOLD_AT)
})
const folded = computed(() => (view.value?.acts.length ?? 0) > shownActs.value.length)
/** Whether the fact has footnotes — several deadline days, or further dates of one directive. */
const hasNotes = computed(() => (view.value?.notes.length ?? 0) > 0)
</script>

<template>
  <div v-if="view" class="mt-4 border-t border-hairline pt-4">
    <p class="text-sm text-ink-secondary">
      <strong class="font-semibold text-ink">{{ view.lead }}</strong><template v-if="view.attach === 'colon'">: </template><template v-else-if="view.attach === 'named'">. {{ view.namedIn }} genannt: </template><template v-for="(act, i) in shownActs" :key="act.url"><template v-if="i > 0">{{ i === shownActs.length - 1 && !folded ? ' und ' : ', ' }}</template><ExternalLink :href="act.url" class="link-inline">{{ act.label }}</ExternalLink></template><template v-if="folded">, … <button type="button" class="link-inline" :aria-expanded="expanded" @click="expanded = true">Alle {{ view.acts.length }} anzeigen</button></template><template v-if="view.adoptedNote">, {{ view.adoptedNote }}</template>.
      <template v-if="quote">
        Laut Vorblatt: „{{ quote }}“.
      </template>
    </p>
    <DraftEuTimeline v-if="timeline" :view="timeline" />
    <p v-else-if="view.deadlines.length" class="mt-1 text-sm text-ink-secondary">
      {{ view.deadlines.length > 1 ? 'Umsetzungsfristen' : 'Umsetzungsfrist' }}<template v-for="(d, i) in view.deadlines" :key="d.label"><template v-if="i > 0">,</template>{{ d.of && !d.note ? ` ${d.of}` : '' }} bis {{ d.date }}<template v-if="d.note">{{ SUPERSCRIPT[d.note] ?? `(${d.note})` }}</template></template><template v-if="view.start"> · Begutachtung ab {{ view.start }}</template>
    </p>
    <!-- The footnotes stay with the fact; the source stands under the card
         (`DraftEuCredits`), as every card's does. -->
    <p v-if="hasNotes" class="mt-1 text-xs text-ink-muted">
      <template v-for="n in view.notes" :key="`note-${n.number}`">
        {{ SUPERSCRIPT[n.number] ?? `(${n.number})` }} {{ n.text }}.
      </template>
    </p>
  </div>
</template>
