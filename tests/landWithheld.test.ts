import { describe, expect, it } from 'vitest'
import { enactedNote, quotedInstruction, reachesGroups, reachesNote, renumberedNote, withheldGroups, withheldNotes } from '../app/utils/landWithheld'

describe('withheldGroups — where the page counts a § it does not show', () => {
  it('files a § of another law under that law, not under the one group shown (Kärnten 38532/2024)', () => {
    const groups = withheldGroups([
      { law: 'Kärntner Jagdgesetz 2000', id: '§4', reason: 'unread' },
      { law: 'Kärntner Wildschadensfondsgesetz', id: '§1', reason: 'unread' },
      { law: 'Kärntner Wildschadensfondsgesetz', id: '§4', reason: 'unread' },
    ], ['Kärntner Jagdgesetz 2000', 'Kärntner Jagdgesetz 2000'])
    expect([...groups.keys()]).toEqual(['Kärntner Jagdgesetz 2000', 'Kärntner Wildschadensfondsgesetz'])
    expect(groups.get('Kärntner Jagdgesetz 2000')!.map((w) => w.id)).toEqual(['§4'])
  })

  it('lets a § of no law join the only group there is, and stand apart where there are several', () => {
    expect([...withheldGroups([{ law: null, id: '§9' }], ['Wiener Reinhaltegesetz']).keys()]).toEqual(['Wiener Reinhaltegesetz'])
    expect([...withheldGroups([{ law: null, id: '§9' }], ['A', 'B']).keys()]).toEqual([''])
  })
})

describe('withheldNotes — one true sentence per cause (25.10.2026)', () => {
  it('says „einzelne Wörter, Sätze oder Ziffern" only of the §§ the reader classed so, and nothing of the kind of the rest', () => {
    const notes = withheldNotes([
      { law: 'K', id: '§4', reason: 'wording' },
      { law: 'K', id: '§95', reason: 'unread' },
      { law: 'K', id: '§55b', reason: 'inserted' },
      { law: 'K', id: '§3' },
    ])
    expect(notes.map((n) => [n.cause, n.ids])).toEqual([['standing', ['§3']], ['inserted', ['§55b']], ['wording', ['§4']], ['unread', ['§95']]])
    expect(notes.find((n) => n.cause === 'unread')!.text).not.toMatch(/Wörter|Sätze/)
    expect(notes.find((n) => n.cause === 'inserted')!.text).not.toMatch(/wortgleich/)
    expect(notes.find((n) => n.cause === 'standing')!.text).toBe('Seinen geltenden Text fand der Monitor im RIS nicht wortgleich')
  })

  it('agrees in number', () => {
    expect(withheldNotes([{ law: null, id: '§1', reason: 'unread' }, { law: null, id: '§2', reason: 'unread' }])[0]!.text).toMatch(/^Ihren /)
  })

  it('drops „ebenfalls" where nothing of the comparison is shown', () => {
    expect(withheldNotes([{ law: null, id: '§1', reason: 'unread' }], { alone: true })[0]!.lead).toBe('Geändert, hier nicht gezeigt:')
    expect(withheldNotes([{ law: null, id: '§1', reason: 'unread' }])[0]!.lead).toBe('Ebenfalls geändert, hier nicht gezeigt:')
  })
})

describe('withheldNotes — the causes of 26.10.2026', () => {
  it('words a division, a gap in the instructions and an annex each in a sentence of its own, in that order', () => {
    const notes = withheldNotes([
      { law: 'K', id: 'Anlage 2', reason: 'annex' },
      { law: 'K', id: '§21', reason: 'division' },
      { law: 'K', id: '§22', reason: 'division' },
      { law: 'K', id: '§7', reason: 'gap' },
    ])
    expect(notes.map((n) => [n.cause, n.ids])).toEqual([['division', ['§21', '§22']], ['gap', ['§7']], ['annex', ['Anlage 2']]])
    expect(notes[0]!.text).toMatch(/^Die Novelle fasst den Teil des Gesetzes, in dem sie stehen, als Ganzes neu/)
    expect(notes[1]!.text).toMatch(/^Nicht jede Änderungsanweisung der Novelle zu diesem Gesetz fand der Monitor/)
    expect(notes[2]).toMatchObject({ lead: 'Nicht gezeigt:', text: 'Anlagen und Anhänge gleicht der Monitor nicht mit dem RIS ab und zeigt sie deshalb nicht' })
  })

  it('refers to one § as „ihn", to several and to an Anlage as „sie"', () => {
    expect(withheldNotes([{ law: null, id: '§1', reason: 'division' }])[0]!.pronoun).toBe('ihn')
    expect(withheldNotes([{ law: null, id: '§1', reason: 'division' }, { law: null, id: '§2', reason: 'division' }])[0]!.pronoun).toBe('sie')
    expect(withheldNotes([{ law: null, id: 'Anlage 1', reason: 'annex' }])[0]!.pronoun).toBe('sie')
  })
})

