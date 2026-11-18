/**
 * „Wer Rückmeldung gegeben hat" (step 4 of the EU cycle, 15.11.2026): the
 * block under a section's frame that reads who answered in one feedback
 * window on the Commission's portal — a list of the contributions of the
 * organisations the server's naming rule allows (`namedOrganisationOf`,
 * `server/utils/eu/portalFeedback.ts`), one row per contribution with its
 * day, kind and country and the link to it on the portal, and everything
 * counted without a name as closing rows of the same list.
 *
 * THE LIST OF THE STELLUNGNAHMEN, IN ITS GRAMMAR (maintainer, 15.11.2026):
 * kinds as tabs with their counts, the country the page serves as a chip,
 * a search over the names above twenty rows, the order by day, by name or
 * by Land in the column header, ten rows a page. Nothing is ordered by
 * count, nothing is „most active", and no figure stands for what a
 * contribution achieved (CLAUDE.md, „Framing"). The texts are not shown:
 * each row links its contribution on the portal.
 *
 * COUNTED ROWS CLOSE THE LIST (16.11.2026). What is counted without a name
 * — the organisations of a kind the naming rule does not name, citizens,
 * „Sonstige", rows the portal does not publish — is one muted row per
 * figure after the named rows, never a paragraph under the box: a kind's
 * tab counts its whole (named and unnamed), so the tabs add up to what the
 * Commission counts, and the rows under a tab add up to the tab. Citizens
 * have a tab of their own, one row per country, counted; in „Alle" they are
 * one closing row. A closing row has no link, no day and no country, so no
 * search and no chip can match it: under either it is not shown, and the
 * set line, which counts named rows only, never claims it.
 *
 * THE COUNTRY IS THE VIEW'S. The reading knows none; `euFeedbackView` takes
 * the country the page serves (the configured member state by default, as
 * `euBuergerinitiativeView` does) or null, and only with one is there a
 * chip „Aus <Land>" — without one nothing is said to be missing.
 *
 * THE NEWEST FIRST, THE REST AFTER (16.11.2026). The block reads by
 * itself up to the newest 1,000 (`EU_FEEDBACK_AUTO_PAGES`): page one of the
 * portal's list (100 contributions, newest first), then a step of five
 * pages (the newest 500, about twelve seconds later), then where more are
 * counted a second step of five (the newest 1,000) — one request each, so
 * each fits the server's five paced requests (`nextAutomaticStep`). The
 * list opens on page one: its named rows newest first and the pager over
 * them — the rows a reader sees first are on page one in any case; the
 * first step's rows are swapped in under the pager. Until the automatic
 * reading is complete (`feedbackStageOf`), no tabs, no counts, no chip, no
 * search, no order and no closing rows: a count, an order or a search over
 * part of the reading would be wrong and would change under the reader's
 * eyes. In the tool row's place one line says the rest is being read, or —
 * where an automatic step failed — a gap sentence with „Erneut versuchen"
 * for that step, the rows kept.
 *
 * MORE ON REQUEST (16.11.2026). Where the portal counts more than the
 * automatic reading holds, the list's first row says how many of how many,
 * and a button „Weitere N lesen" asks the server for the next step of five
 * pages (`feedbackMoreOf`) — past 1,000 the portal is asked only when a
 * reader wants the answer, never ahead.
 * While it reads, a progress line stands in the button's place and the list
 * stays as it is; the step's reading is swapped in when it arrives. At
 * 5,000 rows the monitor reads no further, and the row says so as a „Nicht
 * im Monitor" sentence. The row stands above the tabs: it changes their
 * counts as well as the rows (what a control changes stands at it or below
 * it).
 *
 * THE SET LINE ONLY WHILE NARROWED (16.11.2026, `feedbackSetLineVisible`).
 * Unfiltered, „12 Rückmeldungen von Organisationen mit Namen" repeated what
 * the tabs, the closing rows and the pager say; it stands visibly only
 * while a search or the country chip narrows the list — then it is the
 * result's count — and where no organisation is named at all. Otherwise it
 * is there for a screen reader alone, as before.
 *
 * All German copy of the block lives here, so a second language replaces it
 * here. Pure: no Vue; `EuFeedbackBlock` and `EuFeedbackPanel` place what
 * this returns.
 */
