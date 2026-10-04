/**
 * The draft page's title, description and link preview (04.10.2026, out of
 * the page).
 *
 * `usePageSeo`'s pattern: the search result's pair through it, and the
 * preview's own `og:*` after it — a draft's preview says something else
 * than its search result.
 *
 * @param description The Kurzinformation as the page holds it, whole: the
 * snippet reads all of it, also the „Hauptgesichtspunkte" the page leaves
 * out where the Erläuterungen carry them (`withoutMainPoints`).
 */
import type { MaybeRefOrGetter } from 'vue'
import type { DescriptionBlock, DraftDetail } from '#shared/types'
import { countLabelDe, truncate } from '#shared/utils/format'
import { fristStateDe } from '~/utils/deadlines'

export function useDraftSeo(
  data: MaybeRefOrGetter<DraftDetail | null | undefined>,
  description: MaybeRefOrGetter<readonly DescriptionBlock[]>,
): void {
  usePageSeo({
    title: () => {
      const d = toValue(data)
      if (!d) return 'Begutachtung'
      // The short name is what fits a tab and what insiders search for;
      // og:title keeps the full official title for exact citation.
      return truncate(d.shortTitle ?? d.title, 60)
    },
    description: () => {
      const d = toValue(data)
      if (!d) return 'Details zu einem Ministerialentwurf im Begutachtungsverfahren.'
      // Headings are structure, not content: a snippet opening with the bare word
      // "Ziel" wastes the ~160 characters a search result actually shows.
      const prose = toValue(description)
        .flatMap((b) => (b.kind === 'heading' ? [] : b.kind === 'list' ? b.items : [b.text]))
        .join(' · ')
        .replace(/\s+/g, ' ')
        .trim()
      if (prose) return truncate(prose, 160)
      return `Ministerialentwurf ${d.citation}: Frist, Stellungnahmen und weiterer Verlauf.`
    },
  })

  useSeoMeta({
    // The full official title for shares — journalists cite exactly.
    ogTitle: () => toValue(data)?.title ?? 'Begutachtung',
    // Structured facts travel better than prose when a link unfurls in
    // Slack/Signal/X: the preview answers "when, how much, who" at a glance.
    ogDescription: () => {
      const d = toValue(data)
      if (!d) return null
      return [
        fristStateDe(d.active, d.deadline),
        countLabelDe(d.statements.total, 'Stellungnahme', 'Stellungnahmen'),
        d.ministryName,
      ]
        .filter(Boolean)
        .join(' · ')
    },
    ogType: 'article',
  })
}
