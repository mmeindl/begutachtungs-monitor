<script setup lang="ts">
/**
 * One block in a Land draft's ProcedureCard, under the EU block: what of the
 * Bund's the draft carries out, by name — „Bundesrecht:
 * Anstellungserfordernisse-Grundsatzgesetz, BGBl. I Nr. 44/2025" (the name
 * links to `/bundesrecht/<Jahr>/<Nummer>` where the map has the act) and
 * „Vereinbarung gemäß Art. 15a B-VG über Sozialbetreuungsberufe"
 * (docs/architecture.md §12.67). The verb stands once, as the Entwurf
 * station's fact („führt das … aus", `utils/origin.ts`); the block names
 * the act and opens with a noun, like the EU block.
 *
 * THE EU BLOCK'S REGISTER: bare, a hairline above, the heading in ink, no
 * pill and no colour. Renders nothing while the answer is out and nothing
 * where the draft carries out nothing of the Bund's: no „keine
 * Bundesvorgaben" line.
 */
import type { LandBundesrechtResponse } from '#shared/types'
import { bundesrechtRows } from '~/utils/bundesrecht'

const props = defineProps<{ data: LandBundesrechtResponse | null | undefined }>()
const rows = computed(() => bundesrechtRows(props.data))
</script>

<template>
  <!-- The id: the Entwurf station's tokens lead here (`utils/origin.ts`). -->
  <div v-if="rows.length" id="bundesrecht-fakt" class="mt-4 scroll-mt-4 border-t border-hairline pt-4 text-sm text-ink-secondary">
    <template v-if="rows.length > 1">
      <p><strong class="font-semibold text-ink">Bundesrecht</strong>:</p>
      <ul class="mt-1 space-y-1">
        <li v-for="r in rows" :key="r.key">
          <NuxtLink v-if="r.path" :to="r.path" class="link-inline">{{ r.label }}</NuxtLink><template v-else>{{ r.label }}</template>{{ r.citation }}<template v-if="r.partial">, teilweise</template>
        </li>
      </ul>
    </template>
    <p v-else>
      <strong class="font-semibold text-ink">Bundesrecht</strong>: <NuxtLink v-if="rows[0]!.path" :to="rows[0]!.path!" class="link-inline">{{ rows[0]!.label }}</NuxtLink><template v-else>{{ rows[0]!.label }}</template>{{ rows[0]!.citation }}<template v-if="rows[0]!.partial">, teilweise</template>.
    </p>
  </div>
</template>
