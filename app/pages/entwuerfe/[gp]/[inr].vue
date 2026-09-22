<script setup lang="ts">
import type { AmendedLawsResponse, DraftDetail, DraftDocument, RvStatementsResponse } from '#shared/types'
import type { ComparisonId, StationContext, StationId } from '~/utils/spine'
import {
  RV_DEFINITION,
  SECOND_ROUND_CLAUSE,
  SECOND_ROUND_WINDOW,
  lastParliamentStation,
  parliamentOutcome,
  procedureStatusDe,
} from '~/utils/spine'
import { aliasesFor } from '#shared/utils/aliases'
// Explicit: `draftChain.ts` is a pure module and stays out of the
// auto-imports, so that server map and vitest run the same functions.
import { mayClaimOutcome } from '#shared/utils/draftChain'
import { GP_RE, INR_RE } from '#shared/utils/gp'

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

/* Where each station of the bar leads. Every station now has a section of
 * its own, and each entry below mirrors that section's `v-if` EXACTLY —
 * copy the condition, do not paraphrase it, or the bar starts promising
 * chapters the page did not render. A station without an entry stays plain
 * text. */
const stationAnchors = computed<Partial<Record<StationId, string>>>(() => {
  const d = data.value
  if (!d) return {}
  return {
    // Both sections are unconditional — the draft and its Begutachtung are
    // what the page is about, even when neither has produced anything yet.
    entwurf: '#entwurf',
    begutachtung: '#begutachtung',
    ...(showOutcome.value ? { rv: '#regierungsvorlage' } : {}),
    ...(d.enactment ? { parlament: '#parlament' } : {}),
    ...(d.enactment?.bgblNumber ? { bgbl: '#bundesgesetzblatt' } : {}),
  }
})

/* Die drei Kontextwerte der Stationenleiste, EINMAL benannt: Die Kopfzeile
 * zählt „Station n von 5" aus derselben Liste, die die Leiste zeichnet, und
 * zwei Aufrufe mit von Hand kopiertem Kontext wären zwei Zählungen, die
 * auseinanderlaufen können. Die Leiste bekommt ihre Props unten aus diesem
 * Objekt. */
const stationContext = computed<StationContext>(() => ({
  createsNewLaw: amendedLaws.value?.createsNewLaw,
  amendedLawCount: amendedLaws.value?.laws.length,
  rvStatementTotal: rvStatements.value?.total,
}))

/* What parliament did, for the sentence in "Im Parlament". Same function as
 * the bar's fact line, so the heading and the row cannot disagree. */
const parliament = computed(() => (data.value ? parliamentOutcome(data.value) : null))

/* The comparisons, keyed by the question they answer. All three exist since
 * 17.09.2026: the ressort's annex, the ME→RV diff, and — where parliament
 * published a changed text — the same comparison section with the pair
 * preselected. `#gegenueberstellung` is rendered unconditionally, so it is
 * offered unconditionally here; whether the question is worth asking for a
 * draft that creates new law is the station model's call, not this map's.
 *
 * The parliament link carries a query, not just a hash: landing on
 * `#textvergleich` alone would show the ME→RV comparison, which does not
 * answer "what did parliament change". `von=rv` follows the rule that keeps
 * a difference attributable to one actor. */
const parliamentStation = computed(() =>
  data.value ? lastParliamentStation(data.value) : null,
)
const comparisonAnchors = computed<Partial<Record<ComparisonId, string>>>(() => ({
  vorschlag: '#gegenueberstellung',
  ...(data.value?.enactment ? { begutachtung: '#textvergleich' } : {}),
  ...(parliamentStation.value
    ? { parlament: `?von=rv&bis=${parliamentStation.value}#textvergleich` }
    : {}),
}))

// Array.isArray guards: cached payloads (dev disk cache, future upstream
// drift) can predate the current DescriptionBlock[] shape — degrade to
// "no description" instead of crashing SSR.
const description = computed(() =>
  Array.isArray(data.value?.description) ? data.value.description : [],
)

// Whether the Regierungsvorlage station has anything to show: the Vorlage
// itself, or — once the Frist is over — the neutral note that none came,
// with the base rate that puts the waiting in proportion. While the Frist
// runs and no Vorlage exists the section stays away: the question is not
// answerable yet, and an empty chapter under the bar's "ausstehend" row
// would say less than the row does.
const showOutcome = computed(() => {
  const d = data.value
  if (!d) return false
  return Boolean(d.enactment) || !d.active
})

/* Decision and sign convention live in app/utils/deadlines.ts, next to
 * the other deadline rules and covered by tests — a flipped sign here would
 * tell a submitter the wrong date. */
const divergence = computed(() =>
  fristDivergence(data.value?.risDraft ?? null, Boolean(data.value?.active)),
)

/* One draft text, up to three formats — a DocumentList row, not a chip per
 * format: a chip has to carry the format in its label ("Entwurfstext (PDF)"),
 * so the noun repeats and the row grows with every format RIS adds. The
 * RIS-Eintrag itself is a catalogue page, not a document, and stays a link
 * in the lead sentence. */
const risDocuments = computed<(DraftDocument & { hint?: string })[]>(() => {
  const doc = data.value?.risDraft?.risDocument
  if (!doc) return []
  const formats = ([['pdf', doc.pdf], ['html', doc.html]] as const)
    .filter((pair): pair is readonly ['pdf' | 'html', string] => Boolean(pair[1]))
    .map(([type, url]) => ({ type, url }))
  return formats.length
    ? [{ title: 'Entwurfstext', hint: 'Fassung im RIS des Bundes', formats }]
    : []
})

