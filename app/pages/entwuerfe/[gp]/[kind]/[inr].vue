<script setup lang="ts">
import { wegFor, wegHref } from '~/utils/wege'
import type { AmendedLawsResponse, RvStatementsResponse, VorlageDetail } from '#shared/types'
import type { ComparisonId, StationId } from '~/utils/spine'
import { lastParliamentStation, parliamentTexts, vorlageStations, vorlageStatusDe, SECOND_ROUND_CLAUSE } from '~/utils/spine'
import { citeLineDe } from '#shared/utils/citations'
import { firstTextNameOf } from '#shared/utils/lawStations'
import { GP_RE, parseInr } from '#shared/utils/gp'
import { itemKindOfSegment, itemPath, itypOfKind, segmentOfItemKind, vorlageApiBase } from '#shared/utils/procedureRoot'
import { NOT_FOLLOWED_DE, notFollowedOf, type NotFollowed } from '~/utils/notFollowed'
import { NO_COMPARISON_DE, carriedDraftDe, filingClosedDe, filingClosedSourceDe, itemBylineDe, itemCiteAsDe, itemCopyDe } from '~/utils/itemKind'

/**
 * The page of a law that came to the Nationalrat without a Begutachtung — a
 * Regierungsvorlage (`/entwuerfe/<GP>/vorlage/<nr>`), a selbständiger
 * Antrag (`/entwuerfe/<GP>/antrag/<nr>`) or, since 14.11.2026, a committee's
 * motion (`/entwuerfe/<GP>/ausschussantrag/<nr>`), a motion of the
 * Bundesrat (`/entwuerfe/<GP>/bundesratsantrag/<nr>`) or a treaty's Vorlage
 * (`/entwuerfe/<GP>/staatsvertrag/<nr>`, a Staatsvertrag or an
 * Art.-15a-Vereinbarung)
 *
 * THE ADDRESS NAMES THE KIND (decision 4 of 14.11.2026). Every kind of type
 * `I` shares one number space, so `/vorlage/14` and `/ausschussantrag/14`
 * read the same record; which one is the item's address only its document
 * type says, and once the record is there the other one 301s to it.
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
/** The map card's way out: the overview of all paths; this page's own row
 *  only where the law came without a Begutachtung (`wegFor`). */
const vorlageWeg = computed(() => {
  const d = data.value
  const id = d ? wegFor({ source: 'vorlage', ityp: d.ityp, withoutBegutachtung: d.withoutBegutachtung, itemKind: d.itemKind }) : null
  return id ? wegHref(id) : '/wege'
})
const isAntrag = computed(() => ityp.value === 'A')
/** What the item is, from its record — the route's segment until it arrives. */
const itemKind = computed(() => data.value?.itemKind ?? itemKindOfSegment(String(route.params.kind ?? '')) ?? 'regierungsvorlage')
/** Its words, a third of the Bundesrat's members told from the Bundesrat (`itemCopyDe`). */
const kindCopy = computed(() => itemCopyDe({ itemKind: itemKind.value, variant: data.value?.variant, treatyKind: data.value?.treatyKind }))
/** A treaty's Vorlage (`RVS`, step 5 of 14.11.2026): no Stellungnahmen, no
 *  text comparison, no law in force it changes. */
const isTreaty = computed(() => itemKind.value === 'staatsvertrag')
const isCommitteeMotion = computed(() => itemKind.value === 'ausschussantrag')
/** A motion of the Bundesrat (`GABR`, `GABR13`; 14.11.2026). */
const isBundesratMotion = computed(() => itemKind.value === 'bundesratsantrag')
/** Whose text „Im Parlament" and the Stellungnahmen speak of. */
const parliamentItem = computed(() =>
  isCommitteeMotion.value
    ? 'ausschussantrag' as const
    : isBundesratMotion.value
      ? 'bundesratsantrag' as const
      : isAntrag.value ? 'antrag' as const : 'rv' as const,
)
/* The term under the rail (`TERMS`): the committee's own consultation, or
 * „ohne Begutachtung" on the list's evidence — the facts `vorlageStations`
 * states; none where the rail says „nicht feststellbar". */
const begutachtungTerm = computed(() => {
  const d = data.value
  if (!d) return null
  if (d.committeeConsultation) return 'ausschussbegutachtung' as const
  return d.withoutBegutachtung ? 'ohne-begutachtung-bund' as const : null
})

const { data, error, refresh, status } = await useFetch<VorlageDetail>(url, { lazy: true })

/* A 404 is one of two things (14.11.2026): Parliament has no such item, or it
 * has one the monitor does not follow — then the refusal carries the item's
 * page at Parliament, and for an Einspruch of the Bundesrat the page of its
 * law, which this address leads to (`notFollowedOf`). */
