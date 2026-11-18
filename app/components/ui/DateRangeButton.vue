<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date'
import { formatDateDe, todayIso } from '#shared/utils/format'

/**
 * A span of two days as one button, and a calendar under it to change it
 * (18.11.2026, the Zeitraum on /entwuerfe). It sits inside the caller's box,
 * which carries border, background and hover; the button paints none of
 * them, so the box has one hover, the same as the selects beside it.
 *
 * Why not two native date fields, which it replaced the same day: the
 * browser's picker cannot be styled or localised by the page — Chrome's
 * came up English on a German site — and its icons had no hover or cursor,
 * so the control read as a foreign part. The calendar here is Nuxt UI's in
 * the site's own face: selection is ink, the days between take the hover
 * fill, today is bold and underlined so it does not rest on colour, and
 * every day number stays at AAA (ink 18.7:1, ink on the fill 16.9:1, the
 * muted outside days 9.0:1, computed). Month names, weekdays and the week's
 * first day follow the app's locale (`UApp :locale` in app.vue).
 *
 * The first press on a day sets the start, the second the end, and only then
 * is the span applied — never half a span. „Bis heute" keeps the start and
 * leaves the end open. An open end (`bis` '') reads „heute" on the button
 * and runs to today in the calendar; it stays open in state and link.
 */
const props = defineProps<{
  /** First day, ISO; required while the span is shown. */
  von: string
  /** Last day, ISO; '' is open-ended. */
  bis: string
  /** The earliest day the calendar offers, ISO. */
  min: string
}>()
const emit = defineEmits<{ change: [span: { von: string; bis: string }] }>()

/* Copy in one place, so a second language replaces it here. */
const COPY = {
  name: 'Eigener Zeitraum',
  until: 'bis',
  today: 'heute',
  change: 'ändern',
  openEnd: 'Bis heute',
}

type Range = { start: DateValue | undefined; end: DateValue | undefined }

const open = ref(false)
const draft = shallowRef<Range>({ start: undefined, end: undefined })
const minValue = computed(() => (props.min ? parseDate(props.min) : undefined))
/* No day after today: every day a list cuts by lies in the past, so a later
 * one could only hold nothing (`orderedRange`). Today is the last day, and
 * „Bis heute" keeps the end open beyond it. */
const maxValue = computed(() => parseDate(todayIso()))

/* What the calendar shows when it opens: the span as it stands, an open end
 * running to today (a start never lies ahead, `orderedRange`). */
function currentRange(): Range {
  const start = parseDate(props.von)
  return { start, end: parseDate(props.bis || todayIso()) }
}
watch(open, (isOpen) => {
  if (isOpen) draft.value = currentRange()
})

function onRange(value: Range | null | undefined): void {
  draft.value = value ?? { start: undefined, end: undefined }
  if (!value?.start || !value.end) return
  emit('change', { von: value.start.toString(), bis: value.end.toString() })
  open.value = false
}
function openEnd(): void {
  const start = draft.value.start ?? parseDate(props.von)
  emit('change', { von: start.toString(), bis: '' })
  open.value = false
}

const endLabel = computed(() => (props.bis ? formatDateDe(props.bis) : COPY.today))
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ side: 'bottom', align: 'start', sideOffset: 5 }"
    :ui="{ content: 'rounded-xl bg-surface p-3 shadow-sm ring-0 border border-baseline' }"
  >
    <!-- The visible text is part of the name (WCAG 2.5.3): a speech user
         says the dates they see. The dash is read as „bis". -->
    <button
      type="button"
      class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-l-md pl-3 pr-2 text-left text-sm text-ink"
    >
      <UIcon name="i-lucide-calendar" class="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <span class="whitespace-nowrap">
        <span class="sr-only">{{ COPY.name }}: </span>{{ formatDateDe(von) }}
        <span aria-hidden="true">–</span><span class="sr-only">{{ COPY.until }}</span>
        {{ endLabel }}<span class="sr-only">, {{ COPY.change }}</span>
      </span>
    </button>
    <template #content>
      <UCalendar
        :model-value="draft"
        range
        size="lg"
        color="neutral"
        :min-value="minValue"
        :max-value="maxValue"
        initial-focus
        :ui="{
          root: 'text-ink',
          headingLabel: 'text-ink',
          headCell: 'text-ink-secondary',
          cellTrigger: 'cursor-pointer rounded-md text-ink hover:not-data-selected:bg-hover data-highlighted:bg-hover data-selected:bg-hover data-selected:text-ink data-selection-start:data-selected:bg-ink data-selection-start:data-selected:text-surface data-selection-end:data-selected:bg-ink data-selection-end:data-selected:text-surface data-today:font-bold data-today:underline data-today:underline-offset-4 data-today:not-data-selected:text-ink data-outside-view:text-ink-muted data-disabled:cursor-not-allowed data-disabled:text-ink-muted',
        }"
        @update:model-value="onRange"
      />
      <div class="mt-3 flex justify-end border-t border-hairline pt-3">
        <UButton color="neutral" variant="outline" size="sm" @click="openEnd">
          {{ COPY.openEnd }}
        </UButton>
      </div>
    </template>
  </UPopover>
</template>
