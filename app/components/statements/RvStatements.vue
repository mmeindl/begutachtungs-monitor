<script setup lang="ts">
import type { RvStatementsResponse, StatementMeta, StatementsSummary, SubmitterKind } from '#shared/types'
import { countLabelDe, endorsementLabel, formatDateDe } from '#shared/utils/format'
import { submitterLabel } from '~/utils/statementRows'
import { SECOND_ROUND_CLAUSE } from '~/utils/spine'

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
 * filed — never as what it achieved (framing rule, docs/architecture.md §4).
 *
 * Same row grammar as the Begutachtung's panel (StatementRow): the
 * organisations by name, persons and non-public submissions under their
 * fixed label, the document one click away.
 *
 * ONE LIST, NOT FOUR SEGMENTS, which is where this panel parts from the big
 * one. The segments there exist because 707 rows need narrowing before they
 * can be read; a Vorlage draws a handful (2238 d.B.: ten, GP XXVIII: 555 on
 * 68 Vorlagen), and four buttons over eight rows are four buttons to explain
 * a list that fits on one screen. The order is the segments' order, so the
 * list reads down the partition sentence above it.
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

/* One row per organisation, every citation in the cell — a Vorlage draws
 * few submissions, so the grouped/expanded split of the big panel is not
 * needed here. */
function rowDate(org: OrgEntry): string | null {
  const dates = org.statements.map((s) => s.date).filter((d): d is string => Boolean(d))
  return dates.length ? [...dates].sort().at(-1)! : null
}

interface PanelRow {
  key: string
  date: string | null
  label: string
  links: { citation: string; href: string }[]
  /** Names the submitter in the links' accessible names — organisations only. */
  submitter: string | null
  endorsements: number
  /** Only an organisation row can be searched for; the others have no name. */
  haystack: string | null
}

function orgRow(org: OrgEntry): PanelRow {
  return {
    key: `org-${org.name}`,
    date: rowDate(org),
    label: org.name,
    links: org.statements.map((s) => ({ citation: s.citation, href: s.parliamentUrl })),
    submitter: org.name,
    endorsements: org.endorsements,
    haystack: [org.name, ...org.statements.map((s) => s.citation)].join(' '),
  }
}

/**
 * THE ANONYMOUS HALF AS ROWS, not as a number — the one thing this panel
 * counted without showing (docs/architecture.md §12.14).
 *
 * „3 von Privatpersonen" in the sentence above is a fact about the Vorlage;
 * it is not the submission. What the row adds is everything about a
 * Stellungnahme that is public: the day it came in, its Geschäftszahl, its
 * Zustimmungen, and the link to the document itself. Withheld is the NAME
 * and nothing else — which is the GDPR line (docs/architecture.md §3), and
 * the reason the label is fixed text rather than a blanked-out field.
 *
 * `submitterLabel` is the same guard the big panel renders through: persons
 * and non-public submissions print a constant, whatever the API sent.
 */
function anonymousRow(item: StatementMeta): PanelRow {
  return {
    key: `sn-${item.parliamentUrl}`,
    date: item.date,
    label: submitterLabel(item),
    links: [{ citation: item.citation, href: item.parliamentUrl }],
    submitter: null,
    endorsements: item.endorsements,
    haystack: null,
  }
}

/**
 * Organisations, then private persons, then non-public — the order of the
 * partition sentence above the list and of the big panel's segments, so the
 * list reads as the sentence enumerates. Inside each group the server's
 * date-descending order survives, because `filter` keeps it.
 *
 * The organisations come from `summary.organisationList`, where the server
 * has already grouped an office that filed twice; the other two come from
 * `items`, one row per Stellungnahme, because there is nothing to group
 * them by.
 */
const KIND_ORDER: Record<SubmitterKind, number> = { organisation: 0, person: 1, nonpublic: 2 }

const rows = computed<PanelRow[]>(() => {
  const anonymous = (props.data.items ?? [])
    .filter((s) => s.submitterKind !== 'organisation')
    .sort((a, b) => KIND_ORDER[a.submitterKind] - KIND_ORDER[b.submitterKind])
  return [...orgList.value.map(orgRow), ...anonymous.map(anonymousRow)]
})

/* A query narrows to the organisations, because they are the only rows with
 * a name in them. Everything else is „Privatperson" a dozen times over, and
 * a search field that appears to hide those rows on a whim would read as a
 * filter rather than as the GDPR line it is — which is what the empty state
 * below says in words. */
const matched = computed(() =>
  searchActive.value
    ? rows.value.filter((r) => r.haystack !== null && matchesQuery(r.haystack, query.value))
    : rows.value,
)

/* The two foldings of the panel, for the same two reasons (StatementsPanel):
 * without a query the overflow stays in the DOM and findable, with one the
 * rows the reader excluded are gone. */
const rendered = computed(() =>
  searchActive.value ? matched.value.slice(0, visibleCount.value) : matched.value,
)

function rowHidden(index: number): 'until-found' | undefined {
  return !searchActive.value && index >= visibleCount.value ? 'until-found' : undefined
}

