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
import type { EuActHead, EuActDraft, EuActResponse, EuActSummary, EuActsResponse, EuPublisher, EuStand, LandCode } from '#shared/types'
import { euActSubject } from '#shared/utils/eu'
import { formatDateDe } from '#shared/utils/format'
import { LAND_CODES, LAND_NAME, type SourceCode } from '#shared/utils/laender'
import { SUPERSCRIPT, dateRangeDe, dayOf, edgeAlign, type EuTimelineMark } from './euRecht'

/** „Bund" or the Land's name — the list's source chips' words. */
export function publisherDe(p: EuPublisher): string {
  return p === 'bund' ? 'Bund' : LAND_NAME[p]
}

/** „Kärnten, Tirol und Wien". */
function listDe(names: readonly string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
}

/**
 * „1 Entwurf des Bundes · 3 Entwürfe der Länder", each side only where it
 * has any — a zero is no finding the map can vouch for. Drafts are counted,
 * never Länder: „Länder 3 (Burgenland, Salzburg)" stood here for an hour
 * and read as three Länder beside two names (04.11.2026).
 */
export function countsDe(counts: { bund: number; laender: number }): string {
  const n = (k: number) => (k === 1 ? '1 Entwurf' : `${k} Entwürfe`)
  return [counts.bund > 0 ? `${n(counts.bund)} des Bundes` : null, counts.laender > 0 ? `${n(counts.laender)} der Länder` : null]
    .filter((x): x is string => x !== null)
    .join(' · ')
}

/**
 * „wiederholt in 3 Entwürfen des Bundes · 1 Entwurf der Länder" — the
 * counts line of an act only restating drafts name (the overview's fold,
 * `EuActsResponse.restatingOnly`). Drafts, never Länder, as in `countsDe`;
 * the dative after „in".
 */
export function restatingCountsDe(counts: { bund: number; laender: number }): string {
  const n = (k: number) => (k === 1 ? '1 Entwurf' : `${k} Entwürfen`)
  const parts = [counts.bund > 0 ? `${n(counts.bund)} des Bundes` : null, counts.laender > 0 ? `${n(counts.laender)} der Länder` : null]
    .filter((x): x is string => x !== null)
  return parts.length ? `wiederholt in ${parts.join(' · ')}` : ''
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
  /** What the official title says after the name and date, „über den Schutz …" (`euActSubject`); null without a title. */
  subject: string | null
  /** „Umsetzungsfrist bis 07.05.2026", „gilt unmittelbar", or null. */
  deadline: string | null
  /** „1 Entwurf des Bundes · 3 Entwürfe der Länder" (`countsDe`); in the fold „wiederholt in …" (`restatingCountsDe`). */
  counts: string
  /** The Länder with an implementing draft, by name, in display order. */
  lands: string[]
}

function actsRowOf(a: EuActSummary, counts: string): EuActsRowView {
  return {
    key: a.celex,
    label: a.label,
    path: a.path,
    subject: euActSubject(a.title),
    // The short form in a list row: the act page says the rest.
    deadline: a.transposition ? `Umsetzungsfrist bis ${formatDateDe(a.transposition.deadline)}` : a.kind === 'verordnung' ? 'gilt unmittelbar' : null,
    counts,
    lands: a.lands.map((l) => LAND_NAME[l]),
  }
}

/** The overview's rows, in the order the API delivers them. */
export function euActsRows(r: Pick<EuActsResponse, 'acts'>): EuActsRowView[] {
  return r.acts.map((a) => actsRowOf(a, countsDe(a.counts)))
}

/**
 * The fold's rows under the overview — the acts drafts only restate, the
 * same anatomy, the counts as „wiederholt in …" (`restatingCountsDe`).
 */
export function euRestatingRows(r: Pick<EuActsResponse, 'restatingOnly'>): EuActsRowView[] {
  return r.restatingOnly.map((a) => actsRowOf(a, restatingCountsDe(a.counts)))
}

/** „Nur in Umsetzungshinweisen wiederholt (12)" — the fold's heading, the count in brackets as the site's folds have it. */
export function restatingFoldHeading(count: number): string {
  return `Nur in Umsetzungshinweisen wiederholt (${count})`
}

/**
 * The overview's source chips: the Bund, and each Land that implements at
 * least one act of the response, in display order. A Land without an act
 * gets no chip — an absence is no finding (rule D6) — but a Land ticked in
 * the URL keeps its chip, ticked, so the empty list says why it is empty.
 */
export function euSourceChips(acts: readonly Pick<EuActSummary, 'lands'>[], chosen: readonly SourceCode[] = []): SourceCode[] {
  const present = new Set<SourceCode>(acts.flatMap((a) => a.lands))
  return (['bund', ...LAND_CODES] as SourceCode[]).filter((c) => c === 'bund' || present.has(c) || chosen.includes(c))
}

/**
 * The acts the chosen sources implement: one passes where the Bund is
 * chosen and has an implementing draft, or any chosen Land is among its
 * Länder. Nothing chosen is everyone. The rows themselves are untouched.
 */
