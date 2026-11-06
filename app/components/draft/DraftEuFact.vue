<script setup lang="ts">
/**
 * One fact in the ProcedureCard: whether the draft implements EU law, which
 * act, and the act's transposition deadline beside the day the Begutachtung
 * began (docs/architecture.md §12.66).
 *
 * BARE, LIKE THE PREDECESSOR LINE ABOVE IT. No pill, no colour, no icon: the
 * box grammar of this site reads a bare line as „read this", and a coloured
 * marker would make a property of the draft look like a status of the
 * procedure. Bold lead words, the acts as links — to the act's page where
 * the map has one, as the site links what it has a page for (the Ressort to
 * its list, a predecessor to its draft; 06.11.2026), to EUR-Lex where it
 * has none, the act page carrying EUR-Lex in its head — and under them
 * the two dates as one row in the spine's idiom — „Umsetzungsfrist bis … ·
 * Begutachtung ab …" — with no verdict between them (`utils/euRecht.ts`).
 * A row of its own, so that a long act list (32/ME names 28) cannot bury it.
 *
 * Renders nothing while the answer is out, and nothing where the draft is no
 * EU matter — most drafts are not, and a line saying so on every page would be
 * noise where it is not a finding.
 *
 * THE DATES AS A PICTURE where the page hands over its side (`timeline`):
 * the act page's chart with this draft as its one lane (`EuTimelineChart`)
 * — the Umsetzungsfristen over the line, each with its act's number where
 * the sentence names several, the Begutachtung and where the procedure
 * stands under it. The row „Umsetzungsfrist bis … ·
 * Begutachtung ab …" is the text form where the track cannot be drawn.
 *
 * FOLDED PAST FIVE ACTS (04.11.2026). The Elektrizitätswirtschaftsgesetz
 * (32/ME) names 28, the Vergaberechtsgesetz 24: a sentence of 28 links is
 * a wall, not a fact. The first five stand, then „Alle 28 anzeigen" in the
 * site's list idiom — all at once, never ten more. Six acts are not folded
 * to five and one.
 *
 * ONE ACT IS A SENTENCE, SEVERAL ARE A LIST (06.11.2026): from two acts on,
 * one act per row, which a reader scans where a comma sentence of long
 * citations has to be parsed — and the fold becomes the list's footer.
 *
 * THE WAY TO THE MAP (§12.66, Nachtrag 3): an act the map has a page for
 * links there, and where other drafts of the window implement it too, the
 * count stands at the act — „· 1 weiterer Entwurf des Bundes und 3 der
 * Länder" (`euOtherDrafts`). Plain text: the act is already the link to
 * that page, and a second link to it was what the lines under the list
 * were until 06.11.2026.
 */
import type { EuRechtResponse } from '#shared/types'
import { euFactView, euOtherDrafts, euTimeline, type EuTimelineContext } from '~/utils/euRecht'

const props = defineProps<{
  data: EuRechtResponse | null | undefined
  /** The page's side of the EU timeline; without it the dates stay a row of text. */
  timeline?: EuTimelineContext | null
}>()

const view = computed(() => euFactView(props.data))
/** The chart under the fact, where a directive's deadline is known (`EuTimelineChart`). */
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
/** Several acts are a list, one act a sentence. */
const asList = computed(() => (view.value?.acts.length ?? 0) > 1)
/** „1 weiterer Entwurf des Bundes und 3 der Länder" per act, where the map knows others. */
const others = computed(() => euOtherDrafts(props.data?.related))
/** The monitor's page per act, where the map has one (`related` carries every act with a page). */
const pageOf = computed(() => new Map((props.data?.related ?? []).map((r) => [r.celex, r.path])))
/** Whether the fact has footnotes — a directive with further partial deadlines. */
const hasNotes = computed(() => (view.value?.notes.length ?? 0) > 0)
</script>

<template>
  <div v-if="view" class="mt-4 border-t border-hairline pt-4">
    <template v-if="asList">
      <p class="text-sm text-ink-secondary">
        <strong class="font-semibold text-ink">{{ view.lead }}</strong><template v-if="view.attach === 'named'">. {{ view.namedIn }} genannt</template>:
      </p>
      <ul class="mt-1 space-y-1 text-sm text-ink-secondary">
        <li v-for="act in shownActs" :key="act.url">
          <NuxtLink v-if="pageOf.get(act.celex)" :to="pageOf.get(act.celex)!" class="link-inline">{{ act.label }}</NuxtLink><ExternalLink v-else :href="act.url" class="link-inline">{{ act.label }}</ExternalLink><span v-if="others.get(act.celex)" class="text-ink-muted"> · {{ others.get(act.celex) }}</span>
        </li>
      </ul>
      <button v-if="folded" type="button" class="link-inline mt-1 text-sm" :aria-expanded="expanded" @click="expanded = true">
        Alle {{ view.acts.length }} anzeigen
      </button>
      <p v-if="quote" class="mt-1 text-sm text-ink-secondary">
        Laut Vorblatt: „{{ quote }}“.
      </p>
    </template>
    <p v-else class="text-sm text-ink-secondary">
      <strong class="font-semibold text-ink">{{ view.lead }}</strong><template v-if="view.attach === 'colon'">: </template><template v-else-if="view.attach === 'named'">. {{ view.namedIn }} genannt: </template><template v-for="act in shownActs" :key="act.url"><NuxtLink v-if="pageOf.get(act.celex)" :to="pageOf.get(act.celex)!" class="link-inline">{{ act.label }}</NuxtLink><ExternalLink v-else :href="act.url" class="link-inline">{{ act.label }}</ExternalLink><template v-if="view.adoptedNote">, {{ view.adoptedNote }}</template><span v-if="others.get(act.celex)" class="text-ink-muted"> · {{ others.get(act.celex) }}</span></template>.
      <template v-if="quote">
        Laut Vorblatt: „{{ quote }}“.
      </template>
    </p>
    <EuTimelineChart v-if="timeline" :chart="timeline" class="mt-4" />
    <p v-else-if="view.deadlines.length" class="mt-1 text-sm text-ink-secondary">
      {{ view.deadlines.length > 1 ? 'Umsetzungsfristen' : 'Umsetzungsfrist' }}<template v-for="(d, i) in view.deadlines" :key="d.label"><template v-if="i > 0">,</template><template v-if="d.number"> {{ d.number }}</template> bis {{ d.date }}<template v-if="d.note">{{ SUPERSCRIPT[d.note] ?? `(${d.note})` }}</template></template><template v-if="view.start"> · Begutachtung ab {{ view.start }}</template>
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
