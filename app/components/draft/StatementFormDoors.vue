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
 * `subject` names the item only where a card offers two of these pairs —
 * the draft's and the Regierungsvorlage's — so no two buttons read alike.
 * Alone, the card's heading or the section names the item, and the subject
 * only made the buttons long (15.11.2026).
 * Both buttons share one weight: two equal ways to one action. `variant`
 * steps the pair back as a whole, where a second window's pair stands
 * beside the first's.
 * No wrapper: the buttons join the row they are placed in.
 */
import { statementFormUrl } from '#shared/utils/statementForm'

const props = withDefaults(defineProps<{
  /** The item's page at Parliament. */
  itemUrl: string
  /** „zur Regierungsvorlage" → „Stellungnahme zur Regierungsvorlage als Privatperson". */
  subject?: string
  variant?: 'solid' | 'outline'
}>(), { subject: undefined, variant: 'solid' })

const lead = computed(() => (props.subject ? `Stellungnahme ${props.subject}` : 'Stellungnahme'))
const personUrl = computed(() => statementFormUrl(props.itemUrl, 'person'))
const organisationUrl = computed(() => statementFormUrl(props.itemUrl, 'organisation'))
</script>

<template>
  <DoorButton :href="personUrl" :variant="variant">{{ lead }} als Privatperson</DoorButton>
  <DoorButton :href="organisationUrl" :variant="variant">{{ lead }} für eine Organisation</DoorButton>
</template>