import type { EuFeedbackOrganisationType, EuFeedbackReading, EuRueckmeldungenResponse } from '#shared/types'
import { countryNameOf } from '#shared/utils/countryNames'
import { EU_MEMBER_STATE, EU_MEMBER_STATE_NAME_DE } from '#shared/utils/eu'
import { EU_FEEDBACK_AUTO_PAGES, EU_FEEDBACK_MAX_PAGES, EU_FEEDBACK_PAGE_SIZE, EU_FEEDBACK_STEP_PAGES } from '#shared/utils/euPortal'
import { countLabelDe, formatNumberDe } from '#shared/utils/format'
import { gapDe } from '#shared/utils/gaps'
import { matchesQuery } from '#shared/utils/textMatch'
import type { EuSectionFact } from './euRail'

const DE = {
  heading: 'Wer Rückmeldung gegeben hat',
  headingOf: (title: string) => `Wer Rückmeldung gegeben hat (${title})`,
  /** The one line while the portal is read, beside the spinner and in the live region. */
  loading: 'Die neuesten Rückmeldungen werden gelesen …',
  read: 'Die Rückmeldungen sind gelesen.',
  /** While only page one is in: the tool row's place, beside the spinner. */
  partialLoading: 'Die übrigen Rückmeldungen werden noch gelesen …',
  /** Where page one came and the rest did not: the rows stay, this stands in the tool row's place. */
  restUnread: (read: number) => gapDe('unavailable', `Die übrigen Rückmeldungen konnten nicht gelesen werden; gezeigt sind die Organisationen mit Namen unter den neuesten ${formatNumberDe(read)}.`),
  unread: gapDe('unavailable', 'Das Portal „Ihre Meinung zählt“ der Kommission hat die Liste der Rückmeldungen nicht rechtzeitig oder nicht lesbar geliefert.'),
  retry: 'Erneut versuchen',
  empty: 'Das Portal verzeichnet zu dieser Frist keine Rückmeldung.',
  noneNamed: 'Keine Organisation mit Namen unter den gelesenen Rückmeldungen.',
  /** How much was read where the portal counts more: the list's first row, beside „Weitere … lesen". */
  readSoFar: (read: number, total: number) => `Gelesen sind die neuesten ${formatNumberDe(read)} von ${formatNumberDe(total)} Rückmeldungen.`,
  /** The button: how many one press reads — what remains, at most one step. */
  readMore: (n: number) => `Weitere ${formatNumberDe(n)} lesen`,
  /** In the button's place while the next step is read, beside the spinner. */
  moreLoading: 'Weitere Rückmeldungen werden gelesen …',
  /** Where the next step failed: the list stays, this stands in the row with „Erneut versuchen". */
  moreUnread: (read: number, total: number) => gapDe('unavailable', `Weitere Rückmeldungen konnten nicht gelesen werden; gelesen sind die neuesten ${formatNumberDe(read)} von ${formatNumberDe(total)}.`),
  /** The live region, once a further step arrived. */
  moreRead: (read: number, total: number) => (read >= total
    ? `Weitere Rückmeldungen sind gelesen, jetzt alle ${formatNumberDe(total)}.`
    : `Weitere Rückmeldungen sind gelesen, jetzt die neuesten ${formatNumberDe(read)} von ${formatNumberDe(total)}.`),
  /** At the ceiling of 5,000 rows a window, more counted: what the monitor does not read, and that search, filter and order reach no further. */
  cap: (read: number, total: number) => gapDe('outOfScope', `Gelesen sind die neuesten ${formatNumberDe(read)} von ${formatNumberDe(total)} Rückmeldungen; mehr liest der Monitor zu einer Frist nicht, und Suche, Filter und Sortierung reichen nur über sie.`),
  listHeading: 'Liste der Rückmeldungen',
  /** What the list is; under a filter or a search how much of it is shown. */
  set: (n: number) => countLabelDe(n, 'Rückmeldung einer Organisation mit Namen', 'Rückmeldungen von Organisationen mit Namen'),
  setOf: (shown: number, n: number) => `${formatNumberDe(shown)} von ${DE.set(n)}`,
  /** The citizens' tab: what it is, and under the chip how much of it is shown. */
  citizensSet: (n: number) => `${countLabelDe(n, 'Bürgerin oder Bürger', 'Bürgerinnen und Bürger')}, nach Land gezählt`,
  citizensSetOf: (shown: number, n: number) => `${formatNumberDe(shown)} von ${countLabelDe(n, 'Bürgerin oder Bürger', 'Bürgerinnen und Bürgern')}`,
  kindsLabel: 'Rückmeldungen nach Art filtern',
  all: 'Alle',
  allSelect: 'Alle Arten',
  citizensTab: 'Bürgerinnen und Bürger',
  fromCountry: (country: string) => `Aus ${country}`,
  fromCountryNone: (country: string) => `Keine Rückmeldung aus ${country} in dieser Art`,
  search: 'Organisation suchen',
  noMatch: 'Keine Organisation gefunden',
  noMatchNote: 'Gesucht wird nur in den Namen der Organisationen; was ohne Namen gezählt ist, findet die Suche nicht.',
  noneInSelection: 'Keine Rückmeldung in dieser Auswahl',
  sortLabel: 'Sortieren',
  sortOptions: { date: 'Neueste', dateReversed: 'Älteste', name: 'Name A–Z', nameReversed: 'Name Z–A', country: 'Land A–Z', countryReversed: 'Land Z–A' },
  /** The citizens' tab orders by count: the day's place in the order („date") stands for it there. */
  citizensSortOptions: { date: 'Meiste zuerst', dateReversed: 'Wenigste zuerst', country: 'Land A–Z', countryReversed: 'Land Z–A' },
  column: { date: 'Datum', name: 'Organisation', kind: 'Art', country: 'Land', count: 'Anzahl' },
  order: {
    date: ['neueste zuerst', 'älteste zuerst'],
    name: ['A bis Z', 'Z bis A'],
    country: ['Land A bis Z', 'Land Z bis A'],
    count: ['meiste zuerst', 'wenigste zuerst'],
  } as const,
  countrySaid: 'Land',
  countSaid: 'Anzahl',
  /** A row whose country the portal gives no valid code for. */
  noCountry: 'ohne Angabe',
  /** The citizens counted without a valid country, as one row of their tab. */
  citizensNoCountry: 'ohne Angabe eines Landes',
  link: (name: string) => `Rückmeldung von ${name} im Portal der Kommission (neues Fenster)`,
  /** The one line under the list; „Methode" beside it opens who is counted without a name (`MethodEuRueckmeldungen`). */
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
  /** „weitere" before one of a kind, in the kind's gender; before several it is „weitere" for every kind. */
  furtherOne: {
    BUSINESS_ASSOCIATION: 'weiterer',
    COMPANY: 'weiteres',
    NGO: 'weitere',
    PUBLIC_AUTHORITY: 'weitere',
    ACADEMIC_RESEARCH_INSTITTUTION: 'weitere',
    TRADE_UNION: 'weitere',
    ENVIRONMENTAL_ORGANISATION: 'weitere',
    CONSUMER_ORGANISATION: 'weitere',
  } satisfies Record<EuFeedbackOrganisationType, string>,
  /** The closing rows: what is counted, never named. */
  unnamed: ' · ohne Namen',
  citizens: (n: number) => countLabelDe(n, 'Bürgerin oder Bürger', 'Bürgerinnen und Bürger'),
  other: (n: number) => countLabelDe(n, 'sonstige Rückmeldung', 'sonstige Rückmeldungen'),
  unpublished: (n: number) => countLabelDe(n, 'nicht veröffentlichte Rückmeldung', 'nicht veröffentlichte Rückmeldungen'),
} as const

