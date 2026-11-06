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
import type { EuActView, EuMarker, EuRechtResponse, EuRelatedAct } from '#shared/types'
import { formatDateDe } from '#shared/utils/format'
import { eurLexSource, risSource, type SourceEntry } from '#shared/utils/provenance'

/** The lead words in bold. */
const LEAD: Record<EuMarker, string> = {
  umsetzung: 'Setzt EU-Recht um',
  'ueber-umsetzung': 'Setzt EU-Recht um',
  'flankierend-vo': 'Begleitet EU-Verordnungen',
  'flankierend-rl': 'Begleitet eine EU-Richtlinie',
}

/**
 * The block's heading under the spine, a noun for each marker (06.11.2026):
 * the verb — „setzt EU-Recht um" — stands once, as the Entwurf station's
 * fact (`utils/origin.ts`), and the block names what it lists.
 */
const HEADING: Record<EuMarker, string> = {
  umsetzung: 'Umgesetztes EU-Recht',
  'ueber-umsetzung': 'Umgesetztes EU-Recht',
  'flankierend-vo': 'Begleitete EU-Verordnungen',
  'flankierend-rl': 'Begleitete EU-Richtlinie',
}

/**
 * The fact's lead words for a marker, or null without one — what the
 * list's row says in zone 2 (`EntryView.eu`), so that row and page use
 * the same words for the same fact.
 */
export function euLeadOf(marker: EuMarker | null | undefined): string | null {
  return marker ? LEAD[marker] : null
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
  date: string
  /** The same day, ISO — for placing it on the track. */
  iso: string
  /** The act's other transposition dates, formatted, for the footnote. */
  otherDates: string[]
  /**
   * The footnote's number, for a directive with further partial deadlines
   * only. Until 06.11.2026 every day had one where there were several, the
   * same number at the act in the sentence, to join a date to its act (a
   * Land draft with four directives: „no clue why there are so many and
   * for what"); the act's `number` beside its date does that now, without
   * a trip up to the sentence.
   */
  note: number | null
  label: string
  /** „2023/970" — beside the date where the fact names several acts, so the date says whose it is; null for one act. */
  number: string | null
}

/** One footnote under the fact — only the further partial deadlines of a directive; its number and its text, without the full stop. */
export interface EuNoteView {
  number: number
  text: string
}

export interface EuFactView {
  lead: string
  /**
   * The block's heading: the marker's noun („Umgesetztes EU-Recht"), or —
   * where the law text names acts of another kind than the marker —
   * „Im Gesetzestext genannt" (`attach: 'named'`).
   */
  heading: string
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
  /** The acts, the dated ones first in the order of their deadlines. */
  acts: { label: string; url: string; celex: string; kind: EuActView['kind'] }[]
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
  // The act's number beside its date where the sentence names several acts; a footnote only for further dates.
  const numbered = acts.length > 1
  let footnotes = 0
  const deadlines = due.map((a): EuDeadlineView => ({
    date: formatDateDe(a.transposition!.deadline),
    iso: a.transposition!.deadline,
    otherDates: a.transposition!.otherDates.map(formatDateDe),
    note: a.transposition!.otherDates.length ? ++footnotes : null,
    label: a.label,
    number: numbered ? numberOf(a.label) : null,
  }))
  const notes: EuNoteView[] = deadlines.filter((d) => d.note).map((d) => ({
    number: d.note!,
    text: `Weitere Fristen für einzelne Bestimmungen${d.number ? ` (${d.number})` : ''}: ${d.otherDates.join(', ')}`,
  }))
  const dated = new Set(due.map((a) => a.celex))
  const listed = [...due, ...acts.filter((a) => !dated.has(a.celex))]
  const read = r.markerSource === 'erlaeuterungen'
    ? ['Erläuterungen']
    : r.actsSource === 'gesetzestext'
      ? ['Vorblatt', 'Gesetzestext']
      : r.actsSource === 'titel'
        ? ['Vorblatt', 'Titel']
        : ['Vorblatt']
  return {
    lead: LEAD[r.marker],
    heading: attach === 'named' ? `${NAMED_IN[r.actsSource ?? 'gesetzestext']} genannt` : HEADING[r.marker],
    attach,
    namedIn: NAMED_IN[r.actsSource ?? 'gesetzestext'],
    acts: listed.map((a) => ({ label: a.label, url: a.eurLexUrl, celex: a.celex, kind: a.kind })),
    quote: r.marker === 'ueber-umsetzung' ? r.vorblattSentence : null,
    adoptedNote: due.length === 1 && acts.length === 1 && due[0]!.adopted ? `beschlossen am ${formatDateDe(due[0]!.adopted)}` : null,
    deadlines,
    notes,
    start: deadlines.length && r.begutachtungStart ? formatDateDe(r.begutachtungStart) : null,
    sources: [...read.map(risSource), ...(deadlines.length ? [eurLexSource('Fristen')] : [])],
  }
}

