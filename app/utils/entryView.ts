/**
 * Eine Zeile, vier Zonen — the one anatomy every list entry is rendered
 * from (docs/architecture.md §12.28).
 *
 * History: until 18.09.2026 the lists carried six components for three kinds
 * of row (`DraftCard`/`DraftRow`, `RisConsultationCard`/`Row`,
 * `SecondRoundCard`/`Row`), and on `/entwuerfe?status=open` the Stellungnahmen
 * token drifted 168 px between two rows of one screenful (x=388 against
 * x=556). A number that cannot form a column cannot be compared, and
 * comparing is the only thing a count is for.
 *
 * WHAT THIS MODULE IS: the place where each kind is mapped onto four fixed
 * zones, and — the harder half — where a zone decides what to say when the
 * kind cannot have that fact at all. Absence must read as „gibt es hier
 * nicht", never as zero and never as a defect.
 *
 * THREE THINGS KEPT APART, which the old components conflated:
 *  - **Position** follows the fact's identity. A count is in the count zone,
 *    in every section, always.
 *  - **Loudness** follows what the reader can act on. Only a running window
 *    is loud. Not the sort, not the section.
 *  - **Order** follows the sort, and nothing else.
 *
 * Rejected with it: promoting the count into the right-hand slot in the
 * ranked section, where it EVICTED the station chip — „846 Stellungnahmen →
 * bisher keine Regierungsvorlage" is the accountability story and not a
 * leaderboard entry (§12.21). A ranked list shows its key by order; the
 * count needs alignment, not size.
 *
 * WHAT THIS DOES NOT DO — and §12.19 is still right about it: there is no
 * single row TYPE. `RisConsultation` does not grow nullable `citation`,
 * `statementCount` and `chain` fields so that one shape fits all; inventing
 * empty fields is what produces „0 Stellungnahmen" over two thirds of the
 * corpus. What is shared is the anatomy, and every absence in it is named
 * here, per kind, once.
 *
 * Pure module: no Nuxt auto-imports, so the pages, the components and vitest
 * all read the same mapping.
 */
import type {
  ClosedOutcome,
  DraftChain,
  DraftStation,
  DraftSummary,
  OpenVorlage,
  RisConsultation,
} from '#shared/types'
import { aliasesFor } from '#shared/utils/draftAliases'
import type { DraftListRow } from '#shared/utils/draftOrder'
import { DRAFT_STATION_LABEL } from '#shared/utils/draftStations'
import { type DeadlineTone, deadlineTone, fristClassLineDe, isNewArrival, isWithinNewWindow } from './deadlines'
import { bgblShort, formatDateDe, formatDateWeekdayDe, fristEndedDe, fristLabel, todayIso } from '#shared/utils/format'
import { promulgationState } from '#shared/utils/promulgation'
import { RIS_KIND_LABEL } from '#shared/utils/risConsultations'

/**
 * Zone 3 — what was filed in this Verfahren.
 *
 * Three states, and the third is the one the old rows got wrong. A record
 * without a Gegenstand at Parliament carries no Stellungnahmen count and
 * never will: they are filed with the Ressort, Parliament never sees them,
 * so nobody counts them (§12.16). That is `unpublished` — a permanent
 * property of the kind, not a missing value. `unavailable` is the temporary
 * one: we asked and could not read it.
 */
export type Participation =
  | { kind: 'count'; count: number }
  | { kind: 'unpublished' }
  | { kind: 'unavailable' }

/**
 * Zone 4 — where the Verfahren stands, in two lines: line 1 the state,
 * line 2 what pins it down.
 *
 * `tone` is the deadline tone system and applies to line 1 only while a
 * window is open; every closed state is `inactive` and renders as calm text
 * — no pill, no dot, no wash. That is the change that lets a three-day
 * countdown win a screenful back from thirty yellow chips.
 */
export interface EntryState {
  /** The state itself, e.g. „Noch 3 Tage", „Kundgemacht". */
  label: string
  /** What pins it down: a date or a citation. Null → line 1 stands alone. */
  detail: string | null
  tone: DeadlineTone
  /** Something can still be filed — the one condition that may be loud. */
  actionable: boolean
}

