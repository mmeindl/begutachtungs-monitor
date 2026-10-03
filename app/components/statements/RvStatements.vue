<script setup lang="ts">
import type { RvStatementsResponse } from '#shared/types'
import PageSubsection from '~/components/ui/PageSubsection.vue'
import { countLabelDe, formatDateDe } from '#shared/utils/format'
import type { SourceEntry } from '#shared/utils/provenance'

/* `keine-lizenz`, not the station's freie Werke: the RV page excludes
 * „sämtliche Informationen zu Stellungnahmen" from free use and licensing
 * alike (read 30.09.2026) — the one part of a parliamentary station the
 * documents rule does not cover. */
const STATEMENTS_SOURCES: SourceEntry[] = [{ what: 'Stellungnahmen zur Regierungsvorlage', publisher: 'parlament', terms: 'keine-lizenz' }]

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
   *  The door for it is the card at the top of the page, repeated under this
   *  block by the page itself (`FilingButton`, 03.10.2026) — not in here,
   *  because this block renders only once its data has loaded. */
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

/* WHERE A STELLUNGNAHME ZUR VORLAGE GOES (Klubs, Ministerium, published at
 * the Gegenstand, no committee procedure — read from sources on 24.09.2026,
 * docs/architecture.md §12.14) stood here as a sentence until 03.10.2026.
 * It is a rule of procedure, the same for every Vorlage, and stood word for
 * word on /so-funktionierts#parlament already. Not linked beside the
 * filing button either: there its last clause reads as „filing is
 * pointless", and the publication it names is asked on Parliament's form,
 * at the moment of filing. Whatever replaces it may not grow into a sentence
 * about what statements achieve (framing rule, docs/architecture.md §4). */

/**
 * UNLESS THE COMMITTEE ASKED (27.09.2026). A committee can call for written
 * Stellungnahmen itself — the Ausschussbegutachtung, § 40 Abs. 1 GOG-NR —
 * and the answers are published in the same list 142 this panel reads: RV
 * 313 of GP XXVIII, 98 institutions written to on 20.11.2025, 21
 * Stellungnahmen from institutions between 25.11. and 03.12. Under the
 * rule above they read as unsolicited input no committee procedure
 * takes up — the exact opposite of what happened. So where the Verlauf
 * records a consultation, the panel says so: a fact about this Vorlage, not
 * a rule, so it stays when the rule moved to the explainer (03.10.2026). It
 * comes from Parliament's record and says nothing about what the answers
 * achieved.
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
</script>

<template>
  <PageSubsection heading="Stellungnahmen zur Regierungsvorlage">
    <!-- The fact alone since 30.09.2026. That one can file on a
         Regierungsvorlage, until when, and the button to do it stand in the
         action card at the top of the page whenever `filingOpen` is true —
         it is the same window (`windows.vorlage`) — and the button once
         more under this block (03.10.2026). -->
    <p v-if="data.total === 0" class="mt-2 text-sm text-ink-secondary">
      {{ filingOpen ? 'Bisher keine eingebracht.' : 'Keine eingebracht.' }}
    </p>

    <p v-if="data.total === 0 && consultationSentence" class="mt-2 text-sm text-ink-secondary">
      {{ consultationSentence }}
    </p>

    <!-- `v-if`, not `v-else` (30.09.2026): a `v-else` binds to the sibling
         directly above it — then a `total === 0 && filingOpen` paragraph — so a
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

      <!-- One pointer, not two in a row (30.09.2026): „– sie stehen
           vollständig beim Gegenstand" and the link under it said the same,
           and whether one can still file is the action card's job.
           A row of the panel's foot since 02.10.2026, on the right where the
           list's other way to more stands („Weitere 10 · Alle"); a line of its
           own only where no panel is shown. -->
      <StatementsPanel
        v-if="summary && summary.total > 0"
        :summary="summary"
        :items="data.items ?? []"
        :partial="organisationsOnly"
        :heading-level="4"
      >
        <template #footer>
          <p class="flex border-t border-hairline px-4 py-3 text-sm sm:justify-end">
            <ExternalLink :href="data.rvUrl" class="tap-target font-medium link-quiet">Alle Stellungnahmen zur Vorlage auf parlament.gv.at</ExternalLink>
          </p>
        </template>
      </StatementsPanel>
      <p v-else class="mt-3 text-sm">
        <ExternalLink :href="data.rvUrl" class="tap-target font-medium link-quiet">Alle Stellungnahmen zur Vorlage auf parlament.gv.at</ExternalLink>
      </p>
      <!-- The same credit line as under the Begutachtung's list (03.10.2026):
           the rows are Parliament's, the Einordnung and the nameless
           Privatpersonen are ours. Only under the panel — the count-only
           fallback above the cap shows no classification to credit, and its
           sentence already names upstream. -->
      <SectionCredits
        v-if="summary && summary.total > 0"
        :sources="STATEMENTS_SOURCES"
        :marked="false"
        own="Einordnung der Einbringer:innen"
      >
        <NuxtLink to="/ueber#about-privacy" class="link-muted">Privatpersonen ohne Namen</NuxtLink>
      </SectionCredits>
    </template>
  </PageSubsection>
</template>
