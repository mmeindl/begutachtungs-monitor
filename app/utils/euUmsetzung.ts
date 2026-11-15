/**
 * The list „Richtlinien, die Österreich umzusetzen hat" (step 7 of the EU
 * cycle), as words: every directive with a transposition date within two
 * years of today, whether or not anybody works on it, by deadline.
 *
 * TWO OBSERVATIONS, NEVER A VERDICT (rule D6). A row says what the monitor
 * found (drafts of its own window) and what the country notified to the
 * Commission (a count), each in its own sentence and each with its own
 * „unknown". It says no „umgesetzt", „offen" or „überfällig", carries no
 * colour, and the list is never ordered or counted by what is missing: the
 * order is the deadlines', the count is of directives.
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

export interface EuUmsetzungRowView {
  key: string
  label: string
  path: string
  /** What the official title says after the name and date; null without a title. */
  subject: string | null
  /** The two observations, each a sentence of its own. */
  observations: string[]
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
  drafts: {
    unknown: 'Die Entwürfe sind noch nicht gelesen.',
    none: 'Der Monitor hat keinen Entwurf gefunden.',
    some: (bund: number, laender: number) => {
      const parts = [
        ...(bund ? [bund === 1 ? '1 Entwurf des Bundes' : `${bund} Entwürfe des Bundes`] : []),
        ...(laender ? [laender === 1 ? '1 Entwurf der Länder' : `${laender} Entwürfe der Länder`] : []),
      ]
      return `Im Monitor: ${parts.join(' und ')}.`
    },
  },
  measures: {
    unknown: 'Die Meldungen an die Kommission konnten nicht gelesen werden.',
    none: `${EU_MEMBER_STATE_NAME_DE} hat der Kommission bisher keine Maßnahme gemeldet.`,
    some: (n: number) => (n === 1
      ? `${EU_MEMBER_STATE_NAME_DE} hat der Kommission 1 Maßnahme gemeldet.`
      : `${EU_MEMBER_STATE_NAME_DE} hat der Kommission ${n} Maßnahmen gemeldet.`),
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
  const drafts = r.drafts === null
    ? DE.drafts.unknown
    : r.drafts.bund + r.drafts.laender === 0 ? DE.drafts.none : DE.drafts.some(r.drafts.bund, r.drafts.laender)
  const measures = r.measures === null ? DE.measures.unknown : r.measures === 0 ? DE.measures.none : DE.measures.some(r.measures)
  return {
    key: r.celex,
    label: r.label,
    path: r.path,
    subject,
    observations: [drafts, measures],
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
