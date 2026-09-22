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
 * question it answers (`app/utils/spine.ts`).
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
 * ONE layout at every width, and that is the fix of 16.09.2026: the name on
 * its line, what happened on the next, the comparison on its own. Before
 * that the bar had three. From md the name sat in a fixed 12rem column with
 * the facts beside it — until a fact line outgrew the remainder, when
 * flex-wrap dropped the whole paragraph to x=0, under the NAME rather than
 * under the fact column. That hit exactly one row, "Regierungsvorlage" with
 * the comparison behind it: the card's most important line was the one that
 * broke its own grid. Below md name and facts ran inline and nothing lined
 * up but the dots. Stacking costs about five lines of height and buys a
 * silhouette that is identical on a phone and on a desk, and a fact line
 * that can take the full measure instead of a leftover column.
 *
 * The comparison link is no longer the third item in a middot run. It is
 * the accountability layer — the reason this project exists — and it was
 * set as trailing 12px grey punctuation behind a date and a count.
 *
 * Deliberately NOT a summary of the substance, and it fetches nothing: an
 * earlier version fired all three comparison requests on mount, one of
 * which costs up to 30 s when RIS has the ressort's annex only as a scan.
 * Every line is server-rendered from the payload the page already has, so
 * the negative findings ("bisher keine", "in Behandlung", "ausstehend") are
 * in the HTML.
 */
import type { DraftDetail } from '#shared/types'
import type { ComparisonId, StationId } from '~/utils/spine'
import { markedStation, stations } from '~/utils/spine'

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
  /** From `/rv-stellungnahmen`: how many Stellungnahmen the Vorlage itself
   *  received — the Regierungsvorlage's second fact, after its date. Arrives
   *  after mount like the two above. */
  rvStatementTotal?: number | null
}>()

/* Two link styles, and only one of them looks like a link at rest.

   THE QUESTION (`LINK`) is the house style: accent-deep, underlined at
   rest, because a question sharing the page with plain text is not marked
   as clickable by colour alone (WCAG 1.4.1, the same reasoning as
   `linkClasses` on the detail page). It is the accountability layer, it is
   the click this card exists for, and it is the only blue in it.

   THE STATION NAME (`STATION`) carries no link styling at all. The whole
   row is the target instead — the rectangle the marker already draws, made
   hoverable and clickable, with the name underlining on hover. Five station
   names set in accent-deep made this card seven blue underlined lines out
   of eleven, and the brand colour stopped carrying information; five names
   in ink with a grey underline replaced that with five grey underlines.
   Neither is what a table of contents should look like sitting under a
   headline. EntryItem settled the same question the same way ("the card
   around it is already the link").

   Mechanically it is the stretched-link pattern: the anchor stays around
   the NAME, so its accessible name is exactly the section it leads to, and
   an `::after` grown over the row does the hit testing. It has to be this
   way round — two of the five rows carry the comparison question, and an
   <a> cannot be nested in an <a>. What the overlay costs is text selection
   over the fact line; the facts it holds are all repeated in the sections
   below, where they can be selected.

   The at-rest underline comes back where hover cannot be had: on a touch
   device nothing would ever reveal these rows as targets. */
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-deep'
const STATION = [
  'station rounded underline-offset-4 group-hover:underline',
  // The hit area, the pointer cursor and the focus ring, all on the row.
  'after:absolute after:inset-0 after:rounded-md',
  'focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent-deep',
  '[@media(hover:none)]:underline [@media(hover:none)]:decoration-baseline',
].join(' ')
const LINK = `rounded text-accent-deep underline underline-offset-2 hover:no-underline ${FOCUS}`

