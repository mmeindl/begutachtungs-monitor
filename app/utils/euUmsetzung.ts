/**
 * The list „Richtlinien, die Österreich umzusetzen hat" (step 7 of the EU
 * cycle), as words: every directive with a transposition date within two
 * years of today, whether or not anybody works on it, by deadline.
 *
 * TWO OBSERVATIONS, NEVER A VERDICT (rule D6). A row says what the monitor
 * found (drafts of its own window) and what the country notified to the
 * Commission (a count), each in a column of its own, as the draft list
 * keeps its Stellungnahmen, and each with its own „unknown". Three
 * conditions keep the columns honest: none is a WORD („keiner", „keine"),
 * never the digit 0, which would read as a score; unknown is „nicht
 * gelesen", apart from none; and these two columns do not sort — the list
 * is never ordered or counted by what is missing. It says no „umgesetzt",
 * „offen" or „überfällig" and carries no colour: the count is of
 * directives. What orders (16.11.2026, `EU_UMSETZUNG_SORT_COLUMNS`,
 * `SortHeader`) is the deadline, in the tab's direction, and the
 * directive's name, A–Z with numbers read as numbers, as the acts' list
 * orders its names; each turned round by a second click.
 *
 * A notified measure is the Member State's claim — Austria notified laws
 * older than the directive for 42 of 124 directives (15.11.2026) — so the
 * verb is „gemeldet", and the method text under the list says what that
 * does and does not mean.
 *
 * All German copy of the list lives here, so a second language replaces
 * it here. Pure: no Vue.
 */
import type { EuUmsetzungResponse, EuUmsetzungRow } from '#shared/types'
import { EU_MEMBER_STATE_NAME_DE, euActSubject } from '#shared/utils/eu'
import { formatDateDe } from '#shared/utils/format'
import type { EntryState } from './entryView'
import { countCell, draftsWhoseDe, wordCell, type EuCountCell } from './euCountCell'

export type EuUmsetzungTab = 'laufend' | 'abgelaufen'

/** One observation in its column (`EuCountCell`): „2", or the word for none („keiner") or for unknown („nicht gelesen"). */
export type EuUmsetzungCell = EuCountCell

export interface EuUmsetzungRowView {
  key: string
  label: string
  path: string
  /** What the official title says after the name and date; null without a title. */
  subject: string | null
  /** What the monitor found: the drafts of its window that implement the directive. */
  drafts: EuUmsetzungCell
  /** What the country notified to the Commission. */
  measures: EuUmsetzungCell
  /** The deadline in the lists' state box: grey on every row, a date and nothing else. */
  state: EntryState
  /** For the sort: the ISO deadline. */
  deadline: string
  /** A delegated or implementing directive of the Commission: behind the chip, off by default. */
  commission: boolean
  /** What the search reads. */
  haystack: string
}

const DE = {
  heading: `Richtlinien, die ${EU_MEMBER_STATE_NAME_DE} umzusetzen hat`,
  lede: (from: string, to: string) =>
    `Jede Richtlinie der Europäischen Union mit einer Umsetzungsfrist zwischen ${from} und ${to} – auch jene, zu denen der Monitor keinen Entwurf kennt.`,
  tab: { laufend: 'Frist läuft', abgelaufen: 'Abgelaufen' },
  tabsLabel: 'Umsetzungsfrist',
  commissionChip: (n: number) => `Richtlinien der Kommission (${n})`,
  commissionChipHint: 'Delegierte Richtlinien und Durchführungsrichtlinien der Kommission, meist Änderungen technischer Anhänge',
  column: { directive: 'Richtlinie', drafts: 'Entwürfe', measures: 'Gemeldet', deadline: 'Umsetzungsfrist' },
  sortLabel: 'Sortieren',
  /** The sort button's words, completing its name; the deadline's per tab. */
  order: {
    name: ['A–Z', 'Z–A'],
    deadline: {
      laufend: ['nächste zuerst', 'späteste zuerst'],
      abgelaufen: ['zuletzt abgelaufene zuerst', 'am längsten abgelaufene zuerst'],
    },
  },
  /** The phone's select, one option per column and direction; the deadline's per tab. */
  sortOptions: {
    deadline: {
      laufend: ['Nächste Frist zuerst', 'Späteste Frist zuerst'],
      abgelaufen: ['Zuletzt abgelaufene zuerst', 'Am längsten abgelaufene zuerst'],
    },
    name: 'Richtlinie A–Z',
    nameReversed: 'Richtlinie Z–A',
  },
  drafts: {
    said: 'Entwürfe im Monitor',
    unknown: 'nicht gelesen',
    none: 'keiner',
    whose: draftsWhoseDe,
  },
  measures: {
    said: 'Der Kommission gemeldet',
    unknown: 'nicht gelesen',
    none: 'keine',
    some: (n: number) => (n === 1 ? '1 Maßnahme' : `${n} Maßnahmen`),
  },
  state: { label: 'Umsetzungsfrist', detail: (d: string) => `bis ${d}` },
  unread: 'Die Liste der Richtlinien konnte nicht gelesen werden: Der Cellar des Amts für Veröffentlichungen hat nicht geantwortet.',
  empty: (tab: EuUmsetzungTab) => `Keine Richtlinie unter „${DE.tab[tab]}“.`,
  count: (n: number) => (n === 1 ? '1 Richtlinie' : `${n} Richtlinien`),
  credits: ['Quellen:', 'Richtlinien, Fristen und gemeldete Maßnahmen (EUR-Lex)', 'Entwürfe: Vorblatt und Gesetzestext (RIS), Dokumente der Länder'],
} as const

