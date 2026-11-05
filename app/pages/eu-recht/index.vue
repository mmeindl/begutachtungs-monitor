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
 * They look like the lists' `SourceChips` and speak the same `?quellen=`,
 * but they are THIS page's: nothing ticked is everyone (the site's choice
 * defaults to the Bund alone), and they never write the site's cookie — a
 * map of Bund and Länder that opened on the Bund would hide half of what it
 * is for. Only the Länder with an act get a chip; Steiermark, unread, is
 * the incomplete note's.
 *
 * No verdict anywhere on it, as on the draft's fact (rule D6): the counts
 * are of drafts that implement an act, never of acts not implemented — the
 * monitor reads only the Begutachtungen it knows, and an absence is no
 * finding.
 *
 * APART, FOLDED: the acts drafts only restate. An amendment restates the
 * whole Umsetzungshinweis of the law it changes (rule D4), so these are
 * acts transposed before — listed so their pages are reachable, never
 * counted as implemented, and closed by default under the main list. The
 * chips filter them too; the fold goes where the selection leaves none.
 */
import type { EuActsResponse } from '#shared/types'
import { SOURCE_NAME, SOURCE_PARAM, formatSourceList, parseSourceList, type SourceCode } from '#shared/utils/laender'
import { risSource, eurLexSource, sourceItemsDe } from '#shared/utils/provenance'
import { euActsRows, euRestatingRows, euSourceChips, filterEuActs, incompleteNoteDe, restatingFoldHeading } from '~/utils/euKarte'

usePageSeo({
  title: 'EU-Recht in der Begutachtung',
  description:
    'Welche Richtlinien und Verordnungen der Europäischen Union die Entwürfe des Bundes und der Länder umsetzen – mit Umsetzungsfrist und den Entwürfen je Rechtsakt.',
})

const { data, status, error, refresh } = useFetch<EuActsResponse>('/api/eu-recht', { lazy: true })

/*
 * The chosen sources, from the URL alone — a view setting, so a chip
 * replaces the history entry instead of adding one. Empty is everyone.
 */
const route = useRoute()
const router = useRouter()
const chosen = computed<SourceCode[]>(() => {
  const raw = route.query[SOURCE_PARAM]
  return parseSourceList(Array.isArray(raw) ? raw[0] : raw) ?? []
})
function choose(next: readonly SourceCode[]): void {
  const value = formatSourceList(next)
  router.replace({ query: { ...route.query, [SOURCE_PARAM]: value || undefined } })
}
function toggleSource(code: SourceCode): void {
  choose(chosen.value.includes(code) ? chosen.value.filter((c) => c !== code) : [...chosen.value, code])
}

// A Land whose drafts only restate acts gets its chip too: the chips filter both lists.
const chips = computed(() => (data.value ? euSourceChips([...data.value.acts, ...data.value.restatingOnly], chosen.value) : []))
const allRows = computed(() => (data.value ? euActsRows(data.value) : []))
const rows = computed(() => (data.value ? euActsRows({ acts: filterEuActs(data.value.acts, chosen.value) }) : []))
const restatingRows = computed(() => (data.value ? euRestatingRows({ restatingOnly: filterEuActs(data.value.restatingOnly, chosen.value) }) : []))
const incomplete = computed(() => (data.value ? incompleteNoteDe(data.value.incomplete) : null))

/** Twenty stand; the rest behind „Alle N anzeigen" (`ListMore`), in each list. */
const STEP = 20
const visible = ref(STEP)
const shown = computed(() => rows.value.slice(0, visible.value))
const visibleRestating = ref(STEP)
const shownRestating = computed(() => restatingRows.value.slice(0, visibleRestating.value))

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
            v-if="!allRows.length"
            class="mt-8"
            title="Kein Entwurf dieser Periode setzt einen Rechtsakt um, den der Monitor kennt."
          />
          <section v-else aria-labelledby="eu-akte-heading" class="mt-8">
            <h2 id="eu-akte-heading" class="sr-only">Rechtsakte</h2>
            <ListBox>
              <!-- Whose drafts, in the tool row, as the lists' source chips
                   (`SourceChips`): they decide which rows exist at all. -->
              <template #header>
                <div role="group" aria-label="Quellen der Liste" class="flex flex-wrap items-center gap-2">
                  <ToggleChip
                    v-for="code in chips"
                    :key="code"
                    :pressed="chosen.includes(code)"
                    @toggle="toggleSource(code)"
                  >
                    {{ SOURCE_NAME[code] }}
                  </ToggleChip>
                </div>
              </template>
              <!-- Inside the sheet, as a list box's notice: a card in the
                   sheet would be a box in a box (`ListBoxNotice`). -->
              <ListBoxNotice
                v-if="!rows.length"
                title="Kein Rechtsakt, den ein Entwurf aus dieser Auswahl umsetzt."
              >
                <template #action>
                  <button type="button" class="link-inline text-sm" @click="choose([])">
                    Alle Quellen zeigen
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
            <!-- The acts drafts only restate (D4): apart, closed, the same rows. -->
            <FoldSection v-if="restatingRows.length" :heading="restatingFoldHeading(restatingRows.length)" class="mt-6">
              <div class="pb-2">
                <ListBox>
                  <ul role="list" class="divide-y divide-hairline">
                    <EuActRow v-for="row in shownRestating" :key="row.key" :row="row" level="h4" />
                  </ul>
                  <ListMore
                    :visible="visibleRestating"
                    :total="restatingRows.length"
                    :step="STEP"
                    @more="visibleRestating += STEP"
                    @all="visibleRestating = restatingRows.length"
                  />
                </ListBox>
              </div>
            </FoldSection>
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
