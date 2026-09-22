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
import { opAddress } from './novao'
import type { ConsolidatedWithheldCause } from '../../../shared/types'
import { bareParaId } from '../text/designation'

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
  return num(a) - num(b) || a.localeCompare(b, 'de')
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
    if (address?.para) {
      const id = bareParaId(address.para)
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
