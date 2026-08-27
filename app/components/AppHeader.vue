<script setup lang="ts">
const route = useRoute()

// Four items and capped there — a nav that stays scannable is the IA.
const navItems = [
  { label: 'Aktuell', to: '/' },
  { label: 'Begutachtungen', to: '/begutachtungen' },
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
      <!-- min-h-11 = 44px AAA target size (WCAG 2.5.5) -->
      <NuxtLink
        to="/"
        class="inline-flex min-h-11 items-center gap-2 rounded-sm font-semibold text-ink"
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
        <ul class="flex items-center gap-4 sm:gap-6">
          <li v-for="item in navItems" :key="item.to">
            <NuxtLink
              :to="item.to"
              :aria-current="isActive(item.to) ? 'page' : undefined"
              class="inline-flex min-h-11 items-center rounded-sm text-sm transition-colors"
              :class="
                isActive(item.to)
                  ? 'font-medium text-ink underline decoration-accent decoration-2 underline-offset-8'
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
