/**
 * /genauigkeit (19.11.2026): how each of the monitor's comparisons is
 * checked, how often the check holds, and what it does not catch — the
 * figures of `shared/data/genauigkeit.json` in words. The page only lays
 * these out.
 *
 * WHY A PAGE OF ITS OWN. The promise „only what is verified, and say what
 * cannot be shown" stood in the method notes at each comparison, one claim
 * per section, and the measurements that back it stood in
 * `docs/decisions.md`, where no reader goes. A reader who wants to know how
 * far to trust a red-and-green comparison needs both in one place: what it
 * is held against, how often it is right, and — the part a comparable site
 * never publishes — which faults pass the check. `/datenlage` says what a
 * source publishes; this page says what the monitor makes of it.
 *
 * THE FIGURES ARE NEVER TYPED HERE. `scripts/harness/genauigkeit.ts` writes
 * them from a measurement round; every sentence below takes its numbers from
 * the record and says „keiner" where a count is 0. Shares are rounded DOWN to
 * a tenth, so the page never claims more than was measured.
 *
 * THE FAULT CLASSES are the harnesses' keys. Each one this page knows stands
 * in exactly one group below, and `tests/genauigkeit.test.ts` fails on a key
 * the record carries and no group names: a new class needs a decision about
 * which sentence it belongs to, not a silent place in a range.
 */
import data from '../data/genauigkeit.json'
import type { ConsolidatedWithheldCause, GenauigkeitFault, GenauigkeitPaths, GenauigkeitRecord, LandCode, LawDiffSegment } from '../types'
import { formatDateDe, formatNumberDe } from './format'
import { LAND_NAME } from './laender'

export const GENAUIGKEIT: GenauigkeitRecord = data

/**
 * Whether the bench of a record read every Bundesgesetz of the period
 * (24.11.2026, `kons.ts --seit`) or „the 60 newest" before. Such a record
 * carries `noLawJoined`; the sentences on whose laws the rules were
 * developed differ, and switch with the record that is published.
 */
export function benchCoversPeriod(r: GenauigkeitRecord = GENAUIGKEIT): boolean {
  return r.lesefassung.bench.draftPath.noLawJoined !== undefined
}

export const GENAUIGKEIT_PATH = '/genauigkeit'

/*
 * The harnesses are not linked from the page (20.11.2026). A section „Wie
 * gemessen wird" listed them file by file, then one link „Messprogramme"
 * and the commit stood in the stamp; both were for a developer, who finds
 * `scripts/harness/` in the repository the footer links, and each harness
 * says in its head comment what it measures.
 */

/* ------------------------------------------------------------------ */
/* One § on its way                                                     */
/* ------------------------------------------------------------------ */

/**
 * The steps a Lesefassung goes through, each with who supplies it. The
 * Lesefassung and not the annex, because it is the one the monitor makes
 * itself from three parts, and every other comparison is a part of it: the
 * annex is step 4, a station comparison is step 3 without step 4.
 *
 * WHERE AN ERROR CAN COME IN is not a sentence per step any more
 * (19.11.2026): the §§ that end at a step stand there with their count and
 * the reason a reader meets on a draft's page (`wegFunnel`). The page said
 * it three times before — as „Fehlerquelle" here, as a bar chart of the
 * same reasons two sections on, and as „was die Prüfung nicht fängt".
 */
export interface WegSchritt {
  key: 'geltend' | 'anweisung' | 'ergebnis' | 'pruefung'
  title: string
  /** Who supplies it. */
  who: string
}

/**
 * ONE LINE PER STEP, THE EXAMPLE SAYS THE REST (24.11.2026). Until then each
 * step had a sentence of its own under its title, and the rule of the check
 * stood there in full; the page ran to some 8,800 px and a reader had to
 * read all of it to find the figures. The example shows what a sentence
 * said, and the rule in full is under „Im Einzelnen".
 */
export const GENAUIGKEIT_WEG: readonly WegSchritt[] = [
  { key: 'geltend', title: 'Der geltende Text', who: 'aus dem RIS' },
  { key: 'anweisung', title: 'Die Anweisung des Entwurfs', who: 'vom Ministerium' },
  { key: 'ergebnis', title: 'Unser Ergebnis', who: 'vom Monitor' },
  { key: 'pruefung', title: 'Die Prüfung', who: 'an der Textgegenüberstellung' },
]

/**
 * The § the steps follow: a real one, as the page shows it. Draft 116/ME
 * XXVIII, Z 2 of the article that amends the Arbeitsmarktpolitik-
 * Finanzierungsgesetz; its annex row was confirmed (`check: verified`) and
 * the Lesefassung shown on 19.11.2026, and the law as enacted (BGBl. I
 * Nr. 62/2026) reads word for word as our result. Short, one figure, no
 * political charge — the mechanism is the point, not the law. All of it is
 * RIS text (the draft's record BEGUT_04AE704E…), credited under the steps.
 */
export const WEG_BEISPIEL = {
  draft: { citation: '116/ME', title: 'Budgetbegleitgesetz 2027-2028', href: '/entwuerfe/XXVIII/116' },
  law: 'Arbeitsmarktpolitik-Finanzierungsgesetz',
  para: '§ 6a',
  heading: 'Überweisungsbetrag an den Sozial- und Weiterbildungsfonds',
  standing:
    'Der Bund hat dem Sozial- und Weiterbildungsfonds gemäß § 22a des Arbeitskräfteüberlassungsgesetzes (AÜG) ab dem Jahr 2027 jährlich eineinhalb Mio. € für Zwecke der Weiterbildung der (ehemaligen) überlassenen Arbeitnehmer/innen zu überweisen.',
  instruction: 'In § 6a wird die Jahreszahl "2027" durch die Jahreszahl "2029" ersetzt.',
  result: [
    { type: 'equal', text: '… ab dem Jahr' },
    { type: 'removed', text: '2027' },
    { type: 'inserted', text: '2029' },
    { type: 'equal', text: 'jährlich eineinhalb Mio. € …' },
  ] as LawDiffSegment[],
  annex: { left: '… ab dem Jahr 2027 jährlich …', right: '… ab dem Jahr 2029 jährlich …' },
} as const

/* ------------------------------------------------------------------ */
/* Numbers in words                                                     */
/* ------------------------------------------------------------------ */

const n = formatNumberDe

/**
 * A share in percent, rounded down to a tenth: „99,8", „100", „0". Never
 * up — 1,391 of 1,393 is 99.86 %, and „99,9" would claim a catch that was
 * not measured.
 */
export function shareDe(caught: number, tried: number): string {
  const tenths = Math.floor((1000 * caught) / tried)
  if (tenths === 1000) return '100'
  if (tenths === 0) return '0'
  return (tenths / 10).toFixed(1).replace('.', ',')
}

/**
 * A part of a whole in percent, to the nearest tenth: „63,2". Not `shareDe`,
 * which rounds a catch rate down: the parts of one whole would no longer add
 * up, and the same share stood on the page as 63,1 in a sentence and 63,2 at
 * its bar (23.11.2026). One function for both.
 */
export function partDe(count: number, whole: number): string {
  return ((100 * count) / whole).toFixed(1).replace('.', ',')
}

/**
 * The parts of one whole in whole units of `unit` (100 squares, 1,000 tenths
 * of a percent) that add up to exactly `unit`: each part rounded down, the
 * units left over to the parts with the largest remainder (24.11.2026).
 * Rounded one by one, the squares of a „von 100" figure came to 99 or 101,
 * and the steps of a funnel did not subtract to the figure at its end.
 */
export function largestRemainder(counts: readonly number[], unit: number): number[] {
  const whole = counts.reduce((a, b) => a + b, 0)
  if (whole === 0) return counts.map(() => 0)
  const exact = counts.map((c) => (unit * c) / whole)
  const out = exact.map(Math.floor)
  const order = exact.map((e, i) => ({ i, rest: e - Math.floor(e) })).sort((a, b) => b.rest - a.rest || a.i - b.i)
  const missing = unit - out.reduce((a, b) => a + b, 0)
  for (let k = 0; k < missing; k++) out[order[k]!.i]! += 1
  return out
}

/** Tenths of a percent as printed: 632 → „63,2", 1000 → „100". */
export function tenthsDe(tenths: number): string {
  return tenths === 1000 ? '100' : (tenths / 10).toFixed(1).replace('.', ',')
}

/** „99,0 bis 100 %", „100 %": the lowest and the highest share over the classes given, on both annex paths; the sign never wraps from its figure. */
export function rangeDe(faults: readonly GenauigkeitFault[]): string {
  const tried = faults.filter((f) => f.tried > 0)
  if (!tried.length) throw new Error('rangeDe: no class was tried')
  const shares = tried.map((f) => f.caught / f.tried)
  const low = tried[shares.indexOf(Math.min(...shares))]!
  const high = tried[shares.indexOf(Math.max(...shares))]!
  const a = shareDe(low.caught, low.tried)
  const b = shareDe(high.caught, high.tried)
  return a === b ? `${a}\u00a0%` : `${a} bis ${b}\u00a0%`
}

/** The classes of both paths with these keys. */
function classes<F extends GenauigkeitFault>(paths: GenauigkeitPaths<F[]>, keys: readonly string[]): F[] {
  return [...paths.pdf, ...paths.table].filter((f) => keys.includes(f.key))
}

/** Tried and caught, added up over the classes given. */
function total(faults: readonly GenauigkeitFault[]): { tried: number; caught: number } {
  return faults.reduce((t, f) => ({ tried: t.tried + f.tried, caught: t.caught + f.caught }), { tried: 0, caught: 0 })
}

/** „keiner von 1.365 Versuchen gefangen", „21,4 bis 100 % gefangen, bei 30 Versuchen": a blind spot as what it caught. */
function caughtOf(faults: readonly GenauigkeitFault[]): string {
  const t = total(faults)
  return t.caught === 0 ? `keiner von ${n(t.tried)} Versuchen gefangen` : `${rangeDe(faults)} gefangen, bei ${n(t.tried)} Versuchen`
}

/** „Bei 1 von 431", „Bei keinem": a count of §§ as the subject's dative. */
function ofParagraphs(count: number): string {
  return count === 0 ? 'keinem' : count === 1 ? 'einem' : n(count)
}

/* ------------------------------------------------------------------ */
/* The fault classes                                                    */
/* ------------------------------------------------------------------ */