/** The four zones, for one entry of any kind. */
export interface EntryView {
  /** Stable key for `v-for`. */
  key: string
  /** Internal route, or null when the monitor has no page for this entry. */
  to: string | null
  /** Used only when `to` is null: the parlament.gv.at page instead. */
  href: string | null
  title: string
  /** Long form for `title=`, when upstream has one. */
  titleFull: string | null
  /** Zone 2, token 1: „Ministerialentwurf 132/ME", „Verordnungsentwurf". */
  kindLabel: string
  citation: string | null
  /** The Ressort the entry is filed under — the lead, where there are two. */
  ministry: { code: string; name: string } | null
  /**
   * The further ressorts of a jointly issued Entwurf, in the fold's order
   * (`server/utils/parliament/draftList.ts`). Empty everywhere else, and
   * always empty where `ministry` is null: a second Ressort without a first
   * is not a state the data has.
   */
  coMinistries: { code: string; name: string }[]
  /** Zone 2, last token — the debate name, quoted, ink. */
  alias: string | null
  /**
   * A procedural fact that belongs to the identity, e.g. „ohne Begutachtung"
   * — or, on an open Entwurf, „Kurze Frist: 2 Wochen" / „Volle Frist: 6
   * Wochen" (`openFristNote`).
   */
  note: string | null
  /**
   * The „Neu" chip's text, null for no chip: „Neu: <Station>" for the
   * station the row reached this week, from „Neu: Begutachtung" to „Neu:
   * Bundesgesetzblatt" (`stationNewLabel`).
   */
  newLabel: string | null
  participation: Participation
  state: EntryState
}

/* ------------------------------------------------------------------ *
 * Zone 4, one wording per fact
 * ------------------------------------------------------------------ */

/**
 * The weekday appears on a future date only.
 *
 * One plans around a Frist — that is what „bis Fr., 16.10.2026" is for. A
 * past date is looked up, not planned around, and the weekday beside it is
 * then ballast in a column a hundred rows long.
 */
function openState(deadline: string | null, active: boolean): EntryState {
  return {
    label: fristLabel(deadline, active),
    detail: deadline ? `bis ${formatDateWeekdayDe(deadline)}` : null,
    tone: deadlineTone(deadline, active),
    actionable: true,
  }
}

/**
 * Zone 2's Frist token: the class of an OPEN window, at the edges only
 * (`fristClassLineDe`). In the identity line and not in the Stand box: the
 * box answers „how much time is left", this answers „how long was the
 * window", and a third line in the box made that one row taller than every
 * other (30.09.2026). Closed entries carry none — on the archive it would
 * stand on a quarter of the rows; the detail page says it there.
 */
function openFristNote(start: string | null, deadline: string | null, active: boolean): string | null {
  return active ? fristClassLineDe(start, deadline) : null
}

/**
 * The open window without a Frist: the Regierungsvorlage in the Nationalrat.
 *
 * „Stellungnahme möglich", not „Zweite Runde". Both are true, but only one
 * of them is what somebody can do today — and „zweite" would be plainly
 * wrong on a Vorlage without a Begutachtung, where there was no first round.
 * „Zweite Runde" stays the vocabulary of the heading and the filter, where it
 * names a SET rather than the state of one row.
 *
 * Tone `neutral`: without a Frist there is nothing that could become urgent.
 */
function openVorlageState(date: string | null): EntryState {
  return {
    label: 'Stellungnahme möglich',
    detail: date ? `zur Vorlage seit ${formatDateDe(date)}` : null,
    tone: 'neutral',
    actionable: true,
  }
}

/** Frist over, and behind it nothing is known or nothing is possible. */
function endedState(deadline: string | null, label: string): EntryState {
  return {
    label,
    detail: deadline ? fristEndedDe(deadline) : null,
    tone: 'inactive',
    actionable: false,
  }
}

