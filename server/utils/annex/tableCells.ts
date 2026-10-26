/**
 * What one cell of a Textgegenüberstellung says: its words, its headings and
 * its Gliederungssymbol.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. Read by
 * `annex/tableElements.ts` and `annex/comparisonRows.ts`.
 */
import { normalizeText, stripMarkup } from '../lawtext/normalize'
import { decodeEntities } from '../parliament/htmlText'

/**
 * The mandated column headings, in the wordings the corpus actually prints.
 *
 * The Rundschreiben says "Geltende Fassung" and "Vorgeschlagene Fassung", and
 * 111 of the 114 GP-XXVIII PDF annexes print exactly that. The other three
 * qualify or rename it — "Geltende Fassung nach Inkrafttreten EuGB-VVG",
 * "Geltender Text"/"Vorgeschlagener Text" — and an exact-equality test read
 * those as ordinary law text (2026-09-10). The XML side is uniform: 129
 * header cells, all "Geltende Fassung".
 */
export const HEADER_CURRENT_RE = /^geltende[rn]?\s+(?:fassung|text)\b/i
export const HEADER_PROPOSED_RE = /^vorgeschlagene[rn]?\s+(?:fassung|text)\b/i

/** RIS's image element, `<binary … alt="…"><src>/Dokumente/Begut/…/….img1is.png</src></binary>`. */
const BINARY_RE = /<binary\b([^>]*?)(?:\/>|>[\s\S]*?<\/binary\s*>)/g

/**
 * What a cell says where the ressort set an image: „[Abbildung]", with RIS's
 * `alt` text where it carries one — „[Abbildung: Kamerasymbol]".
 *
 * The `<src>` of a `<binary>` is a text node, so the image's path came out as
 * the cell's words: 62/ME XXVIII showed the Zusatztafel of StVO § 54 as the
 * inserted text „/Dokumente/Begut/BEGUT_E6AA7181_…/1db4591e-….img1is.png",
 * and the Bäderhygieneverordnung's formulae as a changed row (`img1is` →
 * `img2is` is RIS numbering its files, not the draft changing a formula),
 * whose path words withheld §§ 20 and 73 against a standing text that never
 * prints one (25.10.2026). The Erläuterungen reader has dropped these blocks
 * since it met them (`IMAGE_PATH_RE` in `explanations/risExplanations.ts`).
 *
 * Named rather than dropped, because a cell that holds nothing but an image
 * still says the draft puts something there; and no check counts the name
 * (`IMAGE_MARK_RE` in `annex/annexText.ts`), because nothing on either side
 * shows what the image is.
 */
function imageText(_all: string, attributes: string): string {
  const alt = /\balt="([^"]*)"/.exec(attributes)?.[1]?.trim()
  return ` [Abbildung${alt ? `: ${alt}` : ''}] `
}

/**
 * A cell's own words.
 *
 * The block/inline distinction lives in `stripMarkup` (`lawtext/normalize.ts`),
 * shared with the
 * two texts this one is scored against, and it is what keeps a marked word in
 * one piece: the ressorts mark the changed *characters* in yellow, so
 * `Schlepplifte<i><span style="background:yellow">n</span></i>,` used to come
 * out as "Schlepplifte n," — two tokens the standing § does not have, and the
 * § was withheld for our own reading of it. The same rule inside a `<gldsym>`
 * is what made "§ 322" read as "§ 32" (2026-09-10); the designation needs no
 * reading of its own since 2026-09-11.
 *
 * What stays a space here on top of the block tags: `<br/>` (a line break the
 * ressort typesets between a heading and its title), `<nbsp/>`, and the
 * closing tag of a marker — RIS prints "<symbol>1.</symbol>Altersprädikat"
 * with nothing between, so the number would fuse into the first word.
 *
 * An image is named, not spelt out (`imageText`).
 */
