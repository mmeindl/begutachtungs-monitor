/**
 * What each source publishes for each step of following a law, and why
 * something is missing — the facts behind /datenlage (14.11.2026).
 *
 * The EU, the Bund and the nine Länder side by side. Two readers: someone
 * who wonders why a page shows a gap, and a Land that is sent the link and
 * sees its own state beside the others'. So the page describes and never
 * grades: no totals per source, no order but the levels and the alphabet,
 * and every missing piece says whose it is. Only a gap of the source is the
 * source's to close; a gap of the monitor is ours (`DATENLAGE_STATE_META`,
 * `owner`).
 *
 * The Länder's cell texts are `LAND_COVERAGE`'s, imported and never copied:
 * the lists' notice reads the same facts (`landsIncompleteFor` reads the
 * states below), and a test holds the two equal. What
 * this module adds per Land is the machine-readable state and a reason in a
 * few words, derived from `docs/research/laender-luecken.md`, which says per
 * gap whether the Land does not publish it or the monitor does not read it.
 * `docs/research/datenlage-pruefung.md` checked those states against the
 * Länder's own pages and the lists (14.11.2026); the cells it corrected say
 * so beside them. Where neither memo nor another measured source settles a
 * cell, its state is `notSurveyed` — never a guess.
 *
 * Bund and EU cells come from `docs/api-exploration.md` (§1 Parliament, §2
 * RIS Begut, §2c Textgegenüberstellung, §2d Vorblatt and Cellar, §3 the
 * chain) and from the explanations on /so-funktionierts as of 14.11.2026.
 *
 * One step is a fact of LAW, not of publication: „Begutachtung
 * vorgeschrieben" (`LAW_STEP`, 14.11.2026), from the constitutions as read
 * in `docs/research/wege-zu-einer-rechtsnorm.md`. Its cells take states of
 * their own (`DATENLAGE_LAW_STATES`) with no owner: a Land whose
 * constitution prescribes nothing has no gap, and the lists' notices
 * (`landsIncompleteFor`) never read this step.
 *
 * German copy lives here, beside the keys, so a second language can replace
 * it without touching the page.
 *
 * Pure module (auto-imported; vitest imports it relatively).
 */
import type { LandCode } from '../types'
import { LAND_CODES, LAND_NAME, LAND_SLUG } from './laender'
import { COVERAGE_ROWS, LAND_COVERAGE, type CoverageRow } from './laenderCoverage'
import { ANLIEGEN_SECTION_DE } from './anliegen'
import { EU_FEEDBACK_AUTO_PAGES, EU_FEEDBACK_MAX_PAGES, EU_FEEDBACK_PAGE_SIZE } from './euPortal'
import { EU_MEMBER_STATE_NAME_DE, EU_PAGE_TITLE_DE, EU_UMSETZUNG_YEARS, euPath } from './eu'
import { formatNumberDe } from './format'

/**
 * The state of one cell. Four say what the SOURCE does, two what the
 * MONITOR does — the distinction the page exists for — and one says that
 * nobody has looked (`notSurveyed`). No „not applicable": every step exists
 * at every source read so far, and a state no cell uses would only stand in
 * the legend. Three more describe the law (`DATENLAGE_LAW_STATES`), for
 * the one step that asks what the law prescribes: the publication states
 * do not fit a legal fact, and bending one („published" for „prescribed")
 * would mix two questions in one word.
 *
 * `ownObject` (16.11.2026) is the EU's: its lawmaking does not walk a
 * draft's steps, and since the EU cycle the monitor reads feedback
 * windows, feedback and the procedure between the institutions. Those
 * cells said „nicht erhoben" — whose legend says „Der Monitor zeigt es
 * nicht" — which the EU pages had made false. They point to the EU's own
 * block (`DATENLAGE_EU`) instead of bending „Stellungnahmen" and
 * „Begutachtung" to fit feedback to the Commission.
 */
export type DatenlageState =
  | 'required'
  | 'optional'
  | 'notRequired'
  | 'published'
  | 'partial'
  | 'inferred'
  | 'notPublished'
  | 'partlyRead'
  | 'notRead'
  | 'ownObject'
  | 'notSurveyed'

/** Whose gap a state is: the source's, the monitor's, or nobody's. */
export type DatenlageGapOwner = 'source' | 'monitor' | null

export interface DatenlageStateMeta {
  /** The state in words, as a cell shows it. */
  label: string
  /** One sentence for the legend. */
  meaning: string
  owner: DatenlageGapOwner
}

/** The order of the groups in the by-step view and of the legend. */
export const DATENLAGE_STATE_ORDER: readonly DatenlageState[] = [
  'required',
  'optional',
  'notRequired',
  'published',
  'partial',
  'inferred',
  'notPublished',
  'partlyRead',
  'notRead',
  'ownObject',
  'notSurveyed',
]

/** The name of the EU's own block (`DATENLAGE_EU`), which the state `ownObject` points to. */
const EU_OBJECT_NAME_DE = 'Gesetzgebung der EU'

/** The states that say where this overview stops: another object's block, or nobody has looked. */
export const DATENLAGE_OUTSIDE_STATES: readonly DatenlageState[] = ['ownObject', 'notSurveyed']

/** The states of the law step; no other step uses them, and they own no gap. */
export const DATENLAGE_LAW_STATES: readonly DatenlageState[] = ['required', 'optional', 'notRequired']

export const DATENLAGE_STATE_META: Record<DatenlageState, DatenlageStateMeta> = {
  required: {
    label: 'vorgeschrieben',
    meaning: 'Die Verfassung schreibt die Begutachtung vor.',
    owner: null,
  },
  optional: {
    label: 'vorgesehen, nicht vorgeschrieben',
    meaning: 'Die Verfassung sieht sie vor, macht sie aber von einem Beschluss oder von der Bedeutung des Entwurfs abhängig.',
    owner: null,
  },
  notRequired: {
    label: 'nicht vorgeschrieben',
    meaning: 'Die Verfassung schreibt sie nicht vor; was darüber hinaus gelesen ist, steht dabei.',
    owner: null,
  },
  published: {
    label: 'veröffentlicht',
    meaning: 'Die Quelle veröffentlicht es, und der Monitor liest es.',
    owner: null,
  },
  partial: {
    label: 'teilweise veröffentlicht',
    meaning: 'Die Quelle veröffentlicht einen Teil; was fehlt, steht dabei.',
    owner: 'source',
  },
  inferred: {
    label: 'nicht genannt, vom Monitor erschlossen',
    meaning: 'Die Quelle nennt es nicht; der Monitor schließt es aus ihren Dokumenten oder sucht es im Rechtsinformationssystem. Die Seite eines Entwurfs sagt dann, dass die Zuordnung unsere ist.',
    owner: 'source',
  },
  notPublished: {
    label: 'nicht veröffentlicht',
    meaning: 'Die Quelle veröffentlicht es nicht, oder nicht lange genug, um einem Entwurf zu folgen.',
    owner: 'source',
  },
  partlyRead: {
    label: 'liest der Monitor teilweise',
    meaning: 'Die Quelle veröffentlicht es; der Monitor liest bisher nur einen Teil davon.',
    owner: 'monitor',
  },
  notRead: {
    label: 'liest der Monitor noch nicht',
    meaning: 'Die Quelle veröffentlicht es; der Monitor liest es noch nicht.',
    owner: 'monitor',
  },
  ownObject: {
    label: 'eigenes Verfahren',
    meaning: `Die Schritte hier sind die eines Entwurfs. Die Gesetzgebung der EU geht andere; was der Monitor davon liest und was nicht, steht unter „${EU_OBJECT_NAME_DE}“.`,
    owner: null,
  },
  notSurveyed: {
    label: 'nicht erhoben',
    meaning: 'Was die Quelle hier veröffentlicht, ist nicht geprüft. Der Monitor zeigt es nicht.',
    owner: null,
  },
}

