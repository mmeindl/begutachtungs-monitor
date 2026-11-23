/**
 * The window after the Begutachtung, in the words and addresses the page and
 * the feed share (`/feed.xml?quelle=parlament`, 23.11.2026).
 *
 * Pure module: no Nuxt auto-imports, so both runtimes and vitest read it.
 */
import type { OpenVorlage } from '../types'

/**
 * How long a Stellungnahme is possible. The reasoning stands at
 * `SECOND_ROUND_WINDOW` (`app/utils/spine.ts`), the full sentence built from
 * this clause.
 */
export const SECOND_ROUND_CLAUSE = 'bis zum Beschluss im Bundesrat'

/** Period and number of a Vorlage, read off its Parliament address. */
export function vorlageOfParliamentUrl(url: string): { gp: string; inr: number } | null {
  const m = /\/gegenstand\/([IVXLC]+)\/I\/(\d+)(?:\/|$)/.exec(url)
  return m?.[1] && m[2] ? { gp: m[1], inr: Number(m[2]) } : null
}

/**
 * What an open item is, in the words of the page (`itemCopyDe`, which the
 * server may not import; a test holds the two together).
 */
export function openVorlageWordDe(v: Pick<OpenVorlage, 'kind' | 'variant'>): string {
  if (v.kind === 'regierungsvorlage') return 'Regierungsvorlage'
  if (v.kind === 'ausschussantrag') return 'Ausschussantrag'
  return v.variant === 'drittel' ? 'Gesetzesantrag von Mitgliedern des Bundesrates' : 'Gesetzesantrag des Bundesrates'
}
