import { describe, expect, it } from 'vitest'
import { KEPT_DELETION_NOTE, oracleVerdict, paraIdOfGld, paragraphRows, rowsByParagraph, stripMarkers } from '../server/utils/kons/tguOracle'
import type { ComparisonRow } from '../server/utils/annex/comparisonRows'

function pair(current: string, proposed: string, gld: string | null = null, elided = false, law: string | null = null): ComparisonRow {
  const change = !current && proposed ? 'inserted' : current && !proposed ? 'removed' : current === proposed ? 'unchanged' : 'changed'
  return { kind: 'pair', law, heading: null, gld, para: gld, current, proposed, change, elided, segments: null, editorial: false, elisionRange: false }
}
const article = (heading: string, law: string | null = null): ComparisonRow => ({ kind: 'article', law, heading, gld: null, para: null, current: '', proposed: '', change: 'unchanged', elided: false, segments: null, editorial: false, elisionRange: false })

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
// showed on 05.10.2026 (docs/architecture.md §12.12) — and the shapes that
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
