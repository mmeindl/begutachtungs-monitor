import type { TraceLink } from './common'
import type { DraftSummary } from './drafts'
import type { LandCode, LandConsultation } from './laender'
import type { RisConsultation } from './ris'

// ---------------------------------------------------------------------------
// EU-Recht
// ---------------------------------------------------------------------------

/**
 * The page's fact: what the Vorblatt says the draft does with EU law.
 *
 * - `umsetzung` — „Setzt EU-Recht um" (the WFA tool's „dient der Umsetzung
 *   einer EU-Richtlinie", or a ressort's own words for it);
 * - `flankierend-vo` / `flankierend-rl` — „Begleitet EU-Verordnungen" / „…
 *   eine EU-Richtlinie" (the tool's „flankierende Regelungen zu …");
 * - `ueber-umsetzung` — „Setzt EU-Recht um", with the Vorblatt's own
 *   sentence („geht über eine verpflichtende Umsetzung … hinaus") quoted and
 *   attributed, never paraphrased.
 *
 * Every other answer of the Vorblatt — not in the scope of EU law, in it but
 * not implementing anything, only mandatory measures — and an unreadable one
 * put nothing on the page (rule D1).
 */
export type EuMarker = 'umsetzung' | 'flankierend-vo' | 'flankierend-rl' | 'ueber-umsetzung'

/** One EU act the draft's law text (or title) names. */
export interface EuActView {
  kind: 'richtlinie' | 'verordnung' | 'beschluss' | 'rahmenbeschluss'
  /** „Richtlinie (EU) 2024/1069", „Richtlinie 2009/43/EG" — the act's own citation form. */
  label: string
  celex: string
  /** The act in EUR-Lex, German, by its ELI. */
  eurLexUrl: string
  /**
   * Whether the draft adds this act: true where the law in force does not
   * name it yet (or the draft creates a new law), false where it does — an
   * amendment restates the whole Umsetzungshinweis, directives transposed
   * years ago included (rule D4). Null where the law in force could not be
   * read; then no deadline is printed.
   */
  isNew: boolean | null
  /**
   * Named as the base text of an amending act the draft also names
   * („Richtlinie (EU) 2018/2001 … in der Fassung der Richtlinie (EU)
   * 2024/1711"): the draft implements the amendment, so the base's deadline
   * is not the draft's and is not printed.
   */
  base: boolean
  /**
   * For a directive with transposition dates in EUR-Lex: the latest as the
   * deadline, the others as the footnote's „weitere Fristen für einzelne
   * Bestimmungen" (rule D3). Null for regulations and decisions, for
   * directives without a date, and where the Cellar did not answer.
   */
  transposition: { deadline: string; otherDates: string[] } | null
  /** The day the act was adopted, ISO, from the Cellar — where the EU timeline begins. Null where unknown. */
  adopted: string | null
  /**
   * The act's official German title as EUR-Lex gives it („Richtlinie (EU)
   * 2024/1069 des Europäischen Parlaments und des Rates vom 11. April 2024
   * über den Schutz …"); null where the Cellar did not answer or has none.
   */
  title: string | null
}

/**
 * Whether a draft implements EU law, which act, and until when — the
 * Vorblatt decides whether, the law text which act, EUR-Lex until when.
 * `available: false` is a normal answer (no RIS record, no Vorblatt that can
 * be read) and puts nothing on the page.
 */
export interface EuRechtResponse {
  available: boolean
  /** Why nothing could be read, as a sentence; null when available. */
  unavailableReason: string | null
  /** Null where the Vorblatt says the draft is no EU matter, or the Vorblätter contradict each other. */
  marker: EuMarker | null
  /**
   * Which document decided `marker`: the Vorblatt, or — only where none can
   * be read — the Erläuterungen (rule D5). On a Land's draft `vorblatt` is
   * the Bund's WFA heading in the Land's documents, `erlaeuterungen` a headed
   * EU passage of the general part or, without one, its prose.
   */
  markerSource: 'vorblatt' | 'gesetzestext' | 'erlaeuterungen' | null
  /** The Vorblatt's EU sentence verbatim — printed for `ueber-umsetzung` only, „laut Vorblatt". */
  vorblattSentence: string | null
  acts: EuActView[]
  /**
   * Where the acts' names came from — the first source, where several
   * named some. Null when none is named. `vorblatt` and `erlaeuterungen`
   * occur on a Land's draft only: its EU statement names the acts it
   * implements (Burgenland's Vorblatt, Oberösterreich's section V), and
   * Oberösterreich writes an „Umsetzungshinweis:" per provision.
   */
  actsSource: 'gesetzestext' | 'titel' | 'vorblatt' | 'erlaeuterungen' | null
  /** The first day of the Begutachtungsfrist as RIS records it — the second date of the fact line. */
  begutachtungStart: string | null
  /** The documents read, for the source line: the Vorblatt, the law text, the Erläuterungen. */
  sources: TraceLink[]
  /**
   * This draft's acts that have a page in the EU map, each with the other
   * drafts that implement it (`EuRelatedAct`; zero others included — the
   * entry is also how the fact knows the act's page). Set by the endpoint
   * from the map; absent where the map is not built, and never stored with
   * the fact.
   */
  related?: EuRelatedAct[]
}

