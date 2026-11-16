<script setup lang="ts">
/**
 * The section of one station of an EU act's rail (15.11.2026), in the
 * grammar of a draft page's station sections (`LandStationSections`,
 * `ParliamentStationSection`), so the two kinds of page read as one site:
 *
 *   1. the heading, word for word the station's name in the rail;
 *   2. a frame of facts to consult (`FactList`): a name, the fact under
 *      it, the way to the record at its source inside the fact, „Zitieren"
 *      beside a citation;
 *   3. what limits the reading, as short paragraphs under the frame;
 *   4. the credit line under the frame;
 *   5. „Wer Rückmeldung gegeben hat": an open block per feedback window
 *      the frame shows (`EuFeedbackBlock`, step 4), read when it nears
 *      the viewport;
 *      then the door once more (`section.door`, `DoorButton`), while the
 *      page's door card shows — under who has given feedback, where the
 *      decision to act is made, as a draft's second door stands under its
 *      Stellungnahmen; then the default slot: what the section holds
 *      beyond its facts — the drafts of „Umsetzung";
 *   6. the dated record, folded, on the sheet a list stands on (`ListBox`),
 *      as „Alle Schritte im Landtag": the steps of the procedure, or under
 *      „Umsetzung" the measures the Member State notified.
 *
 * Every word comes from `euRailView`; this component holds none. A later
 * step of the EU cycle fills these places and adds no layout of its own.
 */
import type { EuRailSection } from '~/utils/euRail'
// Imported, not auto-imported: a helper used only in the template is not in scope at runtime (CLAUDE.md, „Gotchas").
import { feedbackBlocksOf } from '~/utils/euFeedback'

defineProps<{
  section: EuRailSection
  /** What „Zitieren" copies beside the act's citation. */
  citation?: string
}>()
</script>

<template>
  <section :id="section.elementId" :aria-labelledby="`${section.elementId}-heading`" class="page-section scroll-mt-6">
    <h2 :id="`${section.elementId}-heading`" class="section-heading">{{ section.heading }}</h2>
    <div class="mt-4 space-y-8">
      <div>
        <FactList :facts="section.facts.map((f) => ({ key: f.key, title: f.title ?? undefined }))">
          <template v-for="f in section.facts" :key="f.key" #[`value-${f.key}`]>
            <!-- Flex row like every line with „Zitieren" (`CiteButton`). -->
            <p class="flex flex-wrap items-center gap-x-3 gap-y-1" :class="f.title ? '' : 'text-ink-secondary'">
              <span>
                <template v-for="(part, i) in f.parts" :key="i">
                  <template v-if="i > 0">, </template>
                  <!-- A frame's only sentence may be a gap sentence: its lead word set apart (`GapNote`). -->
                  <GapNote v-if="typeof part === 'string' && !f.title" as="span" :text="part" />
                  <template v-else-if="typeof part === 'string'">{{ part }}</template>
                  <!-- A page of this site: the proposal's page, an act's page. -->
                  <NuxtLink v-else-if="part.internal" :to="part.href" class="link-inline">{{ part.label }}</NuxtLink>
                  <ExternalLink v-else :href="part.href" class="link-inline">{{ part.label }}</ExternalLink>
                </template>
              </span>
              <CiteButton v-if="f.cite && citation" :text="citation" subject="Den Rechtsakt" />
            </p>
          </template>
        </FactList>
        <GapNote v-for="note in section.notes" :key="note" :text="note" class="mt-3 text-sm text-ink-secondary" />
        <SectionCredits v-if="section.credits.length" :sources="[]" :marked="false">
          <span v-for="item in section.credits" :key="item">{{ item }}</span>
        </SectionCredits>
      </div>
      <!-- One block per window, each a sub-section of the section's body. -->
      <EuFeedbackBlock v-for="block in feedbackBlocksOf(section.facts)" :key="block.key" :block="block" />
      <!-- The card's door once more (`DoorButton`), with the card's label.
           The view sets it only while the card shows. -->
      <div v-if="section.door" class="flex flex-wrap items-center gap-3">
        <DoorButton :href="section.door.href">
          {{ section.door.label }}
        </DoorButton>
      </div>
      <slot />
      <FoldSection v-if="section.record" :heading="section.record.heading">
        <div class="pb-2">
          <ListBox class="@container/list">
            <ol class="divide-y divide-hairline text-sm">
              <li
                v-for="(row, i) in section.record.rows"
                :key="`${i}|${row.iso}|${row.label}`"
                class="grid grid-cols-1 items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 row-cols:grid-cols-[6rem_minmax(0,1fr)]"
              >
                <time v-if="row.iso" :datetime="row.iso" class="tabular-nums text-ink-muted">{{ row.date }}</time>
                <span v-else class="text-ink-muted">{{ row.date }}</span>
                <span class="min-w-0 text-ink">
                  <ExternalLink v-if="row.href" :href="row.href" class="link-inline">{{ row.label }}</ExternalLink>
                  <template v-else>{{ row.label }}</template>
                  <span v-if="row.detail" class="mt-0.5 block text-ink-muted">{{ row.detail }}</span>
                </span>
              </li>
            </ol>
          </ListBox>
          <p v-if="section.record.note" class="mt-3 text-sm text-ink-secondary">
            {{ section.record.note }}
          </p>
        </div>
      </FoldSection>
    </div>
  </section>
</template>
