/**
 * Parliament Gesetzestext HTML → structured law units.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * Parliament publishes the law text of Ministerialentwürfe (GP XXVIII on)
 * and of every later station as Word-filtered HTML with the legistic
 * template classes. The same classes on both sides of the ME→RV pair is
 * what makes a §-level comparison possible without RIS. Verified on the
 * 43/ME → 449 d.B. chain (EABG) and two more, 2026-09-06.
 */

import { parseParliamentHtml } from './parliamentHtml'
import { normalizeText, stripQuotes } from './normalize'
import { parseRisXml } from './risXml'
import { articleNames, draftArticles, promulgationByArticle } from './draftArticles'
import type { BgblCitation } from './bgblCitation'

export type BlockKind =
  | 'para_head' // 45UeberschrPara — the § heading line ("Anwendungsbereich")
  | 'abs' // 51Abs — an Absatz; the first one carries the § symbol
  | 'novao' // 21NovAo1 / 22NovAo2 — Novellierungsanordnung ("3. § 4 lautet: …")
  | 'article' // 41UeberschrG1 "Artikel 1"
  | 'section' // other 41/42/43 headings: Abschnitt numbers and titles
  | 'title' // 11Titel — the law's title (Stammgesetz without Artikel)
  | 'ziff' // 52/53 Aufzaehl* — Ziffern, Litera
  | 'toc' // 3* Inhalt* — table of contents
  | 'other'

export interface TextBlock {
  kind: BlockKind
  cls: string
  /** Text WITHOUT the Gliederungssymbol, so a renumbered § compares equal */
  text: string
  /** Gliederungssymbol from 991GldSymbol, e.g. "§ 5." — only on the first Absatz of a § */
  gld: string | null
}

