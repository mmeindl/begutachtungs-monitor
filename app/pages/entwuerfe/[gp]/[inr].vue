<script setup lang="ts">
import type { AmendedLawsResponse, DraftDetail, RvStatementsResponse } from '#shared/types'
import type { ComparisonId, StationContext, StationId } from '~/utils/spine'
import type { Fact } from '~/components/ui/FactList.vue'
import { fristContextFor, fristFact } from '~/utils/deadlines'
import {
  SECOND_ROUND_CLAUSE,
  lastParliamentStation,
  parliamentTexts,
  procedureStatusDe,
  stations,
} from '~/utils/spine'
import { relatedGpSuffixDe, rvStationView } from '~/utils/outcomes'
import { withoutMainPoints } from '~/utils/kurzinfo'
import { ministryLinkFor } from '~/components/draft/MinistryLinks.vue'
import { aliasesFor } from '#shared/utils/draftAliases'
import { countLabelDe, formatDateDe } from '#shared/utils/format'
import { GP_RE, INR_RE } from '#shared/utils/gp'
import type { SourceEntry } from '#shared/utils/provenance'

definePageMeta({
  // Messenger/autocorrect lowercasing kills valid shared links — 301 to
  // the canonical uppercase URL instead of 404ing (one URL truth for SEO).
  middleware: [
    (to) => {
      const gpParam = String(to.params.gp ?? '')
      const canonical = gpParam.toUpperCase()
      if (gpParam !== canonical && GP_RE.test(canonical)) {
        return navigateTo(
          `/entwuerfe/${canonical}/${String(to.params.inr ?? '')}`,
          { redirectCode: 301 },
        )
      }
    },
  ],
  // Case-insensitive so the middleware gets to redirect regardless of
  // middleware/validate ordering; non-GP garbage still 404s.
  validate: (route) =>
    GP_RE.test(String(route.params.gp ?? '').toUpperCase()) &&
    INR_RE.test(String(route.params.inr ?? '')),
})

const route = useRoute()

const gp = computed(() => String(route.params.gp ?? ''))
const inr = computed(() => Number(route.params.inr ?? 0))
const url = computed(() => `/api/drafts/${gp.value}/${inr.value}`)

const { data, error, refresh, status } = await useFetch<DraftDetail>(url)

if (error.value?.statusCode === 404) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Entwurf nicht gefunden',
    fatal: true,
  })
}

/* The laws in force the draft would change. Its own request: it has to
 * parse the draft text and ask RIS once per law, which costs seconds on a
 * cold cache (13 s for a Sammelgesetz naming forty). Client-side, so the
 * page renders at its usual speed and the head of the timeline fills in —
 * exactly as the comparisons do. */
const { data: amendedLaws } = await useFetch<AmendedLawsResponse>(
  () => `${url.value}/geltendesrecht`,
  { lazy: true, server: false },
)

/* The Stellungnahmen on the Regierungsvorlage itself — the second window
 * for input, on parliament's side, which the Begutachtung's count does not
 * include. Its own client-side request like the laws in force: it enriches
 * a station the page already draws, and the list-142 call behind it must
 * not sit in the SSR path of every detail page. Asked only once a Vorlage
 * exists; the endpoint answers 404 otherwise. */
const { data: rvStatements } = await useFetch<RvStatementsResponse>(
  () => `${url.value}/rv-stellungnahmen`,
  { lazy: true, server: false, immediate: Boolean(data.value?.enactment) },
)

/* What the Vorlage made of the draft — the rows of its station frame that
 * come from the ME→RV comparison (`useVorlageOutcome`, 02.10.2026). */
const vorlageOutcome = useVorlageOutcome(() => ({ gp: gp.value, inr: inr.value }), Boolean(data.value?.enactment))

/* The Regierungsvorlage station, in both outcomes: whether it renders, its
 * frame's rows, and what explains them (`rvStationView`). */
const rvView = computed(() =>
  rvStationView(data.value, {
    share: vorlageOutcome.share.value,
    sharePending: vorlageOutcome.sharePending.value,
    reasoningStats: vorlageOutcome.reasoningStats.value,
    rvExplanations: vorlageOutcome.rvExplanations.value,
  }),
)