/**
 * What became of a Ministerialentwurf — from the stage record (`DraftChain`)
 * or from the end of the chain (`ClosedOutcome`), which say the same thing in
 * two types.
 *
 * On a station that was reached, line 2 carries the Fundstelle and not the
 * Fristende: „594 d.B." and „BGBl. I Nr. 69/2026" are what the statement can
 * be looked up by, and two facts in one slot would be the conflation this
 * module dissolves. On „bisher keine Regierungsvorlage" there is no
 * Fundstelle — the Fristende stands there, because the time elapsed IS the
 * statement.
 *
 * „Bisher" survives every shortening: it is the word that makes „keine
 * Regierungsvorlage" a state and not a verdict (framing rule, docs/architecture.md §4).
 * Nothing is abbreviated here any more — the column may wrap since the pill
 * went, and the old short forms („Bisher keine Vorlage", „Im Parlament") were
 * owed to its `whitespace-nowrap` alone.
 */
function outcomeState(
  o: { rvCitation: string | null; bgblNumber: string | null },
  deadline: string | null,
): EntryState {
  if (o.bgblNumber) {
    return {
      label: 'Kundgemacht',
      detail: bgblShort(o.bgblNumber),
      tone: 'inactive',
      actionable: false,
    }
  }
  if (o.rvCitation) {
    return {
      label: 'Regierungsvorlage liegt vor',
      detail: o.rvCitation,
      tone: 'inactive',
      actionable: false,
    }
  }
  return endedState(deadline, 'Bisher keine Regierungsvorlage')
}

/**
 * The open window at the Bundesrat (03.10.2026): the Nationalrat has
 * decided, the form is still open — it is until the end of the
 * parliamentary procedure (§12.26). The parallel of „zur Vorlage seit …",
 * dated by the step the text is at: its arrival in the Bundesrat, or failing
 * that the Nationalrat's Beschluss.
 */
function bundesratWindowState(chain: DraftChain): EntryState {
  return {
    label: 'Stellungnahme möglich',
    detail: chain.bundesratArrivedAt
      ? `im Bundesrat seit ${formatDateDe(chain.bundesratArrivedAt)}`
      : chain.decidedAt
        ? `Nationalrat hat beschlossen am ${formatDateDe(chain.decidedAt)}`
        : null,
    tone: 'neutral',
    actionable: true,
  }
}

/** The chain's state, including the one case where it is still actionable. */
function chainState(chain: DraftChain, deadline: string | null, today: string): EntryState {
  if (chain.filingOpen) {
    return chain.station === 'parlament' ? bundesratWindowState(chain) : openVorlageState(chain.rvDate)
  }
  /* Decided and not promulgated (§12.33, Nachtrag 03.10.2026) — Parliament's
   * stage or the calendar past every measured Kundmachung, by the one rule
   * the spine reads too (`promulgationState`). Dated, never explained: the
   * cause belongs to the detail page, and only where Parliament gives one.
   * A successor that reached the Bundesgesetzblatt is not this case — that
   * chain stands at `bgbl`, with the Antrag in zone 2. */
  if (chain.station === 'parlament' && promulgationState(chain, today)) {
    const date = chain.notPromulgated?.date ?? chain.bundesratDecidedAt ?? chain.decidedAt
    return {
      label: 'Beschlossen, nicht kundgemacht',
      detail: date ? formatDateDe(date) : null,
      tone: 'inactive',
      actionable: false,
    }
  }
  /* Decided, and line 2 is a DATE here, not a Fundstelle (03.10.2026): the
   * Beschluss has no Fundstelle on the row — its BNR number is not in the
   * chain — and the day it fell is what pins it down. Without a readable
   * Beschluss stage (a recommitted Vorlage, an older record) the station
   * keeps its old words and the Vorlage's citation. */
  if (chain.station === 'parlament' && chain.decidedAt) {
    return { label: 'Im Nationalrat beschlossen', detail: formatDateDe(chain.decidedAt), tone: 'inactive', actionable: false }
  }
  if (chain.station === 'parlament') {
    return { label: 'Im Parlament behandelt', detail: chain.rvCitation, tone: 'inactive', actionable: false }
  }
  /* A Vorlage the house never decided, in a period that is over, does not
   * „liegen vor" any more. The words are the detail page's
   * (`procedureStatusDe`: „Ohne Beschluss – Gesetzgebungsperiode beendet"),
   * shortened the way the spine shortens them. Measured 30.09.2026: 1 row in
   * GP XXVII, 3 in XXV, 8 in XXIV — every one of them said „liegt vor"
   * about a Vorlage of a closed period (docs/architecture.md §12.10). */
  if (chain.station === 'rv' && chain.rvGpEnded) {
    return { label: 'Ohne Beschluss – GP beendet', detail: chain.rvCitation, tone: 'inactive', actionable: false }
  }
  return outcomeState(chain, deadline)
}

