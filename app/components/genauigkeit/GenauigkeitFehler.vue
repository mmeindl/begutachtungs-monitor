<script setup lang="ts">
/**
 * The injected faults of one kind of comparison, as a reader needs them
 * (24.11.2026): what the check catches almost always, as ONE bar with the
 * range of its shares and the kinds of fault under it; and every kind it
 * does not, as a bar of its own with what that means for someone who quotes
 * the comparison.
 *
 * Until then every group stood as a bar with a line of counts under it —
 * „26.168 von 26.208 eingebauten Fehlern gefangen · schwächster Fall 98,9 %"
 * — six of seven bars at 98 to 100 %, and the one a reader has to know
 * about was the seventh. The counts and the weakest class of each bar stand
 * under „Im Einzelnen" of the section; the strong bar is drawn at its lowest
 * share, so it never shows more than its weakest class caught.
 */
import { type FaultBar, fehlerBild, fewTriesDe, weakFigureDe } from '#shared/utils/genauigkeit'

const props = defineProps<{
  faults: FaultBar[]
  heading?: string
}>()

const bild = computed(() => fehlerBild(props.faults))
/** The strong bar's length: the weakest share it stands for, in thousandths. */
const strongLow = computed(() => {
  const shares = bild.value.strong.map((f) => Math.min(f.caught / f.tried, f.weakestShare ?? 1))
  return Math.floor(1000 * Math.min(...shares))
})
</script>

<template>
  <div class="mt-8">
    <h3 class="text-lg font-semibold text-ink">{{ heading ?? 'Eingebaute Fehler' }}</h3>
    <div v-if="bild.strong.length" class="mt-3">
      <GenauigkeitMeter :label="bild.strongLabel" :figure="bild.strongRange!" :part="strongLow" :whole="1000" />
      <ul class="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-secondary marker:text-ink-muted">
        <li v-for="f in bild.strong" :key="f.label">{{ f.label }}</li>
      </ul>
    </div>
    <template v-if="bild.weak.length">
      <h4 class="mt-6 text-sm font-medium text-ink">{{ bild.weakLabel }}</h4>
      <ul class="mt-2 list-none space-y-4 pl-0">
        <li v-for="f in bild.weak" :key="f.label">
          <GenauigkeitMeter :label="f.label" :figure="weakFigureDe(f)" :part="f.caught" :whole="f.tried" />
          <p v-if="f.why" class="mt-1 text-sm text-ink">{{ f.why }}</p>
          <p v-if="fewTriesDe(f)" class="mt-0.5 text-xs text-ink-secondary">{{ fewTriesDe(f) }}</p>
        </li>
      </ul>
    </template>
  </div>
</template>
