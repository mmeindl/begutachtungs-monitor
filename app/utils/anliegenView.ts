/**
 * Everything the page of an Anliegen an das Parlament says in words — a
 * Petition, a Bürgerinitiative, a Volksbegehren, a Petition an den
 * Bundesrat — built from its
 * `AnliegenDetail` (step 2 of
 * `docs/research/umsetzungsplan-petitionen-volksbegehren.md`).
 *
 * The template only places what this module returns, so a second language
 * replaces this module and not the page.
 *
 * Pure module: no Nuxt auto-imports, so vitest reads it directly.
 *
 * WHAT IT NEVER SAYS:
 *  - a private person's name: a Bürgerinitiative is „von mindestens 500
 *    Bürgerinnen und Bürgern eingebracht", whoever stands in `names[]`, and
 *    the members of the Nationalrat who hand a Petition in are stated by club
 *    only, as an Initiativantrag's movers are (decision 6 of the plan);
 *  - whom the committee asked for a statement: the addressee names persons
 *    (step 0), so the committee's section counts the requests;
 *  - „einstimmig": „alle Klubs dafür" (docs/decisions.md, „Club votes");
 *  - a cause, or a verdict on an outcome. Every fact is temporal, and the
 *    states of the headline are words of one weight; no colour tells them
 *    apart (framing rule: success and shelving get one colour).
 */
import { gapDe, gapLabelDe } from '#shared/utils/gaps'
import { listDe } from './geltendeFassung'
import type {
  AnliegenClubVote,
  AnliegenCommittee,
  AnliegenDetail,
  AnliegenKind,
  AnliegenListResponse,
  AnliegenPeriodRef,
  AnliegenRow,
  AnliegenReportRef,
  AnliegenRoot,
  AnliegenState,
} from '#shared/types'
import {
  ANLIEGEN_KIND_LABEL,
  ANLIEGEN_PATH,
  ANLIEGEN_SECTION_DE,
  anliegenArrivedInGp,
  anliegenCitation,
  anliegenIsBundesrat,
  anliegenPath,
  anliegenStateOf,
  anliegenStatementFormUrl,
  anliegenSupportFormUrl,
} from '#shared/utils/anliegen'
import { CLUB_NAMES } from '#shared/utils/clubs'
import { gpSpanLabelDe } from '#shared/utils/gp'
import { formatDateDe, formatNumberDe } from '#shared/utils/format'
import { matchesQuery } from '#shared/utils/textMatch'
import type { EntryState, EntryView, SecondCount } from './entryView'
import { STATEMENT_QUOTE_PARLAMENT, STATEMENT_QUOTE_SOURCE } from './statementQuote'

// ---------------------------------------------------------------------------
// Shapes the page places
// ---------------------------------------------------------------------------

/** A link inside a line: in-site (`NuxtLink`) or to Parliament (`ExternalLink`). */
export interface AnliegenLink {
  href: string
  label: string
  external: boolean
}

/** One fact: `text`, then an optional link, then `after` — read as one phrase. */
export interface AnliegenFact {
  text: string
  link?: AnliegenLink
  after?: string
}

/** done: happened. current: the last step reached while the item still runs. open: did not happen (yet). */
export type AnliegenStepState = 'done' | 'current' | 'open'

/**
 * One step of the course. The committee's ending is an event inside the
 * committee's step, not a step of its own (as the Bundesrat's objection is
 * an event inside a draft's station), so there is no „Erledigung" row.
 */
export type AnliegenStepId = 'eingebracht' | 'ausschuss' | 'nationalrat' | 'fachausschuss' | 'erste-lesung' | 'bundesrat'

/**
 * A row of the rail: the step's name and its SUMMARY — at most one or two
 * plain facts, the outcome or the date. Everything else about the step
 * stands in its section (`AnliegenStationSection`), which the row links to.
 */
export interface AnliegenRailRow {
  id: AnliegenStepId
  name: string
  state: AnliegenStepState
  /** The yellow dot: the last step reached. Exactly one per rail. */
  marked: boolean
  /** The summary: plain facts, no links — the row itself is the link. */
  facts: AnliegenFact[]
  /** The step's section on the page (`#ausschuss`), exactly where one renders; null otherwise. */
  href: string | null
  /** The state in a word for a screen reader — never the dot alone. */
  announce: string
}

/** One fact row of a station section: a name, and the fact line under it (`FactList`). */
export interface AnliegenSectionRow {
  key: string
  title: string
  facts: AnliegenFact[]
}

/**
 * The section of one step reached: the same name as its rail row, so the
 * rail is the page's table of contents. Its rows carry what the rail's
 * summary leaves out — the sittings, the vote, the report's link.
 */
export interface AnliegenStationSection {
  id: AnliegenStepId
  /** The element id the rail row links to. */
  anchor: string
  heading: string
  rows: AnliegenSectionRow[]
  /**
   * A sentence that explains the step rather than reports it (what the
   * plenary votes on, the rule behind an Übermittlung, a committee without
   * an entry): its own line under the rows. Null where the step has none.
   */
  note: string | null
}

/** The headline's kind is the state's (`anliegenStateOf`). */
export type AnliegenHeadlineKind = AnliegenState['kind']

export interface AnliegenHeadline {
  kind: AnliegenHeadlineKind
  text: string
  /** The successor's page, beside the headline, for a carried-over item. */
  link: AnliegenLink | null
}

export interface AnliegenDoorView {
  /** Whether the door renders at all — only on an open flag of the item's own. */
  open: boolean
  heading: string
  /** All of one weight: Unterstützen and Stellungnahme are independent ways
   *  to take part at the same time, and no form is the lesser one. */
  actions: { key: 'support' | 'statement' | 'statement-organisation'; label: string; href: string }[]
  /** The window's one sentence: no Frist, closes with the item. */
  windowNote: string
  /** Parliament's own words on the Unterstützung, with its source, while that action is offered. */
  supportQuote: { text: string; source: string } | null
  /** Parliament's own words on what becomes of a Stellungnahme (`statementQuote.ts`),
   *  while that action is offered; none for a Petition an den Bundesrat, whose form was not read. */
  statementQuote: { text: string; source: string } | null
}

export interface AnliegenParticipationView {
  door: AnliegenDoorView
  /** One muted line where nothing can be done (no blue anywhere then). */
  closedLine: string | null
  /** For a Volksbegehren: where its Unterstützung happens, which the monitor does not follow. */
  volksbegehrenLine: string | null
}

export interface AnliegenCountFact {
  key: 'support' | 'statements'
  title: string
  /** The number, or „nicht lesbar" — never 0 for a count not read. */
  text: string
}

export interface AnliegenNotShown {
  /** The thing not shown, ending in a colon; null for a line that is one sentence. */
  lead: string | null
  text: string
  link?: AnliegenLink
  after?: string
}

export interface AnliegenView {
  identity: { kind: string; rest: string }
  headline: AnliegenHeadline
  railLabel: string
  /** The statements section's heading: „an den Nationalrat", for a Petition an den Bundesrat „an den Bundesrat". */
  statementsHeading: string
  /** „Keine Veröffentlichung der Dokumente": the documents section says so and lists none; null otherwise. */
  documentsNote: string | null
  rail: AnliegenRailRow[]
  /** One per step reached that has more to say than its rail row, in the rail's order. */
  sections: AnliegenStationSection[]
  /**
   * The section that holds the Stellungnahmen and the statement door: the
   * committee's, which reads them; the Einbringung's while no committee
   * holds the item yet. The window runs until the treatment ends, so on a
   * forwarded item a late one still stands here (the door's note says so).
   */
  statementsAt: AnliegenStepId
  participation: AnliegenParticipationView
  notShownHeading: string
  notShown: AnliegenNotShown[]
  seo: { title: string; description: string; ogTitle: string }
}

// ---------------------------------------------------------------------------
// Fixed copy
// ---------------------------------------------------------------------------

/** Where an item page's back link leads: the list of Anliegen (step 3 of the plan). */
export const ANLIEGEN_BACK_DE = { to: ANLIEGEN_PATH, label: 'Alle Anliegen' } as const

