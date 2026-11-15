/**
 * „Wer Rückmeldung gegeben hat" (step 4 of the EU cycle, 15.11.2026): the
 * fold under a section's frame that reads, on demand, who answered in one
 * feedback window on the Commission's portal — a list of the contributions
 * of the organisations the server's naming rule allows
 * (`namedOrganisationOf`, `server/utils/eu/portalFeedback.ts`), one row per
 * contribution with its day, kind and country and the link to it on the
 * portal, and the rest as counts under the list.
 *
 * THE LIST OF THE STELLUNGNAHMEN, IN ITS GRAMMAR (maintainer, 15.11.2026):
 * kinds as tabs with their counts, the country the page serves as a chip,
 * a search over the names above twenty rows, the order by day or by name in
 * the column header, ten rows a page. Nothing is ordered by count, nothing
 * is „most active", and no figure stands for what a contribution achieved
 * (CLAUDE.md, „Framing"). The texts are not shown: each row links its
 * contribution on the portal.
 *
 * THE COUNTRY IS THE VIEW'S. The reading knows none; `euFeedbackView` takes
 * the country the page serves (the configured member state by default, as
 * `euBuergerinitiativeView` does) or null, and only with one is there a
 * chip „Aus <Land>" and a „davon aus <Land>" — without one nothing is said
 * to be missing.
 *
 * All German copy of the fold lives here, so a second language replaces it
 * here. Pure: no Vue; `EuFeedbackFold` and `EuFeedbackPanel` place what
 * this returns.
 */
import type { EuFeedbackOrganisationType, EuFeedbackReading } from '#shared/types'
import { EU_MEMBER_STATE, EU_MEMBER_STATE_NAME_DE } from '#shared/utils/eu'
import { countLabelDe, formatNumberDe } from '#shared/utils/format'
import { gapDe } from '#shared/utils/gaps'
import { matchesQuery } from '#shared/utils/textMatch'
import type { EuSectionFact } from './euRail'

