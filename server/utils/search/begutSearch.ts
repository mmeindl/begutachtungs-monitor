/**
 * Where a keyword stands inside a draft document — the place of the hit for
 * the full-text search (docs/architecture.md §12.31).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * WHY THIS MODULE EXISTS AT ALL. RIS does the search itself: its `Suchworte`
 * searches the full text of every document of a record, a capability we do
 * not have to rebuild. What it does NOT return is the place of the hit — the
 * answer is the ordinary metadata record, without a location and without a
 * snippet. Measured 18.09.2026 over 79 hits from five keywords: for
 * „Fahrrad" the word stands in only 7 of 20 hits in the draft text and in 16
 * of 20 in the Erläuterungen. A hit list without the place therefore claims
 * something different from what the reader assumes for every third hit —
 * "the law is about this", where the ressort only touches on it in its
 * Begründung.
 *
 * The place of the hit is therefore not decoration; it is what separates a
 * hit from a guess. It is read here out of the same blocks the
 * Gegenüberstellung reads (`lawtext/risXml.parseRisXml`) — the same parser,
 * the same text form, hence the same answer as on the draft page — and since
 * 21.09.2026, where necessary, out of the PDF of the same document
 * (`blocksFromPlainText`), because the XML truncates where the PDF has
 * everything.
 *
 * WORD BOUNDARIES, because RIS has them. „Klimaschut" finds nothing, and
 * `Klimaschutz*` finds 491 records instead of 453 — RIS searches whole words
 * and knows the star as truncation. This search mirrors both, or it would
 * not find in the document what RIS found in that same document.
 *
 * `loose` is the fallback for that, and it is a PARAMETER, not a second pass
 * inside this function. The difference is not cosmetic: a record has several
 * documents, and they are read in a ranking
 * (`begutSearchService.DOCUMENT_ORDER`). If every document searched strictly
 * first and then as a substring, a draft text carrying „Klimaschutzgesetz"
 * would win against the Erläuterungen, where „Klimaschutz" really stands —
 * the place would be wrong, and wrong in favour of the strongest document.
 * The caller therefore walks all documents TWICE: strictly first, then
 * generously. Better a place that is too generous than the answer "the word
 * is in some document, we do not know where", which we could demonstrably
 * disprove — but never the wrong document.
 */
import type { TextBlock } from '../lawtext/lawUnits'
import { normalizeText } from '../lawtext/normalize'
import { stripMinistryMentions, type MinistryToken } from './searchHaystack'

/** One search term, as the reader typed it. */
export interface SearchTerm {
  /** Lowercased, without the star and without quotation marks. */
  text: string
  /** Typed with a star: „Klimaschutz*" also matches „Klimaschutzgesetz". */
  prefix: boolean
}

/**
 * More words help nobody and cost regexes: RIS joins them with AND, and from
 * the fourth on the result set is empty anyway.
 */
const MAX_TERMS = 6
/** Shorter than two characters is not a keyword but a typo. */
const MIN_TERM_LEN = 2
/** Characters left and right of the hit. Two lines on a phone. */
const SNIPPET_RADIUS = 90

/**
 * The input as search terms.
 *
 * Quotation marks are dropped instead of promising a phrase search: RIS has
 * none — `"Klimaschutz"` returns exactly the same 453 records as
 * `Klimaschutz` — and a tool that accepts quotation marks and ignores them
 * lies more quietly than one that refuses them.
 */
