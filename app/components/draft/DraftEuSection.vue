<script setup lang="ts">
/**
 * „Welches EU-Recht der Entwurf umsetzt" — an h3 section in „Der Entwurf",
 * after the comparison (docs/architecture.md §12.66): the acts, their
 * related counts, the deadline strip, the footnotes, the Vorblatt's
 * sentence (`DraftEuFact`) and the section's own credit line
 * (`DraftEuCredits`). Until 06.11.2026 it was a block of the procedure
 * card; the origin is a property of the text, so it stands with the text,
 * and the card keeps the spine, where „setzt EU-Recht um" is a fact of the
 * Entwurf station that jumps here (`utils/origin.ts`).
 *
 * Rendered only where the fact names an act: a marker without one is said
 * at the station alone, as plain text. The id is the block's old anchor.
 */
import type { EuRechtResponse } from '#shared/types'
import { euFactView, type EuTimelineContext } from '~/utils/euRecht'
import { EU_FACT_ANCHOR } from '~/utils/origin'

const props = defineProps<{
  data: EuRechtResponse | null | undefined
  timeline?: EuTimelineContext | null
  /** A Land's draft: who published the documents read (`DraftEuCredits`). */
  publisher?: string | null
}>()

const view = computed(() => euFactView(props.data))
const id = EU_FACT_ANCHOR.slice(1)
</script>

<template>
  <PageSubsection v-if="view?.acts.length" :id="id" :heading="view.heading">
    <DraftEuFact :data="data" :timeline="timeline" />
    <DraftEuCredits :data="data" :publisher="publisher" />
  </PageSubsection>
</template>
