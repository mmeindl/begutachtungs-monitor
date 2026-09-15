<script setup lang="ts">
import type { RvStatementsResponse, StatementsSummary } from '#shared/types'

/**
 * The Stellungnahmen filed on the Regierungsvorlage itself.
 *
 * Anyone can file on a Vorlage in the Nationalrat the way they filed on the
 * Ministerialentwurf — same form, same list upstream — and organisations
 * that took part in the Begutachtung come back for this second round (the
 * IFG: ten on 2238 d.B., after 95/ME). The monitor showed only the first
 * round until a reader pointed at the second (September 2026). In the
 * Nachverfolgung reading this is the input that can still change the text
 * in the Ausschuss, so it belongs on the Vorlage's card, phrased as what was
 * filed — never as what it achieved (framing rule, CLAUDE.md).
 *
 * Same row grammar as the Begutachtung's panel (StatementRow): the
 * organisations by name, persons and non-public submissions as counts, the
 * document one click away. Above the server's cap only the count is known,
 * and the block says so rather than showing a subset as if it were the list.
 */
const props = defineProps<{
  data: RvStatementsResponse
  /** Parliament still takes Stellungnahmen on this Vorlage (`enactment.filingOpen`).
   *  The door for it is the card at the top of the page; here it is one
   *  sentence with a link, so the section states the fact without a second
   *  button competing with the first. */
  filingOpen?: boolean
}>()

type OrgEntry = StatementsSummary['organisationList'][number]

const summary = computed(() => props.data.summary)

/* Same steps and the same threshold as the Begutachtung's panel: the two
 * lists have one row grammar and should page and search alike. Most Vorlagen
 * draw a handful of Stellungnahmen (2238 d.B.: ten), so on the common case
 * neither control appears at all. */
const PAGE_SIZE = 10
const SEARCH_MIN = 20
const ALL_ABOVE = 30

const visibleCount = ref(PAGE_SIZE)
const query = ref('')
const searchActive = computed(() => foldForSearch(query.value).length > 0)

watch(query, () => {
  visibleCount.value = PAGE_SIZE
})

const orgList = computed<OrgEntry[]>(() => summary.value?.organisationList ?? [])

const matchedOrgs = computed(() =>
  searchActive.value
    ? orgList.value.filter((org) =>
        matchesSearch([org.name, ...org.statements.map((s) => s.citation)].join(' '), query.value),
      )
    : orgList.value,
)

/* The two foldings of the panel, for the same two reasons (StatementsPanel):
 * without a query the overflow stays in the DOM and findable, with one the
 * rows the reader excluded are gone. */
const renderedOrgs = computed(() =>
  searchActive.value ? matchedOrgs.value.slice(0, visibleCount.value) : matchedOrgs.value,
)

function orgHidden(index: number): 'until-found' | undefined {
  return !searchActive.value && index >= visibleCount.value ? 'until-found' : undefined
}

const showSearch = computed(() => orgList.value.length > SEARCH_MIN)

/** "6 von Organisationen, 3 von Privatpersonen, 1 nicht-öffentlich" */
const partition = computed(() => {
  const s = summary.value
  if (!s) return ''
  const parts: string[] = []
  if (s.organisations) {
    parts.push(s.organisations === 1 ? '1 von einer Organisation' : `${s.organisations} von Organisationen`)
  }
  if (s.privatePersons) {
    parts.push(s.privatePersons === 1 ? '1 von einer Privatperson' : `${s.privatePersons} von Privatpersonen`)
  }
  if (s.nonPublic) parts.push(`${s.nonPublic} nicht-öffentlich`)
  return parts.join(', ')
})

/* One row per organisation, every citation in the cell — a Vorlage draws
 * few submissions, so the grouped/expanded split of the big panel is not
 * needed here. */
function rowDate(org: OrgEntry): string | null {
  const dates = org.statements.map((s) => s.date).filter((d): d is string => Boolean(d))
  return dates.length ? [...dates].sort().at(-1)! : null
}

function links(org: OrgEntry) {
  return org.statements.map((s) => ({
    citation: s.citation,
    href: s.parliamentUrl,
    document: s.documentUrl,
  }))
}

