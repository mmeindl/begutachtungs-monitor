<script setup lang="ts">
/**
 * „Wer Rückmeldung gegeben hat" (step 4 of the EU cycle, 15.11.2026): a
 * fold under a section's frame, one per feedback window the frame shows,
 * in the grammar of the section's record fold („Alle gelesenen Schritte").
 *
 * READ ON DEMAND, NEVER WITH THE PAGE. The server reads up to five pages of
 * the portal's list, 2.5 s apart, so the page asks only when a reader opens
 * the fold, once; a reading that failed is asked again on the next
 * opening. What it opens stands below it, nothing above moves.
 *
 * What was read is the list of `EuFeedbackPanel`; this fold holds the
 * states before it — loading, and the gap sentence where the portal could
 * not be read. Every word comes from `EU_FEEDBACK_DE`
 * (`app/utils/euFeedback.ts`); this component holds none.
 *
 * `country`: the country the page serves, threaded to the list (the
 * configured member state by default); null on a page that serves none.
 */
import type { EuRueckmeldungenResponse } from '#shared/types'
import { EU_FEEDBACK_COUNTRY, EU_FEEDBACK_DE, type EuFeedbackCountry, type EuFeedbackFoldView } from '~/utils/euFeedback'

const props = withDefaults(defineProps<{ fold: EuFeedbackFoldView; country?: EuFeedbackCountry | null }>(), { country: () => EU_FEEDBACK_COUNTRY })

// Its own key per window: under a shared key Nuxt keeps the first registration's options, and two folds would read one window.
const { data, status, execute } = useLazyFetch<EuRueckmeldungenResponse>(
  () => `/api/eu-recht/rueckmeldungen/${props.fold.initiative}/${props.fold.publication}`,
  { key: `eu-rueckmeldungen-${props.fold.initiative}-${props.fold.publication}`, server: false, immediate: false },
)

const unread = computed(() => status.value === 'error' || (status.value === 'success' && data.value?.state === 'ungelesen'))
const reading = computed(() => (status.value === 'success' && data.value?.state === 'gelesen' ? data.value.reading : null))

/** What the live region says: the loading line, the reading's arrival, or the gap sentence; nothing before the fold is opened. */
const announcement = computed(() => {
  if (status.value === 'pending') return EU_FEEDBACK_DE.loading
  if (unread.value) return EU_FEEDBACK_DE.unread
  if (reading.value) return EU_FEEDBACK_DE.read
  return ''
})

function onToggle(open: boolean) {
  if (!open || status.value === 'pending') return
  if (status.value === 'idle' || unread.value) void execute()
}
</script>

<template>
  <FoldSection :heading="fold.heading" @toggle="onToggle">
    <div class="pb-2">
      <!-- A short status, polite: the reading takes seconds, and its arrival is news, not an alarm. The list itself is not announced — it can hold hundreds of names; its set line speaks once a reader filters it. -->
      <p class="sr-only" aria-live="polite">{{ announcement }}</p>
      <div v-if="status === 'pending' || status === 'idle'" class="py-3 text-sm text-ink-secondary">
        <p class="flex items-center gap-2.5">
          <span class="size-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-accent" aria-hidden="true" />
          <span>{{ EU_FEEDBACK_DE.loading }}</span>
        </p>
        <p class="mt-1 text-ink-muted">{{ EU_FEEDBACK_DE.loadingNote }}</p>
      </div>
      <GapNote v-else-if="unread" :text="EU_FEEDBACK_DE.unread" class="py-3 text-sm text-ink-secondary" />
      <EuFeedbackPanel v-else-if="reading" :reading="reading" :country="country" />
    </div>
  </FoldSection>
</template>
