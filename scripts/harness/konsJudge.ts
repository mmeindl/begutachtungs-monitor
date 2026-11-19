/**
 * The judgements the BGBl bench (`scripts/harness/kons.ts`) passes on its
 * own bookkeeping — which § a RIS label is, which draft Artikel a BGBl
 * Artikel is, why a § stood still. Pure, so they are tested
 * (`tests/konsJudge.test.ts`): a harness that judges is held to the rules
 * of production code (decisions.md, „Measuring").
 */
import { sameStammnormCited } from '../../server/utils/lawtext/bgblCitation'
import type { DraftArticle } from '../../server/utils/lawtext/draftArticles'
import { lawNameScore } from '../../server/utils/lawtext/lawNames'
import { bareParaId, isDivision, isSchedule } from '../../server/utils/text/designation'

/**
 * The bare number this Prüfstand holds its §§ under — and none for a division
 * above the § („Abschnitt 4"), which the site keys apart (`unitKey`) and
 * which locked § 4 here under its number.
 */
export const harnessKey = (label: string): string | null => (isDivision(label) ? null : bareParaId(label))

/**
 * The key a RIS label's § is scored under — the engine's id for it.
 *
 * „Art. 1 § 3", a law organised in Artikel, is § 3: the first number is the
 * Artikel's. Read by the first number, the bench held the engine's § 1
 * against RIS's § 3 and booked an „eigene Abweichung" that was neither
 * (AlVG, BGBl. I Nr. 62/2026) — and every other § of such a law found no
 * engine node under its Artikel's number and was silently never scored: 45
 * §§ of six laws in the 60-BGBl run (GGG, FinStrG, AlVG, BEinstG, PreisG,
 * LMBG), 41 of them identical (19.11.2026).
 * Where two labels of one law come to the same key, neither is scored
 * (`ambiguousLabels`): which Artikel's § 3 the engine holds is a question
 * this bench does not answer for it.
 */
export const scoredKey = (label: string): string | null => harnessKey(label.replace(/^Art\.\s*\S+\s+(?=§)/, ''))
/** A key with its kind: „§ 1" and „Anl. 1" share the number, not the unit. */
export const kindKey = (designation: string, key: string | null | undefined): string => `${isSchedule(designation) ? 'Anl. ' : ''}${key ?? ''}`

/**
 * Why a § the engine left as it stood, while RIS changed it, stands so.
 *
 * The summary filed all of them as „ungefährlich, wird verweigert" and never
 * checked it. 28 of 189 were not refused at all (19.11.2026): five were §§
 * whose only instruction `segmentUnits` had dropped (SBBG § 5, ÄrzteG §§ 6a
 * and 7, StVfG § 1 — the line was in no unit, so it was neither applied nor
 * refused), the rest Anlagen the engine refused under a designation this
 * bench cannot key, §§ no line of the Novelle names, and §§ an applied
 * instruction touched without changing them. Only the first class is the
 * harmless one the legend promised; the others are printed by name.
 */
export const UNCHANGED_CLASSES = ['verweigert', 'angewendet', 'Anlage', 'ungenannt'] as const
export type UnchangedClass = (typeof UNCHANGED_CLASSES)[number]
/**
 * The class of one § the engine left as it stood: refused beats named, named
 * beats a schedule the Novelle addressed under a designation RIS does not
 * carry, and what is left no line names.
 */
export function unchangedClass(at: { refused: boolean; named: boolean; schedule: boolean; unkeyedSchedule: boolean }): UnchangedClass {
  if (at.refused) return 'verweigert'
  if (at.named) return 'angewendet'
  return at.schedule && at.unkeyedSchedule ? 'Anlage' : 'ungenannt'
}

/**
 * The draft's Artikel that amends the same law as this BGBl Artikel.
 *
 * The Stammnorm decides: it is the citation both Promulgationsklauseln print
 * for the same law, and it survives everything the parliamentary stage does
 * to Artikel numbers and headings. Where it is missing on either side — the
 * UGB's Stammnorm is "dRGBl. S. 219/1897" and yields no BgblCitation — the
 * headings decide, but only when one fits clearly better than every other;
 * a tie ends the oracle for this Artikel, because the alternative is holding
 * the engine's § 5 against another law's § 5.
 *
 * **One Bundesgesetzblatt that created several laws is no tie.** The
 * Fremdenrechtspaket BGBl. I Nr. 100/2005 is the Stammnorm of the AsylG,
 * the FPG and the NAG; 107/2017 of the BörseG 2018 and the WAG 2018; 65/2018
 * of the BVergG 2018 and the BVergGKonz 2018. Where several draft Artikel cite
 * the Stammnorm, the heading decides among them, by the same rule — and only
 * among them. Until 19.11.2026 the Stammnorm tie ended the oracle for six of
 * the laws of the 60-BGBl run although each heading matched one Artikel word
 * for word. A missing Teil is no contradiction („BGBl. Nr. 87/2012" for the
 * BFA-G, `sameStammnormCited`), two different Teile still are.
 */
export function matchArticle(candidates: readonly DraftArticle[], article: DraftArticle): DraftArticle | { reason: string } {
  let pool = candidates
  if (article.bgbl) {
    const byBgbl = candidates.filter((c) => c.bgbl && sameStammnormCited(c.bgbl, article.bgbl!))
    if (byBgbl.length === 1) return byBgbl[0]!
    if (byBgbl.length > 1) pool = byBgbl
  }
  if (!article.title) return { reason: 'das Bundesgesetzblatt nennt keinen Titel' }
  let best: { article: DraftArticle; score: number } | null = null
  let runnerUp = 0
  for (const c of pool) {
    const score = c.title ? lawNameScore(article.title, c.title) : 0
    if (!best || score > best.score) {
      runnerUp = best?.score ?? 0
      best = { article: c, score }
    } else if (score > runnerUp) runnerUp = score
  }
  if (best && best.score >= 0.6 && best.score > runnerUp) return best.article
  return { reason: pool === candidates ? 'kein Artikel nennt das Gesetz, weder mit der Stammnorm noch im Titel' : `${pool.length} Artikel zitieren die Stammnorm, kein Titel passt eindeutig` }
}
