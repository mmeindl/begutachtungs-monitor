<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { formatDateDe } from '#shared/utils/format'
import { type CustomSpan, windowDatesDe } from '#shared/utils/periodCalendar'

/**
 * A span of the reader's own over a Periodenwechsel (18.11.2026,
 * `customSpanOf`): the list shows its part in the later period, and the
 * part before is named here and one press away (`to`, the same list with
 * that part as its span) — never dropped in silence. Shared by every list
 * with a „Zeitraum" (`SpanSelect`).
 */
const props = defineProps<{
  span: CustomSpan & { cut: NonNullable<CustomSpan['cut']> }
  to: RouteLocationRaw
}>()
const shownFrom = computed(() => formatDateDe(props.span.window.from))
const cutLabel = computed(() => windowDatesDe(props.span.cut))
</script>

<template>
  <GapNote kind="outOfScope">
    ein Zeitraum über den Beginn einer Gesetzgebungsperiode hinweg. Die
    Liste zeigt ihn ab {{ shownFrom }}, dem Beginn der {{ span.gp }}. GP;
    davor:
    <NuxtLink :to="to" class="link-inline font-medium">{{ cutLabel }}</NuxtLink>.
  </GapNote>
</template>
