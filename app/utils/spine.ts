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
 * Pure module: no Nuxt auto-imports. `DraftDetail` carries most of it, but
 * not all — `StationContext` passes in what only a second endpoint knows
 * (the amended laws, the Regierungsvorlage's own Stellungnahmen count), so
 * the values are handed in rather than guessed or fetched here.
 */
import type { DraftDetail, LawStationId } from '#shared/types'
import { bgblShort, formatDateDe, formatNumberDe, fristEndedDe, spanInDays } from '#shared/utils/format'
import { UPSTREAM_AUSSCHUSS_TITLE, UPSTREAM_PLENUM_TITLE } from '#shared/utils/lawStations'

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
   * docs/architecture.md §4).
   */
  facts: string[]
  /** The comparison this station produced, as the question it answers; null
   *  where none exists or none can be shown. */
  comparison: { id: ComparisonId; question: string } | null
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
  if (e) {
    // Each of these four used to read „Im Parlament" or, after the period,
    // „Ohne Beschluss" — both wrong in a different direction. Temporal and
    // factual (framing rule, docs/architecture.md §4): what the house did,
    // never why. „Beschlossen – Kundmachung ausständig" is the one that
    // states a gap, and it states it about the Kundmachung, not about the
    // Vorlage.
    switch (parliamentOutcome(d)) {
      case 'rejected': return 'Im Nationalrat abgelehnt'
      case 'withdrawn': return 'Zurückgezogen'
      case 'decided': return 'Beschlossen – Kundmachung ausständig'
      case 'recommitted': return 'Im Parlament'
      default: break
    }
    return d.gpEnded ? 'Ohne Beschluss – Gesetzgebungsperiode beendet' : 'Im Parlament'
  }
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

/**
 * The same line for a Verordnungsentwurf — and an asymmetry that is
 * deliberate (docs/architecture.md §12.32).
 *
 * ONLY AN EVIDENCED OUTCOME GOES TO THE TOP. „Bisher nicht kundgemacht"
 * would be the obvious counter-direction and is NOT said here: the
 * Ministerialentwurf may claim „Bisher keine Regierungsvorlage" because
 * Parliament's list is complete, while a Verordnung's Kundmachung is found
 * through a constructed key that hits 84,2 % (92,3 % for older Fristen).
 * Every twelfth headline would be wrong, in the direction that sounds like an
 * accusation. The row in the card text still states the negative finding, but
 * as what it is: information about our search.
 */
export function regulationStatusDe(active: boolean, promulgated: boolean): string {
  if (promulgated) return 'Kundgemacht'
  return active ? 'In Begutachtung' : 'Begutachtung beendet'
}

/**
 * The second window: that a Stellungnahme on the Regierungsvorlage is still
 * possible, and until when.
 *
 * It was explained in six places and in six wordings, which mixed two
 * different facts: that no Frist is published, and when the window closes.
 *
 * Chosen is „solange der Nationalrat den Text behandelt" and not „endet mit
 * der Abstimmung": it covers the Ausschuss too and does not promise that
 * filing is possible up to the second of the vote.
 *
 * The full sentence is built from the clause so the two cannot drift apart.
 * Whoever already has a sentence running takes the clause.
 */
export const SECOND_ROUND_CLAUSE = 'solange der Nationalrat den Text behandelt'
export const SECOND_ROUND_WINDOW =
  `Eine veröffentlichte Frist gibt es dafür nicht – möglich, ${SECOND_ROUND_CLAUSE}.`

/**
 * What a Regierungsvorlage is — the term a draft page uses most often
 * without explaining it.
 *
 * Until 18.09.2026 it was explained in exactly the branch where a Vorlage
 * exists. The other — „Bisher keine Regierungsvorlage", two thirds of the
 * cases — had no definition, although more depends on it there: whoever does
 * not know what a Regierungsvorlage is cannot place the fact that none came.
 *
 * Present tense, so the same sentence stands in both branches: in one it
 * defines something that happened, in the other something still pending.
 */
export const RV_DEFINITION =
  'Eine Regierungsvorlage ist die Fassung, die die Regierung nach der Begutachtung dem Nationalrat vorlegt.'

/** Upstream's own wording, from the one place that maps it to a station. */
const AUSSCHUSS = UPSTREAM_AUSSCHUSS_TITLE
const PLENUM = UPSTREAM_PLENUM_TITLE

const carries = (d: DraftDetail, prefix: string) =>
  d.textEvolution.some((doc) => doc.title.startsWith(prefix))

/**
 * Where parliament changed the text — from the Vorlage that supplies the
 * BGBl number, and only failing that from the draft's own mirror of the
 * same list.
 *
 * The two are the same list for a draft with one Regierungsvorlage, which is
 * nearly all of them. They come apart where ME→RV is 1:n (§13.4): the mirror
 * carries ONE Vorlage's documents, `enactment` names the LAST one, and on
 * XXVIII/26/ME those are 130 d.B. and 129 d.B. — the mirror silent, 129 d.B.
 * changed in committee and in the plenary and promulgated as BGBl. I 50/2025.
 * The bar read the silence and stated „Text unverändert beschlossen".
 *
 * `amendedIn === null` means the Vorlage's record was unreadable, never that
 * it changed nothing; the mirror is then the best evidence left.
 */
