/**
 * Parliament Gesetzestext HTML → structured law units (docs/ris-join.md §6).
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
 */
const NOVAO_NUMBER_RE = new RegExp(`^(\\d{1,3})[a-z]?(?:\\s*\\.\\s*(?=\\S)|\\s*[-,:]\\s+(?=${OPENER})|\\s+(?=${OPENER}))`)

/** The instruction number at the head of `text`, or null. */
function novaoNumber(text: string): string | null {
  return NOVAO_NUMBER_RE.exec(normalizeText(text))?.[1] ?? null
}

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
const PROMULGATION_RE = /\bwird\s+(?:wie\s+folgt\s+)?geändert\s*:\s*$|\bwerden\s+wie\s+folgt\s+geändert\s*:\s*$/

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
  let current: LawUnit | null = null
  let novelleMode = false
  // Quotation state of everything *before* the block being read, and the
  // last instruction number opened for the current law. Both decide whether
  // a line that carries no usable number is an instruction; both reset with
  // the Artikel, because a package numbers each law from 1.
  let quoted = false
  let guillemets = 0
  let lastNovao = 0
  let afterPromulgation = false
  let prev: TextBlock | null = null

  const push = (id: string, heading: string | null, first: TextBlock): LawUnit => {
    const article = articleTitle ?? articleNumber
    const key = `${article ?? '?'} ${id}`
    const existing = byKey.get(key)
    let finalId = id
    if (existing) {
      const existingLength = existing.blocks.map((x) => x.text).join(' ').length
      if (existingLength < 120 && existing.blocks.length <= 1) {
        // The earlier one was a table-of-contents echo — drop it.
        units.splice(units.indexOf(existing), 1)
        byKey.delete(key)
      } else {
        finalId = `${id}#dup`
      }
    }
    const unit: LawUnit = { article, articleNumber, id: finalId, heading, quotedHeadings: [], text: first.text, blocks: [first] }
    units.push(unit)
    byKey.set(`${article ?? '?'} ${finalId}`, unit)
    return unit
  }

  for (const b of blocks) {
    if (prev) {
      const { flips, depth } = quoteShift(prev.text)
      if (flips % 2 === 1) quoted = !quoted
      guillemets = Math.max(0, guillemets + depth)
      afterPromulgation = PROMULGATION_RE.test(prev.text)
    }
    prev = b
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
        continue
      case 'section':
        // **A law is named before its first instruction, and only there.**
        // Later a heading of the same RIS type is quoted payload, and read as
        // a name it renames the law half way through the draft. Measured over
        // 400 GP-XXVIII drafts on 2026-09-11; the numbers and the cases are in
        // docs/architecture.md §12.13.
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
        pendingHeading = b.text
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
    const openNovao = (n: string): void => {
      novelleMode = true
      lastNovao = Number(n)
      current = push(`Z${n}`, novaoHeading(b.text), { ...b, text: b.text.replace(NOVAO_NUMBER_RE, '') })
      pendingHeading = null
    }

    if (b.kind === 'novao') {
      const n = novaoNumber(b.text)
      if (n) {
        openNovao(n)
        continue
      }
      // No number. The first instruction of a law carries none when the law
      // is amended in a single respect — recognisable because the
      // promulgation clause stands directly above it, and only there.
      if (afterPromulgation && lastNovao === 0 && !inPayload && !LITERA_RE.test(b.text)) {
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
      const n = novelleMode ? novaoNumber(b.text) : null
      if (n && Number(n) === lastNovao + 1) {
        openNovao(n)
        continue
      }
    }

    if (current) current.blocks.push(b)
  }

  for (const u of units) u.text = u.blocks.map((x) => x.text).join(' ')
  return units
}

export function parseLawUnits(html: string): LawUnit[] {
  return segmentUnits(parseParliamentHtml(html))
}

export function parseLawUnitsFromRis(xml: string): LawUnit[] {
  return segmentUnits(parseRisXml(xml))
}
