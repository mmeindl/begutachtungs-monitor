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
const FORMAT_ORDER = ['pdf', 'html'] as const

function formatOf(doc: DocumentListItem, type: 'pdf' | 'html') {
  return doc.formats.find((f) => f.type === type) ?? null
}

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
  <div>
    <!-- The arrow once, for the whole list: every row's tags leave for the
         same host. Eight arrows in one block were texture, not information. -->
    <p class="mb-1 text-right text-xs text-ink-muted">
      öffnet auf {{ source }}<span aria-hidden="true"> ↗</span>
    </p>
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
        <!-- Two fixed columns, PDF then HTML, empty where a format is
             missing — so the same label never jumps between rows. A format
             is a small bordered accent tag: not a tall neutral button (an
             action inside the page) and not bare text (too light to scan).
             The <a> keeps the 44px hit area, the visible tag is smaller. -->
        <span class="grid shrink-0 grid-cols-2 gap-1">
          <template v-for="type in FORMAT_ORDER" :key="type">
            <a
              v-if="formatOf(doc, type)"
              :href="formatOf(doc, type)!.url"
              target="_blank"
              rel="noopener"
              class="group flex min-h-11 items-center justify-center rounded"
              :aria-label="`${doc.title} als ${formatNames[type]} auf ${source} öffnen`"
            >
              <span
                class="inline-flex min-w-14 justify-center rounded border border-hairline px-2 py-1 text-xs font-medium text-accent-deep group-hover:border-accent group-hover:bg-accent-wash"
              >
                {{ formatNames[type] }}
              </span>
            </a>
            <span v-else aria-hidden="true" />
          </template>
        </span>
      </li>
    </ul>
  </div>
</template>
