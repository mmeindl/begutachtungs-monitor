<script setup lang="ts">
/**
 * The EU map's overview (docs/architecture.md §12.66, Nachtrag 3): every EU
 * act that a draft of the window implements, Bund and Länder, with its
 * deadline and how many drafts implement it on each side. Each act links
 * to its page, where the drafts stand on one track.
 *
 * The list in the unfilled frame — rows to consult, not an instrument to
 * operate (box grammar, §8): no sort, no filter, the order the map
 * delivers. Folded past twenty in the site's list idiom (`ListMore`).
 *
 * No verdict anywhere on it, as on the draft's fact (rule D6): the counts
 * are of drafts that implement an act, never of acts not implemented — the
 * monitor reads only the Begutachtungen it knows, and an absence is no
 * finding.
 */
import type { EuActsResponse } from '#shared/types'
import { risSource, eurLexSource, sourceItemsDe } from '#shared/utils/provenance'
import { euActsRows, incompleteNoteDe } from '~/utils/euKarte'

usePageSeo({
  title: 'EU-Recht in der Begutachtung',
  description:
    'Welche Richtlinien und Verordnungen der Europäischen Union die Entwürfe des Bundes und der Länder umsetzen – mit Umsetzungsfrist und den Entwürfen je Rechtsakt.',
})

const { data, status, error, refresh } = useFetch<EuActsResponse>('/api/eu-recht', { lazy: true })

const rows = computed(() => (data.value ? euActsRows(data.value) : []))
const incomplete = computed(() => (data.value ? incompleteNoteDe(data.value.incomplete) : null))

/** Twenty stand; the rest behind „Alle N anzeigen" (`ListMore`). */
const STEP = 20
const visible = ref(STEP)
const shown = computed(() => rows.value.slice(0, visible.value))

/*
 * The credit line, as under a draft's EU fact (`DraftEuCredits`): what the
 * map read and from whom. The Länder's documents carry no licence claim and
 * are named plainly, between the Bund's and EUR-Lex's, in the order the
 * map reads them.
 */
const [bundItem, eurLexItem] = sourceItemsDe([risSource('Vorblatt'), risSource('Gesetzestext'), eurLexSource('Fristen')])
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <h1 class="page-title">
      EU-Recht in der Begutachtung
    </h1>
    <p class="mt-4 leading-relaxed text-ink-secondary">
      Jeder Rechtsakt der Europäischen Union, den ein Entwurf dieser
      Gesetzgebungsperiode umsetzt – beim Bund und in den Ländern –, mit seiner
      Umsetzungsfrist und den Entwürfen, die ihn umsetzen. Woher die Angaben
      stammen und was sie nicht sagen, steht unter
      <NuxtLink to="/so-funktionierts#eu-recht" class="link-inline">So funktioniert’s</NuxtLink>.
    </p>

    <FetchGate
      :status="status"
      :error="error"
      :data="data"
      loading-label="Rechtsakte werden geladen …"
      state-class="mt-10"
      @retry="refresh()"
    >
      <template #default="{ data: map }">
        <EmptyState
          v-if="!map.builtAt"
          class="mt-10"
          title="Die Karte ist noch nicht gebaut."
          description="Sobald der Monitor die Entwürfe dieser Gesetzgebungsperiode einmal gelesen hat, stehen hier die Rechtsakte, die sie umsetzen."
        />
        <template v-else>
          <!-- A rare caveat, and about the whole list: above it, in the
               register of the list's Land notes. -->
          <p v-if="incomplete" class="mt-8 text-sm text-ink-muted">
            {{ incomplete }}
          </p>
          <EmptyState
            v-if="!rows.length"
            class="mt-8"
            title="Kein Entwurf dieser Periode setzt einen Rechtsakt um, den der Monitor kennt."
          />
          <section v-else aria-labelledby="eu-akte-heading" class="mt-8">
            <h2 id="eu-akte-heading" class="sr-only">Rechtsakte</h2>
            <div class="overflow-clip rounded-xl border border-hairline">
              <ul role="list" class="divide-y divide-hairline">
                <!-- The list row's anatomy (`EntryItem`): the whole row is the
                     link, the title ink and underlined under the pointer, the
                     ground tinted — never a blue inline link inside a list. -->
                <li v-for="row in shown" :key="row.key">
                  <NuxtLink :to="row.path" class="group block px-4 py-3 hover:bg-hover">
                    <h3 class="font-medium text-ink group-hover:underline group-hover:decoration-2">{{ row.label }}</h3>
                    <!-- The act's subject from its official title: what the
                         citation alone does not tell. Whole, no clamp. -->
                    <p v-if="row.subject" class="mt-0.5 text-sm text-ink-secondary">
                      {{ row.subject }}
                    </p>
                    <p class="mt-0.5 text-sm text-ink-muted">
                      <template v-if="row.deadline">{{ row.deadline }} · </template>{{ row.counts }}<template v-if="row.lands.length"> ({{ row.lands.join(', ') }})</template>
                    </p>
                  </NuxtLink>
                </li>
              </ul>
              <ListMore
                :visible="visible"
                :total="rows.length"
                :step="STEP"
                @more="visible += STEP"
                @all="visible = rows.length"
              />
            </div>
            <SectionCredits :sources="[]" :marked="false" method="/so-funktionierts#eu-recht">
              <span>Quellen:</span>
              <span>{{ bundItem }}</span>
              <span>Dokumente der Länder</span>
              <span>{{ eurLexItem }}</span>
            </SectionCredits>
          </section>
        </template>
      </template>
    </FetchGate>
  </div>
</template>
