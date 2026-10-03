<script setup lang="ts">
import type { AmendedLawsResponse, DraftDetail, EnactmentInfo, RvStatementsResponse } from '#shared/types'
import type { ComparisonId, StationContext, StationId } from '~/utils/spine'
import type { Fact } from '~/components/ui/FactList.vue'
import { deadlineCardClass, deadlineTone, fristClassOf, fristContextDe, fristRangeDe } from '~/utils/deadlines'
import {
  SECOND_ROUND_CLAUSE,
  lastParliamentStation,
  parliamentTexts,
  parliamentOutcome,
  procedureStatusDe,
  stations,
  voteLineDe,
} from '~/utils/spine'
import { aliasesFor } from '#shared/utils/draftAliases'
import { antragUrl, carriesDraft } from '#shared/utils/antragPath'
import { bgblShort, todayIso } from '#shared/utils/format'
import { promulgationState } from '#shared/utils/promulgation'
import AmendedLawLine from '~/components/draft/AmendedLawLine.vue'
import ChangeShareBar from '~/components/draft/ChangeShareBar.vue'
import PageSubsection from '~/components/ui/PageSubsection.vue'
import { changeShareRateFor, changeShareValueDe, earlyVorlageWhenDe, reasoningShareValueDe, tabledBeforeFristEnd } from '~/utils/outcomes'
// Explicit: `draftStations.ts` is a pure module and stays out of the
// auto-imports, so that server map and vitest run the same functions.
import { mayClaimOutcome } from '#shared/utils/draftStations'
import { GP_RE, INR_RE } from '#shared/utils/gp'
import { LAW_STATION_LABEL, lawStationOf } from '#shared/utils/lawStations'
import { risSource, type SourceEntry } from '#shared/utils/provenance'

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
const shareValue = computed(() => {
  const s = vorlageOutcome.share.value
  return s ? changeShareValueDe(s.changed, s.own, s.noun) : null
})
const shareRate = computed(() => changeShareRateFor(data.value?.gp))
/* A Vorlage tabled while the Frist still ran is not held against the range:
 * that range was measured on Vorlagen that came after the Begutachtung
 * (`tabledBeforeFristEnd`, 115/ME). When it came stands in the bar's place. */
const earlyVorlageWhen = computed(() => {
  const d = data.value
  const rvDate = d?.enactment?.rvDate
  if (!d?.deadline || !rvDate || !tabledBeforeFristEnd(d.deadline, rvDate)) return null
  return earlyVorlageWhenDe({ arrivedAt: d.arrivedAt, deadline: d.deadline, rvDate })
})
const reasoningValue = computed(() => {
  const r = vorlageOutcome.reasoningStats.value
  return r ? reasoningShareValueDe(r.changed, r.compared) : null
})

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
    ...(d.enactment?.bgblNumber || d.enactment?.successor?.bgblNumber ? { bgbl: '#bundesgesetzblatt' } : {}),
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

/* What parliament did, for the sentence in "Im Parlament". Same function as
 * the bar's fact line, so the heading and the row cannot disagree. */
const parliament = computed(() => (data.value ? parliamentOutcome(data.value) : null))

/* And how the clubs voted on it — the same phrase the bar's row carries,
 * here as the tail of a sentence that names the reading it belongs to. Null
 * until the third reading happened, and null for the few records upstream
 * keeps without club lists (`parseVote`), where the section simply says one
 * sentence less rather than a vaguer one. */
const voteLine = computed(() => voteLineDe(data.value?.enactment?.vote))

/* What parliament did, as the frame's first row. One sentence per outcome;
 * the comment at the frame says why none of them names a motive. */
const PARLIAMENT_OUTCOME_DE: Record<NonNullable<ReturnType<typeof parliamentOutcome>>, string> = {
  unchanged: 'Der Nationalrat hat den Text der Regierungsvorlage unverändert beschlossen.',
  // Where it changed — Ausschuss, Plenum — stands in the bar and in the
  // comparison's toggle below.
  amended: 'Der Text wurde im Parlament weiter geändert.',
  // The plain case only; every other „beschlossen" is `decidedStandDe` below.
  decided: 'Der Nationalrat hat den Text beschlossen; die Kundmachung im Bundesgesetzblatt steht aus.',
  rejected: 'Die Regierungsvorlage wurde im Nationalrat abgelehnt.',
  withdrawn: 'Die Regierungsvorlage wurde zurückgezogen.',
  recommitted: 'Die Regierungsvorlage wurde an den Ausschuss zurückverwiesen.',
  pending: 'Die Regierungsvorlage ist im Nationalrat in Behandlung.',
  lapsed: 'Das Verfahren endete mit der Gesetzgebungsperiode ohne Kundmachung.',
}

/**
 * „Beschlossen" in the states it can be in after 03.10.2026 — one sentence
 * each, chosen by the same rule the spine and the list row read
 * (`promulgationState`, §12.33).
 *
 * Temporal, never causal, except where Parliament's own record names the
 * cause („Formalfehler") or the successor (80 d.B. → 416/A): what we infer
 * from the calendar alone is said as time only („seit dem … nicht"). A
 * second chamber is named only where its Beschluss was read. „bisher" is
 * gone from the plain case: it promised a Kundmachung for the texts that
 * never got one.
 */
