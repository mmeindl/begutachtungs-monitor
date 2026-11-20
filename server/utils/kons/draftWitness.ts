/**
 * The second witness: a § the annex contradicts, shown where the draft's own
 * Gesetzestext settles the disagreement (20.11.2026).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * The legally relevant text of a draft is its Gesetzestext; the ministry's
 * Textgegenüberstellung is an aid beside it, and in a census of 64 §§ it
 * contradicted our result 40 times where our result followed the draft
 * („nach dem 30. Juni 2024" in the draft, „2025" in the annex). But the annex
 * is also the only independent check on OUR reading of the draft: a payload
 * our reader took wrongly (a lost line, a quotation cut short, a misread
 * number) is applied faithfully by the engine, and the annex is what catches
 * it. Trusting the draft where the annex disagrees would remove that check
 * exactly there — unless a second, independent reading of the draft stands
 * in for it.
 *
 * That reading is the draft's PDF in RIS, which the ressort's word processor
 * printed from its own document: neither our XML reader nor RIS's XML stands
 * between the two. A contradicted § is released only where all of this holds,
 * each stretch at a time, and then the oracle confirms the rest:
 *
 *  1. Every stretch where our result and a changed row's proposed column
 *     differ lies inside text an instruction touching the § supplies as new
 *     text (a payload, „durch … ersetzt", „eingefügt"). Where our result has
 *     words the annex lacks, or lacks words it has, the stretch must lie
 *     strictly inside the payload: at its edge it is what a quotation read
 *     too long or too short looks like.
 *  2. The annex's words there are no text the instructions on this § name
 *     elsewhere — an old wording they replace, a phrase they anchor on, or
 *     another instruction's payload: then the disagreement may be about WHERE
 *     the draft's text goes, and that is the annex's to judge.
 *  3. Our stretch, with `CONTEXT` tokens of the instruction around it as our
 *     reader read it, stands in the PDF where that instruction stands.
 *  4. The annex's variant, with the same context, stands nowhere there.
 *  5. Exact and local: tokens compared in the oracle's own comparison form,
 *     no fuzzy matching, no score.
 *  6. With each such stretch of the annex replaced by ours, the oracle
 *     confirms the § — so everything outside the stretches passes exactly
 *     the checks it passes today.
 *
 * A § released this way is not „confirmed by the annex". It carries its
 * places — both wordings — so the page can say at the § what differs.
 */
import type { ComparisonRow } from '../annex/comparisonRows'
import { printedLayout } from '../annex/elision'
import { normalizeText } from '../lawtext/normalize'
import type { NovaoOp } from './novao'
import { comparisonText, oracleVerdict, type StandingUnits } from './tguOracle'

/** Tokens of instruction text on either side of a stretch, as the PDF has to carry them. */
export const CONTEXT = 4
/** …and at the least, where the instruction's text ends sooner: a place at its very edge is not tied. */
const MIN_CONTEXT = 2

/** One instruction that acted on the §, as the guard is handed it. */
export interface WitnessInstruction {
  op: NovaoOp
  line: string
  /** Each unit of its new text in the comparison form (`plainText`), as the result carries it. */
  payload: string[]
}

/** The draft's second rendition in the key form, page furniture taken out. */
export interface DraftRendition {
  key: string
}

/** One place the witness settled: the annex's wording and the draft's, each with a few words around it. */
export interface WitnessPlace {
  annex: string
  draft: string
}

export type WitnessOutcome =
  | { released: true; places: WitnessPlace[] }
  | { released: false; reason: WitnessRefusal }

export type WitnessRefusal =
  | 'keine-fassung'
  | 'keine-stelle'
  | 'zu-weit'
  | 'zu-lang'
  | 'nicht-neuer-text'
  | 'ort-offen'
  | 'nicht-im-entwurfstext'
  | 'einheit-nicht-im-pdf'
  | 'nicht-im-pdf'
  | 'rand'
  | 'beilage-im-pdf'
  | 'nicht-abbildbar'
  | 'pruefung'