describe('withheldNotes — a law title (26.10.2026)', () => {
  it('names a changed title after everything else, as what RIS cannot check, and refers to it as „ihn"', () => {
    const notes = withheldNotes([{ law: 'O', id: 'Titel', reason: 'title' }, { law: 'O', id: 'Anlage 1', reason: 'annex' }])
    expect(notes.map((n) => [n.cause, n.ids])).toEqual([['annex', ['Anlage 1']], ['title', ['Titel']]])
    expect(notes[1]).toMatchObject({ lead: 'Nicht gezeigt:', text: 'Den Titel des Gesetzes gleicht der Monitor nicht mit dem RIS ab und zeigt ihn deshalb nicht', pronoun: 'ihn' })
  })
})

describe('withheldNotes — a renumbered § (26.10.2026)', () => {
  it('carries the number it has in force beside the one it gets, for „§ 13 → § 9"', () => {
    const notes = withheldNotes([{ law: 'O', id: '§9', fromId: '§13', reason: 'unsure' }, { law: 'O', id: '§7', reason: 'unsure' }])
    expect(notes.map((n) => [n.ids, n.fromIds])).toEqual([[['§9', '§7'], ['§13', null]]])
  })
})

describe('renumberedNote — a draft that renumbers where no mapping is printed (26.10.2026)', () => {
  it('quotes the first of the draft\'s renumberings and says the list goes by number, and says nothing without one', () => {
    expect(renumberedNote(['Der bisherige § 54a erhält die Paragraphenbezeichnung „§ 54b“'])).toBe('Die Novelle nummeriert Paragraphen um, etwa: „Der bisherige § 54a erhält die Paragraphenbezeichnung „§ 54b““. Der Monitor stellt die Paragraphen hier nach ihrer Nummer gegenüber, nicht nach ihrer Herkunft.')
    expect(renumberedNote([])).toBeNull()
  })
})

describe('enactedNote — a law the draft enacts anew (26.10.2026)', () => {
  it('says that the draft carries its text and the Textgegenüberstellung does not, in the Monitor\'s voice', () => {
    expect(enactedNote()).toBe('Dieses Gesetz erlässt der Entwurf neu. Seinen ganzen Text enthält der Entwurf selbst, nicht die Textgegenüberstellung; der Monitor vergleicht hier nur Änderungen bestehender Gesetze.')
  })
})

describe('reachesGroups — instructions said for their law (26.10.2026)', () => {
  it('files each instruction under its law, once, and one of no law under the only group there is', () => {
    const groups = reachesGroups([
      { law: 'K', instruction: 'Im V. Abschnitt wird jeweils „a“ durch „b“ ersetzt.' },
      { law: 'K', instruction: 'Im V. Abschnitt wird jeweils „a“ durch „b“ ersetzt.' },
      { law: null, instruction: 'Im ganzen Gesetz wird „x“ durch „y“ ersetzt.' },
    ], ['K'])
    expect([...groups.entries()]).toEqual([['K', [{ instruction: 'Im V. Abschnitt wird jeweils „a“ durch „b“ ersetzt.', repeal: false }, { instruction: 'Im ganzen Gesetz wird „x“ durch „y“ ersetzt.', repeal: false }]]])
    expect(reachesNote().after).toBe('Den Wortlaut, der sich daraus ergibt, setzt der Monitor nicht selbst zusammen.')
    // A law repealed whole leaves no wording to compose: the page says nothing after it (26.10.2026).
    expect(reachesGroups([{ law: 'M', instruction: 'Das Gesetz M, LGBl. Nr. 1/2000, tritt außer Kraft.', repeal: true }], []).get('M')).toEqual([{ instruction: 'Das Gesetz M, LGBl. Nr. 1/2000, tritt außer Kraft.', repeal: true }])
    expect(quotedInstruction('Der 4. Abschnitt lautet:')).toBe('Der 4. Abschnitt lautet: …')
    expect(quotedInstruction('Im ganzen Gesetz wird „x“ durch „y“ ersetzt.')).toBe('Im ganzen Gesetz wird „x“ durch „y“ ersetzt.')
  })
})
