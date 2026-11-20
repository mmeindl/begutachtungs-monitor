import { describe, expect, it } from 'vitest'
import type { ConsolidatedLaterAmendment, ConsolidatedTextResponse, TextComparisonRow } from '#shared/types'
import { unitKindOf, unitsPluralDe } from '#shared/utils/unitWord'
import { annexParas, groupAnnexRows, placeAtParagraphs } from '../app/utils/annexGroups'
import { annexElisionLead, annexFrontMatterGroupNote, annexFrontMatterNotes, annexWithheldBlame, annexWithheldText } from '../app/utils/annexNotes'
import {
  laterAmendmentText,
  lesefassungCauseText,
  lesefassungLine,
  lesefassungNotRunText,
  lesefassungSummary,
  lesefassungUnreachableText,
  noticeLesefassungToo,
  undividedText,
  unitList,
  unplacedText,
  type LesefassungCause,
} from '../app/utils/lesefassung'

/**
 * THE UNIT'S WORD (20.11.2026). In a law whose units are Artikel — the B-VG;
 * 82/ME and 127/ME XXVIII — every sentence at a block said „Paragraph", and
 * the list at the end of the law „§ 94" for Art. 94. Each sentence takes the
 * word; without one it speaks of the Paragraph, letter for letter as before.
 */
const CAUSES: LesefassungCause[] = [
  'verweigert', 'unplausibel', 'nicht-geladen', 'kein-anhang', 'anhang-schweigt', 'anhang-fremd', 'anhang-widerspricht', 'gesetz-unbekannt',
  'nummer-doppelt', 'nicht-im-ris', 'nicht-lesbar', 'zu-lang', 'entfaellt', 'anhang-ungeteilt', 'neu-erlassen', 'nicht-gefunden',
]