// ---------------------------------------------------------------------------
// The EU map: one act, the Bund and the nine Länder
// ---------------------------------------------------------------------------

/**
 * Who published a draft in the map: the Bund (Parliament's list and RIS)
 * or one Land. The same words as the list's source chips
 * (`shared/utils/laender.ts`, `SourceCode`).
 */
export type EuPublisher = 'bund' | LandCode

/**
 * Where a draft's procedure stands, as its page computes it for the EU
 * timeline (`DraftEuTimeline`): today while nothing came of it yet, the
 * Beschluss where a house dated one, the Kundmachung where its day is
 * known.
 */
export interface EuStand {
  date: string
  label: 'Heute' | 'Beschluss' | 'Bundesgesetzblatt' | 'Landesgesetzblatt'
}

/**
 * One draft on an act's page: who, which draft, when its Begutachtung ran,
 * where it stands — two dates and a stand, no verdict (rule D6).
 */
export interface EuActDraft {
  /** `me:XXVIII-147`, `ris:<RIS id>`, `land:ooe-2026-16120` — the map's key for the draft. */
  key: string
  publisher: EuPublisher
  /** The monitor's page of the draft. */
  path: string
  title: string
  /** „147/ME" for a Ministerialentwurf; null for every other draft. */
  citation: string | null
  kind: 'gesetz' | 'verordnung' | 'unbestimmt'
  begutachtung: { start: string | null; end: string | null }
  /**
   * Null where the stand could not be read in time — the Bund's station
   * map is cold after a restart — and the row then shows its dates
   * without a bar. Never „Heute" for a law that may long be promulgated.
   */
  stand: EuStand | null
  marker: EuMarker
  /**
   * Rule D4 for THIS draft: true or null where the draft adds the act (an
   * implementing row), false where it only restates the act that the law
   * in force already names (a restating row, listed apart and without a
   * bar).
   */
  isNew: boolean | null
  /**
   * The draft as the lists carry it, so the act page renders the very row
   * `/entwuerfe` renders (`viewOfRow`, 05.11.2026): its Ressort, its
   * Stellungnahmen, its Stand in the lists' words — one anatomy, not a
   * second one written for this page. The Ministerialentwurf carries its
   * chain where the station map may be spoken about, as in the list.
   */
  row: EuListRow
}

/** A list row of the three kinds the map reads (`DraftListRow` without the Vorlage). */
export type EuListRow =
  | { kind: 'me'; key: string; draft: DraftSummary }
  | { kind: 'ris'; key: string; item: RisConsultation }
  | { kind: 'land'; key: string; item: LandConsultation }

/** An act as the map knows it: its citation, its EUR-Lex page, its dates. */
export interface EuActHead {
  celex: string
  kind: EuActView['kind']
  /** „Richtlinie (EU) 2024/1069" — the citation form the drafts use. */
  label: string
  eurLexUrl: string
  /** The monitor's page of the act, `/eu-recht/richtlinie/2024/1069` (`euActPath`). */
  path: string
  adopted: string | null
  /** The act's official German title as EUR-Lex gives it; null where the Cellar did not answer or has none (`EuActView.title`). */
  title: string | null
  /** Directives only: the latest Cellar date as the deadline, the others as the footnote (rule D3). */
  transposition: { deadline: string; otherDates: string[] } | null
}

