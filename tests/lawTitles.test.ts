import { describe, expect, it } from 'vitest'
import { addressedParagraph, draftArticles, lawNameScore, parseBgbl, promulgationByArticle, sameBgbl, stammnormOf } from '../server/utils/lawTitles'
import { parseRisXml } from '../server/utils/lawText'
import { unitKey } from '../shared/utils/diffKey'

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

describe('unitKey', () => {
  it('separates a removed and an inserted unit that share a Ziffer number', () => {
    // A Regierungsvorlage can drop the draft's Z 5 and introduce its own.
    // Keyed on article|id alone the two collide and one § heading appears on
    // the other change — which is exactly what happened on SNG 8/ME.
    const removed = { article: 'Änderung des SNG', id: 'Z5', change: 'removed' as const }
    const inserted = { article: 'Änderung des SNG', id: 'Z5', change: 'inserted' as const }
    expect(unitKey(removed)).not.toBe(unitKey(inserted))
  })

  it('is stable and treats a missing article as empty', () => {
    const unit = { article: null, id: '§5', change: 'changed' as const }
    expect(unitKey(unit)).toBe('|§5|changed')
    expect(unitKey(unit)).toBe(unitKey({ ...unit }))
  })
})

describe('stammnormOf', () => {
  it('reads the Stammnorm, not the most recent amendment', () => {
    expect(stammnormOf('Das Bundesgesetz X, BGBl. I Nr. 100/2000, zuletzt geändert durch BGBl. I Nr. 50/2020, wird wie folgt geändert:'))
      .toEqual({ organ: 'BGBl. I Nr.', nummer: '100/2000' })
  })

  // The UGB's Stammnorm is "dRGBl. S. 219/1897". Taking the first BGBl in the
  // whole clause returned the last amendment and resolved to another law.
  it('refuses when the law was not promulgated in a BGBl at all', () => {
    expect(stammnormOf('Das Unternehmensgesetzbuch - UGB, dRGBl. S. 219/1897, zuletzt geändert durch das Bundesgesetz BGBl. I Nr. 6/2026, wird wie folgt geändert:'))
      .toBeNull()
  })
})

