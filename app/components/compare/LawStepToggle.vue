<script setup lang="ts">
/**
 * Which step of the Parliament's comparison is shown: „Im Ausschuss" or „Im
 * Plenum". Its own component because `LawDiffSection` renders it in two
 * places that are one place on screen — as the tabs of the list's box, and
 * alone at that spot where there is no list to read.
 *
 * Tabs since 02.10.2026 (`ListTabs`): the step chooses WHAT is compared, the
 * first layer of a list box, not how it is read. Two short labels fit every
 * phone, so they never collapse into a select.
 */
import { LAW_STEP_LABEL, type LawStationPair } from '#shared/utils/lawStations'

const props = defineProps<{
  steps: LawStationPair[]
  current: LawStationPair
}>()

const emit = defineEmits<{ choose: [step: LawStationPair] }>()

const keyOf = (step: LawStationPair) => `${step.from}>${step.to}`

const options = computed(() => props.steps.map((step) => ({ value: keyOf(step), label: LAW_STEP_LABEL[step.to] ?? step.to })))

const selected = computed({
  get: () => keyOf(props.current),
  set: (value: string) => {
    const step = props.steps.find((s) => keyOf(s) === value)
    if (step) emit('choose', step)
  },
})
</script>

<template>
  <ListTabs v-model="selected" :options="options" group-label="Welcher Schritt im Parlament" />
</template>
