<script setup lang="ts">
import type { TraceStep } from '#shared/types'

defineProps<{
  steps: TraceStep[]
}>()
</script>

<template>
  <ol>
    <li
      v-for="(step, i) in steps"
      :key="`${step.date ?? ''}-${i}`"
      class="relative pb-6 pl-6 last:pb-0"
    >
      <!-- Hairline connector to the next step -->
      <span
        v-if="i < steps.length - 1"
        class="absolute bottom-0 left-[3.5px] top-4 w-px bg-hairline"
        aria-hidden="true"
      />
      <!-- Step dot (decorative; date + text carry the information) -->
      <span
        class="absolute left-0 top-1 size-2 rounded-full bg-baseline"
        aria-hidden="true"
      />
      <p v-if="step.date" class="text-sm tabular-nums text-ink-muted">
        {{ formatDateDe(step.date) }}
      </p>
      <!-- Event larger than its timestamp: the flat grays can't separate
           them, so size does (main.css hierarchy doctrine). -->
      <p class="mt-0.5 text-base text-ink">{{ step.text }}</p>
      <ul v-if="step.links.length" class="mt-2 flex flex-wrap gap-2">
        <li v-for="link in step.links" :key="link.url">
          <!-- URLs are absolute per contract (shared/types.ts TraceStep.links).
               aria-label carries the step context: link purpose is clear from
               the link alone (WCAG 2.4.9 AAA); min-h-11 = 44px target size. -->
          <ExternalLink
            :href="link.url"
            :aria-label="`${step.text}: ${link.label} auf parlament.gv.at öffnen`"
            class="inline-flex min-h-11 items-center gap-1 rounded-md border border-hairline bg-surface px-3 text-sm font-medium text-accent-deep transition-colors hover:border-baseline"
          >
            {{ link.label }}
          </ExternalLink>
        </li>
      </ul>
    </li>
  </ol>
</template>
