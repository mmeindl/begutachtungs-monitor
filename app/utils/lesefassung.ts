/**
 * What the page says about our Lesefassung at a § of the
 * Textgegenüberstellung, and where it shows none (26.10.2026).
 *
 * The server accounts for every § the draft amends: shown, or withheld with
 * its cause (`server/utils/kons/consolidate.ts`). Until 26.10.2026 the page
 * heard only of the shown ones, and a § without „Ganzer Paragraph in der vorgeschlagenen
 * Fassung"
 * could mean eight different things, none of them said. The outcomes are
 * placed at the § blocks by `placeAtParagraphs` (`annexGroups.ts`), the same
 * pass that places the Begründung, under the designation a § carries after
 * the draft; what no block takes is listed at the end of its law — a § that
 * vanishes without a word is exactly what this module exists against.
 *
 * Pure, so the rules are pinned by a test (tests/lesefassung.test.ts). The
 * sentences are here too: they are about what WE could not do, and each one
 * names that — never the ministry.
 */
import { gapDe, type GapKind } from '#shared/utils/gaps'
import { formatDateDe } from '#shared/utils/format'
import type { AnnexWithheldCause, ConsolidatedLaterAmendment, ConsolidatedNotRun, ConsolidatedParagraph, ConsolidatedTextResponse, ParagraphExplanationView, TextComparisonRow } from '#shared/types'
import type { Lesefassung, LesefassungCause } from '#shared/utils/annexOutcomes'
import { UNIT_WORD_DE, type UnitKind, type UnitWordDe } from '#shared/utils/unitWord'

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
  /** What the law's units are, where they are not Paragraphen (`unitWord.ts`); absent for a law of §§. */
  unit?: UnitKind
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

/**
 * The sentences take the unit's word (`unitWord.ts`): `u` is the unit the
 * sentence stands at, `all` the plural over the whole draft, for the one
 * sentence that counts across its laws.
 */
const CAUSE_TEXT: Record<LesefassungCause, (u: UnitWordDe, all: string) => string> = {
  verweigert: (u) => `Eine Anweisung des Entwurfs zu diesem ${u.oblique} konnten wir nicht sicher anwenden.`,
  unplausibel: () => 'Unser Ergebnis hat die Plausibilitätsprüfung nicht bestanden.',
  'nicht-geladen': (_, all) => `Der Entwurf ändert mehr ${all}, als wir für eine Seite laden.`,
  'kein-anhang': () => 'Ohne lesbare Gegenüberstellung bestätigt niemand unser Ergebnis.',
  'anhang-schweigt': (u) => `Zu diesem ${u.oblique} fanden wir in der Beilage keine Änderung, an der sich unser Ergebnis prüfen ließe.`,
  // 20.11.2026: „fanden wir so nicht im RIS" read as the ministry's fault. All 232 such §§ were held
  // against every RIS Fassung: in 152 the monitor misread the annex or the RIS text, or looked up a
  // Fassung promulgated later. The sentence says what is known — the two could not be matched.
  'anhang-fremd': () => 'Den geltenden Text, von dem die Beilage hier ausgeht, konnten wir nicht mit dem RIS abgleichen.',
  // 20.11.2026: „weicht von der Beilage ab" put the deviation on our result. In a sample of 64, the
  // annex differed from the draft's own wording in 40. Who deviates, the comparison alone does not say.
  'anhang-widerspricht': () => 'Unser Ergebnis und die Beilage stimmen hier nicht überein.',
  'gesetz-unbekannt': () => 'Das geänderte Gesetz fanden wir im RIS nicht eindeutig.',
  'nummer-doppelt': () => 'Die Nummer steht im geänderten Gesetz mehrmals, in verschiedenen Artikeln.',
  'nicht-im-ris': (u) => `Diesen ${u.oblique} fanden wir im geltenden Text im RIS nicht.`,
  'nicht-lesbar': (u) => `Das RIS führt diesen ${u.oblique} in einer Form, die wir nicht lesen können, etwa als Tabelle.`,
  'zu-lang': (u) => `Der ${u.nominative} ist zu lang für unseren Vergleich.`,
  entfaellt: (u) => `Unter dieser Nummer steht nach dem Entwurf kein ${u.nominative} mehr.`,
  'anhang-ungeteilt': (u) => `Wo in der Beilage ein Gesetz endet und das nächste beginnt, lesen wir nicht heraus; so ordnen wir den ${u.oblique} keinem Gesetz sicher zu.`,
  'neu-erlassen': () => 'Dieses Gesetz erlässt der Entwurf neu, und seinen ganzen Text enthält er selbst; wir setzen nur Änderungen bestehender Gesetze zusammen.',
  'nicht-gefunden': (u) => `Eine Anweisung des Entwurfs zu diesem ${u.oblique} fanden wir nicht.`,
}

