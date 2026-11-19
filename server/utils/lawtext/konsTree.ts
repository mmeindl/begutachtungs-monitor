/**
 * The standing law as an addressable tree.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * RIS `BrKons` publishes consolidated law **one document per paragraph**,
 * with a validity interval on each version (docs/api-exploration.md §2a).
 * This module turns one such document into the tree a Novellierungsanordnung
 * addresses: § → Absatz → Ziffer/Litera, plus the Schlussteil that trails a
 * list. `kons/lawApply.ts` operates on that tree; nothing here changes
 * anything.
 */
import { normalizeText, stripMarkup } from './normalize'
import { decodeEntities } from '../parliament/htmlText'
import { PARAGRAPH_NUMBER } from '../../../shared/utils/paragraphNumber'
import { FIGURE_MARK } from '../../../shared/utils/figureMark'

export type NodeLevel = 'para' | 'abs' | 'z' | 'lit' | 'schluss'

/**
 * One addressable node. `id` is the identifier as written ("5a", "2", "b"),
 * never a number: legistic numbering is not arithmetic.
 */
export interface LawNode {
  level: NodeLevel
  id: string
  /** The printed marker: "§ 5.", "(2)", "3.", "b)" — kept so output reads like law */
  marker: string
  /** Only on a paragraph: its Überschrift */
  heading: string | null
  /**
   * Only on a paragraph: the headings RIS prints *above* it — "3. Teil",
   * "1. Hauptstück", "1. Abschnitt". They belong to a group of §§ rather than
   * to this one, so they stay out of `plainText`: a Novelle that replaces the
   * § does not replace them, and counting them as the §'s own text would make
   * every such replacement look like a loss. They are recorded because the
   * ressort's Textgegenüberstellung prints them over the § and something has
   * to be able to recognise them (§ 12 of one law carries six).
   */
  context: string[]
  /** The node's own text, without marker and without children */
  text: string
  children: LawNode[]
}

export function makeNode(level: NodeLevel, id: string, marker: string, text: string, heading: string | null = null): LawNode {
  return { level, id, marker, heading, context: [], text, children: [] }
}

// ---------------------------------------------------------------------------
// RIS BrKons XML → tree
// ---------------------------------------------------------------------------

/**
 * Deliberately not the list in `lawtext/risXml.ts`, which is the one home for
 * the element vocabulary of a *draft*: this reads a single § of the standing
 * law, where `inhaltsvz` is the law's own table of contents and no part of
 * any §.
 */
const STRIP = [/<kzinhalt[\s\S]*?<\/kzinhalt>/g, /<fzinhalt[\s\S]*?<\/fzinhalt>/g, /<layoutdaten[\s\S]*?<\/layoutdaten>/g]
/**
 * The elements that carry law text — and `schluss` beside `schlussteil`,
 * because RIS spells the closing clause of an enumeration two ways.
 *
 * Which spelling a document uses is a property of the **converter that
 * produced it**, not of the law: converter 4.1 writes `<schlussteil>`, the 3.x
 * line writes `<schluss typ="…">`, and 4.0 straddles the change. Measured over
 * the 16.073 § documents of the offline corpus on 2026-09-11: 2.824 carry
 * `<schlussteil>`, 402 carry `<schluss>`, and **not one carries both** — so
 * reading only the newer name ended those 402 §§ with their enumeration and
 * dropped 880 blocks, 23.578 comparable words of standing law, silently. The
 * document-order measurement behind it: 15.290 of 15.510 representable
 * documents in order, against 14.906, none short of text any more.
 * `lawtext/risXml.ts` reads both names for the same reason, on the other
 * kind of document.
 */
const BLOCK_RE = /<(ueberschrift|absatz|listelem|schlussteil|schluss|table)\b([^>]*)>([\s\S]*?)<\/\1>/g
const GLD_RE = /<gldsym>([\s\S]*?)<\/gldsym>/
/** „§ 30.", „§ 27a", „Art. 5.", „Artikel 12": a designation with no name after it. */
const DESIGNATION_ONLY_RE = /^(?:§|Art\.|Artikel)\s*\d+[a-z]*\.?$/i
const SYMBOL_RE = /<symbol\b[^>]*>([\s\S]*?)<\/symbol>/
/** "(2) " opens an Absatz; "(2a)" and "(2b)" are legal too. */
const ABS_MARKER_RE = /^\((\d+[a-z]*)\)\s*/
/** "3." opens a Ziffer, "b)" a Litera. */
const Z_MARKER_RE = /^(\d+[a-z]*)\.$/
const LIT_MARKER_RE = /^([a-z]{1,2})\)$/
/**
 * „a." — a Litera in the spelling some laws use (FPG § 76 Abs. 3 Z 6). Read
 * as a Ziffer, „a", „b" and „c" stood beside Z 6 instead of under it, and
 * „in lit. b" found nothing (27.09.2026).
 */
