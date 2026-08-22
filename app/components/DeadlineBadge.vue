<script setup lang="ts">
const props = defineProps<{
  deadline: string | null
  active: boolean
}>()

type Tone = 'critical' | 'serious' | 'neutral' | 'inactive'

const tone = computed<Tone>(() => {
  if (!props.active) return 'inactive'
  const days = daysUntil(props.deadline)
  if (days === null) return 'neutral'
  // Defense in depth alongside server-side reconcileActive: even with stale
  // client data an expired deadline renders muted, never as a red pill.
  if (days < 0) return 'inactive'
  if (days <= DEADLINE_CRITICAL_DAYS) return 'critical'
  if (days <= DEADLINE_SERIOUS_DAYS) return 'serious'
  return 'neutral'
})

const label = computed(() => fristLabel(props.deadline, props.active))

/* Status hue lives in dot + wash; the text stays in ink tokens so the pill
 * passes AA contrast at text-xs and meaning never rides on color alone —
 * the label text itself says how urgent it is. */
const pillClass: Record<Tone, string> = {
  critical: 'bg-status-critical/10 text-ink',
  serious: 'bg-status-serious/15 text-ink',
  neutral: 'bg-accent-wash text-ink',
  /* text-ink instead of -secondary: on the 15% wash, secondary drops below 7:1 */
  inactive: 'bg-ink-muted/15 text-ink',
}

const dotClass: Record<Tone, string> = {
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
