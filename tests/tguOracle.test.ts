import { describe, expect, it } from 'vitest'
import { KEPT_DELETION_NOTE, absatzOrderBroken, absatzSequence, annexChangedUnits, keptDeletion, oracleVerdict, paraIdOfGld, paragraphRows, rowsByParagraph, silentOmissions, someDrawers, standingUnitsOf, stripMarkers } from '../server/utils/kons/tguOracle'
import type { LawNode } from '../server/utils/lawtext/konsTree'
import type { ComparisonRow } from '../server/utils/annex/comparisonRows'

function pair(current: string, proposed: string, gld: string | null = null, elided = false, law: string | null = null): ComparisonRow {
  const change = !current && proposed ? 'inserted' : current && !proposed ? 'removed' : current === proposed ? 'unchanged' : 'changed'
  return { kind: 'pair', law, heading: null, gld, para: gld, paraAfter: gld, current, proposed, change, elided, segments: null, editorial: false, elisionRange: false }
}
const article = (heading: string, law: string | null = null): ComparisonRow => ({ kind: 'article', law, heading, gld: null, para: null, paraAfter: null, current: '', proposed: '', change: 'unchanged', elided: false, segments: null, editorial: false, elisionRange: false })

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

describe('rowsByParagraph — a § opened without a row of its own (25.10.2026)', () => {
  // `comparisonRows` emits no row for a designation that stands alone („§ 190."
  // over the salary table of the RStDG, 126/ME XXVIII) and hands the § on in
  // `para`. Read by `gld` alone, § 190's rows were held against § 184.
  const inherits = (row: ComparisonRow, para: string): ComparisonRow => ({ ...row, para })

  it('files the rows under the § their `para` names', () => {
    const rows = [
      pair('(1) Ist der Leiter verhindert, vertritt ihn der Stellvertreter.', '(1) Ist die Vorsitzende verhindert, vertritt sie das dienstälteste Mitglied.', '§ 184.'),
      inherits(pair('(2) und (3) …', '(2) und (3) …', null, true), '§ 184.'),
      inherits(pair('Ein festes Gehalt gebührt dem Leiter im Ausmaß von 15 823,0 €.', 'Ein festes Gehalt gebührt den Mitgliedern im Ausmaß von 16 345,2 €.'), '§ 190.'),
      inherits(pair('(2) Es haben Anspruch auf ein Gehalt der', '(2) Es haben Anspruch auf ein Gehalt der'), '§ 190.'),
    ]
    const grouped = rowsByParagraph(rows)
    expect(paragraphRows(grouped, '184')).toHaveLength(2)
    expect(paragraphRows(grouped, '190')).toHaveLength(2)
    // § 184 is judged on its own rows again, not `fremd` over § 190's salary.
    const before = 'Ist der Leiter verhindert, vertritt ihn der Stellvertreter. Zwei. Drei.'
    const got = 'Ist die Vorsitzende verhindert, vertritt sie das dienstälteste Mitglied. Zwei. Drei.'
    expect(oracleVerdict('184', before, got, paragraphRows(grouped, '184')).verdict).toBe('bestätigt')
  })

  it('opens the § an elision line names', () => {
    // Verbrechensopfergesetz: „§ 4 Ab. 1 bis 4 …" opens § 4 (`elisionOpens`).
    const rows = [pair('10. Pauschalentschädigung.', '10. Pauschalentschädigung;', '§ 2.'), inherits(pair('§ 4 Ab. 1 bis 4 …', '§ 4 Ab. 1 bis 4 …', null, true), '§ 4.'), inherits(pair('(5) alt', '(5) neu'), '§ 4.')]
    const grouped = rowsByParagraph(rows)
    expect(paragraphRows(grouped, '2')).toHaveLength(1)
    expect(paragraphRows(grouped, '4').map((r) => r.current)).toEqual(['§ 4 Ab. 1 bis 4 …', '(5) alt'])
  })

  it('does not open a § early for a heading held back for it', () => {
    // StVO, a changed Abschnitt heading handed to § 68, whose own row follows:
    // RIS keeps the heading out of the §'s text, and read under § 68 it made
    // a confirmed § `fremd`.
    const rows = [
      pair('§ 54. (1) a', '§ 54. (1) b', '§ 54.'),
      inherits(pair('Besondere Vorschriften für den Verkehr mit Fahrrädern.', 'Besondere Vorschriften für den Verkehr mit Fahrrädern und Rollern.'), '§ 68.'),
      pair('(1) bis (5) …', '(1) bis (5) …', '§ 68.', true),
    ]
    expect(paragraphRows(rowsByParagraph(rows), '68')).toHaveLength(1)
  })
})

