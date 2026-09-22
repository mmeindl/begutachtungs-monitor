<script setup lang="ts">
import { NuxtLink } from '#components'
import type { EntryView } from '#shared/utils/entryView'

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
 * `main.css`, dieselben Klassen, die `EntryList` dem Spaltenkopf gibt. Card:
 * the same order, with 3 and 4 on one bottom line — Stellungnahmen flush
 * left, Stand flush right — so the card reads in the same left-to-right
 * order as the row it becomes at `md`.
 *
 * WHAT IT REPLACES: `DraftCard`/`DraftRow`, `RisConsultationCard`/`Row` and
 * `SecondRoundCard`/`Row` — six components arranging the same facts six
 * ways. The defect that ended them is measurable: on
 * `/entwuerfe?status=open`, 14 rows in one screenful, the Stellungnahmen
 * token began at x=388 on one row and x=556 on another, because it was the
 * last token of a variable-length prose line. Now it is a column, and the
 * digits line up down the list — which is the only thing that makes 846 and
 * 12 comparable at a glance.
 *
 * WHAT DECIDES CONTENT lives in `shared/utils/entryView.ts`, not here. This
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
  /** `card` unter `md`, `row` im dichten Blatt ab `md` — beide Fassungen
   *  stellt `EntryList`, nie eine Seite selbst. */
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
 * KEIN `target="_blank"` — dieselbe Entscheidung wie in `ExternalLink`, und
 * aus demselben Grund: eine Zeile, die auf parlament.gv.at zeigt, ist ein
 * VERWEIS. Man sieht dort nach und kommt zurück, dafür ist der Zurück-Knopf
 * da, und wer einen Tab will, hat Cmd- oder Mittelklick — seine
 * Entscheidung statt unserer. Neue Fenster behalten nur Dokumente und
 * Handlungen, und die sagen es an (WCAG 2.2 3.2.5).
 *
 * Diese Zeile war die eine Stelle, die der Umbau am 18.09.2026 nicht
 * erreichte: sie baut ihr `<a>` selbst, weil die ganze Zeile der Link ist.
 */
const linkProps = computed(() =>
  props.entry.to ? { to: props.entry.to } : { href: props.entry.href ?? undefined },
)

