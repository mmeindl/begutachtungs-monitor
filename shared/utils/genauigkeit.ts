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
  key: 'geltend' | 'anweisung' | 'ergebnis' | 'pruefung' | 'gezeigt'
  title: string
  /** Who supplies it; null for the outcome. */
  who: string | null
  text: string
}

export const GENAUIGKEIT_WEG: readonly WegSchritt[] = [
  {
    key: 'geltend',
    title: 'Der geltende Text',
    who: 'aus dem RIS, der amtlichen Gesetzesdatenbank des Bundes',
    text: 'So lautet der Paragraph, wenn die Begutachtung beginnt: die Zeit, in der alle zu einem Entwurf Stellung nehmen können.',
  },
  {
    key: 'anweisung',
    title: 'Die Anweisung des Entwurfs',
    who: 'vom Ministerium',
    text: 'Ein Entwurf, der ein Gesetz ändert, schreibt den neuen Text nicht hin. Er sagt, was zu ändern ist.',
  },
  {
    key: 'ergebnis',
    title: 'Unser Ergebnis',
    who: 'vom Monitor',
    text: 'Der Monitor wendet die Anweisung auf den geltenden Text an.',
  },
  {
    key: 'pruefung',
    title: 'Die Prüfung',
    who: 'mit der Textgegenüberstellung des Ministeriums',
    text: 'In der Textgegenüberstellung steht links der alte Text, rechts der neue. Der linke Text muss genau so im RIS stehen. Der rechte Text muss genau so in unserem Ergebnis stehen. Und unser Ergebnis darf nur dort vom alten Text abweichen, wo auch die Textgegenüberstellung eine Änderung zeigt.',
  },
  {
    key: 'gezeigt',
    title: 'Gezeigt',
    who: null,
    text: 'Sind alle Prüfungen bestanden, zeigt der Monitor den ganzen Paragraphen unter der Überschrift „Ganzer Paragraph in der vorgeschlagenen Fassung (nicht amtlich)“.',
  },
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
/** …a § shown on the draft's own text (`draftWitness`): its new text misread by our reader — a word lost, a figure, two words swapped, cut at a line's end (20.11.2026). */
export const RESULT_WITNESS = ['Payload'] as const

/** The annex: another §'s sentence in both columns alike, read as unchanged. By construction outside the gate, and outside every check after it. */
export const ANNEX_BLIND = ['U'] as const
/**
 * …and the gate's other classes: a sentence of another § in the right
 * column, a sentence of the left column lost, and the faults the gate was
 * never built to see (a figure, a label, a word, a sentence of the new text
 * gone, a kept sentence struck). A round records what the gate alone made of
 * them, and no sentence reads it: what the page does with a § is the mark's,
 * drawn from `chain` (22.11.2026). Listed so that a class the gate's record
 * gains needs a decision.
 */
export const ANNEX_GATE_ALONE = ['L', 'R-alt', 'R-neu', 'Zahl', 'Spalte-Bezeichnung', 'Wort', 'Satz-weg', 'R-weg'] as const

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
}

/**
 * One kind of comparison. What a reader sees at once is short — what it is
 * held against, the result, and the injected faults as bars, where a blind
 * spot is a short bar and needs no sentence to be found (19.11.2026; until
 * then five rows of running text per kind, with the figures inside the
 * sentences). The sentences are still there, under „Im Einzelnen".
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
  /**
   * What the blind spot means for someone who reads or quotes the comparison,
   * in one sentence under its bar (20.11.2026). A first-time reader took the
   * 0 % of a Land's comparison for one more bar — it is the page's most
   * important warning, and a short bar alone does not say what to do.
   */
  consequence: string | null
  /** Under „Im Einzelnen": the rule in full, the measurement, and what the check does not catch. */
  rule: string
  measured: string[]
  missed: string[]
}

export const GENAUIGKEIT_ROW_DE = {
  rule: 'Die Prüfung',
  measured: 'Gemessen',
  missed: 'Was sie übersieht',
} as const

/** A group of classes as one bar. */
function bar(label: string, faults: readonly GenauigkeitFault[], blind = false): FaultBar {
  return { label, ...total(faults), ...(blind ? { blind } : {}) }
}

type ChainFault = GenauigkeitRecord['annex']['chain']['pdf'][number]

/** A group of the chain's classes as one bar, with what catching did with the §. */
function chainBar(label: string, faults: readonly ChainFault[]): FaultBar {
  return { label, ...total(faults), withheld: faults.reduce((sum, f) => sum + f.withheld, 0) }
}

