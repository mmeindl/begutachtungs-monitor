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
 * (Oberösterreich, 2026): no running headers but „Seite n", no split words
 * but the ordinary hyphenation, and the legal text in the legistic form the
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

/** Running header and footer lines of the Land's draft template. */
const NOISE_RE = /^(?:Seite \d+(?: von \d+)?|- ?\d+ ?-|\d+)$/

/** Where the legal text begins: the enacting clause. */
const ENACTING_RE = /Landtag hat beschlossen:?$/
/** Where it ends, if the PDF goes on: the explanations or the comparison after it. */
const AFTER_LAW_RE = /^(?:Erläuterungen|Textgegenüberstellung|[AB]\.\s+(?:Allgemeiner|Besonderer)\s+Teil)\b/

const ARTICLE_LINE_RE = /^Artikel\s+(?:[IVXL]+|\d+[a-z]?)\.?$/
/** What an Artikel's title line says — never the amending clause under an untitled Artikel. */
const ARTICLE_TITLE_RE = /^(?:Änderung|Inkrafttreten|Außerkrafttreten|Übergangs|Schluss|Aufhebung|Erlassung|Umsetzung|Verweis)/
/** The clause that turns the paragraphs after it into instructions. */
const AMENDING_RE = /wird (?:wie folgt|folgendermaßen) geändert:?$/
const NUMBERED_RE = /^(\d+)[a-z]?\.(?:\s|(?=\p{Lu}))/u
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
const OPENS_RE = /^(?:[„"»]?\d+[a-z]?\.(?:\s|(?=\p{Lu}))|[„"»]?\(\d+[a-z]?\)\s|[„"»]?§{1,2}\s*\d|[–-]\s|[„"»]?Artikel\s)/u
/**
 * What the RIS parser leaves out of the Landesgesetzblatt, left out here too
 * so the two sides compare like with like (measured on 16120, 22.10.2026):
 * a quoted division heading — „4. Abschnitt", „V. ABSCHNITT", „6.Abschnitt"
 * and the title lines under it —
 * which RIS sets as a heading and `segmentUnits` drops as payload, and the
 * § entries of a table of contents, which RIS sets as `inhaltsvz`.
 */
const DIVISION_RE = /^[„"»]?(?:\d+[a-z]?|[IVXL]+)\.\s*(?:Abschnitt|Unterabschnitt|Hauptstück|Teil)(?:\s.*)?$/i
const TOC_ENTRY_RE = /^[„"»]?§{1,2}\s*\d+[a-z]*(?:\s+\S|[“"«]?$)/

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
 * The legal text of a draft PDF as blocks, or null where no enacting clause
 * marks it — then the PDF is not a draft law this reader can take apart.
 */
export function lawBlocksFromPdfPages(pages: readonly string[]): TextBlock[] | null {
  const lines = pages.flatMap((p) => p.split('\n')).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !NOISE_RE.test(l))
  const start = lines.findIndex((l) => ENACTING_RE.test(l))
  if (start < 0) return null

  const blocks: TextBlock[] = []
  let para: string | null = null
  /* Quote depth before the paragraph being built, and whether this Artikel
     has said that it amends. */
  let depth = 0
  let amending = false
  let lastNumber = 0
  const flush = () => {
    if (para) {
      const n = Number(NUMBERED_RE.exec(para)?.[1] ?? 0)
      /* Outside the quotes — or, where a quote was never closed, the next
         number of the sequence saying what it does. A draft is a draft:
         16120 opens „§ 4 „Auswahlverfahren" with one quote too many, and
         by quotes alone its instruction 13 swallowed the 19 after it. */
      // A law amended in one respect: its instruction carries no number and
      // stands directly under the clause (16039, 16017).
      const single = amending && n === 0 && lastNumber === 0 && depth === 0 &&
        blocks.at(-1)?.kind === 'ziff' && AMENDING_RE.test(blocks.at(-1)!.text) && INSTRUCTION_VERB_RE.test(para)
      const instruction = single || (amending && n > 0 && (depth === 0 || (n === lastNumber + 1 && INSTRUCTION_VERB_RE.test(para))))
      if (instruction) {
        depth = 0
        lastNumber = Math.max(n, 1)
      }
      // Plain paragraphs as `ziff`: appended to the open unit, and never
      // promoted to an instruction by `segmentUnits` behind this reader's back.
      blocks.push({ kind: instruction ? 'novao' : 'ziff', cls: 'pdf', text: para, gld: null })
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
  /* A dropped line is payload all the same: its quotes still count, or a
     closing quote dropped with a table of contents leaves every instruction
     after it „inside" (16018). */
  const drop = (line: string) => {
    depth = Math.max(0, depth + quoteDepth(line))
  }
  for (const line of lines.slice(start)) {
    if (blocks.length > 2 && AFTER_LAW_RE.test(line)) break
    // A paragraph that ends in a colon is complete: settle it before the
    // payload under it is weighed.
    if (para !== null && /:$/.test(para) && !ARTICLE_LINE_RE.test(line)) flush()
    if (DIVISION_RE.test(line) && !INSTRUCTION_VERB_RE.test(line)) {
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
      titleOf = null
      if (ARTICLE_TITLE_RE.test(line) && !line.endsWith(':')) {
        article.text = `${article.text} ${line}`
        continue
      }
    }
    if (para === null || OPENS_RE.test(line) || /[:]$/.test(para)) {
      flush()
      para = line
      continue
    }
    para = joinLines(para, line)
  }
  flush()
  return blocks
}
