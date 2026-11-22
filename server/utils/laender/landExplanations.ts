/**
 * What the Land gives as its reasons — the Erläuterungen of a Land's draft,
 * read from the PDF's lines (23.10.2026): the general part as passages for
 * „Was das Land begründet", the particular part one entry per „Zu …"
 * heading, for the § it explains — as the Ministerialentwurf's page shows
 * the ressort's.
 *
 * PURE MODULE — no imports, so vitest runs it directly.
 *
 * Three layouts, one reader:
 *  - Oberösterreich: the Begutachtungsentwurf opens with them, „A.
 *    Allgemeiner Teil" … „B. Besonderer Teil" … „Zu Art. I Z 2 (§ 1 Abs. 3):",
 *    and the law text follows.
 *  - Salzburg: after the law text, „Erläuterungen" … „1. Allgemeines:" …
 *    „Zu den einzelnen Bestimmungen:" … „Zu Z 1 (§ 28 Abs 3):".
 *  - Wien: after law and Vorblatt, „ERLÄUTERUNGEN" … „Allgemeiner Teil" …
 *    „Besonderer Teil" … „Zu Z 1 (§ 2 Abs. 8):", the Textgegenüberstellung
 *    after them; headings in bold, many without a number (`boldHeading`).
 */

export interface ExplanationPassage {
  heading: string | null
  text: string[]
}

export interface ParticularExplanation {
  /** „I" or „2": the Artikel its heading names, else the last „Zu Artikel …" heading above it — the law, in a package. */
  article: string | null
  /** The §§ it explains, „5", „12a" — from the heading's brackets. */
  paras: string[]
  /** „Zu Art. I Z 2 (§ 1 Abs. 3):", as printed. */
  heading: string
  text: string[]
}

export interface LandExplanationsParse {
  general: ExplanationPassage[]
  /** Whether a heading said „Allgemeiner Teil"/„Allgemeines" — else the general part is inferred. */
  labelled: boolean
  particular: ParticularExplanation[]
}

const PAGE_NOISE_RE = /^(?:Seite \d+(?: von \d+)?|\d+ von \d+|- ?\d+ ?-|\d+)$/
const START_RE = /^(?:[A-Z]\.|[IVX]+\.|\d+\.)?\s*(?:Allgemeiner Teil|Allgemeines)\b/
/*
 * The title over the Erläuterungen: the word alone, or „Erläuterungen zum
 * Entwurf …", „ERLÄUTERUNGEN zur Verordnung …", „Erläuternde Bemerkungen
 * Pilotregionen" — never a line of prose that happens to open with the word
 * (04.11.2026): „Erläuterungen zu § 14 Oö. ADG." wrapped onto a line of its
 * own in Oberösterreich's 16120, and the general part began behind it, at
 * „Zu Art. III Z 28", its section V and every entry before it lost.
 * Measured over the 489 drafts of GP XXVIII: 44 such lines open with the
 * word — „… verwiesen.", „Erläuterungen dazu.", „Erläuterungen zu Abs. 5).".
 */
export const TITLE_RE = /^(?:(?:Erläuterungen|ERLÄUTERUNGEN|Erläuternde Bemerkungen):?$|(?:Erläuterungen|ERLÄUTERUNGEN|Erläuternde Bemerkungen)\s+(?:zum|zur|ZUM|ZUR)\s(?![^]*(?:\bverwiesen\b|\bdargelegt\b|\bBGBl\b|[.;]$))|Erläuternde Bemerkungen\s(?![^]*[.;]$))/
/*
 * And „7. Erläuterungen zu den einzelnen Bestimmungen:", „6. Zu einzelnen
 * Bestimmungen:" (21.11.2026): 74 and 52 such headings over the 1,365 cached
 * Land PDFs, which the reader knew only as „Zu den einzelnen Bestimmungen".
 * Without its heading the particular part began at the first „Zu …" line,
 * and in Salzburg's Vorlagen 34234 and 34239 that was the general part's
 * „6. Ergebnis des Begutachtungsverfahrens", whose answers to the statements
 * („Zu § 4: Zur kritischen Eingabe der Fraktion …") stood as entries.
 */
