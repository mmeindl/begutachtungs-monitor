<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const is404 = computed(() => props.error?.statusCode === 404)

const title = computed(() =>
  is404.value ? 'Seite nicht gefunden' : 'Etwas ist schiefgelaufen',
)

const description = computed(() =>
  is404.value
    ? 'Die angeforderte Seite existiert nicht oder wurde verschoben.'
    : 'Beim Laden dieser Seite ist ein Fehler aufgetreten.',
)

useSeoMeta({ title })

function goHome() {
  clearError({ redirect: '/' })
}

function retry() {
  // force: umgeht die 10s-Sperre gegen Reload-Schleifen – hier klickt ein Mensch
  reloadNuxtApp({ force: true })
}
</script>

<template>
  <!-- error.vue renders outside NuxtLayout — minimal standalone shell -->
  <div class="flex min-h-screen items-center justify-center bg-page px-4">
    <div
      class="w-full max-w-md rounded-xl border border-hairline bg-surface p-8 text-center shadow-sm"
    >
      <p class="text-sm font-medium text-ink-muted">
        {{ error?.statusCode ?? 'Fehler' }}
      </p>
      <h1 class="mt-2 text-2xl font-semibold text-ink">{{ title }}</h1>
      <p class="mt-3 text-sm leading-relaxed text-ink-secondary">
        {{ description }}
      </p>
      <div class="mt-6 flex flex-wrap justify-center gap-2">
        <!-- Kein Reload bei 404: die Seite fehlt, sie lädt nicht bloß nicht -->
        <UButton v-if="!is404" color="primary" @click="retry">Erneut versuchen</UButton>
        <UButton :color="is404 ? 'primary' : 'neutral'" :variant="is404 ? 'solid' : 'outline'" @click="goHome">
          Zur Startseite
        </UButton>
      </div>
    </div>
  </div>
</template>
