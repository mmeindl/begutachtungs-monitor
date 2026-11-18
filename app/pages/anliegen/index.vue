<script setup lang="ts">
import type { AnliegenListResponse } from '#shared/types'
import { anliegenListGpOf, anliegenListGps } from '#shared/utils/anliegen'
import { gpHasEnded } from '#shared/utils/gp'
import { MAX_LIST_QUERY_CHARS, firstQueryValue } from '#shared/utils/queryParams'
import { todayIso } from '#shared/utils/format'
import { BIS_PARAM, VON_PARAM, weekStartOf } from '#shared/utils/periodCalendar'
import { CUSTOM_SPAN_OPTION, CUSTOM_SPAN_VALUE } from '~/utils/draftFilters'
import { matchesQuery } from '#shared/utils/textMatch'
import { listBoxStatusOf } from '~/utils/listState'
import {
  ANLIEGEN_ART_OPTIONS,
  ANLIEGEN_LIST_DE,
  ANLIEGEN_SPAN_MIN_DAY,
  anliegenCustomSpanOf,
  anliegenRowsInSpan,
  anliegenArtOf,
  anliegenCountLineDe,
  anliegenEmptyDe,
  anliegenHaystack,
  anliegenPeriodOptions,
  anliegenRowView,
  anliegenRowsInView,
  anliegenUnreadDe,
  anliegenUnreadKinds,
  filterAnliegenRows,
  sortAnliegenRows,
  type AnliegenArt,
} from '~/utils/anliegenView'

/**
 * The list of Anliegen an das Parlament — Petitionen, Bürgerinitiativen
 * and Volksbegehren of a period in the Nationalrat (step 3 of
 * `docs/research/umsetzungsplan-petitionen-volksbegehren.md`), and the
 * Petitionen an den Bundesrat: a tab of their own that lists all of them,
 * whatever the period (the Bundesrat has none), and under „Alle" those that
 * arrived within the period's days (`anliegenRowsInView`).
 *
 * Sorted by the last step, newest first — never by state or outcome, and no
 * count of outcomes anywhere (docs/decisions.md, „Framing"). One colour for
 * every closed state; blue only for the item's own open window.
 *
 * The controls live in the URL (`?art=`, `?gp=` or `?von=&bis=`, `?alle=1`) and stand in the
 * list's head, above the rows they narrow; they change nothing above
 * themselves — the heading names the section, not the period. One question
 * per control: „Art" the kind, „Zeitraum" the Gesetzgebungsperiode (as on
 * /entwuerfe, `?gp=`, the running one by default), „Nur offene" the window.
 * „Nur offene" is on by default in the running period: the question people
 * arrive with is where they can take part now. In an ended period it stands
 * unavailable, with its reason (`onlyOpenEnded`), as „Stellungnahme möglich"
 * does on /entwuerfe where a station rules it out.
 */
const route = useRoute()

const art = computed<AnliegenArt>(() => anliegenArtOf(route.query.art))

/* The search term: typed here, read from `?q=` on arrival (a shared link). */
const q = ref((firstQueryValue(route.query.q) ?? '').slice(0, MAX_LIST_QUERY_CHARS))
const searchTerm = computed(() => q.value.trim())
let qTimer: ReturnType<typeof setTimeout> | undefined
watch(searchTerm, () => {
  clearTimeout(qTimer)
  qTimer = setTimeout(() => setQuery({}), 400)
})
onBeforeUnmount(() => clearTimeout(qTimer))

/* A span of the reader's own (`?von=&bis=`, 18.11.2026, as on /entwuerfe):
 * one more value of the „Zeitraum" select. Its rows are fetched for the one
 * period it lies in and cut by the day each arrived (`anliegenRowsInSpan`);
 * while it is set, no `gp` stands beside it in the link. */
const custom = computed(() =>
  anliegenCustomSpanOf(firstQueryValue(route.query[VON_PARAM]) ?? '', firstQueryValue(route.query[BIS_PARAM]) ?? ''))

const { data, error, status, refresh } = await useFetch<AnliegenListResponse>('/api/anliegen', {
  query: computed(() => {
    const gp = custom.value ? anliegenListGpOf(custom.value.span.gp, null) : anliegenListGpOf(route.query.gp, null)
    return gp ? { gp } : {}
  }),
  lazy: true,
})

/* Loading and failure in the rows' place (`ListBoxState`): the tabs, the chip, the period and the column header stand meanwhile. A refresh keeps the rows. */
const listState = computed(() => listBoxStatusOf({ status: status.value, error: error.value, hasData: !!data.value }, ANLIEGEN_LIST_DE.loading, ANLIEGEN_LIST_DE.failed))

/* The running period comes with the answer; until then the chosen one
 * stands alone in the select (`anliegenPeriodOptions`). */