export const ANLIEGEN_PAGE_DE = {
  parliamentLink: 'Auf parlament.gv.at',
  railLabel: 'Das Anliegen im Nationalrat',
  railLabelBundesrat: 'Die Petition im Bundesrat',
  documentsHeading: 'Dokumente',
  documentsWithheld: gapDe('notPublished', 'die Dokumente dieser Petition.'),
  statementsHeading: 'Stellungnahmen an den Nationalrat',
  statementsHeadingBundesrat: 'Stellungnahmen an den Bundesrat',
  statementsFailed: 'die Stellungnahmen. Sie stehen',
  statementsFailedLink: 'auf parlament.gv.at',
  notShownHeading: 'Was diese Seite nicht zeigt',
  source: 'Parlament',
} as const

const PB_COMMITTEE = 'Ausschuss für Petitionen und Bürgerinitiativen'
const PLENARY_REPORT_NOTE = 'Der Nationalrat stimmt über den Bericht des Ausschusses ab, nicht über das einzelne Anliegen.'
/* Parliament's words: „Antrag auf Übermittlung an Volksanwaltschaft", „Antrag, der Übermittlung an die Volksanwaltschaft zuzustimmen". */
const VOLKSANWALTSCHAFT_AGREED = 'An die Volksanwaltschaft übermittelt'
const VOLKSANWALTSCHAFT_MOVED = 'Übermittlung an die Volksanwaltschaft beantragt'
const WINDOW_NOTE = 'Das Fenster hat keine Frist. Es schließt, wenn die Behandlung im Nationalrat endet.'
/* Never shown so far: all 42 Petitionen an den Bundesrat are closed (15.11.2026). */
const WINDOW_NOTE_BR = 'Das Fenster hat keine Frist. Es schließt, wenn die Behandlung im Bundesrat endet.'
const BR_COMMITTEE_DEFAULT = 'Ausschuss für BürgerInnenrechte und Petitionen'
/* An addressee that does not match the strict institutional shape is never passed through (`transmissionAddressees`). */
const BR_ADDRESSEE_UNKNOWN = 'eine Stelle der Bundesverwaltung'
/* § 25 Abs. 3 GO-BR. The rule, not a claim about the item: 30 of the 31
 * Übermittlungen came 180 days or more after the Zuweisung, one
 * (22/PET-BR/2008) 118 days after it and 210 after the Einlangen
 * (15.11.2026) — why is not in the record. */
const BR_TRANSMISSION_NOTE = 'Berichtet der Ausschuss nicht binnen sechs Monaten nach der Zuweisung, leitet die Präsidentin oder der Präsident des Bundesrates die Petition an das zuständige Mitglied der Bundesregierung weiter (§ 25 Abs. 3 GO-BR).'
const SUPPORT_QUOTE = 'Die elektronische Unterstützung dient der Abbildung der politischen Interessenlage und hat für die Beratungen im Nationalrat informativen Charakter.'
const VOLKSBEGEHREN_SUPPORT = gapDe('outOfScope', 'Unterstützung und Eintragung, bevor ein Volksbegehren im Nationalrat einlangt.')
/* No „mehr": whether an old item ever had the window is not read. */
const CLOSED_BOTH = 'Unterstützung und Stellungnahme sind nicht möglich.'
/* A Volksbegehren's `statementsstate` is „0" on 78 and „9 …" on 7 of 85: on
 * some it never was possible, so „nicht mehr" would claim a window it never had. */
const CLOSED_STATEMENT_VB = 'Eine Stellungnahme ist nicht möglich.'

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** A fact as plain text — what a screen reader and a test read. */
export function factText(f: AnliegenFact): string {
  return `${f.text}${f.link?.label ?? ''}${f.after ?? ''}`
}

/** „XXVIII. Gesetzgebungsperiode". */
function periodDe(gp: string): string {
  return `${gp}. Gesetzgebungsperiode`
}

/** A report's citation as a link to Parliament where its address is known. */
function reportFact(before: string, report: AnliegenReportRef, after = ''): AnliegenFact {
  return report.url
    ? { text: before, link: { href: report.url, label: report.citation, external: true }, after }
    : { text: `${before}${report.citation}${after}` }
}

/** The item of another period, as a link to its page here. */
function periodRefLink(ref: AnliegenPeriodRef, kind: AnliegenKind): AnliegenLink {
  const root: AnliegenRoot = { gp: ref.gp, kind, inr: ref.inr }
  return { href: anliegenPath(root), label: anliegenCitation(root), external: false }
}

/** „1 Sitzung am …", „3 Sitzungen, zuletzt am …", and „zuletzt vertagt" behind it. */
function sittingFacts(committee: Pick<AnliegenCommittee, 'sittings'>): AnliegenFact[] {
  const n = committee.sittings.length
  const last = committee.sittings.at(-1)
  if (!n || !last) return []
  const out: AnliegenFact[] = [
    { text: n === 1 ? `1 Sitzung am ${formatDateDe(last.date)}` : `${n} Sitzungen, zuletzt am ${formatDateDe(last.date)}` },
  ]
  if (last.adjourned) out.push({ text: n === 1 ? 'vertagt' : 'zuletzt vertagt' })
  return out
}

/** „3 Stellungnahmen angefordert" — the adopted requests counted, never whom they ask. */
function requestFacts(committee: Pick<AnliegenCommittee, 'statementRequests'>): AnliegenFact[] {
  const n = committee.statementRequests.filter((r) => r.adopted).length
  if (!n) return []
  return [{ text: n === 1 ? '1 Stellungnahme angefordert' : `${n} Stellungnahmen angefordert` }]
}

/**
 * A club vote in words: „alle Klubs dafür" where no club voted against —
 * never „einstimmig", which the vote line does not say —, otherwise who was
 * for and who against; „mit Mehrheit" where Parliament records a split the
 * reader does not take into clubs.
 */
export function voteFacts(vote: AnliegenClubVote | null, majorityOnly: boolean): AnliegenFact[] {
  if (vote && vote.for.length) {
    if (!vote.against.length) return [{ text: 'alle Klubs dafür' }]
    return [{ text: `dafür: ${vote.for.join(', ')}` }, { text: `dagegen: ${vote.against.join(', ')}` }]
  }
  return majorityOnly ? [{ text: 'mit Mehrheit' }] : []
}

/**
 * Who handed a Petition in, as the page of an Initiativantrag states its
 * movers: by club, never by name (`itemBylineDe`, `moverClubsOf`). The
 * clubs once each, in Parliament's order; the name is read nowhere here, so
 * it reaches neither the view nor the HTML.
 */
function presentersFact(presenters: AnliegenDetail['presenters'], bundesrat: boolean): AnliegenFact | null {
  if (!presenters.length) return null
  const clubs: string[] = []
  for (const p of presenters) {
    // A code the table does not know is left out rather than shown as a bare letter.
    const club = p.club ? CLUB_NAMES[p.club] : undefined
    if (club && !clubs.includes(club)) clubs.push(club)
  }
  // Members of the Bundesrat are never named either, only their club (docs/decisions.md).
  const chamber = bundesrat ? 'Bundesrates' : 'Nationalrates'
  const who = presenters.length === 1 ? `einem Mitglied des ${chamber}` : `Mitgliedern des ${chamber}`
  return { text: `${who}${clubs.length ? ` (${clubs.join(', ')})` : ''}` }
}

// ---------------------------------------------------------------------------
// The rail
// ---------------------------------------------------------------------------

/**
 * One step, in two depths: the SUMMARY the rail shows (the outcome or the
 * date, plain), and the ROWS its section shows (everything the record says
 * about the step, with links). `section: false` keeps a step without more
 * to say than its summary — the Erste Lesung, a date — off the page as a
 * section, so its rail row is no link (docs/decisions.md, „A step not
 * reached gets no section", which holds for an empty one too).
 */
interface Step {
  id: AnliegenStepId
  name: string
  reached: boolean
  summary: AnliegenFact[]
  rows: AnliegenSectionRow[]
  /** `AnliegenStationSection.note`. */
  note?: string
  section: boolean
}

/** A row only where it has a fact. */
function row(key: string, title: string, facts: AnliegenFact[]): AnliegenSectionRow[] {
  return facts.length ? [{ key, title, facts }] : []
}

function assignedFact(date: string | null, again = false): AnliegenFact[] {
  return date ? [{ text: `${again ? 'neu zugewiesen' : 'zugewiesen'} am ${formatDateDe(date)}` }] : []
}