export function filterEuActs<A extends Pick<EuActSummary, 'counts' | 'lands'>>(acts: readonly A[], chosen: readonly SourceCode[]): A[] {
  if (!chosen.length) return [...acts]
  return acts.filter((a) => (chosen.includes('bund') && a.counts.bund > 0) || a.lands.some((l) => chosen.includes(l)))
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
  /** The Begutachtung; null where it has no start, the line then begins at its end. */
  band: [number, number] | null
  /** Where the ink line begins: the draft's own Begutachtung, not the shared track's start. */
  from: number
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
  /** Null where the draft has no stand or no Begutachtung date: its dates stand as text, without a bar. */
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
  /** What the official title says after the name and date (`euActSubject`) — under the h1; null without a title. */
  subject: string | null
  /** „Entwürfe, die sie umsetzen" — the pronoun by the act's gender: die Richtlinie, die Verordnung, der Beschluss. */
  implementingHeading: string
  eurLexUrl: string
  /** „beschlossen am 11.04.2024", „Umsetzungsfrist bis 07.05.2026¹" — one line, joined by „ · ". */
  head: string[]
  /** „¹ Weitere Fristen für einzelne Bestimmungen: 01.01.2025" — rule D3's footnote; null without further dates. */
  footnote: string | null
  rows: EuDraftRowView[]
  /** The label under the last row: the deadline. Empty where no row has a bar or the act has no deadline. */
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
  // Burgenland dates no start, only the Frist's end: „bis" says that much and no more.
  const begutachtung = start
    ? (end ? `Begutachtung ${dateRangeDe(start, end)}` : `Begutachtung ab ${formatDateDe(start)}`)
    : end ? `Begutachtung bis ${formatDateDe(end)}` : null
  return [kind, begutachtung, standDe(d.stand)].filter((x): x is string => !!x).join(' · ')
}

/** Rows that get a bar: a stand to place the dot, and a Begutachtung date to begin the line at. */
function barred(d: EuActDraft): d is EuActDraft & { stand: EuStand } {
  return d.stand !== null && !!(d.begutachtung.start ?? d.begutachtung.end)
}

/**
 * The act page (`/eu-recht/<kind>/<year>/<number>`).
 *
 * ONE TRACK FOR THE PAGE. It runs from the earliest to the latest of the
 * dates that are drawn — the deadline, and every barred row's Begutachtung
 * and stand — and no further, as the draft's own timeline does: the first
 * and the last date sit on the ends. A row whose Begutachtung has only an
 * end (Burgenland dates no start) is drawn from that end, without a band:
 * an empty row beside drawn ones read as missing data (05.11.2026). A row
 * without a stand (the Bund's station map cold after a restart) or without
 * any Begutachtung date is not drawn and does not stretch the track; its
 * dates stand in its text. Where every drawn date falls on one day there
 * is nothing to scale, and no row gets a bar.
 *
 * ONE LABEL, under the last row: the deadline as on the draft's timeline
 * („Umsetzungsfrist" over its date), the one date every row is read
 * against. The track's ends are not labelled: they are some row's date,
 * which that row's text already says, and as bare dates beside the
 * deadline they read as events of their own (dropped 05.11.2026).
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
          band: d.begutachtung.start ? [at(d.begutachtung.start), at(d.begutachtung.end ?? d.begutachtung.start)] : null,
          from: at((d.begutachtung.start ?? d.begutachtung.end)!),
          value: at(d.stand.date),
          valueLabel: d.stand.label,
          marks: tick,
        }
      : null,
  }))

  const axis: EuTimelineMark[] = scaled && t
    ? [{ key: 'frist', at: at(t.deadline), align: edgeAlign(at(t.deadline)), tick: false, lines: ['Umsetzungsfrist', `${formatDateDe(t.deadline)}${note}`] }]
    : []

  /* A Land the build could not read whole is no Land „without a draft": the
   * incomplete note names it instead (seen on the first real build,
   * 04.11.2026: Steiermark stood in both sentences). */
  const without = r.landsWithout.filter((l) => !r.incomplete.includes(l))

  return {
    title: act.label,
    subject: euActSubject(act.title),
    implementingHeading: `Entwürfe, die ${act.kind === 'beschluss' || act.kind === 'rahmenbeschluss' ? 'ihn' : 'sie'} umsetzen`,
    eurLexUrl: act.eurLexUrl,
    head,
    footnote,
    rows,
    axis,
    restating: r.restating.map((d) => ({ key: d.key, publisher: publisherDe(d.publisher), title: d.title, path: d.path })),
    landsWithout: without.length
      ? `Keine Entwürfe im Fenster der ${r.gp}. GP aus: ${listDe(without.map((l: LandCode) => LAND_NAME[l]))}.`
      : null,
    window: windowNoteDe(r.gp, r.window),
    incomplete: incompleteNoteDe(r.incomplete),
  }
}
