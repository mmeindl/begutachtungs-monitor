/**
 * The site search (`/suche`, 17.11.2026): one field, an answer per list.
 *
 * ONE ANSWER PER LIST, NEVER A POOLED ONE. The lists search different sets
 * by their own rule (`useFullTextSearch` says why that forbids one merged
 * list), so the page answers in groups — Entwürfe und Gesetze, Anliegen,
 * EU-Recht and its lists — each with the list's own count and its first
 * rows, and a link into the list with the term set, where the reader finds
 * the same rows. No ranking across groups, no total.
 *
 * THE SAME ROWS AS THE LIST. Every group is computed by its list's own
 * code: the draft list's rows by `useDraftList`, the Anliegen by
 * `anliegenSearchRows`, each EU list by its view function and its
 * `haystack`. A count here that differs from the list it links to would be
 * a defect, not a nuance.
 *
 * Without a term the page stands with its field and says what it searches.
 * The term is never stored: the page-view count keeps the path alone
 * (`server/utils/zaehlung/klassen.ts`).
 */
import type { EuActSummary } from '#shared/types'
import { ANLIEGEN_SECTION_DE } from '#shared/utils/anliegen'
import { EU_PAGE_TITLE_DE } from '#shared/utils/eu'
import type { SourceCode } from '#shared/utils/laender'
import { formatNumberDe } from '#shared/utils/format'
import { matchesQuery } from '#shared/utils/textMatch'
import type { EntryState, EntryView } from './entryView'
import { EU_ECI_LIST_DE, type EuEciListView } from './euEciList'
import { EU_FENSTER_DE, type EuFensterView } from './euFenster'
import { EU_MAP_HEADING_DE, EU_RESTATING_DE, euActHaystack, euActsRows, euRestatingRows, filterEuActs } from './euKarte'
import { EU_UMSETZUNG_DE, type EuUmsetzungView } from './euUmsetzung'

/** One row of an answer: what the list's row shows first — title, what it is, where it stands. */
export interface SearchHit {
  key: string
  /** The monitor's page; null where it has none (then `href`). */
  to: string | null
  href: string | null
  title: string
  /** What it is and which one: „Ministerialentwurf 132/ME", „Öffentliche Konsultation · Richtlinie". */
  detail: string | null
  state: EntryState
}

/** The rows a group shows before its link into the list. */
export const SEARCH_HITS_SHOWN = 5

const count = (n: number) => `${formatNumberDe(n)} Treffer`

export const SEARCH_DE = {
  title: 'Suche',
  lede: 'In den Entwürfen und Gesetzen, den Anliegen an das Parlament und im EU-Recht.',
  field: 'Entwürfe, Anliegen und EU-Recht durchsuchen',
  submit: 'Suchen',
  /** Before a term: what one can type. */
  hint: 'Ein Wort genügt: ein Thema, ein Gesetz oder eine Nummer wie „132/ME“.',
  count,
  noMatch: (q: string) => `Nichts passt zu „${q}“.`,
  /** The link under a group's rows, into the list with the term set. */
  allIn: (n: number, list: string) => (n > SEARCH_HITS_SHOWN ? `Alle ${formatNumberDe(n)} in ${list}` : `In ${list} ansehen`),
  drafts: {
    heading: 'Entwürfe und Gesetze',
    list: 'der Liste der Entwürfe',
    /** The list searches the full text of the running Begutachtungen too; this page does not. */
    fullText: 'Die Liste sucht dort auch im Volltext der laufenden Begutachtungen.',
  },
  anliegen: {
    heading: ANLIEGEN_SECTION_DE,
    list: 'den Anliegen',
    scope: 'In der laufenden Gesetzgebungsperiode, offene und erledigte.',
  },
  eu: {
    heading: EU_PAGE_TITLE_DE,
    list: 'dieser Liste',
    /** The lists without a hit, in one line rather than a box each. */
    noneIn: (headings: readonly string[]) => `Nichts gefunden in: ${headings.join(' · ')}.`,
  },
} as const

