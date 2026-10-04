<script setup lang="ts">
/**
 * The PDF of one Stellungnahme, as the format link the Dokumente section
 * above already uses (`DocumentList`) — one vocabulary for "here is a file"
 * on the whole page.
 *
 * It appears ONLY where a file exists. Where it is missing, the submitter
 * typed into parliament's web form and the text sits on the page the
 * citation beside it already links to — so the absence says something, and
 * the row is spared a second link to the destination it already has. That
 * is only honest while the answer is known, hence the reserved, empty slot
 * until it is — empty also while the answer is pending: the fixed width
 * keeps the column from reflowing when the link arrives, and since the
 * link has no box (03.10.2026) there is no outline left to ghost.
 *
 * Asked for on approach, not on render: the panel can hold 700 rows, each
 * answer costs one request at the source, and a reader reads ten. The
 * observer fires a screen early (rootMargin), so by the time a row is read
 * its tag is there.
 */
import { isSafeLinkHref } from '#shared/utils/safeExternalUrl'
import { statementRefFromPageUrl } from '#shared/utils/statementRef'
import { statementLinkName } from '~/utils/statementRows'

const props = defineProps<{
  /** The statement's page on parlament.gv.at — its address is read from this. */
  pageUrl: string
  /** e.g. "95/SN-132/ME", for the accessible name. */
  citation: string
  /** Names the submitter in the accessible name — organisations only, never a person (GDPR). */
  submitter?: string | null
}>()

const { request, pdfUrl } = useStatementDocuments()
const statementRef = computed(() => statementRefFromPageUrl(props.pageUrl))
/**
 * A URL that `isSafeLinkHref` refuses counts as no file: the slot stays
 * empty, as for a web-form statement, rather than `ExternalLink`'s plain-text
 * fallback leaving a lone „PDF" that looks like a link and is not one.
 */
const href = computed(() => {
  const url = statementRef.value ? pdfUrl(statementRef.value) : null
  return isSafeLinkHref(url) ? url : null
})

const root = useTemplateRef<HTMLElement>('root')

// Without an IntersectionObserver every tag asks at once (`useNearViewport`).
// The batch queue still collects the whole list into calls of 32, so the
// fallback is slower, never broken.
useNearViewport(
  root,
  () => {
    if (statementRef.value) request(statementRef.value)
  },
  '400px 0px',
  () => !statementRef.value,
)

const ariaLabel = computed(
  () => `${statementLinkName(props.citation, props.submitter)} als PDF öffnen (neues Fenster)`,
)
</script>

<template>
  <!-- One line box whatever the state — matching the citation beside it — so
       a row with several statements keeps citation n and tag n on one line,
       and so the column does not reflow when the answers arrive. -->
  <span ref="root" class="flex min-h-6 w-12 shrink-0 items-center">
    <!-- A plain standalone link, as the citation beside it — the same
         form as DocumentList's format links. -->
    <ExternalLink
      v-if="href"
      :href="href"
      :aria-label="ariaLabel"
      class="tap-target font-medium link-quiet"
    >PDF</ExternalLink>
  </span>
</template>
