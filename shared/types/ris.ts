import type { BgblOutcome } from './bgbl'

// ---------------------------------------------------------------------------
// RIS ↔ ME mapping (docs/ris-join.md)
// ---------------------------------------------------------------------------

export type RisJoinStatus = 'matched' | 'matched_weak' | 'ambiguous' | 'unmatched'

export interface RisMapRow {
  citation: string
  inr: number
  status: RisJoinStatus
  /** A ≥ 0.90, B ≥ 0.75, C = weak dates+ministry rule; null when not matched */
  tier: 'A' | 'B' | 'C' | null
  /** RIS Technisch.ID, e.g. BEGUT_COO_2026_100_2_1836568 */
  risId: string | null
  risKurztitel: string | null
  /** Human-readable RIS page of the draft */
  risUrl: string | null
  /** RIS main document (draft text) in the formats RIS offers */
  risDocument: { html: string | null; xml: string | null; pdf: string | null } | null
  /**
   * The Ressort's Textgegenüberstellung — current law against proposed law,
   * written by the ministry itself. Null when the draft carries none;
   * `xml` null when RIS offers only a scan (docs/api-exploration.md §2c).
   */
  textComparison: { html: string | null; xml: string | null; pdf: string | null } | null
  /**
   * The Erläuterungen as their own RIS document — the Allgemeiner Teil a
   * reader triages the draft by. Carried here for the same reason as the
   * annex above: Parliament publishes the document only as a PDF, RIS as
   * typed XML, so the readable copy is reachable only through this join.
   */
  explanations: { html: string | null; xml: string | null; pdf: string | null } | null
  score: number | null
  /**
   * RIS's own start of the Begutachtungsfrist (ISO date) — the day the annex
   * was written, and therefore the version of the standing law its left
   * column claims to quote. The reference date for checking that claim
   * (`server/utils/annex/verdict.ts`): taking it from elsewhere moved a score
   * from 66,7 % to 88,9 %, which made the measurement an argument about the
   * date rather than about the parse.
   */
  risBeginn: string | null
  /** RIS Ende − Parliament Frist, days; a non-zero value is a Fristabweichung */
  endeOffsetDays: number | null
  /**
   * RIS's own end of the Begutachtungsfrist (ISO date). Carried so a page can
   * NAME the diverging date instead of only the offset — while the Frist
   * runs, "the other official source says the 21st" is actionable and "31
   * days off" is a riddle.
   */
  risEnde: string | null
  reason: string | null
}

export interface RisMapResponse {
  gp: string
  ruleVersion: number
  /** ISO timestamp of the RIS fetch this map was computed from */
  risFetchedAt: string
  risRecordsConsidered: number
  counts: Record<RisJoinStatus, number>
  rows: RisMapRow[]
}

// ---------------------------------------------------------------------------
// Begutachtungen without a parliamentary Gegenstand (docs/architecture.md §12.16)
// ---------------------------------------------------------------------------

/**
 * What kind of legal instrument a RIS-only Begutachtung is about.
 *
 * From `classifyRisRecord`, which reads the title — RIS Begut carries no
 * type field. It was built as a score penalty inside the RIS↔ME join, where
 * a wrong guess was outvoted by dates and titles; putting it on screen makes
 * it a factual claim, so it was checked against the join as an oracle
 * (`pnpm corpus:verordnungen`): of 472 records that the join tied to a real
 * Ministerialentwurf — which Parliament's list 81 only ever carries for
 * Gesetzesentwürfe — not one is classified `verordnung`.
 *
 * `unbestimmt` is the honest third state: a record whose title names no type
 * word (Staatsverträge, Vereinbarungen, programmes). The UI names the source
 * rather than guessing a type for it.
 */
export type RisConsultationKind = 'verordnung' | 'gesetz' | 'unbestimmt'

/**
 * One Begutachtung that RIS publishes and Parliament does not have a
 * Gegenstand for — two thirds of the whole pre-parliamentary corpus
 * (3.012 of 4.574 records on 2026-09-17).
 *
 * Deliberately NOT a `DraftSummary`: almost every field of that shape is a
 * promise this record cannot keep. There is no Geschäftszahl (the identity
 * is the RIS document ID), no Stellungnahmen list, no submitter counts and
 * no ME→RV chain, because none of those exist without a parliamentary
 * Gegenstand. Modelling it as a draft with null fields would have spread
 * "unknown" through a type whose readers treat those fields as known.
 */