const showSearch = computed(() => orgList.value.length > SEARCH_MIN)

/**
 * Three states, and the sentence differs in each because what is known
 * differs (`RvStatementsResponse`, `parliament/statements.ts`):
 *
 *  - **read whole** — the normal case, every row fetched and classified.
 *  - **organisations only** — above `RV_STATEMENTS_CAP`. Since 26.09.2026
 *    the named half survives the cap: list 142 filters on its own
 *    institution flag, so 1289 d.B. answers its 17 organisations without
 *    the 41,359 private persons behind them.
 *  - **nothing read** — the cap reached even by the organisations, or the
 *    index glitch. Then only the count is a fact.
 */
const organisationsOnly = computed(() => Boolean(summary.value) && props.data.unlisted > 0)

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

/* ORG_LIST_CAP guards against an outlier the RV lists have not produced, but
 * a list silently missing an organisation is exactly what this section is
 * read for. Counted in statements on both sides: `organisations` counts
 * statements, and one listed entry can stand for several of them. */
const hiddenOrgCount = computed(() => {
  const listed = orgList.value.reduce((n, o) => n + o.statements.length, 0)
  return Math.max(0, (summary.value?.organisations ?? 0) - listed)
})

/**
 * WHERE A STELLUNGNAHME ZUR VORLAGE GOES — read from sources on 24.09.2026,
 * and the one thing this panel showed without saying (docs/architecture.md
 * §12.14, `verfahrensfragen.md` C2).
 *
 * Three facts, all documented and none of them a measurement of ours:
 * Parliament's own page on statements to legislative initiatives says
 * approved statements are made available to the parliamentary clubs and to
 * the responsible ministry; they are published at the Gegenstand; and § 23b
 * GOG-NR regulates that publication and nothing else — there is no committee
 * procedure for them.
 *
 * The third clause names the Geschäftsordnung rather than an omission: „wer
 * sie liest, entscheidet niemand hier" would be a verdict, „die
 * Geschäftsordnung sieht dafür kein eigenes Verfahren vor" is the rule as it
 * stands (framing rule, docs/architecture.md §4). What it is NOT allowed to
 * grow into is a sentence about what statements achieve — the one case we
 * read end to end (95/ME → 2238 d.B.) says nothing either way, and „ohne
 * Wirkung" would be exactly the cynicism engine this product must not be.
 *
 * Local to this component on purpose: it is true of the second round, not of
 * the Begutachtung, whose statements go to the Ressort.
 */
const STATEMENT_DESTINATION =
  'Freigegebene Stellungnahmen gehen an die parlamentarischen Klubs und an das zuständige Ministerium und werden beim Gegenstand veröffentlicht; ein eigenes Verfahren im Ausschuss sieht die Geschäftsordnung dafür nicht vor.'

/**
 * UNLESS THE COMMITTEE ASKED (27.09.2026). A committee can call for written
 * Stellungnahmen itself — the Ausschussbegutachtung, § 40 Abs. 1 GOG-NR —
 * and the answers are published in the same list 142 this panel reads: RV
 * 313 of GP XXVIII, 98 institutions written to on 20.11.2025, 21
 * Stellungnahmen from institutions between 25.11. and 03.12. Under the
 * sentence above they read as unsolicited input no committee procedure
 * takes up — the exact opposite of what happened. So where the Verlauf
 * records a consultation, the panel says so first and scopes the rule to
 * the Stellungnahmen someone files on their own. Both halves are facts
 * from Parliament's record; neither says what the answers achieved.
 */
const consultation = computed(() => props.data.committeeConsultation ?? null)

const consultationSentence = computed<string | null>(() => {
  const c = consultation.value
  if (!c) return null
  const who = c.committee ? `Der ${c.committee}` : 'Der Ausschuss'
  const when = c.date ? ` am ${formatDateDe(c.date)}` : ''
  const whom = c.invited > 0 ? `, und dafür ${countLabelDe(c.invited, 'Stelle', 'Stellen')} angeschrieben` : ''
  const answers = props.data.total > 0 ? 'ihre Antworten stehen unter den Stellungnahmen hier' : 'eingelangt ist bisher keine'
  return `${who} hat${when} beschlossen, schriftliche Stellungnahmen einzuholen${whom} (Ausschussbegutachtung); ${answers}.`
})

const destination = computed(() =>
  consultation.value
    ? 'Stellungnahmen, die jemand von sich aus einbringt, gehen an die parlamentarischen Klubs und an das zuständige Ministerium und werden beim Gegenstand veröffentlicht; ein eigenes Verfahren im Ausschuss sieht die Geschäftsordnung für sie nicht vor.'
    : STATEMENT_DESTINATION,
)
</script>

