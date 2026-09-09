import { describe, expect, it } from 'vitest'
import { oracleVerdict, paraIdOfGld, paragraphRows, rowsByParagraph, stripMarkers } from '../server/utils/tguOracle'
import type { ComparisonRow } from '../server/utils/textComparison'

function pair(current: string, proposed: string, gld: string | null = null, elided = false, law: string | null = null): ComparisonRow {
  const change = !current && proposed ? 'inserted' : current && !proposed ? 'removed' : current === proposed ? 'unchanged' : 'changed'
  return { kind: 'pair', law, heading: null, gld, para: gld, current, proposed, change, marked: false, elided, segments: null, editorial: false }
}
const article = (heading: string, law: string | null = null): ComparisonRow => ({ kind: 'article', law, heading, gld: null, para: null, current: '', proposed: '', change: 'unchanged', marked: false, elided: false, segments: null, editorial: false })

describe('rowsByParagraph', () => {
  // A package's second law starts its own § 5, and in the multi-law annexes
  // 15,1 % of designations recur in another law of the same package. The key
  // is therefore the law and the designation, never a counter over headings.
  it('files a § under its own law', () => {
    const rows = [
      pair('§ 5. (1) a', '§ 5. (1) b', '§ 5.', false, 'Änderung des Aktiengesetzes'),
      pair('(2) c', '(2) c', null, false, 'Änderung des Aktiengesetzes'),
      article('Artikel 2 — Änderung des GmbH-Gesetzes', 'Änderung des GmbH-Gesetzes'),
      pair('§ 5. (1) x', '§ 5. (1) y', '§ 5.', false, 'Änderung des GmbH-Gesetzes'),
    ]
    const grouped = rowsByParagraph(rows)
    expect(grouped.get('Änderung des Aktiengesetzes#5')).toHaveLength(2)
    expect(grouped.get('Änderung des GmbH-Gesetzes#5')).toHaveLength(1)
    expect(paraIdOfGld('§ 12a.')).toBe('12a')
    expect(paraIdOfGld('1.')).toBeNull()
  })

  // Asking for a bare "§ 5" of a package has no answer. The counter answered
  // anyway, with the first law's § 5, and that silently held the engine's
  // result against a different provision.
  it('is silent when a bare designation could mean two laws', () => {
    const rows = [
      pair('§ 5. (1) a', '§ 5. (1) b', '§ 5.', false, 'Änderung des Aktiengesetzes'),
      pair('§ 5. (1) x', '§ 5. (1) y', '§ 5.', false, 'Änderung des GmbH-Gesetzes'),
    ]
    const grouped = rowsByParagraph(rows)
    expect(paragraphRows(grouped, '5')).toEqual([])
    expect(paragraphRows(grouped, '5', 'Änderung des GmbH-Gesetzes')).toHaveLength(1)
  })

  it('answers a bare designation where the annex has one law', () => {
    const grouped = rowsByParagraph([pair('§ 5. (1) a', '§ 5. (1) b', '§ 5.', false, 'Änderung des Aktiengesetzes')])
    expect(paragraphRows(grouped, '5')).toHaveLength(1)
  })

  it('attaches a heading row to the § that follows it, not the one before', () => {
    // The annex prints "Tabakfreie Nikotinerzeugnisse" above "§ 10h. (1) …".
    const rows = [pair('§ 10g. (1) alt', '§ 10g. (1) neu', '§ 10g.'), pair('', 'Tabakfreie Nikotinerzeugnisse'), pair('', '§ 10h. (1) Jedes Erzeugnis.', '§ 10h.')]
    const grouped = rowsByParagraph(rows)
    expect(paragraphRows(grouped, '10g')).toHaveLength(1)
    expect(paragraphRows(grouped, '10h').map((r) => r.proposed)).toEqual(['Tabakfreie Nikotinerzeugnisse', '§ 10h. (1) Jedes Erzeugnis.'])
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