/** A step: the Länder table's rows plus two the Länder table does not have. */
export type DatenlageStep = CoverageRow | 'statementCount' | 'eu' | 'begutachtungRecht'

export interface DatenlageStepInfo {
  key: DatenlageStep
  /** The anchor of the step's block in the by-step view. */
  id: string
  label: string
  /** What the step asks of a source, in one sentence. */
  question: string
  /**
   * What would close the gap, from the „Ziel" of the matching gap in
   * `docs/research/laender-luecken.md` — written for the Länder, because
   * that memo is about them. Absent where the memo names no target.
   */
  target?: string
}

const coverageLabel = (key: CoverageRow): string =>
  COVERAGE_ROWS.find((row) => row.key === key)!.label

/** Every step, in procedure order. */
export const DATENLAGE_STEPS: readonly DatenlageStepInfo[] = [
  {
    key: 'verordnungen',
    id: 'verordnungsentwuerfe',
    label: coverageLabel('verordnungen'),
    question: 'Ob die Quelle neben Gesetzesentwürfen auch Verordnungsentwürfe zur Begutachtung veröffentlicht.',
    // §5 (Oberösterreich) and §6d (Kärnten, Tirol).
    target: 'Jeder Verordnungsentwurf mit Beginn und Frist als Datum im Registereintrag.',
  },
  {
    key: 'archive',
    id: 'abgeschlossene',
    label: coverageLabel('archive'),
    question: 'Ob ein Entwurf nach dem Ende seiner Begutachtung auffindbar bleibt.',
    // §1 (Wien) and §6c (Tirol).
    target: 'Entwürfe bleiben dauerhaft online, in einer Liste der abgeschlossenen Begutachtungen.',
  },
  {
    key: 'tgu',
    id: 'textgegenueberstellung',
    label: coverageLabel('tgu'),
    question: 'Ob dem Entwurf eine Textgegenüberstellung beiliegt – geltende und vorgeschlagene Fassung nebeneinander.',
    // §3.
    target: 'Zu jedem ändernden Entwurf eine Textgegenüberstellung, zweispaltig nach der Vorlage des Bundes, als eigenes Dokument.',
  },
  {
    key: 'eu',
    id: 'eu-bezug',
    label: 'EU-Bezug',
    question: 'Ob der Entwurf sagt, dass er EU-Recht umsetzt, und welches; bei der EU: bis wann.',
  },
  {
    key: 'begutachtungRecht',
    id: 'begutachtung-vorgeschrieben',
    label: 'Begutachtung vorgeschrieben',
    // § 93 Abs. 2 AKG and § 10 Abs. 1 WKG bind Bund and Länder alike.
    question: 'Ob Verfassung oder Gesetz eine öffentliche Begutachtung vorschreiben. Den Kammern sind Entwürfe überall zu übermitteln (§ 93 AKG, § 10 WKG).',
  },
  {
    key: 'frist',
    id: 'frist',
    label: coverageLabel('frist'),
    question: 'Beginn und Ende der Begutachtung, als Datum.',
    // §6a (Kärnten) and §6d.
    target: 'Beginn und Ende der Frist als Datum, auch im Archiveintrag.',
  },
  {
    key: 'statements',
    id: 'stellungnahmen',
    label: coverageLabel('statements'),
    question: 'Ob die eingelangten Stellungnahmen öffentlich sind.',
    // §6.
    target: 'Die Stellungnahmen von Organisationen vollständig – Namen von Privatpersonen nicht.',
  },
  {
    key: 'statementCount',
    id: 'zahl-der-stellungnahmen',
    label: 'Zahl der Stellungnahmen',
    question: 'Wie viele Stellungnahmen eingelangt sind.',
    // §6.
    target: 'Die Zahl der eingelangten Stellungnahmen.',
  },
  {
    key: 'way',
    id: 'weg',
    label: coverageLabel('way'),
    question: 'Welche Regierungsvorlage und welcher Beschluss aus dem Entwurf wurden.',
    // §2 (Salzburg, Wien) and §6b (Kärnten).
    target: 'Der Registereintrag nennt die Regierungsvorlage, die aus dem Entwurf wurde.',
  },
  {
    key: 'texts',
    id: 'texte-im-vergleich',
    label: coverageLabel('texts'),
    question: 'Welche späteren Fassungen der Monitor mit dem Entwurf vergleichen kann.',
  },
  {
    key: 'kundmachung',
    id: 'kundmachung',
    label: coverageLabel('kundmachung'),
    question: 'In welchem Gesetzblatt das Ergebnis kundgemacht wurde.',
    // §2 and §5.
    target: 'Der Registereintrag nennt nach der Kundmachung das Gesetzblatt.',
  },
]

export const DATENLAGE_STEP_KEYS: readonly DatenlageStep[] = DATENLAGE_STEPS.map((s) => s.key)

/** The steps grouped by the stretch of the procedure they belong to. */
export const DATENLAGE_PHASES: readonly { id: string; label: string; steps: readonly DatenlageStep[] }[] = [
  { id: 'phase-entwurf', label: 'Der Entwurf', steps: ['verordnungen', 'archive', 'tgu', 'eu'] },
  { id: 'phase-begutachtung', label: 'Die Begutachtung', steps: ['begutachtungRecht', 'frist', 'statements', 'statementCount'] },
  { id: 'phase-danach', label: 'Nach der Begutachtung', steps: ['way', 'texts', 'kundmachung'] },
]

export interface DatenlageCell {
  /** What the source publishes, in two or three words. */
  text: string
  state: DatenlageState
  /** The reason or the limit, in a few words; absent where `text` says it. */
  reason?: string
}

export type DatenlageSourceKey = 'eu' | 'bund' | LandCode

export interface DatenlageSource {
  key: DatenlageSourceKey
  /** The block's anchor: `/datenlage?ansicht=quelle#tirol`. */
  id: string
  name: string
  /** One sentence on what the monitor can follow of this source. */
  summary: string
  cells: Record<DatenlageStep, DatenlageCell>
}

