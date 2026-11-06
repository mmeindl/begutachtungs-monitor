import type { TraceLink } from './common'
import type { DraftSummary } from './drafts'
import type { LandCode, LandConsultation } from './laender'
import type { RisConsultation } from './ris'

// ---------------------------------------------------------------------------
// EU-Recht (docs/architecture.md §12.66)
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
// The EU map: one act, the Bund and the nine Länder (§12.66, Nachtrag 3)
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
   * The act's Amtsblatt reference and ELI, for the „Zitieren" button; each
   * null where the Cellar did not answer or has none. Asked per request, not
   * kept in the map: only this page cites (`ojReferenceOf`).
   */
  oj: EuOjReference | null
  eli: string | null
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
