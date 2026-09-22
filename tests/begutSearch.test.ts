import { describe, expect, it } from 'vitest'
import type { TextBlock } from '../server/utils/lawText'
import {
  blocksFromPlainText,
  buildSnippet,
  locateInBlocks,
  parseSearchQuery,
  searchQueryString,
  withoutMinistryMentions,
} from '../server/utils/search/begutSearch'
import { ministryTokens } from '../server/utils/search/searchHaystack'

function block(text: string, over: Partial<TextBlock> = {}): TextBlock {
  return { kind: 'abs', cls: '51Abs', text, gld: null, ...over }
}

describe('parseSearchQuery', () => {
  it('splits on whitespace and lowercases', () => {
    expect(parseSearchQuery('Klimaschutz Datenschutz')).toEqual([
      { text: 'klimaschutz', prefix: false },
      { text: 'datenschutz', prefix: false },
    ])
  })

  it('reads the trailing star as truncation', () => {
    expect(parseSearchQuery('Klima*')).toEqual([{ text: 'klima', prefix: true }])
  })

  it('drops quotes rather than promising a phrase search', () => {
    // RIS has no phrase search: `"Klimaschutz"` returns the same 453 records
    // as `Klimaschutz`. Accepting the marks and ignoring them silently is
    // the one thing we must not do.
    expect(parseSearchQuery('"Klimaschutz"')).toEqual([{ text: 'klimaschutz', prefix: false }])
    expect(parseSearchQuery('„Klimaschutz“')).toEqual([{ text: 'klimaschutz', prefix: false }])
  })

  it('drops noise: one-letter words, repetitions, empty input', () => {
    expect(parseSearchQuery('a Klima Klima')).toEqual([{ text: 'klima', prefix: false }])
    expect(parseSearchQuery('   ')).toEqual([])
  })

  it('caps the number of words', () => {
    expect(parseSearchQuery('ein zwei drei vier fuenf sechs sieben acht')).toHaveLength(6)
  })

  it('round-trips into the string that goes to RIS', () => {
    expect(searchQueryString(parseSearchQuery('Klima* Schutz'))).toBe('klima* schutz')
  })
})

describe('buildSnippet', () => {
  const text = 'Die Behörde hat bei der Vollziehung dieses Bundesgesetzes auf den Klimaschutz Bedacht zu nehmen.'

  it('marks the word and keeps the sentence around it', () => {
    const at = text.indexOf('Klimaschutz')
    const s = buildSnippet(text, at, 'Klimaschutz'.length)
    expect(s.match).toBe('Klimaschutz')
    expect(`${s.before}${s.match}${s.after}`).toBe(text)
  })

  it('adds an ellipsis only on the side it cut', () => {
    const at = text.indexOf('Klimaschutz')
    const s = buildSnippet(text, at, 'Klimaschutz'.length, 10)
    expect(s.before.startsWith('…')).toBe(true)
    expect(s.after.endsWith('…')).toBe(true)
    // Cut at a word boundary, never mid-word.
    expect(s.before).not.toMatch(/…\S/)
  })

  it('keeps the first word when nothing was cut on the left', () => {
    const s = buildSnippet(text, 0, 3)
    expect(s.before).toBe('')
    expect(s.match).toBe('Die')
  })
})

describe('locateInBlocks', () => {
  const terms = parseSearchQuery('Klimaschutz')

  it('carries the Gliederungssymbol forward to the Absatz that hits', () => {
    // `gld` sits on the FIRST Absatz of a § only — a hit three Absätze later
    // still belongs to that §, and saying so is the whole point of the line.
    const blocks = [
      block('Ziele', { kind: 'para_head', gld: '§ 5.' }),
      block('Der erste Absatz ohne das Wort.'),
      block('Dabei ist auf den Klimaschutz Bedacht zu nehmen.'),
    ]
    const hit = locateInBlocks(blocks, terms)
    expect(hit?.designation).toBe('§ 5.')
    expect(hit?.snippet.match).toBe('Klimaschutz')
  })

  it('falls back to a heading where the document carries no §', () => {
    const blocks = [
      block('Zu § 12:', { kind: 'section' }),
      block('Die Änderung dient dem Klimaschutz.'),
    ]
    expect(locateInBlocks(blocks, terms)?.designation).toBe('Zu § 12:')
  })

  it('matches whole words, like RIS does', () => {
    // RIS finds nothing for "Klimaschut" and 453 records for "Klimaschutz";
    // `Klimaschutz*` finds 491. A locator that matched substrings would put a
    // hit on a document RIS never returned — so the strict pass must not.
    expect(locateInBlocks([block('Das Klimaschutzgesetz gilt.')], terms)).toBeNull()
    expect(locateInBlocks([block('Das Klimaschutzgesetz gilt.')], parseSearchQuery('Klimaschutz*'))?.snippet.match).toBe(
      'Klimaschutzgesetz',
    )
  })

  it('ignores case and respects umlauts as word characters', () => {
    expect(locateInBlocks([block('KLIMASCHUTZ ist das Ziel.')], terms)?.snippet.match).toBe('KLIMASCHUTZ')
    // "für" must not match inside "dafür" — \b would allow it, because \b
    // does not count an umlaut as a word character.
    expect(locateInBlocks([block('Dafür gilt Folgendes.')], parseSearchQuery('für'))).toBeNull()
  })

  it('prefers the block that carries all the words', () => {
    const both = parseSearchQuery('Klimaschutz Datenschutz')
    const blocks = [
      block('Nur der Klimaschutz steht hier.'),
      block('Klimaschutz und Datenschutz stehen beide hier.'),
    ]
    expect(locateInBlocks(blocks, both)?.snippet.after).toContain('Datenschutz')
  })

  it('takes a block with one of the words when none has them all', () => {
    const both = parseSearchQuery('Klimaschutz Datenschutz')
    expect(locateInBlocks([block('Nur der Klimaschutz steht hier.')], both)?.snippet.match).toBe('Klimaschutz')
  })

  it('skips the table of contents', () => {
    // Its entry repeats a heading printed further down: the same hit without
    // a sentence around it.
    const blocks = [
      block('§ 5 Klimaschutz', { kind: 'toc' }),
      block('Dabei ist auf den Klimaschutz Bedacht zu nehmen.', { gld: '§ 5.' }),
    ]
    expect(locateInBlocks(blocks, terms)?.designation).toBe('§ 5.')
  })

  it('finds nothing when the word is absent', () => {
    expect(locateInBlocks([block('Ein ganz anderer Satz.')], terms)).toBeNull()
  })

  it('finds the word inside a compound only when asked to be loose', () => {
    // The loose pass is the caller's second sweep across ALL documents, not a
    // fallback inside one: RIS found the word somewhere in the record, and
    // this is how we still name a place rather than saying "we do not know".
    const blocks = [block('Die Klimaschutz-Maßnahmen wirken.')]
    expect(locateInBlocks(blocks, parseSearchQuery('maßnahme'))).toBeNull()
    expect(locateInBlocks(blocks, parseSearchQuery('maßnahme'), true)?.snippet.match.toLowerCase()).toBe('maßnahme')
  })
})

