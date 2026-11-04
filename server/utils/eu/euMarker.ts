/**
 * The page's EU fact from the three readings — the rules D1, D2 and D5 of
 * docs/architecture.md §12.66, in one pure function.
 *
 * PURE MODULE — no Nitro globals, relative imports only; the corpus script
 * runs the same decision over GP XXVIII.
 */
import type { EuMarker } from '../../../shared/types/eu'
import type { EuAct } from './actCitations'
import type { LawSignal } from './umsetzungshinweis'
import type { VorblattClass } from './vorblatt'

/**
 * What each Vorblatt class puts on the page (D1). `ueber-umsetzung` is
 * „Setzt EU-Recht um" with the Vorblatt's own sentence quoted; `nur-zwingend`
 * — only mandatory measures, 12 Verordnungen and no Ministerialentwurf in the
 * window — and the no-classes put nothing. A ressort's own words for an
 * implementation (`frei-umsetzung`: „dient der Umsetzung der Richtlinie (EU)
 * 2024/2749") count as the tool's sentence.
 */
const MARKER_OF: Partial<Record<VorblattClass, EuMarker>> = {
  umsetzung: 'umsetzung',
  'frei-umsetzung': 'umsetzung',
  'flankierend-vo': 'flankierend-vo',
  'flankierend-rl': 'flankierend-rl',
  'ueber-umsetzung': 'ueber-umsetzung',
}

export interface MarkerInput {
  /** The class of every Vorblatt that carried the EU heading — unreadable ones left out. */
  vorblatt: readonly VorblattClass[]
  /** What the law text says, and the acts it names. */
  law: { signal: LawSignal | null; acts: readonly EuAct[] }
  /** The Erläuterungen' Allgemeiner Teil — consulted only where no Vorblatt could be read. */
  explanations: 'umsetzung' | 'durchfuehrung' | null
}

export interface MarkerDecision {
  marker: EuMarker | null
  source: 'vorblatt' | 'gesetzestext' | 'erlaeuterungen' | null
  /** Several Vorblätter whose classes put different facts on the page. */
  contradicting: boolean
}

/**
 * The fact, or none.
 *
 * - One Vorblatt, or several that agree: their class decides (D1).
 * - Several that disagree — the Industriestrompreisgesetz's two WFAs, one
 *   „dient der Umsetzung", one „dient nicht der Erfüllung unionsrechtlicher
 *   Vorgaben" — decide nothing; the law text decides where it names an act,
 *   and otherwise there is no fact (D2). „Strongest class wins" fired a false
 *   marker on exactly that draft (04.11.2026).
 * - No Vorblatt with the EU heading at all: the Erläuterungen decide whether,
 *   never which act (D5).
 */
export function decideEuMarker(input: MarkerInput): MarkerDecision {
  if (input.vorblatt.length) {
    const facts = new Set(input.vorblatt.map((c) => MARKER_OF[c] ?? null))
    if (facts.size === 1) {
      const marker = [...facts][0]!
      return { marker, source: marker ? 'vorblatt' : null, contradicting: false }
    }
    if (input.law.acts.length && input.law.signal === 'umsetzung') return { marker: 'umsetzung', source: 'gesetzestext', contradicting: true }
    if (input.law.acts.length && input.law.signal === 'durchfuehrung') {
      const marker = input.law.acts.every((a) => a.kind === 'richtlinie') ? 'flankierend-rl' : 'flankierend-vo'
      return { marker, source: 'gesetzestext', contradicting: true }
    }
    return { marker: null, source: null, contradicting: true }
  }
  if (input.explanations === 'umsetzung') return { marker: 'umsetzung', source: 'erlaeuterungen', contradicting: false }
  if (input.explanations === 'durchfuehrung') return { marker: 'flankierend-vo', source: 'erlaeuterungen', contradicting: false }
  return { marker: null, source: null, contradicting: false }
}

/**
 * Two windows' verdicts on whether the law in force already names an act
 * (rule D4): true wins, then false, then unknown. An act is new where ANY
 * law of the draft gains it — a Sammelnovelle carries one directive into a
 * dozen laws, and one law that cannot be resolved must not take the deadline
 * from the others (30/ME: 2023/2864 in eleven Artikel). Old where every law
 * that could be read names it already; unknown where none could be read.
 */
export function combineVerdicts(before: boolean | null | undefined, verdict: boolean | null): boolean | null {
  if (before === true || verdict === true) return true
  if (before === false || verdict === false) return false
  return null
}