const notFound = (refusal: NotFollowed | null) => createError({
  statusCode: 404,
  statusMessage: refusal ? NOT_FOLLOWED_DE.title : 'Gegenstand nicht gefunden',
  data: refusal ?? undefined,
  fatal: true,
})
if (error.value?.statusCode === 404 || error.value?.statusCode === 400) {
  const refusal = notFollowedOf(error.value)
  if (refusal?.followedAt) await navigateTo(refusal.followedAt, { redirectCode: 301, replace: true })
  else throw notFound(refusal)
}
watch(error, (e) => {
  if (e?.statusCode !== 404 && e?.statusCode !== 400) return
  const refusal = notFollowedOf(e)
  if (refusal?.followedAt) navigateTo(refusal.followedAt, { replace: true })
  else showError(notFound(refusal))
})

/* A Vorlage whose record names its Ministerialentwurf belongs to that
 * draft's page, which tells the Vorlage's story from the Begutachtung on —
 * a permanent redirect, so the item has one address. On the server before
 * anything renders; after a client-side click once the record arrives. */
if (data.value?.draftPath) await navigateTo(data.value.draftPath, { redirectCode: 301, replace: true })
watch(() => data.value?.draftPath, (path) => {
  if (path) navigateTo(path, { replace: true })
})

/* The address names the kind: a committee's motion under `/vorlage/`, or a
 * Regierungsvorlage under `/ausschussantrag/`, moves to its own segment —
 * permanently, query and anchor kept. */
const canonicalPath = computed(() => {
  const d = data.value
  if (!d || d.draftPath) return null
  return String(route.params.kind ?? '') === segmentOfItemKind(d.itemKind) ? null : itemPath(d.gp, d.itemKind, d.inr)
})
if (canonicalPath.value) {
  await navigateTo({ path: canonicalPath.value, query: route.query, hash: route.hash }, { redirectCode: 301, replace: true })
}
watch(canonicalPath, (path) => {
  if (path) navigateTo({ path, query: route.query, hash: route.hash }, { replace: true })
})

/* The Stellungnahmen to the Nationalrat — client-side, like the draft
 * page's Vorlage block: list 142 must not sit in the SSR path. */
const { data: statements } = await useFetch<RvStatementsResponse>(() => `${url.value}/stellungnahmen`, {
  lazy: true,
  server: false,
  // Parliament takes none on a treaty's Vorlage (`ItemFiling`): not asked.
  enabled: computed(() => !isTreaty.value),
})

/* The laws in force the item would change, read off its own first text —
 * client-side and lazy, as on the draft page. */
const { data: amendedLaws } = await useFetch<AmendedLawsResponse>(() => `${url.value}/geltendesrecht`, {
  lazy: true,
  server: false,
  // A Vertragstext amends no law in force: not asked for a treaty.
  enabled: computed(() => !isTreaty.value),
})

/* The item's own Textgegenüberstellung — a Vorlage's from the ressort, an
 * Antrag's Parliament's working copy (12.11.2026). The Erläuterungen only
 * for a Vorlage: an Antrag's Begründung stands inside the Antrag. A
 * committee's motion has neither (its record carries the Bericht and the
 * Gesetzestext, read 14.11.2026), nor has a motion of the Bundesrat (the
 * Gesetzestext and a Begründung, or the Gesetzesantrag alone: 21 and 1940
 * d.B. XXVII). */
const showsAnnex = computed(() => !isCommitteeMotion.value && !isBundesratMotion.value && !isTreaty.value && !amendedLaws.value?.createsNewLaw)
/* Why a kind shows no text comparison, where it shows none (`NO_COMPARISON_DE`). */
const noComparison = computed(() => NO_COMPARISON_DE[itemKind.value] ?? null)
/* The first text's own name in every comparison on the page — „Ausschussantrag",
 * „Gesetzesantrag des Bundesrates" —, where its station's („Regierungsvorlage")
 * would be false (`firstTextNameOf`). */
const firstText = computed(() => firstTextNameOf({ itemKind: itemKind.value, variant: data.value?.variant }))

const kindWord = computed(() => kindCopy.value.word)

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
  ...(parliamentStation.value && !noComparison.value ? { parlament: '#textvergleich-parlament' } : {}),
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
    ...(data.value.committeeConsultation ? { begutachtung: '#stellungnahmen' } : {}),
    rv: '#entwurf',
    ...(sections.value.parlament ? { parlament: '#parlament' } : {}),
    ...(sections.value.bgbl ? { bgbl: '#bundesgesetzblatt' } : {}),
  }
})

/* Who brought it in, as one sentence (`itemBylineDe`) — never a deputy's name. */
const byline = computed(() => (data.value ? itemBylineDe(data.value) : null))

/* The citation a footnote uses (`itemCiteAsDe`): „RV 589 BlgNR 28. GP", „AB
 * 14 BlgNR 28. GP"; an Antrag is no Beilage. */
const citeAs = computed(() => (data.value ? itemCiteAsDe(data.value) : ''))

/* An Antrag that carries a consulted draft's text: the frame's row naming
 * the draft (decision 9 of 14.11.2026, `carriedDraftDe`) — the one place
 * the sentence stands; the rail's Begutachtung station keeps its short fact
 * (`vorlageStations`). */