/* ------------------------------------------------------------------ */
/* The Länder                                                          */
/* ------------------------------------------------------------------ */

type StateAndReason = readonly [DatenlageState, string?]

/* Reasons used by several Länder, worded once. */
const R = {
  noStart: 'Beginn nicht genannt',
  gone: 'Entwurf verschwindet mit Fristende',
  notNamed: 'das Land nennt sie nicht',
  formNotRead: 'die Form des Landes liest der Monitor noch nicht',
  wayOpen: 'der Monitor zeigt ihn nicht; ob das Land ihn nennt, ist offen',
  textsOpen: 'ohne den Weg keine späteren Fassungen',
  proseOnly: 'welcher Akt, liest der Monitor dort nicht',
  vbgProject: 'auf der Seite des Gesetzesvorhabens, die der Monitor noch nicht liest',
} as const

/**
 * The state of each `LAND_COVERAGE` cell, and its reason. The text stays
 * `LAND_COVERAGE`'s; a „–" there is the Land's gap where the memo says so
 * (Niederösterreich without archive, Wien deleting the draft) and
 * `notSurveyed` where nobody has looked (Burgenland's and the Steiermark's
 * way after the Begutachtung). Where the Land publishes a step on a page the
 * monitor does not read, the cell says „nicht gelesen", never „–": Vorarlberg
 * keeps closed drafts, their way and their Stellungnahmen on the page of
 * each Gesetzesvorhaben (datenlage-pruefung.md, 14.11.2026).
 */
const LAND_STATE: Record<LandCode, Record<CoverageRow, StateAndReason>> = {
  bgld: {
    verordnungen: ['published'],
    archive: ['published'],
    frist: ['partial', R.noStart],
    way: ['notSurveyed', R.wayOpen],
    kundmachung: ['inferred', R.notNamed],
    // datenlage-pruefung.md, measured 14.11.2026: 6 of 130 Gesetzesentwürfe in the period of
    // GP XXVII (2019–2024) carry one, none of the 111 in the periods of GP XXVI and XXVIII.
    tgu: ['partial', 'selten beigelegt; die beigelegten liest der Monitor noch nicht'],
    texts: ['notSurveyed', R.textsOpen],
    statements: ['published'],
  },
  ktn: {
    verordnungen: ['published'],
    archive: ['partial', 'das Archiv nennt weder Beginn noch Frist'],
    frist: ['partial', 'bei Verordnungen teils nur „vier Wochen ab Zustellung“'],
    way: ['inferred', 'das Archiv nennt die Vorlage nicht; verknüpft über die Geschäftszahl'],
    kundmachung: ['inferred', 'das Land nennt sie nicht; gelesen am Beschlussdatum im Titel des Gesetzblatts'],
    tgu: ['partlyRead', 'rechts stehen Novellierungsanordnungen; was feiner als ein Absatz ändert, zeigt der Monitor nicht'],
    // 15.11.2026: that the Land publishes no committee text was never checked — the reader
    // reads the Verfassungsdienst's pages only (`LAND_COMMITTEE_TEXT`: `reportNotRead`).
    // What is published and read is Vorlage and Gesetz; the rest is said as unknown.
    texts: ['partial', 'ob es einen Text des Ausschusses gibt, ist nicht erhoben'],
    statements: ['published'],
  },
  noe: {
    verordnungen: ['published'],
    archive: ['notPublished', R.gone],
    frist: ['partial', R.noStart],
    // The Landtag keeps the Vorlage a draft becomes; whether the Land links the two is
    // what is missing (as in Wien). Unchecked against the Landtag (datenlage-pruefung.md).
    way: ['notPublished', 'das Land verknüpft den Entwurf nicht mit seiner Vorlage im Landtag'],
    kundmachung: ['notPublished', R.gone],
    tgu: ['notRead', R.formNotRead],
    texts: ['notPublished', R.gone],
    // datenlage-pruefung.md (14.11.2026): published at the Landtag, so by the legend the
    // monitor's gap — it cannot tie them to the draft.
    statements: ['notRead', 'beim Landtag, ohne Verknüpfung zum Entwurf'],
  },
  ooe: {
    verordnungen: ['partial', 'kein Beginn, und nach der Frist nichts mehr'],
    archive: ['published'],
    // datenlage-pruefung.md, measured 14.11.2026: all 7 Verordnungsentwürfe without a start.
    frist: ['partial', 'Verordnungsentwürfe ohne Beginn'],
    way: ['published'],
    kundmachung: ['partial', 'für Verordnungen nicht genannt'],
    tgu: ['published'],
    texts: ['published'],
    statements: ['published'],
  },
  sbg: {
    verordnungen: ['published'],
    archive: ['published'],
    frist: ['partial', 'bei abgeschlossenen nur noch der Beginn'],
    way: ['inferred', 'das Register nennt die Vorlage nicht; erst nach der Kundmachung über das RIS'],
    kundmachung: ['inferred', 'das Register nennt das Gesetzblatt nicht'],
    tgu: ['partial', 'nicht jedem Gesetzesentwurf beigelegt'],
    texts: ['partial', 'der Ausschussbericht trägt keinen Text'],
    statements: ['published'],
  },
  stmk: {
    // datenlage-pruefung.md, read 14.11.2026: listed with Geschäftszahl, Frist and documents.
    verordnungen: ['notRead', 'das Land führt sie auf seiner „Plattform Landesrecht“ seit 2008; der Monitor liest nur die Seite des Landtags'],
    // datenlage-pruefung.md, read 14.11.2026: the Land's „Plattform Landesrecht" keeps
    // Gesetzesentwürfe from November 2000; June 2015 is where the monitor's reading starts.
    archive: ['partlyRead', 'das Land führt Gesetzesentwürfe seit November 2000; der Monitor liest die seit Juni 2015'],
    frist: ['published'],
    way: ['notSurveyed', R.wayOpen],
    kundmachung: ['inferred', R.notNamed],
    tgu: ['notRead', R.formNotRead],
    texts: ['notSurveyed', R.textsOpen],
    statements: ['published'],
  },
  t: {
    verordnungen: ['partial', 'nur im Informationsregister, ohne Fristfeld'],
    archive: ['partial', 'die Liste hält einen Entwurf nur Wochen; der Landtag führt ihn nur hinter einem Suchformular'],
    frist: ['partial', 'Verordnungsentwürfe ohne Frist'],
    way: ['published'],
    // datenlage-pruefung.md, measured 14.11.2026: for its 17 Verordnungsentwürfe nobody
    // names it; the title search finds 3.
    kundmachung: ['partial', 'für Verordnungen nicht genannt'],
    tgu: ['published'],
    // 15.11.2026, the Landtag's 52 Gegenstände of the type Regierungsvorlage (cached
    // pages of `tirol.ts`): „Bericht und Antrag" with 38, „Gesetz nach Beschlussfassung
    // im Landtag" with 20. The reader keeps neither (`report: null`,
    // `LAND_COMMITTEE_TEXT`). One report read: a page of reasoning, no law text
    // (docs/research/tirol-beschlusstext.md).
    texts: ['partlyRead', 'Bericht des Ausschusses und Beschluss des Landtags liest der Monitor noch nicht'],
    statements: ['published'],
  },
  // datenlage-pruefung.md, read 14.11.2026 (and again the same day): the page the monitor
  // reads loses a draft at its Frist's end, but the Land keeps a page per Gesetzesvorhaben,
  // listed under „Laufende und kürzlich abgeschlossene Gesetzesvorhaben"
  // (vorarlberg.at/laufende-gesetzesvorhaben), with the draft, „Externe Stellungnahmen",
  // Regierungsvorlage, Gesetzesbeschluss and Landesgesetzblatt. How long „kürzlich"
  // lasts the Land does not say.
  vbg: {
    verordnungen: ['notSurveyed', 'die Begutachtungsseite führt nur Gesetzesentwürfe; ob das Land Verordnungsentwürfe anderswo veröffentlicht, ist offen'],
    archive: ['notRead', 'das Land führt kürzlich abgeschlossene auf der Seite des Gesetzesvorhabens weiter; wie lange, sagt es nicht'],
    frist: ['partial', R.noStart],
    way: ['notRead', `Vorlage und Beschluss stehen ${R.vbgProject}`],
    kundmachung: ['notRead', `das Gesetzblatt steht ${R.vbgProject}`],
    tgu: ['notRead', R.formNotRead],
    texts: ['notRead', `Vorlage und Beschluss stehen ${R.vbgProject}`],
    statements: ['notRead', `die von Organisationen stehen ${R.vbgProject}; die von Privatpersonen nur mit Einwilligung`],
  },
  w: {
    verordnungen: ['published'],
    archive: ['partial', 'mit dem Beschluss des Landtags vom Netz'],
    frist: ['published'],
    way: ['notPublished', 'das Land nennt die Vorlage nicht, und der Entwurf geht vom Netz'],
    kundmachung: ['inferred', R.notNamed],
    tgu: ['published'],
    texts: ['notPublished', 'der Entwurf geht mit dem Beschluss des Landtags vom Netz'],
    statements: ['published'],
  },
}

