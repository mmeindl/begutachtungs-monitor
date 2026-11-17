/**
 * What the corpus says about "bisher keine Regierungsvorlage" — the base
 * rates behind the wording on the detail page.
 *
 * Measured with `scripts/corpus/rvLatency.ts` from the Parliament API: every
 * Ministerialentwurf of a closed Gesetzgebungsperiode, Fristende → first
 * Regierungsvorlage linked in its stage record. Hand-copied constants, not a
 * live query — the numbers move only when a GP closes, and no page may
 * depend on 350 upstream fetches. Re-run the script and add a row when GP
 * XXVIII ends.
 *
 * Framing rule: these sentences give the reader the base rate,
 * never a verdict. "4 von 61" says how likely a late Regierungsvorlage is;
 * it does not say the draft failed.
 */
import { gapDe } from '#shared/utils/gaps'
import type { DraftDetail, NamedInRv } from '#shared/types'
import { noRvVerdictDe } from './deadlines'
import { RV_LATENCY_CONTEXT_DAYS } from '#shared/utils/rvLatency'
import { carriesDraft } from '#shared/utils/antragPath'
// Explicit: `draftStations.ts` is a pure module and stays out of the
// auto-imports, so that server map and vitest run the same functions.
import { mayClaimOutcome } from '#shared/utils/draftStations'
import { formatDateDe, spanInDays } from '#shared/utils/format'
import { gpInSentenceDe } from '#shared/utils/gp'

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

export interface RvWaitMark {
  key: 'median' | 'window'
  /** Percent of the track. */
  at: number
  align: 'start' | 'center' | 'end'
  tick: true
  lines: [string, string]
}

/**
 * The wait since the Fristende against the period's latency, as `ScaleBar`
 * draws it (`RvWaitBar`, 05.10.2026; a sentence until then, „… 9 von 10
 * davon binnen 6 Monaten nach Fristende", which the reader had to turn into
 * a picture; how many drafts got a Vorlage at all stood on
 * /so-funktionierts#wartezeit until 14.11.2026 and left the site then, kept
 * in docs/research/wartezeit-bis-regierungsvorlage.md). Counted
 * from the Fristende and not from the handoff, because the base rate is:
 * the handoff is Parliament forwarding the papers a few days later.
 *
 * The track is the latency window, or the wait where it ran longer — the
 * dot then passes the window's tick, as a long Frist passes the Regelfall
 * on `FristBar`. Past twice the window the median's label would run into
 * the window's, and the verdict row has long said it in words, so the
 * median goes.
 */
export function rvWaitScale(days: number, r: RvBaseRate): { value: number; marks: RvWaitMark[] } {
  const scale = Math.max(RV_LATENCY_CONTEXT_DAYS, days)
  const pct = (n: number) => (n / scale) * 100
  const marks: RvWaitMark[] = []
  if (scale <= 2 * RV_LATENCY_CONTEXT_DAYS) {
    marks.push({ key: 'median', at: pct(r.medianDays), align: 'center', tick: true, lines: ['Hälfte der Vorlagen', `nach ${r.medianDays} Tagen`] })
  }
  const window = pct(RV_LATENCY_CONTEXT_DAYS)
  const tenths = Math.round(r.withinLatencyWindow * 10)
  const months = Math.round(RV_LATENCY_CONTEXT_DAYS / 30.44)
  marks.push({
    key: 'window',
    at: window,
    align: window >= 100 ? 'end' : window < 20 ? 'start' : 'center',
    tick: true,
    lines: [`${tenths} von 10 Vorlagen`, `binnen ${months} Monaten`],
  })
  return { value: pct(days), marks }
}

/** "13 Tage seit Fristende" — the value over the wait's dot. */
export function daysSinceFristDe(days: number): string {
  if (days <= 0) return 'Frist endete heute'
  return `${days} ${days === 1 ? 'Tag' : 'Tage'} seit Fristende`
}

/**
 * Was the Regierungsvorlage tabled while the Begutachtung was still running
 * — on or before the day its Frist ended?
 *
 * Then the page says so (`earlyVorlageWhenDe`): beside a Vorlage the
 * Stellungnahmen could not have shaped, a comparison with few changes reads
 * as input ignored — the blame reading the framing rule forbids. Measured
 * 29.09.2026: 7 of 91 drafts with a Vorlage in GP XXVIII (33, 45, 46, 92,
 * 115, 116, 117/ME; median change share 0 % against 60 % for the other 84),
 * 1 of 296 in XXVII.
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
 * What stands under the row „Eingebracht" when the Vorlage came before the
 * Fristende: when it came. Temporal, never causal — it says the
 * Frist was still running, not that the Stellungnahmen were ignored or could
 * not have reached the Ressort (45/ME's Vorlage came five days before the
 * Fristende, when three of its eleven Stellungnahmen had already arrived).
 * Above the comparison it is what keeps few changes from reading as input
 * ignored (`tabledBeforeFristEnd`). Under the change share's row until
 * 17.11.2026, when that row went.
 */
