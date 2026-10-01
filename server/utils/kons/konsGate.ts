/**
 * What of our own konsolidierte Lesefassung may be shown
 * (docs/architecture.md §12.12, §12.12a).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * One decision lives here, and it lives here because it *is* a decision: a §
 * the engine produced goes on the page only where three independent things
 * come together.
 *
 * THE THREE SIGNALS, and why none of them is enough on its own:
 *
 *  1. **No refusal.** Says reliably that the engine did *nothing* — and
 *     nothing about whether what it did is right. Measured: of 261 checked
 *     §§ the 190 without a refusal diverged at exactly the overall rate
 *     (12,6 %, 09.09.2026). A gate that shows „alles Unverweigerte" publishes
 *     silent errors.
 *  2. **Plausible** (`kons/applyGuard.ts`). Size, seams, markers, unexplained
 *     words — a filter at the edge, not a verification. By construction it
 *     cannot see what was read wrongly and then applied consistently.
 *  3. **Confirmed by the annex** (`kons/tguOracle.ts`). The one independent
 *     signal: the ressort's own Textgegenüberstellung, written on the first
 *     day of the Begutachtung and without knowledge of our engine. Of 140
 *     plausible §§ the annex says something about, it contradicts 34 (24 %,
 *     production path, 40 drafts, 19.09.2026) — the measured price of
 *     publishing without it.
 *
 * From which follows the uncomfortable property of this gate, and it belongs
 * on the page rather than in a footnote: **where the ressort publishes no
 * readable Gegenüberstellung, this section shows nothing** — not because the
 * engine is worse there, but because nobody contradicts it. The gate's
 * coverage is the annex's coverage (41 % of the §§ with an annex, 0 % without,
 * by construction).
 */

import type { Instruction } from './lawApply'
import { articleQualifier, isTocInstruction, namedParagraphs, opAddress, refusedAddresses } from './novao'
import type { ConsolidatedWithheldCause } from '../../../shared/types'
import { articleNumberKey, isSchedule, unitKey } from '../text/designation'

/**
 * Why a produced § is not shown.
 *
 * - `verweigert` — at least one instruction on this § could not be carried
 *   out safely.
 * - `nicht-geladen` — our own ceiling, not the engine's verdict: a
 *   Sammelgesetz names more laws and §§ than one page may load. A cause of
 *   its own, because the balance under the list would otherwise report our
 *   limit as a refusal by the engine — the very confusion this whole module
 *   is written against.
 * - `unplausibel` — the result did not pass the plausibility signals.
 * - `kein-anhang` — the draft carries no readable Textgegenüberstellung.
 * - `anhang-schweigt` — there is one, but it says nothing checkable about
 *   this §.
 * - `anhang-widerspricht` — it contradicts the engine's result.
 */
export type WithholdCause = ConsolidatedWithheldCause

/** The annex's verdict as `oracleVerdict` (`kons/tguOracle.ts`) passes it, plus "there is none". */
export type GateOracle = 'bestätigt' | 'widersprochen' | 'stumm' | 'fremd' | 'kein Anhang'

export interface GateInput {
  /** An instruction on this § was refused (`instructionsFromUnits` in `kons/lawApply.ts`). */
  refused: boolean
  /** `guardParagraph().plausible` (`kons/applyGuard.ts`) */
  plausible: boolean
  oracle: GateOracle
}

/**
 * Show it or not — and if not, why.
 *
 * The order of the causes is the order of responsibility: first what the
 * engine admits itself (a refusal), then what our own signals find, and only
 * then the outside document. A § the engine refused AND the annex contradicts
 * counts as refused — otherwise the statistics would look as if it were the
 * ressort's fault.
 */
export function gateParagraph({ refused, plausible, oracle }: GateInput): { show: boolean; cause: WithholdCause | null } {
  if (refused) return { show: false, cause: 'verweigert' }
  if (!plausible) return { show: false, cause: 'unplausibel' }
  if (oracle === 'bestätigt') return { show: true, cause: null }
  if (oracle === 'kein Anhang') return { show: false, cause: 'kein-anhang' }
  if (oracle === 'widersprochen') return { show: false, cause: 'anhang-widerspricht' }
  // „stumm" (the annex does not carry the §) and „fremd" (its geltende
  // Fassung is not in the RIS text that way) are the same thing to a reader:
  // there is no second opinion here. The harness keeps them apart.
  return { show: false, cause: 'anhang-schweigt' }
}

// ---------------------------------------------------------------------------
// The denominator of the display
// ---------------------------------------------------------------------------

/**
 * § order as the law prints it: § 22 before § 197, § 285b before § 285c. A
 * string sort puts „§ 197" before „§ 22" — on a page that shows law text that
 * reads like a defect.
 */
export function byParagraphOrder(a: string, b: string): number {
  const num = (id: string): number => Number.parseInt(id, 10) || 0
  // A law prints its schedules behind its Paragraphen, and so does the page.
  // Without this they sorted to the front, because „Anl. 1" parses as 0.
  if (isSchedule(a) !== isSchedule(b)) return isSchedule(a) ? 1 : -1
  const key = (id: string): string => (isSchedule(id) ? id.replace(/^\S+\s*/, '') : id)
  return num(key(a)) - num(key(b)) || a.localeCompare(b, 'de')
}

/**
 * The units a run of `applyNovelle` must not show as clean: every one an
 * unresolved instruction names, and every one a refused line names.
 *
 * Two readings stood in three places (`konsService`, both Prüfstände), and
 * both stopped short. A refused line counted with its first § only, so the
 * KFG line „In § 24 Abs. 2 Z 2, § 24a Abs. 2 lit. b, § 40 …" refused § 24 and
 * left §§ 24a, 40, 87 and 123a clean with nothing applied to them (26.09.2026).
 * And both were keyed by the bare number, while the page keys a schedule as
 * „Anl. 1": a failed instruction on the Anlage marked § 1 refused and left the
 * Anlage clean. `key` is the form the caller looks units up in.
 */