/** The block's fixed words, for the components' states. */
export const EU_FEEDBACK_DE = DE

/** One block under a section's frame: the window it reads, and its heading. */
export interface EuFeedbackBlockView {
  key: string
  heading: string
  initiative: number
  publication: number
}

/**
 * The blocks of a section, one per fact that carries a window
 * (`EuSectionFact.feedback`), in the frame's order. One block is „Wer
 * Rückmeldung gegeben hat"; where a section has several (a Sondierung and a
 * public consultation), each heading names its fact.
 */
export function feedbackBlocksOf(facts: readonly EuSectionFact[]): EuFeedbackBlockView[] {
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

/** A tab of the list: every kind, one kind, or the citizens. */
export type EuFeedbackKindTab = 'alle' | 'buerger' | EuFeedbackOrganisationType

/**
 * The three orders: by day (the portal's, newest first), by name, by Land.
 * Never by a count of organisations; in the citizens' tab, whose rows are
 * countries, „date" orders by how many (`citizenRowsOf`).
 */
export type EuFeedbackSort = 'date' | 'name' | 'country'

/** One row of the list: one contribution. */
export interface EuFeedbackRow {
  key: string
  /** Its place in the portal's order (newest first): the last tie-break of every order. */
  index: number
  name: string
  type: EuFeedbackOrganisationType
  /** The kind in a row, singular. */
  kind: string
  date: string | null
  /** ISO alpha-3 as the portal gives it: what the chip compares. */
  country: string | null
  /** The country's name in German (`countryNameOf`): what the row shows and the order by Land compares. */
  countryName: string | null
  /** The contribution on the portal; null where the row carries no valid number. */
  url: string | null
  /** The link's accessible name. */
  linkLabel: string
}

/** A closing row: one figure counted without a name. No link, no day, no country. */
export interface EuFeedbackClosingRow {
  key: string
  /** The kind it belongs to, or „citizens", „other", „unpublished" — which appear in „Alle" only. */
  of: EuFeedbackOrganisationType | 'citizens' | 'other' | 'unpublished'
  label: string
}

/** A row of the citizens' tab: one country and how many from it. */
export interface EuFeedbackCitizenRow {
  key: string
  /** ISO alpha-3; null for the citizens without a valid country. */
  code: string | null
  name: string
  count: number
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
  /** The contributions, in the portal's order. */
  rows: EuFeedbackRow[]
  /** Every figure counted without a name, as closing rows, in the order „Alle" shows them. */
  closing: EuFeedbackClosingRow[]
  /** The citizens per country, by count (the tab's default order). */
  citizens: EuFeedbackCitizenRow[]
  /**
   * The kinds with any row read (named or not), in the fixed order, counting
   * both; then the citizens. „Alle" first, counting every row read, where
   * there are two tabs or more, or where a closing row stands in „Alle"
   * only („Sonstige", not published) — with one tab and nothing else,
   * „Alle" would be that tab under a second name.
   */
  tabs: EuFeedbackTab[]
  /** The chip „Aus <Land>": only with a country in scope and a row (named, or a citizen) from it. */
  country: { code: string; label: string; unavailable: string } | null
}

/**
 * The reading as the block's list and words. `country`: the country the
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
    countryName: c.country ? countryNameOf(c.country) : null,
    url: c.url,
    linkLabel: DE.link(c.name),
  }))

  const closing: EuFeedbackClosingRow[] = []
  for (const k of r.kinds) {
    if (k.unnamed <= 0) continue
    const named = k.count - k.unnamed
    const noun = countLabelDe(k.unnamed, DE.kind[k.type], DE.type[k.type])
    // „13 weitere …" after named rows of the kind; without one, „weitere" would point at nothing.
    const label = named > 0
      ? `${formatNumberDe(k.unnamed)} ${k.unnamed === 1 ? DE.furtherOne[k.type] : 'weitere'} ${k.unnamed === 1 ? DE.kind[k.type] : DE.type[k.type]}`
      : noun
    closing.push({ key: `u-${k.type}`, of: k.type, label: `${label}${DE.unnamed}` })
  }
  if (r.citizens.count > 0) closing.push({ key: 'u-citizens', of: 'citizens', label: `${DE.citizens(r.citizens.count)}${DE.unnamed}` })
  if (r.other > 0) closing.push({ key: 'u-other', of: 'other', label: `${DE.other(r.other)}${DE.unnamed}` })
  if (r.unpublished > 0) closing.push({ key: 'u-unpublished', of: 'unpublished', label: `${DE.unpublished(r.unpublished)}${DE.unnamed}` })

  const withCountry = Object.entries(r.citizens.byCountry).filter(([, n]) => n > 0)
  const withoutCountry = r.citizens.count - withCountry.reduce((sum, [, n]) => sum + n, 0)
  const citizens = citizenRowsOf(
    [
      ...withCountry.map(([code, count]) => ({ key: `c-${code}`, code, name: countryNameOf(code), count })),
      ...(withoutCountry > 0 ? [{ key: 'c-none', code: null, name: DE.citizensNoCountry, count: withoutCountry }] : []),
    ],
    { country: null, sort: 'date', reversed: false },
  )

  const otherTabs: EuFeedbackTab[] = [
    ...r.kinds.filter((k) => k.count > 0).map((k) => ({ value: k.type, label: DE.type[k.type], count: k.count })),
    ...(r.citizens.count > 0 ? [{ value: 'buerger' as const, label: DE.citizensTab, count: r.citizens.count }] : []),
  ]
  const allOnly = r.other > 0 || r.unpublished > 0
  const tabs = otherTabs.length > 1 || allOnly
    ? [{ value: 'alle' as const, label: DE.all, count: r.read, selectLabel: DE.allSelect }, ...otherTabs]
    : otherTabs

  const fromCountry = country !== null && (rows.some((row) => row.country === country.code) || (r.citizens.byCountry[country.code] ?? 0) > 0)
  return {
    empty: r.read === 0 && r.total === 0 ? DE.empty : null,
    rows,
    closing,
    citizens,
    tabs,
    country: fromCountry ? { code: country.code, label: DE.fromCountry(country.name), unavailable: DE.fromCountryNone(country.name) } : null,
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

/** Newest first, a row without a day after every row with one; ties in the portal's order. */
function byDay(a: EuFeedbackRow, b: EuFeedbackRow): number {
  if (!a.date !== !b.date) return a.date ? -1 : 1
  return (b.date ?? '').localeCompare(a.date ?? '') || a.index - b.index
}

/**
 * Three orders. By day: newest first, the portal's own order, a row without
 * a day last either way (it has no place in a chronology), ties in the
 * portal's order. By name: German collation, A to Z, ties newest first. By
 * Land: the German name of the country, A to Z, a row without a country
 * last either way, ties newest first. Turned round, only the chosen key
 * turns.
 */
export function compareFeedbackRows(a: EuFeedbackRow, b: EuFeedbackRow, sort: EuFeedbackSort, reversed = false): number {
  const sign = reversed ? -1 : 1
  if (sort === 'date') {
    if (!a.date !== !b.date) return a.date ? -1 : 1
    return sign * (b.date ?? '').localeCompare(a.date ?? '') || sign * (a.index - b.index)
  }
  if (sort === 'country') {
    if (!a.countryName !== !b.countryName) return a.countryName ? -1 : 1
    return sign * collator.compare(a.countryName ?? '', b.countryName ?? '') || byDay(a, b)
  }
  return sign * collator.compare(a.name, b.name) || byDay(a, b)
}

/** The rows of one kind (or all), before the chip and the search: what the chip's count counts. None under the citizens' tab. */
export const rowsOfKind = (rows: readonly EuFeedbackRow[], kind: EuFeedbackKindTab): EuFeedbackRow[] =>
  kind === 'alle' ? [...rows] : kind === 'buerger' ? [] : rows.filter((r) => r.type === kind)

/** The rows the list shows: kind AND country AND query, in the chosen order. The search reads the name alone, folded as the Stellungnahmen panel folds it (`matchesQuery`). */
export function feedbackRowsOf(rows: readonly EuFeedbackRow[], sel: EuFeedbackSelection): EuFeedbackRow[] {
  return rowsOfKind(rows, sel.kind)
    .filter((r) => sel.country === null || r.country === sel.country)
    .filter((r) => matchesQuery(r.name, sel.query))
    .sort((a, b) => compareFeedbackRows(a, b, sel.sort, sel.reversed))
}

/**
 * The closing rows under a tab: in „Alle" every figure, in a kind's tab its
 * own, in the citizens' tab none (its rows are counts already). None under
 * the chip or a search, which cannot match a row without a name or a
 * country. Their order is fixed, whatever the order of the named rows.
 */
export function closingRowsOf(closing: readonly EuFeedbackClosingRow[], sel: Pick<EuFeedbackSelection, 'kind' | 'country' | 'query'>, searchActive: boolean): EuFeedbackClosingRow[] {
  if (sel.country !== null || searchActive || sel.kind === 'buerger') return []
  return sel.kind === 'alle' ? [...closing] : closing.filter((c) => c.of === sel.kind)
}

/**
 * The citizens' rows: under the chip only its country. By count („date",
 * the tab's default: most first, turned round fewest first), ties by name;
 * by name or Land: the German name, A to Z. The row without a country
 * stands last in every order — it is no country to rank or to alphabetise.
 */
export function citizenRowsOf(rows: readonly EuFeedbackCitizenRow[], sel: Pick<EuFeedbackSelection, 'country' | 'sort' | 'reversed'>): EuFeedbackCitizenRow[] {
  const sign = sel.reversed ? -1 : 1
  return rows
    .filter((r) => sel.country === null || r.code === sel.country)
    .sort((a, b) => {
      if (!a.code !== !b.code) return a.code ? -1 : 1
      const byName = collator.compare(a.name, b.name)
      if (sel.sort === 'date') return sign * (b.count - a.count) || byName
      return sign * byName
    })
}

/** The list's set line: what it is, and under a filter or a search how much of it is shown. With no named row at all, it says so. */
export function feedbackSetLine(shown: number, total: number, narrowed: boolean): string {
  if (total === 0) return DE.noneNamed
  return narrowed ? DE.setOf(shown, total) : DE.set(total)
}

/**
 * Whether the set line stands visibly (16.11.2026): only while the search
 * or the country chip narrows the list — then it is the result's count —
 * or where no organisation is named at all (the box would hold no word
 * else). Otherwise it is for a screen reader alone: unfiltered it repeats
 * what the tabs, the closing rows and the pager say. A tab alone is no
 * narrowing here: its count stands on the tab.
 */
export function feedbackSetLineVisible(s: { searchActive: boolean; chip: boolean; noneNamed: boolean }): boolean {
  return s.searchActive || s.chip || s.noneNamed
}

/** The citizens' tab's set line: how many, and under the chip how many of them. */
export function citizensSetLine(shown: number, total: number, narrowed: boolean): string {
  return narrowed ? DE.citizensSetOf(shown, total) : DE.citizensSet(total)
}

/** Where a fetch of the block stands, as `useLazyFetch` reports it. */
export type EuFeedbackFetchStatus = 'idle' | 'pending' | 'success' | 'error'

/** Where the step asked last stands — an automatic one or a press of „Weitere … lesen": none asked, on its way, or failed. */
export type EuFeedbackStepStatus = 'idle' | 'pending' | 'error'

/** The rows the block reads by itself before it offers more (`EU_FEEDBACK_AUTO_PAGES`): the newest 1,000. */
export const FEEDBACK_AUTO_ROWS = EU_FEEDBACK_AUTO_PAGES * EU_FEEDBACK_PAGE_SIZE

/**
 * THE AUTOMATIC READING (16.11.2026): after an answer, the step the block
 * asks next by itself, or null where the automatic reading is complete.
 * Page one alone (`teilweise`) → the first step (five pages); a step of
 * fewer pages than `EU_FEEDBACK_AUTO_PAGES` that left rows unread → the
 * next step (ten pages); everything else — the whole list read, page one
 * the whole list (`pages` 1, or 0 for no contribution), or the automatic
 * depth reached — null. So a window of 480 or exactly 500 asks no second
 * step, and one of 1,000 or more none past ten pages: from there on a
 * reader asks („Weitere … lesen", `feedbackMoreOf`). A first answer that is
 * already a cached step of five pages goes on to ten from it. Pure.
 */
export function nextAutomaticStep(answer: EuRueckmeldungenResponse | null | undefined): number | null {
  if (!answer || answer.state === 'ungelesen') return null
  if (answer.state === 'teilweise') return EU_FEEDBACK_STEP_PAGES
  const { reading, pages } = answer
  if (reading.read >= reading.total || pages < EU_FEEDBACK_STEP_PAGES || pages >= EU_FEEDBACK_AUTO_PAGES) return null
  return pages + EU_FEEDBACK_STEP_PAGES
}

/**
 * What the block shows (16.11.2026, the automatic reading):
 * - `waiting`: the block is not reached yet, or page one is on its way — the loading line;
 * - `unread`: page one failed — the gap sentence and „Erneut versuchen";
 * - `partial`: page one, or a first step, is in, and the automatic reading goes on to step `next`
 *   (`restFailed` false) or that step failed (true) — the named rows read so far newest first and
 *   the pager, nothing that counts, filters or orders;
 * - `complete`: the automatic reading is done, or a further step is in — the full list; `pages` the
 *   step it is (5, 10, … 50; 1 where page one was the whole list, 0 for a window without a
 *   contribution).
 */
export type EuFeedbackStage =
  | { kind: 'waiting' }
  | { kind: 'unread' }
  | { kind: 'partial'; reading: EuFeedbackReading; restFailed: boolean; next: number }
  | { kind: 'complete'; reading: EuFeedbackReading; pages: number }

/**
 * Page one's fetch, the latest step that arrived (automatic or „Weitere …
 * lesen") and where the step asked last stands, as one stage. A step
 * replaces the reading only once it is in: while it is read, and where it
 * failed, the list keeps the reading it had. Partial as long as the
 * reading held asks for another automatic step (`nextAutomaticStep`), so
 * counts, tabs and search appear once, over the whole automatic reading,
 * and never change under the reader's eyes without their doing. A failed
 * automatic step stays partial, with the rows read so far (`restFailed`);
 * „Erneut versuchen" asks that step again. Pure.
 */
export function feedbackStageOf(
  first: { status: EuFeedbackFetchStatus; data: EuRueckmeldungenResponse | null | undefined },
  latest: EuRueckmeldungenResponse | null = null,
  stepStatus: EuFeedbackStepStatus = 'idle',
): EuFeedbackStage {
  let held: EuRueckmeldungenResponse
  if (latest?.state === 'gelesen') held = latest
  else if (first.status === 'error') return { kind: 'unread' }
  else if (first.status !== 'success' || !first.data) return { kind: 'waiting' }
  else held = first.data
  if (held.state === 'ungelesen') return { kind: 'unread' }
  const next = nextAutomaticStep(held)
  if (next === null) return { kind: 'complete', reading: held.reading, pages: held.pages }
  return { kind: 'partial', reading: held.reading, restFailed: stepStatus === 'error', next }
}

/** The automatic step a stage asks for by itself: partial, nothing on its way, nothing failed. „Erneut versuchen" asks a failed one (`retry`). */
export const automaticStepOf = (stage: EuFeedbackStage, stepStatus: EuFeedbackStepStatus): number | null =>
  stage.kind === 'partial' && stepStatus === 'idle' ? stage.next : null

/**
 * The list's first row where the portal counts more than was read
 * (16.11.2026), or null where everything was read:
 * - `offer`: how many of how many, and the button „Weitere N lesen" — N what
 *   remains, at most one step (500) — that asks for step `next`;
 * - `reading`: the same sentence, and the progress line in the button's place;
 * - `failed`: the next step failed — a „Gerade nicht abrufbar" sentence and
 *   „Erneut versuchen" for step `next`; the list keeps its reading;
 * - `cap`: fifty pages read and more counted — a „Nicht im Monitor"
 *   sentence, no button.
 */
export type EuFeedbackMore =
  | { kind: 'offer'; sentence: string; label: string; next: number }
  | { kind: 'reading'; sentence: string; progress: string }
  | { kind: 'failed'; gap: string; retry: string; next: number }
  | { kind: 'cap'; gap: string }

/** How many rows one more step reads at most: what remains, at most five pages, and never past 5,000. */
export function moreRowsOf(read: number, total: number): number {
  const step = EU_FEEDBACK_STEP_PAGES * EU_FEEDBACK_PAGE_SIZE
  return Math.max(0, Math.min(step, total - read, EU_FEEDBACK_MAX_PAGES * EU_FEEDBACK_PAGE_SIZE - read))
}

/** The row for a whole reading of `pages` pages (`EuFeedbackStage` complete), and where its next step stands. Pure. */
export function feedbackMoreOf(reading: EuFeedbackReading, pages: number, status: EuFeedbackStepStatus = 'idle'): EuFeedbackMore | null {
  if (reading.read >= reading.total) return null
  const step = Math.max(EU_FEEDBACK_STEP_PAGES, Math.floor(pages / EU_FEEDBACK_STEP_PAGES) * EU_FEEDBACK_STEP_PAGES)
  if (step >= EU_FEEDBACK_MAX_PAGES || moreRowsOf(reading.read, reading.total) === 0) return { kind: 'cap', gap: DE.cap(reading.read, reading.total) }
  const next = step + EU_FEEDBACK_STEP_PAGES
  if (status === 'pending') return { kind: 'reading', sentence: DE.readSoFar(reading.read, reading.total), progress: DE.moreLoading }
  if (status === 'error') return { kind: 'failed', gap: DE.moreUnread(reading.read, reading.total), retry: DE.retry, next }
  return { kind: 'offer', sentence: DE.readSoFar(reading.read, reading.total), label: DE.readMore(moreRowsOf(reading.read, reading.total)), next }
}

/**
 * What the block's live region says in a stage: the loading line, the rest
 * still read, the arrival, or a gap sentence. A further step: its arrival
 * once, or its failure; while it is read the line stays as it was, so
 * nothing is said twice — the progress line, which takes the focus from
 * the button, says it.
 */
export function feedbackAnnouncement(stage: EuFeedbackStage, more: EuFeedbackStepStatus = 'idle'): string {
  if (stage.kind === 'waiting') return DE.loading
  if (stage.kind === 'unread') return DE.unread
  if (stage.kind === 'partial') return stage.restFailed ? DE.restUnread(stage.reading.read) : DE.partialLoading
  if (more === 'error') return DE.moreUnread(stage.reading.read, stage.reading.total)
  // The automatic reading's end is „read"; only a step a reader asked for is „further".
  return stage.pages > EU_FEEDBACK_AUTO_PAGES ? DE.moreRead(stage.reading.read, stage.reading.total) : DE.read
}