export function earlyVorlageWhenDe(dates: { arrivedAt: string | null; deadline: string; rvDate: string }): string {
  const sinceStart = spanInDays(dates.arrivedAt, dates.rvDate)
  if (sinceStart !== null && sinceStart <= 0) return 'Eingebracht noch vor Beginn der Begutachtung'
  if (spanInDays(dates.deadline, dates.rvDate) === 0) return 'Eingebracht am letzten Tag der Begutachtungsfrist'
  return 'Eingebracht noch während der Begutachtung'
}

/**
 * What the outcome card says INSTEAD of all of the above when the period
 * links no draft to a Vorlage at all (`chainCoverageOf`).
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
  // selten … häufiger beginnt das Ministerium von vorne") stood on
  // /so-funktionierts#regierungsvorlage until 14.11.2026 and stands nowhere
  // since: the number is the evidence.
  const period = gpInSentenceDe(r.gp)
  return `${period[0]!.toUpperCase()}${period.slice(1)} wurden ${r.rvInLaterGp} von ${openAtEnd} solcher Entwürfe später noch als Regierungsvorlage eingebracht.`
}

/* ------------------------------------------------------------------ *
 * „In 298 d.B. genannt" (14.11.2026)
 * ------------------------------------------------------------------ */

/**
 * The state's short form, wherever „Bisher keine Regierungsvorlage" would
 * stand for the draft: the list row, the procedure card's headline, the
 * station's „Stand". The Vorlage is named, never „aufgegangen" or
 * „zusammengeführt": the Erläuterungen name the draft's title, which is
 * what we can show — not how much of the draft the Vorlage carries
 * (`server/utils/parliament/namedInRv.ts`).
 */
export function namedInRvShortDe(rvCitation: string): string {
  return `In ${rvCitation} genannt`
}

/** The bar's row under „Regierungsvorlage" — the same words, lower case, as every row there. */
export function namedInRvFactDe(rvCitation: string): string {
  return `in ${rvCitation} genannt`
}

/** The link under the quote, in the frame's „In den Erläuterungen" row. */
export function namedInRvSourceDe(n: NamedInRv): string {
  return `Erläuterungen, ${n.rv.citation}`
}

/**
 * Why no § comparison follows — the station's one sentence under the frame,
 * where the other states give theirs (`context`). The quote, the Vorlage's
 * Erläuterungen and the draft Parliament links the Vorlage to are rows of
 * the frame; how a Vorlage comes to carry two drafts while Parliament links
 * only one is the definition of „genannt" (`TERMS.genannt`), which
 * „Methode" opens in the credit line.
 *
 * The words follow the facts: with several linked drafts it names „der
 * anderen Entwürfe"; with none, nothing on Parliament's side says whose
 * content the Vorlage carries besides, so the reason is that no part of it
 * is shown to go back to this draft.
 */
