<script setup lang="ts">
import type { LandStatement } from '#shared/types'
import { countLabelDe } from '#shared/utils/format'
import ListBox from '~/components/ui/ListBox.vue'

/**
 * A Land's published Stellungnahmen, in the sheet the Ministerialentwurf's
 * have (22.10.2026): a statements table is something to operate, so it is
 * the white card (docs/architecture.md §12.39), with the same rows
 * (`StatementRow`) and columns. Until then it was a bare list ruled by
 * full-width hairlines — the variant §12.39 rejected, because such lines
 * read as slices of the page and echo its section dividers.
 *
 * Fewer tools than the panel: no search, no sort, no tabs. A Land publishes
 * a few dozen at most, where the panel draws none of them either; and it
 * counts no Zustimmungen, so that column is not drawn.
 *
 * Names only of organisations (`classifySubmitter`); a Land publishes a
 * private person's file only with consent, and the row then carries the
 * file without the name.
 */
const props = defineProps<{
  /** Null when the Land's page could not be read. */
  statements: LandStatement[] | null
  /** The Land's own page of them. */
  statementsUrl: string | null
  /** The Begutachtung still runs: „noch keine" rather than „keine". */
  active: boolean
  /** The Land's rule for publishing, where it states one. */
  publicationNote: string | null
  landName: string
}>()

/* Organisations first, by date as the Land lists them; the files without a
   name after them, numbered so they can be told apart. */
const rows = computed(() => {
  const all = props.statements ?? []
  const named = all.filter((s) => s.name)
  const unnamed = all.filter((s) => !s.name)
  return [
    ...named.map((s) => ({ key: s.url, label: s.name!, submitter: s.name, date: s.date ?? null, url: s.url })),
    ...unnamed.map((s, i) => ({
      key: s.url,
      label: unnamed.length > 1 ? `Einbringer nicht angezeigt (${i + 1})` : 'Einbringer nicht angezeigt',
      submitter: null,
      date: s.date ?? null,
      url: s.url,
    })),
  ]
})
</script>

<template>
  <PageSubsection heading="Stellungnahmen">
    <p v-if="statements === null" class="text-sm text-ink-secondary">
      <template v-if="statementsUrl">
        Gerade nicht abrufbar –
        <ExternalLink :href="statementsUrl" class="link-inline font-medium">beim Land nachsehen</ExternalLink>.
      </template>
      <template v-else>Das Land veröffentlicht zu diesem Entwurf keine Stellungnahmen.</template>
    </p>
    <p v-else-if="!statements.length" class="text-sm text-ink-secondary">
      <template v-if="active">Bisher keine veröffentlicht.</template>
      <template v-else>Das Land hat zu diesem Entwurf keine Stellungnahmen veröffentlicht.</template>
      <template v-if="publicationNote"> {{ publicationNote }}</template>
    </p>
    <template v-else>
      <!-- The count and the Land's rule above the sheet, as the
           Ministerialentwurf's count stands above its panel. -->
      <p class="text-sm text-ink-secondary">
        {{ countLabelDe(statements.length, 'veröffentlichte Stellungnahme', 'veröffentlichte Stellungnahmen') }}.
        <template v-if="publicationNote">{{ publicationNote }}</template>
      </p>
      <ListBox class="@container/list mt-4">
        <StatementColumnHeader :sortable="false" :sort="'date'" :endorsements="false" />
        <ul class="divide-y divide-hairline">
          <StatementRow
            v-for="row in rows"
            :key="row.key"
            :date="row.date"
            :label="row.label"
            :submitter="row.submitter"
            :files="[row.url]"
          />
        </ul>
      </ListBox>
      <SectionCredits :sources="[]" :marked="false">
        <span>Quelle: Land {{ landName }}</span>
        <span>Namen nennt der Monitor nur bei Organisationen</span>
        <ExternalLink v-if="statementsUrl" :href="statementsUrl" class="link-muted">Alle beim Land ansehen</ExternalLink>
      </SectionCredits>
    </template>
  </PageSubsection>
</template>
