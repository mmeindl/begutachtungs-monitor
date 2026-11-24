/**
 * RIS Begut main-document XML → the same flat blocks as the Parliament HTML
 * reader, and the one home for the RIS element vocabulary of a draft.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 */
import type { LawTable, LawTableCell, LawTextPart } from '../../../shared/types/annex'
import type { BlockKind, TextBlock } from './lawUnits'
import { ARTICLE_LINE_RE, ARTICLE_RE, refineArticleHeadings } from './articleHeadings'
import { stripTags } from './normalize'
import { FIGURE_MARK } from '../../../shared/utils/figureMark'

// ---------------------------------------------------------------------------
// RIS layout XML (Applikation=Begut main document) → the same blocks
// ---------------------------------------------------------------------------

/**
 * RIS types → block kinds. Verified on three GP XXVII drafts (IFG, EAG,
 * EABG): ueberschrift typ para|g1|g1min|g2|titel|anlage, absatz typ
 * abs|novao1|novao2|satz|promkleinlsatz|tabtext|tabtextb|kz, listelem,
 * inhaltsvz. Page header/footer (`kzinhalt`) and `layoutdaten` are noise.
 */
const RIS_HEADING_KIND: Record<string, BlockKind> = {
  para: 'para_head',
  g1: 'article',
  g1min: 'section',
  g2: 'section',
  anlage: 'section',
  titel: 'title',
}
const RIS_ABSATZ_KIND: Record<string, BlockKind> = {
  abs: 'abs',
  novao1: 'novao',
  novao2: 'novao',
}

/**
 * `schlussteil` is the text that closes an enumeration — "… hat jede
 * Veränderung, insbesondere a) …, b) …, e) … *der Schulbehörde unverzüglich
 * anzuzeigen*". Leaving it out of this list dropped that closing sentence
 * from every RIS-XML document silently: from the payload of an amendment
 * instruction, and from both sides of the ME→RV comparison for GP XXVII and
 * earlier. `lawtext/konsTree.ts` had it from the start; this parser did not,
 * and the mismatch surfaced only when the two were compared against RIS
 * (Privatschulgesetz § 4, 2026-09-09).
 *
 * **Both spellings**, because RIS names the clause `<schlussteil>` or
 * `<schluss typ="…">` depending on the converter that produced the document,
 * and unlike the § documents a Begut main document carries **both inside one
 * file**. Without the older name the payload of an amendment instruction lost
 * its closing clause, so the draft bags of the annex check („nicht im
 * Entwurf") lacked words the annex rightly shows as new, and the ME→RV units
 * lacked the same words on both sides. The corpus measurement is in
 * `lawtext/konsTree.ts`.
 */
const RIS_BLOCK_RE = /<(ueberschrift|absatz|listelem|schlussteil|schluss|inhaltsvz|pdvorlage)\b([^>]*)>([\s\S]*?)<\/\1>/g
/**
 * `<pdvorlage><pdeinst formatname="PDK1Anlage" />„Anlage</pdvorlage>`: text the
 * Bundesgesetzblatt sets in a layout template — the heading of a new Anlage
 * and the line under it („(§ 365s Abs. 5 und 6)"), five times in the harness
 * cache (24.11.2026). Unread, „Anlage" was in Parliament's HTML of the same
 * text (`<p class=PDK1Anlage>`, an „other" block) and not in RIS's, and the
 * plenum's Z 23 of 75/ME XXVIII stood as redaktionell against the
 * Kundmachung. Read as the HTML reads it: a block of its own, kind „other".
 */
