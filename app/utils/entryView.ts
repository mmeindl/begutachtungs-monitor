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
  DraftSummary,
  OpenVorlage,
  RisConsultation,
} from '../../shared/types'
import { aliasesFor } from '../../shared/utils/draftAliases'
import { type DeadlineTone, deadlineTone, isNewArrival } from './deadlines'
import { bgblShort, formatDateDe, formatDateWeekdayDe, fristEndedDe, fristLabel } from '../../shared/utils/format'
import { RIS_KIND_LABEL } from '../../shared/utils/risConsultations'

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
  ministry: { code: string; name: string } | null
  /** Zone 2, last token — the debate name, quoted, ink. */
  alias: string | null
  /** A procedural fact that belongs to the identity, e.g. „ohne Begutachtung". */
  note: string | null
  isNew: boolean
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
 * What became of a Ministerialentwurf — from the station card (`DraftChain`)
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
 * Regierungsvorlage" a state and not a verdict (framing rule, CLAUDE.md).
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

/** The chain's state, including the one case where it is still actionable. */
function chainState(chain: DraftChain, deadline: string | null): EntryState {
  if (chain.filingOpen) return openVorlageState(chain.rvDate)
  if (chain.station === 'parlament') {
    return { label: 'Im Parlament behandelt', detail: chain.rvCitation, tone: 'inactive', actionable: false }
  }
  return outcomeState(chain, deadline)
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
  outcome?: { rvCitation: string | null; bgblNumber: string | null } | null,
): EntryView {
  const state = draft.active
    ? openState(draft.deadline, true)
    : outcome
      ? outcomeState(outcome, draft.deadline)
      : draft.chain
        ? chainState(draft.chain, draft.deadline)
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
    alias: aliasesFor(draft.gp, draft.inr)[0] ?? null,
    note: null,
    isNew: isNewArrival(draft.arrivedAt, draft.active),
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
    alias: null,
    note: null,
    isNew: isNewArrival(c.startedAt, c.active),
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
    alias: null,
    note: c.kind === 'none' ? 'ohne Begutachtung' : null,
    isNew: false,
    participation:
      v.statementCount === null ? { kind: 'unavailable' } : { kind: 'count', count: v.statementCount },
    state: openVorlageState(v.date || null),
  }
}
