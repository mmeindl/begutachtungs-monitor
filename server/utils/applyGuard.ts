/**
 * Draft-time plausibility checks on an engine result (docs/architecture.md §12.12).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * The engine's refusals say reliably that it did *nothing*, and nothing at
 * all about whether what it did is *right*: of 261 checked paragraphs, the
 * 190 without a single refusal diverged from RIS at exactly the overall rate
 * (12,6 %, 2026-09-09). A gate that publishes "everything that was not
 * refused" therefore publishes silent errors. This module computes signals
 * that are available at draft time — before the law exists — and that did
 * correlate with those silent errors when measured against the ones the
 * engine used to make (39 of 323 unrefused paragraphs in the 52-Novellen
 * corpus, before the fixes of the same day):
 *
 *   | signal                              | caught | cost (correct §§ rejected) |
 *   |-------------------------------------|--------|----------------------------|
 *   | size: |Δ text − Δ operands| > 4     | 21/39  | 11/218 (5 %)               |
 *   | seam: whitespace around punctuation |  5/39  | 0                          |
 *   | leak: a marker inside a text        |  1/39  | 0                          |
 *   | union of the three                  | 27/39  | 11/218                     |
 *   | + unexplained diff tokens           | 30/39  | 31/218 (14 %)              |
 *
 * None of these is verification. They are the cheap half; the independent
 * check is the ressort's own Textgegenüberstellung (`tguOracle.ts`), where a
 * draft carries one. Together they decide what a gate may show as text.
 */
import { diffTokens } from './lawDiff'
import { plainText, type LawNode } from './lawStructure'
import type { ApplyResult, Instruction, StandingLaw } from './lawApply'
import { addressedSentence, resolveTarget } from './lawApply'

export type GuardFlag =
  /** An instruction on this § was refused — the engine's own signal */
  | 'verweigert'
  /** The text grew or shrank by more than the operands account for */
  | 'umfang'
  /** A space before punctuation, or a comma glued to a word, that the standing text did not have */
  | 'fuge'
  /** A node's text begins with what looks like an Absatz/Ziffer/Litera marker */
  | 'marker'
  /** Words changed that no operand of any instruction contains */
  | 'unerklärt'
  /** The diff was too long to check — never a pass */
  | 'unprüfbar'

export interface GuardReport {
  para: string
  flags: GuardFlag[]
  /** True when no flag is raised: the paragraph passes the plausibility gate */
  plausible: boolean
  /** Diagnostics for the report: the size mismatch and the unexplained words */
  sizeDelta: number
  unexplained: { inserted: string[]; removed: string[] }
}

/** Characters of size mismatch tolerated — the knee of the threshold curve (2026-09-09). */
export const SIZE_TOLERANCE = 4

/** "(2)", "3.", "b)" — and "f.", the Litera style with a full stop (Medizinproduktegesetz, 2026-09-09). */
const MARKER_START = /^(?:\(\d+[a-z]*\)|\d+[a-z]*\.|[a-z][.)])(?=\s|$)/

/**
 * Words without their punctuation: a phrase inserted before a comma turns
 * "Wort" into "Wort," in the diff, which is not a changed word. Comparing
 * raw tokens flagged 41 of 267 correct paragraphs as unexplained (2026-09-09).
 */
