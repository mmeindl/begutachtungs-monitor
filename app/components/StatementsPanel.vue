<script setup lang="ts">
import type {
  StatementMeta,
  StatementsResponse,
  StatementsSummary,
} from '#shared/types'

const props = defineProps<{
  gp: string
  inr: number
  summary: StatementsSummary
}>()

const PAGE_SIZE = 25

/**
 * One list with a filter, not three stacked lists. The panel used to show a
 * ranked organisation block, a fold with the rest of the organisations, and a
 * second fold with the anonymous half — three row shapes and two disclosures
 * for what is one set of Stellungnahmen. The segments below are the same four
 * groups the legend above counts, so the filter needs no explaining, and the
 * old ranked/folded split collapses into a sort: the top of the organisation
 * list IS "die meisten Zustimmungen".
 */
type StatementFilter = 'organisations' | 'persons' | 'nonpublic' | 'all'

/* Default first, as on the archive page: the leftmost segment reads as "where
 * am I", so it must be the state the page lands in. That has to be
 * Organisationen — they come from the SSR summary, while everything else needs
 * the lazy list-142 fetch, and 700 rows have no business in every page view. */
const filterOptions: { value: StatementFilter; label: string }[] = [
  { value: 'organisations', label: 'Organisationen' },
  { value: 'persons', label: 'Privatpersonen' },
  { value: 'nonpublic', label: 'Nicht öffentlich' },
  { value: 'all', label: 'Alle' },
]

const filter = ref<StatementFilter>('organisations')

/**
 * Sort is its own axis, independent of the filter: the two orders answer
 * different questions — "who mobilized" and "what came in last" — and neither
 * is the right default for every reader. Zustimmungen leads because it is the
 * only key that ranks an anonymous row, and because it is the order the
 * segments had before this control existed.
 *
 * ISO dates sort lexicographically, and a missing date ends up last, where it
 * belongs: it carries no position in a chronology.
 */
type StatementSort = 'endorsements' | 'date'

const sortOptions: { value: StatementSort; label: string }[] = [
  { value: 'endorsements', label: 'Meiste Zustimmungen' },
  { value: 'date', label: 'Neueste' },
]

const sort = ref<StatementSort>('endorsements')
const visibleCount = ref(PAGE_SIZE)

/* Lazy: nothing is requested until a segment needs the item list
 * (immediate: false leaves status at 'idle' until execute()). */
const { data, status, execute } = useFetch<StatementsResponse>(
  () => `/api/consultations/${props.gp}/${props.inr}/statements`,
  { immediate: false },
)

const needsList = computed(() => filter.value !== 'organisations')

watch(filter, async (value) => {
  visibleCount.value = PAGE_SIZE
  if (value !== 'organisations' && status.value === 'idle') {
    await execute()
  }
})

/* A new order means a new first page — keeping 75 rows open across a re-sort
 * would show the top of one order and the middle of the other. */
watch(sort, () => {
  visibleCount.value = PAGE_SIZE
})

type SortableRow = { endorsements: number; date: string | null }

/* Both keys are always applied; the control only decides which one leads. */
function compareRows(a: SortableRow, b: SortableRow): number {
  const byEndorsements = b.endorsements - a.endorsements
  const byDate = (b.date ?? '').localeCompare(a.date ?? '')
  return sort.value === 'endorsements'
    ? byEndorsements || byDate
    : byDate || byEndorsements
}

/* The item list is one row per Stellungnahme — no grouping. An organisation
 * that filed twice therefore appears twice under "Alle", which is what a raw
 * list should show; the grouped view is the Organisationen segment. */
const items = computed<StatementMeta[]>(() => {
  const all = [...(data.value?.items ?? [])].sort(compareRows)
  if (filter.value === 'persons') {
    return all.filter((s) => s.submitterKind === 'person')
  }
  if (filter.value === 'nonpublic') {
    return all.filter((s) => s.submitterKind === 'nonpublic')
  }
  return all
})

const visibleItems = computed(() => items.value.slice(0, visibleCount.value))
const hasMore = computed(
  () => needsList.value && items.value.length > visibleCount.value,
)

/* One staleness sentence per page. When the summary above is already a
 * last-good fallback, the detail page states it under this panel and the
 * list would only repeat it. This note is for the other case: the summary
 * rendered live, and by the time the user switched segments the cache
 * window had passed and the list-142 fetch failed. */
const listStaleAsOf = computed(() =>
  !props.summary.staleAsOf ? (data.value?.staleAsOf ?? null) : null,
)

/* GDPR defense in depth: persons and non-public submissions always render a
 * fixed label — never a name — regardless of what the API delivered. */