/**
 * Wohin die Zeile führt, für alle, die den ↗ nicht sehen — der ist
 * `aria-hidden`, und ohne ihn unterscheidet nichts diese Zeile von den
 * anderen dreizehn. `ExternalLink` braucht das nicht: dort steht das Ziel
 * im sichtbaren Text („Auf parlament.gv.at ansehen"), hier ist der Text der
 * Titel des Gegenstands. Aus dem Host, nicht als Konstante — diese
 * Komponente weiß nicht, welche Art von Eintrag sie rendert.
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

      <!-- ZONE 2 — Kennung: was für ein Ding, welches, von wem. Fixed
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

      <!-- DER BELEG, und nur dort, wo die Zeile einen hat: die Trefferstelle
           der Volltextsuche (§12.31). Leer gelassen rendert der Slot nichts,
           also ändert er an keiner der bestehenden Listen etwas.

           Er sitzt IN Zone 1/2 und nicht in einer fünften Zone, weil er kein
           eigener Fakt über den Entwurf ist, sondern die Begründung dafür,
           dass diese Zeile überhaupt dasteht — sie gehört zur Kennung, nicht
           neben den Stand. Und er sitzt innerhalb des Links: wer den Beleg
           anklickt, will zum Entwurf. -->
      <slot name="evidence" />
    </div>

    <!-- DER STAND ZUERST, DIE ZAHL DARUNTER — auf der Karte oben rechts,
         die Stellungnahmen unten rechts.

         Umgekehrt stand es bis 18.09.2026, und die Rangfolge stimmte nicht:
         zuoberst las sich als „das Wichtigste", und das Wichtigste an einer
         Zeile ist, ob ich noch etwas tun kann — nicht, wie viele andere
         schon etwas getan haben. Die Zahl ist die zweite Frage, in jedem
         Abschnitt, auch in dem, der nach ihr reiht: dort trägt die
         REIHENFOLGE die Reihung (§12.28).

         Eine Anordnung für jede Kartenbreite, ohne `sm:`-Zweig — was oben
         steht, soll nicht davon abhängen, wie breit das Fenster ist. In der
         dichten Zeile gilt dieselbe Rangfolge auf der anderen Achse: der
         Stand ist die äußerste rechte Spalte, also der Ankerpunkt, an dem
         das Auge die Liste hinunterfährt, und die Zahl steht davor.
         `contents`, damit beide direkte Flex-Kinder der Zeile werden und
         mit dem Spaltenkopf fluchten. -->
    <div
      :class="
        density === 'row'
          ? 'contents'
          : 'mt-auto flex flex-col items-start gap-1.5 text-left sm:mt-0 sm:shrink-0 sm:items-end sm:text-right'
      "
    >
      <!-- ZONE 4 — Stand. -->
      <!-- Im DOM steht der Stand vor der Zahl — so liest ihn auch ein
           Screenreader zuerst, und das ist die richtige Reihenfolge. In der
           dichten Zeile kehrt `order` das SICHTBAR um: der Stand bleibt die
           äußerste rechte Spalte, weil dort die Kante des Containers die
           Werte untereinander ausrichtet und der Spaltenkopf ihn dort
           ankündigt. Auf der Karte gibt es keine solche Kante, dort steht
           er oben. -->
      <!-- Die SPALTE ist fest, der KASTEN darin nicht: er misst sich an
           seinem eigenen Inhalt und sitzt rechts in der Spalte. Beides
           gleichzusetzen war zweimal derselbe Fehler — auf der Karte wurde
           der Kasten so breit wie die Stellungnahmen-Zeile UNTER ihm, in
           der dichten Zeile so breit wie die 14-rem-Spalte, und aus einem
           Zustand wurde ein grauer Balken. Ein Kasten, dessen Breite von
           etwas anderem als seinem Text bestimmt wird, sagt etwas über
           dieses andere. -->
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
        <!-- Das Einheitswort steht auf der Karte und NICHT in der dichten
             Zeile: dort steht es im Spaltenkopf, einmal für die ganze
             Liste.
             Beides zugleich war der erste Anlauf und las sich als Stotterer
             — „Stellungnahmen" vierzehnmal untereinander unter einer
             Spalte, die schon so heißt. Die Karte hat keinen Kopf, also
             trägt sie das Wort selbst. -->
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

             DIE ZELLE BEANTWORTET DIE FRAGE IHRER SPALTE, und das ist die
             dritte Fassung dieses Textes. „nicht veröffentlicht" las sich
             neben einer laufenden Frist als „noch nicht". „Stellungnahmen
             ans Ministerium" sagte, WOHIN eine Stellungnahme geht — eine
             Antwort auf eine Frage, die diese Spalte nicht stellt, und
             deshalb lang und unscharf zugleich. Die Spalte heißt
             „Stellungnahmen" und fragt „wie viele"; die wahre Antwort
             darauf ist, dass es die Zahl nicht gibt.

             Der Einreichweg geht dadurch nicht verloren: die Detailseite
             sagt ihn in beiden Zuständen ganz („Eine Stellungnahme geht
             hier direkt an das Ministerium …"), und die Feeds tragen ihn
             über `risFilingNote` weiter, wo eine ganze Zeile Platz hat und
             kein Spaltenkopf die Frage stellt.

             `text-sm` wie die Zahl, nicht eine Stufe kleiner: die Zelle
             steht an derselben Stelle für dieselbe Frage, und ein zweiter
             Schriftgrad in EINER Spalte ist genau die Varianz, gegen die
             §12.28 geschrieben ist. Dass hier keine Zahl steht, sagt schon
             die Farbe (`ink-secondary` gegen ink) und das fehlende
             Ziffernbild. -->
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
