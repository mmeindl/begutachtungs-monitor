/**
 * The EU map's pages as words and positions (docs/architecture.md §12.66,
 * Nachtrag 3): the overview of every act a draft of the window implements
 * (`/eu-recht`) and one act with its drafts, Bund and Länder
 * (`/eu-recht/richtlinie/2024/1069`).
 *
 * TWO DATES AND A STAND PER DRAFT, NO VERDICT (rule D6), as on the draft's
 * own fact: the act's deadline, each draft's Begutachtung, and where its
 * procedure stands — on ONE track for the whole page, a chart above the
 * rows, so the drafts can be compared by eye. No colour on a row, no „verspätet", no count of days:
 * on which side of the deadline a draft came is seen, never said. The
 * timeline's grammar is `euTimeline`'s (`utils/euRecht.ts`): the deadline
 * a tick across the line, the Begutachtung the band, the dot where the
 * procedure stands with its word over it.
 *
 * Pure: the pages render what this returns, the tests read it without one.
 */
import type { EuActHead, EuActDraft, EuActResponse, EuActSummary, EuActsResponse, EuPublisher, EuStand } from '#shared/types'
import { euActSubject } from '#shared/utils/eu'
import { formatDateDe } from '#shared/utils/format'
import { LAND_CODES, LAND_NAME, landShortTitle, type SourceCode } from '#shared/utils/laender'
import { PUBLISHER_NAME_DE, eurLexSource, parliamentProcedureSource, risSource, type SourceEntry } from '#shared/utils/provenance'
import { viewOfRow, type EntryView } from './entryView'
import { SUPERSCRIPT, begutachtungMark, dateRangeDe, dayOf, edgeAlign, type EuTimelineMark } from './euRecht'

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
 * Why a source cannot join the EU map's lists, per Land; absent where it
 * can. The site's chips (`SourceChips`) stand on the map as on every list
 * (06.11.2026) — all of them, a Land without an act unavailable rather than
 * hidden, as `/entwuerfe` draws a Land the chosen station does not reach.
 * The reason speaks of the monitor's map, never of the Land (rule D6: an
 * absence is no finding); a Land the build could not read says so instead.
 */