/** The adopted Entschließungen as one row: „am 27.04.2023 angenommen (86/AEA)", or undated „angenommen (6/AEA)". */
function resolutionRow(resolutions: AnliegenDetail['course']['resolutions'], dated: boolean): AnliegenSectionRow[] {
  return row(
    'entschliessungen',
    resolutions.length === 1 ? 'Entschließung' : 'Entschließungen',
    resolutions.map((r) => ({ text: dated ? `am ${formatDateDe(r.date)} angenommen (${r.ref})` : `angenommen (${r.ref})` })),
  )
}

/** A report's step taken note of, as one phrase: „Bericht 200 d.B. am 24.09.2025 zur Kenntnis genommen". */
function reportTakenNote(before: string, report: AnliegenReportRef | null, date: string): AnliegenFact {
  return report
    ? reportFact(`${before} `, report, ` am ${formatDateDe(date)} zur Kenntnis genommen`)
    : { text: `Bericht des Ausschusses am ${formatDateDe(date)} zur Kenntnis genommen` }
}

/** A fact without its link, for the rail: the row is the link, and a second target inside it is not wanted. */
function plain(f: AnliegenFact): AnliegenFact {
  return { text: factText(f) }
}

function arrivalStep(d: AnliegenDetail): Step {
  const { course, root } = d
  const vb = root.kind === 'volksbegehren'
  const rows: AnliegenSectionRow[] = []
  let summary: AnliegenFact[] = []
  if (course.carriedFrom) {
    // A carried-over item's Einlangen is the day the new period took it up,
    // not the day it was filed: said as such, after the predecessor.
    rows.push(...row('uebernommen', 'Übernommen', [
      { text: `aus der ${periodDe(course.carriedFrom.gp)} (`, link: periodRefLink(course.carriedFrom, root.kind), after: ')' },
      ...(course.arrivedAt ? [{ text: `in der ${periodDe(root.gp)} seit ${formatDateDe(course.arrivedAt)}` }] : []),
    ]))
    summary = [{ text: `aus der ${periodDe(course.carriedFrom.gp)} übernommen` }]
  } else if (course.arrivedAt) {
    rows.push(...row('einlangen', 'Einlangen', [{ text: `am ${formatDateDe(course.arrivedAt)}` }]))
    summary = [{ text: `am ${formatDateDe(course.arrivedAt)}` }]
  }
  const presenters = root.kind === 'petition' || root.kind === 'petition-bundesrat'
    ? presentersFact(d.presenters, root.kind === 'petition-bundesrat')
    : null
  if (presenters) rows.push({ key: 'presenters', title: 'Überreicht von', facts: [presenters] })
  if (root.kind === 'buergerinitiative') rows.push({ key: 'presenters', title: 'Eingebracht von', facts: [{ text: 'mindestens 500 Bürgerinnen und Bürgern' }] })
  // The Unterstützung is given to the item itself, so its count stands with it.
  const support = anliegenCounts(d).find((c) => c.key === 'support')
  if (support) rows.push({ key: 'support', title: support.title, facts: [{ text: support.text }] })
  return { id: 'eingebracht', name: vb ? 'Eingelangt' : 'Eingebracht', reached: true, summary, rows, section: true }
}

/** The committee's ending in the rail's words, by kind — every kind its own line, none passed through. */
function disposalFact(disp: NonNullable<AnliegenDetail['course']['disposal']>): AnliegenFact {
  switch (disp.kind) {
    case 'kenntnisnahme': return { text: `Zur Kenntnis genommen am ${formatDateDe(disp.date)}` }
    case 'zuweisung': return { text: `An den ${disp.to ?? 'Fachausschuss'} weitergeleitet am ${formatDateDe(disp.date)}` }
    case 'volksanwaltschaft': return { text: `${VOLKSANWALTSCHAFT_MOVED} am ${formatDateDe(disp.date)}` }
  }
}

/** The plenary's step on a Petition or a Bürgerinitiative: the Sammelbericht taken note of, or the Übermittlung an die Volksanwaltschaft agreed to. */
function petitionPlenaryFacts(pl: NonNullable<AnliegenDetail['course']['plenary']>): AnliegenFact[] {
  switch (pl.kind) {
    case 'uebermittlung-zugestimmt':
      // A vote on this item's Übermittlung, not on a report: the clubs are said.
      return [{ text: `Der Übermittlung an die Volksanwaltschaft am ${formatDateDe(pl.date)} zugestimmt` }, ...voteFacts(pl.vote, pl.majorityOnly)]
    case 'bericht-zur-kenntnis':
    case 'kenntnisnahme':
      return [reportTakenNote('Sammelbericht', pl.report, pl.date)]
  }
}

/** Petition, Bürgerinitiative: Eingebracht · Ausschuss (with its Erledigung) · Nationalrat, and the Fachausschuss after a Zuweisung. */
function petitionSteps(d: AnliegenDetail): Step[] {
  const { course } = d
  const c = course.committee
  const disp = course.disposal
  const committee: Step = {
    id: 'ausschuss',
    name: PB_COMMITTEE,
    reached: c !== null || disp !== null,
    // The outcome where there is one, else the day it arrived there.
    summary: disp ? [disposalFact(disp)] : assignedFact(c?.assignedAt ?? null),
    rows: [
      ...row('beratung', 'Beratung', c ? [...assignedFact(c.assignedAt), ...sittingFacts(c), ...requestFacts(c)] : []),
      ...row('erledigung', 'Erledigung', disp ? [disposalFact(disp), ...voteFacts(disp.vote, disp.majorityOnly)] : []),
    ],
    section: true,
  }

  const pl = course.plenary
  const sc = course.subjectCommittee
  // An Entschließung adopted after the plenary's step on the Sammelbericht,
  // on a forwarded item, came with the subject committee's report (80/PET
  // XXVII): it stands in that committee's step; every other one in the
  // Nationalrat's.
  const withSubject = (r: AnliegenDetail['course']['resolutions'][number]) => sc !== null && pl !== null && r.date > pl.date
  const plenaryFacts = pl ? petitionPlenaryFacts(pl) : []
  const plenary: Step = {
    id: 'nationalrat',
    name: 'Nationalrat',
    reached: pl !== null,
    summary: plenaryFacts.slice(0, 1).map(plain),
    rows: [
      ...row('beschluss', 'Beschluss', plenaryFacts),
      ...resolutionRow(course.resolutions.filter((r) => !withSubject(r)), true),
    ],
    note: pl && pl.kind !== 'uebermittlung-zugestimmt' ? PLENARY_REPORT_NOTE : undefined,
    section: true,
  }

  const steps = [arrivalStep(d), committee]
  if (!sc) return [...steps, plenary]

  const deliberation: AnliegenFact[] = [...assignedFact(sc.assignedAt)]
  if (!sc.noEntry && !sc.report && sc.lastSitting) {
    deliberation.push({ text: `zuletzt am ${formatDateDe(sc.lastSitting)} behandelt` })
    if (sc.adjourned) deliberation.push({ text: 'vertagt' })
  }
  const report = !sc.noEntry && sc.report ? reportFact('', sc.report) : null
  const subject: Step = {
    id: 'fachausschuss',
    name: sc.name,
    reached: sc.assignedAt !== null || !sc.noEntry,
    // The report where there is one, else the last sitting, else the day it arrived.
    summary: report
      ? [{ text: `Bericht ${factText(report)}` }]
      : deliberation.length > 1 ? [deliberation[1]!] : deliberation,
    rows: [
      ...row('beratung', 'Beratung', deliberation),
      ...row('bericht', 'Bericht', report ? [report] : []),
      ...resolutionRow(course.resolutions.filter(withSubject), true),
    ],
    note: sc.noEntry ? 'Im Verlauf des Parlaments steht zu diesem Ausschuss kein Eintrag.' : undefined,
    section: true,
  }
  // In the order things happened: the plenary takes note of the Sammelbericht
  // that reports the Zuweisung, and the item lives on in the subject committee
  // (1/BI XXVIII). Before that report is taken note of, the subject committee
  // already holds the item, so its step stands before the plenary's.
  return pl ? [...steps, plenary, subject] : [...steps, subject, plenary]
}

