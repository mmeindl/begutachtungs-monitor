<script setup lang="ts">
// Used only in the template: imported explicitly (a template-only helper is not auto-imported at runtime).
import { ANLIEGEN_PATH } from '#shared/utils/anliegen'

const route = useRoute()

// Five items and capped there — a nav that stays scannable is the IA. Four
// until 14.11.2026: EU-Recht joined because it is the product's second list
// (the same drafts by the act they implement) and the first layer of what
// the monitor follows, EU → Bund → Länder; it was reachable only from the
// homepage's last section, which is gone while no map is built.
//
// „Anliegen" for „Aktuell" since 16.11.2026: the homepage opens with the
// ways of taking part, and the wordmark is its one way in, as on most
// sites; the Anliegen an das Parlament, a second object with a list of its
// own, had no label and were reached from the homepage, `/wege` and the
// footer. In the order of the objects: drafts, Anliegen, EU law; then the
// ways and the project.
const navItems = [
  { label: 'Entwürfe', to: '/entwuerfe' },
  { label: 'Anliegen', to: ANLIEGEN_PATH },
  { label: 'EU-Recht', to: '/eu-recht' },
  { label: 'Wege', to: '/wege' },
  { label: 'Über', to: '/ueber' },
] as const

/*
 * The site search (`/suche`, 17.11.2026), from every page: most readers
 * arrive on an item's page from a feed or a search engine and never see the
 * homepage's field. A link to the page, not a field in the header — the
 * page has the form, the source chips and the room for its answers. Not a
 * sixth nav item on a phone: the row has 9.7 px to spare at 320 px (below),
 * so there it is a magnifier at the end of the wordmark's row, with its
 * name for screen readers — the row's left corner stays the wordmark's, the
 * way home. The wordmark measured 238.2 px of the 288 px row at 320 px
 * (17.11.2026): with the 44 px target the gap is `gap-1`, 1.8 px to spare;
 * a wider system serif wraps the wordmark, it never overflows. From `sm`
 * it is the nav's LAST item, the word alone like the other labels
 * (18.11.2026; until then the first item, with a magnifier before the
 * word): the top right is where readers look for a search, and the word
 * needs no symbol beside it. Only one of the two is ever displayed.
 */
const SEARCH = { label: 'Suche', to: '/suche' } as const

/* A label is current on its page and every page below it (`/anliegen/…`). */
function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <header class="border-b border-hairline bg-surface">
    <!-- Marker rule: the identity color as a quiet signature across the
         viewport. Decorative (no contrast obligation). -->
    <div class="h-0.75 bg-mark" aria-hidden="true" />
    <div
      class="page-frame flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2"
    >
      <!-- Target size: 44px on touch, 36px with a mouse (main.css) -->
      <!-- The start page's one way in since „Aktuell" left the nav
           (16.11.2026), so its name says where it leads; `aria-current` on
           the start page, like a nav label on its own. -->
      <!-- The wordmark's row: on a phone the whole width, with the search's
           magnifier at its end; from `sm` the wordmark alone. -->
      <div class="flex w-full items-center justify-between gap-1 sm:w-auto">
        <NuxtLink
          to="/"
          aria-label="Begutachtungs-Monitor, zur Startseite"
          :aria-current="route.path === '/' ? 'page' : undefined"
          class="inline-flex min-h-target items-center gap-2 rounded-sm font-semibold text-ink"
        >
          <!-- § on the marker tile — same mark as favicon and og:image.
             Decorative next to the wordmark, hence aria-hidden. -->
          <span
            aria-hidden="true"
            class="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-mark font-heading text-[15px] font-semibold text-ink"
          >§</span>
          <span class="font-heading text-lg">Begutachtungs-Monitor</span>
        </NuxtLink>
        <!-- No line under the icon alone (17.11.2026): an underline marks
             a word, and under a lone symbol it reads as a stray stroke. The
             current page and the hover are the ink, as the labels' text;
             `aria-current` says it to a screen reader. -->
        <NuxtLink
          :to="SEARCH.to"
          :aria-label="SEARCH.label"
          :aria-current="isActive(SEARCH.to) ? 'page' : undefined"
          class="inline-flex min-h-target min-w-11 items-center justify-center transition-colors sm:hidden"
          :class="isActive(SEARCH.to) ? 'text-ink' : 'text-ink-secondary hover:text-ink'"
        >
          <UIcon name="i-lucide-search" class="size-5" aria-hidden="true" />
        </NuxtLink>
      </div>
      <nav aria-label="Hauptnavigation">
        <!-- Wraps rather than scrolls the page: a nav item is not worth a
             horizontal scrollbar on the whole document. But it should not
             have to: the four labels measure 240 px (30.09.2026), and with
             `gap-x-4` that was 288 px against a 287.95 px column — „Über"
             fell onto a line of its own at 320 px by a rounding error, and
             the header grew by a third. `gap-x-3` leaves 12 px to spare.
             Five labels since 14.11.2026 („Wege" for „So funktioniert's",
             plus „EU-Recht"): measured at a 320 px viewport on 15.11.2026,
             the five links take 282.6 px of the 288 px column, on one
             line, 5.4 px to spare. A sixth label will not fit.
             „Anliegen" for „Aktuell" (16.11.2026) is 11.8 px wider: with
             `gap-x-3` the row measured 294.3 px and „Über" wrapped, so the
             gap below `sm` is `gap-x-2` — 278.3 px, 9.7 px to spare
             (headless Chrome, the system font, the widest active label).
             More air from 360 px (17.11.2026): the labels take 246.3 px,
             so `gap-x-4` needs a 310.3 px column — a 342 px viewport;
             from 360 px, where nearly every phone starts, it stands with
             17.7 px to spare. Only the 320 px phone keeps `gap-x-2`. -->
        <ul class="flex flex-wrap items-center gap-x-2 gap-y-1 min-[360px]:gap-x-4 sm:gap-x-6">
          <li v-for="item in navItems" :key="item.to">
            <!-- Hover is the site's one hover state, the 2 px underline
                 (16.11.2026): the step from secondary ink to ink alone was
                 not visible. At the active label's offset, in the secondary
                 ink, so the current page — ink text, ink line — still
                 reads as the stronger of the two.
                 The current label is NOT heavier (16.11.2026; `font-medium`
                 until then): a heavier word is a wider word, so the labels
                 after it moved on every page change. Reserving the width for
                 all five would cost the few pixels the row has to spare at
                 320 px (see above). Colour and line carry it. -->
            <NuxtLink
              :to="item.to"
              :aria-current="isActive(item.to) ? 'page' : undefined"
              class="inline-flex min-h-target items-center rounded-sm text-sm transition-colors"
              :class="
                isActive(item.to)
                  ? 'text-ink underline decoration-ink decoration-2 underline-offset-8'
                  : 'text-ink-secondary underline-offset-8 hover:text-ink hover:underline hover:decoration-ink-secondary hover:decoration-2'
              "
            >
              {{ item.label }}
            </NuxtLink>
          </li>
          <li class="hidden sm:block">
            <NuxtLink
              :to="SEARCH.to"
              :aria-current="isActive(SEARCH.to) ? 'page' : undefined"
              class="inline-flex min-h-target items-center rounded-sm text-sm transition-colors"
              :class="
                isActive(SEARCH.to)
                  ? 'text-ink underline decoration-ink decoration-2 underline-offset-8'
                  : 'text-ink-secondary underline-offset-8 hover:text-ink hover:underline hover:decoration-ink-secondary hover:decoration-2'
              "
            >
              {{ SEARCH.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>
    </div>
  </header>
</template>
