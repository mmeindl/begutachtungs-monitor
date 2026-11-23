<script setup lang="ts">
import type { LandLawDiffResponse } from '#shared/types'
import { landLawGroupTitle } from '#shared/utils/laender'
import { repealedWholeNote } from '~/utils/landWithheld'

/**
 * The laws a Landesgesetzblatt repeals as a whole, one row each on a
 * Landesgesetz's page (23.11.2026): a fact of the Landesgesetzblatt, so no
 * „nicht gezeigt" and no fold around one sentence. A row of its list, in the
 * form the list's other rows without a § take.
 */
defineProps<{ laws: NonNullable<LandLawDiffResponse['repealedWhole']> }>()
</script>

<template>
  <section v-for="r in laws" :key="r.law" class="border-b border-hairline px-4 py-3 last-of-type:border-b-0">
    <p class="text-sm font-semibold text-ink">{{ landLawGroupTitle(r.law) }}</p>
    <p class="mt-1 text-sm text-ink-secondary">{{ repealedWholeNote(r.ids.length) }}</p>
  </section>
</template>
