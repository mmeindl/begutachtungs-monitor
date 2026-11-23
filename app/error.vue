<script setup lang="ts">
import type { NuxtError } from '#app'
import { de } from '@nuxt/ui/locale'
import { NOT_FOLLOWED_DE, notFollowedOf, notFollowedVolksbegehrenDe } from '~/utils/notFollowed'
import { PAUSE_LINES_404_DE, pauseLineFor } from '~/utils/pauseLines'

const props = defineProps<{ error: NuxtError }>()
const route = useRoute()

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

/* The sentence under the title. On the plain 404 it is the pause line
   (`pauseLines.ts`, maintainer, 23.11.2026): the title says what happened,
   and „Die angeforderte Seite existiert nicht oder wurde verschoben" said
   it again. Only there: a 410 and a refusal carry information about an
   item (why it is gone, where Parliament has it), and a failure is no
   moment for an aside. The line is chosen by the path, which server and
   browser share. */
const description = computed(() =>
  isGone.value
    ? ((props.error?.data as { reason?: string } | undefined)?.reason || 'Diese Seite gibt es nicht mehr.')
    : notFollowed.value
      ? (notFollowed.value.anliegenFrom ? notFollowedVolksbegehrenDe(notFollowed.value.anliegenFrom) : NOT_FOLLOWED_DE.text)
      : is404.value
        ? (pauseLineFor(PAUSE_LINES_404_DE, route.path) ?? 'Diese Seite gibt es nicht.')
        : 'Beim Laden dieser Seite ist ein Fehler aufgetreten.',
)

useSeoMeta({ title })
// error.vue replaces app.vue, and with it the title template.
useHead({ titleTemplate: '%s · Begutachtungs-Monitor' })

function goHome() {
  clearError({ redirect: '/' })
}

function goAnliegen() {
  clearError({ redirect: NOT_FOLLOWED_DE.anliegenLink.href })
}

function retry() {
  // force: bypasses the 10s guard against reload loops — a human clicks here
  reloadNuxtApp({ force: true })
}
</script>

<template>
  <!-- A missing page (404, 410, a refusal) keeps the site around it
       (23.11.2026): the header with its lists and the search, the footer,
       and the column and title of every other page. error.vue replaces
       app.vue, so it builds the same shell. Until then a card stood alone
       on an empty page, and the only way on was the start page. Header and
       footer fetch nothing, and the router clears the error when a link is
       followed. -->
  <UApp v-if="missing" :locale="de">
    <NuxtLoadingIndicator color="var(--color-ink)" :height="2" />
    <NuxtLayout>
      <div class="mx-auto w-full max-w-2xl">
        <p class="text-sm font-medium text-ink-muted">{{ error?.statusCode }}</p>
        <h1 class="page-title mt-1">{{ title }}</h1>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          {{ description }}
        </p>
        <p v-if="notFollowed?.parliamentUrl" class="mt-3">
          <ExternalLink :href="notFollowed.parliamentUrl" class="link-inline">{{ NOT_FOLLOWED_DE.link }}</ExternalLink>
        </p>
        <!-- An Anliegen of a period the monitor does not follow (a Volksbegehren
             before GP XXII): the section where it follows the later ones. A
             plain link with `clearError`, which leaves the error state at
             once. -->
        <p v-if="notFollowed?.anliegenFrom" class="mt-2">
          <a :href="NOT_FOLLOWED_DE.anliegenLink.href" class="link-inline" @click.prevent="goAnliegen">{{ NOT_FOLLOWED_DE.anliegenLink.label }}</a>
        </p>
        <!-- No reload on a 404 or 410: the page is missing, not merely failing to load -->
        <div class="mt-6">
          <UButton color="primary" @click="goHome">Zur Startseite</UButton>
        </div>
      </div>
    </NuxtLayout>
  </UApp>
  <!-- A failure stands alone: the layout may be what failed, so this page
       depends on nothing but itself. -->
  <div v-else class="flex min-h-screen items-center justify-center bg-page px-4">
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
        <UButton color="primary" @click="retry">Erneut versuchen</UButton>
        <UButton color="neutral" variant="outline" @click="goHome">
          Zur Startseite
        </UButton>
      </div>
    </div>
  </div>
</template>
