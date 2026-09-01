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

const expanded = ref(false)
const listId = useId()
const visibleCount = ref(PAGE_SIZE)

/* Lazy: nothing is requested until the user expands the list the first time
 * (immediate: false leaves status at 'idle' until execute()). */
const { data, status, execute } = useFetch<StatementsResponse>(
  () => `/api/consultations/${props.gp}/${props.inr}/statements`,
  { immediate: false },
)

async function toggleList() {
  expanded.value = !expanded.value
  if (expanded.value && status.value === 'idle') {
    await execute()
  }
}

/* Organisations are deliberately NOT in this list: the section above already
 * names every one of them, so including them here showed each organisation
 * twice on the same page. What is left is the half no summary can represent —
 * private persons and non-public submissions are anonymous by design, so the
 * only thing to offer per row is its date and the link to the full text
 * upstream. That makes this list the page's one path to individual citizen
 * input, and nothing else on the page duplicates it. */
const individual = computed<StatementMeta[]>(() =>
  (data.value?.items ?? []).filter((s) => s.submitterKind !== 'organisation'),
)

const visible = computed(() => individual.value.slice(0, visibleCount.value))
const hasMore = computed(() => individual.value.length > visibleCount.value)

/* One staleness sentence per page. When the summary above is already a
 * last-good fallback, the detail page states it under this panel and the
 * list would only repeat it. This note is for the other case: the summary
 * rendered live, and by the time the user expanded the list the cache
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

/* "Zustimmung" is the Parliament's own term (upstream field: approvals) —
 * the vocabulary must survive the click-through to parlament.gv.at. */
function endorsementLabel(n: number): string {
  return countLabelDe(n, 'Zustimmung', 'Zustimmungen')
}

const miniStats = computed(() => [
  { label: 'Gesamt', value: props.summary.total },
  { label: 'Organisationen', value: props.summary.organisations },
  { label: 'Privatpersonen', value: props.summary.privatePersons },
  { label: 'Nicht öffentlich', value: props.summary.nonPublic },
])

/* The button exists only when there is something the organisation section
 * cannot show. Counted from the summary, not from the fetched list, because
 * the fetch does not happen until the button is pressed. */
const individualCount = computed(
  () => props.summary.privatePersons + props.summary.nonPublic,
)

/* Split by endorsements, not by rank. The server ships every organisation
 * (see StatementsSummary.organisationList), but a flat list of all of them
 * would be mostly zero-width bars: on 88/ME two of 23 organisations carry an
 * endorsement, on 8/ME 15 of 35. So the ranked block holds the ones a bar can
 * say something about, and the rest stay on the page as plain names — folded,
 * but in the SSR HTML, which is what lets an organisation find itself here via
 * find-in-page or a search engine. */
const rankedOrgs = computed(() =>
  props.summary.organisationList.filter((o) => o.endorsements > 0),
)

/* Alphabetical, not upstream order: without a ranking to convey, the only
 * useful order is the one you can scan for a name. (filter() copies, so this
 * never sorts the prop.) */
const furtherOrgs = computed(() =>
  props.summary.organisationList
    .filter((o) => o.endorsements === 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'de')),
)

/* ORG_LIST_CAP is set far above every population measured in GP XXVIII, so
 * this is a guard against a future outlier, not a normal state. */
const hiddenOrgCount = computed(() =>
  Math.max(0, props.summary.organisations - props.summary.organisationList.length),
)