function amendedStations(d: DraftDetail): readonly LawStationId[] {
  const fromRv = d.enactment?.amendedIn
  if (fromRv) return fromRv
  const mirrored: LawStationId[] = []
  if (carries(d, AUSSCHUSS)) mirrored.push('ausschuss')
  if (carries(d, PLENUM)) mirrored.push('plenum')
  return mirrored
}

/**
 * The latest version parliament published **on this page**, or null when
 * there is none, for the comparison the Parlament station offers: against
 * the Regierungsvorlage, the Plenarfassung is the whole of what parliament
 * did, and the Ausschussfassung is the whole of it only while no plenary
 * text exists.
 *
 * DELIBERATELY THE MIRROR, not `amendedIn` — the one place in this file that
 * reads the documents rather than the claim. A comparison is resolved from
 * the draft's own document list (`server/utils/diff/stationDocuments.ts`),
 * so for the 1:n case above the whole chain is on the OTHER Vorlage's
 * documents: offering the pair would land on „Im Plenum wurde keine
 * geänderte Fassung veröffentlicht" — the same false negative one screen
 * further on. The fact line says what happened; the link is only offered
 * where there is a text behind it.
 */
export function lastParliamentStation(d: DraftDetail): LawStationId | null {
  if (carries(d, PLENUM)) return 'plenum'
  if (carries(d, AUSSCHUSS)) return 'ausschuss'
  return null
}

/**
 * What the house did with the Vorlage, from its own status record.
 *
 * Pure and exported for its tests: the input is upstream free text, so the
 * rules that read it have to be visible and testable rather than buried in a
 * branch. The reading is coarse on purpose — four terminal facts, each with
 * its own word in the record, and everything else falls through to what the
 * documents already say.
 *
 * Order is the order of finality. A Vorlage that was rejected in the third
 * reading also carries „Beschlossen im Nationalrat" lines for the earlier
 * ones, so „abgelehnt" has to be asked first; „zurückverwiesen" comes before
 * „beschlossen" for the same reason. Status '3' is the same fact as a
 * number, for the records that carry no wording for it.
 *
 * 'decided' says a Beschluss exists; whether it was promulgated is the BGBl
 * link's answer, not this one's, so the caller asks that first.
 */
export type HouseOutcome = 'rejected' | 'withdrawn' | 'recommitted' | 'decided'

/** Upstream's list-101 `Status`: zurückverwiesen an den Ausschuss. */
const STATUS_RECOMMITTED = '3'

