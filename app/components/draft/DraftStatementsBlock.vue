<script setup lang="ts">
import type { DraftDetail } from '#shared/types'
import type { SourceEntry } from '#shared/utils/provenance'
import { countLabelDe, formatDateTimeDe, formatNumberDe } from '#shared/utils/format'
import { countDriftSentenceDe } from '~/utils/statementRows'

/**
 * The Begutachtung's Stellungnahmen on the draft page — the station's
 * content (04.10.2026, out of the page).
 *
 * A sub-section like the Entwurf's, spaced by the section body
 * (`space-y-8`): at mt-4 the heading stood closer to „Übermittelt" than the
 * facts stand to each other, and read as the list's next label
 * (01.10.2026).
 */
const props = defineProps<{
  draft: DraftDetail
  /** The paginated list's endpoint (`/api/drafts/:gp/:inr/statements`). */
  listUrl: string
  /** The Begutachtung's window is open — the door card's condition. */
  filingOpen: boolean
}>()

/* Above STATEMENTS_CAP only the institutions are read and `unlisted`
 * counts the rest (since 22.10.2026) — the state the Vorlage's list has
 * been in since 26.09.2026, and rendered the way `RvStatements` renders it:
 * the count as a sentence, the panel over what was read, and no „Alle" on
 * it, which would state the institutions' number as the total. */
const unlisted = computed(() => props.draft.statements.unlisted ?? 0)
const readCount = computed(() => {
  const { organisations, privatePersons, nonPublic } = props.draft.statements
  return organisations + privatePersons + nonPublic
})

/* Silent disagreement between the two upstream sources is the one option
 * that serves nobody — a journalist who cites the card's number and
 * screenshots this page must not find a contradiction. The sentence, and
 * the singular it needs where either side is one, are `countDriftSentenceDe`.
 *
 * Its „bisher" says the list lags behind the counter, which is true only
 * because `total` is list 142's own count: a list that does not arrive
 * whole is refused rather than counted, and above the cap `total` is the
 * count, not the rows read (22.10.2026). Before, 164/ME printed „in der
 * Liste stehen bisher 100.000" — where `showAll` had cut 106,183 short. */
const countDrift = computed(() => {
  const { overviewTotal, total } = props.draft.statements
  return overviewTotal != null && overviewTotal !== total ? countDriftSentenceDe(overviewTotal, total) : null
})

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
      <!-- Only where the panel cannot carry the count: above the cap its
           buttons count what was read. The same sentence as the Vorlage's
           (`RvStatements`) — the rest is stated as what upstream counts,
           not as Privatpersonen, because the flag that split it separates
           institutions from everything else. -->
      <p v-if="unlisted > 0" class="text-sm text-ink">
        {{ countLabelDe(draft.statements.total, 'Stellungnahme', 'Stellungnahmen') }}.
        Aufgeschlüsselt sind nur die Organisationen, die übrigen
        {{ formatNumberDe(unlisted) }} nicht.
      </p>
      <StatementsPanel
        v-if="readCount > 0"
        :list-url="listUrl"
        :summary="draft.statements"
        :partial="unlisted > 0"
      />
      <!-- The two upstream counts, where they disagree (`countDrift`). -->
      <p v-if="countDrift" class="mt-3 text-xs text-ink-muted">
        {{ countDrift }}
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
           empty search state said so. Under the panel only, as under the
           Vorlage's: a bare count above the cap classifies nothing. -->
      <SectionCredits
        v-if="readCount > 0"
        :sources="STATEMENTS_SOURCES"
        :marked="false"
        own="Einordnung der Einbringer:innen"
      >
        <NuxtLink to="/ueber#about-privacy" class="link-muted">Warum ohne Namen</NuxtLink>
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
