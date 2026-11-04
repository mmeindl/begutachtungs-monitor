/**
 * The EU map's pages as words and positions (docs/architecture.md §12.66,
 * Nachtrag 3): the overview of every act a draft of the window implements
 * (`/eu-recht`) and one act with its drafts, Bund and Länder
 * (`/eu-recht/richtlinie/2024/1069`).
 *
 * TWO DATES AND A STAND PER DRAFT, NO VERDICT (rule D6), as on the draft's
 * own fact: the act's deadline, each draft's Begutachtung, and where its
 * procedure stands — on ONE track for the whole page, so the rows can be
 * compared by eye. No colour on a row, no „verspätet", no count of days:
 * on which side of the deadline a draft came is seen, never said. The
 * timeline's grammar is `euTimeline`'s (`utils/euRecht.ts`): the deadline
 * a tick across the line, the Begutachtung the band, the dot where the
 * procedure stands with its word over it.
 *
 * Pure: the pages render what this returns, the tests read it without one.
 */
import type { EuActHead, EuActDraft, EuActResponse, EuActsResponse, EuPublisher, EuStand, LandCode } from '#shared/types'
import { formatDateDe } from '#shared/utils/format'
import { LAND_NAME } from '#shared/utils/laender'
import { SUPERSCRIPT, dateRangeDe, dayOf, edgeAlign, spreadLabels, type EuTimelineMark } from './euRecht'

/** „Bund" or the Land's name — the list's source chips' words. */
export function publisherDe(p: EuPublisher): string {
  return p === 'bund' ? 'Bund' : LAND_NAME[p]
}

/** „Kärnten, Tirol und Wien". */
function listDe(names: readonly string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
}

/** „Bund 1 · Länder 3", each side only where it has any — a zero is no finding the map can vouch for. */
export function countsDe(counts: { bund: number; laender: number }): string {
  return [counts.bund > 0 ? `Bund ${counts.bund}` : null, counts.laender > 0 ? `Länder ${counts.laender}` : null]
    .filter((x): x is string => x !== null)
    .join(' · ')
}

/**
 * The act's deadline in the words of the draft's fact: „Umsetzungsfrist bis
 * 07.05.2026" for a directive with a Cellar date (the latest, rule D3), „gilt
 * unmittelbar, keine Umsetzungsfrist" for a regulation — the method page's
 * „Verordnungen gelten unmittelbar und haben keine Umsetzungsfrist". Null
 * where neither can be said: a directive without a date, a decision.
 */
function deadlineDe(act: Pick<EuActHead, 'kind' | 'transposition'>): string | null {
  if (act.transposition) return `Umsetzungsfrist bis ${formatDateDe(act.transposition.deadline)}`
  return act.kind === 'verordnung' ? 'gilt unmittelbar, keine Umsetzungsfrist' : null
}

/* ------------------------------------------------------------------ *
 * The overview
 * ------------------------------------------------------------------ */

/** One act in the overview's list. */
export interface EuActsRowView {
  key: string
  label: string
  path: string
  /** „Umsetzungsfrist bis 07.05.2026", „gilt unmittelbar", or null. */
  deadline: string | null
  /** „Bund 1 · Länder 3". */
  counts: string
  /** The Länder with an implementing draft, by name, in display order. */
  lands: string[]
}

/** The overview's rows, in the order the API delivers them. */
export function euActsRows(r: EuActsResponse): EuActsRowView[] {
  return r.acts.map((a) => ({
    key: a.celex,
    label: a.label,
    path: a.path,
    // The short form in a list row: the act page says the rest.
    deadline: a.transposition ? `Umsetzungsfrist bis ${formatDateDe(a.transposition.deadline)}` : a.kind === 'verordnung' ? 'gilt unmittelbar' : null,
    counts: countsDe(a.counts),
    lands: a.lands.map((l) => LAND_NAME[l]),
  }))
}

/**
 * „Gerade nicht abrufbar: Steiermark – Entwürfe von dort können fehlen." —
 * the list's Land notes' register, for the publishers the last build could
 * not read whole. Null where it read everyone.
 */