/**
 * Where an act stands in the Official Journal (Amtsblatt), as a footnote
 * cites it (`euOjCiteDe`). Two forms, because the Journal changed form on
 * 01.10.2023: until then an act stood in a numbered issue on a page
 * („ABl. L 333 vom 27.12.2022, S. 80"), since then each act is its own
 * publication („ABl. L, 2023/2413, 31.10.2023").
 */
export type EuOjReference =
  | { form: 'issue'; series: 'L' | 'C'; issue: string; date: string; page: number | null }
  | { form: 'act'; series: 'L' | 'C'; act: string; date: string }

// ---------------------------------------------------------------------------
// The act's own procedure: what the Cellar records between the Commission's
// proposal and the Official Journal (docs/research/eu-zyklus.md, 2.1)
// ---------------------------------------------------------------------------

/**
 * One step of an act's procedure as the Cellar records it. Only steps whose
 * type the monitor reads (`EU_EVENTS`, `shared/utils/euEvents.ts`) are ever
 * put into one; a type that is not on that list is counted
 * (`EuProcedure.otherEvents`), never shown and never taken for „did not
 * happen".
 */
export interface EuProcedureEvent {
  /** The Cellar's event type, „ADP_R1_POS_byEP" — the key into `EU_EVENTS`. */
  code: string
  /** The day, ISO. A step the Cellar does not date is not kept. */
  date: string
}

/** The Commission's proposal a procedure began with. */
export interface EuProposal {
  /** „COM(2022) 177", „COM(1995) 722 - 3" — as cited; null where the dossier names no COM document. */
  reference: string | null
  /** „52022PC0177"; null where the Cellar links none. */
  celex: string | null
  /** The day on the proposal itself (the Cellar's `work_date_document`), ISO; null where unknown. */
  date: string | null
  /** The proposal on EUR-Lex, German; built from the CELEX, never fetched. Null without one. */
  eurLexUrl: string | null
}

/**
 * The procedure between the institutions, read from the act's dossier(s) in
 * the Cellar. One act can hang on two dossiers (Richtlinie 2000/29/EG): then
 * both proposals stand here and the steps of both, in date order.
 */
export interface EuProcedure {
  /**
   * „2022/0117(COD)"; null where the dossier carries no procedure number.
   * Where an act hangs on two dossiers, that of the procedure whose number
   * sorts last — the most recent one.
   */
  reference: string | null
  /** The Cellar's procedure type, „OLP", „COD", „CNS" …; null where it names none. Of the same dossier as `reference`. */
  type: string | null
  /**
   * The procedure in the European Parliament's Legislative Observatory
   * (English) — built from `reference`, never fetched; null where no page
   * can be expected (`OBSERVATORY_FIRST_YEAR`, `OBSERVATORY_TYPES`).
   */
  observatoryUrl: string | null
  proposals: EuProposal[]
  /** The steps the monitor reads, ascending by day, each (code, day) once. */
  events: EuProcedureEvent[]
  /** How many more steps the Cellar records whose type the monitor does not read. */
  otherEvents: number
}

/**
 * Who adopted the act, from its authors in the Cellar — the name of the
 * rail's third station is read from this, not from a table of procedure
 * types: Parliament and Council together, the Council alone, or the
 * Commission (a delegated or implementing act, which has no procedure
 * between the institutions). `unbekannt` where the authors are none of
 * these.
 */
export type EuAdoptedBy = 'parlament-rat' | 'rat' | 'kommission' | 'unbekannt'

/**
 * What the act's page needs for its rail beyond the map's head: who
 * adopted it, the procedure, and since when it is in force and applies.
 * Dates and identifiers, never a duration (rule D6).
 */
export interface EuActRail {
  adoptedBy: EuAdoptedBy
  /**
   * Null where the Cellar links the act to no dossier — for an act of the
   * Commission the expected answer, for any other a gap the page names.
   */
  procedure: EuProcedure | null
  /** The day the act entered into force (the Cellar's date typed „EV"), ISO; null where it types none. */
  inForce: string | null
  /** The day the act takes effect (the Cellar's date typed „PE", „Wirksamwerden") — what a Beschluss carries instead of an entry into force; ISO, null where the Cellar types none. */
  effective: string | null
  /**
   * The day the act as a whole starts to apply, where the Cellar types one
   * (a date typed „MA" that is not marked partial); null where it does not.
   * Often later than `inForce` for a regulation.
   */
  applies: string | null
  /** Days from which single provisions apply (typed „MA" and marked partial, or typed „MA/PART"), ascending. */
  partialApplication: string[]
}