describe('blocksFromPlainText', () => {
  it('bündelt Zeilen zu Absätzen, statt jede einzeln zu nehmen', () => {
    // Ein PDF kennt nur Zeilenumbrüche. Einzelne Zeilen als Blöcke fänden
    // die Wörter einer UND-Suche nie zusammen.
    const blocks = blocksFromPlainText('Erste Zeile\nzweite Zeile\ndritte Zeile')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.text).toBe('Erste Zeile zweite Zeile dritte Zeile')
  })

  it('trennt an Leerzeilen und wirft leere Blöcke weg', () => {
    expect(blocksFromPlainText('Eins\n\n   \nZwei').map((b) => b.text)).toEqual(['Eins', 'Zwei'])
  })

  it('macht einen neuen Block auf, bevor einer zu lang wird', () => {
    const blocks = blocksFromPlainText('aaaa\nbbbb\ncccc', 8)
    expect(blocks.map((b) => b.text)).toEqual(['aaaa bbbb', 'cccc'])
  })

  it('trägt kein Gliederungssymbol ein, das es im PDF nicht gibt', () => {
    expect(blocksFromPlainText('§ 5. Irgendwas')[0]).toMatchObject({ gld: null, kind: 'other' })
  })
})

describe('withoutMinistryMentions', () => {
  const tokens = ministryTokens([
    'BMLUK (Bundesministerium für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft)',
  ])

  it('nimmt dem Verteiler des Begleitschreibens seine Treffer', () => {
    // Der gemessene Fall: „klima" lieferte eine Druckgeräteverordnung, weil
    // das Begleitschreiben alle Ministerien als Empfänger listet.
    const verteiler = block(
      '13. Bundesministerium für Landesverteidigung 14. Bundesministerium für Land- und Forstwirtschaft, ' +
      'Klima- und Umweltschutz, Regionen und Wasserwirtschaft 15. Bundesministerium für Inneres',
    )
    expect(locateInBlocks([verteiler], parseSearchQuery('klima'))).not.toBeNull()
    expect(locateInBlocks(withoutMinistryMentions([verteiler], tokens), parseSearchQuery('klima'))).toBeNull()
  })

  it('führt zur Sachstelle, wo es beide gibt', () => {
    // Im Klimagesetz stand als Beleg die Ministerienaufzählung in § 5,
    // obwohl das Dokument das Wort 164-mal führt.
    const blocks = [
      block('1. des Bundesministeriums für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft,'),
      block('sowie je einem hochrangigen, für Klima zuständigen Verwaltungsorgan eines jeden Bundeslandes.'),
    ]
    const found = locateInBlocks(withoutMinistryMentions(blocks, tokens), parseSearchQuery('klima'))
    expect(found?.snippet.after).toContain('zuständigen Verwaltungsorgan')
  })

  it('lässt die Ressortnennung ohne Ministeranrede stehen', () => {
    // Die UVP-G-Novelle ersetzt genau diese Wortfolge in dutzenden §§ —
    // dort IST der Name der Gegenstand.
    const novelle = block('wird die Wortfolge "für Klimaschutz, Umwelt, Energie" durch eine andere ersetzt')
    expect(locateInBlocks(withoutMinistryMentions([novelle], tokens), parseSearchQuery('klimaschutz'))).not.toBeNull()
  })
})
