<script setup lang="ts">
/**
 * „Ausführung durch die Länder" in a Ministerialentwurf's section „Im
 * Bundesgesetzblatt" (docs/architecture.md §12.67): where the station's
 * detail line („In 3 Entwürfen der Länder ausgeführt →", „Frist") jumps —
 * links in the spine stay on the page (owner, 06.11.2026). Rendered exactly
 * when the station carries that line.
 *
 * With drafts: the Land drafts as the lists' rows (`EntryList`, the act
 * page's rows), then the way to the act page. Without: „Noch kein Entwurf
 * der Länder im Fenster." and the Frist as the Grundsatzgesetz's whole
 * sentence, quoted (`fristQuoteOf`) — no computed date, never „0 Länder"
 * (D6). The credit line as on the act page.
 */
import type { MeBundesrechtLine } from '#shared/types'
import { viewOfRow } from '~/utils/entryView'
import { LAENDER_BLOCK_ANCHOR, fristQuoteOf } from '~/utils/bundesrecht'

const props = defineProps<{ line: MeBundesrechtLine }>()
const id = LAENDER_BLOCK_ANCHOR.slice(1)
const entries = computed(() => props.line.rows.map(viewOfRow))
const frist = computed(() => (props.line.fristClause ? fristQuoteOf(props.line.fristClause) : null))
</script>

<template>
  <PageSubsection :id="id" heading="Ausführung durch die Länder">
    <EntryList v-if="entries.length" :entries="entries" />
    <template v-else>
      <p class="text-ink-secondary">
        Noch kein Entwurf der Länder im Fenster.
      </p>
      <p v-if="frist" class="mt-2 text-sm text-ink-secondary">
        Laut Grundsatzgesetz: „{{ frist }}“
      </p>
    </template>
    <p class="mt-3 text-sm">
      <NuxtLink :to="line.path" class="link-inline">Zum Grundsatzgesetz {{ line.citation }} →</NuxtLink>
    </p>
    <SectionCredits :sources="[]" :marked="false" method="/so-funktionierts#bund-land">
      <span>Quellen:</span>
      <span>Bundesgesetzblatt (RIS)</span>
      <span v-if="entries.length">Dokumente der Länder</span>
    </SectionCredits>
  </PageSubsection>
</template>
