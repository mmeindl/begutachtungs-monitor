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
 * Every word comes from `euFeedbackView` and `EU_FEEDBACK_DE`
 * (`app/utils/euFeedback.ts`); this component holds none.
 */
import type { EuRueckmeldungenResponse } from '#shared/types'
import { EU_FEEDBACK_DE, euFeedbackView, type EuFeedbackFoldView } from '~/utils/euFeedback'

const props = defineProps<{ fold: EuFeedbackFoldView }>()

// Its own key per window: under a shared key Nuxt keeps the first registration's options, and two folds would read one window.
const { data, status, execute } = useLazyFetch<EuRueckmeldungenResponse>(
  () => `/api/eu-recht/rueckmeldungen/${props.fold.initiative}/${props.fold.publication}`,
  { key: `eu-rueckmeldungen-${props.fold.initiative}-${props.fold.publication}`, server: false, immediate: false },
)

const unread = computed(() => status.value === 'error' || (status.value === 'success' && data.value?.state === 'ungelesen'))
const view = computed(() => (status.value === 'success' && data.value?.state === 'gelesen' ? euFeedbackView(data.value.reading) : null))

/** What the live region says: the loading line, the reading's arrival, or the gap sentence; nothing before the fold is opened. */
const announcement = computed(() => {
  if (status.value === 'pending') return EU_FEEDBACK_DE.loading
  if (unread.value) return EU_FEEDBACK_DE.unread
  if (view.value) return EU_FEEDBACK_DE.read
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
      <!-- A short status, polite: the reading takes seconds, and its arrival is news, not an alarm. The list itself is not announced — it can hold hundreds of names. -->
      <p class="sr-only" aria-live="polite">{{ announcement }}</p>
      <div v-if="status === 'pending' || status === 'idle'" class="py-3 text-sm text-ink-secondary">
        <p class="flex items-center gap-2.5">
          <span class="size-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-accent" aria-hidden="true" />
          <span>{{ EU_FEEDBACK_DE.loading }}</span>
        </p>
        <p class="mt-1 text-ink-muted">{{ EU_FEEDBACK_DE.loadingNote }}</p>
      </div>
      <GapNote v-else-if="unread" :text="EU_FEEDBACK_DE.unread" class="py-3 text-sm text-ink-secondary" />
      <template v-else-if="view">
        <p v-if="view.empty" class="py-3 text-sm text-ink-secondary">{{ view.empty }}</p>
        <ListBox v-else-if="view.lines.length">
          <ul role="list" class="divide-y divide-hairline text-sm">
            <li v-for="line in view.lines" :key="line.key" class="px-4 py-3">
              <p class="text-ink">
                <span class="font-medium">{{ line.label }}</span>: <span class="tabular-nums">{{ line.count }}</span>
              </p>
              <ul v-if="line.names.length" role="list" class="mt-2 space-y-1 text-ink sm:columns-2 sm:gap-x-6">
                <li v-for="n in line.names" :key="n.key" class="break-inside-avoid">
                  {{ n.name }}<span v-if="n.countries" class="text-ink-muted"> ({{ n.countries }})</span><span v-if="n.repeated" class="text-ink-muted">, {{ n.repeated }}</span>
                </li>
              </ul>
              <p v-if="line.note" class="mt-1 text-ink-secondary">{{ line.note }}</p>
            </li>
          </ul>
        </ListBox>
        <p v-if="view.cap" class="mt-3 text-sm text-ink-secondary">{{ view.cap }}</p>
        <p v-if="view.unpublished" class="mt-3 text-sm text-ink-secondary">{{ view.unpublished }}</p>
        <p v-if="view.unnamedReason" class="mt-3 text-sm text-ink-secondary">{{ view.unnamedReason }}</p>
      </template>
    </div>
  </FoldSection>
</template>
