<script setup lang="ts">
/**
 * The door of an Anliegen: Unterstützen and Stellung nehmen, each a button to
 * Parliament's own form (`anliegenSupportFormUrl`, `anliegenStatementFormUrl`).
 *
 * The accent-washed box is the one you act on (the box grammar, `FactList`),
 * so it renders only on an open flag of the item's own — the page decides
 * that (`anliegenParticipation`), and a closed window gets a muted line
 * instead, with no blue anywhere. No Frist and no countdown: the window has
 * none and closes, unannounced, when the item's treatment ends; the note
 * beside the buttons says exactly that.
 *
 * Parliament's own words on what an Unterstützung is for stand as a quote
 * with Parliament as its source: the monitor says nothing of its own about
 * what taking part achieves (framing rule).
 */
import type { AnliegenDoorView } from '~/utils/anliegenView'

defineProps<{ door: AnliegenDoorView }>()
</script>

<template>
  <div class="mt-6 rounded-xl border border-accent-200 bg-accent-50 p-4">
    <h2 class="font-sans text-base font-semibold text-ink">{{ door.heading }}</h2>
    <p class="mt-2 text-sm text-ink-secondary">{{ door.windowNote }}</p>
    <div class="mt-3 flex flex-wrap items-center gap-3">
      <DoorButton
        v-for="(action, i) in door.actions"
        :key="action.key"
        :href="action.href"
        :variant="i === 0 ? 'solid' : 'outline'"
      >
        {{ action.label }}
      </DoorButton>
    </div>
    <figure v-if="door.supportQuote" class="mt-3 text-sm text-ink-secondary">
      <blockquote>„{{ door.supportQuote.text }}“</blockquote>
      <figcaption class="mt-1 text-xs text-ink-muted">{{ door.supportQuote.source }}</figcaption>
    </figure>
  </div>
</template>
