/**
 * Parliament's Word-filtered Gesetzestext HTML → flat blocks.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. The RIS
 * side of the same job is `lawtext/risXml.ts`; both feed `lawtext/lawUnits.ts`.
 */
import type { BlockKind, TextBlock } from './lawUnits'
import { stripTags } from './normalize'

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
export const ARTICLE_RE = /^Artikel\s+(?:X?\d+|[IVXL]+)(?=\s|$|[.,])/

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
