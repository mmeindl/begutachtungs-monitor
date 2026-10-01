/**
 * The Erläuterungen as **Parliament** publishes them — Word HTML instead of
 * typed RIS XML (docs/architecture.md §12.10b).
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
import { addressOf, ARTICLE_HEADING_RE, isAddressHeading, ziffernOf } from './risExplanations'
import { articleKeysNamed, leadingArticleKey } from '../text/designation'
import { normalizeText } from '../lawtext/normalize'
import { parseParliamentHtml } from '../lawtext/parliamentHtml'
// One reading of a designation for both sides of the lookup. Its `\b` changes
// nothing for what `addressOf` builds: 0 of 4.215 designations differ over the
// offline corpus (22.09.2026).
import { articleParagraphKey, explanationParaId } from '../../../shared/utils/explanationKey'

/** One passage of the Besonderer Teil, at its address. */
export interface HtmlPassage {
  /** The heading, as the ressort printed it. */
  heading: string
  /** „§ 54c" — the Paragraphen the heading names. */
  paragraphs: string[]
  /** The passage's paragraphs, in printed order. */
  text: string[]
  /**
   * The Artikel the passage stands under, as a key („2"), or null.
   *
   * The § a passage names is not unique in a Sammelgesetz: two Artikel each
   * amend a § 15, and the passage says only „§ 15" — 14,7 % of the comparable
   * §§ of GP XXVII (§12.10b). The Artikel comes from the passage's own
   * heading („Zu Art. 2 Z 1 (§ 5)") or from the Artikel heading above it,
   * which a ressort types either as a passage („Zu Art. 5 (Änderung des …)")
   * or as a bare „Artikel 5" line. Null where the heading names several
   * Artikel („Zu Art. 1 Z 5 … sowie zu Art. 13 Z 1"): one passage for two
   * laws belongs to neither.
   */
  article: string | null
  /**
   * The Ziffern the heading names — „Zu Z 1 bis 3 (§ 5):" names three —
   * each under its Artikel: the one the heading names before it, else
   * `article`. Empty for a passage titled by § alone („Zu § 9:"), which is
   * how a new law is explained; an amendment is explained by Ziffer
   * (docs/architecture.md §12.10b, 01.10.2026).
   */
  ziffern: { article: string | null; ziffer: string }[]
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
  /** The Artikel heading in force above the passages. */
  let mark: string | null = null

  for (const block of parseParliamentHtml(html)) {
    const text = normalizeText(block.text).trim()
    if (!text) continue

    const part = partKind(text)
    if (part) {
      inSpecial = part === 'special'
      current = null
      mark = null
      continue
    }

    if (isAddressHeading(text)) {
      const paragraphs = addressOf(text).paragraphs
      let article: string | null
      if (articleKeysNamed(text).length > 1) {
        // One passage for several laws: it belongs to none, and the mark
        // above it no longer says which law follows.
        article = null
        mark = null
      } else {
        const own = leadingArticleKey(text)
        if (own) mark = own
        article = own ?? mark
      }
      const ziffern = ziffernOf(text).map((z) => ({ article: z.article ?? article, ziffer: z.ziffer }))
      current = { heading: text, paragraphs, text: [], article, ziffern }
      special.push(current)
      inSpecial = true
      continue
    }

    // A bare „Artikel 5" divides the package — but only where the ressort
    // typed it as a heading. The same shape in prose or in a table cell is a
    // citation („Art. 15 der Richtlinie 2019/790", 143/ME): 184 such blocks
    // over GP XXVII, and each would have put the passages after it under the
    // wrong law. The RIS reader has the same guard implicitly, because it
    // takes marks from heading elements only.
    if (ARTICLE_HEADING_RE.test(text) && addressOf(text).paragraphs.length === 0 && /Ueberschr/i.test(block.cls)) {
      mark = leadingArticleKey(text)
    }

    if (inSpecial && current) current.text.push(text)
    else if (!inSpecial) general.push(text)
    // A paragraph of the special part standing under no address belongs to
    // no §, and is not added to the last one seen.
  }
  return { general, special }
}

/**
 * The passages under Artikel and §, keyed `<Artikel>|<§ key>` — the second
 * lookup for a § number that is ambiguous in its draft. A passage without an
 * Artikel is not in it.
 */
export function passagesByArticleParagraph(doc: HtmlExplanations): Map<string, HtmlPassage[]> {
  const out = new Map<string, HtmlPassage[]>()
  for (const passage of doc.special) {
    if (!passage.article) continue
    for (const para of passage.paragraphs) {
      const id = explanationParaId(para)
      if (!id) continue
      const key = articleParagraphKey(passage.article, id)
      out.set(key, [...(out.get(key) ?? []), passage])
    }
  }
  return out
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