const PD_TEMPLATE_RE = /<pdeinst\s+formatname="([^"]+)"/
const RIS_GLD_RE = /<gldsym>([\s\S]*?)<\/gldsym>/
/**
 * „<b>§ 56.</b> Die Bewertung …" — a quoted § whose symbol is set bold
 * instead of as `<gldsym>`, read as the symbol all the same. The RIS twin of
 * `BOLD_GLD_RE` in `parliamentHtml.ts` (reasons there): with only the HTML
 * side reading it, 68/ME XXVII (draft from RIS, Vorlage from Parliament)
 * gained the very phantom change the rule removes elsewhere (19.11.2026).
 * 18 such symbols against 120 `<gldsym>` in the 83 cached Begut XMLs.
 */
const RIS_BOLD_GLD_RE = /^(\s*„\s*)<b>\s*(§\s*\d+[a-z]*\.)\s*<\/b>/

/**
 * The Novellentext tags a quotation is cut into where it holds a dash:
 * „<n>„ARF</n><gdash /><n> oder KSF</n><gdash /><n>Leistungen“</n>". Every
 * other tag is a word boundary (`stripMarkup`), so these two came out as
 * „ARF - oder KSF - Leistungen" — a spelling the ressort never wrote, which
 * the engine then wrote into the law (Transparenzdatenbankgesetz 2012
 * § 40b, 26.09.2026). 65 such cuts in the Prüfstand's documents; in an old
 * text the tolerant match had quietly bridged them, in a new one nothing
 * did. Inline markup between them („</b></n><gdash /><n><b>") is kept for
 * `stripMarkup` to drop.
 */
const N_AT_DASH_RE = /<\/n>((?:<\/?(?:i|b|u|em|strong|span|font)\b[^>]*>)*)(?=<gdash\s*\/>)|(<gdash\s*\/>(?:<\/?(?:i|b|u|em|strong|span|font)\b[^>]*>)*)<n>/g

/**
 * RIS's image element, `<binary …><src>/Dokumente/…/….img1is.png</src></binary>`.
 * Its `<src>` is a text node, so the file path came through as the law's
 * words: the § comparison inserted „/Dokumente/BgblAuth/…img1is.png" into
 * 61/ME's Z 25 and 62/ME's StVO Z 6 on ME → Kundmachung (19.11.2026). Named
 * instead (`FIGURE_MARK`), as Parliament's `<img>` is (`stripTags`) and as
 * the annex's cells have been since 25.10.2026 (`annex/tableCells.ts`).
 */
const BINARY_RE = /<binary\b[^>]*?(?:\/>|>[\s\S]*?<\/binary\s*>)/g

/**
 * „<ueberschrift typ="art">Artikel 1<br />Änderung des
 * Beamten-Dienstrechtsgesetzes 1979</ueberschrift>" — the Artikel line and
 * the law's name in ONE heading, split by a line break: the RIS twin of
 * `articleNameSplit` in `parliamentHtml.ts`, and split the same way, into the
 * Artikel line and its name as a `section`.
 *
 * The class mapping knows no `art`, and `refineArticleHeadings` takes only
 * the bare Artikel line, so the joined heading stayed `other` — text of the
 * instruction above it. The package read as one law: every Artikel after the
 * first went on numbering under the first one's key, its first instruction
 * „1." as `Z1#dup` behind the unit before (19.11.2026, `harness/units.ts`:
 * three „verdoppelt" in Oö. and Kärntner Landesgesetzblätter, 250 such
 * headings in the cached ones; and three Dienstrechts-Novellen of the Bund,
 * 32 headings). The Land page was not affected — `lgblUnits` retypes `art`
 * as `g1` before it reads.
 *
 * Only `typ="art"`, the one heading class the mapping leaves to the text:
 * a `g1` heading of this shape is an Artikel already, keyed by the whole
 * line, and splitting it would rekey 198 cached headings for no reading that
 * was wrong. Not inside a table, and only where the part before the break
 * is a bare Artikel line — an Artikel quoted in amendment text opens with
 * the quotation mark.
 */
