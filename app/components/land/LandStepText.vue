<script setup lang="ts">
import type { LandProcedureStep } from '#shared/types'

/**
 * One step of a Landtag's record, in its words, linked as the record links
 * it: where the link covers only the end („… in der XXIX. GP" +
 * „Wortprotokolle des Oö. Landtags", `linkText`), only the end is the link.
 * It linked the whole sentence until 22.10.2026, which read as if the
 * sitting itself were the document.
 */
const props = defineProps<{ step: LandProcedureStep }>()

const lead = computed(() =>
  props.step.linkText ? props.step.label.slice(0, -props.step.linkText.length).trimEnd() : null)
</script>

<template>
  <template v-if="step.url && lead !== null">
    {{ lead }} <ExternalLink :href="step.url" class="link-inline">{{ step.linkText }}</ExternalLink>
  </template>
  <ExternalLink v-else-if="step.url" :href="step.url" class="link-inline">{{ step.label }}</ExternalLink>
  <template v-else>{{ step.label }}</template>
</template>
