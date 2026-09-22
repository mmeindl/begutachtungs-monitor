/**
 * What the corpus says about "bisher keine Regierungsvorlage" — the base
 * rates behind the wording on the detail page (docs/architecture.md §12.10).
 *
 * Measured with `scripts/rv-latency.mjs` from the Parliament API: every
 * Ministerialentwurf of a closed Gesetzgebungsperiode, Fristende → first
 * Regierungsvorlage linked in its stage record. Hand-copied constants, not a
 * live query — the numbers move only when a GP closes, and no page may
 * depend on 350 upstream fetches. Re-run the script and add a row when GP
 * XXVIII ends.
 *
 * Framing rule (CLAUDE.md): these sentences give the reader the base rate,
 * never a verdict. "4 von 61" says how likely a late Regierungsvorlage is;
 * it does not say the draft failed.
 */
import { RV_LATENCY_CONTEXT_DAYS } from './deadlines'
import { formatDateDe } from './format'

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
    'Ob aus diesem Entwurf eine Regierungsvorlage wurde, lässt sich hier ' +
    'nicht sagen – das ist eine Lücke im Datenbestand, kein Befund über den ' +
    'Entwurf. Regierungsvorlagen aus dieser Periode verzeichnet das Parlament ' +
    'sehr wohl; nur der Bezug zum Ministerialentwurf fehlt in den Daten.'
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
  return `Ein Entwurf wird nur selten in der folgenden Periode noch als Regierungsvorlage eingebracht – in der ${r.gp}. Gesetzgebungsperiode betraf das ${r.rvInLaterGp} von ${openAtEnd} Entwürfen, die bei ihrem Ende ohne Regierungsvorlage waren. Häufiger beginnt das Ministerium mit einem neuen Entwurf von vorne.`
}