const DE = {
  heading: 'Wer Rückmeldung gegeben hat',
  headingOf: (title: string) => `Wer Rückmeldung gegeben hat (${title})`,
  loading: 'Rückmeldungen werden gelesen …',
  read: 'Die Rückmeldungen sind gelesen.',
  loadingNote: 'Das Portal wird behutsam abgefragt, eine Seite nach der anderen; das dauert einige Sekunden.',
  unread: gapDe('unavailable', 'Das Portal „Ihre Meinung zählt“ der Kommission hat die Liste der Rückmeldungen nicht rechtzeitig oder nicht lesbar geliefert.'),
  empty: 'Das Portal verzeichnet zu dieser Frist keine Rückmeldung.',
  noneNamed: 'Keine Organisation mit Namen unter den gelesenen Rückmeldungen.',
  /** What the monitor does not read, and that search, filter and order reach no further: at the list's head, before a reader relies on a search. */
  cap: (read: number, total: number) => gapDe('outOfScope', `Gelesen sind die neuesten ${formatNumberDe(read)} von ${formatNumberDe(total)} Rückmeldungen; Suche, Filter und Sortierung reichen nur über sie.`),
  listHeading: 'Liste der Rückmeldungen von Organisationen',
  /** What the list is; under a filter or a search how much of it is shown. */
  set: (n: number) => countLabelDe(n, 'Rückmeldung einer Organisation mit Namen', 'Rückmeldungen von Organisationen mit Namen'),
  setOf: (shown: number, n: number) => `${formatNumberDe(shown)} von ${DE.set(n)}`,
  kindsLabel: 'Rückmeldungen nach Art der Organisation filtern',
  all: 'Alle',
  allSelect: 'Alle Arten',
  fromCountry: (country: string) => `Aus ${country}`,
  fromCountryNone: (country: string) => `Keine Rückmeldung einer Organisation aus ${country} in dieser Art`,
  search: 'Organisation suchen',
  noMatch: 'Keine Organisation gefunden',
  noMatchNote: 'Gesucht wird nur in den Namen der Organisationen; was ohne Namen gezählt ist, findet die Suche nicht.',
  noneInSelection: 'Keine Rückmeldung in dieser Auswahl',
  sortLabel: 'Sortieren',
  sortOptions: { date: 'Neueste', dateReversed: 'Älteste', name: 'Name A–Z', nameReversed: 'Name Z–A' },
  column: { date: 'Datum', name: 'Organisation', kind: 'Art', country: 'Land' },
  order: { date: ['neueste zuerst', 'älteste zuerst'], name: ['A bis Z', 'Z bis A'] } as const,
  countrySaid: 'Land',
  /** A row whose country the portal gives no valid code for. */
  noCountry: 'ohne Angabe',
  link: (name: string) => `Rückmeldung von ${name} im Portal der Kommission (neues Fenster)`,
  /**
   * The kinds of organisation: plural on the tabs and in the counts, the
   * singular in a row. OUR translations of the portal's codes: its own
   * German labels were not read (as for the kinds of act,
   * `shared/utils/euPortal.ts`).
   */
  type: {
    BUSINESS_ASSOCIATION: 'Wirtschaftsverbände',
    COMPANY: 'Unternehmen',
    NGO: 'Nichtregierungsorganisationen',
    PUBLIC_AUTHORITY: 'Behörden',
    ACADEMIC_RESEARCH_INSTITTUTION: 'Hochschulen und Forschungseinrichtungen',
    TRADE_UNION: 'Gewerkschaften',
    ENVIRONMENTAL_ORGANISATION: 'Umweltorganisationen',
    CONSUMER_ORGANISATION: 'Verbraucherorganisationen',
  } satisfies Record<EuFeedbackOrganisationType, string>,
  kind: {
    BUSINESS_ASSOCIATION: 'Wirtschaftsverband',
    COMPANY: 'Unternehmen',
    NGO: 'Nichtregierungsorganisation',
    PUBLIC_AUTHORITY: 'Behörde',
    ACADEMIC_RESEARCH_INSTITTUTION: 'Hochschule oder Forschungseinrichtung',
    TRADE_UNION: 'Gewerkschaft',
    ENVIRONMENTAL_ORGANISATION: 'Umweltorganisation',
    CONSUMER_ORGANISATION: 'Verbraucherorganisation',
  } satisfies Record<EuFeedbackOrganisationType, string>,
  /** The figures under the list: what is counted and never a row. */
  countedHeading: 'Ohne Namen gezählt',
  citizens: (n: number) => countLabelDe(n, 'Bürgerin oder Bürger', 'Bürgerinnen und Bürger'),
  citizensFrom: (country: string, n: number) => `davon aus ${country}: ${formatNumberDe(n)}`,
  other: (n: number) => countLabelDe(n, 'Rückmeldung ohne Angabe einer Organisationsart (Sonstige)', 'Rückmeldungen ohne Angabe einer Organisationsart (Sonstige)'),
  unpublished: (n: number) => countLabelDe(n, 'Rückmeldung, die das Portal nicht als veröffentlicht führt', 'Rückmeldungen, die das Portal nicht als veröffentlicht führt'),
  citizensNote: 'Privatpersonen werden gezählt, nie genannt.',
  unnamedReason:
    'Ohne Namen zählt der Monitor Organisationen, hinter deren Namen eine einzelne Person stehen kann: Kleinstunternehmen und -organisationen ohne Nummer im Transparenzregister und Organisationen, deren Name den Namen der meldenden Person enthält. Ebenso gezählt wird, wo statt eines Namens eine Nummer, eine Adresse oder eine längere Beschreibung steht.',
} as const

/** The fold's fixed words, for the component's states. */
export const EU_FEEDBACK_DE = DE

/** One fold under a section's frame: the window it reads, and its heading. */
export interface EuFeedbackFoldView {
  key: string
  heading: string
  initiative: number
  publication: number
}

