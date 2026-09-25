/**
 * The standing law as an addressable tree (docs/architecture.md §12.12).
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
 * §§ this cost, and the document-order measurement behind it (15.290 of
 * 15.510 representable documents in order, against 14.906, none short of
 * text any more), are in docs/architecture.md §12.13.
 * `lawtext/risXml.ts` reads both names for the same reason, on the other
 * kind of document.
 */
const BLOCK_RE = /<(ueberschrift|absatz|listelem|schlussteil|schluss)\b([^>]*)>([\s\S]*?)<\/\1>/g
const GLD_RE = /<gldsym>([\s\S]*?)<\/gldsym>/
const SYMBOL_RE = /<symbol\b[^>]*>([\s\S]*?)<\/symbol>/
/** "(2) " opens an Absatz; "(2a)" and "(2b)" are legal too. */
const ABS_MARKER_RE = /^\((\d+[a-z]*)\)\s*/
/** "3." opens a Ziffer, "b)" a Litera. */
const Z_MARKER_RE = /^(\d+[a-z]*)\.$/
const LIT_MARKER_RE = /^([a-z]{1,2})\)$/

/**
 * RIS prints its own editorial notes into the consolidated text, in italics:
 * "(Anm.: Abs. 2 aufgehoben durch Art. 1 Z 21, BGBl. I Nr. 68/2025)", "(Anm.:
 * lit. c aufgehoben durch …)". They are not law, no Novelle can address them,
 * and one that stood behind Abs. 1 without a marker of its own was folded
 * into Abs. 1 — so "§ 40d Abs. 1 lautet:" wiped it while RIS kept it, and
 * the harness called that a divergence (BGBl. I Nr. 68/2025, 2026-09-09).
 * Stripped from every block; an Absatz that consisted of one keeps its
 * marker and an empty text.
 */
const ANNOTATION_RE = /\(Anm\.:[^()]*(?:\([^()]*\)[^()]*)*\)/g

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
function text(inner: string): string {
  return normalizeText(
    decodeEntities(
      stripMarkup(
        inner
          .replace(ANNOTATION_RE, ' ')
          .replace(/<gdash\s*\/>/g, '-')
          .replace(/<nbsp\s*\/>/g, ' '),
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
 * and in every one of those it was empty before (docs/architecture.md
 * §12.13).
 *
 * **Measured and deliberately not done.** `<schlussteil>` carries the same
 * information in `ebene` — 0 and 0.5 for
 * the Absatz (4.792 blocks), 1 for the Ziffer (2.640), 2 and deeper for the
 * Litera (587) — and using it takes the documents whose `plainText` is still
 * out of document order from 220 to 121. It is *not* used, because it would
 * also empty the Absatz-level Schlussteil slot in 2.352 documents,
 * and whether the 406 `ebene="1"` clauses that *end* their list close the
 * Ziffer or the Absatz is exactly the question `ebene` cannot answer on its
 * own. That needs the amendment engine's harness over a corpus, not this
 * module — the consolidation engine and its corpus measurements are
 * docs/architecture.md §12.12.
 */
function closingHost(abs: LawNode, typ: string): LawNode {
  const depth = /^e(\d+)$/i.exec(typ)
  const level: NodeLevel = depth ? (Number(depth[1]) >= 2 ? 'lit' : 'z') : /^ziff$/i.test(typ) ? 'z' : /^lit$/i.test(typ) ? 'lit' : 'abs'
  if (level === 'abs') return abs
  const z = lastChild(abs, 'z')
  if (z === null) return abs
  return level === 'z' ? z : (lastChild(z, 'lit') ?? z)
}

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
  // A table has no place in the tree (§ → Abs → Z → lit); its cells would
  // be read as Absätze in document order and any instruction on the § would
  // edit a text that is not the law's. Not representable, so not loaded —
  // every instruction on such a § is then refused as "nicht im geltenden
  // Text" (NEHG §§ 24, 26, 27, BGBl. I Nr. 60/2024, 2026-09-09).
  if (/<table\b/.test(body)) return null

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
  // address (§12.12a, 25.09.2026), it would have been a wrong § with a
  // correct-looking text. „Anlage 5 zu § 14" is NOT this shape — the § there
  // is a cross-reference and the Anlage keeps its own number — so the § is
  // read only where it stands directly behind the Artikel.
  const artikelPara = /^\s*Art(?:\.|ikel)?\s*[\dIVXLCDM]+\s*§+\s*(\d+[a-z]*(?:\.\d+)?)/i.exec(idText)
  const idMatch = artikelPara ?? /(?:§|Art\.?|Artikel|Anlage)\s*([\d]+[a-z]*(?:\.\d+)?)/i.exec(idText)

  let root: LawNode | null = null
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

  for (const m of body.matchAll(BLOCK_RE)) {
    const tag = m[1]!
    const attrs = m[2]!
    const inner = m[3]!
    if (!/ct="text"/.test(attrs)) continue
    const typ = /typ="([^"]+)"/.exec(attrs)?.[1] ?? ''

    if (tag === 'ueberschrift') {
      // The § heading is the one marked as such. Letting a group heading
      // stand in for it gave a § the name of the Abschnitt above it — a wrong
      // name, and a wrong name on someone's paragraph is worse than none.
      if (typ === 'para') heading = text(inner)
      else if (root === null) {
        const t = text(inner)
        if (t) context.push(t)
      }
      continue
    }

    if (tag === 'schlussteil' || tag === 'schluss') {
      const t = text(inner)
      if (currentAbs && t) closingHost(currentAbs, typ).children.push(makeNode('schluss', 'schluss', '', t))
      continue
    }

    if (tag === 'listelem') {
      const sym = SYMBOL_RE.exec(inner)
      const marker = sym ? text(sym[1]!) : ''
      const t = text(sym ? inner.replace(sym[0], ' ') : inner)
      const z = Z_MARKER_RE.exec(marker)
      const lit = LIT_MARKER_RE.exec(marker)
      const node = makeNode(z ? 'z' : lit ? 'lit' : 'z', z?.[1] ?? lit?.[1] ?? marker.replace(/[.)]$/, ''), marker, t)
      // Litera hang off the Ziffer above them, Ziffern off the Absatz.
      const host = node.level === 'lit' ? (lastChild(absatz(), 'z') ?? absatz()) : absatz()
      host.children.push(node)
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
    if (typ === 'erltext' && hasAbsaetze) continue
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
      // A continuation paragraph of the same Absatz (Satz block).
      if (rest) currentAbs.text = `${currentAbs.text} ${rest}`.trim()
    } else if (rest) {
      // A § without Absatz numbering: the whole text is one implicit Absatz.
      absatz().text = rest
    }
  }
  return root
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
 * designation and without the Überschrift (docs/architecture.md §12.12a).
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
