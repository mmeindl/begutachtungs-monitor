<script setup lang="ts">
/**
 * The EU map's overview: every EU
 * act that a draft of the window implements, Bund and Länder, with its
 * deadline and how many drafts implement it on each side. Each act links
 * to its page, where the drafts stand on one track.
 *
 * The list on the white sheet of every list of rows (`ListBox`, box
 * grammar): rows you operate — each links, the list folds past twenty
 * in the site's idiom (`ListMore`), the chips filter it. Everything that
 * operates on it stands inside the box, the chips in its head per
 * `ListBox`'s rule, the empty selection and the fold at its foot; nothing
 * floats above it.
 *
 * THE DEADLINE AS TABS, THE ORDER IN THE COLUMN HEADER (06.11.2026). One
 * list of deadlines ahead, passed and absent read as unsorted in any order,
 * so the box opens with tabs — „Frist läuft", „Abgelaufen", „Ohne Frist"
 * (`deadlineTabOf`), without counts, as the station tabs of `/entwuerfe`
 * — the count line under the search says how many the tab holds. The order is the lists' own
 * (`SortHeader` in a `ColumnHeader`, as `/entwuerfe`): „Rechtsakt" orders by
 * name, „Umsetzungsfrist" by date in the tab's direction
 * (`deadlineDirection`): what runs nearest first, what passed most recent
 * first. A second click turns a column round (`useReversibleSort`), as on
 * every list. A select beside the count on a phone, where no header is
 * drawn. „Ohne Frist" has no date to order by: only the names.
 * „Abgelaufen" names the day, never the transposition (D6), and no tab or
 * box carries a colour.
 *
 * THE SEARCH (06.11.2026), under the chips as on `/entwuerfe`: the label,
 * the official title and the CELEX, by the lists' word rule
 * (`matchesQuery`, `euActHaystack`). Over both lists; the fold opens while
 * it holds a hit, and under a query the lists stand uncut, the rule of every
 * list (whoever searches gets the whole result). Tabs, order and search are
 * not in the address: the page has one list, and the chips' `?quellen=` is
 * the choice the site shares.
 *
 * The source chips select rows and change nothing in a row: an act stays
 * where the Bund (ticked) has an implementing draft or any ticked Land does.
 * They are the site's (`SourceChips`, `useSourceChoice`, 06.11.2026): one
 * choice, one `?quellen=`, on the homepage, the list and here — so the map
 * opens on the Bund alone, as every list does, and a reader who ticked
 * Salzburg anywhere finds Salzburg here. Until then the page had chips of
 * its own, nothing ticked meaning everyone, which gave the same address two
 * meanings. A Land without an act stands unavailable with its reason
 * (`euSourceUnavailable`), as the list draws a Land a station does not
 * reach.
 *
 * No verdict anywhere on it, as on the draft's fact (rule D6): the counts
 * are of drafts that implement an act, never of acts not implemented — the
 * monitor reads only the Begutachtungen it knows, and an absence is no
 * finding.
 *
 * APART, FOLDED: the acts drafts only restate. An amendment restates the
 * whole Umsetzungshinweis of the law it changes (rule D4), so these are
 * acts transposed before — listed so their pages are reachable, never
 * counted as implemented, and closed by default under the main list. The
 * chips filter them too; the fold goes where the selection leaves none.
 */
import type { EuActSummary, EuActsResponse } from '#shared/types'
import { risSource, eurLexSource, sourceItemsDe } from '#shared/utils/provenance'
import { MAX_LIST_QUERY_CHARS } from '#shared/utils/queryParams'
import { matchesQuery } from '#shared/utils/textMatch'
import { countLabelDe, todayIso } from '#shared/utils/format'
import { deadlineDirection, deadlineOrderDe, deadlineReverseOrderDe, deadlineTabOf, euActHaystack, euActsRows, euRestatingRows, euSourceUnavailable, filterEuActs, incompleteNoteDe, restatingFoldHeading, type EuActSort, type EuDeadlineTab } from '~/utils/euKarte'

usePageSeo({
  title: 'EU-Recht in der Begutachtung',
  description:
    'Welche Richtlinien und Verordnungen der Europäischen Union die Entwürfe des Bundes und der Länder umsetzen – mit Umsetzungsfrist und den Entwürfen je Rechtsakt.',
})

const { data, status, error, refresh } = useFetch<EuActsResponse>('/api/eu-recht', { lazy: true })

