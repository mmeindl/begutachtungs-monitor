import { describe, expect, it } from 'vitest'
import type { GenauigkeitRecord } from '../shared/types'
import { formatNumberDe } from '../shared/utils/format'
import {
  ANNEX_BLIND,
  ANNEX_GATE_ALONE,
  ANNEX_LOST,
  ANNEX_MISFILED,
  CHAIN_LABEL,
  CHAIN_LOST,
  CHAIN_MISFILED,
  CHAIN_STRUCK,
  CHAIN_WORDING,
  FUNNEL_GROUP_OF,
  GENAUIGKEIT,
  GENAUIGKEIT_GRENZEN,
  GENAUIGKEIT_WEG,
  LAND_WORDING,
  LAND_OTHER_DRAFT,
  LAND_OWN_DRAFT,
  RESULT_BLIND,
  RESULT_BLIND_COMMA,
  RESULT_STRUCTURE,
  RESULT_WITNESS,
  RESULT_WORDS,
  WEG_BEISPIEL,
  faultNoteDe,
  funnelRows,
  genauigkeitArten,
  genauigkeitKurz,
  measuredLineDe,
  rangeDe,
  shareDe,
  wegFunnel,
} from '../shared/utils/genauigkeit'

/**
 * `/genauigkeit` (19.11.2026): the figures of a measurement round in words.
 * What these hold is that no sentence can say more than the record does —
 * a share rounded up, a class of fault left out of every range, a count of
 * 0 read as a number, a funnel that does not add up.
 */

