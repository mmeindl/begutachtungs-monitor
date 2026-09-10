import { describe, expect, it } from 'vitest'
import { draftUnits } from '../server/utils/annexDraft'
import type { TextBlock } from '../server/utils/lawText'
import { addressedUnits } from '../server/utils/novao'

const instruction = (text: string): TextBlock => ({ kind: 'novao', cls: 'absatz/novao1', text, gld: null })
const quoted = (text: string, gld: string | null = null): TextBlock => ({ kind: 'abs', cls: 'absatz/abs', text, gld })
const article = (text: string): TextBlock => ({ kind: 'article', cls: 'ueberschrift/g1', text, gld: null })
const section = (text: string): TextBlock => ({ kind: 'section', cls: 'ueberschrift/g1min', text, gld: null })
const clause = (text: string): TextBlock => ({ kind: 'abs', cls: 'absatz/promkleinlsatz', text, gld: null })

/** The §§ one instruction addresses, in the designations it writes. */
const paras = (line: string): string[] => addressedUnits(line).paras

describe('addressedUnits', () => {
  it('takes the § an instruction names', () => {
    expect(paras('§ 5 Abs. 2 lautet:')).toEqual(['§ 5'])
  })

  it('takes every § of a range, because the annex shows each of them', () => {
    // "§§ 7 bis 14" is one instruction and eight provisions; only the first
    // of them would otherwise have a reference of its own.
    expect(paras('Die §§ 7 bis 10 werden durch folgende Bestimmungen ersetzt:')).toEqual(['§ 7', '§ 8', '§ 9', '§ 10'])
  })

  it('takes every § of an enumeration', () => {
    expect(paras('In § 17 und § 29 wird jeweils die Wortfolge "alt" durch die Wortfolge "neu" ersetzt.')).toEqual(['§ 17', '§ 29'])
  })

  it('takes the § an insertion creates, not only its anchor', () => {
    // `lawTitles.addressedParagraph` refuses this on purpose — § 5's standing
    // heading must not name § 5a. Here it is the opposite: the payload's words
    // are evidence for exactly the § it installs.
    expect(paras('Nach § 5 wird folgender § 5a samt Überschrift eingefügt:')).toEqual(['§ 5', '§ 5a'])
  })

  it('takes both designations of a renumbering, and pairs them', () => {
    // The annex prints the § as the standing law designates it while every
    // later instruction addresses its new number; without the pair one
    // provision reads as two.
    const found = addressedUnits('Der bisherige § 3 erhält die Paragraphenbezeichnung "§ 4." .')
    expect(found.paras).toEqual(['§ 3', '§ 4.'])
    expect(found.aliases).toEqual([['§ 3', '§ 4.']])
  })

  it('reads an Anlage as an Anlage, not as a §', () => {
    expect(paras('Anlage 2 lautet:')).toEqual(['Anlage 2'])
    expect(paras('Nach Anlage 1 wird folgende Anlage 1a angefügt:')).toEqual(['Anlage 1', 'Anlage 1a'])
  })

  it('addresses nothing for an instruction that only touches the table of contents', () => {
    // Derived from the law text, so it is text of no § — and it must weaken
    // the check rather than fail one.
    const found = addressedUnits('Das Inhaltsverzeichnis wird wie folgt geändert:')
    expect(found.paras).toEqual([])
    expect(found.reason).not.toBeNull()
  })

  it('reports why it could not address an instruction, rather than guessing', () => {
    const found = addressedUnits('In den Bestimmungen dieses Bundesgesetzes wird der Ausdruck umgestellt.')
    expect(found.paras).toEqual([])
    expect(found.reason).toBeTruthy()
  })
})

describe('draftUnits', () => {
  it('files each instruction under the law of its Artikel', () => {
    // The law key is `LawUnit.article` — the same string `DraftArticle.key`
    // carries, which is how the annex's rows are attributed.
    const units = draftUnits([
      article('Artikel 1'),
      section('Änderung des Aktiengesetzes'),
      clause('Das Aktiengesetz, BGBl. Nr. 98/1965, wird wie folgt geändert:'),
      instruction('1. § 5 lautet: "Der Vorstand entscheidet."'),
      article('Artikel 2'),
      section('Änderung des GmbH-Gesetzes'),
      clause('Das GmbH-Gesetz, BGBl. Nr. 58/1906, wird wie folgt geändert:'),
      instruction('1. § 5 lautet: "Die Geschäftsführung entscheidet."'),
    ])
    expect(units.map((u) => [u.law, u.id, u.paras])).toEqual([
      ['Änderung des Aktiengesetzes', 'Z1', ['§ 5']],
      ['Änderung des GmbH-Gesetzes', 'Z1', ['§ 5']],
    ])
    // Two § 5 of one package, kept apart — 15,1 % of § designations in the
    // multi-law annexes recur in another law of the same draft.
    expect(units[0]!.text).toContain('Vorstand')
    expect(units[0]!.text).not.toContain('Geschäftsführung')
  })

  it('takes the § from a quoted Gliederungssymbol when the instruction line hides it', () => {
    // A "lautet:"-payload prints the §§ it rewrites, and that is an address
    // no instruction grammar has to read.
    const units = draftUnits([
      instruction('1. Die Überschrift des 2. Abschnitts samt der folgenden Bestimmung lautet:'),
      quoted('Die Behörde entscheidet.', '§ 12a.'),
    ])
    expect(units).toHaveLength(1)
    expect(units[0]!.paras).toContain('§ 12a.')
    expect(units[0]!.text).toContain('§ 12a.')
  })

  it('keeps a lettered sub-instruction inside its container and under its §', () => {
    const units = draftUnits([
      instruction('2. § 8 wird wie folgt geändert:'),
      instruction('a) In Abs. 3 wird die Wortfolge "alt" durch die Wortfolge "neu" ersetzt.'),
      instruction('b) Abs. 4 entfällt.'),
    ])
    expect(units).toHaveLength(1)
    expect(units[0]!.paras).toEqual(['§ 8'])
    expect(units[0]!.text).toContain('neu')
  })

  it('names the reason an instruction addressed nothing, so a miss can only weaken', () => {
    const units = draftUnits([instruction('1. Im gesamten Gesetzestext wird der Ausdruck ersetzt.')])
    expect(units[0]!.paras).toEqual([])
    expect(units[0]!.reason).toBeTruthy()
  })

  it('reads a Stammgesetz § from its own symbol', () => {
    const units = draftUnits([quoted('Dieses Bundesgesetz regelt den Zugang.', '§ 1.')])
    expect(units[0]!.paras).toEqual(['§ 1.'])
  })
})
