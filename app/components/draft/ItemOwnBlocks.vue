<script setup lang="ts">
import type { AmendedLawsResponse, RvStatementsResponse, VorlageDetail } from '#shared/types'
import type { ItemKindCopy } from '~/utils/itemKind'
import type { CarriedDraftLine } from '~/utils/entwurfFrame'
import { filingClosedDe, filingClosedSourceDe } from '~/utils/itemKind'

/**
 * What a Vorlage, an Antrag or a motion brings itself, on its own page
 * (`/entwuerfe/<GP>/<kind>/<nr>`): the law in force it would change, its
 * comparison, the Ressort's reasoning, its documents, the Stellungnahmen
 * filed on it and the door to file one.
 *
 * ONE SET OF BLOCKS, PLACED BY THE ITEM'S STATION (16.11.2026). The page
 * showed them as two sections of their own, „Der Entwurf" and
 * „Stellungnahmen an den Nationalrat" — neither a station of the page's
 * rail, which has no „Entwurf" for these kinds (`vorlageStations`), against
 * the rule of one section per station (`docs/decisions.md`, „The detail
 * pages"). Now they stand in the section of the station the item is:
 * „Die Regierungsvorlage" for a Vorlage or a treaty's, as on a draft's page
 * (`RvStationSection`, which holds the Vorlage's Stellungnahmen too), and
 * „Im Parlament" for a motion, which enters there (`noRvReasonDe`).
 *
 * No root element: the blocks join the section body that spaces its
 * children (`space-y-8`), so one that is not rendered leaves no gap.
 */
defineProps<{
  item: VorlageDetail
  /** The item's words (`itemCopyDe`). */
  copy: ItemKindCopy
  apiBase: string
  /** The citation a footnote uses (`itemCiteAsDe`). */
  citeAs: string
  amendedLaws: AmendedLawsResponse | null | undefined
  /** The frame's row for an Antrag that carries a consulted draft's text. */
  carried: CarriedDraftLine | null
  /** The item's own Textgegenüberstellung is shown. */
  showsAnnex: boolean
  /** Client-side, absent until loaded. */
  statements: RvStatementsResponse | null | undefined
  filingOpen: boolean
  /** Whose Stellungnahmen (`RvStatements`). */
  statementsItem: 'rv' | 'antrag' | 'ausschussantrag' | 'bundesratsantrag'
  /** Inside „Im Parlament", whose last fold is „Dokumente" too (Parliament's
   *  versions): this one then names the item, „Dokumente zum Antrag (4)". */
  namedDocuments?: boolean
}>()
</script>

<template>
  <!-- The law in force it would change, as on the draft page. -->
  <EntwurfFrame :laws="amendedLaws" :carried="carried" />
  <!-- „Zitieren" at a § only for a Vorlage's annex, which cites as its
       Beilage; an Antrag's is Parliament's working copy, no document of the
       Antrag to cite it by. -->
  <PageSubsection v-if="showsAnnex" id="gegenueberstellung" heading="Was ändert der Entwurf?">
    <TextComparisonSection
      :gp="item.gp"
      :inr="item.inr"
      :api-base="apiBase"
      :cite-as="item.itemKind === 'initiativantrag' ? undefined : citeAs"
      without-layers
    />
  </PageSubsection>
  <PageSubsection v-if="item.itemKind === 'regierungsvorlage'" id="erlaeuterungen" heading="Was das Ressort begründet">
    <ExplanationsSection :gp="item.gp" :inr="item.inr" :api-base="apiBase" />
  </PageSubsection>
  <FoldSection
    v-if="item.documents.length"
    :heading="namedDocuments ? `Dokumente ${copy.zum} (${item.documents.length})` : `Dokumente (${item.documents.length})`"
  >
    <div class="pb-2">
      <DocumentList
        :documents="item.documents"
        :cite-as="citeAs"
        :author="copy.author"
      />
    </div>
  </FoldSection>

  <!-- Where Parliament takes no Stellungnahmen on the kind (a treaty's
       Vorlage, `ItemFiling`): one sentence and its source in place of the
       list and the door — a gap is said, never shown as an empty list. -->
  <p v-if="!item.filing.possible" class="text-sm text-ink-secondary">
    {{ filingClosedDe(item.filing.reason, item.treatyKind) }}
    <ExternalLink :href="item.parliamentUrl" class="link-muted">{{ filingClosedSourceDe(item.citation) }}</ExternalLink>
  </p>
  <!-- Client-side data: the block appears once it is there and says nothing
       while it is not — an empty heading would read as „none". Its own
       heading names the item („Stellungnahmen zum Antrag", `RvStatements`). -->
  <div v-else-if="statements" id="stellungnahmen" class="scroll-mt-6">
    <RvStatements
      :data="statements"
      :filing-open="filingOpen"
      :item="statementsItem"
    />
    <!-- The card's door once more, under the list where the decision to
         file is made (`DoorButton`), as on the draft page
         (`DraftStatementsBlock`, `RvStationSection`). The card's condition. -->
    <div v-if="filingOpen" class="mt-4 flex flex-wrap items-center gap-3">
      <StatementFormDoors :item-url="item.parliamentUrl" />
    </div>
  </div>
</template>
