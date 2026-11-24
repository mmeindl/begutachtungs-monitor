<script setup lang="ts">
/**
 * How many changed §§ the monitor writes out whole, as a funnel (24.11.2026):
 * at each step the share still on its way, and under it what ends there and
 * why. Until then the counts stood at the steps of the example, between its
 * sentences, as one bar each for what ended — the reader had to add them up
 * to see how many arrive. Now the bars shrink from step to step, and the
 * last one is the figure at the page's top.
 *
 * Each bar draws three things on one track: ink for what goes on, the
 * dashed outline of „nicht gezeigt" for what ends at this step, and the bare
 * track for what ended before. Ink and dashed part meet in a straight
 * vertical cut, rounded only at the bar's two ends. Every share is printed; the bars are hidden
 * from screen readers. The causes behind a step, as a reader meets them on a
 * draft's page, are folded under the funnel.
 */
import { formatNumberDe } from '#shared/utils/format'
import { FUNNEL_GROUP_DE, type WegFunnel, partDe, tenthsDe } from '#shared/utils/genauigkeit'
import { lesefassungCauseText } from '~/utils/lesefassung'

const props = defineProps<{
  funnel: WegFunnel
  /** The Ministerialentwürfe counted. */
  drafts: number
}>()

const pct = (tenths: number) => `${tenthsDe(tenths)}\u00a0%`
const width = (tenths: number) => `${tenths / 10}%`
const rows = computed(() => props.funnel.stufen.filter((s) => s.row))
</script>

<template>
  <figure class="mt-4">
    <ol class="list-none space-y-5 pl-0">
      <li v-for="s in funnel.stufen" :key="s.key">
        <div class="flex items-baseline justify-between gap-4 text-sm">
          <span class="font-medium text-ink">{{ s.label }}</span>
          <span class="shrink-0 font-semibold tabular-nums text-ink">{{ pct(s.remainingTenths) }}</span>
        </div>
        <div class="relative mt-1.5 h-2.5 rounded-full bg-hairline" aria-hidden="true">
          <!-- Where the two meet, a straight cut (maintainer, 24.11.2026): one
               whole split in two, not two bars end to end. The ink's square
               edge is the line, so the dashed part has no left side. -->
          <div
            class="absolute inset-y-0 left-0 bg-ink"
            :class="s.droppedTenths > 0 ? 'rounded-l-full' : 'rounded-full'"
            :style="{ width: width(s.remainingTenths) }"
          />
          <div
            v-if="s.droppedTenths > 0"
            class="absolute inset-y-0 box-border rounded-r-full border-[1.5px] border-l-0 border-dashed border-ink-muted bg-page"
            :style="{ left: width(s.remainingTenths), width: width(s.droppedTenths) }"
          />
        </div>
        <p v-if="s.dropped" class="mt-1.5 text-sm text-ink-secondary">
          <span class="tabular-nums text-ink">{{ s.droppedTenths === 0 ? 'Unter 0,1' : tenthsDe(s.droppedTenths) }}&nbsp;%</span>
          werden hier nicht ganz ausgeschrieben. {{ s.why }}
        </p>
      </li>
    </ol>
    <!-- Shown on the draft's own text, not confirmed by the annex (20.11.2026): said beside the figure, never folded into it unsaid. -->
    <p v-if="funnel.witnessed" class="mt-3 text-sm text-ink-secondary">
      In den {{ pct(funnel.stufen.at(-1)!.remainingTenths) }} enthalten sind {{ partDe(funnel.witnessed, funnel.total) }}&nbsp;%, bei denen die
      Textgegenüberstellung anders lautet: Der Monitor hat den Entwurf ein zweites Mal gelesen, aus seinem PDF, und am
      Paragraphen stehen beide Wortlaute.
    </p>
    <Disclosure size="sm" tone="secondary" class="mt-3">
      <template #summary>Wie es am Paragraphen steht</template>
      <!-- The whole the shares are of (24.11.2026): /datenlage cites it as this page's figure. -->
      <p class="mt-1 text-sm text-ink">
        Gezählt sind {{ formatNumberDe(funnel.total) }} geänderte Paragraphen in
        {{ formatNumberDe(drafts) }} Ministerialentwürfen, {{ formatNumberDe(funnel.shown) }} davon ganz gezeigt.
      </p>
      <dl class="mt-3 space-y-3 text-sm">
        <div v-for="s in rows" :key="s.key">
          <dt class="font-medium text-ink">{{ FUNNEL_GROUP_DE[s.key] }}: {{ formatNumberDe(s.dropped) }} Paragraphen</dt>
          <dd class="mt-1">
            <ul class="list-none space-y-1 pl-0 text-ink-secondary">
              <li v-for="c in s.row!.causes" :key="c.cause" class="grid grid-cols-[3rem_1fr] gap-x-2">
                <span class="text-right tabular-nums text-ink">{{ formatNumberDe(c.count) }}</span>
                <span>{{ lesefassungCauseText(c.cause) }}</span>
              </li>
            </ul>
          </dd>
        </div>
      </dl>
    </Disclosure>
  </figure>
</template>
