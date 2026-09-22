<script setup lang="ts">
/**
 * The top of a detail page: one meta row carrying identity, ressort and
 * urgency, then the title. Both detail pages have this anatomy.
 *
 * `#identity` is where they differ and why it is a slot: a Ministerialentwurf
 * leads with its Geschäftszahl („Ministerialentwurf 132/ME"), a RIS record
 * has none and leads with the type word, which is what identifies it to a
 * reader.
 *
 * Everything BELOW the h1 stays with the page, in the default slot. The two
 * carry different subtitles — one the Sammeltitel, the other the long Titel,
 * set differently — and a different provenance line, pointing at a different
 * document in a different link style. A shell for that would be four more
 * exclusive slots, which is the shape this page anatomy was explicitly not
 * to grow (refactor-plan.md §4.3).
 */
defineProps<{
  /** Ressort short code; '' where RIS names none. No Ministerialentwurf has one. */
  ministryCode: string
  ministryName: string
  /** The filtered list the badge leads to — a different one per page. */
  ministryTo: string
  /** The badge's accessible name, which says which list that is. */
  ministryLabel: string
  /** ISO date, or null where upstream has none. */
  deadline: string | null
  active: boolean
  title: string
}>()
</script>

<template>
  <header>
    <div class="flex flex-wrap items-center gap-2">
      <slot name="identity" />
      <!-- Every Ressort gets a de-facto page for free: the filtered list
           URL. Only here — cards are themselves links. -->
      <NuxtLink
        v-if="ministryCode"
        :to="ministryTo"
        :aria-label="ministryLabel"
        class="tap-target rounded"
      >
        <MinistryBadge
          :code="ministryCode"
          :name="ministryName"
          class="transition-colors hover:border-baseline hover:underline"
        />
      </NuxtLink>
      <!-- Only while it runs: the badge exists to carry urgency (tone +
           "Noch 3 Tage"). Closed, it degrades to "Frist endete am …" — which
           the card below states, better. -->
      <DeadlineBadge
        v-if="active"
        :deadline="deadline"
        :active="active"
      />
    </div>
    <!-- German compounds: "Elektrizitätswirtschaftsgesetz" at text-2xl is
         wider than a 320px viewport's content box, so the title hyphenates
         (lang="de-AT" is set) and breaks as a last resort rather than
         scrolling the page sideways. -->
    <h1
      class="mt-3 text-2xl font-semibold text-ink hyphens-auto break-words sm:text-3xl"
    >
      {{ title }}
    </h1>
    <slot />
  </header>
</template>
