import { describe, expect, it } from 'vitest'
import { parseParliamentHtml } from '../server/utils/lawtext/parliamentHtml'
import { parseRisXml } from '../server/utils/lawtext/risXml'
import { htmlBodyText, readerLoss, risBodyText } from '../scripts/lib/readerCensus'

/**
 * The census of what a law-text reader leaves out (`station.ts --zensus`,
 * 21.11.2026): the body's words no block the reader returns carries.
 */
describe('readerLoss', () => {
  it('finds a paragraph Parliament’s reader does not take, and nothing where it takes all', () => {
    const kept = '<html><head><style>p { margin: 0 }</style></head><body><p class=51Abs>(1) Der Antrag ist schriftlich einzubringen.</p></body></html>'
    expect(readerLoss(htmlBodyText(kept), parseParliamentHtml(kept)).lost).toBe(0)
    const dropped = '<html><body><p class=51Abs>(1) Der Antrag ist schriftlich einzubringen.</p><div>(2) Die Frist beträgt sechs Wochen.</div></body></html>'
    const loss = readerLoss(htmlBodyText(dropped), parseParliamentHtml(dropped))
    expect(loss.lost).toBe(6)
    expect(loss.runs).toHaveLength(1)
    expect(loss.runs[0]).toContain('sechs')
  })

  it('does not count what RIS’s reader drops on purpose: the page header and footer', () => {
    const xml =
      '<risdok><nutzdaten><kzinhalt><absatz typ="kz">Kopfzeile Seite 1</absatz></kzinhalt>' +
      '<abschnitt><absatz typ="abs">(1) Der Antrag ist schriftlich einzubringen.</absatz></abschnitt>' +
      '<fzinhalt><absatz typ="fz">www.ris.bka.gv.at Seite 1 von 2</absatz></fzinhalt></nutzdaten></risdok>'
    expect(readerLoss(risBodyText(xml), parseRisXml(xml)).lost).toBe(0)
  })

  it('counts the Gliederungssymbol a block keeps apart as carried', () => {
    const html = '<html><body><p class=51Abs><span class=991GldSymbol>§ 5.</span> (1) Text.</p></body></html>'
    expect(readerLoss(htmlBodyText(html), parseParliamentHtml(html)).lost).toBe(0)
  })
})
