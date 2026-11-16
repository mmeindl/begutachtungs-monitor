<script setup lang="ts">
/**
 * The homepage's block of Anliegen an das Parlament (step 4 of
 * `docs/research/umsetzungsplan-petitionen-volksbegehren.md`): the section
 * has no header label, so this block, `/wege` and the footer are its doors.
 *
 * After the drafts' sections, in their grammar: a chapter head with its one
 * way out (`ListHeader`, „Alle Anliegen →" to the list, which opens on the
 * same set — open ones, newest step first), one sentence, and the list's
 * white card with the count line in its head and the newest three open rows
 * (`EntryList`, the list's own sheet). Blue only in an open row's Stand box.
 *
 * No outcome counted, nothing ranked: the count is of OPEN items, in the
 * list's own line (`anliegenCountLineDe`), and the rows stand in the list's
 * order (`sortAnliegenRows`).
 *
 * FETCHED LIKE THE HOMEPAGE'S OTHER ADDITIONS (`useLateFetch`, key `home`):
 * the server waits two seconds at most and the browser asks again after
 * hydration. Its browser budget is the list's, not the other blocks' 10 s:
 * cold, the endpoint waits up to 20 s for its whole answer, lists and
 * records together (`getAnliegenRows`), and a block that gave up first would say „nicht
 * abrufbar" about a list that was only slow. Warm, the prewarm keeps it.
 *
 * Every state says what it is: loading, a failure with its reason, a kind
 * that could not be read (`anliegenUnreadDe`), no open item only where the
 * list answered (`anliegenEmptyDe`). Never zero for a failure, never silence.
 */
import type { AnliegenListResponse } from '#shared/types'
import { ANLIEGEN_PATH } from '#shared/utils/anliegen'
import {
  ANLIEGEN_HOME_DE,
  ANLIEGEN_LIST_DE,
  anliegenCountLineDe,
  anliegenEmptyDe,
  anliegenHomeRows,
  anliegenUnreadDe,
} from '~/utils/anliegenView'
import { halfState } from '~/utils/draftFilters'
import { useLateFetch } from '~/composables/useLateFetch'
import type { ListBoxStatus } from '~/utils/listState'

const { data, error } = useLateFetch<AnliegenListResponse>('/api/anliegen', () => ({}), {
  timeout: 30000,
  key: 'home',
})

const state = computed(() => halfState(true, data.value, error.value))
const rows = computed(() => (data.value ? anliegenHomeRows(data.value.rows) : []))
const countLine = computed(() => (data.value ? anliegenCountLineDe(data.value.gp, data.value.rows, 'alle', true) : null))
const unreadLines = computed(() => (data.value ? anliegenUnreadDe(data.value.unread.kinds, 'alle') : []))
const empty = computed(() => (data.value ? anliegenEmptyDe(data.value.rows, data.value.gp, 'alle', true) : null))
/* The reason with the failure: our 502 says Parliament's lists did not
 * answer; anything else (a timeout, no connection) is that no answer came. */
const failedReason = computed(() =>
  (error.value as { statusCode?: number } | null)?.statusCode === 502 ? ANLIEGEN_HOME_DE.failedUpstream : ANLIEGEN_HOME_DE.failedNoAnswer)
/* Loading and failure in the rows' place (`ListBoxState`); the frame stands meanwhile. */
const listState = computed<ListBoxStatus>(() => (state.value === 'loading'
  ? { loading: ANLIEGEN_LIST_DE.loading }
  : state.value === 'failed' ? { failed: { text: ANLIEGEN_HOME_DE.failed, description: failedReason.value } } : null))
</script>

<template>
  <section class="page-section" aria-labelledby="anliegen-heading">
    <ListHeader id="anliegen-heading" :to="ANLIEGEN_PATH" :noun="ANLIEGEN_HOME_DE.linkNoun">
      {{ ANLIEGEN_HOME_DE.heading }}
    </ListHeader>
    <p class="mt-2 text-sm text-ink-secondary">
      {{ ANLIEGEN_HOME_DE.lede }}
    </p>
    <!-- The drafts' sheet (`EntryList`), with the list's column for the
         Unterstützungen. -->
    <EntryList
      :entries="rows"
      :lead="ANLIEGEN_LIST_DE.columns.lead"
      :second-column="ANLIEGEN_LIST_DE.columns.support"
      :state="listState"
      no-retry
      class="mt-4"
    >
      <template v-if="data" #header>
        <p v-if="countLine" class="text-sm tabular-nums text-ink-secondary">{{ countLine }}</p>
        <GapNote v-for="line in rows.length ? unreadLines : []" :key="line" :text="line" class="text-sm text-ink-muted" />
      </template>
      <!-- No open row while a kind could not be read: the failure, never
           „kein Anliegen offen" over a list that is missing a part. -->
      <template #empty>
        <ListBoxNotice v-if="unreadLines.length" role="alert" :title="unreadLines.join(' ')" />
        <ListBoxNotice v-else-if="empty" :title="empty.title" :description="empty.note ?? undefined" />
      </template>
    </EntryList>
  </section>
</template>