/** „2 von 40" — the page header the ressorts' word processor sets. */
const PAGE_HEADER_RE = /^\s*\d+\s+von\s+\d+\s*$/gm

/** The rendition from its pages, as `extractText` returns them. */
export function renditionOfPages(pages: readonly string[]): DraftRendition {
  return { key: keyOfTokens(tokensOf(pages.map((p) => p.replace(PAGE_HEADER_RE, ' ')).join('\n'))) }
}

/**
 * A token of the comparison form: a run of letters and digits, or one sign
 * `containmentKey` keeps. Quotation marks, hyphens and dashes are dropped,
 * as `containmentKey` drops them, so a token run closed up is that key.
 */
const TOKEN_RE = /[\p{L}\p{N}]+|[^\s\p{L}\p{N}"'„“”‚‘’\-‐‑–—&]/gu

function tokensOf(t: string): string[] {
  return comparisonText(t).match(TOKEN_RE) ?? []
}

function keyOfTokens(tokens: readonly string[]): string {
  return tokens.join('')
}

/** Every start of `needle` as a run of `hay`. */
function runsOf(hay: readonly string[], needle: readonly string[]): number[] {
  const out: number[] = []
  if (needle.length === 0 || needle.length > hay.length) return out
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let k = 0; k < needle.length; k++) if (hay[i + k] !== needle[k]) continue outer
    out.push(i)
  }
  return out
}

/** A place where a printed stretch and the result part: tokens [as, ae) of the stretch against [gs, ge) of the result. */
interface Divergence {
  as: number
  ae: number
  gs: number
  ge: number
}

/** Largest stretch × result the alignment takes on (cells). */
const MAX_CELLS = 6_000_000
/** Matched tokens in a row a place needs on each side. */
const MIN_TIE = 3
/** Longest side of one place, in tokens. Longer is no wording, it is placement. */
const MAX_SIDE = 40

/**
 * The stretch's tokens aligned locally in the result's: matches score, every
 * skipped token costs, and the best-scoring stretch of the result wins. Only
 * places tied by `MIN_TIE` matched tokens on both sides come out.
 */
function align(stretch: readonly string[], got: readonly string[]): { divergences: Divergence[] } | 'zu-lang' {
  const n = stretch.length
  const m = got.length
  if (n === 0) return { divergences: [] }
  if (n * m > MAX_CELLS) return 'zu-lang'
  const MATCH = 3
  const GAP = 1
  const w = m + 1
  const score = new Int32Array((n + 1) * w)
  let best = 0
  let bi = 0
  let bj = 0
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = stretch[i - 1] === got[j - 1] ? score[(i - 1) * w + j - 1]! + MATCH : -Infinity
      const up = score[(i - 1) * w + j]! - GAP
      const left = score[i * w + j - 1]! - GAP
      const v = Math.max(0, diag, up, left)
      score[i * w + j] = v
      if (v > best) {
        best = v
        bi = i
        bj = j
      }
    }
  }
  // Back from the best cell to where the score started: the matched pairs.
  const pairs: [number, number][] = []
  let i = bi
  let j = bj
  while (i > 0 && j > 0 && score[i * w + j]! > 0) {
    const v = score[i * w + j]!
    if (stretch[i - 1] === got[j - 1] && v === score[(i - 1) * w + j - 1]! + MATCH) {
      pairs.push([i - 1, j - 1])
      i--
      j--
    } else if (v === score[(i - 1) * w + j]! - GAP) i--
    else j--
  }
  pairs.reverse()
  // The matched pairs in runs of consecutive tokens on both sides.
  const runs: [number, number][] = []
  for (let k = 0; k < pairs.length; k++) {
    const adjacent = k > 0 && pairs[k]![0] === pairs[k - 1]![0] + 1 && pairs[k]![1] === pairs[k - 1]![1] + 1
    if (adjacent) runs[runs.length - 1]![1] = k
    else runs.push([k, k])
  }
  // Places lie between runs of at least MIN_TIE matched tokens; a shorter
  // run between two of them is part of the place, not a tie. „Für
  // Klimaschutz, Umwelt, Energie, Mobilität, Innovation und Technologie"
  // against „für Innovation, Mobilität und Infrastruktur" is one place, not
  // three around a lone „Mobilität". What lies outside the first and the
  // last tie has nothing on that side to hold it, and is left to the
  // oracle as it stands: „Teil … und … Inkrafttreten" of a group heading
  // met „Der 9. Teil und die Anlage" in the text a word at a time.
  const ties = runs.filter(([a, b]) => b - a + 1 >= MIN_TIE)
  const divergences: Divergence[] = []
  for (let k = 1; k < ties.length; k++) {
    const [ai, gi] = pairs[ties[k - 1]![1]]!
    const [an, gn] = pairs[ties[k]![0]]!
    if (an === ai + 1 && gn === gi + 1) continue
    divergences.push({ as: ai + 1, ae: an, gs: gi + 1, ge: gn })
  }
  return { divergences }
}

