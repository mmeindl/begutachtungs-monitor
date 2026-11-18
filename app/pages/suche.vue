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
 *
 * THE ANSWERS FOLLOW THE TYPING (17.11.2026), 400 ms after the last
 * keystroke, as the Anliegen list's search: they change in place and the
 * cursor stays in the word, so no change of context (WCAG 3.2.2) — which is
 * why the homepage's field, whose submit leaves the page, keeps its button.
 * Every group filters what it already holds, so a term costs no request.
 * The address is replaced, not pushed: Back leaves the page in one step
 * instead of walking back through the words typed; Enter still pushes, an
 * act of its own. Below two characters the page shows the hint: one letter
 * matches half of every list and says nothing.
 */
import { SOURCE_PARAM } from '#shared/utils/laender'
import { MAX_LIST_QUERY_CHARS, firstQueryValue } from '#shared/utils/queryParams'
import { SEARCH_DE, SEARCH_MIN_LEN, SEARCH_TYPING_MS } from '~/utils/siteSearch'

const route = useRoute()

const termOf = (raw: unknown) => (firstQueryValue(raw) ?? '').slice(0, MAX_LIST_QUERY_CHARS).trim()
const asked = computed(() => termOf(route.query.q))
/* The term the answers are for: none below the minimum. */
const query = computed(() => (asked.value.length >= SEARCH_MIN_LEN ? asked.value : ''))
const quellen = computed(() => firstQueryValue(route.query[SOURCE_PARAM]))
const term = ref(asked.value)

function addressFor(q: string) {
  return { path: '/suche', query: { ...(q ? { q } : {}), ...(quellen.value ? { [SOURCE_PARAM]: quellen.value } : {}) } }
}

/* What this page wrote last: its own replace coming back through the route
 * must not overwrite a field the reader has typed on in the meantime. Any
 * other navigation — Back, a link, the header — sets the field. */
let written: string | null = null
watch(asked, (q) => {
  if (q === written) return
  term.value = q
})

let timer: ReturnType<typeof setTimeout> | undefined
watch(term, (value) => {
  clearTimeout(timer)
  const q = value.trim()
  if (q === asked.value) return
  timer = setTimeout(() => {
    written = q
    void navigateTo(addressFor(q), { replace: true })
  }, SEARCH_TYPING_MS)
})
onBeforeUnmount(() => clearTimeout(timer))

function submit() {
  clearTimeout(timer)
  const q = term.value.trim()
  written = q
  return navigateTo(addressFor(q))
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
      <p v-if="!query" class="mt-4 text-sm text-ink-muted">{{ SEARCH_DE.hint }}</p>
    </header>

    <template v-if="query">
      <SearchDraftsGroup :query="query" />
      <SearchAnliegenGroup :query="query" />
      <SearchEuGroup :query="query" />
    </template>
  </div>
</template>
