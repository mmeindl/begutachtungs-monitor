<script setup lang="ts">
const route = useRoute()

const navItems = [
  { label: 'Aktuell', to: '/' },
  { label: 'Begutachtungen', to: '/begutachtungen' },
  { label: 'Über', to: '/ueber' },
] as const

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <header class="border-b border-hairline bg-surface">
    <div
      class="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-6"
    >
      <!-- min-h-11 = 44px AAA target size (WCAG 2.5.5) -->
      <NuxtLink
        to="/"
        class="inline-flex min-h-11 items-center rounded-sm font-semibold text-ink"
      >
        Begutachtungs-Monitor
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