/** A payload's tokens and where they stand in the result. */
interface PayloadRun {
  instruction: number
  tokens: string[]
  at: number[]
}

/** The texts an instruction supplies as new — what the engine writes into the §. */
function newTexts(ins: WitnessInstruction): string[] {
  const { op } = ins
  if (op.kind === 'replacePhrase') return [op.to]
  if (op.kind === 'insertPhrase') return [op.text]
  if (op.kind === 'replace' || op.kind === 'replaceHeading' || op.kind === 'append' || op.kind === 'insertAfter') return [...ins.payload]
  return []
}

/**
 * How many times the instructions wrote `tokens` into the § at most: a
 * replacement as often as its old wording went, an insertion once per
 * anchor that stands, a unit's new text once for each payload that carries
 * it. Read off the standing text and the result, so a count that does not
 * hold is a result the instruction does not explain.
 */
function written(ins: WitnessInstruction, tokens: readonly string[], all: readonly { tokens: string[] }[], before: readonly string[], got: readonly string[]): number {
  const { op } = ins
  if (op.kind === 'replacePhrase') {
    const from = tokensOf(op.from)
    // Each replacement takes the payload's own occurrences in the old
    // wording with it: „Verkehrssicherheit, der Lufttüchtigkeit oder der
    // Betriebstüchtigkeit" by „Lufttüchtigkeit" adds none (119/ME, LFG § 21).
    if (from.length === 0) return 0
    return (runsOf(before, from).length - runsOf(got, from).length) * (1 - runsOf(from, tokens).length)
  }
  if (op.kind === 'insertPhrase') {
    const anchor = tokensOf(op.anchor)
    return anchor.length === 0 ? 0 : runsOf(before, anchor).length
  }
  const same = all.filter((p) => p.tokens.length === tokens.length && p.tokens.every((t, i) => t === tokens[i])).length
  return same
}

/** Tokens of the result on each side of a phrase payload that the standing text has to carry around the old wording. */
const NEIGHBOURS = 3

/**
 * Whether a phrase instruction can have written its payload at `o` of the
 * result: the standing text holds, between the same neighbouring tokens,
 * the wording the replacement takes out — or nothing, for an insertion.
 * Measured on the table path: a word fault turned „gemäß Abs. 1 und 2"
 * into „gemäß Abs. 2 und 2", and „Abs. 2" is what another line of the §
 * writes into another Absatz (ApoBetrO § 60a); the counts held, since a
 * deleted Absatz had taken an „Abs. 2" with it. A unit's new text is
 * counted (`written`), not placed: it is the unit.
 */
