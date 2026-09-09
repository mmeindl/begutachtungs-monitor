/**
 * Which law a draft's Artikel amends, read from its Promulgationsklausel
 * (docs/architecture.md §12.11).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * A change reads as legistic noise until the § it touches has a name: "In
 * § 9 Abs. 1 …" means nothing, "§ 9 Sofortlotterien" means something. That
 * name is the § heading in RIS Bundesrecht — a lookup, not a summary
 * (§12.11). The lookup needs to know *which* law, and every amending Artikel
 * opens by saying so:
 *
 *   "Das Audiovisuelle Mediendienste-Gesetz – AMD-G, BGBl. I Nr. 84/2001,
 *    zuletzt geändert durch …, wird wie folgt geändert:"
 *
 * The **first** citation is the Stammnorm; the second is the most recent
 * amendment. RIS carries the same pair as `StammnormPublikationsorgan` and
 * `StammnormBgblnummer`, so the join is an equality check, not a title match.
 *
 * The Teil matters and is not decorative: `Kundmachungsorgannummer=84/2001`
 * returns the AMD-G (BGBl. I) *and* an Amtssitz law (BGBl. III). Verified
 * 2026-09-09.
 */
import type { TextBlock } from './lawText'
import { normalizeText } from './lawText'
import { parseInstruction } from './novao'

/** A Bundesgesetzblatt citation, split the way RIS stores it. */
export interface BgblCitation {
  /** "BGBl. Nr.", "BGBl. I Nr.", "BGBl. II Nr.", "BGBl. III Nr." */
  organ: string
  /** "620/1989" */
  nummer: string
}

const BGBL_RE = /BGBl\.\s*(I{1,3})?\s*Nr\.\s*(\d+\/\d{4})/

/** First BGBl citation in a text, or null. */
export function parseBgbl(text: string): BgblCitation | null {
  const m = BGBL_RE.exec(normalizeText(text))
  if (!m) return null
  return { organ: m[1] ? `BGBl. ${m[1]} Nr.` : 'BGBl. Nr.', nummer: m[2]! }
}

/**
 * The *Stammnorm* citation of a Promulgationsklausel: the BGBl that created
 * the law, printed directly after its name and before any amendment history.
 *
 * Reading the whole clause took the first BGBl anywhere in it, which is the
 * last amendment whenever the Stammnorm is not a BGBl at all — the UGB is
 * "dRGBl. S. 219/1897", so the lookup resolved to a different law entirely,
 * one that the cited amendment happened to create, and said nothing about it
 * (2026-09-09). A clause whose head names no BGBl has no usable Stammnorm;
 * returning null there is the whole point, because the alternative is a
 * confident wrong answer.
 */
export function stammnormOf(text: string): BgblCitation | null {
  const head = normalizeText(text).split(/\bzuletzt geändert\b|\bin der Fassung\b|\bgeändert durch\b/i)[0] ?? ''
  return parseBgbl(head)
}

export function sameBgbl(a: BgblCitation, b: BgblCitation): boolean {
  return a.organ === b.organ && a.nummer === b.nummer
}

/**
 * Words that appear in almost every Artikel title and so carry no evidence.
 * "Änderung des …" is the template, not the name.
 */
const TITLE_STOPWORDS = new Set([
  'änderung', 'änderungen', 'aufhebung', 'bundesgesetz', 'bundesgesetzes', 'gesetz', 'gesetzes',
  'über', 'sowie', 'mit', 'dem', 'des', 'der', 'die', 'das', 'den', 'und', 'von', 'zum', 'zur',
])

/**
 * A German title word reduced far enough that a genitive matches a nominative:
 * the draft writes "Änderung des Staatsanwaltschaftsgesetzes", the annex may
 * write "Staatsanwaltschaftsgesetz". Years survive intact and are the best
 * discriminator a title has ("Strafprozeßordnung 1975").
 */
function stem(word: string): string {
  return word.replace(/ß/g, 'ss').replace(/(?<=.{5})(?:es|en|s|n)$/, '')
}

function titleTokens(title: string): Set<string> {
  const words = normalizeText(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 3 && !TITLE_STOPWORDS.has(w))
  return new Set(words.map(stem))
}

/**
 * How much two law names have in common, 0 to 1 (Jaccard over content words).
 *
 * Used wherever two namings of the same law have to be recognised as one: the
 * annex's Artikel heading against the draft's, and an amending Artikel against
 * the Kurztitel RIS carries. Deliberately blunt — a law's name is a compound
 * noun and a year, so word overlap decides and word order does not.
 */
export function lawNameScore(a: string, b: string): number {
  const x = titleTokens(a)
  const y = titleTokens(b)
  if (x.size === 0 || y.size === 0) return 0
  let shared = 0
  for (const w of x) if (y.has(w)) shared++
  return shared / (x.size + y.size - shared)
}

/**
 * A Promulgationsklausel announces that an existing law is being amended.
 * A Stammgesetz has none — it creates law rather than changing it, so there
 * is nothing to look up and nothing to name.
 */
