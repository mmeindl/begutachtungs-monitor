/**
 * The five stations of a Begutachtungsverfahren, one row each.
 *
 * What a visitor comes to find out, by lifecycle state:
 *  - while the Frist runs — until when, how do I take part, how many others
 *    already did;
 *  - after it — did a Regierungsvorlage come, and what changed after the
 *    Begutachtung;
 *  - later — did it become law, what did parliament do with it, and how long
 *    each step took.
 *
 * Five stations answer that. The shape before this one did not: it drew the
 * text VERSIONS as the stations and the procedural stages as the arrows
 * between them, which is accurate about the documents and wrong about the
 * reading. It made the Begutachtung — this product's entire subject — an
 * arrow between two boxes, and two of its five arrows (Ausarbeitung im
 * Ressort, Kundmachung) had nothing observable behind them at all.
 *
 * What that costs and why it is worth it:
 *  - **Geltendes Recht** is not a step of the procedure. It is a fact about
 *    the Entwurf — how many laws in force it would change — and it reads as
 *    one. A draft that creates new law has no predecessor text, and the
 *    same fact line says that too.
 *  - **Ausarbeitung im Ressort** happens before anything is published. We
 *    can observe nothing about it, so a row for it would be an empty
 *    promise.
 *  - **Ausschussfassung and Plenarfassung** are two documents answering one
 *    visitor question: what did parliament do with it? One station,
 *    Parlament, whose fact line names the body that changed the text; both
 *    texts stay as documents in the Parlament section.
 *  - **Kundmachung** is the act that the Bundesgesetzblatt row reports by
 *    existing. Naming it twice said the same word twice.
 *
 * Comparisons stay attached to the station that PRODUCED them, and are
 * phrased as the question they answer rather than as the name of a
 * procedure: "Was ändert der Entwurf?" belongs to the Entwurf, "Was sich
 * nach der Begutachtung geändert hat" to the Regierungsvorlage.
 *
 * Pure module: no Nuxt auto-imports, derived entirely from
 * DraftDetail — the statement count included, so a bar built from
 * this fetches nothing.
 */
import type { DraftDetail, LawStationId } from '../types'
import { formatDateDe, formatNumberDe, spanInDays } from './format'
import { UPSTREAM_AUSSCHUSS_TITLE, UPSTREAM_PLENUM_TITLE } from './lawStations'

export type StationId = 'entwurf' | 'begutachtung' | 'rv' | 'parlament' | 'bgbl'

/** done: happened. current: where the procedure is now. open: still ahead.
 *  never: can no longer be reached (GP over). */
export type StationState = 'done' | 'current' | 'open' | 'never'

/** All three are in use since 17.09.2026: the diff endpoint takes a pair of
 *  stations (`?von=…&bis=…`), so the Parlament station hands out the
 *  comparison it produced — but only where a committee or plenary text
 *  exists, because that is when there is something to compare. */
export type ComparisonId = 'vorschlag' | 'begutachtung' | 'parlament'

export interface Station {
  id: StationId
  name: string
  state: StationState
  /**
   * Plain-text facts, rendered joined by " · ". Temporal, never causal:
   * "nach der Begutachtung", not "durch die Stellungnahmen" (framing rule,
   * CLAUDE.md).
   */
  facts: string[]
  /** The comparison this station produced, as the question it answers; null
   *  where none exists or none can be shown. */
  comparison: { id: ComparisonId, question: string } | null
}

/**
 * What only the standing-law lookup can tell us (`/geltendesrecht`): that
 * the draft creates law rather than changing it, and how many laws in force
 * it would change. Neither can be derived from DraftDetail, so both
 * are passed in rather than guessed.
 */
export interface StationContext {
  createsNewLaw?: boolean
  amendedLawCount?: number
  /**
   * How many Stellungnahmen the Regierungsvorlage itself received on
   * parliament's side (`/rv-stellungnahmen`) — the second window for input,
   * which the Begutachtung's count does not include. Undefined while
   * unknown; the row then carries the date alone.
   */
  rvStatementTotal?: number | null
}

