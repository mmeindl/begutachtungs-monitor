<script setup lang="ts">
/**
 * „Der Weg eines Entwurfs": every kind of path a text can take, and where a
 * reader can take part. Replaces the prose of /so-funktionierts#stationen
 * and #wege (14.11.2026), which told two of these paths.
 *
 * SEVERAL MATRICES, ONE CARD (16.11.2026). Each object walks the stations of
 * its own rail, so each has a matrix of its own (`WEG_MATRICES`, drawn by
 * `WegMatrix`): the national norm (Bund and Länder, five stations), an EU
 * act, a European Citizens' Initiative, an Anliegen an den Nationalrat. They
 * stand in the lists' white card (`ListBox`): a tool the reader operates,
 * with the one legend in its head, above the first matrix, and each group
 * as a bar inside it — the matrices' groups and the list „Nicht im Monitor"
 * at one rank (h2 below `lg`). Until then the EU was a lead line over the
 * national matrix, and the instruments beside a norm's path a block of text
 * rows under the card; the followed ones now show their stations, the rest
 * is the card's last section.
 *
 * „Nicht im Monitor": the instruments the monitor does not follow, without
 * stations — name, level, what one can do, the duty to respond where the law
 * states one, and why the monitor does not follow it, in the words the
 * national matrix uses for its rows.
 *
 * `?weg=<id>` marks one row of the national matrix in ink (selection is ink)
 * with `aria-current`, for the draft pages that link here with their path.
 *
 * All copy is in `app/utils/wege.ts`.
 */
import {
  WEG_INSTRUMENT_LEVEL_LABEL,
  WEG_INSTRUMENTS,
  WEG_LEGEND,
  WEG_MATRICES,
  WEGE_COPY,
  isWegId,
} from '~/utils/wege'
import { WEG_MARK_CLASS, WEG_MARK_GLYPH, WEG_SECTION_BAR } from '~/utils/wegeMarks'

usePageSeo({ title: WEGE_COPY.title, description: WEGE_COPY.description })

const route = useRoute()
const selected = computed(() => {
  const v = route.query.weg
  const id = Array.isArray(v) ? v[0] : v
  return isWegId(id) ? id : null
})
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <header>
      <h1 class="page-title">
        {{ WEGE_COPY.title }}
      </h1>
      <p class="mt-2 text-ink-secondary">
        {{ WEGE_COPY.lede }}
      </p>
    </header>

    <!-- One sheet at every width (`ListBox`, the lists' card): the legend in
         its head, then each matrix — a table from `lg`, rails below it —
         and last the list of what the monitor does not follow. -->
    <ListBox class="mt-8">
      <!-- The legend in the card's head, above the first column header: it
           scrolls away with the page, the station names stay. -->
      <template #header>
        <ul class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-secondary">
          <li v-for="item in WEG_LEGEND" :key="item.cell" class="inline-flex items-center gap-2">
            <span class="inline-flex w-4 justify-center" aria-hidden="true">
              <span :class="WEG_MARK_CLASS[item.cell]">{{ WEG_MARK_GLYPH[item.cell] }}</span>
            </span>
            {{ item.label }}
          </li>
        </ul>
      </template>

      <WegMatrix
        v-for="(matrix, i) in WEG_MATRICES"
        :key="matrix.id"
        :matrix="matrix"
        :selected="selected"
        :class="i > 0 && 'border-t border-hairline'"
      />

      <!-- Not in the monitor: instruments without stations, a group of the
           card like the matrices' groups. -->
      <section aria-labelledby="wege-nicht-im-monitor" class="border-t border-hairline">
        <h2 id="wege-nicht-im-monitor" :class="WEG_SECTION_BAR">
          {{ WEGE_COPY.instrumentsHeading }}<span class="font-normal text-ink-secondary"> · {{ WEGE_COPY.instrumentsLede }}</span>
        </h2>
        <ul role="list" class="divide-y divide-hairline text-sm">
          <li v-for="item in WEG_INSTRUMENTS" :key="item.id" class="px-4 py-3">
            <p class="text-ink">
              <span class="font-medium">{{ item.name }}</span>
              <span class="text-ink-secondary"> · {{ WEG_INSTRUMENT_LEVEL_LABEL[item.level] }}</span>
            </p>
            <p class="mt-0.5 text-ink-secondary">
              {{ item.act }}<template v-if="item.duty">
                · <span :class="item.binding && 'font-medium text-ink'">{{ item.duty }}</span>
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
