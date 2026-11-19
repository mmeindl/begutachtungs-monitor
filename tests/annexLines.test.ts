import { describe, expect, it } from 'vitest'
import { lineAccounting } from '../scripts/lib/annexLines'
import type { AnnexItem, AnnexPage } from '../server/utils/annex/annexPdf'
import { comparisonRow as row } from './helpers/builders'

/** The harness's line accounting (audit A5, 19.11.2026): text of the annex that reaches no row. */
const CHAR = 5
const run = (x: number, y: number, text: string): AnnexItem => ({ x, y, width: text.length * CHAR, text })
function page(lines: { y: number; left?: string; right?: string }[], width = 842): AnnexPage {
  const items: AnnexItem[] = []
  for (const l of lines) {
    if (l.left) items.push(run(60, l.y, l.left))
    if (l.right) items.push(run(470, l.y, l.right))
  }
  return { width, items, geometry: { runs: items.length, offTurn: 0, skewed: 0 } }
}

describe('lineAccounting', () => {
  const pages = [page([
    { y: 700, left: '§ 3. (9) Anfragen sind binnen vier Wochen zu beantworten.', right: '§ 3. (9) Anfragen sind binnen zwei Wochen zu beantworten.' },
    { y: 686, right: '(12) Der Fiskalrat ist alle fünf Jahre extern zu evaluieren.' },
  ])]

  it('finds nothing lost where every line reaches a row of its column', () => {
    const rows = [row({ gld: '§ 3.', current: '§ 3. (9) Anfragen sind binnen vier Wochen zu beantworten.', proposed: '§ 3. (9) Anfragen sind binnen zwei Wochen zu beantworten. (12) Der Fiskalrat ist alle fünf Jahre extern zu evaluieren.' })]
    expect(lineAccounting([pages], rows)).toEqual({ lost: 0, differing: [], apart: 0 })
  })

  // FPRG 2021 § 3: the parse kept one print of § 3 and the new Abs. 12 was
  // in no row; every harness stayed green.
  it('names a line of one column that reaches no row', () => {
    const rows = [row({ gld: '§ 3.', current: '§ 3. (9) Anfragen sind binnen vier Wochen zu beantworten.', proposed: '§ 3. (9) Anfragen sind binnen zwei Wochen zu beantworten.' })]
    const account = lineAccounting([pages], rows)
    expect(account.lost).toBe(1)
    expect(account.differing).toEqual([{ page: 1, side: 'R', text: '(12) Der Fiskalrat ist alle fünf Jahre extern zu evaluieren.' }])
  })

  it('counts the lines of a part set on other paper apart', () => {
    const apart = [page([{ y: 700, left: 'Abwassermengenmessung mit offenen Gerinnen nach DIN 19559' }], 595)]
    const rows = [row({ gld: '§ 3.', current: '§ 3. (9) Anfragen sind binnen vier Wochen zu beantworten.', proposed: '§ 3. (9) Anfragen sind binnen zwei Wochen zu beantworten. (12) Der Fiskalrat ist alle fünf Jahre extern zu evaluieren.' })]
    expect(lineAccounting([pages, apart], rows)).toEqual({ lost: 0, differing: [], apart: 1 })
  })
})
