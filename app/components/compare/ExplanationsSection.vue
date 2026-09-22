<script setup lang="ts">
/**
 * „Was das Ressort begründet" — the Erläuterungen's Allgemeiner Teil
 * (docs/architecture.md §12.29).
 *
 * WHY THIS SECTION EXISTS: a reader's relevance check starts here — skim the
 * Allgemeiner Teil (what is the law for?), then the Gesetzestext or the
 * Textgegenüberstellung. The page carried a PDF link and Parliament's
 * Kurzbeschreibung for that, and the two are no substitute for one another:
 * the Kurzbeschreibung is written for the parliamentary process, the
 * Erläuterungen are the Ressort's own reasoning — and a Verordnungsentwurf
 * has no Kurzbeschreibung at all, because it never reaches Parliament.
 *
 * WHAT IT IS NOT: no summary, no selection, no language model. What stands
 * here are the Ressort's paragraphs in the Ressort's order, read from the
 * typed RIS XML (`server/utils/explanations/risExplanations.ts`). The only
 * thing the monitor decides is where to fold — and where the structure was
 * inferred by us, the section says so (`labelled`).
 *
 * SERVER-SIDE WITH A DEADLINE, unlike the comparison sections: this text is
 * the page's substance and CC BY, so it belongs in the delivered HTML — but
 * only while RIS answers within 800 ms. Why the deadline and why not longer
 * stands in `useExplanations`.
 */

/**
 * Two routes to the same document, because the two kinds of draft reach it
 * differently: the Ministerialentwurf through the RIS↔ME join, a Begutachtung
 * without a Gegenstand straight through its RIS id.
 */
const props = defineProps<{ gp?: string; inr?: number; risId?: string }>()

const { data, status } = useExplanations(() => ({ gp: props.gp, inr: props.inr, risId: props.risId }))

/** One paragraph or subheading of the Ressort, in printing order. */
interface Item {
  kind: 'heading' | 'text'
  text: string
}

const items = computed<Item[]>(() =>
  (data.value?.passages ?? []).flatMap((p) => [
    ...(p.heading ? [{ kind: 'heading' as const, text: p.heading }] : []),
    ...p.text.map((t) => ({ kind: 'text' as const, text: t })),
  ]),
)

/**
 * Where the fold goes.
 *
 * The Allgemeiner Teil is a median 2.359 characters long, p90 7.727 and at
 * most 40.335 (`pnpm corpus:erlaeuterungen`, window from 2024) — a
 * distribution in which „show everything" makes the page unusable for half
 * the drafts and „always fold" puts a click in front of two paragraphs for
 * the other half.
 *
 * Hence a character budget rather than a paragraph count: one long paragraph
 * is capped like twenty short ones. And the budget is checked BEFORE a
 * paragraph is added, not after — otherwise exactly the long paragraph the
 * exercise was about slips in whole (132/ME: 3.000 characters in one run,
 * checked on the page).
 *
 * The first paragraph always stands, however long it is: a disclosure as the
 * first element would be the page hiding its own answer. A paragraph is never
 * cut mid-sentence — it is the Ressort's text, not ours.
 */
const BUDGET = 1400

const visibleCount = computed(() => {
  let spent = 0
  let shown = 0
  let paragraphs = 0
  for (const [i, item] of items.value.entries()) {
    if (paragraphs >= 1 && spent + item.text.length > BUDGET) break
    spent += item.text.length
    if (item.kind === 'text') paragraphs += 1
    shown = i + 1
  }
  // No dangling heading at the cut: it belongs to what stands below it, so
  // it moves into the disclosure with it.
  if (shown < items.value.length && items.value[shown - 1]?.kind === 'heading') shown -= 1
  return shown
})

const visible = computed(() => items.value.slice(0, visibleCount.value))
const folded = computed(() => items.value.slice(visibleCount.value))
const foldedParagraphs = computed(() => folded.value.filter((i) => i.kind === 'text').length)

/**
 * „Erläuterungen des Ressorts, Allgemeiner Teil" — the part that was read
 * from stands in the link, not in a second sentence. The colon is dropped:
 * Ressorts write their heading as „Allgemeiner Teil:", and in a list that is
 * one punctuation mark too many.
 */
const sourceLabel = computed(() => {
  const label = data.value?.document?.label ?? ''
  const heading = data.value?.heading?.replace(/\s*:\s*$/, '')
  return heading ? `${label}, ${heading}` : label
})

/**
 * „Wird geladen" covers a third state: the server missed its deadline and
 * delivered `null`, and the client is fetching it now (`useExplanations`).
 * That is no error and must not become one — otherwise the very HTML a
 * crawler sees would say „nicht verfügbar" above a section that is there a
 * second later.
 */
const loading = computed(() => status.value !== 'error' && !data.value)

/* The house link form (`link-inline` in `main.css`) plus the focus ring. */
const LINK =
  'link-inline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-deep'

/**
 * The screen-reader announcement once the section has been fetched — the same
 * mechanics as in the comparison: the region is empty when mounted and filled
 * afterwards, or some screen readers read it out at once.
 */
const loadAnnouncement = computed(() => {
  if (loading.value) return ''
  if (status.value === 'error' || !data.value) return 'Die Erläuterungen sind gerade nicht verfügbar.'
  if (!data.value.available) return data.value.unavailableReason ?? ''
  return 'Erläuterungen geladen.'
})
</script>

