/**
 * A Land's draft, from the text of its PDF, as the blocks `segmentUnits`
 * reads (22.10.2026) — so the § comparison the Bund's drafts have can hold a
 * Land's Begutachtungsentwurf against its Kundmachung in the
 * Landesgesetzblatt (RIS XML, which the existing parser reads).
 *
 * PURE MODULE — the PDF's text comes in as pages; extracting it is the
 * caller's.
 *
 * A Land publishes its drafts only as PDF: there is no RIS Begutachtung for
 * Landesrecht. What the PDF's text layer gives is clean on the drafts read
 * (Oberösterreich, 2026): page numbers, Salzburg's running head (`pageLines`),
 * no split words but the ordinary hyphenation, and the legal text in the legistic form the
 * Landesgesetzblatt prints — Artikel, the clause „… wird wie folgt geändert:",
 * numbered instructions, the new wording in quotes.
 *
 * So no layout is reconstructed. Lines are joined into paragraphs, and two
 * kinds are typed: the Artikel, because it resets the numbering per law,
 * and the instruction — a paragraph that opens with a number, stands
 * outside any quote, and follows a clause „… wird wie folgt geändert:" in
 * the same Artikel. All three, because a new law's own Ziffern („1. die
 * …") are numbered and unquoted too, and a quoted § can hold a numbered list.
 * Everything else is plain text, which `segmentUnits` appends to the open
 * unit.
 */
import type { TextBlock } from '../lawtext/lawUnits'
import { RUNS_ON_RE } from './landTgu'

/** Running header and footer lines of the Land's draft template. */
/* Tirol's running head is its Geschäftszahl and version: „VD-173/2-2026 Fassung vom 9. März 2026" (23.10.2026),
   and a Geschäftszahl of three parts, „VD-1590/1/33-2026 Fassung vom 24. August 2026" (21.11.2026: 26 lines in the
   1,365 cached Land PDFs, read as law in 575/2026's §§ until then; every other line with „Fassung vom" runs on). */
export const NOISE_RE = /^(?:Seite \d+(?: von \d+)?|\d+ von \d+|- ?\d+ ?-|\d+|[A-Z]:\\.*\.docx?\b.*|E n t w u r f|[A-Z]{2,5}-\d+(?:\/\d+){1,2}-\d{4} Fassung vom \d{1,2}\. \p{L}+ \d{4})$/u

/**
 * A page's number, standing alone: page furniture only as the page's first
 * or last line of text (19.11.2026). Dropped wherever it stood until then,
 * and with it every table value printed on a line of its own — the
 * percentages of Salzburg's Landesbedienstetengesetz § 130 (34234), the
 * Tarifposten of its Kehrtarif (34874): against the Landesgesetzblatt, which
 * keeps them, the Landtag read as having inserted them; between two PDFs a
 * changed value read as unchanged. The rule the Salzburg
 * Textgegenüberstellung's reader applies (`withoutPageNumber`). Old against
 * new over 848 cached Land PDFs (606 with law text): 23 change, each a number
 * restored — a table cell, a Tarifpost, a year in a title („für das Jahr
 * 2026") — or a running head dropped (below); no page number entered a block.
 */
const BARE_NUMBER_RE = /^\d+$/
/**
 * Salzburg's running head — the file's path and Word's save stamp, „Q:\2003\
 * GESETZ-BEARBEITEN-AKTUELL\….docx \ 27.11.2025 07:29:00" — tested line by
 * line (19.11.2026): wrapped onto two lines, neither line held both the path
 * and „.docx", `NOISE_RE` passed both, and the head read as law (33547). A
 * network path „\\land-sbg\…" too (a 2024 draft). Not every line that names
 * „.docx": law text can name a file format.
 */
const RUNNING_HEAD_RE = /^(?:[A-Z]:\\|\\\\)\S|\.docx?\s*\\\s*\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}(?::\d{2})?$/

/**
 * Kärnten's session stamp, „REG.SITZG.", over every page of a Vorlage for
 * the Regierungssitzung (20.11.2026). Joined to the line before it, it read
 * as law: in an instruction across a page break, in an Artikel's title
 * („Artikel II Änderung des Kärntner Dienstrechtsgesetzes 1994 REG.SITZG.")
 * — against the draft and against the Landesgesetzblatt 198 units of
 * Kärnten's station pairs showed it inserted or removed, 128 changed by
 * nothing else (ktn-104907-2025-32). Measured over 848 cached Land PDFs:
 * 170 lines in 34 PDFs, every one Kärnten's, every one the stamp alone —
 * „REG.SITZG." 161, „REG.SITZG" 7, „REG-SITZG." 2 — and every one the
 * page's first line once its page number („1 von 20") is dropped. So only
 * there: a page's own furniture by its place, as the bare number is.
 */
