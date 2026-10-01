import { describe, expect, it } from 'vitest'
import type { LawDiffUnit } from '../shared/types'
import { compareReasoning, compareReasoningByParagraph } from '../server/utils/explanations/reasoningDiff'
import { parseExplanationsHtml } from '../server/utils/explanations/explanationsHtml'

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

describe('compareReasoningByParagraph — der §-Join', () => {
  it('vergleicht je Paragraph, nicht je Anordnung', () => {
    const units = [
      unit(SNG, 'Z2', 'In § 6 Abs. 3 Z 3 wird das Zitat "246" durch das Zitat "247" ersetzt.'),
      unit(SNG, 'Z3', 'In § 6 Abs. 4 entfällt die Wortfolge "oder mündlich".'),
      unit(SNG, 'Z4', 'In § 7 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.'),
    ]
    const before = new Map([['6', 'Die Bestimmung dient der Umsetzung.'], ['7', 'Unverändert.']])
    const after = new Map([['6', 'Die Bestimmung dient nunmehr der vollständigen Umsetzung.'], ['7', 'Unverändert.']])

    const out = compareReasoningByParagraph(units, before, after)

    // Two Paragraphen, three instructions: the statistic counts Paragraphen.
    expect(out.stats).toEqual({ compared: 2, changed: 1, uncompared: 0 })
    expect(Object.keys(out.entries).sort()).toEqual(['§ 6', '§ 7'])
    expect(out.units).toEqual({ [`${SNG}|Z2|changed`]: '§ 6', [`${SNG}|Z3|changed`]: '§ 6', [`${SNG}|Z4|changed`]: '§ 7' })
    expect(out.entries['§ 6']!.changed).toBe(true)
    expect(out.entries['§ 7']!.changed).toBe(false)
  })

  it('zeigt nichts, wo zwei Artikel dieselbe Paragraphennummer ändern', () => {
    const units = [
      unit(SNG, 'Z9', 'In § 15 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.'),
      unit(BVWG, 'Z1', 'In § 15 Abs. 2 entfällt die Wortfolge "in der Regel".'),
    ]
    const before = new Map([['15', 'Die Begründung des einen Gesetzes.']])
    const after = new Map([['15', 'Die neue Begründung des einen Gesetzes, deutlich umformuliert.']])

    const out = compareReasoningByParagraph(units, before, after)

    expect(out.units).toEqual({})
    expect(out.stats).toEqual({ compared: 0, changed: 0, uncompared: 0 })
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

    const out = compareReasoningByParagraph(units, new Map(), new Map(), byArticle)

    expect(Object.keys(out.entries).sort()).toEqual(['Art. 5 § 15', 'Art. 6 § 15'])
    expect(out.entries['Art. 6 § 15']).toMatchObject({ label: '§ 15', changed: true })
    expect(out.entries['Art. 5 § 15']).toMatchObject({ label: '§ 15', changed: false })
    expect(Object.values(out.units).sort()).toEqual(['Art. 5 § 15', 'Art. 6 § 15'])
  })

  it('füllt die Obergrenze zuerst mit den eindeutigen Nummern — der zweite Schlüssel kostet keine', () => {
    const ambiguousFirst = [
      unit(SNG, 'Z1', 'In § 15 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.', 'changed', { to: '1' }),
      unit(BVWG, 'Z1', 'In § 15 Abs. 2 entfällt die Wortfolge "in der Regel".', 'changed', { to: '2' }),
    ]
    const unique = Array.from({ length: 350 }, (_, i) => unit(SNG, `Z${i + 2}`, `In § ${100 + i} Abs. 1 wird das Wort "a" durch das Wort "b" ersetzt.`, 'changed', { to: '1' }))
    const texts = new Map(unique.map((_, i) => [String(100 + i), `Begründung ${i}.`]))
    const byArticle = { before: new Map([['1|15', 'A.'], ['2|15', 'B.']]), after: new Map([['1|15', 'A.'], ['2|15', 'B.']]) }

    const out = compareReasoningByParagraph([...ambiguousFirst, ...unique], texts, texts, byArticle)

    expect(out.stats.compared).toBe(350)
    expect(Object.keys(out.entries).some((k) => k.startsWith('Art. '))).toBe(false)
  })

  it('lässt die mehrdeutige Nummer weg, wo eine Seite keinen Artikel nennt', () => {
    const units = [
      unit(SNG, 'Z9', 'In § 15 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.', 'changed', { to: '1' }),
      unit(BVWG, 'Z1', 'In § 15 Abs. 2 entfällt die Wortfolge "in der Regel".'),
    ]
    const byArticle = { before: new Map([['1|15', 'Nur im Entwurf unter Artikel 1.']]), after: new Map<string, string>() }

    const out = compareReasoningByParagraph(units, new Map([['15', 'x']]), new Map([['15', 'y']]), byArticle)

    expect(out.units).toEqual({})
    expect(out.stats).toEqual({ compared: 0, changed: 0, uncompared: 0 })
  })

  it('vergleicht nur, wo beide Fassungen eine Begründung führen', () => {
    const units = [unit(SNG, 'Z2', 'In § 6 Abs. 3 Z 3 wird das Zitat "246" durch das Zitat "247" ersetzt.')]
    const out = compareReasoningByParagraph(units, new Map([['6', 'Nur im Entwurf begründet.']]), new Map())

    expect(out.units).toEqual({})
  })

  it('hält eine Änderung unter 2 % für Satzzeichen und nicht für eine Überarbeitung', () => {
    const words = Array.from({ length: 200 }, (_, i) => `wort${i}`).join(' ')
    const units = [unit(SNG, 'Z2', 'In § 6 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.')]
    const out = compareReasoningByParagraph(units, new Map([['6', `${words} Punkt`]]), new Map([['6', `${words} Punkt.`]]))

    expect(out.stats).toEqual({ compared: 1, changed: 0, uncompared: 0 })
    expect(out.entries['§ 6']!.segments).toBeNull()
    expect(out.entries['§ 6']!.fromText).toBeNull()
  })

  it('legt beide Fassungen bei, wo der Wortvergleich zu lang zum Rechnen ist', () => {
    // Above the limit of 2,5 million cells (1.700 × 1.700): `diffTokens`
    // then returns only the similarity, no segments.
    const a = Array.from({ length: 1700 }, (_, i) => `wort${i}`).join(' ')
    const b = Array.from({ length: 1700 }, (_, i) => (i % 10 === 0 ? `neu${i}` : `wort${i}`)).join(' ')
    const units = [unit(SNG, 'Z2', 'In § 6 Abs. 1 wird das Wort "kann" durch das Wort "darf" ersetzt.')]

    const out = compareReasoningByParagraph(units, new Map([['6', a]]), new Map([['6', b]]))
    const entry = out.entries['§ 6']!

    expect(entry.changed).toBe(true)
    expect(entry.segments).toBeNull()
    // Otherwise the display would open an empty drawer.
    expect(entry.fromText).toBe(a)
    expect(entry.toText).toBe(b)
  })

  it('lässt eine Anweisung weg, die keinen einzelnen Paragraphen adressiert', () => {
    const units = [unit(SNG, 'Z2', 'In § 6 Abs. 3 und § 7 Abs. 1 entfällt jeweils das Wort "kann".')]
    const out = compareReasoningByParagraph(units, new Map([['6', 'a']]), new Map([['6', 'b']]))

    expect(out.units).toEqual({})
  })

  // „§§ 6 und 7" is one address with a sibling, and the instruction changes
  // two Paragraphen: showing the reasoning for § 6 alone would be half of it.
  it('lässt „§§ 6 und 7" weg wie jede Anweisung über mehrere Paragraphen', () => {
    const units = [unit(SNG, 'Z2', 'Die §§ 6 und 7 samt Überschriften entfallen.')]
    const out = compareReasoningByParagraph(units, new Map([['6', 'a']]), new Map([['6', 'b sehr anders']]))

    expect(out.units).toEqual({})
  })
})