/** One comparable unit: a § (with all its Absätze and Ziffern) or one Novellierungsanordnung. */
export interface LawUnit {
  /** Article title if the package has Artikel, else the law title, else null */
  article: string | null
  /**
   * The name to print for the Artikel where `article`, the key, is a
   * qualifier and no name — „(Verfassungsbestimmung)" above „Änderung des
   * Bundes-Verfassungsgesetzes" (`articleNames`). Absent otherwise.
   */
  articleName?: string
  /** "Artikel 3" when the package has Artikel, else null */
  articleNumber: string | null
  /** "§5", "Art.3" or "Z4" (Novellierungsanordnung number) */
  id: string
  /** The § heading (45UeberschrPara); for a Ziffer the instruction line ("§ 6 Abs. 1 Z 9 lautet") */
  heading: string | null
  /**
   * § headings quoted inside a Novellierungsanordnung ("§ 12a lautet samt
   * Überschrift: '§ 12a. Übertragung bestimmter Lotterien'"). The one
   * human-readable name in an otherwise legistic instruction — and part of
   * the compared text, because "samt Überschrift" changes the heading.
   */
  quotedHeadings: string[]
  text: string
  blocks: TextBlock[]
  /**
   * The Stammnorm of the law this unit's Artikel amends, read from the
   * Artikel's Promulgationsklausel (`promulgationByArticle`); null for a new
   * law or a clause that cites none. The clause is no unit of its own — it
   * stands before the first instruction — so this is where it survives
   * segmentation. `pairArticles` reads it: „Änderung des EU-JZG" and the long
   * title of the same law both cite its Stammnorm, 36/2004 (XXVI 162/ME).
   */
  stammnorm: BgblCitation | null
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/** "§ 5." → "§5"; "Artikel 3." → "Art.3" */
export function normalizeGld(g: string): string {
  return normalizeText(g).replace(/\s+/g, '').replace(/^Artikel/, 'Art.').replace(/\.$/, '')
}

/**
 * The words a Novellierungsanordnung can open with. Used only to confirm a
 * number whose separator is missing or unusual — without it, "5 Jahre nach
 * Inkrafttreten" at the head of a line would read as instruction 5.
 */
const OPENER = '(?:§|Art\\b|Abs\\b|Z\\b|In\\b|Im\\b|Dem\\b|Den\\b|Der\\b|Die\\b|Das\\b|Nach\\b|Vor\\b|Es\\b|Anlage\\b|Inhaltsverzeichnis\\b)'

/**
 * The instruction number at the head of a Novellierungsanordnung, in the
 * forms the sources actually print.
 *
 * RIS and the Parliament template agree on "3. " and disagree on everything
 * around it: "2.§ 30 Abs. 3 lautet" (no space), "13 § 178 Abs. 3 lautet" (no
 * period), "4 . Dem § 67" (a space before it), "222- Im Schlussteil" (a dash
 * instead). Fifteen instructions across nine GP-XXVIII drafts were lost to
 * the strict form, measured 2026-09-09 — and a lost instruction is worse
 * than a missing one: it becomes tail text of the instruction above it, so
 * two units carry text that belongs to neither and both read as "geändert"
 * in the ME→RV comparison.
 *
 * A number is capped at three digits, and one whose separator is not a
 * period must be followed by a legistic opener, so that "20 000 Euro" or
 * "2,5 Millionen" at the head of a line stays text.
 *
 * **The letter is part of the number.** „25a." is the instruction a later
 * stage slotted in behind „25.", and both stand: „25. § 30 Abs. 8 entfällt"
 * and „25a. In den §§ 32 …" (BGBl. I Nr. 8/2026 Art. 3). Read as „25", the
 * second opened another Z25, and the first — short, one block — was dropped
 * as a table-of-contents echo: neither applied nor refused, and missing on
 * both sides of every station comparison. 21 lines over 275 cached
 * Bundesgesetzblätter, 21 over 595 Parliament texts, among them whole runs
 * of a committee text („1." and „1a." both gone under „1b.", 95/ME),
 * measured 19.11.2026 (`scripts/harness/units.ts`).
 */
const NOVAO_NUMBER_RE = new RegExp(`^(\\d{1,3}[a-z]?)(?:\\s*\\.\\s*(?=\\S)|\\s*[-,:]\\s+(?=${OPENER})|\\s+(?=${OPENER}))`)

/** The instruction number at the head of `text`, letter included („25a"), or null. Exported for the census (`scripts/harness/units.ts`). */
export function novaoNumber(text: string): string | null {
  return NOVAO_NUMBER_RE.exec(normalizeText(text))?.[1] ?? null
}

/** „25a" → 25: the place of an instruction in its law's sequence, for the promotion test below. */
const sequenceOf = (n: string): number => Number.parseInt(n, 10)

/**
 * A sub-instruction numbered under its instruction — „10.1. In der Z 1 …",
 * „12.2.1. Nach der Wendung …", „21.1 Im Abs 1 …", „1a.1. In der lit a …"
 * (Salzburg's Landesgesetzblatt numbers so). It is part of instruction 10
 * the way a litera („a)") is, and only of the instruction that is open: the
 * leading number must be that one's, letter and all. Read as „10.", it
 * opened a second Z10 and pushed the first out of the list, or stood beside
 * it as a fragment under the same key (`#dup`) that no join could use.
 *
 * The sub-number takes a letter as the instruction number does: „18.1a.
 * Nach Abs 5 wird eingefügt" is slotted in between „18.1." and „18.2." (LGBl.
 * Salzburg, four such lines in the harness cache, 19.11.2026). Without it the
 * line read as instruction 18 again and stood as „Z18#dup" — printed so on
 * the Land page, and paired as an instruction of its own.
 */
const SUB_INSTRUCTION_RE = new RegExp(`^(\\d{1,3}[a-z]?)\\s*\\.\\s?\\d{1,3}[a-z]?(?:\\s*\\.|\\s+(?=${OPENER}))`)

/** „2.1", „2.1 Brandschutz", „10.2.1." — a number with a second one right behind its period. */
const NUMBER_THEN_NUMBER_RE = /^\d{1,3}[a-z]?\.\d/

/**
 * The promulgation clause that opens a Novelle for one law — "Das
 * Bundesgesetz …, BGBl. I Nr. 620/1989, … wird wie folgt geändert:".
 *
 * It is what makes an *unnumbered* first instruction recognisable. A law
 * amended in a single respect carries no Ziffer, because there is nothing to
 * count: "Dem § 143 werden folgende Abs. 108 und 109 angefügt:" stands
 * alone directly under the clause. Ten such instructions sit in GP XXVIII,
 * and for two drafts (110/ME, 59/ME) that one line is the entire Novelle —
 * both segmented to zero units and their comparison refused outright.
 *
 * The clause is the boundary that separates them from the lines that only
 * look alike: a continuation fragment ("durch folgenden Eintrag ersetzt:",
 * 123/ME), an instruction nested inside a quoted payload (116/ME) and the
 * clause itself where RIS mistags it as an instruction (92/ME) all follow
 * something else.
 */
// Also the word orders the corpus carries beside it (19.11.2026, `harness/units.ts`
// listing the unnumbered lines it exempts): „wird geändert wie folgt:", the
// law named between „wird" and „wie folgt geändert:" („wird die
// Tierschutz-Veranstaltungsverordnung, BGBl. II Nr. 493/2004, wie folgt
// geändert:"), and a short title before the colon („wird wie folgt geändert
// (BFG-Novelle 2011):"). Unmatched, the law's only instruction opened no unit
// and was compared, applied and listed nowhere — 15 instruction lines in 12
// texts of the harness cache; the census exempts such a line by design.
// And (19.11.2026, the last four the listing left): RIS's own typo „wird
// folgt geändert:" (2e78ceb8), and a Verordnung's „… wird verordnet:" that
// names the Verordnung it changes in its title only (0c2d09a6) — a new
// Verordnung under the same words opens with its § 1, which RIS does not
// tag as an instruction.
const PROMULGATION_RE = /\bwird\s+(?:wie\s+)?folgt\s+geändert\s*:\s*$|\bwird\s+geändert\s*:\s*$|\bwerden\s+wie\s+folgt\s+geändert\s*:\s*$|\bwird\s+geändert\s+wie\s+folgt\s*:\s*$|\bwird\s[^:]*\bwie\s+folgt\s+geändert\s*(?:\([^()]*\)\s*)?:\s*$|\bverordnet\s*:\s*$/

/**
 * „Änderung des Wertpapieraufsichtsgesetzes 2007": an Artikel's name that
 * stands for its clause where the draft prints none (9aa88c41, Artikel 7).
 */
const AMENDMENT_NAME_RE = /^Änderung\s+(?:des|der)\s/

/** A promulgation clause, not an instruction worded like one: it cites the law it changes („BGBl. I Nr. 41/2019", „LGBl Nr 1/2016"). */
const isClause = (text: string): boolean => {
  const t = normalizeText(text)
  return PROMULGATION_RE.test(t) && /\b[BL]GBl\b/.test(t)
}

/**
 * A litera sub-instruction — "a) In Abs. 3 lautet der erste Satz:". It
 * belongs inside the numbered instruction above it ("2. § 2 wird wie folgt
 * geändert:"), which is where an unnumbered line lands anyway; 211 of them
 * sit in GP XXVIII and none may open a unit of its own. RIS tags them
 * `novao1` and `novao2` interchangeably, so the class is no guide.
 */
const LITERA_RE = /^[a-z]{1,2}\s*\)/