describe('stripMarkers', () => {
  it('drops the markers the tree does not carry', () => {
    expect(stripMarkers('§ 5. (1) Der Text 1. erste a) zweite')).toBe('Der Text erste zweite')
  })

  // On the PDF path a cell is a whole §, and the Beilage prints the §'s own
  // heading BEFORE the designation — so the designation stands in the middle
  // of the cell (26.09.2026).
  it('drops the designation wherever it stands, not only at the head', () => {
    expect(stripMarkers('Spielbedingungen und Vertrieb § 16. (1) Der Konzessionär hat')).toBe('Spielbedingungen und Vertrieb Der Konzessionär hat')
  })

  it('leaves a citation that carries no dot of its own alone', () => {
    expect(stripMarkers('Ausspielungen nach § 2 Abs. 3 an ortsfesten')).toBe('Ausspielungen nach § 2 Abs. 3 an ortsfesten')
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

  it('lets no unchanged row excuse the loss of its own words', () => {
    // The engine dropped „sechs" from the sentence the annex leaves as it is.
    const got = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. Sie entscheidet binnen Wochen.'
    const rows = [pair('§ 6. (1) Zuständig ist die Behörde am Sitz der Partei.', '§ 6. (1) Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei.', '§ 6.'), pair('Sie entscheidet binnen sechs Wochen.', 'Sie entscheidet binnen sechs Wochen.')]
    const r = oracleVerdict('6', before, got, rows)
    expect(r.verdict).toBe('widersprochen')
    expect(r.note).toMatch(/sechs/)
  })

  it('calls an annex that talks about another version foreign, not confirming', () => {
    const rows = [pair('§ 6. (1) Zuständig ist das Landesgericht.', '§ 6. (1) Zuständig ist das Bezirksgericht.', '§ 6.')]
    expect(oracleVerdict('6', before, before, rows)).toMatchObject({ verdict: 'fremd' })
  })

  // The PDF path prints the group headings over the §; RIS keeps them out of
  // the §'s own text on purpose, and carries them for this § only rarely.
  it('reads past a stack of group headings printed above the §', () => {
    const rows = [
      pair(
        '3. Abschnitt Verfahren Zuständig ist die Behörde am Sitz der Partei. … Sie entscheidet binnen sechs Wochen.',
        '3. Abschnitt Verfahren Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. … Sie entscheidet binnen sechs Wochen.',
        '§ 6.',
      ),
    ]
    const got = 'Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. Sie entscheidet binnen sechs Wochen.'
    expect(oracleVerdict('6', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  // The other half of the same rule: what precedes the standing text has to
  // open with a group unit. The previous §'s last words do not, and a row
  // carrying them is exactly what this check exists to catch.
  it('still calls a row foreign when the text in front is not a heading stack', () => {
    const rows = [
      pair(
        'beträgt 75 000 Euro je Förderwerber Zuständig ist die Behörde am Sitz der Partei. … Sie entscheidet binnen sechs Wochen.',
        'beträgt 75 000 Euro je Förderwerber Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. … Sie entscheidet binnen sechs Wochen.',
        '§ 6.',
      ),
    ]
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

describe('a result that holds more than the annex proposes (01.10.2026)', () => {
  // Checks 1 to 3 asked only whether the proposed column is IN the result,
  // and a deletion the engine did not carry out inserts and removes nothing.
  // Seilbahn-Entwurf § 10: the Beilage rewrites Abs. 2 and drops Abs. 3 in
  // one changed row; the engine kept Abs. 3, and the oracle confirmed it.
  const before = 'Aufbewahrung Das Unternehmen hat Aufzeichnungen zu führen. Die Aufzeichnungen gemäß Abs. 1 und die Unterlagen gemäß § 9 sind aufzubewahren. Der Fertigstellungsbericht gemäß § 14 ist auf Bestanddauer aufzubewahren.'
  const row = pair(
    '(1) Das Unternehmen hat Aufzeichnungen zu führen. (2) Die Aufzeichnungen gemäß Abs. 1 und die Unterlagen gemäß § 9 sind aufzubewahren. (3) Der Fertigstellungsbericht gemäß § 14 ist auf Bestanddauer aufzubewahren.',
    '(1) Das Unternehmen hat Aufzeichnungen zu führen. (2) Die Aufzeichnungen gemäß Abs. 1 und die Unterlagen gemäß den §§ 8 und 9 sind aufzubewahren.',
    '§ 10.',
  )
  const right = 'Aufbewahrung Das Unternehmen hat Aufzeichnungen zu führen. Die Aufzeichnungen gemäß Abs. 1 und die Unterlagen gemäß den §§ 8 und 9 sind aufzubewahren.'

  it('contradicts a result that kept the Absatz a changed row strikes', () => {
    expect(oracleVerdict('10', before, right, [row])).toMatchObject({ verdict: 'bestätigt' })
    const kept = oracleVerdict('10', before, `${right} Der Fertigstellungsbericht gemäß § 14 ist auf Bestanddauer aufzubewahren.`, [row])
    expect(kept).toMatchObject({ verdict: 'widersprochen', note: expect.stringContaining(KEPT_DELETION_NOTE) })
  })

  // The struck sentence counts only where it stands: beside the stretch the
  // annex cut it from. The same sentence in an Absatz the annex never
  // printed is the law saying it twice — the first version of the check read
  // it as kept and withheld StAG § 34 that way.
  it('is not fooled by the same words standing elsewhere in the §', () => {
    const twice = 'Die Behörde entscheidet. Die Frist beträgt sechs Wochen ab Einlangen. Zuständig ist das Amt. Die Frist beträgt sechs Wochen ab Einlangen.'
    const rows = [pair('(2) Die Behörde entscheidet. Die Frist beträgt sechs Wochen ab Einlangen.', '(2) Die Behörde entscheidet.', '§ 6.')]
    expect(oracleVerdict('6', twice, 'Die Behörde entscheidet. Zuständig ist das Amt. Die Frist beträgt sechs Wochen ab Einlangen.', rows)).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('6', twice, twice, rows)).toMatchObject({ verdict: 'widersprochen', note: expect.stringContaining(KEPT_DELETION_NOTE) })
  })

  // Where a row rewrites one sentence and drops the next, the row's own diff
  // runs both into one region; the struck sentence is its second half, and
  // it is the result's words beside the stretch that are read
  // (Sektenfragen-Gesetz § 11).
  it('finds a struck sentence behind a rewritten one', () => {
    const standing = 'Die Organe sind zur Verschwiegenheit über alle Tatsachen verpflichtet. Die Verpflichtung gilt auch nach dem Ausscheiden aus der Funktion.'
    const rewritten = 'Die Organwalter sind zur Geheimhaltung verpflichtet, soweit dies erforderlich ist.'
    const rows = [pair(standing, rewritten, '§ 11.')]
    expect(oracleVerdict('11', standing, rewritten, rows)).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('11', standing, `${rewritten} Die Verpflichtung gilt auch nach dem Ausscheiden aus der Funktion.`, rows)).toMatchObject({ verdict: 'widersprochen' })
  })

  // A stretch that ends at a mark ends there by the ressort's choice: what
  // the left column prints before ITS mark and the right column does not is
  // struck, and it must not stand right behind the stretch.
  it('reads the edge of a stretch at an elision mark', () => {
    const standing = 'Stellt sich die Unrichtigkeit heraus, ist sie mitzuteilen. Die nähere Regelung wird einer Verordnung vorbehalten. Die Frist beträgt einen Monat.'
    const rows = [pair('§ 16. (1) Stellt sich die Unrichtigkeit heraus, ist sie mitzuteilen. Die nähere Regelung wird einer Verordnung vorbehalten. (2) …', '§ 16. (1) Stellt sich die Unrichtigkeit heraus, ist sie mitzuteilen. (2) …', '§ 16.')]
    expect(oracleVerdict('16', standing, 'Stellt sich die Unrichtigkeit heraus, ist sie mitzuteilen. Die Frist beträgt einen Monat.', rows)).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('16', standing, standing, rows)).toMatchObject({ verdict: 'widersprochen', note: expect.stringContaining(KEPT_DELETION_NOTE) })
  })

  // A unit the right column leaves out between two of its marks has no
  // stretch beside it — „a) bis e) … g) bis j) …" against a left column that
  // prints lit. f in between. It counts where it stands at all.
  it('finds a unit struck between two marks', () => {
    const standing = 'Zur Beitragsgrundlage gehören nicht: Ruhebezüge, Arbeitslöhne von Personen, die das 60. Lebensjahr vollendet haben, Sonstiges.'
    const rows = [pair('§ 41. (4) a) bis e) … f) Arbeitslöhne von Personen, die das 60. Lebensjahr vollendet haben, g) bis j) …', '§ 41. (4) a) bis e) … g) bis j) …', '§ 41.')]
    expect(oracleVerdict('41', standing, 'Zur Beitragsgrundlage gehören nicht: Ruhebezüge, Sonstiges.', rows)).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('41', standing, standing, rows)).toMatchObject({ verdict: 'widersprochen', note: expect.stringContaining(KEPT_DELETION_NOTE) })
  })

  // Before the first stretch, what the left column prints ahead of the §
  // symbol is the §'s heading; the PDF path cuts the right column's copy of
  // it short where it wraps (SPG § 57). A heading is not struck by being
  // printed shorter.
  it('does not read a heading the right column printed shorter as struck', () => {
    const standing = 'Zentrale Informationssammlung aller Behörden Zulässigkeit der Ermittlung Die Behörde darf Daten verarbeiten.'
    const rows = [pair('Zentrale Informationssammlung aller Behörden Zulässigkeit der Ermittlung § 57. (1) Die Behörde darf Daten verarbeiten.', 'Zulässigkeit der Ermittlung § 57. (1) Die Behörde darf Daten speichern.', '§ 57.')]
    expect(oracleVerdict('57', standing, 'Zentrale Informationssammlung aller Behörden Zulässigkeit der Ermittlung Die Behörde darf Daten speichern.', rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  // A row the ressort split: what the first row's right column lacks, the
  // next one prints. Words the § prints on the right are not struck.
  it('lets the next row print what the first one leaves off', () => {
    const standing = 'Die Behörde entscheidet über den Antrag. Sie hat dabei die Fristen des Abs. 2 zu wahren.'
    const rows = [
      pair('§ 6. (1) Die Behörde entscheidet über den Antrag. Sie hat dabei die Fristen des Abs. 2 zu wahren.', '§ 6. (1) Das Amt entscheidet über den Antrag.', '§ 6.'),
      pair('', 'Sie hat dabei die Fristen des Abs. 2 zu wahren.'),
    ]
    expect(oracleVerdict('6', standing, 'Das Amt entscheidet über den Antrag. Sie hat dabei die Fristen des Abs. 2 zu wahren.', rows)).toMatchObject({ verdict: 'bestätigt' })
  })
})

// The group headings the PDF path prints into a row, in the shapes the corpus
// showed on 05.10.2026 — and the shapes that
// must stay foreign.
describe('oracleVerdict — group headings in the row', () => {
  const before = 'Verfahren Zuständig ist die Behörde am Sitz der Partei. Sie entscheidet binnen sechs Wochen.'
  const got = 'Verfahren Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. Sie entscheidet binnen sechs Wochen.'

  it('reads past a stack whose last word before the marks is the §\'s own heading', () => {
    const rows = [
      pair(
        '2. Abschnitt Umstellungsförderung (58-01) Verfahren § 6. (1) Zuständig ist die Behörde am Sitz der Partei. (2) …',
        '2. Abschnitt Umstellungsförderung (58-01) Verfahren § 6. (1) Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. (2) …',
        '§ 6.',
      ),
    ]
    expect(oracleVerdict('6', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  // The remainder has to be the result's beginning, whole — not its first
  // 24 characters there and the rest wherever it stands (126/ME XXVIII StPO
  // § 23, 19.11.2026): the §'s heading recurs inside the Absatz, and the
  // row's own changed words were read as the stack above it.
  it('never reads a row\'s changed words as a stack because the §\'s heading recurs further in', () => {
    const standing = 'Nichtigkeitsbeschwerde zur Wahrung des Gesetzes Die Generalprokuratur kann von Amts wegen oder im Auftrag des Bundesministers für Justiz gegen Urteile der Strafgerichte, die auf einer Verletzung des Gesetzes beruhen, Nichtigkeitsbeschwerde zur Wahrung des Gesetzes erheben.'
    const rows = [
      pair(
        '(1) Die Generalprokuratur kann von Amts wegen oder im Auftrag des Bundesministers für Justiz gegen Urteile der Strafgerichte, die auf einer Verletzung des Gesetzes beruhen, Nichtigkeitsbeschwerde zur Wahrung des Gesetzes erheben.',
        '(1) Die Bundesstaatsanwaltschaft kann von Amts wegen gegen Urteile der Strafgerichte, die auf einer Verletzung des Gesetzes beruhen, Nichtigkeitsbeschwerde zur Wahrung des Gesetzes erheben.',
        '§ 23.',
      ),
    ]
    expect(oracleVerdict('23', standing, standing, rows)).toMatchObject({ verdict: 'widersprochen' })
    const carried = 'Nichtigkeitsbeschwerde zur Wahrung des Gesetzes Die Bundesstaatsanwaltschaft kann von Amts wegen gegen Urteile der Strafgerichte, die auf einer Verletzung des Gesetzes beruhen, Nichtigkeitsbeschwerde zur Wahrung des Gesetzes erheben.'
    expect(oracleVerdict('23', standing, carried, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  // The citation in front of the marks is the changed text (Asylgesetz § 7,
  // 19.11.2026): read as the announcement of „(2) …", it left the stretch
  // on both sides, and a result that kept „bis 6" was confirmed.
  it('reads a changed citation that stands right before an omission', () => {
    const standing = 'Bundesverwaltungsgericht Das Bundesverwaltungsgericht entscheidet über Beschwerden gemäß §§ 3 Abs. 2 Z 1 bis 6 und 4 Abs. 1 Z 1 und 2. Es entscheidet ferner.'
    const rows = [
      pair(
        'Bundesverwaltungsgericht § 7. (1) Das Bundesverwaltungsgericht entscheidet über Beschwerden gemäß §§ 3 Abs. 2 Z 1 bis 6 und 4 Abs. 1 Z 1 und 2. (2) ...',
        'Bundesverwaltungsgericht § 7. (1) Das Bundesverwaltungsgericht entscheidet über Beschwerden gemäß §§ 3 Abs. 2 Z 1 bis 9 und 4 Abs. 1 Z 1 und 2. (2) ...',
        '§ 7.',
      ),
    ]
    expect(oracleVerdict('7', standing, standing, rows)).toMatchObject({ verdict: 'widersprochen' })
    expect(oracleVerdict('7', standing, standing.replace('bis 6', 'bis 9'), rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('cuts at the second copy when the group bears the §\'s own heading', () => {
    const rows = [
      pair(
        '1. Abschnitt Verfahren Verfahren § 6. (1) Zuständig ist die Behörde am Sitz der Partei. … Sie entscheidet binnen sechs Wochen.',
        '1. Abschnitt Verfahren Verfahren § 6. (1) Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. … Sie entscheidet binnen sechs Wochen.',
        '§ 6.',
      ),
    ]
    expect(oracleVerdict('6', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('takes a colon after the unit for a heading\'s', () => {
    const rows = [
      pair(
        '3. TEIL: SCHLUSSBESTIMMUNGEN Verfahren § 6. (1) Zuständig ist die Behörde am Sitz der Partei. … Sie entscheidet binnen sechs Wochen.',
        '3. TEIL: SCHLUSSBESTIMMUNGEN Verfahren § 6. (1) Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. … Sie entscheidet binnen sechs Wochen.',
        '§ 6.',
      ),
    ]
    expect(oracleVerdict('6', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('passes over the next group\'s heading at the foot of the §', () => {
    const rows = [
      pair(
        '§ 6. (1) Zuständig ist die Behörde am Sitz der Partei. (2) bis (4) … 3. Abschnitt',
        '§ 6. (1) Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. (2) bis (4) … 3. Abschnitt',
        '§ 6.',
      ),
    ]
    expect(oracleVerdict('6', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('still calls a row foreign when its own text is not the standing §', () => {
    const rows = [
      pair(
        '2. Abschnitt Umstellungsförderung Verfahren § 6. (1) Zuständig ist das Landesgericht.',
        '2. Abschnitt Umstellungsförderung Verfahren § 6. (1) Zuständig ist das Bezirksgericht.',
        '§ 6.',
      ),
    ]
    expect(oracleVerdict('6', before, before, rows)).toMatchObject({ verdict: 'fremd' })
  })

  it('does not take an unnumbered „Teile …" for a heading', () => {
    const rows = [pair('Teile der Förderung', 'Teile der Förderung und mehr')]
    expect(oracleVerdict('6', before, before, rows)).toMatchObject({ verdict: 'fremd' })
  })

  it('does not skip a numbered list item that only starts like a unit', () => {
    const rows = [pair('§ 6. (1) Zuständig ist die Behörde am Sitz der Partei. … 1. Teilnehmer am Verfahren', '§ 6. (1) Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. … 1. Teilnehmer am Verfahren', '§ 6.')]
    expect(oracleVerdict('6', before, got, rows)).toMatchObject({ verdict: 'fremd' })
  })

  it('reads past a group named without a unit word', () => {
    for (const group of ['Dritter Abschnitt Fahrtkosten', 'III. Form der Verfügung', 'B. Geteilte Abgaben', 'GEMEINSAME BESTIMMUNGEN', '(Waldfondsgesetz)']) {
      const rows = [
        pair(
          `${group} Verfahren § 6. (1) Zuständig ist die Behörde am Sitz der Partei. … Sie entscheidet binnen sechs Wochen.`,
          `${group} Verfahren § 6. (1) Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. … Sie entscheidet binnen sechs Wochen.`,
          '§ 6.',
        ),
      ]
      expect(oracleVerdict('6', before, got, rows), group).toMatchObject({ verdict: 'bestätigt' })
    }
  })

  it('still calls a sentence in front of the § foreign', () => {
    const rows = [
      pair(
        'Die Förderung beträgt 75 000 Euro. Verfahren § 6. (1) Zuständig ist die Behörde am Sitz der Partei. … Sie entscheidet binnen sechs Wochen.',
        'Die Förderung beträgt 75 000 Euro. Verfahren § 6. (1) Zuständig ist die Bezirksverwaltungsbehörde am Sitz der Partei. … Sie entscheidet binnen sechs Wochen.',
        '§ 6.',
      ),
    ]
    expect(oracleVerdict('6', before, got, rows)).toMatchObject({ verdict: 'fremd' })
  })
})

describe('oracleVerdict — stretches that say nothing', () => {
  const before = 'Vorstand Der Vorstand besteht aus zwei Mitgliedern. Er wird bestellt.'
  const got = 'Vorstand Der Vorstand besteht aus drei Mitgliedern. Er wird bestellt.'
  const row = (head: string, tail = ''): ComparisonRow[] => [
    pair(`${head} § 5. (1) Der Vorstand besteht aus zwei Mitgliedern. … Er wird bestellt.${tail}`, `${head} § 5. (1) Der Vorstand besteht aus drei Mitgliedern. … Er wird bestellt.${tail}`, '§ 5.'),
  ]

  it('reads a §\'s own heading of exactly eight letters behind a prefix', () => {
    expect(oracleVerdict('5', before, got, row('Text Vorstand'))).toMatchObject({ verdict: 'bestätigt' })
  })

  it('passes over a rule of underscores and a group counted in words', () => {
    expect(oracleVerdict('5', before, got, row('Vorstand', ' … ______________'))).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('5', before, got, row('Vorstand', ' … Siebenter Teil'))).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('5', before, got, row('Vorstand', ' … ABSCHNITT IIA BEITRAG'))).toMatchObject({ verdict: 'bestätigt' })
  })
})

describe('oracleVerdict — the ressort\'s hand copy of RIS', () => {
  const before = 'Aufgaben Die Schieneninfrastruktur-Dienstleistungsgesellschaft mbH hat F&E zu fördern. Sie berichtet jährlich.'
  const got = 'Aufgaben Die Schieneninfrastruktur-Dienstleistungsgesellschaft mbH hat F&E zu fördern. Sie berichtet halbjährlich.'

  it('does not tell a hyphen, a dash, an ampersand or a RIS note from their absence', () => {
    const rows = [
      pair(
        '§ 4. (1) Die Schieneninfrastruktur Dienstleistungsgesellschaft mbH hat FE zu fördern. (Anm.: Abs. 2 aufgehoben durch BGBl. I Nr. 5/2025) Sie berichtet jährlich.',
        '§ 4. (1) Die Schieneninfrastruktur Dienstleistungsgesellschaft mbH hat FE zu fördern. Sie berichtet halbjährlich.',
        '§ 4.',
      ),
    ]
    expect(oracleVerdict('4', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('passes over the next group\'s heading after the last sentence', () => {
    const rows = [pair('Sie berichtet jährlich. 2. Hauptstück Asylverfahrensrecht', 'Sie berichtet halbjährlich. 2. Hauptstück Asylverfahrensrecht')]
    expect(oracleVerdict('4', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('reads an old-style heading with its full stops as a heading', () => {
    const rows = [pair('Sie berichtet jährlich. … VI. Hauptstück. Behandlung der aufzubewahrenden Acten.', 'Sie berichtet halbjährlich. … VI. Hauptstück. Behandlung der aufzubewahrenden Acten.')]
    expect(oracleVerdict('4', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('still calls a trailing sentence foreign, heading-like or not', () => {
    const rows = [pair('Sie berichtet jährlich. 2. Teil der Kosten trägt der Bund.', 'Sie berichtet halbjährlich. 2. Teil der Kosten trägt der Bund.')]
    expect(oracleVerdict('4', before, got, rows)).toMatchObject({ verdict: 'fremd' })
  })
})

it('does not take a numbered sentence for an old-style heading by its final stop', () => {
  const before = 'Verfahren Zuständig ist die Behörde am Sitz der Partei.'
  const rows = [pair('2. Abschnitt. Zuständig ist das Landesgericht. Es entscheidet.', '2. Abschnitt. Zuständig ist das Bezirksgericht. Es entscheidet.')]
  expect(oracleVerdict('6', before, before, rows)).toMatchObject({ verdict: 'fremd' })
})

describe('oracleVerdict — the same text, written differently', () => {
  const before = 'Wahl Für die Anfechtung der Wahl gilt § 49f Abs. 5. Die Wahl ist geheim.'
  const got = 'Wahl Für die Anfechtung der Wahl gilt § 49f Abs. 7. Die Wahl ist geheim. Die §§ 3 und 4 in der Fassung BGBl. I Nr. xxx/xxxx treten mit Juli 2027 in Kraft.'

  it('reads a number ending the cell like the same number inside a sentence', () => {
    const rows = [pair('Für die Anfechtung der Wahl gilt § 49f Abs. 5.', 'Für die Anfechtung der Wahl gilt § 49f Abs. 7.')]
    expect(oracleVerdict('5', before, got.split(' Die §§')[0]!, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('takes every spelling of a not yet issued BGBl number for the same placeholder', () => {
    const rows = [pair('Die Wahl ist geheim.', 'Die Wahl ist geheim. Die §§ 3 und 4 in der Fassung BGBl. I Nr. xxx/yyyy treten mit Juli 2027 in Kraft.')]
    expect(oracleVerdict('5', 'Wahl Für die Anfechtung der Wahl gilt § 49f Abs. 7. Die Wahl ist geheim.', got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('keeps a real BGBl number a number', () => {
    const rows = [pair('Die Wahl ist geheim.', 'Die Wahl ist geheim. Die §§ 3 und 4 in der Fassung BGBl. I Nr. 12/2026 treten mit Juli 2027 in Kraft.')]
    expect(oracleVerdict('5', 'Wahl Für die Anfechtung der Wahl gilt § 49f Abs. 7. Die Wahl ist geheim.', got, rows)).toMatchObject({ verdict: 'widersprochen' })
  })
})

it('normalises a placeholder the word diff hands over without its „Nr."', () => {
  const before = 'Inkrafttreten Diese Verordnung tritt in Kraft.'
  const got = 'Inkrafttreten Diese Verordnung tritt in Kraft. § 8a in der Fassung BGBl. II Nr. xxx/2026 tritt in Kraft.'
  const rows = [pair('Diese Verordnung tritt in Kraft.', 'Diese Verordnung tritt in Kraft. § 8a in der Fassung BGBl. II Nr. XX/20XX tritt in Kraft.')]
  expect(oracleVerdict('9', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
})

it('still sees an Absatz kept where the annex prints „Aufgehoben"', () => {
  // Budgetbegleitgesetz 2025 § 412: check 2 reads „(2) Aufgehoben." as the
  // repealed Absatz; check 4 must then find the Absatz still standing.
  const before = 'Schlussbestimmungen § 85 tritt mit 1. Jänner 2025 in Kraft. § 46 Abs. 1a ist bei der Pensionsanpassung für das Kalenderjahr 2026 nicht anzuwenden.'
  const rows = [pair('§ 412. (1) ... (2) § 46 Abs. 1a ist bei der Pensionsanpassung für das Kalenderjahr 2026 nicht anzuwenden.', '§ 412. (1) ... (2) Aufgehoben.', '§ 412.')]
  expect(oracleVerdict('412', before, 'Schlussbestimmungen § 85 tritt mit 1. Jänner 2025 in Kraft.', rows)).toMatchObject({ verdict: 'bestätigt' })
  expect(oracleVerdict('412', before, before, rows)).toMatchObject({ verdict: 'widersprochen' })
})

describe('oracleVerdict — the next §\'s heading at the foot of the cell', () => {
  const before = 'Aggressives Verhalten Wer sich aggressiv verhält, begeht eine Verwaltungsübertretung. Sie ist zu bestrafen.'
  const got = 'Aggressives Verhalten Wer sich aggressiv verhält, begeht eine Verwaltungsübertretung. Sie ist mit Geldstrafe zu bestrafen.'

  it('passes over it after the last sentence', () => {
    const rows = [pair('§ 82. (1) Wer sich aggressiv verhält, begeht eine Verwaltungsübertretung. Sie ist zu bestrafen. Begehung einer Verwaltungsübertretung in einem die Zurechnungsfähigkeit', '§ 82. (1) Wer sich aggressiv verhält, begeht eine Verwaltungsübertretung. Sie ist mit Geldstrafe zu bestrafen. Begehung einer Verwaltungsübertretung in einem die Zurechnungsfähigkeit', '§ 82.')]
    expect(oracleVerdict('82', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('does not pass over a trailing line that carries a number or ends a sentence', () => {
    const rows = [pair('§ 82. (1) Wer sich aggressiv verhält, begeht eine Verwaltungsübertretung. Sie ist zu bestrafen. Höchstens 500 Euro', '§ 82. (1) Wer sich aggressiv verhält, begeht eine Verwaltungsübertretung. Sie ist mit Geldstrafe zu bestrafen. Höchstens 500 Euro', '§ 82.')]
    expect(oracleVerdict('82', before, got, rows)).toMatchObject({ verdict: 'fremd' })
  })
})

it('still sees a kept Absatz behind a new one that splits two omissions', () => {
  // Nachhaltigkeitsberichtsgesetz § 267: „(1) und (2) … (3) bis (3b) …" left,
  // a new (2a) between the two omissions right — read as one omission, the
  // region counted as the ressort leaving text out and went unasked.
  const rows = [pair(
    '§ 267. (1) und (2) ... (3) bis (3b) ... (4) § 251 Abs. 3 über die Zusammenfassung von Konzernanhang und Anhang ist entsprechend anzuwenden.',
    '§ 267. (1) und (2) ... (2a) Der Bericht hat auch Ressourcen zu erläutern. (3) bis (3b) ... (4) Der Bericht und der Lagebericht dürfen zusammengefasst werden.',
    '§ 267.',
  )]
  const right = 'Konzernlagebericht Abs eins. Abs zwei. Der Bericht hat auch Ressourcen zu erläutern. Abs drei. Der Bericht und der Lagebericht dürfen zusammengefasst werden.'
  const kept = 'Konzernlagebericht Abs eins. Abs zwei. Der Bericht hat auch Ressourcen zu erläutern. Abs drei. § 251 Abs. 3 über die Zusammenfassung von Konzernanhang Der Bericht und der Lagebericht dürfen zusammengefasst werden.'
  expect(keptDeletion(right, rows)).toBeNull()
  expect(keptDeletion(kept, rows)).not.toBeNull()
})

it('files the rows of a schedule opened by a mirrored line under the schedule, not the last §', () => {
  // Zweite Außenwirtschaftsverordnung: „Anlage 1 | Anlage 1", then the list —
  // `para` names the schedule, `gld` stays empty.
  const row = (current: string, gld: string | null, para: string | null): ComparisonRow => ({ ...pair(current, current, gld), para })
  const grouped = rowsByParagraph([
    row('§ 3. (7) Tritt in Kraft.', '§ 3.', '§ 3.'),
    row('Anlage 1', null, 'Anlage 1'),
    row('Armenien, Aserbaidschan,', null, 'Anlage 1'),
  ])
  expect(grouped.get('#3')).toHaveLength(1)
  expect(grouped.get('#Anl. 1')).toHaveLength(2)
})

describe('a compound broken at its hyphen in the PDF (06.10.2026)', () => {
  const before = '§ 39d. (1) Die Kreditinstitute haben Risiken zu bewerten.'
  const got = '§ 39d. (1) Die Kreditinstitute haben Risiken, die auf ESG-Faktoren zurückzuführen sind, zu bewerten.'

  it('finds the engine’s compound in the annex’s broken spelling', () => {
    const rows = [pair('(1) Die Kreditinstitute haben Risiken zu bewerten.', '(1) Die Kreditinstitute haben Risiken, die auf ESG- Faktoren zurückzuführen sind, zu bewerten.', '§ 39d.')]
    expect(oracleVerdict('39d', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('keeps a suspended hyphen a word of its own', () => {
    // „Status- oder" reads as two words in the annex; the closed form is an
    // addition, never a replacement, so an engine that wrote „ESG-Faktoren"
    // where the annex prints something else is still contradicted.
    const rows = [pair('(1) Die Kreditinstitute haben Risiken zu bewerten.', '(1) Die Kreditinstitute haben Risiken, die auf Status- oder Klimafaktoren zurückzuführen sind, zu bewerten.', '§ 39d.')]
    expect(oracleVerdict('39d', before, got, rows)).toMatchObject({ verdict: 'widersprochen' })
  })
})

describe('check 3 and the diff around an insertion (06.10.2026)', () => {
  it('does not ask the annex for a word the diff only re-paired', () => {
    // „bestimmten" stays; the inserted phrase after it makes the LCS report
    // it as removed and re-inserted.
    const before = '§ 77. (1) Die Anordnung, in vom Bundesamt bestimmten Räumen Unterkunft zu nehmen.'
    const got = '§ 77. (1) Die Anordnung, in vom Bundesamt bestimmten, gegebenenfalls familiengerechten, Räumen Unterkunft zu nehmen.'
    const rows = [pair('(1) Die Anordnung, in vom Bundesamt Räumen', '(1) Die Anordnung, in vom Bundesamt bestimmten, gegebenenfalls familiengerechten, Räumen Unterkunft zu nehmen.', '§ 77.')]
    expect(oracleVerdict('77', before, got, rows).note ?? '').not.toMatch(/entfernte/)
  })

  it('reads a syllable break in the annex as one word', () => {
    const before = '§ 12. Mengenschwellen für die Anwendung.'
    const got = '§ 12. Mengenschwellen und Konzentrationsschwellen für die Anwendung.'
    const rows = [pair('Mengenschwellen für die Anwendung.', 'Mengenschwellen und Konzentrations- schwellen für die Anwendung.', '§ 12.')]
    expect(oracleVerdict('12', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
  })
})

describe('oracleVerdict — structure and numbers (26.10.2026)', () => {
  // 48/ME KOG § 35: „vor Abs. 2 … eingefügt" — our result put the new (1h)
  // after (2), with every word right. Checks 1 to 4 compare text without
  // markers and confirmed it; the annex prints (1h) above „(2) bis (14) …".
  const before = 'Text eins. Text zwei. Text drei.'
  const got = 'Text eins. Text zwei. Neuer Text. Text drei.'
  const rows = [
    pair('§ 35. (1f) Text eins.', '§ 35. (1f) Text eins.', '§ 35.'),
    pair('', '(1h) Neuer Text.'),
    pair('(2) bis (3) …', '(2) bis (3) …', null, true),
  ]

  it('contradicts a result whose Absätze stand in another order than the annex prints them', () => {
    expect(oracleVerdict('35', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('35', before, got, rows, ['1f', '2', '1h', '3'])).toMatchObject({ verdict: 'widersprochen', note: expect.stringMatching(/^Absätze der Beilage nicht so im Ergebnis: \(2\)/) })
    expect(oracleVerdict('35', before, got, rows, ['1f', '1h', '2', '3'])).toMatchObject({ verdict: 'bestätigt' })
  })

  // 126/ME StAG § 42: a second Artikel applied to the untouched text lost
  // the (26) the first inserts; the annex names it in its elision chain.
  it('contradicts a result that lacks an Absatz the annex prints', () => {
    const withChain = [pair('(1) bis (26) …', '(1) bis (26) …', '§ 42.', true), pair('', '(27) Neu.')]
    expect(oracleVerdict('42', 'Alt.', 'Alt. Neu.', withChain, ['1', '25', '27'])).toMatchObject({ verdict: 'widersprochen', note: expect.stringContaining('(26) fehlt im Ergebnis') })
    // Missing from the standing text as well: the annex assumes another text.
    expect(oracleVerdict('42', 'Alt.', 'Alt. Neu.', withChain, ['1', '25', '27'], ['1', '25'])).toMatchObject({ verdict: 'fremd' })
    expect(oracleVerdict('42', 'Alt.', 'Alt. Neu.', withChain, ['1', '25', '26', '27'])).toMatchObject({ verdict: 'bestätigt' })
    // A result without Absätze has nothing to hold the markers against.
    expect(oracleVerdict('42', 'Alt.', 'Alt. Neu.', withChain, [])).toMatchObject({ verdict: 'bestätigt' })
  })

  it('reads a marker only where one can stand', () => {
    // An exam regulation's grades and a wavelength are text, not Absätze.
    const grades = [pair('(2) Jeder Prüfer hat', '(2) Jeder Prüfer hat zu beurteilen: a) sehr gut (1), b) gut (2), c) genügend (3).', '§ 14.'), pair('(3) Die Verhandlungsschrift', '(3) Die Verhandlungsschrift ist abzuschließen.')]
    expect(oracleVerdict('14', 'Jeder Prüfer hat Die Verhandlungsschrift', 'Jeder Prüfer hat zu beurteilen: a) sehr gut (1), b) gut (2), c) genügend (3). Die Verhandlungsschrift ist abzuschließen.', grades, ['2', '3'])).toMatchObject({ verdict: 'bestätigt' })
    // Read off the display: an Absatz set inline still counts as the one it
    // says, and a tree with an unnumbered Absatz gives nothing to compare.
    const node = (ids: string[], inline = ''): LawNode => ({ level: 'para', id: '11', marker: '§ 11.', heading: null, context: [], text: '', children: ids.map((a, i) => ({ level: 'abs', id: a, marker: a ? `(${a})` : '', heading: null, context: [], text: `Satz ${i}.${i === 0 ? inline : ''}`, children: [] })) })
    expect(absatzSequence(node(['1'], ' (2) Die Frist endet.'))).toEqual(['1', '2'])
    expect(absatzSequence(node(['', '2']))).toBeUndefined()
    // A repealed Absatz the annex prints as „Aufgehoben" is none RIS prints,
    // and the § before's tail in front of the designation is not this §.
    expect(oracleVerdict('417', 'Eins. Zwei.', 'Eins.', [pair('§ 417. (1) ... (2) Zwei.', '§ 417. (1) ... (2) Aufgehoben.', '§ 417.')], ['1'])).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('6f', 'Eins.', 'Eins. Neu.', [pair('(3) […] § 6f. (1) Eins.', '(3) […] § 6f. (1) Eins. Neu.', '§ 6f.')], ['1'])).toMatchObject({ verdict: 'bestätigt' })
  })

  it('sees a date that moves, and a citation number that ends a sentence', () => {
    expect(stripMarkers('tritt mit 15. Juli 2026 in Kraft')).toBe('tritt mit 15 Juli 2026 in Kraft')
    expect(stripMarkers('nach Maßgabe des Abs. 2.')).toBe('nach Maßgabe des Abs. 2')
    // Still a marker where nothing around says otherwise.
    expect(stripMarkers('folgende: 1. erstens 2. zweitens')).toBe('folgende: erstens zweitens')
    const inForce = [pair('§ 9. Diese Verordnung tritt mit 1. Juli 2026 in Kraft.', '§ 9. Diese Verordnung tritt mit 15. Juli 2026 in Kraft.', '§ 9.')]
    const old = 'Inkrafttreten Diese Verordnung tritt mit 1. Juli 2026 in Kraft.'
    expect(oracleVerdict('9', old, old, inForce)).toMatchObject({ verdict: 'widersprochen' })
    expect(oracleVerdict('9', old, old.replace('1. Juli', '15. Juli'), inForce)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('sees an ordinal of the text, a year ending a sentence and an Official Journal page (19.11.2026)', () => {
    // After a determiner a number is an adjective of the noun that follows.
    expect(stripMarkers('die das 18. Lebensjahr vollendet haben')).toBe('die das 18 Lebensjahr vollendet haben')
    expect(stripMarkers('gemäß dem 2. Hauptstück')).toBe('gemäß dem 2 Hauptstück')
    expect(stripMarkers('Der 7. Abschnitt gilt')).toBe('Der 7 Abschnitt gilt')
    expect(stripMarkers('für das 3. bis 6. und das 12. bis 15. Hauptstück')).toBe('für das 3 bis 6 und das 12 bis 15 Hauptstück')
    expect(stripMarkers('bis spätestens 31. Dezember 2029.')).toBe('bis spätestens 31 Dezember 2029')
    expect(stripMarkers('ABl. Nr. L 283 vom 31.10.2017 S. 1.')).toBe('ABl. Nr. L 283 vom 31.10.2017 S. 1')
    // „1." stays a marker after an article: a list's items can share it.
    expect(stripMarkers('ist der 1. Handel mit Finanzinstrumenten, 2. die Annahme')).toBe('ist der Handel mit Finanzinstrumenten, die Annahme')
    expect(stripMarkers('Personen, die 1. Staatsangehörige sind')).toBe('Personen, die Staatsangehörige sind')
    // Read the same where the annex prints a marker before the determiner and RIS does not.
    expect(stripMarkers('nachweist, oder 2. das 20. Lebensjahr vollendet hat')).toBe('nachweist, oder das 20 Lebensjahr vollendet hat')
    expect(stripMarkers('nachweist, oder das 20. Lebensjahr vollendet hat')).toBe('nachweist, oder das 20 Lebensjahr vollendet hat')
    // APG § 4 (15/ME XXVIII): the draft raises the age from 62 to 63; a
    // result that kept 62 read exactly like one that made it.
    const rows = [pair('§ 4. (1) … (2) Abweichend von Abs. 1 kann die Alterspension bereits nach Vollendung des 62. Lebensjahres beansprucht werden.', '§ 4. (1) … (2) Abweichend von Abs. 1 kann die Alterspension bereits nach Vollendung des 63. Lebensjahres beansprucht werden.', '§ 4.')]
    const standing = 'Eins. Abweichend von Abs. 1 kann die Alterspension bereits nach Vollendung des 62. Lebensjahres beansprucht werden.'
    expect(oracleVerdict('4', standing, standing, rows)).toMatchObject({ verdict: 'widersprochen' })
    expect(oracleVerdict('4', standing, standing.replace('62.', '63.'), rows)).toMatchObject({ verdict: 'bestätigt' })
  })
})

it('files the previous §\'s elided tail under that §, not as the next one\'s heading', () => {
  // Strafvollzugsgesetz § 115/§ 116 (Strafvollzugsnovelle 2026): „(3) …" is
  // short and ends in no full stop, and stood at the head of § 116.
  const rows = [pair('§ 115. (1) a', '§ 115. (1) b', '§ 115.'), pair('(3) …', '(3) …', null, true), pair('§ 116. (1) c', '§ 116. (1) d', '§ 116.')]
  const grouped = rowsByParagraph(rows)
  expect(grouped.get('#115')).toHaveLength(2)
  expect(grouped.get('#116')).toHaveLength(1)
})

describe('rowsByParagraph — a § filed under the designation it carries after the draft (26.10.2026)', () => {
  // `pair` gives every row its own number as `paraAfter`; a renumbering or a repeal says otherwise.
  const moved = (current: string, proposed: string, gld: string | null, after: string | null): ComparisonRow => ({ ...pair(current, proposed, gld), paraAfter: after })

  // 51/ME XXVIII: the new § 14, and further down the old § 14 moving to § 22.
  const rows = [
    pair('', '§ 14. (1) Die öffentliche Hand stellt bereit:', '§ 14.'),
    moved('Soweit verwiesen wird, gilt die geltende Fassung.', '§ 22. Soweit verwiesen wird, gilt die geltende Fassung.', '§ 14.', '§ 22.'),
  ]

  it('gives the engine\'s § 22 the row of the old § 14, and its new § 14 only its own', () => {
    const grouped = rowsByParagraph(rows)
    expect(paragraphRows(grouped, '22').map((r) => r.gld)).toEqual(['§ 14.'])
    expect(paragraphRows(grouped, '14').map((r) => r.current)).toEqual([''])
    const text = 'Soweit verwiesen wird, gilt die geltende Fassung.'
    expect(oracleVerdict('22', text, text, paragraphRows(grouped, '22', undefined, '14')).verdict).toBe('bestätigt')
  })

  it('sets a struck § aside: its own number gets it, another § only where it came from it', () => {
    // 51/ME: the old § 16 struck, the old § 9 moving to § 16.
    const grouped = rowsByParagraph([
      moved('§ 9. IVS-Diensteanbieter haften.', '§ 16. IVS-Diensteanbieter haften.', '§ 9.', '§ 16.'),
      moved('§ 16. Mit der Vollziehung ist betraut.', '', '§ 16.', null),
      moved('§ 5. Spezifikationen.', '', '§ 5.', null),
    ])
    // The engine's § 16 is the old § 9: the struck old § 16 is another provision.
    expect(paragraphRows(grouped, '16', undefined, '9').map((r) => r.gld)).toEqual(['§ 9.'])
    // Where the engine reads § 16 as § 16 („§ 16 lautet"), both are its rows, as before.
    expect(paragraphRows(grouped, '16').map((r) => r.gld)).toEqual(['§ 9.', '§ 16.'])
    // A § the draft brings in new has no struck predecessor …
    expect(paragraphRows(grouped, '16', undefined, null).map((r) => r.gld)).toEqual(['§ 9.'])
    // … and a § the engine made of the old § 5 gets its struck rows, in printed order.
    expect(paragraphRows(grouped, '7', undefined, '5').map((r) => r.gld)).toEqual(['§ 5.'])
  })

  it('lets a left column speak only for the § the engine made of it (35/ME XXVIII: the PDF path pairs by number)', () => {
    // The old § 44f moves to § 44g, a new § 44f comes in: paired by number,
    // each row has one provision on the left and another on the right.
    const grouped = rowsByParagraph([
      pair('§ 44f. Ist der Antrag kundgemacht worden, so kann die Behörde durch Edikt zustellen.', '§ 44f. Die Behörde kann nach Prüfung der Richtigkeit Zahlungen anweisen.', '§ 44f.'),
      pair('§ 44g. Die Kosten der Verlautbarung sind von Amts wegen zu tragen.', '§ 44g. Ist der Antrag kundgemacht worden, so kann die Behörde durch Edikt zustellen.', '§ 44g.'),
    ])
    const newF = paragraphRows(grouped, '44f', undefined, null)
    expect(newF.map((r) => [r.current, r.change])).toEqual([['', 'inserted']])
    expect(oracleVerdict('44f', null, 'Die Behörde kann nach Prüfung der Richtigkeit Zahlungen anweisen.', newF).verdict).toBe('bestätigt')
    const moved = 'Ist der Antrag kundgemacht worden, so kann die Behörde durch Edikt zustellen.'
    expect(oracleVerdict('44g', moved, moved, paragraphRows(grouped, '44g', undefined, '44f')).verdict).toBe('bestätigt')
    // Held against its own number, as before, the old § 44g's text is still the standing text it is.
    expect(paragraphRows(grouped, '44g').map((r) => r.current)).toEqual(['§ 44g. Die Kosten der Verlautbarung sind von Amts wegen zu tragen.'])
  })

  it('reads a struck § and the new one it becomes, both under one heading, as the § renamed (51/ME XXVIII: § 10 → § 17)', () => {
    // „Der bisherige § 10 wird zu § 17 und lautet samt Überschrift": the
    // annex strikes § 10 whole and prints § 17 as new, the heading on both.
    const grouped = rowsByParagraph([
      moved('Strafbestimmung', '', null, null),
      moved('§ 10. Wer gegen § 7 verstößt, ist zu bestrafen.', '', '§ 10.', null),
      moved('', 'Strafbestimmung', null, '§ 17.'),
      moved('', '§ 17. Wer gegen § 7 oder § 9 verstößt, ist zu bestrafen.', '§ 17.', '§ 17.'),
    ].map((r, i) => ({ ...r, para: i < 2 ? '§ 10.' : '§ 17.' })))
    const rows = paragraphRows(grouped, '17', undefined, '10')
    expect(rows).toHaveLength(4)
    const before = 'Strafbestimmung Wer gegen § 7 verstößt, ist zu bestrafen.'
    expect(oracleVerdict('17', before, 'Strafbestimmung Wer gegen § 7 oder § 9 verstößt, ist zu bestrafen.', rows).verdict).toBe('bestätigt')
    // The struck text itself still has to be gone, and the heading may not stand twice.
    expect(oracleVerdict('17', before, 'Strafbestimmung Wer gegen § 7 verstößt, ist zu bestrafen. Wer gegen § 7 oder § 9 verstößt, ist zu bestrafen.', rows)).toMatchObject({ verdict: 'widersprochen', note: expect.stringMatching(/Gestrichene Fassung/) })
    expect(oracleVerdict('17', before, 'Strafbestimmung Strafbestimmung Wer gegen § 7 oder § 9 verstößt, ist zu bestrafen.', rows)).toMatchObject({ verdict: 'widersprochen' })
  })

  it('reads a struck text a CHANGED row proposes in place of another as struck still (121/ME XXVIII § 154)', () => {
    // „§ 154 Abs. 1 sowie die Absatzbezeichnung ‚(2)' entfallen": the annex
    // sets the old Abs. 2 in place of Abs. 1 and strikes it below. A result
    // that kept Abs. 1 and dropped only its number is not what it says.
    const rows = [pair('§ 154. (1) Eine Untersuchung hat zu unterbleiben.', '§ 154. Strafgefangene sind vorzubereiten.', '§ 154.'), pair('(2) Strafgefangene sind vorzubereiten.', '')]
    expect(oracleVerdict('154', 'Eine Untersuchung hat zu unterbleiben. Strafgefangene sind vorzubereiten.', 'Eine Untersuchung hat zu unterbleiben. Strafgefangene sind vorzubereiten.', rows).verdict).toBe('widersprochen')
  })

  it('a new § the annex prints beside another one\'s standing text keeps its right column only (2/ME XXVIII: § 1a)', () => {
    const grouped = rowsByParagraph([
      moved('(1) bis (2) …', '§ 1a. Im Sinne dieses Bundesgesetzes bedeutet:', '§ 2.', '§ 1a.'),
      moved('(3) Als Verurteilung ist anzusehen jedes Erkenntnis.', '1. „Verurteilung" jedes Erkenntnis.', null, '§ 1a.'),
    ].map((r) => ({ ...r, para: '§ 2.' })))
    expect(paragraphRows(grouped, '1a').map((r) => r.current)).toEqual(['', ''])
  })
})

describe('Kapitel numbers, and the units the annex shows changing (26.10.2026)', () => {
  it('keys a § numbered by Kapitel whole', () => {
    expect(paraIdOfGld('§ 8.03')).toBe('8.03')
    expect(paraIdOfGld('§ 2.01.')).toBe('2.01')
    expect(paraIdOfGld('§ 5.')).toBe('5')
  })

  it('lists the units the annex shows changing in one law, under their number afterwards', () => {
    const rows = [
      pair('§ 3. Alt.', '§ 3. Neu.', '§ 3.', false, 'Neues Gesetz'),
      pair('§ 4. Gleich.', '§ 4. Gleich.', '§ 4.', false, 'Neues Gesetz'),
      // The old § 5 becomes § 6: the unit is the § after the draft.
      { ...pair('§ 5. Alt.', '§ 6. Alt.', '§ 5.', false, 'Neues Gesetz'), paraAfter: '§ 6.' },
      // A § the annex strikes whole is no unit of the result.
      { ...pair('§ 7. Fällt weg.', '', '§ 7.', false, 'Neues Gesetz'), paraAfter: null },
      pair('§ 9. Alt.', '§ 9. Neu.', '§ 9.', false, 'Änderung des Altgesetzes'),
    ]
    const byLaw = rowsByParagraph(rows)
    expect(annexChangedUnits(byLaw, 'Neues Gesetz')).toEqual(['3', '6'])
    expect(annexChangedUnits(byLaw, undefined, 'Änderung des Altgesetzes')).toEqual(['9'])
  })

  it('keeps what paragraphRows needs on a map with fewer drawers', () => {
    // The old § 9 moves to § 16, the old § 16 is struck (51/ME XXVIII).
    const grouped = rowsByParagraph([
      { ...pair('§ 9. IVS-Diensteanbieter haften.', '§ 16. IVS-Diensteanbieter haften.', '§ 9.', false, 'A'), paraAfter: '§ 16.' },
      { ...pair('§ 16. Mit der Vollziehung ist betraut.', '', '§ 16.', false, 'A'), paraAfter: null },
      pair('§ 3. Drei.', '§ 3. Neu.', '§ 3.', false, 'B'),
    ])
    const fewer = someDrawers(grouped, (key) => key.startsWith('A#'))
    expect([...fewer.keys()]).toEqual(['A#16'])
    expect(paragraphRows(fewer, '16', 'A', '9').map((r) => r.gld)).toEqual(['§ 9.'])
  })
})

describe('an omission the annex prints without its „…" (26.10.2026)', () => {
  // 138/ME XXVIII § 32: „(2) bis (3)" with no dots, as some ressorts print the
  // omission. Read as text, „bis" stood in the cell and the row was `fremd`.
  const before = 'Die Behörde entscheidet. Die Frist beträgt sechs Wochen. Die Gebühr ist zu entrichten. Der Antrag ist schriftlich zu stellen.'
  const got = 'Das Amt entscheidet. Die Frist beträgt sechs Wochen. Die Gebühr ist zu entrichten. Der Antrag ist schriftlich zu stellen.'

  it('reads the chain as the omission it is, wherever check 5 reads it as designations', () => {
    const inside = [pair('§ 32. (1) Die Behörde entscheidet. (2) bis (3) (4) Der Antrag ist schriftlich zu stellen.', '§ 32. (1) Das Amt entscheidet. (2) bis (3) (4) Der Antrag ist schriftlich zu stellen.', '§ 32.')]
    expect(oracleVerdict('32', before, got, inside, ['1', '2', '3', '4'])).toMatchObject({ verdict: 'bestätigt' })
    const atEnd = [pair('§ 32. (1) Die Behörde entscheidet. (2) bis (4)', '§ 32. (1) Das Amt entscheidet. (2) bis (4)', '§ 32.')]
    expect(oracleVerdict('32', before, got, atEnd, ['1', '2', '3', '4'])).toMatchObject({ verdict: 'bestätigt' })
    const joined = [pair('§ 32. (1) und (2) (3) Die Gebühr ist zu entrichten.', '§ 32. (1) und (2) (3) Die Gebühr ist in bar zu entrichten.', '§ 32.')]
    expect(oracleVerdict('32', before, 'Die Behörde entscheidet. Die Frist beträgt sechs Wochen. Die Gebühr ist in bar zu entrichten. Der Antrag ist schriftlich zu stellen.', joined, ['1', '2', '3', '4'])).toMatchObject({ verdict: 'bestätigt' })
  })

  it('still contradicts what the chain does not cover, and reads a marker behind it as check 5 does behind „…"', () => {
    const rows = [pair('§ 32. (1) Die Behörde entscheidet. (2) bis (3) (4) Der Antrag ist schriftlich zu stellen.', '§ 32. (1) Das Amt entscheidet. (2) bis (3) (4) Der Antrag ist schriftlich zu stellen.', '§ 32.')]
    // The engine missed the change: check 1 still sees it.
    expect(oracleVerdict('32', before, before, rows, ['1', '2', '3', '4'])).toMatchObject({ verdict: 'widersprochen' })
    // (4) behind the chain is a marker, as it is behind „(2) bis (3) …".
    expect(oracleVerdict('32', before, got, rows, ['1', '2', '3'])).toMatchObject({ verdict: 'widersprochen', note: expect.stringContaining('(4) fehlt im Ergebnis') })
    const dotted = [pair('§ 32. (1) Die Behörde entscheidet. (2) bis (3) … (4) Der Antrag ist schriftlich zu stellen.', '§ 32. (1) Das Amt entscheidet. (2) bis (3) … (4) Der Antrag ist schriftlich zu stellen.', '§ 32.')]
    expect(oracleVerdict('32', before, got, dotted, ['1', '2', '3'])).toMatchObject({ verdict: 'widersprochen', note: expect.stringContaining('(4) fehlt im Ergebnis') })
  })

  it('leaves a chain that words follow as text', () => {
    // „(1) und (2) gelten sinngemäß." opens with the chain and goes on: not an omission.
    const rows = [pair('§ 9. (1) und (2) gelten sinngemäß.', '§ 9. (1) und (2) gelten entsprechend.', '§ 9.')]
    expect(oracleVerdict('9', 'Abs. 1 und 2 gelten sinngemäß.', 'Abs. 1 und 2 gelten entsprechend.', rows)).toMatchObject({ verdict: 'fremd' })
  })
})

describe('an omission the annex makes without its „…" (silentOmissions, 14.11.2026)', () => {
  const unit = (level: 'abs' | 'z', id: string, text: string): LawNode => ({ level, id, marker: level === 'abs' ? `(${id})` : `${id}.`, heading: null, context: [], text, children: [] })
  // 707EA278, Wasserstraßen-Verkehrsordnung § 1.02: one unnumbered Absatz
  // over Ziffern, and the annex prints „1. … 4. …" in both columns.
  const Z = ['Jedes Fahrzeug muss unter der Führung eines Schiffsführers stehen.', 'Jeder Verband muss gleichfalls unter der Führung stehen.', 'Bei Fahrzeugen mit Besatzung bestimmt der Eigentümer den Schiffsführer.', 'Der Schiffsführer ist für die Einhaltung dieser Verordnung verantwortlich.']
  const wvo = (ids: string[]): LawNode => ({
    level: 'para', id: '1.02', marker: '§ 1.02', heading: null, context: [], text: '',
    children: [{ level: 'abs', id: '', marker: '', heading: null, context: [], text: 'Schiffsführer', children: ids.map((id) => unit('z', id, Z[Number(id) - 1]!)) }],
  })
  const NEW = 'Bei besonderen Risiken genügt die Berechtigung des Schiffsführers im Steuerhaus.'
  const row = pair(`§ 1.02 Schiffsführer 1. ${Z[0]} 4. ${Z[3]}`, `§ 1.02 Schiffsführer 1. ${Z[0]} ${NEW} 4. ${Z[3]}`, '§ 1.02')
  const text = (ids: string[], extra = false): string => `Schiffsführer ${ids.map((id) => `${Z[Number(id) - 1]}${extra && id === '1' ? ` ${NEW}` : ''}`).join(' ')}`

  it('reads the jump as the omission it is where the standing § carries exactly the units between', () => {
    const standing = wvo(['1', '2', '3', '4'])
    expect(oracleVerdict('1.02', text(['1', '2', '3', '4']), text(['1', '2', '3', '4'], true), [row])).toMatchObject({ verdict: 'fremd' })
    expect(oracleVerdict('1.02', text(['1', '2', '3', '4']), text(['1', '2', '3', '4'], true), [row], undefined, null, standingUnitsOf(standing))).toMatchObject({ verdict: 'bestätigt' })
    expect(silentOmissions([row], standingUnitsOf(standing)).rows[0]).toMatchObject({ current: expect.stringContaining('2. bis 3. … 4.') })
  })

  it('still sees a unit the engine lost from what the annex left out', () => {
    const r = oracleVerdict('1.02', text(['1', '2', '3', '4']), text(['1', '3', '4'], true), [row], undefined, null, standingUnitsOf(wvo(['1', '2', '3', '4'])))
    expect(r.verdict).toBe('widersprochen')
  })

  it('leaves the jump unread where the standing § does not carry the full count', () => {
    // RIS without Z 3: the annex may start from a text that has it, or the
    // unit was repealed — nothing proves which, and the stretch is held whole.
    const holed = wvo(['1', '2', '4'])
    expect(silentOmissions([row], standingUnitsOf(holed)).skipped).toEqual([])
    expect(oracleVerdict('1.02', text(['1', '2', '4']), text(['1', '2', '4'], true), [row], undefined, null, standingUnitsOf(holed))).toMatchObject({ verdict: 'fremd' })
  })

  it('reads a § printed from a later unit on, only in a cell that opens the §', () => {
    // § 3.03 of the same draft: „§ 3.03 Tafeln, Flaggen und Wimpel 2. …".
    const standing = wvo(['1', '2'])
    const head = pair(`§ 1.02 Schiffsführer 2. ${Z[1]}`, `§ 1.02 Schiffsführer 2. Jeder Verband muss ebenso unter der Führung stehen.`, '§ 1.02')
    expect(silentOmissions([head], standingUnitsOf(standing)).skipped).toEqual(['1'])
    // A table-path cell holds one unit and opens nothing.
    expect(silentOmissions([pair(`2. ${Z[1]}`, '2. Jeder Verband muss ebenso unter der Führung stehen.')], standingUnitsOf(standing)).skipped).toEqual([])
  })

  it('takes a marker only before its own unit\'s words, so a date or a heading is none', () => {
    const standing = wvo(['1', '2', '3', '4'])
    const dated = pair(`§ 1.02 Schiffsführer 1. ${Z[0]} Das gilt ab 4. Juli.`, `§ 1.02 Schiffsführer 1. ${Z[0]} Das gilt ab 4. Juli. Neu.`, '§ 1.02')
    expect(silentOmissions([dated], standingUnitsOf(standing)).skipped).toEqual([])
  })

  it('hands check 5 the Absätze between, so a lost one is named (126/ME shape on a silent jump)', () => {
    const abs = (ids: string[]): LawNode => ({ level: 'para', id: '6', marker: '§ 6.', heading: null, context: [], text: '', children: ids.map((id) => unit('abs', id, `Absatz ${id} hat einen eigenen Text.`)) })
    const jump = pair('§ 6. (1) Absatz 1 hat einen eigenen Text. (4) Absatz 4 hat einen eigenen Text.', '§ 6. (1) Absatz 1 hat einen eigenen Text. (4) Absatz 4 hat einen neuen Text.', '§ 6.')
    const { rows } = silentOmissions([jump], standingUnitsOf(abs(['1', '2', '3', '4'])))
    expect(absatzOrderBroken(rows, ['1', '3', '4'])).toMatchObject({ note: '(2) fehlt im Ergebnis' })
    expect(absatzOrderBroken(rows, ['1', '2', '3', '4'])).toBeNull()
  })
})

describe('the heading a § opens with is where the result begins (19.11.2026)', () => {
  // LFG § 68: „Zivilflugplatz-Bewilligung" opens the § and stands again in
  // brackets in its first sentence. Found there, everything in front of the
  // bracket was dropped as a heading stack — law text included.
  it('drops a heading stack only where the remainder opens the result', () => {
    const standing = 'Zivilflugplatz-Bewilligung Zivilflugplätze dürfen nur mit einer Bewilligung errichtet werden (Zivilflugplatz-Bewilligung). Das gleiche gilt.'
    const rows = [pair('Zivilflugplatz-Bewilligung § 68. (1) Zivilflugplätze dürfen nur mit einer Bewilligung errichtet werden (Zivilflugplatz-Bewilligung). Das gleiche gilt.', 'Zivilflugplatz-Bewilligung § 68. (1) Zivilflugplätze dürfen nur mit einer Bewilligung errichtet werden (Zivilflugplatz-Bewilligung). Das Gleiche gilt.', '§ 68.')]
    const got = standing.replace('Das gleiche', 'Das Gleiche')
    expect(oracleVerdict('68', standing, got, rows)).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('68', standing, got.replace('dürfen nur mit', 'dürfen mit'), rows)).toMatchObject({ verdict: 'widersprochen' })
  })

  // A group heading with the § and its text after it is no group heading alone.
  it('reads the § heading and text that follow a group heading in one stretch', () => {
    const standing = 'Form und Wirkung der Visa D Visa D werden erteilt als Visum für einen Aufenthalt.'
    const rows = [pair('3. Abschnitt Bestimmungen zur Visumpflicht Form und Wirkung der Visa D § 20. (1) Visa D werden erteilt als (2) …', '3. Abschnitt Bestimmungen zur Visumpflicht Form und Wirkung der Visa D § 20. (1) Visa D werden erteilt als (2) … (3) Neu.', '§ 20.')]
    expect(oracleVerdict('20', standing, `${standing} Neu.`, rows)).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('20', standing, `${standing.replace('Form und Wirkung', 'Form Wirkung')} Neu.`, rows)).toMatchObject({ verdict: 'widersprochen' })
  })

  // A heading row is the heading, not a word of the body: „Bundesstaatsanwaltschaft"
  // in „Die Bundesstaatsanwaltschaft wirkt …".
  it('does not find a changed heading row in the body', () => {
    const rows = [pair('Generalprokuratur', 'Bundesstaatsanwaltschaft'), pair('Die Generalprokuratur wirkt mit.', 'Die Bundesstaatsanwaltschaft wirkt mit.', '§ 22.')]
    const before = 'Generalprokuratur Die Generalprokuratur wirkt mit.'
    expect(oracleVerdict('22', before, 'Bundesstaatsanwaltschaft Die Bundesstaatsanwaltschaft wirkt mit.', rows)).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('22', before, 'Generalprokuratur Die Bundesstaatsanwaltschaft wirkt mit.', rows)).toMatchObject({ verdict: 'widersprochen' })
  })

  // The PDF path wraps a long heading and leaves its first line in the row
  // above: the § opens with the tail (SPG § 83, BHG § 73).
  it('accepts the tail of a wrapped heading where the standing text puts it', () => {
    const heading = 'Stundung und Nachlass bei Forderungen des Bundes'
    const standing = `${heading} Erstens gilt. Zweitens gilt.`
    const rows = [pair('Forderungen des Bundes § 73. (1) ... (2) Zweitens gilt.', 'Forderungen des Bundes § 73. (1) ... (2) Zweitens gilt neu.', '§ 73.')]
    expect(oracleVerdict('73', standing, `${heading} Erstens gilt. Zweitens gilt neu.`, rows)).toMatchObject({ verdict: 'bestätigt' })
    // The same tail found in the body of a result whose heading is another.
    expect(oracleVerdict('73', standing, 'Waldfonds Erstens gilt bei Forderungen des Bundes. Zweitens gilt neu.', rows)).toMatchObject({ verdict: 'widersprochen' })
    const lower = [pair('ausschließenden Rauschzustand § 83. (1) Wer sich berauscht.', 'ausschließenden Rauschzustand § 83. (1) Wer sich betrinkt.', '§ 83.')]
    const tail = 'Begehung in einem die Zurechnungsfähigkeit ausschließenden Rauschzustand'
    expect(oracleVerdict('83', `${tail} Wer sich berauscht.`, `${tail} Wer sich betrinkt.`, lower)).toMatchObject({ verdict: 'bestätigt' })
  })

  // „2. Unterabschnitt … 7. Abschnitt Sanktionen § 106. (1) Wer" leaves „Wer".
  it('drops a stack down to a short remainder only below a group unit', () => {
    const rows = [pair('2. Unterabschnitt Internationale Zusammenarbeit 7. Abschnitt Sanktionen § 106. (1) Wer … (2) Alt.', '2. Unterabschnitt Internationale Zusammenarbeit 7. Abschnitt Sanktionen § 106. (1) Wer … (2) Neu.', '§ 106.')]
    expect(oracleVerdict('106', 'Wer handelt, wird bestraft. Alt.', 'Wer handelt, wird bestraft. Neu.', rows)).toMatchObject({ verdict: 'bestätigt' })
  })
})

describe('check 2 holds the rows of a § in the order the annex prints them (19.11.2026)', () => {
  // The table path prints each Ziffer as a row of its own; looked up each
  // from the start of the result, a new Z 3b set before Z 3a read as right.
  const rows = [
    pair('(1) Wer gegen Abs. 2 verstößt, wenn er', '(1) Wer gegen Abs. 2 verstößt, wenn er', '§ 54h.'),
    pair('', '3a. keine wirksame Kontrolle durchführt;'),
    pair('', '3b. ein ungeeignetes System einsetzt;'),
  ].map((r, i) => (i === 0 ? { ...r, change: 'changed' as const } : r))
  const before = 'Wer gegen Abs. 2 verstößt, wenn er'
  it('confirms the Ziffern in the annex\'s order', () => {
    expect(oracleVerdict('54h', before, `${before} keine wirksame Kontrolle durchführt; ein ungeeignetes System einsetzt;`, rows)).toMatchObject({ verdict: 'bestätigt' })
  })
  it('contradicts two Ziffern swapped, and says the row stands elsewhere', () => {
    const swapped = oracleVerdict('54h', before, `${before} ein ungeeignetes System einsetzt; keine wirksame Kontrolle durchführt;`, rows)
    expect(swapped).toMatchObject({ verdict: 'widersprochen' })
    expect(swapped.note).toMatch(/^Vorgeschlagene Fassung steht im Ergebnis an anderer Stelle/)
  })
})

describe('a struck Absatz still in the result, where it opens like the next one (BVergGVS § 30, 19.11.2026)', () => {
  // 58/ME XXVIII against BGBl. I Nr. 8/2026: the annex strikes Abs. 8 and
  // renumbers Abs. 9 to (8); both open „Der Auftraggeber hat". The LCS paired
  // the proposed (8) with the struck one's opening, check 4 skipped the region
  // as inside a printed stretch, and check 2 found the stretch whole in the old
  // Abs. 9 — the § was confirmed with the Abs. 8 the annex strikes.
  const abs = ['Die Behörde prüft den Antrag.', 'Sie hört die Parteien.', 'Sie entscheidet schriftlich.', 'Die Entscheidung ist zuzustellen.', 'Der Auftraggeber hat die Vergabe binnen 20 Tagen bekanntzumachen.', 'Der Auftraggeber hat über jeden Auftrag einen Vermerk anzufertigen.']
  const before = abs.join(' ')
  const rows = [pair(`§ 9. (1) ${abs[0]} (2) bis (4) … (5) ${abs[4]} (6) ${abs[5]}`, `§ 9. (1) ${abs[0]} (2) bis (4) … (5) ${abs[5]}`, '§ 9.')]
  const kept = ['1', '2', '3', '4', '5', '6']
  const right = abs.filter((_, i) => i !== 4).join(' ')

  it('check 4 reads the deletion where the LCS could equally have put it: at the stretch\'s edge', () => {
    expect(keptDeletion(before, rows)).toMatch(/die Vergabe binnen 20 Tagen/)
    expect(keptDeletion(right, rows)).toBeNull()
    expect(oracleVerdict('9', before, before, rows)).toMatchObject({ verdict: 'widersprochen' })
    expect(oracleVerdict('9', before, right, rows, ['1', '2', '3', '4', '5'], kept)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('check 5 names the struck Absatz still standing', () => {
    expect(absatzOrderBroken(rows, kept, kept, '9')).toEqual({ note: '(6) steht noch im Ergebnis', foreign: false })
    expect(absatzOrderBroken(rows, ['1', '2', '3', '4', '5'], kept, '9')).toBeNull()
  })

  it('a row that proposes nothing strikes even the Absätze it abbreviates (IESG § 20)', () => {
    // The draft dissolves § 20 into § 17a; the engine refused that and kept
    // the body, and check 2's mirror stayed silent because the heading, one
    // stretch of the row, was gone.
    const struck = [pair('Inkrafttreten § 20. (1) ... (2) … (3) …', '', '§ 20.')]
    expect(absatzOrderBroken(struck, ['1', '2', '3'], ['1', '2', '3'], '20')).toEqual({ note: '(1) steht noch im Ergebnis', foreign: false })
    expect(absatzOrderBroken(struck, [], ['1', '2', '3'], '20')).toBeNull()
  })

  it('strikes nothing the right column merely abbreviates, glues to its mark or chains over', () => {
    // Patentamtsgebührengesetz § 26 („(3)…"), GD-VO § 12 („[…] (5)"),
    // Bundespflegegeldgesetz § 22 („(1) …" against „…"), UG § 60 („(1) bis (3)...").
    const seq = ['1', '2', '3', '4', '5', '6']
    expect(absatzOrderBroken([pair('§ 26. (1) Alt eins. (2) Alt zwei. (3) … (4) Alt vier.', '§ 26. (1) Neu eins. (2) Neu zwei. (3)… (4) Neu vier.', '§ 26.')], seq.slice(0, 4), seq.slice(0, 4), '26')).toBeNull()
    expect(absatzOrderBroken([pair('§ 12. (1) […] […]. (5) Für das Berichtsjahr gilt Abs. 4.', '§ 12. (1) […] […] (5) Für das Berichtsjahr gilt Abs. 4. (6) Neu.', '§ 12.')], seq, seq.slice(0, 5), '12')).toBeNull()
    expect(absatzOrderBroken([pair('(1) …', '…')], ['1', '2'], ['1', '2'])).toBeNull()
    expect(absatzOrderBroken([pair('(1) bis (3) ...', '(1) bis (3)...'), pair('(4) Alt.', '(4) Neu.')], seq, seq)).toBeNull()
  })
})

describe('the § heading in the heading area of a cell is checked (19.11.2026)', () => {
  it('holds the § heading printed in one stretch with its group heading, with no § symbol left in it', () => {
    // „Abschnitt IV … <§ heading> § 37. (1) bis (12) …": the chain takes the
    // § symbol with it, the stretch read as a group heading alone and was
    // passed over — a § heading the draft changes and the engine left alone
    // was confirmed (BBG 2027-2028 § 37 shape, fault class Überschrift).
    const rows = [pair(
      'Abschnitt IV Gemeinsame Bestimmungen Alte Überschrift § 37. (1) bis (12) ... (13) § 823 ASVG ist anzuwenden.',
      'Abschnitt IV Gemeinsame Bestimmungen Neue Überschrift § 37. (1) bis (12) ... (13) § 823 ASVG ist sinngemäß anzuwenden.',
      '§ 37.',
    )]
    const before = 'Alte Überschrift Erster Absatz. § 823 ASVG ist anzuwenden.'
    expect(oracleVerdict('37', before, 'Neue Überschrift Erster Absatz. § 823 ASVG ist sinngemäß anzuwenden.', rows)).toMatchObject({ verdict: 'bestätigt' })
    expect(oracleVerdict('37', before, 'Alte Überschrift Erster Absatz. § 823 ASVG ist sinngemäß anzuwenden.', rows)).toMatchObject({ verdict: 'widersprochen' })
  })

  it('still passes over a group heading with no § heading in its tail', () => {
    const rows = [pair('3. Abschnitt Verfahren § 9. (1) bis (3) ... (4) Alt.', '3. Abschnitt Verfahren § 9. (1) bis (3) ... (4) Neu.', '§ 9.')]
    expect(oracleVerdict('9', 'Erster Absatz. Alt.', 'Erster Absatz. Neu.', rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('never drops the heading the draft prepends as if it were a group heading (BBG 2027-2028 § 61, GSpG)', () => {
    // „Dem § 61 wird folgende Überschrift vorangestellt: Vollziehung" — the
    // engine refused it, and the stack rescue dropped „Vollziehung" from the
    // annex's proposed column as the stack the PDF prints over a §.
    const rows = [pair(
      '§ 61. Mit der Vollziehung dieses Bundesgesetzes sind betraut: 1. der Bundesminister für Arbeit.',
      'Vollziehung § 61. Mit der Vollziehung dieses Bundesgesetzes sind betraut: 1. der Bundesminister für Arbeit und Pflege.',
      '§ 61.',
    )]
    const before = 'Mit der Vollziehung dieses Bundesgesetzes sind betraut: der Bundesminister für Arbeit.'
    expect(oracleVerdict('61', before, 'Mit der Vollziehung dieses Bundesgesetzes sind betraut: der Bundesminister für Arbeit und Pflege.', rows)).toMatchObject({ verdict: 'widersprochen' })
    expect(oracleVerdict('61', before, 'Vollziehung Mit der Vollziehung dieses Bundesgesetzes sind betraut: der Bundesminister für Arbeit und Pflege.', rows)).toMatchObject({ verdict: 'bestätigt' })
  })

  it('drops what is shaped like a group heading, and anything where the geltende column prints a stack too', () => {
    const before = 'Meldungen Die FMA ist zuständig.'
    const got = 'Meldungen Die FMA ist zuständig. Sie ist Sammelstelle.'
    // Capitals (Finanzkonglomerategesetz § 14), a numbering („4. Kleinhandel …"), a title's tail in brackets.
    for (const stack of ['MASSNAHMEN ZUR ERLEICHTERUNG DER AUFSICHT', '4. Kleinhandel mit Tabakerzeugnissen und E-Liquids', 'Verordnung über Investitionen (EKB-InvestitionsV)']) {
      const rows = [pair('Meldungen § 14. (1) Die FMA ist zuständig.', `${stack} Meldungen § 14. (1) Die FMA ist zuständig. (2) Sie ist Sammelstelle.`, '§ 14.')]
      expect(oracleVerdict('14', before, got, rows)).toMatchObject({ verdict: 'bestätigt' })
    }
    const shared = [pair('Erster Titel Meldungen § 14. (1) Die FMA ist zuständig.', 'Meldungen und Sammelstelle Meldungen § 14. (1) Die FMA ist zuständig. (2) Sie ist Sammelstelle.', '§ 14.')]
    expect(oracleVerdict('14', before, got, shared)).toMatchObject({ verdict: 'bestätigt' })
  })
})
