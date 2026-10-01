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
import { addressOf, ARTICLE_HEADING_RE, isAddressHeading, splitHeading, ziffernOf } from './risExplanations'
import { articleNumberKey, leadingArticleKey } from '../text/designation'
import { normalizeText } from '../lawtext/normalize'
import { parseParliamentHtml } from '../lawtext/parliamentHtml'
// One reading of a designation for both sides of the lookup. Its `\b` changes
// nothing for what `addressOf` builds: 0 of 4.215 designations differ over the
// offline corpus (22.09.2026).
import { articleParagraphKey, explanationParaId } from '../../../shared/utils/explanationKey'

/** One passage of the Besonderer Teil, at its address. */
export interface HtmlPassage {
  /**
   * The heading, as the ressort printed it — up to the end of its address
   * where the ressort wrote the reasoning on the heading line too („Zu Z 5
   * (Aggregierung): Durch die Wortfolge …"): that prose is the first
   * paragraph of `text` (`splitHeading`, 02.10.2026). The fields below are
   * read from the whole line all the same, so `ziffernOf(heading)` is not
   * `ziffern` for such a passage: a heading that runs on names no Ziffer.
   */
  heading: string
  /** „§ 54c" — the Paragraphen the heading's address names, not those its prose cites. */
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
  /**
   * The Artikel the Artikel heading in force above the passage names — „Zu
   * Artikel 25 (Änderung des Bundes-Sportförderungsgesetzes 2017):", a bare
   * „Artikel 25" line, „Zu Artikel 23 (…) und Artikel 24 (…):" names two —
   * or null where none stands or it names a range („Zu Artikel 88 bis 102
   * (…)", the summary over a bundle). Unlike `article`, a passage's own
   * „Zu Art. 3 Z 48 (§ 40 BSFG 2017 …):" does not change it: a Sammelvorlage
   * may keep the numbering of the draft it took a law from inside its own
   * Artikel heading (129 d.B. XXVIII, docs/architecture.md §12.10b,
   * 01.10.2026), and then the two disagree.
   */
  section: string[] | null
  /**
   * The law the Artikel heading in force names, in its words — „Änderung des
   * Zivildienstgesetzes 1986" from „Zu Artikel 13 (Änderung des
   * Zivildienstgesetzes 1986):" —, or null where none stands or it names
   * several. Read also where the number is none at all: 22/ME XXVIII heads
   * its three laws „Zu Art. X1 (…)", „Zu Art. X2 (…)", „Zu Art. X3 (…)",
   * and the law is all that tells them apart.
   */
  law: string | null
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
 * The Artikel an Artikel heading names — „Zu Artikel 25 (…):" one, „Zu Art. 5,
 * 8 und 9 (…)" and „Zu Artikel 23 (…) und Artikel 24 (…):" several — read
 * outside the brackets, where the law's title stands. Null for a range („Zu
 * Artikel 88 bis 102 (…)"): a summary over a bundle, not one law's heading.
 */
function sectionOf(heading: string): string[] | null {
  let flat = heading
  for (let i = 0; i < 2; i++) flat = flat.replace(/\([^()]*\)/g, ' ')
  flat = flat.split(':')[0] ?? flat
  if (/\bbis\b|[–-]\s*\d/i.test(flat)) return null
  const out = new Set<string>()
  for (const m of flat.matchAll(/(?:(?<![a-zäöü])art(?:ikel)?\.?\s*|(?:,|\bund\b|\bsowie\b)\s*)([0-9]+|[ivxlc]+)(?![0-9a-z])/gi)) {
    const key = articleNumberKey(m[1]!)
    if (key) out.add(key)
  }
  return out.size ? [...out] : null
}

/**
 * An „Art. N" with what follows its number — the second group decides whether
 * it is this package's Artikel or another act's (`isCitation`).
 */
const ARTICLE_AND_NEXT_RE = /(?<![a-zäöü])art(?:ikel)?\.?\s*([0-9]+|[ivxlcdm]+)(?![0-9a-z])\s*(\S*)/gi

/**
 * What stands after the number when the Artikel is a provision of another act
 * — „Zu Art. 7 Abs. 4 der RL Prozesskostenhilfe …" (Vorlage to 162/ME XXVI),
 * „Art. 13 der Verordnung (EU) Nr. 1151/2012 sieht vor …", „Art. 22 EMFG
 * verpflichtet …", „Zu Art. 79 Abs. 2 Z 2:" of a B-VG amendment: an Absatz,
 * a „der"/„des", or the act's abbreviation (two capitals, „RL", „B-VG").
 * A package's own Artikel is followed by its law in brackets, a Ziffer, a §,
 * a colon or nothing (docs/architecture.md §12.10b, 02.10.2026).
 */
const CITATION_WORD_RE = /^(?:abs|absatz|uabs|unterabs|lit|satz|buchst|der|des)\b/i
const ACT_ABBREVIATION_RE = /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]*[A-ZÄÖÜ]/

function isCitation(next: string): boolean {
  return CITATION_WORD_RE.test(next) || ACT_ABBREVIATION_RE.test(next)
}