function wroteHere(ins: WitnessInstruction, o: number, length: number, before: readonly string[], got: readonly string[]): boolean {
  const { op } = ins
  if (op.kind !== 'replacePhrase' && op.kind !== 'insertPhrase') return true
  const old = op.kind === 'replacePhrase' ? tokensOf(op.from) : []
  const lead = got.slice(Math.max(0, o - NEIGHBOURS), o)
  const tail = got.slice(o + length, o + length + NEIGHBOURS)
  return runsOf(before, [...lead, ...old, ...tail]).length > 0
}

/** The texts an instruction names that are not new: the wording it replaces or anchors on. */
function namedTexts(ins: WitnessInstruction): string[] {
  const { op } = ins
  if (op.kind === 'replacePhrase') return [op.from, ...(op.beside ? [op.beside.text] : [])]
  if (op.kind === 'insertPhrase') return [op.anchor]
  if (op.kind === 'deletePhrase') return [op.text]
  return []
}

/** Character spans of `tokens` in `base`, read in order; null for a token not found near where it should be. */
function spansIn(base: string, tokens: readonly string[]): ([number, number] | null)[] {
  const out: ([number, number] | null)[] = []
  let cursor = 0
  for (const t of tokens) {
    const at = base.indexOf(t, cursor)
    if (at < 0 || at - cursor > 120) {
      out.push(null)
      continue
    }
    out.push([at, at + t.length])
    cursor = at + t.length
  }
  return out
}

/** Tokens the page shows on either side of a place, so a comma has words around it. */
const SHOWN_AROUND = 3

/** The characters of tokens [from, to) with `SHOWN_AROUND` tokens on each side, as the text prints them. */
function snippet(base: string, spans: readonly ([number, number] | null)[], tokens: readonly string[], from: number, to: number): string {
  const a = Math.max(0, from - SHOWN_AROUND)
  const b = Math.min(tokens.length, to + SHOWN_AROUND) - 1
  const start = spans[a]
  const end = spans[b]
  return start && end && start[0] <= end[1] ? base.slice(start[0], end[1]) : tokens.slice(a, b + 1).join(' ')
}

/** Whether `key` stands in the rendition between `from` and `to`. */
function standsBetween(rendition: DraftRendition, key: string, from: number, to: number): boolean {
  if (key === '') return false
  const at = rendition.key.indexOf(key, from)
  return at >= 0 && at + key.length <= to
}

/**
 * Where the instruction stands in the rendition: every place its line's first
 * tokens do, each with room for the line and its payload.
 */
function regionsOf(rendition: DraftRendition, ins: WitnessInstruction, length: number): [number, number][] {
  const head = keyOfTokens(tokensOf(ins.line).slice(0, 10))
  if (head.length < 8) return []
  const out: [number, number][] = []
  for (let at = rendition.key.indexOf(head); at >= 0; at = rendition.key.indexOf(head, at + 1)) out.push([at, at + length + 400])
  return out
}

/**
 * Whether the draft's second rendition settles every place where our result
 * and the annex part, and the oracle confirms the § once those places read
 * as the draft has them. See the header for the conditions.
 */
