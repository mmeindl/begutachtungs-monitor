<script setup lang="ts">
import type { AmendedLawsResponse, RvStatementsResponse, VorlageDetail } from '#shared/types'
import type { ComparisonId, StationId } from '~/utils/spine'
import { lastParliamentStation, parliamentTexts, vorlageStations, vorlageStatusDe, SECOND_ROUND_CLAUSE } from '~/utils/spine'
import { citeLineDe, rvCitationDe } from '#shared/utils/citations'
import { GP_RE, parseInr } from '#shared/utils/gp'
import { countLabelDe, formatDateDe } from '#shared/utils/format'
import { itypOfKind, vorlageApiBase } from '#shared/utils/procedureRoot'

/**
 * The page of a law that came to the Nationalrat without a Begutachtung — a
 * Regierungsvorlage (`/entwuerfe/<GP>/vorlage/<nr>`) or a selbständiger
 * Antrag (`/entwuerfe/<GP>/antrag/<nr>`), docs/architecture.md §12.69.
 *
 * ONE FILE FOR BOTH, with the kind as a validated segment: the two differ in
 * a handful of words and in which sections have something to show, not in
 * structure, and two thin files over one component would be a third file for
 * the same page. The draft page's sections stand in the draft page's order,
 * minus the ones that need a Ministerialentwurf: no Begutachtung, no Frist,
 * no draft documents.
 */
definePageMeta({
  // One address per item, as on the draft page: lowercased or zero-padded
  // links 301 to the canonical one, query and anchor kept.
  middleware: [
    (to) => {
      const gpParam = String(to.params.gp ?? '')
      const kindParam = String(to.params.kind ?? '')
      const inrParam = String(to.params.inr ?? '')
      const gp = gpParam.toUpperCase()
      const kind = kindParam.toLowerCase()
      const inr = parseInr(inrParam)
      if (!GP_RE.test(gp) || !itypOfKind(kind) || inr === null) return
      if (gpParam !== gp || kindParam !== kind || inrParam !== String(inr)) {
        return navigateTo({ path: `/entwuerfe/${gp}/${kind}/${inr}`, query: to.query, hash: to.hash }, { redirectCode: 301 })
      }
    },
  ],
  validate: (route) =>
    GP_RE.test(String(route.params.gp ?? '').toUpperCase()) &&
    itypOfKind(String(route.params.kind ?? '').toLowerCase()) !== null &&
    parseInr(String(route.params.inr ?? '')) !== null,
})

const route = useRoute()
const gp = computed(() => String(route.params.gp ?? ''))
const ityp = computed(() => itypOfKind(String(route.params.kind ?? '')) ?? 'I')
const inr = computed(() => Number(route.params.inr ?? 0))
const url = computed(() => vorlageApiBase(gp.value, ityp.value, inr.value))
const isAntrag = computed(() => ityp.value === 'A')

const { data, error, refresh, status } = await useFetch<VorlageDetail>(url, { lazy: true })

const notFound = () => createError({ statusCode: 404, statusMessage: 'Vorlage nicht gefunden', fatal: true })
if (error.value?.statusCode === 404 || error.value?.statusCode === 400) throw notFound()
watch(error, (e) => {
  if (e?.statusCode === 404 || e?.statusCode === 400) showError(notFound())
})

/* A Vorlage whose record names its Ministerialentwurf belongs to that
 * draft's page, which tells the Vorlage's story from the Begutachtung on —
 * a permanent redirect, so the item has one address. On the server before
 * anything renders; after a client-side click once the record arrives. */
if (data.value?.draftPath) await navigateTo(data.value.draftPath, { redirectCode: 301, replace: true })
watch(() => data.value?.draftPath, (path) => {
  if (path) navigateTo(path, { replace: true })
})

/* The Stellungnahmen to the Nationalrat — client-side, like the draft
 * page's Vorlage block: list 142 must not sit in the SSR path. */
const { data: statements } = await useFetch<RvStatementsResponse>(() => `${url.value}/stellungnahmen`, {
  lazy: true,
  server: false,
})

/* The laws in force the item would change, read off its own first text —
 * client-side and lazy, as on the draft page. */
const { data: amendedLaws } = await useFetch<AmendedLawsResponse>(() => `${url.value}/geltendesrecht`, {
  lazy: true,
  server: false,
})

/* A Vorlage's own Textgegenüberstellung and Erläuterungen. Not for an
 * Antrag: its annex and its Begründung are open experiments (§12.69). */
const showsAnnex = computed(() => !isAntrag.value && !amendedLaws.value?.createsNewLaw)

const kindWord = computed(() => (isAntrag.value ? 'Initiativantrag' : 'Regierungsvorlage'))

