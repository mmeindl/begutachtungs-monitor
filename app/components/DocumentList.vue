<script setup lang="ts">
import type { DraftDocument } from '#shared/types'

/** A row may carry its own sub-line: source-specific hints (the RIS
 *  Entwurfstext) have no place in the shared DOC_HINTS prefix table,
 *  which describes the ministries' standard parliament document set. */
type DocumentListItem = DraftDocument & { hint?: string }

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
  // Later stations of the same law text (DraftDetail.textEvolution)
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
    <ul class="divide-y divide-hairline">
      <!-- `py-1.5`, not the `py-3` a text row would take: the format link's
           44px hit area below already IS the row height, and a document name
           is one line of text — full padding on top of the target only spaced
           two invisible boxes apart (68px rows for 20px of text). What is
           left keeps a sub-line clear of the divider below it. Both row
           shapes, with and without that sub-line, stay 56px: the 44px target
           binds in each, so the rhythm holds. -->
      <li
        v-for="(doc, i) in documents"
        :key="`${doc.title}-${i}`"
        class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-1.5"
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
             The <a> keeps the 44px hit area, the visible tag is smaller.
             The ↗ stays on the tag: it is the page-wide mark for "leaves
             the page", and the aria-label names the host. -->
        <!-- Fixed track widths: every row's grid is the same width, so PDF
             sits at the same x whether or not an HTML tag follows. -->
        <span class="grid shrink-0 grid-cols-[4.75rem_4.75rem] gap-1">
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
                class="inline-flex w-full justify-center rounded border border-hairline px-2 py-1 text-xs font-medium text-accent-deep group-hover:border-baseline group-hover:underline"
              >
                {{ formatNames[type] }}<span aria-hidden="true"> ↗</span>
              </span>
            </a>
            <span v-else aria-hidden="true" />
          </template>
        </span>
      </li>
    </ul>
  </div>
</template>
