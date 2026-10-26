/**
 * What the page says about our Lesefassung at a § of the
 * Textgegenüberstellung, and where it shows none (26.10.2026).
 *
 * The server accounts for every § the draft amends: shown, or withheld with
 * its cause (`server/utils/kons/consolidate.ts`). Until 26.10.2026 the page
 * heard only of the shown ones, and a § without „Ganzer Paragraph danach"
 * could mean eight different things, none of them said. The outcomes are
 * placed at the § blocks by `placeAtParagraphs` (`annexGroups.ts`), the same
 * pass that places the Begründung, under the designation a § carries after
 * the draft; what no block takes is listed at the end of its law — a § that
 * vanishes without a word is exactly what this module exists against.
 *
 * Pure, so the rules are pinned by a test (tests/lesefassung.test.ts). The
 * sentences are here too: they are about what WE could not do, and each one
 * names that — never the ministry (docs/architecture.md §4).
 */
import type { AnnexWithheldCause, ConsolidatedNotRun, ConsolidatedParagraph, ConsolidatedTextResponse, ConsolidatedWithheldCause, ParagraphExplanationView, TextComparisonRow } from '#shared/types'
import { annexUnitId, explanationKey } from '#shared/utils/explanationKey'

/**
 * Why a § carries no Lesefassung: the server's causes, and one only the page
 * can see — the annex shows a change at a § for which the draft's
 * instructions, as we read them, name none (`nicht-gefunden`).
 */
export type LesefassungCause = ConsolidatedWithheldCause | 'nicht-gefunden'

export type Lesefassung =
  | { kind: 'shown'; paragraph: ConsolidatedParagraph }
  | { kind: 'withheld'; cause: LesefassungCause }

/** One outcome of the server, as the placement takes it. */
export interface Outcome {
  /** As the server keys it: „12", „Anl. 1". */
  id: string
  law: string | null
  lesefassung: Lesefassung
}

/** An outcome no § block of the annex took, kept for the end of its law. */
export interface UnplacedOutcome {
  id: string
  lesefassung: Lesefassung
}

/**
 * What one law of the draft leaves over once every § block of the annex has
 * taken its own: the §§ the draft amends that no block takes, and the
 * Begründung passages addressed to a § no block stands for.
 */
export interface LawEnd {
  outcomes: UnplacedOutcome[]
  explanations: ParagraphExplanationView[]
}

/**
 * The server's outcomes, looked up by the law and designation a § block
 * stands for — and taken once a block has them, so what is left at the end
 * is exactly what no block took. Null while there is nothing to place: no
 * response yet, or a run that did not happen (`notRun`, said once by
 * `lesefassungNotRunText`).
 */
export interface OutcomeIndex {
  /**
   * The outcome a § block of `law` with designation `designation` stands
   * for, or null. The lookups, in order, and why each:
   *  1. law and unit, the key the gate asked the annex with (`annexLaw`);
   *  2. the unit alone where the server filed the § under no law — a
   *     single-law Novelle asks the annex without one, while its row carries
   *     one anyway (§12.12a);
   *  3. the unnumbered schedule („Anl.") at the law's numbered one: an
   *     instruction „des Anhangs" can only mean a law's only schedule, and the
   *     annex prints its number;
   *  4. a block without a law in a package — the annex does not divide its
   *     laws (`boundaryNote`): the § number alone, which only says something
   *     where a single law of the package has such a §, and otherwise says
   *     exactly that (`anhang-ungeteilt`).
   */
  at(law: string | null, designation: string | null): { lesefassung: Lesefassung; outcomes: Outcome[] } | null
  /** Mark outcomes as placed. */
  take(outcomes: readonly Outcome[]): void
  /** Everything not placed, in the server's order. */
  untaken(): Outcome[]
}