/**
 * GET /api/eu-recht/akte/:celex — one act, every draft of the window that
 * names it. Null `builtAt` never occurs here: without a map the endpoint
 * answers 503.
 */
export interface EuActResponse {
  gp: string
  /** The Begutachtungen the map reads: those whose Begutachtung began in this window (`gpWindow`). */
  window: { from: string; to: string | null }
  /** When the map was last built, ISO. */
  builtAt: string
  act: EuActHead
  /** Drafts that implement the act (`isNew` true or null): the Bund first, then the Länder in display order. */
  implementing: EuActDraft[]
  /** Drafts that only restate the act (`isNew` false), in the same order. */
  restating: EuActDraft[]
  /** The Länder with no draft naming the act in the window, in display order. */
  landsWithout: LandCode[]
  /**
   * A directive only: what the Member State notified to the Commission as
   * transposing it (`EuNationalMeasure`, its claim), by day of
   * notification. Empty where it notified nothing; null for any other kind
   * of act and where the Cellar did not answer — `memberState` tells the
   * two nulls apart: it is set for a directive.
   */
  measures: EuNationalMeasure[] | null
  /** The Member State whose notifications `measures` holds, „AUT"; null for an act that is no directive. */
  memberState: string | null
  /**
   * The consultation behind the act on the Commission's portal, by its
   * proposal's COM number (`EuConsultation`: found, not found, before the
   * portal, no proposal to search by, not read). Null for an act of the
   * Commission and where the procedure itself could not be read: there
   * is no proposal to ask about.
   */
  consultation: EuConsultation | null
  /**
   * The act's Amtsblatt reference and ELI, for the „Zitieren" button; each
   * null where the Cellar did not answer or has none. Asked per request, not
   * kept in the map: only this page cites (`ojReferenceOf`).
   */
  oj: EuOjReference | null
  eli: string | null
  /**
   * The act's procedure and dates for the rail. Null where the Cellar did
   * not answer: the page then says the procedure could not be read, never
   * that there was none.
   */
  rail: EuActRail | null
  /**
   * Publishers the last build could not read whole — their drafts may be
   * missing from every list on this page. Said on the page, never hidden.
   */
  incomplete: EuPublisher[]
}

/**
 * One act in the overview, with how many drafts implement it — or, in
 * `EuActsResponse.restatingOnly`, how many only restate it.
 */
export interface EuActSummary extends EuActHead {
  /** Implementing drafts (`isNew` true or null), by publisher; in `restatingOnly` the restating drafts. */
  counts: { bund: number; laender: number }
  /** The Länder with an implementing draft, display order; in `restatingOnly` those with a restating one. */
  lands: LandCode[]
}

/** GET /api/eu-recht — every act a draft of the window implements. */
export interface EuActsResponse {
  gp: string
  window: { from: string; to: string | null }
  /** When the map was last built, ISO; null where no map exists yet (then `acts` is empty). */
  builtAt: string | null
  acts: EuActSummary[]
  /**
   * The acts no draft of the window implements, only restates (rule D4) or
   * names as an amendment's base (D4a) — transposed before, listed so their
   * pages are reachable, never counted as implemented. `counts` and `lands`
   * are of the restating drafts; same order as `acts`.
   */
  restatingOnly: EuActSummary[]
  incomplete: EuPublisher[]
}

/**
 * On a draft's own fact: other drafts in the map that implement one of
 * its acts — the line „Weitere Entwürfe zur Richtlinie (EU) 2024/1069:
 * Bund 1 · Länder 3" under the act list, linking to the act's page. Added
 * by the endpoint from the map, never stored with the fact.
 */
export interface EuRelatedAct {
  celex: string
  /** The act's page (`euActPath`). */
  path: string
  /** Implementing drafts OTHER than this one, by publisher. */
  others: { bund: number; laender: number }
}

/* ------------------------------------------------------------------ *
 * Directives a country has to transpose (step 7 of the EU cycle)
 * ------------------------------------------------------------------ */

/**
 * One national measure a Member State notified to the Commission as
 * transposing a directive, as the Cellar records the notification. It is
 * the Member State's CLAIM — a Land law of 1993 is notified for a directive
 * of 2019 — and never a finding that the directive is transposed.
 */
