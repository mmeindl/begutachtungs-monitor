/**
 * Which § a Novellierungsanordnung addresses — the one reading of it, so the
 * § names and the Begründungsvergleich mean the same paragraph.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 */
import { opAddress, parseInstruction, refusedAddresses, tocSequence } from '../kons/novao'
import type { LawDiffUnit } from '../../../shared/types'
import { isParagraphUnit } from '../../../shared/utils/unitName'

/**
 * „… wird folgender § 5a eingefügt", „… werden folgende §§ 5a bis 5c
 * angefügt", „… durch folgende Paragraphen ersetzt": the payload creates a §,
 * and the § before the marker is its anchor — the trap of the next function,
 * one reading further down.
 */
const CREATES_PARAGRAPH_RE = /\b(?:folgende[rnms]?|nachstehende[rnms]?|neue[rnms]?)\s+(?:§|Paragraph)/i

/**
 * The § whose heading names this instruction — or null when there is none.
 *
 * An instruction that creates a paragraph names its *anchor*: "Nach § 5 wird
 * folgender § 5a eingefügt" addresses § 5, but the change is § 5a. Titling it
 * "§ 5 …" would put a real heading from the standing law onto a paragraph it
 * does not describe — a wrong name, which is worse than none. Those changes
 * carry their own heading from the draft anyway (the quoted-heading path).
 *
 * An instruction that adds a sub-unit ("In § 5 wird folgender Abs. 3
 * eingefügt") does happen inside § 5, so its heading fits.
 */
export function addressedParagraph(line: string): string | null {
  const { paras, typed } = readParagraphs(line)
  // Several paragraphs in one instruction have no single name.
  if (paras.length > 0 || typed) return paras.length === 1 ? paras[0]! : null
  // **The grammar refused the verb, not the address (30.09.2026).** „In § 5
  // Abs. 1 entfällt die Wort- und Zeichenfolge …, nach der Wortfolge … wird
  // … eingefügt" is one of a dozen shapes `parseInstruction` cannot TYPE —
  // right for `kons/lawApply.ts`, which has to perform it, beside the point
  // for a name, which only asks where the change happens. The address is
  // read again, by the same function the annex side reads it with
  // (`refusedAddresses`, with its three measured refusals), and only where
  // no operation came out at all: a `toc` op or an insertion says on purpose
  // which § it does not address.
  //
  // Not in `instructionParagraphs`: the Artikel pairing is calibrated on the
  // typed reading (docs/architecture.md §12.11, 28.09.2026), and this is a
  // question of the name, not of which Artikel is which.
  //
  // Five forms stay unread, each met in the corpus as a wrong § (GP
  // XXVI–XXVIII, every new reading read): the table of contents in the
  // wordings `parseInstruction` did not know as one („Der den § 56
  // betreffende Eintrag des Inhaltsverzeichnisses lautet:"; since
  // 01.10.2026 the grammar's own `isTocInstruction`, which `refusedAddresses`
  // asks too, so the gate and the annex leave the same lines unread), a § the
  // instruction creates („… wird ersetzt durch § 16 (neu) samt
  // Überschrift"), a division that only stands next to a § („Vor § 40
  // werden folgende Abschnittsbezeichnung und Abschnittsüberschrift
  // eingefügt"), a § inside an Artikel of the law („In Art. I § 9a …" —
  // which § 9a the standing law means is not the name's question to guess),
  // and anything that is not a §, Artikel, Anlage or Anhang („Der bisherige
  // Abschnitt Va …").
  const head = (line.split(':')[0] ?? line).replace(/"[^"]*"/g, '""')
  if (CREATES_PARAGRAPH_RE.test(head) || REFUSED_HEAD_RE.test(head)) return null
  const refused = [...new Set(refusedAddresses(line) ?? [])]
  return refused.length === 1 && DESIGNATION_RE.test(refused[0]!) ? refused[0]! : null
}

