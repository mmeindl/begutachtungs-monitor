<script setup lang="ts">
import type { ConsultationDocument } from '#shared/types'

/** A row may carry its own sub-line: source-specific hints (the RIS
 *  Entwurfstext) have no place in the shared DOC_HINTS prefix table,
 *  which describes the ministries' standard parliament document set. */
type DocumentListItem = ConsultationDocument & { hint?: string }

withDefaults(
  defineProps<{
    documents: DocumentListItem[]
    /** Named in the aria-label so screen-reader users hear where a link
     *  goes — the page shows the same documents from two sources. */
    source?: string
  }>(),
  { source: 'parlament.gv.at' },
)

const formatNames: Record<'pdf' | 'html', string> = { pdf: 'PDF', html: 'HTML' }

/* The standard draft-document types, explained for non-insiders — the
 * Textgegenüberstellung line quietly routes first-timers to the one
 * document written for "what would actually change". Doc names are
 * ministries' free text (docs/api-exploration.md §1): exact/prefix match
 * only, unknown titles get no sub-line. */
const DOC_HINTS: [prefix: string, hint: string][] = [
  ['Gesetzestext', 'Der Entwurfstext selbst'],
  ['Erläuterungen', 'Die Begründung des Ministeriums'],
  ['Vorblatt und WFA', 'Kurzüberblick und Folgenabschätzung'],
  ['Textgegenüberstellung', 'Geltendes Recht und Entwurf nebeneinander – zeigt, was sich ändern würde'],
  // Later stations of the same law text (ConsultationDetail.textEvolution)
  ['Geändert im Ausschuss', 'Fassung nach den Beratungen im Ausschuss des Nationalrats'],
  ['Geändert im Plenum', 'Fassung nach der Abstimmung im Nationalrat'],
]

function docHint(doc: DocumentListItem): string | null {
  if (doc.hint) return doc.hint
  const t = doc.title.trim()
  const hit = DOC_HINTS.find(([prefix]) => t === prefix || t.startsWith(prefix))
  return hit ? hit[1] : null
}
</script>

<template>
  <ul class="divide-y divide-hairline">
    <li
      v-for="(doc, i) in documents"
      :key="`${doc.title}-${i}`"
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
    >
      <div class="min-w-0">
        <p class="text-sm text-ink">{{ doc.title }}</p>
        <p v-if="docHint(doc)" class="mt-0.5 text-xs text-ink-muted">
          {{ docHint(doc) }}
        </p>
      </div>
      <!-- Text links, not buttons: everything that leaves the page reads as
           accent text with the ↗ arrow; outline buttons and chips are for
           actions inside the page. Padding keeps the 44px hit area. -->
      <span class="flex shrink-0 gap-1">
        <ExternalLink
          v-for="fmt in doc.formats"
          :key="fmt.type"
          :href="fmt.url"
          class="inline-flex min-h-11 items-center rounded px-2 text-sm font-medium text-accent-deep hover:underline"
          :aria-label="`${doc.title} als ${formatNames[fmt.type]} auf ${source} öffnen`"
        >
          {{ formatNames[fmt.type] }}
        </ExternalLink>
      </span>
    </li>
  </ul>
</template>
