/**
 * The page geometry `landTgu.ts` reads a Textgegenüberstellung from: the text
 * runs, the thin rules that underline or strike through them, and the glyphs
 * with their widths — from pdf.js's operator list, because the text layer
 * alone knows neither the rules nor where inside a run a character stands.
 */
import type { TguPage } from './landTgu'

/** A rule is a filled rectangle at most this high, and wider than a speck. */
const RULE_MAX_HEIGHT = 2.5
const RULE_MIN_WIDTH = 1.5

/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js's operator arguments */
export async function tguPages(bytes: Uint8Array): Promise<TguPage[]> {
  const { getDocumentProxy, getResolvedPDFJS } = await import('unpdf')
  const { OPS } = (await getResolvedPDFJS()) as any
  const showText = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText])
  const doc = await getDocumentProxy(bytes)
  const pages: TguPage[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const ops = await page.getOperatorList()
    const rules: TguPage['rules'] = []
    const glyphs: TguPage['glyphs'] = []
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i]
      const args = ops.argsArray[i] as any[]
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
        }
      }
    }
    const content = await page.getTextContent()
    const items = (content.items as any[])
      .filter((it) => typeof it.str === 'string' && it.str.length)
      .map((it) => ({ s: it.str as string, x: it.transform[4] as number, y: it.transform[5] as number, w: it.width as number, h: (it.height as number) || 10 }))
    pages.push({ items, rules, glyphs })
    // The operator list of a long document is the bulk of its memory.
    page.cleanup()
  }
  // Ended, not only cleaned up — nothing returned holds a pdf.js object — as
  // unpdf ends every document it opens itself (`withDocument`). The proxy
  // has no `destroy()` of its own in this pdf.js.
  await doc.loadingTask.destroy()
  return pages
}
