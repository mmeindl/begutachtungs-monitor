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
  /** "§5", "Art.3" or "Z4" (Novellierungsanordnung number) */
  id: string
  /** The § heading (45UeberschrPara) when present */
  heading: string | null
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

function kindOf(cls: string, text: string): BlockKind {
  const mapped = KIND_BY_CLASS[cls]
  if (mapped === 'article') return /^Artikel\s+\d+/.test(text) ? 'article' : 'section'
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
    const unit: LawUnit = { article, id: finalId, heading, text: first.text, blocks: [first] }
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
        pendingHeading = b.text
        continue
      default:
        break
    }

    if (b.gld) {
      const id = normalizeGld(b.gld)
      if (novelleMode && current) {
        // A quoted § inside a Novellierungsanordnung stays in the Z unit.
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
        current = push(`Z${m[1]}`, null, b)
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