/**
 * The two steps `LAND_COVERAGE` does not have. The count: „Wie viele
 * eingehen, zählt kein Land öffentlich" (/so-funktionierts #laender). The
 * EU relation: where each Land states it (/so-funktionierts #eu-recht).
 */
const LAND_EXTRA: Record<LandCode, Record<'statementCount' | 'eu', DatenlageCell>> = {
  bgld: {
    statementCount: { text: 'nicht gezählt', state: 'notPublished' },
    eu: { text: 'im Vorblatt', state: 'published' },
  },
  ktn: {
    statementCount: { text: 'nicht gezählt', state: 'notPublished' },
    eu: { text: 'meist im Fließtext', state: 'partlyRead', reason: R.proseOnly },
  },
  noe: {
    statementCount: { text: 'nicht gezählt', state: 'notPublished' },
    eu: { text: 'unter eigener Überschrift', state: 'partlyRead', reason: 'den Gesetzestext liest der Monitor nicht' },
  },
  ooe: {
    statementCount: { text: 'nicht gezählt', state: 'notPublished' },
    eu: { text: 'in Abschnitt V und je Bestimmung', state: 'published' },
  },
  sbg: {
    statementCount: { text: 'nicht gezählt', state: 'notPublished' },
    eu: { text: 'unter eigener Überschrift', state: 'published' },
  },
  stmk: {
    statementCount: { text: 'nicht gezählt', state: 'notPublished' },
    eu: { text: 'in der Folgenabschätzung', state: 'published' },
  },
  t: {
    statementCount: { text: 'nicht gezählt', state: 'notPublished' },
    eu: { text: 'meist im Fließtext', state: 'partlyRead', reason: R.proseOnly },
  },
  vbg: {
    statementCount: { text: 'nicht gezählt', state: 'notPublished' },
    eu: { text: 'unter eigener Überschrift', state: 'published' },
  },
  w: {
    statementCount: { text: 'nicht gezählt', state: 'notPublished' },
    eu: { text: 'im Vorblatt', state: 'published' },
  },
}

/**
 * What each Landesverfassung prescribes (docs/research/wege-zu-einer-rechtsnorm.md,
 * „Länder · Begutachtung" and „Landesverordnungen", RIS, Fassung 14.11.2026;
 * a second source read only for Vorarlberg). Laws first, then Verordnungen,
 * and the publication of the Stellungnahmen, which only the Steiermark
 * prescribes. Descriptive: the order is the alphabet's, as everywhere here.
 */
const LAND_LAW: Record<LandCode, DatenlageCell> = {
  // Art. 68 Abs. 4 L-VG Burgenland; Bürgerinnen- und Bürgerbegutachtungsgesetz §§ 6–10
  // („sollen"); the Stellungnahmen go to the Landtag with the Vorlage (§ 9 Abs. 2).
  // Verordnungen: not in the L-VG.
  bgld: {
    text: 'Gesetzesentwürfe von grundsätzlicher Bedeutung „sollen“ begutachtet werden',
    state: 'optional',
    reason: 'Verordnungen: in der Verfassung nicht geregelt',
  },
  // Art. 33 K-LVG („sind … einem Begutachtungsverfahren zu unterziehen"), Abs. 3 „jede
  // Person", four weeks. Verordnungen: not in the K-LVG.
  ktn: {
    text: 'für Gesetzesentwürfe',
    state: 'required',
    reason: 'Verordnungen: in der Verfassung nicht geregelt',
  },
  // Art. 25 NÖ LV (Gesetze, „Bürgerbegutachtung" Abs. 3); Art. 45a (Verordnungen der
  // Landesregierung „von allgemeiner Bedeutung").
  noe: {
    text: 'für Gesetzesentwürfe und Verordnungsentwürfe',
    state: 'required',
    reason: 'Verordnungen „von allgemeiner Bedeutung“',
  },
  // Art. 58 Oö. L-VG: Bürger-Begutachtung of drafts „von grundsätzlicher Bedeutung", if
  // the Landesregierung so decides; Art. 61 the same for Verordnungen. A general duty
  // outside the L-VG: not found, not ruled out (memo „Offen").
  ooe: {
    text: 'Gesetzesentwürfe von grundsätzlicher Bedeutung, wenn die Landesregierung es beschließt',
    state: 'optional',
    reason: 'Verordnungen ebenso',
  },
  // L-VG 1999 silent; § 55 Abs. 7 Landtags-GO presupposes drafts „die von der
  // Landesregierung zur Begutachtung ausgesandt werden". Outside the constitution:
  // not found, not ruled out.
  sbg: {
    text: 'nicht in der Landesverfassung',
    state: 'notRequired',
    reason: 'die Geschäftsordnung des Landtags setzt sie voraus',
  },
  // Art. 68 L-VG 2010: Gesetzes- and Verordnungsentwürfe; „Jede Person"; „Die
  // Stellungnahmen sind zu veröffentlichen." (Abs. 4) — the only Land that says so.
  stmk: {
    text: 'für Gesetzesentwürfe und Verordnungsentwürfe',
    state: 'required',
    reason: 'die Stellungnahmen sind zu veröffentlichen',
  },
  // Art. 36 TLO: required „es sei denn, daß die besondere Dringlichkeit … nicht
  // zuläßt"; who may comment the TLO does not say. Verordnungen: not in the TLO.
  t: {
    text: 'für Gesetzesentwürfe, außer bei besonderer Dringlichkeit',
    state: 'required',
    reason: 'Verordnungen: in der Verfassung nicht geregelt',
  },
  // Art. 34 L-V: „wird … durchgeführt"; „Jede Person kann … Änderungsvorschläge
  // erstatten", published on the Land's homepage (Abs. 2). Verordnungen: not in the L-V.
  vbg: {
    text: 'für Gesetzesentwürfe',
    state: 'required',
    reason: 'Verordnungen: in der Verfassung nicht geregelt',
  },
  // WStV silent (RIS full-text search „Begutachtungsverfahren" in Wien: no hit on the
  // legislative procedure). Outside the WStV: not found, not ruled out.
  w: {
    text: 'nicht in der Stadtverfassung',
    state: 'notRequired',
  },
}