const stationList = computed(() =>
  data.value
    ? vorlageStations(data.value, {
        createsNewLaw: amendedLaws.value?.createsNewLaw,
        amendedLawCount: amendedLaws.value?.laws.length,
        statementTotal: statements.value?.total,
        showsAnnex: showsAnnex.value,
      })
    : [],
)
const parliamentTextList = computed(() => (data.value ? parliamentTexts(data.value) : []))
const parliamentStation = computed(() => (data.value ? lastParliamentStation(data.value) : null))
/* The procedure's first text, where every comparison on this page starts. */
const origin = computed(() => (isAntrag.value ? 'antrag' as const : 'rv' as const))
const comparisonAnchors = computed<Partial<Record<ComparisonId, string>>>(() => ({
  ...(showsAnnex.value ? { vorschlag: '#gegenueberstellung' } : {}),
  ...(parliamentStation.value ? { parlament: '#textvergleich-parlament' } : {}),
}))

/* Which station sections render — the bar's anchors read the same. */
const sections = computed(() => {
  const d = data.value
  const e = d?.enactment ?? null
  return {
    parlament: e,
    bgbl: e && (e.bgblNumber || e.successor?.bgblNumber) ? e : null,
  }
})
const stationAnchors = computed<Partial<Record<StationId, string>>>(() => {
  if (!data.value) return {}
  return {
    rv: '#entwurf',
    ...(sections.value.parlament ? { parlament: '#parlament' } : {}),
    ...(sections.value.bgbl ? { bgbl: '#bundesgesetzblatt' } : {}),
  }
})

/* Who brought it in, as one sentence: the Ressort for a Vorlage, the clubs
 * of the movers for an Antrag — never a deputy's name. */
const byline = computed(() => {
  const d = data.value
  if (!d) return null
  if (d.ityp === 'I') return d.ministry ? `Eingebracht von der Bundesregierung, ${d.ministry}` : 'Eingebracht von der Bundesregierung'
  const clubs = d.moverClubs
  if (!clubs?.length) return 'Eingebracht von Abgeordneten'
  const list = clubs.length < 2 ? clubs[0] : `${clubs.slice(0, -1).join(', ')} und ${clubs.at(-1)}`
  return `Eingebracht von Abgeordneten von ${list}`
})

/* The citation a footnote uses: „RV 589 BlgNR 28. GP" for a Vorlage; an
 * Antrag is no Beilage. */
const citeAs = computed(() => {
  const d = data.value
  if (!d) return ''
  return d.ityp === 'I' ? rvCitationDe(d.citation, d.gp) : `Antrag ${d.citation} ${d.gp}. GP`
})

const filingOpen = computed(() => Boolean(data.value?.enactment.filingOpen))

/* „Der Ausschuss für … hat am … beschlossen, schriftliche Stellungnahmen
 * einzuholen, und dafür 58 Stellen angeschrieben (Ausschussbegutachtung)." —
 * the statements block's words, as a fact of the procedure. */
const committeeSentence = computed(() => {
  const c = data.value?.committeeConsultation
  if (!c) return ''
  const who = c.committee ? `Der ${c.committee}` : 'Der Ausschuss'
  const when = c.date ? ` am ${formatDateDe(c.date)}` : ''
  const whom = c.invited > 0 ? `, und dafür ${countLabelDe(c.invited, 'Stelle', 'Stellen')} angeschrieben` : ''
  return `${who} hat${when} selbst beschlossen, schriftliche Stellungnahmen einzuholen${whom} (Ausschussbegutachtung).`
})

