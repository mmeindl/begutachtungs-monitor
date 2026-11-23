<script setup lang="ts">
/**
 * What a reader can expect after filing, closed under Parliament's quote on
 * a door card (23.11.2026). A Begutachtung is expert input and not a vote,
 * and whoever expects a vote is disappointed by a law that passes unchanged.
 *
 * Closed on purpose: open beside the buttons, „keine Antwort" reads as
 * „filing is pointless" (`RvStatements`, `routeNote`). The question is
 * answered for whoever asks it. The rule: `docs/decisions.md`, „What a
 * reader can expect from a Stellungnahme".
 */
import { STATEMENT_EXPECTATION_DE, type StatementRound } from '~/utils/statementQuote'

const props = defineProps<{
  round: StatementRound
}>()

const source = computed(() => STATEMENT_EXPECTATION_DE.source(props.round))
</script>

<template>
  <div class="mt-2 flex flex-wrap items-center text-sm text-ink-secondary">
    <TermNote>
      {{ STATEMENT_EXPECTATION_DE.label }}
      <template #note>
        <p class="hyphens-auto text-sm leading-relaxed text-ink-secondary">
          {{ STATEMENT_EXPECTATION_DE.text(round) }}
          <ExternalLink v-if="source" :href="source.href" class="link-muted">{{ source.label }}</ExternalLink>
        </p>
      </template>
    </TermNote>
  </div>
</template>
