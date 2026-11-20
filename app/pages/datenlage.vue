<script setup lang="ts">
/**
 * Datenlage (14.11.2026): what the EU, the Bund and each Land publish for
 * each step of following a law, and the reason where something is missing.
 * The facts are `shared/utils/datenlage.ts`; this page only lays them out.
 *
 * Two readers. Someone who wonders why a draft page shows a gap, and a Land
 * the maintainer sends the link to — `/datenlage#tirol` — so it sees its own
 * state, the other Länder's, and what would close a gap. So the page
 * describes and never grades: no totals, no order but the levels and the
 * alphabet, and every missing piece says in words whether the source does
 * not publish it or the monitor does not read it yet. Only the first is the
 * source's.
 *
 * TWO VIEWS of the same cells, chosen in `?ansicht=` so a view is linkable
 * and server-rendered: by source (the default, so a bare `#tirol` lands on
 * its block) and by step, each step's sources grouped by state. No table:
 * eleven columns fit no text column, and a table that scrolls sideways hides
 * the sources on the right (`laenderCoverage.ts`).
 *
 * States ride on words, never on colour: blue is for what a reader can do,
 * yellow is the highlighter, and neither means a state.
 */
import {
  DATENLAGE_DEFAULT_VIEW,
  DATENLAGE_BEDARF_ID,
  DATENLAGE_FIGURES,
  DATENLAGE_LAW_STATES,
  DATENLAGE_OBJECT_DE,
  DATENLAGE_OBJECTS,
  DATENLAGE_OUTSIDE_STATES,
  DATENLAGE_PHASES,
  DATENLAGE_SOURCES,
  DATENLAGE_STATE_META,
  DATENLAGE_STATE_ORDER,
  DATENLAGE_STEPS,
  DATENLAGE_VIEW_PARAM,
  datenlageByState,
  datenlageFigureSourceName,
  datenlageBedarf,
  datenlageBedarfDateDe,
  datenlageStepLabel,
  parseDatenlageView,
  type DatenlageCell,
  type DatenlageStep,
  type DatenlageView,
} from '#shared/utils/datenlage'
import { GENAUIGKEIT_PATH } from '#shared/utils/genauigkeit'

usePageSeo({
  title: 'Datenlage',
  description:
    'Was die EU, der Bund und die neun Länder zu den Schritten veröffentlichen, die der Monitor verfolgt – und wo etwas fehlt, ob die Quelle es nicht veröffentlicht oder der Monitor es noch nicht liest.',
})

const route = useRoute()
const router = useRouter()

/* `replace`, not `push`, as the step toggle of the § comparison does: the
   view belongs in the URL so it can be sent, but flipping between the two
   should not fill the back button. The default leaves the query empty. The
   hash goes: a change of the query without a hash never scrolls
   (`app/router.options.ts`), while a kept `#tirol` would scroll to an anchor
   the other view does not have. */
const view = computed<DatenlageView>({
  get: () => parseDatenlageView(route.query[DATENLAGE_VIEW_PARAM]),
  set: (value) => {
    const { [DATENLAGE_VIEW_PARAM]: _old, ...rest } = route.query
    void router.replace({ query: value === DATENLAGE_DEFAULT_VIEW ? rest : { ...rest, [DATENLAGE_VIEW_PARAM]: value } })
  },
})

const viewOptions: { value: DatenlageView; label: string }[] = [
  { value: 'quelle', label: 'Nach Quelle' },
  { value: 'schritt', label: 'Nach Schritt' },
]

const bedarf = datenlageBedarf()

const stepsById = new Map(DATENLAGE_STEPS.map((s) => [s.key, s]))
const stepInfo = (key: DatenlageStep) => stepsById.get(key)!

/* The legend in the halves the page is about: whose gap a state is. The
   law step's states stand apart (14.11.2026): a legal fact is nobody's gap. */
const legend = [
  { heading: 'Was das Recht vorschreibt', states: DATENLAGE_LAW_STATES },
  { heading: 'Was die Quelle veröffentlicht', states: DATENLAGE_STATE_ORDER.filter((s) => !DATENLAGE_OUTSIDE_STATES.includes(s) && !DATENLAGE_LAW_STATES.includes(s) && DATENLAGE_STATE_META[s].owner !== 'monitor') },
  { heading: 'Was der Monitor liest', states: DATENLAGE_STATE_ORDER.filter((s) => DATENLAGE_STATE_META[s].owner === 'monitor') },
  // 16.11.2026, „Was nicht geprüft ist" until then: the EU's own procedure joined what nobody surveyed.
  { heading: 'Was diese Übersicht nicht sagt', states: DATENLAGE_OUTSIDE_STATES },
]

