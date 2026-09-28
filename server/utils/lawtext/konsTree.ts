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
const BLOCK_RE = /<(ueberschrift|absatz|listelem|schlussteil|schluss|table)\b([^>]*)>([\s\S]*?)<\/\1>/g
const GLD_RE = /<gldsym>([\s\S]*?)<\/gldsym>/
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
 * the Ziffer like every other one. Protocol: docs/architecture.md §12.13.
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
  // A table has no place in the tree (§ → Abs → Z → lit): its cells carry
  // their own `<absatz>` blocks, and read in document order they become
  // Absätze of the §. The whole document used to be dropped for that (NEHG
  // §§ 24, 26, 27, 2026-09-09), which took its prose with it — 693 of 20.419
  // fetched documents in 151 of 607 laws, and a § that is not loaded can
  // never be shown either (26.09.2026, §12.12).
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
  // address (§12.12a, 25.09.2026), it would have been a wrong § with a
  // correct-looking text. „Anlage 5 zu § 14" is NOT this shape — the § there
  // is a cross-reference and the Anlage keeps its own number — so the § is
  // read only where it stands directly behind the Artikel.
  const artikelPara = /^\s*Art(?:\.|ikel)?\s*[\dIVXLCDM]+\s*§+\s*(\d+[a-z]*(?:\.\d+)?)/i.exec(idText)
  // `Anl\.?` and not only „Anlage": RIS writes a schedule's Gliederungssymbol
  // as **„Anl. 1"**, and the word this read was the one an INSTRUCTION uses.
  // So every Anlage of every law arrived with the id „?" — its 41 Ziffern
  // parsed and unreachable, because `findParagraph` looks a § up by that id.
  // Measured on the Anhang of the Bundesgesetzes gegen den unlauteren
  // Wettbewerb (26.09.2026): id „?", marker „Anl. 1", 41 Ziffern.
  const idMatch = artikelPara ?? /(?:§|Art\.?|Artikel|Anl(?:age)?\.?)\s*([\d]+[a-z]*(?:\.\d+)?)/i.exec(idText)
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

  for (const m of body.matchAll(BLOCK_RE)) {
    const tag = m[1]!
    const attrs = m[2]!
    const inner = m[3]!
    // A `<table>` carries no `ct`, and it is the one block read for its text
    // rather than for its structure.
    if (tag !== 'table' && !/ct="text"/.test(attrs)) continue
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
      if (typ === 'para') heading = text(inner)
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
      const node = makeNode(z ? 'z' : lit ? 'lit' : 'z', z?.[1] ?? lit?.[1] ?? marker.replace(/[.)]$/, ''), opens ? `${opens[2]}.` : marker, t)
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
  return root
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
