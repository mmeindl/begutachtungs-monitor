<script setup lang="ts">
import type { DeadlineTone } from '~/utils/deadlines'
import type { EntryState } from '~/utils/entryView'

/**
 * Zone 4 — „wo steht es", als EIN Kasten mit zwei Zeilen: der Zustand, und
 * darunter, was ihn festmacht (docs/architecture.md §12.28).
 *
 * ONE COMPONENT FOR EVERY STATE. It replaces `DeadlineBlock`, `StationBlock`
 * and `OutcomeChip`, all three of which claimed in their doc comments to
 * share "the same two-line anatomy" and did not: two rendered line 1 at
 * `text-base font-semibold`, two rendered it as a `text-xs` pill on
 * `bg-mark-wash`.
 *
 * DER KASTEN STEHT IMMER, und das ist die Korrektur vom 18.09.2026 gegen
 * den ersten Anlauf dieser Komponente. Der hatte nur den kritischen Zustand
 * eingefasst und alles andere als freien Text gesetzt — also **variierte die
 * FORM**, und eine Spalte, deren Form je Zeile wechselt, liest sich nicht
 * als Spalte. Das ist genau der Fehler, den §12.28 eine Ebene höher
 * auflöst, hier eine Ebene tiefer wiederholt. Jetzt variiert nur die
 * FÜLLUNG; die Silhouette ist über alle 336 Zeilen dieselbe.
 *
 * Der Kasten fasst BEIDE Zeilen ein. „Kundgemacht" und „BGBl. I Nr. 69/2026"
 * sind eine Aussage und ihre Fundstelle — sie zu trennen hieße, den Beleg
 * neben den Satz zu stellen statt unter ihn.
 *
 * DIE FÜLLUNG, und warum Grau und nicht Gelb:
 *  - **Dringlichkeit bekommt Farbe** — Rot ≤3 Tage, Orange ≤7, blasses Blau
 *    für ein offenes Fenster ohne Eile.
 *  - **Alles Abgeschlossene bekommt dasselbe Grau**, „Kundgemacht" wie
 *    „Bisher keine Regierungsvorlage". Das ist die Anti-Punktestand-Regel,
 *    die `OutcomeChip` schon durchgesetzt hat: den Erfolg hervorzuheben oder
 *    das Schweigen zu dämpfen wäre beides ein Urteil (Framing-Regel,
 *    CLAUDE.md).
 *  - **`mark-wash` (Gelb) bleibt draußen.** In Listen hat der Textmarker
 *    genau eine Aufgabe, „Neu"; als Grund jeder abgeschlossenen Zeile
 *    bedeutete er nichts mehr — und auf `/entwuerfe?station=bgbl` wären das
 *    84 gelbe Kästen, also wieder die Lautstärke, die den
 *    Drei-Tage-Countdown überschrien hat.
 *
 * EINE GRÖSSE FÜR JEDEN ZUSTAND, `text-sm` medium — auch für den
 * laufenden Countdown, der zuerst eine Stufe größer gesetzt war. Sobald der
 * Grund die Dringlichkeit trägt, ist die Größe ein ZWEITER Träger derselben
 * Aussage, und zwei Träger für eine Aussage kosten genau das, was sie
 * bringen sollen: die Spalte wippt zeilenweise zwischen zwei Schriftgraden,
 * und die Silhouette, für die der Kasten da ist, ist wieder hin. Die
 * Rangfolge im Blick der Leserin macht jetzt die Farbe — selten und rot vor
 * häufig und blau vor abgeschlossen und grau.
 *
 * KEIN PUNKT MEHR, aus demselben Grund: dritter Tonträger, im eingefassten
 * Kasten nur noch Rauschen. „Noch 3 Tage" sagt die Dringlichkeit ohnehin in
 * Worten, also reitet die Bedeutung weiterhin nicht auf Farbe allein
 * (WCAG 1.4.1).
 *
 * `actionable` bleibt im Modell, obwohl diese Komponente es nicht mehr
 * setzt: es ist die semantische Tatsache („hier geht noch etwas"), und es
 * fällt nicht mit `tone` zusammen — eine Frist, die upstream noch als aktiv
 * geführt wird, aber abgelaufen ist, kommt als `inactive` UND handlungsfähig
 * an (`deadlineTone`s Stale-Data-Schutz).
 *
 * BEIDE ZEILEN IN `text-ink`, nicht `ink-secondary`: auf einem Wash bleibt
 * nur ink AAA — secondary landet bei 6,0:1, muted bei 5,6:1 (Tokens in
 * `main.css`). Die Hierarchie zwischen den Zeilen trägt deshalb die GRÖSSE,
 * was die Regel des Designsystems ohnehin ist („hierarchy comes from size
 * and weight").
 */
defineProps<{ state: EntryState }>()

/**
 * `accent-50` für den ruhigen offenen Zustand, nicht `accent-wash`.
 *
 * Die offene Liste ist typischerweise 13 Zeilen lang, davon eine kritisch.
 * Mit `accent-wash` (#cde2fb) stünden zwölf kräftige blaue Kästen neben
 * einem blassen roten — die Farbe, die am seltensten vorkommt, muss die
 * auffälligste sein, sonst ist die Spalte eine Dekoration.
 */
const groundClass: Record<DeadlineTone, string> = {
  critical: 'bg-status-critical/15',
  serious: 'bg-status-serious/15',
  neutral: 'bg-accent-50',
  inactive: 'bg-ink-muted/15',
}
</script>

<template>
  <!-- KEINE eigene Ausrichtung: `text-align` erbt vom Aufrufer. Unter `sm`
       steht die Karte linksbündig, darüber rechts, und die dichte Zeile
       immer rechts — ein `align`-Prop müsste jeden dieser Fälle noch einmal
       benennen, wo das Erben ihn schon kennt. -->
  <div class="rounded-lg px-2.5 py-1.5" :class="groundClass[state.tone]">
    <!-- Umbrechen ist erlaubt, seit die Pille weg ist: „Bisher keine
         Regierungsvorlage" und „Stellungnahme möglich" laufen in der
         md-Spalte auf zwei Zeilen und bleiben ganz. Die Kurzformen, die sie
         früher brauchten („Bisher keine Vorlage", „Im Parlament"), waren
         `whitespace-nowrap` geschuldet — und „Vorlage" allein ist
         mehrdeutig in einer Liste, die auch Regierungsvorlagen führt. -->
    <p class="text-sm font-medium leading-tight tabular-nums text-ink">
      {{ state.label }}
    </p>
    <p v-if="state.detail" class="mt-0.5 text-xs leading-tight text-ink">
      {{ state.detail }}
    </p>
  </div>
</template>