describe('the sentences of the Lesefassung, by unit', () => {
  it('keeps every sentence of a § as it was', () => {
    expect(CAUSES.map((c) => lesefassungCauseText(c))).toEqual([
      'Eine Anweisung des Entwurfs zu diesem Paragraphen konnten wir nicht sicher anwenden.',
      'Unser Ergebnis hat die Plausibilitätsprüfung nicht bestanden.',
      'Der Entwurf ändert mehr Paragraphen, als wir für eine Seite laden.',
      'Ohne lesbare Gegenüberstellung bestätigt niemand unser Ergebnis.',
      'Zu diesem Paragraphen fanden wir in der Beilage keine Änderung, an der sich unser Ergebnis prüfen ließe.',
      'Den geltenden Text, von dem die Beilage hier ausgeht, konnten wir nicht mit dem RIS abgleichen.',
      'Unser Ergebnis und die Beilage stimmen hier nicht überein.',
      'Das geänderte Gesetz fanden wir im RIS nicht eindeutig.',
      'Die Nummer steht im geänderten Gesetz mehrmals, in verschiedenen Artikeln.',
      'Diesen Paragraphen fanden wir im geltenden Text im RIS nicht.',
      'Das RIS führt diesen Paragraphen in einer Form, die wir nicht lesen können, etwa als Tabelle.',
      'Der Paragraph ist zu lang für unseren Vergleich.',
      'Unter dieser Nummer steht nach dem Entwurf kein Paragraph mehr.',
      'Wo in der Beilage ein Gesetz endet und das nächste beginnt, lesen wir nicht heraus; so ordnen wir den Paragraphen keinem Gesetz sicher zu.',
      'Dieses Gesetz erlässt der Entwurf neu, und seinen ganzen Text enthält er selbst; wir setzen nur Änderungen bestehender Gesetze zusammen.',
      'Eine Anweisung des Entwurfs zu diesem Paragraphen fanden wir nicht.',
    ])
    for (const c of CAUSES) expect(lesefassungCauseText(c, 'paragraph')).toBe(lesefassungCauseText(c))
    expect(lesefassungSummary()).toBe('Ganzer Paragraph in der vorgeschlagenen Fassung (nicht amtlich)')
    expect(noticeLesefassungToo()).toBe('Den ganzen Paragraphen in der vorgeschlagenen Fassung zeigen wir deshalb auch nicht.')
    expect(undividedText(true)).toBe('Die Paragraphen der Gegenüberstellung ließen sich keinem einzelnen Gesetz zuordnen. Was das Ministerium zu diesem Gesetz schreibt, steht deshalb hier und nicht am Paragraphen.')
    expect(undividedText(false)).toBe('Die Paragraphen der Gegenüberstellung ließen sich keinem einzelnen Gesetz zuordnen.')
    expect(lesefassungUnreachableText()).toBe('Gerade nicht abrufbar: die ganzen Paragraphen in der vorgeschlagenen Fassung.')
    expect(annexElisionLead()).toBe('Nicht der Paragraph ändert sich, sondern der Bereich, den die Beilage auslässt.')
  })

  it('says „Artikel" in each case form at an Artikel', () => {
    expect(CAUSES.map((c) => lesefassungCauseText(c, 'article'))).toEqual([
      'Eine Anweisung des Entwurfs zu diesem Artikel konnten wir nicht sicher anwenden.',
      'Unser Ergebnis hat die Plausibilitätsprüfung nicht bestanden.',
      'Der Entwurf ändert mehr Artikel, als wir für eine Seite laden.',
      'Ohne lesbare Gegenüberstellung bestätigt niemand unser Ergebnis.',
      'Zu diesem Artikel fanden wir in der Beilage keine Änderung, an der sich unser Ergebnis prüfen ließe.',
      'Den geltenden Text, von dem die Beilage hier ausgeht, konnten wir nicht mit dem RIS abgleichen.',
      'Unser Ergebnis und die Beilage stimmen hier nicht überein.',
      'Das geänderte Gesetz fanden wir im RIS nicht eindeutig.',
      'Die Nummer steht im geänderten Gesetz mehrmals, in verschiedenen Artikeln.',
      'Diesen Artikel fanden wir im geltenden Text im RIS nicht.',
      'Das RIS führt diesen Artikel in einer Form, die wir nicht lesen können, etwa als Tabelle.',
      'Der Artikel ist zu lang für unseren Vergleich.',
      'Unter dieser Nummer steht nach dem Entwurf kein Artikel mehr.',
      'Wo in der Beilage ein Gesetz endet und das nächste beginnt, lesen wir nicht heraus; so ordnen wir den Artikel keinem Gesetz sicher zu.',
      'Dieses Gesetz erlässt der Entwurf neu, und seinen ganzen Text enthält er selbst; wir setzen nur Änderungen bestehender Gesetze zusammen.',
      'Eine Anweisung des Entwurfs zu diesem Artikel fanden wir nicht.',
    ])
    expect(lesefassungLine({ kind: 'withheld', cause: 'verweigert' }, null, 'article')).toBe(
      'Ganzer Artikel in der vorgeschlagenen Fassung nicht gezeigt: Eine Anweisung des Entwurfs zu diesem Artikel konnten wir nicht sicher anwenden.',
    )
    // A block that stands for two Artikel names each by its designation.
    expect(lesefassungLine({ kind: 'withheld', cause: 'nicht-gefunden' }, 'Artikel 52b.', 'article')).toBe(
      'Ganzer Artikel 52b in der vorgeschlagenen Fassung nicht gezeigt: Eine Anweisung des Entwurfs zu diesem Artikel fanden wir nicht.',
    )
    expect(lesefassungSummary('article')).toBe('Ganzer Artikel in der vorgeschlagenen Fassung (nicht amtlich)')
    expect(noticeLesefassungToo('article')).toBe('Den ganzen Artikel in der vorgeschlagenen Fassung zeigen wir deshalb auch nicht.')
    expect(undividedText(true, 'article')).toBe('Die Artikel der Gegenüberstellung ließen sich keinem einzelnen Gesetz zuordnen. Was das Ministerium zu diesem Gesetz schreibt, steht deshalb hier und nicht am Artikel.')
    expect(annexElisionLead('article')).toBe('Nicht der Artikel ändert sich, sondern der Bereich, den die Beilage auslässt.')
  })

  it('names the later BGBl\'s version of „diesen Artikel"', () => {
    const later: ConsolidatedLaterAmendment = { cite: 'BGBl. I Nr. 111/2025', issued: '2025-12-30', asOf: '2025-11-03' }
    expect(laterAmendmentText(later, true)).toContain('führt das RIS diesen Paragraphen heute')
    expect(laterAmendmentText(later, true, null, 'article')).toContain('führt das RIS diesen Artikel heute')
    expect(laterAmendmentText(later, false, 'Artikel 94a.', 'article')).toContain('führt das RIS Artikel 94a heute')
  })

  it('lists the units of a law of Artikel as „Art.", one or several', () => {
    expect(unitList(['94'], 'article')).toBe('Art. 94')
    expect(unitList(['94', '94a'], 'article')).toBe('Art. 94 und 94a')
    expect(unitList(['10', '11', '12', '102', 'Anl. 1'], 'article')).toBe('Art. 10 bis 12 und 102 sowie Anl. 1')
    expect(unplacedText(['94'], 'article')).toBe('Der Entwurf ändert hier auch Art. 94; in der Beilage fanden wir dazu keine Gegenüberstellung.')
    expect(unplacedText(['12'], 'paragraph')).toBe(unplacedText(['12']))
  })

  it('speaks of a whole draft in the units its laws count in', () => {
    expect(unitsPluralDe([])).toBe('Paragraphen')
    expect(unitsPluralDe(['paragraph'])).toBe('Paragraphen')
    expect(unitsPluralDe(['article'])).toBe('Artikel')
    // 127/ME XXVIII: the B-VG beside the Verfassungsgerichtshofgesetz.
    expect(unitsPluralDe(['article', 'paragraph'])).toBe('Paragraphen und Artikel')
    expect(lesefassungUnreachableText('Paragraphen und Artikel')).toBe('Gerade nicht abrufbar: die ganzen Paragraphen und Artikel in der vorgeschlagenen Fassung.')
    const notRun: ConsolidatedTextResponse = { gp: 'XXVIII', inr: 1, risId: null, paragraphs: [], withheld: [], touched: 0, notRun: 'kein-xml' }
    expect(lesefassungNotRunText(notRun)).toMatch(/^Nicht lesbar: die ganzen Paragraphen in der vorgeschlagenen Fassung\. /)
    expect(lesefassungNotRunText(notRun, 'Artikel')).toMatch(/^Nicht lesbar: die ganzen Artikel in der vorgeschlagenen Fassung\. /)
    // The one cause that counts across the draft's laws takes the draft's word, at whichever block it stands.
    expect(lesefassungCauseText('nicht-geladen', 'article', 'Paragraphen und Artikel')).toBe('Der Entwurf ändert mehr Paragraphen und Artikel, als wir für eine Seite laden.')
    expect(lesefassungLine({ kind: 'withheld', cause: 'nicht-geladen' }, null, 'paragraph', 'Paragraphen und Artikel')).toBe(
      'Ganzer Paragraph in der vorgeschlagenen Fassung nicht gezeigt: Der Entwurf ändert mehr Paragraphen und Artikel, als wir für eine Seite laden.',
    )
  })
})