export function namedInRvNoComparisonDe(n: NamedInRv): string {
  const k = n.linkedDrafts.length
  if (k === 0) return gapDe('outOfScope', 'ein Paragraphenvergleich zu diesem Entwurf. Nicht belegt ist, welcher Teil der Vorlage auf ihn zurückgeht.')
  return gapDe('outOfScope', `ein Paragraphenvergleich zu diesem Entwurf. Die Vorlage enthält auch den Inhalt ${k === 1 ? 'des anderen Entwurfs' : 'der anderen Entwürfe'}.`)
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
  /** Another draft's Vorlage names this draft (`NamedInRv`): the station quotes it instead of a verdict. */
  named: NamedInRv | null
  /** The GP ended without a Vorlage. */
  lapsed: boolean
  /** The period records no draft→Vorlage link at all. */
  chainUnlinked: boolean
  /** The text became law through an Initiativantrag instead. */
  viaAntrag: boolean
  /** The verdict sentence, in the frame's „Stand" row. */
  noRvVerdict: string | null
  /** The period's base rate, drawn under the waiting rows (`RvWaitBar`). */
  noRvBaseRate: RvBaseRate | null
  facts: RvFact[]
  /** What explains the verdict, under the frame — for „genannt" why no § comparison follows. */
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
export function rvStationView(d: DraftDetail | null | undefined): RvStationView {
  if (!d) {
    return {
      showOutcome: false,
      named: null,
      lapsed: false,
      chainUnlinked: false,
      viaAntrag: false,
      noRvVerdict: null,
      noRvBaseRate: null,
      facts: [],
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
   * link from ANY of its drafts to a Regierungsvorlage. Everything
   * above reads absence as evidence — here absence is the archive, so the
   * card states that instead and claims nothing. `unknown` counts as unlinked:
   * when the map was not there to ask, silence is the recoverable mistake. */
  const chainUnlinked = !d.enactment && !d.active && !mayClaimOutcome(d.chainCoverage)

  /* The Initiativantrag route replaces all three sentences below: no Vorlage,
   * and still a law (`AntragPathNote`). */
  const viaAntrag = carriesDraft(d.antragPath)

  /* Fifth state, beside them: no Vorlage of its own, and another draft's
   * Vorlage names this one in its Erläuterungen. The server lets it through
   * only where none of the four above applies (`mayBeNamed`); it replaces
   * the verdict and the base rate, and its context says why no § comparison
   * follows (`namedInRvNoComparisonDe`) — the draft is no longer
   * waiting, and it is counted neither with the drafts that got a Vorlage
   * nor with those that did not. */
  const named = !d.enactment && !d.active && !viaAntrag && !chainUnlinked ? (d.namedInRv ?? null) : null

  const noRvVerdict = viaAntrag || named
    ? null
    : chainUnlinked
      ? chainUnlinkedHeadlineDe(d.gp)
      : lapsed
        ? gpEndedHeadlineDe(d.gp, d.gpEndedOn)
        : noRvVerdictDe(d.deadline)

  /* What explains the verdict, and only where there is one — without it the
   * frame's row says „Bisher keine" and a waiting sentence would only repeat
   * it. The page's version had two more branches for the verdict-less case
   * („Bisher gibt es keine Regierungsvorlage."), which it never read.
   * „Genannt" has no verdict and still one sentence: the gap it leaves. */
  const context = named
    ? namedInRvNoComparisonDe(named)
    : noRvVerdict
      ? chainUnlinked
        ? chainUnlinkedBodyDe()
        : lapsed
          ? gpEndedBodyDe(d.gp)
          : 'Ob und wie es weitergeht, ist offen.'
      : null

  /* The base rate under the waiting rows, while the GP still runs: how
   * many drafts of the last closed GP got their Regierungsvorlage and how
   * fast. Numbers, so the reader can weigh the silence without the page
   * weighing it for them. */
  // Not with a Vorlage either: nothing waits then, and the frame's credit
  // line would name „Vergleichswerte" for a bar that is not drawn.
  const noRvBaseRate = d.enactment || lapsed || chainUnlinked || viaAntrag || named ? null : rvBaseRateFor(d.gp)

  /* The station frame. The verdict is the row; what explains it (`context`,
   * the base rate, the Antrag's matching) stands under the frame. */
  const facts: RvFact[] = []
  if (d.enactment) {
    facts.push({ key: 'rv', title: 'Eingebracht' })
    // Nothing from the comparison since 17.11.2026. How much of the text
    // changed and how many Begründungen were rows here from 02.10.2026; the
    // comparison under the frame shows both where the reader asks, at the
    // Paragraph, and says there when the Erläuterungen could not be read.
    if (d.enactment.furtherRv.length) facts.push({ key: 'weitere', title: 'Außerdem aus dem Entwurf hervorgegangen' })
  } else if (!d.active) {
    if (viaAntrag) {
      facts.push({ key: 'antrag', title: 'Eingebracht' })
    } else if (named) {
      // The state, then what carries it: the sentence that names the draft
      // and the document it stands in, and where the Vorlage went on — the
      // draft Parliament links it to, or, linked to none, the Vorlage itself.
      // A quote and a link are facts, so they are rows; why no comparison
      // follows is the sentence under the frame (`context`).
      facts.push({ key: 'stand', title: 'Stand', text: namedInRvShortDe(named.rv.citation) })
      facts.push({ key: 'zitat', title: 'In den Erläuterungen' })
      facts.push({ key: 'weiter', title: named.linkedDrafts.length ? 'Vorlage verknüpft mit' : 'Weiterer Verlauf' })
    } else {
      facts.push({ key: 'stand', title: 'Stand', text: noRvVerdict ?? 'Bisher keine Regierungsvorlage.' })
    }
    // Where the ministry's clock starts (05.10.2026): the bar's row said
    // „seit … beim Ressort" and the station below did not. Not once the GP
    // is over — the Begutachtung's „Übermittelt" row carries the date then
    // (`handoffFact` on the page), and „beim Ressort" would claim a wait
    // the period's end has closed.
    // Not beside „genannt" either: the draft is no longer waiting there.
    if (!viaAntrag && !named && !d.gpEnded && d.handoff?.date) {
      facts.push({ key: 'ressort', title: 'Beim Ressort', text: `seit ${formatDateDe(d.handoff.date)}` })
    }
    if (d.successor) facts.push({ key: 'nachfolger', title: 'Gleichlautender späterer Entwurf' })
  }

  return {
    showOutcome,
    named,
    lapsed,
    chainUnlinked,
    viaAntrag,
    noRvVerdict,
    noRvBaseRate,
    facts,
    context,
  }
}

/* A related draft — the gleichlautend predecessor, the successor — is named
 * by citation and GP; the GP only where it differs from the page's own,
 * which is the case that carries information. */
export function relatedGpSuffixDe(related: string, own: string | null | undefined): string {
  return related === own ? '' : ` (${related}. GP)`
}
