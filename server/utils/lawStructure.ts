/**
 * The standing law as an addressable tree (docs/architecture.md §12.12).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * RIS `BrKons` publishes consolidated law **one document per paragraph**,
 * with a validity interval on each version (docs/api-exploration.md §2a).
 * This module turns one such document into the tree a Novellierungsanordnung
 * addresses: § → Absatz → Ziffer/Litera, plus the Schlussteil that trails a
 * list. `lawApply.ts` operates on that tree; nothing here changes anything.
 */
import { normalizeText } from './lawText'

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

const STRIP = [/<kzinhalt[\s\S]*?<\/kzinhalt>/g, /<fzinhalt[\s\S]*?<\/fzinhalt>/g, /<layoutdaten[\s\S]*?<\/layoutdaten>/g]
const BLOCK_RE = /<(ueberschrift|absatz|listelem|schlussteil)\b([^>]*)>([\s\S]*?)<\/\1>/g
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

function text(inner: string): string {
  return normalizeText(
    inner
      .replace(ANNOTATION_RE, ' ')
      .replace(/<gdash\s*\/>/g, '-')
      .replace(/<nbsp\s*\/>/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&auml;/g, 'ä')
      .replace(/&ouml;/g, 'ö')
      .replace(/&uuml;/g, 'ü')
      .replace(/&Auml;/g, 'Ä')
      .replace(/&Ouml;/g, 'Ö')
      .replace(/&Uuml;/g, 'Ü')
      .replace(/&szlig;/g, 'ß')
      .replace(/&sect;/g, '§')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&'),
  )
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
  const idMatch = /(?:§|Art\.?|Artikel|Anlage)\s*([\d]+[a-z]*(?:\.\d+)?)/i.exec(idText)

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

    if (tag === 'schlussteil') {
      const t = text(inner)
      if (currentAbs && t) currentAbs.children.push(makeNode('schluss', 'schluss', '', t))
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
      const host = node.level === 'lit' ? ([...absatz().children].reverse().find((c) => c.level === 'z') ?? absatz()) : absatz()
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

/** Comparison form: text only, no markers, no whitespace differences. */
export function plainText(node: LawNode): string {
  const own = node.level === 'para' ? [node.heading ?? ''] : [node.text]
  return [...own, ...node.children.map(plainText)].join(' ').replace(/\s+/g, ' ').trim()
}

/** Direct child at `level` with `id`, or null. */
export function childById(node: LawNode, level: NodeLevel, id: string): LawNode | null {
  return node.children.find((c) => c.level === level && c.id === id) ?? null
}
