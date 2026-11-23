import { describe, expect, it } from 'vitest'
import { headingOverNextBlock, oracleVerdict, paraIdOfGld, paragraphRows, rowsByParagraph, unaccountedStretch, containmentKey, type FollowingUnit } from '../server/utils/kons/tguOracle'
import { parseTextComparison, type ComparisonRow } from '../server/utils/annex/comparisonRows'
import { printedStretches } from '../server/utils/annex/elision'
import { comparableTokens } from '../server/utils/annex/annexText'
import { parseKonsParagraph, plainText } from '../server/utils/lawtext/konsTree'
import { draftArticles } from './helpers/builders'

/**
 * Annex rows filed under the § they belong to, and the edges of a row that
 * belong to its neighbours (20.11.2026). Period XXVIII withheld JN § 15, ZPO
 * §§ 291a and 501 and a dozen §§ more as `anhang-fremd` for nothing else.
 */
function pair(current: string, proposed: string, gld: string | null = null): ComparisonRow {
  const change = !current && proposed ? 'inserted' : current && !proposed ? 'removed' : current === proposed ? 'unchanged' : 'changed'
  return { kind: 'pair', law: null, heading: null, gld, para: gld, paraAfter: gld, current, proposed, change, elided: false, segments: null, editorial: false, elisionRange: false }
}

describe('„§. 517.": the designation of the ZPO and the JN', () => {
  it('opens its § in the oracle as „§ 517." does (116/ME XXVIII)', () => {
    expect(paraIdOfGld('§. 517.')).toBe('517')
    const grouped = rowsByParagraph([pair('§ 501. (1) 2 700 Euro', '§ 501. (1) 3 500 Euro', '§ 501.'), pair('§. 517. (1) 2 700 Euro', '§. 517. (1) 3 500 Euro', '§. 517.')])
    expect(paragraphRows(grouped, '501')).toHaveLength(1)
    expect(paragraphRows(grouped, '517')).toHaveLength(1)
  })

  it('is read off the head of both columns on the table path, its heading with its full stop kept with it (18/ME XXVIII)', () => {
    const cell = (t: string) => `<absatz typ="abs">${t}</absatz>`
    const xml = `<risdok><nutzdaten><table>${[
      ['<gldsym>§ 15.</gldsym> (1) bis (3)...', '<gldsym>§ 15.</gldsym> (1) bis (3)...'],
      ['(4) Gelöbnis alt.', '(4) Gelöbnis neu.'],
      ['Rechtshilfe auf Ersuchen ausländischer Gerichte.', 'Rechtshilfe auf Ersuchen ausländischer Gerichte.'],
      ['§. 39. (1) und (2) ...', '§. 39. (1) und (2) ...'],
      ['(3) Art. 12 alt.', '(3) Art. 14 neu.'],
    ].map(([a, b]) => `<tr><td>${cell(a!)}</td><td>${cell(b!)}</td></tr>`).join('')}</table></nutzdaten></risdok>`
    const rows = parseTextComparison(xml, draftArticles({ title: 'Änderung der Jurisdiktionsnorm' })).rows
    const grouped = rowsByParagraph(rows)
    expect(paragraphRows(grouped, '15').map((r) => r.current)).not.toContain('(3) Art. 12 alt.')
    expect(paragraphRows(grouped, '39').map((r) => r.current)).toEqual(['Rechtshilfe auf Ersuchen ausländischer Gerichte.', '(1) und (2) ...', '(3) Art. 12 alt.'])
  })

  it('is no word of the column for the annex gate, and no heading of the § in RIS', () => {
    expect(comparableTokens('§. 517. (1) Übersteigt')).toEqual(comparableTokens('(1) Übersteigt'))
    const xml = `<risdok><nutzdaten><abschnitt>
      <ueberschrift typ="para" ct="text">Beglaubigung von Unterschriften und Abschriften</ueberschrift>
      <ueberschrift typ="para" ct="text">§. 121.</ueberschrift>
      <absatz typ="abs" ct="text">Die Beglaubigung von Unterschriften kann jedes Bezirksgericht vornehmen.</absatz>
    </abschnitt></nutzdaten></risdok>`
    // The heading above the designation stays the §'s heading (JN § 121, BGBl. I Nr. 62/2026).
    expect(parseKonsParagraph(xml)!.heading).toBe('Beglaubigung von Unterschriften und Abschriften')
    expect(plainText(parseKonsParagraph(xml)!)).not.toContain('121')
  })
})