export function outcomeIndex(response: ConsolidatedTextResponse | null): OutcomeIndex | null {
  if (!response || response.notRun) return null
  const all: Outcome[] = [
    ...response.paragraphs.map((p): Outcome => ({ id: p.id, law: p.annexLaw, lesefassung: { kind: 'shown', paragraph: p } })),
    ...(response.withheld ?? []).map((w): Outcome => ({ id: w.id, law: w.annexLaw, lesefassung: { kind: 'withheld', cause: w.cause } })),
  ]
  const byKey = new Map<string, Outcome>()
  const byUnit = new Map<string, Outcome[]>()
  for (const o of all) {
    const unit = o.id.toLowerCase()
    const key = explanationKey(o.law, unit)
    if (!byKey.has(key)) byKey.set(key, o)
    byUnit.set(unit, [...(byUnit.get(unit) ?? []), o])
  }
  const taken = new Set<Outcome>()
  return {
    at(law, designation) {
      const unit = annexUnitId(designation)
      if (!unit) return null
      const found = byKey.get(explanationKey(law, unit)) ??
        (law !== null ? byKey.get(explanationKey(null, unit)) : undefined) ??
        (unit.startsWith('anl. ') ? (byKey.get(explanationKey(law, 'anl.')) ?? byKey.get(explanationKey(null, 'anl.'))) : undefined)
      if (found) return { lesefassung: found.lesefassung, outcomes: [found] }
      if (law !== null) return null
      const candidates = (byUnit.get(unit) ?? []).filter((o) => o.law !== null)
      if (candidates.length === 0) return null
      return { lesefassung: candidates.length === 1 ? candidates[0]!.lesefassung : { kind: 'withheld', cause: 'anhang-ungeteilt' }, outcomes: candidates }
    },
    take(outcomes) {
      for (const o of outcomes) taken.add(o)
    },
    untaken: () => all.filter((o) => !taken.has(o)),
  }
}

/**
 * Whether a § block shows a change the draft would have to instruct — the
 * condition for saying `nicht-gefunden` where no outcome stands.
 *
 * Not an editorial difference or an elision that reaches differently far:
 * the annex's notation changing is no change of the law, and no instruction
 * is missing for it. A withheld row counts — its text is gone, its change
 * is not.
 */
export function showsInstructedChange(rows: readonly TextComparisonRow[]): boolean {
  return rows.some((r) => r.kind === 'pair' && r.change !== 'unchanged' && !r.editorial && !r.elisionRange)
}

const CAUSE_TEXT: Record<LesefassungCause, string> = {
  verweigert: 'Eine Anweisung des Entwurfs zu diesem Paragraphen konnten wir nicht sicher anwenden.',
  unplausibel: 'Unser Ergebnis hat die Plausibilitätsprüfung nicht bestanden.',
  'nicht-geladen': 'Der Entwurf ändert mehr Paragraphen, als wir für eine Seite laden.',
  'kein-anhang': 'Ohne lesbare Gegenüberstellung bestätigt niemand unser Ergebnis.',
  'anhang-schweigt': 'Zu diesem Paragraphen fanden wir in der Beilage keine Änderung, an der sich unser Ergebnis prüfen ließe.',
  'anhang-fremd': 'Den geltenden Text, von dem die Beilage hier ausgeht, fanden wir so nicht im RIS.',
  'anhang-widerspricht': 'Unser Ergebnis weicht von der Beilage ab.',
  'gesetz-unbekannt': 'Das geänderte Gesetz fanden wir im RIS nicht eindeutig.',
  'nummer-doppelt': 'Die Nummer steht im geänderten Gesetz mehrmals, in verschiedenen Artikeln.',
  'nicht-im-ris': 'Diesen Paragraphen fanden wir im geltenden Text im RIS nicht.',
  'nicht-lesbar': 'Das RIS führt diesen Paragraphen in einer Form, die wir nicht lesen können, etwa als Tabelle.',
  'zu-lang': 'Der Paragraph ist zu lang für unseren Vergleich.',
  entfaellt: 'Unter dieser Nummer steht nach dem Entwurf kein Paragraph mehr.',
  'anhang-ungeteilt': 'Wo in der Beilage ein Gesetz endet und das nächste beginnt, lesen wir nicht heraus; so ordnen wir den Paragraphen keinem Gesetz sicher zu.',
  'neu-erlassen': 'Dieses Gesetz erlässt der Entwurf neu, und seinen ganzen Text enthält er selbst; wir setzen nur Änderungen bestehender Gesetze zusammen.',
  'nicht-gefunden': 'Eine Anweisung des Entwurfs zu diesem Paragraphen fanden wir nicht.',
}

/**
 * The line that stands at a § of the annex where the disclosure would — or
 * null where the block needs none: a § the draft repeals or moves away
 * (`entfaellt`) stands in the annex as struck rows, which say it already.
 * `designation` names the § where a block carries more than one.
 */
