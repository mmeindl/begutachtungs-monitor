<script setup lang="ts">
/**
 * Where does this draft stand? Five stations, one row each.
 *
 * The bar answers three things and nothing else: where the text is right
 * now, what happened at each station it passed, and what is still ahead.
 * Everything else on the page is a section, and each station links into the
 * one that holds it — the bar is this page's table of contents, in the
 * page's order.
 *
 * It used to draw the text VERSIONS as the stations and the procedural
 * stages as arrows between them. That is retired as the visible shape:
 * visitors think in stations, not in text versions, and the arrow form made
 * the Begutachtung — the whole subject — a connector between two boxes.
 * What the version model was genuinely good at survives where it belongs:
 * a comparison still hangs on the station that PRODUCED it, phrased as the
 * question it answers (`shared/utils/stations.ts`).
 *
 * ONE mark, and it is the brand's: the yellow dot is the station the text
 * is on — the current one, or the last one reached when the procedure is
 * over — and the wash covers that current row entire. Never colour alone:
 * the marked row states its name and its facts, and every station that
 * shows no fact still says its state in words a screen reader reaches
 * ("ausstehend", "nicht erreicht").
 *
 * Vertical at every width. It was a horizontal stepper until the
 * measurement: German compound names ("Regierungsvorlage",
 * "Bundesgesetzblatt") do not fit side by side in a 768px measure without
 * breaking mid-word, and buying the width back cost a breakout from the
 * prose column. A table of contents is a list.
 *
 * Deliberately NOT a summary of the substance, and it fetches nothing: an
 * earlier version fired all three comparison requests on mount, one of
 * which costs up to 30 s when RIS has the ressort's annex only as a scan.
 * Every line is server-rendered from the payload the page already has, so
 * the negative findings ("bisher keine", "in Behandlung", "ausstehend") are
 * in the HTML.
 */
import type { DraftDetail } from '#shared/types'
import type { ComparisonId, StationId } from '#shared/utils/stations'
import { markedStation, stations } from '#shared/utils/stations'

const props = defineProps<{
  data: DraftDetail
  /**
   * In-page target per station: the section that holds it. A station
   * without one keeps its name as plain text rather than becoming a dead
   * link. The PAGE owns this map rather than the bar, because the page is
   * the only thing that knows which sections it actually rendered — so a
   * link here can never promise something that is not there.
   */
  anchors?: Partial<Record<StationId, string>>
  /**
   * In-page target per comparison, same contract. A comparison without an
   * anchor is not rendered at all: an unclickable question would promise a
   * surface this page does not have.
   */
  comparisonAnchors?: Partial<Record<ComparisonId, string>>
  /** From `/geltendesrecht`: the draft creates law rather than changing it.
   *  Arrives after mount, so the bar renders first and the Entwurf's fact
   *  line corrects itself — it never blocks. */
  createsNewLaw?: boolean
  /** How many laws in force the draft changes — the Entwurf's second fact. */
  amendedLawCount?: number
}>()

/* The house link style: underlined AT REST, because a name or a question
   sharing the page with plain text is not marked as clickable by colour
   alone (WCAG 1.4.1, and the same reasoning as `linkClasses` on the detail
   page). This replaces the icons — an icon said "there is a document here",
   which is not the same claim as "you can click this". */
const LINK = 'rounded text-accent-deep underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-deep'

const list = computed(() => stations(props.data, {
  createsNewLaw: props.createsNewLaw,
  amendedLawCount: props.amendedLawCount,
}))
const marked = computed(() => markedStation(list.value))

/**
 * Everything a row shows, decided here so the template only places it.
 *
 * The display rule: only the NEXT station that has not happened says
 * anything. On a running draft the three remaining rows each carried a word
 * ("ausstehend", "ausstehend", "ausstehend"), which says the same nothing
 * three times — a station two steps beyond the one that has not happened
 * yet is not outstanding, it is simply unknown. So the first of them keeps
 * its facts, and that word is often the finding ("bisher keine", "keine –
 * GP beendet"); the ones behind it fall silent, but keep their state in
 * sr-only words (AAA: never shape alone, and a hollow dot is shape).
 */
