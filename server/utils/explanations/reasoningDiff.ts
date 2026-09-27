/**
 * „Hat sich die Begründung geändert?" — the comparison of the Erläuterungen,
 * Paragraph by Paragraph (docs/architecture.md §12.10b).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. The Nuxt
 * half is `explanations/reasoningDiffService.ts`.
 *
 * COMPUTED AT THE PARAGRAPH, SHOWN AT THE INSTRUCTION. The Erläuterungen are
 * organised by Paragraph, the Gegenüberstellung by Novellierungsanordnung —
 * and several Ziffern routinely amend the same Paragraph (8/ME: 33
 * instructions over 17 Paragraphen, § 11 six times on its own). Counting per
 * instruction counts the same Begründung several times and then calls the
 * result „Paragraphen". So: one comparison per Paragraph in `paragraphs`, and
 * `units` says which instruction points at which — the key stays `unitKey`, as
 * for the § names (`diff/paraTitleService.ts`), so no second key arises at
 * which check and display could drift apart.
 *
 * AMBIGUOUS NUMBERS STAY OUT. A passage of the Besonderer Teil carries the
 * Paragraph's number, not its law. In a Sammelgesetz two Artikel each amend a
 * § 15 (8/ME: Staatsschutz- und Nachrichtendienst-Gesetz and
 * Bundesverwaltungsgerichtsgesetz), and both passages sit under the same
 * number — one law's Begründung would be shown under the other's Paragraph.
 * So where two Artikel address the same number this layer shows nothing, the
 * same rule as for the § names: a wrong reference is worse than none.
 *
 * **Unless the Artikel says which (27.09.2026).** Measured, the rule was not
 * a margin: 14,7 % of the comparable §§ of GP XXVII (413 of 2.801), 22,4 % of
 * GP XXVI (§12.10b). Where both documents set the passage under an Artikel
 * (`HtmlPassage.article`) and the unit carries its Artikel number on each
 * side (`articleKey`, `fromArticleKey` — renumbered between draft and
 * Vorlage, 18/ME: 3 → 6), the § is compared under that pair; measured, 292
 * of the 413 come back. What still cannot be keyed stays out, as before.
 */
import type { LawDiffUnit, ReasoningDiffEntry } from '../../../shared/types'
import { unitKey } from '../../../shared/utils/diffKey'
import { diffTokens } from '../diff/wordDiff'
import { addressedParagraphOf } from '../lawtext/instructionAddress'
// The key of `passagesByParagraph`, and the same reading the page looks up
// with. Its `\b` changes nothing for the designations `parseAddress` builds:
// 0 of 4.215 differ over the offline corpus (22.09.2026). It bites only on a
// raw Gliederungssymbol such as § 365m1, which never reaches here.
import { articleParagraphKey, explanationParaId } from '../../../shared/utils/explanationKey'

/** Below this it is punctuation and whitespace, not a revision. */
const CHANGED_AT = 0.02
/** A draft rarely gives reasons for more; the ceiling keeps an outlier off the page. */
// Not exported: Nitro's auto-imports share one namespace, and
// `MAX_PARAGRAPHS` already exists in `annex/verdict.ts`.
const MAX_PARAGRAPHS = 120

export interface ReasoningComparison {
  /**
   * `unitKey` → „§ 11": which change points at which Paragraph. Where the
   * number is shared by two Artikel of the draft, the key names the Artikel
   * too („Art. 2 § 15") — a lookup key, not display text; the entry's
   * `paragraph` stays „§ 15".
   */
  units: Record<string, string>
  /** „§ 11" → the comparison of its Begründung, once per Paragraph. */
  paragraphs: Record<string, ReasoningDiffEntry>
  stats: { compared: number; changed: number }
}

/**
 * The Paragraph numbers occurring in more than one Artikel of the draft — see
 * the file header. Computed over all units, the unchanged ones included:
 * whether a number is given out twice does not depend on what changed between
 * the two versions.
 */
function ambiguousParagraphs(units: readonly LawDiffUnit[]): Set<string> {
  const articles = new Map<string, Set<string>>()
  for (const unit of units) {
    const para = addressedParagraphOf(unit)
    if (!para) continue
    const seen = articles.get(para) ?? new Set<string>()
    seen.add(unit.article ?? '')
    articles.set(para, seen)
  }
  return new Set([...articles].filter(([, seen]) => seen.size > 1).map(([para]) => para))
}

/**
 * The comparison, out of the Gegenüberstellung's units and the passages of
 * both versions (Paragraph number → text).
 *
 * Compared only where BOTH sides carry a Begründung. A missing one is no
 * changed Begründung but a gap in the document, and showing that as
 * „geändert" would be wrong.
 */
export function compareReasoning(
  units: readonly LawDiffUnit[],
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
  byArticle: { before: ReadonlyMap<string, string>; after: ReadonlyMap<string, string> } | null = null,
): ReasoningComparison {
  const ambiguous = ambiguousParagraphs(units)
  const out: ReasoningComparison = { units: {}, paragraphs: {}, stats: { compared: 0, changed: 0 } }
  const skipped = new Set<string>()

  // Two passes: every unique number first, the Artikel-keyed ones after. The
  // ceiling below counts entries, and in unit order an Artikel-keyed § early
  // in a long Sammelgesetz took the place of a unique one that had been shown
  // before the second key existed — measured, 43, 202 and 230/ME of GP XXVII
  // would have lost Begründungen they have today.
  const ordered = [...units.filter((u) => !ambiguous.has(addressedParagraphOf(u) ?? '')), ...units.filter((u) => ambiguous.has(addressedParagraphOf(u) ?? ''))]
  for (const unit of ordered) {
    const para = addressedParagraphOf(unit)
    const id = explanationParaId(para)
    if (!para || !id) continue

    // The entry's key and the two texts it compares: by § where the number
    // is unique in the draft, by Artikel and § where it is not — and where
    // not even that holds, nothing.
    let key: string
    let a: string
    let b: string
    if (!ambiguous.has(para)) {
      key = para
      a = before.get(id) ?? ''
      b = after.get(id) ?? ''
    } else {
      if (!byArticle || !unit.fromArticleKey || !unit.articleKey) continue
      key = `Art. ${unit.articleKey} ${para}`
      a = byArticle.before.get(articleParagraphKey(unit.fromArticleKey, id)) ?? ''
      b = byArticle.after.get(articleParagraphKey(unit.articleKey, id)) ?? ''
    }
    if (skipped.has(key)) continue

    if (!out.paragraphs[key]) {
      if (Object.keys(out.paragraphs).length >= MAX_PARAGRAPHS) continue
      if (!a || !b) {
        skipped.add(key)
        continue
      }
      const { similarity, segments } = diffTokens(a, b)
      const drift = 1 - similarity
      const changed = drift >= CHANGED_AT
      out.paragraphs[key] = {
        paragraph: para,
        drift,
        changed,
        segments: changed ? segments : null,
        // Both versions whole, but only where the word comparison stopped at
        // its ceiling: the unfolded Begründung would otherwise stand there
        // empty because `segments` is missing (seen at § 11 and § 15 of
        // 8/ME). The same shape as in the comparison above, where the same
        // can happen.
        fromText: changed && !segments ? a : null,
        toText: changed && !segments ? b : null,
      }
    }
    out.units[unitKey(unit)] = key
  }

  const entries = Object.values(out.paragraphs)
  out.stats = { compared: entries.length, changed: entries.filter((e) => e.changed).length }
  return out
}