/* ------------------------------------------------------------------ *
 * The „Neu" mark
 * ------------------------------------------------------------------ */

/**
 * „Neu: <Station>" when a row's CURRENT station was reached inside the
 * window (`isWithinNewWindow`), else null — the one function every label
 * comes from.
 *
 * WHY EVERY STATION (03.10.2026): the weekly reader's question is not only
 * which Begutachtung began, but which Vorlage arrived and what became law
 * this week. A win on the list has to be as visible as a shelving (framing
 * rule, docs/architecture.md §4), and a Kundmachung this week is one.
 *
 * ONE RULE, NO EXCEPTION: the chip names the station reached, the kind label
 * in zone 2 names the document. So the Begutachtung says „Neu: Begutachtung"
 * too, and a Vorlage row reads „Regierungsvorlage 625 d.B. · Neu:
 * Regierungsvorlage" — the repetition is the accepted price of a chip that
 * never means something different from one row to the next. A bare „Neu"
 * stood on the Begutachtung and the open Vorlage until the same day.
 *
 * The chip only ever names the current station: a draft whose Vorlage
 * arrived on Monday and was promulgated on Friday says „Neu:
 * Bundesgesetzblatt", not both. The words are the tabs' (`DRAFT_STATION_LABEL`),
 * so the chip and the tab that filters for it say the same thing.
 */
function stationNewLabel(station: DraftStation | null, date: string | null | undefined): string | null {
  if (!station || !isWithinNewWindow(date)) return null
  return `Neu: ${DRAFT_STATION_LABEL[station]}`
}

/**
 * The Begutachtung's own event, its start — marked only while the window
 * runs (`isNewArrival`): „neu" on a closed Verfahren would mark the one
 * thing nobody can act on any more.
 */
function begutachtungNewLabel(startedAt: string | null | undefined, active: boolean): string | null {
  return isNewArrival(startedAt, active) ? stationNewLabel('begutachtung', startedAt) : null
}

/** The date a chain reached its current station — one per station, by source. */
function chainStationDate(chain: DraftChain): string | null | undefined {
  switch (chain.station) {
    case 'begutachtung':
      // A chain belongs to a closed draft, and a closed Begutachtung is
      // never marked (`begutachtungNewLabel`).
      return null
    case 'rv':
      return chain.rvDate
    case 'parlament':
      return chain.decidedAt
    case 'bgbl':
      return chain.bgblDate
  }
}

/** What the homepage's outcome rows say about a draft — `ClosedOutcome`'s own half. */
type OutcomeFacts = Pick<ClosedOutcome, 'rvCitation' | 'bgblNumber' | 'rvDate' | 'bgblDate'>

/**
 * The mark on a Ministerialentwurf row, from the same three sources its
 * state is read from: the running Frist, the homepage's outcome, the chain.
 * An outcome without dates — the ranked section reads none — carries no
 * mark, which is what absent means there: not read.
 */
function draftNewLabel(draft: DraftSummary, outcome?: OutcomeFacts | null): string | null {
  if (draft.active) return begutachtungNewLabel(draft.arrivedAt, true)
  if (outcome) {
    if (outcome.bgblNumber) return stationNewLabel('bgbl', outcome.bgblDate)
    return outcome.rvCitation ? stationNewLabel('rv', outcome.rvDate) : null
  }
  return draft.chain ? stationNewLabel(draft.chain.station, chainStationDate(draft.chain)) : null
}

