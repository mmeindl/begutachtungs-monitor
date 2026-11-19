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

/** Where the harnesses stand, linked from „Wie wir messen". */
export const GENAUIGKEIT_CODE_BASE = 'https://github.com/mmeindl/begutachtungs-monitor/blob/main/'

/* ------------------------------------------------------------------ */
/* One § on its way                                                     */
/* ------------------------------------------------------------------ */

/**
 * The steps a Lesefassung goes through, each with who supplies it and what
 * can go wrong there — the page's answer to „where can an error come in".
 * The Lesefassung and not the annex, because it is the one the monitor
 * makes itself from three parts, and every other comparison is a part of
 * it: the annex is step 4, a station comparison is step 3 without step 4.
 */
export interface WegSchritt {
  key: 'geltend' | 'anweisung' | 'ergebnis' | 'pruefung' | 'gezeigt'
  title: string
  /** Who supplies it; null for the outcome. */
  who: string | null
  text: string
  /** What can go wrong here, and what the monitor does then; null where nothing is made. */
  risk: string | null
}

export const GENAUIGKEIT_WEG: readonly WegSchritt[] = [
  {
    key: 'geltend',
    title: 'Der geltende Text',
    who: 'aus dem RIS',
    text: 'Der Paragraph, wie er am Beginn der Begutachtung gilt.',
    risk: 'Das RIS führt den Paragraphen nicht, nicht eindeutig oder in einer Form, die der Monitor nicht liest, etwa als Tabelle. Dann setzt er nichts zusammen.',
  },
  {
    key: 'anweisung',
    title: 'Die Anweisung des Entwurfs',
    who: 'vom Ministerium',
    text: 'Ein Entwurf, der ein Gesetz ändert, schreibt den neuen Text nicht hin. Er sagt, was zu ändern ist.',
    risk: 'Der Monitor kann eine Anweisung nicht sicher anwenden, etwa weil die Textstelle, die sie ersetzen soll, im geltenden Text nicht oder zweimal steht. Dann wendet er sie nicht an, statt zu raten.',
  },
  {
    key: 'ergebnis',
    title: 'Unser Ergebnis',
    who: 'vom Monitor',
    text: 'Der Monitor wendet die Anweisung auf den geltenden Text an.',
    risk: 'Ein Wort zu viel oder zu wenig, eine verfehlte Stelle: Solche Fehler findet erst die Prüfung.',
  },
  {
    key: 'pruefung',
    title: 'Die Prüfung',
    who: 'gegen die Textgegenüberstellung des Ministeriums',
    text: 'Die Gegenüberstellung druckt den Paragraphen vorher und nachher. Was sie links druckt, muss so im RIS stehen, was sie rechts druckt, in unserem Ergebnis; und unser Ergebnis darf nichts ändern, was sie nicht zeigt.',
    risk: 'Oft druckt die Gegenüberstellung nur Auszüge, und was sie nicht druckt, kann sie nicht bestätigen. Auch sie selbst kann vom geltenden Recht abweichen; dann gilt nichts als bestätigt.',
  },
  {
    key: 'gezeigt',
    title: 'Gezeigt – oder nicht',
    who: null,
    text: 'Geht jede Prüfung auf, steht unter dem Paragraphen „Ganzer Paragraph danach (nicht amtlich)“. Geht eine nicht auf, steht dort der Grund.',
    risk: null,
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

/** One kind of comparison, in the rows the page gives each. */
export interface GenauigkeitArt {
  /** The anchor a method note links to. */
  id: string
  heading: string
  /** Where a reader meets it, in the page's own words. */
  where: string
  against: string
  measured: string[]
  injected: string[]
  missed: string[]
}

export const GENAUIGKEIT_ROW_DE = {
  where: 'Wo es steht',
  against: 'Geprüft gegen',
  measured: 'Gemessen',
  injected: 'Absichtlich eingebaute Fehler',
  missed: 'Was die Prüfung nicht fängt',
} as const

/** „Oberösterreich, Salzburg, Tirol und Wien". */
function landList(codes: readonly string[]): string {
  const names = codes.map((c) => LAND_NAME[c as LandCode] ?? c)
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
}

export function genauigkeitArten(r: GenauigkeitRecord = GENAUIGKEIT): GenauigkeitArt[] {
  const bench = r.lesefassung.bench
  const notLaw = bench.shown - bench.identical
  const blind = total(classes(r.lesefassung.faults, RESULT_BLIND))
  const annexBlind = classes(r.annex.faults, ANNEX_BLIND)
  const st = r.stations
  const tgu = r.laender.tgu
  const ls = r.laender.stations
  const landBlind = tgu.faults.filter((f) => (LAND_BLIND as readonly string[]).includes(f.key))
  const landOwn = tgu.faults.find((f) => f.key === LAND_OWN_DRAFT[0])!
  const landOther = tgu.faults.find((f) => f.key === LAND_OTHER_DRAFT[0])!

  return [
    {
      id: 'lesefassung',
      heading: 'Ganzer Paragraph danach',
      where:
        'Unter einem Paragraphen der Textgegenüberstellung, aufzuklappen: der Paragraph, wie er nach dem Entwurf lauten würde. Ihn setzt der Monitor selbst zusammen, aus dem geltenden Text im RIS und den Anweisungen des Entwurfs.',
      against:
        'Die Textgegenüberstellung des Ministeriums. Was sie als geltend abdruckt, muss so im RIS stehen, was sie als neu abdruckt, in unserem Ergebnis; ihre Absätze müssen in derselben Reihenfolge stehen, und unser Ergebnis darf nichts ändern, was sie nicht zeigt.',
      measured: [
        `Die Probe: ${n(bench.bgbl)} Bundesgesetzblätter, deren Text nach dem Inkrafttreten im RIS steht. Von ${n(bench.shown)} Paragraphen, die der Monitor gezeigt hätte, sind ${n(bench.identical)} Wort für Wort das Gesetz.${notLaw ? ` ${restSentence(bench)}` : ''} Ein Wort, das nicht im Gesetz steht, hat${bench.invented ? ` ${bench.invented === 1 ? 'einer' : n(bench.invented)}` : ' keiner'}.`,
        `Ohne die Prüfung gegen die Gegenüberstellung – jeder Paragraph, bei dem sich alle Anweisungen anwenden ließen – wären es ${n(bench.ungated.identical)} von ${n(bench.ungated.shown)} gewesen.`,
      ],
      injected: [
        `Ein Wort fehlt, eines zu viel, eines vertauscht, eine Zahl, ein Datum, ein Verweis, eine Überschrift: ${rangeDe(classes(r.lesefassung.faults, RESULT_WORDS))} gefangen.`,
        `Ein Absatz zu viel, zwei vertauscht, einer ausgelassen: ${rangeDe(classes(r.lesefassung.faults, RESULT_STRUCTURE))} gefangen.`,
        `Insgesamt ${n(total(classes(r.lesefassung.faults, [...RESULT_WORDS, ...RESULT_STRUCTURE])).tried)} Versuche an bestätigten Paragraphen.`,
      ],
      missed: [
        `Fehlt unserem Ergebnis ein Teil, den auch der geltende Text im RIS nicht hat und den die Gegenüberstellung stillschweigend überspringt, fällt das kaum auf: ${blind.caught === 0 ? 'keiner' : n(blind.caught)} von ${n(blind.tried)} Versuchen gefangen.`,
      ],
    },
    {
      id: 'gegenueberstellung',
      heading: 'Was ändert der Entwurf?',
      where:
        'Die Textgegenüberstellung des Ministeriums, links die geltende Fassung, rechts die vorgeschlagene. Beide Spalten übernimmt der Monitor Wort für Wort; die Markierung ist von uns.',
      against:
        'Das geltende Recht im RIS und den Gesetzestext des Entwurfs. Die linke Spalte muss dem RIS am Stichtag entsprechen; was rechts als neu markiert ist, darf nicht schon im Gesetz stehen und muss im Gesetzestext des Entwurfs stehen.',
      measured: [
        `In ${n(r.annex.drafts)} Entwürfen der ${r.gp}. Gesetzgebungsperiode: ${n(r.annex.confirmed)} Paragraphen bestätigt, ${n(r.annex.withheld)} nicht gezeigt, und ${n(r.annex.unchecked)} gezeigt, ohne dass die Prüfung sie bestätigen konnte – etwa weil sie nur neuen Text enthalten, dem nichts Geltendes gegenübersteht.`,
        `Bei ${ofParagraphs(r.annex.withheldStanding)} der nicht gezeigten steht schon die geltende Fassung der Gegenüberstellung so nicht im RIS: ein Fehler der Beilage, den die Prüfung fängt.`,
      ],
      injected: [
        `Ein Satz eines anderen Paragraphen in der rechten Spalte, wie ihn ein Lesefehler im PDF oder die Beilage selbst dorthin stellt: ${rangeDe(classes(r.annex.faults, ANNEX_MISFILED))} zurückgehalten.`,
        `Ein Satz der linken Spalte verloren, sodass Geltendes als neu erscheint: ${rangeDe(classes(r.annex.faults, ANNEX_LOST))} zurückgehalten.`,
      ],
      missed: [
        `Ein fremder Satz, der in beiden Spalten gleich steht: ${rangeDe(annexBlind)} zurückgehalten. Er ist nicht als Änderung markiert, steht aber beim falschen Paragraphen. Was beide Spalten gleich zeigen, gilt als unverändert und wird nicht geprüft.`,
      ],
    },
    {
      id: 'stationen',
      heading: 'Vergleich der Fassungen',
      where:
        'Nach der Begutachtung: der Entwurf gegen die Regierungsvorlage, diese gegen die Fassungen von Ausschuss und Plenum, und der ganze Weg gegen das Bundesgesetzblatt.',
      against:
        'Keine dritte Fassung: Ob ein Unterschied zwischen zwei verschiedenen Texten richtig erkannt ist, lässt sich an nichts Drittem prüfen. Geprüft wird, dass jeder Vergleich beide Texte vollständig wiedergibt und jede als geändert markierte Stelle eine sichtbare Änderung zeigt – und an Texten, die gleich sein müssen, dass der Vergleich nichts findet.',
      measured: [
        `${n(st.pairs)} Vergleiche zu ${n(st.drafts)} Entwürfen: ${st.breaches ? `${n(st.breaches)} verletzen` : 'keiner verletzt'} diese Regeln.`,
        `Texte, die gleich sein müssen – die letzte Fassung des Parlaments und das Bundesgesetzblatt, derselbe Entwurf aus zwei Quellen –: in ${n(st.nullUnits)} Einheiten ${n(st.nullResidues)} Unterschiede, ${st.nullSubstantive ? `alle als „redaktionell“ markiert bis auf ${n(st.nullSubstantive)}; ${st.nullSubstantive === 1 ? 'dieser erscheint' : 'diese erscheinen'} als Änderung` : 'alle als „redaktionell“ markiert'}.`,
      ],
      injected: [],
      missed: [
        'Liest der Monitor ein Wort in einem der beiden Texte falsch, erscheint eine Änderung, die keine ist; wie oft, zeigen die Texte, die gleich sein müssen. Liest er es in beiden gleich falsch, sieht man im Vergleich nichts davon.',
      ],
    },
    {
      id: 'land-gegenueberstellung',
      heading: 'Was ändert der Entwurf? – bei einem Land',
      where: `Die Textgegenüberstellung eines Landes, wo der Monitor ihre Form lesen kann: bei ${landList(tgu.lands)}.`,
      against: 'Das geltende Recht im RIS für die linke Spalte, den Entwurf des Landes für die rechte: Was sie als neu zeigt, muss im Entwurf stehen.',
      measured: [
        `In ${n(tgu.documents)} Gegenüberstellungen mit ${n(tgu.shown)} gezeigten Paragraphen: Bei ${n(tgu.found)} von ${n(tgu.judged)} Paragraphen, die genug neue Wörter für die Prüfung haben, steht das Neue im Entwurf.`,
      ],
      injected: [
        `Ein Satz eines anderen Paragraphen desselben Entwurfs angehängt: ${shareDe(landOwn.caught, landOwn.tried)}\u00a0% gefangen; ein Satz aus dem Entwurf eines anderen Landes: ${shareDe(landOther.caught, landOther.tried)}\u00a0%.`,
      ],
      missed: [
        `Ein einzelnes falsch gelesenes Wort, eine falsche Zahl, ein fehlender Satz: ${caughtOf(landBlind)}. Die Prüfung fragt, ob das Neue im Entwurf steht, nicht, ob es genau so dasteht.`,
      ],
    },
    {
      id: 'land-stationen',
      heading: 'Vergleich der Fassungen – bei einem Land',
      where: 'Entwurf, Regierungsvorlage, Ausschussbericht und Landesgesetzblatt eines Landes, gelesen aus den PDFs von Land und Landtag.',
      against:
        'Wie beim Bund keine dritte Fassung. Geprüft wird, dass kein Vergleich eine Anordnung doppelt zeigt, eine Kopfzeile des Dokuments als Text liest oder einen Teil einer Anordnung als eigene, neue Anordnung meldet; und ob eine Anordnung den Text, den sie ankündigt – etwa eine Zeile einer Tabelle –, in beiden Dokumenten an ihrer Stelle trägt.',
      measured: [
        `${n(ls.compared)} Vergleiche: ${ls.hits ? `${n(ls.hits)} Verstöße gegen diese Regeln` : 'kein Verstoß gegen diese Regeln'}.${ls.accepted ? ` ${ls.accepted === 1 ? 'Eine Stelle sieht' : `${n(ls.accepted)} Stellen sehen`} aus wie einer und ${ls.accepted === 1 ? 'steht' : 'stehen'} so in den Dokumenten selbst.` : ''}`,
        `Bei ${n(ls.withheld)} Anordnungen in ${n(ls.withheldPairs)} Vergleichen fand der Monitor den angekündigten Text in einem der beiden Dokumente nicht an seiner Stelle; sie stehen als „nicht gezeigt“ beim Gesetz. Bei ${n(ls.unread)} in ${n(ls.unreadPairs)} Vergleichen fehlt er in beiden; verglichen ist dort der Rest der Anordnung, und „Nicht lesbar“ sagt es.`,
      ],
      injected: [],
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
/* What is shown, and why the rest is not                               */
/* ------------------------------------------------------------------ */

export type FunnelGroup = 'zusammensetzen' | 'pruefung' | 'beilage' | 'nichts'

/**
 * Every reason a § gets no Lesefassung, in one of four groups — whose step
 * it was. Typed as a Record so a new cause cannot be left out: the build
 * fails until it has a group.
 */
export const FUNNEL_GROUP_OF: Record<ConsolidatedWithheldCause, FunnelGroup> = {
  verweigert: 'zusammensetzen',
  'zu-lang': 'zusammensetzen',
  'nummer-doppelt': 'zusammensetzen',
  'gesetz-unbekannt': 'zusammensetzen',
  'nicht-im-ris': 'zusammensetzen',
  'nicht-lesbar': 'zusammensetzen',
  'nicht-geladen': 'zusammensetzen',
  'anhang-widerspricht': 'pruefung',
  unplausibel: 'pruefung',
  'anhang-fremd': 'beilage',
  'anhang-schweigt': 'beilage',
  'anhang-ungeteilt': 'beilage',
  'kein-anhang': 'beilage',
  entfaellt: 'nichts',
  'neu-erlassen': 'nichts',
}

export const FUNNEL_GROUP_DE: Record<FunnelGroup, string> = {
  zusammensetzen: 'Nicht sicher zusammengesetzt',
  pruefung: 'Prüfung nicht bestanden',
  beilage: 'Die Beilage bestätigt hier nichts',
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

/* ------------------------------------------------------------------ */
/* The stamp                                                            */
/* ------------------------------------------------------------------ */

/** „Gemessen am 19.11.2026 an den Entwürfen der XXVIII. Gesetzgebungsperiode." */
export function measuredLineDe(r: GenauigkeitRecord = GENAUIGKEIT): string {
  return `Gemessen am ${formatDateDe(r.date)} an den Entwürfen der ${r.gp}. Gesetzgebungsperiode.`
}

/** The commit's page on GitHub. */
export function commitUrl(r: GenauigkeitRecord = GENAUIGKEIT): string {
  return `https://github.com/mmeindl/begutachtungs-monitor/commit/${r.commit}`
}

/* ------------------------------------------------------------------ */
/* How it is measured, and what the figures do not say                  */
/* ------------------------------------------------------------------ */

/** The harnesses behind the figures, in the order of the page; each file is linked on GitHub. */
export const GENAUIGKEIT_INSTRUMENTE: readonly { file: string; name: string; text: string }[] = [
  {
    file: 'scripts/harness/kons.ts',
    name: 'Prüfstand an kundgemachten Gesetzen',
    text: 'Wendet die Anweisungen kundgemachter Novellen auf den Text davor an und hält das Ergebnis gegen den Text, den das RIS nach dem Inkrafttreten führt. Die Gegenüberstellung des Entwurfs, aus dem die Novelle kam, prüft dabei wie auf der Seite.',
  },
  {
    file: 'scripts/harness/faultInjection.ts',
    name: 'Eingebaute Fehler',
    text: 'Baut in bestätigte Ergebnisse und Gegenüberstellungen absichtlich Fehler ein, einen nach dem anderen, und fragt die Prüfung erneut.',
  },
  {
    file: 'scripts/harness/accounting.ts',
    name: 'Jeder geänderte Paragraph',
    text: 'Fragt zu jedem Entwurf der Periode dieselben Daten ab wie die Seite und zählt, was mit jedem geänderten Paragraphen geschieht.',
  },
  {
    file: 'scripts/harness/annexPdf.ts',
    name: 'Gegenüberstellungen gegen das RIS',
    text: 'Liest jede Gegenüberstellung der Periode, wie die Seite sie liest, und zählt, was die Prüfung bestätigt und was sie zurückhält.',
  },
  {
    file: 'scripts/harness/station.ts',
    name: 'Vergleiche der Fassungen',
    text: 'Vergleicht jedes Paar von Fassungen, das die Seite anbietet, prüft die Regeln und vergleicht Texte, die gleich sein müssen.',
  },
  {
    file: 'scripts/harness/landGuard.ts',
    name: 'Gegenüberstellungen der Länder',
    text: 'Hält die rechte Spalte jeder lesbaren Gegenüberstellung eines Landes gegen den Entwurf und baut Fehler ein.',
  },
  {
    file: 'scripts/harness/landStations.ts',
    name: 'Vergleiche der Länder',
    text: 'Vergleicht jedes Paar von Fassungen eines Landes und prüft die Regeln.',
  },
  {
    file: 'scripts/harness/genauigkeit.ts',
    name: 'Diese Seite',
    text: 'Schreibt die Zahlen dieser Seite aus den Berichten einer Messung; keine ist von Hand eingetragen.',
  },
]

/** „Was die Zahlen nicht sagen", one sentence each. */
export const GENAUIGKEIT_GRENZEN: readonly string[] = [
  'Gemessen ist an Gesetzen, die schon kundgemacht sind und deren Text danach feststeht. Zu einem Entwurf gibt es diesen Text noch nicht; dort bleibt die Prüfung gegen die Gegenüberstellung des Ministeriums.',
  'Eingebaut sind die Fehler, die wir kennen. Einen Fehler einer Art, die niemand eingebaut hat, zählt keine dieser Zahlen.',
  'Die Zahlen sagen, wie oft der Monitor richtig liest und vergleicht. Ob ein Entwurf gut ist oder was eine Stellungnahme bewirkt hat, sagen sie nicht.',
]
