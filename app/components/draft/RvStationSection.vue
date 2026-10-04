<script setup lang="ts">
import type { DraftDetail, RvStatementsResponse, TraceLink } from '#shared/types'
import type { RvStationView } from '~/utils/outcomes'
import { antragUrl } from '#shared/utils/antragPath'
import { bgblShort, formatDateDe } from '#shared/utils/format'
import { changeShareRateFor, earlyVorlageWhenDe, relatedGpSuffixDe, tabledBeforeFristEnd } from '~/utils/outcomes'
import { PARLIAMENT_HISTORY_SOURCES } from '~/utils/spine'

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
  /** What the ME→RV comparison has delivered so far (`useVorlageOutcome`):
   *  the share for the bar, and the two counts as the rows print them. */
  share: { share: number } | null
  shareDe: string | null
  reasoningDe: string | null
  rvExplanations: TraceLink | null
  /** The Vorlage's own Stellungnahmen; client-side, absent until loaded. */
  rvStatements: RvStatementsResponse | null | undefined
  /** Parliament takes Stellungnahmen on the Vorlage — the door card's window. */
  filingOpen: boolean
}>()

const shareRate = computed(() => changeShareRateFor(props.draft.gp))
/* A Vorlage tabled while the Frist still ran is not held against the range:
 * that range was measured on Vorlagen that came after the Begutachtung
 * (`tabledBeforeFristEnd`, 115/ME). When it came stands in the bar's place. */
const earlyVorlageWhen = computed(() => {
  const d = props.draft
  const rvDate = d.enactment?.rvDate
  if (!d.deadline || !rvDate || !tabledBeforeFristEnd(d.deadline, rvDate)) return null
  return earlyVorlageWhenDe({ arrivedAt: d.arrivedAt, deadline: d.deadline, rvDate })
})
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
            <p>
              <ExternalLink
                :href="draft.enactment.rvUrl"
                class="link-inline"
              >Regierungsvorlage {{ draft.enactment.rvCitation }}</ExternalLink><template v-if="draft.enactment.rvDate">, am {{ formatDateDe(draft.enactment.rvDate) }}</template>
            </p>
          </template>
          <template v-if="draft.enactment" #value-aenderung>
            <p v-if="shareDe">{{ shareDe }}</p>
            <div v-else class="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-hairline motion-reduce:animate-none" aria-hidden="true" />
          </template>
          <!-- The period's range as a bar; for an early Vorlage when it
               came instead. While loading the bar's height stays held, so
               the comparison below does not move when it arrives. -->
          <template v-if="draft.enactment" #after-aenderung>
            <p v-if="earlyVorlageWhen && share" class="mt-0.5 text-ink-secondary">{{ earlyVorlageWhen }}</p>
            <ChangeShareBar v-else-if="share" :share="share.share" :rate="shareRate" />
            <div v-else-if="!earlyVorlageWhen" class="mt-3 h-13" aria-hidden="true" />
          </template>
          <!-- Where the Ressort says why — the document, never a cause
               (framing rule): the Erläuterungen are the Ressort's reasons,
               and whether a Stellungnahme stood behind a change is what a
               submitter looks for there. The one sentence left in the
               frame, because it is an invitation, not a fact. -->
          <template v-if="draft.enactment" #value-begruendung>
            <p v-if="reasoningDe">{{ reasoningDe }}</p>
            <p v-if="rvExplanations" :class="reasoningDe ? 'mt-1 text-ink-secondary' : ''">
              In den <ExternalLink :href="rvExplanations.url" class="link-inline">Erläuterungen der Regierungsvorlage</ExternalLink>
              steht oft, ob eine Stellungnahme dahintersteht.
            </p>
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
        <!-- No link: the frame's first fact is the Vorlage. The counts
             are the comparison's, ours (`useVorlageOutcome`). -->
        <SectionCredits
          v-if="view.facts.length"
          :sources="PARLIAMENT_HISTORY_SOURCES"
          :marked="false"
          :own="view.counted ? 'Zählung' : undefined"
          :method="view.counted ? '/so-funktionierts#vergleich' : undefined"
        />
        <!-- What explains the frame's verdict: what is open, the base rate
             that puts the waiting in proportion, and how an Initiativantrag
             was matched. -->
        <div v-if="!draft.enactment && !draft.active && (view.context || view.noRvBaseRate || draft.antragPath)" class="mt-4 space-y-2">
          <p v-if="view.context" class="text-sm text-ink-secondary">{{ view.context }}</p>
          <p v-if="view.noRvBaseRate" class="text-sm text-ink-secondary">{{ view.noRvBaseRate }}</p>
          <AntragPathNote
            v-if="draft.antragPath"
            :path="draft.antragPath"
            :gp="draft.gp"
            :deadline="draft.deadline"
            :lead="!view.viaAntrag"
            :class="view.context || view.noRvBaseRate ? 'pt-1' : ''"
          />
        </div>
      </div>
      <!-- The accountability core: what became of the draft, § by §, both
           ways — changed and unchanged alike (framing rule,
           docs/architecture.md §4). Only
           once a Regierungsvorlage exists; before that there is nothing to
           hold the draft against. Before the Vorlage's own Stellungnahmen
           since 01.10.2026: the comparison is what led into this station,
           they are the input to the next one. -->
      <LawDiffSection
        v-if="draft.enactment"
        :gp="draft.gp"
        :inr="draft.inr"
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
           beside the button reads as „filing is pointless" — it stands
           on /so-funktionierts#parlament, next to its exception. -->
      <div v-if="filingOpen && draft.enactment">
        <DoorButton :href="draft.enactment.rvUrl">
          Stellungnahme zur Regierungsvorlage abgeben
        </DoorButton>
      </div>
    </div>
  </section>
</template>
