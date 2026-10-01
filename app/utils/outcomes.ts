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
import { RV_LATENCY_CONTEXT_DAYS } from './deadlines'
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
  { gp: 'XXVII', drafts: 283, p25: 46, median: 63, p75: 75 },
  { gp: 'XXVI', drafts: 104, p25: 34, median: 50, p75: 73 },
]

/** The measured row for `gp`, else the newest one — a running GP has no row of its own yet. */
export function changeShareRateFor(gp: string | null | undefined): ChangeShareRate {
  return CHANGE_SHARE_RATES.find((r) => r.gp === gp) ?? CHANGE_SHARE_RATES[0]!
}

/**
 * „Die Regierungsvorlage hat 12 von 21 Änderungen des Entwurfs
 * umgeschrieben oder gestrichen (57 %). Üblich waren in der XXVII.
 * Gesetzgebungsperiode 46–75 %."
 * Shortened on 30.09.2026; the percentage stays at every size of draft.
 */
export function changeShareSentenceDe(gp: string | null | undefined, changed: number, own: number, unitPlural: string): string {
  const r = changeShareRateFor(gp)
  // „Üblich" for the middle half of the period (p25–p75): looser than „bei
  // der Hälfte der Entwürfe", and read at a glance; the exact reading stands
  // on /so-funktionierts#vergleich (30.09.2026).
  return `${changeShareLeadDe(changed, own, unitPlural)}Üblich waren in der ${r.gp}. Gesetzgebungsperiode ${r.p25}–${r.p75}\u00a0%.`
}

/** How much of the draft the Vorlage changed — the half both sentences share. */
function changeShareLeadDe(changed: number, own: number, unitPlural: string): string {
  // Zero in its own words: „keine davon" would have to decline with the noun
  // („keinen davon" for Paragraphen), a sentence without the count does not.
  // „redaktionelle nicht gezählt" left the counted cases on 30.09.2026 — it
  // stands on /so-funktionierts#vergleich. The zero case keeps its
  // qualifier: „im Wortlaut" would be untrue without it.
  return changed === 0
    ? `Die Regierungsvorlage übernimmt alle ${own} ${unitPlural} des Entwurfs im Wortlaut, abgesehen von redaktionellen Korrekturen. `
    : changed === own
      ? `Die Regierungsvorlage hat alle ${own} ${unitPlural} des Entwurfs umgeschrieben oder gestrichen. `
      : `Die Regierungsvorlage hat ${changed} von ${own} ${unitPlural} des Entwurfs umgeschrieben oder gestrichen (${Math.round((changed / own) * 100)}\u00a0%). `
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
 * The line that closes „Die Begutachtung" once a Vorlage exists: what came
 * of the text after it, one section before the comparison that shows it
 * (01.10.2026). Input and outcome stand next to each other, the comparison
 * stays with the Vorlage the Ressort wrote — the section claims no change.
 *
 * Only the count, not the period's range: the range belongs to the
 * comparison it explains. And for a Vorlage tabled before the Fristende
 * nothing at all — set under the Stellungnahmen, „im Wortlaut übernommen"
 * reads as input ignored, the blame reading `tabledBeforeFristEnd` exists to
 * prevent. Until 01.10.2026 the line said there when the Vorlage came; the
 * Regierungsvorlage's station card now gives its date, and the comparison's
 * first line the clause (`earlyVorlageSentenceDe`), so it said it a third
 * time. Null where the count is not known.
 */
export function begutachtungAftermathDe(
  share: { changed: number; own: number } | null,
  unitPlural: string,
  dates: { arrivedAt: string | null; deadline: string | null; rvDate: string | null },
): string | null {
  if (dates.deadline && dates.rvDate && tabledBeforeFristEnd(dates.deadline, dates.rvDate)) return null
  return share ? changeShareLeadDe(share.changed, share.own, unitPlural).trim() : null
}

/**
 * The same count, but instead of the range: when the Vorlage came. Temporal,
 * never causal — it says the Frist was still running, not that the
 * Stellungnahmen were ignored or could not have reached the Ressort (45/ME's
 * Vorlage came five days before the Fristende, when three of its eleven
 * Stellungnahmen had already arrived).
 *
 * One clause since 01.10.2026, in the bar's words and without the dates:
 * „Eingebracht wurde sie am 10.06.2026, am selben Tag, an dem … — die Frist
 * für Stellungnahmen lief bis 24.06.2026" said again what the bar already
 * states.
 * The clause itself stays: beside the count it is what keeps „im Wortlaut"
 * from reading as input ignored. The pointer to the next comparison went
 * with it — „Im Parlament" is the next section.
 */
export function earlyVorlageSentenceDe(
  changed: number,
  own: number,
  unitPlural: string,
  dates: { arrivedAt: string | null; deadline: string; rvDate: string },
): string {
  const sinceStart = spanInDays(dates.arrivedAt, dates.rvDate)
  const when =
    sinceStart !== null && sinceStart <= 0
      ? 'noch vor Beginn der Begutachtung'
      : spanInDays(dates.deadline, dates.rvDate) === 0
        ? 'am letzten Tag der Begutachtungsfrist'
        : 'noch während der Begutachtung'
  return `${changeShareLeadDe(changed, own, unitPlural).trim().replace(/\.$/, '')} – eingebracht ${when}.`
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