export function parseSearchQuery(raw: string): SearchTerm[] {
  const out: SearchTerm[] = []
  for (const word of normalizeText(raw).split(/\s+/)) {
    const bare = word.replace(/["'„“”‚‘’»«›‹]/g, '')
    const prefix = bare.endsWith('*')
    const text = (prefix ? bare.slice(0, -1) : bare).toLowerCase()
    if (text.length < MIN_TERM_LEN) continue
    if (out.some((t) => t.text === text)) continue
    out.push({ text, prefix })
    if (out.length === MAX_TERMS) break
  }
  return out
}

/** The search terms back as what goes to RIS. */
export function searchQueryString(terms: readonly SearchTerm[]): string {
  return terms.map((t) => (t.prefix ? `${t.text}*` : t.text)).join(' ')
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * One search term as a regex — whole word, unless the star says otherwise.
 *
 * The boundaries are lookarounds on letters and digits, not `\b`: `\b` does
 * not know umlauts as word characters, and „für" would match in the middle
 * of a word.
 */
function termRe(term: SearchTerm, loose: boolean): RegExp {
  const body = escapeRe(term.text)
  if (loose) return new RegExp(body, 'iu')
  const tail = term.prefix ? '[\\p{L}\\p{N}]*' : ''
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}${tail}(?![\\p{L}\\p{N}])`, 'iu')
}

/** Does the pattern match in this text, and where? Null if it does not. */
function findTerm(text: string, re: RegExp): { at: number; len: number } | null {
  const m = re.exec(text)
  return m ? { at: m.index, len: m[0].length } : null
}

/** The snippet around a hit, in three parts. */
interface SearchSnippet {
  /** What stands to its left, led by „…" where it was cut. */
  before: string
  /** The word found, in the document's own spelling. */
  match: string
  /** What stands to its right, trailed by „…" where it was cut. */
  after: string
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * The snippet around a hit, cut at word boundaries.
 *
 * Three parts instead of one marked-up string, so the page sets the mark
 * itself: a `<mark>` coming from the server would be HTML built from user
 * input, and the only safe version of that is the one that does not exist.
 *
 * `radius` is a test seam: no caller varies it.
 */
export function buildSnippet(text: string, at: number, len: number, radius = SNIPPET_RADIUS): SearchSnippet {
  const from = Math.max(0, at - radius)
  const to = Math.min(text.length, at + len + radius)
  let before = text.slice(from, at)
  let after = text.slice(at + len, to)
  // Cut at the word boundary, but only where something was cut at all —
  // otherwise the cut eats the first word of a paragraph.
  if (from > 0) {
    const cut = before.indexOf(' ')
    before = `…${cut >= 0 ? before.slice(cut) : before}`
  }
  if (to < text.length) {
    const cut = after.lastIndexOf(' ')
    after = `${cut >= 0 ? after.slice(0, cut) : after}…`
  }
  return { before, match: text.slice(at, at + len), after }
}

/** Where in a document the keyword stands. */
interface SearchLocation {
  /**
   * The designation of the place as the document words it: „§ 5." in the
   * draft text, „Zu § 5:" in the Erläuterungen. Null where the document
   * carries none up to that point.
   */
  designation: string | null
  snippet: SearchSnippet
}

/** Blocks that may not become the place of a hit. */
function skipBlock(b: TextBlock): boolean {
  // A table of contents repeats the document's own headings. A hit there is
  // always the duplicate of a hit further down — and the worse of the two,
  // because it shows no sentence.
  return b.kind === 'toc'
}

/** Does this block carry a designation fit to name the place of a hit? */
function designationOf(b: TextBlock): string | null {
  if (b.gld) return b.gld
  if (b.kind === 'para_head' || b.kind === 'section' || b.kind === 'article') return b.text || null
  return null
}

/**
 * The first place at which the document shows the search terms.
 *
 * Prefers a block carrying ALL the words — RIS joins them with AND, so the
 * paragraph in which they stand together is the one meant. Where there is
 * none, the first block with any of them counts: the words can be spread
 * across the document, and then a sentence with one of them is still the
 * answer to „kommt mein Thema vor?".
 */
export function locateInBlocks(
  blocks: readonly TextBlock[],
  terms: readonly SearchTerm[],
  loose = false,
): SearchLocation | null {
  if (!terms.length) return null
  // Once per search term, not once per search term and block: a document has
  // up to 413 blocks, and the patterns depend on `terms` and `loose` alone.
  // Without `g` they carry no `lastIndex`, so they are reusable.
  const patterns = terms.map((t) => termRe(t, loose))
  let designation: string | null = null
  let fallback: SearchLocation | null = null
  for (const b of blocks) {
    const own = designationOf(b)
    if (own) designation = own
    if (skipBlock(b) || !b.text) continue
    const found = patterns.map((re) => findTerm(b.text, re)).filter((h) => h !== null)
    if (!found.length) continue
    const first = found.reduce((a, h) => (h.at < a.at ? h : a))
    const here: SearchLocation = { designation, snippet: buildSnippet(b.text, first.at, first.len) }
    if (found.length === terms.length) return here
    fallback ??= here
  }
  return fallback
}

/* ------------------------------------------------------------------ *
 * Two text sources, one block format
 * ------------------------------------------------------------------ */

/** How long a block of PDF text may grow before the next one starts. */
const PDF_BLOCK_MAX = 400

/**
 * PDF text as blocks — the second source for the same place of a hit
 * (docs/architecture.md §12.31).
 *
 * WHY IT EXISTS: the XML of a Begleitschreiben is a stub. On the DGAV draft
 * it has 943 characters, the PDF of the same document 12.223 — and only
 * there stands the Verteiler that RIS matched on. The same lesson as with
 * the Beilagen: the text was never gone, what was read was the format that
 * threw it away.
 *
 * LINES ARE BUNDLED, because a PDF knows no paragraphs, only line breaks.
 * Single lines as blocks would have two faults: an AND search would never
 * find its words together in one block, and the snippet would break off
 * mid-sentence. The bundling goes by character count and not by semantics —
 * there is no grammar of typesetting here, and the snippet cuts ±90
 * characters around the hit anyway.
 *
 * `kind: 'other'`, `gld: null`: a PDF carries no Gliederungssymbole we could
 * assign with confidence. The row then says „im Begleitschreiben" without a
 * Paragraph — less than the XML gives, but nothing invented.
 *
 * `maxLen` is a test seam: no caller varies it.
 */
export function blocksFromPlainText(text: string, maxLen = PDF_BLOCK_MAX): TextBlock[] {
  const blocks: TextBlock[] = []
  let current = ''
  const flush = (): void => {
    const t = current.trim()
    if (t) blocks.push({ kind: 'other', cls: 'pdf', text: t, gld: null })
    current = ''
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      continue
    }
    if (current.length + trimmed.length > maxLen) flush()
    current = current ? `${current} ${trimmed}` : trimmed
  }
  flush()
  return blocks
}

/**
 * The same blocks without the Ressort mentions.
 *
 * THE VERTEILER IS NOT A HIT ON THE SUBJECT. Every Begleitschreiben lists
 * all ministries as recipients, every document carries its house's signature
 * line — „klima" therefore stands in documents that are about printing
 * devices. Measured 21.09.2026: of the 7 RIS hits for „klima", 3 are pure
 * Ressort mentions.
 *
 * The striking happens BEFORE the search, not after, so that the place points
 * at the SUBJECT where both exist: in the Klimagesetz the evidence shown was
 * the enumeration of ministries in § 5, although the document carries the
 * word 164 times.
 *
 * What does NOT fall here is a Ressort mention without the minister's form of
 * address — and that is deliberate: the UVP-G-Novelle replaces the phrase
 * „für Klimaschutz, Umwelt, Energie …" with the new one in dozens of §§.
 * There the name IS the subject matter (`searchHaystack.ts`).
 */
export function withoutMinistryMentions(
  blocks: readonly TextBlock[],
  tokens: readonly MinistryToken[],
): TextBlock[] {
  if (!tokens.length) return [...blocks]
  return blocks.map((b) => ({ ...b, text: stripMinistryMentions(b.text, tokens) }))
}