const currentGp = computed(() => data.value?.currentGp ?? null)
const chosenGp = computed(() => anliegenListGpOf(custom.value?.span.gp ?? route.query.gp, currentGp.value))
/* „Eigener Zeitraum" first, as on /entwuerfe. */
const periodOptions = computed(() => [CUSTOM_SPAN_OPTION, ...anliegenPeriodOptions(currentGp.value ? anliegenListGps(currentGp.value) : [], chosenGp.value)])
/* Ended: the period the rows are of lies before the running one. Never
 * without the server's word on which is running. */
const periodEnded = computed(() => (data.value ? gpHasEnded(data.value.gp, data.value.currentGp) : false))
const onlyOpen = computed(() => !periodEnded.value && route.query.alle !== '1')

type QueryChange = { art?: AnliegenArt; onlyOpen?: boolean; gp?: string; span?: { von: string; bis: string } | null }
/** The list's address with one change — what `setQuery` goes to and a link to a variant carries. */
function queryWith(next: QueryChange): Record<string, string> {
  const a = next.art ?? art.value
  const open = next.onlyOpen ?? route.query.alle !== '1'
  const span = next.span !== undefined ? next.span : custom.value
  const gp = next.gp ?? chosenGp.value
  const query: Record<string, string> = {}
  if (a !== 'alle') query.art = a
  if (span?.von) {
    query[VON_PARAM] = span.von
    if (span.bis) query[BIS_PARAM] = span.bis
  } else if (gp && gp !== currentGp.value) query.gp = gp
  if (!open) query.alle = '1'
  if (searchTerm.value) query.q = searchTerm.value
  return query
}
function setQuery(next: QueryChange) {
  navigateTo({ path: route.path, query: queryWith(next) }, { replace: true })
}
const artModel = computed<AnliegenArt>({ get: () => art.value, set: (v) => setQuery({ art: v }) })
/* Choosing „Eigener Zeitraum" opens on the running calendar week, from
 * Monday; choosing a period drops the dates. */
const gpModel = computed<string>({
  get: () => (custom.value ? CUSTOM_SPAN_VALUE : chosenGp.value || currentGp.value || ''),
  set: (v) => (v === CUSTOM_SPAN_VALUE
    ? setQuery({ span: { von: weekStartOf(todayIso()), bis: '' } })
    : setQuery({ gp: v, span: null })),
})
/* The calendar hands back both ends at once (`DateRangeButton`). */
function setSpan(span: { von: string; bis: string }): void {
  const next = anliegenCustomSpanOf(span.von, span.bis)
  if (next) setQuery({ span: next })
}
/* The part of the span before the period it is shown in, named and linked
 * (`SpanCutNote`). Not on the Bundesrat's tab: it is cut by the reader's own
 * days, unclipped. */
const spanCut = computed(() => {
  const c = custom.value?.span
  if (!c?.cut || art.value === 'petition-bundesrat') return null
  return { span: { ...c, cut: c.cut }, to: { query: queryWith({ span: { von: c.cut.from, bis: c.cut.to ?? '' } }) } }
})
/* A link's span the list moved or could not place is written back, so the
 * address says what the list shows. */
watch(custom, (c) => {
  if (import.meta.server) return
  const von = firstQueryValue(route.query[VON_PARAM]) ?? ''
  const bis = firstQueryValue(route.query[BIS_PARAM]) ?? ''
  if (!von && !bis) return
  if (!c || c.von !== von || c.bis !== bis || route.query.gp !== undefined) setQuery({ span: c })
}, { immediate: true })

const inPeriod = computed(() => (data.value ? anliegenRowsInView(data.value, art.value) : []))
const inSpan = computed(() => (custom.value ? anliegenRowsInSpan(inPeriod.value, custom.value, art.value) : null))
const inView = computed(() => inSpan.value?.rows ?? inPeriod.value)
const sorted = computed(() => sortAnliegenRows(inView.value))
const filtered = computed(() => filterAnliegenRows(sorted.value, art.value, onlyOpen.value).map(anliegenRowView))
/* The search (16.11.2026; the list had none, the draft list and the EU's do):
 * over what a row shows — title, citation, kind — by the lists' one word
 * rule (`matchesQuery`). It narrows the rows after kind, period and „Nur
 * offene"; the count line goes on counting that set, and the matches are
 * said beside it. In the URL like the other controls (`?q=`), written with
 * the next control and a moment after typing stops — never per keystroke. */
const views = computed(() => filtered.value.filter((v) => !searchTerm.value || matchesQuery(anliegenHaystack(v), searchTerm.value)))

const PAGE_STEP = 10
const { visible, shown, more, all } = usePagedList(views, PAGE_STEP, [art, onlyOpen, chosenGp, custom, searchTerm])

