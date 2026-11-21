import { describe, expect, it } from 'vitest'
import type { ConsolidatedParagraph, ConsolidatedTextResponse, ConsolidatedWithheld } from '#shared/types'
import { oracleConfirmedRows, type AnnexJoinRow } from '#shared/utils/annexOutcomes'

/** A pair row of § `para`, after the draft under `after`. */
const row = (para: string, over: Partial<AnnexJoinRow> = {}): AnnexJoinRow => ({ kind: 'pair', law: null, gld: para, para, paraAfter: para, elided: false, ...over })
const shown = (id: string, over: Partial<ConsolidatedParagraph> = {}): ConsolidatedParagraph => ({ id, segments: [], headingSegments: null, risUrl: null, annexLaw: null, ...over })
const held = (id: string): ConsolidatedWithheld => ({ id, annexLaw: null, cause: 'anhang-widerspricht' })
const response = (paragraphs: ConsolidatedParagraph[], withheld: ConsolidatedWithheld[] = []): ConsolidatedTextResponse => ({ gp: null, inr: null, risId: 'X', paragraphs, withheld, touched: paragraphs.length + withheld.length, notRun: null })

describe('oracleConfirmedRows: the §§ of the annex the oracle confirmed, joined as the page joins them', () => {
  it('takes every row of a § shown without the second witness, and no other', () => {
    const rows = [row('§ 1.'), row('§ 1.', { gld: null }), row('§ 2.'), row('§ 3.')]
    const out = oracleConfirmedRows(rows, response([shown('1'), shown('2', { draftWitness: [{ annex: 'a', draft: 'b' }] })], [held('3')]))!
    expect([...out]).toEqual([rows[0], rows[1]])
  })

  it('finds a renumbered § under the number it carries after the draft', () => {
    const rows = [row('§ 14.', { paraAfter: '§ 22.' }), row('§ 22.', { paraAfter: null })]
    expect([...oracleConfirmedRows(rows, response([shown('22')]))!]).toEqual([rows[0]])
  })

  it('looks a § of a package up under its law, and an undivided outcome by its number', () => {
    const rows = [row('§ 5.', { law: 'A' }), row('§ 5.', { law: 'B' })]
    expect([...oracleConfirmedRows(rows, response([shown('5', { annexLaw: 'B' })]))!]).toEqual([rows[1]])
    expect(oracleConfirmedRows(rows, response([shown('5')]))!.size).toBe(2)
  })

  it('leaves elided rows out, as the page does', () => {
    const rows = [row('§ 1.', { elided: true }), row('§ 1.')]
    expect([...oracleConfirmedRows(rows, response([shown('1')]))!]).toEqual([rows[1]])
  })

  it('answers null where there is no Lesefassung to ask', () => {
    expect(oracleConfirmedRows([row('§ 1.')], null)).toBeNull()
    expect(oracleConfirmedRows([row('§ 1.')], { ...response([shown('1')]), notRun: 'kein-xml' })).toBeNull()
  })
})
