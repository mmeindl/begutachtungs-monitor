<script setup lang="ts">
import type { DraftDocument } from '#shared/types'

withDefaults(
  defineProps<{
    documents: DraftDocument[]
    /** Named in the aria-label so screen-reader users hear where a link
     *  goes — the page shows the same documents from two sources. */
    source?: string
  }>(),
  { source: 'parlament.gv.at' },
)

const formatNames: Record<'pdf' | 'html', string> = { pdf: 'PDF', html: 'HTML' }
const FORMAT_ORDER = ['pdf', 'html'] as const

function formatOf(doc: DraftDocument, type: 'pdf' | 'html') {
  return doc.formats.find((f) => f.type === type) ?? null
}

/* The standard draft-document types, explained for non-insiders — the
 * Textgegenüberstellung line quietly routes first-timers to the one
 * document written for "what would actually change". Doc names are
 * ministries' free text (docs/api-exploration.md §1): exact/prefix match
 * only, unknown titles get no sub-line.
 *
 * The RIS page names its three documents itself (`[id].vue`), so the same
 * table serves both sources: „Entwurfstext" is the RIS page's word for what
 * Parliament calls „Gesetzestext", with the same sub-line. It used to pass
 * its hints in per row, copied from this table (until 03.10.2026). */
const DOC_HINTS: [prefix: string, hint: string][] = [
  ['Gesetzestext', 'Der Entwurfstext selbst'],
  ['Entwurfstext', 'Der Entwurfstext selbst'],
  ['Erläuterungen', 'Die Begründung des Ministeriums'],
  ['Vorblatt und WFA', 'Kurzüberblick und Folgenabschätzung'],
  ['Textgegenüberstellung', 'Geltendes Recht und Entwurf nebeneinander'],
  // No hint for the later stations („Geändert im Ausschuss", „Geändert im
  // Plenum", DraftDetail.textEvolution) since 30.09.2026: the sub-line only
  // restated the title.
]

function docHint(doc: DraftDocument): string | null {
  const t = doc.title.trim()
  const hit = DOC_HINTS.find(([prefix]) => t === prefix || t.startsWith(prefix))
  return hit ? hit[1] : null
}
</script>

<template>
  <div>
    <ul class="divide-y divide-hairline">
      <!-- `py-1.5`, not the `py-3` a text row would take: the format link's
           hit area below already IS the row height, and a document name
           is one line of text — full padding on top of the target only spaced
           two invisible boxes apart (68px rows for 20px of text). What is
           left keeps a sub-line clear of the divider below it. On touch both
           row shapes, with and without that sub-line, stay 56px: the 44px
           target binds in each, so the rhythm holds. With a mouse the target
           is 36px and a row with a sub-line may stand a few px taller.

           Two columns that never wrap (1.10.2026). With `flex-wrap` each row
           decided alone whether its tags fit beside the title: on a phone
           long titles pushed them under the text, short ones kept them
           right, and the list zig-zagged. Now a long title wraps inside its
           own column and the links stay right in every row. -->
      <li
        v-for="(doc, i) in documents"
        :key="`${doc.title}-${i}`"
        class="flex items-center gap-x-3 py-1.5 sm:gap-x-4"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm text-ink">{{ doc.title }}</p>
          <p v-if="docHint(doc)" class="mt-0.5 text-xs text-ink-muted">
            {{ docHint(doc) }}
          </p>
        </div>
        <!-- Two fixed columns, PDF then HTML, empty where a format is
             missing — so the same label never jumps between rows. A format
             is a plain standalone link (`link-quiet`) since 03.10.2026, no
             longer a bordered tag: it opens a document elsewhere and does
             nothing on this page, and a box here reads as „do something"
             — the outline buttons' job. The fixed columns, the weight and
             the ↗ carry the scan the box was meant to; the <a> keeps the
             full target height. The ↗ is the page-wide mark for "leaves the
             page", and the aria-label names the host. -->
        <!-- Fixed track widths: every row's grid is the same width, so PDF
             sits at the same x whether or not an HTML link follows. Sized
             to the labels in text-sm — „PDF ↗" ~42px, „HTML ↗" ~54px. -->
        <span class="grid shrink-0 grid-cols-[3rem_3.75rem] gap-x-3">
          <template v-for="type in FORMAT_ORDER" :key="type">
            <a
              v-if="formatOf(doc, type)"
              :href="formatOf(doc, type)!.url"
              target="_blank"
              rel="noopener"
              class="link-quiet flex min-h-target items-center text-sm font-medium"
              :aria-label="`${doc.title} als ${formatNames[type]} auf ${source} öffnen (neues Fenster)`"
            >
              {{ formatNames[type] }}<span aria-hidden="true">&nbsp;↗</span>
            </a>
            <span v-else aria-hidden="true" />
          </template>
        </span>
      </li>
    </ul>
  </div>
</template>
