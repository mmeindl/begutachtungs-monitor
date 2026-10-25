<script setup lang="ts">
import type { LandStatement } from '#shared/types'
import ListBox from '~/components/ui/ListBox.vue'
import {
  type StatementFilter,
  availableStatementFilters,
  STATEMENT_PAGE_SIZE,
} from '~/utils/statementRows'

/**
 * A Land's published Stellungnahmen, in the sheet the Ministerialentwurf's
 * have (22.10.2026): a statements table is something to operate, so it is
 * the white card (docs/architecture.md §12.39), with the same rows
 * (`StatementRow`) and columns. Until then it was a bare list ruled by
 * full-width hairlines — the variant §12.39 rejected, because such lines
 * read as slices of the page and echo its section dividers.
 *
 * The panel's tabs and pager since 23.10.2026: Organisationen,
 * Privatpersonen and Alle by the panel's own rule (`availableStatementFilters`),
 * ten rows a page (`STATEMENT_PAGE_SIZE`) — Tirol's TGADG carries 16, and a
 * Land's list was the one list of Stellungnahmen on the site that showed all
 * at once. Still no search and no sort: a Land counts no Zustimmungen to
 * sort by, so that column is not drawn either.
 *
 * Names only of organisations (`classifySubmitter`); a Land publishes a
 * private person's file only with consent, and the row then carries the
 * file without the name — as „Ohne Namen", the panel's word for a row the
 * classifier does not name.
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
   name after them. */
const rows = computed(() => {
  const all = props.statements ?? []
  const row = (s: LandStatement) => ({ key: s.url, label: s.name ?? 'Ohne Namen', submitter: s.name, date: s.date ?? null, url: s.url })
  return [...all.filter((s) => s.name).map(row), ...all.filter((s) => !s.name).map(row)]
})

const filterLabels: Record<StatementFilter, string> = {
  organisations: 'Organisationen',
  persons: 'Ohne Namen',
  nonpublic: 'Nicht öffentlich',
  all: 'Alle',
}
const counts = computed(() => {
  const organisations = rows.value.filter((r) => r.submitter).length
  return { organisations, privatePersons: rows.value.length - organisations, nonPublic: 0 }
})
const filterOptions = computed(() =>
  availableStatementFilters(counts.value).map((value) => ({
    value,
    label: filterLabels[value],
    count: value === 'organisations' ? counts.value.organisations : value === 'persons' ? counts.value.privatePersons : rows.value.length,
  })),
)
/* The first segment the draft has, as the panel lands; and back to it when
   the router reuses this component for a draft without that segment. */
const filter = ref<StatementFilter>(filterOptions.value[0]?.value ?? 'organisations')
watch(filterOptions, (options) => {
  if (!options.some((o) => o.value === filter.value)) filter.value = options[0]?.value ?? 'organisations'
})

const filtered = computed(() => {
  if (filter.value === 'organisations') return rows.value.filter((r) => r.submitter)
  if (filter.value === 'persons') return rows.value.filter((r) => !r.submitter)
  return rows.value
})
const { visible, shown, more, all: showAll } = usePagedList(filtered, STATEMENT_PAGE_SIZE, [filter])
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
      <!-- The space as a string: Vue's whitespace condensing drops a leading
           space inside `<template v-if>` („…veröffentlicht.Das Land …",
           23.10.2026). -->
      <template v-if="publicationNote">{{ ` ${publicationNote}` }}</template>
    </p>
    <template v-else>
      <!-- No text above the sheet: the tabs carry the counts, and the Land's
           publication rule only explains an empty list (23.10.2026). -->
      <ListBox class="@container/list mt-4">
        <template #tabs>
          <ListTabs
            v-model="filter"
            :options="filterOptions"
            group-label="Stellungnahmen nach Einbringer:in filtern"
            collapse
          />
        </template>
        <StatementColumnHeader :sortable="false" :sort="'date'" :endorsements="false" />
        <ul class="divide-y divide-hairline">
          <StatementRow
            v-for="row in shown"
            :key="row.key"
            :date="row.date"
            :label="row.label"
            :submitter="row.submitter"
            :files="[row.url]"
          />
        </ul>
        <ListMore
          :visible="visible"
          :total="filtered.length"
          :step="STATEMENT_PAGE_SIZE"
          @more="more()"
          @all="showAll(filtered.length)"
        />
      </ListBox>
      <SectionCredits :sources="[]" :marked="false">
        <span>Quelle: Land {{ landName }}</span>
        <!-- Not above the sheet (23.10.2026), but said: the list is what the
             Land published, not what it received (24.10.2026). -->
        <span :title="publicationNote ?? undefined">Nur, was das Land veröffentlicht – eingelangt sein können mehr</span>
        <NuxtLink to="/ueber#about-privacy" class="link-muted">Warum ohne Namen</NuxtLink>
        <ExternalLink v-if="statementsUrl" :href="statementsUrl" class="link-muted">Alle beim Land ansehen</ExternalLink>
      </SectionCredits>
    </template>
  </PageSubsection>
</template>