const list = computed(() => stations(props.data, {
  createsNewLaw: props.createsNewLaw,
  amendedLawCount: props.amendedLawCount,
  rvStatementTotal: props.rvStatementTotal,
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
    // The facts are the content, the name is navigation — so the facts
    // carry full ink at the station the text reached, and read at the same
    // size as the name rather than two steps below it. They used to be
    // 12px grey beside a 14px blue link, which decided every row's contest
    // for attention in favour of the link.
    factClass: reached(s.state) ? 'text-ink' : 'text-ink-secondary',
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
    `isolate` sits on the LIST, and every one of the three layers below
    depends on which element carries it:

    - The grounds go behind the text with -z-10. "Behind" has to mean
      behind the list's content and not behind the card's white sheet, so
      something must be a stacking context — otherwise the wash vanishes
      under the card. That was once solved by painting the grounds above
      the text and lifting the text back over them in a `relative`
      container, which made that container the nearest positioned ancestor:
      the row link's ::after then sized itself to the TEXT, and the target
      was a ragged block ending wherever the row's words did.
    - The rail overflows its own <li> by design — it has to reach the next
      dot. So it must paint above the NEXT row, which is painted after it.
      Isolating each <li> takes that away: the rail's z-10 stays trapped in
      its row, and the marked row's wash cuts the line.
    - The row link's ::after has to size to the row, so the <li> must be
      positioned but must NOT be a stacking context: `relative` alone is
      exactly that (z-index stays auto), which is why the rail can still
      climb out of it.
  -->
  <ol aria-label="Der Text im Verfahren" class="isolate flex flex-col">
    <li
      v-for="row in rows"
      :key="row.id"
      class="group relative -mx-2 flex gap-3 rounded-md px-2 py-2"
      :aria-current="row.current ? 'step' : undefined"
    >
      <span
        v-if="row.current"
        aria-hidden="true"
        class="absolute inset-0 -z-10 rounded-md bg-mark-wash"
      />
      <!-- The hover ground, on rows that lead somewhere. Translucent ink
           rather than a colour of its own, so it reads the same over the
           white sheet and over the marker's wash — the current row must
           answer the pointer like every other. -->
      <span
        v-if="row.href"
        aria-hidden="true"
        class="absolute inset-0 -z-10 rounded-md bg-ink/6 opacity-0 transition-opacity group-hover:opacity-100"
      />
      <!-- py-2 plus the dot's mt-1.5 put every dot at y 14–26 of its row, so
           a line from 26px to 14px past the row's end runs from this dot's
           lower edge to the next one's upper edge and never sits behind a
           dot. Both offsets are constants of the row's TOP, which is why
           rows of two and three lines can share one rail geometry.
           pointer-events-none on both: they sit above the link overlay, and
           a dead spot over the dot would be a hole in the row's target. -->
      <span
        v-if="row.rail"
        aria-hidden="true"
        class="pointer-events-none absolute -bottom-3.5 left-3.25 top-6.5 z-10 w-0.5"
        :class="row.rail"
      />
      <span
        aria-hidden="true"
        class="pointer-events-none relative z-10 mt-1.5 box-border size-3 shrink-0 rounded-full border-2"
        :class="row.dot"
      />
      <!-- One column, at every width: name, then what happened, then the
           question this station lets you answer. Neither link needs an
           sr-only purpose — their text IS the name of what they lead to. -->
      <div class="min-w-0 text-sm">
        <p :class="row.nameClass">
          <a v-if="row.href" :href="row.href" :class="STATION">{{ row.name }}</a>
          <template v-else>{{ row.name }}</template>
        </p>
        <p v-if="row.facts" class="mt-0.5 leading-snug" :class="row.factClass">
          {{ row.facts }}
        </p>
        <!-- Above the row's overlay, so the question keeps its own target,
             its own focus ring and its own destination. -->
        <p v-if="row.comparison" class="relative z-10 mt-1 leading-snug">
          <a :href="row.comparison.href" :class="LINK">{{ row.comparison.question }} →</a>
        </p>
        <p v-if="row.announce" class="sr-only">{{ row.announce }}</p>
      </div>
    </li>
  </ol>
</template>
