import { describe, expect, it } from 'vitest'
import { withheldGroups, withheldNotes } from '../app/utils/landWithheld'

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