const LIT_DOT_MARKER_RE = /^([a-z])\.$/
/**
 * „(3) 1." — the Absatz and its first Ziffer in one symbol, where an Absatz
 * opens straight into its list (UStG 1994 § 26 Abs. 3). Read as a Ziffer „(3)
 * 1" of Abs. 2, Abs. 3 did not exist.
 */
const ABS_Z_MARKER_RE = /^\((\d+[a-z]*)\)\s*(\d+[a-z]*)\.$/
/** A list opening and its depth: `<aufzaehlung ebene="3">`, `<ziffernliste ebene="1">`. */
const LIST_OPEN_RE = /<(?:aufzaehlung|[a-z]*liste)\b[^>]*\bebene="(\d+)"/g

/**
 * RIS prints its own editorial notes into the consolidated text, in italics:
 * "(Anm.: Abs. 2 aufgehoben durch Art. 1 Z 21, BGBl. I Nr. 68/2025)", "(Anm.:
 * lit. c aufgehoben durch …)". They are not law, no Novelle can address them,
 * and one that stood behind Abs. 1 without a marker of its own was folded
 * into Abs. 1 — so "§ 40d Abs. 1 lautet:" wiped it while RIS kept it, and
 * the harness called that a divergence (BGBl. I Nr. 68/2025, 2026-09-09).
 * Stripped from every block; an Absatz that consisted of one keeps its
 * marker and an empty text. The colon may stand apart from „Anm." — KFG
 * § 102 carries „(Anm. : Abs. 13 aufgehoben …)" — and the period may be
 * missing: the same shape `annex/annexText.ts` strips from the annex since
 * 10.09.2026, so the two sides read a note alike again (28.09.2026).
 */
const ANNOTATION_RE = /\(Anm\.?(?:\s|<[^>]+>)*:[^()]*(?:\([^()]*\)[^()]*)*\)/g

/**
 * **A note RIS splits over two blocks** (19.11.2026). Tabakmonopolgesetz § 1
 * ends „<i>(Anm.: Abs. 2a bis 2c aufgehoben durch VfGH, BGBl. I Nr.
 * 111/2015,</i>" in one `<absatz>` and „<i>Abs. 3 und 4 aufgehoben durch
 * BGBl. I Nr. 110/2023)</i>" in the next. `ANNOTATION_RE` reads one block
 * and needs the closing bracket, so both halves stood in the Lesefassung of
 * 61/ME XXVIII as law, oracle-confirmed, because the annex's „…" covered them.
 * Removed here across at most two block boundaries, the tags kept so the
 * blocks stay blocks; a note that does not close by then is left as it is.
 */
const NOTE_OPEN_RE = /\(\s*Anm\.?(?:\s|<[^>]+>)*:/g
const TEXT_BLOCK_END_RE = /^<\/(?:absatz|listelem|schlussteil|schluss)>$/
const STRUCTURE_OPEN_RE = /^<(?:ueberschrift|table)\b/
function withoutSplitNotes(body: string): string {
  let out = ''
  let from = 0
  for (const m of body.matchAll(NOTE_OPEN_RE)) {
    if (m.index < from) continue
    let depth = 0
    let ends = 0
    let close = -1
    for (let i = m.index; i < body.length && i - m.index < 3000; i++) {
      const ch = body[i]!
      if (ch === '<') {
        const end = body.indexOf('>', i)
        if (end < 0) break
        const tag = body.slice(i, end + 1)
        if (STRUCTURE_OPEN_RE.test(tag)) break
        if (TEXT_BLOCK_END_RE.test(tag)) ends++
        i = end
        continue
      }
      if (ch === '(') depth++
      else if (ch === ')' && --depth === 0) {
        close = i
        break
      }
    }
    // Within one block it is `ANNOTATION_RE`'s, unclosed it is nobody's.
    if (close < 0 || ends === 0 || ends > 2) continue
    out += body.slice(from, m.index) + (body.slice(m.index, close + 1).match(/<[^>]+>/g) ?? []).join('')
    from = close + 1
  }
  return out + body.slice(from)
}

/**
 * RIS's footnote apparatus: a rule „(________" or a numbered note „Anm. 1:",
 * „Anm. 1 (zu Z 346):", and behind it the note's own continuation, set in
 * italics. ASVG § 108 prints „Anm. 2: tägliche Höchstbeitragsgrundlage" and
 * then the valorised amounts as five italic `<schlussteil>` blocks („gemäß
 * BGBl. II Nr. 590/2021 für 2022: 189,00 €"), which stood in the tree as five
 * Schlussteile of Abs. 6 (19.11.2026). Over the cache, every italic block
 * between such a note and the next upright one is apparatus: amounts, quoted
 * Novelle wording, „vgl." references.
 */
const FOOTNOTE_RULE_RE = /^\(?\s*(?:_{5,}|-{5,})\s*\)?$/
const NUMBERED_NOTE_RE = /^\(?\s*Anm\.?\s*\d+[a-z]?\s*(?:\([^)]*\)\s*)?\.?\s*:/
const OPENS_ITALIC_RE = /^\s*<i>/
/**
 * A footnote's own number, set upright: „<super>1</super> LGBl. für
 * Burgenland …" behind a rule. Its text reads „1 LGBl. …" with no „)", so
 * neither the italic test nor the „1)" form saw it (19.11.2026).
 */
const OPENS_FOOTNOTE_MARK_RE = /^\s*<super>\s*\d{1,2}[a-z]?\s*<\/super>/
/**
 * An `erltext` block that is a note, not law, wherever it stands: RIS's
 * italics, its own „Anm", a footnote („*) Die Kundmachung des Abkommens …",
 * „<super>1</super>) Die Kundmachung …"), the footnote rule.
 */
function erltextNote(inner: string, t: string): boolean {
  return OPENS_ITALIC_RE.test(inner) || OPENS_FOOTNOTE_MARK_RE.test(inner) || /^\(?\s*Anm\b/.test(t) || /^\*+\s*\d{0,2}\s*\)/.test(t) || /^\d{1,2}[a-z]?\s*\)\s/.test(t) || /_{5,}|-{5,}/.test(t)
}

