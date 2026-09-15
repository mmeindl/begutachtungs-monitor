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

/* Ten, not the panel's old twenty-five: this list sits on a detail page with
 * five other sections, and a first page that fills the viewport makes the
 * Stellungnahmen the page instead of a part of it. What ten costs — more
 * presses on the long lists — the search field and "Alle N anzeigen" both
 * answer. */
const PAGE_SIZE = 10

/* Above this many still-hidden rows, offer the jump to the end — roughly
 * four presses, which is where stepping starts to feel like work. 88/ME's
 * 707 Stellungnahmen are 70 presses otherwise.
 *
 * On BOTH segments, not just the long one: the search field finds a name the
 * reader already knows, and answers nothing for "show me all of them". On the
 * organisation list the skipped rows are in the DOM already, so the press
 * only unhides them. */
const ALL_ABOVE = 30

/* Below this the search field is not offered: on twenty rows the eye is
 * faster than the keyboard, and the field would be a fourth control on a
 * panel that already collapsed three lists into one to lose controls. */
const SEARCH_MIN = 20

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
  () => `/api/drafts/${props.gp}/${props.inr}/statements`,
  { immediate: false },
)

const needsList = computed(() => filter.value !== 'organisations')

/**
 * The organisation search. Only this segment has one: the other three are
 * lists of "Privatperson" and "Nicht-öffentliche Stellungnahme", where there
 * is no name to search for — which is the GDPR line, not an omission, and
 * the empty state says so when someone searches for a person anyway.
 */
const orgQuery = ref('')

/* A query that folds to nothing (spaces, a stray hyphen) is not a filter. */
const searchActive = computed(() => foldForSearch(orgQuery.value).length > 0)

watch(filter, async (value) => {
  visibleCount.value = PAGE_SIZE
  /* The field is unmounted with the segment; a query left behind would
   * filter a list the reader can no longer see the field for. */
  orgQuery.value = ''
  if (value !== 'organisations' && status.value === 'idle') {
    await execute()
  }
})

/* A narrower set is a new first page — otherwise three matches arrive on
 * page four of the unfiltered list, i.e. as an empty list. */
watch(orgQuery, () => {
  visibleCount.value = PAGE_SIZE
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
          : org.statements.map((s) => ({ citation: s.citation, href: s.parliamentUrl, document: s.documentUrl })),
        detail: expanded ? statementCountLabel(org.statements.length) : null,
        submitter: org.name,
      },
    }
  }),
)

/* The name and every citation the row carries, so a reader who has the
 * citation and not the name ("21/SN-8/ME") lands on the same row. */
function orgHaystack(entry: (typeof orgRows)['value'][number]): string {
  return [entry.org.name, ...entry.org.statements.map((s) => s.citation)].join(' ')
}

const matchedOrgRows = computed(() =>
  searchActive.value
    ? orgRows.value.filter((entry) => matchesSearch(orgHaystack(entry), orgQuery.value))
    : orgRows.value,
)

/**
 * Two ways of folding a row away, because the two states protect different
 * things.
 *
 * WITHOUT a query every row stays in the DOM and the overflow is hidden with
 * `hidden="until-found"`: the organisation list ships with the page (the
 * point of the feedback layer is that an organisation can find ITSELF here),
 * and the browser — not our JavaScript — reveals a match, so find-in-page
 * still reaches row 90 for a reader whose JS never ran. That reader has no
 * search field either, which is exactly why this half cannot be a slice.
 * Where `until-found` is unsupported the attribute degrades to a plain
 * `hidden`, i.e. to the slice, never to something worse.
 *
 * WITH a query the non-matching rows are gone for real. The reader asked for
 * them to be gone; find-in-page must not resurrect what the filter excluded.
 */
const renderedOrgRows = computed(() =>
  searchActive.value
    ? matchedOrgRows.value.slice(0, visibleCount.value)
    : matchedOrgRows.value,
)

function orgRowHidden(index: number): 'until-found' | undefined {
  return !searchActive.value && index >= visibleCount.value ? 'until-found' : undefined
}

/* Offered on the size of the WHOLE list, not of the current result — a field
 * that disappears once it has narrowed the list to three rows takes away the
 * only way back. */
const showOrgSearch = computed(() => !needsList.value && orgRows.value.length > SEARCH_MIN)

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
    case 'persons':
      return props.summary.privatePersons
    case 'nonpublic':
      return props.summary.nonPublic
    default:
      return props.summary.total
  }
})

/* What the pagination counts against. On the organisation segment that is
 * the SEARCH RESULT, not the whole list: after "3 von 35 Organisationen" a
 * foot line offering to show 25 more would be counting a different set than
 * the one on screen. */
