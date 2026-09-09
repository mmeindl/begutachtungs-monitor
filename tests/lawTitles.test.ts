import { describe, expect, it } from 'vitest'
import { addressedParagraph, parseBgbl, promulgationByArticle, sameBgbl } from '../server/utils/lawTitles'
import { parseRisXml } from '../server/utils/lawText'

/** A package Artikel with its Promulgationsklausel, in RIS's element vocabulary. */
function article(nr: string, title: string, clause: string, instructions: string[]): string {
  return (
    `<ueberschrift typ="g1">${nr}</ueberschrift><ueberschrift typ="g2">${title}</ueberschrift>` +
    `<absatz typ="promkleinlsatz">${clause}</absatz>` +
    instructions.map((t, i) => `<absatz typ="novao1">${i + 1}. ${t}</absatz>`).join('')
  )
}
const doc = (body: string) => `<risdok><nutzdaten><abschnitt>${body}</abschnitt></nutzdaten></risdok>`

describe('parseBgbl', () => {
  it('splits organ and number the way RIS stores them', () => {
    expect(parseBgbl('…, BGBl. Nr. 620/1989, zuletzt geändert…')).toEqual({ organ: 'BGBl. Nr.', nummer: '620/1989' })
    expect(parseBgbl('…, BGBl. I Nr. 84/2001, …')).toEqual({ organ: 'BGBl. I Nr.', nummer: '84/2001' })
    expect(parseBgbl('…, BGBl. III Nr. 84/2001, …')).toEqual({ organ: 'BGBl. III Nr.', nummer: '84/2001' })
    expect(parseBgbl('kein Zitat hier')).toBeNull()
  })

  it('takes the first citation — the Stammnorm, not the latest amendment', () => {
    const clause = 'Das Strafgesetzbuch, BGBl. Nr. 60/1974, zuletzt geändert durch das Bundesgesetz BGBl. I Nr. 135/2023, wird wie folgt geändert:'
    expect(parseBgbl(clause)).toEqual({ organ: 'BGBl. Nr.', nummer: '60/1974' })
  })

  it('distinguishes the Teil, because the number alone collides', () => {
    // Kundmachungsorgannummer=84/2001 matches the AMD-G (BGBl. I) and an
    // Amtssitz law (BGBl. III); only the pair identifies a law.
    expect(sameBgbl({ organ: 'BGBl. I Nr.', nummer: '84/2001' }, { organ: 'BGBl. III Nr.', nummer: '84/2001' })).toBe(false)
    expect(sameBgbl({ organ: 'BGBl. I Nr.', nummer: '84/2001' }, { organ: 'BGBl. I Nr.', nummer: '84/2001' })).toBe(true)
  })
})

describe('promulgationByArticle', () => {
  it('maps each Artikel to the law it amends', () => {
    const blocks = parseRisXml(
      doc(
        article('Artikel 1', 'Änderung des Glücksspielgesetzes', 'Das Glücksspielgesetz, BGBl. Nr. 620/1989, zuletzt geändert durch BGBl. I Nr. 20/2026, wird wie folgt geändert:', ['§ 5 lautet:']) +
          article('Artikel 2', 'Änderung des KommAustria-Gesetzes', 'Das KommAustria-Gesetz, BGBl. I Nr. 32/2001, wird wie folgt geändert:', ['§ 13 lautet:']),
      ),
    )
    const map = promulgationByArticle(blocks)
    expect(map.get('Änderung des Glücksspielgesetzes')).toEqual({ organ: 'BGBl. Nr.', nummer: '620/1989' })
    expect(map.get('Änderung des KommAustria-Gesetzes')).toEqual({ organ: 'BGBl. I Nr.', nummer: '32/2001' })
  })

  it('ignores citations that appear after the first instruction', () => {
    // A cross-reference inside an amendment is not a promulgation clause.
    const blocks = parseRisXml(
      doc(
        `<ueberschrift typ="g1">Artikel 1</ueberschrift><ueberschrift typ="g2">Änderung des X-Gesetzes</ueberschrift>` +
          `<absatz typ="promkleinlsatz">Das X-Gesetz, BGBl. I Nr. 1/2000, wird wie folgt geändert:</absatz>` +
          `<absatz typ="novao1">1. § 5 lautet:</absatz>` +
          `<absatz typ="abs">Verweis auf BGBl. I Nr. 99/2099, wird wie folgt geändert</absatz>`,
      ),
    )
    expect(promulgationByArticle(blocks).get('Änderung des X-Gesetzes')).toEqual({ organ: 'BGBl. I Nr.', nummer: '1/2000' })
  })

  it('yields nothing for a Stammgesetz — it creates law rather than changing it', () => {
    const blocks = parseRisXml(doc('<ueberschrift typ="titel">Bundesgesetz über etwas Neues</ueberschrift><absatz typ="abs"><gldsym>§ 1.</gldsym> Dieses Gesetz gilt.</absatz>'))
    expect(promulgationByArticle(blocks).size).toBe(0)
  })
})

describe('addressedParagraph', () => {
  it('names the § an instruction edits', () => {
    expect(addressedParagraph('§ 218 Abs. 1 lautet:')).toBe('§ 218')
    expect(addressedParagraph('In § 9 Abs. 1 wird die Wortfolge "alt" durch die Wortfolge "neu" ersetzt.')).toBe('§ 9')
    expect(addressedParagraph('Dem § 60 wird folgender Abs. 44 angefügt:')).toBe('§ 60')
  })

  it('refuses the anchor of a newly created §', () => {
    // "Nach § 5 wird folgender § 5a eingefügt" addresses § 5, but the change
    // is § 5a — § 5's heading would be a real name on the wrong paragraph.
    expect(addressedParagraph('Nach § 5 wird folgender § 5a samt Überschrift eingefügt:')).toBeNull()
    // A sub-unit lands inside the named §, so its heading does fit.
    expect(addressedParagraph('In § 5 wird nach Abs. 2 folgender Abs. 3 eingefügt:')).toBe('§ 5')
  })

  it('refuses when one instruction spans several paragraphs', () => {
    expect(addressedParagraph('In § 17 Abs. 4, § 19 Abs. 1 und § 46 Abs. 2 wird jeweils die Wortfolge "a" durch die Wortfolge "b" ersetzt.')).toBeNull()
  })

  it('returns null for an instruction it cannot read', () => {
    expect(addressedParagraph('Im Inhaltsverzeichnis wird nach dem Eintrag zu § 5 folgender Eintrag eingefügt:')).toBeNull()
    expect(addressedParagraph('§ 5 wird wie folgt geändert:')).toBeNull()
  })
})