describe('the foot of a row', () => {
  const standing = containmentKey('Der Dritte hat Auskunft zu geben. Die übrigen Absätze bleiben.')

  it('leaves out schedules named by their Roman numerals in front of the mark (58/ME XXVIII, BVergG 2018 § 382)', () => {
    expect(printedStretches('zu erstellen. … Anhang I und Anhang II [...]')).toEqual(['zu erstellen.'])
    expect(printedStretches('zu erstellen. … Anhang XI bis Anhang XIV …')).toEqual(['zu erstellen.'])
    expect(printedStretches('zu erstellen. … Anhang I gilt.')).toEqual(['zu erstellen.', 'Anhang I gilt.'])
  })

  it('passes over the next §\'s heading standing alone behind a mark, and the next group\'s number (21/ME, 108/ME XXVIII)', () => {
    expect(unaccountedStretch(standing, '(3) Der Dritte hat Auskunft zu geben. (4) bis (6)… Eintragung und Weiterleitung von Daten in Register')).toBeNull()
    expect(unaccountedStretch(standing, '(3) Der Dritte hat Auskunft zu geben. (4) bis (8) ... IV.')).toBeNull()
  })

  it('passes over a lettered next heading behind the last sentence (148/ME XXVIII, BAO § 153g)', () => {
    expect(unaccountedStretch(standing, 'Der Dritte hat Auskunft zu geben. E. Beistandspflicht.')).toBeNull()
  })

  it('still holds law text there: a sentence, a number, a lower-case continuation', () => {
    expect(unaccountedStretch(standing, '(3) Der Dritte hat Auskunft zu geben. (4) ... Dies gilt sinngemäß.')).not.toBeNull()
    expect(unaccountedStretch(standing, '(3) Der Dritte hat Auskunft zu geben. (4) ... Frist von 14 Tagen')).not.toBeNull()
    expect(unaccountedStretch(standing, '(3) Der Dritte hat Auskunft zu geben. (4) ... und den Nachweis')).not.toBeNull()
    expect(unaccountedStretch(standing, 'Der Dritte hat Auskunft zu geben. E. Beistandspflicht gilt immer.')).not.toBeNull()
  })

  it('confirms nothing the right column changes at the foot', () => {
    const got = 'Der Dritte hat Auskunft zu geben. Die übrigen Absätze bleiben.'
    const rows = [pair('§ 3. Der Dritte hat Auskunft zu geben. (4) ... Eintragung', '§ 3. Der Dritte hat Information zu geben. (4) ... Eintragung', '§ 3.')]
    expect(oracleVerdict('3', got, got, rows).verdict).not.toBe('bestätigt')
  })
})

