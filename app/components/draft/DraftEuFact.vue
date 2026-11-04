<script setup lang="ts">
/**
 * One fact in the ProcedureCard: whether the draft implements EU law, which
 * act, and the act's transposition deadline beside the day the Begutachtung
 * began (docs/architecture.md §12.66).
 *
 * BARE, LIKE THE PREDECESSOR LINE ABOVE IT. No pill, no colour, no icon: the
 * box grammar of this site reads a bare line as „read this", and a coloured
 * marker would make a property of the draft look like a status of the
 * procedure. Bold lead words, the acts as links to EUR-Lex, and the two dates
 * without a verdict between them (`utils/euRecht.ts`).
 *
 * Renders nothing while the answer is out, and nothing where the draft is no
 * EU matter — most drafts are not, and a line saying so on every page would be
 * noise where it is not a finding.
 */
import type { EuRechtResponse } from '#shared/types'
import { euFactView } from '~/utils/euRecht'

const props = defineProps<{ data: EuRechtResponse | null | undefined }>()

const view = computed(() => euFactView(props.data))

/** Footnote numbers for the deadlines that have further dates. */
const notes = computed(() => {
  let n = 0
  return (view.value?.deadlines ?? []).map((d) => (d.otherDates.length ? ++n : null))
})
const SUPERSCRIPT = ['', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

/** The Vorblatt's sentence without its own full stop — the line adds one after the quote. */
const quote = computed(() => view.value?.quote?.replace(/[.\s]+$/, '') ?? null)
</script>

<template>
  <div v-if="view" class="mt-4 border-t border-hairline pt-4">
    <p class="text-sm text-ink-secondary">
      <strong class="font-semibold text-ink">{{ view.lead }}</strong><template v-if="view.attach === 'colon'">: </template><template v-else-if="view.attach === 'named'">. Im {{ view.namedIn }} genannt: </template><template v-for="(act, i) in view.acts" :key="act.url"><template v-if="i > 0">{{ i === view.acts.length - 1 ? ' und ' : ', ' }}</template><ExternalLink :href="act.url" class="link-inline">{{ act.label }}</ExternalLink></template>.
      <template v-if="quote">
        Laut Vorblatt: „{{ quote }}“.
      </template>
      <template v-if="view.deadlines.length">
        Umsetzungsfrist<template v-for="(d, i) in view.deadlines" :key="d.label"><template v-if="i > 0">,</template>{{ d.of ? ` ${d.of}` : '' }} {{ d.verb }} der {{ d.date }}<template v-if="notes[i]">{{ SUPERSCRIPT[notes[i]!] ?? `(${notes[i]})` }}</template></template><template v-if="view.start">; die Begutachtung begann am {{ view.start }}</template>.
      </template>
    </p>
    <p class="mt-1 text-xs text-ink-muted">
      <template v-for="(d, i) in view.deadlines" :key="`note-${d.label}`">
        <template v-if="notes[i]">
          {{ SUPERSCRIPT[notes[i]!] ?? `(${notes[i]})` }} Weitere Fristen{{ d.of ? ` ${d.of}` : '' }} für einzelne Bestimmungen: {{ d.otherDates.join(', ') }}.
        </template>
      </template>
      Quelle: {{ view.sourceLine }} ·
      <NuxtLink to="/so-funktionierts#eu-recht" class="link-muted">Wie wir das lesen</NuxtLink>
    </p>
  </div>
</template>