const SESSION_STAMP_RE = /^REG[.-]SITZG\.?$/

/** A page's lines of law text: without its running head and footer, a session stamp at its head, and a bare number at its edge (`BARE_NUMBER_RE`). */
function pageLines(page: string): string[] {
  const all = page.split('\n').map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !RUNNING_HEAD_RE.test(l) && (BARE_NUMBER_RE.test(l) || !NOISE_RE.test(l)))
  const lines = SESSION_STAMP_RE.test(all[0] ?? '') ? all.slice(1) : all
  return lines.filter((l, k) => !BARE_NUMBER_RE.test(l) || (k > 0 && k < lines.length - 1))
}

/** Where the legal text begins: the enacting clause. */
/* A Verordnung is issued, not resolved: „Auf Grund des § … wird verordnet:".
   Kärnten and Steiermark name their Landtag inside the clause („Der Landtag
   von Kärnten hat beschlossen:", 71 lines in the 849 cached Land PDFs; „Der
   Landtag Steiermark hat beschlossen:", 35), and until 21.11.2026 the reader
   started at the title fallback below and left their single laws unnamed. */
export const ENACTING_RE = /(?:Landtag(?: von Kärnten| Steiermark)? hat beschlossen|wird verordnet):?$/
/** Where it ends, if the PDF goes on: the explanations or the comparison after it. */
/* And at a Vorblatt (15.11.2026). Burgenland and Wien print one between the
   law and its Erläuterungen, and the reader went on into it — its
   „Problem", „Ziel", „Finanzielle Auswirkungen" read as law, in the Länder
   comparison, the Textgegenüberstellung guard (Wien) and the EU reader's
   blocks (Burgenland's Verordnung on the Windkraft- und Photovoltaikabgabe,
   85a6a5d5). Measured over 697 cached Land PDFs: the word stands on 144
   lines in 142 of them; 110 lie inside the law as the reader takes it, every
   one the bare heading „Vorblatt", and none stands before a law the reader
   finds. In running text it reads „siehe Vorblatt", „im Vorblatt", „auf das
   Vorblatt" — never at the line's start — so only the heading ends the law:
   alone on its line, or „Vorblatt und Erläuterungen …" (Steiermark). Old
   against new over those PDFs: 108 change, each one the law cut at its
   Vorblatt with every block before it unchanged; the EU reader, which cuts
   there itself (`landGesetzestext.ts`), reads the same. */
export const AFTER_LAW_RE = /^(?:Erläuterungen|Textgegenüberstellung|Vorblatt(?:$|\s+und\s+Erläuterungen)|[AB]\.\s+(?:Allgemeiner|Besonderer)\s+Teil)\b/

const ARTICLE_LINE_RE = /^Artikel\s+(?:[IVXL]+|\d+[a-z]?)\.?$/
/** What an Artikel's title line says — never the amending clause under an untitled Artikel. */
const ARTICLE_TITLE_RE = /^(?:Änderung|Inkrafttreten|Außerkrafttreten|Übergangs|Schluss|Aufhebung|Erlassung|Umsetzung|Verweis|(?:Landes)?[Gg]esetz\b|Verordnung\b)/
/** The clause that turns the paragraphs after it into instructions. */
/* „wird wie folgt geändert:" (Oberösterreich), „wird geändert wie folgt:"
   (Salzburg) — and without the „wird" a Salzburg draft dropped (31136). */