<template>
  <div class="mt-8">
    <h3 class="text-base font-semibold text-ink">Stellungnahmen zur Regierungsvorlage</h3>

    <p v-if="data.total === 0" class="mt-2 max-w-prose text-sm text-ink-secondary">
      Auch zur Regierungsvorlage selbst können auf parlament.gv.at Stellungnahmen
      eingebracht werden. Zu dieser Vorlage wurde <template v-if="filingOpen">bisher</template> keine eingebracht<template
        v-if="filingOpen"
      >; möglich ist es, {{ SECOND_ROUND_CLAUSE }}:
        <ExternalLink :href="data.rvUrl" class="link-inline">Stellungnahme abgeben</ExternalLink></template>.
    </p>

    <p v-if="data.total === 0 && consultationSentence" class="mt-2 max-w-prose text-sm text-ink-secondary">
      {{ consultationSentence }}
    </p>

    <p v-if="data.total === 0 && filingOpen" class="mt-2 max-w-prose text-sm text-ink-secondary">
      {{ destination }}
    </p>

    <!-- `v-if`, not `v-else` (30.09.2026): a `v-else` binds to the sibling
         directly above it — the `total === 0 && filingOpen` paragraph — so a
         closed Vorlage without Stellungnahmen got both branches: „keine
         eingebracht" and „0 Stellungnahmen ein". -->
    <template v-if="data.total > 0">
      <p class="mt-2 max-w-prose text-sm text-ink">
        Zur Regierungsvorlage {{ data.rvCitation }} selbst gingen im Nationalrat
        {{ countLabelDe(data.total, 'Stellungnahme', 'Stellungnahmen') }} ein<template
          v-if="partition && !organisationsOnly"
        >: {{ partition }}</template>.
        <!-- Above the cap the partition describes the fetched rows, not the
             total, so it may not follow the total behind a colon: „41.376
             Stellungnahmen: 16 von Organisationen" claims the other 41.359
             do not exist. It gets its own sentence, and the remainder is
             stated as what upstream says it is — not as Privatpersonen,
             because the flag separates institutions from everything else
             and a non-public submission can sit on either side of it. -->
        <template v-if="organisationsOnly">
          Aufgeschlüsselt sind hier nur die Einbringer, die das Parlament als
          Organisation führt<template v-if="partition">: {{ partition }}</template>.
          Die übrigen {{ formatNumberDe(data.unlisted) }} bleiben ohne
          Aufschlüsselung – über {{ formatNumberDe(data.cap) }} Stellungnahmen
          liest der Monitor nur noch die Organisationen, und namentlich
          gelistet würde von den übrigen ohnehin keine.
        </template>
        <template v-else-if="!summary">
          Bei mehr als {{ formatNumberDe(data.cap) }} entfällt die Aufschlüsselung
          nach Einbringern.
        </template>
      </p>

      <!-- Under the count and above the rows: it is the answer to the
           question the count raises („und dann?"), so it has to be read
           before the names, not after them. -->
      <p v-if="consultationSentence" class="mt-2 max-w-prose text-sm text-ink-secondary">
        {{ consultationSentence }}
      </p>
      <!-- Where they go, only while one can still file (30.09.2026): then it
           belongs to the decision to file. Once the window is shut it is a
           rule of procedure, and it stands on /so-funktionierts#parlament. -->
      <p v-if="filingOpen" class="mt-2 max-w-prose text-sm text-ink-secondary">
        {{ destination }}
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
              ? `${formatNumberDe(matched.length)} von ${countLabelDe(orgList.length, 'Organisation', 'Organisationen')}`
              : countLabelDe(orgList.length, 'Organisation', 'Organisationen')
          }}
        </p>
      </div>

      <!-- Same container as the panel's list, so the rows decide their
           layout on this box's width (row-cols in main.css). -->
      <div
        v-if="rows.length"
        class="@container/list mt-3 overflow-hidden rounded-xl border border-hairline bg-surface"
      >
        <!-- divide-rows: the overflow rows are `hidden` until find-in-page
             reveals them, which Tailwind's `divide-y` miscounts (main.css). -->
        <ul v-if="rendered.length" class="divide-rows">
          <StatementRow
            v-for="(row, i) in rendered"
            :key="row.key"
            :date="row.date"
            :label="row.label"
            :links="row.links"
            :submitter="row.submitter"
            :hidden="rowHidden(i)"
          >
            <template v-if="row.endorsements > 0" #meta>
              {{ endorsementLabel(row.endorsements) }}
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
        :total="matched.length"
        :step="PAGE_SIZE"
        :all-above="ALL_ABOVE"
        @more="visibleCount += PAGE_SIZE"
        @all="visibleCount = matched.length"
      />

      <p v-if="hiddenOrgCount > 0" class="mt-3 max-w-prose text-sm text-ink-muted">
        und {{ formatNumberDe(hiddenOrgCount) }} weitere Organisationen – sie
        stehen vollständig beim Gegenstand auf parlament.gv.at.
      </p>

      <p class="mt-2 text-sm">
        <ExternalLink :href="data.rvUrl" class="link-inline">
          Alle Stellungnahmen zur Vorlage auf parlament.gv.at
        </ExternalLink><template v-if="filingOpen">
          – dort kann weiter Stellung genommen werden,
          {{ SECOND_ROUND_CLAUSE }}.</template>
      </p>
    </template>
  </div>
</template>
