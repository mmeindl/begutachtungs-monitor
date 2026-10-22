<script setup lang="ts">
/**
 * A primary button that copies one string — the e-mail address a Land
 * takes Stellungnahmen at (22.10.2026). The act on those pages: where
 * Oberösterreich offers a form, Salzburg and Wien offer an address, and
 * „Stellungnahme einbringen" there means „take the address with you".
 * Beside the address's own `mailto:` link, not instead of it: the link
 * opens whatever program the browser thinks is the mail client, which for
 * many readers at a desk is none or the wrong one; the address in the
 * clipboard goes wherever they write.
 *
 * Same mechanics as „Zitieren" (`useClipboardCopy`); blue because it is
 * the page's action (one hue, one meaning), at the height of `DoorButton`
 * beside the calendar button.
 */
const props = defineProps<{
  text: string
  /** What is copied, for the status region: „E-Mail-Adresse". */
  what: string
}>()

const { copied, announcement, copy } = useClipboardCopy(() => props.text, {
  prompt: `${props.what} zum Kopieren:`,
  done: `${props.what} kopiert`,
})
</script>

<template>
  <span class="inline-flex">
    <UButton
      color="primary"
      :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
      class="min-h-target"
      :title="text"
      @click="copy"
    >
      <template v-if="copied">Kopiert</template>
      <slot v-else />
    </UButton>
    <span class="sr-only" role="status">{{ announcement }}</span>
  </span>
</template>
