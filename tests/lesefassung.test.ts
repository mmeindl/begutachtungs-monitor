import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ConsolidatedParagraph, ConsolidatedTextResponse, ConsolidatedWithheld, ParagraphExplanationView, TextComparisonRow } from '#shared/types'
import { annexUnitId, articleUnitLaws } from '#shared/utils/explanationKey'
import { paraIdOfGld, paragraphRows, rowsByParagraph } from '../server/utils/kons/tguOracle'
import { annexParas, groupAnnexRows, placeAtParagraphs } from '../app/utils/annexGroups'
import {
  laterAmendmentLine,
  laterAmendmentText,
  lesefassungLine,
  lesefassungNotRunText,
  mergesIntoNotice,
  NO_PART_IN_ANNEX_DE,
  outcomeIndex,
  unitList,
  unplacedText,
  witnessNote,
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
    const index = outcomeIndex(response([shown('4'), shown('Anl.')], []), { soleSchedule: () => true })!
    expect(index.at('Änderung des Testgesetzes', '§ 4.')).toMatchObject({ lesefassung: { kind: 'shown' } })
    expect(index.at('Änderung des Testgesetzes', 'Anlage 2')).toMatchObject({ lesefassung: { kind: 'shown' } })
  })

  it('takes the unnumbered schedule for a numbered one only where the law has one (19.11.2026)', () => {
    // 571847EF: the refusal of the unnumbered „Anlage" also stood at the
    // law's Anhänge 2 and 4, which no instruction touches.
    expect(outcomeIndex(response([], [held('Anl.', 'verweigert')]))!.at(null, 'Anhang 2')).toBeNull()
    expect(outcomeIndex(response([], [held('Anl.', 'verweigert')]), { soleSchedule: () => true })!.at(null, 'Anhang 2')).toMatchObject({ lesefassung: { cause: 'verweigert' } })
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

describe('laterAmendmentText — a § RIS files for the day in the version of a later BGBl (20.11.2026)', () => {
  const later = { cite: 'BGBl. I Nr. 111/2025', issued: '2025-12-29', asOf: '2025-07-14' }

  it('names the starting text, the BGBl and its issue date; on a shown § that the later text is not in it', () => {
    expect(laterAmendmentText(later, true)).toBe(
      'Ausgangstext ist die Fassung vom Beginn der Begutachtung (14.07.2025). Für diesen Tag führt das RIS diesen Paragraphen heute in einer Fassung, die erst das BGBl. I Nr. 111/2025 vom 29.12.2025 gebracht hat; sie ist hier nicht eingearbeitet.',
    )
    expect(laterAmendmentText(later, false, '§ 12a.')).toBe(
      'Ausgangstext ist die Fassung vom Beginn der Begutachtung (14.07.2025). Für diesen Tag führt das RIS § 12a heute in einer Fassung, die erst das BGBl. I Nr. 111/2025 vom 29.12.2025 gebracht hat.',
    )
  })

  it('leaves out an issue date RIS does not tell', () => {
    expect(laterAmendmentText({ ...later, issued: null }, true)).toContain('die erst das BGBl. I Nr. 111/2025 gebracht hat;')
  })

  it('reaches a withheld § through the outcome index, and says nothing where none was replaced', () => {
    const index = outcomeIndex(response([shown('3')], [{ ...held('5', 'anhang-widerspricht'), laterAmendment: later }, held('6', 'verweigert')]))!
    const at5 = index.at(null, '§ 5.')!.lesefassung
    expect(laterAmendmentLine(at5)).toBe(laterAmendmentText(later, false))
    expect(lesefassungLine(at5)).toContain('nicht gezeigt')
    expect(laterAmendmentLine(index.at(null, '§ 6.')!.lesefassung)).toBeNull()
    expect(laterAmendmentLine(index.at(null, '§ 3.')!.lesefassung)).toBeNull()
  })
})

/*
 * ONE READER FOR THE ORACLE AND THE PAGE (20.11.2026). The oracle confirms a
 * § against the annex rows it files under that §; the page has to find the
 * same rows for it, or the confirmed § stands at the end of its law, away
 * from them (`scripts/harness/accounting.ts`, `ortlos`). Fixtures cut from
 * the rows the server sent for 18/ME and 127/ME XXVIII.
 */
describe('placeAtParagraphs — the block the oracle confirmed a § against', () => {
  // 18/ME XXVIII: RIS prints the §§ of the Jurisdiktionsnorm with a full stop
  // after the sign. The oracle read „§. 39." since 20.11.2026, the page did not.
  it('finds „§. 39." as the oracle files it, with its Begründung (18/ME XXVIII, JN § 39)', () => {
    const law = 'Änderung der Jurisdiktionsnorm'
    const rows = [
      row('§ 15.', { law, gld: null, current: '(5) ...', proposed: '(5) ...', change: 'unchanged', elided: true }),
      row('§. 39.', { law, heading: 'Rechtshilfe auf Ersuchen ausländischer Gerichte.', current: '(1) und (2) ...', proposed: '(1) und (2) ...', change: 'unchanged', elided: true }),
      row('§. 39.', { law, gld: null, current: '(3) Auf die Teilnahme des ersuchenden Gerichtes an der Beweisaufnahme ist Art. 12 der Verordnung (EG) Nr. 1206/2001 …', proposed: '(3) Auf die Teilnahme des ersuchenden Gerichtes an der Beweisaufnahme ist Art. 14 der Verordnung (EU) 1783/2020 …' }),
    ]
    // The two sides read the designation through one function.
    expect(paraIdOfGld('§. 39.')).toBe('39')
    expect(annexUnitId('§. 39.')).toBe('39')
    const begruendung: ParagraphExplanationView = { law, para: '39', heading: 'Zu Z 2 bis 5 (§§ 39 und 39a):', text: ['Die vorgeschlagenen Änderungen sind lediglich redaktioneller Natur.'] }
    const { placement, at } = carried(rows, response([shown('39', law)], []), [begruendung])
    // The elided § 15 above folds into no block of its own.
    expect(at).toEqual([['39']])
    expect(placement.byRow.get(rows[2]!)!.explanations).toEqual([begruendung])
    expect(placement.ends.byGroup.get(law)?.outcomes ?? []).toEqual([])
  })

  // 127/ME XXVIII: the B-VG is divided into Artikel. The oracle keyed
  // „Artikel 53." as the engine's „53" in such a law; the page read no unit.
  it('finds „Artikel 53." in a law whose units are Artikel, and says „nicht gefunden" at an Artikel no instruction we read names (127/ME XXVIII)', () => {
    const law = '(Verfassungsbestimmung)'
    const rows = [
      row(null, { kind: 'article', law, heading: law, current: '', proposed: '', change: 'unchanged', check: 'unchecked', owesCheck: false }),
      row('Artikel 53.', { law, current: '(1) und (2) …', proposed: '(1) und (2) …', change: 'unchanged', elided: true }),
      row('Artikel 53.', { law, gld: null, current: '(3) Alle Organe des Bundes, der Länder, der Gemeinden …', proposed: '(3) Alle Organe des Bundes, der Länder, der Gemeinden … sowie der Bundesstaatsanwaltschaft …' }),
      row('Artikel 94b.', { law, current: '', proposed: 'Die Bundesstaatsanwaltschaft übt die Fachaufsicht über die Staatsanwaltschaften aus …', change: 'inserted', check: 'unchecked' }),
    ]
    expect(articleUnitLaws(rows)).toEqual(new Set([law]))
    const grouped = rowsByParagraph(rows.map((r) => ({ ...r, proposed: r.proposed ?? '', current: r.current ?? '' })) as never)
    expect(paragraphRows(grouped, '53', law)).toHaveLength(2)
    const { placement, at } = carried(rows, response([shown('53', law)], [held('94', 'verweigert', law)]))
    expect(at).toEqual([['53'], ['nicht-gefunden']])
    expect(placement.ends.byGroup.get(law)?.outcomes.map((o) => o.id)).toEqual(['94'])
  })

  // 127/ME XXVIII: „Artikel 90a." left, „Artikel 94a." right, and Art. 94b
  // new. The server now answers under the numbers the insertion creates;
  // the page compared numbers through the § reader, which reads no Artikel,
  // so „90a → 94a" was no renumbering and the vacated 90a stood at the end.
  it('places a renumbered Artikel under its new number and takes the number it vacated (127/ME XXVIII)', () => {
    const law = '(Verfassungsbestimmung)'
    const rows = [
      row(null, { kind: 'article', law, heading: 'Artikel 1 — Änderung des Bundes-Verfassungsgesetzes', current: '', proposed: '', change: 'unchanged', check: 'unchecked', owesCheck: false }),
      row('Artikel 53.', { law, gld: null, current: '(3) Alle Organe des Bundes, der Länder, der Gemeinden …', proposed: '(3) Alle Organe des Bundes, der Länder, der Gemeinden … sowie der Bundesstaatsanwaltschaft …' }),
      row('Artikel 90a.', { law, gld: null, paraAfter: 'Artikel 94a.', current: '', proposed: '2. Staatsanwaltschaftliche Behörden', change: 'inserted' }),
      row('Artikel 90a.', { law, paraAfter: 'Artikel 94a.', current: 'Staatsanwälte sind Organe der ordentlichen Gerichtsbarkeit. In Verfahren …', proposed: 'Artikel 94a. Die Staatsanwälte sind Organe der ordentlichen Gerichtsbarkeit. Sie sind …' }),
      row('Artikel 94b.', { law, current: '', proposed: 'Die Bundesstaatsanwaltschaft übt die Fachaufsicht über die Staatsanwaltschaften aus …', change: 'inserted', check: 'unchecked' }),
    ]
    const kons = response([shown('53', law)], [held('90a', 'entfaellt', law), held('94', 'verweigert', law), held('94a', 'verweigert', law), held('94b', 'verweigert', law)])
    const { placement, at } = carried(rows, kons)
    expect(at).toEqual([['53'], ['verweigert'], ['verweigert']])
    // Art. 94, the insertion's anchor, has no rows; the vacated 90a is said by its struck rows.
    expect(placement.ends.byGroup.get(law)?.outcomes.map((o) => o.id)).toEqual(['94'])
    expect(placement.lost).toEqual([])
  })

  it('still finds a renumbered Artikel under its old number where nothing stands under the new one', () => {
    const law = 'Änderung des Bundes-Verfassungsgesetzes'
    const rows = [row('Artikel 90a.', { law, paraAfter: 'Artikel 94a.' }), row('Artikel 53.', { law })]
    // The engine changed Art. 90a and knows no 94a: through the § reader both numbers were nothing, „equal", and the lookup stopped.
    expect(carried(rows, response([shown('53', law)], [held('90a', 'verweigert', law)])).at).toEqual([['verweigert'], ['53']])
  })

  it('keeps „Artikel 1." no unit in a law that sets §§ inside its Artikel, on the page as in the oracle', () => {
    const law = 'Änderung des Begleitgesetzes'
    const rows = [row('Artikel 1.', { law, current: 'Dieses Gesetz gilt für alle alt.' }), row('§ 1.', { law, current: '(1) alt' })]
    expect(articleUnitLaws(rows)).toEqual(new Set())
    expect(carried(rows, response([shown('1', law)], [])).at).toEqual([[], ['1']])
  })
})

describe('witnessNote — a § shown on the draft\'s own text (20.11.2026)', () => {
  const shown = (draftWitness?: ConsolidatedParagraph['draftWitness']): ConsolidatedParagraph => ({ id: '94m', segments: [], headingSegments: null, risUrl: null, annexLaw: null, ...(draftWitness ? { draftWitness } : {}) })

  it('says nothing at a § the annex confirms', () => {
    expect(witnessNote(shown())).toBeNull()
  })

  it('names both wordings at each place, as our reading, and what is shown', () => {
    const one = [{ annex: 'dem 30. Juni 2025 begangen', draft: 'dem 30. Juni 2024 begangen' }]
    expect(witnessNote(shown(one))).toEqual({
      lead: 'Hier stimmt die Textgegenüberstellung, wie wir sie lesen, nicht mit dem Gesetzestext des Entwurfs überein:',
      places: one,
      close: 'Gezeigt ist der Gesetzestext; so steht er auch in der PDF-Fassung des Entwurfs im RIS.',
    })
    const two = witnessNote(shown([{ annex: 'a', draft: 'b' }, { annex: 'c', draft: 'd' }]))!
    expect(two.lead).toMatch(/^An zwei Stellen stimmt /)
    expect(two.places).toHaveLength(2)
  })
})

describe('a law with no group in the annex (21.11.2026)', () => {
  // „fand der Monitor", as `unplacedText` hedges: the part may be there under a designation the monitor reads differently.
  it('is said as the monitor’s finding, never as what the annex does not contain', () => {
    expect(NO_PART_IN_ANNEX_DE).toBe('In der Gegenüberstellung des Ministeriums fand der Monitor zu diesem Gesetz keinen Teil.')
    const end = readFileSync(new URL('../app/components/compare/AnnexLawEnd.vue', import.meta.url), 'utf8')
    expect(end).toContain('NO_PART_IN_ANNEX_DE')
    expect(end).not.toMatch(/enthält die Gegenüberstellung/)
  })
})
