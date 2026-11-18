<script setup lang="ts">
import { gpNameDe } from '#shared/utils/gp'
import type { DraftDetail, RvStatementsResponse } from '#shared/types'
import type { RvStationView } from '~/utils/outcomes'
import { antragUrl } from '#shared/utils/antragPath'
import { bgblShort, formatDateDe } from '#shared/utils/format'
import {
  earlyVorlageWhenDe,
  namedInRvSourceDe,
  relatedGpSuffixDe,
  tabledBeforeFristEnd,
} from '~/utils/outcomes'
import { parliamentDocumentSource } from '#shared/utils/provenance'
import { PARLIAMENT_HISTORY_SOURCES } from '~/utils/spine'
import { TERMS } from '~/utils/terms'
import { blgNrDe, citeLineDe } from '#shared/utils/citations'

/**
 * „Die Regierungsvorlage" of the draft page, in both outcomes
 * (04.10.2026, out of the page).
 *
 * The station that had no home: the Regierungsvorlage lived as a
 * sub-heading inside the Begutachtung, which made the outcome read as an
 * appendix to the stage before it. The bar's "bisher keine" row links here,
 * where the base rate explains what waiting means. Present in both outcomes
 * — that is the framing rule: the win and the non-win get the same section,
 * the same form, the same weight.
 *
 * The page decides whether it renders (`sections.rv`, which the bar's
 * anchors read too); what it shows is `view` (`rvStationView`).
 */
const props = defineProps<{
  draft: DraftDetail
  view: RvStationView
  /** The Vorlage's own Stellungnahmen; client-side, absent until loaded. */
  rvStatements: RvStatementsResponse | null | undefined
  /** Parliament takes Stellungnahmen on the Vorlage — the door card's window. */
  filingOpen: boolean
}>()

/* The Vorlage as a footnote cites it (21.10.2026): „RV 525 BlgNR 28. GP" —
 * the period read off the Vorlage's own address, which may lie after the
 * draft's. */
const rvBeilage = computed(() => {
  const e = props.draft.enactment
  const gp = /\/gegenstand\/([IVXLC]+)\//.exec(e?.rvUrl ?? '')?.[1] ?? props.draft.gp
  return e ? { citation: e.rvCitation, gp } : null
})
const rvCite = computed(() => {
  const b = rvBeilage.value
  const cited = b ? blgNrDe('RV', b.citation, b.gp) : null
  return cited && props.draft.enactment ? citeLineDe(cited, props.draft.enactment.rvUrl) : null
})
/* A Vorlage tabled while the Frist still ran says so under „Eingebracht"
 * (`tabledBeforeFristEnd`, 115/ME): when it came, before the comparison
 * shows how little it changed. */
const earlyVorlageWhen = computed(() => {
  const d = props.draft
  const rvDate = d.enactment?.rvDate
  if (!d.deadline || !rvDate || !tabledBeforeFristEnd(d.deadline, rvDate)) return null
  return earlyVorlageWhenDe({ arrivedAt: d.arrivedAt, deadline: d.deadline, rvDate })
})

/* The wait's bar stands under the last waiting row: „Beim Ministerium" where
 * the handoff is dated, „Stand" where it is not. */
const waitSlot = computed(() => `after-${props.view.facts.some((f) => f.key === 'ressort') ? 'ressort' : 'stand'}`)
/* What on the frame is ours, and which „Methode" opens under the credit
 * line (14.11.2026, `SectionCredits` `#method`; until then links to
 * /so-funktionierts):
 *  - `genannt`: the match of title and sentence. „In 298 d.B. genannt" is
 *    a fact row, not a tag, so its definition (`TERMS`) opens here rather
 *    than at the word — and with it how a Vorlage comes to carry two
 *    drafts while Parliament links it to one, which the station's rows
 *    show and do not explain.
 *  - none for the waiting bar's yardstick: its explanation — how many drafts
 *    of the period got a Vorlage at all — left the site on 14.11.2026 by the
 *    maintainer's decision (kept in docs/research/wartezeit-bis-regierungsvorlage.md).
 *    The bar labels its own marks, and the credit still names the period. */
