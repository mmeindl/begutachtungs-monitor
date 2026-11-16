<script setup lang="ts">
/**
 * The facts of one step as one line — in the rail under the step's name, in
 * its section under a row's name. FactLine's grammar: each fact breaks whole,
 * and the dot stays at the end of the line it closes.
 */
import type { AnliegenFact } from '~/utils/anliegenView'

defineProps<{ facts: readonly AnliegenFact[] }>()
</script>

<template>
  <span>
    <template v-for="(fact, i) in facts" :key="i">
      <span class="inline-block"><AnliegenFactText :fact="fact" /><template v-if="i < facts.length - 1">&nbsp;·</template></span>{{ ' ' }}
    </template>
  </span>
</template>
