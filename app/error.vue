<script setup lang="ts">
import type { NuxtError } from '#app'
import { NOT_FOLLOWED_DE, notFollowedOf } from '~/utils/notFollowed'

const props = defineProps<{ error: NuxtError }>()

const is404 = computed(() => props.error?.statusCode === 404)
/* 410 since 22.10.2026: a Land's draft the Land no longer publishes (Wien
   keeps one a year). The page existed; the message says why it is gone. */
const isGone = computed(() => props.error?.statusCode === 410)
const missing = computed(() => is404.value || isGone.value)
/* 404 since 14.11.2026 also for an item Parliament has and the monitor does
   not follow (`notFollowedOf`): the page says so and links the item, never
   that it does not exist. */
const notFollowed = computed(() => (is404.value ? notFollowedOf(props.error) : null))

const title = computed(() =>
  isGone.value
    ? 'Nicht mehr verfügbar'
    : notFollowed.value
      ? NOT_FOLLOWED_DE.title
      : is404.value ? 'Seite nicht gefunden' : 'Etwas ist schiefgelaufen',
)

const description = computed(() =>
  isGone.value
    ? ((props.error?.data as { reason?: string } | undefined)?.reason || 'Diese Seite gibt es nicht mehr.')
    : notFollowed.value
      ? NOT_FOLLOWED_DE.text
      : is404.value
        ? 'Die angeforderte Seite existiert nicht oder wurde verschoben.'
        : 'Beim Laden dieser Seite ist ein Fehler aufgetreten.',
)

useSeoMeta({ title })
// error.vue replaces app.vue, and with it the title template.
useHead({ titleTemplate: '%s · Begutachtungs-Monitor' })

function goHome() {
  clearError({ redirect: '/' })
}

function retry() {
  // force: bypasses the 10s guard against reload loops — a human clicks here
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
      <p v-if="notFollowed?.parliamentUrl" class="mt-3 text-sm">
        <ExternalLink :href="notFollowed.parliamentUrl" class="link-inline">{{ NOT_FOLLOWED_DE.link }}</ExternalLink>
      </p>
      <div class="mt-6 flex flex-wrap justify-center gap-2">
        <!-- No reload on a 404 or 410: the page is missing, not merely failing to load -->
        <UButton v-if="!missing" color="primary" @click="retry">Erneut versuchen</UButton>
        <UButton :color="missing ? 'primary' : 'neutral'" :variant="missing ? 'solid' : 'outline'" @click="goHome">
          Zur Startseite
        </UButton>
      </div>
    </div>
  </div>
</template>
