/**
 * The laws the draft enacts anew, as groups of the Textgegenüberstellung's
 * box (`NewLawGroup`, 30.10.2026).
 *
 * Built from what the annex leaves over at the end (`placeAtParagraphs`,
 * `ends.rest`) and the draft's own text of those laws (`EnactedLaw`): each
 * passage of the Begründung goes to the § it names, and what names no § of
 * the text stays for the law's end, as it did before the text was there.
 */
import type { EnactedLaw, EnactedParagraph, ParagraphExplanationView } from '#shared/types'
import { explanationParaId } from '#shared/utils/explanationKey'
import type { LawEnd } from './lesefassung'

export interface NewLawGroupView {
  /** For the open state; apart from the annex's keys, which are law names too. */
  key: string
  law: string
  total: number
  paragraphs: { paragraph: EnactedParagraph; explanations: ParagraphExplanationView[] }[]
  /** §§ the search kept, before the cut. */
  matches: number
  more: number
  end: LawEnd | null
}

/** One lowercased haystack per §, as the annex builds one per row. */
export function enactedHaystack(p: EnactedParagraph): string {
  return [p.id, p.heading, ...p.lines.map((l) => l.text)].filter(Boolean).join('\n').toLowerCase()
}

export function newLawGroups(
  rest: readonly (LawEnd & { law: string | null })[],
  laws: readonly EnactedLaw[],
  options: {
    /** Lowercased, trimmed; empty for none. */
    query: string
    haystack: (p: EnactedParagraph) => string
    limitFor: (key: string) => number
  },
): NewLawGroupView[] {
  const byLaw = new Map(laws.map((l) => [l.law, l]))
  return rest.flatMap((end): NewLawGroupView[] => {
    const law = end.law === null ? undefined : byLaw.get(end.law)
    if (!law) return []
    const passages = new Map<string, ParagraphExplanationView[]>()
    // `para` is the key already (`explanationParaId` on the server), as
    // `placeAtParagraphs` reads it.
    for (const e of end.explanations) passages.set(e.para, [...(passages.get(e.para) ?? []), e])
    const placed = new Set<ParagraphExplanationView>()
    const all = law.paragraphs.map((paragraph) => {
      const id = explanationParaId(paragraph.id)
      const explanations = id ? (passages.get(id) ?? []) : []
      for (const e of explanations) placed.add(e)
      return { paragraph, explanations }
    })
    const matching = options.query ? all.filter((x) => options.haystack(x.paragraph).includes(options.query)) : all
    if (options.query && matching.length === 0) return []
    const key = `neu#${law.law}`
    const limit = options.limitFor(key)
    const leftover: LawEnd = { outcomes: end.outcomes, explanations: end.explanations.filter((e) => !placed.has(e)) }
    return [{
      key,
      law: law.law,
      total: all.length,
      paragraphs: matching.slice(0, limit),
      matches: matching.length,
      more: Math.max(0, matching.length - limit),
      end: leftover.outcomes.length || leftover.explanations.length ? leftover : null,
    }]
  })
}
