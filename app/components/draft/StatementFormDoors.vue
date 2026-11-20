<script setup lang="ts">
/**
 * A Parliament door as two buttons, one per form Parliament offers
 * (15.11.2026). Parliament's page hides both forms behind closed accordions
 * on a tab that is not the one it opens on; each button lands in its form,
 * open (`statementFormUrl`). The reader chooses here, where the labels say
 * what the choice is, instead of being told where to click over there.
 * The rule: `docs/decisions.md`, „A door lands in the form".
 *
 * Each label names the whole action, so it reads alone in a link list.
 * The item is named by the door card's heading, never by the label: two
 * open windows are two cards, each headed by its own window (20.11.2026;
 * from 15.11. a shared card named the Vorlage in its pair's labels).
 * Both buttons share one weight: two equal ways to one action. A second
 * window's pair gets its own door card, never a lighter style
 * (`DraftDoorCard`, 20.11.2026).
 * No wrapper: the buttons join the row they are placed in.
 */
import { statementFormUrl } from '#shared/utils/statementForm'

const props = defineProps<{
  /** The item's page at Parliament. */
  itemUrl: string
}>()

const personUrl = computed(() => statementFormUrl(props.itemUrl, 'person'))
const organisationUrl = computed(() => statementFormUrl(props.itemUrl, 'organisation'))
</script>

<template>
  <DoorButton :href="personUrl">Stellungnahme als Privatperson</DoorButton>
  <DoorButton :href="organisationUrl">Stellungnahme für eine Organisation</DoorButton>
</template>