/** A line that ends no sentence, directly above a block that opens a numbered Absatz: that Absatz's heading. */
function headsAbsatz(t: string, next: RegExpExecArray | RegExpMatchArray | undefined): boolean {
  if (/[.:;,!?]["“”')\]]*$/.test(t) || next === undefined) return false
  return ABS_MARKER_RE.test(text(next[3]!).replace(/^§+\s*\d+[a-z]*\.?\s*/i, ''))
}

/**
 * A block's text. `stripMarkup` carries the block/inline distinction, and it
 * is shared with the annex on purpose: this is the text the annex's left
 * column is scored against, so a rule applied to one side alone would be the
 * asymmetry, not the fix (`lawtext/normalize.ts`, 2026-09-11).
 *
 * `ANNOTATION_RE` runs before it, unchanged: RIS sets its editorial note in
 * italics, and the pattern has always seen the note's own text. What the
 * shared rule adds is the note whose *markup* used to break it apart — eight
 * of the twelve standing blocks that change a comparable word at all (BWG
 * §§ 2 and 107, SchUG § 82), where "(Anm.: von Novelle nicht betroffen)" left
 * "anm", "aufgehoben" and "novelle" in the standing bag that the annex column
 * never offered.
 */
/**
 * RIS's image element, `<binary …><src>/Dokumente/Bundesnormen/…/hauptdokument.img1is.png</src></binary>`.
 * Its `<src>` is a text node, so the file path stood in the standing law as
 * its words: MinBestG § 49 read „… × Mindeststeuersatz /Dokumente/
 * Bundesnormen/NOR40258681/hauptdokument.img1is.png angepasste erfasste
 * Steuern", 24 of 132 cached § documents with an image (19.11.2026), and a
 * Lesefassung printed it wherever an annex row elided the stretch. Named
 * instead (`FIGURE_MARK`), as the draft's readers name it.
 */
const BINARY_RE = /<binary\b[^>]*?(?:\/>|>[\s\S]*?<\/binary\s*>)/g

function text(inner: string): string {
  return normalizeText(
    decodeEntities(
      stripMarkup(
        inner
          .replace(BINARY_RE, ` ${FIGURE_MARK} `)
          .replace(ANNOTATION_RE, ' ')
          .replace(/<gdash\s*\/>/g, '-')
          .replace(/<nbsp\s*\/>/g, ' ')
          .replace(/<amp\s*\/>/g, '&amp;'),
      ),
    ),
  )
}

function lastChild(node: LawNode, level: NodeLevel): LawNode | null {
  for (let i = node.children.length - 1; i >= 0; i--) if (node.children[i]!.level === level) return node.children[i]!
  return null
}

/**
 * Which node a closing clause belongs to.
 *
 * `<schluss>` names the unit it closes in its `typ` — "Abs" (462 blocks of the
 * corpus), "Ziff" (276), "Lit" (83), and "e<n>" for the depth of the list that
 * just ended (59), where the depth is the `ebene` of `<ziffernliste ebene="1">`,
 * `<literaliste ebene="2">` and their deeper kin. `<schlussteil>` names
 * nothing, and keeps the Absatz it has always been given.
 *
 * Reading the level matters twice, and both are ordering. In `plainText` the
 * enumeration can *continue* after the clause — „oder" closes Ziffer 1 of
 * Börsegesetz § 131 Abs. 1 and Ziffer 2 follows it — and filing every clause
 * on the Absatz instead costs 33 documents their document order. And
 * `textSlot` in `kons/lawApply.ts` resolves „Im Schlussteil des § 169 Abs. 1"
 * to the Absatz's *last* `schluss` child: measured over the corpus, filing
 * them all on the Absatz puts a Ziffer's or Litera's clause in that slot in
 * **89 §§**. Reading the level takes that to zero, and it never *empties* a
 * slot: over the 16.073 documents the Absatz's clause changes in 317 of them
 * and in every one of those it was empty before.
 *
 * **`<schlussteil>` names it in `ebene`, and since 26.09.2026 that is read**
 * — 0 and 0.5 for the Absatz (4.792 blocks), 1 for the Ziffer (2.640), 2 and
 * deeper for the Litera (587); it takes the documents whose `plainText` is
 * out of document order from 220 to 121. It stood here as „measured and
 * deliberately not done" for two reasons, and the corpus answered both. It
 * empties the Absatz-level Schlussteil slot in 2.352 documents — which costs
 * nothing that shows: `harness:kons` over 40 Sammelnovellen moves identisch
 * 762 → **764**, „kein geltender Text" 27 → **25**, and the sharpest class
 * not at all. And whether the 406 `ebene="1"` clauses that *end* their list
 * close the Ziffer or the Absatz was the question `ebene` cannot answer on
 * its own: the variant that files an ending clause on the Absatz was built
 * and measured on the same bench and is **worse** (763 / 26), so they close
 * the Ziffer like every other one.
 */
function closingHost(abs: LawNode, typ: string, ebene: string | null = null): LawNode {
  const depth = /^e(\d+)$/i.exec(typ)
  const byEbene: NodeLevel | null = ebene === null ? null : Number(ebene) >= 2 ? 'lit' : Number(ebene) >= 1 ? 'z' : 'abs'
  const level: NodeLevel =
    byEbene ?? (depth ? (Number(depth[1]) >= 2 ? 'lit' : 'z') : /^ziff$/i.test(typ) ? 'z' : /^lit$/i.test(typ) ? 'lit' : 'abs')
  if (level === 'abs') return abs
  const z = lastChild(abs, 'z')
  if (z === null) return abs
  return level === 'z' ? z : (lastChild(z, 'lit') ?? z)
}

/** „Art. 2 § 3": the § directly behind its Artikel, its number as every reader reads it (`PARAGRAPH_NUMBER`). */
const ARTIKEL_PARA_RE = new RegExp(String.raw`^\s*Art(?:\.|ikel)?\s*[\dIVXLCDM]+\s*§+\s*(${PARAGRAPH_NUMBER})`, 'i')
/** „§ 6.01a.", „Art. 3", „Anl. 1": the unit's own number. */
const UNIT_ID_RE = new RegExp(String.raw`(?:§|Art\.?|Artikel|Anl(?:age)?\.?)\s*(${PARAGRAPH_NUMBER})`, 'i')

/**
 * One BrKons paragraph document → its tree.
 *
 * The document opens with a metadata block (Kurztitel, Kundmachungsorgan,
 * §/Artikel/Anlage, Inkrafttretensdatum) whose paragraphs carry a `ct`
 * other than "text" — that is the only reliable separator from the law
 * itself, so everything before the first `ct="text"` block is dropped.
 */
export function parseKonsParagraph(xml: string): LawNode | null {
  let body = xml
  for (const re of STRIP) body = body.replace(re, '')
  body = withoutSplitNotes(body)
  // A table has no place in the tree (§ → Abs → Z → lit): its cells carry
  // their own `<absatz>` blocks, and read in document order they become
  // Absätze of the §. The whole document used to be dropped for that (NEHG
  // §§ 24, 26, 27, 2026-09-09), which took its prose with it — 693 of 20.419
  // fetched documents in 151 of 607 laws, and a § that is not loaded can
  // never be shown either (26.09.2026).
  //
  // **So the table is read as ONE opaque block** and its inner blocks are
  // not read at all: `BLOCK_RE` matches `<table>…</table>` whole, and the
  // scan resumes behind it. The text stays in the tree, under a `schluss`
  // node whose id says what it is, because a § shown WITHOUT its tariff
  // table would be a wrong text rather than a missing one — and
  // `kons/lawApply.ts` keeps it out of the Schlussteil slot by that id.

  /** Does the document carry Absatz-shaped law text of its own? */
  const hasAbsaetze = /<absatz[^>]*typ="(?:abs|satz)"[^>]*ct="text"/.test(body)

  const paraId = /<absatz[^>]*ct="artikel_anlage"[^>]*>([\s\S]*?)<\/absatz>/.exec(body)
  const idText = paraId ? text(paraId[1]!) : ''
  // A law that is itself divided into Artikel prints both designations in one
  // Gliederungssymbol: RIS carries „Art. 2 § 3" for the third § of the second
  // Artikel. The general reading below takes the first number it finds, so
  // that § arrived as id „2" — the Artikel's number, and therefore as a twin
  // of the same law's § 2. It stayed invisible while `kons/novao.ts` refused
  // every address into such a law; the moment the Artikel became part of an
  // address (25.09.2026), it would have been a wrong § with a
  // correct-looking text. „Anlage 5 zu § 14" is NOT this shape — the § there
  // is a cross-reference and the Anlage keeps its own number — so the § is
  // read only where it stands directly behind the Artikel.
  const artikelPara = ARTIKEL_PARA_RE.exec(idText)
  // `Anl\.?` and not only „Anlage": RIS writes a schedule's Gliederungssymbol
  // as **„Anl. 1"**, and the word this read was the one an INSTRUCTION uses.
  // So every Anlage of every law arrived with the id „?" — its 41 Ziffern
  // parsed and unreachable, because `findParagraph` looks a § up by that id.
  // Measured on the Anhang of the Bundesgesetzes gegen den unlauteren
  // Wettbewerb (26.09.2026): id „?", marker „Anl. 1", 41 Ziffern.
  const idMatch = artikelPara ?? UNIT_ID_RE.exec(idText)
  // **„§ 0" is not a provision.** RIS files a law's front matter under that
  // label — the Inhaltsverzeichnis, the Promulgationsklausel, the list of
  // amendments — and no Novellierungsanordnung addresses it. It stayed out
  // of the tree by accident while its table was a reason to drop the whole
  // document; since the table is read (26.09.2026) it would come in as a
  // paragraph holding 5.624 characters of table of contents on average, over
  // 134 documents of the cache. Kept out on purpose now, and the bench's
  // denominator says why: 15 §§ that nothing ever changes.
  if (/^§+\s*0\s*$/.test(idText.trim())) return null

  let root: LawNode | null = null
  let sawTable = false
  let heading: string | null = null
  const context: string[] = []
  let currentAbs: LawNode | null = null

  /**
   * The § node, created on first need.
   *
   * It used to be created only from an `<absatz>` block, so a document that
   * has none — an Anlage is a bare list of `<listelem>` — parsed to null and
   * vanished (6.521 characters of Anlage 1 of one law became nothing).
   */
  const para = (): LawNode => {
    if (!root) root = makeNode('para', idMatch?.[1] ?? '?', idText || '', '', heading)
    root.heading ??= heading
    root.context = context
    return root
  }

  /**
   * The Absatz a Ziffer hangs off, created on first need.
   *
   * A § whose text is nothing but its designation followed by a list — every
   * Inkrafttretensbestimmung is built that way — has no numbered Absatz at
   * all, and every one of its Ziffern was dropped on the floor: § 26c of one
   * law is 48.010 characters of XML and 149 Ziffern, and it parsed to the
   * empty string (2026-09-09). That is the standing text the amendment engine
   * applies instructions to, so it was not only a gap in a measurement.
   */
  const absatz = (): LawNode => {
    if (!currentAbs) {
      currentAbs = makeNode('abs', '', '', '')
      para().children.push(currentAbs)
    }
    return currentAbs
  }

  // „(3) 1. … 2. Abweichend davon … – … – …": the dashes are one `ebene`
  // deeper than the Ziffern and belong to Z 2. Read as Ziffern of their own
  // they stood beside it, and „Z 2 lautet" would have left the old dashes
  // standing (UStG § 26 Abs. 3, 28.09.2026). The depth of each list opening,
  // so a list item can ask how deep it stands.
  const openings = [...body.matchAll(LIST_OPEN_RE)].map((o) => ({ at: o.index, ebene: Number(o[1]) }))
  const ebeneAt = (at: number): number | null => {
    let found: number | null = null
    for (const o of openings) if (o.at < at) found = o.ebene
    return found
  }
  let lastItem: { node: LawNode; abs: LawNode; ebene: number | null } | null = null
  /** Inside RIS's footnote apparatus (`NUMBERED_NOTE_RE`): italic blocks are its continuation. */
  let footnotes = false
  /** Closing parts read out of `erltext` (below), to be told from text between list items afterwards. */
  const fromErltext = new Set<LawNode>()

  const blocks = [...body.matchAll(BLOCK_RE)].filter((b) => b[1] === 'table' || /ct="text"/.test(b[2]!))
  for (const [at, m] of blocks.entries()) {
    const tag = m[1]!
    const attrs = m[2]!
    const inner = m[3]!
    // A `<table>` carries no `ct`, and it is the one block read for its text
    // rather than for its structure.
    if (tag !== 'table' && !/ct="text"/.test(attrs)) continue
    if (tag !== 'table' && tag !== 'ueberschrift') {
      const t = text(inner)
      if (FOOTNOTE_RULE_RE.test(t) || NUMBERED_NOTE_RE.test(t)) {
        footnotes = true
        continue
      }
      if (footnotes && (OPENS_ITALIC_RE.test(inner) || OPENS_FOOTNOTE_MARK_RE.test(inner))) continue
    }
    footnotes = false
    if (tag === 'table') {
      sawTable = true
      const t = text(inner)
      if (t) (currentAbs ?? absatz()).children.push(makeNode('schluss', 'tabelle', '', t))
      continue
    }
    const typ = /typ="([^"]+)"/.exec(attrs)?.[1] ?? ''

    if (tag === 'ueberschrift') {
      // The § heading is the one marked as such. Letting a group heading
      // stand in for it gave a § the name of the Abschnitt above it — a wrong
      // name, and a wrong name on someone's paragraph is worse than none.
      // A „heading" that is only the designation is none (18.11.2026). RIS
      // writes „§ 30." as `<gldsym>` in the first Absatz, and in a few older
      // laws as `<ueberschrift typ="para">` instead — one version of
      // Privatschulgesetz § 30 this way, the next the other. Taken for the
      // §'s name it stood in the comparison text of one version only, and a
      // § replaced word for word read as „halb angewendet".
      if (typ === 'para') heading = DESIGNATION_ONLY_RE.test(text(inner)) ? null : text(inner)
      else if (root === null) {
        const t = text(inner)
        if (t) context.push(t)
      }
      continue
    }

    if (tag === 'schlussteil' || tag === 'schluss') {
      const t = text(inner)
      const ebene = tag === 'schlussteil' ? (/ebene="([^"]+)"/.exec(attrs)?.[1] ?? null) : null
      if (currentAbs && t) closingHost(currentAbs, typ, ebene).children.push(makeNode('schluss', 'schluss', '', t))
      continue
    }

    if (tag === 'listelem') {
      const sym = SYMBOL_RE.exec(inner)
      const marker = sym ? text(sym[1]!) : ''
      const t = text(sym ? inner.replace(sym[0], ' ') : inner)
      const opens = ABS_Z_MARKER_RE.exec(marker)
      if (opens) {
        para()
        currentAbs = makeNode('abs', opens[1]!, `(${opens[1]})`, '')
        root!.children.push(currentAbs)
      }
      const z = opens ? ([opens[2]!, opens[2]!] as const) : Z_MARKER_RE.exec(marker)
      const lit = LIT_MARKER_RE.exec(marker) ?? LIT_DOT_MARKER_RE.exec(marker)
      const ebene = ebeneAt(m.index)
      // A dash or other unnumbered item one level below the Ziffer or
      // Litera before it is part of that item — filed as a Litera, the level
      // under it, which no address names by a dash.
      const sub = !z && !lit && lastItem !== null && lastItem.abs === absatz() && ebene !== null && lastItem.ebene !== null && ebene > lastItem.ebene
      const node = makeNode(z ? 'z' : lit || sub ? 'lit' : 'z', z?.[1] ?? lit?.[1] ?? marker.replace(/[.)]$/, ''), opens ? `${opens[2]}.` : marker, t)
      // Litera hang off the Ziffer above them, Ziffern off the Absatz.
      const host = sub ? lastItem!.node : node.level === 'lit' ? (lastChild(absatz(), 'z') ?? absatz()) : absatz()
      host.children.push(node)
      if (!sub) lastItem = { node, abs: absatz(), ebene }
      continue
    }

    // tag === 'absatz'
    //
    // `erltext` counts as law text only where nothing else does. An Anlage's
    // body is written as `<absatz typ="erltext" ct="text">` and it is binding:
    // "Die Messdauer hat mindestens sechs Monate zu betragen" is a provision
    // of the Radonschutzverordnung's Anlage 2, and read as metadata three
    // Anlagen of that one Verordnung parsed to nothing (2026-09-09).
    //
    // In a § that has proper Absätze the same tag carries something else, and
    // taking it as text glued it onto the last Absatz: 15 paragraphs the
    // engine had reproduced exactly then counted as incomplete, because an
    // instruction replacing that Absatz dropped the appended block. So the
    // fallback applies to the documents that need it and to no others.
    //
    // **Except an Absatz RIS typed as one** (26.10.2026): KommAustria-Gesetz
    // § 35 ends „(13) … </absatz><absatz typ="erltext">(14) Für die in der
    // KommAustria tätigen Mitglieder …" — a binding Absatz, and skipped here
    // every Lesefassung of § 35 lacked it. The annex's „(2) bis (14) …" named
    // it, and only the oracle's Absatz check saw the gap (`absatzOrderBroken`).
    // Over the 25.187 cached § documents with Absätze, 14 erltext blocks open
    // with an Absatz marker: 10 such Absätze (two Sparkassengesetz §§ with
    // (10) to (15)), and 4 that repeat a marker the § already has — a list
    // inside a schedule-like §, which stays out.
    //
    // **And an unmarked block behind an Absatz is that Absatz's closing
    // part** (19.11.2026). UStG 1994 § 21 Abs. 1 goes on after its first
    // block with three `erltext` blocks — „Der Bundesminister für Finanzen
    // kann durch Verordnung vorsehen, daß … entfällt", the Durchschriften,
    // the electronic Übermittlung — binding law, and skipped they were
    // missing from the oracle-confirmed Lesefassung of 338/ME XXVII: the
    // annex's „(1) bis (5) …" gave no check a word to miss. RIS's newer
    // converter writes the same sentences of the 2025 version as
    // `<schlussteil ebene="0">`, which this file has always read as the
    // Absatz's `schluss`; read that way here, both versions have one shape,
    // and an instruction that replaces the Absatz takes them along, as it
    // does a Schlussteil. Notes stay out (`erltextNote`), and so does an
    // unmarked block before the first Absatz: there it is a heading.
    //
    // A bare designation is the next list item, written on a line of its own
    // where its content opens with a list or a picture: „102." behind Z 101
    // with its Litera below (KStG § 26c), „n)" behind the `<listelem>` „m)"
    // (StVO § 54 Abs. 5). Read as the item the `<listelem>` would have
    // given, where it continues the level of the Absatz's last item; any
    // other lone designation („23." over Absätze, GewO § 376) has no place
    // in the tree and stays out, as before.
    //
    // So does a line that ends no sentence and stands right above a numbered
    // Absatz: „Steuerbefreiung und Steuersatz" over UStG § 24 Abs. 6 is that
    // Absatz's heading, upright `erltext` in the version of 2021 and italic
    // in that of 2025. A heading inside a § is no law text here
    // (`ueberschrift` above), and read in one version only it made the
    // Prüfstand score a § the engine had got right „halb angewendet".
    if (typ === 'erltext' && hasAbsaetze && notMistypedAbsatz(inner, root)) {
      const t = text(inner)
      if (!currentAbs || !t || ABS_MARKER_RE.test(t) || erltextNote(inner, t) || headsAbsatz(t, blocks[at + 1])) continue
      const z = Z_MARKER_RE.exec(t)
      const lit = LIT_MARKER_RE.exec(t) ?? LIT_DOT_MARKER_RE.exec(t)
      if (z || lit) {
        const level: NodeLevel = z ? 'z' : 'lit'
        if (lastItem?.abs === currentAbs && lastItem.node.level === level) {
          const node = makeNode(level, (z ?? lit)![1]!, t, '')
          ;(level === 'lit' ? (lastChild(currentAbs, 'z') ?? currentAbs) : currentAbs).children.push(node)
          lastItem = { node, abs: currentAbs, ebene: ebeneAt(m.index) }
        }
        continue
      }
      const node = makeNode('schluss', 'schluss', '', t)
      currentAbs.children.push(node)
      fromErltext.add(node)
      continue
    }
    if (typ !== 'abs' && typ !== 'satz' && typ !== '' && typ !== 'erltext') continue
    const gld = GLD_RE.exec(inner)
    const rest = text(gld ? inner.replace(gld[0], ' ') : inner)
    if (gld && root === null) {
      const marker = text(gld[1]!)
      root = makeNode('para', idMatch?.[1] ?? marker.replace(/^[§\s]*/, '').replace(/\.$/, ''), marker, '', heading)
      root.context = context
    }
    para()

    const am = ABS_MARKER_RE.exec(rest)
    if (am) {
      currentAbs = makeNode('abs', am[1]!, `(${am[1]})`, rest.slice(am[0].length))
      root!.children.push(currentAbs)
    } else if (currentAbs) {
      // A continuation paragraph of the same Absatz (Satz block) — and behind
      // a list its closing part. RIS writes the text that follows the
      // Ziffern of an Absatz as a plain `<absatz typ="abs">` as often as a
      // `<schlussteil>`; glued onto the Absatz's own text it stood IN FRONT
      // of the list it closes: „Durch Verordnung ist festzusetzen, Im Falle
      // von Testfahrten … 1. in welchen Verkehrssituationen, …" (KFG § 102
      // Abs. 3a, 27.09.2026) — the order on the page and the text every
      // Satz address and every phrase in it was looked for in.
      if (rest && currentAbs.children.length > 0) {
        const last = currentAbs.children.at(-1)!
        if (last.level === 'schluss' && last.id === 'schluss') last.text = `${last.text} ${rest}`.trim()
        else currentAbs.children.push(makeNode('schluss', 'schluss', '', rest))
      } else if (rest) currentAbs.text = `${currentAbs.text} ${rest}`.trim()
    } else if (rest) {
      // A § without Absatz numbering: the whole text is one implicit Absatz.
      absatz().text = rest
    }
  }
  // **A § whose units are not uniquely addressable is still not loaded.**
  // Only for documents with a table, and it is the second half of reading
  // them: the Gebührengesetz prints its Tarifposten as headings inside § 14
  // („8 Einreise- und Aufenthaltstitel"), so the § holds a dozen Absätze
  // „(2)" — one per Tarifpost — and „§ 14 Tarifpost 8 Abs. 2" would resolve
  // to the first of them and edit the wrong law. Where the designations do
  // not tell the units apart, the refusal is the right answer and stays.
  if (sawTable && root && !uniquelyAddressable(root)) return null
  // An `erltext` block the list goes on behind is no closing part: „b)
  // Gebotszeichen." heads the Ziffern of StVO § 52 that follow it, „Tarifpost
  // 4" the entries of GebG § 33. Filed as the Absatz's `schluss` it would be
  // the slot „Im Schlussteil" finds (`kons/lawApply.ts`, `sentenceSlots`);
  // under its own id it is text in its place, and no sentence of that
  // Absatz is counted across it.
  for (const node of fromErltext) {
    const host = root ? lawTextNodes(root).find((n) => n.children.includes(node)) : undefined
    if (host && host.children.slice(host.children.indexOf(node) + 1).some((c) => c.level !== 'schluss')) node.id = 'zwischentext'
  }
  return root
}

