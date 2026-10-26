/**
 * A PDF's pages as `pdfPages` reads them — the text runs joined, a line
 * closed where pdf.js marks its end — and for each line whether all of it
 * is set in a bold font (23.10.2026). Wien sets the headings of its
 * Erläuterungen unnumbered — „Ziel und Inhalt der Novelle", „Begründung" —
 * and only their weight tells them from the prose (`parseLandExplanations`).
 *
 * pdf.js knows a run's font by name only once the page's operators are read
 * (`fontExtraProperties`); measured on Wien's five drafts of 2026, that
 * costs about as much again as the text alone, 16–128 ms a document.
 */

export interface StyledPages {
  pages: string[]
  /** Per page, per line of `pages[n].split('\n')`: whether every glyph of it is set in bold. */
  bold: boolean[][]
}

/** Fonts a document sets in bold: „TimesNewRomanPS-BoldMT", „Arial,Bold", „Calibri-Semibold". */
const BOLD_FONT_RE = /bold|black|heavy|semibold|demi/i

/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js's text runs and font objects */
export async function styledPages(bytes: Uint8Array): Promise<StyledPages> {
  const { getDocumentProxy } = await import('unpdf')
  const doc = await getDocumentProxy(bytes, { fontExtraProperties: true })
  const pages: string[] = []
  const bold: boolean[][] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    await page.getOperatorList()
    const fontIsBold = new Map<string, boolean>()
    const isBold = (fontName: string) => {
      if (!fontIsBold.has(fontName)) {
        let name = ''
        try {
          name = (page.commonObjs as any).get(fontName)?.name ?? ''
        } catch {
          // A font pdf.js did not load: not known to be bold.
        }
        fontIsBold.set(fontName, BOLD_FONT_RE.test(name))
      }
      return fontIsBold.get(fontName)!
    }
    const content = await page.getTextContent()
    let text = ''
    const lines: boolean[] = []
    let line: boolean | null = null
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string') continue
      text += item.str + (item.hasEOL ? '\n' : '')
      if (item.str.trim()) line = (line ?? true) && isBold(item.fontName)
      if (item.hasEOL) {
        lines.push(line === true)
        line = null
      }
    }
    lines.push(line === true)
    pages.push(text)
    bold.push(lines)
    // The operator list of a long document is the bulk of its memory (`landTguPdf.ts`).
    page.cleanup()
  }
  // Ended, not only cleaned up — nothing returned holds a pdf.js object — and
  // the way unpdf ends every document it opens itself (`withDocument`).
  await doc.loadingTask.destroy()
  return { pages, bold }
}
