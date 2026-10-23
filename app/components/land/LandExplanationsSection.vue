<script setup lang="ts">
/**
 * „Was das Land begründet" — the general part of a Land's Erläuterungen
 * (23.10.2026), as „Was das Ressort begründet" shows the ministry's on the
 * Ministerialentwurf's page (`ExplanationsSection`), and for the same reason:
 * a reader's relevance check starts with what the law is for.
 *
 * The Land's paragraphs in the Land's order, read from its PDF
 * (`laender/landExplanations.ts`); the monitor decides only where to fold.
 * The particular part stands at the §§ of „Was ändert der Entwurf?".
 *
 * Lazy and client-side like the comparisons: a PDF parse the page must not
 * wait for. The request is shared with the comparison above it.
 */
import type { LandCode, LandExplanationsResponse } from '#shared/types'
import { foldByBudget } from '~/utils/foldByBudget'

const props = defineProps<{ land: LandCode; number: string }>()

const { data, status } = useFetch<LandExplanationsResponse>(
  () => `/api/laender/${props.land}/${props.number}/erlaeuterungen`,
  { lazy: true, server: false },
)

interface Item {
  kind: 'heading' | 'text'
  text: string
}
const items = computed<Item[]>(() =>
  (data.value?.general ?? []).flatMap((p) => [
    ...(p.heading ? [{ kind: 'heading' as const, text: p.heading }] : []),
    ...p.text.map((t) => ({ kind: 'text' as const, text: t })),
  ]))

/* The same budget as the ministry's: the first paragraphs shown, the rest one click away. */
const BUDGET = 1400
const fold = computed(() => foldByBudget(items.value, BUDGET))
const foldedParagraphs = computed(() => fold.value.folded.filter((i) => i.kind === 'text').length)
</script>

<template>
  <PageSubsection id="erlaeuterungen" heading="Was das Land begründet">
    <p v-if="status === 'pending' || status === 'idle'" class="text-sm text-ink-muted">
      Die Erläuterungen werden geladen …
    </p>
    <p v-else-if="status === 'error' || !data" class="text-sm text-ink-secondary">
      Die Erläuterungen sind gerade nicht verfügbar.
    </p>
    <template v-else-if="!data.available || !items.length">
      <p class="text-sm text-ink-secondary">{{ data.unavailableReason ?? 'Einen allgemeinen Teil der Erläuterungen fand der Monitor nicht.' }}</p>
      <p v-if="data.document" class="mt-3 text-xs text-ink-muted">
        <ExternalLink :href="data.document.url" class="link-quiet">{{ data.document.label }}</ExternalLink>
      </p>
    </template>
    <template v-else>
      <p v-if="!data.labelled" class="mb-3 text-sm text-ink-muted">
        Das Land gliedert diese Erläuterungen nicht selbst; wo der allgemeine Teil endet, haben wir abgegrenzt.
      </p>
      <template v-for="(item, i) in fold.visible" :key="i">
        <h4 v-if="item.kind === 'heading'" class="mt-5 text-sm font-semibold text-ink first:mt-0">{{ item.text }}</h4>
        <p v-else class="mt-3 max-w-prose leading-relaxed text-ink-secondary first:mt-0">{{ item.text }}</p>
      </template>
      <Disclosure v-if="fold.folded.length" size="sm" tone="ink" class="mt-3">
        <template #summary>
          <span class="group-open:hidden">Weiterlesen – noch {{ foldedParagraphs }} {{ foldedParagraphs === 1 ? 'Absatz' : 'Absätze' }}</span>
          <span class="hidden group-open:inline">Weniger anzeigen</span>
        </template>
        <div class="pb-2">
          <template v-for="(item, i) in fold.folded" :key="i">
            <h4 v-if="item.kind === 'heading'" class="mt-5 text-sm font-semibold text-ink">{{ item.text }}</h4>
            <p v-else class="mt-3 max-w-prose leading-relaxed text-ink-secondary">{{ item.text }}</p>
          </template>
        </div>
      </Disclosure>
      <SectionCredits :sources="[]" :marked="false">
        <span>{{ data.publisher }}: <ExternalLink v-if="data.document" :href="data.document.url" class="link-muted">{{ data.document.label }}</ExternalLink></span>
      </SectionCredits>
    </template>
  </PageSubsection>
</template>
