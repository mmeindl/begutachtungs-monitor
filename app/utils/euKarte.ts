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
 * over the lanes and a tick across each, the Begutachtung the band, the dot
 * where the procedure stands, and under each line the draft's own dates.
 *
 * Pure: the pages render what this returns, the tests read it without one.
 */
import type { EuActHead, EuActDraft, EuActResponse, EuActSummary, EuActsResponse, EuPublisher, EuStand } from '#shared/types'
import { euActSubject } from '#shared/utils/eu'
import { formatDateDe } from '#shared/utils/format'
import { LAND_CODES, LAND_NAME, landShortTitle, type SourceCode } from '#shared/utils/laender'
import { PUBLISHER_NAME_DE, eurLexSource, parliamentProcedureSource, risSource, type SourceEntry } from '#shared/utils/provenance'
import { viewOfRow, type EntryState, type EntryView } from './entryView'
import { SUPERSCRIPT, dateRangeDe, dayOf, edgeAlign, laneBarOf, type EuChartView } from './euRecht'

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
  /**
   * The deadline as the row's state box, in the column where `/entwuerfe`
   * keeps its Stand (`EntryState`): „Umsetzungsfrist" over „bis 07.05.2026",
   * „Gilt unmittelbar" for a regulation. Always grey and never counted (rule
   * D6, reaffirmed 06.11.2026): the box carries the date, the order carries
   * which comes next, and a passed date stays a date — whether the act was
   * transposed in time is nothing the monitor can see.
   */
  state: EntryState
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
    state: actStateOf(a),
    counts,
    lands: a.lands.map((l) => LAND_NAME[l]),
  }
}

/**
 * The state box's two lines. A directive or framework decision without a
 * date says „keine bekannt", not „keine": the Cellar may have none, or may
 * not have answered, and the two read the same here.
 */
function actStateOf(a: Pick<EuActSummary, 'kind' | 'transposition'>): EntryState {
  const words = a.transposition
    ? { label: 'Umsetzungsfrist', detail: `bis ${formatDateDe(a.transposition.deadline)}` }
    : a.kind === 'verordnung'
      ? { label: 'Gilt unmittelbar', detail: 'keine Umsetzungsfrist' }
      : { label: 'Umsetzungsfrist', detail: 'keine bekannt' }
  return { ...words, tone: 'inactive', actionable: false }
}

/** The words the overview's search reads (`matchesQuery`): the label, the official title, the CELEX — „NIS", „Asbest", „2022/2555". */
export function euActHaystack(a: Pick<EuActSummary, 'label' | 'title' | 'celex'>): string {
  return `${a.label} ${a.title ?? ''} ${a.celex}`
}

/**
 * Which tab of the overview an act stands under (06.11.2026): its deadline
 * still ahead (today included), passed, or none — a regulation, or a
 * directive the Cellar names no date for. A fact about the date, never
 * about the transposition (D6): „abgelaufen" says the day has passed, not
 * that Austria missed it, and no tab carries a colour.
 */
export type EuDeadlineTab = 'laufend' | 'abgelaufen' | 'ohne'

export function deadlineTabOf(a: Pick<EuActSummary, 'transposition'>, today: string): EuDeadlineTab {
  const d = a.transposition?.deadline
  return !d ? 'ohne' : d >= today ? 'laufend' : 'abgelaufen'
}

/**
 * The overview's orders, one per column as on every list (`SortHeader`,
 * 06.11.2026): by deadline, or by the act's name. One direction per column —
 * the tab decides the deadline's (`deadlineDirection`), so no second click
 * reverses it.
 */
export type EuActSort = 'frist' | 'name'

/**
 * Each tab opens in the order its question asks for; „Ohne Frist" has no
 * date to order by and stays by name.
 */
export const EU_SORT_DEFAULT: Record<EuDeadlineTab, EuActSort> = { laufend: 'frist', abgelaufen: 'frist', ohne: 'name' }