/**
 * The Lesefassung's result, one word or figure wrong (`faultInjection.ts`,
 * „Wortfehler im Ergebnis"); since 21.11.2026 also the label of a Ziffer or
 * a Litera, and a comma lost where a changed row of the annex prints the place.
 */
export const RESULT_WORDS = ['Wort-weg', 'Wort-weg-Sinn', 'Wort-neu', 'Wort-tausch', 'Zahl', 'Datum', 'Verweis', 'Ziffer-Reihe', 'Überschrift', 'Ungedruckt-weg', 'Ungedruckt-neu', 'Ungedruckt-Zahl', 'Bezeichnung', 'Komma'] as const
/** …its structure wrong: a unit too many, two Absätze swapped, a unit missing, a struck Absatz back. */
export const RESULT_STRUCTURE = ['E', 'E-neben', 'Reihe', 'Fehlt', 'Lücke', 'Zurück', 'Zurück-gleich'] as const
/** …a unit missing that RIS lacks too and the annex skips in silence: a blind spot by construction. */
export const RESULT_BLIND = ['Lücke-beide'] as const
/**
 * …a comma lost where the annex prints nothing that changes (an Absatz it
 * elides, leaves out or prints unchanged): there the check compares the
 * words without their punctuation, so it is blind by construction too
 * (`faultInjection.ts`, „Ungedruckt-Komma", 21.11.2026). A bar of its own:
 * among the words' classes it would only lower their share, and no reader
 * would learn where a comma is not held.
 */
export const RESULT_BLIND_COMMA = ['Ungedruckt-Komma'] as const
/**
 * A word dropped where the word classes above do not go (`faultInjection.ts`,
 * 23.11.2026): at the edge of a printed stretch, or in a wording the § holds
 * twice. About a fifth of a result's words stand there, and the bar of the
 * word classes says nothing about them.
 */
export const RESULT_BLIND_EDGE = ['Rand-weg', 'Mehrfach-weg'] as const
/** …a § shown on the draft's own text (`draftWitness`): its new text misread by our reader — a word lost, a figure, two words swapped, cut at a line's end (20.11.2026). */
export const RESULT_WITNESS = ['Payload'] as const

/**
 * …and the gate's other classes: a sentence of another § in the right
 * column, a sentence of the left column lost, and the faults the gate was
 * never built to see (a figure, a label, a word, a sentence of the new text
 * gone, a kept sentence struck). A round records what the gate alone made of
 * them, and no sentence reads it: what the page does with a § is the mark's,
 * drawn from `chain` (22.11.2026). Listed so that a class the gate's record
 * gains needs a decision.
 */
export const ANNEX_GATE_ALONE = ['L', 'R-alt', 'R-neu', 'U', 'U-Zeile', 'Zahl', 'Spalte-Bezeichnung', 'Wort', 'Satz-weg', 'R-weg'] as const

/**
 * The same annex, a fault judged through everything the page does with a §
 * (`faultInjection.ts`, `chain`; 22.11.2026): the gate, the word-for-word
 * check against the draft, our own result, and the mark they set. The new
 * text misread — a figure, a word, its last sentence gone;
 */
export const CHAIN_WORDING = ['zahl', 'wort', 'satzweg'] as const
/** …the label of an Absatz, a Ziffer or a Litera moved by one; */
export const CHAIN_LABEL = ['bezeichnung'] as const
/** …a sentence the draft keeps lost from the right column, so the page shows it struck; */
export const CHAIN_STRUCK = ['rweg'] as const
/** …the gate's fault L, a sentence of the left column lost; */
export const CHAIN_LOST = ['links'] as const
/** …and its faults R-alt and R-neu, a sentence of another § in the right column. */
export const CHAIN_MISFILED = ['ralt', 'rneu'] as const
/** …another §'s sentence as a row of its own, alike in both columns: held against RIS since 23.11.2026 (`unchangedRowsNotStanding`). */
export const CHAIN_MIRRORED = ['u'] as const
/** …the same sentence inside a changed row: short against a long row, it stays above the left check's 95 %. */
export const CHAIN_IN_ROW = ['uzeile'] as const

/** A Land's right column: a sentence of another § of the same draft, of another Land's draft. */
export const LAND_OWN_DRAFT = ['R-neu'] as const
export const LAND_OTHER_DRAFT = ['R-fremd'] as const
/**
 * …a figure, a word or a sentence changed. Until 20.11.2026 below the
 * guard's reach by design (0 of 1,365); since the right column is held word
 * for word against the wording the draft quotes (`landTguStrict.ts`) they
 * are caught wherever the draft quotes it, and the blind spot is the §§
 * where it does not — a count, not a fault class.
 */
export const LAND_WORDING = ['Zahl', 'Wort', 'Satz weg'] as const

/**
 * What was READ by hand (23.11.2026), so a sentence may say what the cases
 * are. A round that brings another case fails `tests/genauigkeit.test.ts`
 * until someone has read it and this list and the sentence say so.
 *
 * The comparable §§ of the draft path that are not the law: in Tabak- und
 * Nichtraucherschutzgesetz § 11 the law changes Abs. 5, which the draft's
 * annex prints as unchanged; in Finanzstrafgesetz § 99 the law closes a
 * hyphen („Konten-einschaugesetz") no instruction names; in Bundesvergabegesetz
 * Konzessionen 2018 § 108 RIS sets „ - " for the „ — " it had before, around
 * words no instruction touches (24.11.2026).
 */
export const DRAFT_PATH_DIFFERS_READ: readonly string[] = ['58/ME § 108', '71/ME § 11', '97/ME § 99']
/**
 * The shown §§ of the bench that are not the law for none of the named
 * reasons, read by hand (24.11.2026): one, Bundesvergabegesetz Konzessionen
 * 2018 § 108 of BGBl. I Nr. 8/2026 (also 58/ME § 108 above). RIS's text after
 * the law sets „ - " where its text before had „ — ", around words no
 * instruction touches; ours keeps the dash. A round with another count says
 * „aus einem anderen Grund" until the case is read.
 */
export const BENCH_OTHERWISE_READ = 1
/**
 * The null comparisons' residues other than an open BGBl number (24.11.2026):
 * three filler dots of the HTML (47/ME, 116/ME in both tests) and a quoted
 * title our XML reader drops (2/ME). None is a different wording in the
 * sources. The five lone full stops after a § designation of 23.11. were a
 * split designation the HTML reader now reads whole, and the Anlage heading
 * of 75/ME a layout template the XML reader now reads.
 */
export const NULL_RESIDUES_READ = 4

/* ------------------------------------------------------------------ */
/* The kinds of comparison                                              */
/* ------------------------------------------------------------------ */

/**
 * One group of injected faults as a bar: how many of the tries the check
 * caught, added up over the group's classes and both annex paths.
 */
export interface FaultBar {
  label: string
  tried: number
  caught: number
  /**
   * Of `caught`, the faults after which the § is not shown any more; the
   * rest are shown with a mark. Only where the check has both answers (the
   * ministry's annex since 22.11.2026): everywhere else caught is withheld.
   */
  withheld?: number
  /** A blind spot by construction: the page sets it apart under „Was die Prüfung nicht fängt". */
  blind?: boolean
  /** Caught means shown as a change (`station.ts --mutationen`), not withheld or marked: the note says so. */
  shownAsChange?: boolean
  /** The share of the weakest class in the bar, where it is lower than the bar's: a sum must not hide it (23.11.2026). */
  weakest?: string
  /** The same as a fraction, so `fehlerBild` sorts the bar by it and not by the sum. */
  weakestShare?: number
  /**
   * What the gap means for a reader, in one sentence under the bar, where the
   * bar is not caught almost always (`fehlerBild`). A bar that falls below
   * the line in a new round and has none fails `tests/genauigkeit.test.ts`:
   * a short bar without its why is the fault of 20.11.2026 again.
   */
  why?: string
}

/**
 * A check that catches at least this share of a kind of fault, in its
 * weakest class too, catches it „fast immer" (24.11.2026). Those bars stand
 * as one, with the range of their shares; every other bar stands alone with
 * its why. Until then every bar stood alone, six of seven at 98 to 100 %,
 * and the two a reader has to know about were the seventh.
 */
export const FAST_IMMER = 0.95

/**
 * A short bar measured on fewer tries than this says so under it (24.11.2026):
 * with the counts folded away, 21,4 % of 14 tries read like 21,4 % of
 * thousands. The counts of every bar stand under „Im Einzelnen".
 */
export const FEW_TRIES = 100

/** „Gemessen an nur 14 Versuchen; der Anteil ist ungenau.", or null where the bar rests on enough. */
export function fewTriesDe(f: FaultBar): string | null {
  return f.tried < FEW_TRIES ? `Gemessen an nur ${n(f.tried)} Versuchen; der Anteil ist ungenau.` : null
}

/** The bars a reader can rely on, as one line, and the others one by one. */
export interface FehlerBild {
  strong: FaultBar[]
  /** „96,3 bis 99,9 %": from the weakest class of the strong bars to the best bar. Null where there are none. */
  strongRange: string | null
  /** „Fast immer gefangen", „Jeder gefangen", and the same for a comparison whose catch is a change shown. */
  strongLabel: string
  weak: FaultBar[]
  /** „Nicht immer gefangen", or for a comparison whose catch is a change shown, „Nicht immer als Änderung gezeigt". */
  weakLabel: string
}

/**
 * A short bar's figure with its verb: „0,2 % gefangen", „93,3 % als Änderung
 * gezeigt" (24.11.2026). Bare, „Ein Komma fehlt … 0,2 %" read to both readers
 * as „commas almost never go missing" — the opposite of the measurement.
 */
export function weakFigureDe(f: FaultBar): string {
  return `${shareDe(f.caught, f.tried)}\u00a0% ${f.shownAsChange ? 'als Änderung gezeigt' : 'gefangen'}`
}

/** The lowest share a bar stands for: its weakest class where it names one. */
function lowestShare(f: FaultBar): number {
  return Math.min(f.caught / f.tried, f.weakestShare ?? 1)
}