/**
 * The reason as it stands at the unit, alone. Without a unit it speaks of
 * the Paragraph — for `/genauigkeit` and `/datenlage`, which list every
 * reason with its count over all drafts. `all`: the units of the whole
 * draft in the plural (`unitsPluralDe`), the unit's own where not given.
 */
export function lesefassungCauseText(cause: LesefassungCause, unit: UnitKind = 'paragraph', all: string = UNIT_WORD_DE[unit].plural): string {
  return CAUSE_TEXT[cause](UNIT_WORD_DE[unit], all)
}

/**
 * The line that stands at a § of the annex where the disclosure would — or
 * null where the block needs none: a § the draft repeals or moves away
 * (`entfaellt`) stands in the annex as struck rows, which say it already.
 * `designation` names the § where a block carries more than one; `unit` is
 * what the block's law counts in, `all` as for `lesefassungCauseText`.
 */
export function lesefassungLine(lesefassung: Lesefassung, designation: string | null = null, unit: UnitKind = 'paragraph', all?: string): string | null {
  if (lesefassung.kind !== 'withheld' || lesefassung.cause === 'entfaellt') return null
  const what = designation ? `${designation.replace(/\.$/, '')} ` : `${UNIT_WORD_DE[unit].nominative} `
  return `Ganzer ${what}in der vorgeschlagenen Fassung nicht gezeigt: ${lesefassungCauseText(lesefassung.cause, unit, all)}`
}

/** The fold over a unit our Lesefassung shows: „Ganzer Paragraph in der vorgeschlagenen Fassung (nicht amtlich)". */
export function lesefassungSummary(unit: UnitKind = 'paragraph'): string {
  return `Ganzer ${UNIT_WORD_DE[unit].nominative} in der vorgeschlagenen Fassung (nicht amtlich)`
}

/** Why the run did not happen, and whose gap that is (`shared/utils/gaps.ts`). */
const NOT_RUN: Record<ConsolidatedNotRun, { kind: GapKind; text: string }> = {
  zuordnung: { kind: 'unreadable', text: 'Den Eintrag im RIS ordnet der Monitor diesem Entwurf nicht sicher zu.' },
  stichtag: { kind: 'notPublished', text: 'Das RIS nennt keinen Beginn der Begutachtung, und ohne ihn ist nicht klar, welche Fassung der Gesetze der Entwurf ändert.' },
  'kein-xml': { kind: 'unreadable', text: 'Den Entwurf gibt es im RIS nicht in der maschinenlesbaren Fassung, aus der allein der Monitor seine Änderungsanweisungen liest.' },
  'keine-novelle': { kind: 'outOfScope', text: 'So wie der Monitor den Entwurf liest, ändert er kein bestehendes Gesetz; ganze Paragraphen setzt er nur für Änderungen zusammen.' },
}

/** What the two sentences about the whole layer are about, after the lead word. */
const lesefassungWhole = (all: string): string => `die ganzen ${all} in der vorgeschlagenen Fassung.`

/**
 * Said once, at the foot of the section, where the run did not happen — null
 * where it did. `all`: what the draft's laws count in (`unitsPluralDe`).
 */
export function lesefassungNotRunText(response: ConsolidatedTextResponse | null, all: string = UNIT_WORD_DE.paragraph.plural): string | null {
  if (!response?.notRun) return null
  const { kind, text } = NOT_RUN[response.notRun]
  return gapDe(kind, `${lesefassungWhole(all)} ${text}`)
}

/** The same layer where its request failed. */
export function lesefassungUnreachableText(all: string = UNIT_WORD_DE.paragraph.plural): string {
  return gapDe('unavailable', lesefassungWhole(all))
}

/**
 * „§ 12", „§§ 12 und 14", „§§ 12, 14 und 30", schedules as RIS names them
 * („Anl. 1") — the units an end-of-law list names, in the server's order.
 * „Art. 94", „Art. 94 und 94a" in a law whose units are Artikel (`unit`).
 */