const carriedDraft = computed(() => (data.value ? carriedDraftDe(data.value)?.line ?? null : null))

const filingOpen = computed(() => Boolean(data.value?.enactment.filingOpen))

useSeoMeta({
  title: () => (data.value ? `${data.value.citation}: ${data.value.title}` : kindWord.value),
  description: () =>
    data.value
      ? `${kindWord.value} ${data.value.citation}: Verlauf im Nationalrat${data.value.filing.possible ? ', Stellungnahmen' : ''} und Kundmachung.`
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
                  :subject="kindCopy.subject"
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

          <!-- What is known about a Begutachtung stands once, as the card's
               first station (`vorlageStations`, 10.11.2026): pale „keine ·
               kein Ministerialentwurf" on the list's evidence, the committee's
               own consultation as an ordinary station, pale „nicht
               feststellbar" otherwise. The sentence that stood here said the
               same fact a second time. -->

          <ProcedureCard
            :status="vorlageStatusDe(data)"
            :stations="stationList"
            :how-to="vorlageWeg"
            :anchors="stationAnchors"
            :comparison-anchors="comparisonAnchors"
          >
            <!-- What the rail's first station rests on, opening in place
                 (14.11.2026, `TERMS`): it stood as a note over the list's
                 „Ohne Entwurf" until then, where no row needed it. The rail's
                 rows are links, so the term sits under the rail, not in it;
                 only where the rail states a fact („nicht feststellbar"
                 claims none). -->
            <div v-if="begutachtungTerm" class="mt-3 flex flex-wrap items-center text-sm text-ink-secondary">
              <TermNote :term="begutachtungTerm" />
            </div>
          </ProcedureCard>

          <!-- The door while the Nationalrat takes Stellungnahmen, as on the
               draft page for an open Vorlage: no date, because upstream
               publishes none. -->
          <DraftDoorCard
            v-if="filingOpen"
            :frist="false"
            :deadline="null"
          >
            <template #heading>
              Stellungnahme {{ kindCopy.zum }} {{ data.citation }} möglich
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
              <EntwurfFrame :laws="amendedLaws" :carried="carriedDraft" />
              <!-- „Zitieren" at a § only for a Vorlage's annex, which cites as
                   its Beilage; an Antrag's is Parliament's working copy, no
                   document of the Antrag to cite it by. -->
              <PageSubsection v-if="showsAnnex" id="gegenueberstellung" heading="Was ändert der Entwurf?">
                <TextComparisonSection :gp="data.gp" :inr="data.inr" :api-base="url" :cite-as="isAntrag ? undefined : citeAs" without-layers />
              </PageSubsection>
              <PageSubsection v-if="itemKind === 'regierungsvorlage'" id="erlaeuterungen" heading="Was das Ressort begründet">
                <ExplanationsSection :gp="data.gp" :inr="data.inr" :api-base="url" />
              </PageSubsection>
              <FoldSection
                v-if="data.documents.length"
                :heading="`Dokumente (${data.documents.length})`"
              >
                <div class="pb-2">
                  <DocumentList
                    :documents="data.documents"
                    :cite-as="citeAs"
                    :author="kindCopy.author"
                  />
                </div>
              </FoldSection>
            </div>
          </section>

          <!-- Client-side data: the section appears once it is there and says
               nothing while it is not — an empty heading would read as „none". -->
          <!-- Where Parliament takes no Stellungnahmen on the kind (a
               treaty's Vorlage, `ItemFiling`): one sentence and its source
               in place of the door and the section — a gap is said, never
               shown as an empty list. -->
          <p v-if="!data.filing.possible" class="mt-6 max-w-prose text-sm text-ink-secondary">
            {{ filingClosedDe(data.filing.reason, data.treatyKind) }}
            <ExternalLink :href="data.parliamentUrl" class="link-muted">{{ filingClosedSourceDe(data.citation) }}</ExternalLink>
          </p>

          <section v-if="statements && data.filing.possible" id="stellungnahmen" class="page-section scroll-mt-6" aria-labelledby="stellungnahmen-heading">
            <h2 id="stellungnahmen-heading" class="section-heading">Stellungnahmen an den Nationalrat</h2>
            <div class="mt-4">
              <RvStatements
                :data="statements"
                :filing-open="filingOpen"
                :item="parliamentItem"
                bare
              />
            </div>
          </section>

          <ParliamentStationSection
            v-if="sections.parlament"
            :draft="data"
            :enactment="sections.parlament"
            :item="parliamentItem"
            :show-diff="Boolean(parliamentStation) && !noComparison"
            :parliament-texts="parliamentTextList"
            :api-base="url"
            :origin="origin"
            :first-text="firstText"
          />

          <BgblStationSection
            v-if="sections.bgbl"
            :enactment="sections.bgbl"
            :gp="data.gp"
            :inr="data.inr"
            :parliament-texts="parliamentTextList"
            :api-base="url"
            :origin="origin"
            :first-text="firstText"
            :comparison-gap="noComparison"
          />
        </article>
      </template>
    </FetchGate>
  </div>
</template>
