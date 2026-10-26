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

import type { Instruction, RefusedInstruction } from './lawApply'
import type { LawNode } from '../lawtext/konsTree'
import { articleQualifier, createdUnits, isTocInstruction, mentionedUnits, namedParagraphs, opAddress, refusedAddresses } from './novao'
import type { ConsolidatedWithheldCause } from '../../../shared/types'
import { articleNumberKey, isDivision, isSchedule, unitKey } from '../text/designation'

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
 * - `anhang-fremd` — it does, but its geltende Fassung is not the standing
 *   text in RIS, so what it proposes cannot be held against our result.
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
  // „fremd" — the annex's geltende Fassung is not in the RIS text that way.
  // Until 26.10.2026 it shared a cause with „stumm": to a reader there is no
  // second opinion either way. But the page now says the cause at the §
  // (`app/utils/lesefassung.ts`), and there the two are different
  // sentences — „the annex shows no change here" against „the annex starts
  // from another text than RIS", which the annex section's own notice at
  // the same § often says too.
  if (oracle === 'fremd') return { show: false, cause: 'anhang-fremd' }
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
 * Documents in the order the law prints them — the order RIS lists the law's
 * labels in (`printed`, the keys of `KonsLawAtDate.paragraphs`).
 *
 * The engine reads its stock as a law: „Die §§ 7 bis 9 werden durch folgende
 * §§ 7 bis 10 ersetzt" needs §§ 7, 8 and 9 side by side (`spliceRun`), and a
 * new § goes where its number puts it (`numberedSlot`). The page loaded the
 * §§ the annex covers first and kept them in the order the fetches finished,
 * so whether such a replacement applied depended on who answered first
 * (22.10.2026). RIS's order and not `byParagraphOrder`: over the 324 laws of
 * the draft corpus the §§ come in the same order either way, and the 24 laws
 * where the two differ also carry Artikel („Art. 1" beside „§ 1") — RIS knows
 * how those are printed, a number does not.
 */
export function inPrintedOrder<T extends { label: string }>(refs: readonly T[], printed: readonly string[]): T[] {
  const at = new Map(printed.map((label, i) => [label, i] as const))
  return [...refs].sort((a, b) => (at.get(a.label) ?? printed.length) - (at.get(b.label) ?? printed.length))
}

/**
 * The key an instruction's address touches its unit under — the page's
 * (`unitKey`), and none for a division above the § (`isDivision`), which
 * touches no § of its number.
 *
 * The bare number stood here until 22.10.2026, while the page held a schedule
 * as „Anl. 1": an instruction on the Anlage touched nothing, so every correct
 * change of a schedule read as unexplained and none could pass the guard —
 * and it touched § 1 instead, whose guard then counted the Anlage's operands
 * as its own.
 */
export function touchedKey(designation: string | null): string | null {
  return designation && !isDivision(designation) ? unitKey(designation) : null
}

/**
 * The units of a stock under the key the page holds them by (`unitKey`) — „5"
 * for § 5, „Anl. 1" for a schedule — and a law's only schedule also under the
 * bare „Anl." an instruction without a number addresses it by.
 *
 * Held under the unit key, not the bare number: a § 1 and an Anl. 1 fell
 * together, and „first occurrence wins" then gave one of them the other's
 * text. The page and the Prüfstand read the same map.
 */
export function unitsByKey(nodes: readonly LawNode[]): Map<string, LawNode> {
  const out = new Map<string, LawNode>()
  const marks = nodes.filter((n) => isSchedule(n.marker))
  for (const node of nodes) {
    const key = isSchedule(node.marker) ? (unitKey(node.marker) ?? node.id) : node.id
    if (!out.has(key)) out.set(key, node)
  }
  if (marks.length === 1 && !out.has('Anl.')) out.set('Anl.', marks[0]!)
  return out
}

/**
 * A refused instruction as `instructionsFromUnits` hands it over — or its bare
 * line, for a caller that has no container to give.
 */
export type RefusedLine = string | Pick<RefusedInstruction, 'line' | 'inherited'>

const lineOf = (refused: RefusedLine): string => (typeof refused === 'string' ? refused : refused.line)

/**
 * The units a refused line names: the grammar's reading of its address where
 * there is one (`refusedAddresses`), and where there is none every unit its
 * words name (`mentionedUnits`) and the § of the container it stands under.
 *
 * `refusedAddresses` is tuned for the annex, where no address beats a wrong
 * one, and returns null for every line it cannot read whole. Until
 * 22.10.2026 the gate then fell back on the line's first § — and a line is
 * refused precisely because it is hard to read, which is where it names
 * several: „In den §§ 184 Abs. 4 und 5, 360 Abs. 5 und 380 …" locked § 184
 * and left §§ 360 and 380 clean with the replacement missing (BVergG), the
 * Bäderhygieneverordnung's „Whirl Pools" line § 2 of seven. Over the draft
 * corpus 368 of 6.300 refused lines locked fewer §§ than they name.
 *
 * **And a refused sub-instruction locked no § at all.** „§ 4 wird wie folgt
 * geändert: … c) In Abs. 3 wird …" — the c) names none of its own, so § 4
 * stood clean with the change of its Abs. 3 missing; where the line quoted a
 * citation („der Verweis auf ‚§ 16 Abs. 4 bis 6'"), the first-§ fallback
 * locked that instead. 337 of the 359 refused sub-instructions of the corpus.
 * The line is now read with the address it would have inherited.
 *
 * **The reading before stays the floor** — the line's own address, or else
 * its first § anywhere, quotations included. Usually that § is a citation,
 * sometimes the target itself: „Der bisherige ‚§ 7' erhält die Bezeichnung
 * ‚§ 8'" quotes its §. A lock this reading could take away would be a § shown
 * that was withheld before.
 *
 * The same reading for the lock, the denominator and the labels, so a § the
 * line locks is also counted and looked up.
 *
 * A clause on the table of contents names no unit (`isTocInstruction`).
 */
