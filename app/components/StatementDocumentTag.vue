<script setup lang="ts">
/**
 * The PDF of one Stellungnahme, as the format tag the Dokumente section
 * above already uses (`DocumentList`) — one vocabulary for "here is a file"
 * on the whole page.
 *
 * It appears ONLY where a file exists. Where it is missing, the submitter
 * typed into parliament's web form and the text sits on the page the
 * citation beside it already links to — so the absence says something, and
 * the row is spared a second link to the destination it already has. That
 * is only honest while the answer is known, hence the reserved, empty slot
 * until it is.
 *
 * Asked for on approach, not on render: the panel can hold 700 rows, each
 * answer costs one request at the source, and a reader reads ten. The
 * observer fires a screen early (rootMargin), so by the time a row is read
 * its tag is there.
 */
import { statementRefFromPageUrl } from '#shared/utils/statementRef'

const props = defineProps<{
  /** The statement's page on parlament.gv.at — its address is read from this. */
  pageUrl: string
  /** e.g. "95/SN-132/ME", for the accessible name. */
  citation: string
  /** Names the submitter in the accessible name — organisations only, never a person (GDPR). */
  submitter?: string | null
}>()

const { request, pdfUrl, isPending } = useStatementDocuments()
const statementRef = computed(() => statementRefFromPageUrl(props.pageUrl))
const href = computed(() => (statementRef.value ? pdfUrl(statementRef.value) : null))
/* No ref means there is nothing to resolve — an empty line box, not a ghost
 * that would wait forever. */
const pending = computed(() => statementRef.value !== null && isPending(statementRef.value))

const root = useTemplateRef<HTMLElement>('root')
let observer: IntersectionObserver | null = null

onMounted(() => {
  const ref = statementRef.value
  if (!ref) return
  // No IntersectionObserver (old browser, jsdom): ask straight away. The
  // batch queue still collects the whole list into calls of 32, so the
  // fallback is slower, never broken.
  if (!root.value || typeof IntersectionObserver === 'undefined') {
    request(ref)
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      observer?.disconnect()
      observer = null
      request(ref)
    },
    { rootMargin: '400px 0px' },
  )
  observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

const ariaLabel = computed(() => {
  const who = props.submitter ? ` von ${props.submitter}` : ''
  return `Stellungnahme ${props.citation}${who} als PDF öffnen`
})
</script>

<template>
  <!-- One line box whatever the state — matching the citation beside it — so
       a row with several statements keeps citation n and tag n on one line,
       and so the column does not reflow when the answers arrive. -->
  <span ref="root" class="flex min-h-6 w-12 shrink-0 items-center">
    <a
      v-if="href"
      :href="href"
      target="_blank"
      rel="noopener"
      class="group tap-target w-full"
      :aria-label="ariaLabel"
    >
      <!-- The <a> keeps the 44px hit area, the visible tag is smaller —
           same construction as DocumentList's format tags. -->
      <span
        class="inline-flex w-full justify-center rounded border border-hairline px-1.5 py-0.5 text-xs font-medium text-accent-deep group-hover:border-baseline group-hover:underline"
      >
        PDF<span aria-hidden="true"> ↗</span>
      </span>
    </a>
    <!-- Nothing to say yet: a hairline ghost of the tag, so the column does
         not fill in with a jolt. Deliberately not a pulsing skeleton — on the
         organisation list nearly every row has a PDF, and ten blinking boxes
         are louder than the thing they stand for. -->
    <span
      v-else-if="pending"
      aria-hidden="true"
      class="h-[1.375rem] w-full rounded border border-dashed border-hairline/60"
    />
  </span>
</template>
