import { describe, expect, it } from 'vitest'
import { compareKey, compareToken, displayTokens, stripMarkup, stripQuotes } from '../server/utils/lawtext/normalize'
import { parseParliamentHtml } from '../server/utils/lawtext/parliamentHtml'
import { parseRisXml } from '../server/utils/lawtext/risXml'

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

  it('welds a subscript to its word and leaves a superscript a word boundary (30.09.2026)', () => {
    // `CO<sub>2</sub>` belongs to the token, `Meerkatzen<super>1)</super>` is
    // a footnote mark that does not. The shape cannot tell them apart, the
    // tag can: over the cached corpus `<sub>` carries indices only, while
    // `<super>`/`<sup>` carry footnotes and exponents alike.
    expect(stripMarkup('K<sub>2A</sub>')).toBe('K2A')
    expect(stripMarkup('CO<sub>2</sub>-Emissionen')).toBe('CO2-Emissionen')
    expect(stripMarkup('Na<sub>2</sub>CO<sub>3</sub>')).toBe('Na2CO3')
    expect(stripMarkup('cm<super>2</super>')).toBe('cm 2 ')
    expect(stripMarkup('Meerkatzen<super>1)</super>')).toBe('Meerkatzen 1) ')
    expect(stripMarkup('m<sup>3</sup>')).toBe('m 3 ')
    // `<subtitle>` or any other tag starting with the letters is not a subscript.
    expect(stripMarkup('a<subtitle>b</subtitle>')).toBe('a b ')
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

describe('compareKey', () => {
  it('ignores hyphenation, because the two sources set it differently', () => {
    // Parliament's HTML carries a soft hyphen where the Bundesgesetzblatt has
    // a hard one; `normalizeText` strips soft hyphens, so the sides read
    // „OTCDerivaten" against „OTC-Derivaten". 9/ME reported 11 of 58 units
    // changed that way, all false (§12.33).
    expect(compareKey('OTC­Derivaten')).toBe(compareKey('OTC-Derivaten'))
    expect(compareKey('EWR-ISIN')).toBe(compareKey('EWRISIN'))
    // The price, named: whatever differs ONLY in its hyphenation counts as
    // the same. In legistic German that is typography, not law.
    expect(compareKey('Arbeits-zeit')).toBe(compareKey('Arbeitszeit'))
  })

  it('still separates texts that differ in a word', () => {
    expect(compareKey('OTC-Derivaten')).not.toBe(compareKey('OTC-Kontrakten'))
  })
})

describe('compareKey and the leader dots', () => {
  it('ignores a row of leader dots, which only one source sets', () => {
    // Parliament's HTML fills amount tables with dot leaders, RIS does not.
    // Twelve of 398 units in 15/ME read as "changed" over nothing else.
    expect(compareKey('monatlich.........................')).toBe(compareKey('monatlich'))
    expect(compareKey('Betrag ... 100')).toBe(compareKey('Betrag 100'))
  })

  it('leaves ordinary sentence punctuation alone', () => {
    expect(compareKey('Der Satz endet.')).not.toBe(compareKey('Der Satz endet'))
  })
})

describe('displayTokens and compareToken — die zwei Formen des Wortdiffs', () => {
  // The split exists so the diff can align on one and show the other. The
  // guarantee that makes it safe is the length: `compareToken` folds inside a
  // token, so it can never split one, join two or empty one.
  it('gives one compare key per displayed word, index for index', () => {
    const text = 'die E-Mail-Adresse der Bundes-Vergabekontrollkommission, 13 , und monatlich......... 100'
    const display = displayTokens(text)
    expect(display.map(compareToken)).toHaveLength(display.length)
    expect(display.every((w) => compareToken(w).length > 0)).toBe(true)
  })

  it('shows the hyphen and compares without it', () => {
    expect(displayTokens('die E-Mail-Adresse')).toEqual(['die', 'E-Mail-Adresse'])
    expect(compareToken('E-Mail-Adresse')).toBe('EMailAdresse')
    expect(compareToken('E-Mail-Adresse')).toBe(compareToken('EMailAdresse'))
  })

  // Both fold a word BOUNDARY, which is why they cannot wait for the token
  // level: a run of dots is a token on one side only, „13 ," is two against one.
  it('folds the leader dots and the space before punctuation away', () => {
    expect(displayTokens('monatlich......................... 100')).toEqual(['monatlich', '100'])
    expect(displayTokens('der Betrag 13 , und')).toEqual(['der', 'Betrag', '13,', 'und'])
  })

  it('leaves a hyphen that closes a word alone, and one that stands alone', () => {
    // „Kinder- und Jugendhilfe": the trailing hyphen is the word, not layout.
    expect(compareToken('Kinder-')).toBe('Kinder-')
    expect(compareToken('-')).toBe('-')
  })
})

describe('Punktreihen — Auslassung oder Spaltenfüller', () => {
  // Measured over 1.566 runs (25.09.2026): weight 3 is always the annex's
  // „unchanged, left out", weight 10+ always pads a table to its figure, and
  // the fifteen in between are form templates. „…" counts for three dots.
  it('shows the omission, in whichever spelling the ressort set it', () => {
    expect(displayTokens('§ 41. (1) bis (3) ... (4) Zur Beitragsgrundlage')).toContain('...')
    expect(displayTokens('§ 50. (1) bis (37) … (38) Die Bestimmung')).toContain('…')
  })

  it('takes the column filler out, in whichever spelling', () => {
    expect(displayTokens('monatlich........................ 1,21 Euro')).toEqual(['monatlich', '1,21', 'Euro'])
    expect(displayTokens('Betrag gemäß § 26 Abs. 1……………………………………… 361 Euro').join(' ')).not.toMatch(/…/)
  })

  // A leader is regularly broken by spaces („..... ......................").
  it('reads a filler split by spaces as one run', () => {
    expect(displayTokens('Kerngebiet liegt ................. ................ 1,21 Euro')).toEqual(['Kerngebiet', 'liegt', '1,21', 'Euro'])
  })

  // The greedy version of this rule swallowed the „6." of „3. bis 6. ..." in
  // 289 of 1.566 runs, which is why a piece is two dots or one „…", never one.
  it('leaves the full stop of the ordinal in front of an omission alone', () => {
    expect(displayTokens('3. bis 6. ...')).toEqual(['3.', 'bis', '6.', '...'])
  })

  it('does not weld the omission onto the designation before it', () => {
    expect(displayTokens('(1) bis (5) ...')).toEqual(['(1)', 'bis', '(5)', '...'])
    // …while the space before an ordinary mark is still welded away.
    expect(displayTokens('der Betrag 13 , und')).toEqual(['der', 'Betrag', '13,', 'und'])
  })

  it('compares an omission by what it means, not by how it is spelt', () => {
    expect(compareToken('...')).toBe(compareToken('…'))
    expect(compareToken('….')).toBe(compareToken('...'))
  })

  // The equality form never shows, so it folds both uses away — this is the
  // rule 15/ME needed, now for „…" as well, which it never covered.
  it('folds every dot run out of the equality form, both spellings', () => {
    expect(compareKey('monatlich.........................')).toBe(compareKey('monatlich'))
    expect(compareKey('monatlich………………………………')).toBe(compareKey('monatlich'))
    expect(compareKey('(1) bis (5) ...')).toBe(compareKey('(1) bis (5) …'))
  })
})

describe('stripQuotes — the pair of the instruction, and not a mark more (27.09.2026)', () => {
  it('keeps a quotation the heading ends on', () => {
    // AsylG 2005 § 59: the inner closing mark went with the instruction's.
    expect(stripQuotes('„Verfahren … und der „Aufenthaltsberechtigung besonderer Schutz“\u00a0“')).toBe('Verfahren … und der "Aufenthaltsberechtigung besonderer Schutz"')
    expect(stripQuotes('„Der „Titel“ des Gesetzes')).toBe('Der "Titel" des Gesetzes')
  })

  it('still strips the pair around a plain heading, and each half where the heading is split', () => {
    expect(stripQuotes('„Landesausspielungen“')).toBe('Landesausspielungen')
    expect(stripQuotes('„Aufbau und Zuständigkeit')).toBe('Aufbau und Zuständigkeit')
    expect(stripQuotes('der Staatsanwaltschaften“')).toBe('der Staatsanwaltschaften')
  })
})