export function houseOutcomeOf(
  houseStatus: string | null | undefined,
  houseStatusText: string | null | undefined,
): HouseOutcome | null {
  const text = houseStatusText ?? ''
  if (/abgelehnt/i.test(text)) return 'rejected'
  if (/zurückgezogen/i.test(text)) return 'withdrawn'
  if (/zurückverwiesen/i.test(text) || houseStatus === STATUS_RECOMMITTED) return 'recommitted'
  if (/beschlossen/i.test(text)) return 'decided'
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
 *
 * The four house outcomes below were invisible until 23.09.2026: the status
 * record was fetched and dropped, so a Vorlage that was rejected, withdrawn,
 * sent back to committee or decided-but-not-yet-promulgated all read as „Im
 * Parlament" — or, once the period was over, as „Ohne Beschluss". Seven
 * finished GP-XXVII/XXVIII Vorlagen carry no BGBl link; three of them were
 * beschlossen.
 */
export function parliamentOutcome(
  d: DraftDetail,
): 'unchanged' | 'amended' | 'pending' | 'lapsed' | HouseOutcome | null {
  const e = d.enactment
  if (!e) return null
  const amended = amendedStations(d).length > 0
  // The Kundmachung is the end of the chain and outranks every reading of
  // the status text: what is in the Bundesgesetzblatt was decided.
  if (e.bgblNumber) return amended ? 'amended' : 'unchanged'
  const house = houseOutcomeOf(e.houseStatus, e.houseStatusText)
  if (house) return house
  if (amended) return 'amended'
  return d.gpEnded ? 'lapsed' : 'pending'
}

/** Empty slots are dropped rather than rendered, so a row never reads "· ·". */
const kept = (...facts: (string | null | undefined)[]): string[] =>
  facts.filter((f): f is string => Boolean(f))

export function stations(d: DraftDetail, ctx: StationContext = {}): Station[] {
  const e = d.enactment

  /** Which body changed the text — the one thing the parliament station can
   *  report without a comparison behind it. Read from the Vorlage that
   *  carries the outcome, so the fact and the Kundmachung beside it are
   *  about the same Vorlage. */
  const changedIn = amendedStations(d)
  const ausschuss = changedIn.includes('ausschuss')
  const plenum = changedIn.includes('plenum')
  const amended = ausschuss && plenum
    ? 'im Ausschuss und im Plenum geändert'
    : ausschuss
      ? 'im Ausschuss geändert'
      : plenum
        ? 'im Plenum geändert'
        : null

  const outcome = parliamentOutcome(d)
  /** Terminal: parliament is done with the text, in one direction or the
   *  other, so the station is `done` rather than `current` or `never`. */
  const houseDone =
    outcome === 'rejected' || outcome === 'withdrawn' || outcome === 'decided'
  /** No Kundmachung will follow — the one case where the last station is
   *  unreachable for a reason other than the end of the period. */
  const noBgblEver = outcome === 'rejected' || outcome === 'withdrawn'
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

  /** Duration first, then the date — "6 Wochen Frist, endete am 24.06.2026".
   *  Without a Frist the sentence is the absence itself.
   *
   *  One wording for an ended Frist, site-wide (`fristEndedDe`): without a
   *  duration this line IS that sentence. With one, the duration already
   *  carries the word „Frist", so the line takes the builder's wording
   *  („endete am …") instead of the builder — one wording, two sentence
   *  shapes, rather than the „endete 24.06.2026" this said before. */
  const dur = fristDurationDe(d)
  const fristLine = !d.deadline
    ? 'keine Frist angegeben'
    : d.active
      ? dur ? `${dur}, bis ${formatDateDe(d.deadline)}` : `Frist bis ${formatDateDe(d.deadline)}`
      : dur ? `${dur}, endete am ${formatDateDe(d.deadline)}` : fristEndedDe(d.deadline)

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
        : e.bgblNumber || houseDone
          ? 'done'
          : d.gpEnded ? 'never' : 'current',
      // The outcome word is what happened; `running` is whether it is over.
      // Both are needed, because a text amended in the Ausschuss can still
      // be on its way ("in Behandlung · im Ausschuss geändert") or have died
      // with the GP — the outcome alone would not say which.
      //
      // The four house outcomes each replace that pair with the single fact
      // they are: „in Behandlung" beside „abgelehnt" would say the procedure
      // is still running. Only „beschlossen" keeps the amendment beside it,
      // because there the reader is still owed what the text went through.
      facts: outcome === null
        ? []
        : outcome === 'unchanged'
          ? ['Text unverändert beschlossen']
          : outcome === 'rejected'
            ? ['abgelehnt']
            : outcome === 'withdrawn'
              ? ['zurückgezogen']
              : outcome === 'recommitted'
                ? ['an den Ausschuss zurückverwiesen']
                : outcome === 'decided'
                  ? kept('beschlossen', amended)
                  : kept(running, amended),
      // Only where a changed text is ON THIS PAGE — `lastParliamentStation`,
      // not the fact line above it. Where parliament changed the text of a
      // sibling Vorlage (§13.4) the fact is true and the comparison still has
      // nothing to read, and a link to a comparison of nothing would be the
      // empty promise this model exists to avoid.
      comparison: lastParliamentStation(d)
        ? { id: 'parlament', question: 'Was das Parlament am Text geändert hat' }
        : null,
    },
    {
      id: 'bgbl',
      name: 'Bundesgesetzblatt',
      // The GP is the boundary here as it is for the Vorlage: while it runs a
      // law can still come, whatever the Frist says; once it is over, nothing.
      //
      // Two exceptions, both from the house status. A rejected or withdrawn
      // Vorlage will not be promulgated whatever the calendar says. And a
      // Beschluss outlives its period — the Kundmachung follows it, so the
      // station stays `open` even after the GP ended: XXVII/1435 d.B. was
      // decided in both chambers and carries no BGBl link, and „never" would
      // have been our claim, not a fact.
      state: e?.bgblNumber
        ? 'done'
        : noBgblEver
          ? 'never'
          : outcome === 'decided'
            ? 'open'
            : d.gpEnded ? 'never' : 'open',
      // "ausstehend" while the chain can still continue; nothing at all once
      // it cannot, because the station before it already says why.
      facts: e?.bgblNumber
        ? [bgblShort(e.bgblNumber)]
        : noBgblEver
          ? []
          : outcome === 'decided'
            ? ['ausstehend']
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

/* There was a `stationPositionDe` here that rendered „Station 2 von 5" on
 * the detail page, on the claim that the mark otherwise rode on colour
 * alone. Removed 18.09.2026, because none of that claim survived contact
 * with the three things that carry it already:
 *
 *  - `reached` states form a PREFIX of the list, so the marked station is
 *    always the last row the bar sets in `font-medium text-ink`. That
 *    boundary is weight, not colour.
 *  - `procedureStatusDe` heads the same card and names the station in
 *    words — that is the sentence that takes the mark off colour.
 *  - The bar is an <ol> with `aria-current="step"`, so assistive tech
 *    announces the position per row without being told.
 *
 * What was left was a number counting the list the reader is looking at,
 * for a line of card height. If it ever comes back, it belongs ON the
 * marked row, not above or below the list. */