/**
 * Whether an `erltext` block in a § with Absätze is NOT an Absatz RIS
 * mistyped: it does not open with an Absatz marker the § lacks yet. Such a
 * block is a closing part, a note or a heading, decided where it is called.
 */
function notMistypedAbsatz(inner: string, root: LawNode | null): boolean {
  const am = /^\((\d+[a-z]?)\)\s/.exec(text(inner))
  return !am || !root || root.children.some((c) => c.level === 'abs' && c.id === am[1])
}

/** No two children of a node share a level and a designation. */
function uniquelyAddressable(node: LawNode): boolean {
  const seen = new Set<string>()
  for (const c of node.children) {
    if (c.level === 'schluss') continue
    const key = `${c.level}#${c.id}`
    if (c.id !== '' && seen.has(key)) return false
    seen.add(key)
    if (!uniquelyAddressable(c)) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Rendering and lookup
// ---------------------------------------------------------------------------

/** The tree back to plain text — the form the harness compares. */
export function renderNode(node: LawNode): string {
  const parts: string[] = []
  if (node.level === 'para') {
    if (node.heading) parts.push(node.heading)
    const [first, ...rest] = node.children
    if (first) parts.push(`${node.marker} ${renderNode(first)}`.trim())
    for (const c of rest) parts.push(renderNode(c))
    return parts.join('\n')
  }
  const own = `${node.marker} ${node.text}`.trim()
  return [own, ...node.children.map(renderNode)].join('\n')
}

/**
 * DISPLAY FORM of a §'s body — with the Gliederungsmarker, without the §
 * designation and without the Überschrift.
 *
 * Kept apart from `plainText`, and the difference is not taste: this file
 * knows two forms of the same text. The comparison form leaves „(1)", „3."
 * and „b)" out, because the Beilage sets them differently and a comparison
 * would otherwise fail on typography (`stripMarkers` in `kons/tguOracle.ts`
 * does the same on the other side). The display form needs them, because a
 * law text without Absatz numbers cannot be cited and two Absätze would
 * otherwise stand there as one running sentence — seen on the page on
 * 19.09.2026, where „so lautet der Paragraph dann" looked as if half of it
 * were missing.
 *
 * Without the § marker and without the Überschrift, because both already have
 * a place of their own on the page: the designation as the line above it, the
 * heading as its own word diff (`headingSegments` in `kons/konsService.ts`).
 */
export function bodyText(node: LawNode): string {
  return node.children.map(renderNode).join('\n')
}

/** Comparison form: text only, no markers, no whitespace differences. */
export function plainText(node: LawNode): string {
  const own = node.level === 'para' ? [node.heading ?? ''] : [node.text]
  return [...own, ...node.children.map(plainText)].join(' ').replace(/\s+/g, ' ').trim()
}

/** Every text-carrying node in the subtree, in printed order — the node itself first. */
export function lawTextNodes(node: LawNode): LawNode[] {
  return [node, ...node.children.flatMap(lawTextNodes)]
}

export function childById(node: LawNode, level: NodeLevel, id: string): LawNode | null {
  return node.children.find((c) => c.level === level && c.id === id) ?? null
}

/**
 * The one child an address names — null where two carry the designation.
 *
 * An Anlage that restarts its numbering under group headings
 * (Volksgruppengesetz Anlage 2: „1.", „2." under each of I., II.) holds two
 * Z 1 in one list, and „Z 1" found whichever came first (27.09.2026). Not
 * loading such a document at all cost 23 §§ of the Prüfstand whose
 * instructions never touch the repeated numbers; an address that does is
 * refused, and that is the whole of the danger.
 */
export function uniqueChild(node: LawNode, level: NodeLevel, id: string): LawNode | null {
  const found = node.children.filter((c) => c.level === level && c.id === id)
  return found.length === 1 ? found[0]! : null
}