function articleNameSplit(typ: string, inner: string): [string, string] | null {
  if (typ !== 'art') return null
  const br = /<br\b[^>]*>/.exec(inner)
  if (!br) return null
  const line = risText(inner.slice(0, br.index))
  const name = risText(inner.slice(br.index + br[0].length))
  return ARTICLE_LINE_RE.test(line) && name ? [line, name] : null
}

function risText(inner: string, printedQuotes = false): string {
  return stripTags(
    inner
      .replace(BINARY_RE, ` ${FIGURE_MARK} `)
      .replace(N_AT_DASH_RE, '$1$2')
      .replace(/<gdash\s*\/>/g, '-')
      .replace(/<nbsp\s*\/>/g, ' ')
      .replace(/<amp\s*\/>/g, '&amp;'),
    printedQuotes,
  )
}

/** RIS's runs set apart: raised, lowered (a footnote's mark among them), underlined (a fraction's bar). */
const SCRIPT_RE = /<(super|sub|fnzeichen|u)\b[^>]*>([\s\S]*?)<\/\1\s*>/g
const RAISED = '\uE000'
const LOWERED = '\uE001'
const SCRIPT_END = '\uE002'
const UNDERLINED = '\uE003'
const SCRIPT_RUN_RE = /([\uE000\uE001\uE003])([^\uE002]*)\uE002/g
const SCRIPT_MARK: Readonly<Record<string, string>> = { super: RAISED, fnzeichen: RAISED, sub: LOWERED, u: UNDERLINED }
const SCRIPT_POS: Readonly<Record<string, NonNullable<LawTextPart['pos']>>> = { [RAISED]: 'sup', [LOWERED]: 'sub', [UNDERLINED]: 'u' }

/**
 * The block's text in printed runs, or null where nothing is raised or
 * lowered (`TextBlock.parts`). Private-use marks through the one reader, so
 * the runs are normalised exactly as `text` is.
 */
function printedParts(inner: string): LawTextPart[] | null {
  if (!/<(?:super|sub|fnzeichen|u)\b/.test(inner)) return null
  const marked = risText(inner.replace(SCRIPT_RE, (_, tag: string, body: string) => `${SCRIPT_MARK[tag]}${body}${SCRIPT_END}`))
  const parts: LawTextPart[] = []
  let at = 0
  for (const m of marked.matchAll(SCRIPT_RUN_RE)) {
    if (m.index > at) parts.push({ text: marked.slice(at, m.index) })
    // A space RIS sets inside the run stays outside it, or two words join.
    const run = m[2]!.trim()
    if (/^\s/.test(m[2]!)) parts.push({ text: ' ' })
    if (run) parts.push({ text: run, pos: SCRIPT_POS[m[1]!]! })
    if (run && /\s$/.test(m[2]!)) parts.push({ text: ' ' })
    at = m.index + m[0].length
  }
  if (at < marked.length) parts.push({ text: marked.slice(at) })
  return parts
}

/** The document's footnotes (`<fntext nr="1">`), which no block carries. Pure. */
export function risFootnotes(xml: string): { nr: string; text: string }[] {
  return [...xml.matchAll(/<fntext\b[^>]*\bnr="([^"]+)"[^>]*>([\s\S]*?)<\/fntext>/g)]
    .map((m) => ({ nr: m[1]!, text: risText(m[2]!) }))
    .filter((f) => f.text)
}

const TABLE_RE = /<table\b[\s\S]*?<\/table>/g

/** The document without what RIS prints around it on every page. */
function risBody(xml: string): string {
  // `fzinhalt` is the page FOOTER RIS prints under every page
  // ("www.ris.bka.gv.at   Seite 2 von 2"), the counterpart to the `kzinhalt`
  // header. Without it the footer came through as an ordinary Absatz with no
  // designation, which on the Erläuterungen is a passage the section shows:
  // measured over the offline cache on 22.09.2026, 180 of 314 readable
  // Erläuterungen documents carried it. The two sibling parsers strip all
  // three (`lawtext/konsTree.ts`, `annex/comparisonRows.ts`); this one did not.
  return xml
    .replace(/<kzinhalt[\s\S]*?<\/kzinhalt>/g, '')
    .replace(/<fzinhalt[\s\S]*?<\/fzinhalt>/g, '')
    .replace(/<layoutdaten[\s\S]*?<\/layoutdaten>/g, '')
}

