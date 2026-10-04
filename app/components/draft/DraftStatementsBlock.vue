<script setup lang="ts">
import type { DraftDetail } from '#shared/types'
import type { SourceEntry } from '#shared/utils/provenance'
import { countLabelDe, formatDateTimeDe, formatNumberDe } from '#shared/utils/format'

/**
 * The Begutachtung's Stellungnahmen on the draft page — the station's
 * content (04.10.2026, out of the page).
 *
 * A sub-section like the Entwurf's, spaced by the section body
 * (`space-y-8`): at mt-4 the heading stood closer to „Übermittelt" than the
 * facts stand to each other, and read as the list's next label
 * (01.10.2026).
 */
defineProps<{
  draft: DraftDetail
  /** The paginated list's endpoint (`/api/drafts/:gp/:inr/statements`). */
  listUrl: string
  /** The Begutachtung's window is open — the door card's condition. */
  filingOpen: boolean
}>()

/* The list's credit line: the Stellungnahmen are Begutachtung data, which
 * no open data grant covers. */
const STATEMENTS_SOURCES: SourceEntry[] = [{ what: 'Stellungnahmen', publisher: 'parlament', terms: 'keine-lizenz' }]
</script>

<template>
  <PageSubsection heading="Stellungnahmen">
    <!-- A state, not data: a sentence, not a card (02.10.2026). -->
    <p
      v-if="draft.statements.degraded"
      class="text-sm leading-relaxed text-ink-secondary"
    >
      {{ countLabelDe(draft.statements.total, 'Stellungnahme', 'Stellungnahmen') }}
      laut Übersicht; die Liste selbst ist gerade nicht abrufbar.
      <ExternalLink
        :href="draft.parliamentUrl"
        class="link-inline"
      >Auf parlament.gv.at ansehen</ExternalLink>
    </p>
    <template v-else-if="draft.statements.total > 0">
      <StatementsPanel :list-url="listUrl" :summary="draft.statements" />
      <!-- Silent disagreement between the two upstream sources is the
           one option that serves nobody — a journalist who cites the
           card's number and screenshots this page must not find a
           contradiction. -->
      <p
        v-if="
          draft.statements.overviewTotal != null
            && draft.statements.overviewTotal !== draft.statements.total
        "
        class="mt-3 text-xs text-ink-muted"
      >
        Das Parlament zählt
        {{ formatNumberDe(draft.statements.overviewTotal) }} Stellungnahmen,
        in der Liste stehen <template v-if="draft.statements.overviewTotal > draft.statements.total">bisher </template>{{ formatNumberDe(draft.statements.total) }}.
      </p>
      <p v-if="draft.statements.staleAsOf" class="mt-3 text-xs text-ink-muted">
        Stand der Liste: {{ formatDateTimeDe(draft.statements.staleAsOf) }}
        (die aktuelle ist gerade nicht abrufbar).
      </p>
      <!-- The list's credit line, as under every other data block
           (03.10.2026). It was the one without a foot — on the data
           with the heaviest editorial hand: the Einordnung in
           Organisationen/Privatpersonen/Nicht öffentlich is ours
           (privacy.ts), and that Privatpersonen stand without names
           is our rule, not Parliament's record — until here only the
           empty search state said so. -->
      <SectionCredits
        :sources="STATEMENTS_SOURCES"
        :marked="false"
        own="Einordnung der Einbringer:innen"
      >
        <NuxtLink to="/ueber#about-privacy" class="link-muted">Privatpersonen ohne Namen</NuxtLink>
      </SectionCredits>
    </template>
    <p v-else class="text-sm text-ink-secondary">
      {{ draft.active ? 'Noch keine Stellungnahmen. Die Frist läuft.' : 'Keine Stellungnahmen.' }}
    </p>
    <!-- The card's door once more, under the list where the decision
         to file is made (`DoorButton`). The card's condition. -->
    <div v-if="filingOpen" class="mt-4">
      <DoorButton :href="draft.parliamentUrl">
        Stellungnahme auf parlament.gv.at abgeben
      </DoorButton>
    </div>
  </PageSubsection>
</template>
