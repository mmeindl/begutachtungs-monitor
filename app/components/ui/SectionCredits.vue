<script setup lang="ts">
/**
 * The credit line at the foot of a section: who published what it shows,
 * the links to those documents — and last, that the marking is ours.
 *
 * Why at the foot: a source statement stands below the table, not above it —
 * it is looked up while or after reading, never before. Since 18.09.2026 it
 * is the only thing down here: a legend for „redaktionell" stood beside it
 * briefly and is gone again — a term that reads the same on every page
 * belongs on the page that explains it, not under every comparison.
 *
 * No licence since 01.10.2026: the line names who published what it shows
 * („Quelle: RIS"; where it mixes publishers, „Quellen:" and each item names
 * its own), and what may be claimed about each source stands once, in the
 * Impressum, which the footer of every page links. The same claim under
 * every section was four wordings and up to five repetitions; one line in
 * one grammar is what a reader scans. The pattern is the data-journalism
 * caption — „Quelle: … · Grafik: …".
 *
 * „Markierung" is rendered by the component itself and always last: other
 * people's things first, our own after — and the sentence is the same in every
 * section because none of them writes it. It answers the question a
 * red/green marked ministry text raises: who did the marking? A section that
 * prints a text unmarked says `marked: false`.
 *
 * „Methode" closes the line since 02.10.2026, after the marking it explains —
 * where the caption convention puts it („Daten & Methodik"). It stood above
 * as „Wie wir vergleichen" and „Wie wir prüfen", once per section: the
 * licence's pattern again, one claim in several wordings. A section passes
 * its anchor on /so-funktionierts, the component writes the word.
 */
import { sourceLineDe, type SourceEntry } from '#shared/utils/provenance'

const props = withDefaults(defineProps<{
  sources: readonly SourceEntry[]
  marked?: boolean
  /** The section's anchor on the method page, e.g. `/so-funktionierts#vergleich`. */
  method?: string
}>(), { marked: true })

const line = computed(() => sourceLineDe(props.sources))
</script>

<template>
  <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
    <span v-if="line">{{ line }}</span>
    <slot />
    <span v-if="marked">Markierung: Begutachtungs-Monitor</span>
    <NuxtLink v-if="method" :to="method" class="text-accent-deep hover:underline">Methode</NuxtLink>
  </div>
</template>