export function incompleteNoteDe(incomplete: readonly EuPublisher[]): string | null {
  if (!incomplete.length) return null
  return `Gerade nicht abrufbar: ${listDe(incomplete.map(publisherDe))} – Entwürfe von dort können fehlen.`
}

/**
 * What the window is, and that the map reads only the Begutachtungen the
 * monitor knows — so a Land missing from a page is no finding about the
 * Land (it may implement the act without a Begutachtung, or outside the
 * window).
 */
export function windowNoteDe(gp: string, window: { from: string; to: string | null }): string {
  const span = window.to
    ? `zwischen dem ${formatDateDe(window.from)} und dem ${formatDateDe(window.to)}`
    : `seit dem ${formatDateDe(window.from)}`
  return `Gelesen sind die Begutachtungen, die ${span} begonnen haben – das Fenster der ${gp}. Gesetzgebungsperiode –, und nur die, die der Monitor kennt. Dass ein Land hier keinen Entwurf hat, heißt nicht, dass es den Rechtsakt nicht umsetzt.`
}

/* ------------------------------------------------------------------ *
 * One act
 * ------------------------------------------------------------------ */

/** The bar beside one implementing draft, on the page's shared track. */
export interface EuRowBar {
  band: [number, number]
  value: number
  valueLabel: EuStand['label']
  /** The deadline's tick, the same on every row; no label — the axis carries it once. */
  marks: EuTimelineMark[]
}

/** One implementing draft. */
export interface EuDraftRowView {
  key: string
  /** „Bund", „Oberösterreich" — bold, first. */
  publisher: string
  title: string
  path: string
  /** „Gesetzesentwurf 147/ME · Begutachtung 21.10.–10.11.2026 · Beschluss am 12.11.2026". */
  kennung: string
  /** Null where the draft has no stand or no start: its dates stand as text, without a bar. */
  bar: EuRowBar | null
}

/** One draft that only restates the act — muted, publisher and linked title. */
export interface EuRestatingRowView {
  key: string
  publisher: string
  title: string
  path: string
}

export interface EuActPageView {
  title: string
  eurLexUrl: string
  /** „beschlossen am 11.04.2024", „Umsetzungsfrist bis 07.05.2026¹" — one line, joined by „ · ". */
  head: string[]
  /** „¹ Weitere Fristen für einzelne Bestimmungen: 01.01.2025" — rule D3's footnote; null without further dates. */
  footnote: string | null
  rows: EuDraftRowView[]
  /** The labels under the last row: the deadline, and the track's two ends as dates. Empty where no row has a bar. */
  axis: EuTimelineMark[]
  restating: EuRestatingRowView[]
  /** „Keine Entwürfe im Fenster der XXVIII. GP aus: Kärnten und Tirol." — null where every Land has one. */
  landsWithout: string | null
  window: string
  incomplete: string | null
}

const KIND_WORD: Record<EuActDraft['kind'], string> = {
  gesetz: 'Gesetzesentwurf',
  verordnung: 'Verordnungsentwurf',
  unbestimmt: 'Entwurf',
}

/** The stand as text — „Heute" is the dot's word only; the row's text has the Begutachtung for that. */
function standDe(stand: EuStand | null): string | null {
  if (!stand || stand.label === 'Heute') return null
  return `${stand.label} am ${formatDateDe(stand.date)}`
}

function kennungDe(d: EuActDraft): string {
  const kind = d.citation ? `${KIND_WORD[d.kind]} ${d.citation}` : KIND_WORD[d.kind]
  const { start, end } = d.begutachtung
  const begutachtung = start ? (end ? `Begutachtung ${dateRangeDe(start, end)}` : `Begutachtung ab ${formatDateDe(start)}`) : null
  return [kind, begutachtung, standDe(d.stand)].filter((x): x is string => !!x).join(' · ')
}

/** Rows that get a bar: a stand to place the dot, a start to place the band. */
function barred(d: EuActDraft): d is EuActDraft & { stand: EuStand; begutachtung: { start: string } } {
  return d.stand !== null && !!d.begutachtung.start
}

