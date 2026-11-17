<script setup lang="ts">
/**
 * The site search (17.11.2026): one field for every list, an answer per
 * list (`app/utils/siteSearch.ts` holds the rule and the words).
 *
 * `/suche` was a page from 19. to 22.09.2026 and then a 301 onto
 * `/entwuerfe`: while the drafts were the only list, a second address for
 * their search answered one question twice. With the Anliegen and the EU's
 * lists beside them the homepage's field reached one list in three, and the
 * argument turned: the question „where does this come up?" has its own
 * address again, and each list keeps its own search.
 *
 * A plain GET form, so it works before hydration; with JavaScript the
 * submit is a client-side navigation. The term lives in the address (`?q=`)
 * — the page can be shared and Back returns to it — and is not indexed:
 * result pages of a search are no content of their own.
 */
import { SOURCE_PARAM } from '#shared/utils/laender'
import { MAX_LIST_QUERY_CHARS, firstQueryValue } from '#shared/utils/queryParams'
import { SEARCH_DE } from '~/utils/siteSearch'

const route = useRoute()

const query = computed(() => (firstQueryValue(route.query.q) ?? '').slice(0, MAX_LIST_QUERY_CHARS).trim())
const quellen = computed(() => firstQueryValue(route.query[SOURCE_PARAM]))
const term = ref(query.value)
watch(query, (q) => { term.value = q })

function submit() {
  const q = term.value.trim()
  return navigateTo({ path: '/suche', query: { ...(q ? { q } : {}), ...(quellen.value ? { [SOURCE_PARAM]: quellen.value } : {}) } })
}

usePageSeo({
  title: () => (query.value ? `${SEARCH_DE.title}: „${query.value}“` : SEARCH_DE.title),
  description: SEARCH_DE.lede,
})
useSeoMeta({ robots: () => (query.value ? 'noindex' : undefined) })
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <header>
      <h1 class="page-title">{{ SEARCH_DE.title }}</h1>
      <p class="mt-2 text-ink-secondary">{{ SEARCH_DE.lede }}</p>
      <form action="/suche" method="get" role="search" class="mt-6 flex gap-2" @submit.prevent="submit">
        <UInput
          v-model="term"
          name="q"
          type="search"
          :maxlength="MAX_LIST_QUERY_CHARS"
          icon="i-lucide-search"
          :placeholder="`${SEARCH_DE.field} …`"
          :aria-label="SEARCH_DE.field"
          class="min-w-0 flex-1"
          :ui="{ base: 'min-h-target' }"
        />
        <input v-if="quellen" type="hidden" :name="SOURCE_PARAM" :value="quellen">
        <UButton type="submit" color="neutral" variant="outline" class="min-h-target">
          {{ SEARCH_DE.submit }}
        </UButton>
      </form>
      <!-- The site's choice of sources (`SourceChips`): it decides which
           drafts and which EU acts there are to find, as on every list. -->
      <div class="mt-4">
        <SourceChips />
      </div>
      <p v-if="!query" class="mt-4 text-sm text-ink-muted">{{ SEARCH_DE.hint }}</p>
    </header>

    <template v-if="query">
      <SearchDraftsGroup :query="query" />
      <SearchAnliegenGroup :query="query" />
      <SearchEuGroup :query="query" />
    </template>
  </div>
</template>