export function fehlerBild(faults: readonly FaultBar[]): FehlerBild {
  const strong = faults.filter((f) => !f.blind && lowestShare(f) >= FAST_IMMER)
  const weak = faults.filter((f) => !strong.includes(f))
  let strongRange: string | null = null
  let all = false
  if (strong.length) {
    const low = Math.min(...strong.map(lowestShare))
    const high = Math.max(...strong.map((f) => f.caught / f.tried))
    // A share as a fraction of 1, rounded down as every catch is.
    const a = shareDe(low, 1)
    const b = shareDe(high, 1)
    strongRange = a === b ? `${a}\u00a0%` : `${a} bis ${b}\u00a0%`
    all = strong.every((f) => f.caught === f.tried)
  }
  const change = faults.some((f) => f.shownAsChange)
  const strongLabel = change ? (all ? 'Jede als Änderung gezeigt' : 'Fast immer als Änderung gezeigt') : all ? 'Jeder gefangen' : 'Fast immer gefangen'
  return { strong, strongRange, strongLabel, weak, weakLabel: change ? 'Nicht immer als Änderung gezeigt' : 'Nicht immer gefangen' }
}

/**
 * One kind of comparison. What a reader sees at once is short — what it is
 * held against, one figure (`split` or `facts`), and the injected faults,
 * where a blind spot is a short bar with its why (19.11.2026; until then
 * five rows of running text per kind, with the figures inside the
 * sentences). The result in sentences, the rule, the measurement and what
 * the check misses stand under „Im Einzelnen" (since 24.11.2026 the result
 * too: its figures are the figure's).
 */
export interface GenauigkeitArt {
  /** The anchor a method note links to. */
  id: string
  /**
   * What the comparison is, in the words of someone who has not seen a
   * draft's page (20.11.2026): a first-time reader took „Was ändert der
   * Entwurf?" for a rhetorical question, not for a section's name.
   */
  heading: string
  /** The section's name on a draft's page, where it is not the heading: so a reader coming from there finds it. */
  pageName?: string
  /** What the check holds it against, as a sentence: „Geprüft an …", „Geprüft mit …". */
  against: string
  /** The result in one or two short lines. */
  result: string[]
  /** The injected faults, the blind spot last; empty where nothing can be injected. */
  faults: FaultBar[]
  /** The heading above the bars where they do not count what a check noticed (the station comparison shows a change, 23.11.2026). */
  faultsHeading?: string
  /*
   * What a blind spot means for someone who reads or quotes the comparison
   * stands under its own bar (`FaultBar.why`, 24.11.2026). Until then one
   * sentence per kind said it for all of them, under the last bar; since the
   * strong bars stand as one, each short bar has its own sentence. A first-
   * time reader had taken the 0 % of a Land's comparison for one more bar
   * (20.11.2026): the warning stays at the bar.
   */
  /** What a § of this kind can be, out of 100: the marks a reader meets on a draft's page, as squares. */
  split?: { caption: string; parts: HundertTeil[]; after?: string }
  /** Where nothing can be split into parts: the few figures that say the result, as numbers. */
  facts?: { value: string; label: string }[]
  /** Under „Im Einzelnen": the result in full, the rule, the measurement, and what the check does not catch. */
  rule: string
  measured: string[]
  missed: string[]
}

export const GENAUIGKEIT_ROW_DE = {
  result: 'Ergebnis',
  rule: 'Die Prüfung',
  measured: 'Gemessen',
  missed: 'Was sie übersieht',
  faults: 'Eingebaute Fehler',
} as const

/* ------------------------------------------------------------------ */
/* Out of 100                                                           */
/* ------------------------------------------------------------------ */

/**
 * What a § can be on a draft's page, drawn as a square of 100 (24.11.2026):
 * „73 von 100 ohne Vermerk" is read at once where „4.654 von 6.353" is not,
 * and the four squares say what the marks mean on the way. Each kind of
 * square mirrors the § on the page: ink where nothing stands at it, a grey
 * where a check did not go through, the dotted outline of the „nicht
 * geprüft" pill, the dashed outline of „nicht gezeigt".
 */
export type HundertArt = 'ohne' | 'nichtBestaetigt' | 'nichtGeprueft' | 'nichtGezeigt'

export interface HundertTeil {
  art: HundertArt
  label: string
  /** What it means for the §, in one short sentence. */
  meaning: string
  count: number
  /** Squares of 100; the parts add up to exactly 100 (`largestRemainder`). */
  of100: number
}

function hundertTeile(parts: Omit<HundertTeil, 'of100'>[]): HundertTeil[] {
  const shares = largestRemainder(parts.map((p) => p.count), 100)
  return parts.map((p, i) => ({ ...p, of100: shares[i]! }))
}

/** A group of classes as one bar. */
function bar(label: string, faults: readonly GenauigkeitFault[], opts: { blind?: boolean; why?: string } = {}): FaultBar {
  return { label, ...total(faults), ...(opts.blind ? { blind: true } : {}), ...weakestOf(faults), ...(opts.why ? { why: opts.why } : {}) }
}

/** The weakest class of a bar, of those tried often enough to say anything; nothing where it reads as the bar does. */
function weakestOf(faults: readonly GenauigkeitFault[]): Pick<FaultBar, 'weakest' | 'weakestShare'> {
  const held = faults.filter((f) => f.tried >= 20)
  if (held.length < 2) return {}
  const low = held.reduce((a, b) => (b.caught / b.tried < a.caught / a.tried ? b : a))
  const t = total(faults)
  const share = shareDe(low.caught, low.tried)
  return share === shareDe(t.caught, t.tried) ? {} : { weakest: share, weakestShare: low.caught / low.tried }
}

type ChainFault = GenauigkeitRecord['annex']['chain']['pdf'][number]

/** A group of the chain's classes as one bar, with what catching did with the §. */
function chainBar(label: string, faults: readonly ChainFault[], why?: string): FaultBar {
  return { label, ...total(faults), withheld: faults.reduce((sum, f) => sum + f.withheld, 0), ...weakestOf(faults), ...(why ? { why } : {}) }
}

/**
 * The line under a bar: „1.063 von 1.339 eingebauten Fehlern gefangen", and
 * where a caught fault leaves the § on the page, how many do — „: 880 nicht
 * mehr gezeigt, 183 mit Vermerk gezeigt". Without it „gefangen" reads as „not
 * shown", which a wrong word in the ministry's annex never is (22.11.2026):
 * the § stays, marked „nicht bestätigt".
 */
export function faultNoteDe(fault: FaultBar): string {
  const low = fault.weakest ? ` · schwächster Fall ${fault.weakest}\u00a0%` : ''
  if (fault.shownAsChange) return `${n(fault.caught)} von ${n(fault.tried)} eingebauten Änderungen als Änderung gezeigt${low}`
  const caught = `${n(fault.caught)} von ${n(fault.tried)} eingebauten Fehlern gefangen`
  if (fault.withheld === undefined || fault.caught === 0) return `${caught}${low}`
  const marked = fault.caught - fault.withheld
  if (fault.withheld === 0) return `${caught}: alle mit Vermerk gezeigt${low}`
  if (marked === 0) return `${caught}: alle nicht mehr gezeigt${low}`
  return `${caught}: ${n(fault.withheld)} nicht mehr gezeigt, ${n(marked)} mit Vermerk gezeigt${low}`
}

/** „Oberösterreich, Salzburg, Tirol und Wien". */
export function landList(codes: readonly string[]): string {
  const names = codes.map((c) => LAND_NAME[c as LandCode] ?? c)
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
}

/**
 * The ministry's Textgegenüberstellung.
 *
 * WHAT A READER SEES OF A § IS THE MARK (22.11.2026). Since the word-for-word
 * check and our own result stand on top of the gate (`annex/annexMark.ts`), a
 * § is shown without a mark, with „nicht bestätigt" or with „nicht geprüft",
 * and a fault is caught where the § is then withheld OR marked. A round says
 * both (`marks`, `chain`) and the sentences are built on them: the gate's own
 * verdicts (`confirmed`, `unchecked`) no longer say what stands on the page,
 * and its figures for a fault understate what the page does with it.
 */
