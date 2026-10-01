<script setup lang="ts">
/**
 * The warnings specific to ONE draft's comparison, above it: what is
 * missing, merged or undivided — what the list below may get wrong
 * (01.10.2026). One block and one style for both comparison sections; until
 * then the § comparison set them small with a rule and the Gegenüberstellung
 * as plain text, so the same kind of statement looked like two.
 *
 * Above, not in the credits under the list: a warning that what follows may
 * be wrong belongs before it (TextComparisonSection, 30.09.2026). The rule
 * marks them as qualifications of the result, not as more result. Readable
 * size: a reader who needs them must not have to squint.
 */
const props = defineProps<{ notes: readonly (string | null | undefined)[] }>()
const shown = computed(() => props.notes.filter((n): n is string => Boolean(n)))
</script>

<template>
  <div v-if="shown.length" class="space-y-1.5 border-l-2 border-hairline pl-3 text-sm text-ink-secondary">
    <p v-for="note in shown" :key="note">{{ note }}</p>
  </div>
</template>
