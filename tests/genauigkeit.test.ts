import { describe, expect, it } from 'vitest'
import type { GenauigkeitRecord } from '../shared/types'
import { formatNumberDe } from '../shared/utils/format'
import {
  ANNEX_GATE_ALONE,
  CHAIN_LABEL,
  CHAIN_IN_ROW,
  CHAIN_LOST,
  CHAIN_MIRRORED,
  CHAIN_MISFILED,
  CHAIN_STRUCK,
  CHAIN_WORDING,
  BENCH_OTHERWISE_READ,
  DRAFT_PATH_DIFFERS_READ,
  FUNNEL_GROUP_OF,
  GENAUIGKEIT,
  GENAUIGKEIT_GRENZEN,
  GENAUIGKEIT_WEG,
  LAND_WORDING,
  LAND_OTHER_DRAFT,
  LAND_OWN_DRAFT,
  NULL_RESIDUES_READ,
  benchCoversPeriod,
  RESULT_BLIND,
  RESULT_BLIND_COMMA,
  RESULT_BLIND_EDGE,
  RESULT_STRUCTURE,
  RESULT_WITNESS,
  RESULT_WORDS,
  FAST_IMMER,
  fewTriesDe,
  weakFigureDe,
  WEG_BEISPIEL,
  faultNoteDe,
  fehlerBild,
  funnelRows,
  genauigkeitArten,
  genauigkeitKurz,
  gesetzProbe,
  largestRemainder,
  measuredLineDe,
  partDe,
  rangeDe,
  shareDe,
  tenthsDe,
  wegFunnel,
} from '../shared/utils/genauigkeit'

/**
 * `/genauigkeit` (19.11.2026): the figures of a measurement round in words.
 * What these hold is that no sentence can say more than the record does —
 * a share rounded up, a class of fault left out of every range, a count of
 * 0 read as a number, a funnel that does not add up.
 */

/**
 * The record with the ministry's annex at figures of its own: what the page
 * shows of a § (`marks`) and the faults judged through the whole chain
 * (`chain`), the same on both paths.
 */
function withMarks(): GenauigkeitRecord {
  const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
  const shown = r.annex.confirmed + r.annex.unchecked
  r.annex.marks = { shown, clean: shown - 640 - 618, unconfirmed: 640, unchecked: 618 }
  const chain = [
    { key: 'zahl', tried: 100, caught: 99, withheld: 0, held: true as const },
    { key: 'wort', tried: 100, caught: 98, withheld: 0, held: true as const },
    { key: 'satzweg', tried: 50, caught: 49, withheld: 0, held: true as const },
    { key: 'bezeichnung', tried: 40, caught: 36, withheld: 0 },
    { key: 'rweg', tried: 80, caught: 70, withheld: 2 },
    { key: 'links', tried: 60, caught: 48, withheld: 40 },
    { key: 'ralt', tried: 30, caught: 30, withheld: 30 },
    { key: 'rneu', tried: 30, caught: 27, withheld: 20 },
    { key: 'u', tried: 40, caught: 39, withheld: 0, held: true as const },
    { key: 'uzeile', tried: 50, caught: 40, withheld: 35 },
  ]
  r.annex.chain = { pdf: chain, table: structuredClone(chain) }
  return r
}

/**
 * The record with the two comma classes a round since 21.11.2026 tries, at
 * figures of its own: one comma lost where a changed row of the annex prints
 * the place, one where none does.
 */
function withComma(): GenauigkeitRecord {
  const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
  for (const path of ['pdf', 'table'] as const) {
    r.lesefassung.faults[path] = [
      ...r.lesefassung.faults[path].filter((f) => !f.key.includes('Komma')),
      { key: 'Komma', tried: 100, caught: 99 },
      { key: 'Ungedruckt-Komma', tried: 100, caught: 1 },
    ]
  }
  return r
}

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

describe('partDe', () => {
  it('rounds a part of a whole to the nearest tenth, the one figure both the sentence and the bar print', () => {
    expect(partDe(2966, 4694)).toBe('63,2')
    expect(partDe(1, 3)).toBe('33,3')
    expect(partDe(5, 5)).toBe('100,0')
  })
})