describe('a heading at the foot of a §\'s new text', () => {
  const got = 'Der Dritte hat Auskunft zu geben.'
  const left = '§ 3. Der Dritte hat Bericht zu geben.'
  const before = 'Der Dritte hat Bericht zu geben.'
  const right = (foot: string) => `§ 3. Der Dritte hat Auskunft zu geben. ${foot}`
  const verdict = (foot: string, following?: FollowingUnit, current = left) => oracleVerdict('3', before, got, [pair(current, right(foot), '§ 3.')], undefined, undefined, null, null, following).verdict

  it('is not taken for the next §\'s by its shape', () => {
    for (const foot of ['Eintragung und Weiterleitung von Daten', '4. Abschnitt', 'E. Beistandspflicht.']) expect(verdict(foot)).toBe('widersprochen')
  })

  it('passes where RIS or the result gives the next § that heading, wrapped or with its group', () => {
    expect(verdict('Eintragung und Weiterleitung', { printed: [], headings: ['Eintragung und Weiterleitung von Daten'] })).toBe('bestätigt')
    expect(verdict('4. Abschnitt', { printed: [], headings: ['4. Abschnitt Strafbestimmungen Zuständigkeit'] })).toBe('bestätigt')
  })

  it('passes where the annex\'s next block opens with it', () => {
    expect(verdict('Eintragung von Daten', { printed: ['Eintragung von Daten '], headings: [] })).toBe('bestätigt')
  })

  it('reads as heading of the next block what stands over its § sign, and a sign-less cell only if it is no text of the law', () => {
    expect(headingOverNextBlock('Eintragung von Daten § 4. (1) Die Behörde')).toBe('Eintragung von Daten ')
    expect(headingOverNextBlock('Eintragung von Daten')).toBe('Eintragung von Daten')
    expect(headingOverNextBlock('5. Abschnitt')).toBe('5. Abschnitt')
    // StPO § 22: the next block's first Absatz, its § designation in the row's own field.
    for (const body of ['(1) Die Generalprokuratur kann von Amts wegen', '(1) bis (4) …', 'Die Behörde entscheidet. Sie ist zuständig.', '2. der Antrag fehlt']) expect(headingOverNextBlock(body)).toBe('')
  })

  it('does not pass another group\'s number, or a heading of some other §', () => {
    expect(verdict('3. Abschnitt', { printed: [], headings: ['4. Abschnitt Strafbestimmungen'] })).toBe('widersprochen')
    expect(verdict('Eintragung von Daten', { printed: ['Vollziehung '], headings: ['Vollziehung'] })).toBe('widersprochen')
  })

  it('passes a group\'s bare number where the next block prints the title, not where it opens with a group of its own', () => {
    expect(verdict('Fünfter Abschnitt', { printed: ['Gremium zur Weiterentwicklung '], headings: ['Gremium zur Weiterentwicklung'] })).toBe('bestätigt')
    expect(verdict('Fünfter Abschnitt', { printed: ['Sechster Abschnitt Gremium '], headings: [] })).toBe('widersprochen')
    expect(verdict('Fünfter Abschnitt Vertrieb', { printed: ['Gremium zur Weiterentwicklung '], headings: [] })).toBe('widersprochen')
  })

  it('passes where the left column prints the same heading at its own foot, and not where those words are its law text', () => {
    expect(verdict('4. Abschnitt', undefined, `${left} 4. Abschnitt`)).toBe('bestätigt')
    const standing = 'Der Dritte hat die sichere Verwahrung zu prüfen. Der Dritte hat Bericht zu geben.'
    const result = 'Der Dritte hat die sichere Verwahrung zu prüfen. Der Dritte hat Auskunft zu geben.'
    const rows = [pair(`§ 3. ${standing}`, `§ 3. ${result} Sichere Verwahrung`, '§ 3.')]
    expect(oracleVerdict('3', standing, result, rows).verdict).toBe('widersprochen')
  })

  it('leaves a group heading that is a row of its own to the annex', () => {
    const rows = [pair(left, '§ 3. Der Dritte hat Auskunft zu geben.', '§ 3.'), pair('', '4. Abschnitt', null)]
    expect(oracleVerdict('3', before, got, rows).verdict).toBe('bestätigt')
  })
})

describe('a law whose units are Artikel (127/ME XXVIII, B-VG)', () => {
  const row = (gld: string | null, current: string, law: string, para: string | null = gld): ComparisonRow => ({ ...pair(current, current.replace('alt', 'neu'), gld), law, para })

  it('keys „Artikel 53." as the engine names the unit, „53"', () => {
    const law = 'Änderung des Bundes-Verfassungsgesetzes'
    const grouped = rowsByParagraph([row('Artikel 52.', '(1) bis (3) …', law), row(null, '(3a) alt', law, 'Artikel 52.'), row('Artikel 53.', '(3) alt', law)])
    expect(paragraphRows(grouped, '52', law)).toHaveLength(2)
    expect(paragraphRows(grouped, '53', law)).toHaveLength(1)
  })

  it('keeps „Artikel 1." out of a law that carries §§ inside its Artikel', () => {
    const law = 'Änderung des Begleitgesetzes'
    const grouped = rowsByParagraph([row('Artikel 1.', 'Dieses Gesetz gilt für alle alt.', law), row('§ 1.', '(1) alt', law)])
    expect(paragraphRows(grouped, '1', law).map((r) => r.current)).toEqual(['(1) alt'])
  })
})

describe('a Ziffer chain written without its „…" (138/ME XXVIII, UVP-G 2000 § 26)', () => {
  const standing = containmentKey('Dem Umweltrat gehören an: Vertreter der Länder; Vertreter der Gemeinden; zwei Vertreter/innen des Bundes, nominiert vom Bundeskanzler; je ein Vertreter der Kammern.')

  it('is the omission it marks where the next Ziffer follows straight', () => {
    expect(unaccountedStretch(standing, 'Dem Umweltrat gehören an: 1. bis 2 3. zwei Vertreter/innen des Bundes, nominiert vom Bundeskanzler;')).toBeNull()
    expect(unaccountedStretch(standing, 'Dem Umweltrat gehören an: 1. bis 2. 3. zwei Vertreter/innen des Bundes, nominiert vom Bundeskanzler;')).toBeNull()
  })

  it('stays text behind a word, where it is a date or a citation', () => {
    expect(unaccountedStretch(standing, 'Dem Umweltrat gehören vom 1. bis 2 3. zwei Vertreter/innen des Bundes an')).not.toBeNull()
  })
})