function decidedStandDe(e: EnactmentInfo, today: string): string {
  const state = promulgationState(e, today)
  if (state === 'explicit') {
    const notDone = e.notPromulgated?.reason === 'formalfehler'
      ? 'kundgemacht wurde er wegen eines Formalfehlers nicht.'
      : 'kundgemacht wurde er nicht.'
    const sentence = `Nationalrat und Bundesrat haben den Text beschlossen; ${notDone}`
    return e.successor?.bgblNumber
      ? `${sentence} Neu eingebracht als Initiativantrag ${e.successor.citation}, ist er als ${bgblShort(e.successor.bgblNumber)} kundgemacht.`
      : sentence
  }
  if (state === 'overdue') {
    const since = formatDateDe(e.bundesratDecidedAt ?? e.decidedAt ?? '')
    return e.bundesratDecidedAt
      ? `Nationalrat und Bundesrat haben den Text beschlossen; kundgemacht ist er seit dem ${since} nicht.`
      : `Der Nationalrat hat den Text beschlossen; kundgemacht ist er seit dem ${since} nicht.`
  }
  // At the Bundesrat: the window is still open there (§12.26), and this is
  // the step the text is at.
  if ((e.filingOpen || e.houseStatus === '4') && e.bundesratArrivedAt && !e.bundesratDecidedAt) {
    return `Der Nationalrat hat den Text beschlossen; der Bundesrat befasst sich seit ${formatDateDe(e.bundesratArrivedAt)} damit.`
  }
  return PARLIAMENT_OUTCOME_DE.decided
}

const committeeReport = computed(() => data.value?.enactment?.committeeReport ?? null)
const plenaryAmendments = computed(() => data.value?.enactment?.plenaryAmendments ?? null)

const parliamentFacts = computed<Fact[]>(() => {
  const outcome = parliament.value ?? 'lapsed'
  const e = data.value?.enactment
  // A Beschluss that was not promulgated reads as one whatever the status
  // prose said; every other „beschlossen" goes through the same function.
  const stand = e && (outcome === 'decided' || promulgationState(e, todayIso()))
    ? decidedStandDe(e, todayIso())
    : PARLIAMENT_OUTCOME_DE[outcome]
  return [
    { key: 'stand', title: 'Stand', text: stand },
    // Where the Abänderungsanträge are named, in procedural order between
    // the state and the vote (02.10.2026). Values in the template's slots,
    // they carry links. A row is missing where the Verlauf names nothing —
    // never „keine", because a motion the reader missed would turn into a
    // false negative.
    ...(committeeReport.value ? [{ key: 'ausschuss', title: 'Im Ausschuss' }] : []),
    ...(plenaryAmendments.value?.amendments.length ? [{ key: 'plenum', title: 'Im Plenum' }] : []),
    ...(voteLine.value ? [{ key: 'lesung', title: 'Dritte Lesung', text: `${voteLine.value}.` }] : []),
  ]
})

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

/* Parliament's versions under the names the comparison above them uses —
 * „Ausschussfassung", not upstream's „Geändert im Ausschuss" (01.10.2026):
 * in a fold right under a toggle and a source line that say
 * „Ausschussfassung", the same document must not carry a second name. A
 * title upstream gives that is no station keeps its own. */
const parliamentDocuments = computed(() =>
  (data.value?.textEvolution ?? []).map((doc) => {
    const station = lawStationOf(doc.title)
    return station ? { ...doc, title: LAW_STATION_LABEL[station] } : doc
  }),
)
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
 * section goes where the Erläuterungen are there to carry it; Ziele and
 * Inhalt stay as the quick overview. Only the rendered blocks: the SEO
 * snippet still reads the whole Kurzinformation.
 *
 * Same key as ExplanationsSection, so one request (`useExplanations`). The
 * section is folded by default (`DraftDescription`, OPEN_SECTIONS), so where
 * the Erläuterungen arrive only after hydration, what disappears is one
 * closed row. */
const { data: explanations } = useExplanations(() => ({ gp: gp.value, inr: inr.value }))
const MAIN_POINTS_RE = /^Hauptgesichtspunkte\b/
const kurzinfoBlocks = computed(() => {
  const e = explanations.value
  if (!e?.available || !e.passages.length) return description.value
  const out: typeof description.value = []
  let skipping = false
  for (const block of description.value) {
    if (block.kind === 'heading') skipping = MAIN_POINTS_RE.test(block.text)
    if (!skipping) out.push(block)
  }
  return out
})

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
/**
 * The door card's ground. While the Begutachtung runs, the card IS the
 * countdown's box — the list row's tone (`deadlineGroundClass`, shared with
 * `EntryState`) over the whole card, not a chip inside the heading, which
 * broke the sentence and read as bolted on. The words say the urgency, the
 * ground repeats it, so meaning never rides on colour alone. The Vorlage
 * window alone has no Frist to tone and keeps the plain card.
 */
const doorClass = computed(() =>
  windows.value.begutachtung && data.value
    ? deadlineCardClass(deadlineTone(data.value.deadline, true))
    : 'border-hairline bg-surface',
)

const divergence = computed(() =>
  fristDivergence(data.value?.risDraft ?? null, Boolean(data.value?.active)),
)

