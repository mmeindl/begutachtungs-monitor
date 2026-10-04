import { describe, expect, it } from 'vitest'
import type { TextComparisonRow } from '#shared/types'
import { annexBadge, annexParas, groupAnnexRows } from '../app/utils/annexGroups'

/** A pair row of § `para`, changed and verified unless told otherwise. */
function row(para: string | null, over: Partial<TextComparisonRow> = {}): TextComparisonRow {
  return {
    kind: 'pair',
    law: null,
    heading: null,
    gld: null,
    para,
    current: `alt ${para}`,
    proposed: `neu ${para}`,
    change: 'changed',
    elided: false,
    segments: null,
    editorial: false,
    elisionRange: false,
    check: 'verified',
    owesCheck: true,
    ...over,
  }
}

function article(law: string, heading = law): TextComparisonRow {
  return row(null, { kind: 'article', law, heading, current: '', proposed: '', change: 'unchanged', check: 'unchecked', owesCheck: false })
}

const all = { matches: null, hidden: [] }

describe('annexBadge', () => {
  it('reads an elision range as redaktionell, not as the § changing', () => {
    expect(annexBadge(row('§ 1', { elisionRange: true }))).toBe('editorial')
    expect(annexBadge(row('§ 1', { editorial: true }))).toBe('editorial')
    expect(annexBadge(row('§ 1', { change: 'inserted' }))).toBe('inserted')
  })
})

describe('groupAnnexRows', () => {
  it('opens a group per law, titled by its article row, and drops a group left empty', () => {
    const { groups } = groupAnnexRows([
      article('A', 'Artikel 1 – A-Gesetz'),
      row('§ 1', { law: 'A' }),
      article('B'),
      row('§ 2', { law: 'B', elided: true }),
    ], all)
    expect(groups.map((g) => [g.key, g.article, g.rows.length])).toEqual([['A', 'Artikel 1 – A-Gesetz', 1]])
  })

  it('starts a new group where a row names another law than the open one', () => {
    const { groups } = groupAnnexRows([row('§ 1', { law: 'A' }), row('§ 1', { law: 'B' }), row('§ 2', { law: null })], all)
    expect(groups.map((g) => [g.key, g.article, g.rows.length])).toEqual([['A', '', 1], ['B', '', 2]])
  })

  it('keys a group without a law by its position', () => {
    expect(groupAnnexRows([row('§ 1')], all).groups[0]!.key).toBe('#0')
  })

  it('counts in §§, not rows: one pill per §, mixed kinds read as geändert', () => {
    const { groups, kindCounts } = groupAnnexRows([
      row('§ 1.', { gld: '§ 1.' }),
      row('§ 1.', { change: 'unchanged' }),
      row('§ 2.', { gld: '§ 2.', change: 'inserted' }),
      row('§ 3.', { gld: '§ 3.', editorial: true }),
      row('§ 3.', { change: 'unchanged' }),
    ], all)
    // `gld ?? para`, and `para` is inherited from the row that opened the §:
    // the rows of one § share a key whether or not they open it.
    expect(groups[0]!.counts).toEqual({ unchanged: 0, changed: 1, editorial: 1, inserted: 1, removed: 0 })
    expect(kindCounts).toEqual(groups[0]!.counts)
  })

  it('counts a withheld § as not shown — never as a kind of change, never in the legend', () => {
    const { groups, kindCounts } = groupAnnexRows([
      row('§ 1', { check: 'withheld' }),
      row('§ 1', { check: 'withheld' }),
      row('§ 2'),
    ], all)
    expect(groups[0]!.withheld).toBe(1)
    expect(groups[0]!.counts.changed).toBe(1)
    expect(kindCounts.changed).toBe(1)
  })

  it('counts „nicht geprüft" per § where the server says a check was owed, with its reasons once each', () => {
    const { groups } = groupAnnexRows([
      row('§ 1', { check: 'unchecked', uncheckedReason: 'kein RIS' }),
      row('§ 1', { check: 'unchecked', uncheckedReason: 'kein RIS' }),
      row('§ 2', { check: 'unchecked', owesCheck: false }),
      row(null, { check: 'unchecked', uncheckedReason: 'ohne §' }),
      row(null, { check: 'unchecked' }),
    ], all)
    // Two rows without a § are two units: neither merges into a „§ null".
    expect(groups[0]!.unchecked).toBe(3)
    expect([...groups[0]!.uncheckedReasons]).toEqual(['kein RIS', 'ohne §'])
  })

  it('keeps only the rows the search matches, and the legend counts only those', () => {
    const rows = [article('A'), row('§ 1', { law: 'A', proposed: 'Verwaltungsstrafe' }), row('§ 2', { law: 'A', change: 'inserted' })]
    const { groups, kindCounts } = groupAnnexRows(rows, { matches: (r) => r.proposed.includes('Verwaltungsstrafe'), hidden: [] })
    expect(groups[0]!.rows.map((r) => r.para)).toEqual(['§ 1'])
    expect(kindCounts).toEqual({ unchanged: 0, changed: 1, editorial: 0, inserted: 0, removed: 0 })
  })

  it('hides whole §§ by their pill, and leaves the legend counting them', () => {
    const rows = [
      row('§ 1.', { gld: '§ 1.' }),
      row('§ 1.', { change: 'unchanged' }), // a § that is „geändert" keeps its unchanged Absatz
      row('§ 2.', { gld: '§ 2.', change: 'unchanged' }),
      row('§ 3', { check: 'withheld' }),
    ]
    const { groups, kindCounts } = groupAnnexRows(rows, { matches: null, hidden: ['unchanged'] })
    expect(groups[0]!.rows.map((r) => r.para)).toEqual(['§ 1.', '§ 1.', '§ 3'])
    expect(kindCounts.unchanged).toBe(1)
    // A withheld § has no kind, so no switch can hide it.
    expect(groupAnnexRows(rows, { matches: null, hidden: ['changed', 'unchanged'] }).groups[0]!.rows.map((r) => r.para)).toEqual(['§ 3'])
  })
})