const AMENDING_RE = /(?:wird )?(?:(?:wie folgt|folgendermaßen) geändert|geändert wie folgt):?$/
const NUMBERED_RE = /^(\d+)[a-z]?\.(?:\s|(?=\p{Lu}))/u
/**
 * A sub-instruction's number: a number, a dot, and a digit straight after —
 * „15.1.1.", „26a.1.", „18.1a.", „1.1.a", „2.1 Abs", „19.1.Nach" — or the
 * draft's „2. 2." (19.11.2026). Salzburg nests its instructions three levels
 * deep, letters them and drops a dot or a space; RIS sets the inner ones as
 * `novao2`. Only „2.2. " joined its instruction until then: every other
 * form opened a unit of its own on the Landesgesetzblatt's side only —
 * `segmentUnits` took „15." for the number and named the rest „Z15#dup" —
 * while the PDF reader keeps the same lines inside instruction 15
 * (`NUMBERED_RE` refuses a number a digit follows). Identical texts read
 * as the instruction „geändert" and each sub-instruction „neu" (Salzburg
 * 32075: Z15 and 13 „Z15#dup"), and where the instruction's own line was
 * short, the table-of-contents rule of `segmentUnits` dropped it. Old
 * against new over 309 cached Land XMLs: 39 move, every one Salzburg's, 227
 * „#dup" units joined to their instruction; none of the 23 Oberösterreich
 * XMLs moves, nor any PDF's blocks. Shared with the Landesgesetzblatt's
 * reader (`lgblUnits`). Not an instruction whose division is an ordinal
 * with no space after it, „2. 3.Teil Z 16 lautet:": that is instruction 2,
 * and the 3. Teil its address (review, 19.11.2026).
 */
export const SUB_INSTRUCTION = String.raw`\d+[a-z]?\.(?:\d|\s\d+[a-z]?\.(?!\s?(?:Teil|Abschnitt|Unterabschnitt|Hauptstück)))`
/* A sub-instruction of a nested numbering („2.1.", and the draft's „2. 2."):
   part of instruction 2, as the Landesgesetzblatt reads it (Salzburg). */
const SUB_NUMBERED_RE = new RegExp(`^${SUB_INSTRUCTION}`)
/* An instruction whose number lost its dot („2 Im § 34 …", Salzburg) — taken
   only as the next number of the sequence, saying what it does. */
const UNDOTTED_RE = /^(\d+)\s+(?=(?:Im|Dem|Nach|Vor|Der|Die|Das|In|§)\s)/
/** What an instruction says it does — the second signal beside the number. */
const INSTRUCTION_VERB_RE = /\b(?:lautet|lauten|entfällt|entfallen|eingefügt|angefügt|ersetzt|erhält|erhalten|eingeführt|aufgehoben|vorgenommen|geändert)\b/

/** How many quotes a text opens minus how many it closes. */
function quoteDepth(text: string): number {
  const open = (text.match(/[„»]/g) ?? []).length
  const close = (text.match(/[“«]/g) ?? []).length
  return open - close
}
/** A line that opens a paragraph of its own. „7.Im § 8 …": the PDF drops
 *  the space after a number now and then (16120). */
const OPENS_RE = /^(?:\d+\.\s?\d+\.\s|\d+\s+(?:Im|Dem|Nach|Vor)\s|[„"»]?\d+[a-z]?\.(?:\s|(?=\p{Lu}))|[„"»]?\(\d+[a-z]?\)\s|[„"»]?§{1,2}\s*\d|[–-]\s|[„"»]?Artikel\s)/u
/**
 * What the RIS parser leaves out of the Landesgesetzblatt, left out here too
 * so the two sides compare like with like (measured on 16120, 22.10.2026):
 * a quoted division heading — „4. Abschnitt", „V. ABSCHNITT", „6.Abschnitt",
 * Salzburg's „IVa. Umsetzungshinweis, …" — and the title lines under it —
 * which RIS sets as a heading and `segmentUnits` drops as payload, and the
 * § entries of a table of contents, which RIS sets as `inhaltsvz`.
 */
