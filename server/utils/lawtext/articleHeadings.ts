/**
 * The Artikel headings of a package, wherever a ressort typed them.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. Both block
 * readers (`lawtext/parliamentHtml.ts`, `lawtext/risXml.ts`) end in
 * `refineArticleHeadings`, so every consumer of their blocks — `segmentUnits`,
 * `draftArticles`, the annex engine, the search — sees one and the same
 * package structure. That is also what keeps the two copies of the name
 * window (`segmentUnits` and `draftArticles`, docs/architecture.md §12.13)
 * one rule: neither changes, both read the kinds set here.
 *
 * **Why a pass after the readers and not a class table.** The class mapping
 * sees one block; three of the shapes below are only decidable with the block
 * next to it — the name that follows an Artikel line, and whether an Artikel
 * line in a table-of-contents style is a heading or a row of the table.
 *
 * Measured over the 387 compared drafts of GP XXVII and XXVI (27.09.2026):
 * the comparison refused eight drafts outright because no Artikel of the
 * draft paired with one of the Vorlage, and in each the cause was a heading
 * this module now reads. The shapes, with their drafts:
 *  - the Artikel line in the template's Artikel class, `44UeberschrArt` or
 *    RIS `ueberschrift typ="art"`, with the law's name behind it as a §
 *    heading (169/ME, XXVI 129/ME; 7 drafts in all)
 *  - the Artikel line typed as a table-of-contents column (85/ME, RIS
 *    `inhaltsvz typ="spalte"`; 6 drafts in all)
 *  - the name typed as `11Titel` behind a recognised Artikel line, so that
 *    the first Hauptstück heading became the law's name (27/ME, 295/ME)
 *  - a draft without Artikel whose title is a `41UeberschrG1` or a RIS
 *    column instead of `11Titel` (124/ME, 151/ME, XXVI 9/ME; 6 in all)
 *  - „Artikel x1": the placeholder number in lower case (XXVI 115/ME), see
 *    `ARTICLE_RE`
 *  - „A r t i k e l 2": letter-spaced by hand (292/ME)
 */
import type { TextBlock } from './lawUnits'
import { normalizeText } from './normalize'

/**
 * "Artikel 3" — the article marker. Which heading level carries it is not
 * fixed: 125/ME puts it in 43UeberschrG2 and the package title in
 * 41UeberschrG1, its Regierungsvorlage the other way round. So the text
 * decides, not the class — otherwise the articles never pair and every § of
 * the package reads as inserted.
 *
 * The X is a placeholder: a draft written for a collective act numbers its
 * articles "Artikel X1", "Artikel X2" because the final count is only known
 * once every ministry's draft is merged (22/ME, IFG-Anpassung of the BKA). It
 * is typed in lower case as well — „Artikel x1" to „x3" in XXVI 115/ME, whose
 * three laws then read as one, and whose comparison was refused.
 */
export const ARTICLE_RE = /^Artikel\s+(?:[Xx]?\d+|[IVXL]+)(?=\s|$|[.,])/

/**
 * The Artikel line standing alone — „Artikel 2", „Artikel IV.". Stricter
 * than `ARTICLE_RE` on purpose: the classes it is applied to also carry
 * headings that merely begin with the word, and a quoted Artikel inside
 * amendment text begins with the quotation mark and so never matches.
 */
const ARTICLE_LINE_RE = /^Artikel\s+(?:[Xx]?\d+[a-z]?|[IVXL]+)\s*\.?$/

/**
 * The template's own class for an Artikel heading. Most of its blocks are
 * NOT package Artikel — 64 of the 78 in GP XXVII/XXVI are § and Abschnitt
 * headings quoted inside amendment text, which the readers keep as `other`
 * and which count in the compared text. Only the bare Artikel line is taken.
 */
const ARTICLE_CLASSES = new Set(['44UeberschrArt', 'ueberschrift/art'])

/**
 * Table-of-contents styles that also carry real Artikel headings (76/ME,
 * 225/ME, XXVI 165/ME, 85/ME) — and the rows of a table of contents that
 * lists the Artikel (36/RV, 281/ME, 295/ME). `tocArticleOwnsBody` tells them
 * apart.
 */
const TOC_HEADING_CLASSES = new Set(['30InhaltUeberschrift', '31InhaltSpalte', 'inhaltsvz/spalte'])

/** The classes a law's name is typed in, directly under its Artikel line. */
const NAME_CLASSES = new Set(['11Titel', 'ueberschrift/titel', '44UeberschrArt', 'ueberschrift/art', '45UeberschrPara', 'ueberschrift/para', '31InhaltSpalte', 'inhaltsvz/spalte'])

/**
 * The Promulgationsklausel, loosely: here it only has to be recognised as
 * „not a name, and body follows". `segmentUnits` keeps its own, stricter
 * form, because there it opens an unnumbered instruction. The inverted
 * „wird geändert wie folgt:" is 27/ME's second Artikel.
 */
const AMENDMENT_CLAUSE_RE = /\b(?:wird|werden)\s+(?:wie\s+folgt\s+)?geändert\s*:\s*$|\bwird\s+geändert\s+wie\s+folgt\s*:\s*$/

