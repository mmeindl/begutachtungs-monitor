import { describe, expect, it } from 'vitest'
import { containmentKey } from '../server/utils/kons/tguOracle'
import { parseKonsParagraph, plainText } from '../server/utils/lawtext/konsTree'
import { comparableTokens } from '../server/utils/annex/annexText'

/**
 * RIS's web view in a ressort's annex, and RIS's footnote reference in the
 * standing text (20.11.2026): on either side no word of the law. 21 §§ of
 * period XXVIII were withheld as `anhang-fremd` for nothing else.
 */
describe('the oracle reads RIS apparatus as no text', () => {
  const same = (a: string, b: string) => expect(containmentKey(a)).toBe(containmentKey(b))

  it('drops the footnote reference „(Anm. 1)" (58/ME XXVIII, BVergG 2018 § 213)', () => {
    same('wenn der geschätzte Auftragswert 75 000 Euro (Anm. 1) nicht erreicht', 'wenn der geschätzte Auftragswert 75 000 Euro nicht erreicht')
  })

  it('drops a note with a bracket inside (61/ME XXVIII, BAO § 86)', () => {
    same('als ursprünglich richtig eingebracht. (Anm.: § 86 (1) BAO entspricht inhaltlich der ursprünglichen Fassung des § 85 (2) BAO) (2) Wird', 'als ursprünglich richtig eingebracht. (2) Wird')
  })

  it('drops „Beachte für folgende Bestimmung" and the label over a version (24/ME XXVIII, BSFG 2017 § 27)', () => {
    same('verpflichtet. Beachte für folgende Bestimmung (2) Von der', 'verpflichtet. (2) Von der')
    same('verpflichtet. Ab 1.9.2025: (2) Von der', 'verpflichtet. (2) Von der')
    same('Ab 1.9.2025 bzw. mit dem der Kundmachung folgenden Tag: (3) Die', '(3) Die')
  })

  it('keeps a date the law writes, and a note that is no reference', () => {
    expect(containmentKey('Ab 1. September 2025: gilt')).not.toBe(containmentKey('gilt'))
    expect(containmentKey('ab 1.9.2025 gilt')).toContain('2025')
    expect(containmentKey('gemäß Anm. 1 der Anlage')).toContain('Anm')
  })
})

describe('the standing text and the annex gate drop the reference alike', () => {
  const xml = `<risdok><nutzdaten><abschnitt>
    <absatz typ="abs" ct="text"><gldsym>§ 213.</gldsym> (2) Eine Direktvergabe ist ausschließlich zulässig, wenn der geschätzte Auftragswert 75 000 Euro <i>(Anm. 1)</i> nicht erreicht.</absatz>
  </abschnitt></nutzdaten></risdok>`

  it('reads RIS\'s reference out of the § (konsTree)', () => {
    expect(plainText(parseKonsParagraph(xml)!)).toBe('Eine Direktvergabe ist ausschließlich zulässig, wenn der geschätzte Auftragswert 75 000 Euro nicht erreicht.')
  })

  it('counts no word of it in the annex column (annexText)', () => {
    expect(comparableTokens('75 000 Euro (Anm. 1) nicht erreicht')).toEqual(comparableTokens('75 000 Euro nicht erreicht'))
  })
})