/** The documents in the fold, counted for its summary. */
const documentCount = computed(() => data.value?.documents.length ?? 0)

/** The yardstick behind the rail's „Kurze Frist" / „Volle Frist" — the rail
 *  says which, this sentence says against what. Null in the middle. */
const fristContext = computed(() => {
  const d = data.value
  if (!d) return null
  return fristContextDe(fristClassOf(d.arrivedAt, d.deadline))
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

/* The Initiativantrag route replaces all three sentences below: no Vorlage,
 * and still a law (docs/architecture.md §12.10, `AntragPathNote`). */
const viaAntrag = computed(() => carriesDraft(data.value?.antragPath))

const noRvVerdict = computed(() => {
  const d = data.value
  if (!d || viaAntrag.value) return null
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
    return 'Bisher gibt es keine Regierungsvorlage.'
  }
  // „Zwischen Begutachtungsende und Regierungsvorlage liegen häufig mehrere
  // Monate" stood here until 30.09.2026; the base rate below says the same
  // with numbers.
  return 'Bisher gibt es keine Regierungsvorlage.'
})

/* The base rate under the waiting sentence, while the GP still runs: how
 * many drafts of the last closed GP got their Regierungsvorlage and how
 * fast (app/utils/outcomes.ts). Numbers, so the reader can weigh the
 * silence without the page weighing it for them. */
const noRvBaseRate = computed(() =>
  lapsed.value || chainUnlinked.value || viaAntrag.value ? null : rvBaseRateSentenceDe(data.value?.gp),
)

/* The Regierungsvorlage's station frame, in both outcomes. The verdict is
 * the row; what explains it (`rvContext`, the base rate, the Antrag's
 * matching) stands under the frame. Without a verdict the row says
 * „Bisher keine" and the waiting sentence would only repeat it. */
const rvFacts = computed<Fact[]>(() => {
  const d = data.value
  if (!d) return []
  const facts: Fact[] = []
  if (d.enactment) {
    facts.push({ key: 'rv', title: 'Eingebracht' })
    // The comparison's counts, as rows (02.10.2026). The first holds its
    // place while the comparison loads; the second appears when its
    // documents are found — on many drafts they are not.
    if (vorlageOutcome.share.value || vorlageOutcome.sharePending.value) {
      facts.push({ key: 'aenderung', title: 'Umgeschrieben oder gestrichen' })
    }
    if (vorlageOutcome.reasoningStats.value || vorlageOutcome.rvExplanations.value) {
      facts.push({ key: 'begruendung', title: 'Begründung' })
    }
    if (d.enactment.furtherRv.length) facts.push({ key: 'weitere', title: 'Außerdem aus dem Entwurf hervorgegangen' })
    return facts
  }
  if (d.active) return facts
  if (viaAntrag.value) facts.push({ key: 'antrag', title: 'Eingebracht' })
  else facts.push({ key: 'stand', title: 'Stand', text: noRvVerdict.value ?? 'Bisher keine Regierungsvorlage.' })
  if (d.successor) facts.push({ key: 'nachfolger', title: 'Gleichlautender späterer Entwurf' })
  return facts
})
/* The frame carries our own counts, so its credit line names them. */
const rvCounted = computed(() => rvFacts.value.some((f) => f.key === 'aenderung' || f.key === 'begruendung'))
const rvContext = computed(() => (viaAntrag.value || !noRvVerdict.value ? null : noRvBody.value))

/* The law in force the draft would change, as the Entwurf's station frame.
 * A Sammelgesetz names forty; past five the rest fold. */
const LAW_FOLD_AT = 5

/* The credit lines under the station frames (02.10.2026): the laws the
 * Entwurf's frame links are RIS's consolidated texts; the other three frames
 * show Parliament's Verlauf — of the draft (Begutachtung data, which no open
 * data grant covers) and of the Regierungsvorlage (a history page, CC BY). */
const AMENDED_LAWS_SOURCES: SourceEntry[] = [risSource('Geltende Fassung')]
const DRAFT_HISTORY_SOURCES: SourceEntry[] = [{ what: 'Verlauf des Entwurfs', publisher: 'parlament', terms: 'keine-lizenz' }]
const PARLIAMENT_HISTORY_SOURCES: SourceEntry[] = [{ what: 'Verlauf', publisher: 'parlament', terms: 'cc-by' }]
const entwurfFacts = computed<Fact[]>(() => {
  const a = amendedLaws.value
  if (!a) return []
  if (a.createsNewLaw) {
    return [{
      key: 'neu',
      title: 'Geltendes Recht',
      text: 'Keines: Der Entwurf schafft neues Recht, es gibt keinen geltenden Text, gegen den er gehalten werden könnte.',
    }]
  }
  if (!a.laws.length) return []
  return [{ key: 'recht', title: a.laws.length === 1 ? 'Ändert' : `Ändert ${a.laws.length} Gesetze` }]
})

/** Debate names for this procedure, if any (`shared/utils/draftAliases.ts`). */
const aliases = computed(() => (data.value ? aliasesFor(data.value.gp, data.value.inr) : []))

/* A related draft is named by citation and GP; the GP only where it
 * differs from this page's, which is the case that carries information. */
function relatedGpSuffix(gp: string): string {
  return gp === data.value?.gp ? '' : ` (${gp}. GP)`
}

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
  if (!windows.value.begutachtung && d.deadline) {
    const range = fristRangeDe(d.arrivedAt, d.deadline)
    facts.push({
      key: 'frist',
      title: 'Begutachtungsfrist',
      text: range,
    })
  }
  if (handoffFact.value) facts.push(handoffFact.value)
  return facts
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

/**
 * The Ressorts of the byline: the lead and every co-ressort, each with its
 * own link into that Ressort's list. Two of them only on a jointly
 * issued Entwurf — three drafts of GP XXVII
 * (`server/utils/parliament/draftList.ts`).
 */
const ministryLinks = computed(() => {
  const d = data.value
  if (!d) return []
  return [{ code: d.ministryCode, name: d.ministryName }, ...d.coMinistries].map((m) => ({
    ...m,
    to: `/entwuerfe?ministry=${m.code}&gp=${d.gp}`,
    label: `Alle Entwürfe des Ministeriums ${m.name} anzeigen`,
  }))
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
        <div class="mt-6">
          <div class="rounded-xl border border-hairline bg-surface p-4">
            <!-- The card opens with the ANSWER, and the way out of it sits on
                 the same line: at the bottom the link read as a footnote to
                 the predecessor paragraph above it, which it is not.
                 This line was the label "Der Text im Verfahren" until
                 16.09.2026 — a name for the card that told a visitor nothing
                 the five rows below did not already say, in the one place
                 where the whole procedure can be answered in two words. The
                 label survives where it is still doing work: as the list's
                 accessible name in SpineRail. -->
            <!-- A HEADING, since 18.09.2026. It was a <p>, so a screen
                 reader's heading navigation skipped exactly the block that
                 answers the page's question: straight from the h1 to „Worum
                 geht es?".

                 The line carries the answer and the way out, nothing else.
                 „Station n von 5" stood beside it for one day and went again
                 on 18.09.2026: the number counted the list one is looking at.
                 Its two jobs are carried by others — which station is meant is
                 said by this heading in words, and that there are five is said
                 by the five rows. The link carries link weight: text-xs
                 text-ink-muted was the page's only orientation aid, set to be
                 overlooked. -->
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 class="font-sans text-base font-semibold text-ink">
                {{ procedureStatusDe(data) }}
              </h2>
              <NuxtLink
                to="/so-funktionierts"
                class="tap-target text-sm font-medium link-quiet"
              >
                Wie funktioniert das Verfahren? →
              </NuxtLink>
            </div>
            <SpineRail
              class="mt-4"
              :stations="stationList"
              :anchors="stationAnchors"
              :comparison-anchors="comparisonAnchors"
            />
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
              >{{ data.predecessor.citation }}</NuxtLink>{{ relatedGpSuffix(data.predecessor.gp) }}<template v-if="data.predecessor.deadline">, Frist bis {{ formatDateDe(data.predecessor.deadline) }}</template> – ohne Regierungsvorlage.
            </p>
          </div>
        </div>

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
        <div
          v-if="windows.begutachtung || windows.vorlage"
          class="mt-6 rounded-xl border p-4"
          :class="doorClass"
        >
          <!-- Headings, not paragraphs (18.09.2026): this is the only action
               the page offers, and for heading navigation it did not appear in
               the outline at all. Only one of the two ever renders. -->
          <!-- The countdown alone since 30.09.2026: the date stands in the
               bar's Begutachtung row directly above („bis 16.10.2026"). -->
          <h2 v-if="windows.begutachtung" class="font-sans text-base font-semibold text-ink">
            {{ fristLabel(data.deadline, true) }}
          </h2>
          <!-- The second window alone: the Begutachtung is over, parliament
               still listens. No date, because upstream publishes none — the
               form closes with the end of the parliamentary procedure, the
               Bundesrat's Beschluss, and the card says exactly that. -->
          <!-- Short since 30.09.2026: that the Begutachtung is over and when
               it ended stands in the bar directly above. -->
          <h2 v-else class="font-sans text-base font-semibold text-ink">
            Stellungnahme zur Regierungsvorlage {{ data.enactment?.rvCitation }} möglich
          </h2>
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
          <!-- How long the window is, measured against practice and the
               Verordnung — here while the Frist runs, because this card is
               where a reader decides whether a Stellungnahme is still
               feasible. After the Divergenz note, which settles WHICH date
               governs; this sentence is about the length. When the window
               closes, the card goes and the sentence moves back under „Die
               Begutachtung": one place at a time, the one that matters now. -->
          <p v-if="windows.begutachtung && fristContext" class="mt-2 text-sm text-ink">
            {{ fristContext }}
          </p>
          <!-- Both windows open: stated as a sequence of facts, not as a
               verdict on the ministry (framing rule). The reader gets both
               doors and the fact that makes the second one matter. -->
          <p v-if="windows.begutachtung && windows.vorlage" class="mt-2 text-sm text-ink">
            Die Regierungsvorlage {{ data.enactment?.rvCitation }} liegt schon im
            Nationalrat; auch zu ihr ist eine Stellungnahme möglich.
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <UButton
              v-if="windows.begutachtung"
              :to="data.parliamentUrl"
              target="_blank"
              rel="noopener"
              color="primary"
              class="min-h-target"
            >
              Stellungnahme auf parlament.gv.at abgeben<span aria-hidden="true">&nbsp;↗</span><span class="sr-only"> (neues Fenster)</span>
            </UButton>
            <UButton
              v-if="windows.begutachtung && data.deadline"
              :to="`/entwuerfe/${gp}/${inr}/frist.ics`"
              external
              color="neutral"
              variant="outline"
              class="min-h-target"
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
              class="min-h-target"
            >
              Stellungnahme zur Regierungsvorlage abgeben<span aria-hidden="true">&nbsp;↗</span><span class="sr-only"> (neues Fenster)</span>
            </UButton>
          </div>
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
        </div>

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

            <!-- The section's lede, in the unfilled frame of the facts you
                 consult (03.10.2026; a white station card from 01.10.2026):
                 what the draft would change in the law in force, before the
                 comparison that measures it. Below the comparison and the
                 reasoning it was the baseline read last. Keeps `id="recht"`:
                 that anchor is in circulation. The one text version we hold no
                 document for — what we can offer is the consolidated text in
                 RIS, at the version in force when the draft was filed
                 (`amendedLawsService.ts`). -->
            <div v-if="entwurfFacts.length && amendedLaws">
              <FactList
                id="recht"
                :facts="entwurfFacts"
                frame
                class="scroll-mt-6"
              >
                <template #value-recht>
                  <ul role="list" class="mt-1 space-y-2">
                    <li v-for="law in amendedLaws.laws.slice(0, LAW_FOLD_AT)" :key="law.title">
                      <AmendedLawLine :law="law" />
                    </li>
                  </ul>
                  <details v-if="amendedLaws.laws.length > LAW_FOLD_AT" class="group mt-2">
                    <summary class="flex min-h-target cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
                      <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                      <span class="group-open:hidden">Alle {{ amendedLaws.laws.length }} Gesetze anzeigen</span>
                      <span class="hidden group-open:inline">Weniger anzeigen</span>
                    </summary>
                    <ul role="list" class="mt-1 space-y-2">
                      <li v-for="law in amendedLaws.laws.slice(LAW_FOLD_AT)" :key="law.title">
                        <AmendedLawLine :law="law" />
                      </li>
                    </ul>
                  </details>
                </template>
              </FactList>
              <!-- Which version the links open is provenance, so it stands in the
                   credit line under the frame, not inside a fact (02.10.2026). -->
              <SectionCredits v-if="amendedLaws.asOf" :sources="AMENDED_LAWS_SOURCES" :marked="false">
                <span>Verlinkt in der Fassung vom {{ formatDateDe(amendedLaws.asOf) }}</span>
              </SectionCredits>
            </div>

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

            <!-- Both document lists in ONE fold, the house <details> with the
                 heading in the <summary> (as in DraftDescription): the outline
                 does not depend on what is open, find-in-page still opens it,
                 and nothing above it moves when it opens. Folded because the
                 documents are what a citing or downloading reader looks for,
                 and that reader expects them at the end. -->
            <!-- No border-t since 03.10.2026: the full-width hairline
                 was the strongest line inside the section and outranked the
                 section boundary itself; the summary's hover ground and the
                 chevron carry the fold alone. -->
            <details
              v-if="data.documents.length || data.risDraft"
              class="group"
            >
              <summary
                class="-mx-3 flex min-h-target cursor-pointer list-none items-center justify-between gap-3 rounded px-3 py-3 hover:bg-hover [&::-webkit-details-marker]:hidden"
              >
                <h3 class="text-lg font-semibold text-ink">
                  Dokumente<template v-if="documentCount"> ({{ documentCount }})</template>
                </h3>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
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
            </details>
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
              <FactList :facts="begutachtungFacts" frame>
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
            <!-- A sub-section like the Entwurf's, spaced by the section body
                 (`space-y-8`): at mt-4 the heading stood closer to „Übermittelt"
                 than the facts stand to each other, and read as the list's next
                 label (01.10.2026). -->
            <PageSubsection heading="Stellungnahmen">
              <!-- A state, not data: a sentence, not a card (02.10.2026). -->
              <p
                v-if="data.statements.degraded"
                class="text-sm leading-relaxed text-ink-secondary"
              >
                {{ countLabelDe(data.statements.total, 'Stellungnahme', 'Stellungnahmen') }}
                laut Übersicht; die Liste selbst ist gerade nicht abrufbar.
                <ExternalLink
                  :href="data.parliamentUrl"
                  class="link-inline"
                >Auf parlament.gv.at ansehen</ExternalLink>
              </p>
              <template v-else-if="data.statements.total > 0">
                <StatementsPanel :list-url="`${url}/statements`" :summary="data.statements" />
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
                  Das Parlament zählt
                  {{ formatNumberDe(data.statements.overviewTotal) }} Stellungnahmen,
                  in der Liste stehen <template v-if="data.statements.overviewTotal > data.statements.total">bisher </template>{{ formatNumberDe(data.statements.total) }}.
                </p>
                <p v-if="data.statements.staleAsOf" class="mt-3 text-xs text-ink-muted">
                  Stand der Liste: {{ formatDateTimeDe(data.statements.staleAsOf) }}
                  (die aktuelle ist gerade nicht abrufbar).
                </p>
              </template>
              <p v-else class="text-sm text-ink-secondary">
                {{ data.active ? 'Noch keine Stellungnahmen. Die Frist läuft.' : 'Keine Stellungnahmen.' }}
              </p>
              <!-- The card's door once more, under the list where the decision
                   to file is made (`FilingButton`). The card's condition. -->
              <div v-if="windows.begutachtung" class="mt-4">
                <FilingButton :href="data.parliamentUrl">
                  Stellungnahme auf parlament.gv.at abgeben
                </FilingButton>
              </div>
            </PageSubsection>
            <!-- No closing line since 02.10.2026. „Die Regierungsvorlage hat
                 193 von 311 Paragraphen … umgeschrieben oder gestrichen" stood
                 here from 01.10.2026, to answer „und dann?" under the
                 Stellungnahmen. Since the next day the same count is the first
                 figure of the Regierungsvorlage's station frame, one section
                 down, and the spine links the comparison: the line said it a
                 third time, and was the only sentence trailing a section. -->
          </div>
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
          <div class="mt-4 space-y-8">
            <!-- The station frame (a card from 01.10.2026, the frame since
                 03.10.2026), in both outcomes — the win and the non-win get
                 the same form and the same weight (framing rule). Rows only:
                 the box carries facts, never prose (the reason the prose box
                 went on 18.09.2026), so whatever explains a row stands under
                 the frame, in the section's free text.

                 `id="ergebnis"` stays on the frame: the anchor is in circulation.

                 No Stellungnahmen count here: the section above IS that number
                 (18.09.2026). ME→RV is 1:n, so a split draft's further Vorlagen
                 get a row (4 of 132 in the GP-XXVIII corpus). -->
            <!-- The frame and the sentences that explain its verdict are one
                 block: the section body spaces blocks, not the frame's notes.
               `empty:hidden`: with neither, the block would still take a gap. -->
            <div class="empty:hidden">
              <FactList
                v-if="rvFacts.length"
                id="ergebnis"
                :facts="rvFacts"
                frame
              >
                <template v-if="data.enactment" #value-rv>
                  <p>
                    <ExternalLink
                      :href="data.enactment.rvUrl"
                      class="link-inline"
                    >Regierungsvorlage {{ data.enactment.rvCitation }}</ExternalLink><template v-if="data.enactment.rvDate">, am {{ formatDateDe(data.enactment.rvDate) }}</template>
                  </p>
                </template>
                <template v-if="data.enactment" #value-aenderung>
                  <p v-if="shareValue">{{ shareValue }}</p>
                  <div v-else class="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-hairline motion-reduce:animate-none" aria-hidden="true" />
                </template>
                <!-- The period's range as a bar; for an early Vorlage when it
                     came instead. While loading the bar's height stays held, so
                     the comparison below does not move when it arrives. -->
                <template v-if="data.enactment" #after-aenderung>
                  <p v-if="earlyVorlageWhen && vorlageOutcome.share.value" class="mt-0.5 text-ink-secondary">{{ earlyVorlageWhen }}</p>
                  <ChangeShareBar v-else-if="vorlageOutcome.share.value" :share="vorlageOutcome.share.value.share" :rate="shareRate" />
                  <div v-else-if="!earlyVorlageWhen" class="mt-3 h-13" aria-hidden="true" />
                </template>
                <!-- Where the Ressort says why — the document, never a cause
                     (framing rule): the Erläuterungen are the Ressort's reasons,
                     and whether a Stellungnahme stood behind a change is what a
                     submitter looks for there. The one sentence left in the
                     frame, because it is an invitation, not a fact. -->
                <template v-if="data.enactment" #value-begruendung>
                  <p v-if="reasoningValue">{{ reasoningValue }}</p>
                  <p v-if="vorlageOutcome.rvExplanations.value" :class="reasoningValue ? 'mt-1 text-ink-secondary' : ''">
                    In den <ExternalLink :href="vorlageOutcome.rvExplanations.value.url" class="link-inline">Erläuterungen der Regierungsvorlage</ExternalLink>
                    steht oft, ob eine Stellungnahme dahintersteht.
                  </p>
                </template>
                <template v-if="data.enactment?.furtherRv.length" #value-weitere>
                  <p>
                    <template
                      v-for="(rv, i) in data.enactment.furtherRv"
                      :key="rv.url"
                    ><span v-if="i > 0">, </span><ExternalLink :href="rv.url" class="link-inline">{{ rv.label }}</ExternalLink></template>
                  </p>
                </template>
                <template v-if="data.antragPath && viaAntrag" #value-antrag>
                  <p>
                    <ExternalLink :href="antragUrl(data.gp, data.antragPath)" class="link-inline">Initiativantrag {{ data.antragPath.antrag.citation }}</ExternalLink>,
                    kundgemacht: {{ bgblShort(data.antragPath.antrag.bgblNumber) }}
                  </p>
                </template>
                <!-- The win side of the same mechanism: the draft that finds a
                     lapsed one also finds the one that took its place. -->
                <template v-if="data.successor" #value-nachfolger>
                  <p>
                    <NuxtLink
                      :to="`/entwuerfe/${data.successor.gp}/${data.successor.inr}`"
                      class="link-inline"
                    >{{ data.successor.citation }}</NuxtLink>{{ relatedGpSuffix(data.successor.gp) }}, eingelangt am
                    {{ formatDateDe(data.successor.arrivedAt) }}
                  </p>
                </template>
              </FactList>
              <!-- No link: the frame's first fact is the Vorlage. The counts
                   are the comparison's, ours (`useVorlageOutcome`). -->
              <SectionCredits
                v-if="rvFacts.length"
                :sources="PARLIAMENT_HISTORY_SOURCES"
                :marked="false"
                :own="rvCounted ? 'Zählung' : undefined"
                :method="rvCounted ? '/so-funktionierts#vergleich' : undefined"
              />
              <!-- What explains the frame's verdict: what is open, the base rate
                   that puts the waiting in proportion, and how an Initiativantrag
                   was matched. -->
              <div v-if="!data.enactment && !data.active && (rvContext || noRvBaseRate || data.antragPath)" class="mt-4 space-y-2">
                <p v-if="rvContext" class="text-sm text-ink-secondary">{{ rvContext }}</p>
                <p v-if="noRvBaseRate" class="text-sm text-ink-secondary">{{ noRvBaseRate }}</p>
                <AntragPathNote
                  v-if="data.antragPath"
                  :path="data.antragPath"
                  :gp="data.gp"
                  :deadline="data.deadline"
                  :lead="!viaAntrag"
                  :class="rvContext || noRvBaseRate ? 'pt-1' : ''"
                />
              </div>
            </div>
            <!-- The accountability core: what became of the draft, § by §, both
                 ways — changed and unchanged alike (framing rule,
                 docs/architecture.md §4). Only
                 once a Regierungsvorlage exists; before that there is nothing to
                 hold the draft against. Before the Vorlage's own Stellungnahmen
                 since 01.10.2026: the comparison is what led into this station,
                 they are the input to the next one. -->
            <LawDiffSection
              v-if="data.enactment"
              :gp="data.gp"
              :inr="data.inr"
            />
            <!-- The second window for input: what was filed on the Vorlage itself,
                 through the same panel as the Begutachtung's. Client-side
                 data, so the block appears once it is there and says nothing
                 while it is not — an empty promise here would read as "none". -->
            <RvStatements
              v-if="data.enactment && rvStatements"
              :data="rvStatements"
              :filing-open="windows.vorlage"
            />
            <!-- The second window's door once more, at the end of its station
                 (`FilingButton`). Outside RvStatements: that block is
                 client-side and absent until loaded, the window is not.
                 Where a Stellungnahme goes is neither a sentence nor a link
                 here (03.10.2026): the consent to publication is asked on
                 Parliament's form, and „kein eigenes Verfahren im Ausschuss"
                 beside the button reads as „filing is pointless" — it stands
                 on /so-funktionierts#parlament, next to its exception. -->
            <div v-if="windows.vorlage && data.enactment">
              <FilingButton :href="data.enactment.rvUrl">
                Stellungnahme zur Regierungsvorlage abgeben
              </FilingButton>
            </div>
          </div>
        </section>

        <!-- The station exists as soon as a Regierungsvorlage does, not only
             when parliament amended it: "der Nationalrat hat den Text
             unverändert beschlossen" IS a finding, and it had no place on this
             page before. Where change does happen it is the majority case —
             52 of the 91 GP-XXVIII drafts that reached a Vorlage were changed
             again afterwards — and the section carries the texts and, since
             01.10.2026, their comparison. -->
        <section
          v-if="data.enactment"
          id="parlament"
          class="page-section scroll-mt-6"
          aria-labelledby="parlament-heading"
        >
          <h2 id="parlament-heading" class="section-heading">Im Parlament</h2>
          <div class="mt-4 space-y-8">
            <!-- The station frame (a card from 01.10.2026, the frame since
                 03.10.2026): the outcome, who carried it, and the record. The vote stood under the comparison until then, cut
                 off from the state it belongs to.

                 The outcome is the same function the bar's fact line uses
                 (`app/utils/spine.ts`), so the two can never disagree. "lapsed"
                 says what happened and not why: we observe the end of the GP,
                 never the reason for it. The same holds for the four outcomes
                 read off the house status since 23.09.2026 — each names the
                 step, none of them a motive, and upstream's own wording for it
                 is never printed.

                 The vote names the reading, because that is the vote parliament
                 records — one vote on the whole bill at the end. A club can vote
                 against it and still have put a change into the text compared
                 below, so the two facts are neighbours, never a cause and its
                 effect. The row is missing rather than vaguer where upstream
                 kept no club list (`parseVote`). -->
            <div>
              <FactList :facts="parliamentFacts" frame>
                <template v-if="committeeReport" #value-ausschuss>
                  Bericht <ExternalLink :href="committeeReport.url" class="link-inline">{{ committeeReport.label }}</ExternalLink>
                </template>
                <!-- By number only, never who tabled the motion. -->
                <template v-if="plenaryAmendments?.amendments.length" #value-plenum>
                  Angenommen: {{ plenaryAmendments.amendments.length > 1 ? 'Abänderungsanträge' : 'Abänderungsantrag' }}
                  <template v-for="(motion, i) in plenaryAmendments.amendments" :key="motion.url"><template v-if="i > 0">{{ i === plenaryAmendments.amendments.length - 1 ? ' und ' : ', ' }}</template><ExternalLink :href="motion.url" class="link-inline">{{ motion.label }}</ExternalLink></template><template v-if="plenaryAmendments.session">, <ExternalLink :href="plenaryAmendments.session.url" class="link-inline">{{ plenaryAmendments.session.label }}</ExternalLink></template>
                </template>
              </FactList>
              <!-- Where the frame's facts come from, under it in the credit line
                   like every other box's source (02.10.2026). It stood inside the
                   box as a footer row. -->
              <SectionCredits :sources="PARLIAMENT_HISTORY_SOURCES" :marked="false">
                <ExternalLink :href="data.enactment.rvUrl" class="link-muted">Verlauf</ExternalLink>
              </SectionCredits>
            </div>
            <!-- What the committee and the plenary did to the text, one step
                 each (`lawDiffSteps`, 01.10.2026) — the section's content, so it
                 comes first, before who voted how. Only where parliament published
                 a changed text, as the bar's link. Deferred: the page's second
                 comparison, and below most readers' scroll. -->
            <LawDiffSection
              v-if="parliamentStation"
              :gp="data.gp"
              :inr="data.inr"
              scope="parlament"
              :parliament-texts="parliamentTextList"
              deferred
            />
            <!-- The versions themselves, folded at the end as under „Der
                 Entwurf" (01.10.2026): the documents are what a citing or
                 downloading reader looks for, and that reader expects them
                 last. Open above the comparison they stood between the
                 section's sentence and its content, and repeated the two texts
                 the comparison's source line links anyway. Named as the
                 comparison names them (`parliamentDocuments`). The
                 Regierungsvorlage itself is not among them: the section above
                 offers it. -->
            <!-- No border-t, as at the Entwurf's fold (03.10.2026). -->
            <details
              v-if="parliamentDocuments.length"
              class="group"
            >
              <summary
                class="-mx-3 flex min-h-target cursor-pointer list-none items-center justify-between gap-3 rounded px-3 py-3 hover:bg-hover [&::-webkit-details-marker]:hidden"
              >
                <h3 class="text-lg font-semibold text-ink">
                  Dokumente ({{ parliamentDocuments.length }})
                </h3>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div class="pb-2">
                <DocumentList :documents="parliamentDocuments" />
              </div>
            </details>
          </div>
        </section>

        <!-- Short by design: the end of the story, and one line is all of it.
             It used to be a line inside the Regierungsvorlage card, where the
             law itself was a footnote to the draft for it. This is also the
             natural home for a later "so steht das Gesetz heute" link into RIS
             Bundesrecht. -->
        <!-- Also where the Vorlage's own Beschluss was not promulgated and
             Parliament names the Antrag that replaced it, once that Antrag is
             in the Bundesgesetzblatt (80 d.B. → 416/A → BGBl. I Nr. 65/2025,
             §12.33, 03.10.2026): the text did become law, on a route
             Parliament states. The section says which route. -->
        <section
          v-if="data.enactment && (data.enactment.bgblNumber || data.enactment.successor?.bgblNumber)"
          id="bundesgesetzblatt"
          class="page-section scroll-mt-6"
          aria-labelledby="bgbl-heading"
        >
          <h2 id="bgbl-heading" class="section-heading">Im Bundesgesetzblatt</h2>
          <div class="mt-4 space-y-8">
            <FactList :facts="[{ key: 'kundmachung', title: 'Kundgemacht' }]" frame>
              <template #value-kundmachung>
                <p v-if="data.enactment.bgblNumber">
                  <ExternalLink
                    v-if="data.enactment.bgblRisUrl"
                    :href="data.enactment.bgblRisUrl"
                    class="link-inline"
                  >{{ data.enactment.bgblNumber }}</ExternalLink><span v-else>{{ data.enactment.bgblNumber }}</span>
                </p>
                <p v-else-if="data.enactment.successor?.bgblNumber">
                  <ExternalLink
                    v-if="data.enactment.successor.bgblRisUrl"
                    :href="data.enactment.successor.bgblRisUrl"
                    class="link-inline"
                  >{{ data.enactment.successor.bgblNumber }}</ExternalLink><span v-else>{{ data.enactment.successor.bgblNumber }}</span>,
                  über Initiativantrag
                  <ExternalLink :href="data.enactment.successor.url" class="link-inline">{{ data.enactment.successor.citation }}</ExternalLink>
                </p>
              </template>
            </FactList>
            <!-- The one comparison that is no step: the whole way from the draft
                 to the law, at the station where „what became of it" can first
                 be answered in full (`lawDiffSteps`, 01.10.2026). The steps and
                 who took them stand in the sections above. Deferred, as the
                 parliament's. -->
            <!-- Only for the Vorlage's own Kundmachung. The comparison reads
                 the number off the Vorlage's record itself (`lawDiffService`),
                 and a successor Antrag is a text of its own: holding the
                 Vorlage against it would compare two different bills. -->
            <LawDiffSection
              v-if="data.enactment.bgblNumber"
              :gp="data.gp"
              :inr="data.inr"
              scope="bgbl"
              :parliament-texts="parliamentTextList"
              deferred
            />
          </div>
        </section>

      </article>
    </FetchGate>
  </div>
</template>