const rows = computed(() => list.value.map((s, i) => {
  const reached = (state: string) => state === 'done' || state === 'current'
  const silent = list.value.slice(0, i).some((earlier) => !reached(earlier.state))
  const facts = silent ? [] : s.facts
  const href = s.comparison ? props.comparisonAnchors?.[s.comparison.id] : undefined
  const next = list.value[i + 1]
  return {
    id: s.id,
    name: s.name,
    current: s.state === 'current',
    dot: s.id === marked.value
      ? 'border-ink bg-mark'
      : s.state === 'done' ? 'border-ink bg-ink' : 'border-baseline bg-surface',
    nameClass: reached(s.state) ? 'font-medium text-ink' : 'text-ink-secondary',
    href: props.anchors?.[s.id],
    facts: facts.join(' · '),
    comparison: href && s.comparison ? { href, question: s.comparison.question } : null,
    announce: facts.length
      ? null
      : s.state === 'open' ? 'ausstehend' : s.state === 'never' ? 'nicht erreicht' : null,
    // The segment into the next station is ink once that station has been
    // reached, so the line and the dots can never disagree about how far
    // the text got. The last station has nothing to connect to.
    rail: next ? (reached(next.state) ? 'bg-ink' : 'bg-hairline') : null,
  }
}))
</script>

<template>
  <!--
    Paint order without a negative z-index: neither the card nor this list
    is a stacking context, so a wash sent behind with -z-10 would disappear
    under the card's white background. Instead it comes FIRST inside its
    <li> and stays at z-auto, while dots, rails (z-10) and the text
    container (relative) all paint over it.
  -->
  <ol aria-label="Der Text im Verfahren" class="flex flex-col">
    <li
      v-for="row in rows"
      :key="row.id"
      class="relative flex gap-3 py-1.5"
      :aria-current="row.current ? 'step' : undefined"
    >
      <span
        v-if="row.current"
        aria-hidden="true"
        class="absolute -inset-x-2 inset-y-0 rounded-md bg-mark-wash"
      />
      <!-- py-1.5 plus the dot's mt-1 put every dot at y 10–22 of its row, so
           a line from 22px to 10px past the row's end runs from this dot's
           lower edge to the next one's upper edge and never sits behind a
           dot. -->
      <span
        v-if="row.rail"
        aria-hidden="true"
        class="absolute -bottom-2.5 left-1.25 top-5.5 z-10 w-0.5"
        :class="row.rail"
      />
      <span
        aria-hidden="true"
        class="relative z-10 mt-1 box-border size-3 shrink-0 rounded-full border-2"
        :class="row.dot"
      />
      <div class="relative flex min-w-0 flex-wrap items-baseline gap-x-2">
        <!-- From md the names share a fixed column, so every fact line
             starts at the same x and the right-hand side reads as its own
             column. Below md they simply wrap. The link needs no sr-only
             purpose: its text IS the name of the section it leads to. -->
        <p class="text-sm md:w-48 md:shrink-0" :class="row.nameClass">
          <a v-if="row.href" :href="row.href" :class="LINK">{{ row.name }}</a>
          <template v-else>{{ row.name }}</template>
        </p>
        <p
          v-if="row.facts || row.comparison"
          class="text-xs tabular-nums"
          :class="row.current ? 'text-ink' : 'text-ink-secondary'"
        >{{ row.facts }}<template v-if="row.comparison"><span v-if="row.facts"> · </span><a :href="row.comparison.href" :class="LINK">{{ row.comparison.question }} →</a></template></p>
        <p v-if="row.announce" class="sr-only">{{ row.announce }}</p>
      </div>
    </li>
  </ol>
</template>