/**
 * How long the Begutachtungsfrist ran — Einlangen im Nationalrat until
 * Fristende. The one number that says at a glance whether a consultation
 * was a real one: the Legistische Richtlinien recommend six weeks, and a
 * ten-day Frist is the finding, not the dates it sits between.
 *
 * Weeks wherever the span is a clean multiple of seven, days otherwise —
 * and the duration LEADS the fact, because a bare "(42 Tage)" next to a
 * badge that says "Noch 5 Tage" would read as a second countdown.
 *
 * Measured against RIS's own Begutachtungsbeginn on 2026-09-16 (all 133
 * GP-XXVIII rows of `/api/ris-map`): identical for 112, one day apart for
 * 12, more than four days apart for 3. So the parliamentary Einlangen is
 * the Frist's start to within a day in 94 % of cases — and it is the date
 * the row above states, so a reader can do the subtraction.
 */
function fristDurationDe(d: DraftDetail): string | null {
  const days = spanInDays(d.arrivedAt, d.deadline)
  if (days === null || days < 1) return null
  if (days >= 14 && days % 7 === 0) return `${days / 7} Wochen Frist`
  return days === 1 ? '1 Tag Frist' : `${days} Tage Frist`
}

/**
 * How long after the Fristende the Regierungsvorlage came — temporal, never
 * causal (framing rule). Reads as an apposition to the RV's date rather
 * than as a fact of its own, so the row keeps at most two middot-separated
 * parts.
 *
 * The negative case is not an error: 115/ME XXVIII was tabled as 525 d.B.
 * on the day the draft went out, a fortnight before its own Frist ended.
 * Two identical dates in two rows hid that completely; naming the span is
 * the whole reason this line exists.
 */
function rvLatencyDe(deadline: string | null, rvDate: string | null): string | null {
  const days = spanInDays(deadline, rvDate)
  if (days === null) return null
  if (days < 0) return 'noch vor Fristende'
  if (days === 0) return 'am Tag des Fristendes'
  if (days === 1) return '1 Tag nach Fristende'
  if (days < 60) return `${days} Tage nach Fristende`
  return `${Math.round(days / 30.44)} Monate nach Fristende`
}

/**
 * The card's opening line: where the text stands, in one phrase.
 *
 * It replaces the label "Der Text im Verfahren", which named the card
 * without answering anything — five rows had to be read and added up
 * before a visitor knew whether this draft became law. The phrase
 * deliberately carries no countdown: the badge beside the title and the
 * CTA card below already state the remaining days, and this would have
 * been the third.
 */
export function procedureStatusDe(d: DraftDetail): string {
  const e = d.enactment
  if (e?.bgblNumber) return 'Gesetz geworden'
  if (e) return d.gpEnded ? 'Ohne Beschluss – Gesetzgebungsperiode beendet' : 'Im Parlament'
  if (d.active) return 'In Begutachtung'
  // Word for word the homepage chip's (OutcomeChip), and deliberately NOT
  // "Beim Ressort – bisher keine Regierungsvorlage": the marked row two
  // lines below already reads "bisher keine · seit 29.06.2026 beim
  // Ressort", so the longer headline was the same two facts twice, 40px
  // apart. The headline states the finding, the row says since when.
  return d.gpEnded
    ? 'Ohne Regierungsvorlage – Gesetzgebungsperiode beendet'
    : 'Bisher keine Regierungsvorlage'
}

/** Upstream's own wording, from the one place that maps it to a station. */
const AUSSCHUSS = UPSTREAM_AUSSCHUSS_TITLE
const PLENUM = UPSTREAM_PLENUM_TITLE

const carries = (d: DraftDetail, prefix: string) =>
  d.textEvolution.some((doc) => doc.title.startsWith(prefix))

/**
 * The latest version parliament published, or null when it published none.
 *
 * Which one matters for the comparison the Parlament station offers: against
 * the Regierungsvorlage, the Plenarfassung is the whole of what parliament
 * did, and the Ausschussfassung is the whole of it only while no plenary
 * text exists.
 */
export function lastParliamentStation(d: DraftDetail): LawStationId | null {
  if (carries(d, PLENUM)) return 'plenum'
  if (carries(d, AUSSCHUSS)) return 'ausschuss'
  return null
}

/**
 * What parliament did with the Regierungsvorlage. One function, because the
 * bar's fact line and the page's Parlament section must never be able to
 * disagree about it.
 *
 * 'amended' does not wait for the Kundmachung: a committee or plenary text
 * either exists or it does not, and that is observable at any point.
 * 'unchanged' is the one that has to wait — before the Kundmachung the same
 * absence only means the bill is still being dealt with, and claiming a
 * finding there would be false.
 */
