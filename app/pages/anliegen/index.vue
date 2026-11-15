<script setup lang="ts">
import type { AnliegenListResponse } from '#shared/types'
import { anliegenListGpOf, anliegenListGps } from '#shared/utils/anliegen'
import { gpHasEnded } from '#shared/utils/gp'
import {
  ANLIEGEN_ART_OPTIONS,
  ANLIEGEN_LIST_DE,
  anliegenArtOf,
  anliegenCountLineDe,
  anliegenEmptyDe,
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
 * The controls live in the URL (`?art=`, `?gp=`, `?alle=1`) and stand in the
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

const { data, error, status, refresh } = await useFetch<AnliegenListResponse>('/api/anliegen', {
  query: computed(() => {
    const gp = anliegenListGpOf(route.query.gp, null)
    return gp ? { gp } : {}
  }),
  lazy: true,
})

/* The running period comes with the answer; until then the chosen one
 * stands alone in the select (`anliegenPeriodOptions`). */
const currentGp = computed(() => data.value?.currentGp ?? null)
const chosenGp = computed(() => anliegenListGpOf(route.query.gp, currentGp.value))
const periodOptions = computed(() => anliegenPeriodOptions(currentGp.value ? anliegenListGps(currentGp.value) : [], chosenGp.value))
/* Ended: the period the rows are of lies before the running one. Never
 * without the server's word on which is running. */
const periodEnded = computed(() => (data.value ? gpHasEnded(data.value.gp, data.value.currentGp) : false))
const onlyOpen = computed(() => !periodEnded.value && route.query.alle !== '1')

function setQuery(next: { art?: AnliegenArt; onlyOpen?: boolean; gp?: string }) {
  const a = next.art ?? art.value
  const open = next.onlyOpen ?? route.query.alle !== '1'
  const gp = next.gp ?? chosenGp.value
  const query: Record<string, string> = {}
  if (a !== 'alle') query.art = a
  if (gp && gp !== currentGp.value) query.gp = gp
  if (!open) query.alle = '1'
  navigateTo({ path: route.path, query }, { replace: true })
}
const artModel = computed<AnliegenArt>({ get: () => art.value, set: (v) => setQuery({ art: v }) })
const gpModel = computed<string>({
  get: () => chosenGp.value || currentGp.value || '',
  set: (v) => setQuery({ gp: v }),
})

const inView = computed(() => (data.value ? anliegenRowsInView(data.value, art.value) : []))
const sorted = computed(() => sortAnliegenRows(inView.value))
const views = computed(() => filterAnliegenRows(sorted.value, art.value, onlyOpen.value).map(anliegenRowView))

const PAGE_STEP = 10
const { visible, shown, more, all } = usePagedList(views, PAGE_STEP, [art, onlyOpen, chosenGp])

const countLine = computed(() => (data.value ? anliegenCountLineDe(data.value.gp, inView.value, art.value, onlyOpen.value, periodEnded.value) : null))
const unreadLines = computed(() => (data.value ? anliegenUnreadDe(anliegenUnreadKinds(data.value), art.value) : []))
/* A kind in view could not be read — the chosen one, or any under „Alle":
 * its failure stands, never „keine". */
const viewUnread = computed(() => unreadLines.value.length > 0)
const empty = computed(() => (data.value && !viewUnread.value ? anliegenEmptyDe(inView.value, data.value.gp, art.value, onlyOpen.value) : null))

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
      class="mt-6"
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
          <!-- The period, as on /entwuerfe (`?gp=`, `gpSpanLabelDe`). -->
          <div class="min-w-0 md:w-72">
            <label for="anliegen-gp" class="sr-only">{{ ANLIEGEN_LIST_DE.periodLabel }}</label>
            <TokenSelect id="anliegen-gp" v-model="gpModel" block>
              <TokenOption v-for="opt in periodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</TokenOption>
            </TokenSelect>
          </div>
        </div>
        <p v-if="countLine" class="text-sm tabular-nums text-ink-secondary" aria-live="polite">{{ countLine }}</p>
        <GapNote v-for="line in unreadLines" :key="line" :text="line" class="text-sm text-ink-muted" />
      </template>

      <!-- No rows yet: loading or failure take the rows' place, as on /entwuerfe. -->
      <template v-if="!data" #state>
        <LoadingState
          v-if="status === 'pending' || status === 'idle'"
          :label="ANLIEGEN_LIST_DE.loading"
        />
        <ListBoxNotice
          v-else-if="error"
          role="alert"
          title="Anliegen: gerade nicht abrufbar"
          description="Die Quelle hat nicht geantwortet."
        >
          <template #action>
            <UButton color="primary" @click="refresh()">Erneut versuchen</UButton>
          </template>
        </ListBoxNotice>
      </template>
      <template #empty>
        <ListBoxNotice v-if="viewUnread" role="alert" :title="unreadLines.join(' ')" />
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
