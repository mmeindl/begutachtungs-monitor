import { describe, expect, it } from 'vitest'
import { articleBlocks, draftArticles, isAmendmentClause, promulgationByArticle } from '../server/utils/lawtext/draftArticles'
import { parseRisXml } from '../server/utils/lawtext/risXml'

/** A package Artikel with its Promulgationsklausel, in RIS's element vocabulary. */
function article(nr: string, title: string, clause: string, instructions: string[]): string {
  return (
    `<ueberschrift typ="g1">${nr}</ueberschrift><ueberschrift typ="g2">${title}</ueberschrift>` +
    `<absatz typ="promkleinlsatz">${clause}</absatz>` +
    instructions.map((t, i) => `<absatz typ="novao1">${i + 1}. ${t}</absatz>`).join('')
  )
}
const doc = (body: string) => `<risdok><nutzdaten><abschnitt>${body}</abschnitt></nutzdaten></risdok>`

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

  // „wird in seinem Artikel 1 wie folgt geändert" — the restriction stands
  // between the verb and the formula, and it does so in the laws organised
  // into Artikel. Without it the whole Artikel fell out of „Geltendes
  // Recht", out of the § names and out of the reading version's denominator
  // (60/ME, 19.09.2026).
  it('reads a clause whose verb and formula are separated', () => {
    const blocks = parseRisXml(
      doc(
        article('Artikel 1', 'Änderung des Eltern-Kind-Pass-Gesetzes', 'Das Eltern-Kind-Pass-Gesetz, BGBl. I Nr. 82/2023, wird in seinem Artikel 1 wie folgt geändert:', ['1. In § 2 Abs. 2 wird das Wort "A" durch das Wort "B" ersetzt.']),
      ),
    )
    expect(promulgationByArticle(blocks).get('Änderung des Eltern-Kind-Pass-Gesetzes')).toEqual({ organ: 'BGBl. I Nr.', nummer: '82/2023' })
  })

  // The counter-check that keeps the expression tight. The gap between verb
  // and formula must not jump a sentence boundary: otherwise a new law that
  // cites another one becomes a Novelle of it (101/ME).
  it('keeps the clause test inside one sentence', () => {
    expect(isAmendmentClause('Das Eltern-Kind-Pass-Gesetz, BGBl. I Nr. 82/2023, wird in seinem Artikel 1 wie folgt geändert:')).toBe(true)
    expect(isAmendmentClause('Das Tabakgesetz, BGBl. Nr. 431/1995, wird wie folgt geändert:')).toBe(true)
    expect(isAmendmentClause('Das Tabakgesetz, BGBl. Nr. 431/1995, ist sinngemäß anzuwenden.')).toBe(false)
    expect(isAmendmentClause('Das Gesetz wird kundgemacht. Die Anlage lautet wie folgt geändert')).toBe(false)
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

describe('draftArticles', () => {
  it('lists a package’s Artikel in printed order with number, title and Stammnorm', () => {
    const xml = doc(
      article('Artikel 1', 'Änderung des Aktiengesetzes', 'Das Aktiengesetz, BGBl. Nr. 98/1965, wird wie folgt geändert:', ['§ 1 lautet:']) +
      article('Artikel 2', 'Änderung des GmbH-Gesetzes', 'Das GmbH-Gesetz, RGBl. Nr. 58/1906, wird wie folgt geändert:', ['§ 2 lautet:']),
    )
    const articles = draftArticles(parseRisXml(xml))
    expect(articles.map((a) => [a.index, a.numeral, a.title, a.amends, a.bgbl?.nummer ?? null])).toEqual([
      [0, '1', 'Änderung des Aktiengesetzes', true, '98/1965'],
      // The GmbH-Gesetz is RGBl. Nr. 58/1906. Until 19.09.2026 `null` stood
      // here, on the grounds that a Stammnorm without a BGBl resolves
      // nothing; RIS carries it in the same field pair and resolves it fine.
      [1, '2', 'Änderung des GmbH-Gesetzes', true, '58/1906'],
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

  // An instruction that rewrites an Anlage prints the heading it installs, and
  // RIS tags it `ueberschrift typ="anlage"` — the same element a law title
  // arrives in. Read as a name it renamed the law half way through the draft,
  // and the annex's rows then carried a key the instructions above them do not
  // (UH-Statistik- und Bildungsdokumentationsverordnung, §§ 18, 35 and 37).
  it('does not let a quoted Anlage heading rename the Artikel’s law', () => {
    const xml = doc(
      `<ueberschrift typ="g1">Artikel 1</ueberschrift>` +
      `<absatz typ="promkleinlsatz">Die Universitäts- und Hochschulstatistikverordnung, BGBl. II Nr. 301/2022, wird wie folgt geändert:</absatz>` +
      `<absatz typ="novao1">1. § 16 Abs. 1 lautet:</absatz>` +
      `<absatz typ="abs">„(1) Neuer Text.“</absatz>` +
      `<absatz typ="novao1">2. Anlage 1 lautet:</absatz>` +
      `<ueberschrift typ="anlage">„Anlage 1 zu § 6 Anhang zum Diplom (Diploma Supplement)</ueberschrift>` +
      `<absatz typ="novao1">3. Anlage 2 lautet:</absatz>`,
    )
    const articles = draftArticles(parseRisXml(xml))
    expect(articles.map((a) => [a.number, a.key])).toEqual([['Artikel 1', 'Artikel 1']])
    expect(articles[0]!.title).toBeNull()
  })

  // The same rule must not swallow a real boundary: a second Artikel is a
  // second law however deep into the draft it stands.
  it('still opens a second Artikel after the first one’s instructions', () => {
    const xml = doc(
      article('Artikel 1', 'Änderung der Wasserstraßen-Verkehrsordnung', 'Die Wasserstraßen-Verkehrsordnung, BGBl. II Nr. 289/2011, wird wie folgt geändert:', ['§ 1.01 lautet:']) +
      `<ueberschrift typ="g2">„Schallzeichen, Sprechfunk, Informations- und Navigationsgeräte“</ueberschrift>` +
      article('Artikel 2', 'Änderung der Seen- und Fluss-Verkehrsordnung', 'Die Seen- und Fluss-Verkehrsordnung, BGBl. II Nr. 42/2005, wird wie folgt geändert:', ['§ 3 lautet:']),
    )
    const articles = draftArticles(parseRisXml(xml))
    expect(articles.map((a) => [a.number, a.key, a.bgbl?.nummer ?? null])).toEqual([
      ['Artikel 1', 'Änderung der Wasserstraßen-Verkehrsordnung', '289/2011'],
      ['Artikel 2', 'Änderung der Seen- und Fluss-Verkehrsordnung', '42/2005'],
    ])
  })

  // A Verordnung that re-issues a law in full prints its title inside the
  // instruction. 15 of the 405 title blocks in GP XXVIII are of that kind.
  it('does not let a quoted law title rename a draft without Artikel', () => {
    const xml = doc(
      `<ueberschrift typ="titel">Verordnung des Bundesministers für Finanzen, mit der die Eigenstrombefreiungsverordnung geändert wird</ueberschrift>` +
      `<absatz typ="promkleinlsatz">Die Eigenstrombefreiungsverordnung, BGBl. II Nr. 31/2022, wird wie folgt geändert:</absatz>` +
      `<absatz typ="novao1">1. Der Titel lautet:</absatz>` +
      `<ueberschrift typ="titel">„Verordnung des Bundesministers für Finanzen betreffend Befreiungen von der Elektrizitätsabgabe“</ueberschrift>`,
    )
    const [only] = draftArticles(parseRisXml(xml))
    expect(only!.key).toBe('Verordnung des Bundesministers für Finanzen, mit der die Eigenstrombefreiungsverordnung geändert wird')
  })

  // Lang- and Kurztitel both stand above the first instruction, so the later
  // one still wins — the rule closes the window, it does not move it.
  it('still lets the last title before the first instruction win', () => {
    const xml = doc(
      `<ueberschrift typ="titel">Bundesgesetz, mit dem das Bäderhygienegesetz geändert wird</ueberschrift>` +
      `<ueberschrift typ="titel">Bäderhygienegesetz-Novelle 2026</ueberschrift>` +
      `<absatz typ="promkleinlsatz">Das Bäderhygienegesetz, BGBl. Nr. 254/1976, wird wie folgt geändert:</absatz>`,
    )
    expect(draftArticles(parseRisXml(xml))[0]!.key).toBe('Bäderhygienegesetz-Novelle 2026')
  })

  // A Stammgesetz prints its Anlage at the end, under a heading of exactly the
  // same RIS type. It is one law, and the heading is not a second one.
  it('keeps a Stammgesetz with a trailing Anlage as one law', () => {
    const xml = doc(
      `<ueberschrift typ="titel">Bundesgesetz über etwas Neues</ueberschrift>` +
      `<absatz typ="abs"><gldsym>§ 1.</gldsym> Dieses Gesetz gilt.</absatz>` +
      `<ueberschrift typ="anlage">Anlage 1 zu § 1</ueberschrift>` +
      `<absatz typ="abs">Ein Formular.</absatz>`,
    )
    const articles = draftArticles(parseRisXml(xml))
    expect(articles.map((a) => a.key)).toEqual(['Bundesgesetz über etwas Neues'])
  })

  // `segmentUnits` keys its units `articleTitle ?? articleNumber`; an Artikel
  // that prints no law name has to answer to its number, or the annex's rows
  // join onto no instruction. Two nameless Artikel used to share the key
  // `null`, which merged two laws into one entry.
  it('falls back to the Artikel number where the draft prints no law name', () => {
    const xml = doc(
      `<ueberschrift typ="g1">Artikel 1</ueberschrift>` +
      `<absatz typ="promkleinlsatz">Die Verbrauchsabgabenverordnung, BGBl. II Nr. 11/2020, wird wie folgt geändert:</absatz>` +
      `<absatz typ="novao1">1. § 1 lautet:</absatz>` +
      `<ueberschrift typ="g1">Artikel 2</ueberschrift>` +
      `<absatz typ="promkleinlsatz">Die LF-Verbrauchsabgabenverordnung, BGBl. II Nr. 12/2020, wird wie folgt geändert:</absatz>` +
      `<absatz typ="novao1">1. § 2 lautet:</absatz>`,
    )
    const articles = draftArticles(parseRisXml(xml))
    expect(articles.map((a) => [a.key, a.title])).toEqual([
      ['Artikel 1', null],
      ['Artikel 2', null],
    ])
    // …and the two laws stay apart in the promulgation map, which keys on it.
    expect([...promulgationByArticle(parseRisXml(xml)).keys()]).toEqual(['Artikel 1', 'Artikel 2'])
  })
})

describe('articleBlocks', () => {
  const xml = doc(
    '<ueberschrift typ="titel">Bundesgesetz, mit dem das Glücksspielgesetz und das Tabakgesetz geändert werden</ueberschrift>' +
    article('Artikel 1', 'Änderung des Glücksspielgesetzes', 'Das Glücksspielgesetz, BGBl. Nr. 620/1989, wird wie folgt geändert:', ['§ 5 lautet:', '§ 6 entfällt.']) +
    article('Artikel 2', 'Änderung des Tabakgesetzes', 'Das Tabakgesetz, BGBl. Nr. 431/1995, wird wie folgt geändert:', ['§ 5 Abs. 1 lautet:']),
  )

  it('gives every Artikel the text it owns, and keeps the printed order', () => {
    const parts = articleBlocks(parseRisXml(xml)).filter((p) => p.article.amends)
    // Index 0 is the package's own title block, exactly as `draftArticles`
    // counts it — the annex joins on this numbering, so it must not shift.
    expect(parts.map((p) => [p.article.index, p.article.number, p.article.title])).toEqual([
      [1, 'Artikel 1', 'Änderung des Glücksspielgesetzes'],
      [2, 'Artikel 2', 'Änderung des Tabakgesetzes'],
    ])
    // § 5 occurs in both laws — which is the whole reason the split exists.
    expect(parts.map((p) => p.blocks.filter((b) => b.kind === 'novao').map((b) => b.text))).toEqual([
      ['1. § 5 lautet:', '2. § 6 entfällt.'],
      ['1. § 5 Abs. 1 lautet:'],
    ])
  })

  it('names the same laws as draftArticles, from the same rule', () => {
    const blocks = parseRisXml(xml)
    expect(articleBlocks(blocks).map((p) => p.article)).toEqual(draftArticles(blocks))
  })

  it('keeps the package title as its own entry, amending nothing', () => {
    const parts = articleBlocks(parseRisXml(xml))
    expect(parts).toHaveLength(3)
    expect(parts[0]!.article.amends).toBe(false)
    expect(parts[0]!.article.number).toBeNull()
    // It owns the title block and nothing else: no instruction may reach a
    // caller through the entry that names no law.
    expect(parts[0]!.blocks.some((b) => b.kind === 'novao')).toBe(false)
  })

  it('treats a Novelle without Artikel as one entry over the whole document', () => {
    const single = doc(
      '<ueberschrift typ="titel">Bundesgesetz, mit dem das Tabakgesetz geändert wird</ueberschrift>' +
      '<absatz typ="promkleinlsatz">Das Tabakgesetz, BGBl. Nr. 431/1995, wird wie folgt geändert:</absatz>' +
      '<absatz typ="novao1">1. § 5 lautet:</absatz>',
    )
    const parts = articleBlocks(parseRisXml(single))
    expect(parts).toHaveLength(1)
    expect(parts[0]!.article.number).toBeNull()
    expect(parts[0]!.article.amends).toBe(true)
    expect(parts[0]!.blocks).toEqual(parseRisXml(single))
  })
})
