<script setup lang="ts">
/**
 * The country's „Wege der Gesetzgebung": Bund, Länder, Anliegen an das
 * Parlament, where EU law enters, and what the monitor does not follow.
 * Replaces the prose of /so-funktionierts#stationen and #wege (14.11.2026).
 * The EU's ways are a page of their own since 16.11.2026
 * (`pages/eu-recht/wege.vue`); both are `WegeView`, every word in
 * `app/utils/wege.ts`.
 */
import { WEGE_STATE } from '~/utils/wege'
</script>

<template>
  <WegeView :jurisdiction="WEGE_STATE" />
</template>