function endorsementLabel(n: number): string {
  return countLabelDe(n, 'Zustimmung', 'Zustimmungen')
}

/* The house link style (same string as the detail page's `linkClasses`). */
const LINK =
  'rounded text-accent-deep underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-deep'
</script>

<template>
  <div class="mt-8">
    <h3 class="text-base font-semibold text-ink">Stellungnahmen zur Regierungsvorlage</h3>

    <p v-if="data.total === 0" class="mt-2 max-w-prose text-sm text-ink-secondary">
      Auch zur Regierungsvorlage selbst können auf parlament.gv.at Stellungnahmen
      eingebracht werden. Zu dieser Vorlage wurde <template v-if="filingOpen">bisher</template> keine eingebracht<template
        v-if="filingOpen"
      >; möglich ist es, solange der Nationalrat den Text behandelt:
        <ExternalLink :href="data.rvUrl" :class="LINK">Stellungnahme abgeben</ExternalLink></template
      >.
    </p>

    <template v-else>
      <p class="mt-2 max-w-prose text-sm text-ink">
        Zur Regierungsvorlage {{ data.rvCitation }} selbst gingen im Nationalrat
        {{ countLabelDe(data.total, 'Stellungnahme', 'Stellungnahmen') }} ein<template
          v-if="partition"
        >: {{ partition }}</template
        >.
        <template v-if="!summary">
          Bei mehr als {{ formatNumberDe(data.cap) }} entfällt die Aufschlüsselung
          nach Einbringern.
        </template>
      </p>

      <div v-if="showSearch" class="mt-3">
        <label class="sr-only" for="rv-org-search">Organisation suchen</label>
        <UInput
          id="rv-org-search"
          v-model="query"
          type="search"
          icon="i-lucide-search"
          placeholder="Organisation suchen"
          autocomplete="off"
          class="w-full"
          :ui="{ base: 'min-h-11' }"
        />
        <p class="mt-2 text-sm text-ink-muted" aria-live="polite">
          {{
            searchActive
              ? `${formatNumberDe(matchedOrgs.length)} von ${countLabelDe(orgList.length, 'Organisation', 'Organisationen')}`
              : countLabelDe(orgList.length, 'Organisation', 'Organisationen')
          }}
        </p>
      </div>

      <!-- Same container as the panel's list, so the rows decide their
           layout on this box's width (row-cols in main.css). -->
      <div
        v-if="orgList.length"
        class="@container/list mt-3 overflow-hidden rounded-xl border border-hairline bg-surface"
      >
        <!-- divide-rows: the overflow rows are `hidden` until find-in-page
             reveals them, which Tailwind's `divide-y` miscounts (main.css). -->
        <ul v-if="renderedOrgs.length" class="divide-rows">
          <StatementRow
            v-for="(org, i) in renderedOrgs"
            :key="org.name"
            :date="rowDate(org)"
            :label="org.name"
            :links="links(org)"
            :submitter="org.name"
            :hidden="orgHidden(i)"
          >
            <template v-if="org.endorsements > 0" #meta>
              {{ endorsementLabel(org.endorsements) }}
            </template>
          </StatementRow>
        </ul>
        <div v-else class="p-5">
          <EmptyState
            title="Keine Organisation gefunden"
            description="Privatpersonen werden nicht namentlich gelistet – gesucht wird nur in den Organisationen und ihren Geschäftszahlen."
          />
        </div>
      </div>

      <ListMore
        :visible="visibleCount"
        :total="matchedOrgs.length"
        :step="PAGE_SIZE"
        :all-above="ALL_ABOVE"
        @more="visibleCount += PAGE_SIZE"
        @all="visibleCount = matchedOrgs.length"
      />

      <p class="mt-2 text-sm">
        <ExternalLink :href="data.rvUrl" :class="LINK">
          Alle Stellungnahmen zur Vorlage auf parlament.gv.at
        </ExternalLink><template v-if="filingOpen">
          – dort kann weiter Stellung genommen werden, solange der Nationalrat
          den Text behandelt.</template
        >
      </p>
    </template>
  </div>
</template>
