<script setup lang="ts">
/**
 * Genauigkeit (19.11.2026): how each comparison of the monitor is checked,
 * how often the check holds, and which faults it does not catch. The
 * figures and their sentences are `shared/utils/genauigkeit.ts`, the figures
 * themselves `shared/data/genauigkeit.json`, written by a measurement round
 * (`scripts/harness/genauigkeit.ts`); this page only lays them out.
 *
 * ONE JOB (docs/decisions.md, „Each of the prose pages has one job"):
 * `/datenlage` says what a source publishes, this page what the monitor
 * makes of it. The short „Methode" at each comparison stays where it is —
 * it is about that document — and links here for the measurement.
 *
 * THREE PARTS (19.11.2026, the evening the page was made; until then five).
 * One real § through every step, with the §§ of the period that end at each
 * step counted there; per kind of comparison what it is held against, the
 * result, and the injected faults as bars; and what the figures do not say.
 * The first telling gave each kind five rows of running text, drew the
 * steps and the counts as two sections, and listed the harnesses file by
 * file: a reader had to read all of it to find the two things the page is
 * for — how much is shown, and where a check is blind. Now a short bar says
 * the second, and the sentences stand under „Im Einzelnen".
 *
 * THE FIRST FIGURE A READER MEETS is how much of a draft's change is shown
 * at all (the annex), before the share of whole §§ the monitor composes
 * itself. Read alone, „half of the §§" sounds as if half the changes were
 * missing; the composed § is the addition, the annex is the change.
 */
import { formatNumberDe } from '#shared/utils/format'
import {
  GENAUIGKEIT,
  GENAUIGKEIT_GRENZEN,
  GENAUIGKEIT_ROW_DE,
  faultNoteDe,
  genauigkeitArten,
  genauigkeitKurz,
  measuredLineDe,
  shareDe,
  wegFunnel,
  type GenauigkeitArt,
} from '#shared/utils/genauigkeit'

usePageSeo({
  title: 'Wie genau der Monitor vergleicht',
  description:
    'Wogegen der Begutachtungs-Monitor seine Textvergleiche prüft, wie oft sie an kundgemachten Gesetzen stimmen, welche Fehler die Prüfungen fangen und welche nicht.',
})

const arten = genauigkeitArten()
const kurz = genauigkeitKurz()
const funnel = wegFunnel()
const drafts = GENAUIGKEIT.lesefassung.funnel.drafts
const risOnly = GENAUIGKEIT.lesefassung.risOnly
const annex = GENAUIGKEIT.annex
const annexShown = annex.confirmed + annex.unchecked

