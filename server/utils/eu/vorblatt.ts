/**
 * The Vorblatt/WFA of a draft: WHETHER it implements EU law, in the WFA
 * tool's own sentence (docs/architecture.md §12.66).
 *
 * PURE MODULE — lines of text in, a class out; no Nitro globals, relative
 * imports only. The service reads the PDF (`euService.ts`), the corpus
 * script reads the same PDF from its disk cache, and both hand the lines here.
 *
 * WHERE THE SENTENCE IS. The Vorblatt's RIS XML and HTML are page images;
 * its PDF has a text layer. Under the heading „Verhältnis zu den
 * Rechtsvorschriften der Europäischen Union" the WFA tool prints one of a
 * few fixed sentences — measured over 512 Begut records since 2024
 * (04.11.2026): 277× „fallen nicht in den Anwendungsbereich", 77× „dient der
 * Umsetzung einer EU-Richtlinie", 43× „flankierenden Regelungen zu
 * Verordnungen", and a short tail. A few ressorts write free text instead.
 *
 * TWO LAYOUT TRAPS, both found by an independent `pdftotext` reading of all
 * 154 GP-XXVIII drafts: the page footer „2 von 12" can stand between the
 * heading and the sentence (the heading is the last line of a page), so the
 * footer and header lines are dropped before the lines are joined; and one
 * draft (30/ME) prints the combined sentence „… flankierenden Regelungen zu
 * Verordnungen … und dient der Umsetzung mehrerer Richtlinien", which is an
 * implementation.
 */

/**
 * The Vorblatt/WFA by its document name — every form in the window since
 * 2024: „Vorblatt und WFA", „WFA samt Vorblatt", „Vorblatt + WFV", „WF mit
 * Vorblatt", „wirkungsorientierte Folgenabschätzung", „Ergbnisdokument"
 * (sic), „begVorblatt_WFA", „Vbl…".
 */
export const VORBLATT_NAME = /vorbl|wfa|wfv|(^|[^a-zäöüß])vbl|folgenabsch|^wf\b|erge?bnisdokument/i

/** Whether a RIS document name is the Vorblatt/WFA. */
export function isVorblattDocument(name: string): boolean {
  return VORBLATT_NAME.test(name.normalize('NFC'))
}

/**
 * The WFA tool's EU heading. „den" is optional: Burgenland's Vorblätter
 * print „Verhältnis zu Rechtsvorschriften der Europäischen Union" in 51 of
 * 105 cases, Wien's in all five (Länder measurement, 04.11.2026).
 */
export const EU_HEADING = /Verhältnis\s+zu\s+(?:den\s+)?Rechtsvorschriften\s+der\s+Europäischen\s+Union/
/** What follows the EU section in the WFA tool's layout. */
const AFTER_EU = /Besonderheiten\s+des\s+Normerzeugungsverfahrens|Vereinfachte\s+wirkungsorientierte|Wirkungsorientierte\s+Folgenabschätzung|Datenschutz-Folgenabschätzung|Inkrafttreten/
/** The WFA tool's page footer and header lines, dropped before the lines are joined. */
const PAGE_NOISE = /^\s*(?:\d+\s+von\s+\d+|Seite\s+\d+(?:\s+von\s+\d+)?|www\.ris\.bka\.gv\.at.*)\s*$/i

export type VorblattClass =
  /** „Das Vorhaben dient der Umsetzung einer EU-Richtlinie" */
  | 'umsetzung'
  /** „… enthält die erforderlichen flankierenden Regelungen zu Verordnungen der Europäischen Union" */
  | 'flankierend-vo'
  /** „… enthält flankierende Regelungen zu einer Richtlinie der Europäischen Union" */
  | 'flankierend-rl'
  /** „Das Vorhaben geht über eine verpflichtende Umsetzung zwingender Vorschriften des Unionsrechtes hinaus" */
  | 'ueber-umsetzung'
  /** „Der Entwurf sieht ausschließlich Maßnahmen vor, zu denen der Bund aufgrund zwingender Vorschriften des Unionsrechts verpflichtet ist" */
  | 'nur-zwingend'
  /** „… fallen in den Anwendungsbereich des Rechts der Europäischen Union, dienen aber nicht der Erfüllung unionsrechtlicher Vorgaben" */
  | 'eu-keine-umsetzung'
  /** „Die vorgesehenen Regelungen fallen nicht in den Anwendungsbereich des Rechts der Europäischen Union" */
  | 'nicht-eu'
  /** free text that says it implements („dient der Umsetzung der Richtlinie (EU) 2024/2749") */
  | 'frei-umsetzung'
  /** free text that says no („Unionsrecht ist nicht betroffen", „steht im Einklang mit") */
  | 'frei-nein'
  /** any other free text — an aid, a goal, a mention */
  | 'freitext'

/**
 * The fixed sentences of the WFA tool, as classes. Order matters only where
 * two could match the same sentence; none of these can.
 */
const VORBLATT_CLASSES: { cls: VorblattClass; re: RegExp }[] = [
  { cls: 'umsetzung', re: /dient\s+der\s+Umsetzung\s+(?:einer|von)\s+EU-Richtlinie/i },
  { cls: 'flankierend-vo', re: /flankierenden?\s+Regelungen\s+zu\s+(?:den\s+)?Verordnungen\s+der\s+Europäischen\s+Union/i },
  { cls: 'flankierend-rl', re: /flankierenden?\s+Regelungen\s+zu\s+(?:einer|der)\s+Richtlinie/i },
  { cls: 'ueber-umsetzung', re: /geht\s+über\s+eine\s+verpflichtende\s+Umsetzung/i },
  { cls: 'nur-zwingend', re: /ausschließlich\s+Maßnahmen\s+vor,\s+zu\s+denen\s+der\s+Bund\s+aufgrund\s+zwingender/i },
  { cls: 'eu-keine-umsetzung', re: /fallen\s+(?:zum\s+Teil\s+)?in\s+den\s+Anwendungsbereich\s+des\s+Rechts\s+der\s+Europäischen\s+Union,\s+dienen\s+aber\s+nicht/i },
  { cls: 'nicht-eu', re: /fallen\s+nicht\s+in\s+den\s+Anwendungsbereich\s+des\s+Rechts\s+der\s+Europäischen\s+Union/i },
]

