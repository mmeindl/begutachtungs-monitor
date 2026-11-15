<script setup lang="ts">
/**
 * The Begutachtung's door as two buttons, one per form Parliament offers
 * (15.11.2026). Parliament's page hides both forms behind closed accordions
 * on a tab that is not the one it opens on; each button lands in its form,
 * open (`statementFormUrl`). The reader chooses here, where the labels say
 * what the choice is, instead of being told where to click over there.
 *
 * Each label names the whole action, so it reads alone in a link list.
 * Both solid: two equal ways to one action, neither the lesser one.
 * No wrapper: the buttons join the row they are placed in.
 */
import { statementFormUrl } from '#shared/utils/statementForm'

const props = defineProps<{
  /** The draft's page at Parliament. */
  itemUrl: string
}>()

const personUrl = computed(() => statementFormUrl(props.itemUrl, 'person'))
const organisationUrl = computed(() => statementFormUrl(props.itemUrl, 'organisation'))
</script>

<template>
  <DoorButton :href="personUrl">Stellungnahme als Privatperson</DoorButton>
  <DoorButton :href="organisationUrl">Stellungnahme für eine Organisation</DoorButton>
</template>