/** What runs, nearest first; what passed, most recent first. */
export function deadlineDirection(tab: EuDeadlineTab): 'auf' | 'ab' {
  return tab === 'abgelaufen' ? 'ab' : 'auf'
}

/** The deadline column's order, in the words of its sort button (`SortHeader`). */
export function deadlineOrderDe(tab: EuDeadlineTab): string {
  return tab === 'abgelaufen' ? 'zuletzt abgelaufene zuerst' : 'nächste zuerst'
}

/**
 * By name with numbers read as numbers, so „2024/927" comes before
 * „2024/1385" — the names are mostly kind, year and number.
 */
const byName = (a: Pick<EuActSummary, 'label' | 'celex'>, b: Pick<EuActSummary, 'label' | 'celex'>): number =>
  a.label.localeCompare(b.label, 'de', { numeric: true }) || a.celex.localeCompare(b.celex)

/** One order as a comparator; acts without a deadline last either way, ties by name. */
export function euActComparator(sort: EuActSort, direction: 'auf' | 'ab' = 'auf'): (a: Pick<EuActSummary, 'transposition' | 'label' | 'celex'>, b: Pick<EuActSummary, 'transposition' | 'label' | 'celex'>) => number {
  if (sort === 'name') return byName
  return (a, b) => {
    const da = a.transposition?.deadline ?? null
    const db = b.transposition?.deadline ?? null
    if (da !== db) {
      if (da === null) return 1
      if (db === null) return -1
      return direction === 'auf' ? da.localeCompare(db) : db.localeCompare(da)
    }
    return byName(a, b)
  }
}

/** The overview's rows, in the order chosen (`euActComparator`). */
export function euActsRows(r: Pick<EuActsResponse, 'acts'>, sort: EuActSort = 'frist', direction: 'auf' | 'ab' = 'auf'): EuActsRowView[] {
  return [...r.acts].sort(euActComparator(sort, direction)).map((a) => actsRowOf(a, countsDe(a.counts)))
}

/**
 * The fold's rows under the overview — the acts drafts only restate, the
 * same anatomy and order, the counts as „wiederholt in …" (`restatingCountsDe`).
 */
export function euRestatingRows(r: Pick<EuActsResponse, 'restatingOnly'>, sort: EuActSort = 'frist', direction: 'auf' | 'ab' = 'auf'): EuActsRowView[] {
  return [...r.restatingOnly].sort(euActComparator(sort, direction)).map((a) => actsRowOf(a, restatingCountsDe(a.counts)))
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

/** The act page's chart: every drawable implementing draft a lane on one track (`EuTimelineChart`); null where nothing can be drawn. */
export type EuActChartView = EuChartView

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
 * over the lanes, every date at its mark. A timeline in each row was built
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
    chart = {
      deadlines: t
        ? [{ key: 'frist', at: at(t.deadline), align: edgeAlign(at(t.deadline)), lines: ['Umsetzungsfrist', `${formatDateDe(t.deadline)}${note}`] }]
        : [],
      lanes: drawn.map((d) => ({
        key: d.key,
        path: d.path,
        publisher: publisherDe(d.publisher),
        name: laneNameOf(d.title),
        title: d.title,
        bar: laneBarOf(at, d.begutachtung, d.stand, t ? [t.deadline] : []),
      })),
      // Under the chart, beside the ¹ it explains — not as a mark: a second
      // tick on every lane would ask which deadline a draft is read against.
      footnote: t ? footnote : null,
    }
  }

  /* The head says the deadline only where the chart does not — no lane to
   * draw (the Bund's stand cold after a restart), or no deadline to label
   * („gilt unmittelbar"). The adoption stays up there: drawn, it would pull
   * the track back years and shrink every Begutachtung to a sliver. */
  const deadline = chart?.deadlines.length ? null : deadlineDe(act)
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