export function parliamentOutcome(
  d: DraftDetail,
): 'unchanged' | 'amended' | 'pending' | 'lapsed' | null {
  const e = d.enactment
  if (!e) return null
  if (carries(d, AUSSCHUSS) || carries(d, PLENUM)) return 'amended'
  if (e.bgblNumber) return 'unchanged'
  return d.gpEnded ? 'lapsed' : 'pending'
}

/** Empty slots are dropped rather than rendered, so a row never reads "· ·". */
const kept = (...facts: (string | null | undefined)[]): string[] =>
  facts.filter((f): f is string => Boolean(f))

export function stations(d: DraftDetail, ctx: StationContext = {}): Station[] {
  const e = d.enactment

  /** Which body changed the text — the one thing the parliament station can
   *  report without a comparison behind it. */
  const ausschuss = carries(d, AUSSCHUSS)
  const plenum = carries(d, PLENUM)
  const amended = ausschuss && plenum
    ? 'im Ausschuss und im Plenum geändert'
    : ausschuss
      ? 'im Ausschuss geändert'
      : plenum
        ? 'im Plenum geändert'
        : null

  const outcome = parliamentOutcome(d)
  /** Whether parliament is still holding the text — orthogonal to WHAT it
   *  did with it, so the two are read separately. */
  const running = e && !e.bgblNumber ? (d.gpEnded ? 'GP beendet' : 'in Behandlung') : null

  /** The head of the old chain, as a fact of the draft that produces it. */
  const changes = ctx.createsNewLaw
    ? 'neues Gesetz'
    : ctx.amendedLawCount === 1
      ? 'ändert 1 Gesetz'
      : ctx.amendedLawCount
        ? `ändert ${ctx.amendedLawCount} Gesetze`
        : null

  /** Duration first, then the date — "6 Wochen Frist, endete 24.06.2026".
   *  Without a Frist the sentence is the absence itself. */
  const dur = fristDurationDe(d)
  const fristDate = d.deadline
    ? `${d.active ? 'bis' : 'endete'} ${formatDateDe(d.deadline)}`
    : null
  const fristLine = fristDate
    ? dur ? `${dur}, ${fristDate}` : `Frist ${fristDate}`
    : 'keine Frist angegeben'

  /** The RV's date with its distance to the Fristende as an apposition —
   *  one fact, not two, so the row does not grow a third middot. */
  const latency = e ? rvLatencyDe(d.deadline, e.rvDate) : null
  const rvWhen = e
    ? e.rvDate
      ? latency ? `${formatDateDe(e.rvDate)}, ${latency}` : formatDateDe(e.rvDate)
      : e.rvCitation
    : null

  const n = d.statements.total
  const count = n === 0
    ? d.active ? 'noch keine Stellungnahmen' : 'keine Stellungnahmen'
    : n === 1
      ? '1 Stellungnahme'
      : `${formatNumberDe(n)} Stellungnahmen`

  /** "zur Vorlage", because the row above already says how many came in the
   *  Begutachtung — two bare counts in two rows read as one number said
   *  twice. Zero is not stated: most Vorlagen get none, and a row that said
   *  so on every page would be noise where it is not a finding. */
  const rvN = ctx.rvStatementTotal ?? 0
  const rvCount = rvN === 0
    ? null
    : rvN === 1
      ? '1 Stellungnahme zur Vorlage'
      : `${formatNumberDe(rvN)} Stellungnahmen zur Vorlage`

  return [
    {
      id: 'entwurf',
      name: 'Entwurf',
      state: 'done',
      facts: kept(formatDateDe(d.arrivedAt), changes),
      // Nothing to hold a new law against, so the question is not asked:
      // the annex would answer with a generic "not available", which reads
      // as a gap in our data instead of a fact about the draft.
      comparison: ctx.createsNewLaw
        ? null
        : { id: 'vorschlag', question: 'Was ändert der Entwurf?' },
    },
    {
      id: 'begutachtung',
      name: 'Begutachtung',
      state: d.active ? 'current' : 'done',
      // The countdown deliberately stays with the badge and the CTA —
      // repeating "Noch 1 Tag" here put the same three words on the page
      // three times. The bar carries the date, and since 16.09.2026 the
      // LENGTH of the Frist with it: how long a ministry gave is the fact
      // that separates a consultation from a formality, and it was the one
      // thing five dates on this card left the reader to work out. While
      // the Frist runs that line leads, because it is what a reader can act
      // on; afterwards the count leads, because it is the result.
      facts: d.active
        ? kept(fristLine, count)
        : kept(count, fristLine),
      comparison: null,
    },
    {
      id: 'rv',
      name: 'Regierungsvorlage',
      state: e ? 'done' : d.active ? 'open' : d.gpEnded ? 'never' : 'current',
      // "bisher keine" is temporal, never accusatory (framing rule), and it
      // is only claimed once the Frist has ended — while it runs the
      // Vorlage is simply not due yet. Once the GP itself is over the
      // temporal word would mislead the other way, and the boundary becomes
      // the state.
      facts: e
        ? kept(rvWhen, rvCount)
        : d.active
          ? ['ausstehend']
          : d.gpEnded
            ? ['keine – GP beendet']
            : kept(
                'bisher keine',
                d.handoff?.date ? `seit ${formatDateDe(d.handoff.date)} beim Ressort` : null,
              ),
      comparison: e
        ? { id: 'begutachtung', question: 'Was sich nach der Begutachtung geändert hat' }
        : null,
    },
    {
      id: 'parlament',
      name: 'Parlament',
      // No date: the payload carries none for this station — the trace of a
      // Ministerialentwurf ends at the Regierungsvorlage, and parliament's
      // own dates live on the Vorlage's record, not on ours. So the row
      // says what happened, not when.
      state: !e
        ? d.gpEnded && !d.active ? 'never' : 'open'
        : e.bgblNumber
          ? 'done'
          : d.gpEnded ? 'never' : 'current',
      // The outcome word is what happened; `running` is whether it is over.
      // Both are needed, because a text amended in the Ausschuss can still
      // be on its way ("in Behandlung · im Ausschuss geändert") or have died
      // with the GP — the outcome alone would not say which.
      facts: outcome === null
        ? []
        : outcome === 'unchanged'
          ? ['Text unverändert beschlossen']
          : kept(running, amended),
      // Only where parliament actually published a changed text. Where it
      // did not, the station's own fact line already says so, and a link to
      // a comparison of nothing would be the empty promise this model exists
      // to avoid.
      comparison: ausschuss || plenum
        ? { id: 'parlament', question: 'Was das Parlament am Text geändert hat' }
        : null,
    },
    {
      id: 'bgbl',
      name: 'Bundesgesetzblatt',
      // The GP is the boundary here as it is for the Vorlage: while it runs a
      // law can still come, whatever the Frist says; once it is over, nothing.
      state: e?.bgblNumber ? 'done' : d.gpEnded ? 'never' : 'open',
      // "ausstehend" while the chain can still continue; nothing at all once
      // it cannot, because the station before it already says why.
      facts: e?.bgblNumber
        ? [e.bgblNumber.replace(/^Bundesgesetzblatt\b/, 'BGBl.')]
        : d.gpEnded
          ? []
          : ['ausstehend'],
      comparison: null,
    },
  ]
}