const credit = computed<{ own: string; method: 'genannt' | null } | null>(() => {
  const v = props.view
  if (v.named) return { own: 'Abgleich der Titel', method: 'genannt' }
  if (v.noRvBaseRate) return { own: `Vergleichswerte (${gpNameDe(v.noRvBaseRate.gp)})`, method: null }
  return null
})

/* „In 298 d.B. genannt" (14.11.2026): the quote is the Vorlage's
 * Erläuterungen — a free work, the Vorlage's station — beside the Verlauf
 * the frame rests on, and the match of title and sentence is ours. */
const sources = computed(() =>
  props.view.named ? [...PARLIAMENT_HISTORY_SOURCES, parliamentDocumentSource('Erläuterungen', 'rv')] : PARLIAMENT_HISTORY_SOURCES,
)
</script>

<template>
  <section
    id="regierungsvorlage"
    class="page-section scroll-mt-6"
    aria-labelledby="rv-heading"
  >
    <h2 id="rv-heading" class="section-heading">Die Regierungsvorlage</h2>
    <div class="mt-4 space-y-8">
      <!-- The station frame (a card from 01.10.2026, the frame since
           03.10.2026), in both outcomes — the win and the non-win get
           the same form and the same weight (framing rule). Rows only:
           the box carries facts, never prose (the reason the prose box
           went on 18.09.2026), so whatever explains a row stands under
           the frame, in the section's free text.

           `id="ergebnis"` stays on the frame: the anchor is in circulation.

           No Stellungnahmen count here: the section above IS that number
           (18.09.2026). ME→RV is 1:n, so a split draft's further Vorlagen
           get a row (4 of 132 in the GP-XXVIII corpus). -->
      <!-- The frame and the sentences that explain its verdict are one
           block: the section body spaces blocks, not the frame's notes.
         `empty:hidden`: with neither, the block would still take a gap. -->
      <div class="empty:hidden">
        <FactList
          v-if="view.facts.length"
          id="ergebnis"
          :facts="view.facts"
        >
          <template v-if="draft.enactment" #value-rv>
            <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                <ExternalLink
                  :href="draft.enactment.rvUrl"
                  class="link-inline"
                >Regierungsvorlage {{ draft.enactment.rvCitation }}</ExternalLink><template v-if="draft.enactment.rvDate">, am {{ formatDateDe(draft.enactment.rvDate) }}</template>
              </span>
              <CiteButton v-if="rvCite" :text="rvCite" subject="Die Regierungsvorlage" />
            </p>
          </template>
          <template v-if="draft.enactment && earlyVorlageWhen" #after-rv>
            <p class="mt-0.5 text-ink-secondary">{{ earlyVorlageWhen }}</p>
          </template>
          <template v-if="draft.enactment?.furtherRv.length" #value-weitere>
            <p>
              <template
                v-for="(rv, i) in draft.enactment.furtherRv"
                :key="rv.url"
              ><span v-if="i > 0">, </span><ExternalLink :href="rv.url" class="link-inline">{{ rv.label }}</ExternalLink></template>
            </p>
          </template>
          <template v-if="draft.antragPath && view.viaAntrag" #value-antrag>
            <p>
              <ExternalLink :href="antragUrl(draft.gp, draft.antragPath)" class="link-inline">Initiativantrag {{ draft.antragPath.antrag.citation }}</ExternalLink>,
              kundgemacht: {{ bgblShort(draft.antragPath.antrag.bgblNumber) }}
            </p>
          </template>
          <!-- The win side of the same mechanism: the draft that finds a
               lapsed one also finds the one that took its place. -->
          <!-- How long the draft has waited, against how long the last
               closed period waited (`RvWaitBar`), its marks labelled at
               the bar. -->
          <template v-if="view.noRvBaseRate" #[waitSlot]>
            <RvWaitBar :deadline="draft.deadline" :rate="view.noRvBaseRate" />
          </template>
          <!-- „In 298 d.B. genannt" (14.11.2026): another draft's
               Vorlage names this one. The frame carries the state, never
               prose — and a quote and a link are facts: the sentence that
               names the draft with the document it stands in, and the
               draft Parliament links the Vorlage to, where the Vorlage's
               way on is told. Why no comparison follows is the sentence
               under the frame (`view.context`); how a Vorlage comes to
               carry two drafts is „Methode" in the credit line. -->
          <template v-if="view.named" #value-zitat>
            <p>„{{ view.named.quote }}“</p>
            <p class="mt-1">
              <ExternalLink :href="view.named.explanationsUrl" class="link-inline">{{ namedInRvSourceDe(view.named) }}</ExternalLink>
            </p>
          </template>
          <template v-if="view.named" #value-weiter>
            <template v-if="view.named.linkedDrafts.length">
              <p v-for="l in view.named.linkedDrafts" :key="`${l.gp}-${l.inr}`">
                <NuxtLink
                  :to="`/entwuerfe/${l.gp}/${l.inr}`"
                  class="link-inline"
                >{{ l.citation }}</NuxtLink>{{ relatedGpSuffixDe(l.gp, draft.gp) }}, {{ l.title }}
              </p>
              <p class="mt-1 text-ink-secondary">Dort steht, wie es mit der Vorlage weiterging.</p>
            </template>
            <p v-else>
              <ExternalLink :href="view.named.rv.url" class="link-inline">Regierungsvorlage {{ view.named.rv.citation }}</ExternalLink>
            </p>
          </template>
          <template v-if="draft.successor" #value-nachfolger>
            <p>
              <NuxtLink
                :to="`/entwuerfe/${draft.successor.gp}/${draft.successor.inr}`"
                class="link-inline"
              >{{ draft.successor.citation }}</NuxtLink>{{ relatedGpSuffixDe(draft.successor.gp, draft.gp) }}, eingelangt am
              {{ formatDateDe(draft.successor.arrivedAt) }}
            </p>
          </template>
        </FactList>
        <!-- No link: the frame's first fact is the Vorlage. -->
        <SectionCredits
          v-if="view.facts.length"
          :sources="sources"
          :marked="false"
          :own="credit?.own"
        >
          <template v-if="credit?.method === 'genannt'" #method>
            <p>{{ TERMS.genannt.definition }}</p>
          </template>
        </SectionCredits>
        <!-- What explains the frame's verdict: what is open, how an
             Initiativantrag was matched, or for „genannt" why no
             comparison follows. -->
        <div v-if="!draft.enactment && !draft.active && (view.context || draft.antragPath)" class="mt-4 space-y-2">
          <GapNote v-if="view.context" :text="view.context" class="text-sm text-ink-secondary" />
          <AntragPathNote
            v-if="draft.antragPath"
            :path="draft.antragPath"
            :gp="draft.gp"
            :deadline="draft.deadline"
            :lead="!view.viaAntrag"
            :class="view.context ? 'pt-1' : ''"
          />
        </div>
      </div>
      <!-- The accountability core: what became of the draft, § by §, both
           ways — changed and unchanged alike (framing rule). Only
           once a Regierungsvorlage exists; before that there is nothing to
           hold the draft against. Before the Vorlage's own Stellungnahmen
           since 01.10.2026: the comparison is what led into this station,
           they are the input to the next one. -->
      <!-- Deferred (12.11.2026): asked once the reader comes near. The
           frame above asks for nothing of it since 17.11.2026. -->
      <LawDiffSection
        v-if="draft.enactment"
        :gp="draft.gp"
        :inr="draft.inr"
        deferred
      />
      <!-- The second window for input: what was filed on the Vorlage itself,
           through the same panel as the Begutachtung's. Client-side
           data, so the block appears once it is there and says nothing
           while it is not — an empty promise here would read as "none". -->
      <RvStatements
        v-if="draft.enactment && rvStatements"
        :data="rvStatements"
        :filing-open="filingOpen"
      />
      <!-- The second window's door once more, at the end of its station
           (`DoorButton`). Outside RvStatements: that block is
           client-side and absent until loaded, the window is not.
           Where a Stellungnahme goes is neither a sentence nor a link
           here (03.10.2026): the consent to publication is asked on
           Parliament's form, and „kein eigenes Verfahren im Ausschuss"
           beside the button reads as „filing is pointless". It opens
           beside the list instead, next to its exception (`RvStatements`,
           „Was mit ihnen geschieht", since 14.11.2026). -->
      <div v-if="filingOpen && draft.enactment" class="flex flex-wrap items-center gap-3">
        <StatementFormDoors :item-url="draft.enactment.rvUrl" />
      </div>
    </div>
  </section>
</template>