/** Whether a heading's leading „Art. N" cites another act rather than naming this package's Artikel. */
function isCitedArticle(heading: string): boolean {
  const m = /^(?:zu\s+)?art(?:ikel)?\.?\s*(?:[0-9]+[a-z]?|[ivxlcdm]+)(?![0-9a-z])\s*(\S*)/i.exec(heading)
  return m !== null && isCitation(m[1]!)
}

/**
 * The package's Artikel a heading names — „Zu Art. 1 Z 5 sowie zu Art. 13 Z 1"
 * names two —, read where the address stands: outside the brackets, which
 * carry the provision the Ziffer amends („Zu Z 9 (Art. 97 Abs. 2) und Z 11
 * (Art. 98):" amends two Artikel of the B-VG), before the colon, after which
 * runs prose („Zu Abs. 2: … gemäß Art. 119 und Art. 120 der Verordnung (EU)
 * 2017/1485 …"), and without a cited Artikel (`isCitation`). Each of those
 * read as a package Artikel made the heading one „for several laws" and
 * cleared the mark for every passage after it.
 */
function ownArticleKeys(heading: string): string[] {
  let flat = heading
  for (let i = 0; i < 2; i++) flat = flat.replace(/\([^()]*\)/g, ' ')
  flat = flat.split(':')[0] ?? flat
  const out = new Set<string>()
  for (const m of flat.matchAll(ARTICLE_AND_NEXT_RE)) {
    if (isCitation(m[2]!)) continue
    const key = articleNumberKey(m[1]!)
    if (key) out.add(key)
  }
  return [...out]
}

/** „Zu Art. X1 (Änderung des …):" — an Artikel heading whatever its number, with the law in brackets. */
const LAW_HEADING_RE = /^(?:zu\s+)?art(?:ikel)?\b\.?\s*[^\s(]+\s*\(/i

/**
 * The law in an Artikel heading's brackets, nested brackets kept („… für
 * Sektenfragen (Bundesstelle für Sektenfragen)") — null where the heading
 * names several Artikel, since then the brackets name several laws.
 */
function lawOf(heading: string): string | null {
  if (!LAW_HEADING_RE.test(heading)) return null
  let outside = heading
  for (let i = 0; i < 2; i++) outside = outside.replace(/\([^()]*\)/g, ' ')
  if (/,|\b(?:und|sowie|bis)\b/i.test(outside.split(':')[0] ?? outside)) return null
  const open = heading.indexOf('(')
  let depth = 0
  for (let i = open; i < heading.length; i++) {
    if (heading[i] === '(') depth++
    else if (heading[i] === ')' && --depth === 0) return heading.slice(open + 1, i).trim() || null
  }
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
  /** The Artikel the last Artikel heading named — see `HtmlPassage.section`. */
  let section: string[] | null = null
  /** The law it named — see `HtmlPassage.law`. */
  let law: string | null = null

  for (const block of parseParliamentHtml(html)) {
    const text = normalizeText(block.text).trim()
    if (!text) continue

    const part = partKind(text)
    if (part) {
      inSpecial = part === 'special'
      current = null
      mark = null
      section = null
      law = null
      continue
    }

    if (isAddressHeading(text)) {
      // „Zu Z 5 (Aggregierung): Durch die Wortfolge …" — the reasoning on
      // the heading line is the passage's first paragraph, and a § it cites
      // is no § the passage is about (`splitHeading`). Everything else is
      // read from the whole line, as before: the Ziffern above all, since a
      // heading that runs on into prose names no instruction (`ziffernOf`).
      const { address, prose } = splitHeading(text)
      const paragraphs = addressOf(address).paragraphs
      // „Zu Art. 7 Abs. 4 der RL …" names no Artikel of this package: the
      // passage stands under the mark above it and leaves that mark alone.
      const cited = isCitedArticle(text)
      let article: string | null
      if (ownArticleKeys(text).length > 1) {
        // One passage for several laws: it belongs to none, and the mark
        // above it no longer says which law follows.
        article = null
        mark = null
      } else {
        const own = cited ? null : leadingArticleKey(text)
        if (own) mark = own
        article = own ?? mark
      }
      const ziffern = ziffernOf(text).map((z) => ({ article: z.article ?? article, ziffer: z.ziffer }))
      // An Artikel heading of its own — no Ziffer, no § — opens a section,
      // with or without a number the parser can read („Zu Art. X1 (…)").
      // Asked of the whole line, as before the cut: what opens a section
      // stays what it was.
      if (!cited && ziffern.length === 0 && addressOf(text).paragraphs.length === 0 && (ARTICLE_HEADING_RE.test(text) || LAW_HEADING_RE.test(text))) {
        section = sectionOf(text)
        law = lawOf(text)
      }
      current = { heading: address, paragraphs, text: prose ? [prose] : [], article, ziffern, section, law }
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
    if (ARTICLE_HEADING_RE.test(text) && !isCitedArticle(text) && addressOf(text).paragraphs.length === 0 && /Ueberschr/i.test(block.cls)) {
      mark = leadingArticleKey(text)
      section = sectionOf(text)
      law = lawOf(text)
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