export interface RisConsultation {
  /** `Metadaten.Technisch.ID` — the only stable identity this record has. */
  id: string
  kind: RisConsultationKind
  /** Kurztitel where RIS has one, else the long Titel. */
  title: string
  /** The full official Titel, when it says more than `title`; else null. */
  longTitle: string | null
  /** Ressort short code, e.g. "BMLUK"; '' when RIS names no parsable code. */
  ministryCode: string
  /** Full ministry name as RIS words it. */
  ministryName: string
  /** ISO date — BeginnBegutachtungsfrist; null when RIS has none. */
  startedAt: string | null
  /** ISO date — EndeBegutachtungsfrist; null when RIS has none. */
  deadline: string | null
  /** Frist still running, computed from `deadline` against today. */
  active: boolean
  /** The record's human-readable page on ris.bka.gv.at. */
  risUrl: string
  /**
   * The outcome: kundgemacht, and where (docs/architecture.md §12.32).
   *
   * On the BASE record and not only on the detail one, because the list needs
   * it just as much — the „Stand" column said „Begutachtung abgeschlossen" on
   * every finished row, even where the Verordnung had long been in force.
   *
   * Null means „not determined", NOT „not kundgemacht": both routes there run
   * under a time budget, and what does not finish inside it must never turn
   * into a statement about the Ressort. The negative finding is
   * `state: 'keine'` and stands inside the object.
   */
  outcome: BgblOutcome | null
}

/**
 * The same record with its documents — everything the Begutachtung
 * published, which for two thirds of these is more than the first look
 * suggested: 72,1 % carry Erläuterungen, 79,4 % a Begleitschreiben.
 */
export interface RisConsultationDetail extends RisConsultation {
  /** The draft text itself; always present in the measured corpus. */
  mainDocument: RisDocumentFormats
  /** The ministry's reasoning — Allgemeiner and Besonderer Teil. */
  explanations: RisDocumentFormats | null
  /** Current law against proposed law, where the ministry wrote one. */
  textComparison: RisDocumentFormats | null
  /**
   * The Begleitschreiben. It names the address a Stellungnahme goes to, and
   * for these procedures that is the ONLY way to file one: there is no
   * parliamentary form, because there is no Gegenstand.
   */
  coverLetter: RisDocumentFormats | null
  /**
   * Everything else the record carries as text: WFA, Vorblatt, Digicheck,
   * Anhänge — and now and then a Textgegenüberstellung or Erläuterungen under
   * a name our rules do not know („SAG_TGÜ", „EB"). Measured 22.09.2026: 16
   * of 41 text documents of the running records. Only the full-text search
   * reads them (docs/architecture.md §12.31).
   */
  otherDocuments: RisNamedDocument[]
}

/** A document that brings nothing but its own name as information. */
export interface RisNamedDocument {
  name: string
  formats: RisDocumentFormats
}

export interface RisDocumentFormats {
  html: string | null
  xml: string | null
  pdf: string | null
}

export interface RisConsultationsResponse {
  items: RisConsultation[]
  /** Rows after the filters — what the result line counts. */
  total: number
  /**
   * Rows in the GP BEFORE any filter. The page states the denominator next
   * to `withGegenstand`, and that sentence must not move when someone picks
   * a ministry — it describes the period, not the current view.
   */
  gpTotal: number
  /** The Gesetzgebungsperiode whose window was searched. */
  gp: string
  /**
   * The period whose still-running Fristen were read along, or null — set
   * only when the caller named NO period and such rows survived the filters
   * (docs/architecture.md §12.36).
   *
   * The page needs it because the period selector shows the running period
   * while these rows belong to the one before: a list that quietly mixes two
   * periods under one label is exactly what §12.21 refuses. It names them
   * instead.
   */
  carriedOverFrom: string | null
  availableGps: string[]
  /** Distinct ministries present in the result's GP (for the filter UI). */
  ministries: { code: string; name: string }[]
  /**
   * How many of the GP's RIS records DO have a Ministerialentwurf behind
   * them — the other half of the denominator, so a page can say what it is
   * leaving out instead of implying it is everything.
   */
  withGegenstand: number
  /**
   * Ministerialentwürfe whose RIS record the join could not decide
   * (`ambiguous`). While this is 0 the list above is exact; above 0 it can
   * carry that many rows too many, because the record belonging to such an
   * ME stays unclaimed and reads as "no Gegenstand". Measured 0 in GP XXVII
   * and GP XXVIII — surfaced rather than assumed away.
   */
  undecided: number
}
