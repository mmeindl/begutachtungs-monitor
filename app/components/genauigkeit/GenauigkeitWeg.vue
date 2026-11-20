<script setup lang="ts">
/**
 * One § on its way to a Lesefassung, step by step (`GENAUIGKEIT_WEG`), with
 * a real § as the page showed it (`WEG_BEISPIEL`) — and at each step the §§
 * of the period that end there (`wegFunnel`): the answer to „how does the
 * comparison work, where can an error come in, and how often does it".
 *
 * ONE FIGURE FOR WAY AND COUNT (19.11.2026). The steps and the bar chart of
 * what is not shown were two sections that said the same thing in two
 * orders, with a „Fehlerquelle" sentence per step as a third telling. A §
 * that is not shown ended at one of these steps; so its count stands at
 * that step, with the reason a reader meets on a draft's page folded under
 * it, and the last step carries what arrives.
 *
 * THE RAIL'S GEOMETRY, NOT ITS STATES. Dots and line as in `SpineRail` and
 * `AnliegenRail`, so a reader who knows a draft's page reads it as steps in
 * order. But a draft's rail fills a dot that was reached and puts the yellow
 * mark on where the procedure stands; a method has no „reached" and no
 * „now", so every dot is the same hollow ink ring and the line between them
 * is ink. An <ol>, so the order is the markup's too, not the picture's
 * alone.
 *
 * HTML, not an SVG: every step is text that has to wrap at 400 px, and the
 * example's marking is `DiffText`, the comparison's own. The example sits in
 * a hairline frame, the box grammar's „to consult".
 */
import { formatNumberDe } from '#shared/utils/format'
import { FUNNEL_GROUP_WHY_DE, GENAUIGKEIT_WEG, WEG_BEISPIEL, shareDe, wegFunnel } from '#shared/utils/genauigkeit'
import { risSource } from '#shared/utils/provenance'
import { lesefassungCauseText } from '~/utils/lesefassung'

const steps = GENAUIGKEIT_WEG
const ex = WEG_BEISPIEL
const funnel = wegFunnel()
const sources = [risSource('Geltender Text'), risSource('Entwurf'), risSource('Textgegenüberstellung')]

/** „1.085 · 23,0 %": a count and its share of the §§ that set out. */
const figure = (count: number) => `${formatNumberDe(count)} · ${shareDe(count, funnel.total)}\u00a0%`
</script>

<template>
  <figure class="mt-6">
    <ol class="isolate flex list-none flex-col gap-6 pl-0" aria-label="Die Schritte vom geltenden Text zur vorgeschlagenen Fassung">
      <li v-for="(step, i) in steps" :key="step.key" class="relative flex gap-3">
        <!-- From this dot's lower edge (6 + 12 px) to the next one's upper
             edge, across the gap-6 (24 + 6 px), as in the rails. -->
        <span
          v-if="i < steps.length - 1"
          aria-hidden="true"
          class="pointer-events-none absolute -bottom-7.5 left-1.25 top-4.5 z-10 w-0.5 bg-ink"
        />
        <span
          aria-hidden="true"
          class="pointer-events-none relative z-10 mt-1.5 box-border size-3 shrink-0 rounded-full border-2 border-ink bg-surface"
        />
        <div class="min-w-0 flex-1">
          <h3 class="text-base font-semibold text-ink">
            {{ step.title }}<template v-if="step.who">
              <span class="font-normal text-ink-secondary"> · {{ step.who }}</span>
            </template>
          </h3>
          <p class="mt-1 text-ink">{{ step.text }}</p>

          <!-- The example, at each step as the page met it. -->
          <div class="mt-3 rounded-xl border border-hairline px-3 py-2.5 text-sm leading-relaxed">
            <template v-if="step.key === 'geltend'">
              <p class="font-medium text-ink">{{ ex.para }}. {{ ex.heading }}</p>
              <p class="mt-1 text-ink">{{ ex.standing }}</p>
            </template>
            <p v-else-if="step.key === 'anweisung'" class="text-ink">{{ ex.instruction }}</p>
            <p v-else-if="step.key === 'ergebnis'" class="text-ink">
              <DiffText :segments="ex.result" />
            </p>
            <dl v-else-if="step.key === 'pruefung'" class="space-y-1.5">
              <div>
                <dt class="text-ink-secondary">Links, geltend</dt>
                <dd class="text-ink">{{ ex.annex.left }} – steht so im RIS.</dd>
              </div>
              <div>
                <dt class="text-ink-secondary">Rechts, neu</dt>
                <dd class="text-ink">{{ ex.annex.right }} – steht so in unserem Ergebnis.</dd>
              </div>
              <!-- The example's own outcome, before the bars say what happens to others. -->
              <p class="font-medium text-ink">Beides stimmt: Die Prüfung ist bestanden.</p>
            </dl>
            <p v-else class="text-ink">
              Bestätigt: Beim Entwurf {{ ex.draft.citation }} steht unter {{ ex.para }}
              der ganze Paragraph.
              <NuxtLink :to="ex.draft.href" class="link-inline">Zum Entwurf</NuxtLink>
            </p>
          </div>

          <!-- What ends here, of all the §§ that set out; what arrives, at the last step. -->
          <div v-for="row in funnel.exits[step.key]" :key="row.key" class="mt-4">
            <!-- The reason first, then its bar: a sentence under a bar read
                 as a caption of the next one (20.11.2026). -->
            <p v-if="row.key !== 'gezeigt' && row.key !== 'nichts'" class="mb-2 text-sm text-ink">{{ FUNNEL_GROUP_WHY_DE[row.key] }}</p>
            <GenauigkeitMeter
              :label="`Hier scheiden aus: ${row.label}`"
              :figure="figure(row.count)"
              :part="row.count"
              :whole="funnel.total"
            />
            <!-- One reason alone repeats the group's sentence above the bar; the fold is for telling several apart. -->
            <Disclosure v-if="row.causes.length > 1" size="xs" tone="secondary" class="mt-1">
              <template #summary>Wie es am Paragraphen steht</template>
              <ul class="mt-1 list-none space-y-1 pl-0 text-sm text-ink-secondary">
                <li v-for="c in row.causes" :key="c.cause" class="grid grid-cols-[3rem_1fr] gap-x-2">
                  <span class="text-right tabular-nums text-ink">{{ formatNumberDe(c.count) }}</span>
                  <span>{{ lesefassungCauseText(c.cause) }}</span>
                </li>
              </ul>
            </Disclosure>
          </div>
          <GenauigkeitMeter
            v-if="step.key === 'gezeigt'"
            class="mt-4"
            label="Gezeigt werden"
            :figure="figure(funnel.shown)"
            :part="funnel.shown"
            :whole="funnel.total"
          />
          <!-- Shown on the draft's own text, not confirmed by the annex (20.11.2026): said beside the figure, never folded into it unsaid. -->
          <p v-if="step.key === 'gezeigt' && funnel.witnessed" class="mt-2 text-sm text-ink-secondary">
            Davon {{ formatNumberDe(funnel.witnessed) }} nach dem Gesetzestext des Entwurfs, wo die Textgegenüberstellung anders lautet.
          </p>
        </div>
      </li>
    </ol>
    <figcaption class="mt-6 text-sm text-ink-secondary">
      Das Beispiel: {{ ex.para }} {{ ex.law }} im Entwurf {{ ex.draft.citation }}, {{ ex.draft.title }}.
    </figcaption>
    <SectionCredits :sources="sources" />
  </figure>
</template>