function annexArt(r: GenauigkeitRecord): GenauigkeitArt {
  const a = r.annex
  const inRow = classes(a.chain, CHAIN_IN_ROW)
  const inRowTotal = total(inRow)
  const blindSentence = `Ein fremder Satz in einer geänderten Zeile, der in beiden Spalten gleich steht: ${n(inRowTotal.caught)} von ${n(inRowTotal.tried)} Versuchen gefangen. Er ist nicht als Änderung markiert, steht aber beim falschen Paragraphen. Ist er kurz im Verhältnis zur Zeile, bleibt die linke Spalte über der Schwelle von 95 %.`
  // Whose deviation it is was never measured per case (20.11.2026): the sister check found most such §§ to be the monitor's own reading.
  const standingSentence = `Bei ${ofParagraphs(a.withheldStanding)} der nicht gezeigten steht die geltende Fassung der Gegenüberstellung so nicht im RIS. Ob die Beilage abweicht oder der Monitor sie falsch liest, entscheidet die Prüfung nicht; gezeigt wird der Paragraph in beiden Fällen nicht.`
  const frame = {
    id: 'gegenueberstellung',
    heading: 'Die Textgegenüberstellung des Ministeriums',
    pageName: 'Was ändert der Entwurf?',
    against: 'Geprüft am geltenden Recht im RIS, der amtlichen Gesetzesdatenbank, und am Gesetzestext des Entwurfs.',
  }
  const { marks, chain } = a
  return {
    ...frame,
    split: {
      caption: 'Von 100 Paragraphen der Textgegenüberstellungen',
      parts: hundertTeile([
        { art: 'ohne', label: 'ohne Vermerk', meaning: 'Die Prüfungen haben nichts gefunden.', count: marks.clean },
        { art: 'nichtBestaetigt', label: '„nicht bestätigt“', meaning: 'Eine der Prüfungen ging nicht auf.', count: marks.unconfirmed },
        { art: 'nichtGeprueft', label: '„nicht geprüft“', meaning: 'Der neue Text ließ sich weder am Entwurf noch am eigenen Ergebnis prüfen.', count: marks.unchecked },
        { art: 'nichtGezeigt', label: 'nicht gezeigt', meaning: 'Eine Prüfung hat ihn zurückgehalten: Sein Text fehlt, an seiner Stelle steht der Grund.', count: a.withheld },
      ]),
    },
    result: [
      `Die Textgegenüberstellungen enthalten ${n(marks.shown + a.withheld)} Paragraphen. ${n(marks.clean)} zeigt der Monitor ohne Vermerk, ${n(marks.unconfirmed)} mit dem Vermerk „nicht bestätigt“, ${n(marks.unchecked)} mit dem Vermerk „nicht geprüft“, ${n(a.withheld)} zeigt er nicht.`,
      // Whose error the bars below are (20.11.2026): „übernimmt Wort für Wort" beside „ein Satz verloren" read as a contradiction.
      'Der Monitor übernimmt den Text Wort für Wort, muss ihn aber aus einem PDF oder einer Tabelle herauslesen. Dabei kann er ein Wort falsch lesen, und ein Satz kann verloren gehen oder beim falschen Paragraphen landen.',
      // What „gefangen" does with the § (22.11.2026): the page's opening says a caught fault is not shown, and here most are — marked.
      'Fällt der Prüfung im neuen Text etwas auf, zeigt der Monitor den Paragraphen trotzdem und setzt den Vermerk „nicht bestätigt“. Unter jedem Balken steht, wie oft der Paragraph danach nicht mehr gezeigt wird und wie oft er mit einem Vermerk stehen bleibt.',
    ],
    faultsHeading: 'Eingebaute Fehler in der Textgegenüberstellung',
    faults: [
      chainBar('Ein Wort oder eine Zahl im neuen Text falsch, ein neuer Satz fehlt', classes(chain, CHAIN_WORDING)),
      chainBar('Eine Absatz-, Ziffern- oder Literabezeichnung im neuen Text falsch', classes(chain, CHAIN_LABEL), 'Unbemerkt bleibt sie, wenn der Entwurf dieselbe Bezeichnung an einer anderen Stelle des Paragraphen nennt.'),
      chainBar('Ein Satz, der bleibt, ist als gestrichen gezeigt', classes(chain, CHAIN_STRUCK)),
      chainBar('Ein Satz von anderswo steht in der rechten Spalte (neuer Text)', classes(chain, CHAIN_MISFILED)),
      chainBar('Ein Satz fehlt in der linken Spalte (alter Text)', classes(chain, CHAIN_LOST), 'Am ehesten bleibt das unbemerkt, wenn der Entwurf diesen Satz streicht oder umformuliert.'),
      chainBar('Ein Satz von anderswo steht als eigene Zeile links und rechts gleich', classes(chain, CHAIN_MIRRORED)),
      { ...chainBar('Ein Satz von anderswo steht in einer geänderten Zeile links und rechts gleich', inRow, 'So ein Satz sieht aus wie unveränderter Text, steht aber beim falschen Paragraphen.'), blind: true },
    ],
    rule:
      'Beide Spalten der Textgegenüberstellung übernimmt der Monitor Wort für Wort; die Markierung ist von uns. Bei Text ab fünf Wörtern müssen mindestens 95 % der Wörter der linken Spalte im geltenden Paragraphen am Stichtag stehen. Sechs und mehr aufeinanderfolgende Wörter, die rechts als neu markiert sind, dürfen nicht schon im Gesetz stehen. Auch eine Zeile, die beide Spalten gleich zeigen, hält der Monitor gegen das RIS: Fehlen dort mindestens drei ihrer Wörter und mehr als 5 %, steht am Paragraphen „nicht bestätigt“. Sind es mindestens zehn neue Wörter und fehlen davon acht und mehr als ein Zehntel im Gesetzestext des Entwurfs, zeigt der Monitor den Paragraphen nicht. Danach hält er den neuen und den gestrichenen Text Wort für Wort gegen den Gesetzestext des Entwurfs. Geht das auf, bleibt der Paragraph ohne Vermerk. Geht es nicht auf, bleibt er nur dann ohne Vermerk, wenn der ganze Paragraph, den der Monitor selbst zusammensetzt, den Text der rechten Spalte ergibt, in der Gegenüberstellung kein Wortlaut fehlt, den der Entwurf nennt, und der Abgleich nicht allein an gestrichenem Text scheitert; sonst steht „nicht bestätigt“. Lässt sich weder das eine noch das andere prüfen, steht „nicht geprüft“.',
    measured: [
      `In ${n(a.drafts)} Entwürfen der ${r.gp}. Gesetzgebungsperiode: ${n(marks.clean)} Paragraphen ohne Vermerk gezeigt, ${n(marks.unconfirmed)} mit „nicht bestätigt“, ${n(marks.unchecked)} mit „nicht geprüft“, ${n(a.withheld)} nicht gezeigt.`,
      standingSentence,
      'Die Fehler der Balken sind in Paragraphen eingebaut, die der Monitor vorher ohne Vermerk gezeigt hat.',
    ],
    missed: [
      blindSentence,
      'Eine falsche Absatz- oder Ziffernbezeichnung fällt nicht auf, wenn der Entwurf dieselbe Bezeichnung an einer anderen Stelle des Paragraphen nennt.',
      'Ein Satz, der bleibt und als gestrichen gezeigt ist, fällt nicht auf, wenn der Entwurf an dieser Stelle selbst streicht, ohne den Wortlaut zu nennen („der letzte Satz entfällt“), oder den Absatz neu fasst.',
      'Fehlt ein Satz in der linken Spalte, fällt das meist auf, aber nicht immer. Am ehesten bleibt es unbemerkt, wenn der Entwurf diesen Satz streicht oder umformuliert: Dann zeigt die Gegenüberstellung weniger Änderung, als der Entwurf vornimmt.',
      // What still passes at the foot of a § (23.11.2026): in words, because a one-off probe measured it and no round records it.
      'Steht am Ende des neuen Textes eine Abschnittsnummer, die es nicht gibt, fällt das oft nicht auf. Stehen dort die ersten Wörter des folgenden Paragraphen, bleibt das selten unbemerkt.',
      'Wie oft ein Vermerk zu Unrecht steht, zeigt dieser Test nicht: Er baut Fehler ein und zählt, wie viele auffallen.',
    ],
  }
}