describe('the annex notices, by unit', () => {
  it('keeps the § wording and says „Artikel" at an Artikel', () => {
    expect(annexWithheldText('notInDraft')).toBe('die vorgeschlagene Fassung enthält Text, den der Entwurf für diesen Paragraphen nicht anordnet.')
    expect(annexWithheldText('notInDraft', 'article')).toBe('die vorgeschlagene Fassung enthält Text, den der Entwurf für diesen Artikel nicht anordnet.')
    expect(annexWithheldText('repealUnproven', 'article')).toBe('die vorgeschlagene Fassung zeigt von diesem Artikel nichts, und eine Anordnung des Entwurfs, die ihn aufhebt, ließ sich nicht finden.')
    expect(annexWithheldText('repeated', 'article')).toBe('die Beilage druckt diesen Artikel mehrmals, und welche ihrer Stellen einander gegenüberstehen, ließ sich nicht entscheiden.')
    expect(annexWithheldText('standing', 'article')).toBe(annexWithheldText('standing'))
    expect(annexWithheldBlame('standing', 'table', 'article')).toBe('Das kann auch an unserer Zuordnung zum Artikel liegen.')
    // The genitive: „des Paragraphen", „des Artikels".
    expect(annexWithheldBlame('alreadyStanding', 'table')).toBe('Das kann auch daran liegen, dass derselbe Wortlaut an anderer Stelle des Paragraphen steht; unsere Prüfung unterscheidet die Absätze nicht.')
    expect(annexWithheldBlame('alreadyStanding', 'table', 'article')).toBe('Das kann auch daran liegen, dass derselbe Wortlaut an anderer Stelle des Artikels steht; unsere Prüfung unterscheidet die Absätze nicht.')
    expect(annexWithheldBlame('repeated', 'table', 'article')).toBeNull()
    expect(annexWithheldBlame('standing', 'pdf', 'article')).toBe(annexWithheldBlame('standing', 'pdf'))
    expect(annexFrontMatterGroupNote('article')).toBe(
      'Nicht im Monitor: Text, den die Beilage zu diesem Gesetz vor dem ersten Artikel druckt – etwa Titel oder Promulgationsklausel –, vergleicht der Monitor nicht; die beiden Spalten unterscheiden sich darin.',
    )
    expect(annexFrontMatterNotes([null], 'article')[0]).toContain('vor dem ersten Artikel druckt')
    expect(annexFrontMatterNotes([null])[0]).toContain('vor dem ersten Paragraphen druckt')
  })
})

