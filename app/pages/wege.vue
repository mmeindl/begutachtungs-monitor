<script setup lang="ts">
/**
 * „Der Weg eines Entwurfs": every kind of path a text can take, one row per
 * kind, one column per station of the rail, and where a reader can file a
 * Stellungnahme. Replaces the prose of /so-funktionierts#stationen and #wege
 * (14.11.2026), which told two of these paths.
 *
 * A real table from `lg` up — caption, column and row headers — so a screen
 * reader announces „Begutachtung: Stellungnahme möglich" per cell. Below
 * `lg` the same rows as one vertical rail each: five columns of German
 * compound names do not fit 320 px, and a table scrolled sideways hides the
 * stations on the right. `lg` and not `md` (14.11.2026): the station names
 * stand on one line, unbroken, and the five columns sized to them take
 * about 550 px — at `md` (card 718 px) that left the paths some 165 px, at
 * `lg` (894 px) they keep about 340. The switch is CSS only; the hidden half is
 * `display: none` and so out of the accessibility tree too.
 *
 * Both stand in the lists' white card (`ListBox`, 14.11.2026): a tool the
 * reader operates, with the legend in its head and the groups (EU, Bund,
 * Länder) as bars inside it. From `lg` the station row sticks to the top of
 * the window while the rows scroll; the legend above it scrolls away.
 *
 * Blue only where a Stellungnahme is possible („you can do something here"),
 * and never alone: the mark has its own shape, a word for screen readers,
 * and the legend. `?weg=<id>` marks one row in ink (selection is ink) with
 * `aria-current`, for the draft pages that link here with their own path.
 *
 * Under the card, „Weitere Wege, sich zu äußern" (14.11.2026): the
 * instruments beside a norm's path, which have no stations. An unfilled
 * hairline frame, not the white card — rows the reader consults, not a
 * tool (box grammar, `FactList`) — one row each: name, level, what one can
 * do, the duty to respond where the law states one, the official page.
 * Which of them the monitor follows, the lede says once; the name of each
 * of those links to its section (`monitorHref`, 15.11.2026: Petition,
 * Bürgerinitiative and Volksbegehren under `/anliegen`), the official page
 * stays beside it as the source.
 *
 * All copy is in `app/utils/wege.ts`.
 */
import {
  EU_LEAD,
  WEG_CELL_LABEL,
  WEG_INSTRUMENT_LEVEL_LABEL,
  WEG_INSTRUMENTS,
  WEG_LEGEND,
  WEG_STATIONS,
  WEGE_COPY,
  type WegCell,
  isWegId,
  wegGroups,
} from '~/utils/wege'

usePageSeo({ title: WEGE_COPY.title, description: WEGE_COPY.description })

const route = useRoute()
const selected = computed(() => {
  const v = route.query.weg
  const id = Array.isArray(v) ? v[0] : v
  return isWegId(id) ? id : null
})

const groups = wegGroups()

/* The mark per cell: a round ink dot for a station, a blue square for one
 * where a Stellungnahme is possible — shape and colour both — and a
 * character for the other two. The word stays beside it for screen readers. */
const MARK_CLASS: Record<WegCell, string> = {
  durch: 'inline-block size-2.5 rounded-full bg-ink',
  stellungnahme: 'inline-block size-3.5 rounded-[3px] bg-accent',
  entfaellt: 'text-ink-secondary',
  offen: 'font-semibold text-ink-secondary',
}
const MARK_GLYPH: Record<WegCell, string> = { durch: '', stellungnahme: '', entfaellt: '–', offen: '?' }

/* The column header's cells: sticky to the window, opaque on the card's
 * white, the hairline under each, so no row shows through. */
const HEAD_CELL = 'sticky top-0 z-10 border-b border-hairline bg-surface py-2 align-bottom font-medium'
/* A path row's cell: its own hairline (`border-separate`, see the table). */
const ROW_CELL = 'border-b border-hairline py-3 align-top'
/* A group's bar inside the card, at both widths: the page's ground as a
 * quiet band between the white rows, the name in the rows' size. */