function submitterLabel(s: StatementMeta): string {
  if (s.submitterKind === 'organisation') return s.submitterName ?? 'Organisation'
  if (s.submitterKind === 'nonpublic') return 'Nicht-öffentliche Stellungnahme'
  return 'Privatperson'
}

/* Same guard for the link's accessible name: only an organisation is named. */
function submitterName(s: StatementMeta): string | null {
  return s.submitterKind === 'organisation' ? s.submitterName : null
}

/* "Zustimmung" is the Parliament's own term (upstream field: approvals) —
 * the vocabulary must survive the click-through to parlament.gv.at. */
function endorsementLabel(n: number): string {
  return countLabelDe(n, 'Zustimmung', 'Zustimmungen')
}

function statementCountLabel(n: number): string {
  return countLabelDe(n, 'Stellungnahme', 'Stellungnahmen')
}

const miniStats = computed(() => [
  { label: 'Gesamt', value: props.summary.total },
  { label: 'Organisationen', value: props.summary.organisations },
  { label: 'Privatpersonen', value: props.summary.privatePersons },
  { label: 'Nicht öffentlich', value: props.summary.nonPublic },
])

type OrgEntry = StatementsSummary['organisationList'][number]

/* Same comparator as the item lists, so the whole panel orders alike. A
 * grouped entry sorts by its LATEST submission, and prints that same date
 * when its statements span more than one day — so a row always sits where
 * its printed date says it does. The name breaks remaining ties, which is
 * most of them: without endorsements and on a shared date, a name you can
 * scan for is the only useful order.
 * (Spread first: this must never sort the prop.) */
function orgSortDate(org: OrgEntry): string | null {
  return org.statements.reduce<string | null>(
    (latest, s) => ((s.date ?? '') > (latest ?? '') ? s.date : latest),
    null,
  )
}

const sortedOrgs = computed(() =>
  [...props.summary.organisationList].sort(
    (a, b) =>
      compareRows(
        { endorsements: a.endorsements, date: orgSortDate(a) },
        { endorsements: b.endorsements, date: orgSortDate(b) },
      ) || a.name.localeCompare(b.name, 'de'),
  ),
)

/**
 * One organisation, several Stellungnahmen: the entry is grouped
 * server-side, so a row can stand for more than one submission — and then it
 * always opens into the sub-list.
 *
 * Because the number that matters is counted PER STELLUNGNAHME: a Zustimmung
 * means someone read that text and signed it. A row that folds three
 * documents into one line can only show their sum, which is an index number
 * — it explains where the row sits in "Meiste Zustimmungen" and describes
 * nothing anyone endorsed. So the parts get their own rows, and the sum
 * stays on the group row wearing the word "gesamt".
 */

/* The day the organisation filed when that is one day, the latest otherwise
 * (the sub-list carries the exact ones then). "–" stays what it has to mean:
 * upstream ships no date for this submission. */
function orgRowDate(org: OrgEntry): string | null {
  const dates = org.statements.map((s) => s.date)
  return new Set(dates).size === 1 ? (dates[0] ?? null) : orgSortDate(org)
}

const orgRows = computed(() =>
  sortedOrgs.value.map((org) => {
    const expanded = org.statements.length > 1
    return {
      /* The sub-rows obey the control the reader set, like every other row
       * in the panel: under "Neueste" a group whose parent prints its LATEST
       * date must not open with its oldest submission, and under "Meiste
       * Zustimmungen" it would be the one list ignoring the key everything
       * else is ranked by. The comparator applies both keys, so the sequence
       * a multi-day group is there to show survives either way — reversed
       * under "Neueste", which is the direction the reader asked for.
       * (Copy, never a sort in place: `summary` is a prop.) */
      org: { ...org, statements: [...org.statements].sort(compareRows) },
      expanded,
      row: {
        date: orgRowDate(org),
        label: org.name,
        links: expanded
          ? null
          : org.statements.map((s) => ({ citation: s.citation, href: s.parliamentUrl })),
        detail: expanded ? statementCountLabel(org.statements.length) : null,
        submitter: org.name,
      },
    }
  }),
)

/* ORG_LIST_CAP is set far above every population measured in GP XXVIII, so
 * this is a guard against a future outlier, not a normal state. Counted in
 * statements on both sides: `organisations` counts statements, and a listed
 * entry can stand for several of them. */
const listedOrgStatements = computed(() =>
  props.summary.organisationList.reduce((n, o) => n + o.statements.length, 0),
)
const hiddenOrgCount = computed(() =>
  Math.max(0, props.summary.organisations - listedOrgStatements.value),
)

/* True when a row can stand for more than one submission. Decides the shape
 * of the count line, which is the whole explanation: "23 Stellungnahmen von
 * 22 Organisationen" says a row holds more than one without a sentence
 * saying so, and the grouped row itself states its count and lists them. */
