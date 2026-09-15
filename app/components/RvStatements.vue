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
}>()

type OrgEntry = StatementsSummary['organisationList'][number]

const summary = computed(() => props.data.summary)

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
      eingebracht werden. Zu dieser Vorlage wurde keine eingebracht.
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

      <!-- Same container as the panel's list, so the rows decide their
           layout on this box's width (row-cols in main.css). -->
      <div
        v-if="summary && summary.organisationList.length"
        class="@container/list mt-3 overflow-hidden rounded-xl border border-hairline bg-surface"
      >
        <ul class="divide-y divide-hairline">
          <StatementRow
            v-for="org in summary.organisationList"
            :key="org.name"
            :date="rowDate(org)"
            :label="org.name"
            :links="links(org)"
            :submitter="org.name"
          >
            <template v-if="org.endorsements > 0" #meta>
              {{ endorsementLabel(org.endorsements) }}
            </template>
          </StatementRow>
        </ul>
      </div>

      <p class="mt-2 text-sm">
        <ExternalLink :href="data.rvUrl" :class="LINK">
          Alle Stellungnahmen zur Vorlage auf parlament.gv.at
        </ExternalLink>
      </p>
    </template>
  </div>
</template>
