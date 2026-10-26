import { describe, expect, it } from 'vitest'
import type { ConsolidatedParagraph, ConsolidatedTextResponse, ConsolidatedWithheld, ParagraphExplanationView, TextComparisonRow } from '#shared/types'
import { annexUnitId } from '#shared/utils/explanationKey'
import { annexParas, groupAnnexRows, placeAtParagraphs } from '../app/utils/annexGroups'
import {
  lesefassungLine,
  lesefassungNotRunText,
  mergesIntoNotice,
  outcomeIndex,
  unitList,
  unplacedText,
} from '../app/utils/lesefassung'

/** A pair row of § `para`, changed unless told otherwise. */
function row(para: string | null, over: Partial<TextComparisonRow> = {}): TextComparisonRow {
  return {
    kind: 'pair', law: null, heading: null, gld: para, para, paraAfter: para,
    current: `alt ${para}`, proposed: `neu ${para}`, change: 'changed', elided: false, segments: null,
    editorial: false, elisionRange: false, check: 'verified', owesCheck: true,
    ...over,
  }
}

const shown = (id: string, annexLaw: string | null = null): ConsolidatedParagraph => ({ id, segments: [{ type: 'equal', text: `Text ${id}` }], headingSegments: null, risUrl: null, annexLaw })
const held = (id: string, cause: ConsolidatedWithheld['cause'], annexLaw: string | null = null): ConsolidatedWithheld => ({ id, annexLaw, cause })

function response(paragraphs: ConsolidatedParagraph[], withheld: ConsolidatedWithheld[]): ConsolidatedTextResponse {
  return { gp: 'XXVIII', inr: 1, risId: null, paragraphs, withheld, touched: paragraphs.length + withheld.length, notRun: null }
}

/** What each § block carries, compactly: the shown id or the cause. */
function carried(rows: TextComparisonRow[], kons: ConsolidatedTextResponse | null, passages: ParagraphExplanationView[] = []) {
  const placement = placeAtParagraphs(rows, kons, passages)
  const g = groupAnnexRows(rows, { matches: null, hidden: [] }).groups
  const blocks = g.flatMap((group) => annexParas(group, { limit: Number.POSITIVE_INFINITY, folding: true, placed: placement.byRow }).paras)
  return { placement, at: blocks.map((p) => p.lesefassungen.map((l) => (l.lesefassung.kind === 'shown' ? l.lesefassung.paragraph.id : l.lesefassung.cause))) }
}

describe('annexUnitId', () => {
  it('reads a § and a schedule, both as the engine keys them', () => {
    expect(annexUnitId('§ 54c.')).toBe('54c')
    expect(annexUnitId('Anlage 1 (zu § 6)')).toBe('anl. 1')
    expect(annexUnitId('Anhang')).toBe('anl.')
    // Anchored: a row that merely mentions an Anlage opens none.
    expect(annexUnitId('Abschnitt 3')).toBeNull()
    expect(annexUnitId('Verweis auf Anlage 2')).toBeNull()
  })
})

describe('outcomeIndex', () => {
  it('finds a single-law draft\'s § under a row that carries a law, and the unnumbered schedule at the numbered one', () => {
    const index = outcomeIndex(response([shown('4'), shown('Anl.')], []))!
    expect(index.at('Änderung des Testgesetzes', '§ 4.')).toMatchObject({ lesefassung: { kind: 'shown' } })
    expect(index.at('Änderung des Testgesetzes', 'Anlage 2')).toMatchObject({ lesefassung: { kind: 'shown' } })
  })

  it('says „ungeteilt" where an undivided annex leaves a number two laws share', () => {
    const index = outcomeIndex(response([], [held('5', 'verweigert', 'A'), held('5', 'verweigert', 'B'), held('7', 'unplausibel', 'B')]))!
    expect(index.at(null, '§ 5.')).toMatchObject({ lesefassung: { kind: 'withheld', cause: 'anhang-ungeteilt' } })
    expect(index.at(null, '§ 7.')).toMatchObject({ lesefassung: { kind: 'withheld', cause: 'unplausibel' } })
  })

  it('places nothing while there is no run to place', () => {
    expect(outcomeIndex(null)).toBeNull()
    expect(outcomeIndex({ ...response([], []), notRun: 'kein-xml' })).toBeNull()
  })
})