/**
 * The way from a draft's fact to the act's page in the EU map (§12.66,
 * Nachtrag 3): per act that other drafts of the window implement too, how
 * many the Bund and the Länder have beside this one — „1 weiterer Entwurf
 * des Bundes und 3 der Länder", standing at the act it counts for. The act
 * itself is the link (it goes to the same page); the count is the reason
 * to follow it, so it carries no link of its own. Until 06.11.2026 this was
 * a line of its own per act, „Weitere Entwürfe zur …", under the act list:
 * every act named twice, and both links led to the same page.
 *
 * A count of zero is left out, an act without others gets nothing — „0 der
 * Länder" would be a sentence about an absence the map cannot vouch for (it
 * reads only the Begutachtungen it knows). Drafts are counted, never Länder
 * — „Länder 3" read as three Länder (04.11.2026).
 */
export function euOtherDrafts(related: readonly EuRelatedAct[] | null | undefined): Map<string, string> {
  const counts = new Map<string, string>()
  for (const r of related ?? []) {
    const sides = [r.others.bund > 0 ? [r.others.bund, 'des Bundes'] as const : null, r.others.laender > 0 ? [r.others.laender, 'der Länder'] as const : null]
      .filter((x) => x !== null)
    if (!sides.length) continue
    // The noun agrees with the first count; the second elides it: „2 weitere Entwürfe des Bundes und 1 der Länder".
    const [n, side] = sides[0]!
    const head = `${n} ${n === 1 ? 'weiterer Entwurf' : 'weitere Entwürfe'} ${side}`
    counts.set(r.celex, sides[1] ? `${head} und ${sides[1][0]} ${sides[1][1]}` : head)
  }
  return counts
}

/**
 * The dot's fill by what the stand is — `ScaleBar`'s one rule for the mark:
 * the rail's yellow while the procedure still moves (today, a Beschluss
 * before its Kundmachung), ink once a Gesetzblatt fixed it. One function
 * for the draft's timeline and the act page's rows (04.11.2026): until then
 * the draft's dot was yellow over a Kundmachung too.
 */
export function euDotOf(standLabel: string): 'ink' | 'mark' {
  return standLabel.endsWith('gesetzblatt') ? 'ink' : 'mark'
}

/** What the page knows about its own side of the timeline. */
export interface EuTimelineContext {
  begutachtung: { start: string | null | undefined; end: string | null | undefined }
  /** Where the procedure stands: today while it runs, the Kundmachung once it is over. */
  stand: { date: string; label: string }
}

/**
 * One label at the track, as `EuScaleAxis` places it: the term over its
 * dates, one per line. Tier 1 stands under tier 0, where two labels under
 * one lane would meet however they are aligned — `tier` from `sm`,
 * `narrowTier` below it, where a character takes twice the track.
 */
export interface EuTimelineMark {
  key: string
  /** Percent of the track. */
  at: number
  align: 'start' | 'center' | 'end'
  lines: string[]
  tier?: 0 | 1
  narrowTier?: 0 | 1
}

/**
 * One draft's way on a track it may share with others (`EuTimelineChart`):
 * the Begutachtung the band, the ink line from its start to the dot where
 * the procedure stands, each Umsetzungsfrist a tick across the line — and
 * under the line what is the draft's own, the Begutachtung and the stand,
 * each term over its date.
 */
