<script setup lang="ts">
/**
 * „Wer Rückmeldung gegeben hat" (step 4 of the EU cycle, 15.11.2026): an
 * open block under a section's frame, one per feedback window the frame
 * shows, as the Stellungnahmen stand under a draft's Begutachtung
 * (`DraftStatementsBlock`): a heading and the list, no fold (16.11.2026;
 * until then a `FoldSection` read on opening).
 *
 * READ ON APPROACH, NEVER WITH THE PAGE. The server reads five pages of the
 * portal's list at first, 2.5 s apart, so the block asks only when it comes
 * near the viewport (`useNearViewportSection`), once — a page with three
 * windows asks for each as the reader reaches it. Until then, and while the
 * answer is on its way, the loading line holds the block's place, so the
 * page does not jump much when the list arrives. A reading that failed
 * renders the gap sentence with „Erneut versuchen" beside it, which asks
 * again.
 *
 * TWO STEPS (16.11.2026): the block asks for page one of the portal's list
 * first (`?teil=erste`) and shows its rows as soon as they are in; where
 * page one is not the whole list it asks for the whole reading after it,
 * and swaps it in when it arrives (`feedbackStageOf`). The server reads no
 * page twice. Until then the list is partial (`EuFeedbackPanel`'s
 * `partial`): the rows newest first and the pager, nothing that counts,
 * filters or orders. A failed rest keeps the rows and offers „Erneut
 * versuchen" for the rest alone.
 *
 * MORE ON REQUEST (16.11.2026): where the portal counts more than was read,
 * the list offers „Weitere N lesen"; a press asks for the next step of five
 * pages (`?seiten=10`, 15, … 50) — here, with `$fetch`, one step at a time.
 * The list keeps its reading while the step is read and where it fails
 * („Erneut versuchen" asks the same step again); the step's reading is
 * swapped in when it arrives, and the live region says so once
 * (`feedbackMoreOf`, `feedbackAnnouncement`).
 *
 * What was read is the list of `EuFeedbackPanel`; this block holds the
 * states before it. Every word comes from `EU_FEEDBACK_DE`
 * (`app/utils/euFeedback.ts`); this component holds none.
 *
 * `country`: the country the page serves, threaded to the list (the
 * configured member state by default); null on a page that serves none.
 */
import type { EuRueckmeldungenResponse } from '#shared/types'
import {
  EU_FEEDBACK_COUNTRY,
  EU_FEEDBACK_DE,
  feedbackAnnouncement,
  feedbackMoreOf,
  feedbackStageOf,
  needsWholeReading,
  type EuFeedbackBlockView,
  type EuFeedbackCountry,
  type EuFeedbackMoreStatus,
} from '~/utils/euFeedback'

const props = withDefaults(defineProps<{ block: EuFeedbackBlockView; country?: EuFeedbackCountry | null }>(), { country: () => EU_FEEDBACK_COUNTRY })

const url = () => `/api/eu-recht/rueckmeldungen/${props.block.initiative}/${props.block.publication}`
// Its own key per window and per step: under a shared key Nuxt keeps the first registration's options, and two blocks would read one window.
const first = useLazyFetch<EuRueckmeldungenResponse>(url, {
  key: `eu-rueckmeldungen-${props.block.initiative}-${props.block.publication}-erste`,
  query: { teil: 'erste' },
  server: false,
  immediate: false,
})
const whole = useLazyFetch<EuRueckmeldungenResponse>(url, {
  key: `eu-rueckmeldungen-${props.block.initiative}-${props.block.publication}-ganz`,
  server: false,
  immediate: false,
})

const root = useTemplateRef<HTMLElement>('root')
useNearViewportSection(root, () => void first.execute(), () => first.status.value !== 'idle')

/* The latest further step that arrived, and where the one asked last stands. Not `useLazyFetch`: its query changes per press, and a watched query would ask on its own. */
const further = shallowRef<EuRueckmeldungenResponse | null>(null)
const moreStatus = ref<EuFeedbackMoreStatus>('idle')

const stage = computed(() => feedbackStageOf(
  { status: first.status.value, data: first.data.value },
  { status: whole.status.value, data: whole.data.value },
  further.value,
))
// Page one in and partial: the rest, once. „Erneut versuchen" under a failed rest asks it again (`retry`).
watch(stage, (s) => {
  if (needsWholeReading(s, whole.status.value)) void whole.execute()
}, { immediate: true })

/** „Erneut versuchen": page one failed → page one again; the rest failed → the rest alone. */
function retry() {
  void (stage.value.kind === 'partial' ? whole.execute() : first.execute())
}

/** „Weitere N lesen" and „Erneut versuchen" under it: step `pages`, once at a time. A failed answer keeps the reading the list has. */
async function readMore(pages: number) {
  if (moreStatus.value === 'pending') return
  moreStatus.value = 'pending'
  try {
    const answer = await $fetch<EuRueckmeldungenResponse>(url(), { query: { seiten: pages } })
    if (answer.state !== 'gelesen') throw new Error('ungelesen')
    further.value = answer
    moreStatus.value = 'idle'
  } catch {
    moreStatus.value = 'error'
  }
}

const more = computed(() => (stage.value.kind === 'complete' ? feedbackMoreOf(stage.value.reading, stage.value.pages, moreStatus.value) : null))

/** What the live region says: the loading line, that the rest is still read, the arrival, or a gap sentence; nothing before the block is reached. */
const announcement = computed(() => (first.status.value === 'idle' ? '' : feedbackAnnouncement(stage.value, moreStatus.value)))
</script>

<template>
  <div ref="root">
    <PageSubsection :heading="block.heading">
      <!-- A short status, polite: the reading takes seconds, and its arrival is news, not an alarm. The list itself is not announced — it can hold hundreds of names; its set line speaks once a reader filters it. -->
      <p class="sr-only" aria-live="polite">{{ announcement }}</p>
      <p v-if="stage.kind === 'waiting'" class="flex min-h-32 items-start gap-2.5 text-sm text-ink-secondary">
        <span class="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-accent" aria-hidden="true" />
        <span>{{ EU_FEEDBACK_DE.loading }}</span>
      </p>
      <div v-else-if="stage.kind === 'unread'" class="flex flex-wrap items-center gap-3">
        <GapNote :text="EU_FEEDBACK_DE.unread" class="text-sm text-ink-secondary" />
        <UButton color="primary" @click="retry()">{{ EU_FEEDBACK_DE.retry }}</UButton>
      </div>
      <EuFeedbackPanel
        v-else
        :reading="stage.reading"
        :country="country"
        :partial="stage.kind === 'partial' ? { restFailed: stage.restFailed } : null"
        :more-row="more"
        @retry="retry()"
        @more="readMore"
      />
    </PageSubsection>
  </div>
</template>
