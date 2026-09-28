import { describe, expect, it } from 'vitest'
import type { LawDiffUnit } from '../shared/types'
import { compareReasoning } from '../server/utils/explanations/reasoningDiff'

/** A Novellierungsanordnung the way the comparison emits it. */
function unit(article: string, id: string, line: string, change: LawDiffUnit['change'] = 'changed', keys: { to?: string; from?: string } = {}): LawDiffUnit {
  return {
    article,
    articleKey: keys.to ?? null,
    fromArticleKey: keys.from ?? keys.to ?? null,
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

  it('vergleicht die mehrdeutige Nummer unter ihrem Artikel, wo beide Seiten ihn nennen (27.09.2026)', () => {
    // 18/ME: the Vorlage renumbers the draft's Artikel 3 and 4 to 6 and 5. The
    // draft's passages carry the draft's numbers, the Vorlage's the Vorlage's.
    const units = [
      unit(SNG, 'Z9', 'In § 15 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.', 'changed', { from: '3', to: '6' }),
      unit(BVWG, 'Z1', 'In § 15 Abs. 2 entfällt die Wortfolge "in der Regel".', 'changed', { from: '4', to: '5' }),
    ]
    const byArticle = {
      before: new Map([['3|15', 'Die Begründung zum Staatsschutz.'], ['4|15', 'Die Begründung zum BVwGG.']]),
      after: new Map([['6|15', 'Die Begründung zum Staatsschutz, deutlich umformuliert und ergänzt.'], ['5|15', 'Die Begründung zum BVwGG.']]),
    }

    const out = compareReasoning(units, new Map(), new Map(), byArticle)

    expect(Object.keys(out.paragraphs).sort()).toEqual(['Art. 5 § 15', 'Art. 6 § 15'])
    expect(out.paragraphs['Art. 6 § 15']).toMatchObject({ paragraph: '§ 15', changed: true })
    expect(out.paragraphs['Art. 5 § 15']).toMatchObject({ paragraph: '§ 15', changed: false })
    expect(Object.values(out.units).sort()).toEqual(['Art. 5 § 15', 'Art. 6 § 15'])
  })

  it('füllt die Obergrenze zuerst mit den eindeutigen Nummern — der zweite Schlüssel kostet keine', () => {
    const ambiguousFirst = [
      unit(SNG, 'Z1', 'In § 15 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.', 'changed', { to: '1' }),
      unit(BVWG, 'Z1', 'In § 15 Abs. 2 entfällt die Wortfolge "in der Regel".', 'changed', { to: '2' }),
    ]
    const unique = Array.from({ length: 250 }, (_, i) => unit(SNG, `Z${i + 2}`, `In § ${100 + i} Abs. 1 wird das Wort "a" durch das Wort "b" ersetzt.`, 'changed', { to: '1' }))
    const texts = new Map(unique.map((_, i) => [String(100 + i), `Begründung ${i}.`]))
    const byArticle = { before: new Map([['1|15', 'A.'], ['2|15', 'B.']]), after: new Map([['1|15', 'A.'], ['2|15', 'B.']]) }

    const out = compareReasoning([...ambiguousFirst, ...unique], texts, texts, byArticle)

    expect(out.stats.compared).toBe(250)
    expect(Object.keys(out.paragraphs).some((k) => k.startsWith('Art. '))).toBe(false)
  })

  it('lässt die mehrdeutige Nummer weg, wo eine Seite keinen Artikel nennt', () => {
    const units = [
      unit(SNG, 'Z9', 'In § 15 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.', 'changed', { to: '1' }),
      unit(BVWG, 'Z1', 'In § 15 Abs. 2 entfällt die Wortfolge "in der Regel".'),
    ]
    const byArticle = { before: new Map([['1|15', 'Nur im Entwurf unter Artikel 1.']]), after: new Map<string, string>() }

    const out = compareReasoning(units, new Map([['15', 'x']]), new Map([['15', 'y']]), byArticle)

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

  // „§§ 6 und 7" is one address with a sibling, and the instruction changes
  // two Paragraphen: showing the reasoning for § 6 alone would be half of it.
  it('lässt „§§ 6 und 7" weg wie jede Anweisung über mehrere Paragraphen', () => {
    const units = [unit(SNG, 'Z2', 'Die §§ 6 und 7 samt Überschriften entfallen.')]
    const out = compareReasoning(units, new Map([['6', 'a']]), new Map([['6', 'b sehr anders']]))

    expect(out.units).toEqual({})
  })
})
