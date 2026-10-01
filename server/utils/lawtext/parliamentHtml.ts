/**
 * Parliament's Word-filtered Gesetzestext HTML → flat blocks.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. The RIS
 * side of the same job is `lawtext/risXml.ts`; both feed `lawtext/lawUnits.ts`.
 */
import type { BlockKind, TextBlock } from './lawUnits'
import { stripTags } from './normalize'
import { ARTICLE_LINE_RE, ARTICLE_RE, refineArticleHeadings } from './articleHeadings'

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
  if (mapped === 'article' || mapped === 'section') return ARTICLE_RE.test(text) ? 'article' : 'section'
  if (mapped) return mapped
  if (cls.startsWith('52') || cls.startsWith('53')) return 'ziff'
  if (cls.startsWith('3')) return 'toc'
  return 'other'
}

const P_RE = /<p\s+class=["']?([\w-]+)["']?[^>]*>([\s\S]*?)<\/p\s*>/gi
const GLD_RE = /<span\s+class=["']?991GldSymbol["']?[^>]*>([\s\S]*?)<\/span>/i
const BR_RE = /<br\b[^>]*>/i

/**
 * „Artikel 1<br>Bundesgesetz über die Prüfung lohnabhängiger Abgaben und
 * Beiträge (PLABG)" — the Artikel line and the law's name in ONE paragraph,
 * split by a line break. The Regierungsvorlage of the same text sets them as
 * two paragraphs (`41UeberschrG1` „Artikel 1", `43UeberschrG2` the name), and
 * that is the shape both name windows read (`segmentUnits`, `draftArticles`):
 * the Artikel line, then its name as a `section`.
 *
 * Read as one block, the name was part of the Artikel line, and the window
 * took the first heading *after* it as the law's name — for a new law that is
 * its first Abschnitt. XXVI 77/ME called its PLABG „1. Abschnitt Prüfdienst
 * für lohnabhängige Abgaben und Beiträge", and its 26 §§ stood under ME → RV
 * as removed and again as new (docs/architecture.md §12.18, 02.10.2026).
 * For an amending Artikel no heading follows before the first instruction,
 * so its key was the whole line („Artikel 2 Änderung des
 * Einkommensteuergesetzes 1988") and paired by the name inside it.
 *
 * Split only where the part before the break is a bare Artikel line: an
 * Abschnitt heading („1. Abschnitt<br>Prüfdienst …") stays one block, and an
 * Artikel quoted in amendment text opens with the quotation mark. The second
 * block keeps the paragraph's class; it is the name and nothing else.
 */
function articleNameSplit(cls: string, inner: string): [string, string] | null {
  const mapped = KIND_BY_CLASS[cls]
  if (mapped !== 'article' && mapped !== 'section') return null
  const br = BR_RE.exec(inner)
  if (!br) return null
  const line = stripTags(inner.slice(0, br.index))
  const name = stripTags(inner.slice(br.index + br[0].length))
  return ARTICLE_LINE_RE.test(line) && name ? [line, name] : null
}

/**
 * Word-filtered Parliament HTML → flat block list. Empty paragraphs are
 * dropped, an Artikel line with its name behind a line break becomes two
 * blocks (`articleNameSplit`); the Artikel headings a class alone cannot show
 * are marked by `refineArticleHeadings`.
 */
export function parseParliamentHtml(html: string): TextBlock[] {
  const bodyStart = html.search(/<body[^>]*>/i)
  const body = bodyStart >= 0 ? html.slice(bodyStart) : html
  const blocks: TextBlock[] = []
  for (const m of body.matchAll(P_RE)) {
    const cls = m[1]!
    const inner = m[2]!
    const gldMatch = GLD_RE.exec(inner)
    const split = gldMatch ? null : articleNameSplit(cls, inner)
    if (split) {
      blocks.push({ kind: 'article', cls, text: split[0], gld: null }, { kind: 'section', cls, text: split[1], gld: null })
      continue
    }
    const gld = gldMatch ? stripTags(gldMatch[1]!) : null
    const text = stripTags(gldMatch ? inner.replace(gldMatch[0], ' ') : inner)
    if (!text && !gld) continue
    blocks.push({ kind: kindOf(cls, text), cls, text, gld: gld || null })
  }
  return refineArticleHeadings(blocks)
}