/* The site's choice of sources, never empty (`useSourceChoice`). */
const { chosen, bund, toggle } = useSourceChoice()

// A Land whose drafts only restate acts is available too: the chips filter both lists.
const sourceUnavailable = computed(() =>
  data.value ? euSourceUnavailable([...data.value.acts, ...data.value.restatingOnly], data.value.incomplete) : {})
const allRows = computed(() => (data.value ? euActsRows(data.value) : []))
const incomplete = computed(() => (data.value ? incompleteNoteDe(data.value.incomplete) : null))

/* The chips, then the search: both narrow the set the tabs divide. */
const q = ref('')
const query = computed(() => q.value.trim())
const narrowed = <A extends EuActSummary>(acts: readonly A[]): A[] =>
  filterEuActs(acts, chosen.value).filter((a) => !query.value || matchesQuery(euActHaystack(a), query.value))
const actsLeft = computed(() => (data.value ? narrowed(data.value.acts) : []))
const restatingLeft = computed(() => (data.value ? narrowed(data.value.restatingOnly) : []))

/* The tabs, on the main list's acts, and the order; a tab opens in its own order. */
const today = todayIso()
const tab = ref<EuDeadlineTab>('laufend')
const sortChoice = ref<EuActSort>('frist')
const reversed = ref(false)
const { choose: chooseSort, selectValue: sortSelect } = useReversibleSort(sortChoice, reversed)
/* „Ohne Frist" has no dates: a deadline order becomes the names there, and
 * comes back on leaving — a name order chosen there stays. */
let forcedToName = false
watch(tab, (next) => {
  if (next === 'ohne' && sortChoice.value === 'frist') {
    sortChoice.value = 'name'
    reversed.value = false
    forcedToName = true
  } else if (next !== 'ohne' && forcedToName) {
    if (sortChoice.value === 'name' && !reversed.value) sortChoice.value = 'frist'
    forcedToName = false
  }
})
const sort = computed<EuActSort>(() => sortChoice.value)
const direction = computed<'auf' | 'ab'>(() => {
  const own = sort.value === 'name' ? 'auf' : deadlineDirection(tab.value)
  return reversed.value ? (own === 'auf' ? 'ab' : 'auf') : own
})
const sortOptions = computed(() => [
  ...(tab.value === 'ohne'
    ? []
    : [
        { value: 'frist', label: tab.value === 'abgelaufen' ? 'Zuletzt abgelaufene zuerst' : 'Nächste Frist zuerst' },
        { value: reversedOption('frist'), label: tab.value === 'abgelaufen' ? 'Am längsten abgelaufene zuerst' : 'Späteste Frist zuerst' },
      ]),
  { value: 'name', label: 'Name A–Z' },
  { value: reversedOption('name'), label: 'Name Z–A' },
])
const TAB_LABEL: Record<EuDeadlineTab, string> = { laufend: 'Frist läuft', abgelaufen: 'Abgelaufen', ohne: 'Ohne Frist' }
const TABS = (['laufend', 'abgelaufen', 'ohne'] as const).map((value) => ({ value, label: TAB_LABEL[value] }))
const inTab = <A extends EuActSummary>(acts: readonly A[]): A[] => acts.filter((a) => deadlineTabOf(a, today) === tab.value)
const rows = computed(() => euActsRows({ acts: inTab(actsLeft.value) }, sort.value, direction.value))
const restatingRows = computed(() => euRestatingRows({ restatingOnly: inTab(restatingLeft.value) }, sort.value, direction.value))

/*
 * Where a search's hits went, when the tab shows none: the tabs carry no
 * counts, so the notice names them — another tab of the main list first,
 * then the fold (the GDPR, restated by many drafts), in this tab or another.
 */
const hitsElsewhere = computed(() => {
  const tabOf = (acts: readonly EuActSummary[]) => (['laufend', 'abgelaufen', 'ohne'] as const).filter((t) => acts.some((a) => deadlineTabOf(a, today) === t))
  const main = tabOf(actsLeft.value)
  if (main.length) return `Treffer unter ${main.map((t) => `„${TAB_LABEL[t]}“`).join(' und ')}.`
  if (restatingRows.value.length) return 'Treffer unter „Nur in Umsetzungshinweisen wiederholt“.'
  const fold = tabOf(restatingLeft.value)[0]
  return fold ? `Treffer unter „${TAB_LABEL[fold]}“, in „Nur in Umsetzungshinweisen wiederholt“.` : null
})