/** The cell's text, unless it only repeats its state („nicht erhoben"). */
function cellText(cell: DatenlageCell): string | undefined {
  return cell.text === DATENLAGE_STATE_META[cell.state].label ? undefined : cell.text
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="page-title">
      Datenlage
    </h1>
    <p class="mt-3 leading-relaxed text-ink-secondary">
      Was die EU, der Bund und die neun Länder zu den Schritten
      veröffentlichen, die der Monitor verfolgt. Wo etwas fehlt, steht dabei, warum – und ob die Quelle
      es nicht veröffentlicht oder der Monitor es noch nicht liest.
    </p>

    <ProseSection id="angaben" heading="Was die Angaben heißen" first>
      <!-- Three short lists, not one: the first two halves are the
           distinction the page exists for, and a reader should see it before
           reading a single cell. -->
      <div class="mt-4 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
        <section v-for="group in legend" :key="group.heading" :aria-label="group.heading">
          <h3 class="font-semibold text-ink">{{ group.heading }}</h3>
          <dl class="mt-1 space-y-2">
            <div v-for="state in group.states" :key="state">
              <dt class="font-medium text-ink">{{ DATENLAGE_STATE_META[state].label }}</dt>
              <dd class="text-ink-secondary">{{ DATENLAGE_STATE_META[state].meaning }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </ProseSection>

    <ProseSection id="uebersicht" heading="Quelle für Quelle, Schritt für Schritt">
      <ListTabs v-model="view" :options="viewOptions" group-label="Ansicht" class="mt-4 border-b border-hairline" />

      <!-- By source: one block per source, the per-Land dl of the former
           /so-funktionierts#laender with a state line under each cell. -->
      <div v-if="view === 'quelle'" class="mt-6 space-y-10">
        <section
          v-for="source in DATENLAGE_SOURCES"
          :id="source.id"
          :key="source.key"
          :aria-labelledby="`${source.id}-heading`"
          class="scroll-mt-6"
        >
          <h3 :id="`${source.id}-heading`" class="text-lg font-semibold text-ink">{{ source.name }}</h3>
          <p class="mt-1 text-sm leading-relaxed text-ink-secondary">{{ source.summary }}</p>
          <dl class="mt-3 divide-y divide-hairline border-y border-hairline text-sm">
            <div
              v-for="step in DATENLAGE_STEPS"
              :key="step.key"
              class="py-2 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-x-4"
            >
              <dt class="text-ink-secondary">{{ step.label }}</dt>
              <dd class="mt-0.5 sm:mt-0">
                <span v-if="cellText(source.cells[step.key])" class="block text-ink">{{ cellText(source.cells[step.key]) }}</span>
                <span class="block text-ink-secondary">
                  <span class="font-medium">{{ DATENLAGE_STATE_META[source.cells[step.key].state].label }}</span><template v-if="source.cells[step.key].reason">: {{ source.cells[step.key].reason }}</template>
                </span>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <!-- By step: for each step, the sources grouped by state, and what
           would close the gap. -->
      <div v-else class="mt-6 space-y-10">
        <section
          v-for="phase in DATENLAGE_PHASES"
          :id="phase.id"
          :key="phase.id"
          :aria-labelledby="`${phase.id}-heading`"
          class="scroll-mt-6"
        >
          <h3 :id="`${phase.id}-heading`" class="text-lg font-semibold text-ink">{{ phase.label }}</h3>
          <section
            v-for="key in phase.steps"
            :id="stepInfo(key).id"
            :key="key"
            :aria-labelledby="`${stepInfo(key).id}-heading`"
            class="mt-5 scroll-mt-6 border-t border-hairline pt-4"
          >
            <h4 :id="`${stepInfo(key).id}-heading`" class="text-base font-semibold text-ink">{{ stepInfo(key).label }}</h4>
            <p class="mt-1 text-sm text-ink-secondary">{{ stepInfo(key).question }}</p>
            <dl class="mt-3 space-y-3 text-sm">
              <div v-for="group in datenlageByState(key)" :key="group.state">
                <dt class="font-medium text-ink">{{ DATENLAGE_STATE_META[group.state].label }}</dt>
                <dd>
                  <ul class="mt-1 space-y-1 text-ink-secondary">
                    <li v-for="entry in group.entries" :key="entry.source.key">
                      <span class="text-ink">{{ entry.source.name }}</span><template v-if="cellText(entry.cell)">: {{ cellText(entry.cell) }}</template><template v-if="entry.cell.reason"> – {{ entry.cell.reason }}</template>
                    </li>
                  </ul>
                </dd>
              </div>
            </dl>
            <p v-if="stepInfo(key).target" class="mt-3 text-sm text-ink-secondary">
              <span class="font-medium text-ink">Ziel für die Länder:</span> {{ stepInfo(key).target }}
            </p>
          </section>
        </section>
      </div>
    </ProseSection>

    <!-- The objects that are no drafts — the EU's lawmaking (16.11.2026)
         and the Anliegen an das Parlament (15.11.2026): no cells, but what
         is covered, from which source, and each gap with its reason, in the
         sources' grammar. Their figures stand here and not under
         „Gemessen": that list is keyed by the draft's steps, which these
         objects do not walk. -->
    <ProseSection v-for="object in DATENLAGE_OBJECTS" :id="object.id" :key="object.id" :heading="object.name">
      <p>{{ object.summary }}</p>
      <dl class="mt-4 divide-y divide-hairline border-y border-hairline text-sm">
        <div class="py-2 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-x-4">
          <dt class="text-ink-secondary">{{ DATENLAGE_OBJECT_DE.covered }}</dt>
          <dd class="mt-0.5 sm:mt-0">
            <span v-for="line in object.covered" :key="line" class="block text-ink">{{ line }}</span>
          </dd>
        </div>
        <div class="py-2 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-x-4">
          <dt class="text-ink-secondary">{{ DATENLAGE_OBJECT_DE.sources }}</dt>
          <dd class="mt-0.5 sm:mt-0">
            <span v-for="line in object.sources" :key="line" class="block text-ink">{{ line }}</span>
          </dd>
        </div>
        <div class="py-2 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-x-4">
          <dt class="text-ink-secondary">{{ DATENLAGE_OBJECT_DE.notCovered }}</dt>
          <dd class="mt-0.5 sm:mt-0">
            <ul class="list-none space-y-2 pl-0">
              <li v-for="gap in object.notCovered" :key="gap.what">
                <span class="block text-ink">{{ gap.what }}</span>
                <span class="block text-ink-secondary">{{ gap.why }}</span>
              </li>
            </ul>
          </dd>
        </div>
      </dl>
      <ul class="mt-4 list-none space-y-3 pl-0 text-sm">
        <li v-for="figure in object.figures" :key="figure.text">
          <span class="font-medium text-ink">{{ DATENLAGE_OBJECT_DE.measured }}</span>
          <span class="block text-ink-secondary">{{ figure.text }}</span>
          <span class="block text-ink-secondary">{{ figure.population }}, {{ figure.date }}</span>
        </li>
      </ul>
      <p class="mt-4 text-sm">
        <NuxtLink :to="object.link.href" class="link-inline">{{ object.link.label }}</NuxtLink>
      </p>
    </ProseSection>

    <!-- What the text comparison would need from a source (20.11.2026): the
         other side of /genauigkeit, in the object blocks' grammar. -->
    <ProseSection :id="DATENLAGE_BEDARF_ID" heading="Was der Textvergleich bräuchte">
      <p>
        Wie viel der Monitor von einer Änderung zeigen kann, hängt an dem,
        was die Quellen veröffentlichen. Mit diesen Angaben könnte er mehr
        zeigen und sicherer prüfen. Die Zahlen sind die der Seite
        <NuxtLink :to="GENAUIGKEIT_PATH" class="link-inline">Genauigkeit</NuxtLink>,
        gemessen am {{ datenlageBedarfDateDe() }}.
      </p>
      <dl class="mt-4 divide-y divide-hairline border-y border-hairline text-sm">
        <div v-for="group in bedarf" :key="group.from" class="py-2 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-x-4">
          <dt class="text-ink-secondary">{{ group.from }}</dt>
          <dd class="mt-0.5 sm:mt-0">
            <ul class="list-none space-y-2 pl-0">
              <li v-for="need in group.needs" :key="need.what">
                <span class="block text-ink">{{ need.what }}</span>
                <span class="block text-ink-secondary">{{ need.today }}</span>
              </li>
            </ul>
          </dd>
        </div>
      </dl>
    </ProseSection>

    <!-- The measured figures, one compact block: each with what was counted
         and when, never re-derived here. -->
    <ProseSection id="gemessen" heading="Gemessen">
      <p>
        Die Zahlen hinter einzelnen Angaben, jede mit dem, was gezählt wurde,
        und dem Tag der Messung. Wie genau der Monitor selbst Texte
        vergleicht, steht unter
        <NuxtLink :to="GENAUIGKEIT_PATH" class="link-inline">Genauigkeit</NuxtLink>.
      </p>
      <ul class="mt-4 list-none space-y-3 border-y border-hairline py-3 pl-0 text-sm">
        <li v-for="(figure, i) in DATENLAGE_FIGURES" :key="i">
          <span class="font-medium text-ink">{{ datenlageFigureSourceName(figure.source) }} · {{ datenlageStepLabel(figure.step) }}</span>
          <span class="block text-ink-secondary">{{ figure.text }}</span>
          <span class="block text-ink-secondary">{{ figure.population }}, {{ figure.date }}</span>
        </li>
      </ul>
    </ProseSection>
  </div>
</template>
