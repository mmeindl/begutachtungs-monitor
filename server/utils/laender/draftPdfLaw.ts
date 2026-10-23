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
const NOISE_RE = /^(?:Seite \d+(?: von \d+)?|\d+ von \d+|- ?\d+ ?-|\d+|[A-Z]:\\.*\.docx?\b.*|E n t w u r f)$/

/** Where the legal text begins: the enacting clause. */
/* A Verordnung is issued, not resolved: „Auf Grund des § … wird verordnet:". */
const ENACTING_RE = /(?:Landtag hat beschlossen|wird verordnet):?$/
/** Where it ends, if the PDF goes on: the explanations or the comparison after it. */
const AFTER_LAW_RE = /^(?:Erläuterungen|Textgegenüberstellung|[AB]\.\s+(?:Allgemeiner|Besonderer)\s+Teil)\b/

const ARTICLE_LINE_RE = /^Artikel\s+(?:[IVXL]+|\d+[a-z]?)\.?$/
/** What an Artikel's title line says — never the amending clause under an untitled Artikel. */
const ARTICLE_TITLE_RE = /^(?:Änderung|Inkrafttreten|Außerkrafttreten|Übergangs|Schluss|Aufhebung|Erlassung|Umsetzung|Verweis|(?:Landes)?[Gg]esetz\b|Verordnung\b)/
/** The clause that turns the paragraphs after it into instructions. */
/* „wird wie folgt geändert:" (Oberösterreich), „wird geändert wie folgt:"
   (Salzburg) — and without the „wird" a Salzburg draft dropped (31136). */
const AMENDING_RE = /(?:wird )?(?:(?:wie folgt|folgendermaßen) geändert|geändert wie folgt):?$/
const NUMBERED_RE = /^(\d+)[a-z]?\.(?:\s|(?=\p{Lu}))/u
/* A sub-instruction of a nested numbering („2.1.", and the draft's „2. 2."):
   part of instruction 2, as the Landesgesetzblatt reads it (Salzburg). */
const SUB_NUMBERED_RE = /^\d+\.\s?\d+\.\s/
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
const DIVISION_RE = /^[„"»]?(?:(?:\d+[a-z]?|[IVXL]+)\.\s*(?:Abschnitt|Unterabschnitt|Hauptstück|Teil)(?:\s.*)?|[IVXL]+[a-z]?\.\s+\p{Lu}\D*)$/iu
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
 * The legal text of a draft PDF as blocks, or null where no enacting clause
 * marks it — then the PDF is not a draft law this reader can take apart.
 */
export function lawBlocksFromPdfPages(pages: readonly string[]): TextBlock[] | null {
  const lines = pages.flatMap((p) => p.split('\n')).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !NOISE_RE.test(l))
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
  /* A NEW law (no amending clause): „§ 2" opens a §, the line after it is
     its title, the paragraph after that carries the symbol — the shape the
     Landesgesetzblatt's XML has once its heading is taken apart
     (`lgblUnits`). Measured on the seven new laws of the oracle, §12.44. */
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
        lastNumber = Math.max(n, 1)
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
      // The title's first line names what it is; a law's title runs on
      // („Landesgesetz über … / (Oö. Energieeffizienzgesetz - Oö. EEffG)")
      // up to its first §, division or clause.
      const titled = article.text !== article.text.replace(/^(Artikel\s+\S+).*$/, '$1')
      const continues = titled && !OPENS_RE.test(line) && !DIVISION_RE.test(line) && !BARE_PARAGRAPH_RE.test(line) &&
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
        if (adjacent && para !== null && lastLine && para !== lastLine && para.endsWith(lastLine) && titleLike(lastLine)) {
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
      if (pendingGld && title === null && !titledAbove && !OPENS_RE.test(line)) {
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
    if (para === null || OPENS_RE.test(line) || /[:]$/.test(para)) {
      flush()
      para = line
      lastLine = line
      lastLineAt = i
      continue
    }
    para = joinLines(para, line)
    lastLine = line
    lastLineAt = i
  }
  flush()
  return blocks
}
