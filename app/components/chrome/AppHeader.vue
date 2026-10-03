<script setup lang="ts">
const route = useRoute()

// Four items and capped there — a nav that stays scannable is the IA.
const navItems = [
  { label: 'Aktuell', to: '/' },
  { label: 'Entwürfe', to: '/entwuerfe' },
  { label: "So funktioniert's", to: '/so-funktionierts' },
  { label: 'Über', to: '/ueber' },
] as const

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <header class="border-b border-hairline bg-surface">
    <!-- Marker rule: the identity color as a quiet signature across the
         viewport. Decorative (no contrast obligation). -->
    <div class="h-0.75 bg-mark" aria-hidden="true" />
    <div
      class="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-6"
    >
      <!-- Target size: 44px on touch, 36px with a mouse (main.css) -->
      <NuxtLink
        to="/"
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
             the header grew by a third. `gap-x-3` leaves 12 px to spare. -->
        <ul class="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-x-6">
          <li v-for="item in navItems" :key="item.to">
            <NuxtLink
              :to="item.to"
              :aria-current="isActive(item.to) ? 'page' : undefined"
              class="inline-flex min-h-target items-center rounded-sm text-sm transition-colors"
              :class="
                isActive(item.to)
                  ? 'font-medium text-ink underline decoration-ink decoration-2 underline-offset-8'
                  : 'text-ink-secondary hover:text-ink'
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
