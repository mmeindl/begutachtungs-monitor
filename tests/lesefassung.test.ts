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
  witnessText,
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
    // A schedule's own number, Roman in Arabic as the engine and RIS key it
    // (19.11.2026): every one of them was the bare „anl." before.
    expect(annexUnitId('Anhang XIV')).toBe('anl. 14')
    expect(annexUnitId('ANHANG I')).toBe('anl. 1')
    expect(annexUnitId('Anlage A')).toBe('anl. a')
    expect(annexUnitId('Anhang IVX')).toBe('anl. ivx')
    expect(annexUnitId('Anlage zu Art. II')).toBe('anl.')
    // Anchored: a row that merely mentions an Anlage opens none.
    expect(annexUnitId('Abschnitt 3')).toBeNull()
    expect(annexUnitId('Verweis auf Anlage 2')).toBeNull()
  })
})

describe('outcomeIndex', () => {
  it('finds a single-law draft\'s § under a row that carries a law, and the unnumbered schedule at the numbered one', () => {
    const index = outcomeIndex(response([shown('4'), shown('Anl.')], []), () => true)!
    expect(index.at('Änderung des Testgesetzes', '§ 4.')).toMatchObject({ lesefassung: { kind: 'shown' } })
    expect(index.at('Änderung des Testgesetzes', 'Anlage 2')).toMatchObject({ lesefassung: { kind: 'shown' } })
  })

  it('takes the unnumbered schedule for a numbered one only where the law has one (19.11.2026)', () => {
    // 571847EF: the refusal of the unnumbered „Anlage" also stood at the
    // law's Anhänge 2 and 4, which no instruction touches.
    expect(outcomeIndex(response([], [held('Anl.', 'verweigert')]))!.at(null, 'Anhang 2')).toBeNull()
    expect(outcomeIndex(response([], [held('Anl.', 'verweigert')]), () => true)!.at(null, 'Anhang 2')).toMatchObject({ lesefassung: { cause: 'verweigert' } })
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

  it('gives each Roman schedule its own outcome, and the unnumbered one only to a law\'s only schedule (19.11.2026)', () => {
    // 58/ME XXVIII: one „Anl." outcome stood at eleven Anhänge of the BVergG
    // 2018; 12732B03: „Anlage I" and „Anlage II" shared one refusal.
    const roman = [row('Anlage I', { gld: null }), row('Anlage II', { gld: null })]
    expect(carried(roman, response([shown('Anl. 1')], [held('Anl. 2', 'verweigert')])).at).toEqual([['Anl. 1'], ['verweigert']])
    const two = [row('Anhang 2', { gld: null }), row('Anhang 4', { gld: null, change: 'unchanged' })]
    const { placement, at } = carried(two, response([], [held('Anl.', 'verweigert')]))
    expect(at).toEqual([['nicht-gefunden'], []])
    expect([...placement.ends.byGroup.values()].map((e) => e.outcomes.map((o) => o.id))).toEqual([['Anl.']])
    expect(carried([row('Anhang 2', { gld: null })], response([], [held('Anl.', 'verweigert')])).at).toEqual([['verweigert']])
  })

  it('places each outcome at one block: the one that prints most of the unit, the later on a tie (19.11.2026)', () => {
    // 24/ME XXVIII: the table of contents carries the § symbol, and the
    // confirmed BSFG § 40 stood under its entry and under § 40 itself.
    const toc = [row('§ 39.'), row('§ 40.')]
    const body = [row('§ 39.'), row('§ 40.'), row('§ 40.', { gld: null }), row('§ 40.', { gld: null })]
    const { placement, at } = carried([...toc, ...body], response([shown('40')], [held('39', 'anhang-fremd')]))
    expect(at).toEqual([[], [], ['anhang-fremd'], ['40']])
    // The entries say nothing, not even „nicht gefunden": their outcome stands below.
    expect(placement.byRow.get(toc[1]!)!.outcomeElsewhere).toBe(true)
    // A schedule printed in two parts (7A7FB366): at the larger part.
    const parts = [row('Anlage 2', { gld: null }), row('Anlage 2', { gld: null }), row('Anlage 2, Anhang A', { gld: null })]
    expect(carried(parts, response([], [held('Anl. 2', 'verweigert')])).at).toEqual([['verweigert'], []])
  })

  it('keeps what is filed under no law and what is filed under the one group\'s law, both at the group\'s end (19.11.2026)', () => {
    // 90EAC582: the §§ 4b and 4c (no law) were overwritten by two passages
    // filed under the law, and vanished from the page.
    const L = 'Verordnung'
    const passage = { law: L, para: '9', heading: 'Zu § 9', text: ['Begründung.'] } as unknown as ParagraphExplanationView
    const { placement } = carried([row('§ 4a.', { law: L })], response([], [held('4a', 'verweigert'), held('4b', 'anhang-schweigt')]), [passage])
    const end = placement.ends.byGroup.get(L)!
    expect(end.outcomes.map((o) => o.id)).toEqual(['4b'])
    expect(end.explanations).toHaveLength(1)
  })

  it('files what stands under no law under the one group no law of the draft claims (19.11.2026)', () => {
    // 144/ME XXVIII: a new law beside one Novelle, whose rows the annex
    // prints without designations — the BSFG §§ stood under „Gesetzestext".
    const N = 'Neues Gesetz'
    const B = 'Änderung des Bestehenden Gesetzes'
    const rows = [row('§ 1.', { law: N }), row(null, { law: B })]
    const { placement } = carried(rows, response([], [held('1', 'neu-erlassen', N), held('1', 'anhang-schweigt')]))
    expect(placement.ends.byGroup.get(B)!.outcomes.map((o) => o.id)).toEqual(['1'])
    expect(placement.ends.rest).toEqual([])
    // Two groups unclaimed: nothing chooses.
    const two = carried([row('§ 1.', { law: 'X' }), row(null, { law: B })], response([], [held('7', 'anhang-schweigt')]))
    expect(two.placement.ends.rest.map((r) => r.outcomes.map((o) => o.id))).toEqual([['7']])
  })

  it('says at a changed § that no instruction names it — and nothing at an editorial one, or before the run answered', () => {
    const rows = [row('§ 1.'), row('§ 2.', { editorial: true }), row('§ 3.', { change: 'unchanged' })]
    expect(carried(rows, response([], [])).at).toEqual([['nicht-gefunden'], [], []])
    expect(carried(rows, null).at).toEqual([[], [], []])
    // A repealed § says it with its struck rows — the server gives it no number afterwards.
    expect(carried([row('§ 8.', { change: 'removed', proposed: '', paraAfter: null })], response([], [])).at).toEqual([[]])
  })

  it('finds a § numbered by Kapitel under its whole number', () => {
    // 707EA278: read as „8", the outcome „8.03" met no block, and the block
    // said „nicht gefunden" over an instruction we had read (26.10.2026).
    expect(carried([row('§ 8.03'), row('§ 8.04')], response([], [held('8.03', 'verweigert'), held('8.04', 'unplausibel')])).at).toEqual([['verweigert'], ['unplausibel']])
  })

  it('places a § of a law the draft enacts anew at its block, and never lists it as one the draft „also changes"', () => {
    const rows = [row('§ 1.', { law: 'Neues Gesetz' })]
    const { placement, at } = carried(rows, response([], [held('1', 'neu-erlassen', 'Neues Gesetz'), held('2', 'neu-erlassen', 'Neues Gesetz')]))
    expect(at).toEqual([['neu-erlassen']])
    expect(placement.ends.byGroup.size + placement.ends.rest.length).toBe(0)
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
    expect(lesefassungLine({ kind: 'withheld', cause: 'anhang-widerspricht' })).toBe('Ganzer Paragraph in der vorgeschlagenen Fassung nicht gezeigt: Unser Ergebnis und die Beilage stimmen hier nicht überein.')
    expect(lesefassungLine({ kind: 'withheld', cause: 'verweigert' }, '§ 1a.')).toMatch(/^Ganzer § 1a in der vorgeschlagenen Fassung nicht gezeigt: /)
    // A § the draft repeals or moves stands in the annex as struck rows already.
    expect(lesefassungLine({ kind: 'withheld', cause: 'entfaellt' })).toBeNull()
    expect(lesefassungLine({ kind: 'withheld', cause: 'neu-erlassen' })).toBe('Ganzer Paragraph in der vorgeschlagenen Fassung nicht gezeigt: Dieses Gesetz erlässt der Entwurf neu, und seinen ganzen Text enthält er selbst; wir setzen nur Änderungen bestehender Gesetze zusammen.')
    expect(lesefassungNotRunText({ ...response([], []), notRun: 'keine-novelle' })).toMatch(/^Nicht im Monitor: die ganzen Paragraphen in der vorgeschlagenen Fassung\. So wie der Monitor den Entwurf liest/)
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

describe('witnessText — a § shown on the draft\'s own text (20.11.2026)', () => {
  const shown = (draftWitness?: ConsolidatedParagraph['draftWitness']): ConsolidatedParagraph => ({ id: '94m', segments: [], headingSegments: null, risUrl: null, annexLaw: null, ...(draftWitness ? { draftWitness } : {}) })

  it('says nothing at a § the annex confirms', () => {
    expect(witnessText(shown())).toBeNull()
  })

  it('names both wordings at each place, as our reading', () => {
    expect(witnessText(shown([{ annex: 'dem 30. Juni 2025 begangen', draft: 'dem 30. Juni 2024 begangen' }]))).toBe(
      'Hier stimmt die Textgegenüberstellung nicht mit dem Gesetzestext des Entwurfs überein: In der Textgegenüberstellung lesen wir „dem 30. Juni 2025 begangen“, im Gesetzestext „dem 30. Juni 2024 begangen“. Gezeigt ist der Gesetzestext; so steht er auch in der PDF-Fassung des Entwurfs im RIS.',
    )
    expect(witnessText(shown([{ annex: 'a', draft: 'b' }, { annex: 'c', draft: 'd' }]))).toMatch(/^An zwei Stellen stimmt .*„a“, im Gesetzestext „b“; in der Textgegenüberstellung lesen wir „c“/)
  })
})
