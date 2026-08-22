<script setup lang="ts">
import type { ConsultationDocument } from '#shared/types'

defineProps<{
  documents: ConsultationDocument[]
}>()

const formatNames: Record<'pdf' | 'html', string> = { pdf: 'PDF', html: 'HTML' }
</script>

<template>
  <ul class="divide-y divide-hairline">
    <li
      v-for="(doc, i) in documents"
      :key="`${doc.title}-${i}`"
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
    >
      <span class="min-w-0 text-sm text-ink">{{ doc.title }}</span>
      <span class="flex shrink-0 gap-2">
        <UButton
          v-for="fmt in doc.formats"
          :key="fmt.type"
          :to="fmt.url"
          target="_blank"
          rel="noopener"
          size="sm"
          color="neutral"
          variant="outline"
          class="min-h-11"
          :aria-label="`${doc.title} als ${formatNames[fmt.type]} auf parlament.gv.at öffnen`"
        >
          {{ formatNames[fmt.type] }}<span aria-hidden="true"> ↗</span>
        </UButton>
      </span>
    </li>
  </ul>
</template>