export function lesefassungLine(lesefassung: Lesefassung, designation: string | null = null): string | null {
  if (lesefassung.kind !== 'withheld' || lesefassung.cause === 'entfaellt') return null
  const what = designation ? `${designation.replace(/\.$/, '')} ` : 'Paragraph '
  return `Ganzer ${what}danach nicht gezeigt: ${CAUSE_TEXT[lesefassung.cause]}`
}

const NOT_RUN_TEXT: Record<ConsolidatedNotRun, string> = {
  zuordnung: 'Den Eintrag im RIS ordnen wir diesem Entwurf nicht sicher zu.',
  stichtag: 'Das RIS nennt keinen Beginn der Begutachtung, und ohne ihn wissen wir nicht, welche Fassung der Gesetze der Entwurf ändert.',
  'kein-xml': 'Den Entwurf gibt es im RIS nicht in der maschinenlesbaren Fassung, aus der allein wir seine Änderungsanweisungen lesen.',
  'keine-novelle': 'So wie wir den Entwurf lesen, ändert er kein bestehendes Gesetz.',
}

/** Said once, at the foot of the section, where the run did not happen — null where it did. */
export function lesefassungNotRunText(response: ConsolidatedTextResponse | null): string | null {
  return response?.notRun ? `Ganze Paragraphen danach zeigen wir hier nicht: ${NOT_RUN_TEXT[response.notRun]}` : null
}

/**
 * „§ 12", „§§ 12 und 14", „§§ 12, 14 und 30", schedules as RIS names them
 * („Anl. 1") — the units an end-of-law list names, in the server's order.
 */
export function unitList(ids: readonly string[]): string {
  const paras = ids.filter((id) => !/^Anl\.?/i.test(id))
  const schedules = ids.filter((id) => /^Anl\.?/i.test(id))
  const and = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`)
  const parts: string[] = []
  if (paras.length === 1) parts.push(`§ ${paras[0]}`)
  else if (paras.length > 1) parts.push(`§§ ${and(ranges(paras))}`)
  if (schedules.length) parts.push(and(schedules))
  return parts.join(' sowie ')
}

/**
 * Three or more consecutive plain numbers as a range, as law cites them:
 * „1 bis 15" for the fifteen §§ of a new law. A number with a letter („6c")
 * breaks a run — it says nothing about what stands between.
 */
function ranges(ids: readonly string[]): string[] {
  const out: string[] = []
  let run: number[] = []
  const flush = (): void => {
    if (run.length >= 3) out.push(`${run[0]} bis ${run[run.length - 1]}`)
    else out.push(...run.map(String))
    run = []
  }
  for (const id of ids) {
    const n = /^\d+$/.test(id) ? Number(id) : null
    if (n !== null && run.length && n === run[run.length - 1]! + 1) run.push(n)
    else {
      flush()
      if (n !== null) run.push(n)
      else out.push(id)
    }
  }
  flush()
  return out
}

/**
 * The sentence over the §§ of one law that no block of the annex took —
 * inside the law's group, or under the law's name where the annex has no
 * group for it. „fanden wir" and not „enthält nicht": the block may be there
 * under a designation we read differently, and then the gap is ours.
 */
export function unplacedText(ids: readonly string[]): string {
  return `Der Entwurf ändert hier auch ${unitList(ids)}; in der Beilage fanden wir ${ids.length === 1 ? 'dazu' : 'zu ihnen'} keine Gegenüberstellung.`
}

/**
 * Whether the Lesefassung's reason is what the annex's own notice at the same
 * § already says — the oracle found the annex's geltende Fassung not in RIS
 * (`anhang-fremd`), and so did the annex check (`standing`). Then the notice
 * carries one more sentence instead of a second line repeating its finding.
 */
export function mergesIntoNotice(lesefassung: Lesefassung | null, annexCause: AnnexWithheldCause | null): boolean {
  return lesefassung?.kind === 'withheld' && lesefassung.cause === 'anhang-fremd' && (annexCause ?? 'standing') === 'standing'
}

/** The sentence the annex notice then ends with. */
export const NOTICE_LESEFASSUNG_TOO = 'Den ganzen Paragraphen danach zeigen wir deshalb auch nicht.'