function landSource(land: LandCode): DatenlageSource {
  const coverage = LAND_COVERAGE[land]
  const cells = { ...LAND_EXTRA[land], begutachtungRecht: LAND_LAW[land] } as Record<DatenlageStep, DatenlageCell>
  for (const row of COVERAGE_ROWS) {
    const [state, reason] = LAND_STATE[land][row.key]
    cells[row.key] = { text: coverage.cells[row.key], state, ...(reason ? { reason } : {}) }
  }
  return {
    key: land,
    id: LAND_SLUG[land],
    name: LAND_NAME[land],
    summary: `${LAND_NAME[land]} ${coverage.summary}`,
    cells,
  }
}

/* ------------------------------------------------------------------ */
/* Bund and EU                                                         */
/* ------------------------------------------------------------------ */

const BUND: DatenlageSource = {
  key: 'bund',
  id: 'bund',
  name: 'Bund',
  summary: 'Der Bund veröffentlicht jeden Entwurf im Rechtsinformationssystem, Gesetzesentwürfe zusätzlich beim Parlament, das jeden weiteren Schritt bis zur Kundmachung führt. Beide Listen haben Lücken; der Monitor liest beide.',
  cells: {
    // wege-zu-einer-rechtsnorm.md, „Begutachtung vor dem Parlament: die Rechtslage":
    // neither the B-VG nor a law prescribes one; its basis are the Rundschreiben of the
    // Verfassungsdienst (1971, renewed 2008, RLW 03.02.2026). § 9 Abs. 3
    // WFA-Grundsatz-Verordnung sets the Frist („im Regelfall … mindestens sechs Wochen"),
    // Abs. 4 counts on Verordnungen without one.
    begutachtungRecht: {
      text: 'für Entwürfe der Ministerien nicht durch Verfassung oder Gesetz',
      state: 'notRequired',
      reason: 'Grundlage sind Rundschreiben des Verfassungsdienstes; die WFA-Grundsatz-Verordnung regelt die Frist',
    },
    // api-exploration §2: 3.012 of 4.574 records are Verordnungen.
    verordnungen: { text: 'ja, im RIS', state: 'published' },
    // api-exploration §2: closed consultations are retained, practical coverage from ~2004.
    archive: { text: 'seit etwa 2004', state: 'published' },
    // api-exploration §2c; so-funktionierts #gegenueberstellung.
    tgu: {
      text: 'zu den meisten Entwürfen',
      state: 'published',
      reason: 'im RIS teils nur als Bild; der Monitor liest dann das PDF',
    },
    // api-exploration §2d; so-funktionierts #eu-recht.
    eu: {
      text: 'im Vorblatt, in festen Sätzen',
      state: 'published',
      reason: 'den Akt nennt meist erst der Gesetzestext',
    },
    // api-exploration §2 (Beginn/Ende in RIS) and §1 (list 81).
    frist: { text: 'Beginn und Ende', state: 'published' },
    // so-funktionierts #ohne-stellungnahmen.
    statements: {
      text: 'zu Gesetzesentwürfen, beim Parlament',
      state: 'partial',
      reason: 'zu Verordnungen gibt es keine öffentliche Liste',
    },
    // api-exploration §1 (list 81, statement count); so-funktionierts #ohne-stellungnahmen.
    statementCount: {
      text: 'zu Gesetzesentwürfen',
      state: 'partial',
      reason: 'Stellungnahmen zu Verordnungen zählt niemand',
    },
    // api-exploration §1 (stages, preconst) and §3. `partial` since datenlage-pruefung.md
    // (14.11.2026): two known gaps of the source, and `published` has none in the legend.
    way: {
      text: 'jeder Schritt, beim Parlament',
      state: 'partial',
      reason: 'ein Entwurf, der als Antrag weitergeht, trägt keinen Verweis; von zusammengeführten Entwürfen verknüpft das Parlament nur einen mit der Vorlage',
    },
    // api-exploration §1 (statements.documents); so-funktionierts #vergleich.
    texts: { text: 'Vorlage, Ausschuss, Plenum, Gesetz', state: 'published' },
    // api-exploration §3 (bgbllinks); so-funktionierts, step „bundesgesetzblatt-ii".
    kundmachung: {
      text: 'für Gesetze vom Parlament genannt',
      state: 'partial',
      reason: 'für Verordnungen nennt sie keine Quelle; der Monitor sucht sie über Titel, Ministerium und Datum',
    },
  },
}

/** An EU cell nobody has surveyed for this table. */
const EU_NOT_SURVEYED: DatenlageCell = { text: 'nicht erhoben', state: 'notSurveyed' }

/**
 * A step of a draft that the EU's lawmaking walks in its own way
 * (16.11.2026): the cell points to `DATENLAGE_EU`, which says what is read.
 */
const EU_OWN_OBJECT: DatenlageCell = {
  text: 'eigenes Verfahren',
  state: 'ownObject',
  reason: `was der Monitor liest, steht unter „${EU_OBJECT_NAME_DE}“`,
}