/**
 * The line under a bar: „1.063 von 1.339 eingebauten Fehlern gefangen", and
 * where a caught fault leaves the § on the page, how many do — „: 880 nicht
 * mehr gezeigt, 183 mit Vermerk gezeigt". Without it „gefangen" reads as „not
 * shown", which a wrong word in the ministry's annex never is (22.11.2026):
 * the § stays, marked „nicht bestätigt".
 */
export function faultNoteDe(fault: FaultBar): string {
  const caught = `${n(fault.caught)} von ${n(fault.tried)} eingebauten Fehlern gefangen`
  if (fault.withheld === undefined || fault.caught === 0) return caught
  const marked = fault.caught - fault.withheld
  if (fault.withheld === 0) return `${caught}: alle mit Vermerk gezeigt`
  if (marked === 0) return `${caught}: alle nicht mehr gezeigt`
  return `${caught}: ${n(fault.withheld)} nicht mehr gezeigt, ${n(marked)} mit Vermerk gezeigt`
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
  const annexBlind = classes(a.faults, ANNEX_BLIND)
  const blindBar = bar('Ein Satz von anderswo steht links und rechts gleich', annexBlind, true)
  const blindSentence = `Ein fremder Satz, der in beiden Spalten gleich steht: ${rangeDe(annexBlind)} zurückgehalten. Er ist nicht als Änderung markiert, steht aber beim falschen Paragraphen. Was beide Spalten gleich zeigen, gilt als unverändert und wird nicht geprüft.`
  // Whose deviation it is was never measured per case (20.11.2026): the sister check found most such §§ to be the monitor's own reading.
  const standingSentence = `Bei ${ofParagraphs(a.withheldStanding)} der nicht gezeigten steht die geltende Fassung der Gegenüberstellung so nicht im RIS. Ob die Beilage abweicht oder der Monitor sie falsch liest, entscheidet die Prüfung nicht; gezeigt wird der Paragraph in beiden Fällen nicht.`
  const frame = {
    id: 'gegenueberstellung',
    heading: 'Die Textgegenüberstellung des Ministeriums',
    pageName: 'Was ändert der Entwurf?',
    against: 'Geprüft am geltenden Recht im RIS und am Gesetzestext des Entwurfs.',
    consequence: 'So ein Satz sieht aus wie unveränderter Text, steht aber beim falschen Paragraphen. Unveränderten Text prüft der Monitor nicht.',
  }
  const { marks, chain } = a
  return {
    ...frame,
    result: [
      `Die Textgegenüberstellungen enthalten ${n(marks.shown + a.withheld)} Paragraphen. ${n(marks.clean)} zeigt der Monitor ohne Vermerk, ${n(marks.unconfirmed)} mit dem Vermerk „nicht bestätigt“, ${n(marks.unchecked)} mit dem Vermerk „nicht geprüft“, ${n(a.withheld)} zeigt er nicht.`,
      // Whose error the bars below are (20.11.2026): „übernimmt Wort für Wort" beside „ein Satz verloren" read as a contradiction.
      'Der Monitor übernimmt den Text Wort für Wort, muss ihn aber aus einem PDF oder einer Tabelle herauslesen. Dabei kann er ein Wort falsch lesen, und ein Satz kann verloren gehen oder beim falschen Paragraphen landen.',
      // What „gefangen" does with the § (22.11.2026): the page's opening says a caught fault is not shown, and here most are — marked.
      'Fällt der Prüfung im neuen Text etwas auf, zeigt der Monitor den Paragraphen trotzdem und setzt den Vermerk „nicht bestätigt“. Unter jedem Balken steht, wie oft der Paragraph danach nicht mehr gezeigt wird und wie oft er mit einem Vermerk stehen bleibt.',
    ],
    faults: [
      chainBar('Ein Wort oder eine Zahl im neuen Text falsch, ein neuer Satz fehlt', classes(chain, CHAIN_WORDING)),
      chainBar('Eine Absatz- oder Ziffernbezeichnung im neuen Text falsch', classes(chain, CHAIN_LABEL)),
      chainBar('Ein Satz, der bleibt, ist als gestrichen gezeigt', classes(chain, CHAIN_STRUCK)),
      chainBar('Ein Satz von anderswo steht in der rechten Spalte (neuer Text)', classes(chain, CHAIN_MISFILED)),
      chainBar('Ein Satz fehlt in der linken Spalte (alter Text)', classes(chain, CHAIN_LOST)),
      blindBar,
    ],
    rule:
      'Beide Spalten der Textgegenüberstellung übernimmt der Monitor Wort für Wort; die Markierung ist von uns. Die linke Spalte muss dem RIS am Stichtag entsprechen; was rechts als neu markiert ist, darf nicht schon im Gesetz stehen und muss im Gesetzestext des Entwurfs stehen. Sonst zeigt der Monitor den Paragraphen nicht. Danach hält er den neuen und den gestrichenen Text Wort für Wort gegen den Gesetzestext des Entwurfs. Geht das auf, bleibt der Paragraph ohne Vermerk. Geht es nicht auf, bleibt er nur dann ohne Vermerk, wenn der ganze Paragraph, den der Monitor selbst zusammensetzt, den Text der rechten Spalte ergibt, in der Gegenüberstellung kein Wortlaut fehlt, den der Entwurf nennt, und der Abgleich nicht allein an gestrichenem Text scheitert; sonst steht „nicht bestätigt“. Lässt sich weder das eine noch das andere prüfen, steht „nicht geprüft“.',
    measured: [
      `In ${n(a.drafts)} Entwürfen der ${r.gp}. Gesetzgebungsperiode: ${n(marks.clean)} Paragraphen ohne Vermerk gezeigt, ${n(marks.unconfirmed)} mit „nicht bestätigt“, ${n(marks.unchecked)} mit „nicht geprüft“, ${n(a.withheld)} nicht gezeigt.`,
      standingSentence,
      'Die Fehler sind in Paragraphen eingebaut, die der Monitor vorher ohne Vermerk gezeigt hat.',
    ],
    missed: [
      blindSentence,
      'Eine falsche Absatz- oder Ziffernbezeichnung fällt nicht auf, wenn der Entwurf dieselbe Bezeichnung an einer anderen Stelle des Paragraphen nennt.',
      'Ein Satz, der bleibt und als gestrichen gezeigt ist, fällt nicht auf, wenn der Entwurf an dieser Stelle selbst streicht, ohne den Wortlaut zu nennen („der letzte Satz entfällt“), oder den Absatz neu fasst.',
      'Fehlt ein Satz in der linken Spalte, steht er rechts als neu. Schreibt der Entwurf diesen Satz selbst, etwa weil er den Absatz neu fasst, geht der Abgleich mit dem Gesetzestext trotzdem auf.',
      // The one shape of a foreign sentence that passes (22.11.2026): both word-for-word checks take a heading at the foot of a § for the next §'s.
      'Steht am Ende des neuen Textes eine Überschrift von anderswo, fällt das nicht auf: Die Prüfung hält sie für die Überschrift des folgenden Paragraphen.',
      'Wie oft ein Vermerk zu Unrecht steht, zeigt dieser Test nicht: Er baut Fehler ein und zählt, wie viele auffallen.',
    ],
  }
}