/* The two windows for input, as booleans the card below reads. Both can be
 * open at once: in GP XXVIII 7 of 91 Regierungsvorlagen arrived before the
 * draft's Frist had ended (median lead 14 days; GP XXVII: 1 of 296). Then
 * both are real options, and the one in parliament is arguably the one
 * that still matters — the government has fixed its text, only the
 * Ausschuss can change it — so neither hides the other. The Vorlage's flag
 * is upstream's `statementsstate`, already gated on the GP still running. */
const windows = computed(() => ({
  begutachtung: Boolean(data.value?.active),
  vorlage: Boolean(data.value?.enactment?.filingOpen),
}))

/* Which station sections render after the Begutachtung — each one's `v-if`,
 * named ONCE (04.10.2026). The template and the bar's anchors below read
 * the same entries; until then the anchors copied every section's condition
 * by hand, and a paraphrase would have had the bar promise chapters the
 * page did not render. The two parliamentary stations carry the Vorlage
 * they render for, null where they do not render. */
const sections = computed(() => {
  const e = data.value?.enactment ?? null
  return {
    rv: rvView.value.showOutcome,
    parlament: e,
    // Also the Antrag that replaced a Beschluss never promulgated, once it
    // is in the Bundesgesetzblatt (§12.33).
    bgbl: e && (e.bgblNumber || e.successor?.bgblNumber) ? e : null,
  }
})

/* Where each station of the bar leads. Every station has a section of its
 * own; an entry exists exactly where `sections` renders it. A station
 * without an entry stays plain text. */
const stationAnchors = computed<Partial<Record<StationId, string>>>(() => {
  if (!data.value) return {}
  const s = sections.value
  return {
    // Both sections are unconditional — the draft and its Begutachtung are
    // what the page is about, even when neither has produced anything yet.
    entwurf: '#entwurf',
    begutachtung: '#begutachtung',
    ...(s.rv ? { rv: '#regierungsvorlage' } : {}),
    ...(s.parlament ? { parlament: '#parlament' } : {}),
    ...(s.bgbl ? { bgbl: '#bundesgesetzblatt' } : {}),
  }
})

/* The station bar's three context values, named ONCE. They come from two
 * lazily loaded endpoints, so this is the one place that names that
 * dependency; the bar gets the finished list. (The „Station n von 5" header
 * that counted the same list was removed on 18.09.2026, so the bar is the
 * only reader left.) */
const stationContext = computed<StationContext>(() => ({
  createsNewLaw: amendedLaws.value?.createsNewLaw,
  amendedLawCount: amendedLaws.value?.laws.length,
  rvStatementTotal: rvStatements.value?.total,
}))
const stationList = computed(() => (data.value ? stations(data.value, stationContext.value) : []))

/* The comparisons, keyed by the question they answer. All three exist since
 * 17.09.2026: the ressort's annex, the ME→RV diff, and — where parliament
 * published a changed text — the same comparison section with the pair
 * preselected. `#gegenueberstellung` is rendered unconditionally, so it is
 * offered unconditionally here; whether the question is worth asking for a
 * draft that creates new law is the station model's call, not this map's.
 *
 * The parliament link leads into „Im Parlament" since 01.10.2026, where that
 * station's steps stand now (`lawDiffSteps`), and opens the first of them —
 * the section's default, so it carries no pair. */
const parliamentStation = computed(() =>
  data.value ? lastParliamentStation(data.value) : null,
)
const parliamentTextList = computed(() => (data.value ? parliamentTexts(data.value) : []))
const comparisonAnchors = computed<Partial<Record<ComparisonId, string>>>(() => ({
  vorschlag: '#gegenueberstellung',
  ...(data.value?.enactment ? { begutachtung: '#textvergleich' } : {}),
  ...(parliamentStation.value
    ? { parlament: '#textvergleich-parlament' }
    : {}),
}))

// Array.isArray guards: cached payloads (dev disk cache, future upstream
// drift) can predate the current DescriptionBlock[] shape — degrade to
// "no description" instead of crashing SSR.
const description = computed(() =>
  Array.isArray(data.value?.description) ? data.value.description : [],
)

