import type { DraftSummary } from './drafts'

export interface DashboardPayload {
  /** The Gesetzgebungsperiode that is RUNNING — what `open` is a list of. */
  gp: string
  /** Drafts whose Frist is still running, soonest deadline first */
  open: DraftSummary[]
  ranked: RankedByStatements
}

/**
 * „Wo am meisten mitgeredet wurde", and the period it speaks about.
 *
 * The period is carried rather than assumed to be `DashboardPayload.gp`,
 * because during a Periodenwechsel it is not (§12.35): a period too young to
 * be ranked hands the section to the one before it, and the page has to name
 * which one it is showing. The three fields travel together for the same
 * reason — rows, their period and the size of the set behind the section's
 * link are one statement, and `gp` plus a loose `topByStatements` plus a
 * `stats.consultationsTotalGp` (what stood here until 25.09.2026) let two of
 * the three come from different periods without anything breaking loudly.
 */
export interface RankedByStatements {
  gp: string
  /** Top 5 of that period by statement count, descending */
  items: DraftSummary[]
  /** Ministerialentwürfe of that period — the set behind the „Alle …" link */
  total: number
}

/** One recently closed draft with its resolved chain state.
 *  Extends the summary so the SAME row component (`EntryItem`) renders both
 *  the open list and the outcome section — one anatomy, one hover, no
 *  sibling component drift. */
export interface ClosedOutcome extends DraftSummary {
  /** e.g. "474 d.B." — null while no Regierungsvorlage exists */
  rvCitation: string | null
  /** e.g. "Bundesgesetzblatt I Nr. 37/2026" — null while not enacted */
  bgblNumber: string | null
}

/**
 * Payload of /api/dashboard/outcomes — what became of the drafts the volume
 * ranking shows (`DashboardPayload.ranked`).
 */
export interface DashboardOutcomes {
  /**
   * CLOSED ROWS ONLY, and a row whose Gegenstand could not be read is left
   * out rather than reported as "bisher keine Regierungsvorlage": an
   * unresolved outcome and a missing Regierungsvorlage are different
   * claims, and only one of them is ours to make. The rows themselves come
   * from `/api/dashboard`, so the section renders with or without this —
   * without it, simply uncharted.
   */
  rankedOutcomes: ClosedOutcome[]
}

/**
 * Payload of /api/dashboard/enacted — "Zuletzt Gesetz geworden".
 *
 * The rows are Ministerialentwürfe again, not Vorlagen: the monitor's object
 * is the Begutachtung, and the row that renders them is the one every other
 * section uses. `bgblNumber` is non-null throughout by construction — a row
 * without a Kundmachung is not in this list.
 */
export interface DashboardEnacted {
  /**
   * The period whose Regierungsvorlagen were scanned — the running one, or,
   * while it has promulgated nothing, the one before it (§12.35).
   *
   * NOT the period of the rows: a Vorlage may carry a Ministerialentwurf
   * from the period before it, and regularly does around a Wechsel. This is
   * what the section's subline may claim, and nothing more.
   */
  gp: string
  /** Newest promulgation first; empty is a normal state, not an error. */
  items: ClosedOutcome[]
}

/**
 * One Regierungsvorlage that is taking Stellungnahmen right now — the second
 * window for input, which closes with the vote and has no published Frist.
 */
export interface OpenVorlage {
  /** e.g. "594 d.B." */
  citation: string
  title: string
  /** Einlangen im Nationalrat, ISO; '' when upstream has no sortable date. */
  date: string
  /** The Vorlage's page, where the form is. */
  parliamentUrl: string
  /** Stellungnahmen filed on the Vorlage so far; null when the count failed. */
  statementCount: number | null
  /**
   * The Begutachtung this Vorlage came out of — three states, because two are
   * not enough (`docs/begutachtung-uebersprungen.md`).
   *
   * Until 18.09.2026 this was `draft: … | null`, and `null` had to mean two
   * things at once: „we have no page for it" and „there was no Begutachtung".
   * The second was shown, only the first was evidenced — `preconst` is not a
   * universal field, and on GP XXVIII it is missing entirely for 32 of 117
   * Vorlagen (`server/utils/parliament/precedingDraft.ts`).
   *
   *  - `draft` — the Vorlage names its own Ministerialentwurf. The only state
   *    in which a row points at a page of ours.
   *  - `none` — no pointer, AND the cross-check against list 81 finds no
   *    draft that could have preceded it. Only here does the row say „ohne
   *    Begutachtung".
   *  - `unknown` — no pointer, but a plausible draft. The row then says
   *    nothing: a title similarity carries no claim about a Regierungsvorhaben
   *    in either direction.
   *
   * `none` and `unknown` both link outwards; the distinction is only about
   * what is claimed.
   */
  consultation:
    | { kind: 'draft'; gp: string; inr: number }
    | { kind: 'none' }
    | { kind: 'unknown' }
}

export interface DashboardSecondRound {
  /**
   * The period these Vorlagen are from — always the current one, and stated
   * rather than assumed: `/entwuerfe` shows this section under a period
   * filter, and a list narrowed to an earlier GP must not carry rows from
   * this one. Inferring "current" from the newest period in the draft lists
   * would be a second, silently different answer to the same question.
   */
  gp: string
  /** Filing open, most recent first. Empty is a normal state, not an error. */
  items: OpenVorlage[]
}
