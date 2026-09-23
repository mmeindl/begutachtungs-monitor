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
  /**
   * The ressorts that sent this draft, lead first — empty where RIS names
   * none. A LIST since 23.09.2026: three Ministerialentwürfe of GP XXVII
   * were sent by two ministries jointly, and the header named whichever of
   * them upstream had returned first. Each gets its own badge, because each
   * badge is a link into that Ressort's own list — one chip naming both
   * could only lead to one of the two.
   */
  ministries: {
    code: string
    name: string
    /** The filtered list this badge leads to — a different one per page. */
    to: string
    /** The badge's accessible name, which says which list that is. */
    label: string
  }[]
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
        v-for="m in ministries"
        :key="m.code"
        :to="m.to"
        :aria-label="m.label"
        class="tap-target rounded"
      >
        <MinistryBadge
          :code="m.code"
          :name="m.name"
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
