<script setup lang="ts">
/**
 * The line that closes „Die Begutachtung" once a Regierungsvorlage exists:
 * what came of the text after it, and the way to the comparison that shows
 * it (01.10.2026). The sentence is `begutachtungAftermathDe`.
 *
 * Here and not the comparison itself: the change is the Ressort's, in the
 * Vorlage it wrote, and under the Stellungnahmen it would read as their
 * effect — a cause the comparison cannot observe (framing rule). The line
 * puts input and outcome side by side and leaves the comparison where it is.
 *
 * Not the „third pointer" the page dropped on 18.09.2026: that one only
 * repeated a link the bar already offers. This one carries the figure, and
 * stands where a reader of the Stellungnahmen asks for it.
 *
 * The count comes from the ME→RV comparison under the same key
 * (`lawDiffKey`), so the line and the comparison one section down make one
 * request. A Vorlage tabled before the Fristende gets no line at all, and
 * asks for no count: its date stands in the Regierungsvorlage's station card
 * (01.10.2026).
 */
import type { LawDiffResponse } from '#shared/types'
import { changeShareNounDe, ownChangeShare } from '#shared/utils/changeShare'
import { lawDiffKey, lawStationPairQuestion } from '#shared/utils/lawStations'
import { begutachtungAftermathDe, tabledBeforeFristEnd } from '~/utils/outcomes'

const props = defineProps<{
  gp: string
  inr: number
  arrivedAt: string | null
  deadline: string | null
  rvDate: string | null
}>()

const early = Boolean(props.deadline && props.rvDate && tabledBeforeFristEnd(props.deadline, props.rvDate))

const { data } = await useFetch<LawDiffResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/diff?von=me&bis=rv`,
  { key: () => lawDiffKey(props.gp, props.inr, 'me', 'rv'), lazy: true, server: false, dedupe: 'defer', immediate: !early },
)

const sentence = computed(() => {
  const d = data.value
  const share = d?.available ? ownChangeShare(d.stats) : null
  return begutachtungAftermathDe(share, changeShareNounDe(d?.units ?? []), {
    arrivedAt: props.arrivedAt,
    deadline: props.deadline,
    rvDate: props.rvDate,
  })
})

const question = lawStationPairQuestion('me', 'rv')
</script>

<template>
  <!-- Says nothing until the count is there: a link alone is the pointer
       the page dropped, and a placeholder would announce a number. -->
  <p v-if="sentence" class="text-sm text-ink-secondary">
    {{ sentence }}
    <NuxtLink to="#textvergleich" class="link-inline">{{ question }}</NuxtLink>
  </p>
</template>