/** An Erläuterungen document as Parliament emits it from Word, already parsed. */
function erl(...paragraphs: string[]) {
  return parseExplanationsHtml(`<html><body>${['Besonderer Teil', ...paragraphs].map((p) => `<p class=MsoNormal>${p}</p>`).join('')}</body></html>`)
}

/** A Novellierungsanordnung of a single law, renumbered from `from` in the draft to `id` in the Vorlage. */
function z(id: string, from: string | null, line: string, change: LawDiffUnit['change'] = 'changed'): LawDiffUnit {
  return { ...unit('Gesetz', id, line, change), fromId: from, fromArticleKey: null }
}

describe('compareReasoning — die Begründung an der Ziffer (01.10.2026)', () => {
  // 8/ME XXVIII: six Ziffern on § 11, each explained in its own passage. The
  // § join handed every one of them all six passages.
  it('gibt jeder Anweisung die Passage ihrer Ziffer, nicht die aller Ziffern am selben §', () => {
    const units = [z('Z1', 'Z1', 'In § 11 Abs. 1 wird das Wort "kann" durch "darf" ersetzt.'), z('Z2', 'Z2', 'In § 11 Abs. 2 entfällt der letzte Satz.')]
    const before = erl('Zu Z 1 (§ 11 Abs. 1):', 'Klarstellung.', 'Zu Z 2 (§ 11 Abs. 2):', 'Der Satz ist überholt.')
    const after = erl('Zu Z 1 (§ 11 Abs. 1):', 'Klarstellung.', 'Zu Z 2 (§ 11 Abs. 2):', 'Der Satz ist aufgrund der Stellungnahmen überholt und entfällt.')

    const out = compareReasoning(units, before, after)

    expect(out.stats).toEqual({ compared: 2, changed: 1, uncompared: 0 })
    const z1 = out.entries[out.units['Gesetz|Z1|changed']!]!
    const z2 = out.entries[out.units['Gesetz|Z2|changed']!]!
    expect(z1).toMatchObject({ basis: 'ziffer', label: 'Zu Z 1 (§ 11 Abs. 1):', changed: false })
    expect(z2).toMatchObject({ basis: 'ziffer', changed: true })
  })

  it('liest jede Seite in ihrer eigenen Nummerierung — die Entwurfsseite über fromId', () => {
    const units = [z('Z5', 'Z4', 'In § 7 wird das Wort "kann" durch "darf" ersetzt.')]
    const before = erl('Zu Z 4 (§ 7):', 'Die Begründung.')
    const after = erl('Zu Z 4 (§ 6):', 'Etwas anderes.', 'Zu Z 5 (§ 7):', 'Die Begründung.')

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units['Gesetz|Z5|changed']!]).toMatchObject({ basis: 'ziffer', label: 'Zu Z 5 (§ 7):', changed: false })
  })

  it('zählt eine Passage über mehrere Ziffern einmal und zeigt sie an jeder', () => {
    const units = [z('Z1', 'Z1', 'In § 1 wird "a" durch "b" ersetzt.'), z('Z2', 'Z2', 'In § 2 wird "a" durch "b" ersetzt.'), z('Z3', 'Z3', 'In § 3 wird "a" durch "b" ersetzt.')]
    const before = erl('Zu Z 1 bis 3:', 'Die Ressortbezeichnung wird angepasst.')
    const after = erl('Zu Z 1 bis 3:', 'Die Ressortbezeichnung wird an das Bundesministeriengesetz angepasst.')

    const out = compareReasoning(units, before, after)

    expect(out.stats).toEqual({ compared: 1, changed: 1, uncompared: 0 })
    expect(new Set(Object.values(out.units)).size).toBe(1)
    expect(Object.keys(out.units)).toHaveLength(3)
  })

  // ME „Zu Z 1:" + „Zu Z 2:" against RV „Zu Z 1 und 2:" — a regrouping, not a revision.
  it('vergleicht nicht, wo die Passagen beider Seiten verschiedene Änderungen umfassen — und zeigt sie ohne Urteil', () => {
    const units = [z('Z1', 'Z1', 'In § 1 wird "a" durch "b" ersetzt.'), z('Z2', 'Z2', 'In § 2 wird "a" durch "b" ersetzt.')]
    const before = erl('Zu Z 1 (§ 1):', 'Erstens.', 'Zu Z 2 (§ 2):', 'Zweitens.')
    const after = erl('Zu Z 1 und 2 (§§ 1 und 2):', 'Erstens und zweitens.')

    const out = compareReasoning(units, before, after)

    expect(out.fallbacks).toEqual({ 'Gesetz|Z1|changed': 'scope', 'Gesetz|Z2|changed': 'scope' })
    expect(out.stats).toEqual({ compared: 0, changed: 0, uncompared: 2 })
    expect(out.entries[out.units['Gesetz|Z1|changed']!]).toEqual({
      basis: 'ziffer',
      label: 'Zu Z 1 und 2 (§§ 1 und 2):',
      comparable: false,
      fromHeading: 'Zu Z 1 (§ 1):',
      drift: null,
      changed: false,
      segments: null,
      fromText: 'Erstens.',
      toText: 'Erstens und zweitens.',
    })
  })

  // 65/ME XXVIII: „Redaktionelle Anpassungen." under differently grouped Ziffern
  // on both sides — not a word changed, so „unverändert" is true either way.
  it('urteilt „unverändert", wo die Passagen anders gruppiert, aber Wort für Wort gleich sind', () => {
    const units = [z('Z1', 'Z1', 'In § 1 wird "a" durch "b" ersetzt.'), z('Z2', 'Z2', 'In § 2 wird "a" durch "b" ersetzt.')]
    const before = erl('Zu Z 1 (§ 1):', 'Redaktionelle Anpassungen.', 'Zu Z 2 (§ 2):', 'Anderes.')
    const after = erl('Zu Z 1 und 2 (§§ 1 und 2):', 'Redaktionelle Anpassungen.')

    const out = compareReasoning(units, before, after)

    expect(out.fallbacks['Gesetz|Z1|changed']).toBe('scope')
    expect(out.entries[out.units['Gesetz|Z1|changed']!]).toMatchObject({ comparable: true, changed: false, drift: 0 })
    expect(out.entries[out.units['Gesetz|Z2|changed']!]).toMatchObject({ comparable: false })
  })

  // 41/ME XXVIII: „Zu Z 26 (§ 122 Abs. 1):" against „Zu Z 31 und 32 (§ 122
  // Abs. 1 und 2):", whose Z 32 is new — the passage now explains a second change.
  it('zählt eingefügte und entfernte Ziffern zum Umfang — eine Passage, die eine neue Änderung mit erklärt, ist umgruppiert', () => {
    const units = [z('Z31', 'Z26', 'In § 122 Abs. 1 wird "a" durch "b" ersetzt.'), z('Z32', null, 'In § 122 Abs. 2 wird "c" durch "d" ersetzt.', 'inserted')]
    const before = erl('Zu Z 26 (§ 122 Abs. 1):', 'Zum ersten Absatz.')
    const after = erl('Zu Z 31 und 32 (§ 122 Abs. 1 und 2):', 'Zum ersten Absatz. Und zum zweiten.')

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units['Gesetz|Z31|changed']!]).toMatchObject({ comparable: false, changed: false, label: 'Zu Z 31 und 32 (§ 122 Abs. 1 und 2):' })
    expect(out.fallbacks['Gesetz|Z31|changed']).toBe('scope')
  })

  // 2/ME XXVIII: two passages name „Z 6", only one of them the § Z 6 amends.
  it('lässt bei zwei Passagen zur selben Ziffer den § entscheiden', () => {
    const units = [z('Z6', 'Z6', 'In § 17 wird die Wendung "a" durch "b" ersetzt.')]
    const before = erl('Zu Z 6 und 7 (§§ 17 und 18):', 'Zu den §§ 17 und 18.')
    const after = erl('Zu Z 6 und 7 (§§ 17 und 18):', 'Zu den §§ 17 und 18.', 'Zu Z 5 und 6 (§ 23a):', 'Etwas ganz anderes zu § 23a.')

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units['Gesetz|Z6|changed']!]).toMatchObject({ label: 'Zu Z 6 und 7 (§§ 17 und 18):', changed: false })
    expect(out.guarded).toEqual([{ unit: 'Gesetz|Z6|changed', side: 'after', heading: 'Zu Z 5 und 6 (§ 23a):' }])
  })

  // „Zu Z 54 bis 58 (§ 40 Abs. 1, 3 bis 5 und § 48 Abs. 9)" explains Z 54 on § 39 too (61/ME XXVIII).
  it('urteilt über eine einzige Passage zur Ziffer nicht nach ihren §§', () => {
    const units = [z('Z54', 'Z54', 'In § 39 Abs. 1 wird "a" durch "b" ersetzt.')]
    const before = erl('Zu Z 54 bis 58 (§ 40 Abs. 1 und § 48 Abs. 9):', 'Die Begründung.')
    const after = erl('Zu Z 54 bis 58 (§ 40 Abs. 1 und § 48 Abs. 9):', 'Die Begründung.')

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units['Gesetz|Z54|changed']!]).toMatchObject({ changed: false })
    expect(out.guarded).toEqual([])
  })

  // 55/ME XXVIII: the parser opens the prose „Zu § 77a Abs. 9 vertritt die
  // Kommission … § 40 …" as a passage; it still belongs to the Ziffer above.
  it('nimmt eine in Prosa weiterlaufende Unterpassage mit, auch wenn der Satz einen anderen § zitiert', () => {
    const units = [z('Z1', 'Z1', 'In § 77a Abs. 9 wird "a" durch "b" ersetzt.')]
    const prose = 'Zu § 77a Abs. 9 vertritt die Kommission die Auffassung, dass § 40 nicht genügt.'
    const before = erl('Zu Z 1 (§ 77a Abs. 9):', 'Kurz.', prose, 'Eine lange, gleich gebliebene Ausführung der Gründe.')
    const after = erl('Zu Z 1 (§ 77a Abs. 9):', 'Kürzer.', prose, 'Eine lange, gleich gebliebene Ausführung der Gründe.')

    const entry = compareReasoning(units, before, after).entries['Z 0|0']!

    expect(entry.segments ?? []).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining('Ausführung') })]))
  })

  it('nimmt die Unterpassagen unter einer Ziffer ohne eigenen Text mit (8/ME, 48/ME XXVIII)', () => {
    const units = [z('Z3', 'Z3', '§ 6 Abs. 4 wird durch folgende Abs. 4 und 5 ersetzt: "(4) …"')]
    const before = erl('Zu Z 3 (§ 6 Abs. 4 und 5):', 'Zu § 6 Abs. 4:', 'Zum vierten Absatz.', 'Zu Abs. 5:', 'Zum fünften Absatz.', 'Zu Z 4 (§ 7):', 'Anderes.')
    const after = erl('Zu Z 3 (§ 6 Abs. 4 und 5):', 'Zu § 6 Abs. 4:', 'Zum vierten Absatz, neu gefasst nach der Begutachtung.', 'Zu Abs. 5:', 'Zum fünften Absatz.', 'Zu Z 4 (§ 7):', 'Anderes.')

    const entry = Object.values(compareReasoning(units, before, after).entries)[0]!

    expect(entry.changed).toBe(true)
    expect(entry.segments?.map((s) => s.text).join(' ')).not.toContain('Anderes')
  })

  it('nimmt eine nach § betitelte Passage, wo eine Seite die Ziffer nicht betitelt (48/ME XXVIII)', () => {
    const units = [z('Z9', 'Z6', 'Nach § 11 Abs. 1a wird folgender Abs. 1b eingefügt: "(1b) …"'), z('Z1', 'Z1', 'In § 2 wird "a" durch "b" ersetzt.')]
    const before = erl('Zu Z 1 (§ 2):', 'Eins.', 'Zu § 11 Abs. 1b:', 'Die Begründung des neuen Absatzes.')
    const after = erl('Zu Z 1 (§ 2):', 'Eins.', 'Zu Z 9 (§ 11 Abs. 1b):', 'Die Begründung des neuen Absatzes.')

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units['Gesetz|Z9|changed']!]).toMatchObject({ basis: 'ziffer', label: 'Zu Z 9 (§ 11 Abs. 1b):', changed: false })
    expect(out.fallbacks['Gesetz|Z9|changed']).toBe('paragraphTitled')
  })

  it('zeigt einer Ziffer ohne eigene Passage nicht die Begründung einer anderen Ziffer am selben §', () => {
    const units = [z('Z1', 'Z1', 'In § 5 Abs. 1 wird "a" durch "b" ersetzt.'), z('Z2', 'Z2', 'In § 5 Abs. 2 wird "c" durch "d" ersetzt.')]
    const before = erl('Zu Z 1 (§ 5 Abs. 1):', 'Nur zu Z 1.')
    const after = erl('Zu Z 1 (§ 5 Abs. 1):', 'Nur zu Z 1, jetzt ausführlicher begründet.')

    const out = compareReasoning(units, before, after)

    expect(out.units['Gesetz|Z2|changed']).toBeUndefined()
    expect(out.fallbacks['Gesetz|Z2|changed']).toBe('none')
  })

  it('lässt eingefügte und entfernte Ziffern beim §-Join, mit dem Paragraphen als Grundlage', () => {
    const units = [z('Z1', 'Z1', 'In § 5 Abs. 1 wird "a" durch "b" ersetzt.'), z('Z2', null, 'In § 5 Abs. 2 wird "c" durch "d" ersetzt.', 'inserted')]
    const before = erl('Zu Z 1 (§ 5 Abs. 1):', 'Begründung eins.')
    const after = erl('Zu Z 1 (§ 5 Abs. 1):', 'Begründung eins.', 'Zu Z 2 (§ 5 Abs. 2):', 'Neu in der Regierungsvorlage.')

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units['Gesetz|Z2|inserted']!]).toMatchObject({ basis: 'paragraph', label: '§ 5', changed: true })
    expect(out.entries[out.units['Gesetz|Z1|changed']!]).toMatchObject({ basis: 'ziffer', changed: false })
  })

  it('bleibt beim §-Join, wo ein Dokument keine Ziffer betitelt', () => {
    const units = [z('Z1', 'Z1', 'In § 5 Abs. 1 wird "a" durch "b" ersetzt.'), z('Z2', 'Z2', 'In § 5 Abs. 2 wird "c" durch "d" ersetzt.')]
    const before = erl('Zu § 5:', 'Die Begründung.')
    const after = erl('Zu Z 1 und 2 (§ 5):', 'Die Begründung.')

    const neu = compareReasoning(units, before, after)
    const alt = compareReasoningByParagraph(units, new Map([['5', 'Die Begründung.']]), new Map([['5', 'Die Begründung.']]))

    expect(neu.routes).toEqual({ ziffer: 0, paragraph: 2, ownParagraph: 0 })
    expect(neu.units).toEqual(alt.units)
    expect(neu.stats).toEqual(alt.stats)
  })

  it('schlüsselt im Paket nach Artikel, jede Seite mit ihrer Nummer (18/ME: Artikel 3 wird 6)', () => {
    const units = [
      { ...unit(SNG, 'Z1', 'In § 15 Abs. 1 wird "kann" durch "darf" ersetzt.', 'changed', { from: '3', to: '6' }) },
      { ...unit(BVWG, 'Z1', 'In § 15 Abs. 2 entfällt "in der Regel".', 'changed', { from: '4', to: '5' }) },
    ]
    const before = erl('Zu Art. 3 (Änderung des SNG)', 'Zu Z 1 (§ 15):', 'Staatsschutz.', 'Zu Art. 4 (Änderung des BVwGG)', 'Zu Z 1 (§ 15):', 'Gericht.')
    const after = erl('Zu Art. 5 (Änderung des BVwGG)', 'Zu Z 1 (§ 15):', 'Gericht.', 'Zu Art. 6 (Änderung des SNG)', 'Zu Z 1 (§ 15):', 'Staatsschutz, nach der Begutachtung neu begründet.')

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units[`${SNG}|Z1|changed`]!]).toMatchObject({ changed: true })
    expect(out.entries[out.units[`${BVWG}|Z1|changed`]!]).toMatchObject({ changed: false })
  })

  it('findet im Paket ohne Artikelmarken die Ziffer über ihren § (151/ME XXVI)', () => {
    const units = [
      { ...unit(SNG, 'Z7', '§ 22 samt Überschrift lautet: …', 'changed', { to: '1' }) },
      { ...unit(BVWG, 'Z7', '§ 17 Abs. 1 lautet: …', 'changed', { to: '2' }) },
    ]
    const before = erl('Zu Z 7 (§ 22):', 'Zur Verwendung.', 'Zu Z 7 (§ 17):', 'Zur Leitung.')
    const after = erl('Zu Z 7 (§ 22):', 'Zur Verwendung, ergänzt um die Dienststellen.', 'Zu Z 7 (§ 17):', 'Zur Leitung.')

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units[`${SNG}|Z7|changed`]!]).toMatchObject({ label: 'Zu Z 7 (§ 22):', changed: true })
    expect(out.entries[out.units[`${BVWG}|Z7|changed`]!]).toMatchObject({ label: 'Zu Z 7 (§ 17):', changed: false })
  })
})

