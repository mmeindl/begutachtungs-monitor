/**
 * The laws the draft enacts anew, as groups of the Textgegenüberstellung's
 * box (`NewLawGroup`, 30.10.2026).
 *
 * Built from what the annex leaves over at the end (`placeAtParagraphs`,
 * `ends.rest`) and the draft's own text of those laws (`EnactedLaw`): each
 * passage of the Begründung goes to the § it names, and what names no § of
 * the text stays for the law's end, as it did before the text was there.
 */
import type { EnactedLaw, EnactedLawsResponse, EnactedParagraph, ParagraphExplanationView } from '#shared/types'
import { explanationParaId } from '#shared/utils/explanationKey'
import { gapDe } from '#shared/utils/gaps'
import type { LawEnd } from './lesefassung'

export interface NewLawGroupView {
  /** For the open state; apart from the annex's keys, which are law names too. */
  key: string
  law: string
  /** §§ and Anlagen together: what the cut counts. */
  total: number
  /** Of those, the Anlagen. */
  schedules: number
  paragraphs: { paragraph: EnactedParagraph; explanations: ParagraphExplanationView[] }[]
  /** §§ the search kept, before the cut. */
  matches: number
  more: number
  end: LawEnd | null
}

/** One lowercased haystack per §, as the annex builds one per row. */
export function enactedHaystack(p: EnactedParagraph): string {
  return [...(p.before ?? []), p.id, p.heading, ...p.lines.map((l) => l.text)].filter(Boolean).join('\n').toLowerCase()
}

const SCHEDULE_ID_RE = /^(?:Anlage|Anlagen|Anhang|Anhänge|Anl\.)\s/i

/** „Neues Gesetz · 55 Paragraphen · 9 Anlagen": what the group's pill says. */
export function newLawTagDe(total: number, schedules: number): string {
  const n = total - schedules
  const paragraphs = `${n} ${n === 1 ? 'Paragraph' : 'Paragraphen'}`
  return `Neues Gesetz · ${paragraphs}${schedules ? ` · ${schedules} ${schedules === 1 ? 'Anlage' : 'Anlagen'}` : ''}`
}

/** A group's key, apart from the annex's keys, which are law names too. */
export const newLawKey = (law: string): string => `neu#${law}`

/**
 * One end per law of the text, for a draft that IS a new law (23.11.2026):
 * a law on which the Begründung placed nothing has no entry in `rest`, and
 * got no group (five of the 55 laws of GP XXVII–XXVIII, four of them with
 * scanned Erläuterungen).
 *
 * Only for `createsNewLaw`. In an amending draft `EnactedLaw` also holds
 * Artikel that are no law („Inkrafttreten", „Umsetzung von Richtlinien":
 * 15 entries in 13 drafts), and there `rest` remains the filter.
 */
export function everyLawEnd(
  rest: readonly (LawEnd & { law: string | null })[],
  laws: readonly EnactedLaw[],
): (LawEnd & { law: string | null })[] {
  return laws.map((l) => rest.find((r) => r.law === l.law) ?? { law: l.law, outcomes: [], explanations: [] })
}

/** Why a new law's section shows no text; null where it shows one. */
export function newLawGapDe(r: EnactedLawsResponse): string | null {
  if (r.laws.length || r.otherArticles.length) return null
  return r.source
    ? gapDe('unreadable', 'Den Gesetzestext im RIS konnte der Monitor nicht in Paragraphen gliedern.')
    : gapDe('unreadable', 'Im RIS fand der Monitor zu diesem Entwurf keinen Gesetzestext, den er Paragraph für Paragraph zeigen könnte.')
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
    const key = newLawKey(law.law)
    const limit = options.limitFor(key)
    const leftover: LawEnd = { outcomes: end.outcomes, explanations: end.explanations.filter((e) => !placed.has(e)), ...(end.unit ? { unit: end.unit } : {}) }
    return [{
      key,
      law: law.law,
      total: all.length,
      schedules: all.filter((x) => SCHEDULE_ID_RE.test(x.paragraph.id)).length,
      paragraphs: matching.slice(0, limit),
      matches: matching.length,
      more: Math.max(0, matching.length - limit),
      end: leftover.outcomes.length || leftover.explanations.length ? leftover : null,
    }]
  })
}
