import { describe, expect, it } from 'vitest'
import { oracleVerdict, paraIdOfGld, paragraphRows, rowsByParagraph, stripMarkers } from '../server/utils/kons/tguOracle'
import type { ComparisonRow } from '../server/utils/annex/comparisonRows'

function pair(current: string, proposed: string, gld: string | null = null, elided = false, law: string | null = null): ComparisonRow {
  const change = !current && proposed ? 'inserted' : current && !proposed ? 'removed' : current === proposed ? 'unchanged' : 'changed'
  return { kind: 'pair', law, heading: null, gld, para: gld, current, proposed, change, elided, segments: null, editorial: false }
}
const article = (heading: string, law: string | null = null): ComparisonRow => ({ kind: 'article', law, heading, gld: null, para: null, current: '', proposed: '', change: 'unchanged', elided: false, segments: null, editorial: false })

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

  it('files a schedule under its own kind, so it never answers for a § of that number', () => {
    // A law may carry a § 1 and an Anlage 1; the annex names both, and the
    // key has to tell them apart (26.09.2026).
    expect(paraIdOfGld('Anlage 1')).toBe('Anl. 1')
    expect(paraIdOfGld('Anhang')).toBe('Anl.')
    expect(paraIdOfGld('gemäß Anlage 1')).toBeNull()
    const rows = [pair('§ 1. alt', '§ 1. neu', '§ 1.'), pair('Anhang alt', 'Anhang neu', 'Anlage 1')]
    const grouped = rowsByParagraph(rows)
    expect(grouped.get('#1')).toHaveLength(1)
    expect(grouped.get('#Anl. 1')).toHaveLength(1)
    // „des Anhangs" names no number; the one schedule of the annex answers it.
    expect(paragraphRows(grouped, 'Anl.', null)).toHaveLength(1)
    expect(paragraphRows(grouped, '1', null)[0]!.current).toBe('§ 1. alt')
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
    const rows = [pair('', '§ 6a. (1) Neuer Paragraph.', '§ 6a.')]
    expect(oracleVerdict('6a', null, 'Neuer Paragraph.', rows)).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('6a', null, 'Anderer Paragraph.', rows)).toMatchObject({ verdict: 'widersprochen' })
  })
})