const DIVISION_RE = /^[„"»]?(?:\d+[a-z]?|[IVXL]+)\.\s*(?:Abschnitt|Unterabschnitt|Hauptstück|Teil)(?:\s.*)?$/i
/* Nor a cross-reference wrapped onto its own line (15.11.2026): „… Soweit
   jedoch Förderungsmaßnahmen nach dem / 4. Unterabschnitt geboten sind, …"
   (Tirol 2026-135, § 7) took the pattern above for a heading, and the reader
   dropped it and every line after it up to the next opener — the rest of the
   Absatz, gone from the Länder comparison and the EU reader. A heading has
   nothing after the division word, or a title; running text goes on in
   lower case. A separate test, case-sensitive: under the `i` the pattern
   above needs for „ABSCHNITT", a case test is none (see 12.11.2026 below).
   It holds for the Roman pattern below too, which takes „II. Abschnitt bei
   den Bestimmungen …" for a title. Measured over 692 cached Land PDFs:
   1.498 lines matched, 1.368 a bare heading, 114 a title (each in capitals
   or a repeated „2. ABSCHNITT"), 3 instructions kept anyway, and 11 running
   text — each going on in lower case, none of the headings. Old against new
   over those PDFs and Tirol 2026-135's two: 7 change, every change text
   restored, no block lost, no heading kept. */
const DIVISION_RUNNING_RE = /^[„"»]?(?:\d+[a-z]?|[IVXL]+[a-z]?)\.\s*(?:[Aa]bschnitt|ABSCHNITT|[Uu]nterabschnitt|UNTERABSCHNITT|[Hh]auptstück|HAUPTSTÜCK|[Tt]eil|TEIL)\s+\p{Ll}/u
/* A Roman numeral and a title on the same line („IVa. Umsetzungshinweis,
   Verweisungen auf das Unionsrecht", „VIIa. ABSCHNITT") — case-sensitive
   (12.11.2026): under the `i` the first pattern needs, „lit. a, …" and „lt.
   Verteiler" read as a numeral „li"/„l", a letter and a title, and the reader
   dropped them and every line after them up to the next opener — law text,
   gone from the Länder comparison and the EU reader (ooe-2025-16101 § 12
   Abs. 1). Nor is it a numeral the next word declines or counts — a
   cross-reference wrapped onto its own line („I. Teiles dieses Hauptstückes
   zuzulassen, …", „IV. Abschnitts, soweit …") or a row of a salary table
   („I. Dienstklasse"), whose cells RIS reads as text (`risXml.ts`). Measured
   over 1.232 cached Land PDFs: 16 change, every change law text restored,
   no line dropped that was kept before. */
const ROMAN_DIVISION_RE = /^[„"»]?[IVXL]+[a-z]?\.\s+(?!(?:Abschnitt|Unterabschnitt|Hauptstück|Teil)e?s\b|Ordnung\b|Dienstklasse\b)\p{Lu}\D*$/u
const isDivision = (line: string) => (DIVISION_RE.test(line) || ROMAN_DIVISION_RE.test(line)) && !DIVISION_RUNNING_RE.test(line)
const TOC_ENTRY_RE = /^[„"»]?§{1,2}\s*\d+[a-z]*(?:\s+\S|[“"«]?$)/

/** A new law's § designation alone on its line („§ 2"); its title follows. */
const BARE_PARAGRAPH_RE = /^§\s*(\d+[a-z]*)\.?$/

/** A suspended compound part („Arbeits- und …") keeps its hyphen and its space. */
const CONJUNCTION_RE = /^(?:und|oder|bzw\.|sowie|bis)\b/

function joinLines(a: string, b: string): string {
  if (!a.endsWith('-') || a.endsWith(' -')) return `${a} ${b}`
  if (CONJUNCTION_RE.test(b)) return `${a} ${b}`
  // „Gleich-" + „behandlung": the line break split one word.
  if (/^\p{Ll}/u.test(b)) return `${a.slice(0, -1)}${b}`
  // „Agrarrecht-" + „Organisationsgesetz": a compound, hyphen and all.
  return `${a}${b}`
}

/**
 * A § whose sign the PDF lost (19.11.2026): Salzburg's Glücksspielgesetz
 * prints „Spielgeheimnis" / „§ 36" like every § around it, and the text
 * layer holds „Spielgeheimnis" / „36". Kept as text, the heading and the
 * number ran into § 35 („… jährlich zu berichten. Spielgeheimnis 36"), and
 * against the Landesgesetzblatt § 35 read as changed and § 36 as inserted
 * (sbg-31605). A bare number is the lost „§ N" only where all three say so:
 * it is the next number after the last § the text set, the line above is a
 * title (no closing punctuation), and the § opens below it with „(1)". A
 * table cell meets none of these by itself.
 */
function restoreLostSigns(lines: string[]): string[] {
  let last: number | null = null
  return lines.map((line, k) => {
    const sign = BARE_PARAGRAPH_RE.exec(line)
    if (sign) {
      last = Number.parseInt(sign[1]!, 10)
      return line
    }
    if (!BARE_NUMBER_RE.test(line) || last === null || Number(line) !== last + 1) return line
    const above = lines[k - 1] ?? ''
    if (!above || /[.,;:)]$/.test(above) || !/^\(1\)\s/.test(lines[k + 1] ?? '')) return line
    last = Number(line)
    return `§ ${line}`
  })
}

/**
 * A line that opens like a paragraph of its own and is the sentence's next
 * word where the line above runs on (`RUNS_ON_RE`, 21.11.2026): a cited §
 * („… § 27 Abs. 7 Z 1," / „§ 29 Abs. 4, … ersetzt.", Oö. 2026-16118; „…
 * aus einem der im" / „§ 3 Abs. 1 genannten Gründe“ ersetzt.", 2026-16120)
 * or a date („… bis zum" / „31. August des aktuellen Jahres“ …", Tirol
 * 2026-730). Opened, each cut its instruction in two, and the § it named
 * was named by no instruction. Not a numbered item of a list, which opens
 * after „und", „oder" or a comma as well.
 */
const WRAPPED_OPENER_RE = /^(?:§{1,2}\s*\d|\d{1,2}\.\s+(?:Jänner|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b)/

/** A line this long fills the measure: text that wraps, not a title set on its own line. */
const TEXT_MEASURE = 85

/**
 * The line under a new law's „§ N" that is the first line of its text, not
 * its title (20.11.2026): a line closed by a full stop, colon or semicolon
 * („Diese Verordnung tritt mit 1. Jänner 2027 in Kraft.", „Im Sinn dieser
 * Verordnung bedeuten die Begriffe:"), or one that fills the measure with no
 * numbered Absatz under it („Für die Ausübung der sicherheitsrelevanten
 * Tätigkeiten des Rauchfangkehrergewerbes im Sinn des" / „§ 120 Abs 1 …",
 * Salzburg 31933). Taken for the title, it stood on the page as a heading
 * the Landesgesetzblatt inserted, and the text lost its first line.
 *
 * Measured over the 849 cached Land PDFs: the title rule kept 1,433 lines
 * as titles, 45 of them first lines of text read by hand; this check takes
 * 36 of them back and no real title. No real title ends in one of these
 * marks; real titles run to 90 characters with „(1)" under them, to 83
 * without. Still read as titles: nine first lines of 64 to 84 characters
 * (five Burgenland Gemeindegrenzen, a Burgenland Gemeindeverband, two
 * Inkrafttreten and an Aufhebung in Oberösterreich): at that length a
 * line does not tell its kind, and every lower measure costs real titles.
 */
function isFirstTextLine(line: string, next: string | undefined): boolean {
  return /[.;:]$/.test(line) || (line.length >= TEXT_MEASURE && !/^\(\d/.test(next ?? ''))
}

/**
 * The legal text of a draft PDF as blocks, or null where no enacting clause
 * marks it — then the PDF is not a draft law this reader can take apart.
 */
export function lawBlocksFromPdfPages(pages: readonly string[]): TextBlock[] | null {
  const lines = restoreLostSigns(pages.flatMap(pageLines))
  // Where a draft leaves out the enacting clause (Salzburg's S.WFG 2025),
  // its title „Gesetz vom …… über/, mit dem …" marks the start instead.
  const enacting = lines.findIndex((l) => ENACTING_RE.test(l))
  const start = enacting >= 0 ? enacting : lines.findIndex((l) => /^(?:Landes)?(?:[Gg]esetz|Verordnung)\s+vom\b/.test(l))
  if (start < 0) return null

  const blocks: TextBlock[] = []
  /* A law without Artikel is named by its title above the enacting clause
     („Landesgesetz über die Regelung der Krankenfürsorge …"): the name the
     Landesgesetzblatt gives its Artikel when it bundles the law with
     another (16087), so the two pair by title. */
  const titleStart = lines.slice(0, start).findLastIndex((l) => /^(?:Landes)?[Gg]esetz\b|^Verordnung\b/.test(l))
  if (titleStart >= 0 && start - titleStart <= 6) {
    blocks.push({ kind: 'title', cls: 'pdf', text: lines.slice(titleStart, start).reduce((a, l) => joinLines(a, l)), gld: null })
  }
  let para: string | null = null
  /* The last line added to the paragraph — Salzburg sets a § title ABOVE
     its „§ 1" („Begriffsbestimmungen" / „§ 1"), so the line before a bare §
     can be its title rather than the end of the § before. */
  let lastLine: string | null = null
  let lastLineAt = -1
  /* The paragraph as it stood before its last line was joined on, and that
     line's predecessor — a title can run over two lines (below). */
  let beforeLast: string | null = null
  let beforePrev: string | null = null
  let prevLine: string | null = null
  /* A NEW law (no amending clause): „§ 2" opens a §, the line after it is
     its title, the paragraph after that carries the symbol — the shape the
     Landesgesetzblatt's XML has once its heading is taken apart
     (`lgblUnits`). Measured on the seven new laws of the oracle. */
  let paraGld: string | null = null
  let pendingGld: string | null = null
  let title: string | null = null
  let titledAbove = false
  /* Quote depth before the paragraph being built, and whether this Artikel
     has said that it amends. */
  let depth = 0
  let amending = false
  let lastNumber = 0
  const flush = () => {
    if (para) {
      const undotted = Number(UNDOTTED_RE.exec(para)?.[1] ?? 0)
      const n = SUB_NUMBERED_RE.test(para)
        ? 0
        : Number(NUMBERED_RE.exec(para)?.[1] ?? (undotted === lastNumber + 1 && INSTRUCTION_VERB_RE.test(para) ? undotted : 0))
      /* Outside the quotes — or, where a quote was never closed, the next
         number of the sequence saying what it does. A draft is a draft:
         16120 opens „§ 4 „Auswahlverfahren" with one quote too many, and
         by quotes alone its instruction 13 swallowed the 19 after it. */
      // A law amended in one respect: its instruction carries no number and
      // stands directly under the clause (16039, 16017).
      const single = amending && n === 0 && lastNumber === 0 && depth === 0 &&
        blocks.at(-1)?.kind === 'ziff' && AMENDING_RE.test(blocks.at(-1)!.text) && INSTRUCTION_VERB_RE.test(para)
      // The number must go on from the last one — the next, one skipped, or
      // the same with a letter („2a.") — or a numbered row of a table in the
      // payload, unquoted in the PDF, opens instruction 46 after 7 (Salzburg
      // Zulagenverordnung 2024).
      const lettered = /^\d+[a-z]\./.test(para)
      const inSequence = n === lastNumber + 1 || n === lastNumber + 2 || (lettered && n === lastNumber)
      const instruction = single || (amending && n > 0 && inSequence && (depth === 0 || (n === lastNumber + 1 && INSTRUCTION_VERB_RE.test(para))))
      if (instruction) {
        depth = 0
        // A draft that counts its instructions from „0." (Salzburg 35591): its „1." is the next.
        lastNumber = /^0\.\s/.test(para) ? 0 : Math.max(n, 1)
      }
      // Plain paragraphs as `ziff`: appended to the open unit, and never
      // promoted to an instruction by `segmentUnits` behind this reader's back.
      // The first paragraph of a new law's § carries its symbol, as `abs`.
      blocks.push({ kind: instruction ? 'novao' : paraGld ? 'abs' : 'ziff', cls: 'pdf', text: para, gld: paraGld })
      paraGld = null
      depth = Math.max(0, depth + quoteDepth(para))
      if (depth === 0 && AMENDING_RE.test(para)) amending = true
    }
    para = null
  }
  /* The Artikel's own title („Änderung des Oö. …") is part of its heading,
     as the Landesgesetzblatt sets it: one heading, two lines. */
  let titleOf: TextBlock | null = null
  /* Dropping a division heading's title lines, up to the next opener. */
  let inDivisionTitle = false
  let inTocEntry = false
  let inContents = false
  let firstInContents: string | null = null
  /* A dropped line is payload all the same: its quotes still count, or a
     closing quote dropped with a table of contents leaves every instruction
     after it „inside" (16018). */
  const drop = (line: string) => {
    depth = Math.max(0, depth + quoteDepth(line))
  }
  const body = lines.slice(start)
  for (const [i, line] of body.entries()) {
    // The law ends at its Erläuterungen — also a law of two §§, whose blocks
    // are still few when they begin (Salzburg 33878, 23.10.2026).
    if ((blocks.length > 2 || pendingGld !== null || paraGld !== null) && AFTER_LAW_RE.test(line)) break
    // A paragraph that ends in a colon is complete: settle it before the
    // payload under it is weighed.
    if (para !== null && /:$/.test(para) && !ARTICLE_LINE_RE.test(line)) flush()
    if (isDivision(line) && !INSTRUCTION_VERB_RE.test(line)) {
      inDivisionTitle = true
      drop(line)
      continue
    }
    if (inDivisionTitle) {
      if (!OPENS_RE.test(line)) {
        drop(line)
        continue
      }
      inDivisionTitle = false
    }
    // Within an instruction on the table of contents, its § entries.
    const instruction = [...blocks].reverse().find((b) => b.kind === 'novao' || b.kind === 'article')
    const inToc = (para !== null && NUMBERED_RE.test(para) && /Inhaltsverzeichnis/.test(para)) || (instruction?.kind === 'novao' && /Inhaltsverzeichnis/.test(instruction.text))
    if (inToc && TOC_ENTRY_RE.test(line) && !INSTRUCTION_VERB_RE.test(line)) {
      inTocEntry = true
      drop(line)
      continue
    }
    // An entry's title wrapped onto the next line goes with it (16113).
    if (inTocEntry && inToc && !OPENS_RE.test(line) && !INSTRUCTION_VERB_RE.test(line)) {
      drop(line)
      continue
    }
    inTocEntry = false
    if (ARTICLE_LINE_RE.test(line)) {
      flush()
      depth = 0
      amending = false
      lastNumber = 0
      titleOf = { kind: 'article', cls: 'pdf', text: line.replace(/\.$/, ''), gld: null }
      blocks.push(titleOf)
      continue
    }
    if (titleOf) {
      const article = titleOf
      // The title's first line names what it is; a law's title runs on
      // („Landesgesetz über … / (Oö. Energieeffizienzgesetz - Oö. EEffG)")
      // up to its first §, division or clause.
      const titled = article.text !== article.text.replace(/^(Artikel\s+\S+).*$/, '$1')
      const continues = titled && !OPENS_RE.test(line) && !isDivision(line) && !BARE_PARAGRAPH_RE.test(line) &&
        !/^Inhaltsverzeichnis$/i.test(line) &&
        !/^(?:Das|Die|Der|Dieses|Diese)\s/.test(line) && !line.endsWith(':')
      if ((!titled && ARTICLE_TITLE_RE.test(line) && !line.endsWith(':')) || continues) {
        article.text = joinLines(article.text, line)
        continue
      }
      titleOf = null
    }
    // A new law's table of contents can print its §§ as the law does
    // („§ 94" / „Übergangsbestimmungen", 16053): skipped until its first §
    // comes round again, as the law itself.
    // Only a contents list of §§ or divisions — a package's list of Artikel
    // is followed by no § to wait for, and skipping it swallowed whole
    // Novellen (16072, 16060, 2021-16023).
    if (!amending && /^Inhaltsverzeichnis$/i.test(line) && /^(?:§|\d+\.\s*(?:Abschnitt|Teil|Hauptstück))/i.test(body[i + 1] ?? '')) {
      flush()
      inContents = true
      firstInContents = null
      continue
    }
    if (inContents) {
      const n = /^§\s*(\d+[a-z]*)\b/.exec(line)?.[1] ?? null
      if (n && firstInContents === null) {
        firstInContents = n
        drop(line)
        continue
      }
      if (!(n && n === firstInContents && BARE_PARAGRAPH_RE.test(line))) {
        drop(line)
        continue
      }
      inContents = false
    }
    // Per Artikel: a package can enact a law in Artikel I and amend others
    // after it (16110: the Oö. Energieeffizienzgesetz beside two Novellen).
    if (!amending) {
      const bare = BARE_PARAGRAPH_RE.exec(line)
      /* A § the sentence above cites, wrapped onto a line of its own — „…
         entsprechen den Aufnahmevoraussetzungen gemäß" / „§ 8." (Salzburg
         34234, § 81 Abs. 2; 19.11.2026) — is the sentence's end, not a §:
         opened, it split § 81 into a § 81 „entfallen" and a „§ 8#dup"
         rewritten as § 81 on the page, though draft and Vorlage print the
         same § 81. Only where the line directly above runs on (`RUNS_ON_RE`,
         the Textgegenüberstellung's test): a § title above its „§ 1" ends in
         a noun. No test of the number's order — a table of contents echoed
         before the law numbers below the § before it too, and refused it
         swallowed the law's real §§ (two Salzburg Grundverkehrsgesetz
         drafts). Measured over 922 cached law PDFs: 34234 alone changes. */
      if (bare && para !== null && lastLineAt === i - 1 && lastLine !== null && RUNS_ON_RE.test(lastLine)) {
        beforePrev = beforeLast
        beforeLast = para
        prevLine = lastLine
        para = joinLines(para, line)
        lastLine = line
        lastLineAt = i
        continue
      }
      if (bare) {
        // A § whose only line was taken for its title has none: that line
        // was its text — „§ 1 / Das … Gesetz … wird … aufgehoben." of a
        // repeal (33878), which vanished with the next „§ 2".
        if (pendingGld && title !== null && !titledAbove) {
          paraGld = pendingGld
          para = title
          pendingGld = null
        }
        // A short line without closing punctuation right before the §:
        // its title, taken back from the paragraph it was joined to.
        let titleAbove: string | null = null
        const titleLike = (l: string) => l.length <= 90 && !/[.;:,)]$/.test(l) && !OPENS_RE.test(l)
        // Only the line DIRECTLY above: with dropped lines between (a
        // division and its title), the last contents entry is no title
        // („Anlage 4 Datenübermittlung" over § 1 of 16110).
        const adjacent = lastLineAt === i - 1
        // A title over two lines (19.11.2026): „Verarbeitung personenbezogener
        // Daten durch den Konzessionsinhaber, Beschränkung des Zu-" / „gangs zu
        // personenbezogenen Daten" / „§ 38" (sbg-31605). Taken back by its
        // last line alone, the § before ended in „… Beschränkung des Zu" and
        // § 38's title read „gangs zu …". Both lines, where the text before
        // them ends a sentence and the two read as one wrapped line: the
        // first broken at a hyphen, or the second going on in lower case.
        const twoLines = adjacent && para !== null && lastLine !== null && prevLine !== null && beforePrev !== null && titleLike(lastLine) &&
          prevLine.length <= 90 && !/[.;:,)]$/.test(prevLine) && !OPENS_RE.test(prevLine) && /^\p{Lu}/u.test(prevLine) &&
          (prevLine.endsWith('-') || /^\p{Ll}/u.test(lastLine)) && /[.;:]$/.test(beforePrev) && para === joinLines(joinLines(beforePrev, prevLine), lastLine)
        if (twoLines) {
          titleAbove = joinLines(prevLine!, lastLine!)
          para = beforePrev
        } else if (adjacent && para !== null && lastLine && para !== lastLine && para.endsWith(lastLine) && titleLike(lastLine)) {
          titleAbove = lastLine
          para = para.slice(0, -lastLine.length).trimEnd()
        } else if (adjacent && para !== null && para === lastLine && titleLike(para) && pendingGld === null) {
          titleAbove = para
          para = null
        }
        flush()
        pendingGld = `§ ${bare[1]}.`
        title = titleAbove
        titledAbove = titleAbove !== null
        continue
      }
      if (pendingGld && title === null && !titledAbove && !OPENS_RE.test(line) && !isFirstTextLine(line, body[i + 1])) {
        title = line
        continue
      }
      // A title wrapped onto a second line goes on in lower case — unless
      // the two lines end a sentence: then they were the §'s text.
      if (pendingGld && title !== null && !titledAbove && /^\p{Ll}/u.test(line)) {
        const joined = joinLines(title, line)
        if (/[.;:]$/.test(joined)) {
          flush()
          paraGld = pendingGld
          pendingGld = null
          title = null
          titledAbove = false
          para = joined
          lastLine = line
          lastLineAt = i
          continue
        }
        title = joined
        continue
      }
      if (pendingGld) {
        if (title) blocks.push({ kind: 'para_head', cls: 'pdf', text: title, gld: null })
        flush()
        paraGld = pendingGld
        pendingGld = null
        title = null
        titledAbove = false
        para = line
        lastLine = line
        lastLineAt = i
        continue
      }
    }
    const wrapped = para !== null && lastLineAt === i - 1 && lastLine !== null && RUNS_ON_RE.test(lastLine) && WRAPPED_OPENER_RE.test(line)
    if (para === null || (OPENS_RE.test(line) && !wrapped) || /[:]$/.test(para)) {
      flush()
      para = line
      lastLine = line
      lastLineAt = i
      beforeLast = null
      beforePrev = null
      prevLine = null
      continue
    }
    beforePrev = beforeLast
    beforeLast = para
    prevLine = lastLine
    para = joinLines(para, line)
    lastLine = line
    lastLineAt = i
  }
  flush()
  return blocks
}