/** Volksbegehren: Eingelangt · Erste Lesung (where held) · the committee by its name · Nationalrat. */
function volksbegehrenSteps(d: AnliegenDetail): Step[] {
  const { course } = d
  const steps: Step[] = [arrivalStep(d)]
  if (course.firstReading) {
    const facts = [{ text: `am ${formatDateDe(course.firstReading)}` }]
    steps.push({ id: 'erste-lesung', name: 'Erste Lesung', reached: true, summary: facts, rows: [], section: false })
  }
  const c = course.committee
  const duties: AnliegenFact[] = []
  if (course.duties?.deliberationBy) duties.push({ text: `Vorberatung aufzunehmen bis ${formatDateDe(course.duties.deliberationBy)}` })
  if (course.duties?.reportBy) duties.push({ text: `Bericht zu erstatten bis ${formatDateDe(course.duties.reportBy)}` })
  const report = course.committeeReport ? reportFact('', course.committeeReport) : null
  steps.push({
    id: 'ausschuss',
    name: c?.name || 'Ausschuss',
    reached: c !== null,
    summary: report ? [{ text: `Bericht ${factText(report)}` }] : assignedFact(c?.assignedAt ?? null),
    rows: [
      ...row('beratung', 'Beratung', c ? [...assignedFact(c.assignedAt), ...sittingFacts(c), ...requestFacts(c)] : []),
      ...row('fristen', 'Fristen', duties),
      ...row('bericht', 'Bericht', report ? [report] : []),
    ],
    section: true,
  })

  const pl = course.plenary
  const decision: AnliegenFact | null = pl
    ? pl.kind === 'kenntnisnahme' ? { text: `Zur Kenntnis genommen am ${formatDateDe(pl.date)}` } : reportTakenNote('Bericht', pl.report, pl.date)
    : null
  steps.push({
    id: 'nationalrat',
    name: 'Nationalrat',
    reached: pl !== null,
    summary: decision ? [plain(decision)] : [],
    rows: [
      ...row('beschluss', 'Beschluss', decision && pl ? [decision, ...voteFacts(pl.vote, pl.majorityOnly)] : []),
      ...resolutionRow(course.resolutions, false),
    ],
    section: true,
  })
  return steps
}

/** A committee of the Bundesrat by its name without „des Bundesrates" — the rail stands under „Die Petition im Bundesrat". */
function bundesratCommitteeName(name: string): string {
  return name.replace(/\s+des Bundesrates$/, '')
}

/** „das Bundeskanzleramt", „das Bundesministerium für Inneres", a list of them, or „eine Stelle der Bundesverwaltung". */
export function transmissionToDe(to: readonly string[] | null): string {
  if (!to?.length) return BR_ADDRESSEE_UNKNOWN
  return to.length === 1 ? to[0]! : `${to.slice(0, -1).join(', ')} und ${to.at(-1)}`
}

/**
 * Petition an den Bundesrat: Eingebracht · its committee (with its
 * Erledigung) · the Bundesrat. The Erledigung is the Übermittlung to the
 * administration (31 of 42), the committee's report (10), or „gilt als
 * zurückgezogen" (1). The Bundesrat's row stands only where the item could
 * reach it: after a report, or while nothing has ended it — an Übermittlung
 * or a withdrawal ends the record, and an unreached row there would suggest
 * a step owed.
 */
function bundesratSteps(d: AnliegenDetail): Step[] {
  const { course } = d
  const c = course.committee
  const deliberation: AnliegenFact[] = []
  if (c?.reassignedFrom) deliberation.push({ text: `zuvor dem ${bundesratCommitteeName(c.reassignedFrom)} zugewiesen` })
  if (c) deliberation.push(...assignedFact(c.assignedAt, c.reassignedFrom !== null), ...sittingFacts(c))

  let ending: AnliegenFact | null = null
  if (course.transmission) {
    ending = { text: `An ${transmissionToDe(course.transmission.to)} übermittelt am ${formatDateDe(course.transmission.date)}` }
  } else if (course.committeeReport) {
    ending = reportFact('Bericht des Ausschusses ', course.committeeReport)
  } else if (course.withdrawnAt) {
    ending = { text: `Gilt seit ${formatDateDe(course.withdrawnAt)} als zurückgezogen (§ 16 Abs. 5 GO-BR)` }
  }
  const committee: Step = {
    id: 'ausschuss',
    name: c ? bundesratCommitteeName(c.name) : BR_COMMITTEE_DEFAULT,
    reached: c !== null || ending !== null,
    summary: ending ? [plain(ending)] : assignedFact(c?.assignedAt ?? null, c?.reassignedFrom != null),
    rows: [...row('beratung', 'Beratung', deliberation), ...row('erledigung', 'Erledigung', ending ? [ending] : [])],
    note: course.transmission ? BR_TRANSMISSION_NOTE : undefined,
    section: true,
  }

  const steps = [arrivalStep(d), committee]
  if (course.transmission || course.withdrawnAt) return steps
  const pl = course.plenary
  const decision = pl ? reportTakenNote('Bericht', pl.report, pl.date) : null
  return [...steps, {
    id: 'bundesrat',
    name: 'Bundesrat',
    reached: pl !== null,
    summary: decision ? [plain(decision)] : [],
    rows: [
      ...row('beschluss', 'Beschluss', decision && pl ? [decision, ...voteFacts(pl.vote, pl.majorityOnly)] : []),
      ...resolutionRow(course.resolutions, false),
    ],
    section: true,
  }]
}

/** Whether the item still runs in the Nationalrat — then its last step reached is the current one. */
function stillRunning(d: AnliegenDetail, headline: AnliegenHeadline): boolean {
  if (d.periodEnded) return false
  return headline.kind === 'in-behandlung' || headline.kind === 'weitergeleitet' || headline.kind === 'weitergeleitet-bericht'
}

function stepsOf(d: AnliegenDetail): Step[] {
  switch (d.root.kind) {
    case 'petition':
    case 'buergerinitiative':
      return petitionSteps(d)
    case 'volksbegehren':
      return volksbegehrenSteps(d)
    case 'petition-bundesrat':
      return bundesratSteps(d)
  }
}

/** A step has a section when it was reached and says more than its summary; the Einbringung always (its documents). */
function hasSection(s: Step): boolean {
  if (s.id === 'eingebracht') return true
  return s.reached && s.section && (s.rows.length > 0 || s.note !== undefined)
}

/**
 * The sections, in the rail's order. Built from the same steps as the rail,
 * so a row links exactly where a section renders.
 */
export function anliegenSections(d: AnliegenDetail): AnliegenStationSection[] {
  return stepsOf(d).filter(hasSection).map((s) => ({
    id: s.id,
    anchor: s.id,
    heading: s.name,
    rows: s.rows,
    note: s.note ?? null,
  }))
}

/**
 * The rail. Each row says its state in a word („erreicht", „nicht
 * erreicht"); a row the item did not reach shows nothing else, as SpineRail
 * keeps an unreached station silent but for that word.
 */
export function anliegenRail(d: AnliegenDetail, headline: AnliegenHeadline = anliegenHeadline(d)): AnliegenRailRow[] {
  const steps = stepsOf(d)
  let markedAt = -1
  steps.forEach((s, i) => {
    if (s.reached) markedAt = i
  })
  const running = stillRunning(d, headline)
  return steps.map((s, i) => ({
    id: s.id,
    name: s.name,
    state: !s.reached ? 'open' : i === markedAt && running ? 'current' : 'done',
    marked: i === markedAt,
    facts: s.reached ? s.summary : [],
    href: hasSection(s) ? `#${s.id}` : null,
    announce: s.reached ? 'erreicht' : 'nicht erreicht',
  }))
}

// ---------------------------------------------------------------------------
// The headline
// ---------------------------------------------------------------------------

/**
 * Where the item stands, in one line — the weakest state the evidence
 * supports. The decision is `anliegenStateOf` (shared with the list's rows);
 * this words it and links a carried-over item's successor.
 */
export function anliegenHeadline(d: AnliegenDetail): AnliegenHeadline {
  const state = anliegenStateOf(d.root, d.course, d.periodEnded)
  return {
    kind: state.kind,
    text: anliegenStateDe(state),
    link: state.kind === 'uebernommen'
      ? { href: anliegenPath(state.successor), label: anliegenCitation(state.successor), external: false }
      : null,
  }
}