describe('the oracle reads removals too (2026-09-23)', () => {
  // The doc comment promised "every word the engine inserted or removed"
  // since the module was written, and only the insertions were counted: the
  // third containment was built from `inserted` segments alone, and the loop
  // over the proposed column skipped a row whose proposed cell is empty —
  // which is exactly what a removal row looks like. So a deletion one level
  // too high ("lit. a sublit. bb entfällt." applied to lit. a) invented no
  // word, contradicted nothing, and `gateParagraph` published it.
  const before = 'a) die Anzeige, b) die Meldung. Beides ist schriftlich zu erstatten.'

  it('contradicts a deletion that goes beyond what the annex removes', () => {
    // The annex rewrites lit. b and says nothing about lit. a. The engine
    // rewrote lit. b — so both the changed row and every inserted word check
    // out — and dropped lit. a on the way.
    const rows = [pair('§ 8. b) die Meldung.', '§ 8. b) die Mitteilung.', '§ 8.')]
    const wide = oracleVerdict('8', before, 'b) die Mitteilung. Beides ist schriftlich zu erstatten.', rows)
    expect(wide.verdict).toBe('widersprochen')
    expect(wide.note).toMatch(/entfernte/)
    // The same rewrite without the extra loss is confirmed.
    expect(oracleVerdict('8', before, 'a) die Anzeige, b) die Mitteilung. Beides ist schriftlich zu erstatten.', rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('reads a row that proposes nothing as the deletion it is', () => {
    // "b) die Meldung." against an empty proposed cell: the annex says this
    // text goes. A result that still carries it is contradicted; the check
    // never ran before, because the row was skipped.
    const rows = [pair('§ 8. a) die Anzeige, b) die Meldung.', '§ 8. a) die Anzeige,', '§ 8.'), pair('Beides ist schriftlich zu erstatten.', '')]
    expect(oracleVerdict('8', before, 'a) die Anzeige, Beides ist schriftlich zu erstatten.', rows)).toMatchObject({ verdict: 'widersprochen', note: expect.stringMatching(/Gestrichene Fassung/) })
    expect(oracleVerdict('8', before, 'a) die Anzeige,', rows)).toMatchObject({ verdict: 'bestätigt' })
  })
})

describe('a whole-§ row with holes in it (2026-09-25)', () => {
  // The PDF path emits one row per §, and the ressort leaves the §'s
  // unchanged stretches out inside that row. The cell is then a subsequence
  // of the standing text and never a substring of it, so the first
  // containment refused every such row as `fremd`: 0 of 1.585 rows the corpus
  // could resolve against RIS passed it (`pnpm corpus:inner-elision`,
  // 25.09.2026). Both checks segment at the marks now, and 697 of them pass.
  const before = 'Zuständig ist die Behörde. (2) Die Frist beträgt sechs Wochen. (3) Der Antrag ist schriftlich zu stellen.'
  const got = 'Zuständig ist die Behörde. (2) Die Frist beträgt sechs Wochen. (3) Der Antrag ist elektronisch zu stellen.'
  const whole = pair(
    '§ 6. (1) Zuständig ist die Behörde. (2) … (3) Der Antrag ist schriftlich zu stellen.',
    '§ 6. (1) Zuständig ist die Behörde. (2) … (3) Der Antrag ist elektronisch zu stellen.',
    '§ 6.',
  )

  it('confirms a § whose unchanged middle the annex left out', () => {
    expect(oracleVerdict('6', before, got, [whole])).toMatchObject({ verdict: 'bestätigt' })
  })

  it('still calls a row about another version foreign', () => {
    // The holes must not become a licence: what the annex does print has to
    // be in the standing text, or the row is talking about another law.
    const other = pair('§ 6. (1) Zuständig ist das Landesgericht. (2) … (3) Der Antrag ist schriftlich zu stellen.', '§ 6. (1) Zuständig ist das Landesgericht. (2) … (3) Der Antrag ist elektronisch zu stellen.', '§ 6.')
    expect(oracleVerdict('6', before, got, [other])).toMatchObject({ verdict: 'fremd' })
  })

  it('still contradicts a result the annex does not show', () => {
    const wrong = 'Zuständig ist die Behörde. (2) Die Frist beträgt sechs Wochen. (3) Der Antrag ist mündlich zu stellen.'
    expect(oracleVerdict('6', before, wrong, [whole])).toMatchObject({ verdict: 'widersprochen' })
  })

  // The stretches are walked in the order the annex prints them and without
  // overlap. Looked up one by one each could match anywhere, and a cell whose
  // Absätze arrived in the wrong order — which is what a mis-read page
  // produces — would pass as if nothing were wrong.
  it('refuses stretches the standing text carries in the other order', () => {
    const swapped = pair('§ 6. (3) Der Antrag ist schriftlich zu stellen. (2) … (1) Zuständig ist die Behörde.', '§ 6. (3) Der Antrag ist elektronisch zu stellen. (2) … (1) Zuständig ist die Behörde.', '§ 6.')
    expect(oracleVerdict('6', before, got, [swapped])).toMatchObject({ verdict: 'fremd' })
  })

  // Freeing the geltende column alone would have moved the § out of `fremd`
  // only for its proposed column — elided by the same ressort in the same row
  // — to contradict it, and the page would tell the reader the annex
  // disagrees with us where it simply left text out. 1.801 of the PDF path's
  // 2.950 substantive rows carry a mark on that side too.
  it('segments the proposed column as well', () => {
    const rows = [pair('§ 6. (1) Zuständig ist die Behörde. (2) und (3) …', '§ 6. (1) Zuständig ist das Amt. (2) und (3) …', '§ 6.')]
    const after = 'Zuständig ist das Amt. (2) Die Frist beträgt sechs Wochen. (3) Der Antrag ist schriftlich zu stellen.'
    expect(oracleVerdict('6', before, after, rows)).toMatchObject({ verdict: 'bestätigt' })
  })
})