export interface EuNationalMeasure {
  /** The measure's title as notified; null where the Cellar has none. */
  title: string | null
  /** The Member State's own word for the kind: „Bundesgesetz", „Landesgesetz", „Verordnung". */
  kind: string | null
  /** The day of the notification to the Commission, ISO. */
  notified: string | null
  /** Where it was promulgated: the gazette's name and number as notified, and its day (ISO). */
  gazette: { name: string | null; number: string | null; date: string | null }
  /** The measure at its national source (for Austria the RIS), only where the address is public https; null otherwise. */
  url: string | null
}

/** The Cellar's form of a directive: of Parliament and Council or the Council, delegated, or implementing. */
export type EuDirectiveForm = 'richtlinie' | 'delegierte-richtlinie' | 'durchfuehrungsrichtlinie'

/** One directive with a transposition date in the window, as the Cellar has it. */
export interface EuDirectiveToTranspose {
  celex: string
  /** The official title in the language asked for; null where the Cellar has none. */
  title: string | null
  /** Null where the Cellar's type is none of the three. */
  form: EuDirectiveForm | null
  /** The latest transposition date (rule D3). */
  deadline: string
  /** The earlier transposition dates, ascending. */
  otherDates: string[]
}

/**
 * A row of the list „Richtlinien, die umzusetzen sind": the directive, and
 * two observations beside it, each from its own source and each possibly
 * unknown — the drafts the monitor found, and how many measures the country
 * notified to the Commission. Never joined into a verdict (rule D6).
 */
export interface EuUmsetzungRow extends EuDirectiveToTranspose {
  /** „Richtlinie (EU) 2024/1069", „Delegierte Richtlinie (EU) 2024/1405". */
  label: string
  /** The monitor's page of the directive. */
  path: string
  /** Drafts of the monitor's window that implement it, by publisher; null where no map is built. */
  drafts: { bund: number; laender: number } | null
  /** Measures the country notified; 0 where it notified none; null where the Cellar did not answer. */
  measures: number | null
}

/** GET /api/eu-recht/umsetzung — the directives a country has to transpose, by deadline. */
export interface EuUmsetzungResponse {
  /** The country whose notifications are counted, as the Cellar names it: „AUT". */
  country: string
  /** The days the list covers: a directive is in it where a transposition date lies between them. */
  window: { from: string; to: string }
  /** Null where the Cellar did not answer: the page says so, and shows no empty list. */
  rows: EuUmsetzungRow[] | null
  /** The monitor's own window for drafts (`gpWindow`), and what its last build could not read. */
  draftsWindow: { from: string; to: string | null }
  incomplete: EuPublisher[]
}

/* ------------------------------------------------------------------ *
 * The Commission's portal „Ihre Meinung zählt" (step 2 of the EU cycle)
 * ------------------------------------------------------------------ */

/**
 * One publication of an initiative on the portal: a stage at which the
 * Commission published something, with or without a period for feedback.
 * A fixed list of fields — the portal's record also names the official
 * who wrote it, with mail address and telephone number; none of that is
 * read (`parseInitiative`).
 */
export interface EuPortalPublication {
  /** The portal's stage word: `INIT_PLANNED`, `ROADMAP`, `PLANNING_WORKFLOW`, `OPC_LAUNCHED`, `ISC_WORKFLOW`, `ADOPTION_WORKFLOW`. */
  stage: string
  /** The publication's type: `ROADMAP`, `OPC_LAUNCHED`, `PROP_DIR`, `PROP_REG`, … */
  type: string | null
  /** Its reference as the portal writes it: „Ares(2021)6011536", „COM(2022)177". */
  reference: string | null
  /** The day it was published, ISO. */
  published: string | null
  /** The last day of the feedback period, ISO; null where it had none. */
  feedbackEnd: string | null
  /** The number of contributions the portal counts; null where it gives none. */
  feedbackCount: number | null
  /** `OPEN`, `CLOSED`, `DISABLED`, `UPCOMING` — the portal's word, as it is. */
  feedbackStatus: string | null
}

/** An initiative of the Commission as the portal records it. */
export interface EuInitiative {
  id: number
  /** The short title, English, as the record's own `shortTitle`. */
  title: string | null
  /**
   * The short title in German, from the record's translations; null where
   * it carries none. Optional only for records built by hand (tests):
   * `parseInitiative` always sets it (reader version 4, 15.11.2026).
   */
  titleDe?: string | null
  /** The kind of act the Commission foresees, the portal's code: `PROP_REG`, `REG_DEL`, `COMMUNIC` …; null where it names none. Set by `parseInitiative` like `titleDe`. */
  actType?: string | null
  /** The initiative on the portal, German page. */
  url: string
  /** In the portal's order of publication, ascending by day. */
  publications: EuPortalPublication[]
}