/* ------------------------------------------------------------------ *
 * The three adapters
 * ------------------------------------------------------------------ */

/**
 * Ministerialentwurf — with or without a station that was read.
 *
 * `outcome` is the homepage's route: there the rows come from
 * `/api/dashboard` and their outcome from a second, more expensive endpoint
 * that is allowed to be missing. Missing on a closed row, the column says
 * „Begutachtung abgeschlossen" — the last state we can EVIDENCE — and not
 * „bisher keine Regierungsvorlage", which would be a claim we never checked.
 */
export function viewOfDraft(
  draft: DraftSummary,
  outcome?: OutcomeFacts | null,
): EntryView {
  const state = draft.active
    ? openState(draft.deadline, true)
    : outcome
      ? outcomeState(outcome, draft.deadline)
      : draft.chain
        ? chainState(draft.chain, draft.deadline, todayIso())
        : endedState(draft.deadline, 'Begutachtung abgeschlossen')

  return {
    key: `me-${draft.gp}-${draft.inr}`,
    to: `/entwuerfe/${draft.gp}/${draft.inr}`,
    href: null,
    title: draft.title,
    titleFull: draft.title,
    kindLabel: 'Ministerialentwurf',
    citation: draft.citation,
    ministry: { code: draft.ministryCode, name: draft.ministryName },
    coMinistries: draft.coMinistries,
    alias: aliasesFor(draft.gp, draft.inr)[0] ?? null,
    /* The Antrag route is named in zone 2, because zone 4 then reads like
     * the Vorlage route („Kundgemacht") and the station is OUR inference —
     * matched by wording, not read off a pointer (`antragPath.ts`). A
     * procedural fact beside the citation, like „ohne Begutachtung". */
    note:
      !draft.active && draft.chain?.antragCitation
        ? `als Initiativantrag ${draft.chain.antragCitation}`
        : openFristNote(draft.arrivedAt, draft.deadline, draft.active),
    newLabel: draftNewLabel(draft, outcome),
    participation: { kind: 'count', count: draft.statementCount },
    state,
  }
}

/** The homepage's two accountability sections ship rows of this shape. */
export function viewOfOutcome(outcome: ClosedOutcome): EntryView {
  return viewOfDraft(outcome, outcome)
}

/**
 * Verordnungsentwurf and the other records without a Gegenstand at
 * Parliament.
 *
 * Two absences, both permanent and both named here instead of left empty:
 *
 *  - **Zone 3 says „ans Ministerium"**, never a number. Until 18.09.2026 the
 *    row said „Stellungnahmen nicht veröffentlicht", which reads beside a
 *    running Frist as „noch nicht" — as if what will never appear were yet to
 *    come. „ans Ministerium" is habitually true instead, the same in both
 *    states, tells a submitter where her Stellungnahme goes, and contains NO
 *    digit: the eye scanning the number column skips the row, which is
 *    exactly right — it does not take part in that comparison.
 *  - **Zone 4 ends with the Begutachtung.** Without a Gegenstand at
 *    Parliament there is no Regierungsvorlage, and „Begutachtung
 *    abgeschlossen" is the TRUE terminus here, not a missing one. It reads
 *    the same on ~200 rows of the corpus, which on its own would be
 *    decoration; but in the list those rows stand between drafts that say
 *    something else, and the empty cell would be the one variant read as a
 *    defect.
 */