useSeoMeta({
  title: () => (data.value ? `${data.value.citation}: ${data.value.title}` : kindWord.value),
  description: () =>
    data.value
      ? `${kindWord.value} ${data.value.citation}: Verlauf im Nationalrat, Stellungnahmen und Kundmachung.`
      : 'Ein Gesetzesvorschlag im Nationalrat.',
  ogTitle: () => data.value?.title ?? kindWord.value,
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <FetchGate
      :status="status"
      :error="error"
      :data="data"
      :loading-label="`${kindWord} wird geladen …`"
      @retry="refresh()"
    >
      <template #loading="{ label }">
        <DraftSkeleton :label="label" />
      </template>
      <template #default="{ data }">
        <article>
          <BackLink to="/entwuerfe" label="Alle Entwürfe" />
          <DraftHeader :title="data.title">
            <template #source>
              <span class="inline-flex flex-wrap items-center gap-x-4">
                <ExternalLink :href="data.parliamentUrl" class="link-inline tap-target">Auf parlament.gv.at ansehen</ExternalLink>
                <CiteButton
                  :text="citeLineDe(citeAs, data.officialTitle ?? data.title, data.parliamentUrl)"
                  :subject="isAntrag ? 'Den Antrag' : 'Die Regierungsvorlage'"
                />
              </span>
            </template>
            <template #identity>
              <span class="text-sm font-medium text-ink-muted">
                <span class="text-ink">{{ kindWord }}</span> {{ data.citation }}
              </span>
            </template>
            <p v-if="data.officialTitle && data.officialTitle !== data.title" class="mt-1 text-sm text-ink-secondary">
              {{ data.officialTitle }}
            </p>
            <p v-if="byline" class="mt-2 text-sm text-ink-secondary">{{ byline }}</p>
          </DraftHeader>

          <!-- The fact, where the evidence carries it — the list's sentence,
               said of this one law. Nowhere else does the page say anything
               about a Begutachtung, in either direction. -->
          <!-- The committee's own consultation, where the item's record shows
               one — in place of the sentence below, never beside it. -->
          <p v-if="data.committeeConsultation" class="mt-4 text-sm text-ink-secondary">
            Vor {{ isAntrag ? 'diesem Antrag' : 'dieser Regierungsvorlage' }} ist kein Ministerialentwurf
            in Begutachtung erkennbar. {{ committeeSentence }}
          </p>
          <p v-else-if="data.withoutBegutachtung" class="mt-4 text-sm text-ink-secondary">
            Vor {{ isAntrag ? 'diesem Antrag' : 'dieser Regierungsvorlage' }} ist kein Ministerialentwurf
            in Begutachtung erkennbar – vorgeschrieben ist eine Begutachtung nicht.
            Stellungnahmen an den Nationalrat {{ filingOpen ? 'sind' : 'waren' }} während des
            Verfahrens möglich (§ 23b GOG-NR).
          </p>

          <ProcedureCard
            :status="vorlageStatusDe(data)"
            :stations="stationList"
            :anchors="stationAnchors"
            :comparison-anchors="comparisonAnchors"
          />

          <!-- The door while the Nationalrat takes Stellungnahmen, as on the
               draft page for an open Vorlage: no date, because upstream
               publishes none. -->
          <DraftDoorCard
            v-if="filingOpen"
            :frist="false"
            :deadline="null"
          >
            <template #heading>
              Stellungnahme {{ isAntrag ? 'zum Antrag' : 'zur Regierungsvorlage' }} {{ data.citation }} möglich
            </template>
            <p class="mt-2 text-sm text-ink-secondary">
              Ohne Frist – {{ SECOND_ROUND_CLAUSE }}.
            </p>
            <template #actions>
              <DoorButton :href="data.parliamentUrl">
                Stellungnahme auf parlament.gv.at abgeben
              </DoorButton>
            </template>
          </DraftDoorCard>

          <section id="entwurf" class="page-section scroll-mt-6" aria-labelledby="entwurf-heading">
            <h2 id="entwurf-heading" class="section-heading">Der Entwurf</h2>
            <div class="mt-4 space-y-8">
              <!-- The law in force it would change, as on the draft page. -->
              <EntwurfFrame :laws="amendedLaws" />
              <template v-if="!isAntrag">
                <PageSubsection v-if="showsAnnex" id="gegenueberstellung" heading="Was ändert der Entwurf?">
                  <TextComparisonSection :gp="data.gp" :inr="data.inr" :api-base="url" without-layers />
                </PageSubsection>
                <PageSubsection id="erlaeuterungen" heading="Was das Ressort begründet">
                  <ExplanationsSection :gp="data.gp" :inr="data.inr" :api-base="url" />
                </PageSubsection>
              </template>
              <FoldSection
                v-if="data.documents.length"
                :heading="`Dokumente (${data.documents.length})`"
              >
                <div class="pb-2">
                  <DocumentList
                    :documents="data.documents"
                    :cite-as="citeAs"
                    :author="isAntrag ? 'der Antragsteller:innen' : 'des Ministeriums'"
                  />
                </div>
              </FoldSection>
            </div>
          </section>

          <!-- Client-side data: the section appears once it is there and says
               nothing while it is not — an empty heading would read as „none". -->
          <section v-if="statements" id="stellungnahmen" class="page-section scroll-mt-6" aria-labelledby="stellungnahmen-heading">
            <h2 id="stellungnahmen-heading" class="section-heading">Stellungnahmen an den Nationalrat</h2>
            <div class="mt-4">
              <RvStatements
                :data="statements"
                :filing-open="filingOpen"
                :item="isAntrag ? 'antrag' : 'rv'"
                bare
              />
            </div>
          </section>

          <ParliamentStationSection
            v-if="sections.parlament"
            :draft="data"
            :enactment="sections.parlament"
            :item="isAntrag ? 'antrag' : 'rv'"
            :show-diff="Boolean(parliamentStation)"
            :parliament-texts="parliamentTextList"
            :api-base="url"
            :origin="origin"
          />

          <BgblStationSection
            v-if="sections.bgbl"
            :enactment="sections.bgbl"
            :gp="data.gp"
            :inr="data.inr"
            :parliament-texts="parliamentTextList"
            :api-base="url"
            :origin="origin"
          />
        </article>
      </template>
    </FetchGate>
  </div>
</template>
