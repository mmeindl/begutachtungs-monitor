<script setup lang="ts">
import type { LandLawDiffResponse } from '#shared/types'
import { displayId } from '#shared/utils/unitName'
import { IN_FORCE_MARK, enactedNote, quotedInstruction, reachesNote, withheldNotes, type Reach } from '~/utils/landWithheld'

/**
 * The §§ of one law that the comparison does not show, one line per cause
 * (`withheldNotes`, 25.10.2026) — each with the sentence that is true of
 * it, and the way to the Land's document, which shows them. After them the
 * law's instructions that reach §§ they do not name, as the document prints
 * them (`reachesNote`, 26.10.2026).
 */
const props = defineProps<{
  items: LandLawDiffResponse['withheld']
  /** The Land's Textgegenüberstellung, where it has an address of its own */
  documentUrl: string | null
  /** No § of the comparison is shown: nothing is „ebenfalls" changed. */
  alone?: boolean
  /** Instructions of the Novelle that reach §§ they do not name, for this law */
  reaches?: readonly Reach[]
  /** The draft enacts this law anew, and the Land's document does not print its text */
  enacted?: boolean
  /** The numbers other §§ of this law move to (`moveTargets`): a § withheld under one is named „§ 33 (alt)" */
  movedTo?: ReadonlySet<string>
}>()

const notes = computed(() => withheldNotes(props.items, { alone: props.alone, movedTo: props.movedTo }))
const reaching = reachesNote()

/* „§ 3, § 7 und § 12": the joint before the k-th of n. */
const joint = (k: number, n: number) => (k === 0 ? '' : k === n - 1 ? ' und ' : ', ')
</script>

<template>
  <p v-for="n in notes" :key="n.cause" class="border-b border-hairline px-4 py-2.5 text-sm text-ink-secondary">
    {{ n.lead }} <template v-for="(id, k) in n.ids" :key="k">{{ joint(k, n.ids.length) }}<!-- A renumbered § as the comparison names it, „§ 13 → § 9" (26.10.2026). --><template v-if="n.fromIds[k]">{{ displayId(n.fromIds[k]!) }}<span aria-hidden="true">&nbsp;→ </span><span class="sr-only"> wird zu </span></template>{{ displayId(id) }}<template v-if="n.inForce[k]">&nbsp;{{ IN_FORCE_MARK }}</template></template>. <template v-if="n.text">{{ n.text }}. </template>
    <template v-if="documentUrl">Die <ExternalLink :href="documentUrl" class="link-inline">Textgegenüberstellung des Landes</ExternalLink> zeigt {{ n.pronoun }}.</template>
    <template v-else>Die Textgegenüberstellung des Landes zeigt {{ n.pronoun }}.</template>
  </p>
  <p v-if="enacted" class="border-b border-hairline px-4 py-2.5 text-sm text-ink-secondary">{{ enactedNote() }}</p>
  <p v-for="r in reaches ?? []" :key="r.instruction" class="border-b border-hairline px-4 py-2.5 text-sm text-ink-secondary">
    {{ reaching.lead }} <span class="italic">{{ quotedInstruction(r.instruction) }}</span><template v-if="!r.repeal"> {{ reaching.after }}</template>
  </p>
</template>
