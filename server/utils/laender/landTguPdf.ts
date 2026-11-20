/**
 * The page geometry `landTgu.ts` reads a Textgegenüberstellung from: the text
 * runs, the thin rules that underline or strike through them, and the glyphs
 * with their widths — from pdf.js's operator list, because the text layer
 * alone knows neither the rules nor where inside a run a character stands.
 */
import { withPdf, type PdfDocument } from '../text/pdfDocument'
import type { TguPage } from './landTgu'

/** A rule is a filled rectangle at most this high, and wider than a speck. */
const RULE_MAX_HEIGHT = 2.5
const RULE_MIN_WIDTH = 1.5

/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js's operator arguments */

type Matrix = [number, number, number, number, number, number]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
/** `m` applied first, then `n`. */
const times = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
]

/**
 * The text state of a page's operator list, as far as it says where a glyph
 * stands (20.11.2026): the text and line matrices, the font size, character
 * and word spacing, horizontal scale, and the transformation around them —
 * PDF 32000-1, 9.4.4. `show` answers a glyph's box in user space and moves
 * on by its advance; a number in a text array moves without drawing.
 *
 * Why: Word sets each stretch of a justified line with a matrix of its own
 * and its own gaps, and the text layer hands the line over as one run with
 * one width. Where the stretches meet — an underlined word run into a
 * struck one — a letter's place could only be estimated (`landTgu.ts`,
 * `placedCentres`).
 *
 * Only upright, unrotated text is answered; for anything else `show` says
 * nothing and the reader estimates as before.
 */
export function textState(OPS: any) {
  // What `q` saves and `Q` restores: the transformation and the text state's parameters, not the text matrices.
  let state = { ctm: IDENTITY, size: 0, charSpacing: 0, wordSpacing: 0, scale: 1, leading: 0 }
  const stack: (typeof state)[] = []
  let tm: Matrix = IDENTITY
  let line: Matrix = IDENTITY
  const move = (x: number, y: number) => {
    line = times([1, 0, 0, 1, x, y], line)
    tm = line
  }
  return {
    read(fn: number, args: any[]) {
      if (fn === OPS.save) stack.push({ ...state })
      else if (fn === OPS.restore) state = stack.pop() ?? state
      else if (fn === OPS.transform) state.ctm = times(args.slice(0, 6) as Matrix, state.ctm)
      else if (fn === OPS.beginText) tm = line = IDENTITY
      else if (fn === OPS.setFont) state.size = Number(args[1]) || 0
      else if (fn === OPS.setCharSpacing) state.charSpacing = Number(args[0]) || 0
      else if (fn === OPS.setWordSpacing) state.wordSpacing = Number(args[0]) || 0
      else if (fn === OPS.setHScale) state.scale = (Number(args[0]) || 100) / 100
      else if (fn === OPS.setLeading) state.leading = Number(args[0]) || 0
      else if (fn === OPS.setTextMatrix) tm = line = (Array.isArray(args[0]) || ArrayBuffer.isView(args[0]) ? Array.from(args[0] as ArrayLike<number>) : args).slice(0, 6) as Matrix
      else if (fn === OPS.moveText) move(Number(args[0]) || 0, Number(args[1]) || 0)
      else if (fn === OPS.setLeadingMoveText) {
        state.leading = -(Number(args[1]) || 0)
        move(Number(args[0]) || 0, Number(args[1]) || 0)
      } else if (fn === OPS.nextLine || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) move(0, -state.leading)
    },
    /** A glyph's box, or null for a number (an adjustment in 1/1000 of the font size) and for text that is not upright. */
    show(g: any): { u: string; x: number; w: number; y: number } | null {
      const { ctm, size, charSpacing, wordSpacing, scale } = state
      if (typeof g === 'number') {
        tm = times([1, 0, 0, 1, (-g / 1000) * size * scale, 0], tm)
        return null
      }
      if (!g || typeof g !== 'object') return null
      const own = ((Number(g.width) || 0) / 1000) * size
      const advance = (own + charSpacing + (g.isSpace ? wordSpacing : 0)) * scale
      const at = times(tm, ctm)
      tm = times([1, 0, 0, 1, advance, 0], tm)
      const upright = Math.abs(at[1]) < 1e-6 && Math.abs(at[2]) < 1e-6 && at[0] > 0 && size > 0
      return upright && typeof g.unicode === 'string' ? { u: g.unicode, x: at[4], w: own * scale * at[0], y: at[5] } : null
    },
  }
}
export async function tguPages(bytes: Uint8Array): Promise<TguPage[]> {
  return withPdf(bytes, pagesOfDocument)
}

async function pagesOfDocument(doc: PdfDocument): Promise<TguPage[]> {
  const { getResolvedPDFJS } = await import('unpdf')
  const { OPS } = (await getResolvedPDFJS()) as any
  const showText = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText])
  const pages: TguPage[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const ops = await page.getOperatorList()
    const rules: TguPage['rules'] = []
    const glyphs: TguPage['glyphs'] = []
    const boxes: NonNullable<TguPage['boxes']> = []
    const text = textState(OPS)
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i]
      const args = ops.argsArray[i] as any[]
      text.read(fn as number, args ?? [])
      if (fn === OPS.constructPath) {
        // pdf.js ≥ 4.x: [op, data, minMax]; the bounding box is the last argument.
        const box = args.at(-1)
        if (!box || box.length !== 4) continue
        const [x0, y0, x1, y1] = Array.from(box as ArrayLike<number>) as [number, number, number, number]
        if (Math.abs(y1 - y0) < RULE_MAX_HEIGHT && Math.abs(x1 - x0) > RULE_MIN_WIDTH) {
          rules.push([Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)])
        }
      } else if (showText.has(fn)) {
        for (const g of (args.at(-1) as any[]) ?? []) {
          if (g && typeof g === 'object' && typeof g.unicode === 'string') glyphs.push({ u: g.unicode, w: g.width ?? 0 })
          const box = text.show(g)
          if (box) boxes.push(box)
        }
      }
    }
    const content = await page.getTextContent()
    const items = (content.items as any[])
      .filter((it) => typeof it.str === 'string' && it.str.length)
      .map((it) => ({ s: it.str as string, x: it.transform[4] as number, y: it.transform[5] as number, w: it.width as number, h: (it.height as number) || 10 }))
    pages.push({ items, rules, glyphs, boxes })
    // The operator list of a long document is the bulk of its memory.
    page.cleanup()
  }
  // Ended by `withPdf`, not only cleaned up: nothing returned holds a pdf.js object.
  return pages
}