/**
 * Where the text is now: the station the procedure stands on, and once it
 * stands on none, the last one it reached. Exactly one per bar — this is
 * what the yellow dot marks.
 */
export function markedStation(list: Station[]): StationId | null {
  const current = list.find((s) => s.state === 'current')
  if (current) return current.id
  const done = list.filter((s) => s.state === 'done')
  return done[done.length - 1]?.id ?? null
}

/**
 * „Station 2 von 5" — where the marked station sits, in words.
 *
 * Two jobs, and the second is the reason it is not decoration:
 *
 *  - **It takes the marking off colour.** The current station is drawn with
 *    a wash and a filled dot, and announced to screen readers through
 *    `aria-current="step"`. Sighted readers had neither — meaning on colour
 *    alone, against the AAA claim on /ueber, and the one row that matters
 *    most was the row that relied on it.
 *  - **It is the orientation a shared link does not otherwise give.** The
 *    detail page is this tool's front door in practice. „Station 2 von 5"
 *    is the shortest sentence that says the procedure has a shape, how far
 *    along this text is, and that there is more to come.
 *
 * Derived from the same list the bar draws, so the two cannot disagree —
 * which is the whole reason it lives here and not in the page.
 */
export function stationPositionDe(list: Station[]): string | null {
  const id = markedStation(list)
  if (!id) return null
  const i = list.findIndex((s) => s.id === id)
  return i < 0 ? null : `Station ${i + 1} von ${list.length}`
}
