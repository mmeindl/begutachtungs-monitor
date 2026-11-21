import { describe, expect, it } from 'vitest'
import { pagesOfBytes } from '../server/utils/laender/texts/read'

/**
 * A one-page PDF of text runs, each set at its own place and size — the
 * smallest document that carries what the reader is to see in the page's
 * geometry (Helvetica, no embedded font).
 */
function pdfOf(runs: { x: number; y: number; size: number; text: string }[]): Uint8Array {
  const content = runs.map((r) => `BT /F1 ${r.size} Tf ${r.x} ${r.y} Td (${r.text.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

/** Where a run of `text` at `size` ends, in Helvetica: digits and „,", „€" are 0.556 em, „)" 0.333. */
const after = (x: number, size: number, text: string) => x + [...text].reduce((w, c) => w + (c === ')' || c === '(' ? 0.333 : c === ',' || c === '.' ? 0.278 : 0.556), 0) * size

// Salzburg sbg-33547 Z 1 and sbg-31419 § 1 (20.11.2026): the draft's PDF
// sets the footnote mark after an amount at 6.5 points, 3.5 above the
// line; the text layer joined it to the amount, „35,821)", where the
// Landesgesetzblatt's XML sets it in <sup> and so apart, „35,82 1)".
describe('pagesOfBytes — a mark set smaller and raised is a word of its own', () => {
  it('sets a footnote mark apart from the amount it stands after', async () => {
    const pages = await pagesOfBytes(pdfOf([
      { x: 100, y: 700, size: 10, text: '35,82' },
      { x: after(100, 10, '35,82'), y: 703.5, size: 6.5, text: '1)' },
    ]))
    expect(pages[0]).toContain('35,82 1)')
  })

  // ktn-79014-2025-14: the Entwurf types „m2", the Vorlage sets the 2 raised.
  it('keeps a raised exponent with its unit: drafts type it on the line as often', async () => {
    const pages = await pagesOfBytes(pdfOf([
      { x: 100, y: 700, size: 10, text: '200 m' },
      { x: 125.6, y: 703.5, size: 6.5, text: '2' },
    ]))
    expect(pages[0]).toContain('200 m2')
  })

  it('welds a lowered index to its word, as <sub> is welded', async () => {
    const pages = await pagesOfBytes(pdfOf([
      { x: 100, y: 700, size: 10, text: 'CO' },
      { x: 114.4, y: 697.5, size: 6.5, text: '2' },
    ]))
    expect(pages[0]).toContain('CO2')
  })
})