/**
 * The folds of a section, one per fact that carries a window
 * (`EuSectionFact.feedback`), in the frame's order. One fold is „Wer
 * Rückmeldung gegeben hat"; where a section has several (a Sondierung and a
 * public consultation), each heading names its fact.
 */
export function feedbackFoldsOf(facts: readonly EuSectionFact[]): EuFeedbackFoldView[] {
  const withWindow = facts.filter((f): f is EuSectionFact & { feedback: NonNullable<EuSectionFact['feedback']> } => !!f.feedback)
  return withWindow.map((f) => ({
    key: `rueckmeldungen-${f.feedback.initiative}-${f.feedback.publication}`,
    heading: withWindow.length > 1 && f.title ? DE.headingOf(f.title) : DE.heading,
    initiative: f.feedback.initiative,
    publication: f.feedback.publication,
  }))
}

/** The country a page serves: the code the portal's rows carry (ISO alpha-3) and its name in a sentence. */
export interface EuFeedbackCountry {
  code: string
  name: string
}

/** The configured member state — today's default of every page (`shared/utils/eu.ts`). */
export const EU_FEEDBACK_COUNTRY: EuFeedbackCountry = { code: EU_MEMBER_STATE, name: EU_MEMBER_STATE_NAME_DE }

/** A tab of the list: every kind, or one. */
export type EuFeedbackKindTab = 'alle' | EuFeedbackOrganisationType

/** The two orders: by day (the portal's, newest first) and by name. Never by a count. */
export type EuFeedbackSort = 'date' | 'name'

/** One row of the list: one contribution. */
export interface EuFeedbackRow {
  key: string
  /** Its place in the portal's order (newest first): the last tie-break of both orders. */
  index: number
  name: string
  type: EuFeedbackOrganisationType
  /** The kind in a row, singular. */
  kind: string
  date: string | null
  /** ISO alpha-3 as the portal gives it; shown as the code — the monitor keeps no table of country names. */
  country: string | null
  /** The contribution on the portal; null where the row carries no valid number. */
  url: string | null
  /** The link's accessible name. */
  linkLabel: string
}

export interface EuFeedbackTab {
  value: EuFeedbackKindTab
  label: string
  count: number
  selectLabel?: string
}

export interface EuFeedbackView {
  /** The portal's statement that nobody answered; null where someone did. */
  empty: string | null
  /** Rows were read, but none names an organisation; null otherwise. */
  noneNamed: string | null
  /** Where fewer rows were read than the portal counts: how many of how many, as a gap sentence; null otherwise. */
  cap: string | null
  /** The contributions, in the portal's order. */
  rows: EuFeedbackRow[]
  /**
   * The kinds that have a named row, in the fixed order, with how many; „Alle" first
   * where there are two or more — with one, „Alle" would be that tab
   * under a second name, and the one tab is the list's label and count.
   */
  tabs: EuFeedbackTab[]
  /** The chip „Aus <Land>": only with a country in scope and a named row from it. */
  country: { code: string; label: string; unavailable: string } | null
  /** The figures under the list: citizens, Sonstige, each kind's rows without a name, the rows not published. */
  counted: string[]
  /** Why organisations are counted without a name — only where one is. */
  unnamedReason: string | null
  /** That persons are counted and never named — only where one is. */
  citizensNote: string | null
}

/**
 * The reading as the fold's list and words. `country`: the country the
 * page serves, or null on a page that serves none.
 */
