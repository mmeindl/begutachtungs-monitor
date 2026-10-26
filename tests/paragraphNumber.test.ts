import { describe, expect, it } from 'vitest'
import { bareParaId } from '../server/utils/text/designation'
import { paraIdOfGld, stripMarkers } from '../server/utils/kons/tguOracle'
import { annexUnitId, explanationParaId } from '../shared/utils/explanationKey'
import { createdUnits, mentionedUnits, parseAddress } from '../server/utils/kons/novao'
import { parsePayload } from '../server/utils/kons/lawApply'
import { refusedLineUnits } from '../server/utils/kons/konsGate'
import { parseKonsParagraph } from '../server/utils/lawtext/konsTree'
import { headingAddress } from '../server/utils/explanations/risExplanations'
import { elisionOpens } from '../server/utils/annex/elision'

/**
 * One § number, read the same by every reader (`shared/utils/paragraphNumber.ts`).
 * 707EA278 has „§ 6.01a" beside „§ 6.01", the Gewerbeordnung „§ 365m1" beside
 * „§ 365m": each reader dropped one part or another, and the one § fell onto
 * the other (26.10.2026).
 */
const NUMBERS: [string, string][] = [
  ['§ 54c.', '54c'],
  ['§ 8.03.', '8.03'],
  ['§ 5.', '5'],
  ['§ 42wird', '42'],
  ['§ 243ba', '243ba'],
  ['§ 31Abs. 3', '31'],
  ['§ 6.01a', '6.01a'],
  ['§ 10.07a.', '10.07a'],
  ['§ 365m1.', '365m1'],
  ['§ 52a1', '52a1'],
]

describe('a § number, read the same everywhere (26.10.2026)', () => {
  it('in the engine, the Beilage and the page key', () => {
    for (const [designation, id] of NUMBERS) {
      expect(bareParaId(designation), designation).toBe(id)
      expect(paraIdOfGld(designation), designation).toBe(id)
      expect(explanationParaId(designation), designation).toBe(id)
      expect(annexUnitId(designation), designation).toBe(id)
    }
  })

  it('in the grammar: the address, the units a line names, and those it creates', () => {
    for (const [designation, id] of NUMBERS) {
      expect(parseAddress(`${designation} lautet`)?.para, designation).toBe(`§ ${id}`)
      expect(mentionedUnits(`In ${designation.replace(/\.$/, '')} entfällt die Z 2.`), designation).toContain(`§ ${id}`)
    }
    expect(createdUnits('Nach § 10.07 wird folgender § 10.07a eingefügt:')).toEqual(['§ 10.07a'])
    expect(parseAddress('In § 6.01a Z 1 entfällt die Bezeichnung')).toMatchObject({ para: '§ 6.01a', z: '1' })
  })

  it('in a payload, with the Kapitel number printed without its full stop', () => {
    // 707EA278: „§ 10.07a Sorgfaltspflicht …" went in as a § 10.
    expect(parsePayload([{ text: '§ 10.07a Sorgfaltspflicht beim Bunkern', heading: true }, '1. Erste Ziffer.']).map((p) => p.id)).toEqual(['10.07a'])
    expect(parsePayload(['§ 365m1. (1) Text.']).map((p) => p.id)).toEqual(['365m1'])
    expect(parsePayload(['§ 5. Text.', '§ 6 Text.']).map((p) => p.id)).toEqual(['5'])
  })

  it('in the oracle\'s comparison form', () => {
    expect(stripMarkers('§ 6.01a. Text')).toBe('Text')
    expect(stripMarkers('§ 8.03 Sicherheit an Bord')).toBe('Sicherheit an Bord')
    expect(stripMarkers('nach § 5 Abs. 2')).toBe('nach § 5 Abs. 2')
  })

  it('in the lock of a refused line, whose floor read „§ 1.01" as „§ 1"', () => {
    const units = refusedLineUnits('§ 1.01 lit. b Z 3 und 4 lautet:')
    expect(units).toContain('§ 1.01')
    expect(units).not.toContain('§ 1')
  })

  it('in a RIS § document, a passage heading and an elision line', () => {
    const xml = `<risdok><nutzdaten><abschnitt><absatz typ="abs" ct="text"><gldsym>§ 6.01a.</gldsym> Text.</absatz></abschnitt></nutzdaten></risdok>`
    expect(parseKonsParagraph(xml)?.id).toBe('6.01a')
    expect(headingAddress('Zu Z 50 und Z 51 (§ 6.01a):').paragraphs).toEqual(['§ 6.01a'])
    expect(headingAddress('Zu § 103z4:').paragraphs).toEqual(['§ 103z4'])
    expect(elisionOpens('§ 6.01a Z 1 bis 3 …', '§ 6.01a Z 1 bis 3 …')).toBe('§ 6.01a.')
  })

  it('in a passage heading\'s range and list: the last digits counted, no letter invented', () => {
    expect(headingAddress('Zu §§ 99e1 bis 99e4:').paragraphs).toEqual(['§ 99e1', '§ 99e2', '§ 99e3', '§ 99e4'])
    expect(headingAddress('Zu §§ 6.09 bis 6.11:').paragraphs).toEqual(['§ 6.09', '§ 6.10', '§ 6.11'])
    expect(headingAddress('Zu §§ 23 bis 25 NO:').paragraphs).toEqual(['§ 23', '§ 24', '§ 25'])
    // Letters in between are not ours to invent.
    expect(headingAddress('Zu §§ 140a bis 140i:').paragraphs).toEqual(['§ 140a'])
    expect(headingAddress('Zu §§ 365m1 und 365n1:').paragraphs).toEqual(['§ 365m1', '§ 365n1'])
    expect(headingAddress('Zu §§ 6.01a, 6.02 und 6.03:').paragraphs).toEqual(['§ 6.01a', '§ 6.02', '§ 6.03'])
  })
})
