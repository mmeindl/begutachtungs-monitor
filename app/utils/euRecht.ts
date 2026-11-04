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
import { eurLexSource, risSource, type SourceEntry } from '#shared/utils/provenance'

/** The lead words in bold. */
const LEAD: Record<EuMarker, string> = {
  umsetzung: 'Setzt EU-Recht um',
  'ueber-umsetzung': 'Setzt EU-Recht um',
  'flankierend-vo': 'Begleitet EU-Verordnungen',
  'flankierend-rl': 'Begleitet eine EU-Richtlinie',
}

/** Where the acts were named, for „… genannt:" — a Land's EU statement names them too (§12.66, Nachtrag 2). */
const NAMED_IN: Record<NonNullable<EuRechtResponse['actsSource']>, string> = {
  gesetzestext: 'Im Gesetzestext',
  titel: 'Im Titel',
  vorblatt: 'Im Vorblatt',
  erlaeuterungen: 'In den Erläuterungen',
}

/** One act's deadline as the row states it. */
export interface EuDeadlineView {
  /** „2024/1711" — the act's number, only where the row carries several deadlines; null otherwise. */
  of: string | null
  date: string
  /** The same day, ISO — for placing it on the track. */
  iso: string
  /** The act's other transposition dates, formatted, for the footnote. */
  otherDates: string[]
  /**
   * The footnote's number. Where the fact carries deadlines on several days,
   * every day has one and the note names its directive — the bar lists
   * dates, the sentence lists acts, and nothing else joins them (04.11.2026,
   * a Land draft with four directives: „no clue why there are so many and
   * for what"). Two directives due on one day share the number. Where there
   * is one day, only a directive with further partial deadlines has a note.
   */
  note: number | null
  label: string
}

/** One footnote under the fact: its number and its text, without the full stop. */
export interface EuNoteView {
  number: number
  text: string
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
  /** „Im Gesetzestext", „Im Titel", „Im Vorblatt", „In den Erläuterungen" — for the `named` form. */
  namedIn: string | null
  acts: { label: string; url: string }[]
  /** The Vorblatt's own sentence, for `ueber-umsetzung` only. */
  quote: string | null
  /** „beschlossen am 11.04.2024" — the one act whose deadline the row prints, where the Cellar has its day; null otherwise. */
  adoptedNote: string | null
  deadlines: EuDeadlineView[]
  /** The footnotes, in the order of their numbers (`EuDeadlineView.note`). */
  notes: EuNoteView[]
  /** The first day of the Begutachtung, formatted; null without deadlines or without a date. */
  start: string | null
  /** What the fact read and from whom, for the credit line under the card (`SectionCredits`). */
  sources: SourceEntry[]
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
  // One note per day where there are several days; else one for further dates.
  const days = [...new Set(due.map((a) => a.transposition!.deadline))]
  const noteOf = (a: EuActView): number | null => (days.length > 1
    ? days.indexOf(a.transposition!.deadline) + 1
    : a.transposition!.otherDates.length ? 1 : null)
  const deadlines = due.map((a): EuDeadlineView => ({
    of: due.length > 1 ? numberOf(a.label) : null,
    date: formatDateDe(a.transposition!.deadline),
    iso: a.transposition!.deadline,
    otherDates: a.transposition!.otherDates.map(formatDateDe),
    note: noteOf(a),
    label: a.label,
  }))
  const notes: EuNoteView[] = [...new Set(deadlines.map((d) => d.note).filter((n): n is number => n !== null))].map((number) => {
    const own = deadlines.filter((d) => d.note === number)
    const further = own.filter((d) => d.otherDates.length).map((d) => `weitere Fristen für einzelne Bestimmungen${own.length > 1 ? ` (${numberOf(d.label)})` : ''}: ${d.otherDates.join(', ')}`)
    const text = days.length > 1 ? [own.map((d) => d.label).join(' und '), ...further].join('; ') : further.join('; ')
    return { number, text: text.charAt(0).toUpperCase() + text.slice(1) }
  })
  const read = r.markerSource === 'erlaeuterungen'
    ? ['Erläuterungen']
    : r.actsSource === 'gesetzestext'
      ? ['Vorblatt', 'Gesetzestext']
      : r.actsSource === 'titel'
        ? ['Vorblatt', 'Titel']
        : ['Vorblatt']
  return {
    lead: LEAD[r.marker],
    attach,
    namedIn: NAMED_IN[r.actsSource ?? 'gesetzestext'],
    acts: acts.map((a) => ({ label: a.label, url: a.eurLexUrl })),
    quote: r.marker === 'ueber-umsetzung' ? r.vorblattSentence : null,
    adoptedNote: due.length === 1 && acts.length === 1 && due[0]!.adopted ? `beschlossen am ${formatDateDe(due[0]!.adopted)}` : null,
    deadlines,
    notes,
    start: deadlines.length && r.begutachtungStart ? formatDateDe(r.begutachtungStart) : null,
    sources: [...read.map(risSource), ...(deadlines.length ? [eurLexSource('Fristen')] : [])],
  }
}