export function witnessVerdict(
  id: string,
  before: string | null,
  got: string,
  rows: readonly ComparisonRow[],
  touching: readonly WitnessInstruction[],
  rendition: DraftRendition | null,
  resultAbsaetze?: readonly string[],
  standingAbsaetze?: readonly string[] | null,
  standingUnits: StandingUnits | null = null,
): WitnessOutcome {
  if (!rendition) return { released: false, reason: 'keine-fassung' }
  const gotTokens = tokensOf(got)
  const beforeTokens = before === null ? [] : tokensOf(before)
  const all = touching.flatMap((ins, instruction) => newTexts(ins).map((t) => tokensOf(t)).filter((t) => t.length > 0).map((tokens) => ({ instruction, tokens })))
  // A payload stands in the result only as often as the instructions wrote
  // it (`written`): a figure or a word that also stands where nothing put it
  // is no payload there. Measured: five word faults of the fault injection
  // („zuständige Behörde" turned into „zuständige Lufttüchtigkeit", the word
  // another line of the § writes) were shown on the witness until then.
  const payloads: PayloadRun[] = all
    .filter((p) => runsOf(gotTokens, p.tokens).length - runsOf(beforeTokens, p.tokens).length <= written(touching[p.instruction]!, p.tokens, all, beforeTokens, gotTokens))
    .map((p) => ({ ...p, at: runsOf(gotTokens, p.tokens).filter((o) => wroteHere(touching[p.instruction]!, o, p.tokens.length, beforeTokens, gotTokens)) }))
  const sources = touching.map((ins) => tokensOf(`${ins.line} ${ins.payload.join(' ')}`))
  const regions = touching.map((ins, i) => regionsOf(rendition, ins, keyOfTokens(sources[i]!).length))
  const named = touching.map((ins) => namedTexts(ins).map((t) => tokensOf(t)).filter((t) => t.length > 0))
  const gotBase = normalizeText(got)
  const gotSpans = spansIn(gotBase, gotTokens)

  const places: WitnessPlace[] = []
  const patched: ComparisonRow[] = []
  for (const row of rows) {
    if (row.kind !== 'pair' || row.elided || row.change === 'unchanged' || !row.proposed) {
      patched.push(row)
      continue
    }
    const base = normalizeText(row.proposed)
    let text = base
    let shift = 0
    let from = 0
    for (const stretch of printedLayout(base)) {
      if (stretch === null) continue
      const offset = base.indexOf(stretch, from)
      if (offset < 0) return { released: false, reason: 'nicht-abbildbar' }
      from = offset + stretch.length
      const tokens = tokensOf(stretch)
      const aligned = align(tokens, gotTokens)
      if (aligned === 'zu-lang') return { released: false, reason: aligned }
      // A place whose two sides close up to one key is no place: the checks
      // compare the key (`containmentKey`), and „Eh renamt" is „Ehrenamt".
      const divergences = aligned.divergences.filter((d) => keyOfTokens(tokens.slice(d.as, d.ae)) !== keyOfTokens(gotTokens.slice(d.gs, d.ge)))
      if (divergences.length === 0) continue
      const spans = spansIn(stretch, tokens)
      let rebuilt = stretch
      let delta = 0
      for (const d of divergences) {
        const verdict = settle(d, tokens, gotTokens, payloads, sources, regions, named, rendition)
        if (verdict !== null) return { released: false, reason: verdict }
        // The stretch's characters for [as, ae), or the point behind the
        // token before it; our text from the result's characters.
        const left = spans[d.as - 1]
        const right = spans[d.ae]
        const oursFrom = d.ge > d.gs ? gotSpans[d.gs] : null
        const oursTo = d.ge > d.gs ? gotSpans[d.ge - 1] : null
        if (!left || !right || (d.ge > d.gs && (!oursFrom || !oursTo))) return { released: false, reason: 'nicht-abbildbar' }
        const cutFrom = left[1]
        const cutTo = right[0]
        const insert = d.ge > d.gs ? ` ${gotBase.slice(oursFrom![0], oursTo![1])} ` : ' '
        rebuilt = rebuilt.slice(0, cutFrom + delta) + insert + rebuilt.slice(cutTo + delta)
        delta += insert.length - (cutTo - cutFrom)
        places.push({ annex: snippet(stretch, spans, tokens, d.as, d.ae), draft: snippet(gotBase, gotSpans, gotTokens, d.gs, d.ge) })
      }
      // The rebuilt stretch has to read exactly as the stretch with our
      // tokens in the places — a span read wrongly must not carry the
      // annex's words in or out unseen.
      const expected: string[] = []
      let k = 0
      for (const d of divergences) {
        expected.push(...tokens.slice(k, d.as), ...gotTokens.slice(d.gs, d.ge))
        k = d.ae
      }
      expected.push(...tokens.slice(k))
      const reread = tokensOf(rebuilt)
      if (reread.length !== expected.length || reread.some((t, i) => t !== expected[i])) return { released: false, reason: 'nicht-abbildbar' }
      text = text.slice(0, offset + shift) + rebuilt + text.slice(offset + shift + stretch.length)
      shift += rebuilt.length - stretch.length
    }
    patched.push(text === base ? row : { ...row, proposed: text })
  }
  if (places.length === 0) return { released: false, reason: 'keine-stelle' }
  const report = oracleVerdict(id, before, got, patched, resultAbsaetze, standingAbsaetze, standingUnits)
  return report.verdict === 'bestätigt' ? { released: true, places } : { released: false, reason: 'pruefung' }
}