/**
 * Heading of a Novellierungsanordnung: its instruction line without the
 * number, cut before the colon that opens the quoted text. "2. § 6 Abs. 1
 * Z 9 lautet: „…“" → "§ 6 Abs. 1 Z 9 lautet". Stable while the quoted text
 * changes, so it doubles as the alignment key across renumbering.
 */
export function novaoHeading(text: string): string {
  let t = normalizeText(text).replace(NOVAO_NUMBER_RE, '')
  const colon = t.indexOf(':')
  if (colon > 0 && colon <= 140) t = t.slice(0, colon)
  if (t.length > 100) {
    const cut = t.lastIndexOf(' ', 100)
    t = `${t.slice(0, cut > 40 ? cut : 100)} …`
  }
  return t.trim()
}

/**
 * „Anlage 1", „Anhang III", „Anlage 5 zu § 14" — a schedule naming itself at
 * the head of the text it enacts, optionally behind the payload's opening
 * quote.
 *
 * Deliberately anchored and deliberately only the designation: it has to miss
 * the schedule's *title*, which is a `section` on both sides and dropped on
 * both. Both readers must end up with the same words, and the cheapest way to
 * be sure of that is to move as little as possible.
 */
const ANLAGE_DESIGNATION_RE = /^"?\s*(?:Anlage|Anlagen|Anhang|Anhänge|Anl\.)\s+\S/i