/** A § of a new law, renumbered from `from` in the draft to `id` in the Vorlage. */
function para(id: string, from: string | null, text: string, change: LawDiffUnit['change'] = 'changed', keys: { to?: string; from?: string } = {}, law = 'Neues Gesetz'): LawDiffUnit {
  return { ...unit(law, id, text, change, keys), fromId: from, fromArticleKey: keys.from ?? keys.to ?? null }
}

describe('compareReasoning — der § eines neuen Gesetzes nach seiner eigenen Bezeichnung (01.10.2026)', () => {
  it('gibt einem § die Passage, die ihn betitelt — jede Seite in ihrer eigenen Nummerierung', () => {
    // The text of § 6 cites § 2: as an instruction it read as „§ 2" until
    // 30.09.2026 (32/ME XXVIII). It is joined by what it is, not by what it cites.
    const units = [para('§1', '§1', 'Dieses Bundesgesetz regelt …'), para('§6', '§5', '(1) Wer gemäß § 2 verpflichtet ist, hat …')]
    const before = erl('Zu § 1:', 'Der Anwendungsbereich.', 'Zu § 2:', 'Die Pflichten.', 'Zu § 5:', 'Die Meldepflicht.')
    const after = erl('Zu § 1:', 'Der Anwendungsbereich.', 'Zu § 2:', 'Die Pflichten, nach der Begutachtung neu gefasst.', 'Zu § 6:', 'Die Meldepflicht, nun mit einer Frist von vier Wochen.')

    const out = compareReasoning(units, before, after)

    expect(out.routes).toEqual({ ziffer: 0, paragraph: 0, ownParagraph: 2 })
    expect(out.stats).toEqual({ compared: 2, changed: 1, uncompared: 0 })
    expect(out.entries[out.units['Neues Gesetz|§1|changed']!]).toMatchObject({ basis: 'paragraph', label: '§ 1', changed: false })
    expect(out.entries[out.units['Neues Gesetz|§6|changed']!]).toMatchObject({ basis: 'paragraph', label: '§ 6', changed: true })
  })

  it('zählt eine Passage über mehrere §§ einmal und zeigt sie an jedem', () => {
    const units = [para('§11', '§11', 'Verweisungen …', 'unchanged'), para('§12', '§12', 'Personenbezogene Bezeichnungen …', 'unchanged')]
    const before = erl('Zu §§ 11 und 12:', 'Schlussbestimmungen.')
    const after = erl('Zu §§ 11 und 12:', 'Schlussbestimmungen, ergänzt um die Vollziehung.')

    const out = compareReasoning(units, before, after)

    expect(out.stats).toEqual({ compared: 1, changed: 1, uncompared: 0 })
    expect(new Set(Object.values(out.units)).size).toBe(1)
  })

  it('vergleicht nicht, wo eine Seite die §§ anders zusammenfasst — und zeigt beide ohne Urteil', () => {
    const units = [para('§1', '§1', 'Ziel …'), para('§2', '§2', 'Begriffe …')]
    const before = erl('Zu § 1:', 'Das Ziel.', 'Zu § 2:', 'Die Begriffe.')
    const after = erl('Zu §§ 1 und 2:', 'Ziel und Begriffe.')

    const out = compareReasoning(units, before, after)

    expect(out.stats).toEqual({ compared: 0, changed: 0, uncompared: 2 })
    expect(out.entries[out.units['Neues Gesetz|§1|changed']!]).toMatchObject({ basis: 'paragraph', comparable: false, label: 'Zu §§ 1 und 2:', fromHeading: 'Zu § 1:', fromText: 'Das Ziel.' })
  })

  it('gibt einem eingefügten oder entfallenen § keine Begründung — es fehlt die Gegenseite', () => {
    const units = [para('§3', null, 'Neu …', 'inserted'), para('§4', '§4', 'Alt …', 'removed')]
    const before = erl('Zu § 4:', 'Entfällt.')
    const after = erl('Zu § 3:', 'Neu in der Vorlage.')

    expect(compareReasoning(units, before, after).units).toEqual({})
  })

  it('schlüsselt im Paket nach Artikel — die Passage eines anderen Gesetzes mit derselben Nummer bleibt draußen', () => {
    // 104/ME XXVI: two new laws, each with a § 1.
    const units = [
      para('§1', '§1', 'Grundsätze …', 'changed', { to: '1' }, 'Sozialhilfe-Grundsatzgesetz'),
      para('§1', '§1', 'Statistik …', 'changed', { to: '2' }, 'Sozialhilfe-Statistikgesetz'),
    ]
    const before = erl('Zu Artikel I (Grundsatzgesetz)', 'Zu § 1:', 'Grundsätze.', 'Zu Artikel II (Statistikgesetz)', 'Zu § 1:', 'Die Statistik.')
    const after = erl('Zu Artikel I (Grundsatzgesetz)', 'Zu § 1:', 'Grundsätze, nach der Begutachtung neu.', 'Zu Artikel II (Statistikgesetz)', 'Zu § 1:', 'Die Statistik.')

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units['Sozialhilfe-Grundsatzgesetz|§1|changed']!]).toMatchObject({ changed: true })
    expect(out.entries[out.units['Sozialhilfe-Statistikgesetz|§1|changed']!]).toMatchObject({ changed: false })
  })

  it('nimmt im Paket eine Passage ohne Artikel nur für eine Nummer, die kein anderes Gesetz des Entwurfs trägt', () => {
    // 99/ME XXVII: „Zu § 5 EUStA-DG" under no Artikel mark, beside a Novelle of the EU-JZG.
    const units = [
      para('§5', '§5', 'Die Delegierten …', 'changed', { to: '1' }, 'EUStA-DG'),
      para('§6', '§6', 'Die Ernennung …', 'changed', { to: '1' }, 'EUStA-DG'),
      { ...unit('Änderung des EU-JZG', 'Z1', 'In § 6 Abs. 1 wird "a" durch "b" ersetzt.', 'changed', { to: '2' }) },
    ]
    const before = erl('Zu § 5 EUStA-DG', 'Die Delegierten.', 'Zu § 6 EUStA-DG', 'Die Ernennung.')
    const after = erl('Zu § 5 EUStA-DG', 'Die Delegierten, neu gefasst nach der Begutachtung.', 'Zu § 6 EUStA-DG', 'Die Ernennung.')

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units['EUStA-DG|§5|changed']!]).toMatchObject({ changed: true })
    // § 6 is also the § the EU-JZG instruction amends: which law the passage means, the heading does not say.
    expect(out.units['EUStA-DG|§6|changed']).toBeUndefined()
  })

  it('liest den § aus der eigenen Adresse der Überschrift, nicht aus dem Satz, in den sie weiterläuft', () => {
    const units = [para('§6', '§6', 'Begriffe …'), para('§2', '§2', 'Ziel …')]
    const before = erl('Zu § 6:', 'Die Begriffe.', 'Zu Abs. 4: Die Regelung knüpft an § 2 an.', 'Mehr dazu.', 'Zu § 2:', 'Das Ziel.')
    const after = erl('Zu § 6:', 'Die Begriffe.', 'Zu Abs. 4: Die Regelung knüpft an § 2 an.', 'Mehr dazu.', 'Zu § 2:', 'Das Ziel.')

    const out = compareReasoning(units, before, after)

    // The sub-passage is § 6's and stays out of § 2's scope, so both are compared.
    expect(out.stats).toEqual({ compared: 2, changed: 0, uncompared: 0 })
  })
})