/**
 * RIS Begut main-document XML → flat block list, same kinds as the Parliament
 * HTML parser — including the pass that marks the Artikel headings RIS types
 * as `art` or as a table-of-contents column (`refineArticleHeadings`).
 */
export function parseRisXml(xml: string): TextBlock[] {
  const body = risBody(xml)
  // Blocks inside a table keep their kind (the ME→RV comparison reads cell
  // text like any other) but carry a `table:` prefix in `cls`, so the
  // amendment engine can refuse a payload that is a table.
  const tables = [...body.matchAll(TABLE_RE)].map((t) => [t.index!, t.index! + t[0].length] as const)
  const tableAt = (at: number): number => tables.findIndex(([from, to]) => at >= from && at < to)
  const inTable = (at: number): boolean => tableAt(at) >= 0
  const blocks: TextBlock[] = []
  for (const m of body.matchAll(RIS_BLOCK_RE)) {
    const tag = m[1]!
    const inner = m[3]!
    const typ = tag === 'pdvorlage' ? (PD_TEMPLATE_RE.exec(inner)?.[1] ?? '') : (/typ="([^"]+)"/.exec(m[2]!)?.[1] ?? '')
    const gldMatch = RIS_GLD_RE.exec(inner)
    const boldMatch = gldMatch ? null : RIS_BOLD_GLD_RE.exec(inner)
    const gld = gldMatch ? risText(gldMatch[1]!) : boldMatch ? risText(boldMatch[2]!) : null
    const own = gldMatch
      ? inner.replace(gldMatch[0], ' ')
      : boldMatch
        ? `${boldMatch[1]} ${inner.slice(boldMatch[0].length)}`
        : inner
    const text = risText(own)
    // The quotation marks as RIS prints them, where folding changed one (`TextBlock.quoteMarks`): folding
    // replaces a mark by a mark, so the two texts differ at the marks' places and nowhere else.
    const printed = risText(own, true)
    const quoted = printed !== text && printed.length === text.length ? { quoteMarks: [...text].flatMap((c, i) => (c === '"' ? [printed[i]!] : [])).join('') } : {}
    if (!text && !gld) continue
    const runs = printedParts(own)
    const scripted = runs ? { parts: runs } : {}
    const split = tag === 'ueberschrift' && !gld && !inTable(m.index!) ? articleNameSplit(typ, inner) : null
    if (split) {
      const cls = `${tag}/${typ}`
      blocks.push({ kind: 'article', cls, text: split[0], gld: null }, { kind: 'section', cls, text: split[1], gld: null })
      continue
    }
    let kind: BlockKind
    if (tag === 'ueberschrift') {
      kind = RIS_HEADING_KIND[typ] ?? 'other'
      if (kind === 'article' || kind === 'section') kind = ARTICLE_RE.test(text) ? 'article' : 'section'
    } else if (tag === 'absatz') {
      if (typ === 'kz') continue
      kind = RIS_ABSATZ_KIND[typ] ?? 'other'
    } else if (tag === 'listelem') {
      kind = 'ziff'
    } else if (tag === 'schlussteil' || tag === 'schluss') {
      // Continuation of the Absatz that opened the list, not a unit of its
      // own — `parsePayload` and `segmentUnits` both append an unmarked
      // block to the Absatz above it, which is exactly right here. The older
      // spelling names the unit it closes in `typ` (Abs, Ziff, Lit, e<n>);
      // a flat block list has no slot for that level, and document order is
      // what the consumers need, so both spellings land the same way.
      kind = 'abs'
    } else if (tag === 'pdvorlage') {
      kind = 'other'
    } else {
      kind = 'toc'
    }
    blocks.push({ kind, cls: `${inTable(m.index!) ? 'table:' : ''}${tag}/${typ}`, text, gld: gld || null, ...(inTable(m.index!) ? { table: true as const, tableAt: tableAt(m.index!) } : {}), ...quoted, ...scripted })
  }
  return refineArticleHeadings(blocks)
}