export function cellText(html: string): string {
  return normalizeText(
    decodeEntities(
      stripMarkup(
        html
          .replace(BINARY_RE, imageText)
          .replace(/<nbsp\s*\/>/g, ' ')
          .replace(/<amp\s*\/>/g, '&amp;')
          .replace(/<gdash\s*\/>/g, '-')
          .replace(/<br\s*\/?>/gi, ' ')
          // A designation and the text behind it are separate words even
          // where the markup leaves no whitespace between them.
          .replace(/<\/(?:gldsym|symbol)>/g, '$& ')
          .replace(/(<span\s+class=["']?991GldSymbol["']?[^>]*>[\s\S]*?<\/span>)/gi, '$1 '),
      ),
    ),
  )
}

/**
 * Is this document a real table, or a scan? 40 % of the annexes are pages of
 * GIFs wrapped in XML, and telling them apart matters: an empty result must
 * read as "no comparison available", never as "nothing changed".
 */
export function isScanned(xml: string): boolean {
  return !/<tr\b/.test(xml) && /<binary\b/.test(xml)
}

/** The § heading a cell carries, when it holds one. */
const PARA_HEADING_RE = /<ueberschrift\b[^>]*\btyp="para"[^>]*>([\s\S]*?)<\/ueberschrift\s*>/

export function paraHeading(html: string): string | null {
  const m = PARA_HEADING_RE.exec(html)
  const text = m ? cellText(m[1]!) : ''
  return text || null
}

export function stripParaHeading(html: string): string {
  return html.replace(PARA_HEADING_RE, ' ')
}

/** A heading of any level, not only a §'s own. */
const HEADING_RE = /<ueberschrift\b[^>]*>[\s\S]*?<\/ueberschrift\s*>/g

/**
 * Is this column nothing but heading?
 *
 * Asked of RIS's own markup rather than of the shape of the line, the same
 * discriminator `isTableContent` uses and for the same reason: a short line
 * without a closing full stop is as often a Ziffer as a heading. It costs
 * nothing here — of the 297 one-sided heading rows in GP XXVIII, RIS types
 * every single one as `<ueberschrift>`, and none has to be recognised from
 * its wording (measured 2026-09-11).
 */
export function headingOnly(html: string): boolean {
  if (!/<ueberschrift\b/i.test(html)) return false
  return cellText(html.replace(HEADING_RE, ' ')) === ''
}

/** The same two spellings as `GLD_RE` in `annex/comparisonRows.ts`, which carries their story. */
const GLD_ALL_RE = /<gldsym\b[^>]*>([\s\S]*?)<\/gldsym>|<span\s+class=["']?991GldSymbol["']?[^>]*>([\s\S]*?)<\/span>/g

/**
 * Take the row's own designation out of the column's text — and only that one.
 *
 * A designation is data rather than prose and is already carried in `gld`, so
 * leaving it in the text as well printed it twice (below). But a row can carry
 * **two** designations, one per column, and then only one of them is the row's:
 * where a draft renumbers a provision the annex writes the standing "§ 7." on
 * the left and the proposed "§ 8." on the right, in one and the same row. The
 * row is filed under the left one — that is the § the RIS check holds the left
 * column against — and stripping every `<gldsym>` then deleted the second
 * number from the page altogether: neither a badge nor a word, so the reader
 * saw two provisions under one number with nothing to say so.
 *
 * 42 rows of GP XXVIII carry two designations that differ (2026-09-11), and
 * they are renumberings almost to the row: B-VG Art. 90a→94a, the
 * Konfitürenverordnung § 7→§ 8, the Strafregistergesetz § 2→§ 1a, the
 * Blutspenderverordnung shifting §§ 9 to 14 down by one. The second
 * designation now stays where the ressort printed it, inside its column's
 * text, and the word diff shows it as what it is — a change to the number.
 */
export function stripGld(html: string, own: string | null): string {
  return html.replace(GLD_ALL_RE, (all, ris: string | undefined, word: string | undefined) => {
    const inner = ris ?? word ?? ''
    return own !== null && cellText(inner) === own ? ' ' : all
  })
}
