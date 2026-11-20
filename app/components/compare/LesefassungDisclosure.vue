<script setup lang="ts">
/**
 * „Ganzer Paragraph in der vorgeschlagenen Fassung (nicht amtlich)" — one
 * § of our own Lesefassung, folded.
 *
 * The name (19.11.2026; „Ganzer Paragraph danach" since 30.09.2026): the
 * word of the column above it, „Vorgeschlagene Fassung", which is also the
 * ministries' own heading of that column. „danach" meant „after the change
 * above" only where it stood under one; read anywhere else, it was „the
 * next paragraph". „Ganzer" says what differs from that column, which
 * prints extracts.
 *
 * Its own component since 26.10.2026, because it now stands in two places:
 * under the § of the Textgegenüberstellung it was checked against, and — for
 * a § the page could not place there — in the list at the end of its law
 * (`placeAtParagraphs`). One markup, so the two cannot drift.
 */
import type { ConsolidatedParagraph } from '#shared/types'
import { absaetze } from '~/utils/absaetze'
// Imported, not auto-imported: a helper used only in the template is not resolved at runtime.
import { laterAmendmentText, witnessText } from '~/utils/lesefassung'

defineProps<{ paragraph: ConsolidatedParagraph }>()
</script>

<template>
  <Disclosure size="xs" tone="ink">
    <template #summary>Ganzer Paragraph in der vorgeschlagenen Fassung (nicht amtlich)</template>
    <div class="mt-1 pl-6">
      <!-- „nicht amtlich" stands IN the summary since 30.09.2026, so it is
           read before the disclosure opens, not after; inside, only how
           the text is made (RIS in force plus this draft's
           instructions, confirmed by the ressort's own Gegenüberstellung). -->
      <!-- The text in force it starts from, per § (26.10.2026): the section's
           credit linked the first shown §'s law only, which in a package is
           the wrong law for every other one. -->
      <!-- „Wie dieser Text entsteht" („… diese Lesefassung …" until
           19.11.2026: a lawyer's word the summary no longer uses) opens its text in place, under
           this line (14.11.2026; a link to /so-funktionierts#lesefassung
           before): the `TermNote` of „Methode", not a nested `Disclosure`,
           because it shares its row with the RIS link and its text wants
           the whole width beneath the row. A <div>: a <details> cannot
           sit in a <p>. -->
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <TermNote>
          Wie dieser Text entsteht
          <template #note>
            <div class="prose-flow pb-2 text-sm [&_dt]:font-medium">
              <MethodLesefassung />
            </div>
          </template>
        </TermNote>
        <ExternalLink v-if="paragraph.risUrl" :href="paragraph.risUrl" class="link-muted">Geltender Text im RIS</ExternalLink>
      </div>
      <!-- Under the row that names the text it starts from, because the RIS
           link there shows the later one: for the first day of the
           Begutachtung RIS files a version a Bundesgesetzblatt issued after
           it brought (`standingOnDay`, 20.11.2026). In the line's own
           register, not a `GapNote`: nothing is missing, the sentence says
           which text this is. -->
      <p v-if="paragraph.laterAmendment" class="mt-1 text-xs text-ink-muted">{{ laterAmendmentText(paragraph.laterAmendment, true) }}</p>
      <!-- Shown on the draft's own text where the annex reads otherwise
           (20.11.2026): both wordings, before the text they concern. -->
      <p v-if="witnessText(paragraph)" class="mt-2 text-xs text-ink-muted">{{ witnessText(paragraph) }}</p>
      <p v-if="paragraph.headingSegments" class="mt-2 text-sm font-semibold text-ink">
        <DiffText :segments="paragraph.headingSegments" removed-normal-weight />
      </p>
      <!-- One paragraph per Absatz: that is how the law is structured, and
           eighteen of them in one block are no structure at all. -->
      <p
        v-for="(abs, ai) in absaetze(paragraph.segments)"
        :key="ai"
        class="mt-2 hyphens-auto text-sm leading-relaxed text-ink"
      >
        <DiffText :segments="abs" />
      </p>
    </div>
  </Disclosure>
</template>
