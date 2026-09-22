<script setup lang="ts">
import { NuxtLink } from '#components'
import type { EntryView } from '~/utils/entryView'

/**
 * Eine Zeile, vier Zonen — every list entry on the site, in one anatomy
 * (docs/architecture.md §12.28).
 *
 * ZONES, left to right, in fixed order and fixed places:
 *
 *   1 Titel · 2 Kennung · 3 Stellungnahmen · 4 Stand
 *
 * Dense (`md+`): zone 1 and 2 stacked in the flexible left block, 3 and 4 as
 * fixed right-hand columns — `entry-col-count`/`entry-col-state` in
 * `main.css`, the same classes `EntryList` gives the column header. Card:
 * the same order, with 3 and 4 on one bottom line — Stellungnahmen flush
 * left, Stand flush right — so the card reads in the same left-to-right
 * order as the row it becomes at `md`.
 *
 * WHAT IT REPLACED: `DraftCard`/`DraftRow`, `RisConsultationCard`/`Row` and
 * `SecondRoundCard`/`Row` — six components arranging the same facts six
 * ways, with the Stellungnahmen token drifting 168 px between two rows of
 * one screenful (x=388 against x=556). Now it is a column, and the digits
 * line up down the list — the only thing that makes 846 and 12 comparable at
 * a glance.
 *
 * WHAT DECIDES CONTENT lives in `app/utils/entryView.ts`, not here. This
 * file knows nothing about Ministerialentwürfe, RIS records or
 * Regierungsvorlagen; it renders four zones. Every "this kind cannot have
 * that fact" decision is made once, in the adapter, where it can be tested.
 *
 * NOT IN THIS ROW ANY MORE: the start date („in Begutachtung seit
 * 27.08.2026"). It supported no decision a list makes — „ist das neu" is the
 * „Neu" mark, how long a Frist ran is a detail-page fact, and how old a
 * closed Verfahren is stands in zone 4. It was also the asymmetry Manu
 * measured: the dense ME row had dropped it long ago while the RIS row kept
 * it. The rule that replaces it is worth more than the token: **dates live
 * in exactly one place, zone 4, line 2.**
 */
const props = defineProps<{
  entry: EntryView
  /** `card` below `md`, `row` in the dense sheet from `md` up — `EntryList`
   *  sets both, never a page itself. */
  density?: 'card' | 'row'
}>()

/**
 * NuxtLink as an imported value, never `resolveComponent('NuxtLink')`.
 * Resolved by name from inside the template expression it comes back
 * undefined in the client build, and Vue then renders a literal
 * `<nuxtlink>` element: an entry that looks finished and is not a link.
 * SSR resolved it, the browser did not, so the markup was right until
 * hydration replaced it.
 */
const linkComponent = computed(() => (props.entry.to ? NuxtLink : 'a'))

/**
 * NO `target="_blank"` — the same decision as in `ExternalLink`, for the same
 * reason: a row pointing at parlament.gv.at is a REFERENCE. One looks there
 * and comes back, which is what the back button is for, and whoever wants a
 * tab has Cmd- or middle-click — their decision rather than ours. New windows
 * are kept for documents and actions, and those announce it (WCAG 2.2 3.2.5).
 *
 * This row was the one place the rebuild of 18.09.2026 did not reach: it
 * builds its own `<a>`, because the whole row is the link.
 */
const linkProps = computed(() =>
  props.entry.to ? { to: props.entry.to } : { href: props.entry.href ?? undefined },
)

/**
 * Where the row leads, for everyone who cannot see the ↗ — that one is
 * `aria-hidden`, and without it nothing tells this row from the other
 * thirteen. `ExternalLink` needs none of this: there the target stands in the
 * visible text („Auf parlament.gv.at ansehen"), here the text is the
 * Gegenstand's title. Taken from the host, not a constant — this component
 * does not know what kind of entry it renders.
 */
