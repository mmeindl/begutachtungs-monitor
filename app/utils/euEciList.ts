/**
 * The list „Jetzt unterstützbar: Europäische Bürgerinitiativen" on
 * `/eu-recht` (step 5 of the EU cycle, 15.11.2026), as words: every
 * initiative the register lists in collection today, by the last day of its
 * collection, the soonest first.
 *
 * THE ORDER OF THE OPEN WINDOWS (`euFenster.ts`): by day, then by number —
 * never by the number of supporters, which would read as a ranking of which
 * initiative is worth signing. The count stands in a column of its own,
 * „Unterstützungen", as the draft list keeps its Stellungnahmen
 * (`EuCountCell`, 16.11.2026): the register's plain figure, with no bar, no
 * share and no threshold — the register gives none per Member State. Its
 * source qualifier „laut Register" stands in the list's frame row and in
 * every cell's words; a missing count is a word, never 0.
 *
 * A ROW WHOSE DAY COULD NOT BE READ stays, after the rows with a day, with a
 * gap sentence in place of the day: the list carries no deadline, the
 * details do, and a cold start reads them one by one (`eciOpen`).
 *
 * All German copy of the list lives here. Pure: no Vue.
 */
import type { EciOpenRow, EuBuergerinitiativenResponse } from '#shared/types'
import { euCitizensInitiativePath } from '#shared/utils/eu'
import { formatDateWeekdayDe, formatNumberDe, fristLabel } from '#shared/utils/format'
import { gapDe } from '#shared/utils/gaps'
import { deadlineTone } from './deadlines'
import type { EntryState } from './entryView'
import { countCell, wordCell, type EuCountCell } from './euCountCell'

const DE = {
  heading: 'Jetzt unterstützbar: Europäische Bürgerinitiativen',
  lede: 'Für diese Europäischen Bürgerinitiativen werden gerade Unterstützungen gesammelt, laut dem Register der Kommission. Jede Zeile führt zur Seite der Initiative hier, mit ihren Stationen, und von dort zum Sammelsystem, in dem man sie unterstützt.',
  column: { title: 'Initiative', supporters: 'Unterstützungen', end: 'Sammlung' },
  originalTitle: 'Titel in der Originalsprache',
  untitled: (reference: string) => `Europäische Bürgerinitiative ${reference}`,
  supporters: (n: number) => `Unterstützungen laut Register: ${formatNumberDe(n)}`,
  /** Where the register's list gives no count: a word, never 0. */
  supportersNone: 'nicht angegeben',
  supportersNoneSaid: 'Unterstützungen laut Register: nicht angegeben',
  state: {
    pending: 'Ende wird gelesen',
    unread: 'Ende nicht gelesen',
  },
  pending: gapDe('unavailable', 'Bis wann gesammelt wird, liest der Monitor gerade aus dem Register; beim nächsten Aufruf steht es da.'),
  unreadDay: gapDe('unavailable', 'Bis wann gesammelt wird, konnte nicht aus dem Register gelesen werden.'),
  unread: 'Die Initiativen konnten nicht gelesen werden: Das Register der Europäischen Bürgerinitiative hat nicht oder nicht lesbar geantwortet. Was dort gesammelt wird, zeigt das Register selbst:',
  registerLink: 'Register der Europäischen Bürgerinitiative',
  none: 'Das Register führt derzeit keine Initiative in der Sammlung.',
  count: (n: number) => (n === 1 ? '1 Initiative in der Sammlung' : `${n} Initiativen in der Sammlung`),
  /** The frame row's second half: whose count the column carries. */
  countSource: 'Unterstützungen laut Register',
  loading: 'Bürgerinitiativen werden geladen …',
  credits: ['Quelle:', 'Europäische Kommission, Register der Europäischen Bürgerinitiative'],
} as const

export const EU_ECI_LIST_DE = DE

export interface EuEciRowView {
  key: string
  /** The monitor's page of the initiative. */
  path: string
  title: string
  /** „Titel in der Originalsprache" where the register has no German one; null otherwise. */
  titleNote: string | null
  /** The column „Unterstützungen": the register's count, or „nicht angegeben" where the list gives none; `said` is „Unterstützungen laut Register: 7.410". */
  supporters: EuCountCell
  /** The last day in the lists' state box, as a draft's open Frist; a plain box where it could not be read. */
  state: EntryState
  /** The gap sentence where the day could not be read; null otherwise. */
  gap: string | null
  /** For the sort: the ISO last day; '9999' where none. */
  end: string
}

function rowOf(r: EciOpenRow): EuEciRowView | null {
  const path = euCitizensInitiativePath(r.year, r.number)
  if (!path) return null
  const pending = r.details === 'ausstehend'
  return {
    key: `${r.year}/${r.number}`,
    path,
    title: r.title ?? DE.untitled(r.reference),
    titleNote: r.title && !r.titleIsGerman ? DE.originalTitle : null,
    supporters: r.supporters !== null ? { ...countCell(r.supporters, DE.supporters(r.supporters)), value: formatNumberDe(r.supporters) } : wordCell(DE.supportersNone, DE.supportersNoneSaid),
    // The draft list's box for an open Frist, word for word and tone for tone: one deadline reads the same in every list and on its page's door.
    state: r.deadline
      ? { label: fristLabel(r.deadline, true), detail: `bis ${formatDateWeekdayDe(r.deadline)}`, tone: deadlineTone(r.deadline, true), actionable: true }
      : { label: pending ? DE.state.pending : DE.state.unread, detail: null, tone: 'neutral', actionable: true },
    gap: r.deadline ? null : pending ? DE.pending : DE.unreadDay,
    end: r.deadline ?? '9999',
  }
}

export interface EuEciListView {
  /** By last day, the soonest first, then by year and number. Null where the register could not be read. */
  rows: EuEciRowView[] | null
}

export function euEciListView(r: EuBuergerinitiativenResponse): EuEciListView {
  if (!r.initiatives) return { rows: null }
  const rows = r.initiatives
    .map(rowOf)
    .filter((x): x is EuEciRowView => x !== null)
    .sort((a, b) => a.end.localeCompare(b.end) || a.key.localeCompare(b.key, 'en', { numeric: true }))
  return { rows }
}