export function genauigkeitArten(r: GenauigkeitRecord = GENAUIGKEIT): GenauigkeitArt[] {
  const bench = r.lesefassung.bench
  // Of every draft the page shows a Lesefassung for, with a Gegenstand at Parliament or RIS's alone (23.11.2026: only the first were counted).
  const witnessed = (r.lesefassung.funnel.witnessed ?? 0) + (r.lesefassung.risOnly.witnessed ?? 0)
  const notLaw = bench.shown - bench.identical
  const dp = bench.draftPath
  // Shown §§ no enacted law of the bench joins (24.11.2026): counted since the bench reads the whole period, left out without a word before.
  const noLaw = dp.noLawJoined ?? 0
  const notEnacted = dp.notEnacted ?? 0
  const unread = dp.enactedUnread ?? 0
  const joined = dp.shown - noLaw - notEnacted
  const blind = total(classes(r.lesefassung.faults, RESULT_BLIND))
  const blindComma = classes(r.lesefassung.faults, RESULT_BLIND_COMMA)
  const comma = total(blindComma)
  const blindEdge = classes(r.lesefassung.faults, RESULT_BLIND_EDGE)
  const edge = total(blindEdge)
  const breaches = (count: number) => (count === 0 ? 'kein Regelverstoß' : count === 1 ? 'ein Regelverstoß' : `${n(count)} Regelverstöße`)
  const st = r.stations
  const stFaults = st.faults?.length ? total(st.faults) : null
  const tgu = r.laender.tgu
  const ls = r.laender.stations
  const landWording = tgu.faults.filter((f) => (LAND_WORDING as readonly string[]).includes(f.key))
  const landOwn = tgu.faults.find((f) => f.key === LAND_OWN_DRAFT[0])!
  const landOther = tgu.faults.find((f) => f.key === LAND_OTHER_DRAFT[0])!
  const landLeft = total(tgu.left)
  const landMarked = tgu.strict.unchecked + tgu.strict.markedHeld
  const landClean = tgu.shown - landMarked
  const landNames = landList(tgu.lands)

  return [
    {
      id: 'lesefassung',
      heading: 'Ganzer Paragraph in der vorgeschlagenen Fassung',
      against: 'Geprüft an der Textgegenüberstellung des Ministeriums, wo sie abweicht am Gesetzestext des Entwurfs als PDF, und nachträglich am kundgemachten Gesetz.',
      result: [
        // The path a reader meets (23.11.2026): the draft's own instructions, as the page applies them. Until then this line reported the enacted law's instructions, which no page applies.
        `Am sichersten lässt sich das Ergebnis an Entwürfen prüfen, die inzwischen kundgemacht sind. Aus ${n(dp.drafts)} solchen Entwürfen lassen sich ${n(joined)} gezeigte Paragraphen einem Gesetz zuordnen.${notEnacted ? ` ${n(notEnacted)} weitere stehen in Artikeln des Entwurfs, die nicht Gesetz wurden.` : ''}${noLaw ? ` Bei ${n(noLaw)} ${notEnacted ? 'anderen' : 'weiteren'} findet die Prüfung kein kundgemachtes Gesetz zu ihrem Artikel des Entwurfs.` : ''} Bei ${n(dp.comparable)} ging die Anweisung unverändert ins Gesetz, es gibt also genau eine richtige Fassung: ${n(dp.identical)} stimmen Wort für Wort.${dp.comparable > dp.identical ? ` Bei ${ofParagraphs(dp.comparable - dp.identical)} ${dp.differs.every((d) => DRAFT_PATH_DIFFERS_READ.includes(`${d.me} § ${d.id}`)) ? 'steht im Gesetz etwas, das keine Anweisung des Entwurfs anordnet' : 'weicht unser Ergebnis vom Gesetz ab'}.` : ''}${benchCoversPeriod(r) ? ' An einem Teil dieser Gesetze wurden auch die Regeln entwickelt; bei den anderen kann der Anteil niedriger sein. Jedes neu kundgemachte Gesetz kommt mit der nächsten Messung dazu.' : ' An diesen Gesetzen wurden auch die Regeln entwickelt; bei anderen kann der Anteil niedriger sein.'}`,
        `Die übrigen ${n(joined - dp.comparable)} lassen sich so nicht prüfen: Ihr Text hat sich auf dem Weg zum Gesetz geändert, das Gesetz ändert sie nicht, ${unread ? 'ihr Text im Gesetz ließ sich nicht lesen, ' : ''}oder ihre Anweisung lässt sich nicht vergleichen.`,
        // The trade-off, in the open (20.11.2026): a first-time reader found it only under the fold, and it is what the share shown is paid for.
        `Die Prüfung ist streng. In einem zweiten Test wendet der Monitor die Anweisungen von ${n(bench.bgbl)} Bundesgesetzblättern selbst an. Mit der Prüfung bleiben ${n(bench.shown)} Paragraphen, ${bench.identical === bench.shown ? 'alle' : n(bench.identical)} Wort für Wort das Gesetz. Ohne sie wären es ${n(bench.ungated.shown)}, ${n(bench.ungated.shown - bench.ungated.identical)} davon mit Abweichungen.`,
        ...(witnessed
          ? [`Bei ${n(witnessed)} gezeigten Paragraphen der Entwürfe lautet die Textgegenüberstellung anders als unser Ergebnis. Gezeigt sind sie, weil der Gesetzestext des Entwurfs auch in seiner PDF-Fassung genau unser Ergebnis sagt. Am Paragraphen stehen beide Wortlaute.`]
          : []),
      ],
      faultsHeading: 'Eingebaute Fehler im ganzen Paragraphen',
      faults: [
        bar('Ein Wort, eine Zahl, ein Datum, ein Verweis oder ein Satzzeichen falsch, nicht am Rand einer gedruckten Passage', classes(r.lesefassung.faults, RESULT_WORDS)),
        bar('Ein Absatz oder Textstück zu viel, vertauscht oder ausgelassen', classes(r.lesefassung.faults, RESULT_STRUCTURE)),
        // The second reading (20.11.2026): the draft's instruction misread, where the annex contradicts and the draft's PDF decides.
        bar('Gegenlesen am PDF: der neue Text des Entwurfs falsch gelesen', classes(r.lesefassung.faults, RESULT_WITNESS)),
        bar('Ein Textteil fehlt, und weder RIS noch Textgegenüberstellung enthalten ihn', classes(r.lesefassung.faults, RESULT_BLIND), { blind: true, why: 'Fehlt ein Teil schon im RIS, kann er auch im ganzen Paragraphen des Monitors fehlen.' }),
        bar('Ein Komma fehlt in Text, den der Entwurf unverändert lässt', blindComma, { blind: true, why: 'Dort vergleicht die Prüfung die Wörter, nicht die Satzzeichen.' }),
        ...(edge.tried ? [bar('Ein Wort fehlt am Rand einer gedruckten Passage oder in einer Wortfolge, die mehrfach steht', blindEdge, { blind: true, why: 'Dort fällt ein fehlendes Wort seltener auf als mitten im Text.' })] : []),
      ],
      rule:
        'Der Monitor setzt den Paragraphen selbst zusammen, aus dem geltenden Text im RIS und den Anweisungen des Entwurfs, und hält ihn gegen die Textgegenüberstellung des Ministeriums. Was sie als geltend zeigt, muss im RIS stehen, was sie als neu zeigt, in unserem Ergebnis; Leerzeichen und Bindestriche zählen dabei nicht. Ihre Absätze müssen in derselben Reihenfolge stehen, und unser Ergebnis darf nichts ändern, was sie nicht zeigt.',
      measured: [
        `An den Entwürfen: ${n(dp.comparable)} Paragraphen mit unveränderter Anweisung auf unverändertem Text, ${n(dp.identical)} davon Wort für Wort das Gesetz. Nicht bewertet: ${n(dp.instructionChanged)} mit geänderter Anweisung, ${n(dp.stockMoved)}, deren Ausgangstext sich vorher geändert hat, ${n(dp.noInstructionLine)} ohne eigene Anweisungszeile, ${n(dp.notAmended)}, die das Gesetz nicht ändert${unread ? `, ${n(unread)}, deren Text im Gesetz sich nicht lesen ließ` : ''}${notEnacted ? `, ${n(notEnacted)} in Artikeln, die nicht Gesetz wurden` : ''}${noLaw ? `, ${n(noLaw)}, denen die Prüfung kein kundgemachtes Gesetz zuordnet` : ''}.`,
        `An den Bundesgesetzblättern, mit deren eigenen Anweisungen: ${n(bench.laws)} Gesetze. Von ${n(bench.shown)} Paragraphen, die die Prüfung bestätigt, sind ${n(bench.identical)} Wort für Wort das Gesetz.${notLaw ? ` ${restSentence(bench)}` : ''} Ein Wort, das nicht im Gesetz steht, hat${bench.invented ? ` ${bench.invented === 1 ? 'einer' : n(bench.invented)}` : ' keiner'}. Manche dieser Fassungen treten erst später in Kraft; verglichen wird mit dem kundgemachten Text.`,
        // What „ohne" leaves in force (20.11.2026): the rules that judge each instruction and its result by themselves still decide.
        `Ohne die Prüfung gegen die Gegenüberstellung – jeder Paragraph, bei dem sich alle Anweisungen anwenden ließen und das Ergebnis für sich stimmig ist – wären es ${n(bench.ungated.identical)} von ${n(bench.ungated.shown)} gewesen.`,
        // The §§ the second reading releases, on the same bench (20.11.2026): the page shows such §§ since that day, and the figure above left them out.
        ...(bench.witnessed?.shown
          ? [`Das Gegenlesen am PDF gibt in dieser Probe ${n(bench.witnessed.shown)} weitere frei, ${bench.witnessed.identical === bench.witnessed.shown ? 'alle' : `${n(bench.witnessed.identical)} davon`} Wort für Wort das Gesetz. Dort liest es aber das Bundesgesetzblatt gegen sich selbst. Wie gut es bei einem Entwurf ist, zeigt nur der Test mit eingebauten Fehlern.`]
          : []),
      ],
      missed: [
        `Fehlt unserem Ergebnis ein Teil, den auch der geltende Text im RIS nicht hat und den die Gegenüberstellung stillschweigend überspringt, fällt das kaum auf: ${blind.caught === 0 ? 'keiner' : n(blind.caught)} von ${n(blind.tried)} Versuchen gefangen.`,
        // Where the annex prints nothing that changes, the check compares the words, not their punctuation (21.11.2026).
        `Fehlt unserem Ergebnis ein Komma in Text, den der Entwurf unverändert lässt, fällt das kaum auf: ${comma.caught === 0 ? 'keiner' : n(comma.caught)} von ${n(comma.tried)} Versuchen gefangen. Dort vergleicht die Prüfung die Wörter, nicht die Satzzeichen.`,
        ...(edge.tried ? [`Fehlt unserem Ergebnis ein Wort am Rand einer gedruckten Passage oder in einer Wortfolge, die im Paragraphen mehrfach steht, fällt das seltener auf: ${n(edge.caught)} von ${n(edge.tried)} Versuchen gefangen.`] : []),
        'Beim Gegenlesen am PDF: eine Ziffer in einem Platzhalter für ein künftiges Bundesgesetzblatt („BGBl. I Nr. xxx/2025“) vergleicht keine der Prüfungen.',
        'Liest der Monitor den neuen Text an genau der Stelle falsch, an der auch die Textgegenüberstellung vom Gesetzestext abweicht, bestätigt sie den Fehler.',
      ],
    },
    annexArt(r),
    {
      id: 'stationen',
      heading: 'Vom Entwurf zum Gesetz: Vergleich der Fassungen',
      pageName: 'Vergleich der Fassungen',
      against: 'Geprüft mit festen Regeln und mit Texten, die gleich sein müssen.',
      result: [
        `${n(st.pairs)} Vergleiche, ${breaches(st.breaches)}. Die Regeln prüfen, ob ein Vergleich in sich stimmt, zum Beispiel: Jede als geändert markierte Stelle muss eine sichtbare Änderung zeigen.`,
        nullSentence(st),
      ],
      // Held to faults since 20.11.2026 (`station.ts --mutationen`): one token changed in a unit of a real text must read as a change of substance.
      faults: st.faults?.length ? [{ ...bar('Eine Ziffer, ein Zeichen oder ein Wort wie „nicht“ in einem der beiden Texte geändert', st.faults), shownAsChange: true }] : [],
      faultsHeading: 'Eingebaute Änderungen im Vergleich der Fassungen',
      facts: [
        { value: n(st.breaches), label: `${st.breaches === 1 ? 'Regelverstoß' : 'Regelverstöße'} in ${n(st.pairs)} Vergleichen` },
        { value: n(st.nullSubstantive), label: `von ${n(st.nullUnits)} Textteilen, die gleich sein sollten, als Änderung gezeigt` },
      ],
      rule:
        `Verglichen wird der Entwurf mit der Regierungsvorlage, diese mit den Fassungen von Ausschuss und Plenum, und der ganze Weg mit dem Bundesgesetzblatt. Eine dritte Fassung gibt es nicht: Ob ein Unterschied zwischen zwei verschiedenen Texten richtig erkannt ist, lässt sich an nichts Drittem prüfen. Geprüft wird, dass jeder Vergleich beide Texte so vollständig wiedergibt, wie der Monitor sie gelesen hat, und jede als geändert markierte Stelle eine sichtbare Änderung zeigt – und an Texten, die gleich sein müssen, dass der Vergleich nichts findet.${stFaults ? ' Dazu ändern wir in echten Texten je die erste passende Stelle und prüfen, dass der Vergleich sie als Änderung zeigt und nicht als „redaktionell“ oder „unverändert“.' : ''}`,
      measured: [
        `${n(st.pairs)} Vergleiche zu ${n(st.drafts)} Entwürfen: ${st.breaches ? `${n(st.breaches)} verletzen` : 'keiner verletzt'} diese Regeln.`,
        ...(stFaults
          ? [`${n(stFaults.tried)} eingebaute Änderungen – eine Ziffer, ein Vorzeichen, „nicht“, „und“ statt „oder“ –: ${stFaults.caught === stFaults.tried ? 'Der Vergleich zeigt jede als Änderung' : `Der Vergleich zeigt ${n(stFaults.caught)} als Änderung`}.`]
          : []),
        `Texte, die gleich sein sollten – die letzte Fassung des Parlaments und das Bundesgesetzblatt, derselbe Entwurf aus zwei Quellen –: in ${n(st.nullUnits)} Einheiten ${n(st.nullResidues)} Unterschiede, ${st.nullSubstantive ? `alle als „redaktionell“ markiert bis auf ${n(st.nullSubstantive)}; ${st.nullSubstantive === 1 ? 'dieser erscheint' : 'diese erscheinen'} als Änderung` : 'alle als „redaktionell“ markiert'}.`,
      ],
      missed: [
        'Liest der Monitor ein Wort in einem der beiden Texte falsch, zeigt er ohne Vermerk eine Änderung, die es nicht gibt. Wie oft das vorkommt, misst dieser Test nicht. Liest er dasselbe Wort in beiden Texten gleich falsch, bemerkt das niemand.',
        'Der Test mit eingebauten Änderungen vergleicht einen Text mit einer geänderten Kopie seiner selbst. Er zeigt, dass der Vergleich eine Änderung nicht wegglättet. Ob der Monitor die richtigen Absätze einander zuordnet, zeigt er nicht.',
        'Steht im früheren Text ein Platzhalter für die Nummer des Bundesgesetzblatts („xxx/2026“), gilt jede Zahl an seiner Stelle als redaktionell.',
      ],
    },
    {
      id: 'land-gegenueberstellung',
      heading: 'Die Textgegenüberstellung eines Bundeslandes',
      pageName: 'Was ändert der Entwurf?',
      against: `Geprüft am geltenden Recht im RIS und am Entwurf des Bundeslandes, bei ${landNames}. Für Kärnten gibt es diese Prüfung nicht.`,
      result: [
        `Aus den Textgegenüberstellungen von ${landNames} zeigt der Monitor ${n(tgu.shown)} geänderte oder neue Paragraphen. ${n(tgu.withheldAll)} Paragraphen zeigt er nicht, weil eine Prüfung sie nicht bestätigt; bei ${n(tgu.strict.differs)} davon weicht der neue Text vom Entwurf ab.`,
        `${n(landClean)} der gezeigten stehen ohne Vermerk: Ihr neuer Text stimmt Wort für Wort mit dem Entwurf überein, und was sie streichen, ordnet der Entwurf an. ${n(landMarked)} tragen den Vermerk „nicht geprüft“, weil sich ihr neuer oder ihr gestrichener Text nicht Wort für Wort bestätigen lässt.`,
        `In Kärnten gibt es diese Prüfung nicht. Dort tragen alle ${n(tgu.kaernten.shown)} geänderten oder neuen Paragraphen den Vermerk „nicht geprüft“.`,
      ],
      split: {
        caption: `Von 100 Paragraphen bei ${landNames}`,
        parts: hundertTeile([
          { art: 'ohne', label: 'ohne Vermerk', meaning: 'Der neue Text stimmt Wort für Wort mit dem Entwurf, und was er streicht, ordnet der Entwurf an.', count: landClean },
          { art: 'nichtGeprueft', label: '„nicht geprüft“', meaning: 'Neuer oder gestrichener Text ließ sich nicht Wort für Wort bestätigen.', count: landMarked },
          { art: 'nichtGezeigt', label: 'nicht gezeigt', meaning: 'Eine Prüfung hat ihn zurückgehalten.', count: tgu.withheldAll },
        ]),
        after: 'In Kärnten gibt es diese Prüfung nicht. Dort trägt jeder geänderte oder neue Paragraph den Vermerk „nicht geprüft“.',
      },
      faultsHeading: 'Eingebaute Fehler in der Gegenüberstellung eines Landes',
      faults: [
        bar('Ein Satz aus dem Entwurf eines anderen Bundeslandes', [landOther]),
        bar('Ein Satz aus einem anderen Paragraphen desselben Entwurfs', [landOwn]),
        bar('Ein Wort oder eine Zahl im neuen Text falsch, ein neuer Satz fehlt', landWording),
        bar('Ein Satz, der bleibt, ist als gestrichen gezeigt', [tgu.struckKept]),
        bar('Ein Wort, eine Zahl oder ein Verweis im alten Text falsch', tgu.left, { blind: true, why: 'Solche Paragraphen tragen meist keinen Vermerk. Wer den alten Wortlaut zitiert, sieht im Dokument des Bundeslandes nach.' }),
      ],
      rule: `Gelesen wird die Textgegenüberstellung eines Landes, wo der Monitor ihre Form lesen kann: bei ${landList(tgu.lands)}. Die linke Spalte wird gegen das geltende Recht im RIS gehalten, die rechte gegen den Entwurf des Landes: Was sie als neu zeigt, muss Wort für Wort und Zahl für Zahl der Wortlaut sein, den der Entwurf für den Paragraphen schreibt. Lässt sich das nicht vergleichen, steht am Paragraphen „nicht geprüft“; zurückgehalten wird er dann nur, wenn er mindestens zehn neue Wörter hat und davon mindestens acht und mehr als ein Zehntel im Entwurf fehlen. Auch was die Spalte streicht, hält er gegen den Entwurf: Streicht keine Anweisung diesen Text, oder bringt der Paragraph nichts Neues und der Entwurf nennt das Gestrichene nicht, steht „nicht geprüft“. Kärntens Gegenüberstellungen zeigt er ohne diese Prüfung, mit „nicht geprüft“ an jedem geänderten Paragraphen.`,
      measured: [
        `In ${n(tgu.documents)} Gegenüberstellungen: ${n(landClean)} Paragraphen ohne Vermerk, ${n(landMarked)} mit „nicht geprüft“ (bei ${n(tgu.strict.unchecked)} der neue Text, bei ${n(tgu.strict.markedHeld)} das Gestrichene), ${n(tgu.withheldAll)} nicht gezeigt.`,
        ...(r.laender.listFetchedAt ? [`Die Liste der Landesentwürfe hat den Stand vom ${formatDateDe(r.laender.listFetchedAt.slice(0, 10))}.`] : []),
      ],
      missed: [
        `Ein einzelnes falsch gelesenes Wort, eine falsche Zahl, ein fehlender Satz im neuen Text: ${caughtOf(landWording)}. Unbemerkt bleiben sie vor allem bei Paragraphen, deren neuer Text sich nicht Wort für Wort prüfen lässt; diese tragen „nicht geprüft“.`,
        `Im alten Text, der links steht, fällt ein falsch gelesenes Wort, eine Zahl oder ein Verweis seltener auf: ${n(landLeft.caught)} von ${n(landLeft.tried)} Versuchen gefangen.`,
        'Ein Wort, das in beiden Dokumenten des Bundeslandes gleich falsch steht, sieht die Prüfung nicht.',
      ],
    },
    {
      id: 'land-stationen',
      heading: 'Vergleich der Fassungen eines Bundeslandes',
      pageName: 'Vergleich der Fassungen',
      against: 'Geprüft mit festen Regeln. Einen dritten Text zum Gegenprüfen gibt es nicht.',
      result: [
        `${n(ls.compared)} Vergleiche bei ${landList(ls.lands)}, ${breaches(ls.hits)}.${ls.notCompared ? ` ${n(ls.notCompared)} weitere ließen sich nicht lesen.` : ''}`,
        `${n(ls.withheld)} Anweisungen zeigt der Monitor nicht, weil er den angekündigten Text nicht an seiner Stelle fand. Bei ${n(ls.unread)} steht „Nicht lesbar“.`,
      ],
      faults: [],
      facts: [{ value: n(ls.hits), label: `${ls.hits === 1 ? 'Regelverstoß' : 'Regelverstöße'} in ${n(ls.compared)} Vergleichen` }],
      rule:
        'Verglichen werden Entwurf, Regierungsvorlage, Ausschussbericht und Landesgesetzblatt eines Landes, gelesen aus den PDFs von Land und Landtag. Wie beim Bund gibt es keine dritte Fassung. Geprüft wird, dass kein Vergleich eine Anordnung doppelt zeigt, eine Kopfzeile des Dokuments als Text liest oder einen Teil einer Anordnung als eigene, neue Anordnung meldet; und ob eine Anordnung den Text, den sie ankündigt – etwa eine Zeile einer Tabelle –, in beiden Dokumenten an ihrer Stelle trägt.',
      measured: [
        `${n(ls.compared)} Vergleiche: ${ls.hits ? `${n(ls.hits)} Verstöße gegen diese Regeln` : 'kein Verstoß gegen diese Regeln'}.${ls.accepted ? ` ${n(ls.accepted)} Stellen sehen aus wie ein Verstoß und sind einzeln gelesen: ${n(ls.accepted - ls.acceptedReader)} stehen so in den Dokumenten, ${n(ls.acceptedReader)} sind ein noch offener Lesefehler des Monitors.` : ''}`,
        `Bei ${n(ls.withheld)} Anordnungen in ${n(ls.withheldPairs)} Vergleichen fand der Monitor den angekündigten Text in einem der beiden Dokumente nicht an seiner Stelle; sie stehen als „nicht gezeigt“ beim Gesetz. Bei ${n(ls.unread)} in ${n(ls.unreadPairs)} Vergleichen fehlt er in beiden; verglichen ist dort der Rest der Anordnung, und „Nicht lesbar“ sagt es.`,
      ],
      missed: [
        `Liest der Monitor dasselbe Wort in beiden Dokumenten gleich falsch, bemerkt das niemand. Denselben Text aus zwei Quellen gibt es bei den Ländern nur in Oberösterreich, als Ausschusstext und Landesgesetzblatt: in ${n(ls.nullComparison.units)} Textteilen ${n(ls.nullComparison.residues)} Unterschiede, ${n(ls.nullComparison.substantive)} davon als Änderung gezeigt.`,
        'Die Regeln prüfen, ob ein Vergleich in sich stimmt. Ob der Monitor die richtigen Absätze einander zuordnet, prüfen sie nicht.',
      ],
    },
  ]
}

