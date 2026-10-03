import { describe, expect, it } from 'vitest'
import {
  annexDoubtfulNote,
  annexDroppedPagesNote,
  annexUncheckedNote,
  annexWithheldBlame,
  annexWithheldText,
} from '../app/utils/annexNotes'

describe('annexUncheckedNote — why a law\'s §§ went unchecked, under its pill (03.10.2026)', () => {
  it('names the group\'s reasons after a colon, in the order given', () => {
    expect(annexUncheckedNote(['das RIS Bundesrecht führt diese Paragraphen nicht']))
      .toBe('Nicht geprüft: das RIS Bundesrecht führt diese Paragraphen nicht.') // 40/ME XXVIII
    expect(annexUncheckedNote(['a', 'b'])).toBe('Nicht geprüft: a; b.')
  })

  it('says nothing where the group recorded no reason', () => {
    expect(annexUncheckedNote([])).toBeNull()
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