/**
 * „(zu § 10 Abs. 1a UStG)" — the rest of the designation, set on its own line.
 *
 * A schedule is named „Anlage 5 zu § 14", and where that fits one line the
 * rule above already has it. One ressort breaks it (88/ME, UStG-Anlage 3),
 * and then the second line is a `section` too. Only right behind the
 * designation and only as a bare parenthetical: the line after THAT is the
 * schedule's title, which both readers drop.
 */
const ANLAGE_CONTINUATION_RE = /^\(\s*zu\s/i

/**
 * The class RIS gives a schedule's designation (`<ueberschrift typ="anlage">`,
 * `risXml.ts`), outside a table — inside one it is the two-column layout of a
 * Textgegenüberstellung, not law text. Parliament's Word template marks the
 * same line `71Anlagenbez`, which its reader keeps as text (`other`).
 */
const RIS_SCHEDULE_DESIGNATION_CLS = 'ueberschrift/anlage'

/**
 * How a block changes the quotation state. A payload is enclosed in
 * quotation marks: `normalizeText` folds „ “ ” to ", so that pair is a
 * parity bit, while »…« nests around an instruction quoted inside another
 * one and is counted as a depth.
 */
function quoteShift(text: string): { flips: number; depth: number } {
  let flips = 0
  let depth = 0
  for (const ch of text) {
    if (ch === '"') flips++
    else if (ch === '»') depth++
    else if (ch === '«') depth--
  }
  return { flips, depth }
}

/**
 * Blocks → units. A Stammgesetz yields one unit per §; a Novelle yields one
 * unit per Novellierungsanordnung (Z1, Z2, …) with the quoted § text inside.
 * Articles of a package reset the numbering, so the key is (article, id).
 */
export function segmentUnits(blocks: readonly TextBlock[]): LawUnit[] {
  const units: LawUnit[] = []
  const byKey = new Map<string, LawUnit>()
  let articleNumber: string | null = null
  let articleTitle: string | null = null
  let pendingHeading: string | null = null
  /** Was the block just read a § heading too? Only then does the next one continue it. */
  let headingRun = false
  /** Was the block just read an Anlage designation? Only then may the next line continue it. */
  let anlageRun = false
  let current: LawUnit | null = null
  let novelleMode = false
  // Quotation state of everything *before* the block being read, and the
  // last instruction number opened for the current law. Both decide whether
  // a line that carries no usable number is an instruction; both reset with
  // the Artikel, because a package numbers each law from 1.
  let quoted = false
  let guillemets = 0
  let lastNovao = 0
  /** The open instruction's number as printed („25a"), for its sub-instructions. */
  let openNumber: string | null = null
  let afterPromulgation = false
  let prev: TextBlock | null = null

  const push = (id: string, heading: string | null, first: TextBlock): LawUnit => {
    const article = articleTitle ?? articleNumber
    const key = `${article ?? '?'} ${id}`
    const existing = byKey.get(key)
    let finalId = id
    if (existing) {
      const existingLength = existing.blocks.map((x) => x.text).join(' ').length
      // **An instruction is never an echo.** The rule was written for the §
      // units a Word table of contents leaves behind („§ 5. Anwendungsbereich"
      // before the § itself, a2f48f4); a unit an instruction opened is law,
      // however short. Dropped, it took „25. § 30 Abs. 8 entfällt" with it
      // whenever another unit took the same key — a „25a." read as „25", or
      // the Z 1 of a second Artikel of the same title (RV 69 d.B. amends the
      // VBG 1948 in Artikel 7 and 11). It stays as `#dup`, the mark a number
      // recurring in one law already carries (`namesSeveralLaws`).
      const holdsInstruction = existing.blocks.some((x) => x.kind === 'novao')
      if (!holdsInstruction && existingLength < 120 && existing.blocks.length <= 1) {
        // The earlier one was a table-of-contents echo — drop it.
        units.splice(units.indexOf(existing), 1)
        byKey.delete(key)
      } else {
        finalId = `${id}#dup`
      }
    }
    const unit: LawUnit = { article, articleNumber, id: finalId, heading, quotedHeadings: [], text: first.text, blocks: [first], stammnorm: null }
    units.push(unit)
    byKey.set(`${article ?? '?'} ${finalId}`, unit)
    return unit
  }

  for (const b of blocks) {
    if (prev) {
      const { flips, depth } = quoteShift(prev.text)
      if (flips % 2 === 1) quoted = !quoted
      guillemets = Math.max(0, guillemets + depth)
      // A clause carries over a bare Artikel or section heading set between
      // it and the instruction („… wird wie folgt geändert:" / „Artikel I" /
      // „§ 3 wird um folgenden Abs. 6 ergänzt:", bfa0c3f4), and an Artikel
      // named „Änderung des …" is its own clause where none is printed.
      afterPromulgation =
        PROMULGATION_RE.test(prev.text) ||
        (prev.kind === 'section' && AMENDMENT_NAME_RE.test(normalizeText(prev.text))) ||
        (afterPromulgation && (prev.kind === 'article' || prev.kind === 'section'))
    }
    prev = b
    const continuesHeading = headingRun
    headingRun = false
    const continuesAnlage = anlageRun
    anlageRun = false
    const inPayload = quoted || guillemets > 0

    switch (b.kind) {
      case 'article':
        articleNumber = b.text
        articleTitle = null
        novelleMode = false
        current = null
        pendingHeading = null
        quoted = false
        guillemets = 0
        lastNovao = 0
        openNumber = null
        continue
      case 'section':
        // **An Anlage's own designation is law text, not a heading of ours.**
        // „Anlage 1 lautet: \"Anlage 1 …" — the schedule repeats its
        // designation as the first line of the enacted text, and one such
        // instruction can enact two („Anhang VIII wird durch folgende Anhänge
        // VIII und IX ersetzt"), so the second designation stands in the
        // middle of the payload. RIS marks every one of them
        // `<ueberschrift typ="anlage">`; Parliament's Word template leaves the
        // class unmapped, so its reader kept the line as `other` while this
        // one dropped it. The rv→bgbl comparison then reported units as
        // substantively changed where the two sides differ by exactly that
        // designation — 11 units over 58/60/76/88/ME, and three more in
        // 14/ME (measured 26.09.2026, `pnpm corpus:bgbl-station -- --dump`).
        //
        // **The designation is the whole test, and that is what keeps the two
        // readers equal.** The payload's *further* headings — an Anlage's
        // subtitle („Liste der zentralen öffentlichen Auftraggeber*)") — are a
        // `section` on BOTH sides and go on being dropped on both; keeping
        // them here would create the same asymmetry in the other direction.
        if (novelleMode && current && (ANLAGE_DESIGNATION_RE.test(b.text) || (continuesAnlage && ANLAGE_CONTINUATION_RE.test(b.text)))) {
          current.blocks.push(b)
          anlageRun = true
          continue
        }
        // **The same holds in a law the draft enacts** (19.11.2026). Its
        // schedules follow its last §, and Parliament's reader kept „Anlage I"
        // / „(zu § 106)" as text of that § while this one dropped the RIS
        // heading — so the Plenum→Kundmachung and HTML→XML comparisons showed
        // every designation as removed from the last § (32/ME ElWG § 190 and
        // § 182, 43/ME EABG §§ 63 and 59: 19 pieces, `harness/station.ts`).
        // Kept here only by RIS's own class, and only the designation and
        // the heading of that class directly below it („(zu § 106)", „Zu
        // § 5"): the class also carries stray lines a converter left there
        // (a binary's file path, „Teil 2"), which Parliament's text lacks.
        //
        // The schedules still read as text of the last §, on both sides
        // alike. As units of their own they would need the Begründung join,
        // the list of a new law's §§ and the Land PDF reader to agree first.
        if (!novelleMode && current && b.cls === RIS_SCHEDULE_DESIGNATION_CLS && (ANLAGE_DESIGNATION_RE.test(b.text) || continuesAnlage)) {
          current.blocks.push(b)
          // Only a designation opens a run, so one heading below it is kept
          // and the next line of the class is judged afresh: kept after a
          // kept heading, a stray converter line or a column head chained on.
          anlageRun = ANLAGE_DESIGNATION_RE.test(b.text)
          continue
        }
        // **A law is named before its first instruction, and only there.**
        // Later a heading of the same RIS type is quoted payload, and read as
        // a name it renames the law half way through the draft. Measured over
        // 400 GP-XXVIII drafts on 2026-09-11.
        //
        // `draftArticles` in `lawtext/draftArticles.ts` carries the same
        // window, because the annex's rows are keyed from there and the two
        // keys have to be one string. The two copies are one rule and neither
        // may move without the other.
        if (articleNumber && articleTitle === null && !novelleMode) articleTitle = b.text
        continue
      case 'title':
        // Same window: the late title blocks are what a Verordnung prints
        // inside the instruction that re-issues a law in full.
        if (articleNumber === null && !novelleMode) articleTitle = b.text
        continue
      case 'toc':
        continue
      case 'para_head':
        // Inside a Novelle a § heading is quoted text and goes straight into
        // the current instruction's unit. It used to wait for the § symbol
        // block behind it — and when the payload continued with "(1) …"
        // instead (the symbol printed inside the heading, "§ 15. Dauer der
        // Verleihung."), the heading was lost, or worse, surfaced in the
        // *next* instruction's unit as a stray § (Privatschulgesetz §§ 15,
        // 27b, 30, 2026-09-09). Outside a Novelle it is the § heading of the
        // unit the next symbol opens.
        if (novelleMode && current) {
          const bare = stripQuotes(b.text)
          if (bare) {
            current.quotedHeadings.push(bare.replace(/^§+\s*\d+[a-z]*\.\s*/, ''))
            current.blocks.push({ kind: 'para_head', cls: 'quoted', text: bare, gld: null })
          }
          continue
        }
        // A heading that does not fit on one line is set as two blocks, and
        // the second used to overwrite the first: „Aufbau und Zuständigkeit" /
        // „der Staatsanwaltschaften" went out as „der Staatsanwaltschaften",
        // which is not a heading but half a sentence. Joined only where the
        // blocks stand next to each other — an unconsumed heading further up
        // belongs to a § that never opened and must not glue itself onto the
        // next one.
        pendingHeading = continuesHeading && pendingHeading ? `${pendingHeading} ${b.text}` : b.text
        headingRun = true
        continue
      default:
        break
    }

    if (b.gld) {
      const id = normalizeGld(b.gld)
      if (novelleMode && current) {
        // A quoted § inside a Novellierungsanordnung stays in the Z unit —
        // and so does the heading in front of it. Dropping it lost the only
        // readable name in the instruction, and worse: "§ 5 lautet samt
        // Überschrift" changes that heading, so a Regierungsvorlage that
        // rewrote nothing else produced no diff hit at all. Measured
        // 2026-09-08: 1.341 headings dropped across 180 documents.
        if (pendingHeading) {
          const bare = stripQuotes(pendingHeading)
          if (bare) {
            current.quotedHeadings.push(bare)
            current.blocks.push({ kind: 'para_head', cls: 'quoted', text: bare, gld: null })
          }
          pendingHeading = null
        }
        current.blocks.push(b)
        continue
      }
      current = push(id, pendingHeading, b)
      pendingHeading = null
      continue
    }

    // Opening an instruction unit. The number goes into the id, not into the
    // compared text — like the § symbol.
    //
    // The block that opens it IS the instruction, whatever RIS tagged it:
    // promoted below from `absatz typ="satz"`, it kept its kind, and every
    // reader that takes a unit's instruction lines by kind (`instructionsFromUnits`,
    // the annex's `draftUnits`) skipped it — the unit opened and then said
    // nothing. Six §§ of GP XXVIII whose one instruction RIS set as plain
    // text (19/ME § 5h, 22/ME § 20, 125/ME §§ 29, 42 and 46, 859D2924 § 15)
    // stood in the annex as „Anweisung nicht gefunden" (26.10.2026).
    const openNovao = (n: string): void => {
      novelleMode = true
      // By the digits: Number("25a") is NaN, and after it no line would ever
      // continue the sequence again.
      lastNovao = sequenceOf(n)
      openNumber = n
      current = push(`Z${n}`, novaoHeading(b.text), { ...b, kind: 'novao', text: b.text.replace(NOVAO_NUMBER_RE, '') })
      pendingHeading = null
    }

    if (b.kind === 'novao') {
      const sub = novelleMode && current ? SUB_INSTRUCTION_RE.exec(normalizeText(b.text)) : null
      if (sub && sub[1] === openNumber) {
        current!.blocks.push(b)
        continue
      }
      const n = novaoNumber(b.text)
      if (n) {
        openNovao(n)
        continue
      }
      // No number. The first instruction of a law carries none when the law
      // is amended in a single respect — recognisable because the
      // promulgation clause stands directly above it, and only there.
      // Never the clause itself, where RIS tags it as an instruction too
      // (7b657081, 26225fa7, 92/ME): under „Änderung des …" or „verordnet:"
      // it stood where the instruction stands. A clause cites the law it
      // changes; „§ 186 wird wie folgt geändert:" over its litterae reads
      // alike and is an instruction.
      if (afterPromulgation && lastNovao === 0 && !inPayload && !LITERA_RE.test(b.text) && !isClause(b.text)) {
        openNovao('1')
        continue
      }
    } else if ((b.kind === 'abs' || b.kind === 'other') && !inPayload) {
      // RIS sometimes tags an instruction as plain text (`absatz typ="satz"`
      // or `"abs"`), and then nothing above recognises it: seven such lines
      // in GP XXVIII became tail text of the instruction before them
      // (125/ME §§ 29, 31, 42, 46, measured 2026-09-09). Two independent
      // signals have to agree before a non-instruction block is promoted —
      // it must continue the number sequence, and it must stand outside any
      // payload. On the twelve candidates in the corpus the two agreed
      // every time: all seven outside a payload were the next number, all
      // five inside it were law text that merely began with a numeral.
      //
      // Only an Absatz may be promoted. A `listelem` is a Ziffer of a quoted
      // list and is numbered from 1 like an instruction, so it satisfies both
      // signals by coincidence — an early version of this branch read three
      // list items of Mineralrohstoffgesetz § 156 (27/ME) and one of
      // Markenschutzgesetz § 68j (83/ME) as instructions.
      //
      // Nor a line whose number another number follows („2.1", „2.1 Brandschutz
      // bei Betriebsbauten"): that is a sub-number or the row number of a
      // table, and the next instruction prints „2." standing alone. A
      // Salzburg Verordnung re-enacting the table of OIB-Richtlinien („Im § 1
      // lautet die Tabelle:", 78. Verordnung 2026) had its row „2.1" read as
      // instruction 2, and the printed „2." stood behind it as `Z2#dup`
      // (19.11.2026, `harness/units.ts`, „verdoppelt"). The same test keeps
      // the fee amounts „3.118", „4.157" … of three Austro-Control
      // Gebührenverordnungen in their table: they had opened Z3 to Z6.
      const n = novelleMode && !NUMBER_THEN_NUMBER_RE.test(normalizeText(b.text)) ? novaoNumber(b.text) : null
      if (n && sequenceOf(n) === lastNovao + 1) {
        openNovao(n)
        continue
      }
    }

    if (current) current.blocks.push(b)
  }

  dropTocEntries(units)

  // Keyed as the units are (`articleTitle ?? articleNumber`), by contract.
  const clauses = promulgationByArticle(blocks)
  const names = articleNames(draftArticles(blocks))
  for (const u of units) {
    u.text = u.blocks.map((x) => x.text).join(' ')
    u.stammnorm = clauses.get(u.article) ?? null
    const name = u.article === null ? undefined : names.get(u.article)
    if (name !== undefined) u.articleName = name
  }
  return units
}

/** „Artikel 5", „Art.5:", „Art. 5a." → „5"/„5a"; null for anything else. */
const articleNo = (s: string | null) => /^(?:Art\.?|Artikel)\s*(\d+[a-z]*)\b/i.exec(s ?? '')?.[1]?.toLowerCase() ?? null

/**
 * Drops the table of contents of a package — „Artikel 1 – Änderung der
 * Gewerbeordnung 1994", „Artikel 2 – Änderung des Bankwesengesetzes", … —
 * that RIS sets as Artikel designations before the first Artikel opens.
 * They came out as units of their own under the bill's title, never paired
 * with anything, and the § comparison named the bill's title as a law the
 * Regierungsvorlage had dropped (XXVI 93/ME, XXVII 115/ME; measured
 * 03.10.2026, `scripts/corpus/mergedLaws.ts`). The echo removal in `push`
 * misses them because their key is not that of any later unit.
 *
 * The test is the number, not the title: 115/ME's contents list
 * „Hochschulgesetzes 2002" for an Artikel titled „… 2005". An entry is an
 * `Art.` unit outside any Artikel, one short line, whose number an Artikel
 * of the same document opens later. A law that is itself built from Artikel
 * (a Verfassungsgesetz) opens no package Artikel, so it keeps every one.
 */
function dropTocEntries(units: LawUnit[]): void {
  const opened = new Set(units.map((u) => articleNo(u.articleNumber)).filter((n): n is string => n !== null))
  if (!opened.size) return
  const isEntry = (u: LawUnit) => {
    if (u.articleNumber !== null || u.blocks.length > 1) return false
    const n = articleNo(u.id)
    return n !== null && opened.has(n) && u.blocks[0]!.text.length <= 200
  }
  for (let i = units.length - 1; i >= 0; i--) if (isEntry(units[i]!)) units.splice(i, 1)
}

export function parseLawUnits(html: string): LawUnit[] {
  return segmentUnits(parseParliamentHtml(html))
}

export function parseLawUnitsFromRis(xml: string): LawUnit[] {
  return segmentUnits(parseRisXml(xml))
}
