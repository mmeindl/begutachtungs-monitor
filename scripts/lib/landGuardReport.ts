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
 * The floor's closing line, each verdict by its own name. Until 20.11.2026
 * the harness counted every class it did not hold as „nicht gehalten" and
 * printed a tick beside a failed run: „✓ 11 von 14 …; 3 nicht gehalten",
 * where the three were below the floor. Zero of zero is no all-clear.
 */
export function floorLine(rows: readonly FloorRow[], pct: number): string {
  const n = (v: FloorVerdict) => rows.filter((r) => r.verdict === v).length
  const unheld = n('nicht gehalten') ? `; ${n('nicht gehalten')} nicht gehalten (weniger als ${MIN_TRIES} Versuche)` : ''
  if (n('unter dem Boden')) return `✗ ${n('unter dem Boden')} von ${rows.length} Fehlerklassen unter ${pct} %${unheld}`
  if (!n('gehalten')) return `? keine Fehlerklasse mit mindestens ${MIN_TRIES} Versuchen — der Boden hat nichts gehalten`
  return `✓ ${n('gehalten')} von ${rows.length} Fehlerklassen mit mindestens ${MIN_TRIES} Versuchen zu mindestens ${pct} % gefangen${unheld}`
}

/**
 * Where a fault in a § shown ends (20.11.2026): withheld; shown with
 * „nicht geprüft" (`notHeld` in `landTguGuard.ts`), so the page says its new
 * text was not held against the draft; or shown without it — the only
 * outcome that passes a wrong text as checked.
 */
export type MarkOutcome = 'withheld' | 'marked' | 'unmarked'

/** One injected fault: its class, whether its § carried the mark before, and where it ended. */
export interface MarkedFault { key: string; markedBefore: boolean; outcome: MarkOutcome }

interface MarkCounts { tried: number; withheld: number; marked: number; unmarked: number }
export interface MarkTally extends MarkCounts {
  key: string
  /** The same over the §§ that carried no mark before the fault: those the floor holds. */
  beforeUnmarked: MarkCounts
}

/** The three outcomes per class, in the order of `keys`, over every § and over those without a mark before. */
export function markTallies(faults: readonly MarkedFault[], keys: readonly string[]): MarkTally[] {
  const count = (list: readonly MarkedFault[]): MarkCounts => ({
    tried: list.length,
    withheld: list.filter((f) => f.outcome === 'withheld').length,
    marked: list.filter((f) => f.outcome === 'marked').length,
    unmarked: list.filter((f) => f.outcome === 'unmarked').length,
  })
  return keys.map((key) => {
    const of = faults.filter((f) => f.key === key)
    return { key, ...count(of), beforeUnmarked: count(of.filter((f) => !f.markedBefore)) }
  })
}

/**
 * The floor's tally of a class (`--mindestens`): over the §§ without a mark
 * before the fault, caught is every fault NOT shown without the mark. A §
 * already marked says of itself that it was not held; a fault that turns a
 * held § into a marked one is said on the page.
 */
export function unmarkedFloor(t: MarkTally): FaultTally {
  return { key: t.key, tried: t.beforeUnmarked.tried, caught: t.beforeUnmarked.tried - t.beforeUnmarked.unmarked }
}

/**
 * A § the comparison withholds, as `LandLawDiffResponse.withheld` names it.
 * `reason` undefined: RIS refused the left column's text in force
 * (`compareTgu`, `why`) — named „leftCheck" in the baseline.
 */
export interface WithheldItem { law: string | null; id: string; fromId?: string; reason?: string }

