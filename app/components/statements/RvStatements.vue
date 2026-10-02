<script setup lang="ts">
import type { RvStatementsResponse } from '#shared/types'
import { countLabelDe, formatDateDe } from '#shared/utils/format'

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
 * THE LIST IS THE BEGUTACHTUNG'S PANEL since 02.10.2026 — same segments,
 * same sort, same search (StatementsPanel says why). What stays here is what
 * is true of the second round only: where its Stellungnahmen go, whether
 * the Ausschuss asked for them, and the cap. The partition sentence („6 von
 * Organisationen, 3 von Privatpersonen") went with the old list: the filter
 * buttons state the same counts one line below it.
 */
const props = defineProps<{
  data: RvStatementsResponse
  /** Parliament still takes Stellungnahmen on this Vorlage (`enactment.filingOpen`).
   *  The door for it is the card at the top of the page; here it is one
   *  sentence with a link, so the section states the fact without a second
   *  button competing with the first. */
  filingOpen?: boolean
}>()

const summary = computed(() => props.data.summary)

/**
 * Three states, and the sentence differs in each because what is known
 * differs (`RvStatementsResponse`, `parliament/statements.ts`):
 *
 *  - **read whole** — the normal case, every row fetched and classified.
 *    The panel's buttons carry every count, so no sentence does.
 *  - **organisations only** — above `RV_STATEMENTS_CAP`. Since 26.09.2026
 *    the named half survives the cap: list 142 filters on its own
 *    institution flag, so 1289 d.B. answers its 17 organisations without
 *    the 41,359 private persons behind them. The panel then offers the
 *    Organisationen segment alone (`partial`).
 *  - **nothing read** — the cap reached even by the organisations, or the
 *    index glitch. Then only the count is a fact, and there is no panel.
 */
const organisationsOnly = computed(() => Boolean(summary.value) && props.data.unlisted > 0)

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

    <!-- The fact alone since 30.09.2026. That one can file on a
         Regierungsvorlage, until when, and the button to do it stand in the
         action card at the top of the page whenever `filingOpen` is true —
         it is the same window (`windows.vorlage`). -->
    <p v-if="data.total === 0" class="mt-2 text-sm text-ink-secondary">
      {{ filingOpen ? 'Bisher keine eingebracht.' : 'Keine eingebracht.' }}
    </p>

    <p v-if="data.total === 0 && consultationSentence" class="mt-2 text-sm text-ink-secondary">
      {{ consultationSentence }}
    </p>

    <p v-if="data.total === 0 && filingOpen" class="mt-2 text-sm text-ink-secondary">
      {{ destination }}
    </p>

    <!-- `v-if`, not `v-else` (30.09.2026): a `v-else` binds to the sibling
         directly above it — the `total === 0 && filingOpen` paragraph — so a
         closed Vorlage without Stellungnahmen got both branches: „keine
         eingebracht" and „0 Stellungnahmen ein". -->
    <template v-if="data.total > 0">
      <!-- Only where the panel cannot carry the count: above the cap its
           buttons count what was read, not what was filed. The remainder is
           stated as what upstream says it is — not as Privatpersonen,
           because the flag separates institutions from everything else and
           a non-public submission can sit on either side of it. -->
      <p v-if="organisationsOnly || !summary" class="mt-2 text-sm text-ink">
        {{ countLabelDe(data.total, 'Stellungnahme', 'Stellungnahmen') }}.
        <template v-if="organisationsOnly">
          Aufgeschlüsselt sind nur die Organisationen, die übrigen
          {{ formatNumberDe(data.unlisted) }} nicht.
        </template>
        <template v-else>
          Bei mehr als {{ formatNumberDe(data.cap) }} entfällt die Aufschlüsselung
          nach Einbringern.
        </template>
      </p>

      <!-- Above the rows: it is the answer to the question a list of
           Stellungnahmen raises („und dann?"), so it has to be read before
           the names, not after them. -->
      <p v-if="consultationSentence" class="mt-2 text-sm text-ink-secondary">
        {{ consultationSentence }}
      </p>
      <!-- Where they go, only while one can still file (30.09.2026): then it
           belongs to the decision to file. Once the window is shut it is a
           rule of procedure, and it stands on /so-funktionierts#parlament. -->
      <p v-if="filingOpen" class="mt-2 text-sm text-ink-secondary">
        {{ destination }}
      </p>

      <StatementsPanel
        v-if="summary && summary.total > 0"
        :summary="summary"
        :items="data.items ?? []"
        :partial="organisationsOnly"
        :heading-level="4"
      />

      <!-- One pointer, not two in a row (30.09.2026): „– sie stehen
           vollständig beim Gegenstand" and the link under it said the same,
           and whether one can still file is the action card's job. -->
      <p class="mt-3 text-sm text-ink-muted">
        <ExternalLink :href="data.rvUrl" class="link-inline">Alle Stellungnahmen zur Vorlage auf parlament.gv.at</ExternalLink>
      </p>
    </template>
  </div>
</template>
