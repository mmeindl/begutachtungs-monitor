/**
 * The two files the base-rate measurement passes between its halves.
 *
 * `begutachtung-skipped.ts` writes `<GP>-skipped.json` and reads
 * `<GP>-me-antrag.json`; `me-antrag-join.ts` does the reverse. They are
 * separate scripts because the text join loads one document per Gegenstand
 * and has a completely different runtime — but they have to agree on the
 * shape, and two copies of that agreement drift on the day one of them
 * learns a field. Same reason `lib/gateGoldenKeys.ts` exists.
 *
 * Types only: nothing here runs, so neither script imports the other.
 */

/** One enacted law, keyed by its BGBl number — the unit of the base rate. */
export interface SkippedRow {
  /** `I` for a Regierungsvorlage, `A` for a selbständiger Antrag. */
  ityp: string
  inr: string
  citation: string
  title: string
  date: string
  /** The BGBl number this row is about; the item's own list is collapsed to it. */
  bgbl: string
  enacted: boolean
  einlangen: string | null
  /** Klubkürzel of the named Antragsteller:innen, sorted. */
  clubs: string[]
  /** `<GP>/ME/<inr>` of the Ministerialentwurf the Regierungsvorlage names, or null. */
  me: string | null
  meVerified: boolean
  consulted: boolean
  exemptReason: string | null
  /** Only on the Antrag rows the report classifies; absent in the file. */
  kind?: string
}

export interface SkippedReport {
  gp: string
  measuredAt: string
  totals: Record<string, unknown>
  antragKinds: { kind: string; n: number }[]
  vorgeschichte: unknown[]
  collisions: { bgbl: string; a: unknown; b: unknown }[]
  rows: SkippedRow[]
}

/** One Initiativantrag the text join ties back to a Ministerialentwurf. */
export interface MeAntragHit {
  citation: string
  inr: string
  title: string
  bgbl: string
  einlangen: string
  kind: string | null
  meInr: string
  meTitle: string
  meStart: string | null
  meFrist: string | null
  meBecameRv: boolean
  /** Containment of the shorter text in the longer one, 0…1. */
  score: number
  jaccard: number
  /** Above the read-off gap: this one carries the correction. */
  strong: boolean
  titleIdentical: boolean
  /** Filed while the Begutachtungsfrist of that draft was still running. */
  fristOffen: boolean
  weitereKandidaten: number
}

export interface MeAntragReport {
  gp: string
  measuredAt: string
  method: { shingle: number; sketchMod: number; threshold: number }
  calibration: {
    measure: string
    truePairs: number
    trueP05: number
    trueMedian: number
    asymPairs: number
    asymP05: number
    asymRecall: number
    noisePairs: number
    noiseP95: number
    noiseMax: number
    recall: number
    falsePositives: number
  }
  antraegeGeprueft: number
  antraegeZuKurz: number
  zuKurz: { citation: string; title: string; sketchSize: number }[]
  treffer: number
  trefferBelegt: number
  strongThreshold: number
  hits: MeAntragHit[]
}
