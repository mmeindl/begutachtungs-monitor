import { describe, expect, it } from 'vitest'
import { oracleVerdict, paraIdOfGld, paragraphRows, rowsByParagraph, unaccountedStretch, containmentKey } from '../server/utils/kons/tguOracle'
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
    const rows = parseTextComparison(xml, draftArticles('Jurisdiktionsnorm')).rows
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
