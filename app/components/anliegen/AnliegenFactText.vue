<script setup lang="ts">
/**
 * One fact of an Anliegen's page as a phrase: its text, then a link where
 * the fact names another page — the predecessor here, a report at
 * Parliament — then what follows the link (`AnliegenFact`,
 * `app/utils/anliegenView.ts`). In the house link style: a link sharing a
 * line with plain text is underlined at rest, never marked by colour alone.
 */
import type { AnliegenFact } from '~/utils/anliegenView'

defineProps<{ fact: AnliegenFact }>()
</script>

<template>
  <!-- The space inside the mustache: Vue drops whitespace that trails an element. -->
  <span>{{ fact.text }}<template v-if="fact.link"><ExternalLink v-if="fact.link.external" :href="fact.link.href" class="link-inline">{{ fact.link.label }}</ExternalLink><NuxtLink v-else :to="fact.link.href" class="link-inline">{{ fact.link.label }}</NuxtLink></template>{{ fact.after ?? '' }}</span>
</template>