const PARTICULAR_RE = /^(?:[A-Z]\.|[IVX]+\.|\d+\.)?\s*(?:Besonderer Teil|(?:Erläuterungen zu|Zu) (?:den )?einzelnen Bestimmungen)\b/
/* „Zu Art. I Z 2", and in Salzburg's packages „Zu Art 2 Z 1" (23.10.2026); „Zu den §§ 124 bis 130" (21.11.2026: 19 lines in 14 documents, whose block ran into the § before it). */
const ENTRY_RE = /^Zu\s+(?:(?:Art(?:ikel)?\.?\s*(?:[IVXL]+|\d+)|Z(?:iffer)?n?\.?\s*\d|(?:den\s+)?§§?\s*\d|den\s+Z|Abs)|Art\.)/
/* „TEXTGEGENÜBERSTELLUNG" in capitals in Wien's drafts (w-2026006); the last „Zu …" entry ran on into the table. */
export const END_RE = /^(?:Textgegenüberstellung|TEXTGEGENÜBERSTELLUNG|Der (?:Oö\. |Salzburger |Wiener )?Landtag hat beschlossen|Die (?:Oö\. |Salzburger |Wiener )?Landesregierung hat (?:beschlossen|verordnet)|Vorblatt)\b/
const HEADING_RE = /^(?:[A-Z]|[IVX]+|\d+)\.\s+\S/
/*
 * The Landesregierung's motion behind a Vorlage's Erläuterungen (21.11.2026):
 * Salzburg's „Die Landesregierung stellt sohin den" over „Antrag," and „der
 * Salzburger Landtag wolle beschließen:", Oberösterreich's „Die Oö.
 * Landesregierung beantragt, der Oö. Landtag möge …", its place and date and
 * the signing member of the government. Read on, all of it stood in the
 * last entry's text — the § on In- und Außerkrafttreten of a new law —, and
 * held against the draft, which has no motion, that Begründung read
 * „geändert" (Salzburg's 32441, where nothing else changed). Measured over
 * the cached Länder documents the census reads: 64 such lines, all in a
 * Vorlage, none in a draft's Erläuterungen; „Die Landesregierung stellt den
 * Gemeinden …" and „(4) Die Landesregierung stellt durch Verordnung fest"
 * are quotes and law text, and stay.
 */
const MOTION_RE = /^Die (?:Oö\. )?Landesregierung (?:stellt (?:sohin )?den(?: Antrag\b.*)?$|beantragt, der (?:Oö\. )?Landtag möge\b)/

/** A line of the document, and whether all of it is set in bold (`pdfStyledPages`). */
interface Line {
  text: string
  bold: boolean
}

/**
 * A label the Land repeats because it writes one per provision, not per
 * page: Oberösterreich's „Umsetzungshinweis:" over each entry that
 * transposes an article (16120 has eight) — read by the EU fact
 * (`eu/landErlaeuterungen.ts`, 04.11.2026), and lost as furniture before.
 */
const REPEATED_LABEL_RE = /^Umsetzungshinweise?(?:\s+zu\s+[^:]{1,40})?:$/

/**
 * Lines a document repeats at the same place of its pages — address, file
 * number, date, the running head over or the footer under the text — are
 * page furniture, not prose: a short line standing at the same place from a
 * page's top or bottom on three pages or more, dropped where it stands so.
 *
 * Until 21.11.2026 any line under 80 characters met three times anywhere was
 * dropped, and with it the Land's own prose that recurs: the sub-heading
 * „Zu Abs 1:" (82 times), „Zu Z 1:" (26), the line „werden." that ends a
 * sentence (25), in 56 of the 180 documents the census of the Land's
 * Begründungen reads. Salzburg's 34234 lost „werden." from a § of its
 * Vorlage, and the Begründung of § 13 read „geändert". A running head
 * stands within the first two lines of its page (Salzburg's wraps onto
 * two), a footer within the last two, once the page number is set aside.
 */