/**
 * The act page (`/eu-recht/<kind>/<year>/<number>`).
 *
 * ONE TRACK FOR THE PAGE. It runs from the earliest to the latest of the
 * dates that are drawn — the deadline, and every barred row's Begutachtung
 * and stand — and no further, as the draft's own timeline does: the first
 * and the last date sit on the ends. A row without a stand (the Bund's
 * station map cold after a restart) or without a start is not drawn and
 * does not stretch the track; its dates stand in its text. Where every
 * drawn date falls on one day there is nothing to scale, and no row gets
 * a bar.
 *
 * The labels stand ONCE, under the last row: the deadline as on the
 * draft's timeline („Umsetzungsfrist" over its date) and the track's two
 * ends as dates; an end that IS the deadline is labelled by it. Each row
 * says its own Begutachtung in its text, so the axis need not. The edge and
 * spacing rules are the timeline's (`edgeAlign`, `spreadLabels`).
 */
export function euActPageView(r: EuActResponse): EuActPageView {
  const act = r.act
  const t = act.transposition
  const note = t?.otherDates.length ? SUPERSCRIPT[1]! : ''
  const deadline = deadlineDe(act)
  const head = [
    act.adopted ? `beschlossen am ${formatDateDe(act.adopted)}` : null,
    deadline ? `${deadline}${t ? note : ''}` : null,
  ].filter((x): x is string => !!x)
  const footnote = t?.otherDates.length
    ? `${SUPERSCRIPT[1]} Weitere Fristen für einzelne Bestimmungen: ${t.otherDates.map(formatDateDe).join(', ')}`
    : null

  const drawn = r.implementing.filter(barred)
  const days = [
    ...(t ? [t.deadline] : []),
    ...drawn.flatMap((d) => [d.begutachtung.start, d.begutachtung.end, d.stand.date]),
  ].filter((d): d is string => !!d).map(dayOf)
  const first = days.length ? Math.min(...days) : 0
  const span = days.length ? Math.max(...days) - first : 0
  const scaled = drawn.length > 0 && span > 0
  const at = (iso: string) => ((dayOf(iso) - first) / span) * 100

  const tick: EuTimelineMark[] = scaled && t ? [{ key: 'tick-frist', at: at(t.deadline), align: 'center', tick: true, lines: ['', ''] }] : []
  const rows = r.implementing.map((d): EuDraftRowView => ({
    key: d.key,
    publisher: publisherDe(d.publisher),
    title: d.title,
    path: d.path,
    kennung: kennungDe(d),
    bar: scaled && barred(d)
      ? {
          band: [at(d.begutachtung.start), at(d.begutachtung.end ?? d.begutachtung.start)],
          value: at(d.stand.date),
          valueLabel: d.stand.label,
          marks: tick,
        }
      : null,
  }))

  const axis: EuTimelineMark[] = []
  if (scaled) {
    const firstIso = new Date(first * 86_400_000).toISOString().slice(0, 10)
    const lastIso = new Date((first + span) * 86_400_000).toISOString().slice(0, 10)
    const deadlineAt = t ? at(t.deadline) : null
    if (t && deadlineAt !== null) {
      axis.push({ key: 'frist', at: deadlineAt, align: edgeAlign(deadlineAt), tick: false, lines: ['Umsetzungsfrist', `${formatDateDe(t.deadline)}${note}`] })
    }
    // The ends as dates — where the deadline is not itself the end.
    if (t?.deadline !== firstIso) axis.push({ key: 'anfang', at: 0, align: 'start', tick: false, lines: ['', formatDateDe(firstIso)] })
    if (t?.deadline !== lastIso) axis.push({ key: 'ende', at: 100, align: 'end', tick: false, lines: ['', formatDateDe(lastIso)] })
    spreadLabels(axis)
  }

  return {
    title: act.label,
    eurLexUrl: act.eurLexUrl,
    head,
    footnote,
    rows,
    axis,
    restating: r.restating.map((d) => ({ key: d.key, publisher: publisherDe(d.publisher), title: d.title, path: d.path })),
    landsWithout: r.landsWithout.length
      ? `Keine Entwürfe im Fenster der ${r.gp}. GP aus: ${listDe(r.landsWithout.map((l: LandCode) => LAND_NAME[l]))}.`
      : null,
    window: windowNoteDe(r.gp, r.window),
    incomplete: incompleteNoteDe(r.incomplete),
  }
}