const countLine = computed(() => (data.value ? anliegenCountLineDe(data.value.gp, inView.value, art.value, onlyOpen.value, periodEnded.value, inSpan.value) : null))
const unreadLines = computed(() => (data.value ? anliegenUnreadDe(anliegenUnreadKinds(data.value), art.value) : []))
/* A kind in view could not be read — the chosen one, or any under „Alle":
 * its failure stands, never „keine". */
const viewUnread = computed(() => unreadLines.value.length > 0)
const empty = computed(() => (data.value && !viewUnread.value ? anliegenEmptyDe(inView.value, data.value.gp, art.value, onlyOpen.value, inSpan.value?.window ?? null) : null))

useSeoMeta({
  title: ANLIEGEN_LIST_DE.title,
  description: ANLIEGEN_LIST_DE.lede,
  ogTitle: ANLIEGEN_LIST_DE.title,
})
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <header>
      <h1 class="page-title">{{ ANLIEGEN_LIST_DE.title }}</h1>
      <p class="mt-2 text-ink-secondary">{{ ANLIEGEN_LIST_DE.lede }}</p>
    </header>

    <h2 class="sr-only">Ergebnisse</h2>
    <!-- The draft lists' sheet (`EntryList`): the same box, column header
         and row, with one column more for the Unterstützungen. -->
    <EntryList
      :entries="shown"
      :lead="ANLIEGEN_LIST_DE.columns.lead"
      :second-column="ANLIEGEN_LIST_DE.columns.support"
      :state="listState"
      class="mt-6"
      @retry="refresh()"
    >
      <template #tabs>
        <ListTabs v-model="artModel" :options="[...ANLIEGEN_ART_OPTIONS]" :group-label="ANLIEGEN_LIST_DE.artLabel" collapse />
      </template>
      <template #header>
        <div class="flex flex-wrap items-center gap-2">
          <ToggleChip
            :pressed="onlyOpen"
            :unavailable="periodEnded ? ANLIEGEN_LIST_DE.onlyOpenEnded : null"
            @toggle="setQuery({ onlyOpen: !onlyOpen })"
          >
            {{ ANLIEGEN_LIST_DE.onlyOpen }}
          </ToggleChip>
          <!-- The period, as on /entwuerfe (`?gp=`, `gpSpanLabelDe`), and
               a span of the reader's own (`?von=&bis=`, `SpanSelect`). -->
          <SpanSelect
            id="anliegen-gp"
            v-model="gpModel"
            :label="ANLIEGEN_LIST_DE.periodLabel"
            :options="periodOptions"
            :span="custom ? { von: custom.von, bis: custom.bis } : null"
            :min="ANLIEGEN_SPAN_MIN_DAY"
            class="min-w-0 md:w-72"
            @span="setSpan"
          />
        </div>
        <SpanCutNote v-if="spanCut" :span="spanCut.span" :to="spanCut.to" class="text-sm text-ink-muted" />
        <!-- The search on a line of its own, the whole width, after what
             fixes the set — as on `/entwuerfe`. -->
        <UInput
          v-model="q"
          type="search"
          :maxlength="MAX_LIST_QUERY_CHARS"
          icon="i-lucide-search"
          :placeholder="`${ANLIEGEN_LIST_DE.search} …`"
          :aria-label="ANLIEGEN_LIST_DE.search"
          :disabled="!data"
          class="w-full"
          :ui="{ base: 'min-h-target' }"
        />
        <p v-if="countLine" class="text-sm tabular-nums text-ink-secondary" aria-live="polite">
          {{ countLine }}<template v-if="searchTerm && filtered.length"> · {{ ANLIEGEN_LIST_DE.matches(views.length, searchTerm) }}</template>
        </p>
        <GapNote v-for="line in unreadLines" :key="line" :text="line" class="text-sm text-ink-muted" />
      </template>

      <template #empty>
        <ListBoxNotice v-if="viewUnread" role="alert" :title="unreadLines.join(' ')" />
        <ListBoxNotice v-else-if="searchTerm && filtered.length" :title="ANLIEGEN_LIST_DE.noMatch(searchTerm)">
          <template #action>
            <button type="button" class="link-inline text-sm" @click="q = ''">
              {{ ANLIEGEN_LIST_DE.clear }}
            </button>
          </template>
        </ListBoxNotice>
        <ListBoxNotice v-else-if="empty" :title="empty.title" :description="empty.note ?? undefined" />
      </template>
      <template #foot>
        <ListMore
          v-if="views.length"
          :visible="visible"
          :total="views.length"
          :step="PAGE_STEP"
          @more="more()"
          @all="all()"
        />
      </template>
    </EntryList>
  </div>
</template>