const orgsFiledRepeatedly = computed(
  () =>
    props.summary.organisationList.length > 0 &&
    listedOrgStatements.value !== props.summary.organisationList.length,
)

/* What the segment would hold, known from the summary before the list is
 * fetched — so the count line says something during the first load instead
 * of flashing a zero. */
const expectedCount = computed(() => {
  switch (filter.value) {
    case 'organisations':
      return props.summary.organisationList.length
    case 'persons':
      return props.summary.privatePersons
    case 'nonpublic':
      return props.summary.nonPublic
    default:
      return props.summary.total
  }
})

/* How much of the segment is on screen — no sort label any more, the control
 * above says that. Announced (aria-live), since switching a control changes
 * the list below without moving focus. */
const countLine = computed(() => {
  if (!needsList.value) {
    const orgs = countLabelDe(
      sortedOrgs.value.length,
      'Organisation',
      'Organisationen',
    )
    /* Both numbers in one line when they differ, so "22 Organisationen" is
     * not stated twice under each other. */
    const head = orgsFiledRepeatedly.value
      ? `${statementCountLabel(listedOrgStatements.value)} von ${orgs}`
      : orgs
    return head
  }
  const total = status.value === 'success' ? items.value.length : expectedCount.value
  const shown = Math.min(visibleCount.value, total)
  const head =
    shown < total
      ? `${formatNumberDe(shown)} von ${formatNumberDe(total)} angezeigt`
      : statementCountLabel(total)
  return head
})

/* Submitter mix as one stacked bar — "707, davon 96 % Privatpersonen" in a
 * glance (org-mobilization vs. citizen-wave is a journalistic signature).
 * The <dl> above IS the legend with exact numbers, so the bar itself stays
 * aria-hidden decoration; segment order mirrors the <dl>. */
const mixSegments = computed(() => {
  const t = props.summary.total
  if (t <= 0) return []
  return [
    { key: 'orgs', count: props.summary.organisations, class: 'bg-accent' },
    { key: 'persons', count: props.summary.privatePersons, class: 'bg-accent-200' },
    /* baseline, not hairline: hairline on surface is ~1.2:1, invisible */
    { key: 'nonpublic', count: props.summary.nonPublic, class: 'bg-baseline' },
  ]
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, pct: (s.count / t) * 100 }))
})

</script>

