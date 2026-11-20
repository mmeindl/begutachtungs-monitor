import { describe, expect, it } from 'vitest'
import { containmentKey, oracleVerdict } from '../server/utils/kons/tguOracle'
import type { ComparisonRow } from '../server/utils/annex/comparisonRows'

/**
 * The same words in another setting (20.11.2026): what a transcript does to
 * the law without changing a word of it. Commas, full stops and spellings
 * stay strict.
 */
function pair(current: string, proposed: string, gld: string | null = '§ 3.'): ComparisonRow {
  const change = !current && proposed ? 'inserted' : current && !proposed ? 'removed' : current === proposed ? 'unchanged' : 'changed'
  return { kind: 'pair', law: null, heading: null, gld, para: gld, paraAfter: gld, current, proposed, change, elided: false, segments: null, editorial: false, elisionRange: false }
}
const same = (a: string, b: string) => expect(containmentKey(a)).toBe(containmentKey(b))
const differs = (a: string, b: string) => expect(containmentKey(a)).not.toBe(containmentKey(b))

describe('spellings read alike on both sides', () => {
  it('„Z." before a number (49/ME XXVIII, MedienG § 26)', () => same('gem. § 2 Z. 3a PartG', 'gem. § 2 Z 3a PartG'))
  it('„lit. b)" and „lit.d" (106/ME XXVIII, BUAG § 31; 27/ME)', () => {
    same('gemäß Abs. 2 lit. b) zu melden', 'gemäß Abs. 2 lit. b zu melden')
    same('nach lit.d zu melden', 'nach lit. d zu melden')
  })
  it('„a." as a list marker where RIS prints „a)" (4/ME XXVIII, UGB § 189)', () => {
    same('2. ... a. alle Gesellschafter', '2. ... a) alle Gesellschafter')
    same('Fremden: a. … b. sofern die Vorführung', 'Fremden: a) … b) sofern die Vorführung')
  })
  it('the table\'s column rule (104/ME XXVIII, FAG 2024 § 11)', () => same('Bund | Länder | Gemeinden', 'Bund Länder Gemeinden'))
  it('never „d. h." or „u. a." behind a comma or a word, never a comma or a full stop', () => {
    differs('effektiv sein, d. h. einen Beitrag', 'effektiv sein, d) h. einen Beitrag')
    expect(containmentKey('effektiv sein, d. h. einen')).toContain('d.h.')
    differs('Die Frist beträgt drei Tage, gilt', 'Die Frist beträgt drei Tage gilt')
    differs('ist zu melden. Die Frist', 'ist zu melden Die Frist')
  })
})

describe('in the annex\'s cells only', () => {
  const before = 'Folgende Aufzeichnungen stehen nicht zur Verfügung: vom Betreiber erstellte Notizen; vom Personal erstellte Berichte.'

  it('a marker glued to its word is the transcript\'s (21/ME XXVIII, UUG § 11)', () => {
    const rows = [pair('§ 3. Folgende Aufzeichnungen stehen nicht zur Verfügung: 1.vom Betreiber erstellte Notizen; 2.vom Personal erstellte Berichte.', '§ 3. Folgende Aufzeichnungen stehen nicht zur Verfügung: 1.vom Betreiber erstellte Notizen; 2.vom Personal erstellte Unterlagen.')]
    const got = before.replace('Berichte', 'Unterlagen')
    expect(oracleVerdict('3', before, got, rows).verdict).toBe('bestätigt')
  })

  it('but in the result it is a fault the oracle sees', () => {
    const rows = [pair('§ 3. Folgende Aufzeichnungen stehen nicht zur Verfügung: 1. vom Betreiber erstellte Notizen; 2. vom Personal erstellte Berichte.', '§ 3. Folgende Aufzeichnungen stehen nicht zur Verfügung: 1. vom Betreiber erstellte Notizen; 2. vom Personal erstellte Unterlagen.')]
    const got = before.replace('Berichte', 'Unterlagen').replace('; vom Personal', '; 2.vom Personal')
    expect(oracleVerdict('3', before, got, rows).verdict).not.toBe('bestätigt')
  })

  it('ß and ss alike against the standing text, never against the result', () => {
    const standing = 'Der Kostenzuschuß beträgt 100 Euro. Daß er gebührt, ist nachzuweisen.'
    const left = '§ 3. Der Kostenzuschuss beträgt 100 Euro. Daß er gebührt, ist nachzuweisen.'
    const right = '§ 3. Der Kostenzuschuss beträgt 200 Euro. Dass er gebührt, ist nachzuweisen.'
    const engineRight = 'Der Kostenzuschuß beträgt 200 Euro. Dass er gebührt, ist nachzuweisen.'
    expect(oracleVerdict('3', standing, engineRight, [pair(left, right)]).verdict).not.toBe('fremd')
    const missedDass = 'Der Kostenzuschuß beträgt 200 Euro. Daß er gebührt, ist nachzuweisen.'
    expect(oracleVerdict('3', standing, missedDass, [pair(left, right)]).verdict).not.toBe('bestätigt')
  })
})