const SECTION_BAR = 'border-b border-hairline bg-page px-4 py-2 text-left text-sm font-semibold text-ink'
/* The selected row (`?weg=`): an ink bar on its left edge, inside the inset. */
const SELECTED_BAR = 'shadow-[inset_3px_0_0_var(--color-ink)]'
/* The sticky header's height (one line, measured 14.11.2026) plus air, as
 * scroll margin on every row and link of the matrix — focus and `#weg-…`
 * never land under the header. */
const ROW_SCROLL = '[&_a]:scroll-mt-14 [&_tr]:scroll-mt-14'
/* The station columns (14.11.2026): each as wide as its own name on one
 * line plus `px-3` — `w-px` with `whitespace-nowrap` shrinks a column to
 * that — so each mark is centred under its own name; the path column
 * (`w-full`) takes all the rest, and its notes keep one or two lines. Equal
 * widths were tried the same day: the marks stood far apart and the notes
 * broke after two words. */
const STATION_COL = 'w-px whitespace-nowrap px-3 last:pr-4'
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
         its head, then the matrix from `lg`, the rails below it. -->
    <ListBox class="mt-8">
      <!-- The legend in the card's head, above the column header: it scrolls
           away with the page, the station names stay. -->
      <template #header>
        <ul class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-secondary">
          <li v-for="item in WEG_LEGEND" :key="item.cell" class="inline-flex items-center gap-2">
            <span class="inline-flex w-4 justify-center" aria-hidden="true">
              <span :class="MARK_CLASS[item.cell]">{{ MARK_GLYPH[item.cell] }}</span>
            </span>
            {{ item.label }}
          </li>
        </ul>
      </template>

      <!-- From lg: the matrix. `border-separate`, not `collapse`: a collapsed
           border belongs to the table and stays behind when the header cell
           sticks, so the rows would show through under it. Each cell carries
           its own hairline instead; the last row leaves the card's edge
           alone. -->
      <table class="hidden w-full border-separate border-spacing-0 text-sm lg:table [&_tbody:last-child_tr:last-child>*]:border-b-0">
        <caption class="sr-only">
          {{ WEGE_COPY.caption }}
        </caption>
        <!-- STICKY to the window, not the card: `ListBox` clips its corners
             with `overflow: clip`, which is no scroll container. Per cell,
             each on the card's white with the hairline under it. -->
        <thead>
          <tr>
            <th scope="col" :class="HEAD_CELL" class="w-full pl-4 pr-4 text-left text-ink-secondary">
              {{ WEGE_COPY.pathColumn }}
            </th>
            <th
              v-for="station in WEG_STATIONS"
              :key="station.id"
              scope="col"
              :class="[HEAD_CELL, STATION_COL]"
              class="text-center text-ink hyphens-none"
            >
              <NuxtLink v-if="station.href" :to="station.href" class="link-inline">
                {{ station.label }}
              </NuxtLink>
              <template v-else>
                {{ station.label }}
              </template>
            </th>
          </tr>
        </thead>

        <!-- Every link and every row keeps the header's height above it when
             the page scrolls it into view (a Tab back up, `#weg-…`): WCAG 2.2
             2.4.11, focus not hidden under the sticky row. -->
        <tbody :class="ROW_SCROLL">
          <tr>
            <th colspan="6" scope="rowgroup" :class="SECTION_BAR">
              EU
            </th>
          </tr>
          <tr>
            <!-- `pl-4` as on every path row: the inset holds the bar of the
                 selected row there, and the labels share one left edge. -->
            <!-- One cell over all six columns: the lead-in passes no
                 station, and its note stands under its label, at the same
                 left edge as every row's note (14.11.2026). -->
            <th colspan="6" scope="row" :class="ROW_CELL" class="pl-4 pr-4 text-left font-normal">
              <NuxtLink :to="EU_LEAD.href" class="link-inline font-medium">
                {{ EU_LEAD.label }}
              </NuxtLink>
              <span class="mt-0.5 block text-ink-secondary">
                {{ EU_LEAD.note }} ·
                <NuxtLink :to="EU_LEAD.list.href" class="link-inline">
                  {{ EU_LEAD.list.label }}
                </NuxtLink>
              </span>
            </th>
          </tr>
        </tbody>

        <tbody v-for="group in groups" :key="group.level" :class="ROW_SCROLL">
          <tr>
            <th colspan="6" scope="rowgroup" :class="SECTION_BAR">
              {{ group.label }}<span v-if="group.note" class="font-normal text-ink-secondary"> · {{ group.note }}</span>
            </th>
          </tr>
          <tr
            v-for="weg in group.rows"
            :id="`weg-${weg.id}`"
            :key="weg.id"
            :aria-current="selected === weg.id ? 'true' : undefined"
          >
            <th
              scope="row"
              :class="[ROW_CELL, selected === weg.id && SELECTED_BAR]"
              class="pl-4 pr-4 text-left font-normal"
            >
              <NuxtLink
                v-if="weg.href"
                :to="weg.href"
                class="link-inline"
                :class="selected === weg.id ? 'font-semibold' : 'font-medium'"
              >
                {{ weg.label }}
              </NuxtLink>
              <span v-else class="text-ink" :class="selected === weg.id ? 'font-semibold' : 'font-medium'">
                {{ weg.label }}
              </span>
              <span v-if="weg.note" class="mt-0.5 block text-ink-secondary">
                {{ weg.note }}<template v-if="weg.noteLink">
                  ·
                  <NuxtLink :to="weg.noteLink.href" class="link-inline">{{ weg.noteLink.label }}</NuxtLink>
                </template>
              </span>
              <span v-if="weg.notFollowed" class="mt-0.5 block text-ink-secondary">
                <span class="font-medium text-ink">{{ WEGE_COPY.notFollowedPrefix }}</span> · {{ weg.notFollowed }}
              </span>
              <GapNote v-if="weg.gap" as="span" :text="weg.gap" class="mt-0.5 block text-ink-secondary" />
            </th>
            <td v-for="station in WEG_STATIONS" :key="station.id" :class="[ROW_CELL, STATION_COL]" class="text-center">
              <span class="inline-flex h-5 items-center justify-center" aria-hidden="true">
                <span :class="MARK_CLASS[weg.cells[station.id]]">{{ MARK_GLYPH[weg.cells[station.id]] }}</span>
              </span>
              <span class="sr-only">{{ WEG_CELL_LABEL[weg.cells[station.id]] }}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Below lg: one rail per path, the groups under the same section bars.
           No column header here, so nothing sticks. -->
      <div class="lg:hidden">
        <section aria-labelledby="wege-eu">
          <h2 id="wege-eu" :class="SECTION_BAR">
            EU
          </h2>
          <p class="px-4 py-3 text-sm text-ink-secondary">
            <NuxtLink :to="EU_LEAD.href" class="link-inline font-medium">
              {{ EU_LEAD.label }}
            </NuxtLink>
            <span class="block">{{ EU_LEAD.note }} ·</span>
            <NuxtLink :to="EU_LEAD.list.href" class="link-inline">
              {{ EU_LEAD.list.label }}
            </NuxtLink>
          </p>
        </section>

        <section
          v-for="group in groups"
          :key="group.level"
          :aria-labelledby="`wege-${group.level}`"
          class="border-t border-hairline"
        >
          <h2 :id="`wege-${group.level}`" :class="SECTION_BAR">
            {{ group.label }}<span v-if="group.note" class="block font-normal text-ink-secondary">{{ group.note }}</span>
          </h2>
          <ul class="divide-y divide-hairline">
            <li
              v-for="weg in group.rows"
              :key="weg.id"
              :aria-current="selected === weg.id ? 'true' : undefined"
              class="px-4 py-4"
              :class="selected === weg.id && SELECTED_BAR"
            >
              <p class="text-sm">
                <NuxtLink
                  v-if="weg.href"
                  :to="weg.href"
                  class="link-inline"
                  :class="selected === weg.id ? 'font-semibold' : 'font-medium'"
                >
                  {{ weg.label }}
                </NuxtLink>
                <span v-else class="text-ink" :class="selected === weg.id ? 'font-semibold' : 'font-medium'">
                  {{ weg.label }}
                </span>
                <span v-if="weg.note" class="block text-ink-secondary">
                  {{ weg.note }}<template v-if="weg.noteLink">
                    ·
                    <NuxtLink :to="weg.noteLink.href" class="link-inline">{{ weg.noteLink.label }}</NuxtLink>
                  </template>
                </span>
                <span v-if="weg.notFollowed" class="block text-ink-secondary">
                  <span class="font-medium text-ink">{{ WEGE_COPY.notFollowedPrefix }}</span> · {{ weg.notFollowed }}
                </span>
                <GapNote v-if="weg.gap" as="span" :text="weg.gap" class="block text-ink-secondary" />
              </p>
              <ol class="mt-2 space-y-1 text-sm">
                <li v-for="station in WEG_STATIONS" :key="station.id" class="flex items-center gap-2">
                  <span class="inline-flex w-4 shrink-0 justify-center" aria-hidden="true">
                    <span :class="MARK_CLASS[weg.cells[station.id]]">{{ MARK_GLYPH[weg.cells[station.id]] }}</span>
                  </span>
                  <span :class="weg.cells[station.id] === 'entfaellt' ? 'text-ink-secondary' : 'text-ink'">
                    {{ station.label }}
                  </span>
                  <span v-if="weg.cells[station.id] === 'stellungnahme' || weg.cells[station.id] === 'offen'" class="text-ink-secondary">
                    · {{ WEG_CELL_LABEL[weg.cells[station.id]] }}
                  </span>
                  <span v-else class="sr-only">{{ WEG_CELL_LABEL[weg.cells[station.id]] }}</span>
                </li>
              </ol>
            </li>
          </ul>
        </section>
      </div>
    </ListBox>

    <!-- Beside the path: instruments without stations. Consulted, not
         operated, so an unfilled frame (box grammar). -->
    <section class="mt-12" aria-labelledby="weitere-wege">
      <h2 id="weitere-wege" class="text-lg font-semibold text-ink">
        {{ WEGE_COPY.instrumentsHeading }}
      </h2>
      <p class="mt-1 text-sm text-ink-secondary">
        {{ WEGE_COPY.instrumentsLede }}
      </p>
      <div class="mt-4 rounded-xl border border-hairline px-4">
        <ul role="list" class="divide-y divide-hairline text-sm">
          <li v-for="item in WEG_INSTRUMENTS" :key="item.id" class="py-3">
            <p class="text-ink">
              <NuxtLink v-if="item.monitorHref" :to="item.monitorHref" class="link-inline font-medium">{{ item.name }}</NuxtLink>
              <span v-else class="font-medium">{{ item.name }}</span>
              <span class="text-ink-secondary"> · {{ WEG_INSTRUMENT_LEVEL_LABEL[item.level] }}</span>
            </p>
            <p class="mt-0.5 text-ink-secondary">
              {{ item.act }}<template v-if="item.duty">
                · <span :class="item.binding && 'font-medium text-ink'">{{ item.duty }}</span>
              </template>
              <template v-if="item.href">
                ·
                <ExternalLink :href="item.href" class="link-inline">{{ item.hrefLabel }}</ExternalLink>
              </template>
            </p>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