// The bar already states "Regierungsvorlage · bisher keine", so the
// card must not say it again. Its job is the bracket the bar cannot carry:
// elapsed time. Once the quiet stretch exceeds the latency window, the
// quotable verdict sentence leads; before that there is no headline at
// all — months of pipeline latency are normal, and a fresh silence is
// "noch nicht", not a verdict to put in bold.
//
// Third state: the draft's Gesetzgebungsperiode is over. Then the boundary
// is the headline (a date, not a verdict), the body gives the measured
// rarity of a late Regierungsvorlage, and the elapsed-time sentence is
// subsumed — "vor über einem Jahr" says less than "die GP endete am".
const lapsed = computed(() => {
  const d = data.value
  return Boolean(d && !d.enactment && !d.active && d.gpEnded)
})

/* Fourth state, and it overrides the other three: the period records no
 * link from ANY of its drafts to a Regierungsvorlage (§12.27). Everything
 * above reads absence as evidence — here absence is the archive, so the
 * card states that instead and claims nothing. `unknown` counts as unlinked:
 * when the map was not there to ask, silence is the recoverable mistake. */
const chainUnlinked = computed(() => {
  const d = data.value
  return Boolean(d && !d.enactment && !d.active && !mayClaimOutcome(d.chainCoverage))
})

const noRvVerdict = computed(() => {
  const d = data.value
  if (!d) return null
  if (chainUnlinked.value) return chainUnlinkedHeadlineDe(d.gp)
  if (lapsed.value) return gpEndedHeadlineDe(d.gp, d.gpEndedOn)
  return noRvVerdictDe(d.deadline)
})

const noRvBody = computed(() => {
  if (chainUnlinked.value) return chainUnlinkedBodyDe()
  if (lapsed.value) return gpEndedBodyDe(data.value?.gp ?? '')
  if (noRvVerdict.value) return 'Ob und wie es weitergeht, ist offen.'
  // No Frist, no bracket to measure — the only branch where the card
  // restates the bar, because otherwise it would say nothing at all.
  if (daysUntil(data.value?.deadline) === null) {
    return 'Der Entwurf wurde bislang nicht als Regierungsvorlage eingebracht. Ob und wie es weitergeht, ist offen.'
  }
  return 'Zwischen Begutachtungsende und Regierungsvorlage liegen häufig mehrere Monate – dieser Stand kann sich noch ändern.'
})

/* The base rate under the waiting sentence, while the GP still runs: how
 * many drafts of the last closed GP got their Regierungsvorlage and how
 * fast (app/utils/outcomes.ts). Numbers, so the reader can weigh the
 * silence without the page weighing it for them. */
const noRvBaseRate = computed(() =>
  lapsed.value || chainUnlinked.value ? null : rvBaseRateSentenceDe(data.value?.gp),
)

/** Debate names for this procedure, if any (`shared/utils/aliases.ts`). */
const aliases = computed(() => (data.value ? aliasesFor(data.value.gp, data.value.inr) : []))

/* A related draft is named by citation and GP; the GP only where it
 * differs from this page's, which is the case that carries information. */
function relatedGpSuffix(gp: string): string {
  return gp === data.value?.gp ? '' : ` (${gp}. GP)`
}

/* The one fact the upstream stage list holds that no other surface does:
 * when parliament handed the Stellungnahmen to the ressort. That is where
 * the ministry's clock starts and where the Begutachtung ends, so the
 * sentence closes that section — temporal, no causality claimed (framing
 * rule). */
const handoffSentence = computed(() => {
  const h = data.value?.handoff
  if (!h?.date) return null
  return `Die Stellungnahmen wurden am ${formatDateDe(h.date)} an ${h.recipient} übermittelt.`
})

const seoTitle = computed(() => {
  const d = data.value
  if (!d) return 'Begutachtung'
  // The short name is what fits a tab and what insiders search for;
  // og:title keeps the full official title for exact citation.
  return truncate(d.shortTitle ?? d.title, 60)
})

const seoDescription = computed(() => {
  const d = data.value
  if (!d) return 'Details zu einem Ministerialentwurf im Begutachtungsverfahren.'
  // Headings are structure, not content: a snippet opening with the bare word
  // "Ziel" wastes the ~160 characters a search result actually shows.
  const prose = description.value
    .flatMap((b) => (b.kind === 'heading' ? [] : b.kind === 'list' ? b.items : [b.text]))
    .join(' · ')
    .replace(/\s+/g, ' ')
    .trim()
  if (prose) return truncate(prose, 160)
  return `Ministerialentwurf ${d.citation}: Frist, Stellungnahmen und weiterer Verlauf.`
})

// Structured facts travel better than prose when a link unfurls in
// Slack/Signal/X: the preview answers "when, how much, who" at a glance.
const ogFacts = computed(() => {
  const d = data.value
  if (!d) return null
  const frist = d.active
    ? d.deadline
      ? `Frist bis ${formatDateDe(d.deadline)}`
      : 'Begutachtung läuft'
    : d.deadline
      ? `Begutachtung endete am ${formatDateDe(d.deadline)}`
      : 'Begutachtung abgeschlossen'
  return [
    frist,
    countLabelDe(d.statements.total, 'Stellungnahme', 'Stellungnahmen'),
    d.ministryName,
  ]
    .filter(Boolean)
    .join(' · ')
})

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  // The full official title for shares — journalists cite exactly.
  ogTitle: () => data.value?.title ?? 'Begutachtung',
  ogDescription: ogFacts,
  ogType: 'article',
})