/**
 * What the null comparisons found, said whole (20.11.2026). Until then
 * „zeigte der Monitor 4 von 9.542 Textteilen fälschlich als geändert": the
 * 454 differences badged „redaktionell" are differences the page shows too,
 * and whether one is false the test does not decide — the two sources of a
 * text do differ in places.
 */
function nullSentence(st: GenauigkeitRecord['stations']): string {
  if (st.nullResidues === 0) return `Im Test mit Texten, die gleich sein sollten, fand der Monitor in ${n(st.nullUnits)} Textteilen keinen Unterschied.`
  const substantive = st.nullSubstantive === 0 ? 'keiner' : st.nullSubstantive === 1 ? 'einer' : n(st.nullSubstantive)
  const rest = st.nullResidues - st.nullPlaceholders
  // The split into change and „redaktionell" right after the total (24.11.2026): behind „Die übrigen 4", „4 davon … die anderen" read as four of four.
  return `Im Test mit Texten, die gleich sein sollten, fand der Monitor in ${n(st.nullUnits)} Textteilen ${n(st.nullResidues)} Unterschiede. ${substantive === 'keiner' ? 'Keinen' : substantive === 'einer' ? 'Einen' : substantive} davon zeigt er als Änderung, die anderen als „redaktionell“. ${n(st.nullPlaceholders)} sind die Nummer des Bundesgesetzblatts, die vor der Kundmachung noch offen ist. ${rest === NULL_RESIDUES_READ ? `Die übrigen ${n(rest)} haben wir einzeln gelesen: In den Quellen steht derselbe Wortlaut, der Unterschied kommt von Füllpunkten, einem überzähligen Satzzeichen in einer Quelle oder vom Einlesen.` : `Die übrigen ${n(rest)} sind noch nicht einzeln gelesen.`}`
}