export function refusedLineUnits(refused: RefusedLine): string[] {
  const line = lineOf(refused)
  const inherited = typeof refused === 'string' ? null : refused.inherited
  if (isTocInstruction(line)) return []
  const own = refusedAddresses(line)
  const read = (inherited ? refusedAddresses(line, inherited) : own) ?? [...mentionedUnits(line), ...(inherited?.para ? [inherited.para] : [])]
  const first = /§+\s*\d+[a-z]*/.exec(line)?.[0]
  return [...new Set([...read, ...(own ?? (first ? [first] : []))])]
}

/**
 * The units a run of `applyNovelle` must not show as clean: every one an
 * unresolved instruction names, and every one a refused line names
 * (`refusedLineUnits`) or would have brought into being (`createdUnits`).
 *
 * Two readings stood in three places (`konsService`, both Prüfstände), and
 * both stopped short. A refused line counted with its first § only, so the
 * KFG line „In § 24 Abs. 2 Z 2, § 24a Abs. 2 lit. b, § 40 …" refused § 24 and
 * left §§ 24a, 40, 87 and 123a clean with nothing applied to them (26.09.2026).
 * And both were keyed by the bare number, while the page keys a schedule as
 * „Anl. 1": a failed instruction on the Anlage marked § 1 refused and left the
 * Anlage clean. `key` is the form the caller looks units up in.
 *
 * **The new number of a refused renumbering is locked too, and the §§ a
 * refused insertion announces** (22.10.2026). „Der bisherige § 43 erhält die
 * Bezeichnung § 44" refused leaves the standing § 44 where the draft means the
 * old § 43, and the next instruction on „§ 44" lands on it — read as § 43
 * alone, the line left § 44 clean. `kons/lawApply.ts` does the same for an
 * instruction that was read and then failed (`newParagraphsOf`).
 *
 * Over-locking is the safe direction here, the opposite of the annex's trade:
 * a § locked too many is withheld, a § locked too few is shown without a
 * change the draft makes.
 */
export function refusedUnits(unresolved: Iterable<string>, refusedLines: readonly RefusedLine[], key: (designation: string) => string | null): Set<string> {
  const out = new Set<string>()
  for (const p of unresolved) {
    const id = key(p)
    if (id) out.add(id)
  }
  for (const refused of refusedLines) {
    // „Im Inhaltsverzeichnis entfällt der Eintrag zu § 17; die Einträge zu den
    // §§ 18 und 19 lauten": the table of contents, which no § text carries —
    // the grammar reads it as `toc` for the same reason. Named §§ are its
    // entries, not its targets (BFA-VG, BGBl. I Nr. 39/2026). The one
    // predicate the grammar, the annex and the § names ask too: a prefix test
    // here missed „Der Eintrag zu § 50 im Inhaltsverzeichnis lautet:" and
    // locked § 50 (01.10.2026).
    for (const p of [...refusedLineUnits(refused), ...createdUnits(lineOf(refused))]) {
      const id = key(p)
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
  refusedLines: readonly RefusedLine[],
): string[] {
  const out = new Set<string>()
  for (const { op, payload } of instructions) {
    const address = opAddress(op)
    // `unitKey` and not the bare number: a law may carry a § 1 and an
    // Anl. 1, and everything downstream holds the unit under this key. Every
    // § of „Die §§ 12a und 13 entfallen", not the first one only — the second
    // was neither counted nor fetched, and the instruction failed on it.
    for (const para of address ? namedParagraphs(address) : []) {
      // „Abschnitt 4" is no § of the denominator, and § 4 even less.
      if (isDivision(para)) continue
      const id = unitKey(para)
      if (id) out.add(id)
    }
    if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') {
      for (const p of payload) if (p.id) out.add(p.id)
    }
  }
  // Every unit the line names, read as the lock reads it (`refusedLineUnits`):
  // counted with its first § only, „In den §§ 184 …, 360 … und 380 …" put one
  // of three §§ into the denominator, and the page divided by too little.
  for (const refused of refusedLines) {
    for (const para of refusedLineUnits(refused)) {
      if (isDivision(para)) continue
      const id = unitKey(para)
      if (id) out.add(id)
    }
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
  refusedLines: readonly RefusedLine[],
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
      // Nothing to fetch for an Abschnitt: RIS files no document under it.
      if (isDivision(para)) continue
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
  //
  // Every unit the line names, as the denominator counts them; the Artikel a
  // line names in front of its § holds for the line (`parseAddressList` carries
  // it the same way).
  for (const refused of refusedLines) {
    // A sub-instruction's Artikel is its container's.
    const numeral = articleQualifier(lineOf(refused)) ?? (typeof refused === 'string' ? null : (refused.inherited?.artikel ?? null))
    for (const para of refusedLineUnits(refused)) {
      if (isDivision(para)) continue
      const id = unitKey(para)
      if (!id || out.has(id)) continue
      out.set(id, isSchedule(id) ? id : numeral ? `Art. ${articleNumberKey(numeral) ?? numeral} § ${id}` : `§ ${id}`)
    }
  }
  return out
}
