<script setup lang="ts">
/**
 * The Ressort in a detail page's byline, written out and linked into that
 * Ressort's own list — every Ressort gets a de-facto page for free, the
 * filtered list URL.
 *
 * Until 30.09.2026 the link was a chip in the meta row above the h1 showing
 * only the code, and the byline repeated the name as plain text, because the
 * chip's full name sat behind a hover a phone does not have. Two tokens a
 * line apart for one fact; the name now carries the link itself. The list
 * rows keep the bare code (`EntryItem`), where it is scanned, not read.
 *
 * `link-inline`, the site's one in-text link, as on „Auf parlament.gv.at
 * ansehen" beside it: what tells the two apart is the ↗ `ExternalLink`
 * draws, not a second link style. No `tap-target`: it is `inline-flex`, which
 * makes the name one unbreakable box that jumps to its own line instead of
 * wrapping with the sentence — and WCAG 2.5.8 exempts links in a sentence.
 *
 * It renders the whole phrase, „Vom A" or „Vom A und vom B", because the
 * byline is a sentence about who sent the draft, not a row of facts split
 * by „·". „vom" fits every Ressort: each is „das Bundesministerium …" or
 * „das Bundeskanzleramt". Two only on a jointly issued draft — three of
 * GP XXVII (`server/utils/parliament/draftList.ts`) — and each name is its
 * own link, because each leads to a different list.
 */
defineProps<{
  ministries: {
    code: string
    name: string
    /** The filtered list this name leads to — a different one per page. */
    to: string
    /** The link's accessible name; it contains the visible name (WCAG 2.5.3). */
    label: string
  }[]
}>()
</script>

<template>
  <span>
    <template v-for="(m, i) in ministries" :key="m.code">
      {{ i === 0 ? 'Vom' : ' und vom' }}
      <NuxtLink
        :to="m.to"
        :aria-label="m.label"
        :title="m.label"
        class="link-inline"
      >{{ m.name }}</NuxtLink>
    </template>
  </span>
</template>
