/**
 * The ProcedureCard's EU fact, as words (docs/architecture.md §12.66).
 *
 * TWO DATES, NO VERDICT (rule D6). The line states the transposition
 * deadline and the first day of the Begutachtung, and leaves the arithmetic
 * to the reader: no „verspätet", no count of days, no colour. Whether a
 * ministry was late is a judgement that needs more than two dates — a
 * directive's general deadline is not labelled in EUR-Lex, a draft may be the
 * second step of a transposition — and the site's frame is Nachverfolgung,
 * not a blame counter.
 *
 * Pure: the component (`DraftEuFact.vue`) renders what this returns, and
 * the tests read it without a page.
 */
import type { EuActView, EuMarker, EuRechtResponse } from '#shared/types'
import { formatDateDe, todayIso } from '#shared/utils/format'

/** The lead words in bold. */
const LEAD: Record<EuMarker, string> = {
  umsetzung: 'Setzt EU-Recht um',
  'ueber-umsetzung': 'Setzt EU-Recht um',
  'flankierend-vo': 'Begleitet EU-Verordnungen',
  'flankierend-rl': 'Begleitet eine EU-Richtlinie',
}

/** One act's deadline as the line states it. */
export interface EuDeadlineView {
  /** „der Richtlinie (EU) 2024/1711" — only where the line names several acts; null otherwise. */
  of: string | null
  /** „war" for a date before today, „ist" from today on. */
  verb: 'war' | 'ist'
  date: string
  /** The act's other transposition dates, formatted, for the footnote. */
  otherDates: string[]
  label: string
}

export interface EuFactView {
  lead: string
  /**
   * How the acts attach to the lead: `colon` where they are what the lead
   * says („Setzt EU-Recht um: Richtlinie …"), `named` where the law text names
   * acts of another kind than the lead („Begleitet EU-Verordnungen. Im
   * Gesetzestext genannt: Richtlinie 2009/43/EG") — the Vorblatt and the law
   * text are each quoted for what they say, neither bent to the other.
   */
  attach: 'colon' | 'named' | 'none'
  /** „Gesetzestext" or „Titel" — for the `named` form. */
  namedIn: string | null
  acts: { label: string; url: string }[]
  /** The Vorblatt's own sentence, for `ueber-umsetzung` only. */
  quote: string | null
  deadlines: EuDeadlineView[]
  /** The first day of the Begutachtung, formatted; null without deadlines or without a date. */
  start: string | null
  /** „Vorblatt und Gesetzestext aus dem RIS, Fristen aus EUR-Lex". */
  sourceLine: string
}

/** Whether the act's kind is what the lead says. */
function fits(marker: EuMarker, act: EuActView): boolean {
  if (marker === 'flankierend-vo') return act.kind === 'verordnung'
  if (marker === 'flankierend-rl') return act.kind === 'richtlinie'
  return act.kind === 'richtlinie' || act.kind === 'rahmenbeschluss'
}

/** The acts whose deadline the line prints: new to the draft, not a base text, with a date (D3, D4). */
export function deadlineActs(acts: readonly EuActView[]): EuActView[] {
  return acts.filter((a) => a.isNew === true && !a.base && a.transposition !== null)
}

/** The fact as words, or null where the card shows none. */
export function euFactView(r: EuRechtResponse | null | undefined, today: string = todayIso()): EuFactView | null {
  if (!r?.available || !r.marker) return null
  const acts = r.acts
  const attach = acts.length === 0 ? 'none' : acts.some((a) => fits(r.marker!, a)) ? 'colon' : 'named'
  const due = deadlineActs(acts)
  const deadlines = due.map((a): EuDeadlineView => ({
    of: acts.length > 1 ? `der ${a.label}` : null,
    verb: a.transposition!.deadline < today ? 'war' : 'ist',
    date: formatDateDe(a.transposition!.deadline),
    otherDates: a.transposition!.otherDates.map(formatDateDe),
    label: a.label,
  }))
  const read = r.markerSource === 'erlaeuterungen'
    ? 'Erläuterungen'
    : r.actsSource === 'gesetzestext'
      ? 'Vorblatt und Gesetzestext'
      : r.actsSource === 'titel'
        ? 'Vorblatt und Titel'
        : 'Vorblatt'
  return {
    lead: LEAD[r.marker],
    attach,
    namedIn: r.actsSource === 'titel' ? 'Titel' : 'Gesetzestext',
    acts: acts.map((a) => ({ label: a.label, url: a.eurLexUrl })),
    quote: r.marker === 'ueber-umsetzung' ? r.vorblattSentence : null,
    deadlines,
    start: deadlines.length && r.begutachtungStart ? formatDateDe(r.begutachtungStart) : null,
    sourceLine: `${read} aus dem RIS${deadlines.length ? ', Fristen aus EUR-Lex' : ''}`,
  }
}
