<script setup lang="ts">
/**
 * The EU map's overview (docs/architecture.md §12.66, Nachtrag 3): every EU
 * act that a draft of the window implements, Bund and Länder, with its
 * deadline and how many drafts implement it on each side. Each act links
 * to its page, where the drafts stand on one track.
 *
 * The list on the white sheet of every list of rows (`ListBox`, box
 * grammar, §8): rows you operate — each links, the list folds past twenty
 * in the site's idiom (`ListMore`), the chips filter it. Everything that
 * operates on it stands inside the box, the chips in its head per
 * `ListBox`'s rule, the empty selection and the fold at its foot; nothing
 * floats above it. No sort, the order the map delivers.
 *
 * The source chips select rows and change nothing in a row: an act stays
 * where the Bund (ticked) has an implementing draft or any ticked Land does.
 * They are the site's (`SourceChips`, `useSourceChoice`, 06.11.2026): one
 * choice, one `?quellen=`, on the homepage, the list and here — so the map
 * opens on the Bund alone, as every list does, and a reader who ticked
 * Salzburg anywhere finds Salzburg here. Until then the page had chips of
 * its own, nothing ticked meaning everyone, which gave the same address two
 * meanings. A Land without an act stands unavailable with its reason
 * (`euSourceUnavailable`), as the list draws a Land a station does not
 * reach.
 *
 * No verdict anywhere on it, as on the draft's fact (rule D6): the counts
 * are of drafts that implement an act, never of acts not implemented — the
 * monitor reads only the Begutachtungen it knows, and an absence is no
 * finding.
 */
import type { EuActsResponse } from '#shared/types'
import { risSource, eurLexSource, sourceItemsDe } from '#shared/utils/provenance'
import { euActsRows, euSourceUnavailable, filterEuActs, incompleteNoteDe } from '~/utils/euKarte'

usePageSeo({
  title: 'EU-Recht in der Begutachtung',
  description:
    'Welche Richtlinien und Verordnungen der Europäischen Union die Entwürfe des Bundes und der Länder umsetzen – mit Umsetzungsfrist und den Entwürfen je Rechtsakt.',
})

const { data, status, error, refresh } = useFetch<EuActsResponse>('/api/eu-recht', { lazy: true })

/* The site's choice of sources, never empty (`useSourceChoice`). */
const { chosen, bund, toggle } = useSourceChoice()

const sourceUnavailable = computed(() => (data.value ? euSourceUnavailable(data.value.acts, data.value.incomplete) : {}))
const allRows = computed(() => (data.value ? euActsRows(data.value) : []))
const rows = computed(() => (data.value ? euActsRows({ ...data.value, acts: filterEuActs(data.value.acts, chosen.value) }) : []))
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
  <div class="mx-auto w-full max-w-4xl">
    <!-- A list page, so the list's frame (`/entwuerfe`): its width, and the
         title with its lede in a header. -->
    <header>
      <h1 class="page-title">
        EU-Recht in der Begutachtung
      </h1>
      <p class="mt-2 text-ink-secondary">
        Jeder Rechtsakt der Europäischen Union, den ein Entwurf dieser
        Gesetzgebungsperiode umsetzt – beim Bund und in den Ländern –, mit seiner
        Umsetzungsfrist und den Entwürfen, die ihn umsetzen. Woher die Angaben
        stammen und was sie nicht sagen, steht unter
        <NuxtLink to="/so-funktionierts#eu-recht" class="link-inline">So funktioniert’s</NuxtLink>.
      </p>
    </header>

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
          <!-- Without a list, the caveat stands above the empty state; with
               one, in its head, as on `/entwuerfe`. -->
          <p v-if="incomplete && !allRows.length" class="mt-6 text-sm text-ink-muted">
            {{ incomplete }}
          </p>
          <EmptyState
            v-if="!allRows.length"
            class="mt-6"
            title="Kein Entwurf dieser Periode setzt einen Rechtsakt um, den der Monitor kennt."
          />
          <section v-else aria-labelledby="eu-akte-heading" class="mt-6">
            <h2 id="eu-akte-heading" class="sr-only">Rechtsakte</h2>
            <ListBox>
              <!-- Whose drafts, in the tool row, the lists' source chips
                   (`SourceChips`): they decide which rows exist at all. -->
              <template #header>
                <SourceChips :unavailable="sourceUnavailable" />
                <!-- A Land that could not be read, under the chips — where
                     the list names its unreadable Länder. -->
                <p v-if="incomplete" class="text-sm text-ink-muted">
                  {{ incomplete }}
                </p>
              </template>
              <!-- Inside the sheet, as a list box's notice: a card in the
                   sheet would be a box in a box (`ListBoxNotice`). Empty
                   only where the chosen Länder have no act and the Bund is
                   off; the Bund has acts, so it is the way back. -->
              <ListBoxNotice
                v-if="!rows.length"
                title="Kein Rechtsakt mit einem Entwurf aus dieser Auswahl."
              >
                <template v-if="!bund" #action>
                  <button type="button" class="link-inline text-sm" @click="toggle('bund')">
                    Bund dazunehmen
                  </button>
                </template>
              </ListBoxNotice>
              <ul v-else role="list" class="divide-y divide-hairline">
                <EuActRow v-for="row in shown" :key="row.key" :row="row" />
              </ul>
              <ListMore
                :visible="visible"
                :total="rows.length"
                :step="STEP"
                @more="visible += STEP"
                @all="visible = rows.length"
              />
            </ListBox>
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
