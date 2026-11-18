<script setup lang="ts">
/**
 * The „Zeitraum" select of a list, with a span of the reader's own as one
 * of its values (18.11.2026; /entwuerfe first, /anliegen the same day). The
 * caller passes the periods and the span as it stands; this component draws
 * them, so every list with a Zeitraum looks and behaves the same.
 *
 * While `span` is set, the select's own box shows the span as text
 * (`DateRangeButton`, a press opens the calendar) and the select is folded
 * to its chevron (`TokenSelect chevronOnly`). The box div always stands and
 * only the span button comes and goes before the select, so the select stays
 * the same element and keeps focus when „Eigener Zeitraum" is picked. The
 * span, its icon and the chevron fit the 254 px a 320 px phone leaves the
 * box. Why the span is a value of the select and not date fields beside it:
 * docs/decisions.md, „A span of the reader's own is one more value of the
 * same select".
 */
defineProps<{
  id: string
  /** The select's name for assistive technology; visually the options name it. */
  label: string
  options: readonly { value: string; label: string }[]
  /** The span of the reader's own while it applies, else null; `bis` '' runs to today. */
  span: { von: string; bis: string } | null
  /** The earliest day the calendar offers, ISO. */
  min: string
}>()
const model = defineModel<string>({ required: true })
const emit = defineEmits<{ span: [span: { von: string; bis: string }] }>()
</script>

<template>
  <div>
    <label :for="id" class="sr-only">{{ label }}</label>
    <div
      class="flex min-w-0"
      :class="span && 'min-h-target rounded-md border border-baseline bg-surface text-sm text-ink hover:border-hover-edge hover:bg-hover'"
    >
      <DateRangeButton
        v-if="span"
        :von="span.von"
        :bis="span.bis"
        :min="min"
        @change="emit('span', $event)"
      />
      <TokenSelect :id="id" v-model="model" block :chevron-only="!!span">
        <TokenOption v-for="opt in options" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </TokenOption>
      </TokenSelect>
    </div>
  </div>
</template>
