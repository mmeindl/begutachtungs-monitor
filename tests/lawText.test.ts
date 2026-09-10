import { describe, expect, it } from 'vitest'
import { compareKey, parseParliamentHtml, parseRisXml, stripMarkup } from '../server/utils/lawText'

/**
 * The one distinction three parsers share: which tags are a word boundary.
 *
 * `stripMarkup` is the rule itself; the two `parse*` tests below are the
 * reason it is shared. The annex's left column is scored against the standing
 * § from RIS and against the draft's Gesetzestext, so a reading that differs
 * between them is not a parser detail — it is a word the check reports as
 * missing (`docs/architecture.md` §12.13, 2026-09-11).
 */
describe('stripMarkup', () => {
  it('makes a space of a block tag, because that is where one sentence ends', () => {
    expect(stripMarkup('<absatz>Erster Satz.</absatz><absatz>Zweiter Satz.</absatz>')).toBe(' Erster Satz.  Zweiter Satz. ')
    expect(stripMarkup('<td>links</td><td>rechts</td>')).toBe(' links  rechts ')
  })

  it('makes nothing of markup inside a word', () => {
    // How the ressorts mark a changed letter: the "n" alone is yellow.
    expect(stripMarkup('Schlepplifte<i><span style="background:yellow">n</span></i>,')).toBe('Schleppliften,')
    expect(stripMarkup('Universi<b>tät</b>')).toBe('Universität')
    expect(stripMarkup('d<i>i</i>e')).toBe('die')
  })

  it('keeps a space the markup carries rather than surrounds', () => {
    // The one shape that would fuse two words — and only if the space were
    // *inside* the tag rather than inside its text. It is inside the text, so
    // it survives; measured over the corpus, no annex, standing § or draft
    // block carries an empty inline element between two word characters.
    expect(stripMarkup('Wort<i> zwei</i>')).toBe('Wort zwei')
    expect(stripMarkup('Wort<i></i>zwei')).toBe('Wortzwei')
  })

  it('leaves a superscript and a subscript as a word boundary', () => {
    // Deliberate: `CO<sub>2</sub>` belongs to the token and
    // `Meerkatzen<super>1)</super>` is a footnote mark that does not, and the
    // two cannot be told apart by shape. Both sides of every comparison carry
    // the tag, so a space there is symmetric; welding them moved no verdict.
    expect(stripMarkup('cm<super>2</super>')).toBe('cm 2 ')
    expect(stripMarkup('K<sub>2A</sub>')).toBe('K 2A ')
  })

  it('is invisible to the whitespace-insensitive keys', () => {
    // `compareKey` and `normalizeGld` drop every space, so the ME→RV
    // alignment cannot move with this rule — only the word diff it shows.
    expect(compareKey(stripMarkup('Wieder<i>holung</i> von Teil<b>prüfungen</b>'))).toBe(compareKey('Wieder holung von Teil prüfungen'))
  })
})

describe('the two law parsers read a marked-up word the same way', () => {
  it('RIS XML: a word italicised in the middle stays one word', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="abs"><gldsym>§ 5.</gldsym> (1) Die Universi<i>tät</i> meldet dem Bundes<b>minister</b>.</absatz>
      </abschnitt></nutzdaten></risdok>`
    expect(parseRisXml(xml)[0]!.text).toBe('(1) Die Universität meldet dem Bundesminister.')
  })

  it('Parliament HTML: the same word, the same reading', () => {
    const html = `<html><body><p class=51Abs><span class=991GldSymbol>&sect;&nbsp;5.</span> (1) Die Universi<i>t&auml;t</i> meldet dem Bundes<b>minister</b>.</p></body></html>`
    const block = parseParliamentHtml(html)[0]!
    expect(block.gld).toBe('§ 5.')
    expect(block.text).toBe('(1) Die Universität meldet dem Bundesminister.')
  })
})
