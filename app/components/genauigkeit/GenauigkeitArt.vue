<script setup lang="ts">
/**
 * One kind of comparison as a chapter of `/genauigkeit` (24.11.2026), every
 * kind in the same order so a reader scans them alike: what it is held
 * against, its figure (out of 100, or a few numbers), the injected faults
 * (`GenauigkeitFehler`), and under „Im Einzelnen" everything that stood on
 * the page before — the result in sentences, the rule, the measurement,
 * what the check misses, and every bar with its counts.
 *
 * WHAT IT MISSES STANDS AT A SHORT BAR, its why under it. A kind with no
 * short bar — a station comparison, where no fault of reading can be
 * injected — says its first blind spot in words under its own heading; the
 * rest are in the fold.
 *
 * The default slot takes what one kind has alone (the Lesefassung's example
 * and funnel), `#lead` a sentence before what it is held against, and
 * `#details` what its fold has alone.
 */
import { GENAUIGKEIT_ROW_DE, type GenauigkeitArt, faultNoteDe, fehlerBild, shareDe } from '#shared/utils/genauigkeit'

const props = defineProps<{ art: GenauigkeitArt }>()

const weak = computed(() => fehlerBild(props.art.faults).weak)
const details = computed(() => [
  { key: 'result', lines: props.art.result },
  { key: 'rule', lines: [props.art.rule] },
  { key: 'measured', lines: props.art.measured },
  { key: 'missed', lines: props.art.missed },
] as const)
</script>

<template>
  <ProseSection :id="art.id" :heading="art.heading">
    <slot name="lead" />
    <p>
      <template v-if="art.pageName">Auf der Seite eines Entwurfs: „{{ art.pageName }}“. </template>{{ art.against }}
    </p>
    <slot />
    <template v-if="art.split">
      <GenauigkeitHundert :caption="art.split.caption" :parts="art.split.parts" />
      <p v-if="art.split.after" class="text-sm text-ink">{{ art.split.after }}</p>
    </template>
    <!-- The figure above its words, the words first for a screen reader:
         „Regelverstöße in 519 Vergleichen: 0". In a div: a list right under
         the section takes the method text's spacing and bold terms. -->
    <div v-if="art.facts?.length" class="mt-6">
      <dl class="grid gap-3 sm:grid-cols-2">
        <div v-for="f in art.facts" :key="f.label" class="flex flex-col-reverse justify-end rounded-xl border border-hairline px-4 py-3">
          <dt class="mt-1 text-sm text-ink-secondary">{{ f.label }}</dt>
          <dd class="font-heading text-3xl text-ink">{{ f.value }}</dd>
        </div>
      </dl>
    </div>
    <GenauigkeitFehler v-if="art.faults.length" :faults="art.faults" :heading="art.faultsHeading" />
    <div v-if="!weak.length && art.missed.length" class="mt-8">
      <h3 class="text-lg font-semibold text-ink">Was die Prüfung übersieht</h3>
      <p class="mt-2 text-ink">{{ art.missed[0] }}</p>
    </div>
    <Disclosure size="sm" tone="secondary" class="mt-6">
      <template #summary>Im Einzelnen</template>
      <dl class="mt-1 divide-y divide-hairline border-y border-hairline text-sm">
        <div v-for="row in details" :key="row.key" class="py-2 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-x-4">
          <dt class="text-ink-secondary">{{ GENAUIGKEIT_ROW_DE[row.key] }}</dt>
          <dd class="mt-0.5 space-y-1.5 sm:mt-0">
            <p v-for="(line, i) in row.lines" :key="i" class="text-ink">{{ line }}</p>
          </dd>
        </div>
        <div v-if="art.faults.length" class="py-2 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-x-4">
          <dt class="text-ink-secondary">{{ GENAUIGKEIT_ROW_DE.faults }}</dt>
          <dd class="mt-0.5 space-y-2 sm:mt-0">
            <p class="text-ink">Ein Paragraph kann mehrere eingebaute Fehler abbekommen; die Versuche sind nicht lauter verschiedene Paragraphen.</p>
            <p v-for="f in art.faults" :key="f.label">
              <span class="text-ink">{{ f.label }}: {{ shareDe(f.caught, f.tried) }}&nbsp;%</span>
              <span class="block text-ink-secondary">{{ faultNoteDe(f) }}</span>
            </p>
          </dd>
        </div>
        <slot name="details" />
      </dl>
    </Disclosure>
  </ProseSection>
</template>