/** A state in words — the page's headline and the list row's state, one wording. */
export function anliegenStateDe(state: AnliegenState): string {
  switch (state.kind) {
    case 'uebernommen': return `In die ${periodDe(state.successor.gp)} übernommen`
    case 'weitergeleitet': return `An den ${state.committee} weitergeleitet`
    case 'weitergeleitet-bericht': return `An den ${state.committee} weitergeleitet, dort Bericht ${state.report}`
    case 'kenntnisnahme-ausschuss': return 'Im Ausschuss zur Kenntnis genommen'
    case 'volksanwaltschaft': return state.agreed ? VOLKSANWALTSCHAFT_AGREED : VOLKSANWALTSCHAFT_MOVED
    case 'volksbegehren-kenntnisnahme': return 'Vom Nationalrat zur Kenntnis genommen'
    case 'bericht-zur-kenntnis': return 'Bericht des Ausschusses vom Nationalrat zur Kenntnis genommen'
    case 'ohne-erledigung-periode-beendet': return 'Ohne Erledigung – Gesetzgebungsperiode beendet'
    case 'in-behandlung': return 'In Behandlung'
    case 'uebermittelt': return `An ${transmissionToDe(state.to)} übermittelt`
    case 'bundesrat-bericht-zur-kenntnis': return 'Bericht des Ausschusses vom Bundesrat zur Kenntnis genommen'
    case 'zurueckgezogen': return 'Gilt als zurückgezogen'
  }
}

// ---------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------

/**
 * Unterstützen and Stellung nehmen, each only on the item's own open flag —
 * the door is blue, and blue means one can act. Closed, a muted line says so
 * and nothing is blue. A Volksbegehren takes no Unterstützung in the
 * Nationalrat at all; the page says where it does, without a link (the
 * official address is not verified).
 */
export function anliegenParticipation(d: AnliegenDetail): AnliegenParticipationView {
  const vb = d.root.kind === 'volksbegehren'
  const supportOpen = d.participation.support === 'open' && !vb
  const statementOpen = d.participation.statements === 'open'
  const actions: AnliegenDoorView['actions'] = []
  if (supportOpen) actions.push({ key: 'support', label: 'Unterstützen', href: anliegenSupportFormUrl(d.root) })
  // Both of Parliament's forms, each opened (`docs/decisions.md`, „A door
  // lands in the form"). A Petition an den Bundesrat keeps the one, the
  // `formlink` Parliament gives: `orgForm` is not checked on its pages.
  if (statementOpen && anliegenIsBundesrat(d.root.kind)) {
    actions.push({ key: 'statement', label: 'Stellung nehmen', href: anliegenStatementFormUrl(d.root) })
  } else if (statementOpen) {
    actions.push(
      { key: 'statement', label: 'Stellungnahme als Privatperson', href: anliegenStatementFormUrl(d.root, 'person') },
      { key: 'statement-organisation', label: 'Stellungnahme für eine Organisation', href: anliegenStatementFormUrl(d.root, 'organisation') },
    )
  }
  const heading = supportOpen && statementOpen
    ? 'Unterstützung und Stellungnahme möglich'
    : supportOpen ? 'Unterstützung möglich' : 'Stellungnahme möglich'
  const door: AnliegenDoorView = {
    open: actions.length > 0,
    heading,
    actions,
    windowNote: anliegenIsBundesrat(d.root.kind) ? WINDOW_NOTE_BR : WINDOW_NOTE,
    supportQuote: supportOpen ? { text: SUPPORT_QUOTE, source: ANLIEGEN_PAGE_DE.source } : null,
    statementQuote: statementOpen && !anliegenIsBundesrat(d.root.kind)
      ? { text: STATEMENT_QUOTE_PARLAMENT, source: STATEMENT_QUOTE_SOURCE }
      : null,
  }
  let closedLine: string | null = null
  if (!door.open) closedLine = vb ? CLOSED_STATEMENT_VB : CLOSED_BOTH
  return { door, closedLine, volksbegehrenLine: vb ? VOLKSBEGEHREN_SUPPORT : null }
}

// ---------------------------------------------------------------------------
// Counts and what the page cannot show
// ---------------------------------------------------------------------------

/**
 * The two counts as fact rows: „Unterstützungen" over „24"; an unread count
 * says „nicht lesbar", never 0. No Unterstützungen for a Volksbegehren. The
 * support count stands in the Einbringung's section; the statements count
 * only where no table states it (`statementsCountRow`).
 */
export function anliegenCounts(d: AnliegenDetail): AnliegenCountFact[] {
  const count = (n: number | null) => (n === null ? 'nicht lesbar' : formatNumberDe(n))
  const out: AnliegenCountFact[] = []
  if (d.root.kind !== 'volksbegehren') out.push({ key: 'support', title: 'Unterstützungen', text: count(d.counts.support) })
  out.push({ key: 'statements', title: 'Stellungnahmen', text: count(d.counts.statements) })
  return out
}

/**
 * „Stellungnahmen: 0" or „nicht lesbar" as a row, where the page shows no
 * table that counts them: a closed item without any, or a count not read.
 * Where there are some, or the window is open, the table's tabs count them
 * and a row would say it twice.
 */
function statementsCountRow(d: AnliegenDetail): AnliegenSectionRow[] {
  const n = d.counts.statements
  if (n !== null && (n > 0 || d.participation.statements === 'open')) return []
  const c = anliegenCounts(d).find((x) => x.key === 'statements')!
  return [{ key: 'statements', title: c.title, facts: [{ text: c.text }] }]
}

/** Each gap with its reason (CLAUDE.md, „Say what cannot be shown, and why"). */
export function anliegenNotShown(d: AnliegenDetail): AnliegenNotShown[] {
  if (anliegenIsBundesrat(d.root.kind)) return [...bundesratNotShown(d), ...unreadNotShown(d)]
  const vb = d.root.kind === 'volksbegehren'
  const out: AnliegenNotShown[] = [
    {
      lead: 'Was aus dem Anliegen nach dem Nationalrat wurde:',
      text: 'Keine Quelle verknüpft ein späteres Gesetz mit einer Petition, einer Bürgerinitiative oder einem Volksbegehren.',
    },
  ]
  // Each gap only where the item has the thing it is about: a reason only
  // after a Kenntnisnahme, addressees only where a request was adopted.
  if (!vb) {
    if (d.course.disposal?.kind === 'kenntnisnahme') {
      out.push({
        lead: 'Warum der Ausschuss zur Kenntnis genommen hat:',
        text: 'Der Verlauf nennt den Antrag und die Abstimmung, keinen Grund.',
      })
    }
    // Agreed by the plenary: the record ends there (the Bundesrat's Übermittlung reads the same way).
    if (d.course.disposal?.kind === 'volksanwaltschaft' && d.course.plenary?.kind === 'uebermittlung-zugestimmt') {
      out.push({
        lead: 'Was die Volksanwaltschaft mit dem Anliegen getan hat:',
        text: 'Der Verlauf des Parlaments endet mit der Übermittlung.',
      })
    }
    if (d.course.committee?.statementRequests.some((r) => r.adopted)) {
      out.push({
        lead: 'Von wem der Ausschuss Stellungnahmen angefordert hat:',
        text: 'Das Parlament nennt dabei auch einzelne Personen; der Monitor zeigt deshalb nur die Zahl.',
      })
    }
  } else {
    out.push({
      lead: 'Unterstützung und Eintragung vor dem Einlangen im Nationalrat:',
      text: 'Sie liegen beim Bundesministerium für Inneres, ohne Schnittstelle.',
    })
  }
  return [...out, ...unreadNotShown(d)]
}

/** What a Petition an den Bundesrat's page cannot show, each only where the item has the thing it is about. */
function bundesratNotShown(d: AnliegenDetail): AnliegenNotShown[] {
  const out: AnliegenNotShown[] = [
    {
      lead: 'Was aus der Petition nach dem Bundesrat wurde:',
      text: 'Keine Quelle verknüpft ein späteres Gesetz mit einer Petition an den Bundesrat.',
    },
  ]
  if (d.course.transmission) {
    out.push({
      lead: 'Was die Verwaltung mit der Petition getan hat:',
      text: 'Der Verlauf des Parlaments endet mit der Übermittlung.',
    })
  }
  if (d.course.committeeReport) {
    out.push({
      lead: 'Warum der Ausschuss so berichtet hat:',
      text: 'Der Verlauf nennt den Bericht und die Abstimmung über ihn, keinen Grund.',
    })
  }
  return out
}