/** Conditions 1 to 4 for one place; null where they hold, else the first that fails. */
function settle(
  d: Divergence,
  annexTokens: readonly string[],
  gotTokens: readonly string[],
  payloads: readonly PayloadRun[],
  sources: readonly string[][],
  regions: readonly [number, number][][],
  named: readonly string[][][],
  rendition: DraftRendition,
): WitnessRefusal | null {
  if (d.ae - d.as > MAX_SIDE || d.ge - d.gs > MAX_SIDE) return 'zu-weit'
  const annex = annexTokens.slice(d.as, d.ae)
  const ours = gotTokens.slice(d.gs, d.ge)
  // 1. Inside a payload the engine wrote — strictly inside where one side is empty.
  const strict = annex.length === 0 || ours.length === 0
  const holders = payloads.flatMap((p) => p.at.filter((o) => {
    const end = o + p.tokens.length
    if (ours.length === 0) return o <= d.gs - 1 && d.gs <= end - 1
    return strict ? o < d.gs && d.ge < end : o <= d.gs && d.ge <= end
  }).map((o) => ({ p, o })))
  if (holders.length === 0) return 'nicht-neuer-text'
  // 2. The annex's words are none the instructions name elsewhere.
  if (annex.length > 0) {
    for (const { p } of holders) {
      const elsewhere = [
        ...named.flatMap((list) => list),
        ...payloads.filter((q) => q.instruction !== p.instruction).map((q) => q.tokens),
      ]
      if (elsewhere.some((t) => runsOf(t, annex).length > 0)) return 'ort-offen'
    }
  }
  // 3. and 4., for the instruction whose payload holds the place.
  let found = false
  let tied = false
  for (const { p, o } of holders) {
    const source = sources[p.instruction]!
    const own = regions[p.instruction]!
    for (const u of runsOf(source, p.tokens)) {
      const us = u + (d.gs - o)
      const ue = u + (d.ge - o)
      const lead = source.slice(Math.max(0, us - CONTEXT), us)
      const tail = source.slice(ue, ue + CONTEXT)
      // Too near the end of what our reader read to tie it: a payload cut
      // short at a line's end ends inside the PDF's longer text, and the
      // window, with nothing after it, stands there all the same.
      if (lead.length < MIN_CONTEXT || tail.length < MIN_CONTEXT) continue
      tied = true
      const oursKey = keyOfTokens([...lead, ...source.slice(us, ue), ...tail])
      const annexKey = keyOfTokens([...lead, ...annex, ...tail])
      if (own.length === 0) return 'einheit-nicht-im-pdf'
      if (own.some(([a, b]) => standsBetween(rendition, annexKey, a, b))) return 'beilage-im-pdf'
      // And the whole new text that holds the place, as our reader read it:
      // a word lost elsewhere in it can be one that leaves our wording equal
      // to the annex's there, where no check looks (GSpG § 50, RStDG § 203,
      // SchUG § 18 in the fault injection).
      if (own.some(([a, b]) => standsBetween(rendition, oursKey, a, b)) && own.some(([a, b]) => standsBetween(rendition, keyOfTokens(p.tokens), a, b))) found = true
    }
  }
  if (!found) {
    const inSource = holders.some(({ p }) => runsOf(sources[p.instruction]!, p.tokens).length > 0)
    return !inSource ? 'nicht-im-entwurfstext' : tied ? 'nicht-im-pdf' : 'rand'
  }
  return null
}