export function euSourceUnavailable(
  acts: readonly Pick<EuActSummary, 'lands'>[],
  incomplete: readonly EuPublisher[],
): Partial<Record<SourceCode, string>> {
  const present = new Set<SourceCode>(acts.flatMap((a) => a.lands))
  return Object.fromEntries(LAND_CODES.filter((l) => !present.has(l)).map((l) => [
    l,
    incomplete.includes(l) ? 'Gerade nicht abrufbar' : 'Kein Entwurf des Landes setzt einen Rechtsakt um, den der Monitor kennt',
  ]))
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

/* ------------------------------------------------------------------ *
 * One act
 * ------------------------------------------------------------------ */

/** One draft's lane in the act page's chart, on the page's shared track. */
export interface EuRowBar {
  /** The Begutachtung; null where it has no start, the line then begins at its end. */
  band: [number, number] | null
  /** Where the ink line begins: the draft's own Begutachtung, not the shared track's start. */
  from: number
  value: number
  valueLabel: EuStand['label']
  /**
   * The Begutachtung's label under the lane („Begutachtung" over its
   * dates, `begutachtungMark`) and the deadline's tick, the same on every
   * lane — its label stands once, over the chart.
   */
  marks: EuTimelineMark[]
}

/** One lane of the chart: one implementing draft whose dates can be drawn. */
export interface EuChartLane {
  key: string
  path: string
  /** „Bund", „Salzburg" — the lane's first word, as the row's Kennung names it. */
  publisher: string
  /** The law's name, short where the title gives one (`laneNameOf`), whole. */
  name: string
  /** The full title, for `title=`. */
  title: string
  bar: EuRowBar
}

/** A time mark under the chart: the start of a year, a quarter or a month. */
export interface EuAxisTick {
  key: string
  at: number
  label: string
}

/**
 * The act page's chart: every drawable implementing draft as one lane on
 * one track, the deadline's label over it and the calendar under it — the
 * drafts side by side against the one deadline (05.11.2026). Null where
 * nothing can be drawn.
 */
export interface EuActChartView {
  lanes: EuChartLane[]
  /** „Umsetzungsfrist" over its date, at the deadline's x; null for an act without one. */
  deadline: EuTimelineMark | null
  ticks: EuAxisTick[]
  /** The further deadlines' footnote, under the chart beside its ¹; null without them or without a deadline label. */
  footnote: string | null
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
  /** „¹ Weitere Fristen für einzelne Bestimmungen: 01.01.2025" — rule D3's footnote, under the head; null without further dates or where the chart carries it. */
  footnote: string | null
  /** The implementing drafts as the lists render them (`viewOfRow`): one anatomy on every list of drafts. */
  entries: EntryView[]
  /**
   * Each row's two dates and stand in a sentence, by the entry's key — read
   * to a screen reader with its row, since the chart's lanes are hidden from
   * it (one draft heard once, not as lane and row).
   */
  said: Record<string, string>
  chart: EuActChartView | null
  /**
   * The drafts that only restate the act, as the lists render them too
   * (`viewOfRow`, 06.11.2026) — apart under their own heading, without a
   * lane; until then a muted line of publisher and linked title.
   */
  restating: EntryView[]
  /**
   * The one caveat the page says (06.11.2026): what could not be read. Not
   * the Länder without a draft nor the window — an absence is no finding
   * (rule D6), and what the map reads stands under „Methode".
   */
  incomplete: string | null
}

/** The stand as text — „Heute" is the dot's word only; the Begutachtung says that much. */
function standDe(stand: EuStand | null): string | null {
  if (!stand || stand.label === 'Heute') return null
  return `${stand.label} am ${formatDateDe(stand.date)}`
}

/** „Begutachtung 10.10.–07.11.2025 · Bundesgesetzblatt am 27.02.2026" — two dates and a stand, no verdict (D6). */
function saidDe(d: EuActDraft): string {
  const { start, end } = d.begutachtung
  // Burgenland dates no start, only the Frist's end: „bis" says that much and no more.
  const begutachtung = start
    ? (end ? `Begutachtung ${dateRangeDe(start, end)}` : `Begutachtung ab ${formatDateDe(start)}`)
    : end ? `Begutachtung bis ${formatDateDe(end)}` : null
  return [begutachtung, standDe(d.stand)].filter((x): x is string => !!x).join(' · ')
}

/**
 * The name a lane carries — an index into the rows below, so it may be
 * short where the row is whole (`title=` and the row carry the rest):
 *
 * - the short name a title ends with, „… (1. Salzburger Erneuerbaren
 *   Ausbaugesetz)", an ordinal and a stray „;" after it allowed, which the
 *   rows' short title does not take (`landShortTitle`);
 * - else the first law an amending title names, „Gesetz, mit dem das
 *   Salzburger Raumordnungsgesetz 2009 geändert wird";
 * - else the title up to its first „;" — Parliament's collective titles
 *   name the lead law first („Erneuerbaren-Ausbau-Beschleunigungsgesetz –
 *   EABG; Erneuerbaren-Ausbau-Gesetz, Änderung");
 *
 * then without a trailing „, Änderung" and without the abbreviation after
 * a dash („– KKG", „- Oö. GVG 2026"). An „und" after a hyphen joins a
 * name („Kinder- und Jugendhilfegesetz") and does not end it. Measured over
 * the 78 implementing drafts of the map (05.11.2026): median 39 characters;
 * the four longest (111–149) are titles of none of these shapes and wrap.
 * Three Salzburg lanes must be told apart by more than „Salzburg", so the
 * Land alone is never the name.
 */
export function laneNameOf(title: string): string {
  const name = landShortTitle(title) ??
    /\(((?:\d+\.\s*)?\p{Lu}[^()]{3,80})\)\s*;?\s*$/u.exec(title)?.[1] ??
    /mit de[mr] (?:das|die|der) (.+?)(?:,|(?<!-) und | geändert| erlassen| aufgehoben)/.exec(title)?.[1] ??
    title.split(';')[0]!
  const plain = name.trim().replace(/,\s*Änderung$/, '')
  const abbreviated = /^(.+?)\s[–-]\s(\p{Lu}\S*(?:\s\S+){0,2})$/u.exec(plain)
  return abbreviated && abbreviated[2]!.length <= 20 ? abbreviated[1]! : plain
}

/** Drafts that get a lane: a stand to place the dot, and a Begutachtung date to begin the line at. */
function barred(d: EuActDraft): d is EuActDraft & { stand: EuStand } {
  return d.stand !== null && !!(d.begutachtung.start ?? d.begutachtung.end)
}

const MONTH_SHORT = ['Jän.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.']
/** Ticks closer than this keep only the first label, in percent of the track. */
const TICK_GAP = 11
/** A label that starts this close to the right end would run off the track. */
const TICK_LAST = 90

/**
 * The calendar under the chart: the years where the track spans more than
 * a year and a half, the quarters where it spans half a year, the months
 * below — so the marks are never so dense that they crowd, nor so rare
 * that none falls on the track. A label starts at its tick, as a calendar's
 * does; a tick too close to the one before goes without. The year stands at
 * January and at the first tick, so a month never floats without one.
 */
export function axisTicksOf(first: number, span: number): EuAxisTick[] {
  const step = span > 540 ? 12 : span > 180 ? 3 : 1
  const begin = new Date(first * 86_400_000)
  let year = begin.getUTCFullYear()
  let month = begin.getUTCMonth() + 1
  month = Math.ceil(month / step) * step
  const ticks: EuAxisTick[] = []
  for (;;) {
    if (month >= 12) {
      year += Math.floor(month / 12)
      month %= 12
    }
    const day = Date.UTC(year, month, 1) / 86_400_000
    const at = ((day - first) / span) * 100
    if (at > TICK_LAST) break
    const last = ticks.at(-1)
    if (!last || at - last.at >= TICK_GAP) {
      const label = step === 12 ? String(year) : month === 0 || !last ? `${MONTH_SHORT[month]} ${year}` : MONTH_SHORT[month]!
      ticks.push({ key: `${year}-${month}`, at, label })
    }
    month += step
  }
  return ticks
}

/**
 * The act page (`/eu-recht/<kind>/<year>/<number>`).
 *
 * THE ROWS ARE THE LISTS' ROWS (05.11.2026). Each implementing draft
 * renders as on `/entwuerfe` — its Ressort or Land in the Kennung, its
 * Stellungnahmen, its Stand — from the list row the map carries
 * (`viewOfRow`). Until then the page drew a row of its own: the publisher
 * bold over the title, the dates in the Kennung, a bar beside every row and
 * the deadline's label once under the last, which on a long list stood
 * screens away from the ticks it named.
 *
 * THE TIMELINE IS ONE CHART ABOVE THE ROWS. One lane per drawable draft,
 * all on ONE TRACK from the earliest to the latest drawn date — the
 * deadline, every lane's Begutachtung and stand — so the lanes compare by
 * eye; each lane names its own band and dot, the deadline's label stands
 * over the lanes, a calendar under them. A timeline in each row was built
 * and dropped the same night: separated by the rows' text, the drafts no
 * longer compared at a glance, which is what the page is for. A draft whose
 * Begutachtung has only an end (Burgenland dates no start) is drawn from
 * that end, without a band. A draft without a stand (the Bund's station
 * map cold after a restart) or without any Begutachtung date gets no lane
 * and does not stretch the track. Where every drawn date falls on one day
 * there is nothing to scale, and there is no chart.
 *
 * TWO DATES AND A STAND, NO VERDICT (rule D6): on which side of the
 * deadline a lane ends is seen, never said.
 */
export function euActPageView(r: EuActResponse): EuActPageView {
  const act = r.act
  const t = act.transposition
  const note = t?.otherDates.length ? SUPERSCRIPT[1]! : ''
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
  const at = (iso: string) => ((dayOf(iso) - first) / span) * 100

  let chart: EuActChartView | null = null
  if (drawn.length && span > 0) {
    const tick: EuTimelineMark[] = t ? [{ key: 'tick-frist', at: at(t.deadline), align: 'center', tick: true, lines: ['', ''] }] : []
    chart = {
      lanes: drawn.map((d) => {
        const { start, end } = d.begutachtung
        const band: [number, number] | null = start ? [at(start), at(end ?? start)] : null
        const from = at((start ?? end)!)
        return {
          key: d.key,
          path: d.path,
          publisher: publisherDe(d.publisher),
          name: laneNameOf(d.title),
          title: d.title,
          bar: {
            band,
            from,
            value: at(d.stand.date),
            valueLabel: d.stand.label,
            // The Begutachtung named under its band, as on the draft's
            // timeline; „ab" where only its start is dated (Salzburg's
            // register), „bis" under the line's start where only its end is
            // (Burgenland) — never an invented date.
            marks: [
              begutachtungMark(band ?? [from, from], start ? (end ? dateRangeDe(start, end) : `ab ${formatDateDe(start)}`) : `bis ${formatDateDe(end!)}`),
              ...tick,
            ],
          },
        }
      }),
      deadline: t
        ? { key: 'frist', at: at(t.deadline), align: edgeAlign(at(t.deadline)), tick: false, lines: ['Umsetzungsfrist', `${formatDateDe(t.deadline)}${note}`] }
        : null,
      ticks: axisTicksOf(first, span),
      // Under the chart, beside the ¹ it explains — not as a mark: a second
      // tick on every lane would ask which deadline a draft is read against.
      footnote: t ? footnote : null,
    }
  }

  /* The head says the deadline only where the chart does not — no lane to
   * draw (the Bund's stand cold after a restart), or no deadline to label
   * („gilt unmittelbar"). The adoption stays up there: drawn, it would pull
   * the track back years and shrink every Begutachtung to a sliver. */
  const deadline = chart?.deadline ? null : deadlineDe(act)
  const head = [
    act.adopted ? `beschlossen am ${formatDateDe(act.adopted)}` : null,
    deadline ? `${deadline}${t ? note : ''}` : null,
  ].filter((x): x is string => !!x)

  const entries = r.implementing.map((d) => viewOfRow(d.row))

  return {
    title: act.label,
    subject: euActSubject(act.title),
    implementingHeading: `Entwürfe, die ${act.kind === 'beschluss' || act.kind === 'rahmenbeschluss' ? 'ihn' : 'sie'} umsetzen`,
    eurLexUrl: act.eurLexUrl,
    head,
    footnote: chart?.footnote ? null : footnote,
    entries,
    said: Object.fromEntries(entries.map((e, i) => [e.key, saidDe(r.implementing[i]!)])),
    chart,
    restating: r.restating.map((d) => viewOfRow(d.row)),
    incomplete: incompleteNoteDe(r.incomplete),
  }
}

/* ------------------------------------------------------------------ *
 * The act page's credit line
 * ------------------------------------------------------------------ */

export interface EuActCredits {
  /** The sources with a publisher the site's list knows — RIS, Parliament, EUR-Lex — and what may be claimed of each (`provenance.ts`). */
  sources: SourceEntry[]
  /** The items after „Quellen:", in the order the map reads: RIS, Parliament, the Länder, EUR-Lex. */
  items: string[]
}

/**
 * The act page's credit line, with where each STAND comes from — derived
 * from the stands the page shows (`EuStand.label` of the implementing
 * drafts, in the chart's lanes and their rows, and of the restating ones,
 * whose rows show their Stand too since they are the lists' rows,
 * 06.11.2026), so an item stands only where its label does:
 *
 *  - „Bundesgesetzblatt" → RIS (the Kundmachung's day, from the BGBl
 *    record — CC BY, `risSource`);
 *  - „Beschluss" on a Bund row → Parliament (the house's decision on the
 *    Regierungsvorlage, procedure data of a parliamentary station — CC BY,
 *    `parliamentProcedureSource`);
 *  - „Beschluss" on a Land row → the Landtag's record, and
 *    „Landesgesetzblatt" → the Land's Gesetzblatt: named with the Länder's
 *    documents, no publisher in the site's list and no licence claim, as
 *    every Land document on the site.
 *
 * „Heute" is the day, no source. The line itself states no licence
 * (`SectionCredits`): the claims stand once, in the Impressum.
 */
export function euActCredits(r: Pick<EuActResponse, 'implementing'> & Partial<Pick<EuActResponse, 'restating'>>): EuActCredits {
  const shown = [...r.implementing, ...(r.restating ?? [])]
  const has = (label: EuStand['label'], bund: boolean) =>
    shown.some((d) => d.stand?.label === label && (d.publisher === 'bund') === bund)

  const ris = [risSource('Vorblatt'), risSource('Gesetzestext'), ...(has('Bundesgesetzblatt', true) ? [risSource('Bundesgesetzblatt')] : [])]
  const parliament = has('Beschluss', true) ? [parliamentProcedureSource('Beschluss')] : []
  const eurLex = [eurLexSource('Fristen')]
  const land = ['Dokumente', ...(has('Beschluss', false) ? ['Landtagsbeschlüsse'] : []), ...(has('Landesgesetzblatt', false) ? ['Landesgesetzblätter'] : [])]

  const item = (entries: readonly SourceEntry[]) => `${listDe(entries.map((e) => e.what))} (${PUBLISHER_NAME_DE[entries[0]!.publisher]})`
  return {
    sources: [...ris, ...parliament, ...eurLex],
    items: [item(ris), ...(parliament.length ? [item(parliament)] : []), `${listDe(land)} der Länder`, item(eurLex)],
  }
}