function withoutFurniture(pages: readonly (readonly Line[])[]): Line[] {
  const lines = pages.map((page) => page.filter(({ text }) => text && !PAGE_NOISE_RE.test(text)))
  const placeOf = (k: number, n: number) => (k < EDGE ? `oben ${k}` : k >= n - EDGE ? `unten ${n - 1 - k}` : null)
  const pagesAt = new Map<string, number>()
  for (const page of lines) {
    page.forEach(({ text }, k) => {
      const place = placeOf(k, page.length)
      if (place && text.length < 80 && !REPEATED_LABEL_RE.test(text)) pagesAt.set(`${place}|${text}`, (pagesAt.get(`${place}|${text}`) ?? 0) + 1)
    })
  }
  return lines.flatMap((page) => page.filter(({ text }, k) => (pagesAt.get(`${placeOf(k, page.length)}|${text}`) ?? 0) < 3))
}

/** How many lines from its page's top or bottom a running head or a footer stands (`withoutFurniture`). */
const EDGE = 2

/**
 * A heading only its weight tells (23.10.2026): Wien sets those of its
 * Erläuterungen unnumbered and in bold — „Ziel und Inhalt der Novelle",
 * „Begründung", „Finanzielle Auswirkungen des Regelungsvorhabens auf den
 * Haushalt der Stadt Wien:" — and read as text they ran into the paragraph
 * below. A whole line in bold that opens with a capital and ends no
 * sentence: a bold sentence is emphasis, not a heading. A rule by the text
 * alone — a short line without a full stop — found headings in 375 of 540
 * documents, nearly all of them wrong. Only Wien's lines carry a weight
 * here (`HEADINGS_BY_WEIGHT`).
 */
function boldHeading(l: Line): boolean {
  return l.bold && l.text.length < 120 && /^\p{Lu}/u.test(l.text) && !/[.;,]$/.test(l.text)
}

/** A line appended to the text it continues: a word broken at its hyphen is joined whole („Sportfachvertre-" over „tung"), „Sport-" over „und Freizeit" keeps it. */
export function joinWrapped(text: string, line: string): string {
  return /\p{L}-$/u.test(text) && /^\p{Ll}/u.test(line) && !/^(?:und|oder|bzw\.|sowie)\b/.test(line) ? `${text.slice(0, -1)}${line}` : `${text} ${line}`
}