describe('largestRemainder', () => {
  it('rounds the parts of one whole so they add up to exactly the unit (24.11.2026)', () => {
    // One by one these round to 73 + 11 + 12 + 4 = 100 only by luck; 1/3 each rounds to 33 + 33 + 33.
    expect(largestRemainder([1, 1, 1], 100)).toEqual([34, 33, 33])
    expect(largestRemainder([4654, 715, 731, 253], 100)).toEqual([73, 11, 12, 4])
    expect(largestRemainder([0, 5], 100)).toEqual([0, 100])
    expect(largestRemainder([0, 0], 100)).toEqual([0, 0])
    for (const counts of [[14, 868, 463, 383, 2966], [1, 2, 3, 4, 5, 6, 7]]) {
      expect(largestRemainder(counts, 1000).reduce((a, b) => a + b, 0)).toBe(1000)
    }
  })

  it('prints tenths of a percent with a comma, and the whole without one', () => {
    expect(tenthsDe(632)).toBe('63,2')
    expect(tenthsDe(3)).toBe('0,3')
    expect(tenthsDe(1000)).toBe('100')
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
    const result = [...RESULT_WORDS, ...RESULT_STRUCTURE, ...RESULT_BLIND, ...RESULT_BLIND_COMMA, ...RESULT_BLIND_EDGE, ...RESULT_WITNESS] as string[]
    const annex = [...ANNEX_GATE_ALONE] as string[]
    const land = [...LAND_OWN_DRAFT, ...LAND_OTHER_DRAFT, ...LAND_WORDING] as string[]
    const chain = [...CHAIN_WORDING, ...CHAIN_LABEL, ...CHAIN_STRUCK, ...CHAIN_LOST, ...CHAIN_MISFILED, ...CHAIN_MIRRORED, ...CHAIN_IN_ROW] as string[]
    for (const [groups, keys] of [
      [result, [...GENAUIGKEIT.lesefassung.faults.pdf, ...GENAUIGKEIT.lesefassung.faults.table].map((f) => f.key)],
      [annex, [...GENAUIGKEIT.annex.faults.pdf, ...GENAUIGKEIT.annex.faults.table].map((f) => f.key)],
      [land, GENAUIGKEIT.laender.tgu.faults.map((f) => f.key)],
      [chain, [...GENAUIGKEIT.annex.chain.pdf, ...GENAUIGKEIT.annex.chain.table].map((f) => f.key)],
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
    const rows = funnelRows({ drafts: 2, changed: 10, shown: 1, notRun: {}, causes: { verweigert: 2, 'anhang-fremd': 3, 'anhang-schweigt': 4 } })
    expect(rows.map((r) => [r.key, r.count])).toEqual([['gezeigt', 1], ['beilage', 7], ['anweisung', 2]])
    expect(rows[1]!.causes.map((c) => c.cause)).toEqual(['anhang-schweigt', 'anhang-fremd'])
  })
})

describe('wegFunnel', () => {
  it('carries the §§ shown on the draft\'s own text apart, and none in a round before them', () => {
    expect(wegFunnel({ drafts: 1, changed: 10, shown: 5, witnessed: 2, notRun: {}, causes: { verweigert: 5 } }).witnessed).toBe(2)
    expect(wegFunnel({ drafts: 1, changed: 10, shown: 5, notRun: {}, causes: { verweigert: 5 } }).witnessed).toBe(0)
  })

  it('counts only the §§ with a proposed version to compose, and names the others beside the figure', () => {
    const f = wegFunnel({ drafts: 1, changed: 20, shown: 8, notRun: {}, causes: { verweigert: 4, unplausibel: 2, 'anhang-schweigt': 3, entfaellt: 2, 'neu-erlassen': 1 } })
    expect(f.total).toBe(17)
    expect(f.outside).toBe(3)
    expect(f.shown).toBe(8)
  })

  it('passes every § through the steps in order, and loses none between them', () => {
    const f = wegFunnel()
    expect(f.stufen.map((s) => s.key)).toEqual(['geltend', 'anweisung', 'beilage', 'pruefung'])
    expect(f.shown + f.stufen.reduce((n, s) => n + s.dropped, 0)).toBe(f.total)
    expect(f.total + f.outside).toBe(GENAUIGKEIT.lesefassung.funnel.changed)
    expect(f.stufen.at(-1)!.remaining).toBe(f.shown)
    for (const s of f.stufen) expect(s.dropped).toBe(s.row?.count ?? 0)
  })

  it('prints shares that subtract exactly from step to step (24.11.2026)', () => {
    for (const f of [wegFunnel(), wegFunnel({ drafts: 1, changed: 7, shown: 1, notRun: {}, causes: { 'gesetz-unbekannt': 1, verweigert: 2, 'anhang-schweigt': 1, unplausibel: 2 } })]) {
      let tenths = 1000
      for (const s of f.stufen) {
        tenths -= s.droppedTenths
        expect(s.remainingTenths).toBe(tenths)
      }
      // The figure at the page's top is the funnel's last.
      expect(genauigkeitKurz().kacheln[1]!.value).toBe(`${tenthsDe(wegFunnel().stufen.at(-1)!.remainingTenths)}\u00a0%`)
    }
  })

  it('names a step that no § ended at, without a reason under it', () => {
    const f = wegFunnel({ drafts: 1, changed: 10, shown: 6, notRun: {}, causes: { verweigert: 4 } })
    expect(f.stufen.map((s) => s.dropped)).toEqual([0, 4, 0, 0])
    expect(f.stufen[0]!.row).toBeNull()
  })
})

describe('genauigkeitArten', () => {
  const lines = (r?: GenauigkeitRecord) => genauigkeitArten(r).flatMap((a) => [a.against, ...a.result, a.rule, ...a.measured, ...a.missed])

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
    expect(all).toContain('kein Regelverstoß.')
    expect(all).toContain('alle als „redaktionell“ markiert.')
    zero.stations = { ...zero.stations, nullResidues: 0 }
    expect(lines(zero).join(' ')).toContain('Textteilen keinen Unterschied.')
    expect(all).not.toMatch(/bis auf 0|\b0 Stellen/)
  })

  it('names what is not the law in force, by kind', () => {
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    r.lesefassung.bench = { ...r.lesefassung.bench, shown: 10, identical: 6, invented: 1, incomplete: 1, otherwise: 2 }
    const measured = genauigkeitArten(r)[0]!.measured[1]!
    expect(measured).toContain('sind 6 Wort für Wort das Gesetz. Einem fehlt ein Teil, 2 sind aus einem anderen Grund nicht das Gesetz. Ein Wort, das nicht im Gesetz steht, hat einer.')
  })

  it('names the read case only while the count is the one that was read (24.11.2026)', () => {
    expect(GENAUIGKEIT.lesefassung.bench.otherwise).toBe(BENCH_OTHERWISE_READ)
    expect(genauigkeitArten()[0]!.measured[1]!).toContain('Bei einem setzt das RIS nach der Änderung einen Bindestrich, wo vorher ein Gedankenstrich stand; keine Anweisung ordnet das an.')
  })

  it('draws every class of fault in one bar, the tries adding up to the record', () => {
    const [lesefassung, annex, , land] = genauigkeitArten()
    const tries = (faults: { tried: number }[]) => faults.reduce((n, f) => n + f.tried, 0)
    expect(tries(lesefassung!.faults)).toBe(tries([...GENAUIGKEIT.lesefassung.faults.pdf, ...GENAUIGKEIT.lesefassung.faults.table]))
    // The ministry's annex: every class as the whole chain judges it (23.11.2026).
    const chain = GENAUIGKEIT.annex.chain
    expect(tries(annex!.faults)).toBe(tries([...chain.pdf, ...chain.table]))
    for (const art of genauigkeitArten()) for (const fault of art.faults) expect(fault.tried).toBeGreaterThan(0)
    expect(tries(land!.faults)).toBe(tries([...GENAUIGKEIT.laender.tgu.faults, ...GENAUIGKEIT.laender.tgu.left, GENAUIGKEIT.laender.tgu.struckKept]))
  })

  it('sets a comma lost in text the draft leaves unchanged apart as a blind spot, and counts one at a changed place with the words (21.11.2026)', () => {
    const art = genauigkeitArten(withComma())[0]!
    expect(art.faults.find((f) => f.label.startsWith('Ein Komma'))).toEqual({ label: 'Ein Komma fehlt in Text, den der Entwurf unverändert lässt', tried: 200, caught: 2, blind: true, why: 'Dort vergleicht die Prüfung die Wörter, nicht die Satzzeichen.' })
    expect(art.missed).toContain('Fehlt unserem Ergebnis ein Komma in Text, den der Entwurf unverändert lässt, fällt das kaum auf: 2 von 200 Versuchen gefangen. Dort vergleicht die Prüfung die Wörter, nicht die Satzzeichen.')
    // The comma at a changed place is one of the words: without it their bar is 200 tries and 198 catches shorter.
    const before = withComma()
    for (const path of ['pdf', 'table'] as const) before.lesefassung.faults[path] = before.lesefassung.faults[path].filter((f) => f.key !== 'Komma')
    const without = genauigkeitArten(before)[0]!
    expect(art.faults[0]!.tried - without.faults[0]!.tried).toBe(200)
    expect(art.faults[0]!.caught - without.faults[0]!.caught).toBe(198)
  })

  it('draws the station comparison\'s injected changes as a bar, and says them in a sentence, once a round carries them', () => {
    expect(genauigkeitArten()[2]!.faults).toEqual(GENAUIGKEIT.stations.faults?.length ? [expect.objectContaining({ tried: expect.any(Number) })] : [])
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    r.stations.faults = [{ key: 'ziffer', tried: 40, caught: 40 }, { key: 'minus', tried: 30, caught: 28 }]
    const art = genauigkeitArten(r)[2]!
    expect(art.faults).toEqual([{ label: expect.stringContaining('in einem der beiden Texte geändert'), tried: 70, caught: 68, shownAsChange: true, weakest: '93,3', weakestShare: 28 / 30 }])
    // Below the line, under its own heading, and named as what it counts (24.11.2026).
    expect(fehlerBild(art.faults)).toMatchObject({ strong: [], weakLabel: 'Nicht immer als Änderung gezeigt' })
    // Caught there means shown as a change, the opposite of what the page's other bars count (23.11.2026).
    expect(faultNoteDe(art.faults[0]!)).toBe('68 von 70 eingebauten Änderungen als Änderung gezeigt · schwächster Fall 93,3\u00a0%')
    expect(art.faultsHeading).toBe('Eingebaute Änderungen im Vergleich der Fassungen')
    expect(art.missed.join(' ')).toContain('Wie oft das vorkommt, misst dieser Test nicht.')
    expect(art.measured.join(' ')).toContain('70 eingebaute Änderungen')
    expect(art.measured.join(' ')).toContain('Der Vergleich zeigt 68 als Änderung.')
    expect(art.rule).toContain('Dazu ändern wir in echten Texten je die erste passende Stelle')
    r.stations.faults = [{ key: 'ziffer', tried: 40, caught: 40 }]
    expect(genauigkeitArten(r)[2]!.measured.join(' ')).toContain('Der Vergleich zeigt jede als Änderung.')
  })

  it('sets a word lost at the edge of a printed stretch apart, once a round carries the class (23.11.2026)', () => {
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    for (const path of ['pdf', 'table'] as const) {
      r.lesefassung.faults[path] = [...r.lesefassung.faults[path].filter((f) => !(RESULT_BLIND_EDGE as readonly string[]).includes(f.key)), { key: 'Rand-weg', tried: 60, caught: 40 }, { key: 'Mehrfach-weg', tried: 40, caught: 36 }]
    }
    const art = genauigkeitArten(r)[0]!
    expect(art.faults).toContainEqual({ label: 'Ein Wort fehlt am Rand einer gedruckten Passage oder in einer Wortfolge, die mehrfach steht', tried: 200, caught: 152, blind: true, weakest: '66,6', weakestShare: 40 / 60, why: 'Dort fällt ein fehlendes Wort seltener auf als mitten im Text.' })
    expect(art.missed.join(' ')).toContain('fällt das seltener auf: 152 von 200 Versuchen gefangen.')
  })

  it('says the null comparison whole: every difference found, and how many of them read as a change', () => {
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    r.stations = { ...r.stations, nullUnits: 9542, nullResidues: 458, nullSubstantive: 4, nullPlaceholders: 458 - NULL_RESIDUES_READ }
    const result = genauigkeitArten(r)[2]!.result.join(' ')
    expect(result).toContain(`in 9.542 Textteilen 458 Unterschiede. 4 davon zeigt er als Änderung, die anderen als „redaktionell“. ${458 - NULL_RESIDUES_READ} sind die Nummer des Bundesgesetzblatts, die vor der Kundmachung noch offen ist. Die übrigen ${NULL_RESIDUES_READ} haben wir einzeln gelesen`)
    expect(result).not.toContain('fälschlich')
    r.stations.nullSubstantive = 0
    expect(genauigkeitArten(r)[2]!.result.join(' ')).toContain('Keinen davon zeigt er als Änderung')
  })

  it('claims to have read the null residues only while they are the ones that were read (23.11.2026)', () => {
    expect(GENAUIGKEIT.stations.nullResidues - GENAUIGKEIT.stations.nullPlaceholders).toBe(NULL_RESIDUES_READ)
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    r.stations.nullPlaceholders -= 1
    const result = genauigkeitArten(r)[2]!.result.join(' ')
    expect(result).toContain('sind noch nicht einzeln gelesen.')
    expect(result).not.toContain('einzeln gelesen:')
  })

  it('names why a composed § is not the law only for the cases that were read (23.11.2026)', () => {
    const { differs } = GENAUIGKEIT.lesefassung.bench.draftPath
    expect(differs.map((d) => `${d.me} § ${d.id}`).sort()).toEqual([...DRAFT_PATH_DIFFERS_READ].sort())
    expect(genauigkeitArten()[0]!.result[0]).toContain('steht im Gesetz etwas, das keine Anweisung des Entwurfs anordnet.')
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    r.lesefassung.bench.draftPath.differs = [...differs, { me: '9/ME', law: 'Gesetz', id: '1' }]
    r.lesefassung.bench.draftPath.identical -= 1
    expect(genauigkeitArten(r)[0]!.result[0]).toContain('weicht unser Ergebnis vom Gesetz ab.')
    // The figure's own line claims the cause only while the cases are the ones read.
    expect(gesetzProbe().differs).toBe('Wo einer abweicht, steht im Gesetz etwas, das der Entwurf nicht anordnet.')
    expect(gesetzProbe(r).differs).toBe('Die Abweichungen sind noch nicht einzeln gelesen.')
  })

  it('scores the page on the draft path, not on the enacted law\'s instructions (23.11.2026)', () => {
    const { draftPath: dp } = GENAUIGKEIT.lesefassung.bench
    expect(dp.comparable + dp.instructionChanged + dp.stockMoved + dp.noInstructionLine + dp.notAmended + (dp.enactedUnread ?? 0) + (dp.noLawJoined ?? 0) + (dp.notEnacted ?? 0)).toBe(dp.shown)
    const first = genauigkeitArten()[0]!.result[0]!
    expect(first).toContain(`Bei ${formatNumberDe(dp.comparable)} ging die Anweisung unverändert ins Gesetz`)
    expect(first).toContain(`${formatNumberDe(dp.identical)} stimmen Wort für Wort`)
    // The figure at the top and in the section: identical of comparable, rounded down.
    expect(gesetzProbe().value).toBe(`${shareDe(dp.identical, dp.comparable)}\u00a0%`)
    expect(genauigkeitKurz().kacheln.map((k) => k.value)).toContain(gesetzProbe().value)
    // „gültig" claimed force for texts that enter into force later.
    const kurz = genauigkeitKurz()
    expect([...genauigkeitArten()[0]!.result, ...kurz.kacheln.flatMap((k) => [k.label, k.note ?? '']), ...kurz.check.map((c) => c.text)].join(' ')).not.toMatch(/gültig/)
  })

  it('accounts for every draft of the period and every shown § of a Land (23.11.2026)', () => {
    const p = GENAUIGKEIT.annex.population
    expect(p.readable).toBe(GENAUIGKEIT.annex.drafts)
    expect(p.readable + p.noClause + p.unreadable).toBe(p.withAnnex)
    expect(p.withAnnex).toBeLessThanOrEqual(p.listed)
    const t = GENAUIGKEIT.laender.tgu
    expect(t.strict.held + t.strict.unchecked).toBe(t.shown)
    expect(t.strict.onlyStruck).toBeLessThanOrEqual(t.strict.noWordCompared)
    expect(t.strict.markedHeld).toBeLessThanOrEqual(t.strict.held)
  })

  it('says of the ministry\'s annex what a reader sees of a §: no mark, either mark, not shown — the four adding up to the whole (22.11.2026)', () => {
    const r = withMarks()
    const { marks, withheld } = r.annex
    const art = genauigkeitArten(r)[1]!
    expect(marks.clean + marks.unconfirmed + marks.unchecked).toBe(marks.shown)
    expect(art.result[0]).toBe(`Die Textgegenüberstellungen enthalten ${formatNumberDe(marks.shown + withheld)} Paragraphen. ${formatNumberDe(marks.clean)} zeigt der Monitor ohne Vermerk, 640 mit dem Vermerk „nicht bestätigt“, 618 mit dem Vermerk „nicht geprüft“, ${formatNumberDe(withheld)} zeigt er nicht.`)
    expect(art.measured[0]).toContain('640 mit „nicht bestätigt“, 618 mit „nicht geprüft“')
    // The gate's own verdicts are no sentence's figure any more: they do not say what stands on the page.
    expect([...art.result, ...art.measured].join(' ')).not.toContain('hat die Prüfung bestätigt')
    for (const line of [art.against, ...art.result, art.rule, ...art.measured, ...art.missed]) {
      expect(line).not.toMatch(/undefined|NaN|null|Paragraf(?!h)/)
      expect(line).toMatch(/[.:]$/)
    }
  })

  it('draws a fault of the ministry\'s annex as the whole chain judges it, and says under the bar what catching did with the §', () => {
    const r = withMarks()
    const bars = genauigkeitArten(r)[1]!.faults
    expect(bars.map((b) => [b.tried, b.caught, b.withheld])).toEqual([
      [500, 492, 0],
      [80, 72, 0],
      [160, 140, 4],
      [120, 114, 100],
      [120, 96, 80],
      [80, 78, 0],
      [100, 80, 70],
    ])
    expect(bars.map((b) => b.blind ?? false)).toEqual([false, false, false, false, false, false, true])
    expect(bars.slice(0, 5).map(faultNoteDe)).toEqual([
      '492 von 500 eingebauten Fehlern gefangen: alle mit Vermerk gezeigt · schwächster Fall 98,0\u00a0%',
      '72 von 80 eingebauten Fehlern gefangen: alle mit Vermerk gezeigt',
      '140 von 160 eingebauten Fehlern gefangen: 4 nicht mehr gezeigt, 136 mit Vermerk gezeigt',
      '114 von 120 eingebauten Fehlern gefangen: 100 nicht mehr gezeigt, 14 mit Vermerk gezeigt · schwächster Fall 90,0\u00a0%',
      '96 von 120 eingebauten Fehlern gefangen: 80 nicht mehr gezeigt, 16 mit Vermerk gezeigt',
    ])
  })

  it('says under a bar only how many were caught, where caught is withheld and nothing else', () => {
    expect(faultNoteDe({ label: '', tried: 1339, caught: 1063 })).toBe('1.063 von 1.339 eingebauten Fehlern gefangen')
    expect(faultNoteDe({ label: '', tried: 30, caught: 30, withheld: 30 })).toBe('30 von 30 eingebauten Fehlern gefangen: alle nicht mehr gezeigt')
    expect(faultNoteDe({ label: '', tried: 20, caught: 0, withheld: 0 })).toBe('0 von 20 eingebauten Fehlern gefangen')
  })

  it('says of the annex\'s refused standing text what was measured, never whose error it is', () => {
    expect(genauigkeitArten()[1]!.measured.join(' ')).not.toMatch(/Fehler der Beilage/)
  })

  it('names the §§ the second reading would have shown on the bench, once a round counts them', () => {
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    r.lesefassung.bench.witnessed = { shown: 152, identical: 152 }
    expect(genauigkeitArten(r)[0]!.measured.join(' ')).toContain('gibt in dieser Probe 152 weitere frei, alle Wort für Wort das Gesetz.')
    r.lesefassung.bench.witnessed = { shown: 152, identical: 150 }
    expect(genauigkeitArten(r)[0]!.measured.join(' ')).toContain('152 weitere frei, 150 davon Wort für Wort das Gesetz.')
  })

  it('says what a check does not catch in words, where no fault can be injected', () => {
    for (const art of genauigkeitArten()) expect(art.faults.length || art.missed.length).toBeTruthy()
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

  it('says at every step that makes something who supplies it', () => {
    expect(GENAUIGKEIT_WEG.map((s) => s.key)).toEqual(['geltend', 'anweisung', 'ergebnis', 'pruefung'])
    expect(GENAUIGKEIT_WEG.every((s) => s.who)).toBe(true)
  })
})

describe('the record', () => {
  it('is dated and names the commit it measured', () => {
    expect(GENAUIGKEIT.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(GENAUIGKEIT.commit).toMatch(/^[0-9a-f]{7,40}$/)
    expect(measuredLineDe()).toMatch(/^Gemessen am \d{2}\.\d{2}\.\d{4} an den Entwürfen der [IVXL]+\. Gesetzgebungsperiode\. Die Entwürfe der Bundesländer haben den Stand vom \d{2}\.\d{2}\.\d{4}\.$/)
  })

  it('says what the figures do not', () => {
    expect(GENAUIGKEIT_GRENZEN.length).toBeGreaterThan(0)
  })
})

describe('at a glance', () => {
  it('opens with shares, each closing the sentence it opens, every figure from the record (24.11.2026)', () => {
    const { kacheln, check } = genauigkeitKurz()
    expect(kacheln.map((k) => k.id)).toEqual(['gegenueberstellung', 'lesefassung', 'lesefassung-gesetz', 'stationen'])
    for (const k of kacheln) {
      expect(k.value).toMatch(/^\d{1,3}(,\d)?\u00a0%$/)
      expect(k.label).toMatch(/\.$/)
    }
    for (const line of [...kacheln.flatMap((k) => [k.label, k.note ?? '.']), ...check.flatMap((c) => [c.lead, c.text])]) {
      expect(line).not.toMatch(/undefined|NaN|Paragraf(?!h)/)
    }
    for (const c of check) expect(c.text).toMatch(/\.$/)
    const { annex } = GENAUIGKEIT
    // Shown, without a mark and with one, in tenths that add up (24.11.2026).
    const [clean, marked] = largestRemainder([annex.marks.clean, annex.marks.unconfirmed + annex.marks.unchecked, annex.withheld], 1000)
    expect(kacheln[0]!.value).toBe(`${tenthsDe(clean! + marked!)}\u00a0%`)
    expect(kacheln[0]!.label).toContain(`${tenthsDe(clean!)}\u00a0% ohne Vermerk, ${tenthsDe(marked!)}\u00a0% mit einem.`)
    // What each of the other tiles is not, beside it: the readers of 24.11.2026 took 63,2 % for a third missing and 100 % for error-free.
    expect(kacheln[1]!.note).toContain('Bei den übrigen bleibt die Textgegenüberstellung zu sehen')
    expect(kacheln[3]!.note).toBe('Wie oft der Monitor ein Wort falsch liest, misst dieser Test nicht.')
    // The tile says where the share was measured, in a reader's words; what it means that the rules were tuned there stands in the section (24.11.2026).
    expect(kacheln[2]!.note).toBe('Gemessen an Paragraphen, die so Gesetz wurden, wie der Entwurf sie vorschlug. Wie oft ein Entwurf unverändert Gesetz wird, sagt die Zahl nicht.')
    expect(kacheln[2]!.note).not.toMatch(/Anweisung|Regeln/)
  })

  it('says of the Länder what share of the shown §§ was held word for word, from the record', () => {
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    r.laender.tgu = { ...r.laender.tgu, shown: 20, strict: { held: 17, differs: 2, unchecked: 3, onlyStruck: 1, noWordCompared: 2, markedHeld: 2 } }
    // Held with no new word is nothing held word for word (23.11.2026).
    expect(genauigkeitKurz(r).check[4]!.text).toContain('sind 75,0\u00a0% der gezeigten Paragraphen Wort für Wort am Entwurf geprüft, der alte Text nur teilweise. In Kärnten gibt es diese Prüfung nicht.')
  })

  it('opens with the instruction, then gives each mark its own line and what to do (24.11.2026)', () => {
    const { check } = genauigkeitKurz()
    expect(check[0]!.lead).toBe('Wortlaute aus dem verlinkten Original zitieren.')
    expect(check[1]).toEqual({ lead: '„nicht bestätigt“:', text: 'Eine der Prüfungen ging nicht auf. Den Wortlaut im verlinkten Entwurf nachsehen.' })
    expect(check[2]).toEqual({ lead: '„nicht geprüft“:', text: 'Es gab nichts, woran der Monitor den Text prüfen konnte. Den Wortlaut im verlinkten Entwurf nachsehen.' })
  })

  it('says that no mark is no guarantee (23.11.2026)', () => {
    expect(genauigkeitKurz().check[3]).toEqual({ lead: 'Kein Vermerk:', text: 'Die Prüfungen haben nichts gefunden. Das heißt nicht, dass der Text sicher stimmt.' })
  })
})

describe('the injected faults, as a reader sees them (24.11.2026)', () => {
  it('stands a bar caught almost always, its weakest class too, in one line with the others', () => {
    const strong = { label: 'a', tried: 100, caught: 99 }
    const weakClass = { label: 'b', tried: 100, caught: 98, weakest: '90,0', weakestShare: 0.9 }
    const blind = { label: 'c', tried: 100, caught: 99, blind: true }
    const low = { label: 'd', tried: 100, caught: 80 }
    const bild = fehlerBild([strong, weakClass, blind, low])
    expect(bild.strong).toEqual([strong])
    expect(bild.weak).toEqual([weakClass, blind, low])
    expect(bild.strongRange).toBe('99,0\u00a0%')
    expect(bild.strongLabel).toBe('Fast immer gefangen')
    expect(fehlerBild([{ label: 'e', tried: 10, caught: 10 }])).toMatchObject({ strongRange: '100\u00a0%', strongLabel: 'Jeder gefangen', weak: [] })
    // The range runs from the weakest class of the strong bars, never from their sums alone.
    expect(fehlerBild([{ label: 'f', tried: 100, caught: 99, weakest: '96,0', weakestShare: 0.96 }, strong]).strongRange).toBe('96,0 bis 99,0\u00a0%')
    expect(FAST_IMMER).toBe(0.95)
    // A share of few tries says so at its bar, the counts being folded away.
    expect(fewTriesDe({ label: 'g', tried: 14, caught: 3 })).toBe('Gemessen an nur 14 Versuchen; der Anteil ist ungenau.')
    expect(fewTriesDe({ label: 'h', tried: 100, caught: 3 })).toBeNull()
    // A short bar's figure says what it counts: bare, 0,2 % read as „almost never wrong" (24.11.2026).
    expect(weakFigureDe({ label: 'i', tried: 1000, caught: 2 })).toBe('0,2\u00a0% gefangen')
    expect(weakFigureDe({ label: 'j', tried: 30, caught: 28, shownAsChange: true })).toBe('93,3\u00a0% als Änderung gezeigt')
  })

  it('gives every bar of the published round that is not caught almost always a why of its own', () => {
    for (const art of genauigkeitArten()) {
      const { weak } = fehlerBild(art.faults)
      for (const f of weak) expect(f.why, `${art.id}: ${f.label}`).toMatch(/\.$/)
      // A kind with no short bar says its first blind spot in words.
      if (!weak.length) expect(art.missed[0]).toMatch(/\.$/)
    }
  })

  it('sets every blind spot apart, with what it means for a reader', () => {
    for (const r of [GENAUIGKEIT, withMarks(), withComma()]) {
      for (const art of genauigkeitArten(r)) {
        const blind = art.faults.filter((f) => f.blind)
        // The ministry's annex has a class no check can see, the Lesefassung three.
        // A Land's Textgegenüberstellung one since 23.11.2026: what it misreads in the old text.
        // Nor has a comparison of stations: what it cannot see — one word misread alike in both texts — no fault can be injected for.
        expect(blind).toHaveLength(art.id === 'lesefassung' ? 3 : art.id === 'gegenueberstellung' ? 1 : art.id === 'land-gegenueberstellung' ? 1 : 0)
        for (const f of blind) expect(f.why).toMatch(/\.$/)
        expect(fehlerBild(art.faults).weak).toEqual(expect.arrayContaining(blind))
      }
    }
  })
})

describe('out of 100', () => {
  it('draws the ministry\'s annex as the four things a § can be, the squares adding up to 100 and the counts to the whole', () => {
    for (const r of [GENAUIGKEIT, withMarks()]) {
      const split = genauigkeitArten(r).find((a) => a.id === 'gegenueberstellung')!.split!
      expect(split.parts.map((p) => p.art)).toEqual(['ohne', 'nichtBestaetigt', 'nichtGeprueft', 'nichtGezeigt'])
      expect(split.parts.reduce((n, p) => n + p.of100, 0)).toBe(100)
      expect(split.parts.reduce((n, p) => n + p.count, 0)).toBe(r.annex.marks.shown + r.annex.withheld)
    }
  })

  it('draws a Land\'s annex without „nicht bestätigt", which no Land\'s check sets, and says Kärnten beside it', () => {
    const r = GENAUIGKEIT
    const split = genauigkeitArten(r).find((a) => a.id === 'land-gegenueberstellung')!.split!
    expect(split.parts.map((p) => p.art)).toEqual(['ohne', 'nichtGeprueft', 'nichtGezeigt'])
    expect(split.parts.reduce((n, p) => n + p.of100, 0)).toBe(100)
    expect(split.parts.reduce((n, p) => n + p.count, 0)).toBe(r.laender.tgu.shown + r.laender.tgu.withheldAll)
    expect(split.after).toContain('Kärnten')
  })
})

// The bench over the whole period (24.11.2026): the sentences on whose laws the rules were developed follow the record.
describe('benchCoversPeriod', () => {
  const period = (): GenauigkeitRecord => {
    const r = structuredClone(GENAUIGKEIT)
    r.lesefassung.bench.draftPath = { ...r.lesefassung.bench.draftPath, enactedUnread: 0, noLawJoined: 7, notEnacted: 24 }
    return r
  }

  it('keeps the old sentences for a record of „the 60 newest"', () => {
    const sixty = structuredClone(GENAUIGKEIT)
    delete sixty.lesefassung.bench.draftPath.enactedUnread
    delete sixty.lesefassung.bench.draftPath.noLawJoined
    delete sixty.lesefassung.bench.draftPath.notEnacted
    expect(benchCoversPeriod(sixty)).toBe(false)
    expect(gesetzProbe(sixty).caveat).toBe('Bei anderen Gesetzen kann der Anteil niedriger sein.')
  })

  it('says for a record of the whole period that the rules were developed on part of its laws', () => {
    const r = period()
    expect(benchCoversPeriod(r)).toBe(true)
    expect(gesetzProbe(r).caveat).toBe('Bei künftigen Gesetzen kann der Anteil niedriger sein.')
    const lesefassung = genauigkeitArten(r).find((a) => a.id === 'lesefassung')!.result.join(' ')
    expect(lesefassung).toContain('Jedes neu kundgemachte Gesetz kommt mit der nächsten Messung dazu.')
  })

  it('says how many shown §§ never became law or join no law, and leaves both out of „einem Gesetz zuordnen"', () => {
    const r = period()
    const dp = r.lesefassung.bench.draftPath
    const art = genauigkeitArten(r).find((a) => a.id === 'lesefassung')!
    const result = art.result.join(' ')
    const joined = dp.shown - 7 - 24
    expect(result).toContain(`lassen sich ${formatNumberDe(joined)} gezeigte Paragraphen einem Gesetz zuordnen. 24 weitere stehen in Artikeln des Entwurfs, die nicht Gesetz wurden. Bei 7 anderen findet die Prüfung kein kundgemachtes Gesetz zu ihrem Artikel des Entwurfs.`)
    expect(result).toContain(`Die übrigen ${formatNumberDe(joined - dp.comparable)} lassen sich so nicht prüfen`)
    expect(art.measured.join(' ')).toContain('24 in Artikeln, die nicht Gesetz wurden, 7, denen die Prüfung kein kundgemachtes Gesetz zuordnet.')
  })
})