/** The classes that say „EU" — the order in which several Vorblätter of one draft are ranked. */
export const VORBLATT_CLASS_RANK: readonly VorblattClass[] = [
  'umsetzung',
  'flankierend-rl',
  'flankierend-vo',
  'nur-zwingend',
  'ueber-umsetzung',
  'frei-umsetzung',
  'freitext',
  'eu-keine-umsetzung',
  'frei-nein',
  'nicht-eu',
]

/** The classes in which the Vorblatt says the draft implements or flanks EU law. */
export const VORBLATT_EU_YES: ReadonlySet<VorblattClass> = new Set(['umsetzung', 'flankierend-rl', 'flankierend-vo', 'nur-zwingend', 'ueber-umsetzung', 'frei-umsetzung'])

/**
 * What the ressorts write instead of the tool's sentence — measured in the
 * first run (04.11.2026): „Das Vorhaben dient der Umsetzung der Richtlinie
 * (EU) 2024/2749 und …", „Dient auch der Umsetzung der Richtlinie
 * 2005/36/EG", „… ausschließlich zur Umsetzung von zwei EU- Richtlinien",
 * „… im Sinne der Durchführungsverordnung (EU) 2019/947 umgesetzt werden".
 */
const FREE_YES = /\bUmsetzung\s+(?:einer|der|von|zweier|mehrerer)\s+[^.]{0,40}?(?:Richtlinie|Richtlinien)\b|\bUmsetzung\s+(?:von|der)\s+(?:zwei|mehreren)\s+EU-\s?Richtlinien|(?:Richtlinie|Verordnung)[^.]{0,120}?umgesetzt\s+werden|aus\s+zwingendem\s+Unionsrecht\s+ergeben/i
/** „Unionsrecht wird nicht tangiert", „nicht berührt", „keine Auswirkungen", „im Einklang mit". */
const FREE_NO = /nicht\s+(?:tangiert|betroffen|berührt)|keine\s+Auswirkungen\s+auf\s+Rechtsvorschriften|im\s+Einklang\s+mit|nicht\s+in\s+den\s+Anwendungsbereich/i

/** The class of one EU section's text. */
export function classifyVorblattSentence(sentence: string): VorblattClass {
  const fixed = VORBLATT_CLASSES.find((c) => c.re.test(sentence))?.cls
  // „… flankierenden Regelungen zu Verordnungen … und dient der Umsetzung
  // mehrerer Richtlinien" (30/ME): the tool sentence plus an implementation.
  if (fixed && fixed !== 'umsetzung' && VORBLATT_EU_YES.has(fixed) && FREE_YES.test(sentence)) return 'umsetzung'
  if (fixed) return fixed
  if (FREE_YES.test(sentence)) return 'frei-umsetzung'
  if (FREE_NO.test(sentence)) return 'frei-nein'
  return 'freitext'
}

/**
 * The EU section of one Vorblatt: everything between the heading and the
 * next WFA heading, whitespace normalised, with the form residue before the
 * sentence („: Die vorgesehenen …", „[Profil] Suchwert: p Das Vorhaben …")
 * cut. Null where the text has no EU heading.
 *
 * `lines` are the document's lines in reading order, pages simply
 * concatenated — the page footers are dropped here.
 */
export function vorblattEuSection(lines: readonly string[]): string | null {
  const text = lines.filter((line) => !PAGE_NOISE.test(line)).join('\n')
  const head = EU_HEADING.exec(text)
  if (!head) return null
  const rest = text.slice(head.index + head[0].length)
  const end = AFTER_EU.exec(rest)
  return rest.slice(0, end ? end.index : 600).replace(/\s+/g, ' ').replace(/^(?:\[Profil\]\s*Suchwert:\s*\S+\s*|[:\s])+/, '').trim()
}

/** One Vorblatt read: whether it had the heading, its class and the sentence verbatim. */
export interface VorblattReading {
  /** The EU section's text, or null where the document has no EU heading. */
  sentence: string | null
  cls: VorblattClass | null
}

/**
 * Below this many non-blank characters a PDF has no text layer worth the
 * name — a scan with a stray page number. Measured: every Vorblatt with a
 * real text layer has thousands.
 */
export const MIN_TEXT_CHARS = 200

/** Whether `lines` carry a text layer at all (`MIN_TEXT_CHARS`). */
export function hasTextLayer(lines: readonly string[]): boolean {
  return lines.join('').replace(/\s/g, '').length >= MIN_TEXT_CHARS
}

/** Read one Vorblatt's lines: the EU section and its class. */
export function classifyVorblatt(lines: readonly string[]): VorblattReading {
  const sentence = vorblattEuSection(lines)
  return { sentence, cls: sentence === null ? null : classifyVorblattSentence(sentence) }
}

/** The page texts of a PDF as lines — pages one after the other, as `classifyVorblatt` takes them. */
export function linesOfPages(pages: readonly string[]): string[] {
  return pages.flatMap((p) => p.split('\n'))
}
