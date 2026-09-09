import { describe, expect, it } from 'vitest'
import { oracleVerdict, paraIdOfGld, rowsByParagraph, stripMarkers } from '../server/utils/tguOracle'
import type { ComparisonRow } from '../server/utils/textComparison'

function pair(current: string, proposed: string, gld: string | null = null, elided = false): ComparisonRow {
  const change = !current && proposed ? 'inserted' : current && !proposed ? 'removed' : current === proposed ? 'unchanged' : 'changed'
  return { kind: 'pair', heading: null, gld, current, proposed, change, marked: false, elided, segments: null, editorial: false }
}
const article = (heading: string): ComparisonRow => ({ kind: 'article', heading, gld: null, current: '', proposed: '', change: 'unchanged', marked: false, elided: false, segments: null, editorial: false })

describe('rowsByParagraph', () => {
  it('groups rows under the § that opened them and resets at an Artikel', () => {
    const rows = [pair('§ 5. (1) a', '§ 5. (1) b', '§ 5.'), pair('(2) c', '(2) c'), article('Artikel 2'), pair('§ 5. (1) x', '§ 5. (1) y', '§ 5.')]
    const grouped = rowsByParagraph(rows)
    expect(grouped.get('5')).toHaveLength(2)
    expect(grouped.get('5@2')).toHaveLength(1)
    expect(paraIdOfGld('§ 12a.')).toBe('12a')
    expect(paraIdOfGld('1.')).toBeNull()
  })

  it('attaches a heading row to the § that follows it, not the one before', () => {
    // The annex prints "Tabakfreie Nikotinerzeugnisse" above "§ 10h. (1) …".
    const rows = [pair('§ 10g. (1) alt', '§ 10g. (1) neu', '§ 10g.'), pair('', 'Tabakfreie Nikotinerzeugnisse'), pair('', '§ 10h. (1) Jedes Erzeugnis.', '§ 10h.')]
    const grouped = rowsByParagraph(rows)
    expect(grouped.get('10g')).toHaveLength(1)
    expect(grouped.get('10h')!.map((r) => r.proposed)).toEqual(['Tabakfreie Nikotinerzeugnisse', '§ 10h. (1) Jedes Erzeugnis.'])
  })
})

describe('stripMarkers', () => {
  it('drops the markers the tree does not carry', () => {
    expect(stripMarkers('§ 5. (1) Der Text 1. erste a) zweite')).toBe('Der Text erste zweite')
  })
})

describe('oracleVerdict', () => {
  const before = 'Zuständig ist die Behörde am Sitz der Partei. Sie entscheidet binnen sechs Wochen.'

  it('confirms a result the annex shows the same way', () => {
    const got = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. Sie entscheidet binnen sechs Wochen.'
    const rows = [pair('§ 6. (1) Zuständig ist die Behörde am Sitz der Partei.', '§ 6. (1) Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.', '§ 6.'), pair('Sie entscheidet binnen sechs Wochen.', 'Sie entscheidet binnen sechs Wochen.')]
    expect(oracleVerdict('6', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('contradicts a result that lacks the change the annex shows', () => {
    const rows = [pair('§ 6. (1) Zuständig ist die Behörde am Sitz der Partei.', '§ 6. (1) Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.', '§ 6.')]
    expect(oracleVerdict('6', before, before, rows)).toMatchObject({ verdict: 'widersprochen' })
  })

  it('contradicts a result that changed what the annex does not show', () => {
    // The engine also swapped the second sentence, which the annex leaves unchanged.
    const got = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. Sie entscheidet binnen vier Wochen.'
    const rows = [pair('§ 6. (1) Zuständig ist die Behörde am Sitz der Partei.', '§ 6. (1) Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.', '§ 6.'), pair('Sie entscheidet binnen sechs Wochen.', 'Sie entscheidet binnen sechs Wochen.')]
    const r = oracleVerdict('6', before, got, rows)
    expect(r.verdict).toBe('widersprochen')
    expect(r.note).toMatch(/vier/)
  })

  it('calls an annex that talks about another version foreign, not confirming', () => {
    const rows = [pair('§ 6. (1) Zuständig ist das Landesgericht.', '§ 6. (1) Zuständig ist das Bezirksgericht.', '§ 6.')]
    expect(oracleVerdict('6', before, before, rows)).toMatchObject({ verdict: 'fremd' })
  })

  it('stays silent on a § the annex only elides', () => {
    const rows = [pair('§ 6. (1) bis (3) …', '§ 6. (1) bis (3) …', '§ 6.', true)]
    expect(oracleVerdict('6', before, before, rows)).toMatchObject({ verdict: 'stumm' })
    expect(oracleVerdict('6', before, before, [])).toMatchObject({ verdict: 'stumm' })
  })

  it('is not fooled by punctuation attached to a word', () => {
    // "Wochen," in the engine's text and "Wochen" in the annex are one word.
    const got = 'Zuständig ist die Behörde am Sitz der Partei. Sie entscheidet binnen sechs Wochen, längstens acht.'
    const rows = [pair('Sie entscheidet binnen sechs Wochen.', 'Sie entscheidet binnen sechs Wochen, längstens acht.')]
    expect(oracleVerdict('6', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('confirms a § the draft creates against an insertion row', () => {
    const rows = [pair('', '§ 6a. (1) Neuer Paragraf.', '§ 6a.')]
    expect(oracleVerdict('6a', null, 'Neuer Paragraf.', rows)).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('6a', null, 'Anderer Paragraf.', rows)).toMatchObject({ verdict: 'widersprochen' })
  })
})