/** Lines into paragraphs: a line that ends a sentence well short of the measure ends its paragraph; a bullet or a heading opens one. */
function paragraphs(lines: readonly Line[]): ExplanationPassage[] {
  const measure = Math.max(40, ...lines.map((l) => l.text.length))
  const out: ExplanationPassage[] = []
  let current: ExplanationPassage = { heading: null, text: [] }
  let para = ''
  const flushPara = () => {
    if (para.trim()) current.text.push(para.trim())
    para = ''
  }
  const flushPassage = () => {
    flushPara()
    if (current.heading || current.text.length) out.push(current)
  }
  let joined = -1
  lines.forEach((l, i) => {
    if (i === joined) return
    const line = l.text
    // „I. Anlass und Inhalt" is a heading; „1. die Schaffung einer … Ersatzvor-" an item of a list.
    let heading = ((START_RE.test(line) || (HEADING_RE.test(line) && /^\S+\.\s+\p{Lu}/u.test(line))) && line.length < 90 && !/[.;,-]$/.test(line)) || boldHeading(l)
    let name = line
    // A heading that ends mid-phrase wraps: „VI. Auswirkungen … insbesondere
    // auf" over „Frauen und Männer", in most of Salzburg's Erläuterungen —
    // the rest of it is the next line where that is short and ends no
    // sentence. A bold heading's rest is bold too, may end in its colon, and
    // may follow a word broken at its hyphen. Where the next line runs on,
    // the „heading" was the first line of a numbered item: „2. Das konkrete
    // Ausmaß … an der" over „Landschaftsabgabe hängt vom …" (23.10.2026).
    const broken = l.bold && /\p{L}-$/u.test(line)
    if (heading && (DANGLING_RE.test(line) || broken)) {
      const next = lines[i + 1]
      const ends = l.bold && next?.bold ? /[.;,]$/ : /[.;:,]$/
      if (next && (!broken || next.bold) && next.text.length <= 60 && !ends.test(next.text) && /^\p{L}/u.test(next.text)) {
        name = broken && /^\p{Ll}/u.test(next.text) && !/^(?:und|oder|bzw\.|sowie)\b/.test(next.text) ? `${line.slice(0, -1)}${next.text}` : `${line} ${next.text}`
        joined = i + 1
      } else {
        heading = false
      }
    }
    if (heading) {
      flushPassage()
      current = { heading: name.replace(/:$/, ''), text: [] }
      return
    }
    if (/^[-–•]\s/.test(line)) flushPara()
    para = !para ? line : joinWrapped(para, line)
    if (/[.:;!?]$/.test(line) && line.length < measure * 0.85) flushPara()
  })
  flushPassage()
  return out
}

/** A line that ends mid-phrase: an article, a preposition, a conjunction. */
const DANGLING_RE = /\s(?:von|der|die|das|des|dem|den|und|oder|für|zur|zum|im|in|auf|mit|bei|nach|über|sowie|insbesondere)$/

/**
 * The §§ a „Zu …" heading names: „(§ 1 Abs. 3)" → 1, „(§§ 4, 5 und 7)" →
 * 4, 5, 7, „(§ 2 Abs. 9 bis 11)" → 2 — a number after „Abs." or „Z" is no §.
 * A range of §§ names every § in it (21.11.2026): „Zu den §§ 124 bis 130" →
 * 124 … 130, as the Bund's reader reads „Zu §§ 8 bis 10" (`headingAddress`);
 * read as its two ends, the §§ between them got no Begründung. Lettered ends
 * of one number, „§§ 5a bis 5c", name their letters; other lettered ends
 * stay ends. Not the §§ a title names: Salzburg titles „Zu § 81 (Anwendung
 * der §§ 8 bis 12; Dienstbeginn)", and § 8 and § 12 got § 81's Begründung.
 */