const EU: DatenlageSource = {
  key: 'eu',
  id: 'eu',
  name: 'EU',
  // 16.11.2026: the sentence listed what the monitor reads of the EU's own procedure and had fallen behind twice in two days; that list is `DATENLAGE_EU`'s now, and this one says what the cells are about — the act a draft names.
  summary: `Zu einem Entwurf liest der Monitor von der EU den Rechtsakt, den er umsetzt, mit Titel und Umsetzungsfrist aus EUR-Lex. Die Gesetzgebung der EU selbst geht nicht die Schritte eines Entwurfs; was der Monitor davon liest, steht unter „${EU_OBJECT_NAME_DE}“.`,
  cells: {
    // Whether the EU's law prescribes a consultation was not read for this table.
    begutachtungRecht: EU_NOT_SURVEYED,
    // Draft acts of the Commission open for feedback: the portal's windows (`DATENLAGE_EU`).
    verordnungen: EU_OWN_OBJECT,
    archive: EU_OWN_OBJECT,
    tgu: EU_NOT_SURVEYED,
    // api-exploration §2d (Cellar); so-funktionierts #eu-recht.
    eu: {
      text: 'Umsetzungsfrist',
      state: 'partial',
      reason: 'bei mehreren Daten sagt EUR-Lex nicht, welches die allgemeine Frist ist',
    },
    // The feedback windows, who gave feedback and the procedure between the institutions (steps 1–4 of the EU cycle).
    frist: EU_OWN_OBJECT,
    statements: EU_OWN_OBJECT,
    statementCount: EU_OWN_OBJECT,
    way: EU_OWN_OBJECT,
    texts: EU_OWN_OBJECT,
    // api-exploration §2d (title from the Cellar, ELI link to EUR-Lex).
    kundmachung: { text: 'Rechtsakt mit Titel, in EUR-Lex', state: 'published' },
  },
}

/** Every source in the page's order: the levels top down, then the Länder alphabetically. */
export const DATENLAGE_SOURCES: readonly DatenlageSource[] = [EU, BUND, ...LAND_CODES.map(landSource)]

/** Each source's entry for one step, grouped by state in `DATENLAGE_STATE_ORDER`; empty groups left out. */
export function datenlageByState(step: DatenlageStep): { state: DatenlageState; entries: { source: DatenlageSource; cell: DatenlageCell }[] }[] {
  return DATENLAGE_STATE_ORDER
    .map((state) => ({
      state,
      entries: DATENLAGE_SOURCES
        .filter((source) => source.cells[step].state === state)
        .map((source) => ({ source, cell: source.cells[step] })),
    }))
    .filter((group) => group.entries.length > 0)
}

/* ------------------------------------------------------------------ */
/* Measured figures                                                    */
/* ------------------------------------------------------------------ */

export interface DatenlageFigure {
  source: DatenlageSourceKey | 'laender'
  step: DatenlageStep
  text: string
  /** What was counted. */
  population: string
  /** When — a day, or the month where the source names only that. */
  date: string
}

/**
 * The measured figures behind the cells, each with its population and day.
 * They are not re-measured here: re-measure in the named source first.
 */
export const DATENLAGE_FIGURES: readonly DatenlageFigure[] = [
  {
    // api-exploration §2, „The type split".
    source: 'bund',
    step: 'statements',
    text: '65,9 % der Begutachtungen betreffen Verordnungen; zu ihren Stellungnahmen gibt es keine öffentliche Liste.',
    population: '4.574 Datensätze im RIS',
    date: '17.09.2026',
  },
  {
    // `pnpm corpus:tgu-deckung -- --gp XXVIII`, line „(d) Vereinigung": at Parliament
    // or in the joined RIS record. 121 of 132 on 10.09.2026 (api-exploration §2c).
    source: 'bund',
    step: 'tgu',
    text: '147 haben eine Textgegenüberstellung.',
    population: '163 Ministerialentwürfe der XXVIII. GP',
    date: '18.11.2026',
  },
  {
    // decisions.md, „The monitor's own accuracy and coverage" (`pnpm corpus:tgu-deckung`).
    source: 'bund',
    step: 'tgu',
    text: 'Zu 162 findet der Monitor den Datensatz im RIS, aus dem er Entwurf und Textgegenüberstellung liest – zu einem davon nur über Datum und Ministerium. Einer steht nicht im RIS.',
    population: '163 Ministerialentwürfe der XXVIII. GP',
    date: '18.11.2026',
  },
  {
    // decisions.md, „The consolidated reading and the annex" (`pnpm harness:kons -- --discover=60 --sammel --oracle`),
    // the line „beide Wege: plausibel, Orakel bestätigt" — the Textgegenüberstellung read from the RIS table
    // and from the PDF, as the page reads it; until 18.11.2026 the table alone (106 of 106).
    source: 'bund',
    step: 'tgu',
    text: 'Die Lesefassung, an kundgemachten Gesetzen geprüft: Von 431 Paragraphen, die der Monitor zeigen würde, sind 430 wortgleich mit dem geltenden Text im RIS. Dem übrigen fehlt ein Teil; ein Wort, das nicht im Gesetz steht, hat keiner. Ohne die Bestätigung durch die Textgegenüberstellung wären es 1.434 von 1.469.',
    population: '1.794 Paragraphen aus 60 Bundesgesetzblättern',
    date: '20.11.2026',
  },
  {
    // decisions.md, same table (`scripts/harness/accounting.ts --gp=XXVIII`).
    source: 'bund',
    step: 'tgu',
    text: 'Von 4.798 geänderten Paragraphen zeigt der Monitor 2.393 als Lesefassung; bei jedem anderen steht der Grund.',
    population: '164 Ministerialentwürfe der XXVIII. GP',
    date: '20.11.2026',
  },
  {
    // so-funktionierts #eu-recht.
    source: 'bund',
    step: 'eu',
    text: 'Bei 43 sagt das Vorblatt, der Entwurf setze eine Richtlinie um (28 %); einen Bezug zum EU-Recht nennen 64 (42 %).',
    population: '154 Ministerialentwürfe der XXVIII. GP mit Datensatz im RIS',
    date: '04.11.2026',
  },
  {
    // so-funktionierts, step „bundesgesetzblatt-ii".
    source: 'bund',
    step: 'kundmachung',
    text: 'Der Abgleich findet 85,4 % der Kundmachungen, bei Fristen von vor mehr als einem Jahr 91,1 %.',
    population: '294 Verordnungsentwürfe seit 2024',
    date: 'Oktober 2026',
  },
  {
    // api-exploration §2d, „Several dates, unlabelled".
    source: 'eu',
    step: 'eu',
    text: 'Bei 50 nennt EUR-Lex mehrere Daten, ohne zu sagen, welches die allgemeine Frist ist.',
    population: '168 Richtlinien mit Umsetzungsdatum',
    date: '04.11.2026',
  },
  {
    // so-funktionierts #eu-recht.
    source: 'laender',
    step: 'eu',
    text: '57 sagen, dass sie EU-Recht umsetzen (12 %), 37 davon mit Akt.',
    population: '489 Landesentwürfe der XXVIII. GP',
    date: '04.11.2026',
  },
  {
    // laender-luecken.md, table and §6a/§6b.
    source: 'ktn',
    step: 'way',
    text: 'Die Regierungsvorlage findet der Monitor über die Geschäftszahl bei 108; 27 ohne Vorlage stehen in keinem Zeitraum.',
    population: '135 Entwürfe seit 2021',
    date: '23.10.2026',
  },
  {
    // laender-luecken.md, table.
    source: 'ktn',
    step: 'kundmachung',
    text: 'Die Kundmachung findet der Monitor über das Beschlussdatum bei 89.',
    population: '98 vom Landtag beschlossene Entwürfe',
    date: '23.10.2026',
  },
  {
    // laender-luecken.md, table („Verordnungen") and §6d.
    source: 'ktn',
    step: 'frist',
    text: 'Die Frist steht bei 14 auf der Seite, bei 9 ist sie aus dem Anschreiben gerechnet, bei 3 fehlt sie.',
    population: '26 Verordnungsentwürfe',
    date: '23.10.2026',
  },
  {
    // laender-luecken.md, table.
    source: 'ooe',
    step: 'tgu',
    text: '73 haben eine Textgegenüberstellung.',
    population: '90 Gesetzesentwürfe',
    date: '23.10.2026',
  },
  {
    // laender-luecken.md, table and §3 („42 %").
    source: 'sbg',
    step: 'tgu',
    text: '151 haben eine Textgegenüberstellung (42 %).',
    population: '357 Gesetzesentwürfe',
    date: '23.10.2026',
  },
  {
    // datenlage-pruefung.md, „Was nicht stimmt" (Burgenland).
    source: 'bgld',
    step: 'tgu',
    text: '6 haben eine Textgegenüberstellung; in den Zeiträumen der XXVI. GP (71) und der XXVIII. GP (40) keiner.',
    population: '130 Gesetzesentwürfe im Zeitraum der XXVII. GP',
    date: '14.11.2026',
  },
  {
    // datenlage-pruefung.md, „Was nicht stimmt" (Tirol).
    source: 't',
    step: 'kundmachung',
    text: 'Die Kundmachung findet der Monitor über den Titel bei 3.',
    population: '17 Verordnungsentwürfe',
    date: '14.11.2026',
  },
]

