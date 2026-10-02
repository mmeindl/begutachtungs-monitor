<script setup lang="ts">
/**
 * Which step of the Parliament's comparison is shown: „Im Ausschuss" or „Im
 * Plenum". Its own component because `LawDiffSection` renders it in two
 * places that are one place on screen — first in the toolbar over the list,
 * and alone at that spot where there is no list to read.
 */
import { LAW_STEP_LABEL, type LawStationPair } from '#shared/utils/lawStations'

const props = defineProps<{
  steps: LawStationPair[]
  current: LawStationPair
}>()

const emit = defineEmits<{ choose: [step: LawStationPair] }>()

const isCurrent = (step: LawStationPair) => step.from === props.current.from && step.to === props.current.to
</script>

<template>
  <UFieldGroup role="group" aria-label="Welcher Schritt im Parlament" class="shrink-0">
    <UButton
      v-for="step in steps"
      :key="`${step.from}>${step.to}`"
      :color="isCurrent(step) ? 'primary' : 'neutral'"
      :variant="isCurrent(step) ? 'subtle' : 'outline'"
      :aria-pressed="isCurrent(step)"
      size="sm"
      class="min-h-target"
      @click="emit('choose', step)"
    >
      {{ LAW_STEP_LABEL[step.to] }}
    </UButton>
  </UFieldGroup>
</template>
