<script setup lang="ts">
/**
 * One jurisdiction's „Wege der Gesetzgebung" (16.11.2026): every kind of
 * path a text can take there, and where a reader can take part. The
 * country's page (`/wege`) and the EU's (`euWegePath()`) are this one
 * component, fed by their `WegePage` (`app/utils/wege.ts`); a page file
 * names only its jurisdiction. Until 16.11.2026 one page held both, the EU
 * as a matrix between the Länder and the Anliegen; the EU is a jurisdiction
 * of its own, as for its object pages, so a second country gets a page of
 * its own later instead of sharing one with Austria.
 *
 * SEVERAL MATRICES, ONE CARD (16.11.2026). Each object walks the stations of
 * its own rail, so each has a matrix of its own (`WegMatrix`). They stand
 * in the lists' white card (`ListBox`): a tool the reader operates, with
 * the page's one legend in its head, above the first matrix, and each group
 * as a bar inside it — the matrices' groups, the seams and the list „Nicht
 * im Monitor" at one rank (h2 where the card shows rails).
 *
 * THE SEAM (16.11.2026): where the other jurisdiction's law enters this
 * page's paths, one line of the card links that page (`WegSeam`): on the
 * country's page the EU's directives and regulations, as its first line.
 * The way back is a row's own note, on the EU's page.
 *
 * „Nicht im Monitor": the instruments the monitor does not follow, without
 * stations — name, level, what one can do, the duty to respond where the law
 * states one, the official page where a memo names one, and why the monitor
 * does not follow it, in the words the national matrix uses for its rows.
 *
 * `?weg=<id>` marks one row of this page in ink (selection is ink) with
 * `aria-current`, for the object pages that link here with their path. A
 * row of another page, or an unknown id, marks nothing (`wegSelected`).
 *
 * All copy is in `app/utils/wege.ts`.
 */
import { WEG_INSTRUMENT_LEVEL_LABEL, WEGE_COPY, WEGE_PAGES, type WegeJurisdiction, wegLegend, wegSelected } from '~/utils/wege'
import { WEG_MARK_CLASS, WEG_MARK_GLYPH, WEG_SECTION_BAR } from '~/utils/wegeMarks'

const props = defineProps<{
  jurisdiction: WegeJurisdiction
}>()

const page = computed(() => WEGE_PAGES[props.jurisdiction])
const legend = computed(() => wegLegend(page.value))

usePageSeo({ title: () => page.value.title, description: () => page.value.description })

const route = useRoute()
const selected = computed(() => wegSelected(page.value, route.query.weg))
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <header>
      <h1 class="page-title">
        {{ page.title }}
      </h1>
      <p class="mt-2 text-ink-secondary">
        {{ page.lede }}
      </p>
    </header>

    <!-- One sheet at every width (`ListBox`, the lists' card): the legend in
         its head, then each matrix — a table while the card is wide enough, rails below that —
         with the seams in their places, and last the list of what the monitor does not follow. -->
    <ListBox class="mt-8">
      <!-- The legend in the card's head, above the first column header: it
           scrolls away with the page, the station names stay. Only the
           marks this page draws (`wegLegend`). -->
      <template #header>
        <ul class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-secondary">
          <li v-for="item in legend" :key="item.cell" class="inline-flex items-center gap-2">
            <span class="inline-flex w-4 justify-center" aria-hidden="true">
              <span :class="WEG_MARK_CLASS[item.cell]">{{ WEG_MARK_GLYPH[item.cell] }}</span>
            </span>
            {{ item.label }}
          </li>
        </ul>
      </template>

      <template v-for="(block, i) in page.blocks" :key="block.kind === 'matrix' ? block.matrix.id : block.seam.id">
        <WegMatrix
          v-if="block.kind === 'matrix'"
          :matrix="block.matrix"
          :selected="selected"
          :class="i > 0 && 'border-t border-hairline'"
        />
        <!-- A seam: a group of the card with its bar and one line, the same
             at every width — it passes no station, so it has no columns. -->
        <section
          v-else
          :aria-labelledby="`wege-${block.seam.id}`"
          :class="i > 0 && 'border-t border-hairline'"
        >
          <h2 :id="`wege-${block.seam.id}`" :class="WEG_SECTION_BAR">
            {{ block.seam.bar }}
          </h2>
          <p class="px-4 py-3 text-sm">
            <NuxtLink :to="block.seam.href" class="link-inline font-medium">
              {{ block.seam.label }}
            </NuxtLink>
            <span class="mt-0.5 block text-ink-secondary">
              {{ block.seam.note }}<template v-if="block.seam.noteLink">
                ·
                <NuxtLink :to="block.seam.noteLink.href" class="link-inline">{{ block.seam.noteLink.label }}</NuxtLink>
              </template>
            </span>
          </p>
        </section>
      </template>

      <!-- Not in the monitor: instruments without stations, a group of the
           card like the matrices' groups. -->
      <section v-if="page.instruments.length" aria-labelledby="wege-nicht-im-monitor" class="border-t border-hairline">
        <h2 id="wege-nicht-im-monitor" :class="WEG_SECTION_BAR">
          {{ WEGE_COPY.instrumentsHeading }}<span class="font-normal text-ink-secondary"> · {{ WEGE_COPY.instrumentsLede }}</span>
        </h2>
        <ul role="list" class="divide-y divide-hairline text-sm">
          <li v-for="item in page.instruments" :key="item.id" class="px-4 py-3">
            <p class="text-ink">
              <span class="font-medium">{{ item.name }}</span>
              <span class="text-ink-secondary"> · {{ WEG_INSTRUMENT_LEVEL_LABEL[item.level] }}</span>
            </p>
            <p class="mt-0.5 text-ink-secondary">
              {{ item.act }}<template v-if="item.duty">
                · {{ item.duty }}
              </template><template v-if="item.source">
                · <ExternalLink :href="item.source.href" class="link-inline">{{ item.source.label }}</ExternalLink>
              </template>
            </p>
            <p class="mt-0.5 text-ink-secondary">
              <span class="font-medium text-ink">{{ WEGE_COPY.notFollowedPrefix }}</span> · {{ item.notFollowed }}
            </p>
          </li>
        </ul>
      </section>
    </ListBox>
  </div>
</template>