export function refusedUnits(unresolved: Iterable<string>, refusedLines: readonly string[], key: (designation: string) => string | null): Set<string> {
  const out = new Set<string>()
  for (const p of unresolved) {
    const id = key(p)
    if (id) out.add(id)
  }
  for (const line of refusedLines) {
    // „Im Inhaltsverzeichnis entfällt der Eintrag zu § 17; die Einträge zu den
    // §§ 18 und 19 lauten": the table of contents, which no § text carries —
    // the grammar reads it as `toc` for the same reason. Named §§ are its
    // entries, not its targets (BFA-VG, BGBl. I Nr. 39/2026). The one
    // predicate the grammar, the annex and the § names ask too: a prefix test
    // here missed „Der Eintrag zu § 50 im Inhaltsverzeichnis lautet:" and
    // locked § 50 (01.10.2026).
    if (isTocInstruction(line)) continue
    const named = refusedAddresses(line) ?? [/§+\s*\d+[a-z]*/.exec(line)?.[0] ?? '']
    for (const p of named) {
      const id = p ? key(p) : null
      if (id) out.add(id)
    }
  }
  return out
}

/**
 * Which §§ one Artikel of the draft touches — the **denominator** of the
 * display („gezeigt sind 32 von 61").
 *
 * Counted before anything can fail: from the instructions that were read AND
 * from the lines that were refused. A refusal is precisely no reason to take
 * a § out of the denominator — the reference would then shrink by exactly
 * what we cannot do, and „12 von 12" would stand over a list that keeps half
 * the draft quiet.
 *
 * An instruction that *inserts* a § counts: under the draft it is part of the
 * law, even where the standing text does not have it.
 */
export function addressedParagraphs(
  instructions: readonly Instruction[],
  refusedLines: readonly string[],
): string[] {
  const out = new Set<string>()
  for (const { op, payload } of instructions) {
    const address = opAddress(op)
    // `unitKey` and not the bare number: a law may carry a § 1 and an
    // Anl. 1, and everything downstream holds the unit under this key. Every
    // § of „Die §§ 12a und 13 entfallen", not the first one only — the second
    // was neither counted nor fetched, and the instruction failed on it.
    for (const para of address ? namedParagraphs(address) : []) {
      const id = unitKey(para)
      if (id) out.add(id)
    }
    if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') {
      for (const p of payload) if (p.id) out.add(p.id)
    }
  }
  for (const line of refusedLines) {
    const id = /§+\s*(\d+[a-z]*)/.exec(line)?.[1]
    if (id) out.add(id)
  }
  return [...out].sort(byParagraphOrder)
}

/**
 * The label RIS files each addressed § under — „§ 3" ordinarily, „Art. 2 § 3"
 * where the standing law is itself divided into Artikel (§12.12a).
 *
 * Two keys for one § that must not be conflated, which is why this is a map
 * and not a renaming: the DISPLAY keys a § by its bare number („3"), because
 * that is what the draft, the annex and the reader call it, and inside one
 * Artikel it is unique. The RIS LOOKUP needs the Artikel, because under „§ 3"
 * alone RIS carries no document in such a law at all — leaving the Artikel
 * off does not widen the search, it empties it.
 *
 * **Null as soon as two addressed §§ carry one number under different
 * labels.** The stock is held by bare id, so two Artikel with a § 3 would put
 * two documents under one key and the first one fetched would answer for
 * both — a § with the wrong law's text under a right-looking number. The same
 * trade as everywhere in this engine: a refusal beats half an application
 * (§12.12). Costs nothing measurable — no Ministerialentwurf of the corpus
 * addresses two Artikel of one law (300 Entwürfe, 25.09.2026).
 */
export function addressedLabels(
  instructions: readonly Instruction[],
  refusedLines: readonly string[],
): Map<string, string> | null {
  const out = new Map<string, string>()
  const add = (id: string, artikel: string | null): boolean => {
    // A schedule is already written the way RIS files it („Anl. 2"), and the
    // unnumbered „Anl." is resolved where the law's labels are known
    // (`kons/konsService.ts`) — a law with one schedule needs no number.
    const label = isSchedule(id) ? id : artikel ? `Art. ${artikel} § ${id}` : `§ ${id}`
    const seen = out.get(id)
    if (seen !== undefined && seen !== label) return false
    out.set(id, label)
    return true
  }
  for (const { op, payload } of instructions) {
    const address = opAddress(op)
    for (const para of address ? namedParagraphs(address) : []) {
      const id = unitKey(para)
      if (id && !add(id, address!.artikel)) return null
    }
    // A § this instruction CREATES lives in the Artikel the instruction
    // addresses — it has no designation of its own to read one from.
    if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') {
      for (const block of payload) if (block.id && !add(block.id, address?.artikel ?? null)) return null
    }
  }
  // A refused line fills a gap and never contradicts one. It produces no
  // operation and no node, so it cannot put a second document into the stock
  // — the collision this guards against is between two things that are
  // actually applied. Letting it refuse the Artikel anyway cost 116/ME one of
  // its 65 laws on a line whose § was addressed perfectly well elsewhere.
  for (const line of refusedLines) {
    const id = /§+\s*(\d+[a-z]*)/.exec(line)?.[1]
    if (!id || out.has(id)) continue
    const numeral = articleQualifier(line)
    out.set(id, numeral ? `Art. ${articleNumberKey(numeral) ?? numeral} § ${id}` : `§ ${id}`)
  }
  return out
}
