<script setup lang="ts">
import type { TraceStep } from '#shared/types'

/**
 * The evidence under the StageBar's story: every procedural step, with
 * milestones (RV, Fristende, Kundmachung) emphasized and routine steps
 * foldable. Reactive toggle instead of native <details> because the
 * collapsed view is a FILTERED list, not a hidden suffix — chronology
 * must survive both states (same precedent as StatementsPanel's toggle).
 */
const props = defineProps<{
  steps: TraceStep[]
}>()

const FOLD_THRESHOLD = 6

const expanded = ref(false)

const milestones = computed(() => props.steps.filter((s) => s.kind === 'milestone'))

/* Folding only pays when there ARE milestones to keep and noise to hide. */
const foldable = computed(
  () =>
    props.steps.length > FOLD_THRESHOLD &&
    milestones.value.length > 0 &&
    milestones.value.length < props.steps.length,
)

const visible = computed(() =>
  foldable.value && !expanded.value ? milestones.value : props.steps,
)
</script>

<template>
  <div>
    <ol>
      <li
        v-for="(step, i) in visible"
        :key="`${step.date ?? ''}-${step.text}`"
        class="relative pb-6 pl-6 last:pb-0"
      >
        <!-- Hairline connector to the next step -->
        <span
          v-if="i < visible.length - 1"
          class="absolute bottom-0 left-[3.5px] top-4 w-px bg-hairline"
          aria-hidden="true"
        />
        <!-- Step dot (decorative; date + text carry the information).
             Milestones get size + accent — redundant emphasis, the text
             itself is what makes them milestones. -->
        <span
          class="absolute rounded-full"
          :class="
            step.kind === 'milestone'
              ? '-left-px top-0.75 size-2.5 bg-accent-deep'
              : 'left-0 top-1 size-2 bg-baseline'
          "
          aria-hidden="true"
        />
        <p v-if="step.date" class="text-sm tabular-nums text-ink-muted">
          {{ formatDateDe(step.date) }}
        </p>
        <!-- Event larger than its timestamp: the flat grays can't separate
             them, so size does (main.css hierarchy doctrine). -->
        <p
          class="mt-0.5 text-base text-ink"
          :class="step.kind === 'milestone' ? 'font-medium' : ''"
        >
          {{ step.text }}
        </p>
        <ul v-if="step.links.length" class="mt-2 flex flex-wrap gap-2">
          <li v-for="link in step.links" :key="link.url">
            <!-- URLs are absolute per contract (shared/types.ts TraceStep.links).
                 aria-label carries the step context: link purpose is clear from
                 the link alone (WCAG 2.4.9 AAA); min-h-11 = 44px target size. -->
            <ExternalLink
              :href="link.url"
              :aria-label="`${step.text}: ${link.label} auf parlament.gv.at öffnen`"
              class="inline-flex min-h-11 items-center gap-1 rounded-md border border-hairline bg-surface px-3 text-sm font-medium text-accent-deep transition-colors hover:border-baseline hover:underline"
            >
              {{ link.label }}
            </ExternalLink>
          </li>
        </ul>
      </li>
    </ol>
    <div v-if="foldable" class="mt-3">
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{
          expanded
            ? 'Nur Meilensteine anzeigen'
            : `Alle ${steps.length} Verfahrensschritte anzeigen`
        }}
      </UButton>
    </div>
  </div>
</template>