/** A law's title at the head of a text: „Bundesgesetz, mit dem …", „Verordnung …", with the „XX." number placeholder. */
const LAW_TITLE_RE = /^(?:XX\.\s*)?(?:Bundes(?:verfassungs)?gesetz|Verordnung)\b/

const LETTER_SPACED_RE = /^A r t i k e l(?=\s)/

const textOf = (b: TextBlock): string => normalizeText(b.text).trim()
const isArticleLine = (b: TextBlock): boolean => ARTICLE_LINE_RE.test(textOf(b))
const isAmendmentClause = (b: TextBlock | undefined): boolean => Boolean(b && AMENDMENT_CLAUSE_RE.test(textOf(b)))

/**
 * Could `n` be the name of the Artikel whose line stands directly above it?
 * Not a second Artikel line, not the Promulgationsklausel, not a § (it would
 * carry the § symbol), not quoted text — and a § heading only where no §
 * symbol follows, because a § heading heads the § behind it.
 */
function isNameSlot(n: TextBlock | undefined, after: TextBlock | undefined): boolean {
  if (!n || !NAME_CLASSES.has(n.cls) || n.gld) return false
  if (isArticleLine(n) || isAmendmentClause(n) || textOf(n).startsWith('"')) return false
  return !(n.kind === 'para_head' && after?.gld)
}

/**
 * An Artikel line in a table-of-contents style is a heading only where the
 * law's text follows it — its name at most in between. A row of a table of
 * contents is followed by the next row instead: another Artikel, an entry,
 * or (36/RV) the first Abschnitt heading of Artikel 1, which a looser test
 * would have handed to the table's last row.
 */
function tocArticleOwnsBody(blocks: readonly TextBlock[], at: number): boolean {
  const next = blocks[at + 1]
  const after = isNameSlot(next, blocks[at + 2]) ? blocks[at + 2] : next
  if (!after || isArticleLine(after)) return false
  return isAmendmentClause(after) || after.kind === 'novao' || after.kind === 'abs' || Boolean(after.gld) || /^Inhalts(?:verzeichnis|übersicht)$/i.test(textOf(after))
}

/**
 * How a block changes the quotation state — the same parity and depth
 * `segmentUnits` tracks. An Artikel quoted inside amendment text (a B-VG
 * instruction re-enacting „Artikel 5." to „Artikel 7.") begins with the mark
 * only on its first line.
 */
function quoteShift(text: string): { flips: number; depth: number } {
  let flips = 0
  let depth = 0
  for (const ch of text) {
    if (ch === '"') flips++
    else if (ch === '»') depth++
    else if (ch === '«') depth--
  }
  return { flips, depth }
}

/**
 * Blocks → the same blocks with the package's Artikel headings, their names
 * and a missing law title marked. Changes `kind` only — and, for a
 * letter-spaced line, the text to the word it spells — never order or count.
 */
export function refineArticleHeadings(input: readonly TextBlock[]): TextBlock[] {
  const blocks = input.map((b) => ({ ...b }))

  // 1. Artikel lines the class mapping could not see.
  let quoted = false
  let guillemets = 0
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!
    if (i > 0) {
      const { flips, depth } = quoteShift(blocks[i - 1]!.text)
      if (flips % 2 === 1) quoted = !quoted
      guillemets = Math.max(0, guillemets + depth)
    }
    const inPayload = quoted || guillemets > 0
    if (b.kind === 'article') {
      // As in `segmentUnits`: the Artikel starts the next law, so whatever
      // quotation was left open above it is closed.
      quoted = false
      guillemets = 0
      continue
    }
    if (b.kind === 'section' && LETTER_SPACED_RE.test(b.text)) {
      const text = b.text.replace(LETTER_SPACED_RE, 'Artikel')
      if (ARTICLE_RE.test(text)) {
        b.text = text
        b.kind = 'article'
      }
    } else if (!inPayload && ARTICLE_CLASSES.has(b.cls) && isArticleLine(b)) {
      b.kind = 'article'
    } else if (!inPayload && TOC_HEADING_CLASSES.has(b.cls) && isArticleLine(b) && tocArticleOwnsBody(blocks, i)) {
      b.kind = 'article'
    }
    if (b.kind === 'article') {
      quoted = false
      guillemets = 0
    }
  }

  // 2. The name directly under an Artikel line, as a `section` — the kind
  //    both name windows read. A name that already is one stays as it is.
  for (let i = 0; i < blocks.length - 1; i++) {
    if (blocks[i]!.kind !== 'article') continue
    const n = blocks[i + 1]!
    if (n.kind === 'section' || n.kind === 'article') continue
    if (isNameSlot(n, blocks[i + 2])) n.kind = 'section'
  }

  // 3. A draft without Artikel names itself before its first instruction;
  //    where no `title` block does, a heading shaped like a law title is it.
  const head: TextBlock[] = []
  for (const b of blocks) {
    if (b.kind === 'article' || b.kind === 'novao' || b.gld || isAmendmentClause(b)) break
    head.push(b)
  }
  if (!head.some((b) => b.kind === 'title')) {
    const title = head.find((b) => (b.kind === 'section' || b.cls === 'inhaltsvz/spalte') && LAW_TITLE_RE.test(textOf(b)))
    if (title) title.kind = 'title'
  }

  return blocks
}
