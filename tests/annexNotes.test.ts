import { describe, expect, it } from 'vitest'
import type { TextComparisonResponse } from '../shared/types'
import {
  annexCheckNote,
  annexDoubtfulNote,
  annexDroppedPagesNote,
  annexWithheldBlame,
  annexWithheldText,
} from '../app/utils/annexNotes'

type Verification = NonNullable<TextComparisonResponse['verification']>

const v = (o: Partial<Verification> = {}): Verification => ({
  ran: true,
  notRunReason: null,
  asOf: null,
  judged: 10,
  verified: 9,
  withheldParagraphs: 0,
  withheldByCause: { standing: 0, alreadyStanding: 0, notInDraft: 0 },
  doubtfulLaws: [],
  uncheckedParagraphs: 0,
  rowsWithoutParagraph: 0,
  ...o,
})

describe('annexCheckNote', () => {
  it('never falls silent — a comparison nothing could be checked in says so', () => {
    // Until 2026-09-10 this was empty for 21 drafts of GP XXVIII, and silence
    // on a page that otherwise reports its checks reads as a clean bill.
    expect(annexCheckNote(null)).toBe('Nicht gegen das geltende Recht im RIS geprüft')
  })

  it('prints the server’s own reason after a colon', () => {
    expect(annexCheckNote(v({ judged: 0, notRunReason: 'im RIS fehlt der Beginn der Begutachtungsfrist' }))).toBe(
      'Nicht gegen das geltende Recht im RIS geprüft: im RIS fehlt der Beginn der Begutachtungsfrist',
    )
  })

  it('still reports a withheld § where nothing could be judged', () => {
    // An annex that only inserts §§ and puts text into one the draft never
    // wrote: no left column to judge, and a right-column rule fired anyway.
    expect(
      annexCheckNote(
        v({
          judged: 0,
          verified: 0,
          withheldParagraphs: 1,
          withheldByCause: { standing: 0, alreadyStanding: 0, notInDraft: 1 },
          uncheckedParagraphs: 4,
        }),
      ),
    ).toBe('Nicht gegen das geltende Recht im RIS geprüft · 1 nicht gezeigt')
  })

  it('counts, and leaves the causes and the Stichtag to the block and the credits', () => {
    const note = annexCheckNote(
      v({
        judged: 32,
        verified: 28,
        asOf: '2026-08-15',
        withheldParagraphs: 3,
        withheldByCause: { standing: 1, alreadyStanding: 2, notInDraft: 0 },
        uncheckedParagraphs: 1,
        rowsWithoutParagraph: 2,
      }),
    )
    expect(note).toBe(
      '28 von 32 geprüften Paragraphen halten dem geltenden Recht im RIS stand · 3 nicht gezeigt · ' +
      '1 nicht geprüft · 2 Änderungen ohne Paragraphenangabe, nicht geprüft',
    )
    expect(note).not.toContain('15.08.2026')
  })

  it('names the PDF pairing as ours', () => {
    expect(annexCheckNote(v({ judged: 5, verified: 5 }), 'pdf')).toBe(
      '5 von 5 geprüften Paragraphen halten dem geltenden Recht im RIS stand · Zeilenzuordnung aus dem PDF erschlossen, ohne Gewähr',
    )
  })

  it('says nothing about an empty set', () => {
    expect(annexCheckNote(v({ judged: 5, verified: 5 }), 'table')).toBe(
      '5 von 5 geprüften Paragraphen halten dem geltenden Recht im RIS stand',
    )
  })
})

describe('annexWithheldText', () => {
  it('names the finding that applies to this § and no other', () => {
    expect(annexWithheldText('alreadyStanding')).toBe(
      'die vorgeschlagene Fassung zeigt Text als neu, der im RIS schon gilt.',
    )
    expect(annexWithheldText('notInDraft')).toContain('den der Entwurf für diesen Paragraphen nicht anordnet')
  })

  it('reads a missing cause as the one every withholding had before 2026-09-10', () => {
    expect(annexWithheldText(null)).toBe(annexWithheldText('standing'))
  })
})

describe('annexWithheldBlame', () => {
  it('names our own reading first on the PDF path', () => {
    expect(annexWithheldBlame('standing', 'pdf')).toBe('Das kann an unserer Lesung des PDF liegen.')
  })

  it('says nothing about a mismatching left column on the table path', () => {
    // There the pairing is the ressort's own, so there is nothing of ours to
    // blame — and no sentence beats an invented one.
    expect(annexWithheldBlame('standing', 'table')).toBeNull()
    expect(annexWithheldBlame('notInDraft', 'table')).toContain('an unserer Zuordnung zum Paragraphen')
  })
})

describe('annexDroppedPagesNote', () => {
  it('stays silent for an annex read whole', () => {
    expect(annexDroppedPagesNote(0)).toBeNull()
  })

  it('agrees in number', () => {
    expect(annexDroppedPagesNote(1)).toBe(
      'Eine Seite des PDF war anders gesetzt als die übrigen und wurde nicht gelesen; was auf ihr steht, fehlt hier.',
    )
    expect(annexDroppedPagesNote(3)).toBe(
      '3 Seiten des PDF waren anders gesetzt als die übrigen und wurden nicht gelesen; was auf ihnen steht, fehlt hier.',
    )
  })
})

describe('annexDoubtfulNote', () => {
  it('stays silent where no law stands out', () => {
    expect(annexDoubtfulNote([], 'pdf')).toBeNull()
  })

  it('names the law and, on the PDF path, our own reading as a cause', () => {
    expect(annexDoubtfulNote(['Asylgesetz 2005'], 'pdf')).toBe(
      'Auffällig viele Stellen weichen vom geltenden Text ab bei „Asylgesetz 2005“ – das kann an unserer Lesung des PDF liegen.',
    )
  })

  it('blames no one but the version on the ressort’s own table', () => {
    expect(annexDoubtfulNote(['A', 'B'], 'table')).toBe(
      'Auffällig viele Stellen weichen vom geltenden Text ab bei „A“, „B“ – die Beilage dürfte dort einen anderen Stand des Gesetzes zugrunde legen.',
    )
  })
})