export const EU_UMSETZUNG_DE = DE

function rowOf(r: EuUmsetzungRow): EuUmsetzungRowView {
  const subject = euActSubject(r.title)
  const word = (said: string, value: string): EuUmsetzungCell => wordCell(value, `${said}: ${value}`)
  const n = r.drafts ? r.drafts.bund + r.drafts.laender : 0
  const whose = r.drafts && n ? DE.drafts.whose(r.drafts.bund, r.drafts.laender) : null
  const drafts: EuUmsetzungCell = r.drafts === null
    ? word(DE.drafts.said, DE.drafts.unknown)
    : n === 0
      ? word(DE.drafts.said, DE.drafts.none)
      : countCell(n, `${DE.drafts.said}: ${n} (${whose})`, whose)
  const measures: EuUmsetzungCell = r.measures === null
    ? word(DE.measures.said, DE.measures.unknown)
    : r.measures === 0
      ? word(DE.measures.said, DE.measures.none)
      : countCell(r.measures, `${DE.measures.said}: ${DE.measures.some(r.measures)}`)
  return {
    key: r.celex,
    label: r.label,
    path: r.path,
    subject,
    drafts,
    measures,
    state: { label: DE.state.label, detail: DE.state.detail(formatDateDe(r.deadline)), tone: 'inactive', actionable: false },
    deadline: r.deadline,
    commission: r.form === 'delegierte-richtlinie' || r.form === 'durchfuehrungsrichtlinie',
    haystack: [r.label, subject ?? '', r.celex].join(' '),
  }
}

/**
 * The list's orders: the deadline and the directive's name. Nothing else —
 * the drafts found and the measures notified never order the list (rule
 * D6), so neither column has a key.
 */
export type EuUmsetzungSort = 'frist' | 'name'

/** Which column carries which order; a column not named here orders nothing. */
export const EU_UMSETZUNG_SORT_COLUMNS: Readonly<Partial<Record<keyof typeof DE.column, EuUmsetzungSort>>> = {
  directive: 'name',
  deadline: 'frist',
}

/** The deadline's own direction per tab: what runs nearest first, what passed most recent first. */
export function umsetzungDeadlineDirection(tab: EuUmsetzungTab): 'auf' | 'ab' {
  return tab === 'abgelaufen' ? 'ab' : 'auf'
}

/**
 * One order as a comparator, `reversed` turning the column's own direction
 * round. „frist": the tab's direction (`umsetzungDeadlineDirection`), ties
 * by CELEX in the same direction — which is exactly the opening order of
 * both tabs. „name": the label in German collation with numbers read as
 * numbers („2024/927" before „2024/1385"), then the CELEX.
 */
export function euUmsetzungComparator(sort: EuUmsetzungSort, tab: EuUmsetzungTab, reversed: boolean): (a: EuUmsetzungRowView, b: EuUmsetzungRowView) => number {
  if (sort === 'name') {
    const byName = (a: EuUmsetzungRowView, b: EuUmsetzungRowView) => a.label.localeCompare(b.label, 'de', { numeric: true }) || a.key.localeCompare(b.key)
    return reversed ? (a, b) => byName(b, a) : byName
  }
  const ascending = (umsetzungDeadlineDirection(tab) === 'auf') !== reversed
  const asc = (a: EuUmsetzungRowView, b: EuUmsetzungRowView) => a.deadline.localeCompare(b.deadline) || a.key.localeCompare(b.key)
  return ascending ? asc : (a, b) => asc(b, a)
}

/** A tab's rows in the order chosen; a new array, the view's rows untouched. */
export function sortUmsetzungRows(rows: readonly EuUmsetzungRowView[], sort: EuUmsetzungSort, tab: EuUmsetzungTab, reversed: boolean): EuUmsetzungRowView[] {
  return [...rows].sort(euUmsetzungComparator(sort, tab, reversed))
}

export interface EuUmsetzungView {
  heading: string
  lede: string
  /** Null where the Cellar did not answer: the page shows `unread`, no empty list. */
  tabs: Record<EuUmsetzungTab, EuUmsetzungRowView[]> | null
  /** How many of all rows are the Commission's delegated or implementing directives. */
  commissionCount: number
}

/**
 * The view of the whole list. „Frist läuft": the deadline is today or
 * later, the next one first. „Abgelaufen": it has passed, the most recent
 * first. Both are the order of the dates, the opening order of each tab;
 * the reader's other orders are `sortUmsetzungRows`.
 */
export function euUmsetzungView(r: EuUmsetzungResponse, today: string): EuUmsetzungView {
  const base = { heading: DE.heading, lede: DE.lede(formatDateDe(r.window.from), formatDateDe(r.window.to)) }
  if (!r.rows) return { ...base, tabs: null, commissionCount: 0 }
  const laufend = r.rows.filter((x) => x.deadline >= today)
  const abgelaufen = r.rows.filter((x) => x.deadline < today).reverse()
  return {
    ...base,
    tabs: { laufend: laufend.map(rowOf), abgelaufen: abgelaufen.map(rowOf) },
    commissionCount: r.rows.filter((x) => x.form === 'delegierte-richtlinie' || x.form === 'durchfuehrungsrichtlinie').length,
  }
}