export function headingParas(heading: string): string[] {
  const out = new Set<string>()
  // Behind a heading that names its § the bracket is the §'s title, „Zu § 81 (Anwendung der §§ 8 bis 12; Dienstbeginn)": no § of its own.
  if (/^[^(]*§/.test(heading)) for (let i = 0; i < 2; i++) heading = heading.replace(/\([^()]*\)/g, ' ')
  for (const m of heading.matchAll(/§§\s*(\d+[a-z]*(?:\s*(?:,|und|bis|sowie)\s*\d+[a-z]*)*)/g)) {
    for (const n of m[1]!.matchAll(/(\d+[a-z]*)(?:\s*bis\s*(\d+[a-z]*))?/g)) for (const p of paraRange(n[1]!, n[2])) out.add(p)
  }
  for (const m of heading.matchAll(/§(?!§)\s*(\d+[a-z]*)/g)) out.add(m[1]!)
  return [...out]
}

/** „124" bis „130" → 124 … 130; „5a" bis „5c" → 5a, 5b, 5c; any other pair its two ends (`headingParas`). */
function paraRange(from: string, to: string | undefined): string[] {
  if (!to) return [from]
  const [fn, fx] = zifferPlace(from)
  const [tn, tx] = zifferPlace(to)
  if (!fx && !tx && tn > fn && tn - fn < 60) return Array.from({ length: tn - fn + 1 }, (_, k) => String(fn + k))
  if (fn === tn && fx && tx && tx > fx) return Array.from({ length: tx.charCodeAt(0) - fx.charCodeAt(0) + 1 }, (_, k) => `${fn}${String.fromCharCode(fx.charCodeAt(0) + k)}`)
  return [from, to]
}

/** „11a" → [11, „a"]: a Ziffer's place in its draft's sequence. */
const zifferPlace = (z: string): [number, string] => [Number.parseInt(z, 10), /[a-z]*$/.exec(z)![0]]
/** Whether Ziffer `a` stands before `b`: „3" < „3a" < „4". */
const zifferBefore = (a: string, b: string) => {
  const [an, ax] = zifferPlace(a)
  const [bn, bx] = zifferPlace(b)
  return an !== bn ? an < bn : ax < bx
}

/**
 * „Zu Z 1 und 3", „Zu den Z 3 bis 5", „Zu Ziffer 2", „Zu Z 11a" → „1", „3" /
 * „3", „4", „5" / „2" / „11a": the Ziffern as the draft numbers them, letter
 * and all. „11a" is the instruction a later stage slotted in behind 11,
 * never 11 itself: read as 11, „Zu Z 11a" explained the § Ziffer 11 changes
 * (19.11.2026). A range takes every Ziffer of `known` — the draft's own, as
 * its instructions number them — from its first to its last, so „Z 3 bis 5"
 * holds a „3a"; without them, its whole numbers, and „11a bis 11c" its
 * letters.
 */
export function headingZiffern(heading: string, known: readonly string[] = []): string[] {
  const m = /\bZ(?:iffer)?n?\.?\s*(\d+[a-z]*(?:\s*(?:,|und|bis|sowie)\s*\d+[a-z]*)*)/.exec(heading)
  if (!m) return []
  const out: string[] = []
  const parts = m[1]!.split(/\s*(,|und|sowie)\s*/).filter((p) => !/^(?:,|und|sowie)$/.test(p))
  for (const part of parts) {
    const range = /^(\d+[a-z]*)\s*bis\s*(\d+[a-z]*)/.exec(part)
    if (!range) {
      if (/^\d+/.test(part)) out.push(/^\d+[a-z]*/.exec(part)![0])
      continue
    }
    const [from, to] = [range[1]!, range[2]!]
    const within = known.filter((z) => !zifferBefore(z, from) && !zifferBefore(to, z))
    if (within.length) {
      out.push(...within)
      continue
    }
    const [fn, fx] = zifferPlace(from)
    const [tn, tx] = zifferPlace(to)
    if (fn === tn && fx && tx) {
      for (let c = fx.charCodeAt(0); c <= tx.charCodeAt(0); c++) out.push(`${fn}${String.fromCharCode(c)}`)
      continue
    }
    out.push(from)
    for (let n = fn + 1; n <= tn && n - fn < 60; n++) out.push(String(n))
    if (tx && tn > fn) out.push(to)
  }
  return out
}

/**
 * The package's Artikel an entry's heading names, by the Bund's rule
 * (`ownArticleKeys`, `isCitedArticle` in `explanations/explanationsHtml.ts`;
 * this module stays free of imports): outside the brackets, which carry the
 * provision amended, before the colon, and without an Artikel another act's
 * — one followed by „Abs", „lit", „Satz", „der"/„des" or an act's
 * abbreviation. „Zu Art 28 Abs 3a:" under „Zu Art 1 (Landes-Verfassungsgesetz
 * 1999)" (Salzburg 32374) is the Landesverfassung's Artikel 28, and read as
 * the package's it carried the entries below it to the 28th law. A range
 * („Zu Art 7 bis 17", „Zu Artikel III bis V") names several.
 */
function ownArticles(heading: string): { article: string | null; several: boolean } {
  let address = heading
  for (let i = 0; i < 2; i++) address = address.replace(/\([^()]*\)/g, ' ')
  // A bracket left open ran on into the prose and the next line: „Zu Z 6 (§ 21
  // Abs. 3 Diese Bestimmung regelt … Artikel 26 Änderung des …" (Burgenland).
  address = (address.split(':')[0] ?? address).replace(/\(.*$/, ' ')
  const out = new Set<string>()
  let range = false
  for (const m of address.matchAll(/(?<![a-zäöü])Art(?:ikel)?\.?\s*([IVXL]+|\d+)(?![\da-z])\s*(\S*)/gi)) {
    const next = m[2]!
    if (/^(?:Abs|Absatz|lit|Satz|der|des)\b/i.test(next) || /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]*[A-ZÄÖÜ]/.test(next)) continue
    out.add(m[1]!)
    if (/^bis$/i.test(next)) range = true
  }
  return { article: out.size === 1 && !range ? [...out][0]! : null, several: out.size > 1 || range }
}

/**
 * „Zu Abs 1:", „Zu Abs 3 und 4:", „Zu Abs 1 – Einleitungssatz:" under an entry
 * whose heading names a §: a sub-heading of that §'s Begründung, part of its
 * text, as the Bund's join owns such a passage (`ownedPassages`). An entry
 * of its own, it named no § — and the § join (`reasonsByParagraph`) lost its
 * text. Until 21.11.2026 the furniture rule dropped the line where a
 * document repeats it three times (`withoutFurniture`), and its text stood
 * in the § above by accident; elsewhere it opened an entry.
 */
function isSubHeading(line: string, above: string): boolean {
  if (!/^Zu\s+Abs\b/.test(line) || !headingParas(above).length || headingParas(line).length) return false
  const own = ownArticles(line)
  return !own.article && !own.several
}

/** „Zu Z 3:", „Zu Z 1 lit a:", „Zu Z 1 („Drittstaat mit hohem Risiko“):", „Zu den Z 2 und 3:" — Ziffern, and no § and no Artikel of their own. */
function isBareZiffer(line: string): boolean {
  if (!/^Zu\s+(?:den\s+)?Z(?:iffer)?n?\.?\s*\d/.test(line) || headingParas(line).length) return false
  const own = ownArticles(line)
  return !own.article && !own.several
}

/** A heading titled by § alone: „Zu § 3 („Weitere Begriffsbestimmungen“):" — not an instruction's „Zu Z 5 (§ 3):", not an Artikel's. */
function paragraphAlone(heading: string): boolean {
  return headingParas(heading).length > 0 && !/^Zu\s+(?:den\s+)?Z/.test(heading) && !/^Zu\s+Art/.test(heading)
}

/**
 * Whether a document's bare „Zu Z …:" headings are the Ziffern of the §
 * above them (22.11.2026), decided per document as the Bund's join decides
 * it (`bareZiffernOfParagraphs` in `explanations/reasoningDiff.ts`): where
 * every one stands in a run under a heading titled by § alone — read back
 * over bare Ziffer headings and „Zu Abs" sub-headings. Salzburg's 32001
 * explains § 7 so, „Zu § 7 (…):" then „Zu Z 3:", „Zu Z 4:"; read as entries
 * of their own, the instructions numbered 3 and 4 took them, and § 2 and
 * § 3 got § 7's Begründung. One that stands elsewhere means the document
 * heads its instructions so — „Zu Z 1:", „Zu Z 2:" —, and then none is a §'s.
 * Over the 1,365 cached Land PDFs, 210 documents carry bare „Zu Z" headings:
 * 17 write every one under a § heading (358 entries now part of their §'s),
 * 12 mix both uses, 181 head instructions so.
 */
function ziffernOfParagraphs(headings: readonly string[]): boolean {
  let any = false
  for (let i = 0; i < headings.length; i++) {
    if (!isBareZiffer(headings[i]!)) continue
    any = true
    let j = i - 1
    while (j >= 0 && (isBareZiffer(headings[j]!) || (/^Zu\s+Abs\b/.test(headings[j]!) && !headingParas(headings[j]!).length))) j--
    if (j < 0 || !paragraphAlone(headings[j]!)) return false
  }
  return any
}

/**
 * The particular part from its first entry on: one entry per „Zu …"
 * heading (`entry`), up to the document's end marker (`END_RE`).
 */
function particularOf(lines: readonly Line[], entry: RegExp): ParticularExplanation[] {
  const particular: ParticularExplanation[] = []
  let body = lines
  const end = body.findIndex((l, i) => i > 0 && (END_RE.test(l.text) || MOTION_RE.test(l.text)))
  if (end > 0) body = body.slice(0, end)
  let current: { heading: string; lines: Line[] } | null = null
  /*
   * The Artikel heading in force (20.11.2026), as the Bund's reader keeps it
   * (`explanationsHtml.ts`): a package heads each law once — „Zu Artikel II"
   * — and its entries by Ziffer alone below it. Read from the entry's own
   * heading only, „Zu Z 1:" under Artikel II stood under none and was looked
   * up in Artikel I (`explainedParagraphs`): 705 entries of 32 drafts follow
   * an Artikel heading other than the first.
   */
  let mark: string | null = null
  const flush = () => {
    if (!current) return
    const text = paragraphs(current.lines).flatMap((p) => [...(p.heading ? [p.heading] : []), ...p.text])
    const own = ownArticles(current.heading)
    // One entry for several Artikel belongs to none, and the mark no longer says which law follows.
    if (own.several) mark = null
    else if (own.article) mark = own.article
    particular.push({ article: own.several ? null : mark, paras: headingParas(current.heading), heading: current.heading, text })
  }
  let headingOpen = false
  const ziffern = ziffernOfParagraphs(body.map((l) => l.text).filter((t) => entry.test(t)))
  for (const l of body) {
    const line = l.text
    if (current && (isSubHeading(line, current.heading) || (ziffern && isBareZiffer(line) && paragraphAlone(current.heading)))) {
      headingOpen = false
      current.lines.push(l)
      continue
    }
    if (entry.test(line)) {
      flush()
      current = { heading: line, lines: [] }
      headingOpen = !/:$/.test(line)
      continue
    }
    if (!current) continue
    // A heading that wraps — „Zu Art. I Z 5 bis 9 und 12 bis 14 und 16 (§ 4 Abs." / „1 und 2):".
    if (headingOpen && current.heading.length < 220 && (/^[^.]{0,80}\):?$/.test(line) || /\($/.test(current.heading) || /\([^)]*$/.test(current.heading))) {
      current.heading = `${current.heading} ${line}`
      headingOpen = !/:$/.test(line) && /\([^)]*$/.test(current.heading)
      continue
    }
    headingOpen = false
    current.lines.push(l)
  }
  flush()
  return particular
}

/**
 * Burgenland's Erläuterungen (30.10.2026): after the law text a „Vorblatt"
 * — Problem, Ziel und wesentlicher Inhalt, Alternativen, Finanzielle
 * Auswirkungen, each headed by a short line ending in its colon — and then
 * „Erläuterungen:" with the particular part alone, „Zu § 22h", „Zur
 * Änderung des Inhaltsverzeichnisses". The Land writes no „Allgemeiner
 * Teil": the Vorblatt is its general part, and the page shows it under that
 * name. Read from „Erläuterungen:", the first entry stood as the whole
 * general part. The colon rule for headings holds inside the Vorblatt only:
 * over whole documents a rule by the text alone was wrong nearly always
 * (`boldHeading`). Null where the document has no Vorblatt before its
 * Erläuterungen — then it is read as any other.
 */
const VORBLATT_RE = /^Vorblatt:?$/
const VORBLATT_HEADING_RE = /^\p{Lu}[^.;,:]{2,110}:$/u
/* „Zur Änderung des Inhaltsverzeichnisses", „Zum Titel" — never „Zur Vermeidung von … wird", prose that opens alike. */
const VORBLATT_ENTRY_RE = new RegExp(`${ENTRY_RE.source}|^Zu[rm]\\s+(?:Änderung|Einfügung|Aufhebung|Entfall|Neufassung|Inhaltsverzeichnis|Titel|Langtitel|Kurztitel|Promulgationsklausel|Anlage)\\b[^.]*$`, 'u')

/** The Vorblatt's lines with its headings marked — one that wraps („… Frauen und" / „Männer:") joined into one line. */
function vorblattLines(lines: readonly Line[]): Line[] {
  const out: Line[] = []
  for (const l of lines) {
    const prev = out.at(-1)
    if (VORBLATT_HEADING_RE.test(l.text) && prev && !prev.bold && DANGLING_RE.test(prev.text) && VORBLATT_HEADING_RE.test(`${prev.text} ${l.text}`.replace(/,/g, ''))) {
      out[out.length - 1] = { text: `${prev.text} ${l.text}`, bold: true }
    } else {
      out.push(VORBLATT_HEADING_RE.test(l.text) ? { ...l, bold: true } : l)
    }
  }
  return out
}

function vorblattParse(lines: readonly Line[], title: number): LandExplanationsParse | null {
  const at = lines.findIndex((l) => VORBLATT_RE.test(l.text))
  if (at < 0 || title <= at) return null
  const general = paragraphs(vorblattLines(lines.slice(at + 1, title)))
  const particular = particularOf(lines.slice(title + 1), VORBLATT_ENTRY_RE)
  if (!general.length && !particular.length) return null
  return { general: [{ heading: 'Vorblatt', text: [] }, ...general], labelled: true, particular }
}

/**
 * The Erläuterungen in a document's pages; `bold` says, per page and line,
 * which lines are set in bold (`pdfStyledPages`) — without it, only numbered
 * headings are found.
 */
export function parseLandExplanations(
  pageTexts: readonly string[],
  bold?: readonly (readonly boolean[])[],
  options: { vorblatt?: boolean } = {},
): LandExplanationsParse | null {
  const lines = withoutFurniture(pageTexts.map((p, n) => p.split('\n').map((l, i) => ({ text: l.replace(/\s+/g, ' ').trim(), bold: bold?.[n]?.[i] ?? false }))))
  const title = lines.findIndex((l) => TITLE_RE.test(l.text))
  if (options.vorblatt) {
    const parse = vorblattParse(lines, title)
    if (parse) return parse
  }
  const startAt = lines.findIndex((l, i) => START_RE.test(l.text) && (title < 0 || i >= title))
  const begin = startAt >= 0 ? startAt : title >= 0 ? title + 1 : -1
  if (begin < 0) return null
  const rest = lines.slice(begin)
  // The particular part begins at its heading where the document has one; a
  // „Zu Art 1 Z 5 …" before it is a row of the general part's tables (the
  // costs per provision, Salzburg's Raumordnungs-Novelle 2025).
  const particularHead = rest.findIndex((l, i) => i > 0 && PARTICULAR_RE.test(l.text))
  const particularAt = particularHead >= 0 ? particularHead : rest.findIndex((l, i) => i > 0 && ENTRY_RE.test(l.text))
  const generalLines = particularAt < 0 ? rest : rest.slice(0, particularAt)
  const generalEnd = generalLines.findIndex((l, i) => i > 0 && END_RE.test(l.text))
  const general = paragraphs(generalEnd < 0 ? generalLines : generalLines.slice(0, generalEnd))

  const particular = particularAt >= 0 ? particularOf(rest.slice(particularAt), ENTRY_RE) : []
  if (!general.length && !particular.length) return null
  return { general, labelled: startAt >= 0, particular }
}