/** One withheld § as one line: cause, law, § — the identity the baseline compares. */
export function withheldLine(w: WithheldItem): string {
  return `${w.reason ?? 'leftCheck'} · ${paragraphKey(w.law, w.id, w.fromId)}`
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

/** A § of the comparison as the accounting reads it: its law, its number, the number it comes from. */
export interface AccountUnit { article: string | null; id: string; fromId: string | null }

/** A § by law and number, a renumbered one as „§ 11a → § 11d" — the key it is accounted under. */
export function paragraphKey(law: string | null, id: string, fromId?: string | null): string {
  return `${law ?? '–'} · ${fromId && fromId !== id ? `${fromId} → ` : ''}${id}`
}

export interface Accounting {
  compared: number
  shown: number
  withheld: number
  /** Shown and withheld at once. */
  both: string[]
  /** Compared, and then neither shown nor withheld: gone from the page without a word. */
  neither: string[]
  /** Shown, and never among the §§ compared. */
  unknownShown: string[]
}

/**
 * Where each § of one comparison ended (20.11.2026), per law: `compared` are
 * the §§ `compareTgu` held before its draft check (`beforeDraftCheck`),
 * `shown` its answer's units, `withheld` its answer's withheld list. The
 * Bund has its consolidation balance (`harness/accounting.ts`); here the
 * invariant is that every § compared ends exactly once — shown or withheld —
 * and nothing is shown that was not compared. A § the reader withheld before
 * comparing stands in `withheld` alone and is in balance. What the reader
 * never opened at all cannot be seen here: that is `unaccountedInstructed`.
 */
export function accountFor(compared: readonly AccountUnit[], shown: readonly AccountUnit[], withheld: readonly WithheldItem[]): Accounting {
  const comparedKeys = new Set(compared.map((u) => paragraphKey(u.article, u.id, u.fromId)))
  const shownKeys = new Set(shown.map((u) => paragraphKey(u.article, u.id, u.fromId)))
  const withheldKeys = new Set(withheld.map((w) => paragraphKey(w.law, w.id, w.fromId)))
  return {
    compared: comparedKeys.size,
    shown: shownKeys.size,
    withheld: withheldKeys.size,
    both: [...shownKeys].filter((k) => withheldKeys.has(k)),
    neither: [...comparedKeys].filter((k) => !shownKeys.has(k) && !withheldKeys.has(k)),
    unknownShown: [...shownKeys].filter((k) => !comparedKeys.has(k)),
  }
}

/** Whether the accounting breaks: a § in both lists, in neither, or shown uncompared. */
export function accountingFailed(a: Accounting): boolean {
  return a.both.length > 0 || a.neither.length > 0 || a.unknownShown.length > 0
}

/**
 * The §§ the draft's instructions name for a law that the comparison
 * neither shows nor withholds — both maps keyed by the draft's law key, with
 * designation keys (`designationKey`). A § opener the reader missed leaves
 * its § in neither list (`landTgu.ts`, `tguParagraphs`: its lines join the
 * § before, or a division heading); so does a § the Land's document does
 * not print. Printed, never failed: which of the two it is is reading work.
 * A law of the draft the comparison has nothing of is left to the caller,
 * which counts it apart: the document may not reach that law at all.
 */
export function unaccountedInstructed(named: ReadonlyMap<string | null, ReadonlySet<string>>, accounted: ReadonlyMap<string | null, ReadonlySet<string>>): { law: string | null; para: string }[] {
  const out: { law: string | null; para: string }[] = []
  for (const [law, paras] of named) {
    const has = accounted.get(law)
    if (!has) continue
    for (const para of paras) if (!has.has(para)) out.push({ law, para })
  }
  return out
}

/**
 * The § an instruction inserts after — „Nach § 48 wird eingefügt", „Nach
 * § 8a werden folgende §§ 8b bis 8e eingefügt", „Nach § 15 wird folgender
 * § 16 samt Überschrift angefügt" — which it names and does not change; null
 * for any other instruction. The draft reader lists such an anchor among
 * the §§ the instruction may print text for (`DraftUnit.paras`), so the
 * comparison has no reason to show it: of the 20 §§ instructed and
 * accounted for by neither list on 20.11.2026, ten were such anchors. The
 * wording is that of those ten lines.
 */
export function anchorOf(instruction: string): string | null {
  const m = /^\s*Nach\s+(§\s*\d+[a-z]?)\s+(?:wird|werden)\b[^„"“]*?\b(?:eingefügt|angefügt)\b/.exec(instruction)
  return m ? m[1]!.replace(/^§\s*/, '§ ') : null
}

/** One answer of `compareTgu`, as far as a Land's record reads it. */
export interface RecordAnswer { available: boolean; units: readonly { change: string }[]; withheld: readonly WithheldItem[] }

/**
 * What a Land's comparisons came to, measured through `compareTgu` alone —
 * for a Land the draft rules are not asked of (Kärnten: its right column is
 * the Novelle's instructions, reprinted; `landTguGuard.ts`). `documents`:
 * answers that show a comparison; `withheld` by cause, a § RIS refused as
 * „leftCheck", as in the baseline.
 */
export interface LandRecord {
  answered: number
  documents: number
  shownChangedOrNew: number
  shownUnchanged: number
  withheld: number
  withheldBy: Record<string, number>
}

export function landRecord(answers: readonly RecordAnswer[]): LandRecord {
  const withheldBy: Record<string, number> = {}
  for (const a of answers) for (const w of a.withheld) withheldBy[w.reason ?? 'leftCheck'] = (withheldBy[w.reason ?? 'leftCheck'] ?? 0) + 1
  const units = answers.flatMap((a) => a.units)
  return {
    answered: answers.length,
    documents: answers.filter((a) => a.available).length,
    shownChangedOrNew: units.filter((u) => u.change !== 'unchanged').length,
    shownUnchanged: units.filter((u) => u.change === 'unchanged').length,
    withheld: answers.reduce((n, a) => n + a.withheld.length, 0),
    withheldBy: Object.fromEntries(Object.entries(withheldBy).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  }
}

/**
 * How far the harness got with one document of the population: its detail
 * not in the cache, no Textgegenüberstellung among its documents, a PDF
 * missing from the caches (`--cached-only`), a read that failed, or an
 * answer of `compareTgu`.
 */
export type Reach = 'kein Detail im Cache' | 'keine Textgegenüberstellung' | 'PDF nicht im Cache' | 'Lesen fehlgeschlagen' | 'beantwortet'

/** Per Land: the documents requested, and where each one ended. `incomplete`: answered, but a read beneath it failed (`Gathered.complete`). */
export interface LandReach { requested: number; answered: number; incomplete: number; noDetail: number; noTgu: number; pdfMissing: number; failed: number }

export function reachByLand(documents: readonly { land: string; reach: Reach; complete: boolean }[]): Record<string, LandReach> {
  const out: Record<string, LandReach> = {}
  for (const d of documents) {
    const r = (out[d.land] ??= { requested: 0, answered: 0, incomplete: 0, noDetail: 0, noTgu: 0, pdfMissing: 0, failed: 0 })
    r.requested++
    if (d.reach === 'beantwortet') {
      r.answered++
      if (!d.complete) r.incomplete++
    } else if (d.reach === 'kein Detail im Cache') r.noDetail++
    else if (d.reach === 'keine Textgegenüberstellung') r.noTgu++
    else if (d.reach === 'PDF nicht im Cache') r.pdfMissing++
    else r.failed++
  }
  return out
}
