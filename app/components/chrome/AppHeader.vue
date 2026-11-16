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
             (headless Chrome, the system font, the widest active label). -->
        <ul class="flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-6">
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
        </ul>
      </nav>
    </div>
  </header>
</template>