/** „Einem fehlt ein Teil.", „2 fehlt ein Teil, einer ist nur halb angewendet." */
function restSentence(bench: GenauigkeitRecord['lesefassung']['bench']): string {
  const parts: string[] = []
  if (bench.incomplete) parts.push(`${bench.incomplete === 1 ? 'Einem' : n(bench.incomplete)} fehlt ein Teil`)
  if (bench.otherwise === BENCH_OTHERWISE_READ) parts.push('bei einem setzt das RIS nach der Änderung einen Bindestrich, wo vorher ein Gedankenstrich stand; keine Anweisung ordnet das an')
  else if (bench.otherwise) parts.push(`${bench.otherwise === 1 ? 'einer' : n(bench.otherwise)} ${bench.otherwise === 1 ? 'ist' : 'sind'} aus einem anderen Grund nicht das Gesetz`)
  const sentence = parts.join(', ')
  return sentence ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.` : ''
}

/* ------------------------------------------------------------------ */
/* In short                                                             */
/* ------------------------------------------------------------------ */

/**
 * The page at a glance, at its top (24.11.2026): four figures, and what stays
 * for the reader to check. A first-time reader — an NGO's staff member who
 * writes Stellungnahmen — came with „what can I quote, and what do I have to
 * look up myself?" (20.11.2026), and the answer stood in six sentences of
 * running text with eleven counts in them. Now each figure is a share, as
 * large as a heading, with what it is of; every count behind it stands under
 * „Im Einzelnen" of its section. No new figure stands here.
 */
export interface GenauigkeitKachel {
  /** The section the figure comes from; the tiles stand in the order of the sections. */
  id: string
  /** The figure as printed: „96,0 %". */
  value: string
  /** The rest of the sentence the figure opens. */
  label: string
  /** Where it was measured, where leaving it out would claim more. */
  note?: string
}

/** One thing left for the reader, its lead in bold: what they meet, then what to do. */
export interface GenauigkeitHinweis {
  lead: string
  text: string
}

export function genauigkeitKurz(r: GenauigkeitRecord = GENAUIGKEIT): { kacheln: GenauigkeitKachel[]; check: GenauigkeitHinweis[] } {
  const a = r.annex
  const funnel = wegFunnel(r.lesefassung.funnel)
  const probe = gesetzProbe(r)
  const st = r.stations.faults?.length ? total(r.stations.faults) : null
  const tgu = r.laender.tgu
  const landHeld = tgu.shown - tgu.strict.unchecked - tgu.strict.markedHeld
  // The annex's §§ in tenths that add up, so „96,0" is exactly „73,3" and „22,7".
  const [clean, marked] = largestRemainder([a.marks.clean, a.marks.unconfirmed + a.marks.unchecked, a.withheld], 1000)
  return {
    kacheln: [
      {
        id: 'gegenueberstellung',
        value: `${tenthsDe(clean! + marked!)}\u00a0%`,
        // With its marks (24.11.2026): read alone, 96 % was taken for „96 % correct".
        label: `der Paragraphen aus den Textgegenüberstellungen der Ministerien zeigt der Monitor: ${tenthsDe(clean!)}\u00a0% ohne Vermerk, ${tenthsDe(marked!)}\u00a0% mit einem.`,
        // The term the page is about, explained where it first appears.
        note: 'Eine Textgegenüberstellung ist die Tabelle des Ministeriums mit altem und neuem Text nebeneinander.',
      },
      // The funnel's own figure, so the tile and the funnel's last step never differ by a tenth.
      {
        id: 'lesefassung',
        value: `${tenthsDe(funnel.stufen.at(-1)!.remainingTenths)}\u00a0%`,
        label: 'der geänderten Paragraphen schreibt er auch ganz aus: so, wie sie lauten, wenn der Entwurf unverändert Gesetz wird.',
        // What happens to the rest (24.11.2026): both readers took 63,2 % for „a third of the changes missing".
        note: 'Bei den übrigen bleibt die Textgegenüberstellung zu sehen, soweit sie den Paragraphen enthält.',
      },
      { id: 'lesefassung-gesetz', value: probe.value, label: 'der ganz ausgeschriebenen Paragraphen stimmen Wort für Wort mit dem späteren Gesetz.', note: `${probe.where} ${probe.notMeaning}` },
      ...(st
        ? [{
            id: 'stationen',
            value: `${shareDe(st.caught, st.tried)}\u00a0%`,
            label: 'der absichtlich eingebauten Änderungen zeigt der Vergleich der Fassungen als Änderung.',
            // Read alone, 100 % was taken for „error-free".
            note: 'Wie oft der Monitor ein Wort falsch liest, misst dieser Test nicht.',
          }]
        : []),
    ],
    // An instruction first, then one line per mark with what to do (24.11.2026): „Zitiert wird aus dem verlinkten Original" at the end read as a description of the site, and the two marks in one line left both readers asking which is worse.
    check: [
      { lead: 'Wortlaute aus dem verlinkten Original zitieren.', text: 'Der Monitor ist kein amtliches Angebot. Seine Vermerke zeigen, wo genau hinzusehen ist.' },
      { lead: '„nicht bestätigt“:', text: 'Eine der Prüfungen ging nicht auf. Den Wortlaut im verlinkten Entwurf nachsehen.' },
      { lead: '„nicht geprüft“:', text: 'Es gab nichts, woran der Monitor den Text prüfen konnte. Den Wortlaut im verlinkten Entwurf nachsehen.' },
      { lead: 'Kein Vermerk:', text: 'Die Prüfungen haben nichts gefunden. Das heißt nicht, dass der Text sicher stimmt.' },
      { lead: 'Bundesländer:', text: `Bei ${landList(tgu.lands)} sind ${partDe(landHeld, tgu.shown)}\u00a0% der gezeigten Paragraphen Wort für Wort am Entwurf geprüft, der alte Text nur teilweise. In Kärnten gibt es diese Prüfung nicht. Wer den alten Wortlaut zitiert, sieht im Dokument des Bundeslandes nach.` },
    ],
  }
}

/**
 * The whole § against the law it became (24.11.2026, out of the running text
 * into a figure of its own): the share that is the law word for word, on the
 * path a reader meets, and the bench's trade-off as frequencies — „34 von
 * 1.000" without the check, against one with it — which a reader grasps
 * where 99,9 against 96,6 % looks like a rounding.
 */
export interface GesetzProbe {
  value: string
  /** Where it was measured, in a reader's words: no „Anweisung", which the top of the page has not explained yet. */
  where: string
  /**
   * What it means that the rules were developed on these laws, or on part
   * of them: the share can be lower elsewhere. Said as that consequence, at
   * the figure in its section (24.11.2026). „An einem Teil dieser Gesetze
   * wurden auch die Regeln entwickelt" stood at the tile too, where it
   * helped no one (maintainer): a reader cannot tell which rules, nor what
   * follows. The cause stays under „Was die Zahlen nicht
   * sagen" and „Im Einzelnen".
   */
  caveat: string
  /** What the §§ that are not the law are, where the cases were read. */
  differs: string | null
  /**
   * What the share is not (24.11.2026): a reader of an NGO took „99,5 % stimmen
   * mit dem späteren Gesetz" for „drafts pass unchanged, statements change
   * nothing" — a figure the page must never be read as (CLAUDE.md, framing).
   */
  notMeaning: string
  /** Of 1,000 shown §§, how many are not the law, without and with the check; at least one where any is. */
  without: number
  with: number
}

/** Of 1,000, to the nearest; never 0 where there is one. */
function perThousand(count: number, whole: number): number {
  return count === 0 ? 0 : Math.max(1, Math.round((1000 * count) / whole))
}

export function gesetzProbe(r: GenauigkeitRecord = GENAUIGKEIT): GesetzProbe {
  const bench = r.lesefassung.bench
  const dp = bench.draftPath
  const off = dp.comparable - dp.identical
  const read = dp.differs.every((d) => DRAFT_PATH_DIFFERS_READ.includes(`${d.me} § ${d.id}`))
  return {
    value: `${shareDe(dp.identical, dp.comparable)}\u00a0%`,
    where: 'Gemessen an Paragraphen, die so Gesetz wurden, wie der Entwurf sie vorschlug.',
    // „künftig", not „neu" (24.11.2026): „Bei neuen Gesetzen" left a citizen asking whether a running draft was one, and a lawyer whether it meant newly enacted Stammgesetze.
    caveat: benchCoversPeriod(r) ? 'Bei künftigen Gesetzen kann der Anteil niedriger sein.' : 'Bei anderen Gesetzen kann der Anteil niedriger sein.',
    notMeaning: 'Wie oft ein Entwurf unverändert Gesetz wird, sagt die Zahl nicht.',
    // „Wo nicht" after „…, die so Gesetz wurden, wie der Entwurf sie vorschlug" read as „where they did not" (24.11.2026); it means the few that differ.
    differs: off === 0 ? null : read ? 'Wo einer abweicht, steht im Gesetz etwas, das der Entwurf nicht anordnet.' : 'Die Abweichungen sind noch nicht einzeln gelesen.',
    without: perThousand(bench.ungated.shown - bench.ungated.identical, bench.ungated.shown),
    with: perThousand(bench.shown - bench.identical, bench.shown),
  }
}

/* ------------------------------------------------------------------ */
/* What is shown, and why the rest is not                               */
/* ------------------------------------------------------------------ */

export type FunnelGroup = 'geltend' | 'anweisung' | 'pruefung' | 'beilage' | 'nichts'

/**
 * Every reason a § gets no Lesefassung, in one group — the step of the way
 * it ended at. Typed as a Record so a new cause cannot be left out: the
 * build fails until it has a group.
 */
export const FUNNEL_GROUP_OF: Record<ConsolidatedWithheldCause, FunnelGroup> = {
  'gesetz-unbekannt': 'geltend',
  'nummer-doppelt': 'geltend',
  'nicht-im-ris': 'geltend',
  'nicht-lesbar': 'geltend',
  'nicht-geladen': 'geltend',
  'zu-lang': 'geltend',
  verweigert: 'anweisung',
  'anhang-widerspricht': 'pruefung',
  unplausibel: 'pruefung',
  'anhang-fremd': 'beilage',
  'anhang-schweigt': 'beilage',
  'anhang-ungeteilt': 'beilage',
  'kein-anhang': 'beilage',
  entfaellt: 'nichts',
  'neu-erlassen': 'nichts',
}

/**
 * Why a § ends there, in one sentence under its step of the funnel: what the
 * monitor does not do, and that it is on purpose. Only what holds for every
 * § of the group; the single reasons are folded under the funnel. Worded as
 * the case that differs from the example above it (20.11.2026): „stimmen
 * nicht überein" right under an example that matches read to two first-time
 * readers as „this example failed". Shorter since 24.11.2026, when the steps
 * became a funnel: a sentence of three clauses under each step made the
 * figure a page of text again.
 */
export const FUNNEL_GROUP_WHY_DE: Record<Exclude<FunnelGroup, 'nichts'>, string> = {
  geltend: 'Das Gesetz oder den Paragraphen fand der Monitor im RIS nicht eindeutig.',
  anweisung: 'Der Monitor wendet eine Anweisung nur an, wenn er sie sicher lesen kann und sie auf genau eine Stelle passt. Er rät nicht.',
  beilage: 'Die Textgegenüberstellung zeigt nur Ausschnitte, oder ihr alter Text steht so nicht im RIS: Es fehlt, womit sich das Ergebnis vergleichen ließe.',
  pruefung: 'Ergebnis und Textgegenüberstellung passen nicht zusammen, auch nicht, wenn der Monitor den Entwurf ein zweites Mal liest, aus seinem PDF.',
}

/** What the §§ still on their way have passed, at each step of the funnel. */
export const FUNNEL_STEP_DE: Record<Exclude<FunnelGroup, 'nichts'>, string> = {
  geltend: 'Geltender Text im RIS gefunden',
  anweisung: 'Anweisung sicher angewendet',
  beilage: 'Etwas zum Vergleichen in der Textgegenüberstellung',
  pruefung: 'Prüfung bestanden: ganz gezeigt',
}

/** The steps of the funnel in the order a § passes them. */
export const FUNNEL_STEPS = ['geltend', 'anweisung', 'beilage', 'pruefung'] as const satisfies readonly Exclude<FunnelGroup, 'nichts'>[]

export const FUNNEL_GROUP_DE: Record<FunnelGroup, string> = {
  geltend: 'Geltender Text nicht eindeutig gefunden',
  anweisung: 'Anweisung nicht sicher anwendbar',
  pruefung: 'Prüfung nicht bestanden',
  beilage: 'Nichts zum Vergleichen in der Textgegenüberstellung',
  nichts: 'Nichts zusammenzusetzen',
}

export const FUNNEL_SHOWN_DE = 'Gezeigt'

export interface FunnelRow {
  key: FunnelGroup | 'gezeigt'
  label: string
  count: number
  /** Its causes, largest first; none for the shown. */
  causes: { cause: ConsolidatedWithheldCause; count: number }[]
}

/** The shown first, then the groups by size, each with its causes by size. */
export function funnelRows(funnel: GenauigkeitRecord['lesefassung']['funnel'] = GENAUIGKEIT.lesefassung.funnel): FunnelRow[] {
  const groups = new Map<FunnelGroup, FunnelRow>()
  for (const [cause, count] of Object.entries(funnel.causes) as [ConsolidatedWithheldCause, number][]) {
    if (!count) continue
    const key = FUNNEL_GROUP_OF[cause]
    const row = groups.get(key) ?? { key, label: FUNNEL_GROUP_DE[key], count: 0, causes: [] }
    row.count += count
    row.causes.push({ cause, count })
    groups.set(key, row)
  }
  for (const row of groups.values()) row.causes.sort((a, b) => b.count - a.count)
  return [
    { key: 'gezeigt', label: FUNNEL_SHOWN_DE, count: funnel.shown, causes: [] },
    ...[...groups.values()].sort((a, b) => b.count - a.count),
  ]
}

/**
 * The way with its counts: how many §§ set out, how many end at which step,
 * how many arrive.
 *
 * THE WHOLE IS THE §§ THAT HAVE A PROPOSED VERSION TO COMPOSE (19.11.2026).
 * A § the draft repeals has none, and a § of a law the draft enacts anew is
 * the draft's own text; until then both stood in the denominator, and the
 * share shown read lower than what the monitor could have shown at all.
 * They are named beside the figure (`outside`), not dropped.
 */
export interface WegFunnel {
  /** §§ with something to compose. */
  total: number
  shown: number
  /**
   * Of `shown`, the §§ shown on the draft's own Gesetzestext where the annex
   * did not confirm them (`draftWitness`, 20.11.2026) — never counted as
   * confirmed by the annex.
   */
  witnessed: number
  /** The steps in the order a § passes them, each with what it leaves behind. */
  stufen: FunnelStufe[]
  /** Repealed or newly enacted: outside the whole. */
  outside: number
}

/**
 * One step of the funnel (24.11.2026): how many §§ end here, and how many go
 * on. The tenths of a percent come out of one `largestRemainder` over every
 * step and the §§ shown, so a step's drop subtracts exactly to the next
 * step's figure; rounded one by one, 71,3 less 8,2 printed above 63,2.
 */
export interface FunnelStufe {
  key: (typeof FUNNEL_STEPS)[number]
  /** What the §§ still on their way have passed. */
  label: string
  /** Why the others end here. */
  why: string
  /** The group's row, with its causes, largest first; none where no § ended here. */
  row: FunnelRow | null
  dropped: number
  droppedTenths: number
  remaining: number
  remainingTenths: number
}

export function wegFunnel(funnel: GenauigkeitRecord['lesefassung']['funnel'] = GENAUIGKEIT.lesefassung.funnel): WegFunnel {
  const rows = funnelRows(funnel)
  const outside = rows.find((r) => r.key === 'nichts')?.count ?? 0
  const total = funnel.changed - outside
  const rowOf = (key: FunnelGroup) => rows.find((r) => r.key === key) ?? null
  const counts = FUNNEL_STEPS.map((key) => rowOf(key)?.count ?? 0)
  const tenths = largestRemainder([...counts, funnel.shown], 1000)
  let remaining = total
  let remainingTenths = 1000
  const stufen = FUNNEL_STEPS.map((key, i): FunnelStufe => {
    remaining -= counts[i]!
    remainingTenths -= tenths[i]!
    return { key, label: FUNNEL_STEP_DE[key], why: FUNNEL_GROUP_WHY_DE[key], row: rowOf(key), dropped: counts[i]!, droppedTenths: tenths[i]!, remaining, remainingTenths }
  })
  return { total, shown: funnel.shown, witnessed: funnel.witnessed ?? 0, stufen, outside }
}

/* ------------------------------------------------------------------ */
/* The stamp                                                            */
/* ------------------------------------------------------------------ */

/** „Gemessen am 19.11.2026 an den Entwürfen der XXVIII. Gesetzgebungsperiode." */
export function measuredLineDe(r: GenauigkeitRecord = GENAUIGKEIT): string {
  const lands = r.laender.listFetchedAt ? ` Die Entwürfe der Bundesländer haben den Stand vom ${formatDateDe(r.laender.listFetchedAt.slice(0, 10))}.` : ''
  return `Gemessen am ${formatDateDe(r.date)} an den Entwürfen der ${r.gp}. Gesetzgebungsperiode.${lands}`
}

/* ------------------------------------------------------------------ */
/* What the figures do not say                                          */
/* ------------------------------------------------------------------ */

/**
 * „Was die Zahlen nicht sagen", each a bold sentence and one more (24.11.2026):
 * the bold lines alone say the limits, as the method texts' terms do.
 */
export const GENAUIGKEIT_GRENZEN: readonly GenauigkeitHinweis[] = [
  {
    lead: 'Keine Abweichung in einer Probe heißt nicht, dass es keine gibt.',
    text: benchCoversPeriod()
      ? 'Viele der geprüften Paragraphen stammen aus denselben Gesetzen und hängen zusammen, und an einem Teil dieser Gesetze wurden die Regeln entwickelt.'
      : 'Die geprüften Paragraphen stammen aus wenigen Gesetzen und hängen zusammen, und an denselben Gesetzen wurden die Regeln entwickelt.',
  },
  {
    lead: 'Laufende Entwürfe lassen sich nicht am Gesetz messen.',
    text: 'Ihr endgültiger Text steht noch nicht fest. Dort prüft der Monitor mit der Textgegenüberstellung des Ministeriums und dem Gesetzestext des Entwurfs.',
  },
  {
    lead: 'Eingebaut sind die Fehler, die wir kennen.',
    text: 'Einen Fehler einer Art, die niemand eingebaut hat, zählt keine dieser Zahlen.',
  },
  {
    lead: 'Texte der EU vergleicht der Monitor nicht.',
    text: 'Für einen Vorschlag der Kommission und den beschlossenen Rechtsakt gibt es keine amtliche Textgegenüberstellung. Welche Angaben zum Ablauf der Monitor von der EU liest, steht unter Datenlage.',
  },
  {
    lead: 'Die Zahlen bewerten keinen Entwurf.',
    text: 'Sie sagen, wie der Monitor liest und vergleicht. Ob ein Entwurf gut ist oder was eine Stellungnahme bewirkt hat, sagen sie nicht.',
  },
]
