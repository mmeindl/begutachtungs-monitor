/**
 * The page's EU fact from the three readings — the rules D1, D2 and D5 of
 * docs/architecture.md §12.66, and the law text's own hint between D1 and
 * D5 (05.11.2026), in one pure function.
 *
 * PURE MODULE — no Nitro globals, relative imports only; the corpus script
 * runs the same decision over GP XXVIII.
 */
import type { EuMarker } from '../../../shared/types/eu'
import { uniqueActs, type EuAct } from './actCitations'
import { strongestSignal, type LawSignal } from './umsetzungshinweis'
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
  /**
   * What the law text says, and the acts it names. `signal` is the strongest
   * signal of a window that names an act (`actSignal` of the readers) — the
   * hint that may decide.
   */
  law: { signal: LawSignal | null; acts: readonly EuAct[] }
  /** The Erläuterungen' Allgemeiner Teil — consulted only where neither a Vorblatt nor the law text's hint decides. */
  explanations: 'umsetzung' | 'durchfuehrung' | null
}

export interface MarkerDecision {
  marker: EuMarker | null
  source: 'vorblatt' | 'gesetzestext' | 'erlaeuterungen' | null
  /** Several Vorblätter whose classes put different facts on the page. */
  contradicting: boolean
}

/**
 * The fact the law text's own hint gives, or null: an Umsetzungshinweis
 * that names an act implements it (`umsetzung`), one that flanks names a
 * regulation (`flankierend-vo`, or `flankierend-rl` where every act is a
 * directive). A „Bezugnahme" decides nothing, and nor does a hint that
 * names no act.
 */
export function lawTextMarker(law: MarkerInput['law']): EuMarker | null {
  if (!law.acts.length) return null
  if (law.signal === 'umsetzung') return 'umsetzung'
  if (law.signal === 'durchfuehrung') return law.acts.every((a) => a.kind === 'richtlinie') ? 'flankierend-rl' : 'flankierend-vo'
  return null
}

/**
 * The law text's hint as the decision reads it: the strongest signal, and
 * the acts, of the windows that name at least one act the law in force does
 * not name already — `isNew` true, or null where the law in force could not
 * be read, which counts as new as on the map (05.11.2026). A Novelle
 * restates its whole hint: Tirol's regulation t-v9cd2d26… repeats „Durch
 * diese Verordnung wird die Richtlinie (EU) 2018/2001 … umgesetzt" (old)
 * and adds „begleitende Maßnahmen zur Durchführung der Verordnung (EU)
 * 2024/1309" (new), and the restated sentence decided „Setzt EU-Recht um"
 * where „Begleitet eine EU-Verordnung" is right. Without `isNew` every
 * window that names an act counts — the reading before the law in force is
 * asked, and what the corpus runs show.
 */
export function newLawHint(
  windows: readonly { signal: LawSignal; acts: readonly EuAct[] }[],
  isNew?: (celex: string) => boolean | null,
): MarkerInput['law'] {
  const deciding = windows.filter((w) => w.acts.some((a) => (isNew?.(a.celex) ?? null) !== false))
  return { signal: strongestSignal(deciding.map((w) => w.signal)), acts: uniqueActs(deciding.map((w) => w.acts)) }
}

/** The fact where the Erläuterungen' prose decides (D5). */
export function explanationsMarker(signal: 'umsetzung' | 'durchfuehrung' | null): EuMarker | null {
  return signal === 'umsetzung' ? 'umsetzung' : signal === 'durchfuehrung' ? 'flankierend-vo' : null
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
 * - No Vorblatt with the EU heading at all: the law text's own hint decides
 *   where it names an act (05.11.2026) — Tirol's „§ 13b Durchführung
 *   von Unionsrecht Durch dieses Gesetz werden die in der Verordnung (EU)
 *   2024/1028 … vorgesehenen Durchführungsbestimmungen erlassen"
 *   (t-2026-588) is the draft's own word, stronger than any prose about it.
 * - Neither: the Erläuterungen decide whether, never which act (D5).
 */
export function decideEuMarker(input: MarkerInput): MarkerDecision {
  const byLaw = lawTextMarker(input.law)
  if (input.vorblatt.length) {
    const facts = new Set(input.vorblatt.map((c) => MARKER_OF[c] ?? null))
    if (facts.size === 1) {
      const marker = [...facts][0]!
      return { marker, source: marker ? 'vorblatt' : null, contradicting: false }
    }
    return { marker: byLaw, source: byLaw ? 'gesetzestext' : null, contradicting: true }
  }
  if (byLaw) return { marker: byLaw, source: 'gesetzestext', contradicting: false }
  const marker = explanationsMarker(input.explanations)
  return { marker, source: marker ? 'erlaeuterungen' : null, contradicting: false }
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
