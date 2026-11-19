import { describe, expect, it } from 'vitest'
import {
  annexDoubtfulGroupNote,
  annexDoubtfulNote,
  annexDroppedPagesNote,
  annexFrontMatterGroupNote,
  annexFrontMatterNotes,
  annexUncheckedNote,
  annexWithheldBlame,
  annexWithheldLead,
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

  it('names our filing of the rows on the table path too', () => {
    // The table's cells are the ressort's, but which § a row belongs to is
    // ours where it opens none: SchOG §§ 6, 21c and 40 (RIS DE314E3C) were
    // withheld as „steht so nicht im RIS" for rows we had filed under them
    // (19.11.2026). Until then this sentence was null, blaming the annex.
    expect(annexWithheldBlame('standing', 'table')).toBe('Das kann auch an unserer Zuordnung zum Paragraphen liegen.')
    expect(annexWithheldBlame('notInDraft', 'table')).toContain('an unserer Zuordnung zum Paragraphen')
  })

  // FSG § 26 (68/ME XXVIII): the sentence the draft appends to Abs. 3 stands in
  // Abs. 2. The Beilage was right; the finding is our check reading the § whole.
  it('names our check, not the Beilage, where the right column repeats standing law', () => {
    const blame = annexWithheldBlame('alreadyStanding', 'table')!
    expect(blame).toContain('unsere Prüfung unterscheidet die Absätze nicht')
    expect(blame).not.toContain('Beilage')
  })
})

describe('annexFrontMatter… — text before a law\'s first § that differs between the columns (19.11.2026)', () => {
  // Our method for every annex, so „Nicht im Monitor", not „Nicht lesbar".
  it('says at the law that the monitor does not compare that text, and that the columns differ in it', () => {
    expect(annexFrontMatterGroupNote()).toBe(
      'Nicht im Monitor: Text, den die Beilage zu diesem Gesetz vor dem ersten Paragraphen druckt – etwa Titel oder Promulgationsklausel –, vergleicht der Monitor nicht; die beiden Spalten unterscheiden sich darin.',
    )
  })

  it('says it above for an undivided annex and names the laws no group carries, one sentence each', () => {
    expect(annexFrontMatterNotes([])).toEqual([])
    expect(annexFrontMatterNotes([null])).toEqual([
      'Nicht im Monitor: Text, den die Beilage vor dem ersten Paragraphen druckt – etwa Titel oder Promulgationsklausel –, vergleicht der Monitor nicht; die beiden Spalten unterscheiden sich darin.',
    ])
    expect(annexFrontMatterNotes([null, 'Änderung der Kellerbuchverordnung', 'Änderung der Kostverordnung'])[1]).toBe(
      'Nicht im Monitor: Text, den die Beilage zu einem Gesetz vor dem ersten Paragraphen druckt – etwa Titel oder Promulgationsklausel –, vergleicht der Monitor nicht; bei „Änderung der Kellerbuchverordnung“ und „Änderung der Kostverordnung“ unterscheiden sich die beiden Spalten darin.',
    )
  })
})

describe('annexDroppedPagesNote', () => {
  it('stays silent for an annex read whole', () => {
    expect(annexDroppedPagesNote(0)).toBeNull()
  })

  it('agrees in number', () => {
    expect(annexDroppedPagesNote(1)).toBe(
      'Nicht lesbar: Eine Seite des PDF ist anders gesetzt als die übrigen; was auf ihr steht, fehlt hier.',
    )
    expect(annexDroppedPagesNote(3)).toBe(
      'Nicht lesbar: 3 Seiten des PDF sind anders gesetzt als die übrigen; was auf ihnen steht, fehlt hier.',
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

describe('annexDoubtfulGroupNote — the cluster finding inside its own law (03.10.2026)', () => {
  it('needs no name and keeps the cause per path', () => {
    expect(annexDoubtfulGroupNote('pdf')).toBe('Auffällig viele Stellen dieses Gesetzes weichen vom geltenden Text ab – das kann an unserer Lesung des PDF liegen.')
    expect(annexDoubtfulGroupNote('table')).toContain('die Beilage dürfte dort einen anderen Stand')
  })
})

describe('annexWithheldLead — how many changes of a § are not shown', () => {
  it('counts changes, in the singular for one', () => {
    expect(annexWithheldLead(1)).toBe('1 Änderung hier nicht gezeigt:')
    expect(annexWithheldLead(3)).toBe('3 Änderungen hier nicht gezeigt:')
  })

  it('never says „0 Änderungen" — a § withheld without a change is still not shown', () => {
    expect(annexWithheldLead(0)).toBe('Hier nicht gezeigt:')
  })
})