const none = { explanationsFor: () => [], consolidatedFor: () => null }

function parasOf(rows: TextComparisonRow[], over: { limit?: number; folding?: boolean } = {}) {
  const g = groupAnnexRows(rows, all).groups[0]!
  return annexParas(g, { limit: Number.POSITIVE_INFINITY, folding: true, ...none, ...over })
}

describe('annexParas', () => {
  it('gathers a §’s Absätze under one block, its heading from whichever row carries it', () => {
    const { paras } = parasOf([
      row('§ 1', { gld: '§ 1.' }),
      row('§ 1', { heading: 'Zweck' }),
      row('§ 2', { gld: '§ 2.' }),
    ])
    expect(paras.map((p) => [p.key, p.gld, p.heading, p.blocks.length])).toEqual([['§ 1', '§ 1', 'Zweck', 2], ['§ 2', '§ 2', null, 1]])
    // `gld` here is the § the block belongs to (`row.para`), not the row's own designation.
  })

  it('folds unchanged rows into a context block, but not while searching', () => {
    const rows = [row('§ 1', { change: 'unchanged' }), row('§ 1', { change: 'unchanged' }), row('§ 1')]
    expect(parasOf(rows).paras[0]!.blocks.map((b) => b.kind)).toEqual(['context', 'row'])
    expect(parasOf(rows, { folding: false }).paras[0]!.blocks.map((b) => b.kind)).toEqual(['row', 'row', 'row'])
  })

  it('says how many changes a § withholds, with the cause of the first', () => {
    const { paras } = parasOf([
      row('§ 1', { check: 'withheld', withheldCause: 'notInDraft' }),
      row('§ 1', { check: 'withheld' }),
    ])
    expect(paras[0]!.blocks).toEqual([{ kind: 'withheld', count: 2, cause: 'notInDraft' }])
  })

  it('marks „nicht geprüft" once per §, at its first shown row — and on every row without a §', () => {
    const { paras } = parasOf([
      row('§ 1', { change: 'unchanged', check: 'unchecked' }), // folded: cannot carry it
      row('§ 1', { check: 'unchecked' }),
      row('§ 1', { check: 'unchecked' }),
      row(null, { check: 'unchecked' }),
      row(null, { check: 'unchecked' }),
    ])
    const marks = paras.flatMap((p) => p.blocks.flatMap((b) => (b.kind === 'row' ? [b.unchecked] : [])))
    expect(marks).toEqual([true, false, true, true])
  })

  it('prints up to the limit and counts the rest', () => {
    const rows = [row('§ 1'), row('§ 2'), row('§ 3', { change: 'unchanged' }), row('§ 4')]
    const { paras, hidden } = parasOf(rows, { limit: 1 })
    expect(paras.map((p) => p.key)).toEqual(['§ 1', '§ 3'])
    expect(hidden).toBe(2)
  })

  it('splits a row whose word diff hit its ceiling, each side marked whole', () => {
    const { paras } = parasOf([row('§ 1', { segments: null })])
    const b = paras[0]!.blocks[0]!
    expect(b.kind === 'row' && [b.split, b.from, b.to]).toEqual([
      true,
      [{ type: 'removed', text: 'alt § 1' }],
      [{ type: 'inserted', text: 'neu § 1' }],
    ])
  })
})