/** The stages no pattern recognised, counted, with Parliament's page where they stand. */
function unreadNotShown(d: AnliegenDetail): AnliegenNotShown[] {
  const n = d.course.unreadStages
  if (n <= 0) return []
  return [{
    lead: null,
    text: n === 1
      ? '1 Eintrag im Verlauf des Parlaments konnte der Monitor nicht zuordnen; er steht '
      : `${n} Einträge im Verlauf des Parlaments konnte der Monitor nicht zuordnen; sie stehen `,
    link: { href: d.parliamentUrl, label: 'auf parlament.gv.at', external: true },
    after: '.',
  }]
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/** The kind's word, for the loading label before the record arrives. */
export function anliegenLoadingLabelDe(kind: AnliegenKind | null): string {
  return `${kind ? ANLIEGEN_KIND_LABEL[kind].one : 'Anliegen'} wird geladen …`
}

export function anliegenView(d: AnliegenDetail): AnliegenView {
  const kind = ANLIEGEN_KIND_LABEL[d.root.kind].one
  const headline = anliegenHeadline(d)
  const vb = d.root.kind === 'volksbegehren'
  const br = anliegenIsBundesrat(d.root.kind)
  const base = anliegenSections(d)
  const statementsAt: AnliegenStepId = base.some((s) => s.id === 'ausschuss') ? 'ausschuss' : 'eingebracht'
  const sections = base.map((s) =>
    s.id === statementsAt ? { ...s, rows: [...s.rows, ...statementsCountRow(d)] } : s)
  return {
    // The Bundesrat has no period: the citation alone, its year in it („56/PET-BR/2024").
    identity: { kind, rest: br ? d.citation : `${d.citation} · ${periodDe(d.root.gp)}` },
    headline,
    railLabel: br ? ANLIEGEN_PAGE_DE.railLabelBundesrat : ANLIEGEN_PAGE_DE.railLabel,
    statementsHeading: br ? ANLIEGEN_PAGE_DE.statementsHeadingBundesrat : ANLIEGEN_PAGE_DE.statementsHeading,
    documentsNote: d.course.documentsWithheld ? ANLIEGEN_PAGE_DE.documentsWithheld : null,
    rail: anliegenRail(d, headline),
    sections,
    statementsAt,
    participation: anliegenParticipation(d),
    notShownHeading: ANLIEGEN_PAGE_DE.notShownHeading,
    notShown: anliegenNotShown(d),
    seo: {
      title: `${d.citation}: ${d.title}`,
      description: `${kind} ${d.citation}: Verlauf im ${br ? 'Bundesrat' : 'Nationalrat'}${vb ? ' und Stellungnahmen' : ', Unterstützungen und Stellungnahmen'}.`,
      ogTitle: d.title,
    },
  }
}

// ---------------------------------------------------------------------------
// The list (step 3 of the plan)
// ---------------------------------------------------------------------------

export const ANLIEGEN_LIST_DE = {
  title: ANLIEGEN_SECTION_DE,
  lede: 'Petitionen, Bürgerinitiativen und Volksbegehren im Nationalrat, Petitionen an den Bundesrat – und wo Sie jetzt unterstützen oder Stellung nehmen können.',
  /** The item page's meta description before its record arrives. */
  seoFallback: `Ein ${ANLIEGEN_SECTION_DE}.`,
  artLabel: 'Art',
  periodLabel: 'Zeitraum',
  /** Before the server named the running period: the select's placeholder, as on /entwuerfe. */
  periodPending: 'Zeitraum …',
  onlyOpen: 'Nur offene',
  /**
   * Why „Nur offene" cannot be used in an ended period (the toggle stays in
   * place, dashed, as „Stellungnahme möglich" on /entwuerfe where a station
   * rules it out). A window closes when the treatment in the Nationalrat
   * ends, and the period ends it: a Petition stops, a Bürgerinitiative and a
   * Volksbegehren move on under a number of the next period. GP XXVII, read
   * 15.11.2026: no item open.
   */
  onlyOpenEnded: 'In einer beendeten Gesetzgebungsperiode ist keine Beteiligung mehr möglich.',
  loading: 'Anliegen werden geladen …',
  /**
   * The list's search (16.11.2026): over a row's title, citation and kind —
   * no name stands in any of them (the reader drops them before the cache).
   * The count line keeps counting the set; the matches are said beside it.
   */
  search: 'Anliegen durchsuchen',
  matches: (n: number, q: string) => `${formatNumberDe(n)} ${n === 1 ? 'passt' : 'passen'} zu „${q}“`,
  noMatch: (q: string) => `Kein Anliegen dieser Auswahl passt zu „${q}“.`,
  clear: 'Suche löschen',
  /** The list's request failed: in the rows' place, with „Erneut versuchen" (`ListBoxState`). */
  failed: { text: gapLabelDe('Anliegen', 'unavailable'), description: 'Die Quelle hat nicht geantwortet.' },
  /**
   * The column headings this list adds over its rows (`EntryList`, `lead`
   * and `secondColumn`). „Stellungnahmen" and „Stand" follow them: the draft
   * lists' own headings, which `EntryList` draws for every list.
   */
  columns: { lead: 'Anliegen', support: 'Unterstützungen' },
  vbSupportNote: VOLKSBEGEHREN_SUPPORT,
} as const

/**
 * The open Anliegen as the list counts them on arrival (16.11.2026, the
 * homepage's door): the running period's „Alle" with „Nur offene"
 * (`anliegenRowsInView`, `filterAnliegenRows`), the same rows the count
 * line's „N offen" counts. Rows whose participation was not read
 * (`open === null`) are counted apart, never as closed; the kinds whose list
 * did not arrive are named (`anliegenUnreadKinds`).
 */
export function anliegenOpenCount(data: Pick<AnliegenListResponse, 'gp' | 'rows' | 'bundesrat' | 'unread'>): { open: number; unknown: number; unreadKinds: AnliegenKind[] } {
  const rows = anliegenRowsInView(data, 'alle')
  return {
    open: filterAnliegenRows(rows, 'alle', true).length,
    unknown: rows.filter((r) => r.open === null).length,
    unreadKinds: anliegenUnreadKinds(data),
  }
}

/**
 * The select „Zeitraum" (`?gp=`): the periods the list offers
 * (`anliegenListGps`), named as /entwuerfe names them — „seit 24.10.2024 (GP
 * XXVIII)", „23.10.2019 – 23.10.2024 (GP XXVII)" (`gpSpanLabelDe`). Before
 * the server named the running period the chosen one stands alone, or
 * „Zeitraum …" — never a blank select.
 */
export function anliegenPeriodOptions(gps: readonly string[], chosen: string): { value: string; label: string }[] {
  if (!gps.length) return [{ value: chosen, label: chosen ? gpSpanLabelDe(chosen) : ANLIEGEN_LIST_DE.periodPending }]
  return gps.map((gp) => ({ value: gp, label: gpSpanLabelDe(gp) }))
}

/** The select „Art": every kind, or one. `alle` is no kind. */
export type AnliegenArt = AnliegenKind | 'alle'

export const ANLIEGEN_ART_OPTIONS: readonly { value: AnliegenArt; label: string; selectLabel?: string }[] = [
  { value: 'alle', label: 'Alle', selectLabel: 'Alle Arten' },
  { value: 'petition', label: ANLIEGEN_KIND_LABEL.petition.many },
  { value: 'buergerinitiative', label: ANLIEGEN_KIND_LABEL.buergerinitiative.many },
  { value: 'volksbegehren', label: ANLIEGEN_KIND_LABEL.volksbegehren.many },
  { value: 'petition-bundesrat', label: ANLIEGEN_KIND_LABEL['petition-bundesrat'].many },
]

/** `?art=` → the choice; anything unknown is „Alle", never an error. */
export function anliegenArtOf(raw: unknown): AnliegenArt {
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === 'petition' || v === 'buergerinitiative' || v === 'volksbegehren' || v === 'petition-bundesrat' ? v : 'alle'
}

/**
 * The Petitionen an den Bundesrat that arrived within a period's window
 * (`gpWindow`, both ends inclusive, the bounds /entwuerfe files the Länder
 * by): the Bundesrat has no period, so „Alle" of a period holds those of its
 * days. A row without a day of arrival stands in none. The server reads
 * these rows' records first, by the same predicate (`anliegenArrivedInGp`).
 */
export function bundesratRowsInPeriod(rows: readonly AnliegenRow[], gp: string): AnliegenRow[] {
  return rows.filter((r) => anliegenArrivedInGp(r.arrivedAt, gp))
}

/**
 * The rows the choice of „Art" draws from: one kind of the period, every
 * Petition an den Bundesrat whatever the period (its tab), or under „Alle"
 * the period's three kinds and the Petitionen an den Bundesrat of its days.
 */
export function anliegenRowsInView(data: Pick<AnliegenListResponse, 'gp' | 'rows' | 'bundesrat'>, art: AnliegenArt): AnliegenRow[] {
  if (art === 'petition-bundesrat') return data.bundesrat.rows
  if (art === 'alle') return [...data.rows, ...bundesratRowsInPeriod(data.bundesrat.rows, data.gp)]
  return data.rows
}

/** The kinds whose list could not be read, the Petitionen an den Bundesrat among them. */
export function anliegenUnreadKinds(data: Pick<AnliegenListResponse, 'unread' | 'bundesrat'>): AnliegenKind[] {
  return data.bundesrat.unread ? [...data.unread.kinds, 'petition-bundesrat'] : data.unread.kinds
}

/** Newest first by the last step, the day of arrival where the record did not arrive. Never by state or outcome. */
export function sortAnliegenRows(rows: readonly AnliegenRow[]): AnliegenRow[] {
  const day = (r: AnliegenRow) => r.lastStepAt ?? r.arrivedAt ?? ''
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (day(a.r) === day(b.r) ? a.i - b.i : day(a.r) < day(b.r) ? 1 : -1))
    .map(({ r }) => r)
}