const linkClasses =
  'rounded text-accent-deep underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-deep'
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <div v-if="status === 'pending' && !data">
      <LoadingState label="Begutachtung wird geladen …" />
    </div>
    <div v-else-if="error">
      <ErrorState @retry="refresh()" />
    </div>
    <article v-else-if="data">
      <!-- Shared-link landers (the declared primary case) need a way into
           the corpus. Ein Ziel, ein Wort, auf jeder Detailseite gleich: die
           ungefilterte Liste. Ein Rücklink, der je nach Datensatz woanders
           hinführt (bis 18.09.2026: auf die GP des Entwurfs gefiltert),
           behauptet eine Herkunft, die der Lander nie hatte — und die
           Filterleiste der Liste ist ohnehin der Ort, an dem eingegrenzt
           wird. -->
      <div class="mb-4">
        <NuxtLink
          to="/entwuerfe"
          class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
        >
          ← Alle Entwürfe
        </NuxtLink>
      </div>
      <header>
        <div class="flex flex-wrap items-center gap-2">
          <!-- Das Typwort führt, genau wie auf der Karte — und deren
               Begründung (`EntryItem.vue`) galt hier immer schon: „132/ME"
               erklärt sich nur dem, der das System kennt, das Wort erklärt
               es. Bis 18.09.2026 folgte die Karte dem Argument und die
               Detailseite nicht, obwohl sie die Seite ist, die ein
               geteilter Link öffnet. -->
          <span class="text-sm font-medium text-ink-muted">
            <span class="text-ink">Ministerialentwurf</span> {{ data.citation }}
          </span>
          <!-- Every Ressort gets a de-facto page for free: the filtered
               list URL. Only here — cards are themselves links. -->
          <NuxtLink
            :to="`/entwuerfe?ministry=${data.ministryCode}&gp=${data.gp}`"
            :aria-label="`Alle Entwürfe des Ministeriums ${data.ministryName} anzeigen`"
            class="tap-target rounded"
          >
            <MinistryBadge
              :code="data.ministryCode"
              :name="data.ministryName"
              class="transition-colors hover:border-baseline hover:underline"
            />
          </NuxtLink>
          <!-- Only while it runs: the badge exists to carry urgency (tone +
               "Noch 3 Tage"). Closed, it degrades to "Endete am …" — which
               the bar states 100px below, better. -->
          <DeadlineBadge
            v-if="data.active"
            :deadline="data.deadline"
            :active="data.active"
          />
        </div>
        <!-- German compounds: "Elektrizitätswirtschaftsgesetz" at text-2xl is
             wider than a 320px viewport's content box, so the title hyphenates
             (lang="de-AT" is set) and breaks as a last resort rather than
             scrolling the page sideways. -->
        <h1
          class="mt-3 text-2xl font-semibold text-ink hyphens-auto break-words sm:text-3xl"
        >
          {{ data.shortTitle ?? data.title }}
        </h1>
        <!-- The official Sammeltitel stays on the page (and in og:title)
             so citations remain exact — it just no longer IS the h1. -->
        <p v-if="data.shortTitle" class="mt-1 text-sm text-ink-secondary">
          {{ data.title }}
        </p>
        <!-- The debate's name for the thing, where it has one — findable by
             search, and stated as what it is. The heading stays the official
             title: the framing rule forbids adopting a campaign term as the
             tool's own naming (`shared/utils/aliases.ts`). -->
        <p v-if="aliases.length" class="mt-1 text-sm text-ink-secondary">
          In der öffentlichen Debatte:
          <span class="text-ink">{{ aliases.map((a) => `„${a}“`).join(' · ') }}</span>
        </p>
        <!-- Eingelangt/Frist deliberately absent: the bar below states
             both, and the pill above already repeats the Frist. What is left
             is the one fact no other surface carries — plus the provenance
             link, which belongs next to the item's identity rather than
             floating mid-page as an action it isn't. Present in both
             lifecycle states: the mid-page CTA stays the only door, this is
             the receipt. -->
        <p
          class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-secondary"
        >
          <!-- Das Ressort ausgeschrieben, wie es die Verordnungsseite
               schon tut. Oben steht nur das Kürzel im Abzeichen, und das
               löst für Sehende auf Touch-Geräten nichts auf: Der volle Name
               liegt dort in `title` und `sr-only`, also hinter einem Hover,
               den es auf dem Telefon nicht gibt. Hier hat er Platz, weil es
               eine Prosazeile ist. -->
          <span>{{ data.ministryName }}</span>
          <span aria-hidden="true">·</span>
          <template v-if="data.invitedBy">
            <span>Übermittelt von {{ data.invitedBy }}</span>
            <span aria-hidden="true">·</span>
          </template>
          <!-- linkClasses, i.e. underlined at rest: sharing a line with
               body text of the same size, colour alone would not mark it
               (WCAG 1.4.1) — the standalone styling it wore mid-page no
               longer applies. tap-target restores the 44px it had there. -->
          <ExternalLink
            :href="data.parliamentUrl"
            :class="[linkClasses, 'tap-target']"
          >Auf parlament.gv.at ansehen</ExternalLink>
        </p>
      </header>

      <!-- The map. Five stations, read vertically, so it needs no more
           width than a paragraph and lives in the prose column like
           everything else. Each station links into the section below that
           holds it, and each comparison into the section that answers it —
           the bar is this page's table of contents, in the page's order. -->
      <div class="mt-6">
        <div class="rounded-xl border border-hairline bg-surface p-5">
          <!-- The card opens with the ANSWER, and the way out of it sits on
               the same line: at the bottom the link read as a footnote to
               the predecessor paragraph above it, which it is not.
               This line was the label "Der Text im Verfahren" until
               16.09.2026 — a name for the card that told a visitor nothing
               the five rows below did not already say, in the one place
               where the whole procedure can be answered in two words. The
               label survives where it is still doing work: as the list's
               accessible name in SpineRail. -->
          <!-- Eine ÜBERSCHRIFT, seit 18.09.2026. Sie war ein <p>, und damit
               übersprang die Überschriftennavigation eines Screenreaders
               genau den Block, der die Frage der Seite beantwortet: von der
               h1 direkt auf „Worum geht es?".

               Auf der Zeile steht die Antwort und der Weg hinaus, sonst
               nichts. „Station n von 5" stand hier einen Tag lang daneben
               und ist am 18.09.2026 wieder weg: Die Zahl hat die Liste
               gezählt, auf die man gerade schaut. Ihre beiden Aufgaben
               tragen andere — welche Station gemeint ist, sagt diese
               Überschrift in Worten, und dass es fünf sind, sagen die fünf
               Zeilen. Unter der Leiste kostete sie eine Zeile Kartenhöhe
               für nichts. Der Link trägt Link-Gewicht: text-xs
               text-ink-muted war die einzige Orientierungshilfe der Seite,
               gesetzt, um übersehen zu werden. -->
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 class="font-medium text-ink">
              {{ procedureStatusDe(data) }}
            </h2>
            <NuxtLink
              to="/so-funktionierts"
              class="tap-target rounded text-sm font-medium text-accent-deep hover:underline"
            >
              Wie funktioniert das Verfahren? →
            </NuxtLink>
          </div>
          <SpineRail
            class="mt-4"
            :data="data"
            :anchors="stationAnchors"
            :comparison-anchors="comparisonAnchors"
            :creates-new-law="stationContext.createsNewLaw"
            :rv-statement-total="stationContext.rvStatementTotal"
            :amended-law-count="stationContext.amendedLawCount"
          />
          <!-- The "second attempt" fact, in both lifecycle states: a same-title
             draft ran before and produced no Regierungsvorlage. Same title
             is all that is claimed (the sentence says "gleichlautend"); the
             link lets the reader judge whether it is the same text. -->
          <p v-if="data.predecessor" class="mt-4 max-w-prose text-sm text-ink-secondary">
            Ein gleichlautender Entwurf war bereits in Begutachtung:
            <NuxtLink
              :to="`/entwuerfe/${data.predecessor.gp}/${data.predecessor.inr}`"
              :class="linkClasses"
            >{{ data.predecessor.citation }}</NuxtLink>{{ relatedGpSuffix(data.predecessor.gp) }}<template v-if="data.predecessor.deadline">, Frist bis {{ formatDateDe(data.predecessor.deadline) }}</template> – ohne Regierungsvorlage.
          </p>
        </div>
      </div>

      <section
        v-if="description.length"
        class="page-section"
        aria-labelledby="kurzinfo-heading"
      >
        <!-- Was sr-only: sighted readers got a section whose first visible
             marker was a 14px "Ziel". The page now reads as a question
             sequence — worum geht es, was wurde daraus. -->
        <h2 id="kurzinfo-heading" class="section-heading">Worum geht es?</h2>
        <div class="mt-4">
          <DraftDescription :blocks="description" />
        </div>
      </section>

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
           stays at the front and follows the window that is open. -->
      <div
        v-if="windows.begutachtung || windows.vorlage"
        class="mt-6 rounded-xl border border-hairline bg-surface p-5"
      >
        <!-- Überschriften, nicht Absätze (18.09.2026): Das ist die einzige
             Handlung, die die Seite anbietet, und sie stand für die
             Überschriftennavigation überhaupt nicht in der Gliederung. Nur
             eine der beiden rendert je. -->
        <h2 v-if="windows.begutachtung" class="font-semibold text-ink">
          {{ fristLabel(data.deadline, true) }}<template v-if="data.deadline">
            – die Frist endet am {{ formatDateDe(data.deadline) }}</template>
        </h2>
        <!-- The second window alone: the Begutachtung is over, parliament
             still listens. No date, because upstream publishes none — the
             form closes with the vote, and the card says exactly that. -->
        <h2 v-else class="font-semibold text-ink">
          Die Begutachtung ist vorbei – zur Regierungsvorlage
          {{ data.enactment?.rvCitation }} kann im Nationalrat weiter Stellung
          genommen werden.
        </h2>
        <p v-if="windows.vorlage && !windows.begutachtung" class="mt-2 max-w-prose text-sm text-ink-secondary">
          {{ SECOND_ROUND_WINDOW }}<template v-if="data.deadline">
            Die Begutachtungsfrist endete am
            {{ formatDateDe(data.deadline) }}.</template>
        </p>
        <!-- Directly under the date it qualifies, above the CTA: whoever is
             about to submit reads it before acting, and the sentence ends by
             naming the date that governs. -->
        <p v-if="windows.begutachtung && divergence" class="mt-2 max-w-prose text-sm text-ink-secondary">
          Zweite amtliche Quelle, andere Frist: Das Rechtsinformationssystem
          nennt als Fristende
          <ExternalLink
            v-if="divergence.url"
            :href="divergence.url"
            class="tap-target rounded font-medium text-accent-deep hover:underline"
          >
            {{ formatDateDe(divergence.date) }}</ExternalLink><span v-else class="font-medium text-ink">{{
            formatDateDe(divergence.date)
          }}</span>
          – {{ countLabelDe(divergence.days, 'Tag', 'Tage') }}
          {{ divergence.later ? 'später' : 'früher' }}. Eingebracht wird beim
          Parlament<template v-if="data.deadline">, maßgeblich ist daher der
            {{ formatDateDe(data.deadline) }}</template>.
        </p>
        <!-- Both windows open: stated as a sequence of facts, not as a
             verdict on the ministry (framing rule). The reader gets both
             doors and the fact that makes the second one matter. -->
        <p v-if="windows.begutachtung && windows.vorlage" class="mt-2 max-w-prose text-sm text-ink">
          Die Regierungsvorlage {{ data.enactment?.rvCitation }} liegt bereits
          im Nationalrat, während die Begutachtungsfrist noch läuft. Auch dort
          kann Stellung genommen werden, {{ SECOND_ROUND_CLAUSE }}.
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <UButton
            v-if="windows.begutachtung"
            :to="data.parliamentUrl"
            target="_blank"
            rel="noopener"
            color="primary"
            class="min-h-11"
          >
            Stellungnahme auf parlament.gv.at abgeben<span aria-hidden="true"> ↗</span><span class="sr-only"> (neues Fenster)</span>
          </UButton>
          <UButton
            v-if="windows.begutachtung && data.deadline"
            :to="`/entwuerfe/${gp}/${inr}/frist.ics`"
            external
            color="neutral"
            variant="outline"
            class="min-h-11"
          >
            Frist in den Kalender (.ics)
          </UButton>
          <!-- Primary when it is the only door; beside the Begutachtung's
               button it steps back to an outline, first things first. The
               target is the Vorlage's page, where parliament renders the
               form — the same way the Begutachtung's button works. -->
          <UButton
            v-if="windows.vorlage && data.enactment"
            :to="data.enactment.rvUrl"
            target="_blank"
            rel="noopener"
            color="primary"
            :variant="windows.begutachtung ? 'outline' : 'solid'"
            class="min-h-11"
          >
            Stellungnahme zur Regierungsvorlage auf parlament.gv.at abgeben<span aria-hidden="true"> ↗</span><span class="sr-only"> (neues Fenster)</span>
          </UButton>
        </div>
        <!-- The documented base fact (drafts get revised routinely), no
             per-Stellungnahme causality — the honest interim form of
             "your input changed §5" until the diff layer exists. Once the
             Vorlage exists, that comparison IS on the page, so the card
             points at it instead. -->
        <p v-if="windows.begutachtung && !data.enactment" class="mt-3 max-w-prose text-sm text-ink-secondary">
          Ministerien überarbeiten Entwürfe nach der Begutachtung regelmäßig.
          Der Monitor verfolgt auch bei diesem Entwurf, was daraus wird.
        </p>
        <!-- KEIN dritter Verweis auf #textvergleich (18.09.2026). Liegt
             eine Vorlage vor, zeigt die Leiste unmittelbar über dieser
             Karte schon „Was sich nach der Begutachtung geändert hat", und
             der Abschnitt zur Regierungsvorlage verlinkt denselben Anker
             noch einmal. Drei Wege zur selben Stelle sind kein Angebot. -->
      </div>

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

        <!-- ZUERST die Begründung, dann das geltende Recht, dann die
             Dokumente, dann die Gegenüberstellung: die Reihenfolge, in der
             ein Leser einen neuen Entwurf prüft — erst „was soll das
             Gesetz?", dann der Text. Sie stand bis 18.09.2026 nur als
             PDF-Link in der Dokumentliste weiter unten.

             Nicht unter „Worum geht es?": Das ist die Kurzbeschreibung des
             Parlaments, geschrieben für den parlamentarischen Betrieb. Die
             Erläuterungen sind die Begründung des Ressorts selbst, und sie
             gehören zum Entwurf, nicht zum Verfahren. -->
        <div id="erlaeuterungen" class="mt-4 scroll-mt-6">
          <h3 class="text-base font-semibold text-ink">Was das Ressort begründet</h3>
          <ExplanationsSection :gp="data.gp" :inr="data.inr" />
        </div>

        <!-- Keeps `id="recht"`: that anchor is in circulation, and what it
             named is still here, one level down. The one text version we
             hold no document for — what we can offer is the consolidated
             text in RIS, at the version in force when the draft was filed
             (`amendedLawsService.ts`). -->
        <div
          v-if="amendedLaws && (amendedLaws.laws.length || amendedLaws.createsNewLaw)"
          id="recht"
          class="mt-8 scroll-mt-6"
        >
          <h3 class="text-base font-semibold text-ink">Geltendes Recht</h3>
          <p v-if="amendedLaws.createsNewLaw" class="mt-1 max-w-prose text-sm text-ink-secondary">
            Dieser Entwurf schafft neues Recht. Es gibt keinen geltenden Text,
            gegen den er gehalten werden könnte.
          </p>
          <template v-else>
            <p class="mt-1 max-w-prose text-sm text-ink-secondary">
              {{ amendedLaws.laws.length === 1 ? 'Dieses Gesetz würde der Entwurf ändern' : `Diese ${amendedLaws.laws.length} Gesetze würde der Entwurf ändern` }}<template v-if="amendedLaws.asOf">, in der Fassung vom {{ formatDateDe(amendedLaws.asOf) }}</template>:
            </p>
            <ul class="mt-2 divide-y divide-hairline">
              <li v-for="law in amendedLaws.laws" :key="law.title" class="py-3">
                <p class="text-sm text-ink">
                  <ExternalLink v-if="law.risUrl" :href="law.risUrl" :class="linkClasses">{{ law.title }}</ExternalLink>
                  <template v-else>{{ law.title }}</template>
                </p>
                <!-- A law whose Stammnorm is no Bundesgesetzblatt has no
                     consolidated RIS entry to point at (the UGB's is
                     "dRGBl. S. 219/1897"). Saying so beats dropping it.

                     „– im RIS nicht auffindbar" ist am 18.09.2026
                     weggefallen: Die Frage des Lesers ist, warum hier keine
                     BGBl-Nummer steht, und die Antwort ist die erste
                     Hälfte — eine Tatsache über das Gesetz. Dass unsere
                     Suche nichts gefunden hat, ist eine über uns. -->
                <p class="mt-0.5 text-xs text-ink-muted">
                  {{ law.bgbl ?? 'Stammfassung ist kein Bundesgesetzblatt' }}
                </p>
              </li>
            </ul>
          </template>
        </div>

        <!-- A heading of its own, because the list is no longer the first
             thing under the h2: after the Geltendes Recht block above it, an
             unheaded list read as more of that block. -->
        <div v-if="data.documents.length" class="mt-8">
          <h3 class="text-base font-semibold text-ink">Dokumente</h3>
          <div class="mt-3">
            <DocumentList :documents="data.documents" />
          </div>
        </div>

        <!-- The same documents from the other official source, next to them
             rather than in a "Quellen" appendix nobody scrolled to: RIS
             carries the text as HTML/XML back to 2004 — the raw material of
             the Entwurf ↔ Regierungsvorlage comparison. "Not in RIS" is a
             state worth showing, not an error (docs/ris-join.md §2): a dozen
             drafts per GP never get there. -->
        <div v-if="data.risDraft" class="mt-8">
          <h3 class="text-base font-semibold text-ink">
            Zweite Quelle: Rechtsinformationssystem (RIS)
          </h3>
          <template v-if="data.risDraft.risUrl">
            <p class="mt-1 max-w-prose text-sm text-ink-secondary">
              Das RIS des Bundes führt denselben Entwurf mit Text, Erläuterungen
              und Textgegenüberstellung im
              <ExternalLink
                :href="data.risDraft.risUrl"
                :class="linkClasses"
              >RIS-Eintrag</ExternalLink>.
            </p>
            <div v-if="risDocuments.length" class="mt-3">
              <DocumentList :documents="risDocuments" source="ris.bka.gv.at" />
            </div>
          </template>
          <p v-else class="mt-1 max-w-prose text-sm text-ink-secondary">
            Zu diesem Entwurf ist im RIS keine Veröffentlichung zu finden.
          </p>
        </div>

        <!-- The ressort's own comparison, available from day one.
             `#gegenueberstellung` is kept as the anchor because that link is
             already in circulation. A new law has nothing to be held
             against, so the question is not asked — the same rule the bar
             applies. `amendedLaws` arrives on the client, so for the rare
             Stammgesetz this block can disappear after first paint; that is
             accepted, the alternative is asking a question we know is
             wrong on every other draft's first paint. -->
        <div v-if="!amendedLaws?.createsNewLaw" id="gegenueberstellung" class="mt-8 scroll-mt-6">
          <h3 class="text-base font-semibold text-ink">Was ändert der Entwurf?</h3>
          <TextComparisonSection :gp="data.gp" :inr="data.inr" />
        </div>

      </section>

      <!-- The Begutachtung: the Stellungnahmen ARE this station's content,
           and the moment the ressort takes the file over ends it. What came
           of it has its own section now — an outcome is a station, not a
           sub-heading of the stage before it. -->
      <section id="begutachtung" class="page-section scroll-mt-6" aria-labelledby="begutachtung-heading">
        <h2 id="begutachtung-heading" class="section-heading">Die Begutachtung</h2>
        <h3 class="mt-4 text-base font-semibold text-ink">Stellungnahmen</h3>
        <div class="mt-4">
          <p
            v-if="data.statements.degraded"
            class="rounded-xl border border-hairline bg-surface p-5 text-sm leading-relaxed text-ink-secondary"
          >
            {{ countLabelDe(data.statements.total, 'Stellungnahme', 'Stellungnahmen') }}
            laut Übersicht – die Liste ist auf parlament.gv.at derzeit nicht
            abrufbar, daher können Details hier nicht angezeigt werden.
            <ExternalLink
              :href="data.parliamentUrl"
              :class="linkClasses"
            >Auf parlament.gv.at ansehen</ExternalLink>
          </p>
          <template v-else-if="data.statements.total > 0">
            <StatementsPanel :gp="gp" :inr="inr" :summary="data.statements" />
            <!-- Silent disagreement between the two upstream sources is the
                 one option that serves nobody — a journalist who cites the
                 card's number and screenshots this page must not find a
                 contradiction. -->
            <p
              v-if="
                data.statements.overviewTotal != null
                  && data.statements.overviewTotal !== data.statements.total
              "
              class="mt-3 text-xs text-ink-muted"
            >
              Die Übersicht des Parlaments zählt
              {{ formatNumberDe(data.statements.overviewTotal) }} Stellungnahmen
              – davon hier aufgeschlüsselt:
              {{ formatNumberDe(data.statements.total) }}.
              <template v-if="data.statements.overviewTotal > data.statements.total">
                Die Übersichtszahl kann Einträge enthalten, die noch nicht in
                der Liste veröffentlicht sind.
              </template>
            </p>
            <p v-if="data.statements.staleAsOf" class="mt-3 text-xs text-ink-muted">
              Stand der Liste: {{ formatDateTimeDe(data.statements.staleAsOf) }}
              – die aktuelle Liste ist auf parlament.gv.at derzeit nicht
              abrufbar.
            </p>
          </template>
          <EmptyState
            v-else
            title="Noch keine Stellungnahmen"
            :description="
              data.active
                ? 'Zu diesem Entwurf ist noch keine Stellungnahme eingelangt – die Frist läuft.'
                : 'Zu diesem Entwurf sind keine Stellungnahmen eingelangt.'
            "
          />
        </div>
        <!-- The moment the ressort takes over — the accountability clock's
             start, and the only thing the raw stage list adds. -->
        <p v-if="handoffSentence" class="mt-3 text-sm text-ink-secondary">
          {{ handoffSentence }}
        </p>
      </section>

      <!-- The station that had no home: the Regierungsvorlage lived as a
           sub-heading inside the Begutachtung, which made the outcome read
           as an appendix to the stage before it. The bar's "bisher keine"
           row links here, where the base rate explains what waiting means.
           Present in both outcomes — that is the framing rule: the win and
           the non-win get the same section, the same form, the same
           weight. -->
      <section
        v-if="showOutcome"
        id="regierungsvorlage"
        class="page-section scroll-mt-6"
        aria-labelledby="rv-heading"
      >
        <h2 id="rv-heading" class="section-heading">Die Regierungsvorlage</h2>
        <!-- KEIN Kasten mehr (18.09.2026). Das weiße Blatt mit Kante trägt
             auf dieser Seite Zeilen (Stellungnahmenlisten, Dokumente) oder
             ein Seitenobjekt mit eigener Aufgabe (die Leiste, die
             Frist-Karte) — Prosa trägt es nie: „Im Parlament", „Im
             Bundesgesetzblatt" und „Worum geht es?" setzen ihren Text frei
             unter die Überschrift. Der Kasten hier stammt aus der Zeit, als
             die Regierungsvorlage eine Zwischenüberschrift IN der
             Begutachtung war und seine Kante das Einzige war, was den
             Abschnitt abgegrenzt hat. Seit er eine eigene h2 mit Balken hat,
             fasst er ein zweites Mal ein, was die Überschrift schon trennt —
             und genau dagegen argumentiert `page-section` in `main.css`.

             `id="ergebnis"` bleibt auf dem Zweig, der jeweils rendert: Der
             Anker ist in Umlauf, und es steht immer nur einer der beiden auf
             der Seite. -->
        <div v-if="data.enactment" id="ergebnis" class="mt-4">
          <!-- Der Befund als Satz, nicht als freistehender Link: Ohne Kasten
               hätte „Regierungsvorlage 443 d.B." prädikatlos unter einer
               Überschrift gehangen, die dasselbe Wort schon sagt. Dieselbe
               Form wie „Kundgemacht als …" einen Abschnitt tiefer.

               Die Stellungnahmenzahl, die hier bis 18.09.2026 vorwegstand
               („Bis zum Fristende am … gingen … ein"), ist weg: Der
               Abschnitt unmittelbar darüber IST diese Zahl, samt Liste — und
               der Satz war in der Vergangenheitsform ohnehin falsch, sobald
               die Vorlage vor Fristende einlangt (7 von 91 in GP XXVIII, wo
               beide Fenster gleichzeitig offen stehen). Im Kasten fiel die
               Wiederholung nicht auf, in Prosa steht sie nackt da. -->
          <p class="max-w-prose text-sm text-ink">
            Der Entwurf wurde als
            <ExternalLink
              :href="data.enactment.rvUrl"
              :class="linkClasses"
            >Regierungsvorlage {{ data.enactment.rvCitation }}</ExternalLink>
            eingebracht.
          </p>
          <!-- ME→RV ist 1:n: ohne diesen Satz ist die zweite
               Regierungsvorlage eines geteilten Entwurfs unsichtbar (4 von
               132 im XXVIII-Korpus). -->
          <p v-if="data.enactment.furtherRv.length" class="mt-2 max-w-prose text-sm text-ink">
            Aus dem Entwurf ging außerdem
            <template
              v-for="(rv, i) in data.enactment.furtherRv"
              :key="rv.url"
            ><span v-if="i > 0">, </span><ExternalLink :href="rv.url" :class="linkClasses">{{ rv.label }}</ExternalLink></template>
            hervor.
          </p>
          <!-- Mechanismus 3, Handarbeit: die Einladung zu dem Vergleich, den
               die Diff-Schicht einmal von selbst zieht. Zeitlich erzählt,
               nicht kausal. Der Vergleich selbst steht weiter unten und wird
               verlinkt, nicht wiederholt. -->
          <p class="mt-2 max-w-prose text-sm text-ink-secondary">
            {{ RV_DEFINITION }} Ob und wie der Entwurf geändert wurde, zeigt
            <a href="#textvergleich" :class="linkClasses">der Vergleich der beiden Texte</a>
            weiter unten.
          </p>
        </div>
        <div v-if="!data.enactment && !data.active" id="ergebnis" class="mt-4">
          <!-- Der zitierfähige Befundsatz führt, in `font-medium`: Die
               Rangfolge im Abschnitt trägt jetzt Größe und Gewicht, nicht
               mehr eine Kante. -->
          <p v-if="noRvVerdict" class="max-w-prose text-sm font-medium text-ink">
            {{ noRvVerdict }}
          </p>
          <!-- Die Definition steht HIER, nicht nur im Zweig mit Vorlage:
               Wer nicht weiß, was eine Regierungsvorlage ist, kann auch
               nicht einordnen, dass keine kam — und das ist der häufigere
               Fall. -->
          <p
            class="max-w-prose text-sm text-ink-secondary"
            :class="noRvVerdict ? 'mt-2' : ''"
          >
            {{ RV_DEFINITION }} {{ noRvBody }}
          </p>
          <p v-if="noRvBaseRate" class="mt-2 max-w-prose text-sm text-ink-secondary">
            {{ noRvBaseRate }}
          </p>
          <!-- The win side of the same mechanism: the draft that finds a
               lapsed one also finds the one that took its place. Ink, not
               secondary — it is the one actionable line in the section. -->
          <p v-if="data.successor" class="mt-3 max-w-prose text-sm text-ink">
            Ein gleichlautender späterer Entwurf liegt vor:
            <NuxtLink
              :to="`/entwuerfe/${data.successor.gp}/${data.successor.inr}`"
              :class="linkClasses"
            >{{ data.successor.citation }}</NuxtLink>{{ relatedGpSuffix(data.successor.gp) }}, eingelangt am
            {{ formatDateDe(data.successor.arrivedAt) }}.
          </p>
        </div>
        <!-- The second window for input: what was filed on the Vorlage itself,
             in the same row grammar as the Begutachtung's panel. Client-side
             data, so the block appears once it is there and says nothing
             while it is not — an empty promise here would read as "none". -->
        <RvStatements
          v-if="data.enactment && rvStatements"
          :data="rvStatements"
          :filing-open="windows.vorlage"
        />
        <!-- The accountability core: what became of the draft, § by §, both
             ways — changed and unchanged alike (CLAUDE.md framing rule). Only
             once a Regierungsvorlage exists; before that there is nothing to
             hold the draft against. -->
        <LawDiffSection v-if="data.enactment" :gp="data.gp" :inr="data.inr" />
      </section>

      <!-- The station exists as soon as a Regierungsvorlage does, not only
           when parliament amended it: "der Nationalrat hat den Text
           unverändert beschlossen" IS a finding, and it had no place on this
           page before. Where change does happen it is the majority case —
           52 of the 91 GP-XXVIII drafts that reached a Vorlage were changed
           again afterwards — and the comparisons for it are not built yet,
           so the section carries the texts. -->
      <section
        v-if="data.enactment"
        id="parlament"
        class="page-section scroll-mt-6"
        aria-labelledby="parlament-heading"
      >
        <h2 id="parlament-heading" class="section-heading">Im Parlament</h2>
        <!-- One sentence per outcome, from the same function the bar's fact
             line uses (`app/utils/spine.ts`), so the two can never
             disagree. "lapsed" says what happened and not why: we observe
             the end of the GP, never the reason for it. -->
        <p class="mt-1 max-w-prose text-sm text-ink-secondary">
          <template v-if="parliament === 'unchanged'">
            Der Nationalrat hat den Text der Regierungsvorlage unverändert
            beschlossen.
          </template>
          <template v-else-if="parliament === 'amended'">
            Nach der Regierungsvorlage wurde der Text im Parlament weiter
            geändert. Diese Fassungen sind dabei entstanden:
          </template>
          <template v-else-if="parliament === 'pending'">
            Die Regierungsvorlage ist im Nationalrat in Behandlung.
          </template>
          <template v-else>
            Das Verfahren endete mit der Gesetzgebungsperiode ohne
            Kundmachung.
          </template>
        </p>
        <!-- A first-time reader cannot know these rows ARE the law text at
             successive stations — the sentence above says it once. The
             Regierungsvorlage itself is not among them: the section above
             offers it, and the same link under two headings is what this
             page had too much of. Documents wear the Entwurfsdokumente
             pattern: one row per station, formats as buttons. -->
        <div v-if="data.textEvolution.length" class="mt-3">
          <DocumentList :documents="data.textEvolution" />
        </div>
        <!-- The parliamentary record itself. Our trace ends at the
             Regierungsvorlage; its page upstream is where the readings,
             dates and votes live. -->
        <p class="mt-3 text-sm text-ink-secondary">
          <ExternalLink
            :href="data.enactment.rvUrl"
            :class="linkClasses"
          >Verlauf auf parlament.gv.at</ExternalLink>
        </p>
      </section>

      <!-- Short by design: the end of the story, and one line is all of it.
           It used to be a line inside the Regierungsvorlage card, where the
           law itself was a footnote to the draft for it. This is also the
           natural home for a later "so steht das Gesetz heute" link into RIS
           Bundesrecht. -->
      <section
        v-if="data.enactment?.bgblNumber"
        id="bundesgesetzblatt"
        class="page-section scroll-mt-6"
        aria-labelledby="bgbl-heading"
      >
        <h2 id="bgbl-heading" class="section-heading">Im Bundesgesetzblatt</h2>
        <p class="mt-4 max-w-prose text-sm text-ink">
          Kundgemacht als
          <ExternalLink
            v-if="data.enactment.bgblRisUrl"
            :href="data.enactment.bgblRisUrl"
            :class="linkClasses"
          >{{ data.enactment.bgblNumber }}</ExternalLink><span v-else>{{ data.enactment.bgblNumber }}</span>.
        </p>
      </section>

      <p class="mt-10 border-t border-hairline pt-4 max-w-prose text-sm text-ink-secondary">
        Wird dieses Verfahren öffentlich unter einem anderen Namen diskutiert?
        Hinweise an
        <a
          href="mailto:kontakt@begutachtungs-monitor.at"
          :class="linkClasses"
        >kontakt@begutachtungs-monitor.at</a> — die Suche findet den Entwurf dann auch darunter.
      </p>
    </article>
  </div>
</template>
