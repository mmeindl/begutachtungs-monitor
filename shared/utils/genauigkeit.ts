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
    who: 'aus dem RIS, dem Rechtsinformationssystem des Bundes',
    text: 'Der Paragraph, wie er am Beginn der Begutachtung gilt.',
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
    who: 'gegen die Textgegenüberstellung des Ministeriums',
    text: 'Sie stellt den Paragraphen vorher und nachher nebeneinander. Was links steht, muss so im RIS stehen, was rechts steht, in unserem Ergebnis; und unser Ergebnis darf nichts ändern, was sie nicht zeigt.',
  },
  {
    key: 'gezeigt',
    title: 'Gezeigt',
    who: null,
    text: 'Geht jede Prüfung auf, steht unter dem Paragraphen „Ganzer Paragraph in der vorgeschlagenen Fassung (nicht amtlich)“.',
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
function classes(paths: GenauigkeitPaths<GenauigkeitFault[]>, keys: readonly string[]): GenauigkeitFault[] {
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

/** The Lesefassung's result, one word or figure wrong (`faultInjection.ts`, „Wortfehler im Ergebnis"). */
export const RESULT_WORDS = ['Wort-weg', 'Wort-weg-Sinn', 'Wort-neu', 'Wort-tausch', 'Zahl', 'Datum', 'Verweis', 'Ziffer-Reihe', 'Überschrift', 'Ungedruckt-weg', 'Ungedruckt-neu', 'Ungedruckt-Zahl'] as const
/** …its structure wrong: a unit too many, two Absätze swapped, a unit missing, a struck Absatz back. */
export const RESULT_STRUCTURE = ['E', 'E-neben', 'Reihe', 'Fehlt', 'Lücke', 'Zurück', 'Zurück-gleich'] as const
/** …a unit missing that RIS lacks too and the annex skips in silence: a blind spot by construction. */
export const RESULT_BLIND = ['Lücke-beide'] as const
/** …a § shown on the draft's own text (`draftWitness`): its new text misread by our reader — a word lost, a figure, two words swapped, cut at a line's end (20.11.2026). */
export const RESULT_WITNESS = ['Payload'] as const

/** The annex: a sentence of another § in the right column, old or proposed text. */
export const ANNEX_MISFILED = ['R-alt', 'R-neu'] as const
/** …a sentence of the left column lost, so standing law reads as new. */
export const ANNEX_LOST = ['L'] as const
/** …another §'s sentence in both columns alike, read as unchanged: by construction outside the gate. */
export const ANNEX_BLIND = ['U'] as const

/** A Land's right column: a sentence of another § of the same draft, of another Land's draft. */
export const LAND_OWN_DRAFT = ['R-neu'] as const
export const LAND_OTHER_DRAFT = ['R-fremd'] as const
/** …a figure, a word or a sentence changed: below the guard's reach by design. */
export const LAND_BLIND = ['Zahl', 'Wort', 'Satz weg'] as const

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
  /** „Geprüft gegen …", closed by the page: what the check holds it against, in a few words. */
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
  missed: 'Was sie nicht fängt',
} as const

/** A group of classes as one bar. */
function bar(label: string, faults: readonly GenauigkeitFault[], blind = false): FaultBar {
  return { label, ...total(faults), ...(blind ? { blind } : {}) }
}

/** „Oberösterreich, Salzburg, Tirol und Wien". */
export function landList(codes: readonly string[]): string {
  const names = codes.map((c) => LAND_NAME[c as LandCode] ?? c)
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
}

export function genauigkeitArten(r: GenauigkeitRecord = GENAUIGKEIT): GenauigkeitArt[] {
  const bench = r.lesefassung.bench
  const notLaw = bench.shown - bench.identical
  const blind = total(classes(r.lesefassung.faults, RESULT_BLIND))
  const annexBlind = classes(r.annex.faults, ANNEX_BLIND)
  const breaches = (count: number) => (count === 0 ? 'kein Regelverstoß' : count === 1 ? 'ein Regelverstoß' : `${n(count)} Regelverstöße`)
  const st = r.stations
  const tgu = r.laender.tgu
  const ls = r.laender.stations
  const landBlind = tgu.faults.filter((f) => (LAND_BLIND as readonly string[]).includes(f.key))
  const landOwn = tgu.faults.find((f) => f.key === LAND_OWN_DRAFT[0])!
  const landOther = tgu.faults.find((f) => f.key === LAND_OTHER_DRAFT[0])!

  return [
    {
      id: 'lesefassung',
      heading: 'Ganzer Paragraph in der vorgeschlagenen Fassung',
      against: 'die Textgegenüberstellung des Ministeriums',
      result: [
        `In einer Probe von ${n(bench.bgbl)} Bundesgesetzblättern waren ${n(bench.identical)} von ${n(bench.shown)} Paragraphen, die der Monitor gezeigt hätte, Wort für Wort das spätere Gesetz.`,
        // The trade-off, in the open (20.11.2026): a first-time reader found it only under the fold, and it is what the half shown is paid for.
        `Ohne die Prüfung hätte der Monitor ${n(bench.ungated.shown)} gezeigt, davon ${n(bench.ungated.identical)} Wort für Wort das Gesetz.`,
      ],
      faults: [
        bar('Ein Wort, eine Zahl, ein Datum oder ein Verweis falsch', classes(r.lesefassung.faults, RESULT_WORDS)),
        bar('Ein Absatz zu viel, vertauscht oder ausgelassen', classes(r.lesefassung.faults, RESULT_STRUCTURE)),
        bar('Ein Teil fehlt, den weder das RIS noch die Textgegenüberstellung zeigt', classes(r.lesefassung.faults, RESULT_BLIND), true),
      ],
      consequence: 'Fehlt ein Teil schon im geltenden Text des RIS, kann er auch im gezeigten Paragraphen fehlen.',
      rule:
        'Der Monitor setzt den Paragraphen selbst zusammen, aus dem geltenden Text im RIS und den Anweisungen des Entwurfs, und hält ihn gegen die Textgegenüberstellung des Ministeriums. Was sie als geltend zeigt, muss so im RIS stehen, was sie als neu zeigt, in unserem Ergebnis; ihre Absätze müssen in derselben Reihenfolge stehen, und unser Ergebnis darf nichts ändern, was sie nicht zeigt.',
      measured: [
        `Die Probe: ${n(bench.bgbl)} Bundesgesetzblätter, deren Text nach dem Inkrafttreten im RIS steht. Von ${n(bench.shown)} Paragraphen, die der Monitor gezeigt hätte, sind ${n(bench.identical)} Wort für Wort das Gesetz.${notLaw ? ` ${restSentence(bench)}` : ''} Ein Wort, das nicht im Gesetz steht, hat${bench.invented ? ` ${bench.invented === 1 ? 'einer' : n(bench.invented)}` : ' keiner'}.`,
        `Ohne die Prüfung gegen die Gegenüberstellung – jeder Paragraph, bei dem sich alle Anweisungen anwenden ließen – wären es ${n(bench.ungated.identical)} von ${n(bench.ungated.shown)} gewesen.`,
      ],
      missed: [
        `Fehlt unserem Ergebnis ein Teil, den auch der geltende Text im RIS nicht hat und den die Gegenüberstellung stillschweigend überspringt, fällt das kaum auf: ${blind.caught === 0 ? 'keiner' : n(blind.caught)} von ${n(blind.tried)} Versuchen gefangen.`,
      ],
    },
    {
      id: 'gegenueberstellung',
      heading: 'Die Textgegenüberstellung des Ministeriums',
      pageName: 'Was ändert der Entwurf?',
      against: 'das geltende Recht im RIS und den Gesetzestext des Entwurfs',
      result: [
        `${n(r.annex.confirmed)} Paragraphen bestätigt, ${n(r.annex.unchecked)} mit der Marke „nicht geprüft“ gezeigt, ${n(r.annex.withheld)} nicht gezeigt.`,
        // Whose error the bars below are (20.11.2026): „übernimmt Wort für Wort" beside „ein Satz verloren" read as a contradiction.
        'Wort für Wort übernommen heißt nicht fehlerfrei gelesen: Beim Lesen aus einem PDF oder einer Tabelle kann ein Satz verloren gehen oder beim falschen Paragraphen landen.',
      ],
      faults: [
        bar('Ein fremder Satz in der rechten Spalte', classes(r.annex.faults, ANNEX_MISFILED)),
        bar('Ein Satz der linken Spalte verloren', classes(r.annex.faults, ANNEX_LOST)),
        bar('Ein fremder Satz, in beiden Spalten gleich', annexBlind, true),
      ],
      consequence: 'Ein Satz kann beim falschen Paragraphen stehen, ohne als Änderung markiert zu sein.',
      rule:
        'Beide Spalten der Textgegenüberstellung übernimmt der Monitor Wort für Wort; die Markierung ist von uns. Die linke Spalte muss dem RIS am Stichtag entsprechen; was rechts als neu markiert ist, darf nicht schon im Gesetz stehen und muss im Gesetzestext des Entwurfs stehen.',
      measured: [
        `In ${n(r.annex.drafts)} Entwürfen der ${r.gp}. Gesetzgebungsperiode: ${n(r.annex.confirmed)} Paragraphen bestätigt, ${n(r.annex.withheld)} nicht gezeigt, und ${n(r.annex.unchecked)} gezeigt, ohne dass die Prüfung sie bestätigen konnte – etwa weil sie nur neuen Text enthalten, dem nichts Geltendes gegenübersteht.`,
        `Bei ${ofParagraphs(r.annex.withheldStanding)} der nicht gezeigten steht schon die geltende Fassung der Gegenüberstellung so nicht im RIS: ein Fehler der Beilage, den die Prüfung fängt.`,
      ],
      missed: [
        `Ein fremder Satz, der in beiden Spalten gleich steht: ${rangeDe(annexBlind)} zurückgehalten. Er ist nicht als Änderung markiert, steht aber beim falschen Paragraphen. Was beide Spalten gleich zeigen, gilt als unverändert und wird nicht geprüft.`,
      ],
    },
    {
      id: 'stationen',
      heading: 'Vom Entwurf zum Gesetz: Vergleich der Fassungen',
      pageName: 'Vergleich der Fassungen',
      against: 'feste Regeln und Texte, die gleich sein müssen',
      result: [
        `${n(st.pairs)} Vergleiche, ${breaches(st.breaches)}.`,
        `Von ${n(st.nullUnits)} Textteilen, die gleich sein müssen, ${st.nullSubstantive === 1 ? 'erscheint einer' : `erscheinen ${st.nullSubstantive ? n(st.nullSubstantive) : 'keine'}`} als geändert.`,
      ],
      faults: [],
      consequence: null,
      rule:
        'Verglichen wird der Entwurf mit der Regierungsvorlage, diese mit den Fassungen von Ausschuss und Plenum, und der ganze Weg mit dem Bundesgesetzblatt. Eine dritte Fassung gibt es nicht: Ob ein Unterschied zwischen zwei verschiedenen Texten richtig erkannt ist, lässt sich an nichts Drittem prüfen. Geprüft wird, dass jeder Vergleich beide Texte vollständig wiedergibt und jede als geändert markierte Stelle eine sichtbare Änderung zeigt – und an Texten, die gleich sein müssen, dass der Vergleich nichts findet.',
      measured: [
        `${n(st.pairs)} Vergleiche zu ${n(st.drafts)} Entwürfen: ${st.breaches ? `${n(st.breaches)} verletzen` : 'keiner verletzt'} diese Regeln.`,
        `Texte, die gleich sein müssen – die letzte Fassung des Parlaments und das Bundesgesetzblatt, derselbe Entwurf aus zwei Quellen –: in ${n(st.nullUnits)} Einheiten ${n(st.nullResidues)} Unterschiede, ${st.nullSubstantive ? `alle als „redaktionell“ markiert bis auf ${n(st.nullSubstantive)}; ${st.nullSubstantive === 1 ? 'dieser erscheint' : 'diese erscheinen'} als Änderung` : 'alle als „redaktionell“ markiert'}.`,
      ],
      missed: [
        'Liest der Monitor ein Wort in einem der beiden Texte falsch, erscheint eine Änderung, die keine ist; wie oft, zeigen die Texte, die gleich sein müssen. Liest er es in beiden gleich falsch, sieht man im Vergleich nichts davon.',
      ],
    },
    {
      id: 'land-gegenueberstellung',
      heading: 'Die Textgegenüberstellung eines Landes',
      pageName: 'Was ändert der Entwurf?',
      against: `das geltende Recht im RIS und den Entwurf des Landes, bei ${landList(tgu.lands)}`,
      result: [`Von ${n(tgu.shown)} gezeigten Paragraphen ließen sich ${n(tgu.judged)} prüfen; bei ${tgu.found === tgu.judged ? 'allen' : n(tgu.found)} steht das Neue im Entwurf.`],
      faults: [
        bar('Ein Satz aus dem Entwurf eines anderen Landes', [landOther]),
        bar('Ein Satz eines anderen Paragraphen desselben Entwurfs', [landOwn]),
        bar('Ein Wort oder eine Zahl falsch, ein Satz fehlt', landBlind, true),
      ],
      consequence: 'Ein falsch gelesenes Wort oder eine falsche Zahl bleibt unbemerkt: Vor dem Zitieren im Dokument des Landes nachsehen.',
      rule: `Gelesen wird die Textgegenüberstellung eines Landes, wo der Monitor ihre Form lesen kann: bei ${landList(tgu.lands)}. Die linke Spalte wird gegen das geltende Recht im RIS gehalten, die rechte gegen den Entwurf des Landes: Was sie als neu zeigt, muss im Entwurf stehen.`,
      measured: [
        `In ${n(tgu.documents)} Gegenüberstellungen mit ${n(tgu.shown)} gezeigten Paragraphen: Bei ${n(tgu.found)} von ${n(tgu.judged)} Paragraphen, die genug neue Wörter für die Prüfung haben, steht das Neue im Entwurf.`,
      ],
      missed: [
        `Ein einzelnes falsch gelesenes Wort, eine falsche Zahl, ein fehlender Satz: ${caughtOf(landBlind)}. Die Prüfung fragt, ob das Neue im Entwurf steht, nicht, ob es genau so dasteht.`,
      ],
    },
    {
      id: 'land-stationen',
      heading: 'Vergleich der Fassungen eines Landes',
      pageName: 'Vergleich der Fassungen',
      against: 'feste Regeln; eine dritte Fassung gibt es nicht',
      result: [
        `${n(ls.compared)} Vergleiche, ${breaches(ls.hits)}.`,
        `${n(ls.withheld)} Änderungsanordnungen nicht gezeigt, ${n(ls.unread)} als „Nicht lesbar“ benannt.`,
      ],
      faults: [],
      consequence: null,
      rule:
        'Verglichen werden Entwurf, Regierungsvorlage, Ausschussbericht und Landesgesetzblatt eines Landes, gelesen aus den PDFs von Land und Landtag. Wie beim Bund gibt es keine dritte Fassung. Geprüft wird, dass kein Vergleich eine Anordnung doppelt zeigt, eine Kopfzeile des Dokuments als Text liest oder einen Teil einer Anordnung als eigene, neue Anordnung meldet; und ob eine Anordnung den Text, den sie ankündigt – etwa eine Zeile einer Tabelle –, in beiden Dokumenten an ihrer Stelle trägt.',
      measured: [
        `${n(ls.compared)} Vergleiche: ${ls.hits ? `${n(ls.hits)} Verstöße gegen diese Regeln` : 'kein Verstoß gegen diese Regeln'}.${ls.accepted ? ` ${ls.accepted === 1 ? 'Eine Stelle sieht' : `${n(ls.accepted)} Stellen sehen`} aus wie einer und ${ls.accepted === 1 ? 'steht' : 'stehen'} so in den Dokumenten selbst.` : ''}`,
        `Bei ${n(ls.withheld)} Anordnungen in ${n(ls.withheldPairs)} Vergleichen fand der Monitor den angekündigten Text in einem der beiden Dokumente nicht an seiner Stelle; sie stehen als „nicht gezeigt“ beim Gesetz. Bei ${n(ls.unread)} in ${n(ls.unreadPairs)} Vergleichen fehlt er in beiden; verglichen ist dort der Rest der Anordnung, und „Nicht lesbar“ sagt es.`,
      ],
      missed: ['Ein Wort, das beide Dokumente gleich falsch lesen, bleibt unentdeckt. Zwei Quellen desselben Textes, an denen sich das messen ließe wie beim Bund, gibt es hier nicht.'],
    },
  ]
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
  const landBlind = total(r.laender.tgu.faults.filter((f) => (LAND_BLIND as readonly string[]).includes(f.key)))
  return {
    shows: [
      // The display a newcomer has seen comes first, with what it is (20.11.2026).
      'Die Textgegenüberstellung des Ministeriums – alter und neuer Text nebeneinander, auf der Seite eines Entwurfs farbig markiert – übernimmt der Monitor Wort für Wort. Vom Monitor ist nur die Markierung.',
      `Den ganzen Paragraphen in der vorgeschlagenen Fassung setzt der Monitor selbst zusammen. In einer Probe von ${n(bench.bgbl)} Bundesgesetzblättern waren ${n(bench.identical)} von ${n(bench.shown)} Paragraphen, die er gezeigt hätte, Wort für Wort das spätere Gesetz.`,
      `Vergleich der Fassungen beim Bund: In Texten, die gleich sein müssen, etwa die letzte Fassung des Parlaments und das Bundesgesetzblatt, ${st.nullSubstantive === 1 ? 'erscheint einer' : `erscheinen ${st.nullSubstantive ? n(st.nullSubstantive) : 'keine'}`} von ${n(st.nullUnits)} Textteilen als geändert.`,
    ],
    check: [
      'Ein Paragraph mit der Marke „nicht geprüft“ ist gezeigt, aber nicht bestätigt.',
      `Bei den Ländern fängt die Prüfung ein falsch gelesenes Wort oder eine falsche Zahl ${landBlind.caught === 0 ? 'nicht' : 'selten'}: Vor dem Zitieren im Dokument des Landes nachsehen.`,
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
  geltend: 'Findet der Monitor das geänderte Gesetz oder den Paragraphen im RIS nicht eindeutig, setzt er nichts zusammen.',
  anweisung: 'Nicht jede Anweisung lässt sich so anwenden wie diese. Der Monitor wendet eine nur an, wenn er sie sicher lesen kann und sie im geltenden Text genau eine Stelle trifft. Sonst rät er nicht.',
  pruefung: 'Stimmen unser Ergebnis und die Textgegenüberstellung nicht überein, zeigt der Monitor den Paragraphen nicht. Wer von beiden abweicht, sagt das allein nicht.',
  beilage: 'Oft zeigt die Textgegenüberstellung nur Auszüge. Was sie nicht zeigt, kann sie nicht bestätigen.',
}

export const FUNNEL_GROUP_DE: Record<FunnelGroup, string> = {
  geltend: 'Geltender Text nicht verwendbar',
  anweisung: 'Anweisung nicht sicher anwendbar',
  pruefung: 'Prüfung nicht bestanden',
  beilage: 'Die Textgegenüberstellung bestätigt hier nichts',
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
  'Gemessen ist an Gesetzen, die schon kundgemacht sind und deren Text danach feststeht. Zu einem Entwurf gibt es diesen Text noch nicht; dort bleibt die Prüfung gegen die Gegenüberstellung des Ministeriums.',
  'Eingebaut sind die Fehler, die wir kennen. Einen Fehler einer Art, die niemand eingebaut hat, zählt keine dieser Zahlen.',
  'Texte der EU vergleicht der Monitor nicht: Zu einem Vorschlag der Kommission und dem beschlossenen Rechtsakt gibt es keine amtliche Textgegenüberstellung, und von der EU liest der Monitor Angaben zum Verfahren, keine Texte. Was er dort liest, steht unter Datenlage.',
  'Die Zahlen sagen, wie oft der Monitor richtig liest und vergleicht. Ob ein Entwurf gut ist oder was eine Stellungnahme bewirkt hat, sagen sie nicht.',
]
