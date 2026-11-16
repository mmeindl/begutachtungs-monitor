<script setup lang="ts">
/**
 * „Wer Rückmeldung gegeben hat" (step 4 of the EU cycle, 15.11.2026): an
 * open block under a section's frame, one per feedback window the frame
 * shows, as the Stellungnahmen stand under a draft's Begutachtung
 * (`DraftStatementsBlock`): a heading and the list, no fold (16.11.2026;
 * until then a `FoldSection` read on opening).
 *
 * READ ON APPROACH, NEVER WITH THE PAGE. The server reads up to five pages
 * of the portal's list, 2.5 s apart, so the block asks only when it comes
 * near the viewport (`useNearViewportSection`), once — a page with three
 * windows asks for each as the reader reaches it. Until then, and while the
 * answer is on its way, the loading line holds the block's place, so the
 * page does not jump much when the list arrives. A reading that failed
 * renders the gap sentence with „Erneut versuchen" beside it, which asks
 * again.
 *
 * What was read is the list of `EuFeedbackPanel`; this block holds the
 * states before it. Every word comes from `EU_FEEDBACK_DE`
 * (`app/utils/euFeedback.ts`); this component holds none.
 *
 * `country`: the country the page serves, threaded to the list (the
 * configured member state by default); null on a page that serves none.
 */
import type { EuRueckmeldungenResponse } from '#shared/types'
import { EU_FEEDBACK_COUNTRY, EU_FEEDBACK_DE, type EuFeedbackBlockView, type EuFeedbackCountry } from '~/utils/euFeedback'

const props = withDefaults(defineProps<{ block: EuFeedbackBlockView; country?: EuFeedbackCountry | null }>(), { country: () => EU_FEEDBACK_COUNTRY })

// Its own key per window: under a shared key Nuxt keeps the first registration's options, and two blocks would read one window.
const { data, status, execute } = useLazyFetch<EuRueckmeldungenResponse>(
  () => `/api/eu-recht/rueckmeldungen/${props.block.initiative}/${props.block.publication}`,
  { key: `eu-rueckmeldungen-${props.block.initiative}-${props.block.publication}`, server: false, immediate: false },
)

const root = useTemplateRef<HTMLElement>('root')
useNearViewportSection(root, () => void execute(), () => status.value !== 'idle')

const unread = computed(() => status.value === 'error' || (status.value === 'success' && data.value?.state === 'ungelesen'))
const reading = computed(() => (status.value === 'success' && data.value?.state === 'gelesen' ? data.value.reading : null))

/** What the live region says: the loading line, the reading's arrival, or the gap sentence; nothing before the block is reached. */
const announcement = computed(() => {
  if (status.value === 'pending') return EU_FEEDBACK_DE.loading
  if (unread.value) return EU_FEEDBACK_DE.unread
  if (reading.value) return EU_FEEDBACK_DE.read
  return ''
})
</script>

<template>
  <div ref="root">
    <PageSubsection :heading="block.heading">
      <!-- A short status, polite: the reading takes seconds, and its arrival is news, not an alarm. The list itself is not announced — it can hold hundreds of names; its set line speaks once a reader filters it. -->
      <p class="sr-only" aria-live="polite">{{ announcement }}</p>
      <p v-if="status === 'pending' || status === 'idle'" class="flex min-h-32 items-start gap-2.5 text-sm text-ink-secondary">
        <span class="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-accent" aria-hidden="true" />
        <span>{{ EU_FEEDBACK_DE.loading }}</span>
      </p>
      <div v-else-if="unread" class="flex flex-wrap items-center gap-3">
        <GapNote :text="EU_FEEDBACK_DE.unread" class="text-sm text-ink-secondary" />
        <UButton color="primary" @click="execute()">{{ EU_FEEDBACK_DE.retry }}</UButton>
      </div>
      <EuFeedbackPanel v-else-if="reading" :reading="reading" :country="country" />
    </PageSubsection>
  </div>
</template>