/** The sentences of one kind, under „Im Einzelnen". */
function detailsOf(art: GenauigkeitArt): { key: keyof typeof GENAUIGKEIT_ROW_DE; lines: string[] }[] {
  return [
    { key: 'rule', lines: [art.rule] },
    { key: 'measured', lines: art.measured },
    { key: 'missed', lines: art.missed },
  ]
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="page-title">
      Wie genau der Monitor vergleicht
    </h1>
    <p class="mt-3 leading-relaxed text-ink-secondary">
      Der Monitor vergleicht Gesetzestexte und prüft seine Vergleiche: an
      amtlichen Texten, wo es einen dritten Text gibt, sonst mit festen
      Regeln. Diese Seite sagt, woran er prüft, wie oft er richtig liegt,
      welche Fehler die Prüfung übersieht und was nicht gemessen ist.
    </p>
    <p class="mt-2 text-sm text-ink-secondary">
      {{ measuredLineDe() }}
    </p>

    <!-- In short, for the reader who has to decide what to rely on. Bare
         text under the section's heading, not a frame (20.11.2026): the
         frame means „facts to consult", these are sentences to read, and
         since the section has a heading the frame only repeated its
         boundary. What the measurement shows reads as paragraphs; what is
         left to the reader are three separate instructions, so a list. -->
    <ProseSection id="kurz" heading="Das Wichtigste in Kürze" first>
      <h3 class="mt-4 text-lg font-semibold text-ink">Was die Messung zeigt</h3>
      <p v-for="line in kurz.shows" :key="line">{{ line }}</p>
      <h3 class="mt-6 text-lg font-semibold text-ink">Was selbst zu prüfen bleibt</h3>
      <ul>
        <li v-for="line in kurz.check" :key="line">{{ line }}</li>
      </ul>
    </ProseSection>

    <ProseSection id="weg" heading="Ein Paragraph auf dem Weg durch die Prüfung">
      <!-- One total per sentence, and what it counts before the figure
           (20.11.2026): two totals in one sentence is where a reader with
           no legal training stopped. -->
      <p>
        Bei {{ formatNumberDe(annex.drafts) }} Entwürfen für Gesetze und
        Verordnungen kann der Monitor die Textgegenüberstellung lesen. Sie
        enthalten {{ formatNumberDe(annexShown + annex.withheld) }}
        Paragraphen, {{ formatNumberDe(annexShown) }} davon zeigt der
        Monitor.
      </p>
      <p>
        Bei den {{ formatNumberDe(drafts) }} Ministerialentwürfen, den
        Entwürfen der Ministerien für Gesetze, schreibt der Monitor
        zusätzlich ganze Paragraphen aus: so, wie sie lauten, wenn der
        Entwurf unverändert Gesetz wird. Das betrifft
        {{ formatNumberDe(funnel.total) }} Paragraphen. Den ganzen
        Paragraphen zeigt der Monitor nur, wenn er ihn bestätigen konnte:
        bei {{ formatNumberDe(funnel.shown) }}, das sind
        {{ shareDe(funnel.shown, funnel.total) }}&nbsp;%.
      </p>
      <p>
        Fehlt der ganze Paragraph, heißt das nicht, dass etwas falsch ist:
        Der Monitor konnte ihn nicht sicher prüfen. Die
        Textgegenüberstellung bleibt zu sehen, soweit sie den Paragraphen
        enthält, und am Paragraphen steht der Grund.
      </p>
      <p>
        Die Schritte zeigen das an einem echten Beispiel. Unter jedem
        Schritt steht, wie viele der {{ formatNumberDe(funnel.total) }}
        Paragraphen dort ausscheiden, also nicht als ganzer Paragraph
        gezeigt werden.
      </p>
      <GenauigkeitWeg />
      <!-- Bookkeeping, folded: a second population in the open flow broke the count the steps tell. -->
      <Disclosure size="sm" tone="secondary" class="mt-4">
        <template #summary>Was hier nicht mitgezählt ist</template>
        <div class="mt-1 space-y-2 text-sm">
          <p v-if="funnel.outside">
            {{ formatNumberDe(funnel.outside) }} Paragraphen sind nicht
            mitgezählt: Ein Entwurf streicht sie ganz, dann gibt es keinen
            neuen Text, oder er schreibt sie mit einem neuen Gesetz neu,
            dann gibt es keinen alten, den der Monitor ändern könnte.
          </p>
          <!-- The same whole as above (21.11.2026): §§ with something to
               compose, and the drafts that have any. Until then the line
               counted repealed §§ in, and drafts that only enact new
               ordinances. -->
          <p>
            Entwürfe, die nur im RIS stehen und nicht beim Parlament, sind
            meist Verordnungen. Dort zeigt der Monitor
            {{ formatNumberDe(risOnly.shown) }} von
            {{ formatNumberDe(risOnly.changed - (risOnly.outside ?? 0)) }}
            geänderten Paragraphen ganz, in
            {{ formatNumberDe(risOnly.composing ?? risOnly.drafts) }}
            Entwürfen.<template v-if="risOnly.composing !== undefined && risOnly.drafts > risOnly.composing">
              {{ formatNumberDe(risOnly.drafts - risOnly.composing) }}
              weitere Entwürfe erlassen nur Neues oder ändern nichts, was
              sich zusammensetzen ließe.</template>
          </p>
        </div>
      </Disclosure>
    </ProseSection>

    <ProseSection id="pruefungen" heading="Wie zuverlässig die Prüfungen sind">
      <p>
        Jede Art von Vergleich hat ihre eigene Prüfung. Wir testen jede mit
        absichtlich eingebauten Fehlern: Wir ändern ein Wort, eine Zahl
        oder einen Absatz und zählen, wie viele dieser Fehler die Prüfung
        bemerkt. Das zeigen die Balken. Sie sagen nicht, wie oft der Monitor
        falsch liegt: Was die Prüfung bemerkt, wird nicht
        gezeigt<template v-if="annex.marks"> oder trägt einen Vermerk</template>.
      </p>
      <div class="mt-6 space-y-10">
        <section
          v-for="art in arten"
          :id="art.id"
          :key="art.id"
          :aria-labelledby="`${art.id}-heading`"
          class="scroll-mt-6"
        >
          <h3 :id="`${art.id}-heading`" class="text-lg font-semibold text-ink">{{ art.heading }}</h3>
          <p class="mt-1 text-sm text-ink-secondary">
            <template v-if="art.pageName">Auf der Seite eines Entwurfs: „{{ art.pageName }}“. </template>{{ art.against }}
          </p>
          <p v-for="line in art.result" :key="line" class="mt-3 leading-relaxed text-ink-secondary">{{ line }}</p>
          <h4 v-if="art.faults.length" class="mt-6 text-sm font-medium text-ink">Test mit eingebauten Fehlern: Das bemerkt die Prüfung</h4>
          <ul
            v-if="art.faults.length"
            class="mt-2 list-none space-y-3 pl-0"
            :aria-label="`Eingebaute Fehler und wie viele die Prüfung gefangen hat: ${art.heading}`"
          >
            <li v-for="fault in art.faults.filter((f) => !f.blind)" :key="fault.label">
              <GenauigkeitMeter
                :label="fault.label"
                :figure="`${shareDe(fault.caught, fault.tried)}\u00a0%`"
                :part="fault.caught"
                :whole="fault.tried"
                :note="faultNoteDe(fault)"
              />
            </li>
          </ul>
          <!-- The blind spot apart, under its own name, with what it means
               for someone who quotes the comparison. -->
          <h4 class="mt-6 text-sm font-medium text-ink">Was die Prüfung übersieht</h4>
          <ul v-if="art.faults.some((f) => f.blind)" class="mt-2 list-none space-y-3 pl-0">
            <li v-for="fault in art.faults.filter((f) => f.blind)" :key="fault.label">
              <GenauigkeitMeter
                :label="fault.label"
                :figure="`${shareDe(fault.caught, fault.tried)}\u00a0%`"
                :part="fault.caught"
                :whole="fault.tried"
                :note="faultNoteDe(fault)"
              />
            </li>
          </ul>
          <p class="mt-2 text-sm text-ink">{{ art.consequence ?? art.missed[0] }}</p>
          <Disclosure size="sm" tone="secondary" class="mt-2">
            <template #summary>Im Einzelnen</template>
            <dl class="mt-1 divide-y divide-hairline border-y border-hairline text-sm">
              <div
                v-for="row in detailsOf(art)"
                :key="row.key"
                class="py-2 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-x-4"
              >
                <dt class="text-ink-secondary">{{ GENAUIGKEIT_ROW_DE[row.key] }}</dt>
                <dd class="mt-0.5 space-y-1.5 sm:mt-0">
                  <p v-for="(line, i) in row.lines" :key="i" class="text-ink">{{ line }}</p>
                </dd>
              </div>
            </dl>
          </Disclosure>
        </section>
      </div>
    </ProseSection>

    <ProseSection id="grenzen" heading="Was die Zahlen nicht sagen">
      <ul>
        <li v-for="line in GENAUIGKEIT_GRENZEN" :key="line">{{ line }}</li>
      </ul>
      <p>
        Wer trotzdem einen Fehler findet: Unter jedem Vergleich steht
        „Fehler melden“, und jeder Hinweis hilft. Wie sich der Monitor
        sonst erreichen lässt, steht unter
        <NuxtLink to="/ueber#about-contact" class="link-inline">Kontakt</NuxtLink>.
        Was die Quellen selbst veröffentlichen, steht unter
        <NuxtLink to="/datenlage" class="link-inline">Datenlage</NuxtLink>.
      </p>
    </ProseSection>
  </div>
</template>