describe('draftArticles', () => {
  it('lists a package’s Artikel in printed order with number, title and Stammnorm', () => {
    const xml = doc(
      article('Artikel 1', 'Änderung des Aktiengesetzes', 'Das Aktiengesetz, BGBl. Nr. 98/1965, wird wie folgt geändert:', ['§ 1 lautet:']) +
      article('Artikel 2', 'Änderung des GmbH-Gesetzes', 'Das GmbH-Gesetz, RGBl. Nr. 58/1906, wird wie folgt geändert:', ['§ 2 lautet:']),
    )
    const articles = draftArticles(parseRisXml(xml))
    expect(articles.map((a) => [a.index, a.numeral, a.title, a.amends, a.bgbl?.nummer ?? null])).toEqual([
      [0, '1', 'Änderung des Aktiengesetzes', true, '98/1965'],
      // A Stammnorm that is no BGBl leaves nothing to resolve — and the
      // Artikel still amends a law, which `amends` says and `bgbl` cannot.
      [1, '2', 'Änderung des GmbH-Gesetzes', true, null],
    ])
  })

  it('keys an Artikel exactly as promulgationByArticle does', () => {
    const xml = doc(article('Artikel 3', 'Änderung des Bankwesengesetzes', 'Das Bankwesengesetz, BGBl. Nr. 532/1993, wird wie folgt geändert:', ['§ 1 lautet:']))
    const [first] = draftArticles(parseRisXml(xml))
    expect(first!.key).toBe('Änderung des Bankwesengesetzes')
    expect([...promulgationByArticle(parseRisXml(xml)).keys()]).toEqual([first!.key])
  })

  // A draft that creates a law has no Promulgationsklausel; one that amends
  // several has one per Artikel. Telling them apart is what decides whether an
  // unmarked annex may be given to a single law.
  it('marks an Artikel that creates law rather than changing it', () => {
    const xml = doc(
      `<ueberschrift typ="g1">Artikel 1</ueberschrift><ueberschrift typ="g2">Bundesgesetz über die Bundesstaatsanwaltschaft</ueberschrift><absatz typ="abs">(1) Diese Behörde wird errichtet.</absatz>` +
      article('Artikel 2', 'Änderung des Strafgesetzbuches', 'Das Strafgesetzbuch, BGBl. Nr. 60/1974, wird wie folgt geändert:', ['§ 1 lautet:']),
    )
    const articles = draftArticles(parseRisXml(xml))
    expect(articles.map((a) => a.amends)).toEqual([false, true])
  })

  // "(Verfassungsbestimmung)" stands where the law's name would and is not
  // one. The key keeps it — `segmentUnits` does — but nothing may be matched
  // against it, because the annex never prints it as a law title.
  it('does not read a qualifier as the law’s name', () => {
    const xml = doc(
      `<ueberschrift typ="g1">Artikel 1</ueberschrift><ueberschrift typ="g2">(Verfassungsbestimmung)</ueberschrift>` +
      `<ueberschrift typ="g2">Änderung des Verfassungsgerichtshofgesetzes 1953</ueberschrift>` +
      `<absatz typ="promkleinlsatz">Das VfGG, BGBl. Nr. 85/1953, wird wie folgt geändert:</absatz>`,
    )
    const [first] = draftArticles(parseRisXml(xml))
    expect(first!.key).toBe('(Verfassungsbestimmung)')
    expect(first!.title).toBe('Änderung des Verfassungsgerichtshofgesetzes 1953')
  })

  // A package may number its Artikel in Roman numerals. Reading only Arabic
  // ones filed those headings as section titles, so the draft appeared to
  // have no Artikel at all — and an annex divided into Artikel that the draft
  // does not know is refused, which is the check indicting the draft parser.
  it('reads Roman-numbered Artikel', () => {
    const xml = doc(
      article('Artikel I', 'Änderung des Aktiengesetzes', 'Das Aktiengesetz, BGBl. Nr. 98/1965, wird wie folgt geändert:', ['§ 1 lautet:']) +
      article('Artikel II', 'Änderung des Bankwesengesetzes', 'Das BWG, BGBl. Nr. 532/1993, wird wie folgt geändert:', ['§ 2 lautet:']),
    )
    expect(draftArticles(parseRisXml(xml)).map((a) => a.numeral)).toEqual(['I', 'II'])
  })

  it('gives a draft without Artikel one entry, so callers see one shape', () => {
    const xml = doc(
      `<ueberschrift typ="titel">Bundesgesetz, mit dem das Bäderhygienegesetz geändert wird</ueberschrift>` +
      `<absatz typ="promkleinlsatz">Das Bäderhygienegesetz, BGBl. Nr. 254/1976, wird wie folgt geändert:</absatz>`,
    )
    expect(draftArticles(parseRisXml(xml))).toEqual([
      { index: 0, number: null, numeral: null, title: 'Bundesgesetz, mit dem das Bäderhygienegesetz geändert wird', key: 'Bundesgesetz, mit dem das Bäderhygienegesetz geändert wird', amends: true, bgbl: { organ: 'BGBl. Nr.', nummer: '254/1976' } },
    ])
  })
})

describe('lawNameScore', () => {
  // One BGBl regularly creates several laws: 532/1993 the Bankwesengesetz and
  // the Bausparkassengesetz, 663/1994 the Umsatzsteuergesetz and its Anhang.
  // The amending Artikel's own title is what separates them.
  it('separates the laws one BGBl created', () => {
    expect(lawNameScore('Änderung des Bankwesengesetzes', 'Bankwesengesetz')).toBe(1)
    expect(lawNameScore('Änderung des Bankwesengesetzes', 'Bausparkassengesetz')).toBe(0)
    expect(lawNameScore('Änderung des Umsatzsteuergesetzes 1994', 'Umsatzsteuergesetz 1994')).toBeGreaterThan(
      lawNameScore('Änderung des Umsatzsteuergesetzes 1994', 'Umsatzsteuergesetz 1994 – Anhang (Binnenmarkt)'),
    )
  })
})