/* The Kurzinformation's „Hauptgesichtspunkte" is, on most drafts, the
 * Allgemeiner Teil of the Erläuterungen in shorter words — and that part
 * stands in „Was das Ressort begründet" further down, from the ministry's own
 * document. Two versions of one text on one page (30.09.2026), so the
 * section goes where the Erläuterungen are there to carry it
 * (`withoutMainPoints`); Ziele and Inhalt stay as the quick overview. Only
 * the rendered blocks: the SEO snippet still reads the whole Kurzinformation.
 *
 * Same key as ExplanationsSection, so one request (`useExplanations`). The
 * section is folded by default (`DraftDescription`, OPEN_SECTIONS), so where
 * the Erläuterungen arrive only after hydration, what disappears is one
 * closed row. */
const { data: explanations } = useExplanations(() => ({ gp: gp.value, inr: inr.value }))
const kurzinfoBlocks = computed(() => {
  const e = explanations.value
  return e?.available && e.passages.length ? withoutMainPoints(description.value) : description.value
})

const divergence = computed(() =>
  fristDivergence(data.value?.risDraft ?? null, Boolean(data.value?.active)),
)

/** The yardstick behind the rail's „Kurze Frist" / „Volle Frist" — the rail
 *  says which, this sentence says against what. Null in the middle. */
const fristContext = computed(() => {
  const d = data.value
  if (!d) return null
  return fristContextFor(d.arrivedAt, d.deadline)
})

/* The credit line under the Begutachtung's frame (02.10.2026): Parliament's
 * Verlauf of the draft — Begutachtung data, which no open data grant covers.
 * The other frames name their own sources (`AmendedLawsFrame`,
 * `PARLIAMENT_HISTORY_SOURCES`, `DraftStatementsBlock`). */
const DRAFT_HISTORY_SOURCES: SourceEntry[] = [{ what: 'Verlauf des Entwurfs', publisher: 'parlament', terms: 'keine-lizenz' }]

/** Debate names for this procedure, if any (`shared/utils/draftAliases.ts`). */
const aliases = computed(() => (data.value ? aliasesFor(data.value.gp, data.value.inr) : []))

/* The one fact the upstream stage list holds that no other surface does:
 * when parliament handed the Stellungnahmen to the ressort. That is where
 * the ministry's clock starts and where the Begutachtung ends — temporal,
 * no causality claimed (framing rule). */
const handoffFact = computed<Fact | null>(() => {
  const d = data.value
  const h = d?.handoff
  if (!d || !h?.date) return null
  // The bar's Regierungsvorlage row says „bisher keine · seit … beim Ressort"
  // exactly while no Vorlage exists and the GP runs (`spine.ts`); there the
  // row only repeated it (30.09.2026).
  if (!d.enactment && !d.gpEnded) return null
  return { key: 'uebermittelt', title: 'Übermittelt', text: `${formatDateDe(h.date)} an ${h.recipient}` }
})

/* The Begutachtung's own dates, before the Stellungnahmen. The Frist only
 * once it has closed — while it runs, the action card above carries it.
 * Its length and dates stand here although the rail names them too: the
 * bar under them needs the value it draws beside it (01.10.2026; the
 * sentence that stood here alone compared nothing a reader could see). */
const begutachtungFacts = computed<Fact[]>(() => {
  const d = data.value
  if (!d) return []
  const facts: Fact[] = []
  if (!windows.value.begutachtung && d.deadline) facts.push(fristFact(d.arrivedAt, d.deadline))
  if (handoffFact.value) facts.push(handoffFact.value)
  return facts
})

useDraftSeo(data, description)

/**
 * The Ressorts of the byline: the lead and every co-ressort, each with its
 * own link into that Ressort's list. Two of them only on a jointly
 * issued Entwurf — three drafts of GP XXVII
 * (`server/utils/parliament/draftList.ts`).
 */