function tokens(t: string): string[] {
  return t
    .split(/\s+/)
    .map((w) => w.replace(/^[„"'(\[]+|["'),.;:\]]+$/g, ''))
    .filter(Boolean)
}

function textNodes(n: LawNode): LawNode[] {
  return [n, ...n.children.flatMap(textNodes)]
}

function multisetMinus(a: readonly string[], b: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const t of b) counts.set(t, (counts.get(t) ?? 0) + 1)
  const out: string[] = []
  for (const t of a) {
    const n = counts.get(t) ?? 0
    if (n > 0) counts.set(t, n - 1)
    else out.push(t)
  }
  return out
}

/**
 * What the operands of the applied instructions say the text should have
 * gained and lost — words and characters. Every operation kind contributes
 * what it announces: a phrase replacement its `from` and `to`, a unit
 * replacement its payload and the unit it replaces, a deletion the deleted
 * unit. What the engine actually changed must be covered by this.
 */
function announced(before: StandingLaw, id: string, beforeTree: LawNode | null, ops: readonly Instruction[]): { inserted: string[]; removed: string[]; delta: number } {
  const inserted: string[] = []
  const removed: string[] = []
  let delta = 0
  const gain = (t: string): void => {
    inserted.push(...tokens(t))
    delta += t.length + 1
  }
  const loss = (t: string): void => {
    removed.push(...tokens(t))
    delta -= t.length + 1
  }
  const unitText = (op: Instruction['op'], targetId: string): string | null => {
    if (!('target' in op) || !beforeTree) return null
    if (op.target.level === 'para') return targetId === id ? plainText(beforeTree) : null
    const node = resolveTarget(before, op.target, targetId)
    if (!node) return null
    return op.target.satz ? addressedSentence(node, op.target.satz, op.target.satzCount) : plainText(node)
  }
  for (const { op, payload } of ops) {
    // A payload of several §§ ("folgende §§ 10h und 10i") is charged to the §
    // it creates, not to every § it names; the first version charged both
    // to each and flagged every multi-§ insert (2026-09-09).
    const own = payload.some((p) => p.level === 'para' && p.id) ? payload.filter((p) => p.level !== 'para' || p.id === id) : payload
    const payloadText = own.map((p) => plainText(p)).join(' ')
    switch (op.kind) {
      case 'replacePhrase': {
        // "jeweils" replaces every occurrence in the scope; each one weighs.
        const scope = op.target.satz || op.target.level !== 'para' ? unitText(op, op.target.lit ?? op.target.z ?? op.target.abs ?? id) : beforeTree ? plainText(beforeTree) : null
        const n = op.everywhere && scope ? Math.max(1, scope.split(op.from).length - 1) : 1
        for (let k = 0; k < n; k++) {
          gain(op.to)
          loss(op.from)
        }
        break
      }
      case 'insertPhrase':
        gain(op.text)
        break
      case 'deletePhrase':
        loss(op.text)
        break
      case 'replaceHeading':
        gain(payloadText)
        loss(beforeTree?.heading ?? '')
        break
      case 'replace': {
        gain(payloadText)
        if (op.target.level === 'para') {
          // A § restated without a printed heading keeps its old one; only a
          // payload that brings a heading replaces it.
          if (beforeTree) loss(plainText({ ...beforeTree, heading: own.some((p) => p.heading) ? beforeTree.heading : null }))
          break
        }
        const ids = [op.target.lit ?? op.target.z ?? op.target.abs ?? '', ...op.target.siblings]
        for (const t of ids) {
          const old = unitText(op, t)
          if (old !== null) loss(old)
        }
        break
      }
      case 'append':
      case 'insertAfter':
        // A new § anchored at this one adds nothing to this one's text.
        if (op.child === 'para' && !own.some((p) => p.level === 'para' && p.id === id)) break
        gain(payloadText)
        break
      case 'delete': {
        const ids = [op.target.lit ?? op.target.z ?? op.target.abs ?? id, ...op.target.siblings]
        for (const t of ids) {
          const old = unitText(op, t)
          if (old !== null) loss(old)
        }
        break
      }
      default:
        break
    }
  }
  return { inserted, removed, delta }
}

/**
 * The plausibility report for one paragraph after a run.
 *
 * `before` is the standing law the run started from (null for a § the
 * Novelle creates), `after` the engine's result for this §, `touching` the
 * instructions that addressed it with their results, in run order.
 */
export function guardParagraph(
  id: string,
  before: StandingLaw,
  beforeTree: LawNode | null,
  after: LawNode,
  touching: readonly { instruction: Instruction; result: ApplyResult }[],
): GuardReport {
  const flags = new Set<GuardFlag>()
  const applied = touching.filter((t) => t.result.applied).map((t) => t.instruction)
  if (touching.some((t) => !t.result.applied)) flags.add('verweigert')

  const beforeText = beforeTree ? plainText(beforeTree) : ''
  const afterText = plainText(after)

  // Size: the text should have changed by about what the operands weigh.
  const said = announced(before, id, beforeTree, applied)
  const sizeDelta = afterText.length - beforeText.length - said.delta
  if (Math.abs(sizeDelta) > SIZE_TOLERANCE) flags.add('umfang')

  // Seam: a space in front of punctuation, or a comma glued to a letter,
  // that was not there before.
  const seam = (t: string): number => (t.match(/\s[,.;:](?=\s|$)|,(?=[^\s\d])/g) ?? []).length
  if (seam(afterText) > seam(beforeText)) flags.add('fuge')

  // Leak: a marker left inside a node's text — the payload parser missed a level.
  const leaks = (n: LawNode): number => textNodes(n).filter((x) => MARKER_START.test(x.text)).length
  if (leaks(after) > (beforeTree ? leaks(beforeTree) : 0)) flags.add('marker')

  // Unexplained: words the engine changed that no operand names.
  const { segments } = diffTokens(beforeText, afterText)
  let unexplained = { inserted: [] as string[], removed: [] as string[] }
  if (segments === null) {
    flags.add('unprüfbar')
  } else {
    const ins = segments.filter((s) => s.type === 'inserted').flatMap((s) => tokens(s.text))
    const rem = segments.filter((s) => s.type === 'removed').flatMap((s) => tokens(s.text))
    unexplained = { inserted: multisetMinus(ins, said.inserted), removed: multisetMinus(rem, said.removed) }
    if (unexplained.inserted.length || unexplained.removed.length) flags.add('unerklärt')
  }

  return { para: id, flags: [...flags], plausible: flags.size === 0, sizeDelta, unexplained }
}
