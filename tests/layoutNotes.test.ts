import { describe, expect, it } from 'vitest'
import { FIGURE_NOT_COMPARED_DE, TABLE_AS_TEXT_DE } from '../shared/utils/figureMark'
import { splitGap } from '../shared/utils/gaps'
import { parseLawUnits, parseLawUnitsFromRis } from '../server/utils/lawtext/lawUnits'
import { diffLawPackage } from '../server/utils/diff/lawDiff'
import { layoutNotes, unitLayoutNotes } from '../app/utils/layoutNotes'

/**
 * A table's cells and an image, said wherever the page prints them
 * (21.11.2026): both readers mark a block that stands in a table, the
 * comparison carries the mark to its unit (`LawDiffUnit.table`), and the
 * page owes the table's sentence there as it owes the figure's.
 */

const head = `<p class=11Titel>Bundesgesetz, mit dem das X-Gesetz ge&auml;ndert wird</p>` +
  `<p class=12PromKlEinlSatz>Das X-Gesetz, BGBl. I Nr. 1/2000, wird wie folgt ge&auml;ndert:</p>`
const html = (body: string) => `<html><body>${head}${body}</body></html>`
const fee = (cell: string) =>
  html(`<p class=21NovAo1>1. Anhang 1 lautet:</p><table><tr><td><p class=51Abs>Antrag</p></td><td><p class=51Abs>${cell}</p></td></tr></table>`)
const plain = (text: string) => html(`<p class=21NovAo1>1. &sect;&nbsp;2 lautet:</p><p class=51Abs>${text}</p>`)

const ris = (payload: string) =>
  `<risdok><nutzdaten><abschnitt><ueberschrift typ="titel">Bundesgesetz, mit dem das X-Gesetz ge&auml;ndert wird</ueberschrift>` +
  `<absatz typ="promkleinlsatz">Das X-Gesetz, BGBl. I Nr. 1/2000, wird wie folgt ge&auml;ndert:</absatz>` +
  `<absatz typ="novao1">1. Anhang 1 lautet:</absatz>${payload}</abschnitt></nutzdaten></risdok>`

describe('a unit from a table', () => {
  it('is marked from Parliament’s HTML, in either version, and the page says how it was compared', () => {
    const d = diffLawPackage(parseLawUnits(fee('100 Euro')), parseLawUnits(fee('120 Euro')))
    expect(d.units.map((u) => [u.change, u.table])).toEqual([['changed', true]])
    expect(unitLayoutNotes(d.units)).toEqual([TABLE_AS_TEXT_DE])
  })

  it('is marked from RIS’s XML', () => {
    const table = '<table><tr><td><absatz typ="abs">Antrag</absatz></td><td><absatz typ="abs">100 Euro</absatz></td></tr></table>'
    const d = diffLawPackage(parseLawUnitsFromRis(ris(table)), parseLawUnitsFromRis(ris(table)))
    expect(d.units.map((u) => [u.change, u.table])).toEqual([['unchanged', true]])
  })

  it('stays unmarked outside a table, and owes no sentence', () => {
    const d = diffLawPackage(parseLawUnits(plain('Der Antrag kostet 100 Euro.')), parseLawUnits(plain('Der Antrag kostet 120 Euro.')))
    expect(d.units[0]!.table).toBeUndefined()
    expect(unitLayoutNotes(d.units)).toEqual([])
  })
})

describe('the sentences outside a change', () => {
  it('names an image and a table once each for a fold of units', () => {
    const units = [
      { fromText: 'Zusatztafel [Abbildung]', toText: 'Zusatztafel [Abbildung]' },
      { fromText: 'a', toText: 'a', table: true as const },
      { fromText: 'b', toText: 'b [Abbildung]', table: true as const },
    ]
    expect(unitLayoutNotes(units)).toEqual([FIGURE_NOT_COMPARED_DE, TABLE_AS_TEXT_DE])
  })

  it('names an image in any text it is handed — a Lesefassung’s runs, a Begründung’s passages', () => {
    expect(layoutNotes([null, 'Der Text', 'neben [Abbildung] steht'])).toEqual([FIGURE_NOT_COMPARED_DE])
    expect(layoutNotes(['Der Text', undefined])).toEqual([])
  })

  it('opens the table sentence with the lead word of the monitor’s own scope', () => {
    expect(splitGap(TABLE_AS_TEXT_DE)?.kind).toBe('outOfScope')
  })
})
