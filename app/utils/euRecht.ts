/**
 * The ProcedureCard's EU fact, as words (docs/architecture.md §12.66).
 *
 * TWO DATES, NO VERDICT (rule D6). Under the act list one row in the
 * spine's own idiom — „Umsetzungsfrist bis 07.05.2026 · Begutachtung ab
 * 21.10.2026" — and the arithmetic is left to the reader: no „verspätet",
 * no count of days, no colour, and no tense either, since „bis" and „ab"
 * say which way each date points. Whether a ministry was late is a
 * judgement that needs more than two dates — a directive's general deadline
 * is not labelled in EUR-Lex, a draft may be the second step of a
 * transposition — and the site's frame is Nachverfolgung, not a blame counter.
 *
 * Pure: the component (`DraftEuFact.vue`) renders what this returns, and
 * the tests read it without a page.
 */
import type { EuActView, EuMarker, EuRechtResponse } from '#shared/types'
import { formatDateDe } from '#shared/utils/format'

/** The lead words in bold. */
const LEAD: Record<EuMarker, string> = {
  umsetzung: 'Setzt EU-Recht um',
  'ueber-umsetzung': 'Setzt EU-Recht um',
  'flankierend-vo': 'Begleitet EU-Verordnungen',
  'flankierend-rl': 'Begleitet eine EU-Richtlinie',
}

/** One act's deadline as the row states it. */
export interface EuDeadlineView {
  /** „2024/1711" — the act's number, only where the row carries several deadlines; null otherwise. */
  of: string | null
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
  /** „beschlossen am 11.04.2024" — the one act whose deadline the row prints, where the Cellar has its day; null otherwise. */
  adoptedNote: string | null
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

/** The acts whose deadline the row prints: new to the draft, not a base text, with a date (D3, D4) — in the order of their deadlines, as the ticks stand on the track. */
export function deadlineActs(acts: readonly EuActView[]): EuActView[] {
  return acts
    .filter((a) => a.isNew === true && !a.base && a.transposition !== null)
    .sort((a, b) => a.transposition!.deadline.localeCompare(b.transposition!.deadline))
}

/** „2024/1711" out of „Richtlinie (EU) 2024/1711", „2009/43" out of „Richtlinie 2009/43/EG". */
function numberOf(label: string): string {
  return /\d{2,4}\/\d{1,4}/.exec(label)?.[0] ?? label
}

/** The fact as words, or null where the card shows none. */
export function euFactView(r: EuRechtResponse | null | undefined): EuFactView | null {
  if (!r?.available || !r.marker) return null
  const acts = r.acts
  const attach = acts.length === 0 ? 'none' : acts.some((a) => fits(r.marker!, a)) ? 'colon' : 'named'
  const due = deadlineActs(acts)
  const deadlines = due.map((a): EuDeadlineView => ({
    of: due.length > 1 ? numberOf(a.label) : null,
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
    adoptedNote: due.length === 1 && acts.length === 1 && due[0]!.adopted ? `beschlossen am ${formatDateDe(due[0]!.adopted)}` : null,
    deadlines,
    start: deadlines.length && r.begutachtungStart ? formatDateDe(r.begutachtungStart) : null,
    sourceLine: `${read} aus dem RIS${deadlines.length ? ', Fristen aus EUR-Lex' : ''}`,
  }
}

/** What the page knows about its own side of the timeline. */
export interface EuTimelineContext {
  begutachtung: { start: string | null | undefined; end: string | null | undefined }
  /** Where the procedure stands: today while it runs, the Kundmachung once it is over. */
  stand: { date: string; label: string }
}

/** The EU timeline, as positions on a track (percent). The dated row under it is its legend. */
export interface EuTimelineView {
  /** The dot: where the procedure stands. */
  value: number
  valueLabel: string
  /** The Begutachtung, as the band behind the line. */
  band: [number, number] | null
  /** One tick per Umsetzungsfrist. */
  ticks: { key: string; at: number }[]
}

const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000
/** The track keeps this much of its width free at either end, so no tick sits on an edge. */
const EDGE = 4

/**
 * The dates that matter, on one track (04.11.2026): the Umsetzungsfrist as
 * a tick, the Begutachtung as the band, the dot where the procedure stands.
 * The track runs from the earliest of those to the latest, no further — a
 * first version began at the day the directive was adopted, and on a
 * two-year window the three-week Begutachtung vanished under the dot. The
 * reader sees on which side of the deadline the draft came and how far
 * from it, and nobody wrote a verdict (rule D6). The row of dates under
 * the bar names what the shapes are, in the same order.
 *
 * Null where there is nothing to draw: no act with a deadline, or every
 * date on one day.
 */
export function euTimeline(r: EuRechtResponse | null | undefined, ctx: EuTimelineContext): EuTimelineView | null {
  if (!r?.available || !r.marker) return null
  const due = deadlineActs(r.acts)
  if (!due.length) return null
  const deadlines = [...new Set(due.map((a) => a.transposition!.deadline))].sort()
  const { start, end } = ctx.begutachtung
  const days = [ctx.stand.date, ...deadlines, start, end].filter((d): d is string => !!d).map(dayOf)
  const first = Math.min(...days)
  const span = Math.max(...days) - first
  if (!(span > 0)) return null
  const at = (iso: string) => EDGE + ((dayOf(iso) - first) / span) * (100 - 2 * EDGE)
  return {
    value: at(ctx.stand.date),
    valueLabel: ctx.stand.label,
    band: start ? [at(start), at(end ?? start)] : null,
    ticks: deadlines.map((d) => ({ key: `frist-${d}`, at: at(d) })),
  }
}
