/**
 * The Erläuterungen as **Parliament** publishes them — Word HTML instead of
 * typed RIS XML (docs/architecture.md §12.10).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * WHY A SECOND READER. `explanations/risExplanations.ts` reads the draft's
 * RIS XML, and for the draft that is the better source: typed, named parts,
 * no guessing. But the Erläuterungen of the **Regierungsvorlage** do not
 * exist there — RIS carries no parliamentary documents. Anyone asking whether
 * the ressort changed its Begründung between draft and bill needs both sides,
 * and the only source carrying both is Parliament.
 *
 * **So this parser reads BOTH sides, the draft included.** A comparison of
 * XML against Word HTML measures the two converters first and the content
 * only afterwards — the same lesson as with the Textgegenüberstellung
 * (§12.12, sixth measurement). Same source, same parser, and what is left is
 * the change.
 *
 * **A passage's address comes from `explanations/risExplanations.ts`**
 * (`addressOf`, `isAddressHeading`) and is not invented a second time here:
 * „Zu Z 4 (§ 54c Abs. 1a und 1b):" has to mean the same Paragraph on both
 * sides, or the Begründung hangs on the wrong §.
 */
import { addressOf, isAddressHeading } from './risExplanations'
import { normalizeText } from '../lawtext/normalize'
import { parseParliamentHtml } from '../lawtext/parliamentHtml'
// One reading of a designation for both sides of the lookup. Its `\b` changes
// nothing for what `addressOf` builds: 0 of 4.215 designations differ over the
// offline corpus (22.09.2026).
import { explanationParaId } from '../../../shared/utils/explanationKey'

/** One passage of the Besonderer Teil, at its address. */
export interface HtmlPassage {
  /** The heading, as the ressort printed it. */
  heading: string
  /** „§ 54c" — the Paragraphen the heading names. */
  paragraphs: string[]
  /** The passage's paragraphs, in printed order. */
  text: string[]
}

export interface HtmlExplanations {
  /** The Allgemeiner Teil, paragraph by paragraph. */
  general: string[]
  /** The passages of the Besonderer Teil. */
  special: HtmlPassage[]
}

/**
 * „B e s o n d e r e r  T e i l" — letter-spaced headings are the rule in
 * these documents, and between the letters stands typography, not text
 * (§12.29). So the comparison drops the spaces.
 */
function partKind(text: string): 'general' | 'special' | null {
  const flat = normalizeText(text).replace(/\s+/g, '').toLowerCase().replace(/[:.]+$/, '')
  if (/^besondererteil/.test(flat)) return 'special'
  if (/^allgemeinerteil/.test(flat)) return 'general'
  return null
}

/**
 * One Parliament Erläuterungen document, split into the Allgemeiner Teil and
 * the passages of the Besonderer Teil.
 *
 * Without a heading „Besonderer Teil" of its own, the special part begins at
 * the first address heading — one fifth of the documents do it that way
 * (`explanations/risExplanations.ts`, the same finding on the XML).
 */
export function parseExplanationsHtml(html: string): HtmlExplanations {
  const general: string[] = []
  const special: HtmlPassage[] = []
  let inSpecial = false
  let current: HtmlPassage | null = null

  for (const block of parseParliamentHtml(html)) {
    const text = normalizeText(block.text).trim()
    if (!text) continue

    const part = partKind(text)
    if (part) {
      inSpecial = part === 'special'
      current = null
      continue
    }

    if (isAddressHeading(text)) {
      current = { heading: text, paragraphs: addressOf(text).paragraphs, text: [] }
      special.push(current)
      inSpecial = true
      continue
    }

    if (inSpecial && current) current.text.push(text)
    else if (!inSpecial) general.push(text)
    // A paragraph of the special part standing under no address belongs to
    // no §, and is not added to the last one seen.
  }
  return { general, special }
}

/** The passages under „§ 54c" → its number, as `shared/utils/explanationKey.ts` builds it. */
export function passagesByParagraph(doc: HtmlExplanations): Map<string, HtmlPassage[]> {
  const out = new Map<string, HtmlPassage[]>()
  for (const passage of doc.special) {
    for (const para of passage.paragraphs) {
      const id = explanationParaId(para)
      if (!id) continue
      out.set(id, [...(out.get(id) ?? []), passage])
    }
  }
  return out
}
