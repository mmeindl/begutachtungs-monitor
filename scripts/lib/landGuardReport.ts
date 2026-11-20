/**
 * The verdicts over what `harness/landGuard.ts` measures of a Land's
 * Textgegenüberstellung (20.11.2026) — pure, so `tests/landGuardReport.test.ts`
 * can hold every rule against an invented run, as `annexReport.ts` does for
 * the Bund's annex. The harness fetches, counts and prints; whether a run
 * stands is decided here.
 */

/**
 * Below this many tries a fault class is not held by a floor: one miss is
 * five points there. The Bund's floor (`harness/faultInjection.ts`,
 * `--mindestens`) let such a class pass in silence; here it is named „nicht
 * gehalten", so a class that shrinks below the threshold is read as what it
 * is — unmeasured — and not as one that holds.
 */
export const MIN_TRIES = 20

export interface FaultTally { key: string; tried: number; caught: number }

/**
 * `gehalten`: tried often enough and caught at or above the floor.
 * `unter dem Boden`: tried often enough and caught below it — the run fails.
 * `nicht gehalten`: tried fewer than `MIN_TRIES` times; the floor says
 * nothing about the class, and the record says so.
 */
export type FloorVerdict = 'gehalten' | 'unter dem Boden' | 'nicht gehalten'

export interface FloorRow extends FaultTally {
  /** The share caught in percent; null where nothing was tried. */
  rate: number | null
  verdict: FloorVerdict
}

/** Each fault class against the floor `pct` (`--mindestens=<pct>`). */
export function floorRows(tallies: readonly FaultTally[], pct: number): FloorRow[] {
  return tallies.map((t) => {
    const rate = t.tried ? (100 * t.caught) / t.tried : null
    const verdict: FloorVerdict = t.tried < MIN_TRIES ? 'nicht gehalten' : rate! < pct ? 'unter dem Boden' : 'gehalten'
    return { ...t, rate, verdict }
  })
}

/** Whether the run fails its floor: some class tried often enough is caught below it. */
export function floorFailed(rows: readonly FloorRow[]): boolean {
  return rows.some((r) => r.verdict === 'unter dem Boden')
}

/**
 * A § the comparison withholds, as `LandLawDiffResponse.withheld` names it.
 * `reason` undefined: RIS refused the left column's text in force
 * (`compareTgu`, `why`) — named „leftCheck" in the baseline.
 */
export interface WithheldItem { law: string | null; id: string; fromId?: string; reason?: string }

/** One withheld § as one line: cause, law, § — the identity the baseline compares. */
export function withheldLine(w: WithheldItem): string {
  return `${w.reason ?? 'leftCheck'} · ${w.law ?? '–'} · ${w.fromId && w.fromId !== w.id ? `${w.fromId} → ` : ''}${w.id}`
}

/**
 * What one document came to: whether the harness reached an answer
 * (`state`: „beantwortet", or why not), whether the answer shows a
 * comparison, how many §§ it shows, and every § it withholds.
 */
export interface LandBaselineDocument {
  land: string
  state: string
  available: boolean
  shown: number
  withheld: string[]
}

export interface LandBaseline {
  /** When it was drawn — the provenance of a finding. */
  at: string
  documents: Record<string, LandBaselineDocument>
}

/** A document as the baseline holds it; `answer` null where `compareTgu` gave none. */
export function baselineDocument(land: string, state: string, answer: { available: boolean; units: readonly unknown[]; withheld: readonly WithheldItem[] } | null): LandBaselineDocument {
  return {
    land,
    state,
    available: answer?.available ?? false,
    shown: answer?.units.length ?? 0,
    withheld: (answer?.withheld ?? []).map(withheldLine).sort(),
  }
}

export function toLandBaseline(documents: Record<string, LandBaselineDocument>, now: Date = new Date()): LandBaseline {
  const sorted = Object.fromEntries(Object.entries(documents).sort(([a], [b]) => a.localeCompare(b)))
  return { at: now.toISOString(), documents: sorted }
}

/**
 * Every way this run differs from the baseline, one finding per withheld §
 * that came or went and one per document that answers differently.
 *
 * Equality, not a band, for the reason `annexReport.ts` gives for the
 * annex: a Land's document once published does not change, and the
 * comparison holds it against RIS as of a fixed date — the same document
 * has to measure the same tomorrow. Unlike the annex's moving window the
 * population here is the cached Länder list, so a document the baseline
 * does not know, or one it knows and the run lacks, is a finding too: the
 * list was refreshed, or the document was not reached. What a finding does
 * not say is the cause — our change, or RIS answering differently; telling
 * those apart is reading work.
 *
 * `inScope`: whether a document of the baseline was asked of in this run
 * (`--land`, `--show`); the others are not compared.
 */
export function landBaselineFindings(baseline: LandBaseline, current: Record<string, LandBaselineDocument>, inScope: (id: string, doc: LandBaselineDocument) => boolean): string[] {
  const out: string[] = []
  const since = baseline.at.slice(0, 10)
  for (const [id, was] of Object.entries(baseline.documents)) {
    if (!inScope(id, was)) continue
    const now = current[id]
    if (!now) {
      out.push(`\`${id}\`: in der Grundlinie (${since}), in diesem Lauf nicht in der Population — ${was.withheld.length} einbehaltene §§ nicht verglichen.`)
      continue
    }
    const moved: string[] = []
    if (was.state !== now.state) moved.push(`Zustand: ${was.state} → ${now.state}`)
    if (was.available !== now.available) moved.push(`verfügbar: ${was.available} → ${now.available}`)
    if (was.shown !== now.shown) moved.push(`gezeigt: ${was.shown} → ${now.shown}`)
    if (moved.length) out.push(`\`${id}\`: misst sich anders als beim letzten Mal (${since}) — ${moved.join('; ')}.`)
    const left = [...now.withheld]
    for (const line of was.withheld) {
      const at = left.indexOf(line)
      if (at >= 0) left.splice(at, 1)
      else out.push(`\`${id}\`: ${line} — ist weg (einbehalten in der Grundlinie, ${since}).`)
    }
    for (const line of left) out.push(`\`${id}\`: ${line} — kam dazu (nicht in der Grundlinie, ${since}).`)
  }
  for (const id of Object.keys(current)) {
    if (!baseline.documents[id]) out.push(`\`${id}\`: nicht in der Grundlinie (${since}) — ${current[id]!.withheld.length} einbehaltene §§, ${current[id]!.shown} gezeigt; neu ziehen mit --baseline-schreiben.`)
  }
  return out
}
