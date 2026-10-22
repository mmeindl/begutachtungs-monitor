<script setup lang="ts">
import type { BgblLaw } from '#shared/types'
import { citeLineDe } from '#shared/utils/citations'
import { formatDateDe } from '#shared/utils/format'

/**
 * The laws a Kundmachung changed, each at its geltende Fassung in RIS — the
 * value of „Geltende Fassung" in both BGBl sections, the law's
 * (`BgblStationSection`) and the Verordnung's (`RegulationBgblSection`),
 * 21.10.2026. A Sammelgesetz changes a hundred; past five the rest fold, as
 * „Geltendes Recht" on the draft does (`AmendedLawsFrame`).
 */
defineProps<{
  laws: BgblLaw[]
  /** What the list holds, in the plural („Gesetze", „Verordnungen") — the
   *  word the section's title counts in, so the fold names the same thing.
   *  No singular: the fold opens past five, never at one. */
  noun: string
}>()

const FOLD_AT = 5

/* „Umsatzsteuergesetz 1994, BGBl. Nr. 663/1994 idgF, <RIS>" — „idgF", in
 * der geltenden Fassung, because that is the version the link opens: today's.
 * „idF" this Kundmachung would turn wrong with the next Novelle, and which
 * one is newest the records this list is read from cannot say (they are
 * the ones THIS BGBl changed).
 *
 * Not for a law no longer in force (`inKraftBis`, 22.10.2026): it has no
 * geltende Fassung to name, so the citation is its Stammnorm alone. */
function citeOf(law: BgblLaw): string {
  const fassung = law.inKraftBis ? '' : ' idgF'
  return citeLineDe(law.title, law.stammnorm ? `${law.stammnorm}${fassung}` : null, law.url)
}
</script>

<template>
  <ul role="list" class="mt-1 space-y-1">
    <li v-for="law in laws.slice(0, FOLD_AT)" :key="law.gesetzesnummer" class="flex flex-wrap items-center gap-x-3 text-sm text-ink">
      <ExternalLink :href="law.url" class="link-inline">{{ law.title }}</ExternalLink>
      <span v-if="law.inKraftBis" class="text-ink-muted">in Kraft bis {{ formatDateDe(law.inKraftBis) }}</span>
      <CiteButton :text="citeOf(law)" :subject="law.title" />
    </li>
  </ul>
  <Disclosure v-if="laws.length > FOLD_AT" class="mt-2">
    <template #summary>
      <span class="group-open:hidden">Alle {{ laws.length }} {{ noun }} anzeigen</span>
      <span class="hidden group-open:inline">Weniger anzeigen</span>
    </template>
    <ul role="list" class="mt-1 space-y-1">
      <li v-for="law in laws.slice(FOLD_AT)" :key="law.gesetzesnummer" class="flex flex-wrap items-center gap-x-3 text-sm text-ink">
        <ExternalLink :href="law.url" class="link-inline">{{ law.title }}</ExternalLink>
        <span v-if="law.inKraftBis" class="text-ink-muted">in Kraft bis {{ formatDateDe(law.inKraftBis) }}</span>
        <CiteButton :text="citeOf(law)" :subject="law.title" />
      </li>
    </ul>
  </Disclosure>
</template>