const ministryLinks = computed(() => {
  const d = data.value
  if (!d) return []
  return [{ code: d.ministryCode, name: d.ministryName }, ...d.coMinistries]
    .map((m) => ministryLinkFor(m.code, m.name, { gp: d.gp }))
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <FetchGate
      v-slot="{ data }"
      :status="status"
      :error="error"
      :data="data"
      loading-label="Begutachtung wird geladen …"
      @retry="refresh()"
    >
      <article>
        <DraftBackLink />
        <DraftHeader
          :title="data.shortTitle ?? data.title"
        >
          <!-- `link-inline`, underlined at rest (WCAG 1.4.1), and tap-target
               for the hit area. The mid-page CTA stays the only door; this is
               the receipt. -->
          <template #source>
            <ExternalLink
              :href="data.parliamentUrl"
              class="link-inline tap-target"
            >Auf parlament.gv.at ansehen</ExternalLink>
          </template>
          <template #identity>
            <!-- The type word leads, exactly as on the row — and the row's
                 reasoning (`EntryItem.vue`) always held here too: „132/ME"
                 explains itself only to whoever knows the system, the word
                 explains it. Until 18.09.2026 the row followed the argument
                 and the detail page did not, although it is the page a shared
                 link opens. -->
            <span class="text-sm font-medium text-ink-muted">
              <span class="text-ink">Ministerialentwurf</span> {{ data.citation }}
            </span>
          </template>
          <!-- The official Sammeltitel stays on the page (and in og:title)
               so citations remain exact — it just no longer IS the h1. -->
          <p v-if="data.shortTitle" class="mt-1 text-sm text-ink-secondary">
            {{ data.title }}
          </p>
          <!-- The debate's name for the thing, where it has one — findable by
               search, and stated as what it is. The heading stays the official
               title: the framing rule forbids adopting a campaign term as the
               tool's own naming (`shared/utils/draftAliases.ts`). -->
          <p v-if="aliases.length" class="mt-1 text-sm text-ink-secondary">
            In der öffentlichen Debatte:
            <span class="text-ink">{{ aliases.map((a) => `„${a}“`).join(' · ') }}</span>
          </p>
          <!-- One sentence about who sent the draft: the Ressort and the
               Minister are one fact. Eingelangt/Frist stay absent — the bar
               below states both, the pill above repeats the Frist — and the
               provenance link stands in the identity row (`#source`). -->
          <p class="mt-2 text-sm text-ink-secondary">
            <MinistryLinks :ministries="ministryLinks" /><template v-if="data.invitedBy">, übermittelt von <span class="inline-block">{{ data.invitedBy }}</span></template>
          </p>
        </DraftHeader>

        <!-- The map. Five stations, read vertically, so it needs no more
             width than a paragraph and lives in the prose column like
             everything else. Each station links into the section below that
             holds it, and each comparison into the section that answers it —
             the bar is this page's table of contents, in the page's order. -->
        <ProcedureCard
          :status="procedureStatusDe(data)"
          :stations="stationList"
          :anchors="stationAnchors"
          :comparison-anchors="comparisonAnchors"
        >
          <!-- The "second attempt" fact, in both lifecycle states: a same-title
             draft ran before and produced no Regierungsvorlage. Same title
             is all that is claimed (the sentence says "gleichlautend"); the
             link lets the reader judge whether it is the same text. A part
             of the card, so divided from the rail as the card's facts are
             from each other (02.10.2026): without the hairline it read as
             the card's footnote. -->
          <p v-if="data.predecessor" class="mt-4 border-t border-hairline pt-4 text-sm text-ink-secondary">
            Ein gleichlautender Entwurf war bereits in Begutachtung:
            <NuxtLink
              :to="`/entwuerfe/${data.predecessor.gp}/${data.predecessor.inr}`"
              class="link-inline"
            >{{ data.predecessor.citation }}</NuxtLink>{{ relatedGpSuffixDe(data.predecessor.gp, data.gp) }}<template v-if="data.predecessor.deadline">, Frist bis {{ formatDateDe(data.predecessor.deadline) }}</template> – ohne Regierungsvorlage.
          </p>
        </ProcedureCard>

        <!-- Deadline, action and calendar welded into one card: the page's
             door, shown while any window for input is open. The Begutachtung
             while its Frist runs; the Regierungsvorlage while the Nationalrat
             takes Stellungnahmen on it (the second window most readers do not
             know exists); both when both are open — see `windows` above for
             why neither hides the other. Closed, the card goes — the source
             link lives in the header's provenance line.

             This card is the ONE deliberate break with the station order
             below: the Entwurf section with its Gegenüberstellung can run
             long, and the page's action must not sink below it. The door
             stays at the front and follows the window that is open. Since
             30.09.2026 it stands directly under the spine, above „Worum geht
             es?" too, as on the RIS page: it is the page's one countdown since
             the badge beside the title went, and under a long Kurzinformation
             it sat a screen and a half down. -->
        <DraftDoorCard
          v-if="windows.begutachtung || windows.vorlage"
          :frist="windows.begutachtung"
          :deadline="data.deadline"
          :context="fristContext"
          :ics-href="`/entwuerfe/${gp}/${inr}/frist.ics`"
          :filing-href="data.parliamentUrl"
        >
          <!-- The second window alone: the Begutachtung is over, parliament
               still listens. No date, because upstream publishes none — the
               form closes with the end of the parliamentary procedure, the
               Bundesrat's Beschluss, and the card says exactly that. -->
          <!-- Short since 30.09.2026: that the Begutachtung is over and when
               it ended stands in the bar directly above. -->
          <template v-if="!windows.begutachtung" #heading>
            Stellungnahme zur Regierungsvorlage {{ data.enactment?.rvCitation }} möglich
          </template>
          <p v-if="windows.vorlage && !windows.begutachtung" class="mt-2 text-sm text-ink-secondary">
            Ohne Frist – {{ SECOND_ROUND_CLAUSE }}.
          </p>
          <!-- Directly under the date it qualifies, above the CTA: whoever is
               about to submit reads it before acting, and the sentence ends by
               naming the date that governs. -->
          <p v-if="windows.begutachtung && divergence" class="mt-2 text-sm text-ink">
            Das RIS nennt als Fristende
            <ExternalLink
              v-if="divergence.url"
              :href="divergence.url"
              class="tap-target font-medium link-quiet"
            >
              {{ formatDateDe(divergence.date) }}</ExternalLink><span v-else class="font-medium text-ink">{{
              formatDateDe(divergence.date)
            }}</span>
            ({{ countLabelDe(divergence.days, 'Tag', 'Tage') }}
            {{ divergence.later ? 'später' : 'früher' }}).<template v-if="data.deadline">
              Maßgeblich ist der {{ formatDateDe(data.deadline) }}: eingebracht
              wird beim Parlament.</template><template v-else> Eingebracht wird beim Parlament.</template>
          </p>
          <template #after-context>
            <!-- Both windows open: stated as a sequence of facts, not as a
                 verdict on the ministry (framing rule). The reader gets both
                 doors and the fact that makes the second one matter. -->
            <p v-if="windows.begutachtung && windows.vorlage" class="mt-2 text-sm text-ink">
              Die Regierungsvorlage {{ data.enactment?.rvCitation }} liegt schon im
              Nationalrat; auch zu ihr ist eine Stellungnahme möglich.
            </p>
          </template>
          <template #filing>Stellungnahme auf parlament.gv.at abgeben</template>
          <template #actions>
            <!-- Primary when it is the only door; beside the Begutachtung's
                 button it steps back to an outline, first things first. The
                 target is the Vorlage's page, where parliament renders the
                 form — the same way the Begutachtung's button works. -->
            <DoorButton
              v-if="windows.vorlage && data.enactment"
              :href="data.enactment.rvUrl"
              :variant="windows.begutachtung ? 'outline' : 'solid'"
            >
              Stellungnahme zur Regierungsvorlage abgeben
            </DoorButton>
          </template>
          <template #footer>
            <!-- The documented base fact (drafts get revised routinely), no
                 per-Stellungnahme causality — the honest interim form of
                 "your input changed §5" until the diff layer exists. Once the
                 Vorlage exists, that comparison IS on the page, so the card
                 points at it instead. -->
            <p v-if="windows.begutachtung && !data.enactment" class="mt-3 text-sm text-ink">
              Ministerien überarbeiten Entwürfe nach der Begutachtung regelmäßig.
              Der Monitor verfolgt auch bei diesem Entwurf, was daraus wird.
            </p>
            <!-- NO third pointer to #textvergleich (18.09.2026). Where a
                 Vorlage exists, the bar directly above this card already shows
                 „Was sich nach der Begutachtung geändert hat", and the
                 Regierungsvorlage section links the same anchor once more. Three
                 ways to one place are not an offer. -->
          </template>
        </DraftDoorCard>

        <section
          v-if="kurzinfoBlocks.length"
          class="page-section"
          aria-labelledby="kurzinfo-heading"
        >
          <!-- Was sr-only: sighted readers got a section whose first visible
               marker was a 14px "Ziel". The page now reads as a question
               sequence — worum geht es, was wurde daraus. -->
          <h2 id="kurzinfo-heading" class="section-heading">Worum geht es?</h2>
          <div class="mt-4">
            <DraftDescription :blocks="kurzinfoBlocks" />
          </div>
        </section>

        <!-- From here the page follows the STATIONS of the bar, in the bar's
             order, and each section exists exactly when its station has
             something to say — the bar is this page's table of contents, so
             every link in it has to find a chapter. The CTA card above is the
             one stated exception. -->

        <!-- The draft and everything that IS the draft: the law it would
             change, its own documents, the second official copy of them, and
             the ressort's own comparison. "Geltendes Recht" had a section of
             its own until the bar became five stations — it is not a step of
             the procedure, it is what this draft would do to the law. -->
        <section id="entwurf" class="page-section scroll-mt-6" aria-labelledby="entwurf-heading">
          <h2 id="entwurf-heading" class="section-heading">Der Entwurf</h2>
          <div class="mt-4 space-y-8">

            <!-- FIRST what the draft changes, then why, then the law in force,
                 and the documents last, folded. The order in which a reader
                 actually uses the section: a reader who opens a draft wants the
                 diff, and nobody comes for the PDFs — feedback from a user
                 conversation in September 2026, and the Verordnung page had
                 already put its documents last. Until 30.09.2026 the reasoning
                 led („was soll das Gesetz?" before the text) and two document
                 lists stood between it and the comparison, so the diff was the
                 fifth block of its own section. The reasoning lost little by
                 moving: its Besonderer Teil already hangs at the §§ of the
                 comparison.

                 Not under „Worum geht es?": that is Parliament's
                 Kurzbeschreibung, written for the parliamentary process. The
                 Erläuterungen are the Ressort's own reasoning, and they belong
                 to the draft, not to the procedure. -->

            <!-- The section's lede: the law in force the draft would change
                 (`AmendedLawsFrame`). -->
            <AmendedLawsFrame v-if="amendedLaws" :laws="amendedLaws" />

            <!-- The ressort's own comparison, available from day one.
                 `#gegenueberstellung` is kept as the anchor because that link is
                 already in circulation. A new law has nothing to be held
                 against, so the question is not asked — the same rule the bar
                 applies. `amendedLaws` arrives on the client, so for the rare
                 Stammgesetz this block can disappear after first paint; that is
                 accepted, the alternative is asking a question we know is
                 wrong on every other draft's first paint. -->
            <PageSubsection v-if="!amendedLaws?.createsNewLaw" id="gegenueberstellung" heading="Was ändert der Entwurf?">
              <TextComparisonSection :gp="data.gp" :inr="data.inr" />
            </PageSubsection>

            <PageSubsection id="erlaeuterungen" heading="Was das Ressort begründet">
              <ExplanationsSection :gp="data.gp" :inr="data.inr" />
            </PageSubsection>

            <!-- Both document lists in ONE fold, the house fold with the
                 heading in the <summary> (`FoldSection`, as in
                 DraftDescription): the outline does not depend on what is
                 open, find-in-page still opens it, and nothing above it moves
                 when it opens. Folded because the documents are what a citing
                 or downloading reader looks for, and that reader expects them
                 at the end. -->
            <FoldSection
              v-if="data.documents.length || data.risDraft"
              :heading="data.documents.length ? `Dokumente (${data.documents.length})` : 'Dokumente'"
            >
              <div class="pb-2">
                <DocumentList v-if="data.documents.length" :documents="data.documents" />
                <!-- The same draft at the other official source, as one line
                     (30.09.2026). A heading „Zweite Quelle", a sentence and a
                     second list with the RIS text stood here; the RIS-Eintrag
                     carries text, Erläuterungen and Gegenüberstellung itself,
                     and whoever works from RIS needs the door, not a copy of
                     its catalogue. "Not in RIS" is a state worth showing, not
                     an error (docs/ris-join.md §2). -->
                <p v-if="data.risDraft" class="mt-4 text-sm text-ink-secondary">
                  <ExternalLink
                    v-if="data.risDraft.risUrl"
                    :href="data.risDraft.risUrl"
                    class="link-inline"
                  >Derselbe Entwurf im RIS</ExternalLink>
                  <template v-else>Im RIS ist dieser Entwurf nicht veröffentlicht.</template>
                </p>
              </div>
            </FoldSection>
          </div>
        </section>

        <!-- The Begutachtung: the Stellungnahmen ARE this station's content,
             and the moment the ressort takes the file over ends it. What came
             of it has its own section now — an outcome is a station, not a
             sub-heading of the stage before it. -->
        <section id="begutachtung" class="page-section scroll-mt-6" aria-labelledby="begutachtung-heading">
          <h2 id="begutachtung-heading" class="section-heading">Die Begutachtung</h2>
          <div class="mt-4 space-y-8">
            <!-- Before the Stellungnahmen: how long the window was is the
                 condition under which every one of them was written. The
                 handoff to the ressort is the stage's other date: under the
                 list it read as the pagination's footnote and moved with every
                 „Weitere" (01.10.2026). In the frame (03.10.2026): the Frist
                 with its bar is a measurement with a scale, and without an
                 edge it floated — the bar ended mid-column with nothing to
                 align to. The frame gives it that edge without the white sheet
                 of the instruments you operate. -->
            <div v-if="begutachtungFacts.length">
              <FactList :facts="begutachtungFacts">
                <template #after-frist>
                  <FristBar :start="data.arrivedAt" :deadline="data.deadline" />
                </template>
              </FactList>
              <!-- The bar's median is ours, computed over Parliament's
                   drafts since 2013; the Regelfall is the regulation's. -->
              <SectionCredits
                :sources="DRAFT_HISTORY_SOURCES"
                :marked="false"
                :own="begutachtungFacts.some((f) => f.key === 'frist') ? 'Median' : undefined"
                method="/so-funktionierts#stationen"
              >
                <ExternalLink :href="data.parliamentUrl" class="link-muted">Verlauf</ExternalLink>
              </SectionCredits>
            </div>
            <DraftStatementsBlock
              :draft="data"
              :list-url="`${url}/statements`"
              :filing-open="windows.begutachtung"
            />
            <!-- No closing line since 02.10.2026. „Die Regierungsvorlage hat
                 193 von 311 Paragraphen … umgeschrieben oder gestrichen" stood
                 here from 01.10.2026, to answer „und dann?" under the
                 Stellungnahmen. Since the next day the same count is the first
                 figure of the Regierungsvorlage's station frame, one section
                 down, and the spine links the comparison: the line said it a
                 third time, and was the only sentence trailing a section. -->
          </div>
        </section>

        <!-- The stations after the Begutachtung, one section each, rendered
             where `sections` says — the entries the bar's anchors read. -->
        <RvStationSection
          v-if="sections.rv"
          :draft="data"
          :view="rvView"
          :share="vorlageOutcome.share.value"
          :share-de="vorlageOutcome.shareDe.value"
          :reasoning-de="vorlageOutcome.reasoningDe.value"
          :rv-explanations="vorlageOutcome.rvExplanations.value"
          :rv-statements="rvStatements"
          :filing-open="windows.vorlage"
        />

        <ParliamentStationSection
          v-if="sections.parlament"
          :draft="data"
          :enactment="sections.parlament"
          :show-diff="Boolean(parliamentStation)"
          :parliament-texts="parliamentTextList"
        />

        <BgblStationSection
          v-if="sections.bgbl"
          :enactment="sections.bgbl"
          :gp="data.gp"
          :inr="data.inr"
          :parliament-texts="parliamentTextList"
        />

      </article>
    </FetchGate>
  </div>
</template>