/** The rows of the chosen kind, and only the open ones while the toggle is on. `open === null` is not open. */
export function filterAnliegenRows(rows: readonly AnliegenRow[], art: AnliegenArt, onlyOpen: boolean): AnliegenRow[] {
  return rows.filter((r) => (art === 'alle' || r.root.kind === art) && (!onlyOpen || r.open === true))
}

/**
 * What the search reads of a row (16.11.2026): what the row shows — title,
 * citation, kind. No name stands in any of them (the reader drops them
 * before the cache). The list and the site search (`/suche`) read the same.
 */
export function anliegenHaystack(v: Pick<EntryView, 'title' | 'citation' | 'kindLabel'>): string {
  return `${v.title} ${v.citation ?? ''} ${v.kindLabel ?? ''}`
}

/**
 * The rows the list shows for `?q=…&alle=1` (17.11.2026, the site search):
 * every kind, open and closed, in the list's order, narrowed by the term.
 */
export function anliegenSearchRows(data: Pick<AnliegenListResponse, 'gp' | 'rows' | 'bundesrat'>, q: string): EntryView[] {
  return filterAnliegenRows(sortAnliegenRows(anliegenRowsInView(data, 'alle')), 'alle', false)
    .map(anliegenRowView)
    .filter((v) => !q || matchesQuery(anliegenHaystack(v), q))
}

/**
 * The count line: „44 offen von 65 in der XXVIII. Gesetzgebungsperiode",
 * with the toggle off „65 in der …, 44 davon offen"; in an ended period
 * „222 in der XXVII. Gesetzgebungsperiode". Counted over the rows
 * that were read: a kind that failed is named in `anliegenUnreadDe`, never
 * counted as 0. Rows whose participation was not read are said, not
 * counted as closed.
 */
export function anliegenCountLineDe(
  gp: string,
  rows: readonly AnliegenRow[],
  art: AnliegenArt,
  onlyOpen: boolean,
  periodEnded = false,
): string {
  const ofKind = rows.filter((r) => art === 'alle' || r.root.kind === art)
  const open = ofKind.filter((r) => r.open === true).length
  const unknown = ofKind.filter((r) => r.open === null).length
  const total = formatNumberDe(ofKind.length)
  const noun = art === 'alle' ? '' : ` ${ofKind.length === 1 ? ANLIEGEN_KIND_LABEL[art].one : ANLIEGEN_KIND_LABEL[art].many}`
  const unknownPart = unknown ? `; bei ${formatNumberDe(unknown)} ist die Beteiligung nicht lesbar` : ''
  if (art === 'petition-bundesrat') return `${bundesratCountDe(ofKind, open, onlyOpen && !periodEnded, periodEnded)}${unknownPart}`
  const br = ofKind.filter((r) => anliegenIsBundesrat(r.root.kind)).length
  const period = `in der ${periodDe(gp)}${br ? ` (davon ${formatNumberDe(br)} ${br === 1 ? 'Petition' : 'Petitionen'} an den Bundesrat, nach dem Tag des Einlangens)` : ''}`
  // An ended period: how many are open is no news there (`onlyOpenEnded`), so
  // the line counts the items and says nothing of an open window.
  if (periodEnded) return `${total}${noun} ${period}`
  const line = onlyOpen
    ? `${formatNumberDe(open)} offen von ${total}${noun} ${period}`
    : `${total}${noun} ${period}, ${formatNumberDe(open)} davon offen`
  return `${line}${unknownPart}`
}

/**
 * The tab „Petitionen an den Bundesrat": all of them, whatever the period,
 * and the line says so — „42 Petitionen an den Bundesrat, die letzte vom
 * 05.04.2024 – unabhängig vom Zeitraum: der Bundesrat hat keine
 * Gesetzgebungsperioden". The newest day of arrival is computed, never
 * written down.
 */
function bundesratCountDe(rows: readonly AnliegenRow[], open: number, onlyOpen: boolean, periodEnded: boolean): string {
  const last = rows.reduce<string | null>((m, r) => (r.arrivedAt && (!m || r.arrivedAt > m) ? r.arrivedAt : m), null)
  const label = ANLIEGEN_KIND_LABEL['petition-bundesrat']
  const base = `${formatNumberDe(rows.length)} ${rows.length === 1 ? label.one : label.many}${last ? `, ${rows.length === 1 ? 'vom' : 'die letzte vom'} ${formatDateDe(last)}` : ''}`
  const line = periodEnded ? base : onlyOpen ? `${formatNumberDe(open)} offen von ${base}` : `${base}, ${formatNumberDe(open)} davon offen`
  return `${line} – unabhängig vom Zeitraum: der Bundesrat hat keine Gesetzgebungsperioden`
}

/** „Gerade nicht abrufbar: die Bürgerinitiativen." — the failed kinds within the choice, one gap sentence. */
export function anliegenUnreadDe(kinds: readonly AnliegenKind[], art: AnliegenArt): string[] {
  const failed = kinds.filter((k) => art === 'alle' || k === art).map((k) => `die ${ANLIEGEN_KIND_LABEL[k].many}`)
  return failed.length ? [gapDe('unavailable', `${listDe(failed)}.`)] : []
}

/**
 * What an empty list says — only when the list answered for that kind. With
 * the toggle on, no open item; for a Volksbegehren also where it is
 * supported, which the monitor does not follow. Where the participation of
 * a row could not be read, no emptiness is claimed: the sentence says what
 * could not be read.
 */
export function anliegenEmptyDe(rows: readonly AnliegenRow[], gp: string, art: AnliegenArt, onlyOpen: boolean): { title: string; note: string | null } {
  const ofKind = rows.filter((r) => art === 'alle' || r.root.kind === art)
  if (onlyOpen) {
    if (ofKind.some((r) => r.open === null)) {
      return { title: gapDe('unreadable', 'ob Unterstützung und Stellungnahme möglich sind.'), note: null }
    }
    if (art === 'volksbegehren') {
      return { title: 'Derzeit liegt kein Volksbegehren im Nationalrat, zu dem eine Stellungnahme möglich ist.', note: ANLIEGEN_LIST_DE.vbSupportNote }
    }
    if (art === 'petition') return { title: 'Derzeit ist keine Petition offen.', note: null }
    if (art === 'buergerinitiative') return { title: 'Derzeit ist keine Bürgerinitiative offen.', note: null }
    if (art === 'petition-bundesrat') {
      // Every one of them read closed (their flags and list 143's `AKTIV`); the list stands behind the toggle.
      return { title: 'Derzeit ist keine Petition an den Bundesrat offen.', note: ofKind.length ? `Alle ${formatNumberDe(ofKind.length)} zeigt die Liste ohne „Nur offene".` : null }
    }
    return { title: 'Derzeit ist kein Anliegen offen.', note: null }
  }
  if (art === 'petition-bundesrat') return { title: 'Das Parlament führt keine Petition an den Bundesrat.', note: null }
  const what = art === 'alle' ? 'kein Anliegen' : art === 'petition' ? 'keine Petition' : art === 'buergerinitiative' ? 'keine Bürgerinitiative' : 'kein Volksbegehren'
  return { title: `In der ${periodDe(gp)} liegt ${what} vor.`, note: null }
}

