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
 * gelesen", apart from none; and the columns do not sort — the list is
 * never ordered or counted by what is missing. It says no „umgesetzt",
 * „offen" or „überfällig" and carries no colour: the order is the
 * deadlines', the count is of directives.
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

export type EuUmsetzungTab = 'laufend' | 'abgelaufen'

/** One observation in its column. */
export interface EuUmsetzungCell {
  /** „2", or the word for none („keiner") or for unknown („nicht gelesen"). */
  value: string
  /** A number stands in ink; a word in muted ink — said by the word too, never by the tone alone. */
  counted: boolean
  /** Under a number of drafts, whose they are: „Bund", „Länder", „Bund 1 · Länder 3". */
  detail: string | null
  /** The whole observation for a screen reader and for the card below `md`: „Entwürfe im Monitor: 2 (Bund)". */
  said: string
}

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
  drafts: {
    said: 'Entwürfe im Monitor',
    unknown: 'nicht gelesen',
    none: 'keiner',
    whose: (bund: number, laender: number) => (bund && laender ? `Bund ${bund} · Länder ${laender}` : bund ? 'Bund' : 'Länder'),
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
  const word = (said: string, value: string): EuUmsetzungCell => ({ value, counted: false, detail: null, said: `${said}: ${value}` })
  const n = r.drafts ? r.drafts.bund + r.drafts.laender : 0
  const whose = r.drafts && n ? DE.drafts.whose(r.drafts.bund, r.drafts.laender) : null
  const drafts: EuUmsetzungCell = r.drafts === null
    ? word(DE.drafts.said, DE.drafts.unknown)
    : n === 0
      ? word(DE.drafts.said, DE.drafts.none)
      : { value: String(n), counted: true, detail: whose, said: `${DE.drafts.said}: ${n} (${whose})` }
  const measures: EuUmsetzungCell = r.measures === null
    ? word(DE.measures.said, DE.measures.unknown)
    : r.measures === 0
      ? word(DE.measures.said, DE.measures.none)
      : { value: String(r.measures), counted: true, detail: null, said: `${DE.measures.said}: ${DE.measures.some(r.measures)}` }
  return {
    key: r.celex,
    label: r.label,
    path: r.path,
    subject,
    drafts,
    measures,
    state: { label: DE.state.label, detail: DE.state.detail(formatDateDe(r.deadline)), tone: 'inactive', actionable: false },
    commission: r.form === 'delegierte-richtlinie' || r.form === 'durchfuehrungsrichtlinie',
    haystack: [r.label, subject ?? '', r.celex].join(' '),
  }
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
 * first. Both are the order of the dates.
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
