<script setup lang="ts">
/**
 * The credit line under the ProcedureCard for the EU fact in it
 * (docs/architecture.md §12.66): what the fact read and from whom, in the
 * site's one credit grammar (`SectionCredits`), under the card and not in
 * it — a source statement is looked up while or after reading, never
 * before, and every other card on the page carries its line below.
 * Rendered only where the card shows the fact.
 *
 * ON A LAND'S DRAFT (`publisher`, Nachtrag 2 of 04.11.2026) the documents
 * read are the Land's — its Vorblatt, Erläuterungen, draft — and their
 * publisher is the Land, „Land Oberösterreich", which the site's publisher
 * list (`provenance.ts`, RIS · Parlament · EUR-Lex) does not hold and need
 * not: a Land document carries no licence claim, so it is named as „Was das
 * Land begründet" names its PDF, the documents linked. „Quelle: Land
 * Oberösterreich · Erläuterungen" where the Land stands alone; with a
 * deadline beside it „Quellen: Erläuterungen und Entwurf (Land
 * Oberösterreich) · Fristen (EUR-Lex)", each item naming its own, as the
 * Bund's line does.
 */
import type { EuRechtResponse } from '#shared/types'
import { sourceItemsDe } from '#shared/utils/provenance'
import { euFactView } from '~/utils/euRecht'

const props = defineProps<{
  data: EuRechtResponse | null | undefined
  /** A Land's draft: who published the documents read, „Land Oberösterreich". */
  publisher?: string | null
}>()

const view = computed(() => euFactView(props.data))
const items = computed(() => (view.value ? sourceItemsDe(view.value.sources) : []))

/** The Land's documents the fact read, once per kind. */
const landDocs = computed(() => (props.data?.sources ?? []).filter((s, i, all) => all.findIndex((t) => t.label === s.label) === i))
const withDeadlines = computed(() => (view.value?.deadlines.length ?? 0) > 0)
const landLead = computed(() => (withDeadlines.value ? 'Quellen:' : `Quelle: ${props.publisher}`))
const landSuffix = computed(() => (withDeadlines.value ? ` (${props.publisher})` : ''))
</script>

<template>
  <SectionCredits
    v-if="view && publisher"
    :sources="[]"
    :marked="false"
    method="/so-funktionierts#eu-recht"
  >
    <span>{{ landLead }}</span>
    <span v-if="landDocs.length"><template v-for="(doc, i) in landDocs" :key="doc.url"><template v-if="i > 0">{{ i === landDocs.length - 1 ? ' und ' : ', ' }}</template><ExternalLink :href="doc.url" class="link-muted">{{ doc.label }}</ExternalLink></template>{{ landSuffix }}</span>
    <span v-if="withDeadlines">Fristen (EUR-Lex)</span>
  </SectionCredits>
  <SectionCredits
    v-else-if="view"
    :sources="view.sources"
    :marked="false"
    method="/so-funktionierts#eu-recht"
  >
    <span v-for="item in items" :key="item">{{ item }}</span>
  </SectionCredits>
</template>