export function viewOfRis(c: RisConsultation): EntryView {
  return {
    key: `ris-${c.id}`,
    to: `/entwuerfe/${c.id}`,
    href: null,
    title: c.title,
    titleFull: c.longTitle ?? c.title,
    kindLabel: RIS_KIND_LABEL[c.kind],
    citation: null,
    ministry: c.ministryCode ? { code: c.ministryCode, name: c.ministryName ?? c.ministryCode } : null,
    // One record, one Stelle: RIS has no joint Begutachtung.
    coMinistries: [],
    alias: null,
    note: openFristNote(c.startedAt, c.deadline, c.active),
    // Its two events: the Begutachtung, and — the one later station such a
    // record can reach — the Kundmachung, dated by RIS's Ausgabedatum.
    newLabel: c.active
      ? begutachtungNewLabel(c.startedAt, true)
      : c.outcome?.state === 'kundgemacht' && c.outcome.nummer
        ? stationNewLabel('bgbl', c.outcome.datum)
        : null,
    participation: { kind: 'unpublished' },
    /**
     * Zone 4 no longer necessarily ends with the Begutachtung.
     *
     * Until 19.09.2026 every closed row said „Begutachtung abgeschlossen",
     * on the reasoning that without a Gegenstand at Parliament that is the
     * true terminus. True, as long as nobody read the Bundesgesetzblatt. The
     * Kundmachung exists now (docs/architecture.md §12.32), so the same rule
     * holds for these rows as for the Ministerialentwürfe beside them:
     * station reached on top, Fundstelle beneath.
     *
     * ONLY an evidenced outcome moves here. `ausstehend` and `keine` stay
     * „Begutachtung abgeschlossen": a column writing „bisher nicht
     * kundgemacht" over two thirds of the corpus would be an accusation in
     * series — and at a 84,2 % hit rate a wrong one in every twelfth case.
     * What we did NOT find is said by the detail page in a whole sentence,
     * not by the column in two words.
     */
    state: c.active
      ? openState(c.deadline, true)
      : c.outcome?.state === 'kundgemacht' && c.outcome.nummer
        ? { label: 'Kundgemacht', detail: c.outcome.nummer, tone: 'inactive', actionable: false }
        : endedState(c.deadline, 'Begutachtung abgeschlossen'),
  }
}

/**
 * A Regierungsvorlage that never had a Begutachtung.
 *
 * No Ressort in the data, and no Frist by nature — the window closes with the
 * vote. The missing Frist is therefore not a hole but a different state, and
 * zone 4 states it: „Stellungnahme möglich" above the date of the Einlangen.
 *
 * Two targets, as before: a Vorlage out of a Begutachtung points at our own
 * page, one without has none here and points at Parliament — named as a fact
 * of the procedure, never as an accusation (framing rule).
 *
 * The note hangs on the evidence, NOT on the target: „ohne Begutachtung"
 * appears only on `none`, i.e. when the cross-check against list 81 also
 * found no preceding draft. On `unknown` — no pointer, but a plausible draft
 * — the row links outwards just the same and says nothing about it. Until
 * 18.09.2026 both were one row and the missing pointer alone carried the
 * sentence (`OpenVorlage` in `shared/types/dashboard.ts`).
 */
export function viewOfVorlage(v: OpenVorlage): EntryView {
  const c = v.consultation
  return {
    key: `rv-${v.citation}`,
    to: c.kind === 'draft' ? `/entwuerfe/${c.gp}/${c.inr}` : null,
    href: c.kind === 'draft' ? null : v.parliamentUrl,
    title: v.title,
    titleFull: v.title,
    kindLabel: 'Regierungsvorlage',
    citation: v.citation,
    ministry: null,
    coMinistries: [],
    alias: null,
    note: c.kind === 'none' ? 'ohne Begutachtung' : null,
    // „Neu: Regierungsvorlage" although zone 2 already says
    // „Regierungsvorlage": the chip names the station, the kind label the
    // document, and the rule has no exception (`stationNewLabel`).
    newLabel: stationNewLabel('rv', v.date || null),
    participation:
      v.statementCount === null ? { kind: 'unavailable' } : { kind: 'count', count: v.statementCount },
    state: openVorlageState(v.date || null),
  }
}

/**
 * A row of the merged lists (`draftRows`), through the adapter of its kind.
 *
 * The one dispatch over the three kinds; the pages and the full-text search
 * each wrote it themselves until 03.10.2026.
 */
export function viewOfRow(row: DraftListRow): EntryView {
  if (row.kind === 'me') return viewOfDraft(row.draft)
  if (row.kind === 'ris') return viewOfRis(row.item)
  return viewOfVorlage(row.vorlage)
}