/** Twenty stand; the rest behind „Alle N anzeigen" (`ListMore`), in each list — uncut under a query. */
const STEP = 20
const visible = ref(STEP)
const shown = computed(() => (query.value ? rows.value : rows.value.slice(0, visible.value)))
const visibleRestating = ref(STEP)
const shownRestating = computed(() => (query.value ? restatingRows.value : restatingRows.value.slice(0, visibleRestating.value)))

/*
 * The credit line, as under a draft's EU fact (`EntwurfFrame`): what the
 * map read and from whom. The Länder's documents carry no licence claim and
 * are named plainly, between the Bund's and EUR-Lex's, in the order the
 * map reads them.
 */
const [bundItem, eurLexItem] = sourceItemsDe([risSource('Vorblatt'), risSource('Gesetzestext'), eurLexSource('Fristen')])
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <!-- A list page, so the list's frame (`/entwuerfe`): its width, and the
         title with its lede in a header. -->
    <header>
      <h1 class="page-title">
        EU-Recht in der Begutachtung
      </h1>
      <p class="mt-2 text-ink-secondary">
        Jeder Rechtsakt der Europäischen Union, den ein Entwurf dieser
        Gesetzgebungsperiode umsetzt – beim Bund und in den Ländern –, mit seiner
        Umsetzungsfrist und den Entwürfen, die ihn umsetzen. Woher die Angaben
        stammen und was sie nicht sagen, steht unter
        <NuxtLink to="/so-funktionierts#eu-recht" class="link-inline">So funktioniert’s</NuxtLink>.
      </p>
    </header>

    <FetchGate
      :status="status"
      :error="error"
      :data="data"
      loading-label="Rechtsakte werden geladen …"
      state-class="mt-10"
      @retry="refresh()"
    >
      <template #default="{ data: map }">
        <EmptyState
          v-if="!map.builtAt"
          class="mt-10"
          title="Die Karte ist noch nicht gebaut."
          description="Sobald der Monitor die Entwürfe dieser Gesetzgebungsperiode einmal gelesen hat, stehen hier die Rechtsakte, die sie umsetzen."
        />
        <template v-else>
          <!-- Without a list, the caveat stands above the empty state; with
               one, in its head, as on `/entwuerfe`. -->
          <p v-if="incomplete && !allRows.length" class="mt-6 text-sm text-ink-muted">
            {{ incomplete }}
          </p>
          <EmptyState
            v-if="!allRows.length"
            class="mt-6"
            title="Kein Entwurf dieser Periode setzt einen Rechtsakt um, den der Monitor kennt."
          />
          <section v-else aria-labelledby="eu-akte-heading" class="mt-6">
            <h2 id="eu-akte-heading" class="sr-only">Rechtsakte</h2>
            <ListBox>
              <!-- Where the deadline stands, as the box's tabs — the most
                   prominent control belongs to the question the page is
                   about. -->
              <template #tabs>
                <ListTabs v-model="tab" :options="TABS" group-label="Umsetzungsfrist" />
              </template>
              <!-- Whose drafts, in the tool row, the lists' source chips
                   (`SourceChips`): they decide which rows exist at all. -->
              <template #header>
                <SourceChips :unavailable="sourceUnavailable" />
                <!-- A Land that could not be read, under the chips — where
                     the list names its unreadable Länder. -->
                <p v-if="incomplete" class="text-sm text-ink-muted">
                  {{ incomplete }}
                </p>
                <!-- The search on a line of its own, the whole width, after
                     what fixes the set — as on `/entwuerfe`. Its placeholder
                     counts what the chips left over. -->
                <UInput
                  v-model="q"
                  type="search"
                  :maxlength="MAX_LIST_QUERY_CHARS"
                  icon="i-lucide-search"
                  :placeholder="data ? `In ${countLabelDe(filterEuActs([...data.acts, ...data.restatingOnly], chosen).length, 'Rechtsakt', 'Rechtsakten')} suchen …` : 'Rechtsakte durchsuchen …'"
                  aria-label="Rechtsakte durchsuchen"
                  class="w-full"
                  :ui="{ base: 'min-h-target' }"
                />
                <!-- The count line, and on a phone the order beside it, as on
                     `/entwuerfe`: from `md` the column header orders. -->
                <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p class="text-sm text-ink-muted" aria-live="polite">
                    {{ countLabelDe(rows.length, 'Rechtsakt', 'Rechtsakte') }}
                  </p>
                  <div class="flex min-w-0 items-center gap-2 md:hidden">
                    <label for="eu-sort" class="shrink-0 text-sm text-ink-secondary">Sortieren</label>
                    <TokenSelect id="eu-sort" v-model="sortSelect">
                      <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
                        {{ opt.label }}
                      </option>
                    </TokenSelect>
                  </div>
                </div>
              </template>
              <!-- Inside the sheet, as a list box's notice: a card in the
                   sheet would be a box in a box (`ListBoxNotice`). Empty
                   only where the chosen Länder have no act and the Bund is
                   off; the Bund has acts, so it is the way back. -->
              <!-- A search that found nothing in this tab says so, and where
                   its hits are (`hitsElsewhere`). An empty tab and the chips' empty selection keep
                   their own words, the latter its way back. -->
              <ListBoxNotice
                v-if="!rows.length && query"
                :title="`Unter „${TAB_LABEL[tab]}“ passt kein Rechtsakt zu „${query}“.`"
                :description="hitsElsewhere ?? undefined"
              >
                <template #action>
                  <button type="button" class="link-inline text-sm" @click="q = ''">
                    Suche löschen
                  </button>
                </template>
              </ListBoxNotice>
              <ListBoxNotice
                v-else-if="!rows.length && actsLeft.length"
                :title="`Kein Rechtsakt dieser Auswahl unter „${TAB_LABEL[tab]}“.`"
              />
              <ListBoxNotice
                v-else-if="!rows.length"
                title="Kein Rechtsakt, den ein Entwurf aus dieser Auswahl umsetzt."
              >
                <template v-if="!bund" #action>
                  <button type="button" class="link-inline text-sm" @click="toggle('bund')">
                    Bund dazunehmen
                  </button>
                </template>
              </ListBoxNotice>
              <template v-else>
                <!-- The lists' column header (`EntryList`): the labels over
                     their columns, the sortable ones as buttons. Under „Ohne
                     Frist" only the names order — there are no dates. -->
                <ColumnHeader sortable class="gap-4 md:flex">
                  <ColumnLabel
                    label="Rechtsakt"
                    :sort="{ order: 'A–Z', reverseOrder: 'Z–A', active: sort === 'name', reversed }"
                    class="min-w-0 flex-1"
                    @choose="chooseSort('name')"
                  />
                  <ColumnLabel
                    label="Umsetzungsfrist"
                    :sort="tab !== 'ohne' ? { order: deadlineOrderDe(tab), reverseOrder: deadlineReverseOrderDe(tab), active: sort === 'frist', reversed } : null"
                    align="end"
                    class="entry-col-state flex justify-end"
                    @choose="chooseSort('frist')"
                  />
                </ColumnHeader>
                <ul role="list" class="divide-y divide-hairline">
                  <EuActRow v-for="row in shown" :key="row.key" :row="row" />
                </ul>
              </template>
              <ListMore
                v-if="!query"
                :visible="visible"
                :total="rows.length"
                :step="STEP"
                @more="visible += STEP"
                @all="visible = rows.length"
              />
            </ListBox>
            <!-- The acts drafts only restate (D4): apart, closed, the same rows. -->
            <FoldSection v-if="restatingRows.length" :heading="restatingFoldHeading(restatingRows.length)" :open="!!query" class="mt-6">
              <div class="pb-2">
                <ListBox>
                  <ul role="list" class="divide-y divide-hairline">
                    <EuActRow v-for="row in shownRestating" :key="row.key" :row="row" level="h4" />
                  </ul>
                  <ListMore
                    v-if="!query"
                    :visible="visibleRestating"
                    :total="restatingRows.length"
                    :step="STEP"
                    @more="visibleRestating += STEP"
                    @all="visibleRestating = restatingRows.length"
                  />
                </ListBox>
              </div>
            </FoldSection>
            <SectionCredits :sources="[]" :marked="false" method="/so-funktionierts#eu-recht">
              <span>Quellen:</span>
              <span>{{ bundItem }}</span>
              <span>Dokumente der Länder</span>
              <span>{{ eurLexItem }}</span>
            </SectionCredits>
          </section>
        </template>
      </template>
    </FetchGate>
  </div>
</template>
