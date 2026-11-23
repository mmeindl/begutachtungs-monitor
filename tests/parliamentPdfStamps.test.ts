/**
 * Parliament's margin stamps come off its PDF copy before the geometry reads
 * it, and nothing else does: the same words inside a column are the law's.
 */
import { describe, expect, it } from 'vitest'
import type { AnnexItem, AnnexPage } from '../server/utils/annex/annexPdf'
import { withoutParliamentStamps } from '../server/utils/annex/parliamentPdfStamps'

const item = (x: number, text: string): AnnexItem => ({ x, y: 300, width: 50, text, size: 9 })
const page = (items: AnnexItem[], offTurn: number): AnnexPage => ({ width: 841.92, items, geometry: { runs: items.length, offTurn, skewed: 0 } })

const STAMPS = [
  item(815, '3 von 26'),
  item(815, '10 der Beilagen XXVIII. GP - Regierungsvorlage - Textgegenüberstellung'),
  item(15, 'www.parlament.gv.at'),
]

describe('withoutParliamentStamps', () => {
  it('takes the three stamps off and counts them out of the frame check', () => {
    const body = [item(70, '§ 2. (1) Der Haushalt'), item(450, '§ 2. (1) Der Haushalt')]
    const [out] = withoutParliamentStamps([page([...STAMPS, ...body], 3)])
    expect(out!.items).toEqual(body)
    expect(out!.geometry).toEqual({ runs: 2, offTurn: 0, skewed: 0 })
  })

  it('keeps the same words where they stand inside a column', () => {
    const body = [item(70, '3 von 26'), item(450, 'www.parlament.gv.at')]
    const input = page(body, 0)
    expect(withoutParliamentStamps([input])[0]).toBe(input)
  })

  it('keeps other text in the margin', () => {
    const margin = [item(15, 'Randnotiz'), item(815, '26')]
    const input = page(margin, 0)
    expect(withoutParliamentStamps([input])[0]).toBe(input)
  })

  it('never leaves a negative count of turned runs', () => {
    const [out] = withoutParliamentStamps([page([...STAMPS, item(70, 'Text')], 1)])
    expect(out!.geometry.offTurn).toBe(0)
  })
})
