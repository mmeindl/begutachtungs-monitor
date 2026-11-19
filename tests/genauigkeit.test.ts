import { describe, expect, it } from 'vitest'
import type { GenauigkeitRecord } from '../shared/types'
import {
  ANNEX_BLIND,
  ANNEX_LOST,
  ANNEX_MISFILED,
  FUNNEL_GROUP_OF,
  GENAUIGKEIT,
  GENAUIGKEIT_GRENZEN,
  GENAUIGKEIT_INSTRUMENTE,
  GENAUIGKEIT_WEG,
  LAND_BLIND,
  LAND_OTHER_DRAFT,
  LAND_OWN_DRAFT,
  RESULT_BLIND,
  RESULT_STRUCTURE,
  RESULT_WORDS,
  WEG_BEISPIEL,
  funnelRows,
  genauigkeitArten,
  measuredLineDe,
  rangeDe,
  shareDe,
} from '../shared/utils/genauigkeit'

/**
 * `/genauigkeit` (19.11.2026): the figures of a measurement round in words.
 * What these hold is that no sentence can say more than the record does —
 * a share rounded up, a class of fault left out of every range, a count of
 * 0 read as a number, a funnel that does not add up.
 */

describe('shareDe', () => {
  it('rounds down to a tenth, so a share never claims a catch that was not measured', () => {
    expect(shareDe(1391, 1393)).toBe('99,8')
    expect(shareDe(1393, 1393)).toBe('100')
    expect(shareDe(1392, 1393)).toBe('99,9')
    expect(shareDe(3, 14)).toBe('21,4')
    expect(shareDe(0, 551)).toBe('0')
    expect(shareDe(1, 1000)).toBe('0,1')
  })
})

describe('rangeDe', () => {
  it('names the lowest and the highest share, and one figure where they agree', () => {
    expect(rangeDe([{ key: 'a', tried: 100, caught: 99 }, { key: 'b', tried: 10, caught: 10 }])).toBe('99,0 bis 100\u00a0%')
    expect(rangeDe([{ key: 'a', tried: 10, caught: 10 }, { key: 'b', tried: 3, caught: 3 }])).toBe('100\u00a0%')
  })

  it('leaves out a class that was never tried, rather than reading it as 0 %', () => {
    expect(rangeDe([{ key: 'a', tried: 0, caught: 0 }, { key: 'b', tried: 4, caught: 4 }])).toBe('100\u00a0%')
  })
})

describe('the fault classes', () => {
  it('places every class the record carries in exactly one group, so a new one needs a decision', () => {
    const result = [...RESULT_WORDS, ...RESULT_STRUCTURE, ...RESULT_BLIND] as string[]
    const annex = [...ANNEX_MISFILED, ...ANNEX_LOST, ...ANNEX_BLIND] as string[]
    const land = [...LAND_OWN_DRAFT, ...LAND_OTHER_DRAFT, ...LAND_BLIND] as string[]
    for (const [groups, keys] of [
      [result, [...GENAUIGKEIT.lesefassung.faults.pdf, ...GENAUIGKEIT.lesefassung.faults.table].map((f) => f.key)],
      [annex, [...GENAUIGKEIT.annex.faults.pdf, ...GENAUIGKEIT.annex.faults.table].map((f) => f.key)],
      [land, GENAUIGKEIT.laender.tgu.faults.map((f) => f.key)],
    ] as const) {
      expect(new Set(groups).size).toBe(groups.length)
      for (const key of keys) expect(groups).toContain(key)
    }
  })
})

describe('funnelRows', () => {
  it('starts with the shown, and the rows add up to every § changed', () => {
    const rows = funnelRows()
    expect(rows[0]!.key).toBe('gezeigt')
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(GENAUIGKEIT.lesefassung.funnel.changed)
    for (const row of rows.slice(1)) {
      expect(row.causes.reduce((n, c) => n + c.count, 0)).toBe(row.count)
      for (const c of row.causes) expect(FUNNEL_GROUP_OF[c.cause]).toBe(row.key)
    }
  })

  it('orders the groups and their causes by size', () => {
    const rows = funnelRows({ drafts: 2, changed: 10, shown: 1, causes: { verweigert: 2, 'anhang-fremd': 3, 'anhang-schweigt': 4 } })
    expect(rows.map((r) => [r.key, r.count])).toEqual([['gezeigt', 1], ['beilage', 7], ['zusammensetzen', 2]])
    expect(rows[1]!.causes.map((c) => c.cause)).toEqual(['anhang-schweigt', 'anhang-fremd'])
  })
})

