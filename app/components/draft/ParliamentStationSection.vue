<script setup lang="ts">
import type { DraftDetail, EnactmentInfo, LawStationId } from '#shared/types'
import type { Fact } from '~/components/ui/FactList.vue'
import { LAW_STATION_LABEL, lawStationOf } from '#shared/utils/lawStations'
import { PARLIAMENT_HISTORY_SOURCES, parliamentStandDe, voteLineDe } from '~/utils/spine'

/**
 * „Im Parlament" of the draft page (04.10.2026, out of the page).
 *
 * The station exists as soon as a Regierungsvorlage does, not only when
 * parliament amended it: "der Nationalrat hat den Text unverändert
 * beschlossen" IS a finding, and it had no place on this page before. Where
 * change does happen it is the majority case — 52 of the 91 GP-XXVIII
 * drafts that reached a Vorlage were changed again afterwards — and the
 * section carries the texts and, since 01.10.2026, their comparison.
 *
 * The page decides whether it renders (`sections.parlament`, which the
 * bar's anchors read too) and hands in the Vorlage it renders for.
 */
const props = defineProps<{
  draft: DraftDetail
  /** The draft's Regierungsvorlage — `draft.enactment`, known to be there. */
  enactment: EnactmentInfo
  /** Parliament published a changed text, so the bar links the comparison
   *  (`lastParliamentStation`); the page's `comparisonAnchors` reads the same. */
  showDiff: boolean
  /** Parliament's versions, in order (`parliamentTexts`). */
  parliamentTexts: LawStationId[]
}>()

/* How the clubs voted on it — the same phrase the bar's row carries, here as
 * the tail of a sentence that names the reading it belongs to. Null until the
 * third reading happened, and null for the few records upstream keeps
 * without club lists (`parseVote`), where the section simply says one
 * sentence less rather than a vaguer one. */
const voteLine = computed(() => voteLineDe(props.enactment.vote))

const facts = computed<Fact[]>(() => {
  const e = props.enactment
  return [
    // What parliament did, as the frame's first row — the function the bar's
    // fact line reads (`parliamentStandDe`), so the row and the bar cannot
    // disagree.
    { key: 'stand', title: 'Stand', text: parliamentStandDe(props.draft) },
    // Where the Abänderungsanträge are named, in procedural order between
    // the state and the vote (02.10.2026). Values in the template's slots,
    // they carry links. A row is missing where the Verlauf names nothing —
    // never „keine", because a motion the reader missed would turn into a
    // false negative.
    ...(e.committeeReport ? [{ key: 'ausschuss', title: 'Im Ausschuss' }] : []),
    ...(e.plenaryAmendments?.amendments.length ? [{ key: 'plenum', title: 'Im Plenum' }] : []),
    ...(voteLine.value ? [{ key: 'lesung', title: 'Dritte Lesung', text: `${voteLine.value}.` }] : []),
  ]
})

/* Parliament's versions under the names the comparison above them uses —
 * „Ausschussfassung", not upstream's „Geändert im Ausschuss" (01.10.2026):
 * in a fold right under a toggle and a source line that say
 * „Ausschussfassung", the same document must not carry a second name. A
 * title upstream gives that is no station keeps its own. */
const documents = computed(() =>
  (props.draft.textEvolution ?? []).map((doc) => {
    const station = lawStationOf(doc.title)
    return station ? { ...doc, title: LAW_STATION_LABEL[station] } : doc
  }),
)
</script>

<template>
  <section
    id="parlament"
    class="page-section scroll-mt-6"
    aria-labelledby="parlament-heading"
  >
    <h2 id="parlament-heading" class="section-heading">Im Parlament</h2>
    <div class="mt-4 space-y-8">
      <!-- The station frame (a card from 01.10.2026, the frame since
           03.10.2026): the outcome, who carried it, and the record. The vote stood under the comparison until then, cut
           off from the state it belongs to.

           The outcome is the same function the bar's fact line uses
           (`app/utils/spine.ts`), so the two can never disagree. "lapsed"
           says what happened and not why: we observe the end of the GP,
           never the reason for it. The same holds for the four outcomes
           read off the house status since 23.09.2026 — each names the
           step, none of them a motive, and upstream's own wording for it
           is never printed.

           The vote names the reading, because that is the vote parliament
           records — one vote on the whole bill at the end. A club can vote
           against it and still have put a change into the text compared
           below, so the two facts are neighbours, never a cause and its
           effect. The row is missing rather than vaguer where upstream
           kept no club list (`parseVote`). -->
      <div>
        <FactList :facts="facts">
          <template v-if="enactment.committeeReport" #value-ausschuss>
            Bericht <ExternalLink :href="enactment.committeeReport.url" class="link-inline">{{ enactment.committeeReport.label }}</ExternalLink>
          </template>
          <!-- By number only, never who tabled the motion. -->
          <template v-if="enactment.plenaryAmendments?.amendments.length" #value-plenum>
            Angenommen: {{ enactment.plenaryAmendments.amendments.length > 1 ? 'Abänderungsanträge' : 'Abänderungsantrag' }}
            <template v-for="(motion, i) in enactment.plenaryAmendments.amendments" :key="motion.url"><template v-if="i > 0">{{ i === enactment.plenaryAmendments.amendments.length - 1 ? ' und ' : ', ' }}</template><ExternalLink :href="motion.url" class="link-inline">{{ motion.label }}</ExternalLink></template><template v-if="enactment.plenaryAmendments.session">, <ExternalLink :href="enactment.plenaryAmendments.session.url" class="link-inline">{{ enactment.plenaryAmendments.session.label }}</ExternalLink></template>
          </template>
        </FactList>
        <!-- Where the frame's facts come from, under it in the credit line
             like every other box's source (02.10.2026). It stood inside the
             box as a footer row. -->
        <SectionCredits :sources="PARLIAMENT_HISTORY_SOURCES" :marked="false">
          <ExternalLink :href="enactment.rvUrl" class="link-muted">Verlauf</ExternalLink>
        </SectionCredits>
      </div>
      <!-- What the committee and the plenary did to the text, one step
           each (`lawDiffSteps`, 01.10.2026) — the section's content, so it
           comes first, before who voted how. Only where parliament published
           a changed text, as the bar's link. Deferred: the page's second
           comparison, and below most readers' scroll. -->
      <LawDiffSection
        v-if="showDiff"
        :gp="draft.gp"
        :inr="draft.inr"
        scope="parlament"
        :parliament-texts="parliamentTexts"
        deferred
      />
      <!-- The versions themselves, folded at the end as under „Der
           Entwurf" (01.10.2026): the documents are what a citing or
           downloading reader looks for, and that reader expects them
           last. Open above the comparison they stood between the
           section's sentence and its content, and repeated the two texts
           the comparison's source line links anyway. Named as the
           comparison names them (`documents` above). The
           Regierungsvorlage itself is not among them: the section above
           offers it. -->
      <FoldSection
        v-if="documents.length"
        :heading="`Dokumente (${documents.length})`"
      >
        <div class="pb-2">
          <DocumentList :documents="documents" />
        </div>
      </FoldSection>
    </div>
  </section>
</template>