/* ------------------------------------------------------------------ *
 * Open feedback windows on the portal (step 3 of the EU cycle)
 * ------------------------------------------------------------------ */

/**
 * One period in which the Commission takes feedback, as the portal's list
 * of open windows records it on an initiative (`currentStatuses`). An
 * initiative can have two at once — a Sondierung and a public consultation
 * launched together (4 of 49 on 15.11.2026) —, each its own window.
 */
export interface EuWindow {
  /** The portal's stage word: `PLANNING_WORKFLOW`, `OPC_LAUNCHED`, `ADOPTION_WORKFLOW`, `ISC_WORKFLOW`, … */
  stage: string
  /** The first day of the period, ISO; null where the portal gives none. */
  start: string | null
  /** The last day of the period, ISO; null where the portal gives none. */
  end: string | null
}

/**
 * An initiative with at least one open window, read field by field from the
 * portal's list (`parseOpenWindows`): no description, no unit, no person.
 */
export interface EuOpenInitiative {
  /** The portal's number of the initiative — the monitor's page is `euInitiativePath(id)`. */
  id: number
  /** Its reference as the portal writes it: „Ares(2026)7463403", „COM(2026)681". */
  reference: string | null
  /** The kind of act the Commission foresees, the portal's code (`EuInitiative.actType`). */
  actType: string | null
  /** The short title: German where the portal has it, otherwise its English one. */
  title: string | null
  /** Whether `title` is the German translation; false where the English title stands in for it. */
  titleIsGerman: boolean
  /** The portal's topics, by their labels as it gives them (English). */
  topics: string[]
  /** The open windows, in the portal's order. */
  windows: EuWindow[]
}

/** GET /api/eu-recht/fenster — every window open on the portal today. */
export interface EuFensterResponse {
  /** Null where the portal could not be read: the page says so, and shows no empty list. */
  initiatives: EuOpenInitiative[] | null
  /**
   * Where the portal counted more initiatives than the monitor reads
   * (`OPEN_WINDOWS_MAX_PAGES`): how many it read of how many; null where it
   * read them all.
   */
  cut: { read: number; total: number } | null
  /** The portal's own start page, for the sentence when it could not be read. */
  portalUrl: string
}

/**
 * GET /api/eu-recht/initiative/:id — one initiative of the portal, or the
 * state that it could not be read (with the portal's page of it). An id the
 * portal proves unknown is a 404, not a state.
 */
export type EuInitiativeResponse =
  | { state: 'gefunden'; initiative: EuInitiative }
  | { state: 'ungelesen'; id: number; url: string }

/**
 * What the monitor can say about the consultation behind an act, by its
 * proposal's COM number. Each state is a different sentence on the page:
 *
 * - `gefunden`: an initiative whose publications carry exactly that number.
 * - `nicht-gefunden`: the portal answered, and no initiative the monitor
 *   opened carries it — „im Portal nicht gefunden", never „keine
 *   Konsultation". `exhaustive` false: the search counted more hits than
 *   the monitor opens, so the rest is unread, and the sentence says so.
 * - `vor-portal`: the proposal is from before 2017; the portal does not
 *   hold such proposals (0 of 15 in the sample of 14.11.2026).
 * - `kein-vorschlag`: the Cellar names no COM number to search by.
 * - `ungelesen`: no answer, an error status, or a shape the reader does
 *   not know.
 */
export type EuConsultation =
  | { state: 'gefunden'; reference: string; initiative: EuInitiative }
  | { state: 'nicht-gefunden'; reference: string; exhaustive: boolean }
  | { state: 'vor-portal'; reference: string }
  | { state: 'kein-vorschlag' }
  | { state: 'ungelesen'; reference: string | null }

/* ------------------------------------------------------------------ *
 * A proposal of the Commission that left the Commission (step 3)
 * ------------------------------------------------------------------ */

/**
 * The three flags the Cellar sets on a proposal's dossier
 * (`cdm:dossier_pending-proposal`, `…_withdrawn-proposal`,
 * `…_adopted-proposal`), each as read: true, false, or null where the
 * dossier carries none. They contradict each other in one dossier since
 * 2019 (15.11.2026), so they are passed on as they are and only
 * `euProposalStandOf` decides what they say together.
 */