describe('genauigkeitArten', () => {
  const lines = (r?: GenauigkeitRecord) => genauigkeitArten(r).flatMap((a) => [a.where, a.against, ...a.measured, ...a.injected, ...a.missed])

  it('says every figure from the record, each sentence closed', () => {
    const all = lines()
    for (const line of all) {
      expect(line).not.toMatch(/undefined|NaN|null|Paragraf(?!h)/)
      expect(line).toMatch(/[.:]$/)
    }
    const b = GENAUIGKEIT.lesefassung.bench
    expect(all.join(' ')).toContain(`sind ${b.identical} Wort für Wort das Gesetz`)
  })

  it('reads a count of 0 as „keiner", never as a figure', () => {
    const zero: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    zero.lesefassung.bench = { ...zero.lesefassung.bench, shown: 10, identical: 10, invented: 0, incomplete: 0, otherwise: 0 }
    zero.stations = { ...zero.stations, breaches: 0, nullSubstantive: 0 }
    zero.laender.stations = { ...zero.laender.stations, hits: 0, accepted: 0 }
    const all = lines(zero).join(' ')
    expect(all).toContain('sind 10 Wort für Wort das Gesetz. Ein Wort, das nicht im Gesetz steht, hat keiner.')
    expect(all).toContain('keiner verletzt diese Regeln')
    expect(all).toContain('alle als „redaktionell“ markiert.')
    expect(all).not.toMatch(/bis auf 0|\b0 Stellen/)
  })

  it('names what is not the law in force, by kind', () => {
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    r.lesefassung.bench = { ...r.lesefassung.bench, shown: 10, identical: 7, invented: 1, incomplete: 1, otherwise: 1 }
    const measured = genauigkeitArten(r)[0]!.measured[0]!
    expect(measured).toContain('sind 7 Wort für Wort das Gesetz. Einem fehlt ein Teil, einer ist aus einem anderen Grund nicht das Gesetz. Ein Wort, das nicht im Gesetz steht, hat einer.')
  })

  it('gives every kind an anchor of its own, the ones the method notes link to', () => {
    expect(genauigkeitArten().map((a) => a.id)).toEqual(['lesefassung', 'gegenueberstellung', 'stationen', 'land-gegenueberstellung', 'land-stationen'])
  })
})

describe('the § on its way', () => {
  it('shows a result that is the standing text with the instruction applied', () => {
    const equal = WEG_BEISPIEL.result.filter((s) => s.type !== 'inserted').map((s) => s.text.replace(/^… |\s…$/g, '')).join(' ')
    expect(WEG_BEISPIEL.standing).toContain(equal)
    for (const s of WEG_BEISPIEL.result.filter((x) => x.type !== 'equal')) expect(WEG_BEISPIEL.instruction).toContain(`"${s.text}"`)
  })

  it('names a source of error at every step that makes something', () => {
    expect(GENAUIGKEIT_WEG.filter((s) => s.key !== 'gezeigt').every((s) => s.risk && s.who)).toBe(true)
  })
})

describe('the record', () => {
  it('is dated and names the commit it measured', () => {
    expect(GENAUIGKEIT.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(GENAUIGKEIT.commit).toMatch(/^[0-9a-f]{7,40}$/)
    expect(measuredLineDe()).toMatch(/^Gemessen am \d{2}\.\d{2}\.\d{4} an den Entwürfen der [IVXL]+\. Gesetzgebungsperiode\.$/)
  })

  it('links every instrument by its path in the repository', () => {
    for (const tool of GENAUIGKEIT_INSTRUMENTE) expect(tool.file).toMatch(/^scripts\/harness\/\w+\.ts$/)
    expect(GENAUIGKEIT_GRENZEN.length).toBeGreaterThan(0)
  })
})