/**
 * A state in the list's few words — the Stand box is 14 rem wide, and the
 * draft rows' box holds two lines („Stellungnahme möglich" / „zur Vorlage
 * seit 11.11.2026"). The page's headline keeps the full wording
 * (`anliegenStateDe`); the row's words lead there.
 *
 *  - `short`: the second line of an open row's blue box, after „Beteiligung
 *    möglich" — one line with its date („In Behandlung · zuletzt
 *    22.10.2026", „Im Fachausschuss · 03.04.2025"). Which subject committee
 *    holds the item stands on its page.
 *  - `label`: the first line of a closed row's grey box, at most two lines;
 *    the headline's words where they fit, and „GP" for „Gesetzgebungsperiode"
 *    as the draft rows say it („Ohne Beschluss – GP beendet").
 */
export function anliegenRowStateWordsDe(state: AnliegenState): { short: string; label: string } {
  switch (state.kind) {
    case 'uebernommen': {
      const text = `In die ${state.successor.gp}. GP übernommen`
      return { short: text, label: text }
    }
    case 'weitergeleitet':
    case 'weitergeleitet-bericht':
      // The committee's own name ran to three lines („An den Ausschuss für
      // Land- und Forstwirtschaft weitergeleitet", GP XXVII); the page names it.
      return { short: 'Im Fachausschuss', label: 'An einen Fachausschuss weitergeleitet' }
    case 'kenntnisnahme-ausschuss':
      // „Kenntnisnahme im Ausschuss · 26.06.2025" wraps in the box; „erledigt" is
      // the motion's own verb („durch Kenntnisnahme im Ausschuss zu erledigen").
      return { short: 'Im Ausschuss erledigt', label: 'Im Ausschuss zur Kenntnis genommen' }
    case 'volksanwaltschaft': {
      // Two lines in the box, the day on the second (`anliegenRowStateParts`).
      const text = state.agreed ? VOLKSANWALTSCHAFT_AGREED : VOLKSANWALTSCHAFT_MOVED
      return { short: text, label: text }
    }
    case 'volksbegehren-kenntnisnahme':
      return { short: 'Zur Kenntnis genommen', label: 'Vom Nationalrat zur Kenntnis genommen' }
    case 'bericht-zur-kenntnis':
      return { short: 'Bericht zur Kenntnis genommen', label: 'Bericht vom Nationalrat zur Kenntnis genommen' }
    case 'ohne-erledigung-periode-beendet':
      return { short: 'Ohne Erledigung – GP beendet', label: 'Ohne Erledigung – GP beendet' }
    case 'in-behandlung':
      return { short: 'In Behandlung', label: 'In Behandlung' }
    case 'uebermittelt': {
      // A ministry's name runs to four lines („… für Klimaschutz, Umwelt,
      // Energie, Mobilität, Innovation und Technologie"); the page names it.
      const to = state.to
      const text = !to?.length
        ? 'An die Bundesverwaltung übermittelt'
        : to.length > 1
          ? 'An mehrere Bundesministerien übermittelt'
          : to[0] === 'das Bundeskanzleramt' ? 'An das Bundeskanzleramt übermittelt' : 'An ein Bundesministerium übermittelt'
      return { short: text, label: text }
    }
    case 'bundesrat-bericht-zur-kenntnis':
      return { short: 'Bericht zur Kenntnis genommen', label: 'Bericht vom Bundesrat zur Kenntnis genommen' }
    case 'zurueckgezogen':
      return { short: 'Gilt als zurückgezogen', label: 'Gilt als zurückgezogen' }
  }
}

/**
 * The row's state in two parts: the state in the row's words, and what dates
 * it. A state the course dates (the Kenntnisnahme, the forwarding, the
 * plenary's step) carries its own day — the last step's day beside „Im
 * Ausschuss zur Kenntnis genommen" would read as the day of the
 * Kenntnisnahme. The other states are dated by the last step, „zuletzt"; a
 * forwarded item with its subject committee's report names the report. No
 * state read: „Stand nicht gelesen", undated — never a guess.
 */
export function anliegenRowStateParts(
  row: Pick<AnliegenRow, 'state' | 'lastStepAt'>,
  form: 'short' | 'label' = 'label',
): { text: string; date: string | null } {
  if (!row.state) return { text: gapLabelDe('Stand', 'unreadable'), date: null }
  const text = anliegenRowStateWordsDe(row.state)[form]
  const own = 'date' in row.state ? row.state.date : null
  if (own) return { text, date: formatDateDe(own) }
  if (row.state.kind === 'weitergeleitet-bericht' && form === 'label') return { text, date: `dort Bericht ${row.state.report}` }
  return { text, date: row.lastStepAt ? `zuletzt ${formatDateDe(row.lastStepAt)}` : null }
}

/** The row's state on one line, short: „In Behandlung · zuletzt 22.10.2026", „Im Ausschuss erledigt · 26.06.2025". */
export function anliegenRowStateDe(row: Pick<AnliegenRow, 'state' | 'lastStepAt'>): string {
  const { text, date } = anliegenRowStateParts(row, 'short')
  return date ? `${text} · ${date}` : text
}

/**
 * The Stand box at the row's right (`EntryState`, the draft lists' box), two
 * lines as there. Open (`open === true`, list 143's own flag): the blue box,
 * line 1 „Beteiligung möglich" — „Stellungnahme möglich" for a Volksbegehren,
 * which takes no Unterstützung —, line 2 where the item stands, short, with
 * its day; the page's door says which of the two is possible. Closed: the one
 * grey box for every state, line 1 the state, line 2 its day — no state
 * outranks another. `open === null`: grey, line 1 says the participation was
 * not read, line 2 the state; nothing blue on a guess.
 */
export function anliegenRowStand(row: AnliegenRow): EntryState {
  if (row.open === true) {
    return {
      label: row.root.kind === 'volksbegehren' ? 'Stellungnahme möglich' : 'Beteiligung möglich',
      detail: anliegenRowStateDe(row),
      tone: 'neutral',
      actionable: true,
    }
  }
  if (row.open === null) {
    return { label: gapLabelDe('Beteiligung', 'unreadable'), detail: anliegenRowStateDe(row), tone: 'inactive', actionable: false }
  }
  const { text, date } = anliegenRowStateParts(row)
  return { label: text, detail: date, tone: 'inactive', actionable: false }
}

/**
 * The Unterstützungen column. A count not read is „nicht abrufbar" (the
 * draft rows' word for a count asked for and not read), never 0; a
 * Volksbegehren takes none in the Nationalrat — „nicht möglich", an en dash
 * in the column.
 */
export function anliegenSupportCount(row: AnliegenRow): SecondCount {
  const value: SecondCount['value'] = row.root.kind === 'volksbegehren'
    ? { kind: 'impossible' }
    : row.counts.support === null ? { kind: 'unavailable' } : { kind: 'count', count: row.counts.support }
  return { value, one: 'Unterstützung', many: 'Unterstützungen' }
}

/**
 * One row of the list, in the draft lists' anatomy (`EntryList`/`EntryItem`):
 * the title, the Kennung under it („Petition 21/PET"), the Unterstützungen
 * and Stellungnahmen in two right-aligned columns, the Stand box at the
 * right. Nothing of the draft row's Ressort, EU or „Neu" tokens applies.
 */
export function anliegenRowView(row: AnliegenRow): EntryView {
  const { statements } = row.counts
  return {
    key: `${row.root.kind}-${row.root.inr}`,
    to: anliegenPath(row.root),
    href: null,
    title: row.title,
    titleFull: null,
    kindLabel: ANLIEGEN_KIND_LABEL[row.root.kind].one,
    citation: row.citation ?? anliegenCitation(row.root),
    ministry: null,
    coMinistries: [],
    aliases: [],
    note: null,
    eu: null,
    newLabel: null,
    participation: statements === null ? { kind: 'unavailable' } : { kind: 'count', count: statements },
    secondCount: anliegenSupportCount(row),
    state: anliegenRowStand(row),
  }
}