export interface EuProposalFlags {
  pending: boolean | null
  withdrawn: boolean | null
  adopted: boolean | null
}

/** One dossier a proposal initiated, as the Cellar records it. */
export interface EuProposalDossier {
  /**
   * The procedure, in the act rail's shape (`EuProcedure`): number, type,
   * the Observatory's page, this proposal, the steps the monitor reads and
   * how many others. `observatoryUrl` is null for a procedure the
   * Observatory split into files (`OBSERVATORY_FILE`): the plain number
   * answers 404 there, and the proposal's page links the acts instead.
   */
  procedure: EuProcedure
  flags: EuProposalFlags
  /** The day of the Commission's withdrawal (`WDW_byCOM`), ISO; null where the dossier dates none. */
  withdrawn: string | null
  /** The day of the last step the Cellar dates on the dossier, of any type, read or not; null where none is dated. */
  lastStep: string | null
  /** The CELEX numbers of the acts the dossier produced, ascending. */
  acts: string[]
}

/**
 * A proposal of the Commission as the Cellar records it
 * (`parseProposalAnswer`). An answer without the proposal is no record at
 * all: the Cellar does not know the number, and the reader returns null.
 */
export interface EuProposalRecord {
  /** „52026PC0780". */
  celex: string
  /** The day on the document (`work_date_document`), ISO; null where none. */
  date: string | null
  /** The German title, or the English one where the German is missing; null where neither. */
  title: string | null
  /** Whether `title` is the German one; false where the English stands in for it (some fresh proposals). */
  titleIsGerman: boolean
  /** Usually one; ascending by procedure number. Empty where the Cellar records no procedure for it. */
  dossiers: EuProposalDossier[]
}

/**
 * Where a proposal stands, from what the Cellar records — a statement about
 * the record, never about the world (`euProposalStandOf`):
 *
 * - `rechtsakt`: the adopted flag, and at least one act the dossier produced;
 * - `zurueckgezogen`: the Commission's withdrawal, dated;
 * - `zurueckgezogen-undatiert`: the withdrawn flag alone, no dated step;
 * - `anhaengig`: the pending flag alone — the Cellar's statement, with the
 *   day of the last step it records;
 * - `unklar`: flags missing or contradicting each other — no stand is
 *   claimed beyond the steps;
 * - `ohne-verfahren`: the Cellar knows the proposal, but no dossier.
 */
export type EuProposalStand =
  | { kind: 'rechtsakt'; acts: string[] }
  | { kind: 'zurueckgezogen'; date: string }
  | { kind: 'zurueckgezogen-undatiert' }
  | { kind: 'anhaengig'; lastStep: string | null }
  | { kind: 'unklar'; lastStep: string | null; acts: string[] }
  | { kind: 'ohne-verfahren' }

/** An act a proposal's dossier produced, with where the monitor shows it. */
export interface EuProposalAct {
  celex: string
  /** „Richtlinie (EU) 2024/1711": the map's own label where the map holds the act, else the form since 2015 from the CELEX, else the CELEX. */
  label: string
  /** The monitor's page of the act, only where one exists (in the map, or a directive); null otherwise. */
  path: string | null
  /** The act on EUR-Lex, by its CELEX. */
  eurLexUrl: string
}

/**
 * GET /api/eu-recht/vorschlag/:year/:number — one proposal of the
 * Commission by its COM number, from the Cellar, with the consultation
 * behind it from the portal. A number the Cellar proves unknown is a 404,
 * not a state.
 */
export interface EuVorschlagResponse {
  /** „COM(2026) 780", as cited. */
  reference: string
  /** „52026PC0780". */
  celex: string
  /** The proposal on EUR-Lex. */
  eurLexUrl: string
  /** Null where the Cellar did not answer: the page says so, and claims no stand. */
  proposal: EuProposalRecord | null
  /** The acts the proposal's dossiers produced, ascending by CELEX; empty where none or not read. */
  acts: EuProposalAct[]
  /**
   * The act's page this address answers 301 to: set only where the dossier
   * names exactly ONE act and the monitor has its page (`euProposalRedirect`).
   * With several acts the proposal's page stays and links each.
   */
  redirect: string | null
  /** The consultation behind the proposal on the Commission's portal, by its COM number. */
  consultation: EuConsultation
}
