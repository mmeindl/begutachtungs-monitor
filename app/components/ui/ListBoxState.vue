<script setup lang="ts">
/**
 * The rows' place in a list box while they are on the way or failed to
 * come (16.11.2026) — one piece for every list, so they all load alike.
 *
 * A LIST SHOWS ITS FRAME WHILE LOADING (docs/decisions.md): the caller
 * renders its heading, lede, `ListBox`, column header and the controls whose
 * content is known without the data at once, and puts its rows inside this
 * component. While `state` is `{ loading }` the list's own line stands
 * here with the spinner, left-aligned like a row; on `{ failed }` the
 * failure stands here, set through `GapNote`, with „Erneut versuchen"
 * beside it (`retry`); with `null` the rows (the default slot).
 *
 * THE HEIGHT. Loading line and failure hold `min-h-48` (12rem, 192 px):
 * two and a half rows of two lines (about 72–76 px each), a fraction of a
 * first page of ten to twenty rows (750–1,500 px), so the page below moves
 * little when the rows come; a list that answers with one row or an empty
 * notice gives back at most about 140 px. The same height for both, so a
 * failure takes the loading line's place without a jump.
 *
 * ANNOUNCED ONCE EACH. A polite live region outside the busy part says the
 * loading line while it stands and, once rows arrived after it, `loaded`
 * (the list's own words, or „Die Liste ist geladen."). A list that arrived
 * with the page (SSR) says nothing. The failure is `role="alert"`. The part
 * that will hold the rows carries `aria-busy` while loading — the live
 * region sits outside it, since a reader may hold back what changes inside
 * a busy region.
 *
 * Words: `LIST_STATE_DE` (`app/utils/listState.ts`) and the caller's own.
 */
import { LIST_STATE_DE, type ListBoxStatus } from '~/utils/listState'

const props = defineProps<{
  state: ListBoxStatus
  /** What the live region says when the rows arrived after the loading line. */
  loaded?: string
  /** No „Erneut versuchen" beside the failure (a list whose way back stands elsewhere). */
  noRetry?: boolean
  /** The caller speaks for the list (its own live region): no live region here, and the failure no alert. */
  quiet?: boolean
}>()

defineEmits<{ retry: [] }>()

const loading = computed(() => (props.state && 'loading' in props.state ? props.state.loading : null))
const failed = computed(() => (props.state && 'failed' in props.state ? props.state.failed : null))

/* Said once: the loading line while it stands, the arrival after it — nothing for rows that came with the page. */
const wasLoading = ref(loading.value !== null)
const said = ref(loading.value ?? '')
watch(loading, (now) => {
  if (now !== null) {
    wasLoading.value = true
    said.value = now
  } else if (wasLoading.value) {
    wasLoading.value = false
    said.value = failed.value ? '' : (props.loaded ?? LIST_STATE_DE.loaded)
  }
})
</script>

<template>
  <div>
    <p v-if="!quiet" class="sr-only" aria-live="polite">{{ said }}</p>
    <div :aria-busy="loading !== null || undefined">
      <div v-if="loading !== null" class="flex min-h-48 items-start gap-2.5 px-4 py-3 text-sm text-ink-secondary">
        <span class="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-accent" aria-hidden="true" />
        <span>{{ loading }}</span>
      </div>
      <div v-else-if="failed" :role="quiet ? undefined : 'alert'" class="flex min-h-48 flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
        <div>
          <GapNote :text="failed.text" class="text-ink" />
          <p v-if="failed.description" class="mt-0.5 text-ink-secondary">{{ failed.description }}</p>
        </div>
        <UButton v-if="!noRetry" color="primary" @click="$emit('retry')">{{ LIST_STATE_DE.retry }}</UButton>
      </div>
      <slot v-else />
    </div>
  </div>
</template>