export function unitList(ids: readonly string[], unit: UnitKind = 'paragraph'): string {
  const { sign, signs } = UNIT_WORD_DE[unit]
  const paras = ids.filter((id) => !/^Anl\.?/i.test(id))
  const schedules = ids.filter((id) => /^Anl\.?/i.test(id))
  const and = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`)
  const parts: string[] = []
  if (paras.length === 1) parts.push(`${sign} ${paras[0]}`)
  else if (paras.length > 1) parts.push(`${signs} ${and(ranges(paras))}`)
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
export function unplacedText(ids: readonly string[], unit: UnitKind = 'paragraph'): string {
  return `Der Entwurf ändert hier auch ${unitList(ids, unit)}; in der Beilage fanden wir ${ids.length === 1 ? 'dazu' : 'zu ihnen'} keine Gegenüberstellung.`
}

/**
 * Under the name of a law the annex has no group for (`AnnexLawEnd`). Hedged
 * as `unplacedText` is (21.11.2026): until then it said the annex „enthält
 * … keinen Teil", and where two groups of the annex stay unclaimed
 * (`annexGroups.ts`) the law's §§ may well stand in one of them.
 */
export const NO_PART_IN_ANNEX_DE = 'In der Gegenüberstellung des Ministeriums fand der Monitor zu diesem Gesetz keinen Teil.'

/**
 * Under a law's name where the annex's units could not be told apart by law
 * (`boundaryNote`): the law may well be in it. `explained`: the ministry's
 * reasoning on it stands below, and the second sentence says why here.
 */
export function undividedText(explained: boolean, unit: UnitKind = 'paragraph'): string {
  const u = UNIT_WORD_DE[unit]
  return `Die ${u.plural} der Gegenüberstellung ließen sich keinem einzelnen Gesetz zuordnen.${explained ? ` Was das Ministerium zu diesem Gesetz schreibt, steht deshalb hier und nicht am ${u.oblique}.` : ''}`
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
export function noticeLesefassungToo(unit: UnitKind = 'paragraph'): string {
  return `Den ganzen ${UNIT_WORD_DE[unit].oblique} in der vorgeschlagenen Fassung zeigen wir deshalb auch nicht.`
}

/**
 * The sentence at a § whose standing text is not what RIS returns today for
 * the first day of the Begutachtung: RIS files for that day a version that a
 * Bundesgesetzblatt issued later brought, and the composition starts from the
 * text that stood then (`standingOnDay`, 20.11.2026). Not a gap sentence —
 * nothing is missing; it says which text the § starts from, beside the link
 * to RIS, which shows the later one.
 *
 * It reports RIS's record, not a retroactive change in law: RIS dates some
 * such versions back to the law's first day (the Pensionskassenvorsorgegesetz
 * of BGBl. I Nr. 88/2026, „BBG" become „BBezG", from 01.08.1997) or files an
 * Inkrafttretens-§ from its earliest date, and what took effect when only the
 * BGBl itself says. On a shown § it adds that the later text is not in it;
 * on a withheld one it stands beside the reason. `designation` names the §
 * where a block carries more than one.
 */
export function laterAmendmentText(note: ConsolidatedLaterAmendment, shown: boolean, designation: string | null = null, unit: UnitKind = 'paragraph'): string {
  const what = designation ? designation.replace(/\.$/, '') : `diesen ${UNIT_WORD_DE[unit].oblique}`
  const issued = note.issued ? ` vom ${formatDateDe(note.issued)}` : ''
  return `Ausgangstext ist die Fassung vom Beginn der Begutachtung (${formatDateDe(note.asOf)}). Für diesen Tag führt das RIS ${what} heute in einer Fassung, die erst das ${note.cite}${issued} gebracht hat${shown ? '; sie ist hier nicht eingearbeitet' : ''}.`
}

/** The same sentence for a withheld § at its block, or null where none is owed. */
export function laterAmendmentLine(lesefassung: Lesefassung, designation: string | null = null, unit: UnitKind = 'paragraph'): string | null {
  return lesefassung.kind === 'withheld' && lesefassung.laterAmendment ? laterAmendmentText(lesefassung.laterAmendment, false, designation, unit) : null
}

const COUNT_DE = ['', 'einer', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf']

/** What the page says at a § shown on the draft's own Gesetzestext: a sentence, the places, and what is shown. */
export interface WitnessNote {
  lead: string
  /** Both wordings at each place, a few words around the difference. */
  places: { annex: string; draft: string }[]
  close: string
}

/**
 * The note at a § shown on the draft's own Gesetzestext where the annex did
 * not confirm it (`draftWitness`, `server/utils/kons/draftWitness.ts`,
 * 20.11.2026) — null at every other §. Per case, with both wordings at each
 * place: never a claim about ministries. „wie wir sie lesen": the annex's
 * wording is our reading of the annex, and where it is a PDF our reader can
 * be the one that differs (a struck word read with the new one, 76/ME XXVIII
 * IFG § 100).
 *
 * The places are a list, not a clause each in one sentence: with four places
 * the sentence was a block of small grey text in which no reader found the
 * second wording that belongs to the first.
 */
export function witnessNote(paragraph: ConsolidatedParagraph): WitnessNote | null {
  const places = paragraph.draftWitness ?? []
  if (places.length === 0) return null
  const where = places.length === 1 ? 'Hier' : `An ${COUNT_DE[places.length] ?? places.length} Stellen`
  return {
    lead: `${where} stimmt die Textgegenüberstellung, wie wir sie lesen, nicht mit dem Gesetzestext des Entwurfs überein:`,
    places,
    close: 'Gezeigt ist der Gesetzestext; so steht er auch in der PDF-Fassung des Entwurfs im RIS.',
  }
}