export function euFeedbackView(r: EuFeedbackReading, country: EuFeedbackCountry | null = EU_FEEDBACK_COUNTRY): EuFeedbackView {
  const rows: EuFeedbackRow[] = r.contributions.map((c, index) => ({
    key: `r${index}`,
    index,
    name: c.name,
    type: c.type,
    kind: DE.kind[c.type],
    date: c.date,
    country: c.country,
    url: c.url,
    linkLabel: DE.link(c.name),
  }))
  const kindTabs: EuFeedbackTab[] = r.kinds
    .map((k) => ({ value: k.type, label: DE.type[k.type], count: k.count - k.unnamed }))
    .filter((t) => t.count > 0)
  const tabs = kindTabs.length > 1 ? [{ value: 'alle' as const, label: DE.all, count: rows.length, selectLabel: DE.allSelect }, ...kindTabs] : kindTabs
  const fromCountry = country !== null && rows.some((row) => row.country === country.code)

  const counted: string[] = []
  if (r.citizens.count > 0) {
    counted.push(country ? `${DE.citizens(r.citizens.count)}, ${DE.citizensFrom(country.name, r.citizens.byCountry[country.code] ?? 0)}` : DE.citizens(r.citizens.count))
  }
  if (r.other > 0) counted.push(DE.other(r.other))
  for (const k of r.kinds) if (k.unnamed > 0) counted.push(countLabelDe(k.unnamed, DE.kind[k.type], DE.type[k.type]))
  if (r.unpublished > 0) counted.push(DE.unpublished(r.unpublished))

  const empty = r.read === 0 && r.total === 0
  return {
    empty: empty ? DE.empty : null,
    noneNamed: !empty && rows.length === 0 ? DE.noneNamed : null,
    cap: r.read < r.total ? DE.cap(r.read, r.total) : null,
    rows,
    tabs,
    country: fromCountry ? { code: country.code, label: DE.fromCountry(country.name), unavailable: DE.fromCountryNone(country.name) } : null,
    counted,
    unnamedReason: r.kinds.some((k) => k.unnamed > 0) ? DE.unnamedReason : null,
    citizensNote: r.citizens.count > 0 ? DE.citizensNote : null,
  }
}

/** What the reader chose: a kind, the country chip (with its code), a query, an order. */
export interface EuFeedbackSelection {
  kind: EuFeedbackKindTab
  /** The chip's country code where it is pressed; null where it is not, or there is none. */
  country: string | null
  query: string
  sort: EuFeedbackSort
  reversed: boolean
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true })

/**
 * Two orders. By day: newest first, the portal's own order, a row without
 * a day last either way (it has no place in a chronology), ties in the
 * portal's order. By name: German collation, A to Z, ties newest first.
 * Turned round, only the chosen key turns.
 */
export function compareFeedbackRows(a: EuFeedbackRow, b: EuFeedbackRow, sort: EuFeedbackSort, reversed = false): number {
  const sign = reversed ? -1 : 1
  if (sort === 'date') {
    if (!a.date !== !b.date) return a.date ? -1 : 1
    return sign * (b.date ?? '').localeCompare(a.date ?? '') || sign * (a.index - b.index)
  }
  const byName = sign * collator.compare(a.name, b.name)
  if (byName) return byName
  if (!a.date !== !b.date) return a.date ? -1 : 1
  return (b.date ?? '').localeCompare(a.date ?? '') || a.index - b.index
}

/** The rows of one kind (or all), before the chip and the search: what the chip's count counts. */
export const rowsOfKind = (rows: readonly EuFeedbackRow[], kind: EuFeedbackKindTab): EuFeedbackRow[] =>
  kind === 'alle' ? [...rows] : rows.filter((r) => r.type === kind)

/** The rows the list shows: kind AND country AND query, in the chosen order. The search reads the name alone, folded as the Stellungnahmen panel folds it (`matchesQuery`). */
export function feedbackRowsOf(rows: readonly EuFeedbackRow[], sel: EuFeedbackSelection): EuFeedbackRow[] {
  return rowsOfKind(rows, sel.kind)
    .filter((r) => sel.country === null || r.country === sel.country)
    .filter((r) => matchesQuery(r.name, sel.query))
    .sort((a, b) => compareFeedbackRows(a, b, sel.sort, sel.reversed))
}

/** The list's set line: what it is, and under a filter or a search how much of it is shown. */
export function feedbackSetLine(shown: number, total: number, narrowed: boolean): string {
  return narrowed ? DE.setOf(shown, total) : DE.set(total)
}
