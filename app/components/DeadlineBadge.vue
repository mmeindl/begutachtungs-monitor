<script setup lang="ts">
import type { DeadlineTone } from '#shared/utils/deadlines'

const props = defineProps<{
  deadline: string | null
  active: boolean
}>()

const tone = computed(() => deadlineTone(props.deadline, props.active))

const label = computed(() => fristLabel(props.deadline, props.active))

/* Status hue lives in dot + wash; the text stays in ink tokens so the pill
 * passes AA contrast at text-xs and meaning never rides on color alone —
 * the label text itself says how urgent it is. */
const pillClass: Record<DeadlineTone, string> = {
  critical: 'bg-status-critical/10 text-ink',
  serious: 'bg-status-serious/15 text-ink',
  neutral: 'bg-accent-wash text-ink',
  /* text-ink instead of -secondary: on the 15% wash, secondary drops below 7:1 */
  inactive: 'bg-ink-muted/15 text-ink',
}

const dotClass: Record<DeadlineTone, string> = {
  critical: 'bg-status-critical',
  serious: 'bg-status-serious',
  neutral: 'bg-accent',
  inactive: 'bg-ink-muted',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="pillClass[tone]"
  >
    <span
      class="size-1.5 shrink-0 rounded-full"
      :class="dotClass[tone]"
      aria-hidden="true"
    />
    {{ label }}
  </span>
</template>