export function hitOfEntry(v: EntryView): SearchHit {
  const detail = [v.kindLabel, v.citation && !v.kindLabel.includes(v.citation) ? v.citation : null].filter(Boolean).join(' ')
  return { key: v.key, to: v.to, href: v.href, title: v.title, detail: detail || null, state: v.state }
}

/** One of the EU page's lists as an answer: its hits, or null where its source could not be read. */
export interface EuSearchGroup {
  id: 'fenster' | 'eci' | 'umsetzung' | 'akte' | 'wiederholt'
  heading: string
  /** Where the list stands on `/eu-recht`. */
  anchor: string
  hits: SearchHit[] | null
}

const hit = (key: string, to: string, title: string, detail: string | null, state: EntryState): SearchHit =>
  ({ key, to, href: null, title, detail, state })

/** „Jetzt offen: Rückmeldung an die Kommission" — its default tab, „Alle". */
export function fensterSearch(view: EuFensterView | null, q: string): EuSearchGroup {
  return {
    id: 'fenster',
    heading: EU_FENSTER_DE.heading,
    anchor: 'eu-fenster',
    hits: view?.tabs
      ? view.tabs.alle
          .filter((r) => matchesQuery(r.haystack, q))
          .map((r) => hit(r.key, r.path, r.title, [r.stage, r.act].filter(Boolean).join(' · '), r.state))
      : null,
  }
}

/** „Jetzt unterstützbar: Europäische Bürgerinitiativen" — one list, no tabs. */
export function eciSearch(view: EuEciListView | null, q: string): EuSearchGroup {
  return {
    id: 'eci',
    heading: EU_ECI_LIST_DE.heading,
    anchor: 'eu-buergerinitiativen',
    hits: view?.rows
      ? view.rows.filter((r) => matchesQuery(r.haystack, q)).map((r) => hit(r.key, r.path, r.title, 'Europäische Bürgerinitiative', r.state))
      : null,
  }
}

/**
 * The directives to transpose, both tabs, without the Commission's
 * delegated and implementing ones — the list's default chip. A seeded
 * search opens the list on the tab that holds a hit (`EuUmsetzungList`).
 */
export function umsetzungSearch(view: EuUmsetzungView | null, q: string): EuSearchGroup {
  return {
    id: 'umsetzung',
    heading: EU_UMSETZUNG_DE.heading,
    anchor: 'eu-umsetzung',
    hits: view?.tabs
      ? [...view.tabs.laufend, ...view.tabs.abgelaufen]
          .filter((r) => !r.commission && matchesQuery(r.haystack, q))
          .map((r) => hit(r.key, r.path, r.label, r.subject, r.state))
      : null,
  }
}

/**
 * The acts drafts implement, and apart the acts they only restate, under
 * the site's source choice as on the map. `builtAt: null` — the map not
 * built yet — is no hit list but a gap.
 */
export function actSearch(
  data: { builtAt: string | null; acts: readonly EuActSummary[]; restatingOnly: readonly EuActSummary[] } | null,
  chosen: readonly SourceCode[],
  q: string,
  today: string,
): EuSearchGroup[] {
  const ready = !!data?.builtAt
  const narrowed = (acts: readonly EuActSummary[]) => filterEuActs(acts, chosen).filter((a) => matchesQuery(euActHaystack(a), q))
  const rowHit = (r: ReturnType<typeof euActsRows>[number]) => hit(r.key, r.path, r.label, r.subject, r.state)
  return [
    { id: 'akte', heading: EU_MAP_HEADING_DE, anchor: 'eu-akte-heading', hits: ready ? euActsRows({ acts: narrowed(data!.acts) }).map(rowHit) : null },
    { id: 'wiederholt', heading: EU_RESTATING_DE.heading, anchor: 'eu-wiederholt-heading', hits: ready ? euRestatingRows({ restatingOnly: narrowed(data!.restatingOnly) }, today).map(rowHit) : null },
  ]
}
