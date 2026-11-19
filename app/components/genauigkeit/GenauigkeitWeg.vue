<script setup lang="ts">
/**
 * One § on its way to a Lesefassung, step by step (`GENAUIGKEIT_WEG`), with
 * a real § as the page showed it (`WEG_BEISPIEL`) — the answer to „how does
 * the comparison work, and where can an error come in". Each step says who
 * supplies it and, under „Fehlerquelle", what can go wrong there and what
 * the monitor does then.
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
import { GENAUIGKEIT_WEG, WEG_BEISPIEL } from '#shared/utils/genauigkeit'
import { risSource } from '#shared/utils/provenance'

const steps = GENAUIGKEIT_WEG
const ex = WEG_BEISPIEL
const sources = [risSource('Geltender Text'), risSource('Entwurf'), risSource('Textgegenüberstellung')]
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
          <div class="mt-3 rounded-lg border border-hairline px-3 py-2.5 text-sm leading-relaxed">
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
                <dt class="text-ink-secondary">Links gedruckt, geltend</dt>
                <dd class="text-ink">{{ ex.annex.left }} – steht so im RIS.</dd>
              </div>
              <div>
                <dt class="text-ink-secondary">Rechts gedruckt, neu</dt>
                <dd class="text-ink">{{ ex.annex.right }} – steht so in unserem Ergebnis.</dd>
              </div>
            </dl>
            <p v-else class="text-ink">
              Bestätigt: Beim Entwurf {{ ex.draft.citation }} steht unter {{ ex.para }}
              „Ganzer Paragraph in der vorgeschlagenen Fassung (nicht amtlich)“.
              <NuxtLink :to="ex.draft.href" class="link-inline">Zum Entwurf</NuxtLink>
            </p>
          </div>

          <p v-if="step.risk" class="mt-2 text-sm text-ink-secondary">
            <span class="font-medium text-ink">Fehlerquelle:</span> {{ step.risk }}
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