/** One cell: its printed lines, and whether the document sets all of them as a heading or in bold. */
function tableCell(attrs: string, html: string): LawTableCell & { emphasised: boolean } {
  const lines: LawTableCell['lines'] = []
  let emphasised = true
  for (const m of html.matchAll(RIS_BLOCK_RE)) {
    if (m[1] === 'absatz' && /typ="kz"/.test(m[2]!)) continue
    const inner = m[3]!
    const parts = printedParts(inner)
    const text = parts ? parts.map((p) => p.text).join('') : risText(inner)
    if (!text) continue
    lines.push({ text, ...(parts ? { parts } : {}) })
    if (m[1] !== 'ueberschrift' && !/^\s*<b>[\s\S]*<\/b>\s*$/.test(inner)) emphasised = false
  }
  const span = (name: string): number => Number(new RegExp(`\\b${name}="(\\d+)"`).exec(attrs)?.[1] ?? 1)
  const colspan = span('colspan')
  const rowspan = span('rowspan')
  return { lines, emphasised: emphasised && lines.length > 0, ...(colspan > 1 ? { colspan } : {}), ...(rowspan > 1 ? { rowspan } : {}) }
}

/**
 * Without the rows that hold nothing: the converter's spacers, 113 in the
 * tables of the 53 new laws of GP XXVII–XXVIII, which read as a blank line of
 * data. Not a row a cell above reaches into with its `rowspan`: without it,
 * that cell would span one row too many.
 */
function withoutSpacerRows<C extends LawTableCell>(rows: C[][]): C[][] {
  const reached = new Set<number>()
  rows.forEach((row, r) => row.forEach((c) => {
    for (let i = r + 1; i < r + (c.rowspan ?? 1); i++) reached.add(i)
  }))
  return rows.filter((row, r) => reached.has(r) || row.some((c) => c.lines.length > 0))
}

/**
 * The document's tables with their rows and columns, in the order of
 * `TextBlock.tableAt` (23.11.2026). The blocks keep reading a table as a run
 * of cells, because the comparisons are keyed on that; a reader needs the
 * grid, since an empty cell is what says which column a value stands in
 * (149/ME XXVIII, Anlage 1: Schwefeldioxid 350 under MW1 and 120 under TMW).
 *
 * RIS marks no header. The leading rows whose filled cells are all bold or
 * headings are taken as one, as the document sets them; a table bold
 * throughout has none.
 */
export function risTables(xml: string): LawTable[] {
  return [...risBody(xml).matchAll(TABLE_RE)].map((t) => {
    const title = /^<table\b[^>]*\btitle="([^"]*)"/.exec(t[0])?.[1]?.trim()
    const rows = withoutSpacerRows([...t[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
      [...r[1]!.matchAll(/<td\b([^>]*?)(?:\/>|>([\s\S]*?)<\/td>)/g)].map((c) => tableCell(c[1]!, c[2] ?? '')),
    ))
    const isHead = (row: (typeof rows)[number]) => row.some((c) => c.lines.length) && row.every((c) => !c.lines.length || c.emphasised)
    const firstBody = rows.findIndex((row) => !isHead(row))
    const heads = firstBody < 0 ? 0 : firstBody
    return {
      ...(title ? { title } : {}),
      rows: rows.map((row, i) => row.map(({ emphasised: _, ...cell }) => (i < heads ? { ...cell, header: true as const } : cell))),
    }
  })
}