export function genauigkeitArten(r: GenauigkeitRecord = GENAUIGKEIT): GenauigkeitArt[] {
  const bench = r.lesefassung.bench
  const witnessed = r.lesefassung.funnel.witnessed ?? 0
  const notLaw = bench.shown - bench.identical
  const blind = total(classes(r.lesefassung.faults, RESULT_BLIND))
  const blindComma = classes(r.lesefassung.faults, RESULT_BLIND_COMMA)
  const comma = total(blindComma)
  const breaches = (count: number) => (count === 0 ? 'kein Regelverstoß' : count === 1 ? 'ein Regelverstoß' : `${n(count)} Regelverstöße`)
  const st = r.stations
  const stFaults = st.faults?.length ? total(st.faults) : null
  const tgu = r.laender.tgu
  const ls = r.laender.stations
  const landWording = tgu.faults.filter((f) => (LAND_WORDING as readonly string[]).includes(f.key))
  const landOwn = tgu.faults.find((f) => f.key === LAND_OWN_DRAFT[0])!
  const landOther = tgu.faults.find((f) => f.key === LAND_OTHER_DRAFT[0])!

  return [
    {
      id: 'lesefassung',
      heading: 'Ganzer Paragraph in der vorgeschlagenen Fassung',
      against: 'Geprüft an der Textgegenüberstellung des Ministeriums und, wo sie abweicht, am Gesetzestext des Entwurfs als PDF.',
      result: [
        `Getestet an ${n(bench.bgbl)} Gesetzen, die schon kundgemacht sind, also im Bundesgesetzblatt veröffentlicht und gültig: Der Monitor hätte dort ${n(bench.shown)} ganze Paragraphen gezeigt, ${n(bench.identical)} davon stimmen Wort für Wort mit dem Gesetz überein.`,
        // The trade-off, in the open (20.11.2026): a first-time reader found it only under the fold, and it is what the share shown is paid for.
        `Die Prüfung ist streng. Ohne sie hätte der Monitor bei diesen Gesetzen ${n(bench.ungated.shown)} Paragraphen gezeigt, ${n(bench.ungated.shown - bench.ungated.identical)} davon mit Abweichungen vom Gesetz.`,
        ...(witnessed
          ? [`Bei ${n(witnessed)} gezeigten Paragraphen der Entwürfe lautet die Textgegenüberstellung anders als unser Ergebnis. Gezeigt sind sie, weil der Gesetzestext des Entwurfs auch in seiner PDF-Fassung genau unser Ergebnis sagt. Am Paragraphen stehen beide Wortlaute.`]
          : []),
      ],
      faults: [
        bar('Ein Wort, eine Zahl, ein Datum oder ein Verweis falsch', classes(r.lesefassung.faults, RESULT_WORDS)),
        bar('Ein Absatz zu viel, vertauscht oder ausgelassen', classes(r.lesefassung.faults, RESULT_STRUCTURE)),
        // The second reading (20.11.2026): the draft's instruction misread, where the annex contradicts and the draft's PDF decides.
        bar('Zweite Lesung am PDF: der neue Text des Entwurfs falsch gelesen', classes(r.lesefassung.faults, RESULT_WITNESS)),
        bar('Ein Textteil fehlt, und weder RIS noch Textgegenüberstellung enthalten ihn', classes(r.lesefassung.faults, RESULT_BLIND), true),
        bar('Ein Komma fehlt in Text, den der Entwurf unverändert lässt', blindComma, true),
      ],
      consequence: 'Fehlt ein Teil schon im RIS, kann er auch im ganzen Paragraphen des Monitors fehlen. In Text, den der Entwurf unverändert lässt, kann ein Komma fehlen.',
      rule:
        'Der Monitor setzt den Paragraphen selbst zusammen, aus dem geltenden Text im RIS und den Anweisungen des Entwurfs, und hält ihn gegen die Textgegenüberstellung des Ministeriums. Was sie als geltend zeigt, muss so im RIS stehen, was sie als neu zeigt, in unserem Ergebnis; ihre Absätze müssen in derselben Reihenfolge stehen, und unser Ergebnis darf nichts ändern, was sie nicht zeigt.',
      measured: [
        `Die Probe: ${n(bench.bgbl)} Bundesgesetzblätter, deren Text nach dem Inkrafttreten im RIS steht. Von ${n(bench.shown)} Paragraphen, die der Monitor gezeigt hätte, sind ${n(bench.identical)} Wort für Wort das Gesetz.${notLaw ? ` ${restSentence(bench)}` : ''} Ein Wort, das nicht im Gesetz steht, hat${bench.invented ? ` ${bench.invented === 1 ? 'einer' : n(bench.invented)}` : ' keiner'}.`,
        // What „ohne" leaves in force (20.11.2026): the rules that judge each instruction and its result by themselves still decide.
        `Ohne die Prüfung gegen die Gegenüberstellung – jeder Paragraph, bei dem sich alle Anweisungen anwenden ließen und das Ergebnis für sich stimmig ist – wären es ${n(bench.ungated.identical)} von ${n(bench.ungated.shown)} gewesen.`,
        // The §§ the second reading releases, on the same bench (20.11.2026): the page shows such §§ since that day, and the figure above left them out.
        ...(bench.witnessed?.shown
          ? [`Wo die Gegenüberstellung anders lautet, zeigt der Monitor einen Paragraphen nach einer zweiten Lesung am PDF: in dieser Probe ${n(bench.witnessed.shown)} weitere, ${bench.witnessed.identical === bench.witnessed.shown ? 'alle' : `${n(bench.witnessed.identical)} davon`} Wort für Wort das Gesetz.`]
          : []),
      ],
      missed: [
        `Fehlt unserem Ergebnis ein Teil, den auch der geltende Text im RIS nicht hat und den die Gegenüberstellung stillschweigend überspringt, fällt das kaum auf: ${blind.caught === 0 ? 'keiner' : n(blind.caught)} von ${n(blind.tried)} Versuchen gefangen.`,
        // Where the annex prints nothing that changes, the check compares the words, not their punctuation (21.11.2026).
        `Fehlt unserem Ergebnis ein Komma in Text, den der Entwurf unverändert lässt, fällt das kaum auf: ${comma.caught === 0 ? 'keiner' : n(comma.caught)} von ${n(comma.tried)} Versuchen gefangen. Dort vergleicht die Prüfung die Wörter, nicht die Satzzeichen.`,
        'Bei der zweiten Lesung am PDF: eine Ziffer in einem Platzhalter für ein künftiges Bundesgesetzblatt („BGBl. I Nr. xxx/2025“) vergleicht keine der Prüfungen.',
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
        `${n(st.pairs)} Vergleiche, ${breaches(st.breaches)}. Eine Regel lautet zum Beispiel: Jede als geändert markierte Stelle muss eine sichtbare Änderung zeigen.`,
        nullSentence(st),
      ],
      // Held to faults since 20.11.2026 (`station.ts --mutationen`): one token changed in a unit of a real text must read as a change of substance.
      faults: st.faults?.length ? [bar('Eine Ziffer, ein Zeichen oder ein Wort wie „nicht“ in einem der beiden Texte geändert', st.faults)] : [],
      consequence: null,
      rule:
        `Verglichen wird der Entwurf mit der Regierungsvorlage, diese mit den Fassungen von Ausschuss und Plenum, und der ganze Weg mit dem Bundesgesetzblatt. Eine dritte Fassung gibt es nicht: Ob ein Unterschied zwischen zwei verschiedenen Texten richtig erkannt ist, lässt sich an nichts Drittem prüfen. Geprüft wird, dass jeder Vergleich beide Texte vollständig wiedergibt und jede als geändert markierte Stelle eine sichtbare Änderung zeigt – und an Texten, die gleich sein müssen, dass der Vergleich nichts findet.${stFaults ? ' Dazu ändern wir in echten Texten je eine Stelle und prüfen, dass der Vergleich sie als Änderung zeigt und nicht als „redaktionell“ oder „unverändert“.' : ''}`,
      measured: [
        `${n(st.pairs)} Vergleiche zu ${n(st.drafts)} Entwürfen: ${st.breaches ? `${n(st.breaches)} verletzen` : 'keiner verletzt'} diese Regeln.`,
        ...(stFaults
          ? [`${n(stFaults.tried)} eingebaute Änderungen – eine Ziffer, ein Vorzeichen, „nicht“, „und“ statt „oder“ –: ${stFaults.caught === stFaults.tried ? 'Der Vergleich zeigt jede als Änderung' : `Der Vergleich zeigt ${n(stFaults.caught)} als Änderung`}.`]
          : []),
        `Texte, die gleich sein sollten – die letzte Fassung des Parlaments und das Bundesgesetzblatt, derselbe Entwurf aus zwei Quellen –: in ${n(st.nullUnits)} Einheiten ${n(st.nullResidues)} Unterschiede, ${st.nullSubstantive ? `alle als „redaktionell“ markiert bis auf ${n(st.nullSubstantive)}; ${st.nullSubstantive === 1 ? 'dieser erscheint' : 'diese erscheinen'} als Änderung` : 'alle als „redaktionell“ markiert'}. Ob ein Unterschied aus den Quellen kommt oder aus dem Lesen, entscheidet der Test nicht.`,
      ],
      missed: [
        'Liest der Monitor ein Wort in einem der beiden Texte falsch, zeigt er eine Änderung, die es nicht gibt; wie oft, zeigt der Test oben. Liest er dasselbe Wort in beiden Texten gleich falsch, bemerkt das niemand.',
      ],
    },
    {
      id: 'land-gegenueberstellung',
      heading: 'Die Textgegenüberstellung eines Bundeslandes',
      pageName: 'Was ändert der Entwurf?',
      against: `Geprüft am geltenden Recht im RIS und am Entwurf des Bundeslandes, bei ${landList(tgu.lands)}.`,
      result: [
        `Die Textgegenüberstellungen enthalten ${n(tgu.compared)} geänderte oder neue Paragraphen. Bei ${n(tgu.strict.held)} stimmt der neue Text Wort für Wort mit dem Entwurf des Bundeslandes überein. ${n(tgu.strict.differs)} weichen ab und werden nicht gezeigt.`,
        `Bei ${n(tgu.strict.unchecked)} Paragraphen nennt der Entwurf den neuen Text nicht so, dass sich Wort für Wort vergleichen lässt. Sie werden gezeigt, wenn der neue Text im Entwurf zumindest vorkommt.`,
      ],
      faults: [
        bar('Ein Satz aus dem Entwurf eines anderen Bundeslandes', [landOther]),
        bar('Ein Satz aus einem anderen Paragraphen desselben Entwurfs', [landOwn]),
        bar('Ein Wort oder eine Zahl falsch, ein Satz fehlt', landWording),
      ],
      consequence: `Bei den ${n(tgu.strict.unchecked)} Paragraphen ohne Wort-für-Wort-Vergleich bemerkt die Prüfung ein falsches Wort oder eine falsche Zahl nicht. Am Paragraphen steht nicht, ob er dazugehört: Vor dem Zitieren im Dokument des Bundeslandes nachsehen.`,
      rule: `Gelesen wird die Textgegenüberstellung eines Landes, wo der Monitor ihre Form lesen kann: bei ${landList(tgu.lands)}. Die linke Spalte wird gegen das geltende Recht im RIS gehalten, die rechte gegen den Entwurf des Landes: Was sie als neu zeigt, muss Wort für Wort und Zahl für Zahl der Wortlaut sein, den der Entwurf für den Paragraphen schreibt. Wo der Entwurf den Wortlaut nicht so nennt, muss das Neue zumindest im Entwurf vorkommen.`,
      measured: [
        `In ${n(tgu.documents)} Gegenüberstellungen mit ${n(tgu.compared)} geänderten oder neuen Paragraphen: ${n(tgu.strict.held)} stimmen Wort für Wort mit dem Entwurf überein, ${n(tgu.strict.differs)} weichen ab und werden nicht gezeigt, bei ${n(tgu.strict.unchecked)} ließ sich nur prüfen, ob das Neue im Entwurf vorkommt.`,
      ],
      missed: [
        `Ein einzelnes falsch gelesenes Wort, eine falsche Zahl, ein fehlender Satz: ${caughtOf(landWording)}. Unbemerkt bleiben sie vor allem bei den ${n(tgu.strict.unchecked)} Paragraphen, deren Wortlaut der Entwurf nicht so nennt, dass er sich Wort für Wort prüfen lässt.`,
        'Ein Wort, das in beiden Dokumenten des Bundeslandes gleich falsch steht, sieht die Prüfung nicht.',
      ],
    },
    {
      id: 'land-stationen',
      heading: 'Vergleich der Fassungen eines Bundeslandes',
      pageName: 'Vergleich der Fassungen',
      against: 'Geprüft mit festen Regeln. Einen dritten Text zum Gegenprüfen gibt es nicht.',
      result: [
        `${n(ls.compared)} Vergleiche, ${breaches(ls.hits)}.`,
        `${n(ls.withheld)} Anweisungen zeigt der Monitor nicht, weil er den angekündigten Text nicht an seiner Stelle fand. Bei ${n(ls.unread)} steht „Nicht lesbar“.`,
      ],
      faults: [],
      consequence: null,
      rule:
        'Verglichen werden Entwurf, Regierungsvorlage, Ausschussbericht und Landesgesetzblatt eines Landes, gelesen aus den PDFs von Land und Landtag. Wie beim Bund gibt es keine dritte Fassung. Geprüft wird, dass kein Vergleich eine Anordnung doppelt zeigt, eine Kopfzeile des Dokuments als Text liest oder einen Teil einer Anordnung als eigene, neue Anordnung meldet; und ob eine Anordnung den Text, den sie ankündigt – etwa eine Zeile einer Tabelle –, in beiden Dokumenten an ihrer Stelle trägt.',
      measured: [
        `${n(ls.compared)} Vergleiche: ${ls.hits ? `${n(ls.hits)} Verstöße gegen diese Regeln` : 'kein Verstoß gegen diese Regeln'}.${ls.accepted ? ` ${ls.accepted === 1 ? 'Eine Stelle sieht' : `${n(ls.accepted)} Stellen sehen`} aus wie einer und ${ls.accepted === 1 ? 'steht' : 'stehen'} so in den Dokumenten selbst.` : ''}`,
        `Bei ${n(ls.withheld)} Anordnungen in ${n(ls.withheldPairs)} Vergleichen fand der Monitor den angekündigten Text in einem der beiden Dokumente nicht an seiner Stelle; sie stehen als „nicht gezeigt“ beim Gesetz. Bei ${n(ls.unread)} in ${n(ls.unreadPairs)} Vergleichen fehlt er in beiden; verglichen ist dort der Rest der Anordnung, und „Nicht lesbar“ sagt es.`,
      ],
      missed: ['Liest der Monitor dasselbe Wort in beiden Dokumenten gleich falsch, bemerkt das niemand. Wie oft das vorkommt, lässt sich hier nicht messen: Anders als beim Bund gibt es denselben Text nicht aus zwei Quellen.'],
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
  const editorial = st.nullResidues - st.nullSubstantive
  if (st.nullResidues === 0) return `Im Test mit Texten, die gleich sein sollten, fand der Monitor in ${n(st.nullUnits)} Textteilen keinen Unterschied.`
  const substantive = st.nullSubstantive === 0 ? 'keiner' : st.nullSubstantive === 1 ? 'einer' : n(st.nullSubstantive)
  return `Im Test mit Texten, die gleich sein sollten, fand der Monitor in ${n(st.nullUnits)} Textteilen ${n(st.nullResidues)} Unterschiede: ${n(editorial)} nur in Schreibweise oder Satzzeichen, als „redaktionell“ markiert, ${substantive} als Änderung.`
}

/** „Einem fehlt ein Teil.", „2 fehlt ein Teil, einer ist nur halb angewendet." */
function restSentence(bench: GenauigkeitRecord['lesefassung']['bench']): string {
  const parts: string[] = []
  if (bench.incomplete) parts.push(`${bench.incomplete === 1 ? 'Einem' : n(bench.incomplete)} fehlt ein Teil`)
  if (bench.otherwise) parts.push(`${bench.otherwise === 1 ? 'einer' : n(bench.otherwise)} ${bench.otherwise === 1 ? 'ist' : 'sind'} aus einem anderen Grund nicht das Gesetz`)
  const sentence = parts.join(', ')
  return sentence ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.` : ''
}

/* ------------------------------------------------------------------ */
/* In short                                                             */
/* ------------------------------------------------------------------ */

/**
 * The page in six sentences, at its top (20.11.2026): what the measurement
 * shows, and what stays for the reader to check. A first-time reader — an
 * NGO's staff member who writes Stellungnahmen — came with „what can I
 * quote, and what do I have to look up myself?" and found the answer
 * nowhere: the page explained the method and never spoke to someone who has
 * to decide what to rely on. No new figure stands here; each is one of the
 * sections below.
 */
export function genauigkeitKurz(r: GenauigkeitRecord = GENAUIGKEIT): { shows: string[]; check: string[] } {
  const bench = r.lesefassung.bench
  const st = r.stations
  const tgu = r.laender.tgu
  return {
    shows: [
      'Zu einem Entwurf gehört meist eine Textgegenüberstellung des Ministeriums: eine Tabelle mit altem und neuem Text nebeneinander. Der Monitor übernimmt ihren Text Wort für Wort und markiert die Änderungen in Farbe. Lesen muss er sie aus einem PDF oder einer Tabelle; dabei kann ein Satz verloren gehen oder beim falschen Paragraphen landen.',
      `Zusätzlich schreibt der Monitor ganze Paragraphen so aus, wie sie nach der Änderung lauten würden. Getestet an ${n(bench.bgbl)} Gesetzen, die inzwischen gültig sind: Der Monitor hätte dort ${n(bench.shown)} ganze Paragraphen gezeigt, ${n(bench.identical)} davon stimmen Wort für Wort mit dem Gesetz überein.`,
      `Der Monitor vergleicht auch, wie sich ein Bundesgesetz vom Entwurf bis zum Beschluss ändert. ${nullSentence(st)}`,
    ],
    check: [
      // Two marks since 22.11.2026, and „nicht geprüft … aber nicht bestätigt" would read as the other one's name.
      'Ein Paragraph mit dem Vermerk „nicht geprüft“ oder „nicht bestätigt“ ist gezeigt, aber die Prüfung steht nicht hinter ihm. Was der Entwurf ändern will, sagt sein Gesetzestext.',
      `Bei Entwürfen der Bundesländer ist der neue Text bei ${n(tgu.strict.held)} von ${n(tgu.shown)} gezeigten Paragraphen Wort für Wort am Entwurf geprüft, bei den übrigen nicht. Vor dem Zitieren im Dokument des Bundeslandes nachsehen.`,
      'Der Monitor ist kein amtliches Angebot. Zitiert wird aus dem verlinkten Original.',
    ],
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
 * Why a § ends there, in one sentence at the bar: what the monitor does not
 * do, and that it is on purpose. Only what holds for every § of the group;
 * the single reasons are folded under it. Each is worded as the case that
 * differs from the example above it (20.11.2026): „stimmen nicht überein"
 * right under an example that matches read to two first-time readers as
 * „this example failed".
 */
export const FUNNEL_GROUP_WHY_DE: Record<Exclude<FunnelGroup, 'nichts'>, string> = {
  geltend: 'Manchmal findet der Monitor das Gesetz oder den Paragraphen im RIS nicht eindeutig. Dann schreibt er den ganzen Paragraphen nicht aus.',
  anweisung: 'Nicht jede Anweisung ist so einfach wie diese. Der Monitor wendet eine Anweisung nur an, wenn er sie sicher lesen kann und sie im geltenden Text auf genau eine Stelle passt. Sonst rät er nicht.',
  pruefung: 'Passen unser Ergebnis und die Textgegenüberstellung nicht zusammen, liest der Monitor den Gesetzestext des Entwurfs ein zweites Mal, aus seinem PDF. Steht dort genau unser Ergebnis, zeigt er den Paragraphen und nennt beide Wortlaute. Sonst zeigt er ihn nicht.',
  beilage: 'Oft zeigt die Textgegenüberstellung nur Ausschnitte eines Paragraphen, oder ihr geltender Text lässt sich im RIS nicht wiederfinden. Dann gibt es nichts, womit der Monitor sein Ergebnis vergleichen kann.',
}

export const FUNNEL_GROUP_DE: Record<FunnelGroup, string> = {
  geltend: 'Geltender Text nicht eindeutig gefunden',
  anweisung: 'Anweisung nicht sicher anwendbar',
  pruefung: 'Prüfung nicht bestanden',
  beilage: 'Nichts zum Vergleichen in der Textgegenüberstellung',
  nichts: 'Nichts zusammenzusetzen',
}

/** The step of the way a group ends at; `nichts` at none — such a § never sets out. */
export const FUNNEL_STEP_OF: Record<Exclude<FunnelGroup, 'nichts'>, WegSchritt['key']> = {
  geltend: 'geltend',
  anweisung: 'anweisung',
  pruefung: 'pruefung',
  beilage: 'pruefung',
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
  /** The groups ending at each step, largest first. */
  exits: Partial<Record<WegSchritt['key'], FunnelRow[]>>
  /** Repealed or newly enacted: outside the whole. */
  outside: number
}

export function wegFunnel(funnel: GenauigkeitRecord['lesefassung']['funnel'] = GENAUIGKEIT.lesefassung.funnel): WegFunnel {
  const rows = funnelRows(funnel)
  const outside = rows.find((r) => r.key === 'nichts')?.count ?? 0
  const exits: WegFunnel['exits'] = {}
  for (const row of rows) {
    if (row.key === 'gezeigt' || row.key === 'nichts') continue
    ;(exits[FUNNEL_STEP_OF[row.key]] ??= []).push(row)
  }
  return { total: funnel.changed - outside, shown: funnel.shown, witnessed: funnel.witnessed ?? 0, exits, outside }
}

/* ------------------------------------------------------------------ */
/* The stamp                                                            */
/* ------------------------------------------------------------------ */

/** „Gemessen am 19.11.2026 an den Entwürfen der XXVIII. Gesetzgebungsperiode." */
export function measuredLineDe(r: GenauigkeitRecord = GENAUIGKEIT): string {
  return `Gemessen am ${formatDateDe(r.date)} an den Entwürfen der ${r.gp}. Gesetzgebungsperiode.`
}

/* ------------------------------------------------------------------ */
/* What the figures do not say                                          */
/* ------------------------------------------------------------------ */

/** „Was die Zahlen nicht sagen", one sentence each. */
export const GENAUIGKEIT_GRENZEN: readonly string[] = [
  'Am fertigen Gesetz messen lässt sich nur, wo ein Gesetz schon kundgemacht ist. Bei einem laufenden Entwurf steht der endgültige Text noch nicht fest; dort prüft der Monitor mit der Textgegenüberstellung des Ministeriums und dem Gesetzestext des Entwurfs.',
  'Eingebaut sind die Fehler, die wir kennen. Einen Fehler einer Art, die niemand eingebaut hat, zählt keine dieser Zahlen.',
  'Texte der EU vergleicht der Monitor nicht. Für einen Vorschlag der Kommission und den beschlossenen Rechtsakt, etwa eine Richtlinie, gibt es keine amtliche Textgegenüberstellung. Von der EU liest der Monitor Angaben zum Ablauf, keine Texte; welche, steht unter Datenlage.',
  'Die Zahlen sagen, wie oft der Monitor richtig liest und vergleicht. Ob ein Entwurf gut ist oder was eine Stellungnahme bewirkt hat, sagen sie nicht.',
]