/**
 * The committed record with what a round since 22.11.2026 adds for the
 * ministry's annex: what the page shows of a § (`marks`) and the faults
 * judged through the whole chain (`chain`), the same on both paths.
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
    const result = [...RESULT_WORDS, ...RESULT_STRUCTURE, ...RESULT_BLIND, ...RESULT_BLIND_COMMA, ...RESULT_WITNESS] as string[]
    const annex = [...ANNEX_MISFILED, ...ANNEX_LOST, ...ANNEX_BLIND, ...ANNEX_GATE_ALONE] as string[]
    const land = [...LAND_OWN_DRAFT, ...LAND_OTHER_DRAFT, ...LAND_WORDING] as string[]
    const chain = [...CHAIN_WORDING, ...CHAIN_LABEL, ...CHAIN_STRUCK, ...CHAIN_LOST, ...CHAIN_MISFILED] as string[]
    for (const [groups, keys] of [
      [result, [...GENAUIGKEIT.lesefassung.faults.pdf, ...GENAUIGKEIT.lesefassung.faults.table].map((f) => f.key)],
      [annex, [...GENAUIGKEIT.annex.faults.pdf, ...GENAUIGKEIT.annex.faults.table].map((f) => f.key)],
      [land, GENAUIGKEIT.laender.tgu.faults.map((f) => f.key)],
      // The chain's classes, once a round carries them — and every group then has a class the round tried, or its bar would be empty.
      [chain, [...(GENAUIGKEIT.annex.chain?.pdf ?? []), ...(GENAUIGKEIT.annex.chain?.table ?? [])].map((f) => f.key)],
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
    expect(rows.map((r) => [r.key, r.count])).toEqual([['gezeigt', 1], ['beilage', 7], ['anweisung', 2]])
    expect(rows[1]!.causes.map((c) => c.cause)).toEqual(['anhang-schweigt', 'anhang-fremd'])
  })
})

describe('wegFunnel', () => {
  it('carries the §§ shown on the draft\'s own text apart, and none in a round before them', () => {
    expect(wegFunnel({ drafts: 1, changed: 10, shown: 5, witnessed: 2, causes: { verweigert: 5 } }).witnessed).toBe(2)
    expect(wegFunnel({ drafts: 1, changed: 10, shown: 5, causes: { verweigert: 5 } }).witnessed).toBe(0)
  })

  it('counts only the §§ with a proposed version to compose, and names the others beside the figure', () => {
    const f = wegFunnel({ drafts: 1, changed: 20, shown: 8, causes: { verweigert: 4, unplausibel: 2, 'anhang-schweigt': 3, entfaellt: 2, 'neu-erlassen': 1 } })
    expect(f.total).toBe(17)
    expect(f.outside).toBe(3)
    expect(f.shown).toBe(8)
  })

  it('puts every group at the step it ends at, and loses no § between the steps', () => {
    const f = wegFunnel()
    const ended = Object.values(f.exits).flat().reduce((n, r) => n + r.count, 0)
    expect(f.shown + ended).toBe(f.total)
    expect(f.total + f.outside).toBe(GENAUIGKEIT.lesefassung.funnel.changed)
    expect(f.exits.ergebnis).toBeUndefined()
    expect(f.exits.gezeigt).toBeUndefined()
    expect(f.exits.pruefung?.map((r) => r.key).sort()).toEqual(['beilage', 'pruefung'])
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
    r.lesefassung.bench = { ...r.lesefassung.bench, shown: 10, identical: 7, invented: 1, incomplete: 1, otherwise: 1 }
    const measured = genauigkeitArten(r)[0]!.measured[0]!
    expect(measured).toContain('sind 7 Wort für Wort das Gesetz. Einem fehlt ein Teil, einer ist aus einem anderen Grund nicht das Gesetz. Ein Wort, das nicht im Gesetz steht, hat einer.')
  })

  it('draws every class of fault in one bar, the tries adding up to the record', () => {
    const [lesefassung, annex, , land] = genauigkeitArten()
    const tries = (faults: { tried: number }[]) => faults.reduce((n, f) => n + f.tried, 0)
    expect(tries(lesefassung!.faults)).toBe(tries([...GENAUIGKEIT.lesefassung.faults.pdf, ...GENAUIGKEIT.lesefassung.faults.table]))
    // The ministry's annex: the chain's classes where a round carries them, and of the gate's only the blind one beside them.
    const gate = [...GENAUIGKEIT.annex.faults.pdf, ...GENAUIGKEIT.annex.faults.table]
    const chain = GENAUIGKEIT.annex.chain
    expect(tries(annex!.faults)).toBe(tries(chain ? [...chain.pdf, ...chain.table, ...gate.filter((f) => (ANNEX_BLIND as readonly string[]).includes(f.key))] : gate))
    for (const art of genauigkeitArten()) for (const fault of art.faults) expect(fault.tried).toBeGreaterThan(0)
    expect(tries(land!.faults)).toBe(tries(GENAUIGKEIT.laender.tgu.faults))
  })

  it('sets a comma lost in text the draft leaves unchanged apart as a blind spot, and counts one at a changed place with the words (21.11.2026)', () => {
    const art = genauigkeitArten(withComma())[0]!
    expect(art.faults.at(-1)).toEqual({ label: 'Ein Komma fehlt in Text, den der Entwurf unverändert lässt', tried: 200, caught: 2, blind: true })
    expect(art.missed).toContain('Fehlt unserem Ergebnis ein Komma in Text, den der Entwurf unverändert lässt, fällt das kaum auf: 2 von 200 Versuchen gefangen. Dort vergleicht die Prüfung die Wörter, nicht die Satzzeichen.')
    expect(art.consequence).toBe('Fehlt ein Teil schon im RIS, kann er auch im ganzen Paragraphen des Monitors fehlen. In Text, den der Entwurf unverändert lässt, kann ein Komma fehlen.')
    // A round that did not try the comma has neither the bar nor its sentences, and the printed comma is one of the words.
    const before = withComma()
    for (const path of ['pdf', 'table'] as const) before.lesefassung.faults[path] = before.lesefassung.faults[path].filter((f) => !f.key.includes('Komma'))
    const without = genauigkeitArten(before)[0]!
    expect(without.faults.filter((f) => f.blind)).toHaveLength(1)
    expect(without.consequence).toBe('Fehlt ein Teil schon im RIS, kann er auch im ganzen Paragraphen des Monitors fehlen.')
    expect(without.missed.join(' ')).not.toContain('Komma')
    expect(art.faults[0]!.tried - without.faults[0]!.tried).toBe(200)
    expect(art.faults[0]!.caught - without.faults[0]!.caught).toBe(198)
  })

  it('draws the station comparison\'s injected changes as a bar, and says them in a sentence, once a round carries them', () => {
    expect(genauigkeitArten()[2]!.faults).toEqual(GENAUIGKEIT.stations.faults?.length ? [expect.objectContaining({ tried: expect.any(Number) })] : [])
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    r.stations.faults = [{ key: 'ziffer', tried: 40, caught: 40 }, { key: 'minus', tried: 30, caught: 28 }]
    const art = genauigkeitArten(r)[2]!
    expect(art.faults).toEqual([{ label: expect.stringContaining('in einem der beiden Texte geändert'), tried: 70, caught: 68 }])
    expect(art.measured.join(' ')).toContain('70 eingebaute Änderungen')
    expect(art.measured.join(' ')).toContain('Der Vergleich zeigt 68 als Änderung.')
    expect(art.rule).toContain('Dazu ändern wir in echten Texten je eine Stelle')
    r.stations.faults = [{ key: 'ziffer', tried: 40, caught: 40 }]
    expect(genauigkeitArten(r)[2]!.measured.join(' ')).toContain('Der Vergleich zeigt jede als Änderung.')
  })

  it('says the null comparison whole: every difference found, and how many of them read as a change', () => {
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    r.stations = { ...r.stations, nullUnits: 9542, nullResidues: 458, nullSubstantive: 4 }
    const result = genauigkeitArten(r)[2]!.result.join(' ')
    expect(result).toContain('in 9.542 Textteilen 458 Unterschiede: 454 nur in Schreibweise oder Satzzeichen, als „redaktionell“ markiert, 4 als Änderung.')
    expect(result).not.toContain('fälschlich')
    r.stations.nullSubstantive = 0
    expect(genauigkeitArten(r)[2]!.result.join(' ')).toContain('458 nur in Schreibweise oder Satzzeichen, als „redaktionell“ markiert, keiner als Änderung.')
  })

  it('says of the ministry\'s annex what a reader sees of a §: no mark, either mark, not shown — the four adding up to the whole (22.11.2026)', () => {
    const r = withMarks()
    const { marks, withheld } = r.annex
    const art = genauigkeitArten(r)[1]!
    expect(marks!.clean + marks!.unconfirmed + marks!.unchecked).toBe(marks!.shown)
    expect(art.result[0]).toBe(`Die Textgegenüberstellungen enthalten ${formatNumberDe(marks!.shown + withheld)} Paragraphen. ${formatNumberDe(marks!.clean)} zeigt der Monitor ohne Vermerk, 640 mit dem Vermerk „nicht bestätigt“, 618 mit dem Vermerk „nicht geprüft“, ${formatNumberDe(withheld)} zeigt er nicht.`)
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
    const blind = [...r.annex.faults.pdf, ...r.annex.faults.table].filter((f) => f.key === 'U')
    expect(bars.map((b) => [b.tried, b.caught, b.withheld])).toEqual([
      [500, 492, 0],
      [80, 72, 0],
      [160, 140, 4],
      [120, 114, 100],
      [120, 96, 80],
      [blind.reduce((n, f) => n + f.tried, 0), blind.reduce((n, f) => n + f.caught, 0), undefined],
    ])
    expect(bars.map((b) => b.blind ?? false)).toEqual([false, false, false, false, false, true])
    expect(bars.slice(0, 5).map(faultNoteDe)).toEqual([
      '492 von 500 eingebauten Fehlern gefangen: alle mit Vermerk gezeigt',
      '72 von 80 eingebauten Fehlern gefangen: alle mit Vermerk gezeigt',
      '140 von 160 eingebauten Fehlern gefangen: 4 nicht mehr gezeigt, 136 mit Vermerk gezeigt',
      '114 von 120 eingebauten Fehlern gefangen: 100 nicht mehr gezeigt, 14 mit Vermerk gezeigt',
      '96 von 120 eingebauten Fehlern gefangen: 80 nicht mehr gezeigt, 16 mit Vermerk gezeigt',
    ])
  })

  it('says under a bar only how many were caught, where caught is withheld and nothing else', () => {
    expect(faultNoteDe({ label: '', tried: 1339, caught: 1063 })).toBe('1.063 von 1.339 eingebauten Fehlern gefangen')
    expect(faultNoteDe({ label: '', tried: 30, caught: 30, withheld: 30 })).toBe('30 von 30 eingebauten Fehlern gefangen: alle nicht mehr gezeigt')
    expect(faultNoteDe({ label: '', tried: 20, caught: 0, withheld: 0 })).toBe('0 von 20 eingebauten Fehlern gefangen')
  })

  it('keeps the sentences of a round before the mark for a record that carries none', () => {
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    delete r.annex.marks
    delete r.annex.chain
    const art = genauigkeitArten(r)[1]!
    expect(art.result[0]).toContain(`${formatNumberDe(r.annex.confirmed)} hat die Prüfung bestätigt`)
    expect(art.faults.map((f) => f.withheld)).toEqual([undefined, undefined, undefined])
    expect(genauigkeitKurz(r).check[0]).toBe('Ein Paragraph mit dem Vermerk „nicht geprüft“ ist gezeigt, aber nicht bestätigt.')
  })

  it('says of the annex\'s refused standing text what was measured, never whose error it is', () => {
    expect(genauigkeitArten()[1]!.measured.join(' ')).not.toMatch(/Fehler der Beilage/)
  })

  it('names the §§ the second reading would have shown on the bench, once a round counts them', () => {
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    r.lesefassung.bench.witnessed = { shown: 152, identical: 152 }
    expect(genauigkeitArten(r)[0]!.measured.join(' ')).toContain('in dieser Probe 152 weitere, alle Wort für Wort das Gesetz.')
    r.lesefassung.bench.witnessed = { shown: 152, identical: 150 }
    expect(genauigkeitArten(r)[0]!.measured.join(' ')).toContain('152 weitere, 150 davon Wort für Wort das Gesetz.')
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
    expect(GENAUIGKEIT_WEG.filter((s) => s.key !== 'gezeigt').every((s) => s.who)).toBe(true)
  })
})

describe('the record', () => {
  it('is dated and names the commit it measured', () => {
    expect(GENAUIGKEIT.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(GENAUIGKEIT.commit).toMatch(/^[0-9a-f]{7,40}$/)
    expect(measuredLineDe()).toMatch(/^Gemessen am \d{2}\.\d{2}\.\d{4} an den Entwürfen der [IVXL]+\. Gesetzgebungsperiode\.$/)
  })

  it('says what the figures do not', () => {
    expect(GENAUIGKEIT_GRENZEN.length).toBeGreaterThan(0)
  })
})

describe('in short', () => {
  it('says the page in closed sentences, every figure from the record', () => {
    const kurz = genauigkeitKurz()
    for (const line of [...kurz.shows, ...kurz.check]) {
      expect(line).toMatch(/\.$/)
      expect(line).not.toMatch(/undefined|NaN|Paragraf(?!h)/)
    }
    expect(kurz.shows[1]).toContain(`${GENAUIGKEIT.lesefassung.bench.shown} ganze Paragraphen gezeigt, ${GENAUIGKEIT.lesefassung.bench.identical} davon`)
  })

  it('says of the Länder how many shown §§ were held word for word, from the record', () => {
    const r: GenauigkeitRecord = structuredClone(GENAUIGKEIT)
    r.laender.tgu = { ...r.laender.tgu, shown: 20, strict: { held: 17, differs: 2, unchecked: 3 } }
    expect(genauigkeitKurz(r).check[1]).toContain('bei 17 von 20 gezeigten Paragraphen Wort für Wort')
  })

  it('names both marks where a round counts them: either one is shown and not vouched for', () => {
    expect(genauigkeitKurz(withMarks()).check[0]).toBe('Ein Paragraph mit dem Vermerk „nicht geprüft“ oder „nicht bestätigt“ ist gezeigt, aber die Prüfung steht nicht hinter ihm. Was der Entwurf ändern will, sagt sein Gesetzestext.')
  })

  it('sets every blind spot apart, with what it means for a reader', () => {
    for (const r of [GENAUIGKEIT, withMarks(), withComma()]) {
      const comma = [...r.lesefassung.faults.pdf, ...r.lesefassung.faults.table].some((f) => (RESULT_BLIND_COMMA as readonly string[]).includes(f.key))
      for (const art of genauigkeitArten(r)) {
        const blind = art.faults.filter((f) => f.blind)
        // The Lesefassung and the ministry's annex have a class no check can see, the Lesefassung a second one where a round tried the comma.
        // A Land's Textgegenüberstellung has none since 20.11.2026: its blind spot is the §§ not held word for word, a count in the sentence.
        // Nor has a comparison of stations: what it cannot see — one word misread alike in both texts — no fault can be injected for.
        expect(blind).toHaveLength(art.id === 'lesefassung' ? (comma ? 2 : 1) : art.id === 'gegenueberstellung' ? 1 : 0)
        if (blind.length || art.id === 'land-gegenueberstellung') expect(art.consequence).toMatch(/\.$/)
        else expect(art.consequence).toBeNull()
        // What the page prints under „Was die Prüfung übersieht": the consequence, or the first thing the check misses.
        expect(art.consequence ?? art.missed[0]).toMatch(/\.$/)
      }
    }
  })
})
