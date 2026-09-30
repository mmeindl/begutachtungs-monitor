<script setup lang="ts">
import type { AntragPath } from '#shared/types'
import { antragUrl, carriesDraft, sharePercentDe } from '#shared/utils/antragPath'
import { bgblShort, formatDateDe } from '#shared/utils/format'

/**
 * The Initiativantrag route, under „Die Regierungsvorlage" on a draft that
 * has none (docs/architecture.md §12.10, 30.09.2026).
 *
 * THREE SENTENCES, each a fact the reader can check: which Antrag carried
 * the text and where it was promulgated; how that was matched — by wording,
 * because no pointer in the data connects the two, with the share that
 * matched; and, where it applies, that the Antrag was filed while the
 * Begutachtung still ran. Temporal, never causal: the page says WHEN, not
 * why, and not what the Stellungnahmen could have changed (framing rule,
 * §4).
 *
 * TWO STRENGTHS. Where the Antrag carries most of the draft (`carriesDraft`)
 * the route is the draft's; where it carries only a part (XXVIII/6/ME: 3 % of
 * the draft), the sentence says „ein Teil" and the rest of the section keeps
 * saying what it says without a Vorlage.
 */
const props = defineProps<{
  path: AntragPath
  gp: string
  deadline: string | null
}>()

const carries = computed(() => carriesDraft(props.path))
const url = computed(() => antragUrl(props.gp, props.path))
/** The Antrag holds much more than this draft (159/ME in the Gewaltschutzgesetz 2019). */
const antragIsLarger = computed(() => props.path.antragShare < 0.5)
</script>

<template>
  <div>
    <p class="max-w-prose text-sm text-ink" :class="carries ? 'font-medium' : ''">
      <template v-if="carries">Der Gesetzestext kam nicht als Regierungsvorlage ins Parlament, sondern als</template>
      <template v-else>Ein Teil dieses Gesetzestexts kam als</template>
      <ExternalLink :href="url" class="link-inline">Initiativantrag {{ path.antrag.citation }}</ExternalLink>
      <template v-if="!carries"> ins Parlament</template>
      und ist kundgemacht: {{ bgblShort(path.antrag.bgblNumber) }}.
    </p>
    <p class="mt-2 max-w-prose text-sm text-ink-secondary">
      Zugeordnet über den Wortlaut – einen Verweis zwischen Entwurf und Antrag
      führt das Parlament nicht:
      <template v-if="carries">
        {{ sharePercentDe(path.draftShare) }} des Entwurfstexts stehen wörtlich im Antrag.
        <template v-if="antragIsLarger">
          Der Antrag („{{ path.antrag.title }}“) enthält darüber hinaus weitere Änderungen.
        </template>
      </template>
      <template v-else>
        Der Antrag steht zu {{ sharePercentDe(path.antragShare) }} wörtlich in diesem
        Entwurf, umfasst aber nur einen Teil davon ({{ sharePercentDe(path.draftShare) }}
        des Entwurfstexts).
      </template>
    </p>
    <p v-if="path.duringFrist" class="mt-2 max-w-prose text-sm text-ink-secondary">
      Eingebracht wurde der Antrag am {{ formatDateDe(path.antrag.einlangen) }}, noch
      während der Begutachtung<template v-if="deadline"> – die Frist für
        Stellungnahmen lief bis {{ formatDateDe(deadline) }}</template>.
    </p>
  </div>
</template>
