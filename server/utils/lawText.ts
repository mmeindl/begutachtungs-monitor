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
import { decodeEntities } from './mappers'

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
// Text normalisation
// ---------------------------------------------------------------------------

/** Typographic normalisation; keeps words, drops layout noise. */
export function normalizeText(t: string): string {
  return t
    .replace(/ /g, ' ')
    .replace(/[‑–‒]/g, '-')
    .replace(/­/g, '')
    .replace(/[„“”]/g, '"')
    .replace(/[‚‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A quoted § heading arrives inside the quotation marks of the instruction
 * that installs it ("§ 5 lautet samt Überschrift: \u0022Landesausspielungen\u0022").
 * The marks belong to the instruction, not to the heading — and the UI puts
 * its own around it, so leaving them nests two pairs.
 */
export function stripQuotes(t: string): string {
  return normalizeText(t).replace(/^["'\u00ab\u00bb\u2039\u203a\s]+|["'\u00ab\u00bb\u2039\u203a\s]+$/g, '')
}

/** Whitespace-insensitive comparison form (PDF and HTML render spaces differently). */
export function compareKey(t: string): string {
  return normalizeText(t).replace(/\s+/g, '')
}

function stripTags(html: string): string {
  return normalizeText(decodeEntities(html.replace(/<[^>]*>/g, ' ')))
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const KIND_BY_CLASS: Record<string, BlockKind> = {
  '45UeberschrPara': 'para_head',
  '51Abs': 'abs',
  '58Schlussteile0Abs': 'abs',
  '21NovAo1': 'novao',
  '22NovAo2': 'novao',
  '41UeberschrG1': 'article',
  '42UeberschrG1-': 'section',
  '43UeberschrG2': 'section',
  '11Titel': 'title',
}

/**
 * "Artikel 3" — the article marker. Which heading level carries it is not
 * fixed: 125/ME puts it in 43UeberschrG2 and the package title in
 * 41UeberschrG1, its Regierungsvorlage the other way round. So the text
 * decides, not the class — otherwise the articles never pair and every § of
 * the package reads as inserted.
 *
 * The X is a placeholder: a draft written for a collective act numbers its
 * articles "Artikel X1", "Artikel X2" because the final count is only known
 * once every ministry's draft is merged (22/ME, IFG-Anpassung of the BKA).
 */
const ARTICLE_RE = /^Artikel\s+(?:X?\d+|[IVXL]+)(?=\s|$|[.,])/

function kindOf(cls: string, text: string): BlockKind {
  const mapped = KIND_BY_CLASS[cls]
  if (mapped === 'article' || mapped === 'section') return ARTICLE_RE.test(text) ? 'article' : 'section'
  if (mapped) return mapped
  if (cls.startsWith('52') || cls.startsWith('53')) return 'ziff'
  if (cls.startsWith('3')) return 'toc'
  return 'other'
}

const P_RE = /<p\s+class=["']?([\w-]+)["']?[^>]*>([\s\S]*?)<\/p\s*>/gi
const GLD_RE = /<span\s+class=["']?991GldSymbol["']?[^>]*>([\s\S]*?)<\/span>/i

/** Word-filtered Parliament HTML → flat block list. Empty paragraphs are dropped. */
export function parseParliamentHtml(html: string): TextBlock[] {
  const bodyStart = html.search(/<body[^>]*>/i)
  const body = bodyStart >= 0 ? html.slice(bodyStart) : html
  const blocks: TextBlock[] = []
  for (const m of body.matchAll(P_RE)) {
    const cls = m[1]!
    const inner = m[2]!
    const gldMatch = GLD_RE.exec(inner)
    const gld = gldMatch ? stripTags(gldMatch[1]!) : null
    const text = stripTags(gldMatch ? inner.replace(gldMatch[0], ' ') : inner)
    if (!text && !gld) continue
    blocks.push({ kind: kindOf(cls, text), cls, text, gld: gld || null })
  }
  return blocks
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

/** "§ 5." → "§5"; "Artikel 3." → "Art.3" */
export function normalizeGld(g: string): string {
  return normalizeText(g).replace(/\s+/g, '').replace(/^Artikel/, 'Art.').replace(/\.$/, '')
}

const NOVAO_NUMBER_RE = /^(\d+)[a-z]?\.\s/

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
    switch (b.kind) {
      case 'article':
        articleNumber = b.text
        articleTitle = null
        novelleMode = false
        current = null
        pendingHeading = null
        continue
      case 'section':
        // The first heading after "Artikel n" is the article's law title.
        if (articleNumber && articleTitle === null) articleTitle = b.text
        continue
      case 'title':
        if (articleNumber === null) articleTitle = b.text
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

    if (b.kind === 'novao') {
      const m = NOVAO_NUMBER_RE.exec(b.text)
      if (m) {
        novelleMode = true
        // The Ziffer number goes into the id, not the compared text — like the § symbol.
        current = push(`Z${m[1]}`, novaoHeading(b.text), { ...b, text: b.text.replace(NOVAO_NUMBER_RE, '') })
        pendingHeading = null
        continue
      }
    }

    if (current) current.blocks.push(b)
  }

  for (const u of units) u.text = u.blocks.map((x) => x.text).join(' ')
  return units
}

/** Convenience: HTML → units. */
export function parseLawUnits(html: string): LawUnit[] {
  return segmentUnits(parseParliamentHtml(html))
}

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
 * earlier. `lawStructure.ts` had it from the start; this parser did not, and
 * the mismatch surfaced only when the two were compared against RIS
 * (Privatschulgesetz § 4, 2026-09-09).
 */
const RIS_BLOCK_RE = /<(ueberschrift|absatz|listelem|schlussteil|inhaltsvz)\b([^>]*)>([\s\S]*?)<\/\1>/g
const RIS_GLD_RE = /<gldsym>([\s\S]*?)<\/gldsym>/

function risText(inner: string): string {
  return stripTags(inner.replace(/<gdash\s*\/>/g, '-').replace(/<nbsp\s*\/>/g, ' '))
}

/** RIS Begut main-document XML → flat block list, same kinds as the Parliament HTML parser. */
export function parseRisXml(xml: string): TextBlock[] {
  const body = xml.replace(/<kzinhalt[\s\S]*?<\/kzinhalt>/g, '').replace(/<layoutdaten[\s\S]*?<\/layoutdaten>/g, '')
  // Blocks inside a table keep their kind (the ME→RV comparison reads cell
  // text like any other) but carry a `table:` prefix in `cls`, so the
  // amendment engine can refuse a payload that is a table.
  const tables = [...body.matchAll(/<table\b[\s\S]*?<\/table>/g)].map((t) => [t.index!, t.index! + t[0].length] as const)
  const inTable = (at: number): boolean => tables.some(([from, to]) => at >= from && at < to)
  const blocks: TextBlock[] = []
  for (const m of body.matchAll(RIS_BLOCK_RE)) {
    const tag = m[1]!
    const typ = /typ="([^"]+)"/.exec(m[2]!)?.[1] ?? ''
    const inner = m[3]!
    const gldMatch = RIS_GLD_RE.exec(inner)
    const gld = gldMatch ? risText(gldMatch[1]!) : null
    const text = risText(gldMatch ? inner.replace(gldMatch[0], ' ') : inner)
    if (!text && !gld) continue
    let kind: BlockKind
    if (tag === 'ueberschrift') {
      kind = RIS_HEADING_KIND[typ] ?? 'other'
      if (kind === 'article' || kind === 'section') kind = ARTICLE_RE.test(text) ? 'article' : 'section'
    } else if (tag === 'absatz') {
      if (typ === 'kz') continue
      kind = RIS_ABSATZ_KIND[typ] ?? 'other'
    } else if (tag === 'listelem') {
      kind = 'ziff'
    } else if (tag === 'schlussteil') {
      // Continuation of the Absatz that opened the list, not a unit of its
      // own — `parsePayload` and `segmentUnits` both append an unmarked
      // block to the Absatz above it, which is exactly right here.
      kind = 'abs'
    } else {
      kind = 'toc'
    }
    blocks.push({ kind, cls: `${inTable(m.index!) ? 'table:' : ''}${tag}/${typ}`, text, gld: gld || null })
  }
  return blocks
}

/** Convenience: RIS XML → units. */
export function parseLawUnitsFromRis(xml: string): LawUnit[] {
  return segmentUnits(parseRisXml(xml))
}
