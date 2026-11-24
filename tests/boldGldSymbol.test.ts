import { describe, expect, it } from 'vitest'
import { parseParliamentHtml } from '../server/utils/lawtext/parliamentHtml'
import { parseLawUnits, parseLawUnitsFromRis } from '../server/utils/lawtext/lawUnits'
import { diffLawPackage, summarizeDiff } from '../server/utils/diff/lawDiff'

/** One Novelle, one instruction, the quoted § set as `payload`. 147/ME XXVIII in miniature. */
const doc = (payload: string): string => '<html><body>' +
  '<p class=41UeberschrG1>Artikel&nbsp;2</p>' +
  '<p class=43UeberschrG2>&Auml;nderung der Zivilprozessordnung</p>' +
  '<p class=12PromKlEinlSatz>Die Zivilprozessordnung wird wie folgt ge&auml;ndert:</p>' +
  '<p class=21NovAo1>1. Nach &sect;&nbsp;62 wird folgender &sect;&nbsp;62a eingef&uuml;gt:</p>' +
  payload +
  '</body></html>'

const BOLD = '<p class=23SatznachNovao>&#8222;<b>&sect;&nbsp;62a.</b> (1) Stellt der Beklagte einen Antrag.&#8220;</p>'
const SPAN = '<p class=51Abs>&#8222;<span class=991GldSymbol>&sect;&nbsp;62a.</span> (1) Stellt der Beklagte einen Antrag.&#8220;</p>'

describe('a § symbol set bold behind the opening quote (19.11.2026)', () => {
  it('is read as the block\'s symbol, like the 991GldSymbol span', () => {
    const bold = parseParliamentHtml(doc(BOLD)).at(-1)!
    const span = parseParliamentHtml(doc(SPAN)).at(-1)!
    expect(bold.gld).toBe(span.gld)
    expect(bold.text).toBe(span.text)
  })

  it('leaves a draft set bold and its Vorlage set with the span unchanged — 147/ME counted four such §§ as changed', () => {
    const { units } = diffLawPackage(parseLawUnits(doc(BOLD)), parseLawUnits(doc(SPAN)), { keepAddedLaws: true, keepDroppedLaws: true })
    expect(summarizeDiff(units)).toMatchObject({ changed: 0, inserted: 0, removed: 0 })
  })

  it('still sees a change of the words behind the symbol', () => {
    const changed = SPAN.replace('Stellt der Beklagte', 'Stellt die beklagte Partei')
    const { units } = diffLawPackage(parseLawUnits(doc(BOLD)), parseLawUnits(doc(changed)), { keepAddedLaws: true, keepDroppedLaws: true })
    expect(summarizeDiff(units).changed).toBe(1)
  })

  it('reads the same in a RIS draft — 68/ME XXVII: draft from RIS set bold, Vorlage from Parliament', () => {
    const xml = (payload: string) => '<risdok><nutzdaten><abschnitt>' +
      '<ueberschrift typ="g1">Artikel 2</ueberschrift>' +
      '<ueberschrift typ="g2">Änderung der Zivilprozessordnung</ueberschrift>' +
      '<absatz typ="erltext">Die Zivilprozessordnung wird wie folgt geändert:</absatz>' +
      '<absatz typ="novao1">1. Nach § 62 wird folgender § 62a eingefügt:</absatz>' +
      payload +
      '</abschnitt></nutzdaten></risdok>'
    const bold = parseLawUnitsFromRis(xml('<absatz typ="satz">„<b>§ 62a.</b> (1) Stellt der Beklagte einen Antrag.“</absatz>'))
    const gldsym = parseLawUnitsFromRis(xml('<absatz typ="abs">„<gldsym>§ 62a.</gldsym> (1) Stellt der Beklagte einen Antrag.“</absatz>'))
    for (const other of [gldsym, parseLawUnits(doc(SPAN))]) {
      const { units } = diffLawPackage(bold, other, { keepAddedLaws: true, keepDroppedLaws: true })
      expect(summarizeDiff(units)).toMatchObject({ changed: 0, inserted: 0, removed: 0 })
    }
  })

  it('stays text where the bold symbol is what the instruction changes, or carries more than the symbol', () => {
    const renumber = '<p class=22NovAo2>3. Die Bezeichnung des &sect;&nbsp;2 lautet <span style=\'font-style:normal\'>&#8222;<b>&sect;&nbsp;2.</b>&#8220;</span>.</p>'
    expect(parseParliamentHtml(`<html><body>${renumber}</body></html>`)[0]!.gld).toBeNull()
    const heading = '<p class=23SatznachNovao>&#8222;<b>&sect;&nbsp;15. Dauer</b> (1) Die Verleihung.&#8220;</p>'
    const block = parseParliamentHtml(`<html><body>${heading}</body></html>`)[0]!
    expect(block.gld).toBeNull()
    expect(block.text).toContain('§ 15. Dauer')
  })
})

