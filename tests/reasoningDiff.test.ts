import { describe, expect, it } from 'vitest'
import type { LawDiffUnit } from '../shared/types'
import { compareReasoning } from '../server/utils/explanations/reasoningDiff'

/** A Novellierungsanordnung the way the comparison emits it. */
function unit(article: string, id: string, line: string, change: LawDiffUnit['change'] = 'changed'): LawDiffUnit {
  return {
    article,
    id,
    fromId: id,
    heading: line.slice(0, 100),
    quotedHeading: null,
    change,
    editorial: false,
    fromText: line,
    toText: line,
    segments: null,
  }
}

const SNG = 'Änderung des Staatsschutz- und Nachrichtendienst-Gesetzes'
const BVWG = 'Änderung des Bundesverwaltungsgerichtsgesetzes'

describe('compareReasoning', () => {
  it('vergleicht je Paragraph, nicht je Anordnung', () => {
    const units = [
      unit(SNG, 'Z2', 'In § 6 Abs. 3 Z 3 wird das Zitat "246" durch das Zitat "247" ersetzt.'),
      unit(SNG, 'Z3', 'In § 6 Abs. 4 entfällt die Wortfolge "oder mündlich".'),
      unit(SNG, 'Z4', 'In § 7 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.'),
    ]
    const before = new Map([['6', 'Die Bestimmung dient der Umsetzung.'], ['7', 'Unverändert.']])
    const after = new Map([['6', 'Die Bestimmung dient nunmehr der vollständigen Umsetzung.'], ['7', 'Unverändert.']])

    const out = compareReasoning(units, before, after)

    // Two Paragraphen, three instructions: the statistic counts Paragraphen.
    expect(out.stats).toEqual({ compared: 2, changed: 1 })
    expect(Object.keys(out.paragraphs).sort()).toEqual(['§ 6', '§ 7'])
    expect(out.units).toEqual({ [`${SNG}|Z2|changed`]: '§ 6', [`${SNG}|Z3|changed`]: '§ 6', [`${SNG}|Z4|changed`]: '§ 7' })
    expect(out.paragraphs['§ 6']!.changed).toBe(true)
    expect(out.paragraphs['§ 7']!.changed).toBe(false)
  })

  it('zeigt nichts, wo zwei Artikel dieselbe Paragraphennummer ändern', () => {
    const units = [
      unit(SNG, 'Z9', 'In § 15 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.'),
      unit(BVWG, 'Z1', 'In § 15 Abs. 2 entfällt die Wortfolge "in der Regel".'),
    ]
    const before = new Map([['15', 'Die Begründung des einen Gesetzes.']])
    const after = new Map([['15', 'Die neue Begründung des einen Gesetzes, deutlich umformuliert.']])

    const out = compareReasoning(units, before, after)

    expect(out.units).toEqual({})
    expect(out.stats).toEqual({ compared: 0, changed: 0 })
  })

  it('vergleicht nur, wo beide Fassungen eine Begründung führen', () => {
    const units = [unit(SNG, 'Z2', 'In § 6 Abs. 3 Z 3 wird das Zitat "246" durch das Zitat "247" ersetzt.')]
    const out = compareReasoning(units, new Map([['6', 'Nur im Entwurf begründet.']]), new Map())

    expect(out.units).toEqual({})
    expect(out.stats.compared).toBe(0)
  })

  it('hält eine Änderung unter 2 % für Satzzeichen und nicht für eine Überarbeitung', () => {
    const words = Array.from({ length: 200 }, (_, i) => `wort${i}`).join(' ')
    const units = [unit(SNG, 'Z2', 'In § 6 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.')]
    const out = compareReasoning(units, new Map([['6', `${words} Punkt`]]), new Map([['6', `${words} Punkt.`]]))

    expect(out.stats).toEqual({ compared: 1, changed: 0 })
    expect(out.paragraphs['§ 6']!.segments).toBeNull()
    expect(out.paragraphs['§ 6']!.fromText).toBeNull()
  })

  it('legt beide Fassungen bei, wo der Wortvergleich zu lang zum Rechnen ist', () => {
    // Above the limit of 2,5 million cells (1.700 × 1.700): `diffTokens`
    // then returns only the similarity, no segments.
    const a = Array.from({ length: 1700 }, (_, i) => `wort${i}`).join(' ')
    const b = Array.from({ length: 1700 }, (_, i) => (i % 10 === 0 ? `neu${i}` : `wort${i}`)).join(' ')
    const units = [unit(SNG, 'Z2', 'In § 6 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.')]

    const out = compareReasoning(units, new Map([['6', a]]), new Map([['6', b]]))
    const entry = out.paragraphs['§ 6']!

    expect(entry.changed).toBe(true)
    expect(entry.segments).toBeNull()
    // Otherwise the display would open an empty drawer.
    expect(entry.fromText).toBe(a)
    expect(entry.toText).toBe(b)
  })

  it('lässt eine Anweisung weg, die keinen einzelnen Paragraphen adressiert', () => {
    const units = [unit(SNG, 'Z2', 'In § 6 Abs. 3 und § 7 Abs. 1 entfällt jeweils das Wort "kann".')]
    const out = compareReasoning(units, new Map([['6', 'a']]), new Map([['6', 'b']]))

    expect(out.units).toEqual({})
  })

  // Recorded, not wanted: `addressedParagraph` reads „§§ 6 und 7" as ONE
  // address with siblings and returns the first Paragraph, although the
  // instruction changes two. The reasoning shown is then the one for § 6 —
  // the same narrowing has hit the § names since 08.09. It belongs fixed and
  // measured in `addressedParagraph`, not worked around here.
  it('nennt bei „§§ 6 und 7" heute nur den ersten Paragraphen', () => {
    const units = [unit(SNG, 'Z2', 'Die §§ 6 und 7 samt Überschriften entfallen.')]
    const out = compareReasoning(units, new Map([['6', 'a']]), new Map([['6', 'b sehr anders']]))

    expect(out.units).toEqual({ [`${SNG}|Z2|changed`]: '§ 6' })
  })
})
