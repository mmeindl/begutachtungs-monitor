<script setup lang="ts">
/**
 * „Wer Rückmeldung gegeben hat" (step 4 of the EU cycle, 15.11.2026): an
 * open block under a section's frame, one per feedback window the frame
 * shows, as the Stellungnahmen stand under a draft's Begutachtung
 * (`DraftStatementsBlock`): a heading and the list, no fold (16.11.2026;
 * until then a `FoldSection` read on opening).
 *
 * READ ON APPROACH, NEVER WITH THE PAGE. The server reads up to five
 * pages of the portal's list per request, 2.5 s apart, so the block asks
 * only when it comes near the viewport (`useNearViewportSection`), once — a
 * page with three windows asks for each as the reader reaches it. Until
 * then, and while page one is on its way, the list's frame holds the
 * block's place — the box with its column header and the loading line
 * where the rows will be (`ListBoxState`, 16.11.2026: a list shows its
 * frame while loading). A page one that failed puts the gap sentence with
 * „Erneut versuchen" there, which asks again.
 *
 * THE AUTOMATIC READING, TO 1,000 (16.11.2026): the block asks for page
 * one of the portal's list first (`?teil=erste`) and shows its rows as soon
 * as they are in; where page one is not the whole list it asks for the
 * first step (`?seiten=5`, the newest 500) and, where more are counted,
 * for the second (`?seiten=10`, the newest 1,000) by itself, one after the
 * other (`nextAutomaticStep`) — each one request of at most five pages
 * on the server, which reads no page twice. Until the automatic reading
 * is complete the list is partial (`EuFeedbackPanel`'s `partial`): the rows
 * read so far newest first and the pager, nothing that counts, filters or
 * orders; a step that arrives in between swaps its rows in under the
 * pager. A failed automatic step keeps the rows and offers „Erneut
 * versuchen" for that step alone.
 *
 * MORE ON REQUEST (16.11.2026): where the portal counts more than the
 * automatic reading holds, the list offers „Weitere N lesen"; a press asks
 * for the next step of five pages (`?seiten=15`, 20, … 50). The list keeps
 * its reading while the step is read and where it fails („Erneut versuchen"
 * asks the same step again); the step's reading is swapped in when it
 * arrives, and the live region says so once (`feedbackMoreOf`,
 * `feedbackAnnouncement`). Automatic steps and presses share one fetch
 * (`readStep`, `$fetch`, one step at a time): not `useLazyFetch`, whose
 * watched query would ask on its own.
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
  automaticStepOf,
  feedbackAnnouncement,
  feedbackMoreOf,
  feedbackStageOf,
  type EuFeedbackBlockView,
  type EuFeedbackCountry,
  type EuFeedbackStepStatus,
} from '~/utils/euFeedback'

const props = withDefaults(defineProps<{ block: EuFeedbackBlockView; country?: EuFeedbackCountry | null }>(), { country: () => EU_FEEDBACK_COUNTRY })

const url = () => `/api/eu-recht/rueckmeldungen/${props.block.initiative}/${props.block.publication}`
// Its own key per window: under a shared key Nuxt keeps the first registration's options, and two blocks would read one window.
const first = useLazyFetch<EuRueckmeldungenResponse>(url, {
  key: `eu-rueckmeldungen-${props.block.initiative}-${props.block.publication}-erste`,
  query: { teil: 'erste' },
  server: false,
  immediate: false,
})

const root = useTemplateRef<HTMLElement>('root')
useNearViewportSection(root, () => void first.execute(), () => first.status.value !== 'idle')

/* The latest step that arrived (automatic or on a press), and where the step asked last stands. */
const latest = shallowRef<EuRueckmeldungenResponse | null>(null)
const stepStatus = ref<EuFeedbackStepStatus>('idle')

const stage = computed(() => feedbackStageOf({ status: first.status.value, data: first.data.value }, latest.value, stepStatus.value))

/** Step `pages`, once at a time. A failed answer keeps the reading the list has. */
async function readStep(pages: number) {
  if (stepStatus.value === 'pending') return
  stepStatus.value = 'pending'
  try {
    const answer = await $fetch<EuRueckmeldungenResponse>(url(), { query: { seiten: pages } })
    if (answer.state !== 'gelesen') throw new Error('ungelesen')
    latest.value = answer
    stepStatus.value = 'idle'
  } catch {
    stepStatus.value = 'error'
  }
}

// The automatic reading: after page one, and after each automatic step, the next one by itself until 1,000 or everything is read.
watch(stage, (s) => {
  const next = automaticStepOf(s, stepStatus.value)
  if (next !== null) void readStep(next)
}, { immediate: true })

/** „Erneut versuchen": page one failed → page one again; an automatic step failed → that step alone. */
function retry() {
  if (stage.value.kind === 'partial') void readStep(stage.value.next)
  else void first.execute()
}

const more = computed(() => (stage.value.kind === 'complete' ? feedbackMoreOf(stage.value.reading, stage.value.pages, stepStatus.value) : null))

/** What the live region says: the loading line, that the rest is still read, the arrival, or a gap sentence; nothing before the block is reached. */
const announcement = computed(() => (first.status.value === 'idle' ? '' : feedbackAnnouncement(stage.value, stepStatus.value)))
</script>

<template>
  <div ref="root">
    <PageSubsection :heading="block.heading">
      <!-- A short status, polite: the reading takes seconds, and its arrival is news, not an alarm. The list itself is not announced — it can hold hundreds of names; its set line speaks once a reader filters it. -->
      <p class="sr-only" aria-live="polite">{{ announcement }}</p>
      <!-- Before page one: the list's frame — the box and its column header, plain — with the loading line, or page one's failure and „Erneut versuchen", where the rows will be (`ListBoxState`). The block's own live region speaks; the box's says nothing more. -->
      <ListBox v-if="stage.kind === 'waiting' || stage.kind === 'unread'" class="@container/list">
        <ColumnHeader class="gap-x-3 row-cols:grid row-cols:feedback-tracks">
          <ColumnLabel :label="EU_FEEDBACK_DE.column.date" />
          <ColumnLabel :label="EU_FEEDBACK_DE.column.name" />
          <ColumnLabel :label="EU_FEEDBACK_DE.column.kind" />
          <ColumnLabel :label="EU_FEEDBACK_DE.column.country" />
        </ColumnHeader>
        <ListBoxState
          quiet
          :state="stage.kind === 'waiting' ? { loading: EU_FEEDBACK_DE.loading } : { failed: { text: EU_FEEDBACK_DE.unread } }"
          @retry="retry()"
        />
      </ListBox>
      <EuFeedbackPanel
        v-else
        :reading="stage.reading"
        :country="country"
        :partial="stage.kind === 'partial' ? { restFailed: stage.restFailed } : null"
        :more-row="more"
        @retry="retry()"
        @more="readStep"
      />
    </PageSubsection>
  </div>
</template>
