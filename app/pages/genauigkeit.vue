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
 * it is about that document — and links here for the measurement, by the
 * kinds' anchors.
 *
 * SCANNED, NOT READ (24.11.2026). The page had grown to some 8,800 px: six
 * sentences of running text at its top with eleven counts in them, a rail
 * of five steps with a paragraph each, and per kind of comparison up to
 * seven bars, each with a line of counts — too much to scan, and exact
 * counts tell a reader less than shares and figures (maintainer). Now:
 *   - four shares at the top, as large as a heading, and what stays to
 *     check as four lines that open in bold;
 *   - one picture of an injected fault, which says what every share below
 *     is of;
 *   - per kind the same order (`GenauigkeitArt`): what it is held against,
 *     one figure — out of 100 where a § can be one of several things, a
 *     funnel for how many whole §§ arrive —, what the check catches almost
 *     always as one bar, and every short bar alone with its why;
 *   - every count and sentence that stood here before, under „Im
 *     Einzelnen" of its kind. Nothing is gone, it is one click down.
 *
 * THE ANNEX FIRST. What a draft changes is the ministry's annex; the whole §
 * is the monitor's addition. Read alone, „63 % of the §§" sounds as if a
 * third of the changes were missing (19.11.2026), so the annex's share
 * stands first, at the top and in the order of the chapters.
 */
import { formatNumberDe } from '#shared/utils/format'
import {
  GENAUIGKEIT,
  GENAUIGKEIT_GRENZEN,
  WEG_BEISPIEL,
  genauigkeitArten,
  genauigkeitKurz,
  gesetzProbe,
  measuredLineDe,
  wegFunnel,
} from '#shared/utils/genauigkeit'

usePageSeo({
  title: 'Wie genau der Monitor vergleicht',
  description:
    'Wogegen der Begutachtungs-Monitor seine Textvergleiche prüft, wie oft sie an kundgemachten Gesetzen stimmen, welche Fehler die Prüfungen fangen und welche nicht.',
})

