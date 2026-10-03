/**
 * What the corpus says about "bisher keine Regierungsvorlage" — the base
 * rates behind the wording on the detail page (docs/architecture.md §12.10).
 *
 * Measured with `scripts/corpus/rvLatency.ts` from the Parliament API: every
 * Ministerialentwurf of a closed Gesetzgebungsperiode, Fristende → first
 * Regierungsvorlage linked in its stage record. Hand-copied constants, not a
 * live query — the numbers move only when a GP closes, and no page may
 * depend on 350 upstream fetches. Re-run the script and add a row when GP
 * XXVIII ends.
 *
 * Framing rule (docs/architecture.md §4): these sentences give the reader the base rate,
 * never a verdict. "4 von 61" says how likely a late Regierungsvorlage is;
 * it does not say the draft failed.
 */
import type { DraftDetail } from '#shared/types'
import { RV_LATENCY_CONTEXT_DAYS, noRvVerdictDe } from './deadlines'
import { carriesDraft } from '#shared/utils/antragPath'
// Explicit: `draftStations.ts` is a pure module and stays out of the
// auto-imports, so that server map and vitest run the same functions.
import { mayClaimOutcome } from '#shared/utils/draftStations'
import { formatDateDe, spanInDays } from '#shared/utils/format'

export interface RvBaseRate {
  gp: string
  /** Ministerialentwürfe in list 81 (rows, incl. the few dual-ministry duplicates) */
  drafts: number
  /** … with at least one Regierungsvorlage linked, in this or a later GP */
  withRv: number
  /** … whose first Regierungsvorlage came in a LATER GP (the rare carry-over) */
  rvInLaterGp: number
  /** Share of first RVs that came within RV_LATENCY_CONTEXT_DAYS of the Fristende */
  withinLatencyWindow: number
  medianDays: number
  p90Days: number
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/** Newest GP first. */
export const RV_BASE_RATES: readonly RvBaseRate[] = [
  { gp: 'XXVII', drafts: 353, withRv: 296, rvInLaterGp: 4, withinLatencyWindow: 0.895, medianDays: 40, p90Days: 189 },
  { gp: 'XXVI', drafts: 163, withRv: 114, rvInLaterGp: 14, withinLatencyWindow: 0.912, medianDays: 28, p90Days: 148 },
]

/** The measured row for `gp`, else the newest one — a running GP has no row of its own yet. */
export function rvBaseRateFor(gp: string | null | undefined): RvBaseRate {
  return RV_BASE_RATES.find((r) => r.gp === gp) ?? RV_BASE_RATES[0]!
}

/** "In der XXVII. Gesetzgebungsperiode wurden 296 von 353 Entwürfen zur Regierungsvorlage, 9 von 10 davon binnen 6 Monaten nach Fristende." */
export function rvBaseRateSentenceDe(gp: string | null | undefined): string {
  const r = rvBaseRateFor(gp)
  const tenths = Math.round(r.withinLatencyWindow * 10)
  const months = Math.round(RV_LATENCY_CONTEXT_DAYS / 30.44)
  return `In der ${r.gp}. Gesetzgebungsperiode wurden ${r.withRv} von ${r.drafts} Entwürfen zur Regierungsvorlage, ${tenths} von 10 davon binnen ${months} Monaten nach Fristende.`
}

/**
 * How much of a draft its Regierungsvorlage changed, across a whole closed
 * Gesetzgebungsperiode — the second base rate (docs/architecture.md §12.38).
 *
 * Measured with `scripts/corpus/aenderungsrate.ts` through the page's own
 * formula (`ownChangeShare`): per comparable draft, the share of its own
 * units the Vorlage changed in wording or dropped, editorial changes not
 * counted. Hand-copied like the row above, re-run when a GP closes.
 *
 * Why a range and not a yes/no: 280 of 283 comparable drafts of GP XXVII
 * changed at all, so „geändert" separates nothing, while the share runs from
 * a few percent to all of them. The middle half (p25–p75) is what a reader
 * can hold one draft against — a range, not a verdict (framing rule, §4):
 * a large change is not a failure of the draft and a small one no win.
 */
export interface ChangeShareRate {
  gp: string
  /** Comparable drafts (both texts readable, both sides paired) */
  drafts: number
  /** Percent, rounded */
  p25: number
  median: number
  p75: number
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/** Newest GP first. */
export const CHANGE_SHARE_RATES: readonly ChangeShareRate[] = [
  // Re-run 03.10.2026: a law the Ressort dropped from its own bill counts
  // as dropped since §12.40 (XXVII p75 75 → 77, XXVI p25 34 → 35).
  { gp: 'XXVII', drafts: 283, p25: 46, median: 63, p75: 77 },
  { gp: 'XXVI', drafts: 104, p25: 35, median: 50, p75: 73 },
]

/** The measured row for `gp`, else the newest one — a running GP has no row of its own yet. */
export function changeShareRateFor(gp: string | null | undefined): ChangeShareRate {
  return CHANGE_SHARE_RATES.find((r) => r.gp === gp) ?? CHANGE_SHARE_RATES[0]!
}

/**
 * The value of the Regierungsvorlage card's row „Umgeschrieben oder
 * gestrichen": „193 von 311 Paragraphen des Entwurfs (62 %)".
 *
 * A row since 02.10.2026, not a sentence: two sentences over the comparison
 * — this count with the period's range, and the reasoning rate — changed
 * shape with every draft, and the station frame is where the page states its
 * facts (`FactList`). One form for every count, zero and all included: the
 * row's title says what is counted, so „im Wortlaut übernommen" — and the
 * qualifier that sentence needed — has nothing left to say. The range is the
 * bar under the row (`ChangeShareBar`); redaktionelle Korrekturen are not
 * counted, which /so-funktionierts#vergleich states.
 */
export function changeShareValueDe(changed: number, own: number, unitPlural: string): string {
  const noun = own === 1 ? (SINGULAR_DE[unitPlural] ?? unitPlural) : unitPlural
  return `${changed} von ${own} ${noun} des Entwurfs (${Math.round((changed / own) * 100)}\u00a0%)`
}

const SINGULAR_DE: Readonly<Record<string, string>> = { Paragraphen: 'Paragraph', Änderungen: 'Änderung' }

/**
 * The value of the card's row „Begründung": how many of the Begründungen in
 * both Erläuterungen the Ressort rewrote (docs/architecture.md §12.10b).
 * Counted over the passages both versions carry — the restriction stands on
 * /so-funktionierts; the row's footnote names the document.
 */
export function reasoningShareValueDe(changed: number, compared: number): string {
  return `${changed} von ${compared} ${compared === 1 ? 'Begründung' : 'Begründungen'} geändert`
}

/**
 * Was the Regierungsvorlage tabled while the Begutachtung was still running
 * — on or before the day its Frist ended?
 *
 * Then the period's range is the wrong yardstick. It was measured on drafts
 * whose Vorlage came after the Begutachtung, and set beside a Vorlage the
 * Stellungnahmen could not have shaped, „im Wortlaut" reads as input
 * ignored — the blame reading the framing rule forbids (§4). Measured
 * 29.09.2026: 7 of 91 drafts with a Vorlage in GP XXVIII (33, 45, 46, 92,
 * 115, 116, 117/ME; median share 0 % against 60 % for the other 84), 1 of
 * 296 in XXVII — so the XXVII range above is not skewed by them.
 *
 * The day of the Fristende counts: a Vorlage tabled that day cannot have
 * taken in what arrived that day either. Same arithmetic as the spine's
 * „noch vor Fristende" (`spine.ts`), so the two cannot disagree.
 */
export function tabledBeforeFristEnd(deadline: string | null | undefined, rvDate: string | null | undefined): boolean {
  const days = spanInDays(deadline, rvDate)
  return days !== null && days <= 0
}

/**
 * What stands under the count instead of the range when the Vorlage came
 * before the Fristende: when it came. Temporal, never causal — it says the
 * Frist was still running, not that the Stellungnahmen were ignored or could
 * not have reached the Ressort (45/ME's Vorlage came five days before the
 * Fristende, when three of its eleven Stellungnahmen had already arrived).
 * Beside the count it is what keeps a low share from reading as input
 * ignored; the range is left out because it was measured on Vorlagen that
 * came after the Begutachtung (`tabledBeforeFristEnd`).
 */
export function earlyVorlageWhenDe(dates: { arrivedAt: string | null; deadline: string; rvDate: string }): string {
  const sinceStart = spanInDays(dates.arrivedAt, dates.rvDate)
  if (sinceStart !== null && sinceStart <= 0) return 'Eingebracht noch vor Beginn der Begutachtung'
  if (spanInDays(dates.deadline, dates.rvDate) === 0) return 'Eingebracht am letzten Tag der Begutachtungsfrist'
  return 'Eingebracht noch während der Begutachtung'
}

/**
 * What the outcome card says INSTEAD of all of the above when the period
 * links no draft to a Vorlage at all (§12.27, `chainCoverageOf`).
 *
 * Every other sentence in this file rests on absence being evidence. Where
 * the archive never recorded the link, it is not: the card would otherwise
 * read „ohne Regierungsvorlage zu diesem Entwurf" on all 297 drafts of GP
 * XVI while list 101 holds 270 Regierungsvorlagen from that same period.
 * So the card names the gap, refuses the inference, and hands over the fact
 * that contradicts it — the reader can then go and look, which is the only
 * honest offer left.
 */
export function chainUnlinkedHeadlineDe(gp: string): string {
  return `Für die ${gp}. Gesetzgebungsperiode ist der weitere Weg der Entwürfe nicht erfasst.`
}

export function chainUnlinkedBodyDe(): string {
  return (
    // The third sentence („Regierungsvorlagen aus dieser Periode verzeichnet
    // das Parlament sehr wohl; nur der Bezug … fehlt") went on 30.09.2026:
    // the first already places the gap in the data, not in the draft.
    'Ob aus diesem Entwurf eine Regierungsvorlage wurde, lässt sich hier ' +
    'nicht sagen – das ist eine Lücke im Datenbestand, kein Befund über den ' +
    'Entwurf.'
  )
}

/**
 * Headline of the outcome card once the draft's GP is over without a
 * Regierungsvorlage. States the boundary and the absence — the two facts —
 * and nothing about intent.
 *
 * Only ever reached where the period's links exist (`mayClaimOutcome`);
 * without that gate this sentence is the false accusation itself.
 */
export function gpEndedHeadlineDe(gp: string, endedOn: string | null): string {
  return endedOn
    ? `Die ${gp}. Gesetzgebungsperiode endete am ${formatDateDe(endedOn)} – ohne Regierungsvorlage zu diesem Entwurf.`
    : `Die ${gp}. Gesetzgebungsperiode ist beendet – ohne Regierungsvorlage zu diesem Entwurf.`
}

/**
 * Body under that headline: how rare the carry-over into the next GP is,
 * measured on this GP where a row exists. "Ohne Regierungsvorlage bei
 * GP-Ende" = drafts without any RV plus those whose RV came in a later GP.
 */
export function gpEndedBodyDe(gp: string): string {
  const r = rvBaseRateFor(gp)
  const openAtEnd = r.drafts - r.withRv + r.rvInLaterGp
  // The number alone since 30.09.2026; the rule of thumb around it („nur
  // selten … häufiger beginnt das Ministerium von vorne") stands on
  // /so-funktionierts#regierungsvorlage.
  return `In der ${r.gp}. Gesetzgebungsperiode wurden ${r.rvInLaterGp} von ${openAtEnd} solcher Entwürfe später noch als Regierungsvorlage eingebracht.`
}

/** What the ME→RV comparison has delivered so far — the values of
 *  `useVorlageOutcome`, read only for whether they are there. */
export interface VorlageOutcomeState {
  share: unknown
  sharePending: boolean
  reasoningStats: unknown
  rvExplanations: unknown
}

/** A row of the Regierungsvorlage's station frame; structurally a `Fact`
 *  (`FactList`), kept free of the component here. */
export interface RvFact {
  key: string
  title: string
  text?: string
}

export interface RvStationView {
  /** Whether „Die Regierungsvorlage" renders at all. */
  showOutcome: boolean
  /** The GP ended without a Vorlage. */
  lapsed: boolean
  /** The period records no draft→Vorlage link at all (§12.27). */
  chainUnlinked: boolean
  /** The text became law through an Initiativantrag instead (§12.10). */
  viaAntrag: boolean
  /** The verdict sentence, in the frame's „Stand" row. */
  noRvVerdict: string | null
  /** The base rate under the waiting sentence. */
  noRvBaseRate: string | null
  facts: RvFact[]
  /** The frame carries our own counts, so its credit line names them. */
  counted: boolean
  /** What explains the verdict, under the frame. */
  context: string | null
}

/**
 * The Regierungsvorlage station of the draft page, in both outcomes — the
 * win and the non-win get the same section, the same form, the same weight
 * (framing rule). One pure function for what were ten computeds on the page,
 * so the states below can be tested against each other.
 *
 * Without a draft everything is off; the page renders nothing then anyway.
 */
export function rvStationView(d: DraftDetail | null | undefined, vorlage: VorlageOutcomeState): RvStationView {
  if (!d) {
    return {
      showOutcome: false,
      lapsed: false,
      chainUnlinked: false,
      viaAntrag: false,
      noRvVerdict: null,
      noRvBaseRate: null,
      facts: [],
      counted: false,
      context: null,
    }
  }

  // Whether the station has anything to show: the Vorlage itself, or — once
  // the Frist is over — the neutral note that none came, with the base rate
  // that puts the waiting in proportion. While the Frist runs and no Vorlage
  // exists the section stays away: the question is not answerable yet, and
  // an empty chapter under the bar's "ausstehend" row would say less than
  // the row does.
  const showOutcome = Boolean(d.enactment) || !d.active

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
  const lapsed = !d.enactment && !d.active && d.gpEnded

  /* Fourth state, and it overrides the other three: the period records no
   * link from ANY of its drafts to a Regierungsvorlage (§12.27). Everything
   * above reads absence as evidence — here absence is the archive, so the
   * card states that instead and claims nothing. `unknown` counts as unlinked:
   * when the map was not there to ask, silence is the recoverable mistake. */
  const chainUnlinked = !d.enactment && !d.active && !mayClaimOutcome(d.chainCoverage)

  /* The Initiativantrag route replaces all three sentences below: no Vorlage,
   * and still a law (docs/architecture.md §12.10, `AntragPathNote`). */
  const viaAntrag = carriesDraft(d.antragPath)

  const noRvVerdict = viaAntrag
    ? null
    : chainUnlinked
      ? chainUnlinkedHeadlineDe(d.gp)
      : lapsed
        ? gpEndedHeadlineDe(d.gp, d.gpEndedOn)
        : noRvVerdictDe(d.deadline)

  /* What explains the verdict, and only where there is one — without it the
   * frame's row says „Bisher keine" and a waiting sentence would only repeat
   * it. The page's version had two more branches for the verdict-less case
   * („Bisher gibt es keine Regierungsvorlage."), which it never read. */
  const context = !noRvVerdict
    ? null
    : chainUnlinked
      ? chainUnlinkedBodyDe()
      : lapsed
        ? gpEndedBodyDe(d.gp)
        : 'Ob und wie es weitergeht, ist offen.'

  /* The base rate under the waiting sentence, while the GP still runs: how
   * many drafts of the last closed GP got their Regierungsvorlage and how
   * fast. Numbers, so the reader can weigh the silence without the page
   * weighing it for them. */
  const noRvBaseRate = lapsed || chainUnlinked || viaAntrag ? null : rvBaseRateSentenceDe(d.gp)

  /* The station frame. The verdict is the row; what explains it (`context`,
   * the base rate, the Antrag's matching) stands under the frame. */
  const facts: RvFact[] = []
  if (d.enactment) {
    facts.push({ key: 'rv', title: 'Eingebracht' })
    // The comparison's counts, as rows (02.10.2026). The first holds its
    // place while the comparison loads; the second appears when its
    // documents are found — on many drafts they are not.
    if (vorlage.share || vorlage.sharePending) {
      facts.push({ key: 'aenderung', title: 'Umgeschrieben oder gestrichen' })
    }
    if (vorlage.reasoningStats || vorlage.rvExplanations) {
      facts.push({ key: 'begruendung', title: 'Begründung' })
    }
    if (d.enactment.furtherRv.length) facts.push({ key: 'weitere', title: 'Außerdem aus dem Entwurf hervorgegangen' })
  } else if (!d.active) {
    if (viaAntrag) facts.push({ key: 'antrag', title: 'Eingebracht' })
    else facts.push({ key: 'stand', title: 'Stand', text: noRvVerdict ?? 'Bisher keine Regierungsvorlage.' })
    if (d.successor) facts.push({ key: 'nachfolger', title: 'Gleichlautender späterer Entwurf' })
  }

  return {
    showOutcome,
    lapsed,
    chainUnlinked,
    viaAntrag,
    noRvVerdict,
    noRvBaseRate,
    facts,
    counted: facts.some((f) => f.key === 'aenderung' || f.key === 'begruendung'),
    context,
  }
}
