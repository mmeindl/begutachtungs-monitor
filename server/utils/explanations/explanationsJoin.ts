/**
 * The passages of the Besonderer Teil at their Paragraph
 * (docs/architecture.md §12.30) — the second half of the Erläuterungen
 * package.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * WHY THIS OPENS NO SECOND ALIGNMENT PROBLEM. The Besonderer Teil heads its
 * passages with exactly the address the tooling computes anyway: „Zu Z 4
 * (§ 54c Abs. 1a und 1b):" names the Novellierungsanordnung and the
 * Paragraph, „Zu Art. 2 (Änderung des KommAustria-Gesetzes)" the law of the
 * package. The Gegenüberstellung carries its rows under the same two keys
 * (`ComparisonRow.law`, `ComparisonRow.para`). So the join is a lookup and
 * not a similarity search over text.
 *
 * WHAT DOES NOT HAPPEN: nothing is invented and nothing left out. A passage
 * whose law cannot be determined safely is **discarded** in a package of
 * several laws rather than hung somewhere — § 5 of the second law is a
 * different provision from § 5 of the first, and the wrong Begründung at a
 * Paragraph would be worse than none. The same rule `ComparisonRow.law`
 * already follows.
 */
import type { DraftArticle } from '../lawtext/draftArticles'
import type { ExplanationsDocument } from './risExplanations'
import { articleNameTokens, jaccardSimilarity } from '../lawtext/lawNames'
// Relative rather than through `#shared`: this module is pure so vitest and
// the measuring scripts run it directly — as `diff/lawDiff.ts` does.
import { explanationParaId } from '../../../shared/utils/explanationKey'

/** One Erläuterungen passage, addressed to one Paragraph of one law. */
export interface ParagraphExplanation {
  /**
   * The package's law key, identical to `ComparisonRow.law`; null for a draft
   * that amends one law only — there the rows carry no law either.
   */
  law: string | null
  /** The Paragraph's number, „54c" — as `explanationParaId` builds it. */
  para: string
  /** The heading, as the ressort printed it. */
  heading: string
  /** The passage's paragraphs, in printed order. */
  text: string[]
}

/** „Zu Art. 2 (…)", „Zu Artikel 2 – …" — the Artikel's number, where one stands there. */
const ARTICLE_NUMERAL_RE = /^(?:zu\s+)?art(?:ikel)?\.?\s*([0-9]+[a-z]?|[ivxlc]+)\b/i

/**
 * From where on two law names count as the same, where the passage names no
 * Artikel number.
 *
 * Measured (`pnpm corpus:erlaeuterungen -- --join`): the number carries the
 * large majority of cases; the name comparison is the rest, and at 0,5 it
 * stays on the safe side — „Änderung des Aktiengesetzes" against
 * „Aktiengesetz" is a coverage of 1,0 once the template words are removed,
 * and two different laws of one package lie far below it.
 */
const NAME_MIN_JACCARD = 0.5

/**
 * Which law of the package a passage explains.
 *
 * By the Artikel number first, because that is the ressort's own statement
 * and no judgement of ours; then by the law's name, for the ressorts that
 * head it „Änderung des Aktiengesetzes" without a number. Where both come to
 * nothing the answer is null — and the caller discards the passage instead of
 * guessing it.
 */
function articleKeyOf(heading: string | null, articles: readonly DraftArticle[]): string | null {
  if (!heading) return null
  const numeral = ARTICLE_NUMERAL_RE.exec(heading)?.[1]?.toLowerCase()
  if (numeral) {
    const hit = articles.find((a) => a.numeral?.toLowerCase() === numeral)
    if (hit?.key) return hit.key
  }
  const tokens = articleNameTokens(heading)
  let best: { key: string; score: number } | null = null
  for (const article of articles) {
    if (!article.key) continue
    const score = jaccardSimilarity(tokens, articleNameTokens(article.title ?? article.key))
    if (score >= NAME_MIN_JACCARD && (!best || score > best.score)) best = { key: article.key, score }
  }
  return best?.key ?? null
}

/**
 * The passages of the Besonderer Teil, resolved to (law, Paragraph).
 *
 * A passage naming several Paragraphen („Zu §§ 12 und 13") appears at each of
 * them: it IS the Begründung for both, and the reader standing at § 13 has no
 * interest in its having been printed under § 12.
 */
export function explanationsByParagraph(
  doc: ExplanationsDocument,
  articles: readonly DraftArticle[],
): ParagraphExplanation[] {
  const out: ParagraphExplanation[] = []
  /**
   * The key MUST be the rows' key, and that is not "null where there is only
   * one law": the Beilage carries its rows under the Artikel's key as soon as
   * the draft has a named one — even where it is exactly one. The first
   * version set null here and so produced **not a single hit** on a draft
   * whose §§ matched perfectly (Honigverordnung Novelle 2025, 9 of 9 wide).
   * Measured rather than assumed: `pnpm corpus:erlaeuterungen -- --join`.
   */
  const keyed = articles.filter((a) => a.key !== null)
  const only = keyed.length === 1 ? keyed[0]!.key : null
  for (const passage of doc.special?.passages ?? []) {
    if (!passage.heading || !passage.text.length || !passage.paragraphs.length) continue
    // The passage's own heading first: „Zu Art. 2 Z 1 (§ 7)" names its law
    // itself, and that is the more precise statement than the Artikel heading
    // it stands under.
    const law =
      keyed.length <= 1 ? only : articleKeyOf(passage.heading, articles) ?? articleKeyOf(passage.article, articles)
    // A package of several laws and a passage whose law cannot be
    // determined: discard. See the file header.
    if (keyed.length > 1 && law === null) continue
    for (const para of passage.paragraphs) {
      const id = explanationParaId(para)
      if (id) out.push({ law, para: id, heading: passage.heading, text: passage.text })
    }
  }
  return out
}