const arten = genauigkeitArten()
const art = (id: string) => arten.find((a) => a.id === id)!
const kurz = genauigkeitKurz()
const funnel = wegFunnel()
const probe = gesetzProbe()
const probeNote = [probe.where, probe.differs, probe.notMeaning, probe.caveat].filter(Boolean).join(' ')
const risOnly = GENAUIGKEIT.lesefassung.risOnly
const annex = GENAUIGKEIT.annex
const notMatched = GENAUIGKEIT.lesefassung.funnel.notRun.zuordnung ?? 0
/** The example's figure with one injected fault: „2029" with its digits swapped. */
const fault = { before: '… ab dem Jahr ', wrong: '2092', after: ' jährlich …' }
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="page-title">
      Wie genau der Monitor vergleicht
    </h1>
    <p class="mt-3 leading-relaxed text-ink-secondary">
      Der Monitor prüft seine Vergleiche, bevor er sie zeigt. Hier steht, wie
      oft die Prüfungen halten, wo sie blind sind und was selbst nachzusehen
      bleibt.
    </p>
    <p class="mt-2 text-sm text-ink-secondary">
      {{ measuredLineDe() }}
    </p>

    <ProseSection id="kurz" heading="Auf einen Blick" first>
      <!-- Facts to consult, so a frame each (box grammar); the serif carries
           stat values. In a div: a list right under the section takes the
           prose list's spacing and bullets. -->
      <div class="mt-6">
        <ul class="grid list-none gap-3 pl-0 sm:grid-cols-2">
          <li v-for="k in kurz.kacheln" :key="k.id" class="rounded-xl border border-hairline px-4 py-4">
            <p class="font-heading text-4xl leading-none text-ink">{{ k.value }}</p>
            <p class="mt-2 text-sm leading-snug text-ink">{{ k.label }}</p>
            <p v-if="k.note" class="mt-1 text-xs text-ink-secondary">{{ k.note }}</p>
          </li>
        </ul>
      </div>
      <h3 class="mt-8 text-lg font-semibold text-ink">Was selbst nachzusehen bleibt</h3>
      <ul>
        <li v-for="c in kurz.check" :key="c.lead">
          <strong class="font-semibold text-ink">{{ c.lead }}</strong> {{ c.text }}
        </li>
      </ul>
    </ProseSection>

    <!-- What every share below is of, once, as a picture: until 24.11.2026 a
         paragraph of seven sentences above the first bar. -->
    <ProseSection id="test" heading="Wie wir die Prüfungen testen">
      <p>
        In eine Kopie der Texte bauen wir absichtlich Fehler ein, wie sie beim
        Lesen eines Dokuments passieren können, und zählen, wie viele die
        Prüfung bemerkt. Auf den Seiten der Entwürfe steht nie ein
        eingebauter Fehler.
      </p>
      <figure class="mt-4 rounded-xl border border-hairline px-4 py-3 text-sm">
        <dl class="grid gap-x-4 gap-y-1 sm:grid-cols-[11rem_1fr] sm:gap-y-2">
          <dt class="text-ink-secondary">Richtig</dt>
          <dd class="mb-2 text-ink sm:mb-0">{{ WEG_BEISPIEL.annex.right }}</dd>
          <dt class="text-ink-secondary">Mit eingebautem Fehler</dt>
          <dd class="mb-2 text-ink sm:mb-0">{{ fault.before }}<mark class="bg-mark text-ink">{{ fault.wrong }}</mark>{{ fault.after }}</dd>
          <dt class="text-ink-secondary">Die Prüfung</dt>
          <dd class="font-semibold text-ink">bemerkt den Fehler: gefangen.</dd>
        </dl>
      </figure>
      <ul>
        <li><strong class="font-semibold text-ink">Gefangen</strong> heißt: Der Paragraph wird nicht gezeigt oder trägt einen Vermerk.</li>
        <li><strong class="font-semibold text-ink">Die Prozente</strong> sagen, wie viele eingebaute Fehler einer Art die Prüfung bemerkt. Wie oft der Monitor falsch liegt, sagen sie nicht.</li>
      </ul>
    </ProseSection>

    <GenauigkeitArt :art="art('gegenueberstellung')">
      <!-- The term explained where the chapter opens (24.11.2026): a method note links here by its anchor, past the tile that explains it too. -->
      <template #lead>
        <p>
          Zu einem Entwurf gehört meist eine Textgegenüberstellung des
          Ministeriums: eine Tabelle mit altem und neuem Text nebeneinander.
          Der Monitor übernimmt ihren Text Wort für Wort und markiert die
          Änderungen in Farbe.
        </p>
      </template>
      <template #details>
        <!-- The drafts that drop out before any § is counted (23.11.2026): said, or the totals read as all of them. -->
        <div class="py-2 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-x-4">
          <dt class="text-ink-secondary">Nicht mitgezählt</dt>
          <dd class="mt-0.5 space-y-1.5 text-ink sm:mt-0">
            <p>
              Im RIS stehen {{ formatNumberDe(annex.population.listed) }} Entwürfe dieser Gesetzgebungsperiode für Gesetze
              und Verordnungen. {{ formatNumberDe(annex.population.withAnnex) }} haben eine Textgegenüberstellung,
              {{ formatNumberDe(annex.drafts) }} davon kann der Monitor lesen und prüfen.
            </p>
            <!-- The 9 and the 7 are of the drafts WITH an annex (24.11.2026): the sentence had set them under the 118 without one. -->
            <p>
              Bei {{ formatNumberDe(annex.population.noClause) }} der übrigen erkennt der Monitor keine Änderung eines
              bestehenden Gesetzes, bei {{ formatNumberDe(annex.population.unreadable) }} zeigt er die Gegenüberstellung
              mit dem Hinweis, dass er ihre Paragraphen keinem einzelnen Gesetz zuordnen kann. Diese und die
              {{ formatNumberDe(annex.population.listed - annex.population.withAnnex) }} Entwürfe ohne
              Textgegenüberstellung sind in den Zahlen oben nicht enthalten.
            </p>
          </dd>
        </div>
      </template>
    </GenauigkeitArt>

    <GenauigkeitArt :art="art('lesefassung')">
      <template #lead>
        <p>
          Zusätzlich schreibt der Monitor geänderte Paragraphen ganz aus: so,
          wie sie lauten, wenn der Entwurf unverändert Gesetz wird. Er zeigt
          sie nur, wenn er sie bestätigen kann, und nie als amtlichen Text.
        </p>
      </template>
      <h3 class="mt-8 text-lg font-semibold text-ink">So entsteht ein ganzer Paragraph</h3>
      <GenauigkeitWeg />
      <h3 class="mt-8 text-lg font-semibold text-ink">Wie viele er ganz zeigt</h3>
      <p class="mt-1 text-sm text-ink-secondary">
        Von allen geänderten Paragraphen der Ministerialentwürfe. Fehlt der
        ganze Paragraph, bleibt die Textgegenüberstellung zu sehen, soweit sie
        den Paragraphen enthält, und am Paragraphen steht der Grund.
      </p>
      <GenauigkeitTrichter :funnel="funnel" :drafts="GENAUIGKEIT.lesefassung.funnel.drafts" />
      <h3 id="lesefassung-gesetz" class="mt-8 scroll-mt-6 text-lg font-semibold text-ink">Wie oft er dem Gesetz entspricht</h3>
      <div class="mt-3 rounded-xl border border-hairline px-4 py-4">
        <p class="font-heading text-4xl leading-none text-ink">{{ probe.value }}</p>
        <p class="mt-2 text-sm text-ink">stimmen Wort für Wort mit dem späteren Gesetz.</p>
        <p class="mt-1 text-xs text-ink-secondary">{{ probeNote }}</p>
      </div>
      <!-- The trade-off, in the open (20.11.2026), as frequencies since 24.11.2026: 99,9 against 96,6 % read as a rounding. -->
      <p class="mt-4 text-sm text-ink">Die Prüfung ist streng. In einem zweiten Test an Bundesgesetzblättern:</p>
      <div class="mt-2">
        <dl class="grid grid-cols-2 gap-3">
          <div class="flex flex-col-reverse justify-end rounded-xl border border-hairline px-4 py-3">
            <dt class="mt-1 text-sm text-ink-secondary">ohne die Prüfung nicht das Gesetz</dt>
            <dd class="text-sm text-ink"><span class="font-heading text-3xl">{{ formatNumberDe(probe.without) }}</span> von 1.000</dd>
          </div>
          <div class="flex flex-col-reverse justify-end rounded-xl border border-hairline px-4 py-3">
            <dt class="mt-1 text-sm text-ink-secondary">mit der Prüfung nicht das Gesetz</dt>
            <dd class="text-sm text-ink"><span class="font-heading text-3xl">{{ formatNumberDe(probe.with) }}</span> von 1.000</dd>
          </div>
        </dl>
      </div>
      <p class="mt-2 text-sm text-ink-secondary">Dafür zeigt der Monitor mit der Prüfung weniger ganze Paragraphen.</p>
      <template #details>
        <div class="py-2 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-x-4">
          <dt class="text-ink-secondary">Nicht mitgezählt</dt>
          <dd class="mt-0.5 space-y-1.5 text-ink sm:mt-0">
            <p v-if="notMatched">
              {{ formatNumberDe(notMatched) }} Ministerialentwürfe kann der Monitor keinem Eintrag im RIS sicher
              zuordnen. Ihre Paragraphen sind in den Zahlen oben nicht enthalten.
            </p>
            <p v-if="funnel.outside">
              {{ formatNumberDe(funnel.outside) }} Paragraphen sind nicht mitgezählt: Ein Entwurf streicht sie ganz,
              dann gibt es keinen neuen Text, oder er schreibt sie mit einem neuen Gesetz neu, dann gibt es keinen
              alten, den der Monitor ändern könnte.
            </p>
            <!-- The same whole as above (21.11.2026): §§ with something to compose, and the drafts that have any. -->
            <p>
              Entwürfe, die nur im RIS stehen und nicht beim Parlament, sind meist Verordnungen. Dort zeigt der Monitor
              {{ formatNumberDe(risOnly.shown) }} von
              {{ formatNumberDe(risOnly.changed - (risOnly.outside ?? 0)) }} geänderten Paragraphen ganz, in
              {{ formatNumberDe(risOnly.composing ?? risOnly.drafts) }} Entwürfen.<template v-if="risOnly.composing !== undefined && risOnly.drafts > risOnly.composing">
                Bei {{ formatNumberDe(risOnly.drafts - risOnly.composing) }} weiteren erkennt der Monitor keine
                Änderung, die sich zusammensetzen ließe.</template>
            </p>
            <p>
              Nicht mitgezählt sind die Textgegenüberstellungen von Regierungsvorlagen, die der Monitor aus dem PDF
              des Parlaments liest: Die Zahlen dieser Seite sind an Entwürfen gemessen.
            </p>
          </dd>
        </div>
      </template>
    </GenauigkeitArt>

    <GenauigkeitArt :art="art('stationen')" />
    <GenauigkeitArt :art="art('land-gegenueberstellung')" />
    <GenauigkeitArt :art="art('land-stationen')" />

    <ProseSection id="grenzen" heading="Was die Zahlen nicht sagen">
      <ul>
        <li v-for="g in GENAUIGKEIT_GRENZEN" :key="g.lead">
          <strong class="font-semibold text-ink">{{ g.lead }}</strong> {{ g.text }}
        </li>
      </ul>
      <p>
        Wer trotzdem einen Fehler findet: Unter jedem Vergleich steht
        „Fehler melden“, und jeder Hinweis hilft. Wie sich der Monitor
        sonst erreichen lässt, steht unter
        <NuxtLink to="/ueber#contact" class="link-inline">Kontakt</NuxtLink>.
        Was die Quellen selbst veröffentlichen, steht unter
        <NuxtLink to="/datenlage" class="link-inline">Datenlage</NuxtLink>.
      </p>
    </ProseSection>
  </div>
</template>