/* ------------------------------------------------------------------ */
/* Anliegen an das Parlament                                           */
/* ------------------------------------------------------------------ */

/**
 * An object of its own beside the drafts (15.11.2026): Petitionen,
 * Bürgerinitiativen and Volksbegehren walk none of the steps above, so they
 * get no cells but a block — what is covered, from which source, and what
 * is not, each with its reason (`docs/research/umsetzungsplan-petitionen-volksbegehren.md`).
 */
export interface DatenlageObject {
  /** The block's anchor: `/datenlage#anliegen`. */
  id: string
  name: string
  summary: string
  /** The object's own pages. */
  link: { label: string; href: string }
  covered: readonly string[]
  sources: readonly string[]
  notCovered: readonly { what: string; why: string }[]
  /** Measured, each with what was counted and when — a description, never a score. */
  figures: readonly { text: string; population: string; date: string }[]
}

/** The row labels of an object's block. */
export const DATENLAGE_OBJECT_DE = {
  covered: 'Erfasst',
  sources: 'Quelle',
  notCovered: 'Nicht erfasst',
  measured: 'Gemessen',
} as const

export const DATENLAGE_ANLIEGEN: DatenlageObject = {
  id: 'anliegen',
  name: ANLIEGEN_SECTION_DE,
  summary: 'Petitionen, Bürgerinitiativen und Volksbegehren sind keine Entwürfe und gehen keinen der Schritte oben. Der Monitor folgt ihnen auf eigenen Seiten, solange der Nationalrat oder der Bundesrat sie behandelt.',
  // The section's path, as `ANLIEGEN_PATH` in `shared/utils/anliegen.ts`.
  link: { label: `Alle ${ANLIEGEN_SECTION_DE}`, href: '/anliegen' },
  covered: [
    'Petitionen und Bürgerinitiativen an den Nationalrat',
    // The first period: `VOLKSBEGEHREN_FIRST_GP` (`anliegenIsFollowed`); before it the
    // record carries no course (step 0, all 85 Volksbegehren).
    'Volksbegehren ab der XXII. Gesetzgebungsperiode, für ihre Zeit im Nationalrat',
    // Since 15.11.2026: a fourth kind with a rail of its own (`PET-BR`, filed under „BR").
    'Petitionen an den Bundesrat',
  ],
  sources: [
    'Die Liste der Gegenstände des Parlaments (Liste 101) und der Verlauf jedes Gegenstands',
    'Die Liste der Beteiligungen des Parlaments (Liste 143): die Zahl der Unterstützungen und der Stellungnahmen',
  ],
  notCovered: [
    {
      what: 'Unterstützung und Eintragung eines Volksbegehrens, bevor es im Nationalrat einlangt',
      why: 'Sie liegen beim Bundesministerium für Inneres, ohne Schnittstelle.',
    },
    {
      what: 'Wer eine Bürgerinitiative eingebracht hat',
      why: 'Die Erstunterzeichnerin oder der Erstunterzeichner ist eine Privatperson und wird nie genannt.',
    },
    {
      what: 'Von wem der Ausschuss Stellungnahmen angefordert hat',
      why: 'Das Parlament führt das als freien Text, der auch einzelne Personen nennt; der Monitor zeigt nur die Zahl.',
    },
    {
      what: 'Was die Verwaltung mit einer Petition an den Bundesrat getan hat, die ihr übermittelt wurde',
      why: 'Der Verlauf des Parlaments endet mit der Übermittlung.',
    },
    {
      what: 'Was aus einem Anliegen nach dem Nationalrat wurde',
      why: 'Keine Quelle verknüpft ein späteres Gesetz mit einer Petition, einer Bürgerinitiative oder einem Volksbegehren.',
    },
  ],
  figures: [
    {
      // Step 0 of the plan (`pnpm corpus:anliegen`), 15.11.2026.
      text: 'Der Ausschuss für Petitionen und Bürgerinitiativen hat 354 durch Kenntnisnahme erledigt und 122 an einen Fachausschuss weitergeleitet.',
      population: '616 Petitionen und Bürgerinitiativen der XXV. bis XXVIII. GP',
      date: '15.11.2026',
    },
    {
      // `pnpm corpus:anliegen` and the reader over the 42 cached records: 0 stages unread.
      text: 'Jeden Eintrag im Verlauf der Petitionen an den Bundesrat ordnet der Monitor einem bekannten Schritt zu.',
      population: '42 Petitionen an den Bundesrat, die letzte vom April 2024',
      date: '15.11.2026',
    },
  ],
}

