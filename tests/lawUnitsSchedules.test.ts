import { describe, expect, it } from 'vitest'
import { parseLawUnits, parseLawUnitsFromRis } from '../server/utils/lawtext/lawUnits'

// 32/ME XXVIII (ElWG) and 43/ME (EABG), 19.11.2026: a new law's schedules
// follow its last §. Parliament's reader kept „Anlage I" / „(zu § 106)" as
// text of that §, the RIS reader dropped `<ueberschrift typ="anlage">`, and
// the Plenum→Kundmachung comparison showed every designation as removed.
describe('segmentUnits: a new law’s schedule designation reads the same from HTML and from RIS XML', () => {
  const html = (...paras: string[]) => `<html><body>${paras.join('')}</body></html>`
  const p = (cls: string, text: string) => `<p class=${cls}>${text}</p>`
  const ris = (...blocks: string[]) => `<risdok><nutzdaten><abschnitt>${blocks.join('')}</abschnitt></nutzdaten></risdok>`

  const fromHtml = parseLawUnits(html(
    p('45UeberschrPara', 'Vollziehung'),
    '<p class=51Abs><span class=991GldSymbol>&sect;&nbsp;190.</span> Mit der Vollziehung ist der Bundesminister betraut.</p>',
    p('71Anlagenbez', 'Anlage I'),
    p('71Anlagenbez', '(zu &sect; 106)'),
    p('41UeberschrG1', 'Netzbereiche'),
    p('51Abs', 'Als Netzbereiche werden bestimmt:'),
  ))
  const fromRis = parseLawUnitsFromRis(ris(
    '<ueberschrift typ="para">Vollziehung</ueberschrift>',
    '<absatz typ="abs"><gldsym>§ 190.</gldsym> Mit der Vollziehung ist der Bundesminister betraut.</absatz>',
    '<ueberschrift typ="anlage">Anlage I</ueberschrift>',
    '<ueberschrift typ="anlage">(zu § 106)</ueberschrift>',
    '<ueberschrift typ="g1">Netzbereiche</ueberschrift>',
    '<absatz typ="abs">Als Netzbereiche werden bestimmt:</absatz>',
  ))

  it('both keep the designation in the last §, word for word', () => {
    const last = (units: typeof fromRis) => units.find((u) => u.id === '§190')!.text.replace(/\s+/g, ' ').trim()
    expect(last(fromRis)).toBe('Mit der Vollziehung ist der Bundesminister betraut. Anlage I (zu § 106) Als Netzbereiche werden bestimmt:')
    expect(last(fromRis)).toBe(last(fromHtml))
  })

  it('keeps only what RIS classes as the designation and the heading right below it', () => {
    const units = parseLawUnitsFromRis(ris(
      '<absatz typ="abs"><gldsym>§ 5.</gldsym> Text des Paragraphen.</absatz>',
      // A converter's stray line in the schedule class — not in Parliament's text.
      '<ueberschrift typ="anlage">Teil 2</ueberschrift>',
      '<absatz typ="abs">Weiter im Text.</absatz>',
      // Inside a table: a Textgegenüberstellung's column head, not law text.
      '<table><tr><td><ueberschrift typ="anlage">Anlage 2</ueberschrift></td></tr></table>',
    ))
    expect(units.map((u) => u.text.replace(/\s+/g, ' ').trim())).toEqual(['Text des Paragraphen. Weiter im Text.'])
  })

  it('keeps one heading below the designation, not every line of the class after it (19.11.2026)', () => {
    const units = parseLawUnitsFromRis(ris(
      '<absatz typ="abs"><gldsym>§ 5.</gldsym> Text des Paragraphen.</absatz>',
      '<ueberschrift typ="anlage">Anlage 1</ueberschrift>',
      '<ueberschrift typ="anlage">(zu § 3)</ueberschrift>',
      '<ueberschrift typ="anlage">Teil 2</ueberschrift>',
      '<ueberschrift typ="anlage">Anlage 2</ueberschrift>',
      '<ueberschrift typ="anlage">(zu § 4)</ueberschrift>',
    ))
    expect(units.map((u) => u.text.replace(/\s+/g, ' ').trim())).toEqual(['Text des Paragraphen. Anlage 1 (zu § 3) Anlage 2 (zu § 4)'])
  })
})
