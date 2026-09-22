<script setup lang="ts" generic="T">
/**
 * The three answers a page has while its data is on the way: it is loading,
 * it failed and here is the way back, or here is the page. Both list pages
 * and both detail pages wrote the same three branches in the same order.
 *
 * `status === 'pending' && !data`, never `pending` alone: a refresh keeps
 * the page the reader is looking at instead of replacing it with a spinner.
 *
 * The slot hands the data back although the page already holds it, and that
 * is the whole reason this component is generic: `v-else-if="data"` on the
 * page's own element narrowed the type for everything inside it, and 131
 * places on the two detail pages read `data.…` under that narrowing. A slot
 * that yields nothing would hand all of them back an optional.
 */
import type { AsyncDataRequestStatus } from '#app'

defineProps<{
  status: AsyncDataRequestStatus
  error: unknown
  data: T | null | undefined
  /** What is being loaded, in the page's own words. */
  loadingLabel?: string
  /**
   * Spacing above the state. The two list pages set it because their header
   * ends right above; the detail pages start with it and set none.
   */
  stateClass?: string
}>()

defineEmits<{
  retry: []
}>()

defineSlots<{
  default(props: { data: T }): unknown
}>()
</script>

<template>
  <div v-if="status === 'pending' && !data" :class="stateClass">
    <LoadingState :label="loadingLabel" />
  </div>
  <div v-else-if="error" :class="stateClass">
    <ErrorState @retry="$emit('retry')" />
  </div>
  <slot v-else-if="data" :data="data" />
</template>