export interface EuLaneBar {
  /** The Begutachtung; null where it has no start, the line then begins at its end. */
  band: [number, number] | null
  /** Where the ink line begins: the draft's own Begutachtung, never the track's start. */
  from: number
  value: number
  dot: 'ink' | 'mark'
  /** Each Umsetzungsfrist's day, a tick across the line. */
  ticks: number[]
  /** Under the line: the Begutachtung and the stand. */
  marks: EuTimelineMark[]
}

/** One lane: a draft. The act page names and links it; the draft's own page has the one lane and no name. */
export interface EuChartLane {
  key: string
  bar: EuLaneBar
  path?: string
  /** „Bund", „Salzburg" — the lane's first word, as the row's Kennung names it. */
  publisher?: string
  /** The law's name, short where the title gives one (`laneNameOf`), whole. */
  name?: string
  /** The full title, for `title=`. */
  title?: string
}

/**
 * The EU timeline as a chart (06.11.2026): ABOVE THE LINE THE EU, BELOW IT
 * AUSTRIA. The Umsetzungsfristen are labelled over the lanes, each tick
 * across them; each lane carries the draft's Begutachtung and stand under
 * its line. Where a label stands says whose date it is, so the chart needs
 * no key — until then the deadline and the Begutachtung shared the row
 * under the line, the stand's word stood over the dot without its date,
 * and the draft page's ink line ran from a deadline years before the draft
 * existed. No calendar under it: every mark names its own date, and a row
 * of years (the act page's until 06.11.2026) only repeated them.
 */
export interface EuChartView {
  /** Over the lanes: the Umsetzungsfristen, the term over the dates — from `sm`, and below it too without `narrowDeadlines`. */
  deadlines: EuTimelineMark[]
  /** The same laid out for a phone's track, where more of them share a label (`layoutDeadlines`). */
  narrowDeadlines?: EuTimelineMark[]
  lanes: EuChartLane[]
  /** A footnote under the chart, beside the ¹ it explains; null where the page says it elsewhere. */
  footnote: string | null
}

