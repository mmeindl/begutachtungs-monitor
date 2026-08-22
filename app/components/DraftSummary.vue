<script setup lang="ts">
import type { DescriptionBlock } from '#shared/types'

/**
 * Kurzinformation of a Ministerialentwurf, grouped into its own sections.
 *
 * Folded sections use a native <details> rather than a scripted toggle: no
 * hydration needed, keyboard accessible as-is, find-in-page reveals it in
 * Chrome and Safari, and the text stays in the SSR HTML for crawlers.
 */

const props = defineProps<{
  blocks: DescriptionBlock[]
}>()

/**
 * How many sections stay expanded. Ziel/Inhalt answer "does this draft concern
 * me" — the narrative behind them (usually "Hauptgesichtspunkte des Entwurfs",
 * a median 6× longer than Ziel+Inhalt together) only matters once the answer is
 * yes, and unfolded it pushes the Frist, the documents and the outcome below
 * the fold.
 */
const OPEN_SECTIONS = 2

interface Section {
  heading: string | null
  blocks: DescriptionBlock[]
  collapsed: boolean
}

/**
 * Flat blocks → sections, starting a new one at every heading; anything before
 * the first heading becomes an unlabelled lead section.
 *
 * Grouped by HEADING, deliberately NOT by the upstream teil1/teil2 split:
 * 32/ME carries its Inhalt list in teil2, so folding teil2 wholesale would put
 * the most useful block on the page behind a "Hauptgesichtspunkte" toggle.
 * Drafts whose shortinfo carries no heading at all (13/ME) stay fully expanded
 * — there is no honest label to fold them under.
 */
const sections = computed<Section[]>(() => {
  const out: Section[] = []
  let headed = 0
  for (const block of props.blocks) {
    if (block.kind === 'heading') {
      headed += 1
      out.push({ heading: block.text, blocks: [], collapsed: headed > OPEN_SECTIONS })
      continue
    }
    if (!out.length) out.push({ heading: null, blocks: [], collapsed: false })
    out[out.length - 1]!.blocks.push(block)
  }
  return out
})
</script>

<template>
  <div>
    <component
      :is="section.collapsed ? 'details' : 'div'"
      v-for="(section, s) in sections"
      :key="s"
      :class="['mt-5 first:mt-0', section.collapsed ? 'border-t border-hairline' : '']"
    >
      <summary
        v-if="section.collapsed"
        class="cursor-pointer rounded py-3 text-sm font-semibold text-ink marker:text-ink-muted"
      >
        {{ section.heading }}
      </summary>
      <h3 v-else-if="section.heading" class="text-sm font-semibold text-ink">
        {{ section.heading }}
      </h3>

      <template v-for="(block, i) in section.blocks" :key="i">
        <ul
          v-if="block.kind === 'list'"
          class="mt-3 list-disc space-y-2 pl-5 marker:text-ink-muted first:mt-0"
        >
          <li
            v-for="(item, j) in block.items"
            :key="j"
            class="leading-relaxed text-ink-secondary"
          >
            {{ item }}
          </li>
        </ul>
        <p v-else class="mt-3 leading-relaxed text-ink-secondary first:mt-0">
          {{ block.text }}
        </p>
      </template>
    </component>
  </div>
</template>