/**
 * The EU's lawmaking (16.11.2026): an object of its own, as the Anliegen.
 * A proposal, an act and a Citizens' Initiative walk their own rails
 * (`/eu-recht/wege`), so what the monitor reads of them stands here and
 * not in a draft's cells. Every line names something a page shows or a
 * reader's header says it does not read:
 * `server/utils/eu/haveYourSay.ts` and `portalFeedback.ts` (the portal),
 * `cellarDossier.ts`, `cellarVorschlag.ts` and `cellarUmsetzung.ts`
 * (EUR-Lex), `eciRegister.ts` (the register), and
 * `docs/research/umsetzungsplan-eu-zyklus.md` („Not in this plan").
 * Who is named among those who gave feedback is `/datenschutz#dse-names`'s
 * to say, not this page's.
 */
export const DATENLAGE_EU: DatenlageObject = {
  id: 'eu-gesetzgebung',
  name: EU_OBJECT_NAME_DE,
  summary: 'Ein Vorhaben der Kommission, ein Rechtsakt der EU und eine Europäische Bürgerinitiative sind keine Entwürfe und gehen keinen der Schritte oben. Der Monitor folgt ihnen auf eigenen Seiten.',
  link: { label: EU_PAGE_TITLE_DE, href: euPath() },
  covered: [
    'Vorhaben, zu denen die Kommission gerade Rückmeldungen entgegennimmt, mit Beginn und Ende jeder Frist',
    'Wer zu einer Frist Rückmeldung gegeben hat',
    'Vorschläge der Kommission mit ihrem Verfahren zwischen Parlament und Rat',
    'Rechtsakte, die ein Entwurf umsetzt, mit ihrem Verfahren bis zum Amtsblatt',
    // `EU_UMSETZUNG_YEARS`; the count of notified measures, never the measures' verdict.
    `Richtlinien, deren Umsetzungsfrist in den ${EU_UMSETZUNG_YEARS} Jahren vor oder nach heute liegt, und wie viele Maßnahmen ${EU_MEMBER_STATE_NAME_DE} der Kommission dazu gemeldet hat`,
    `Europäische Bürgerinitiativen von der Registrierung bis zur Antwort der Kommission, mit den Unterstützungen insgesamt und aus ${EU_MEMBER_STATE_NAME_DE}`,
  ],
  sources: [
    'Das Portal „Ihre Meinung zählt“ der Europäischen Kommission: Vorhaben, Fristen und Rückmeldungen',
    'EUR-Lex: Rechtsakte, Vorschläge, ihr Verfahren und die gemeldeten Maßnahmen',
    'Das Register der Europäischen Bürgerinitiative',
  ],
  notCovered: [
    {
      // `euInitiative.ts`, `notFollowedRail`: the rail continues only where a publication carries a COM number (`euProposalPathOfReference`).
      what: 'Was nach der Kommission aus einem Vorhaben wird, zu dem das Portal keinen Vorschlag nennt',
      why: 'Der Monitor verknüpft ein Vorhaben nur über die Nummer des Vorschlags mit dem Verfahren in EUR-Lex.',
    },
    {
      // docs/research/eu-zyklus.md, sample of 14.11.2026 (the figure below).
      what: 'Die Konsultation zu einem Vorschlag von vor 2017',
      why: 'Im Portal war in der Stichprobe keine zu finden.',
    },
    {
      // `EU_FEEDBACK_MAX_PAGES` × `EU_FEEDBACK_PAGE_SIZE`; what is read unasked is `EU_FEEDBACK_AUTO_PAGES` pages (16.11.2026).
      what: `Rückmeldungen über die neuesten ${formatNumberDe(EU_FEEDBACK_MAX_PAGES * EU_FEEDBACK_PAGE_SIZE)} je Frist hinaus`,
      why: `Der Monitor liest zunächst die neuesten ${formatNumberDe(EU_FEEDBACK_AUTO_PAGES * EU_FEEDBACK_PAGE_SIZE)} und weitere nur, wenn jemand sie anfordert.`,
    },
    {
      what: 'Der Text einer Rückmeldung',
      why: 'Der Monitor liest ihn nicht und verlinkt die Rückmeldung im Portal.',
    },
    {
      // umsetzungsplan-eu-zyklus.md, „Not in this plan".
      what: 'Der Vergleich eines Vorschlags mit dem beschlossenen Rechtsakt',
      why: 'Eine amtliche Textgegenüberstellung gibt es nicht; von EUR-Lex liest der Monitor Angaben zum Verfahren, keine Texte.',
    },
    {
      // `cellarUmsetzung.ts`, „A notified measure is the member state's claim".
      what: 'Ob eine Richtlinie vollständig umgesetzt ist',
      why: 'Die gemeldeten Maßnahmen sind Angaben des Mitgliedstaats; dass sie vollständig sind, bestätigt die Kommission in diesen Daten nicht.',
    },
    {
      // umsetzungsplan-eu-zyklus.md, step 5: members and funders are never read.
      what: 'Wer eine Europäische Bürgerinitiative organisiert oder finanziert',
      why: 'Das Register nennt dazu Personen; der Monitor liest diese Angaben nicht.',
    },
    {
      // `app/utils/wege.ts`, `eu-petition` (petitionen-laender-und-eu.md, 15.11.2026).
      what: 'Petitionen an das Europäische Parlament',
      why: 'Das Petitionsportal des Parlaments hat keine Schnittstelle und weist automatische Abfragen ab.',
    },
  ],
  figures: [
    {
      // docs/research/eu-zyklus.md, the portal sample: 36 asked from 2017 on, 29 proven; 15 before, none.
      text: 'Zu 29 fand der Monitor im Portal das Vorhaben; zu keinem von 15 weiteren Vorschlägen aus der Zeit vor 2017.',
      population: '36 Vorschläge der Kommission ab 2017, eine Stichprobe',
      date: '14.11.2026',
    },
  ],
}

/** The objects that walk rails of their own, in the page's order: the levels top down. */
export const DATENLAGE_OBJECTS: readonly DatenlageObject[] = [DATENLAGE_EU, DATENLAGE_ANLIEGEN]

/** The name a figure's source goes by on the page. */
export function datenlageFigureSourceName(source: DatenlageFigure['source']): string {
  if (source === 'laender') return 'Länder'
  return DATENLAGE_SOURCES.find((s) => s.key === source)!.name
}

export function datenlageStepLabel(step: DatenlageStep): string {
  return DATENLAGE_STEPS.find((s) => s.key === step)!.label
}

/* ------------------------------------------------------------------ */
/* The view in the URL                                                 */
/* ------------------------------------------------------------------ */

/** `?ansicht=schritt`; without it the page shows the sources, so `/datenlage#tirol` works too. */
export const DATENLAGE_VIEW_PARAM = 'ansicht'

export type DatenlageView = 'quelle' | 'schritt'

export const DATENLAGE_DEFAULT_VIEW: DatenlageView = 'quelle'

export function parseDatenlageView(value: unknown): DatenlageView {
  const v = Array.isArray(value) ? value[0] : value
  return v === 'schritt' ? 'schritt' : DATENLAGE_DEFAULT_VIEW
}