export const SUPERSCRIPT = ['', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']
/** An ISO day as a day number — the timeline's unit. */
export const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000
/**
 * A label's width in percent of the track, from its longest line: about one
 * percent per character at the card's width on a desktop. Needed since the
 * Länder (04.11.2026): a cluster of three dates ran into the Begutachtung's
 * label although the marks stood 14 % apart.
 */
const CHAR_PCT = 1.1
/** The same on a phone (390 px): a track of about 330 px, twice the share per character. */
const NARROW_CHAR_PCT = 2.1

/** Where a label's text lies on the track, in percent, by its alignment. */
function extent(m: EuTimelineMark, charPct = CHAR_PCT): [number, number] {
  const w = Math.max(...m.lines.map((l) => l.length)) * charPct
  return m.align === 'start' ? [m.at, m.at + w] : m.align === 'end' ? [m.at - w, m.at] : [m.at - w / 2, m.at + w / 2]
}

/** Whether two labels' texts would meet, a percent of air between them. */
function overlap(left: EuTimelineMark, right: EuTimelineMark, charPct = CHAR_PCT): boolean {
  return extent(left, charPct)[1] + 1 > extent(right, charPct)[0]
}

/** A label within this distance of either end of the track aligns inward, as on the Frist bar. */
export function edgeAlign(pos: number): EuTimelineMark['align'] {
  return pos < 8 ? 'start' : pos > 92 ? 'end' : 'center'
}

/** A label of `lines` placed at `at`: its text's extent, for testing a placement before taking it. */
function placed(lines: string[], at: number, align: EuTimelineMark['align'], charPct: number): [number, number] {
  return extent({ key: '', at, align, lines }, charPct)
}

/**
 * Where a deadlines label stands: centred on its days' mean where it fits
 * the track, else ending at its last day, else starting at its first,
 * else from the track's start — never off its days, as long as it fits.
 */
function anchorOf(lines: string[], days: number[], charPct: number): Pick<EuTimelineMark, 'at' | 'align'> {
  const mean = days.reduce((a, b) => a + b, 0) / days.length
  const fits = ([a, b]: [number, number]) => a >= 0 && b <= 100
  if (fits(placed(lines, mean, 'center', charPct))) return { at: mean, align: 'center' }
  const last = Math.max(...days)
  if (fits(placed(lines, last, 'end', charPct))) return { at: last, align: 'end' }
  const first = Math.min(...days)
  if (fits(placed(lines, first, 'start', charPct))) return { at: first, align: 'start' }
  return { at: 0, align: 'start' }
}

/**
 * The Umsetzungsfristen over the line, for a track where a character takes
 * `charPct` of it (06.11.2026). Each day its own label first; two
 * neighbours that would meet are aligned away from each other — the left
 * ending at its day, the right starting at its own — and where even that
 * does not part them, they become one label, one line per day, and the
 * row is laid out again. A label never leaves its days: until then
 * `spreadLabels` pushed a label aside to clear its neighbour, and on a
 * draft with eight directives (58/ME) the correction of one pair pushed
 * the next into its neighbour.
 */
function layoutDeadlines(groups: { iso: string; at: number; line: string }[], charPct: number): EuTimelineMark[] {
  let clusters = groups.map((g) => [g])
  for (;;) {
    const marks = clusters.map((c): EuTimelineMark => {
      const lines = [c.length > 1 ? 'Umsetzungsfristen' : 'Umsetzungsfrist', ...c.map((g) => g.line)]
      return { key: `frist-${c[0]!.iso}`, lines, ...anchorOf(lines, c.map((g) => g.at), charPct) }
    })
    let meet = -1
    for (let i = 1; i < marks.length && meet < 0; i++) {
      const [left, right] = [marks[i - 1]!, marks[i]!]
      if (!overlap(left, right, charPct)) continue
      const days = (k: number) => clusters[k]!.map((g) => g.at)
      // A label already turned away from its neighbour — starting at the track's start, ending at its end — stays.
      const away: [EuTimelineMark, EuTimelineMark] = [
        left.align === 'start' ? left : { ...left, at: Math.max(...days(i - 1)), align: 'end' },
        right.align === 'end' ? right : { ...right, at: Math.min(...days(i)), align: 'start' },
      ]
      const inside = extent(away[0], charPct)[0] >= 0 && extent(away[1], charPct)[1] <= 100
      const clear = i < 2 || !overlap(marks[i - 2]!, away[0], charPct)
      if (inside && clear && !overlap(away[0], away[1], charPct)) [marks[i - 1], marks[i]] = away
      else meet = i
    }
    if (meet < 0) return marks
    clusters = [...clusters.slice(0, meet - 1), [...clusters[meet - 1]!, ...clusters[meet]!], ...clusters.slice(meet + 1)]
  }
}

/**
 * Keeps the two labels under a lane apart without moving either off its
 * date: aligned away from each other where that suffices, else the stand a
 * tier lower — the Begutachtung's label stays with its band. The
 * Begutachtung and the Kundmachung are often weeks apart on a track of
 * years; pushed aside, as `spreadLabels` did, the Begutachtung's label
 * stood a fifth of the track left of its band. Decided for both widths,
 * on the alignment the wide one chose: a phone tiers more often.
 */
function tierLabels(begutachtung: EuTimelineMark, stand: EuTimelineMark): void {
  const [left, right] = begutachtung.at <= stand.at ? [begutachtung, stand] : [stand, begutachtung]
  if (overlap(left, right)) {
    const before = [left.align, right.align] as const
    if (left.align === 'center') left.align = 'end'
    if (right.align === 'center') right.align = 'start'
    if (overlap(left, right)) {
      ;[left.align, right.align] = before
      stand.tier = 1
    }
  }
  if (stand.tier || overlap(left, right, NARROW_CHAR_PCT)) stand.narrowTier = 1
}

/** „21.10.–10.11.2026", both dates in full across a year. */
export function dateRangeDe(start: string, end: string | null | undefined): string {
  const a = formatDateDe(start)
  if (!end) return a
  const b = formatDateDe(end)
  return a.slice(-4) === b.slice(-4) ? `${a.slice(0, 6)}–${b}` : `${a}–${b}`
}

/**
 * The Begutachtung's label under its band, „Begutachtung" over its dates:
 * anchored at the band's end where the band lies in the right half, at its
 * start in the left half — so it ends with the band, not short of it —
 * and centred in between.
 */
export function begutachtungMark(band: [number, number], dates: string): EuTimelineMark {
  const centre = (band[0] + band[1]) / 2
  const [pos, align]: [number, EuTimelineMark['align']] = centre > 60 ? [band[1], 'end'] : centre < 40 ? [band[0], 'start'] : [centre, 'center']
  return { key: 'begutachtung', at: pos, align, lines: ['Begutachtung', dates] }
}

/**
 * One draft's lane on a track (`at` places a day on it): band, line, dot,
 * the deadlines' ticks, and under the line the Begutachtung — „ab" where
 * only its start is dated (Salzburg's register), „bis" under the line's
 * start where only its end is (Burgenland), never an invented date — and
 * the stand with its date. The stand's word stood over the dot without a
 * date until 06.11.2026: „Landesgesetzblatt" said what, not when.
 */
export function laneBarOf(
  at: (iso: string) => number,
  begutachtung: EuTimelineContext['begutachtung'],
  stand: EuTimelineContext['stand'],
  deadlines: readonly string[],
): EuLaneBar {
  const { start, end } = begutachtung
  const value = at(stand.date)
  const band: [number, number] | null = start ? [at(start), at(end ?? start)] : null
  const first = start ?? end
  const from = first ? at(first) : value
  const standMark: EuTimelineMark = { key: 'stand', at: value, align: edgeAlign(value), lines: [stand.label, formatDateDe(stand.date)] }
  const marks: EuTimelineMark[] = [standMark]
  if (first) {
    const dates = start ? (end ? dateRangeDe(start, end) : `ab ${formatDateDe(start)}`) : `bis ${formatDateDe(end!)}`
    marks.unshift(begutachtungMark(band ?? [from, from], dates))
    tierLabels(marks[0]!, standMark)
  }
  return { band, from, value, dot: euDotOf(stand.label), ticks: [...new Set(deadlines)].map(at), marks }
}

/**
 * The draft's EU timeline (04.11.2026, as a chart of one lane since
 * 06.11.2026): the act page's chart with the draft as its only lane, so the
 * two pages draw one thing one way. The Umsetzungsfristen over the line,
 * those that would meet under one label (`layoutDeadlines`, once for each
 * width) — one line per day, in the D6 row's idiom: „2023/970 bis 07.06.2026", the act's number
 * where the fact names several acts, so no superscript has to join a date
 * to its act. The track runs from the earliest date to the latest, no
 * further; a first version began at the directive's adoption, and on a
 * two-year window the three-week Begutachtung vanished under the dot. The
 * proportions show how far apart they are; nobody writes it (D6).
 *
 * Null where there is nothing to draw: no act with a deadline, or every
 * date on one day.
 */
export function euTimeline(fact: EuFactView | null | undefined, ctx: EuTimelineContext): EuChartView | null {
  const due = fact?.deadlines ?? []
  if (!due.length) return null
  const { start, end } = ctx.begutachtung
  const days = [ctx.stand.date, ...due.map((d) => d.iso), start, end].filter((d): d is string => !!d).map(dayOf)
  const first = Math.min(...days)
  const span = Math.max(...days) - first
  if (!(span > 0)) return null
  const at = (iso: string) => ((dayOf(iso) - first) / span) * 100

  // One line per day, in date order; two directives due on one day (2024/1499 and 2024/1500: 19.06.2026) are one line.
  const sorted = [...due].sort((a, b) => a.iso.localeCompare(b.iso))
  const groups = [...new Set(sorted.map((d) => d.iso))].map((iso) => {
    const same = sorted.filter((d) => d.iso === iso)
    const notes = same.map((d) => (d.note ? SUPERSCRIPT[d.note] ?? `(${d.note})` : '')).join('')
    const numbers = same.map((d) => d.number).filter((n): n is string => !!n)
    return { iso, at: at(iso), line: `${numbers.length ? `${numbers.join(', ')} bis ` : ''}${same[0]!.date}${notes}` }
  })
  return {
    deadlines: layoutDeadlines(groups, CHAR_PCT),
    narrowDeadlines: layoutDeadlines(groups, NARROW_CHAR_PCT),
    lanes: [{ key: 'draft', bar: laneBarOf(at, ctx.begutachtung, ctx.stand, sorted.map((d) => d.iso)) }],
    // The fact's own footnotes stand under it (`DraftEuFact`).
    footnote: null,
  }
}