/** What the page knows about its own side of the timeline. */
export interface EuTimelineContext {
  begutachtung: { start: string | null | undefined; end: string | null | undefined }
  /** Where the procedure stands: today while it runs, the Kundmachung once it is over. */
  stand: { date: string; label: string }
}

/** One label under the track, as `ScaleBar` places it: the term over the dates. */
export interface EuTimelineMark {
  key: string
  /** Percent of the track. */
  at: number
  align: 'start' | 'center' | 'end'
  /** A tick across the line — every Umsetzungsfrist; the Begutachtung is the band and has none. */
  tick: boolean
  lines: [string, string]
}

/** The EU timeline, as positions on a track (percent) with their labels. */
export interface EuTimelineView {
  /** The dot: where the procedure stands. */
  value: number
  valueLabel: string
  /** The Begutachtung, as the band behind the line. */
  band: [number, number] | null
  marks: EuTimelineMark[]
}

const SUPERSCRIPT = ['', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']
const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000
/** Umsetzungsfristen closer than this share one label — three weeks on a year-long track are 30 px (32/ME). */
const CLUSTER = 12
/** Two labels closer than this are aligned away from each other instead of over each other. */
const APART = 14
/**
 * A label's width in percent of the track, from its longest line: about one
 * percent per character at the card's width on a desktop. Needed since the
 * Länder (04.11.2026): a cluster of three dates „15.11.2024, 07.06.2026,
 * 19.06.2026" ran into the Begutachtung's label although the marks stood
 * 14 % apart. The Frist bar's two labels never meet; this bar's three can.
 */
const CHAR_PCT = 1.1

/** Where a label's text lies on the track, in percent, by its alignment. */
function extent(m: EuTimelineMark): [number, number] {
  const w = Math.max(m.lines[0].length, m.lines[1].length) * CHAR_PCT
  return m.align === 'start' ? [m.at, m.at + w] : m.align === 'end' ? [m.at - w, m.at] : [m.at - w / 2, m.at + w / 2]
}

/** Whether two labels' texts would meet, a percent of air between them. */
function overlap(left: EuTimelineMark, right: EuTimelineMark): boolean {
  return extent(left)[1] + 1 > extent(right)[0]
}

/** „21.10.–10.11.2026", both dates in full across a year. */
export function dateRangeDe(start: string, end: string | null | undefined): string {
  const a = formatDateDe(start)
  if (!end) return a
  const b = formatDateDe(end)
  return a.slice(-4) === b.slice(-4) ? `${a.slice(0, 6)}–${b}` : `${a}–${b}`
}

/**
 * The dates that matter, on one track (04.11.2026): each Umsetzungsfrist a
 * tick with its label under it, the Begutachtung the band with its label
 * under its middle, the dot where the procedure stands with its word over
 * it — the Frist bar's grammar, term over value. The track runs from the
 * earliest of those dates to the latest, no further; a first version began
 * at the directive's adoption, and on a two-year window the three-week
 * Begutachtung vanished under the dot. The reader sees on which side of the
 * deadline the draft came and how far from it; nobody wrote a verdict (D6).
 *
 * Two rules keep the labels apart, because the deadline and the
 * Begutachtung are often days apart (that is the finding): Umsetzungsfristen
 * closer than `CLUSTER` share one label, and two labels closer than `APART`
 * or wider than their distance (`CHAR_PCT`) are aligned away from each other. A label near either edge is aligned
 * inward, as on the Frist bar, and the Begutachtung's label is anchored at
 * the band's end where the band lies in the right half, at its start in
 * the left half — so it ends with the band, not short of it. No margin at
 * the ends: the first and last dates sit on the track's ends, as the Frist
 * bar's do (a 4 % margin stood here for an hour and read as empty line).
 *
 * Null where there is nothing to draw: no act with a deadline, or every
 * date on one day.
 */
export function euTimeline(fact: EuFactView | null | undefined, ctx: EuTimelineContext): EuTimelineView | null {
  const due = fact?.deadlines ?? []
  if (!due.length) return null
  const { start, end } = ctx.begutachtung
  const days = [ctx.stand.date, ...due.map((d) => d.iso), start, end].filter((d): d is string => !!d).map(dayOf)
  const first = Math.min(...days)
  const span = Math.max(...days) - first
  if (!(span > 0)) return null
  const at = (iso: string) => ((dayOf(iso) - first) / span) * 100
  const edge = (pos: number): EuTimelineMark['align'] => (pos < 8 ? 'start' : pos > 92 ? 'end' : 'center')
  const dated = (d: EuDeadlineView) => `${d.date}${d.note ? SUPERSCRIPT[d.note] ?? `(${d.note})` : ''}`

  // The deadlines, clustered where they would overlap, in date order.
  const sorted = [...due].sort((a, b) => a.iso.localeCompare(b.iso))
  const clusters: EuDeadlineView[][] = []
  for (const d of sorted) {
    const last = clusters.at(-1)
    if (last && at(d.iso) - at(last[0]!.iso) < CLUSTER) last.push(d)
    else clusters.push([d])
  }
  // Labels and ticks are separate marks: a label may be pushed aside to
  // clear its neighbour, a tick never moves off its date.
  const marks: EuTimelineMark[] = clusters.map((c) => {
    const pos = c.reduce((sum, d) => sum + at(d.iso), 0) / c.length
    return {
      key: `frist-${c[0]!.iso}`,
      at: pos,
      align: edge(pos),
      tick: false,
      // Two directives with one date (2024/1499 and 2024/1500: 19.06.2026) are one date in the label; each keeps its tick.
      lines: [c.length > 1 ? 'Umsetzungsfristen' : 'Umsetzungsfrist', [...new Set(c.map(dated))].join(', ')],
    }
  })
  const band: [number, number] | null = start ? [at(start), at(end ?? start)] : null
  if (band && start) {
    const centre = (band[0] + band[1]) / 2
    const [pos, align]: [number, EuTimelineMark['align']] = centre > 60 ? [band[1], 'end'] : centre < 40 ? [band[0], 'start'] : [centre, 'center']
    marks.push({ key: 'begutachtung', at: pos, align, tick: false, lines: ['Begutachtung', dateRangeDe(start, end)] })
  }
  marks.sort((a, b) => a.at - b.at)
  for (let i = 1; i < marks.length; i++) {
    const left = marks[i - 1]!
    const right = marks[i]!
    if (right.at - left.at >= APART && !overlap(left, right)) continue
    if (left.align === 'start' && left.at < 8) {
      // The left one is pinned to the track's start: the right one begins past it, and past its text.
      right.align = 'start'
      right.at = Math.max(right.at, left.at + APART, extent(left)[1] + 1)
    } else if (right.align === 'end' && right.at > 92) {
      // The right one is pinned to the track's end: the left one ends before it, and before its text.
      left.align = 'end'
      left.at = Math.min(left.at, right.at - APART, extent(right)[0] - 1)
    } else {
      if (left.align !== 'start') left.align = 'end'
      if (right.align !== 'end') right.align = 'start'
    }
  }
  // Every Umsetzungsfrist keeps its own tick on its own date, clustered or not.
  const ticks: EuTimelineMark[] = sorted.map((d) => ({ key: `tick-${d.iso}`, at: at(d.iso), align: 'center', tick: true, lines: ['', ''] }))
  return {
    value: at(ctx.stand.date),
    valueLabel: ctx.stand.label,
    band,
    marks: [...marks, ...ticks],
  }
}
