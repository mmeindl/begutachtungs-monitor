<script setup lang="ts">
/**
 * One real § on its way to the whole § in the proposed version, one line
 * per step (`GENAUIGKEIT_WEG`, `WEG_BEISPIEL`): what the monitor takes, what
 * it makes, and what it holds it against.
 *
 * SHORT SINCE 24.11.2026. Until then each step carried a sentence of its
 * own, the rule of the check in full, the example in a frame, and the §§
 * that end at the step as bars with their reasons — the answer to „how many
 * arrive" stood in pieces between the sentences. The counts are the funnel
 * now (`GenauigkeitTrichter`); the rule in full stands under „Im Einzelnen";
 * here only the example speaks.
 *
 * THE RAIL'S GEOMETRY, NOT ITS STATES. Dots and line as in `SpineRail`, so a
 * reader who knows a draft's page reads it as steps in order; a method has
 * no „reached" and no „now", so every dot is the same hollow ink ring. An
 * <ol>, so the order is the markup's too. The example's marking is
 * `DiffText`, the comparison's own.
 */
import { GENAUIGKEIT_WEG, WEG_BEISPIEL } from '#shared/utils/genauigkeit'
import { risSource } from '#shared/utils/provenance'

const steps = GENAUIGKEIT_WEG
const ex = WEG_BEISPIEL
/** The standing wording around the change, as the result shows it without the new figure. */
const standing = ex.result.filter((s) => s.type !== 'inserted').map((s) => s.text).join(' ')
const sources = [risSource('Geltender Text'), risSource('Entwurf'), risSource('Textgegenüberstellung')]
</script>

<template>
  <figure class="mt-4">
    <figcaption class="text-sm text-ink-secondary">
      Am Beispiel: {{ ex.para }} {{ ex.law }} im Entwurf {{ ex.draft.citation }}
    </figcaption>
    <ol class="isolate mt-3 flex list-none flex-col gap-4 pl-0" aria-label="Die Schritte vom geltenden Text zum ganzen Paragraphen">
      <li v-for="(step, i) in steps" :key="step.key" class="relative flex gap-3">
        <!-- From this dot's lower edge to the next one's upper edge, across the gap-4. -->
        <span
          aria-hidden="true"
          class="pointer-events-none absolute -bottom-5.5 left-1.25 top-4.5 z-10 w-0.5 bg-ink"
        />
        <span aria-hidden="true" class="pointer-events-none relative z-10 mt-1.5 box-border size-3 shrink-0 rounded-full border-2 border-ink bg-surface" />
        <div class="min-w-0 flex-1 sm:grid sm:grid-cols-[13rem_1fr] sm:gap-x-4">
          <h4 class="text-sm font-semibold text-ink">
            {{ i + 1 }}. {{ step.title }}
            <span class="block font-normal text-ink-secondary">{{ step.who }}</span>
          </h4>
          <div class="mt-1 text-sm leading-relaxed text-ink sm:mt-0">
            <p v-if="step.key === 'geltend'">{{ standing }}</p>
            <p v-else-if="step.key === 'anweisung'">{{ ex.instruction }}</p>
            <p v-else-if="step.key === 'ergebnis'"><DiffText :segments="ex.result" /></p>
            <template v-else>
              <p>Links {{ ex.annex.left }} – steht so im RIS.</p>
              <p>Rechts {{ ex.annex.right }} – steht so in unserem Ergebnis.</p>
            </template>
          </div>
        </div>
      </li>
      <li class="relative flex gap-3">
        <span aria-hidden="true" class="pointer-events-none relative z-10 mt-1.5 box-border size-3 shrink-0 rounded-full border-2 border-ink bg-surface" />
        <p class="min-w-0 flex-1 text-sm font-semibold text-ink">
          Bestanden: Der Monitor zeigt den ganzen Paragraphen.
          <NuxtLink :to="ex.draft.href" class="link-inline font-normal">Zum Entwurf</NuxtLink>
        </p>
      </li>
    </ol>
    <SectionCredits :sources="sources" />
  </figure>
</template>