const segmentTotal = computed(() => {
  if (!needsList.value) return matchedOrgRows.value.length
  return status.value === 'success' ? items.value.length : expectedCount.value
})

/* How large the chosen segment is. Two lines, not one: this says what the
 * set IS, and the progress line at the foot says how much of it is on
 * screen — that one belongs beside the button that changes it, not 25 rows
 * above it, where a reader at the button cannot see it. */
const setLine = computed(() => {
  if (!needsList.value) {
    /* Under a query this line IS the result count — the one number the
     * reader is waiting for, and the only place it is stated. */
    if (searchActive.value) {
      return `${formatNumberDe(matchedOrgRows.value.length)} von ${countLabelDe(
        orgRows.value.length,
        'Organisation',
        'Organisationen',
      )}`
    }
    const orgs = countLabelDe(
      sortedOrgs.value.length,
      'Organisation',
      'Organisationen',
    )
    /* Both numbers in one line when they differ, so "25 Organisationen" is
     * not stated twice under each other. */
    return orgsFiledRepeatedly.value
      ? `${statementCountLabel(listedOrgStatements.value)} von ${orgs}`
      : orgs
  }
  return statementCountLabel(segmentTotal.value)
})

/* The size of a segment is already a number in the <dl> above — "58" under
 * Privatpersonen IS this line — so stating it again three centimetres lower
 * is the same sentence twice. The ONE thing the <dl> cannot say is that 26
 * statements came from 25 organisations, because its four counts must sum to
 * Gesamt and are therefore all statement counts.
 *
 * So the line stays in the DOM and goes visually silent everywhere else: it
 * is the panel's live region, and switching a segment swaps the list without
 * moving focus, which leaves a screen-reader user with no other feedback that
 * anything happened.
 *
 * Under a query it is never redundant: no number anywhere else on the panel
 * says how many rows the query found. */
const setLineRedundant = computed(
  () => !searchActive.value && (needsList.value || !orgsFiledRepeatedly.value),
)

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

    <!-- Its own line under the two control groups, not inside them: this is
         a third axis, and the filter group already overflows its row at
         320px. Directly above the list, so it reads as searching the thing
         beneath it. -->
    <div v-if="showOrgSearch" class="mt-4">
      <label class="sr-only" for="org-search">Organisation suchen</label>
      <UInput
        id="org-search"
        v-model="orgQuery"
        type="search"
        icon="i-lucide-search"
        placeholder="Organisation suchen"
        autocomplete="off"
        class="w-full"
        :ui="{ base: 'min-h-11' }"
      />
    </div>

    <p
      :class="[
        'text-sm text-ink-muted',
        setLineRedundant ? 'sr-only' : 'mt-4',
      ]"
      aria-live="polite"
    >{{ setLine }}</p>
    <!-- Same wording as the summary-level note on the detail page: a stale
         list must never read as the current one. mt-4, not mt-1: the line
         above is sr-only in every state this note can appear in (it needs
         the item list), so there is no visible box to sit under. -->
    <p v-if="needsList && listStaleAsOf" class="mt-4 text-xs text-ink-muted">
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
        <!-- divide-rows, not divide-y: the rows past the first page are
             `hidden` until find-in-page reveals them, and Tailwind's
             `:last-child` rule would leave a hairline under the last
             visible one (main.css). -->
        <ul v-if="renderedOrgRows.length" class="divide-rows">
          <StatementRow
            v-for="({ org, row, expanded }, i) in renderedOrgRows"
            :key="org.name"
            v-bind="row"
            :hidden="orgRowHidden(i)"
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
        <!-- The one thing find-in-page can never say. A reader searching for
             a private individual's name gets silence from Cmd+F, and silence
             here reads as "did not file" when the truth is that we do not
             publish that name (GDPR, CLAUDE.md). The field is ours, so it
             can say which of the two it is. -->
        <div v-else-if="searchActive" class="p-5">
          <EmptyState
            title="Keine Organisation gefunden"
            description="Privatpersonen werden nicht namentlich gelistet – gesucht wird nur in den Organisationen und ihren Geschäftszahlen."
          />
        </div>
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
            :links="[{ citation: item.citation, href: item.parliamentUrl, document: item.documentUrl }]"
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

    <ListMore
      :visible="visibleCount"
      :total="segmentTotal"
      :step="PAGE_SIZE"
      :all-above="ALL_ABOVE"
      @more="visibleCount += PAGE_SIZE"
      @all="visibleCount = segmentTotal"
    />

    <p v-if="!needsList && hiddenOrgCount > 0" class="mt-3 text-sm text-ink-muted">
      und {{ formatNumberDe(hiddenOrgCount) }} weitere Organisationen – sie
      stehen im Segment „Alle“.
    </p>
  </div>
</template>
