/**
 * Bund zu Land (docs/architecture.md §12.67): which Land drafts carry out a
 * Grundsatzgesetz of the Bund or implement a Vereinbarung gemäß Art. 15a
 * B-VG, and — per Grundsatzgesetz, keyed by its Kundmachung in BGBl I —
 * which Land drafts follow it.
 */
import type { TraceLink } from './common'
import type { EuListRow, EuPublisher, EuStand } from './eu'
import type { LandCode } from './laender'

/** A Kundmachung in BGBl I: „BGBl. I Nr. 44/2025". */
export interface BgblICitation {
  number: number
  year: number
}

/** One finding on a Land's draft, as its page shows it. */
export interface BundesrechtFinding {
  kind: 'grundsatzgesetz' | 'vereinbarung'
  /**
   * A Grundsatzgesetz's name in the nominative, „Anstellungserfordernisse-
   * Grundsatzgesetz"; an agreement's subject after „B-VG", „über
   * Sozialbetreuungsberufe". Null where the draft's sentence names none.
   */
  name: string | null
  /** The Kundmachung the sentence cites; null without one. Never a bare citation elsewhere in the draft. */
  bgbl: BgblICitation | null
  /** The draft says „teilweise". */
  partial: boolean
  /** The act's page (`/bundesrecht/2025/44`) — Grundsatzgesetze with a citation only; agreements get none in v1. */
  path: string | null
  /** The Kundmachung's day, from its RIS record; null where RIS did not answer or no citation was read. */
  kundmachung: string | null
  /** The Kundmachung's page in RIS. */
  risUrl: string | null
}

/** GET /api/laender/:land/:number/bundesrecht */
export interface LandBundesrechtResponse {
  /** At most one Grundsatzgesetz and one agreement; empty where the draft carries out nothing of the Bund's. */
  findings: BundesrechtFinding[]
  /** The Land's documents the finding was read from, for the credit line. */
  sources: TraceLink[]
}

/** The Grundsatzgesetz's own side, as its page shows it. */
export interface BundLandActHead {
  bgbl: BgblICitation
  /** „BGBl. I Nr. 44/2025" */
  citation: string
  /** `/bundesrecht/2025/44` */
  path: string
  /** RIS's Titel: „Bundesgesetz, mit dem das Schulunterrichtsgesetz, … geändert werden". */
  title: string | null
  /** The name the Länder carry out, as most of their drafts write it: „Anstellungserfordernisse-Grundsatzgesetz". */
  shortName: string | null
  /** Ausgabedatum, ISO. */
  kundmachung: string | null
  risUrl: string
  /** „128 d.B. (XXVIII. GP)", „3867/A (XXVII. GP)". */
  vorlage: string | null
  /**
   * The Ministerialentwurf the Vorlage came from — only where its own text
   * carried the Grundsatz content (`meCarriesGrundsatz`).
   */
  me: { gp: string; inr: number; citation: string; path: string } | null
  /** „Die Ausführungsgesetze der Länder sind binnen eines Jahres zu erlassen." — verbatim, null where the act has none. */
  fristClause: string | null
}

/** One Land draft on the act's page: two dates and a stand, no verdict (D6). */
export interface BundLandActDraft {
  key: string
  publisher: LandCode
  path: string
  title: string
  begutachtung: { start: string | null; end: string | null }
  stand: EuStand | null
  partial: boolean
  /** The draft as the lists carry it (`viewOfRow`). */
  row: EuListRow
}

/** GET /api/bundesrecht/:year/:number */
export interface BundLandActResponse {
  gp: string
  window: { from: string; to: string | null }
  builtAt: string
  act: BundLandActHead
  drafts: BundLandActDraft[]
  /** Länder the last build could not read whole — their drafts may be missing. */
  incomplete: EuPublisher[]
}

/** GET /api/drafts/:gp/:inr/bundesrecht — the line on a Ministerialentwurf whose Grundsatzgesetz is kundgemacht. Null body where none. */
export interface MeBundesrechtLine {
  path: string
  /** Land drafts in the window that carry the act out; zero is said as „noch kein Entwurf im Fenster", never „0 Länder". */
  drafts: number
  lands: LandCode[]
  fristClause: string | null
  /** „BGBl. I Nr. 44/2025" — the act the block names. */
  citation: string
  /** The Land drafts as the lists carry them, for the block „Ausführung durch die Länder" in the Bundesgesetzblatt section. */
  rows: EuListRow[]
}
