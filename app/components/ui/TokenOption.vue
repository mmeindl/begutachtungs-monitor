<script setup lang="ts">
/**
 * An <option> of `TokenSelect` that carries `selected` itself, so the
 * server-rendered select already shows the chosen value (see TokenSelect).
 * `disabled` and other attributes fall through to the <option>.
 */
import { TOKEN_SELECT_MODEL } from './TokenSelect.vue'

const props = defineProps<{ value: string }>()
const model = inject(TOKEN_SELECT_MODEL, null)
/* Here, not in the template: a template unwraps the injected ref. */
const selected = computed(() => model?.value === props.value)
</script>

<template>
  <option :value="value" :selected="selected">
    <slot />
  </option>
</template>
