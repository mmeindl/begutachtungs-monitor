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
 */
import type { LawDiffUnit, ReasoningDiffEntry } from '../../../shared/types'
import { unitKey } from '../../../shared/utils/diffKey'
import { diffTokens } from '../diff/wordDiff'
import { addressedParagraphOf } from '../lawtext/instructionAddress'
// The key of `passagesByParagraph`, and the same reading the page looks up
// with. Its `\b` changes nothing for the designations `parseAddress` builds:
// 0 of 4.215 differ over the offline corpus (22.09.2026). It bites only on a
// raw Gliederungssymbol such as § 365m1, which never reaches here.
import { explanationParaId } from '../../../shared/utils/explanationKey'

/** Below this it is punctuation and whitespace, not a revision. */
const CHANGED_AT = 0.02
/** A draft rarely gives reasons for more; the ceiling keeps an outlier off the page. */
// Not exported: Nitro's auto-imports share one namespace, and
// `MAX_PARAGRAPHS` already exists in `annex/verdict.ts`.
const MAX_PARAGRAPHS = 120

export interface ReasoningComparison {
  /** `unitKey` → „§ 11": which change points at which Paragraph. */
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
): ReasoningComparison {
  const ambiguous = ambiguousParagraphs(units)
  const out: ReasoningComparison = { units: {}, paragraphs: {}, stats: { compared: 0, changed: 0 } }
  const skipped = new Set<string>()

  for (const unit of units) {
    const para = addressedParagraphOf(unit)
    const id = explanationParaId(para)
    if (!para || !id || ambiguous.has(para) || skipped.has(para)) continue

    if (!out.paragraphs[para]) {
      if (Object.keys(out.paragraphs).length >= MAX_PARAGRAPHS) continue
      const a = before.get(id) ?? ''
      const b = after.get(id) ?? ''
      if (!a || !b) {
        skipped.add(para)
        continue
      }
      const { similarity, segments } = diffTokens(a, b)
      const drift = 1 - similarity
      const changed = drift >= CHANGED_AT
      out.paragraphs[para] = {
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
    out.units[unitKey(unit)] = para
  }

  const entries = Object.values(out.paragraphs)
  out.stats = { compared: entries.length, changed: entries.filter((e) => e.changed).length }
  return out
}
