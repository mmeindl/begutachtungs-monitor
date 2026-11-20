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
const kurzFacts = [
  { key: 'shows', title: 'Was die Messung zeigt', lines: kurz.shows },
  { key: 'check', title: 'Was selbst zu prüfen bleibt', lines: kurz.check },
]
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
      Der Monitor prüft seine Textvergleiche gegen amtliche Texte. Hier
      steht, wogegen er prüft, wie oft das stimmt – und welche Fehler die
      Prüfung nicht fängt.
    </p>
    <p class="mt-2 text-sm text-ink-secondary">
      {{ measuredLineDe() }}
    </p>

    <!-- In short, for the reader who has to decide what to rely on. The
         site's frame for facts to consult is `FactList` — a name in the
         rail's station style, the fact under it in plain ink — so the box
         is that one, not a second kind with a heading and bullets of its
         own (20.11.2026). -->
    <section aria-label="Kurz gesagt" class="mt-8">
      <FactList :facts="kurzFacts">
        <template v-for="fact in kurzFacts" :key="fact.key" #[`value-${fact.key}`]>
          <ul role="list" class="list-none space-y-1.5 pl-0 leading-relaxed">
            <li v-for="line in fact.lines" :key="line">{{ line }}</li>
          </ul>
        </template>
      </FactList>
    </section>

    <ProseSection id="weg" heading="Ein Paragraph auf dem Weg">
      <p>
        Was ein Entwurf ändert, zeigt der Monitor an der
        Textgegenüberstellung des Ministeriums: bei
        {{ formatNumberDe(annexShown) }} von
        {{ formatNumberDe(annexShown + annex.withheld) }} Paragraphen. Das
        sind alle {{ formatNumberDe(annex.drafts) }} Entwürfe für Gesetze
        und Verordnungen, deren Gegenüberstellung der Monitor lesen kann.
      </p>
      <p>
        Zusätzlich setzt er den ganzen Paragraphen in der vorgeschlagenen
        Fassung selbst zusammen: so, wie er lautet, wenn der Entwurf
        unverändert Gesetz wird. Er zeigt ihn nur, wenn die Prüfung aufgeht:
        bei {{ formatNumberDe(funnel.shown) }} von
        {{ formatNumberDe(funnel.total) }} Paragraphen in den
        {{ formatNumberDe(drafts) }} Ministerialentwürfen, also den
        Entwürfen für Gesetze ({{ shareDe(funnel.shown, funnel.total) }}&nbsp;%).
        Bei den übrigen bleibt die Textgegenüberstellung des Ministeriums
        zu sehen, soweit sie den Paragraphen zeigt, und am Paragraphen
        steht, warum der ganze fehlt.
      </p>
      <p>
        So geht das, an einem echten Beispiel. Die Balken zeigen, wie viele
        der {{ formatNumberDe(funnel.total) }} Paragraphen an welchem
        Schritt ausscheiden:
      </p>
      <GenauigkeitWeg />
      <p v-if="funnel.outside" class="mt-6">
        Nicht mitgezählt sind {{ formatNumberDe(funnel.outside) }}
        Paragraphen, die ein Entwurf aufhebt oder mit einem neuen Gesetz
        erlässt: Dort gibt es nichts zusammenzusetzen.
      </p>
      <p>
        Bei den Entwürfen, die nur im RIS stehen, meist Verordnungen, kommen
        {{ formatNumberDe(risOnly.shown) }} von {{ formatNumberDe(risOnly.changed) }}
        geänderten Paragraphen in {{ formatNumberDe(risOnly.drafts) }} Entwürfen an.
      </p>
    </ProseSection>

    <ProseSection id="pruefungen" heading="Wie gut die Prüfungen sind">
      <p>
        Jede Art von Vergleich hat ihre eigene Prüfung. Um zu messen, ob sie
        Fehler bemerkt, verfälschen wir Texte absichtlich – ein Wort, eine
        Zahl, einen Absatz – und zählen, wie oft sie es merkt. Das zeigen
        die Balken; wie oft ein Vergleich richtig ist, steht darüber.
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
            <template v-if="art.pageName">Auf der Seite eines Entwurfs: „{{ art.pageName }}“. </template>Geprüft gegen {{ art.against }}.
          </p>
          <p v-for="line in art.result" :key="line" class="mt-2 font-medium text-ink">{{ line }}</p>
          <h4 v-if="art.faults.length" class="mt-5 text-sm font-semibold text-ink">Eingebaute Fehler, die die Prüfung bemerkt</h4>
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
                :note="`${formatNumberDe(fault.caught)} von ${formatNumberDe(fault.tried)} eingebauten Fehlern gefangen`"
              />
            </li>
          </ul>
          <!-- The blind spot apart, under its own name, with what it means
               for someone who quotes the comparison. -->
          <h4 class="mt-5 text-sm font-semibold text-ink">Was die Prüfung nicht fängt</h4>
          <ul v-if="art.faults.some((f) => f.blind)" class="mt-2 list-none space-y-3 pl-0">
            <li v-for="fault in art.faults.filter((f) => f.blind)" :key="fault.label">
              <GenauigkeitMeter
                :label="fault.label"
                :figure="`${shareDe(fault.caught, fault.tried)}\u00a0%`"
                :part="fault.caught"
                :whole="fault.tried"
                :note="`${formatNumberDe(fault.caught)} von ${formatNumberDe(fault.tried)} eingebauten Fehlern gefangen`"
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
