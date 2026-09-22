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
  const { ops } = parseInstruction(line)
  if (ops.length === 0) return null
  const paras = new Set<string>()
  for (const op of ops) {
    if (op.kind === 'toc' || op.kind === 'container') continue
    if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') return null
    const address = opAddress(op)
    if (address.para) paras.add(address.para)
  }
  // Several paragraphs in one instruction have no single name.
  return paras.size === 1 ? [...paras][0]! : null
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