const AMENDS_RE = /\bwird wie folgt geändert|\bwerden wie folgt geändert|\bwird geändert\b/i

/** A qualifier printed where the law's name would be, and not a name. */
const QUALIFIER_RE = /^\((?:Verfassungs|Grundsatz)bestimmung(?:en)?\)$/i

/** The numeral of an Artikel heading: "3", "III", "X1". */
const ARTICLE_NUMERAL_RE = /^Artikel\s+(X?\d+[a-z]?|[IVXL]+)\b/

/**
 * One Artikel of a draft — the unit a package's annex divides into.
 *
 * A draft without Artikel yields a single entry with `number: null`, so that
 * a Novelle of one law and a package of twelve are the same shape to callers.
 */
export interface DraftArticle {
  /** Position in printed order, 0-based. The annex must not reorder these. */
  index: number
  /** "Artikel 3" as printed, or null for a draft without Artikel. */
  number: string | null
  /** The numeral alone: "3", "III", "X1". Null without Artikel. */
  numeral: string | null
  /**
   * The law's name under the Artikel line, with a bare "(Verfassungs-
   * bestimmung)" skipped — that is a qualifier, not a name, and matching an
   * annex heading against it would join on a word the annex never prints.
   */
  title: string | null
  /**
   * The key `segmentUnits` and `promulgationByArticle` use (`articleTitle ??
   * articleNumber`), qualifier and all, so a row joins onto the diff units
   * without a second convention.
   */
  key: string | null
  /**
   * Whether the Artikel carries a Promulgationsklausel at all. Not the same
   * as `bgbl !== null`: the UGB's Stammnorm is "dRGBl. S. 219/1897", which is
   * no BGBl and so unresolvable — the Artikel still amends a law.
   */
  amends: boolean
  /** The Stammnorm this Artikel amends; null when it creates law instead. */
  bgbl: BgblCitation | null
}

/**
 * A draft's Artikel in printed order, each with the law it amends.
 *
 * `promulgationByArticle` answers "which law does this key amend"; this
 * answers "which laws does the draft contain, in what order, under what
 * numbers" — the question the annex's Artikel headings have to be checked
 * against. A heading in the annex that matches no entry here is not a law
 * boundary but an internal heading, and that single test removes every
 * pseudo-boundary the annex itself cannot distinguish (2026-09-09).
 */
export function draftArticles(blocks: readonly TextBlock[]): DraftArticle[] {
  const out: DraftArticle[] = []
  let seenNovao = false
  let current: DraftArticle = { index: 0, number: null, numeral: null, title: null, key: null, amends: false, bgbl: null }
  /** An implicit leading article is only real once it carries something. */
  const filled = (a: DraftArticle): boolean => a.number !== null || a.key !== null || a.amends

  const close = (): void => {
    if (filled(current)) out.push(current)
  }

  for (const b of blocks) {
    if (b.kind === 'article') {
      close()
      current = { index: out.length, number: b.text, numeral: ARTICLE_NUMERAL_RE.exec(b.text)?.[1] ?? null, title: null, key: null, amends: false, bgbl: null }
      seenNovao = false
      continue
    }
    if (b.kind === 'section') {
      if (current.number === null) continue
      if (current.key === null) current.key = b.text
      if (current.title === null && !QUALIFIER_RE.test(b.text.trim())) current.title = b.text
      continue
    }
    if (b.kind === 'title') {
      // The law's own title, for a draft without Artikel. The last one wins,
      // as it did before: a draft that prints Lang- and Kurztitel names
      // itself in the shorter one.
      if (current.number !== null) continue
      current.key = b.text
      if (!QUALIFIER_RE.test(b.text.trim())) current.title = b.text
      continue
    }
    if (b.kind === 'novao') {
      seenNovao = true
      continue
    }
    // The clause stands between the Artikel heading and the first
    // instruction; anything later that cites a BGBl is a cross-reference.
    if (seenNovao || current.amends) continue
    if (!AMENDS_RE.test(b.text)) continue
    current.amends = true
    current.bgbl = stammnormOf(b.text)
  }
  close()
  return out
}

/**
 * Artikel title → the Stammnorm of the law it amends.
 *
 * Keyed exactly as `segmentUnits` keys its units (`articleTitle ??
 * articleNumber`, null for a package without Artikel), so the result joins
 * onto the diff units without a second convention.
 */
export function promulgationByArticle(blocks: readonly TextBlock[]): Map<string | null, BgblCitation> {
  const out = new Map<string | null, BgblCitation>()
  for (const article of draftArticles(blocks)) {
    if (article.bgbl && !out.has(article.key)) out.set(article.key, article.bgbl)
  }
  return out
}

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
    const address = 'target' in op ? op.target : op.anchor
    if (address.para) paras.add(address.para)
  }
  // Several paragraphs in one instruction have no single name.
  return paras.size === 1 ? [...paras][0]! : null
}

