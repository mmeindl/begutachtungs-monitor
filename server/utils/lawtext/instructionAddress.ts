/**
 * Which § a Novellierungsanordnung addresses — the one reading of it, so the
 * § names and the Begründungsvergleich mean the same paragraph.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 */
import { opAddress, parseInstruction } from '../kons/novao'
import type { LawDiffUnit } from '../../../shared/types'

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
  const paras = instructionParagraphs(line)
  // Several paragraphs in one instruction have no single name.
  return paras.length === 1 ? paras[0]! : null
}

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
  const { ops } = parseInstruction(line)
  const paras = new Set<string>()
  for (const op of ops) {
    if (op.kind === 'toc' || op.kind === 'container') continue
    if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') return []
    const address = opAddress(op)
    if (!address.para) continue
    paras.add(address.para)
    if (address.level === 'para') for (const id of address.siblings) paras.add(address.para.replace(/\S+$/, id))
  }
  return [...paras]
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
  const line = unit.toText ?? unit.fromText ?? unit.heading
  return line ? addressedParagraph(line) : null
}