/** See `addressedParagraph`: a § marked new, a division beside a §, a § inside an Artikel. The table of contents is `isTocInstruction`'s. */
const REFUSED_HEAD_RE =
  /§\s*\d+[a-z]*\s*\(neu\)|\b(?:vor|nach)\s+(?:dem\s+)?§|abschnitts(?:bezeichnung|überschrift)|\bbezeichnung\s+und\s+überschrift|hauptstück|\bArt(?:ikel|\.)\s*[IVXLC\d]+[a-z]?\s+§/i
/** The designations a name can be looked up under. */
const DESIGNATION_RE = /^(?:§|Art\.|Anlage|Anhang)\s/

/**
 * Every § this instruction edits — the set an Artikel's addresses are paired
 * by (`diff/lawDiff.ts`), where „§§ 6 und 7" has to count as both and not as
 * none. Empty for an instruction that creates a §, for the reason above.
 *
 * „Die §§ 6 und 7" is ONE address whose siblings are paragraphs, written as
 * bare numbers behind the first one's designator; below § level („§ 5 Abs. 2
 * und 3") the siblings are Absätze of the one §.
 */
export function instructionParagraphs(line: string): string[] {
  return readParagraphs(line).paras
}

/** The typed reading, and whether the grammar typed anything at all — `addressedParagraph` reads further only where it did not. */
function readParagraphs(line: string): { paras: string[]; typed: boolean } {
  const { ops } = parseInstruction(line)
  const paras = new Set<string>()
  for (const op of ops) {
    if (op.kind === 'toc' || op.kind === 'container') continue
    if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') return { paras: [], typed: true }
    const address = opAddress(op)
    if (!address.para) continue
    paras.add(address.para)
    if (address.level === 'para') for (const id of address.siblings) paras.add(address.para.replace(/\S+$/, id))
  }
  return { paras: [...paras], typed: ops.length > 0 }
}

/**
 * The same for one unit of the comparison: which Paragraph does this
 * Novellierungsanordnung amend?
 *
 * The unshortened instruction text is read, not `heading` — that is the
 * display line cut at about 100 characters, and the cut regularly drops the
 * closing bracket, so the parser discards the instruction instead of
 * understanding it. One place for every caller: the § names and the
 * Begründungsvergleich have to mean the same Paragraph.
 */
export function addressedParagraphOf(unit: LawDiffUnit): string | null {
  // A unit that IS a § carries law text, not an instruction, and its text
  // cites other §§ as law does („… ihren Pflichten gemäß § 47 nachkommen",
  // § 48 of 32/ME, XXVIII). Read as an instruction it came out as that
  // citation — measured 30.09.2026 over the ME→RV comparisons of GP
  // XXVI–XXVIII: 10 §-units addressed one foreign §, every one of them a
  // citation, and the Begründungsvergleich compared the cited §'s Begründung
  // under the citing one (GP XXVI: one draft's only compared § was such a
  // citation). Such a unit addresses nothing but itself, and its designation
  // says so already.
  if (isParagraphUnit(unit)) return null
  const line = instructionLineOf(unit)
  return line ? addressedParagraph(line) : null
}

/** The unshortened instruction a unit carries — see `addressedParagraphOf`. */
function instructionLineOf(unit: LawDiffUnit): string | null {
  return unit.toText ?? unit.fromText ?? unit.heading
}

/**
 * `addressedParagraphOf` for the units of one comparison, in their order.
 *
 * „17. Der Eintrag nach der § 29 betreffenden Zeile lautet:" goes on with the
 * table of contents of the unit before it; read alone it named § 29
 * (Hochschülerschafts-Verordnung, 02.10.2026). Only the sequence shows that
 * (`tocSequence` in `kons/novao.ts`, the engine's and the annex's reading), so
 * a caller that has the units in order asks here.
 */
export function addressedParagraphsOf(units: readonly LawDiffUnit[]): (string | null)[] {
  const toc = tocSequence(units.map((u) => ({ line: isParagraphUnit(u) ? null : instructionLineOf(u), law: u.article })))
  return units.map((u, i) => (toc[i] ? null : addressedParagraphOf(u)))
}