describe('a paragraph Word left unclosed (152/ME XXVIII, Z 9)', () => {
  const row = (entry: string, title: string): string => `<tr><td><p class=32InhaltEintrag>${entry}</p></td><td><p class=32InhaltEintrag>${title}</p></td><td width=0><p class='MsoNormal'>&nbsp;</td></tr>`

  it('ends at the end of its cell and takes nothing from the next row', () => {
    const blocks = parseParliamentHtml(`<html><body><table>${row('&sect;&nbsp;15.', 'Zielgruppe')}${row('&sect;&nbsp;16.', 'Antragsteller')}</table></body></html>`)
    expect(blocks.map((b) => [b.kind, b.text])).toEqual([['toc', '§ 15.'], ['toc', 'Zielgruppe'], ['toc', '§ 16.'], ['toc', 'Antragsteller']])
  })

  it('keeps the text of an unclosed paragraph, up to the next one', () => {
    const blocks = parseParliamentHtml('<html><body><p class=51Abs>(1) Erster Satz.<p class=51Abs>(2) Zweiter Satz.</p></body></html>')
    expect(blocks.map((b) => b.text)).toEqual(['(1) Erster Satz.', '(2) Zweiter Satz.'])
  })
})

describe('a Gliederungssymbol Word split across two spans (24.11.2026)', () => {
  // 121/ME XXVIII Z 30 and its Ausschuss text: „§ " and „20a." side by side.
  const SPLIT = '<p class=51Abs>&#8222;<span class=991GldSymbol>&sect;&nbsp;</span><span class=991GldSymbol>62a.</span> (1) Stellt der Beklagte einen Antrag.&#8220;</p>'

  it('is read as one symbol, and none of it stays in the text', () => {
    const split = parseParliamentHtml(doc(SPLIT)).at(-1)!
    const span = parseParliamentHtml(doc(SPAN)).at(-1)!
    expect(split.gld).toBe(span.gld)
    expect(split.text).toBe(span.text)
  })

  it('leaves the § unchanged against the same § in one span', () => {
    const { units } = diffLawPackage(parseLawUnits(doc(SPLIT)), parseLawUnits(doc(SPAN)), { keepAddedLaws: true, keepDroppedLaws: true })
    expect(summarizeDiff(units)).toMatchObject({ changed: 0, inserted: 0, removed: 0 })
  })

  it('takes only spans side by side: a symbol later in the paragraph stays where it is', () => {
    const later = '<p class=51Abs><span class=991GldSymbol>&sect;&nbsp;5.</span> (1) Text mit <span class=991GldSymbol>X</span> darin.</p>'
    const block = parseParliamentHtml(doc(later)).at(-1)!
    expect(block.gld).toBe(parseParliamentHtml(doc('<p class=51Abs><span class=991GldSymbol>&sect;&nbsp;5.</span> (1) Text.</p>')).at(-1)!.gld)
  })
})