describe('compareReasoning — die Sammelvorlage in der Nummerierung des gebündelten Entwurfs (01.10.2026)', () => {
  const BSFG = 'Änderung des Bundes-Sportförderungsgesetzes 2017'
  const AHG = 'Änderung des Amtshaftungsgesetzes'

  it('liest „Zu Art. 3 Z 48" unter dem Artikel 25 der Vorlage als Z 48 des Artikels 3 im Entwurf (24/ME XXVIII)', () => {
    const units = [
      unit(BSFG, 'Z48', '§ 40 samt Überschrift lautet: Sportbericht …', 'changed', { from: '3', to: '25' }),
      unit(AHG, 'Z1', 'In § 1 wird "a" durch "b" ersetzt.', 'changed', { from: '1', to: '3' }),
    ]
    const before = erl(
      'Zu Artikel 1 (Änderung des Amtshaftungsgesetzes):',
      'Zu Z 1 (§ 1 AHG):',
      'Zur Haftung.',
      'Zu Artikel 3 (Änderung des BSFG 2017):',
      'Zu Art. 3 Z 48 (§ 40 BSFG 2017 samt Überschrift):',
      'Der Sportbericht.',
    )
    const after = erl(
      'Zu Artikel 3 (Änderung des Amtshaftungsgesetzes):',
      'Zu Z 1 (§ 1 AHG):',
      'Zur Haftung.',
      'Zu Artikel 25 (Änderung des Bundes-Sportförderungsgesetzes 2017):',
      'Zu Art. 3 Z 48 (§ 40 BSFG 2017 samt Überschrift):',
      'Der Sportbericht soll künftig jährlich erscheinen.',
    )

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units[`${BSFG}|Z48|changed`]!]).toMatchObject({ basis: 'ziffer', changed: true, label: 'Zu Art. 3 Z 48 (§ 40 BSFG 2017 samt Überschrift):' })
    // Read by its number, „Art. 3 Z 48" would be a Ziffer of the Vorlage's Artikel 3, the Amtshaftungsgesetz.
    expect(out.entries[out.units[`${AHG}|Z1|changed`]!]).toMatchObject({ label: 'Zu Z 1 (§ 1 AHG):', changed: false })
  })

  it('verlangt den § beider Seiten, wo eine Seite über die fremde Nummer gefunden ist', () => {
    // 24/ME counts its own Ziffern one off: its „Z 48" explains § 44, the unit amends § 40.
    const units = [
      unit(BSFG, 'Z48', '§ 40 samt Überschrift lautet: Sportbericht …', 'changed', { from: '3', to: '25' }),
      unit(AHG, 'Z1', 'In § 1 wird "a" durch "b" ersetzt.', 'changed', { from: '1', to: '3' }),
    ]
    const before = erl('Zu Artikel 1 (Änderung des Amtshaftungsgesetzes):', 'Zu Z 1 (§ 1 AHG):', 'Text.', 'Zu Artikel 3 (Änderung des BSFG 2017):', 'Zu Art. 3 Z 48 (§ 44 Abs. 7 BSFG 2017):', 'Inkrafttreten.')
    const after = erl('Zu Artikel 3 (Änderung des Amtshaftungsgesetzes):', 'Zu Z 1 (§ 1 AHG):', 'Text.', 'Zu Artikel 25 (Änderung des BSFG 2017):', 'Zu Art. 3 Z 48 (§ 40 BSFG 2017 samt Überschrift):', 'Der Sportbericht.')

    const out = compareReasoning(units, before, after)

    expect(out.units[`${BSFG}|Z48|changed`]).toBeUndefined()
    expect(out.fallbacks[`${BSFG}|Z48|changed`]).toBe('none')
  })

  it('bleibt bei der eigenen Nummer, wo die Vorlage der Nummer keine eigene Artikelüberschrift gibt (165/ME XXVI)', () => {
    const FFG = 'Änderung des FFG-Gesetzes'
    const units = [unit(FFG, 'Z1', 'In § 1 Abs. 1 wird "a" durch "b" ersetzt.', 'changed', { to: '4' }), unit('Änderung des FTFG', 'Z1', 'In § 2 wird "a" durch "b" ersetzt.', 'changed', { to: '3' })]
    const before = erl('Zu Art. 3 (Änderung des FTFG):', 'Zu Art. 3 Z 1 (§ 2):', 'Eins.', 'Zu Art. 4 (Änderung des FFG-Gesetzes):', 'Zu Art. 4 Z 1 (§ 1 Abs. 1):', 'Zwei.')
    const after = erl('Zu Art. 3 (Änderung des FTFG):', 'Zu Art. 3 Z 1 (§ 2):', 'Eins.', 'Zu Art. 4 Z 1 (§ 1 Abs. 1):', 'Zwei.')

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units[`${FFG}|Z1|changed`]!]).toMatchObject({ label: 'Zu Art. 4 Z 1 (§ 1 Abs. 1):', changed: false })
  })

  it('schlüsselt nach dem Titel, wo eine Seite ihre Gesetze ohne Nummer führt (22/ME XXVIII: „Art. X1", „Art. X2")', () => {
    const SEKTEN = 'Änderung des Bundesgesetzes über die Bundesstelle für Sektenfragen'
    const FAMILIE = 'Änderung des Bundesgesetzes über die Errichtung der Gesellschaft "Familie & Beruf Management GmbH"'
    const ZIVI = 'Änderung des Zivildienstgesetzes 1986'
    const noFrom = (u: LawDiffUnit): LawDiffUnit => ({ ...u, fromArticleKey: null })
    const units = [
      noFrom(unit(SEKTEN, 'Z1', 'Im Titel entfällt der Klammerausdruck.', 'changed', { to: '11' })),
      noFrom(unit(FAMILIE, 'Z1', 'In § 1 Abs. 4 wird "a" durch "b" ersetzt.', 'changed', { to: '12' })),
      noFrom(unit(ZIVI, 'Z1', '§ 23 Abs. 2 lautet: …', 'changed', { to: '13' })),
    ]
    const before = erl(
      `Zu Art. X1 (${SEKTEN}):`,
      'Zu Z 1',
      'Der Klammerausdruck entfällt.',
      'Zu Art. X2 (Änderung des Bundesgesetzes über die Errichtung der Gesellschaft „Familie &amp; Beruf Management GmbH“):',
      'Zu Z 1',
      'Anpassung an das Bundesministeriengesetz.',
      'Zu Art. X3 (Änderung des Bundesgesetzes über den Zivildienst):',
      'Zu Z 1',
      'Geheimhaltung.',
    )
    const after = erl(
      `Zu Artikel 11 (${SEKTEN}):`,
      'Zu Z 1 (Titel):',
      'Der Klammerausdruck entfällt.',
      'Zu Artikel 12 (Änderung des Bundesgesetzes über die Errichtung der Gesellschaft "Familie &amp; Beruf Management GmbH"):',
      'Zu Z 1 (§ 1 Abs. 4):',
      'Anpassung an das Bundesministeriengesetz 2025.',
      `Zu Artikel 13 (${ZIVI}):`,
      'Zu Z 1 (§ 23 Abs. 2):',
      'Geheimhaltung.',
    )

    const out = compareReasoning(units, before, after)

    expect(out.entries[out.units[`${SEKTEN}|Z1|changed`]!]).toMatchObject({ changed: false })
    expect(out.entries[out.units[`${FAMILIE}|Z1|changed`]!]).toMatchObject({ changed: true })
    // „über den Zivildienst" is not the title the text prints: nothing rather than a guess.
    expect(out.units[`${ZIVI}|Z1|changed`]).toBeUndefined()
  })
})
