<template>
  <div class="flex min-h-screen flex-col">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-hairline focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
    >
      Zum Inhalt springen
    </a>
    <AppHeader />
    <!-- The layout owns page padding; pages only set their own max width. -->
    <main id="main" class="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>
