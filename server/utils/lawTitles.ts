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

export function sameBgbl(a: BgblCitation, b: BgblCitation): boolean {
  return a.organ === b.organ && a.nummer === b.nummer
}

/**
 * A Promulgationsklausel announces that an existing law is being amended.
 * A Stammgesetz has none — it creates law rather than changing it, so there
 * is nothing to look up and nothing to name.
 */
const AMENDS_RE = /\bwird wie folgt geändert|\bwerden wie folgt geändert|\bwird geändert\b/i

/**
 * Artikel title → the Stammnorm of the law it amends.
 *
 * Keyed exactly as `segmentUnits` keys its units (`articleTitle ??
 * articleNumber`, null for a package without Artikel), so the result joins
 * onto the diff units without a second convention.
 */
export function promulgationByArticle(blocks: readonly TextBlock[]): Map<string | null, BgblCitation> {
  const out = new Map<string | null, BgblCitation>()
  let articleNumber: string | null = null
  let articleTitle: string | null = null
  let seenNovao = false

  const key = (): string | null => articleTitle ?? articleNumber

  for (const b of blocks) {
    if (b.kind === 'article') {
      articleNumber = b.text
      articleTitle = null
      seenNovao = false
      continue
    }
    if (b.kind === 'section') {
      if (articleNumber && articleTitle === null) articleTitle = b.text
      continue
    }
    if (b.kind === 'title') {
      if (articleNumber === null) articleTitle = b.text
      continue
    }
    if (b.kind === 'novao') {
      seenNovao = true
      continue
    }
    // The clause stands between the Artikel heading and the first
    // instruction; anything later that cites a BGBl is a cross-reference.
    if (seenNovao || out.has(key())) continue
    if (!AMENDS_RE.test(b.text)) continue
    const bgbl = parseBgbl(b.text)
    if (bgbl) out.set(key(), bgbl)
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

