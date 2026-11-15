<script setup lang="ts">
/**
 * The door of an Anliegen: Unterstützen and Stellung nehmen, each a button to
 * Parliament's own form (`anliegenSupportFormUrl`, `anliegenStatementFormUrl`),
 * the Stellungnahme's as two, one per form, each landing in it opened. All
 * solid: the actions are independent and open at the same time, so none
 * steps back (15.11.2026; until then the first was solid, the rest outline).
 *
 * The accent-washed box is the one you act on (the box grammar, `FactList`),
 * so it renders only on an open flag of the item's own — the page decides
 * that (`anliegenParticipation`), and a closed window gets a muted line
 * instead, with no blue anywhere. No Frist and no countdown: the window has
 * none and closes, unannounced, when the item's treatment ends; the note
 * under the heading says exactly that, for both actions.
 *
 * ONE GROUP PER ACTION (15.11.2026): what an action brings, in Parliament's
 * words (`SourceQuote`), directly above that action's buttons — the
 * Unterstützung's quote over „Unterstützen", the Stellungnahme's over its
 * two forms. Two quotes above one row of three buttons left the reader to
 * pair them. The monitor says nothing of its own about what taking part
 * achieves (framing rule).
 */
import type { AnliegenDoorView } from '~/utils/anliegenView'

const props = defineProps<{ door: AnliegenDoorView }>()

/* The actions split by what they do; each group renders only with buttons. */
const groups = computed(() => [
  { key: 'support', quote: props.door.supportQuote, actions: props.door.actions.filter((a) => a.key === 'support') },
  { key: 'statement', quote: props.door.statementQuote, actions: props.door.actions.filter((a) => a.key !== 'support') },
].filter((g) => g.actions.length > 0))
</script>

<template>
  <div class="mt-6 rounded-xl border border-accent-200 bg-accent-50 p-4">
    <h2 class="font-sans text-base font-semibold text-ink">{{ door.heading }}</h2>
    <p class="mt-2 text-sm text-ink-secondary">{{ door.windowNote }}</p>
    <div v-for="(group, i) in groups" :key="group.key" :class="i > 0 ? 'mt-5' : ''">
      <SourceQuote v-if="group.quote" :text="group.quote.text" :source="group.quote.source" />
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <DoorButton
          v-for="action in group.actions"
          :key="action.key"
          :href="action.href"
        >
          {{ action.label }}
        </DoorButton>
      </div>
    </div>
  </div>
</template>