/* "Mit den meisten Zustimmungen" is only honest while something is left out. */
const orgHeading = computed(() =>
  rankedOrgs.value.length && (furtherOrgs.value.length || hiddenOrgCount.value)
    ? 'Organisationen mit den meisten Zustimmungen'
    : 'Organisationen',
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

const maxEndorsements = computed(() =>
  Math.max(0, ...rankedOrgs.value.map((o) => o.endorsements)),
)

/* CSS max() keeps every non-zero bar visible: 1 of 355 is 0.3 % — sub-pixel
 * without the 3px floor, and the spread IS the story (355 vs 1). */
function endorsementBarWidth(endorsements: number): string {
  if (endorsements <= 0 || maxEndorsements.value <= 0) return '0'
  return `max(${(endorsements / maxEndorsements.value) * 100}%, 3px)`
}
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

    <!-- Organisations: ranked by endorsements, the rest folded below -->
    <section v-if="summary.organisationList.length" class="mt-6">
      <h3 class="text-base font-semibold text-ink">{{ orgHeading }}</h3>
      <ul v-if="rankedOrgs.length" class="mt-1 divide-y divide-hairline">
        <li v-for="org in rankedOrgs" :key="org.parliamentUrl" class="py-2.5">
          <div class="flex items-baseline justify-between gap-4">
            <ExternalLink
              :href="org.parliamentUrl"
              :aria-label="`Stellungnahme von ${org.name} auf parlament.gv.at öffnen`"
              class="tap-target min-w-0 text-sm font-medium text-accent-deep hover:underline"
            >
              <span class="truncate">{{ org.name }}</span>
            </ExternalLink>
            <!-- No zero guard needed here: this block is the >0 half of the
                 split. The zero half renders as names only, below. -->
            <span class="shrink-0 text-sm tabular-nums text-ink-secondary">
              {{ endorsementLabel(org.endorsements) }}
            </span>
          </div>
          <!-- Decorative scale (value in text, bar aria-hidden): the
               spread is the story — one Betriebsrat can out-mobilize the
               other hundred statements combined. -->
          <div
            class="mt-1.5 h-1.5 w-full rounded-r-[2px] bg-accent-wash"
            aria-hidden="true"
          >
            <div
              class="h-1.5 rounded-r-[2px] bg-accent"
              :style="{ width: endorsementBarWidth(org.endorsements) }"
            />
          </div>
        </li>
      </ul>

      <!-- Native <details> for the same reason as DraftSummary: no hydration,
           keyboard accessible as-is, find-in-page reveals it, and the names
           stay in the SSR HTML. A plain <div> when there is no ranked block
           above it — nothing to be "weitere" than. -->
      <component
        :is="rankedOrgs.length ? 'details' : 'div'"
        v-if="furtherOrgs.length"
        :class="rankedOrgs.length ? 'mt-4 border-t border-hairline' : undefined"
      >
        <summary
          v-if="rankedOrgs.length"
          class="cursor-pointer rounded py-3 text-sm font-medium text-ink-secondary marker:text-ink-muted"
        >
          Weitere {{ formatNumberDe(furtherOrgs.length) }} Organisationen ohne
          Zustimmungen
        </summary>
        <ul class="mt-1 divide-y divide-hairline">
          <li v-for="org in furtherOrgs" :key="org.parliamentUrl" class="py-2.5">
            <ExternalLink
              :href="org.parliamentUrl"
              :aria-label="`Stellungnahme von ${org.name} auf parlament.gv.at öffnen`"
              class="tap-target block min-w-0 text-sm font-medium text-accent-deep hover:underline"
            >
              <span class="truncate">{{ org.name }}</span>
            </ExternalLink>
          </li>
        </ul>
      </component>

      <p v-if="hiddenOrgCount > 0" class="mt-3 text-sm text-ink-muted">
        und {{ formatNumberDe(hiddenOrgCount) }} weitere Organisationen — in der
        vollständigen Liste unten.
      </p>
    </section>

    <!-- The anonymous half, lazily fetched (organisations are above) -->
    <div v-if="individualCount > 0" class="mt-6">
      <UButton
        color="neutral"
        variant="outline"
        :aria-expanded="expanded"
        :aria-controls="listId"
        @click="toggleList"
      >
        {{
          expanded
            ? 'Weitere Stellungnahmen ausblenden'
            : `Weitere ${formatNumberDe(individualCount)} Stellungnahmen anzeigen`
        }}
      </UButton>
    </div>

    <div v-if="expanded" :id="listId" class="mt-4">
      <LoadingState
        v-if="status === 'pending'"
        label="Stellungnahmen werden geladen …"
      />
      <ErrorState
        v-else-if="status === 'error'"
        title="Stellungnahmen konnten nicht geladen werden"
        @retry="execute()"
      />
      <template v-else-if="data">
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <!-- Says what this list is, in place of a filter whose only option
               would have been "Nur Organisationen" — all of them are above. -->
          <p class="text-sm text-ink-secondary">
            Privatpersonen und nicht-öffentliche Einreichungen – die
            Organisationen stehen oben.
          </p>
          <p class="text-sm text-ink-muted">
            <span class="tabular-nums">{{ formatNumberDe(visible.length) }}</span>
            von
            <span class="tabular-nums">{{ formatNumberDe(individual.length) }}</span>
            angezeigt
          </p>
        </div>

        <!-- Same wording as the summary-level note on the detail page: a
             stale list must never read as the current one. -->
        <p v-if="listStaleAsOf" class="mt-3 text-xs text-ink-muted">
          Stand der Liste: {{ formatDateTimeDe(listStaleAsOf) }} – die
          aktuelle Liste ist auf parlament.gv.at derzeit nicht abrufbar.
        </p>

        <EmptyState
          v-if="individual.length === 0"
          title="Keine weiteren Stellungnahmen"
          description="Alle Einreichungen zu diesem Entwurf stammen von Organisationen – sie stehen oben."
          class="mt-4"
        />
        <ul v-else class="mt-2 divide-y divide-hairline">
          <li
            v-for="item in visible"
            :key="item.parliamentUrl"
            class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
          >
            <span class="text-sm tabular-nums text-ink-muted">
              {{ formatDateDe(item.date) }}
            </span>
            <span class="min-w-0 text-sm font-medium text-ink">
              {{ submitterLabel(item) }}
            </span>
            <span
              v-if="item.endorsements > 0"
              class="text-sm text-ink-secondary"
            >
              {{ endorsementLabel(item.endorsements) }}
            </span>
            <ExternalLink
              :href="item.parliamentUrl"
              :aria-label="`Stellungnahme ${item.citation} auf parlament.gv.at öffnen`"
              class="tap-target ml-auto shrink-0 text-sm text-accent-deep hover:underline"
            >
              Auf parlament.gv.at
            </ExternalLink>
          </li>
        </ul>

        <div v-if="hasMore" class="mt-4 text-center">
          <UButton color="neutral" variant="outline" @click="visibleCount += PAGE_SIZE">
            Mehr laden
          </UButton>
        </div>
      </template>
    </div>
  </div>
</template>