<template>
  <div class="mt-4">
    <p aria-live="polite" class="sr-only">{{ loadAnnouncement }}</p>

    <p v-if="loading" class="text-sm text-ink-muted">
      Die Erläuterungen werden geladen …
    </p>

    <p v-else-if="status === 'error' || !data" class="text-sm text-ink-secondary">
      Die Erläuterungen sind gerade nicht verfügbar.
    </p>

    <template v-else-if="!data.available">
      <p class="text-sm text-ink-secondary">{{ data.unavailableReason }}</p>
      <!-- What we cannot read, a human can: the document is linked even
           when nothing stands here. -->
      <p v-if="data.document" class="mt-3 text-xs text-ink-muted">
        <ExternalLink :href="data.document.url" class="text-accent-deep hover:underline">{{ data.document.label }}</ExternalLink>
      </p>
    </template>

    <template v-else>
      <!-- The caveat stands ABOVE the text, the source below it: one says how
           what follows is to be read, the other is a caption (the same rule
           as in the comparison section). -->
      <p v-if="!data.labelled" class="max-w-prose text-sm text-ink-muted">
        Das Ressort gliedert diese Erläuterungen nicht selbst.<template v-if="data.hasSpecial">
          Wo die Erläuterungen zu den einzelnen Paragraphen beginnen, haben wir
          abgegrenzt.</template>
      </p>

      <div :class="data.labelled ? '' : 'mt-3'">
        <template v-for="(item, i) in visible" :key="i">
          <h4 v-if="item.kind === 'heading'" class="mt-5 text-sm font-semibold text-ink first:mt-0">
            {{ item.text }}
          </h4>
          <p v-else class="mt-3 max-w-prose leading-relaxed text-ink-secondary first:mt-0">
            {{ item.text }}
          </p>
        </template>
      </div>

      <!-- A native <details> as for the Kurzbeschreibung and the comparison's
           context lines: usable without hydration, reachable by keyboard, and
           the browser's find-in-page opens it instead of running past it. -->
      <details v-if="folded.length" class="group mt-4 border-t border-hairline">
        <summary
          class="-mx-3 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded px-3 py-3 text-sm font-medium text-ink hover:bg-hairline/40 [&::-webkit-details-marker]:hidden"
        >
          <span class="group-open:hidden">Weiterlesen – noch {{ foldedParagraphs }} {{ foldedParagraphs === 1 ? 'Absatz' : 'Absätze' }}</span>
          <span class="hidden group-open:inline">Weniger anzeigen</span>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div class="pb-2">
          <template v-for="(item, i) in folded" :key="i">
            <h4 v-if="item.kind === 'heading'" class="mt-5 text-sm font-semibold text-ink">
              {{ item.text }}
            </h4>
            <p v-else class="mt-3 max-w-prose leading-relaxed text-ink-secondary">
              {{ item.text }}
            </p>
          </template>
        </div>
      </details>

      <!-- What deliberately does NOT stand here stands in the document:
           tables and figures (we do not print image file paths as sentences)
           and the Besonderer Teil, which belongs to the individual
           Paragraphen and not in a relevance check. Both are named, not
           passed over in silence.

           Since the Besonderer Teil's passages hang at the §§ of the
           Textgegenüberstellung (docs/architecture.md §12.30), „steht im
           Dokument selbst" is only half the information — and where the other
           half applies, it is the more expensive one: it sends the reader
           into a PDF while the place is two screens down on the same page.
           Whether it applies is decided by the server (`paragraphsAtAnnex`),
           not by the section below: a sentence that changes its claim once
           the comparison has loaded would be worse than one that is right
           from the start.

           THE POINTER TAKES NOTHING AWAY, it adds — „und vollständig im
           Dokument selbst" stands in both versions. That is the answer to the
           one draft in 110 where the annex exists and could not be read
           (measured 19.09.2026, §12.30; four with Parliament's copy read):
           the pointer then leads to a section that says itself what went
           wrong, and the sentence did not take the document away to send the
           reader there. The second half also carries information of its own:
           at the Paragraph stands what could be attributed to one, and 16,3 %
           of the passages find none (§12.30). -->
      <p v-if="data.dropped || data.hasSpecial" class="mt-4 max-w-prose text-sm text-ink-muted">
        <template v-if="data.dropped">
          Tabellen und Abbildungen des Dokuments stehen hier nicht.
        </template>
        <template v-if="data.hasSpecial">
          <template v-if="data.paragraphsAtAnnex">
            Die Erläuterungen zu den einzelnen Paragraphen stehen unten bei der
            <a href="#gegenueberstellung" :class="LINK">Gegenüberstellung</a>, an
            dem Paragraphen, um den es jeweils geht — und vollständig im
            Dokument selbst.
          </template>
          <template v-else>
            Die Erläuterungen zu den einzelnen Paragraphen stehen im Dokument selbst.
          </template>
        </template>
      </p>

      <p class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>Quelle (CC BY 4.0, RIS):</span>
        <ExternalLink
          v-if="data.document"
          :href="data.document.url"
          class="text-accent-deep hover:underline"
        >{{ sourceLabel }}</ExternalLink>
      </p>
    </template>
  </div>
</template>