describe('placeAtParagraphs — the Lesefassung', () => {
  it('puts every outcome at its § — shown or with its cause — and keeps the rest for the end of the law', () => {
    const rows = [row('§ 1.'), row('§ 2.'), row('Anlage 1', { gld: null })]
    const { placement, at } = carried(rows, response([shown('1')], [held('2', 'anhang-widerspricht'), held('Anl. 1', 'verweigert'), held('9', 'anhang-schweigt')]))
    expect(at).toEqual([['1'], ['anhang-widerspricht'], ['verweigert']])
    // The schedule found its block: looked up through `explanationParaId` it never did.
    expect([...placement.ends.byGroup.values()].map((e) => e.outcomes)).toEqual([[{ id: '9', lesefassung: { kind: 'withheld', cause: 'anhang-schweigt' } }]])
  })

  it('says at a changed § that no instruction names it — and nothing at an editorial one, or before the run answered', () => {
    const rows = [row('§ 1.'), row('§ 2.', { editorial: true }), row('§ 3.', { change: 'unchanged' })]
    expect(carried(rows, response([], [])).at).toEqual([['nicht-gefunden'], [], []])
    expect(carried(rows, null).at).toEqual([[], [], []])
    // A repealed § says it with its struck rows — the server gives it no number afterwards.
    expect(carried([row('§ 8.', { change: 'removed', proposed: '', paraAfter: null })], response([], [])).at).toEqual([[]])
  })

  it('looks a package\'s § up by its law', () => {
    const rows = [row('§ 5.', { law: 'A' }), row('§ 5.', { law: 'B' })]
    expect(carried(rows, response([shown('5', 'A')], [held('5', 'verweigert', 'B')])).at).toEqual([['5'], ['verweigert']])
  })

  it('keeps for each law what no block took — §§ and Begründung — and sends a law without a group to the end', () => {
    const rows = [row('§ 1.', { law: 'A' }), row('§ 2.', { law: 'A' })]
    const passage = (law: string, para: string): ParagraphExplanationView => ({ law, para, heading: `Zu § ${para}:`, text: ['…'] })
    const { placement } = carried(rows, response([], [held('1', 'verweigert', 'A'), held('9', 'anhang-schweigt', 'A')]), [passage('A', '1'), passage('A', '3'), passage('Neues Gesetz', '1')])
    expect(placement.ends.byGroup.get('A')).toEqual({ outcomes: [{ id: '9', lesefassung: { kind: 'withheld', cause: 'anhang-schweigt' } }], explanations: [passage('A', '3')] })
    expect(placement.ends.rest).toEqual([{ law: 'Neues Gesetz', outcomes: [], explanations: [passage('Neues Gesetz', '1')] }])
    // The placed passage stands at its block.
    expect(placement.byRow.get(rows[0]!)!.explanations).toEqual([passage('A', '1')])
  })
})

describe('the sentences', () => {
  it('names what we could not do, at the § and once for the section', () => {
    expect(lesefassungLine({ kind: 'withheld', cause: 'anhang-widerspricht' })).toBe('Ganzer Paragraph danach nicht gezeigt: Unser Ergebnis weicht von der Beilage ab.')
    expect(lesefassungLine({ kind: 'withheld', cause: 'verweigert' }, '§ 1a.')).toMatch(/^Ganzer § 1a danach nicht gezeigt: /)
    // A § the draft repeals or moves stands in the annex as struck rows already.
    expect(lesefassungLine({ kind: 'withheld', cause: 'entfaellt' })).toBeNull()
    expect(lesefassungNotRunText({ ...response([], []), notRun: 'keine-novelle' })).toMatch(/^Ganze Paragraphen danach zeigen wir hier nicht: So wie wir den Entwurf lesen/)
    expect(lesefassungNotRunText(response([], []))).toBeNull()
  })

  it('lists the units as law prints them', () => {
    expect(unitList(['12'])).toBe('§ 12')
    expect(unitList(['12', '14'])).toBe('§§ 12 und 14')
    expect(unitList(['12', '14', '30', 'Anl. 1'])).toBe('§§ 12, 14 und 30 sowie Anl. 1')
    expect(unitList(['1', '2', '3', '4', '6c', '7', '8'])).toBe('§§ 1 bis 4, 6c, 7 und 8')
    expect(unplacedText(['12'])).toBe('Der Entwurf ändert hier auch § 12; in der Beilage fanden wir dazu keine Gegenüberstellung.')
  })

  it('folds the Lesefassung\'s reason into the annex notice only where both found the same', () => {
    expect(mergesIntoNotice({ kind: 'withheld', cause: 'anhang-fremd' }, 'standing')).toBe(true)
    expect(mergesIntoNotice({ kind: 'withheld', cause: 'anhang-fremd' }, 'alreadyStanding')).toBe(false)
    expect(mergesIntoNotice({ kind: 'withheld', cause: 'anhang-widerspricht' }, 'standing')).toBe(false)
  })
})