/** A pair row, changed. */
function row(para: string | null, over: Partial<TextComparisonRow> = {}): TextComparisonRow {
  return {
    kind: 'pair', law: null, heading: null, gld: para, para, paraAfter: para,
    current: `alt ${para}`, proposed: `neu ${para}`, change: 'changed', elided: false, segments: null,
    editorial: false, elisionRange: false, check: 'verified', owesCheck: true,
    ...over,
  }
}

describe('placeAtParagraphs — which word a block and a law\'s end take', () => {
  const bvg = 'Änderung des Bundes-Verfassungsgesetzes'
  const vfgg = 'Änderung des Verfassungsgerichtshofgesetzes 1953'
  const kons = (withheld: [string, string][]): ConsolidatedTextResponse => ({
    gp: 'XXVIII', inr: 127, risId: null, paragraphs: [], touched: withheld.length, notRun: null,
    withheld: withheld.map(([id, annexLaw]) => ({ id, annexLaw, cause: 'verweigert' as const })),
  })

  // 127/ME XXVIII: the B-VG, divided into Artikel, beside a law of §§.
  it('hands the oracle\'s decision down to the blocks and the ends, per law', () => {
    const rows = [row('Artikel 52.', { law: bvg }), row('Artikel 94b.', { law: bvg }), row('§ 56h.', { law: vfgg })]
    const placement = placeAtParagraphs(rows, kons([['52', bvg], ['94', bvg], ['56h', vfgg], ['94', vfgg]]), [])
    expect(unitKindOf(true)).toBe('article')
    expect(placement.unitOf(bvg)).toBe('article')
    expect(placement.unitOf(vfgg)).toBe('paragraph')
    expect([...placement.unitKinds].sort()).toEqual(['article', 'paragraph'])
    const paras = groupAnnexRows(rows, { matches: null, hidden: [] }).groups.flatMap((g) => annexParas(g, { limit: Number.POSITIVE_INFINITY, folding: true, placed: placement.byRow }).paras)
    expect(paras.map((p) => [p.gld, p.unit])).toEqual([['Artikel 52.', 'article'], ['Artikel 94b.', 'article'], ['§ 56h.', 'paragraph']])
    // „Art. 94" at the end of the B-VG, „§ 94" at the end of the VfGG.
    const ends = placement.ends.byGroup
    expect(unplacedText(ends.get(bvg)!.outcomes.map((o) => o.id), ends.get(bvg)!.unit)).toBe('Der Entwurf ändert hier auch Art. 94; in der Beilage fanden wir dazu keine Gegenüberstellung.')
    expect(unplacedText(ends.get(vfgg)!.outcomes.map((o) => o.id), ends.get(vfgg)!.unit)).toBe('Der Entwurf ändert hier auch § 94; in der Beilage fanden wir dazu keine Gegenüberstellung.')
  })

  it('leaves a law of §§ without a word of its own, and an annex without rows in Paragraphen', () => {
    const rows = [row('§ 5.'), row('§ 6.')]
    const placement = placeAtParagraphs(rows, kons([['5', null as never], ['9', null as never]]), [])
    expect(placement.byRow.get(rows[0]!)!.unit).toBeUndefined()
    expect([...placement.ends.byGroup.values()].map((e) => e.unit)).toEqual([undefined])
    expect([...placement.unitKinds]).toEqual(['paragraph'])
    expect(unitsPluralDe(placeAtParagraphs([], null, []).unitKinds)).toBe('Paragraphen')
  })

  // 82/ME XXVIII: a single-law draft files its units under no law, the annex's rows carry one.
  it('lists what is filed under no law in the unit of the group it goes to', () => {
    const rows = [row('Artikel 10.', { law: bvg }), row('Artikel 11.', { law: bvg })]
    const placement = placeAtParagraphs(rows, kons([['10', null as never], ['102', null as never]]), [])
    expect(placement.ends.byGroup.get(bvg)).toMatchObject({ unit: 'article' })
    expect([...placement.unitKinds]).toEqual(['article'])
  })
})