<template>
  <div>
    <!-- Mini stats -->
    <dl class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div v-for="stat in miniStats" :key="stat.label">
        <dt class="text-sm text-ink-secondary">{{ stat.label }}</dt>
        <!-- Number scale: tiles 3xl–4xl (StatTile), inline stats 2xl —
             nothing in between. -->
        <dd class="mt-0.5 font-heading text-2xl font-semibold text-ink">
          {{ formatNumberDe(stat.value) }}
        </dd>
      </div>
    </dl>

    <!-- Mix bar (decorative; the <dl> above is the legend) -->
    <div
      v-if="mixSegments.length"
      class="mt-3 flex h-2 w-full overflow-hidden rounded-[2px] border border-hairline"
      aria-hidden="true"
    >
      <div
        v-for="seg in mixSegments"
        :key="seg.key"
        :class="seg.class"
        :style="{ width: `${seg.pct}%` }"
      />
    </div>

    <!-- Visible text, not a tooltip: the two terms the panel can't do
         without, explained once (AAA: no hover-only information). -->
    <p class="mt-3 text-sm text-ink-secondary">
      Zustimmungen: Personen, die sich einer veröffentlichten Stellungnahme
      auf parlament.gv.at angeschlossen haben. Nicht öffentlich:
      Stellungnahmen, die auf Wunsch der Einbringer:innen nicht
      veröffentlicht wurden.
    </p>

    <!-- Two axes, two groups: WHO filed (the legend's own four groups, so the
         counts stay up there and these labels carry none) and IN WHICH ORDER.
         Keeping them apart is what let the count line stop naming the sort. -->
    <div class="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
      <!-- Four labels this long cannot fit a phone column — the text alone is
           ~330px against 288px at 320px wide — and left to overflow, the
           browser scales the whole page down to fit them. So this one group
           scrolls sideways instead; the sort group beside it fits and stays
           whole on its own line. -->
      <div class="min-w-0 max-w-full overflow-x-auto">
        <UFieldGroup role="group" aria-label="Stellungnahmen nach Einbringer:in filtern">
          <UButton
            v-for="opt in filterOptions"
            :key="opt.value"
            :color="filter === opt.value ? 'primary' : 'neutral'"
            :variant="filter === opt.value ? 'subtle' : 'outline'"
            :aria-pressed="filter === opt.value"
            class="min-h-11"
            @click="filter = opt.value"
          >
            {{ opt.label }}
          </UButton>
        </UFieldGroup>
      </div>

      <UFieldGroup role="group" aria-label="Stellungnahmen sortieren">
        <UButton
          v-for="opt in sortOptions"
          :key="opt.value"
          :color="sort === opt.value ? 'primary' : 'neutral'"
          :variant="sort === opt.value ? 'subtle' : 'outline'"
          :aria-pressed="sort === opt.value"
          class="min-h-11"
          @click="sort = opt.value"
        >
          {{ opt.label }}
        </UButton>
      </UFieldGroup>
    </div>

    <p class="mt-4 text-sm text-ink-muted" aria-live="polite">{{ countLine }}</p>
    <!-- Same wording as the summary-level note on the detail page: a stale
         list must never read as the current one. -->
    <p v-if="needsList && listStaleAsOf" class="mt-1 text-xs text-ink-muted">
      Stand der Liste: {{ formatDateTimeDe(listStaleAsOf) }} – die aktuelle
      Liste ist auf parlament.gv.at derzeit nicht abrufbar.
    </p>

    <h3 class="sr-only">Liste der Stellungnahmen</h3>
    <!-- Named query container: the rows inside decide their layout on THIS
         box's width (row-cols in main.css), not on the window's — the panel
         never gets wider than the page's max-w-3xl column. -->
    <div
      class="@container/list mt-3 overflow-hidden rounded-xl border border-hairline bg-surface"
    >
      <!-- Organisations: from the SSR summary, so they are in the HTML a
           crawler and a find-in-page see — which is what lets an organisation
           find itself on this page. -->
      <template v-if="!needsList">
        <ul v-if="orgRows.length" class="divide-y divide-hairline">
          <StatementRow
            v-for="{ org, row, expanded } in orgRows"
            :key="org.name"
            v-bind="row"
          >
            <!-- Upstream counts Zustimmungen per Stellungnahme; this is the
                 organisation's sum, and it says so on every row that stands
                 for more than one of them — not only where the sub-list puts
                 the parts on screen. A row citing three documents otherwise
                 states a number that belongs to none of them alone, and the
                 reader who clicks one through finds a smaller one. The parts
                 stay upstream, one click away. -->
            <template v-if="org.endorsements > 0" #meta>
              {{ endorsementLabel(org.endorsements) }}
              <span
                v-if="expanded"
                class="text-xs text-ink-muted row-cols:block"
              >gesamt</span>
            </template>
            <!-- The v-if belongs on the slot, not inside it: passing a
                 default slot that renders nothing still costs the row its
                 full-width slot line and the gap above it. -->
            <template v-if="expanded" #default>
              <OrganisationStatementLinks :org="org" />
            </template>
          </StatementRow>
        </ul>
        <div v-else class="p-5">
          <EmptyState
            title="Keine Organisationen"
            description="Zu diesem Entwurf haben nur Privatpersonen eingereicht."
          />
        </div>
      </template>

      <!-- Everything else needs the item list, fetched on the first switch -->
      <template v-else>
        <div v-if="status === 'pending'" class="p-5">
          <LoadingState label="Stellungnahmen werden geladen …" />
        </div>
        <div v-else-if="status === 'error'" class="p-5">
          <ErrorState
            title="Stellungnahmen konnten nicht geladen werden"
            @retry="execute()"
          />
        </div>
        <ul v-else-if="visibleItems.length" class="divide-y divide-hairline">
          <StatementRow
            v-for="item in visibleItems"
            :key="item.parliamentUrl"
            :date="item.date"
            :label="submitterLabel(item)"
            :links="[{ citation: item.citation, href: item.parliamentUrl }]"
            :submitter="submitterName(item)"
          >
            <template v-if="item.endorsements > 0" #meta>
              {{ endorsementLabel(item.endorsements) }}
            </template>
          </StatementRow>
        </ul>
        <div v-else class="p-5">
          <EmptyState
            title="Keine Stellungnahmen in dieser Auswahl"
            description="Ein anderes Filter-Segment zeigt die übrigen Einreichungen."
          />
        </div>
      </template>
    </div>

    <div v-if="hasMore" class="mt-4 text-center">
      <UButton
        color="neutral"
        variant="outline"
        class="min-h-11"
        @click="visibleCount += PAGE_SIZE"
      >
        Mehr laden
      </UButton>
    </div>

    <p v-if="!needsList && hiddenOrgCount > 0" class="mt-3 text-sm text-ink-muted">
      und {{ formatNumberDe(hiddenOrgCount) }} weitere Organisationen – sie
      stehen im Segment „Alle“.
    </p>
  </div>
</template>