const externalHost = computed(() => {
  if (props.entry.to || !props.entry.href) return null
  try {
    return new URL(props.entry.href).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
})
</script>

<template>
  <component
    :is="linkComponent"
    v-bind="linkProps"
    :class="
      density === 'row'
        ? 'group flex min-h-11 items-center gap-4 px-4 py-3 transition-colors hover:bg-page'
        : 'group flex h-full flex-col gap-3 rounded-xl border border-hairline bg-surface p-5 transition-colors hover:border-baseline sm:flex-row sm:items-start sm:gap-4'
    "
  >
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <!-- ZONE 1 — Titel, GANZ, in beiden Dichten. Kein `truncate`, kein
           `line-clamp` (§12.28).

           Gemessen am 18.09.2026 über alle 336 Titel: Median 50 Zeichen,
           p90 117, Maximum 497. Eine gekürzte Zeile zeigte damit nur 31 %
           der Titel vollständig, und Amtstitel schneiden von hinten weg
           genau das ab, was sie unterscheidet — „Bundesgesetz über die
           Bundesstaatsanwaltschaft; Bundesgesetz zur Ein…" ist kein Name,
           sondern ein Rätsel. Eine Liste, in der man den Gegenstand nicht
           erkennt, hat ihre Aufgabe nicht erfüllt, egal wie ruhig sie
           aussieht.

           WAS DAS KOSTET, offen: 85 der 336 Titel brauchen drei Zeilen
           oder mehr, einer davon vierzehn — eine Weinbau-Verordnung mit
           497 Zeichen. Diese Zeilen sind hoch, und die Liste verliert
           dort ihren gleichmäßigen Takt. Bewusst in Kauf genommen: die
           Höhe ist ehrlich über den Titel, den das Amt vergeben hat, und
           die Kürzung war es nicht.

           Das ist damit die Messlatte für das Arbeitspaket „sprechende
           Namen" (TODO): es muss die Titel kürzer machen, nicht die
           Anzeige. `title=` trägt weiterhin den vollen Titel — bei
           RIS-Sätzen ist das der längere `longTitle`, der auch hier nicht
           steht. -->
      <component
        :is="density === 'row' ? 'p' : 'h3'"
        class="font-medium text-ink group-hover:underline"
        :title="entry.titleFull ?? entry.title"
      >
        {{ entry.title }}<span v-if="!entry.to" aria-hidden="true"> ↗</span><span v-if="externalHost" class="sr-only"> (auf {{ externalHost }})</span>
      </component>

      <!-- ZONE 2 — Kennung: what kind of thing, which one, from whom. Fixed
           token order, the optional ones last, and NO dates — so the line's
           length can no longer move anything, which is what let the count
           drift 168 px in the first place.

           Every token `ink-secondary`, including the type word, which used
           to be ink: with an Art filter above the list nobody scans rows
           for it, and on 10 of 14 rows it was the loudest repeated word on
           screen. Only the quoted debate name stays ink — it is the
           recognition key for someone who searched „Bundestrojaner" and now
           has to find their case among official Sammeltitel.

           The Ressort is plain text here, not the bordered badge it was.
           As its own dense column it left a visible hole on every
           Regierungsvorlage, which carries no Ressort in the data — and a
           hole in a column reads as a defect, while a missing token in a
           line reads as nothing at all. -->
      <p class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-secondary">
        <span>{{ entry.kindLabel }}</span>
        <span v-if="entry.citation">{{ entry.citation }}</span>
        <template v-if="entry.ministry">
          <span aria-hidden="true">·</span>
          <span :title="entry.ministry.name">
            <span aria-hidden="true">{{ entry.ministry.code }}</span>
            <span class="sr-only">{{ entry.ministry.name }}</span>
          </span>
        </template>
        <template v-if="entry.note">
          <span aria-hidden="true">·</span>
          <span>{{ entry.note }}</span>
        </template>
        <template v-if="entry.alias">
          <span aria-hidden="true">·</span>
          <span class="text-ink">„{{ entry.alias }}“</span>
        </template>
        <NewBadge v-if="entry.isNew" class="ms-0.5" />
      </p>

      <!-- THE EVIDENCE, and only where the row has one: the full-text
           search's Fundstelle (docs/architecture.md §12.31). Left empty the
           slot renders nothing, so it changes none of the existing lists.

           It sits IN zone 1/2 and not in a fifth zone, because it is not a
           fact about the draft but the reason this row is here at all — it
           belongs to the Kennung, not beside the Stand. And it sits inside
           the link: whoever clicks the evidence wants the draft. -->
      <slot name="evidence" />
    </div>

    <!-- THE STAND FIRST, THE NUMBER BELOW IT — top right on the card, the
         Stellungnahmen bottom right. Reversed until 18.09.2026, and the rank
         was wrong: the most important thing about a row is whether I can
         still do something, not how many others already did. The number is
         the second question in every section, including the one that ranks by
         it — there the ORDER carries the ranking (docs/architecture.md
         §12.28).

         One arrangement for every card width, with no `sm:` branch — what
         stands on top must not depend on how wide the window is. The dense
         row keeps the same rank on the other axis: the Stand is the outermost
         right column and therefore the anchor the eye runs down, the number
         stands before it. `contents`, so both become direct flex children of
         the row and line up with the column header. -->
    <div
      :class="
        density === 'row'
          ? 'contents'
          : 'mt-auto flex flex-col items-start gap-1.5 text-left sm:mt-0 sm:shrink-0 sm:items-end sm:text-right'
      "
    >
      <!-- ZONE 4 — Stand. In the DOM it stands before the number, so a
           screen reader reads it first; `order` reverses that VISIBLY in the
           dense row, where the Stand stays the outermost right column because
           the container's edge aligns the values there and the column header
           announces it. The card has no such edge, so it stands on top.

           The COLUMN is fixed, the BOX inside it is not: it measures itself
           against its own content and sits right inside the column. Equating
           the two was the same mistake twice — the box grew as wide as the
           Stellungnahmen line below it on the card, as wide as the 14 rem
           column in the dense row, and a state became a grey bar
           (docs/architecture.md §12.28). -->
      <div :class="density === 'row' ? 'entry-col-state order-2 flex justify-end' : ''">
        <EntryState :state="entry.state" />
      </div>

      <!-- ZONE 3 — Stellungnahmen. Right-aligned tabular digits in a fixed
           column: this is the comparison the product is about, and a number
           that cannot form a column cannot be compared.

           `text-sm` semibold, one step under an actionable Stand: alignment
           gives comparability, size need not. The ranked section therefore
           no longer promotes this figure into the Stand slot — doing so
           EVICTED the outcome, and „846 Stellungnahmen → Bisher keine
           Regierungsvorlage" is the accountability story itself. A ranked
           list shows its key by order. -->
      <div
        :class="
          density === 'row'
            ? 'entry-col-count order-1'
            : 'min-w-0 ps-2.5 sm:pe-2.5 sm:ps-0'
        "
      >
        <!-- The unit word stands on the card and NOT in the dense row:
             there it stands in the column header, once for the whole list.
             Both at once was the first attempt and read as a stutter —
             „Stellungnahmen" fourteen times under a column already called
             that. The card has no header, so it carries the word itself. -->
        <p
          v-if="entry.participation.kind === 'count'"
          class="text-sm font-semibold leading-tight tabular-nums text-ink"
        >
          {{ formatNumberDe(entry.participation.count) }}
          <span v-if="density !== 'row'" class="font-normal text-ink-secondary">{{
            entry.participation.count === 1 ? 'Stellungnahme' : 'Stellungnahmen'
          }}</span>
        </p>
        <!-- No digit, on purpose. These records carry no count and never
             will: Stellungnahmen go to the Ministerium, Parliament never
             sees them, so nobody counts them (§12.16). „0" would read as
             „niemanden interessiert" over two thirds of the corpus, and a
             dash is Statistik Austria's symbol for exactly zero.

             THE CELL ANSWERS ITS COLUMN'S QUESTION, and this is the third
             wording of it. „nicht veröffentlicht" read as „noch nicht" beside
             a running Frist; „Stellungnahmen ans Ministerium" said WHERE a
             Stellungnahme goes, an answer to a question this column does not
             ask. The column is called „Stellungnahmen" and asks „wie viele";
             the true answer is that the number does not exist.

             The filing route is not lost: the detail page states it in full
             in both states („Eine Stellungnahme geht hier direkt an das
             Ministerium …"), and the feeds carry it on through
             `risFilingNote`, where a whole line has room and no column header
             asks the question.

             `text-sm` like the number, not a step smaller: the cell stands in
             the same place for the same question, and a second type size in
             ONE column is exactly the variance §12.28 is written against.
             That no number stands here is already said by the colour
             (`ink-secondary` against ink) and by the missing digits. -->
        <p
          v-else-if="entry.participation.kind === 'unpublished'"
          class="text-sm leading-tight text-ink-secondary"
        >
          <template v-if="density !== 'row'">Stellungnahmen </template>nicht gezählt
        </p>
        <!-- The temporary absence, said differently from the permanent one:
             we asked and could not read it. -->
        <p v-else class="text-sm leading-tight text-ink-muted">
          <template v-if="density !== 'row'">Stellungnahmen </template>nicht abrufbar
        </p>
      </div>

    </div>
  </component>
</template>
