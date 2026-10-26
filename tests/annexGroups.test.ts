import { describe, expect, it } from 'vitest'
import type { TextComparisonRow, ConsolidatedTextResponse, ParagraphExplanationView } from '#shared/types'
import { annexBadge, annexLawKeys, annexParas, groupAnnexRows, placeAtParagraphs, type AnnexParaOptions } from '../app/utils/annexGroups'

/** A pair row of § `para`, changed and verified unless told otherwise. */
function row(para: string | null, over: Partial<TextComparisonRow> = {}): TextComparisonRow {
  return {
    kind: 'pair',
    law: null,
    heading: null,
    gld: null,
    para,
    paraAfter: para,
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

/** A law-less passage on § `para`, as the Erläuterungen file it. */
const passage = (para: string, heading = `Zu § ${para}:`, text = [`Begründung ${para}`]): ParagraphExplanationView => ({ law: null, para, heading, text })

/** Placed as the section places it (`placeAtParagraphs`), then cut into blocks. */
function parasOf(rows: TextComparisonRow[], over: Partial<AnnexParaOptions> = {}, passages: ParagraphExplanationView[] = [], kons: ConsolidatedTextResponse | null = null) {
  const g = groupAnnexRows(rows, all).groups[0]!
  return annexParas(g, { limit: Number.POSITIVE_INFINITY, folding: true, placed: placeAtParagraphs(rows, kons, passages).byRow, ...over })
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

  it('counts the changes a § withholds, not its rows — the unchanged Absätze go with the verdict (95/ME § 7)', () => {
    const rows = [
      row('§ 7.', { gld: '§ 7.', change: 'unchanged', check: 'withheld', withheldCause: 'standing', current: '', proposed: '' }),
      row('§ 7.', { change: 'unchanged', check: 'withheld', current: '', proposed: '' }),
      row('§ 7.', { check: 'withheld', current: '', proposed: '' }),
      row('§ 7.', { change: 'unchanged', check: 'withheld', current: '', proposed: '' }),
    ]
    expect(parasOf(rows).paras[0]!.blocks).toEqual([{ kind: 'withheld', count: 1, cause: 'standing' }])
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

  it('prints up to the limit and counts the rest — nothing of a § past it, not even its unchanged fold', () => {
    const rows = [row('§ 1'), row('§ 2'), row('§ 3', { change: 'unchanged' }), row('§ 4')]
    const { paras, hidden } = parasOf(rows, { limit: 1 })
    expect(paras.map((p) => p.key)).toEqual(['§ 1'])
    expect(hidden).toBe(2)
  })

  it('cuts between §§: the § that reaches the limit is printed whole', () => {
    const rows = [row('§ 1'), row('§ 1'), row('§ 1'), row('§ 2')]
    const { paras, hidden } = parasOf(rows, { limit: 2 })
    expect(paras.map((p) => [p.key, p.blocks.length])).toEqual([['§ 1', 3]])
    expect(hidden).toBe(1)
  })

  it('hides a § past the limit whole — withheld notice, fold, Begründung and Lesefassung with it', () => {
    const rows = [
      row('§ 1'),
      row('§ 2', { change: 'unchanged' }),
      row('§ 2'),
      row('§ 3', { check: 'withheld', current: '', proposed: '' }),
      row('§ 4'),
    ]
    const explained = ['1', '2', '3', '4'].map((id) => passage(id))
    const { paras, hidden } = parasOf(rows, { limit: 1 }, explained)
    expect(paras.map((p) => p.key)).toEqual(['§ 1'])
    // What „N weitere Änderungen anzeigen" promises is what the press prints.
    const all = parasOf(rows, {}, explained).paras
    const changeRows = (ps: typeof all) => ps.flatMap((p) => p.blocks).filter((b) => b.kind === 'row').length
    expect(hidden).toBe(changeRows(all) - changeRows(paras))
    expect(hidden).toBe(2)
  })

  it('cuts nothing where only unchanged or withheld §§ are left — no button would bring them back', () => {
    const rows = [row('§ 1'), row('§ 2', { change: 'unchanged' }), row('§ 3', { check: 'withheld', current: '', proposed: '' })]
    const { paras, hidden } = parasOf(rows, { limit: 1 })
    expect(paras.map((p) => p.key)).toEqual(['§ 1', '§ 2', '§ 3'])
    expect(hidden).toBe(0)
  })

  it('counts unchanged hits while searching, as the rows a press prints', () => {
    const rows = [row('§ 1'), row('§ 2', { change: 'unchanged' }), row('§ 2')]
    const { paras, hidden } = parasOf(rows, { limit: 1, folding: false })
    expect(paras.map((p) => p.key)).toEqual(['§ 1'])
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

  it('gives a § one layout: one row in two columns puts every row of it there, other §§ untouched', () => {
    // A swapped word reads inline on its own (`readsSideBySide`).
    const segments = [{ type: 'equal' as const, text: 'Die Frist beträgt ' }, { type: 'removed' as const, text: 'vier' }, { type: 'inserted' as const, text: 'sechs' }, { type: 'equal' as const, text: ' Wochen.' }]
    const { paras } = parasOf([row('§ 1', { segments }), row('§ 1'), row('§ 2', { segments })])
    const splits = paras.map((p) => p.blocks.map((b) => b.kind === 'row' && b.split))
    expect(splits).toEqual([[true, true], [false]])
  })
})

describe('annexParas — the Begründung and the Lesefassung of a renumbered §', () => {
  const headings = (rows: TextComparisonRow[], ids: string[]) =>
    parasOf(rows, {}, ids.map((id) => passage(id))).paras.map((p) => [p.key, p.explanations.map((e) => e.heading)])

  // 51/ME XXVIII: the new § 14 is inserted, and further down the old § 14
  // becomes § 22 — one row, „§ 14." left, „§ 22." right. The server says so
  // in `paraAfter` (`designateAfter`).
  const renumbered = [
    row('§ 14.', { gld: '§ 14.', change: 'inserted', current: '', proposed: '(1) Die öffentliche Hand stellt bereit:' }),
    row('§ 21.', { gld: '§ 21.', change: 'inserted', current: '' }),
    row('§ 14.', { gld: '§ 14.', paraAfter: '§ 22.', current: 'Soweit verwiesen wird …', proposed: '§ 22. Soweit verwiesen wird …' }),
  ]

  it('reads the designation after the draft from the server, not from the text — a withheld row has none', () => {
    const withheld = row('§ 14.', { gld: '§ 14.', paraAfter: '§ 22.', current: '', proposed: '', check: 'withheld', withheldCause: 'standing' })
    expect(headings([renumbered[0]!, renumbered[1]!, withheld], ['14', '21', '22'])).toEqual([['§ 14.', ['Zu § 14:']], ['§ 21.', ['Zu § 21:']], ['§ 14.#2', ['Zu § 22:']]])
    // „§ 5." at the head of both columns is a citation, and no field says otherwise.
    expect(headings([row('§ 7.', { gld: '§ 7.', current: '§ 5. gilt sinngemäß.', proposed: '§ 5. gilt sinngemäß, soweit …' })], ['5', '7'])).toEqual([['§ 7.', ['Zu § 7:']]])
  })

  it('looks a renumbered § up by its new number, and the new § by the old one', () => {
    expect(headings(renumbered, ['14', '21', '22'])).toEqual([['§ 14.', ['Zu § 14:']], ['§ 21.', ['Zu § 21:']], ['§ 14.#2', ['Zu § 22:']]])
  })

  it('names the new number on the § line only where the whole block is that one §', () => {
    const lines = (rows: TextComparisonRow[]) => parasOf(rows).paras.map((p) => [p.gld, p.renumberedTo])
    expect(lines(renumbered)).toEqual([['§ 14.', null], ['§ 21.', null], ['§ 14.', '§ 22.']])
    // 2/ME: one run, § 2 beside the new § 1a and then § 2 itself — no single new number.
    expect(lines([row('§ 2.', { gld: '§ 2.', paraAfter: '§ 1a.' }), row('§ 2.', { gld: '§ 2.' })])).toEqual([['§ 2.', null]])
    // A repealed § says it with its struck rows.
    expect(lines([row('§ 8.', { gld: '§ 8.', paraAfter: null, change: 'removed', proposed: '' })])).toEqual([['§ 8.', null]])
  })

  it('falls back to the old number where nothing stands under the new one and no other § carries it (2/ME XXVIII)', () => {
    const rows = [row('§ 14a.', { gld: '§ 14a.', paraAfter: '§ 15.', current: '(1) …', proposed: '§ 15. (1) …' }), row('§ 14a.', { paraAfter: '§ 15.', change: 'inserted', current: '', proposed: '(3) Das Strafgericht …' })]
    expect(headings(rows, ['14a'])).toEqual([['§ 14a.', ['Zu § 14a:']]])
    // … but not where another § of the law carries the old number afterwards.
    expect(headings(renumbered, ['14'])).toEqual([['§ 14.', ['Zu § 14:']], ['§ 21.', []], ['§ 14.#2', []]])
  })

  it('gives a repealed § its own passage only where no other § takes its number', () => {
    const repealed = row('§ 8.', { gld: '§ 8.', paraAfter: null, change: 'removed', proposed: '' })
    const newEight = row('§ 8.', { gld: '§ 8.', change: 'inserted', current: '' })
    expect(headings([repealed], ['8'])).toEqual([['§ 8.', ['Zu § 8:']]])
    // 51/ME: the new § 8 earlier in the annex, the repealed old § 8 later.
    expect(headings([newEight, row('§ 9.', { gld: '§ 9.' }), repealed], ['8', '9'])).toEqual([['§ 8.', ['Zu § 8:']], ['§ 9.', ['Zu § 9:']], ['§ 8.#2', []]])
  })

  it('collects the passages of every § one run opens, each once (2/ME: § 2 → § 1a, then § 2)', () => {
    const rows = [
      row('§ 2.', { gld: '§ 2.', paraAfter: '§ 1a.', current: '(1) bis (2) …', proposed: '§ 1a. Im Sinne dieses Bundesgesetzes bedeutet:' }),
      row('§ 2.', { paraAfter: '§ 1a.', change: 'inserted', current: '' }),
      row('§ 2.', { gld: '§ 2.', change: 'unchanged' }),
      row('§ 2.'),
    ]
    // „Zu Z 1 (§§ 1a und 2 Abs. 3)" is filed under both §§ it names.
    const both = [passage('1a', 'Zu Z 1 (§§ 1a und 2 Abs. 3):', ['Begriffe']), passage('2', 'Zu Z 1 (§§ 1a und 2 Abs. 3):', ['Begriffe']), passage('2', 'Zu Z 2 (§ 2 Abs. 1 Z 3):', ['Z 3'])]
    const { paras } = parasOf(rows, {}, both)
    expect(paras.map((p) => p.explanations.map((e) => e.heading))).toEqual([['Zu Z 1 (§§ 1a und 2 Abs. 3):', 'Zu Z 2 (§ 2 Abs. 1 Z 3):']])
  })

  const response = (shown: string[], withheld: [string, ConsolidatedTextResponse['withheld'][number]['cause']][]): ConsolidatedTextResponse => ({
    gp: 'XXVIII', inr: 51, risId: null, touched: shown.length + withheld.length, notRun: null,
    paragraphs: shown.map((id) => ({ id, segments: [], headingSegments: null, risUrl: null, annexLaw: null })),
    withheld: withheld.map(([id, cause]) => ({ id, annexLaw: null, cause })),
  })
  const outcomes = (rows: TextComparisonRow[], kons: ConsolidatedTextResponse) =>
    parasOf(rows, {}, [], kons).paras.map((p) => p.lesefassungen.map((l) => (l.lesefassung.kind === 'shown' ? l.lesefassung.paragraph.id : l.lesefassung.cause)))

  it('looks the Lesefassung up the same way — the old § 14 shows § 22, never the new § 14', () => {
    expect(outcomes(renumbered, response(['22'], [['14', 'verweigert'], ['21', 'anhang-widerspricht']]))).toEqual([['verweigert'], ['anhang-widerspricht'], ['22']])
    // A § the annex shows changing, of which the run knows nothing.
    expect(outcomes(renumbered, response(['22'], []))).toEqual([['nicht-gefunden'], ['nicht-gefunden'], ['22']])
  })

  it('gives each § of a shift its own outcome, and names a § the run does not know by its number afterwards (20/ME XXVIII)', () => {
    // The old § 81 becomes § 82, the old § 82 becomes § 83; the run knows § 82 only.
    const shift = [
      row('§ 81.', { gld: '§ 81.', change: 'inserted', current: '' }),
      row('§ 81.', { gld: '§ 81.', paraAfter: '§ 82.', current: '(1) Inkrafttreten …', proposed: '§ 82. (1) Inkrafttreten …' }),
      row('§ 82.', { gld: '§ 82.', paraAfter: '§ 83.', current: 'Mit der Vollziehung …', proposed: '§ 83. Mit der Vollziehung …' }),
    ]
    const placed = parasOf(shift, {}, [], response([], [['81', 'verweigert'], ['82', 'verweigert']])).paras
    expect(placed.map((p) => p.lesefassungen.map((l) => `${l.designation}:${l.lesefassung.kind === 'shown' ? 'shown' : l.lesefassung.cause}`))).toEqual([
      ['§ 81.:verweigert', '§ 82.:verweigert'],
      ['§ 83.:nicht-gefunden'],
    ])
  })

  it('leaves no vacated number behind for the end of the law', () => {
    // The old § 14 moves to § 22 and nothing takes its number: its outcome
    // (`entfaellt`) belongs to the block that shows the move.
    const moved = [row('§ 14.', { gld: '§ 14.', paraAfter: '§ 22.', current: 'Soweit verwiesen wird …', proposed: '§ 22. Soweit verwiesen wird …' })]
    const placement = placeAtParagraphs(moved, response(['22'], [['14', 'entfaellt']]), [])
    expect([...placement.ends.byGroup.values()].flatMap((e) => e.outcomes)).toEqual([])
    expect(placement.byRow.get(moved[0]!)!.lesefassungen.map((l) => l.designation)).toEqual(['§ 22.'])
  })
})

describe('groupAnnexRows — a § whose standing text the annex leaves out', () => {
  // StVO § 54 on 62/ME XXVIII: the new (4a) between two elision lines.
  const stvo = [
    row('§ 54.', { gld: '§ 54.', change: 'unchanged', elided: true, current: '(1) bis (4) …', proposed: '(1) bis (4) …' }),
    row('§ 54.', { change: 'inserted', current: '', proposed: '(4a) Neu …' }),
    row('§ 54.', { change: 'unchanged', elided: true, current: '(5) bis (7) …', proposed: '(5) bis (7) …' }),
  ]

  it('is „geändert", not „neu": the elision says the rest of it stands', () => {
    const { groups, kindCounts } = groupAnnexRows(stvo, all)
    expect(groups[0]!.counts).toEqual({ unchanged: 0, changed: 1, editorial: 0, inserted: 0, removed: 0 })
    expect(kindCounts.changed).toBe(1)
    // … and the elision lines still do not print.
    expect(groups[0]!.rows.map((r) => r.proposed)).toEqual(['(4a) Neu …'])
  })

  it('stays „geändert" while a search keeps only the new Absatz, and hides with „geändert"', () => {
    expect(groupAnnexRows(stvo, { matches: (r) => r.proposed.includes('Neu'), hidden: [] }).kindCounts.changed).toBe(1)
    expect(groupAnnexRows(stvo, { matches: null, hidden: ['inserted'] }).groups).toHaveLength(1)
    expect(groupAnnexRows(stvo, { matches: null, hidden: ['changed'] }).groups).toHaveLength(0)
  })

  it('a whole new § stays „neu" — and so does one an elision line of OTHER §§ inherits', () => {
    const rows = [
      row('§ 20.', { gld: '§ 20.', change: 'inserted', current: '' }),
      // „§§ 21 bis 25 …" inherits § 20 as its `para` without being part of it.
      row('§ 20.', { change: 'unchanged', elided: true, current: '§§ 21 bis 25 …', proposed: '§§ 21 bis 25 …' }),
      row('§ 20.', { change: 'unchanged', elided: true, current: '3. Abschnitt …', proposed: '3. Abschnitt …' }),
    ]
    expect(groupAnnexRows(rows, all).groups[0]!.counts.inserted).toBe(1)
  })

  it('a § that opens with its own elision line („§ 16 Abs. 1 bis 24 …") has standing text', () => {
    const rows = [
      row('§ 16.', { change: 'unchanged', elided: true, current: '§ 16 Abs. 1 bis 24 …', proposed: '§ 16 Abs. 1 bis 24 …' }),
      row('§ 16.', { change: 'inserted', current: '' }),
    ]
    expect(groupAnnexRows(rows, all).groups[0]!.counts.changed).toBe(1)
  })
})

describe('annexLawKeys — what a caveat above the toolbar may depend on', () => {
  it('names every law the unfiltered comparison has a group for, whatever a search or the legend leaves', () => {
    const rows = [article('A'), row('§ 1', { law: 'A', proposed: 'Hebammen' }), article('B'), row('§ 2', { law: 'B' }), article('C'), row('§ 3', { law: 'C', elided: true })]
    // A search for „Hebammen" leaves law B without a group …
    expect(groupAnnexRows(rows, { matches: (r) => r.proposed.includes('Hebammen'), hidden: [] }).groups.map((g) => g.key)).toEqual(['A'])
    // … and B stays a law the comparison carries: its caveat stays inside B's group.
    expect([...annexLawKeys(rows)]).toEqual(['A', 'B'])
  })
})
