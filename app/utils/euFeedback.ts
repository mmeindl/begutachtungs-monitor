/**
 * „Wer Rückmeldung gegeben hat" (step 4 of the EU cycle, 15.11.2026): the
 * fold under a section's frame that reads, on demand, who answered in one
 * feedback window on the Commission's portal — counts per kind of sender,
 * and the organisations the server's naming rule allows
 * (`namedOrganisationOf`, `server/utils/eu/portalFeedback.ts`).
 *
 * COUNTS AND NAMES, NOTHING ELSE. Kinds stand in a fixed order, names
 * alphabetically; nothing is ordered by count, nothing is „most active",
 * and no figure stands for what a contribution achieved (CLAUDE.md,
 * „Framing"). The texts of the contributions are not shown: the fact above
 * links the portal, where they are read.
 *
 * All German copy of the fold lives here, so a second language replaces it
 * here. Pure: no Vue; `EuFeedbackFold` places what this returns.
 */
import type { EuFeedbackOrganisationType, EuFeedbackReading } from '#shared/types'
import { formatNumberDe } from '#shared/utils/format'
import { gapDe } from '#shared/utils/gaps'
import type { EuSectionFact } from './euRail'

const DE = {
  heading: 'Wer Rückmeldung gegeben hat',
  headingOf: (title: string) => `Wer Rückmeldung gegeben hat (${title})`,
  loading: 'Rückmeldungen werden gelesen …',
  read: 'Die Rückmeldungen sind gelesen.',
  loadingNote: 'Das Portal wird behutsam abgefragt, eine Seite nach der anderen; das dauert einige Sekunden.',
  unread: gapDe('unavailable', 'Das Portal „Ihre Meinung zählt“ der Kommission hat die Liste der Rückmeldungen nicht rechtzeitig oder nicht lesbar geliefert.'),
  empty: 'Das Portal verzeichnet zu dieser Frist keine Rückmeldung.',
  cap: (read: number, total: number) => `Gelesen sind die neuesten ${formatNumberDe(read)} von ${formatNumberDe(total)} Rückmeldungen.`,
  /**
   * The kinds of organisation, as headings of their lines. OUR
   * translations of the portal's codes: its own German labels were not
   * read (as for the kinds of act, `shared/utils/euPortal.ts`).
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
  citizens: 'Bürgerinnen und Bürger',
  citizensNote: 'Privatpersonen werden gezählt, nie genannt.',
  other: 'Sonstige',
  otherNote: 'Ohne Angabe einer Organisationsart; gezählt, nie genannt.',
  // Always both figures, also where they are equal: the reader learns the rule's reach from every line.
  orgCount: (count: number, named: number) => `${formatNumberDe(count)}, davon ${formatNumberDe(named)} genannt`,
  unnamed: (n: number) => (n === 1 ? '1 Rückmeldung ohne Namen gezählt' : `${formatNumberDe(n)} Rückmeldungen ohne Namen gezählt`),
  repeated: (n: number) => `${formatNumberDe(n)} Rückmeldungen`,
  unnamedReason:
    'Ohne Namen zählt der Monitor Organisationen, hinter deren Namen eine einzelne Person stehen kann: Kleinstunternehmen und -organisationen ohne Nummer im Transparenzregister und Organisationen, deren Name den Namen der meldenden Person enthält. Ebenso gezählt wird, wo statt eines Namens eine Nummer, eine Adresse oder eine längere Beschreibung steht.',
  unpublished: (n: number) => (n === 1
    ? 'Eine weitere Rückmeldung führt das Portal nicht als veröffentlicht; der Monitor zählt sie ohne Art und nennt niemanden.'
    : `Weitere ${formatNumberDe(n)} Rückmeldungen führt das Portal nicht als veröffentlicht; der Monitor zählt sie ohne Art und nennt niemanden.`),
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

/** A name in the list: „Siemens AG (DEU)", with how often it answered where more than once. */
export interface EuFeedbackName {
  key: string
  name: string
  /** „DEU, AUT"; null where the portal gives no country. */
  countries: string | null
  /** „2 Rückmeldungen" where the organisation answered more than once; null otherwise. */
  repeated: string | null
}

/** One line of the fold: a kind of sender, its count, the names under it and what is counted without one. */
export interface EuFeedbackLine {
  key: string
  label: string
  /** „12, davon 9 genannt"; „278". */
  count: string
  names: EuFeedbackName[]
  /** „3 Rückmeldungen ohne Namen gezählt", or the sentence that persons are never named; null where nothing needs saying. */
  note: string | null
}

export interface EuFeedbackView {
  /** Where fewer rows were read than the portal counts: how many of how many; null otherwise. */
  cap: string | null
  /** The portal's statement that nobody answered; null where someone did. */
  empty: string | null
  lines: EuFeedbackLine[]
  /** Why organisations are counted without a name — only where one is. */
  unnamedReason: string | null
  /** The rows the portal does not list as published, counted apart. */
  unpublished: string | null
}

/** The reading as the fold's words. */
export function euFeedbackView(r: EuFeedbackReading): EuFeedbackView {
  const lines: EuFeedbackLine[] = r.organisations.map((g) => ({
    key: g.type,
    label: DE.type[g.type],
    count: DE.orgCount(g.count, g.count - g.unnamed),
    names: g.named.map((o, i) => ({
      key: `${i}|${o.name}`,
      name: o.name,
      countries: o.countries.length ? o.countries.join(', ') : null,
      repeated: o.rows > 1 ? DE.repeated(o.rows) : null,
    })),
    note: g.unnamed > 0 ? DE.unnamed(g.unnamed) : null,
  }))
  if (r.citizens > 0) lines.push({ key: 'citizens', label: DE.citizens, count: formatNumberDe(r.citizens), names: [], note: DE.citizensNote })
  if (r.other > 0) lines.push({ key: 'other', label: DE.other, count: formatNumberDe(r.other), names: [], note: DE.otherNote })
  return {
    cap: r.read < r.total ? DE.cap(r.read, r.total) : null,
    empty: r.read === 0 && r.total === 0 ? DE.empty : null,
    lines,
    unnamedReason: r.organisations.some((g) => g.unnamed > 0) ? DE.unnamedReason : null,
    unpublished: r.unpublished > 0 ? DE.unpublished(r.unpublished) : null,
  }
}
