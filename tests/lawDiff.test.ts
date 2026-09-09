import { describe, expect, it } from 'vitest'
import { alignUnits, diffLawPackage, diffLawUnits, diffTokens, isEditorialChange, lawNameTokens, pairArticles, summarizeDiff } from '../server/utils/lawDiff'
import { normalizeGld, novaoHeading, parseLawUnits, parseLawUnitsFromRis, parseParliamentHtml, parseRisXml } from '../server/utils/lawText'
import { readFileSync } from 'node:fs'

/** Minimal Word-filtered Parliament HTML in the legistic template classes. */
function law(parts: { heading?: string; gld: string; abs: string[]; ziff?: string[] }[], opts: { article?: string; title?: string } = {}) {
  const head = opts.article
    ? `<p class=41UeberschrG1>Artikel&nbsp;1</p><p class=43UeberschrG2>${opts.article}</p>`
    : `<p class=11Titel>${opts.title ?? 'Bundesgesetz &uuml;ber X'}</p>`
  const toc = parts.map((p) => `<p class=32InhaltEintrag>${p.gld} ${p.heading ?? ''}</p>`).join('')
  const body = parts
    .map((p) => {
      const h = p.heading ? `<p class=45UeberschrPara>${p.heading}</p>` : ''
      const [first, ...rest] = p.abs
      return (
        h +
        `<p class=51Abs><span class=991GldSymbol>${p.gld}</span> ${first}</p>` +
        rest.map((a) => `<p class=51Abs>${a}</p>`).join('') +
        (p.ziff ?? []).map((z) => `<p class=52Aufzaehle1Ziffer>${z}</p>`).join('')
      )
    })
    .join('')
  return `<html><body>${head}${toc}${body}<p class='MsoNormal'>&nbsp;</p></body></html>`
}

describe('parseParliamentHtml', () => {
  it('reads classes, the Gliederungssymbol and decodes entities', () => {
    const blocks = parseParliamentHtml(law([{ heading: 'Anwendungsbereich', gld: '&sect;&nbsp;1.', abs: ['(1) Dieses Gesetz gilt f&uuml;r alle.'] }]))
    const abs = blocks.find((b) => b.kind === 'abs')!
    expect(abs.gld).toBe('§ 1.')
    expect(abs.text).toBe('(1) Dieses Gesetz gilt für alle.')
    expect(blocks.find((b) => b.kind === 'para_head')!.text).toBe('Anwendungsbereich')
    expect(blocks.filter((b) => b.kind === 'toc')).toHaveLength(1)
    expect(blocks.filter((b) => b.cls === 'MsoNormal')).toHaveLength(0)
  })

  it('normalises Gliederungssymbole', () => {
    expect(normalizeGld('§ 5.')).toBe('§5')
    expect(normalizeGld('Artikel 3.')).toBe('Art.3')
    expect(normalizeGld('§ 12a.')).toBe('§12a')
  })
})

describe('parseLawUnits', () => {
  it('yields one unit per § with heading, Absätze and Ziffern', () => {
    const units = parseLawUnits(
      law(
        [
          { heading: 'Ziel', gld: '&sect;&nbsp;1.', abs: ['Ziel ist A.'] },
          { heading: 'Begriffe', gld: '&sect;&nbsp;2.', abs: ['(1) Es gilt:', '(2) Weiter gilt:'], ziff: ['1. Eins;', '2. Zwei.'] },
        ],
        { article: 'Bundesgesetz &uuml;ber Y' },
      ),
    )
    expect(units.map((u) => u.id)).toEqual(['§1', '§2'])
    expect(units[0]!.article).toBe('Bundesgesetz über Y')
    expect(units[1]!.heading).toBe('Begriffe')
    expect(units[1]!.text).toBe('(1) Es gilt: (2) Weiter gilt: 1. Eins; 2. Zwei.')
  })

  it('keeps a Novellierungsanordnung with its quoted § as one unit', () => {
    const html = `<html><body><p class=41UeberschrG1>Artikel&nbsp;2</p><p class=43UeberschrG2>&Auml;nderung des Z-Gesetzes</p>
      <p class=21NovAo1>1. &sect;&nbsp;3 lautet:</p>
      <p class=51Abs><span class=991GldSymbol>&bdquo;&sect;&nbsp;3.</span> Neuer Text.&ldquo;</p>
      <p class=21NovAo1>2. In &sect;&nbsp;7 entf&auml;llt Abs.&nbsp;2.</p></body></html>`
    const units = parseLawUnits(html)
    expect(units.map((u) => u.id)).toEqual(['Z1', 'Z2'])
    expect(units[0]!.article).toBe('Änderung des Z-Gesetzes')
    expect(units[0]!.articleNumber).toBe('Artikel 2')
    expect(units[0]!.text).toContain('Neuer Text.')
    expect(units.map((u) => u.heading)).toEqual(['§ 3 lautet', 'In § 7 entfällt Abs. 2.'])
  })

  it('derives a Ziffer heading from the instruction line', () => {
    expect(novaoHeading('2. § 6 Abs. 1 Z 9 lautet: „9. Umsätze …“')).toBe('§ 6 Abs. 1 Z 9 lautet')
    expect(novaoHeading('14. Nach § 11 wird folgender § 11a samt Überschrift eingefügt:')).toBe('Nach § 11 wird folgender § 11a samt Überschrift eingefügt')
    expect(novaoHeading(`3. ${'Wort '.repeat(40)}`).length).toBeLessThanOrEqual(104)
  })
})

describe('a Novellierungsanordnung whose number is not in the strict form', () => {
  // Each form below is printed by a real GP-XXVIII draft. A number the
  // parser does not recognise does not merely lose its instruction: the
  // line becomes tail text of the instruction above it, so two units carry
  // text that belongs to neither.
  const novelle = (...lines: string[]) =>
    '<html><body><p class=41UeberschrG1>Artikel&nbsp;1</p><p class=43UeberschrG2>&Auml;nderung des X-Gesetzes</p>' +
    lines.map((l) => `<p class=21NovAo1>${l}</p>`).join('') +
    '</body></html>'

  it('reads the number when the separator is missing or unusual', () => {
    const units = parseLawUnits(
      novelle(
        '1. &sect;&nbsp;1 lautet:', // the strict form
        '2.&sect;&nbsp;30 Abs.&nbsp;3 lautet:', // 126/ME, no space
        '13 &sect;&nbsp;178 Abs.&nbsp;3 lautet:', // 126/ME, no period
        '4 . Dem &sect;&nbsp;67 werden folgende Abs. angef&uuml;gt:', // 7/ME, space before it
        '222- Im Schlussteil des &sect;&nbsp;27 Abs.&nbsp;1 entf&auml;llt die Wortfolge:', // 74/ME, a dash
      ),
    )
    expect(units.map((u) => u.id)).toEqual(['Z1', 'Z2', 'Z13', 'Z4', 'Z222'])
    // The number never reaches the compared text or the heading.
    expect(units[1]!.heading).toBe('§ 30 Abs. 3 lautet')
    expect(units[1]!.text).toBe('§ 30 Abs. 3 lautet:')
  })

  it('leaves a leading number that is an amount, not an instruction', () => {
    const units = parseLawUnits(novelle('1. &sect;&nbsp;2 lautet:', '20 000 Euro sind zu entrichten.', '2,5 Millionen Euro entfallen.'))
    expect(units.map((u) => u.id)).toEqual(['Z1'])
    expect(units[0]!.text).toContain('20 000 Euro')
  })
})

describe('a Novellierungsanordnung with no number at all', () => {
  // A law amended in a single respect carries no Ziffer — there is nothing
  // to count. Two GP-XXVIII drafts (110/ME, 59/ME) are one such line and
  // nothing else; both segmented to zero units, so their comparison was
  // refused outright. The promulgation clause above the line is what tells
  // it apart from the lines that only look alike.
  const ris = (...blocks: string[]) =>
    `<dokument><ueberschrift typ="titel">Bundesgesetz, mit dem das X-Gesetz ge&auml;ndert wird</ueberschrift>${blocks.join('')}</dokument>`
  const clause = '<absatz typ="promkleinlsatz">Das X-Gesetz, BGBl. I Nr. 1/2000, wird wie folgt ge&auml;ndert:</absatz>'

  it('opens a unit for the first instruction under the promulgation clause', () => {
    const units = parseLawUnitsFromRis(
      ris(clause, '<absatz typ="novao1">Dem &sect; 143 werden folgende Abs. 108 und 109 angef&uuml;gt:</absatz>', '<absatz typ="abs">"(108) Neuer Text."</absatz>'),
    )
    expect(units.map((u) => u.id)).toEqual(['Z1'])
    expect(units[0]!.heading).toBe('Dem § 143 werden folgende Abs. 108 und 109 angefügt')
    expect(units[0]!.text).toContain('(108) Neuer Text.')
  })

  it('refuses a line that continues the instruction above it', () => {
    // 123/ME: "Im Inhaltsverzeichnis wird der Eintrag …" / "durch folgenden
    // Eintrag ersetzt:" — one instruction over two blocks, no clause above.
    const units = parseLawUnitsFromRis(
      ris(clause, '<absatz typ="novao1">1. Im Inhaltsverzeichnis wird der Eintrag zu &sect; 5</absatz>', '<absatz typ="novao1">durch folgenden Eintrag ersetzt:</absatz>'),
    )
    expect(units.map((u) => u.id)).toEqual(['Z1'])
    expect(units[0]!.text).toContain('durch folgenden Eintrag ersetzt:')
  })

  it('refuses the promulgation clause where RIS mistags it as an instruction', () => {
    // 92/ME. The clause names the law it opens; read as an instruction it
    // would put the whole Novelle under a unit called Z1.
    const units = parseLawUnitsFromRis(
      ris('<absatz typ="novao1">Das LWA-G, BGBl. I Nr. 93/2022, wird wie folgt ge&auml;ndert:</absatz>', '<absatz typ="novao1">1. &sect; 2 lautet:</absatz>'),
    )
    expect(units.map((u) => u.id)).toEqual(['Z1'])
    expect(units[0]!.heading).toBe('§ 2 lautet')
  })

  it('refuses a litera sub-instruction', () => {
    const units = parseLawUnitsFromRis(
      ris(clause, '<absatz typ="novao1">1. &sect; 2 wird wie folgt ge&auml;ndert:</absatz>', '<absatz typ="novao1">a) Abs. 1 lautet:</absatz>', '<absatz typ="novao2">b) Abs. 2 entf&auml;llt.</absatz>'),
    )
    expect(units.map((u) => u.id)).toEqual(['Z1'])
    expect(units[0]!.text).toContain('a) Abs. 1 lautet:')
    expect(units[0]!.text).toContain('b) Abs. 2 entfällt.')
  })
})

describe('an instruction RIS did not tag as one', () => {
  // RIS sometimes prints an instruction as plain text (`absatz typ="satz"`).
  // Nothing then recognises it, and it becomes tail text of the instruction
  // above — four §§ of 125/ME (Glücksspielgesetz §§ 29, 31, 42, 46) were
  // compared against the wrong text this way. Promotion needs two
  // independent signals: the next number in sequence, and standing outside
  // any quoted payload.
  const ris = (...blocks: string[]) =>
    `<dokument><ueberschrift typ="titel">Bundesgesetz</ueberschrift><absatz typ="promkleinlsatz">Das X-Gesetz, BGBl. I Nr. 1/2000, wird wie folgt ge&auml;ndert:</absatz>${blocks.join('')}</dokument>`

  it('promotes an Absatz that continues the number sequence outside a payload', () => {
    const units = parseLawUnitsFromRis(
      ris('<absatz typ="novao1">20. &sect; 28 lautet:</absatz>', '<absatz typ="satz">21. In &sect; 29 Abs. 3 entf&auml;llt die Wortfolge.</absatz>'),
    )
    expect(units.map((u) => u.id)).toEqual(['Z20', 'Z21'])
    expect(units[1]!.heading).toBe('In § 29 Abs. 3 entfällt die Wortfolge.')
  })

  it('leaves a numbered line inside a quoted payload alone', () => {
    // 38/ME: a definition list inside the new § text — "27. \u0022EU-Rezept\u0022: …".
    const units = parseLawUnitsFromRis(
      ris(
        '<absatz typ="novao1">8. &sect; 3 lautet:</absatz>',
        '<absatz typ="abs">"&sect; 3. Im Sinne dieses Gesetzes gilt:</absatz>',
        '<absatz typ="satz">9. "EU-Rezept": eine Anwendung, die verwendet wird."</absatz>',
      ),
    )
    expect(units.map((u) => u.id)).toEqual(['Z8'])
    expect(units[0]!.text).toContain('"EU-Rezept"')
  })

  it('leaves a numbered line that breaks the sequence alone', () => {
    const units = parseLawUnitsFromRis(
      ris('<absatz typ="novao1">8. &sect; 3 lautet:</absatz>', '<absatz typ="satz">1. &sect; 2 Abs. 10 in der Fassung des Bundesgesetzes tritt in Kraft.</absatz>'),
    )
    expect(units.map((u) => u.id)).toEqual(['Z8'])
  })

  it('never promotes a Ziffer of a quoted list', () => {
    // 27/ME: three list items of Mineralrohstoffgesetz § 156 are numbered
    // from 1 like instructions and satisfy both signals by coincidence.
    const units = parseLawUnitsFromRis(
      ris('<absatz typ="novao1">1. &sect; 156 Abs. 4 lautet:</absatz>', '<listelem>2. Angaben zu Bergbaugebieten;</listelem>', '<listelem>3. Angaben zu Grundst&uuml;cken.</listelem>'),
    )
    expect(units.map((u) => u.id)).toEqual(['Z1'])
    expect(units[0]!.text).toContain('Angaben zu Bergbaugebieten;')
  })
})

describe('editorial vs substantive', () => {
  const seg = (a: string, b: string) => diffTokens(a, b).segments
  it('shifted cross-references and date formats are editorial', () => {
    expect(isEditorialChange(seg('Die Behörde gemäß § 15 Abs. 2 entscheidet.', 'Die Behörde gemäß § 16 Abs. 2 entscheidet.'))).toBe(true)
    expect(isEditorialChange(seg('in der Fassung vom 26.6.2024', 'in der Fassung vom 26.06.2024'))).toBe(true)
    expect(isEditorialChange(seg('nach den §§ 1 und 2', 'nach den §§ 1 bis 3'))).toBe(true)
    expect(isEditorialChange(seg('gilt Art. 3 lit. a;', 'gilt Art. 3 lit. b,'))).toBe(true)
  })
  it('a bare number is editorial only next to a citation word', () => {
    expect(isEditorialChange(seg('nach Abs. 6 gilt', 'nach Abs. 4 gilt'))).toBe(true)
    expect(isEditorialChange(seg('innerhalb von 6 Wochen', 'innerhalb von 4 Wochen'))).toBe(false)
    expect(isEditorialChange(seg('spätestens 2026 in Kraft', 'spätestens 2027 in Kraft'))).toBe(false)
  })
  it('one ordinary word is substantive, however long the paragraph', () => {
    const long = 'Wort '.repeat(150)
    expect(isEditorialChange(seg(`${long}Die Frist beträgt sechs Wochen.`, `${long}Die Frist beträgt acht Wochen.`))).toBe(false)
    expect(isEditorialChange(seg('Anlagen und Leitungen', 'Anlagen oder Leitungen'))).toBe(false)
    expect(isEditorialChange(seg('den §§ 1 bis 10', 'diesem Bundesgesetz mit Ausnahme der in'))).toBe(false)
  })
  it('a placeholder the Regierungsvorlage fills in is editorial', () => {
    expect(isEditorialChange(seg('Dem § 28 wird folgender Abs. XX angefügt', 'Dem § 28 wird folgender Abs. 69 angefügt'))).toBe(true)
    expect(isEditorialChange(seg('angefügt: "(xx) § 10 tritt in Kraft."', 'angefügt: "(69) § 10 tritt in Kraft."'))).toBe(true)
    expect(isEditorialChange(seg('tritt mit 1. Jänner 20xx in Kraft', 'tritt mit 1. Jänner 2026 in Kraft'))).toBe(true)
    // A lone X is a genuine blank, not a placeholder: naming the number is a decision.
    expect(isEditorialChange(seg('innerhalb von X Wochen', 'innerhalb von 6 Wochen'))).toBe(false)
  })
  it('articles and the case of a Novellierungsanweisung are editorial, logical connectives are not', () => {
    expect(isEditorialChange(seg('In § 28 wird folgender Abs. 69 angefügt', 'Dem § 28 wird folgender Abs. 69 angefügt'))).toBe(true)
    expect(isEditorialChange(seg('Nach Anlage 2 wird Anlage 3 eingefügt', 'Nach der Anlage 2 wird Anlage 3 eingefügt'))).toBe(true)
    expect(isEditorialChange(seg('die §§ 1 und 2 gelten', 'die §§ 1 oder 2 gelten'))).toBe(false)
    expect(isEditorialChange(seg('Nach § 5 wird § 5a eingefügt', 'Vor § 5 wird § 5a eingefügt'))).toBe(false)
  })
  it('a reworded Novellierungsanweisung stays substantive (88/ME, Anlage 3)', () => {
    expect(
      isEditorialChange(
        seg('Nach Anlage 2 wird folgende Anlage 3 samt Überschrift angefügt:', 'Nach der Anlage 2 wird folgende Anlage 3 eingefügt:'),
      ),
    ).toBe(false)
  })
  it('is false without segments', () => {
    expect(isEditorialChange(null)).toBe(false)
    expect(isEditorialChange([{ type: 'equal', text: 'x' }])).toBe(false)
  })
})

describe('article pairing across differing titles', () => {
  it('names the same law from draft and bill titles', () => {
    expect(lawNameTokens('Änderung des Umsatzsteuergesetzes 1994')).toEqual(new Set(['umsatzsteuergesetz', '1994']))
    expect(lawNameTokens('Bundesgesetz, mit dem das Umsatzsteuergesetz 1994 geändert wird')).toEqual(new Set(['umsatzsteuergesetz', '1994']))
  })

  const novelle = (title: string, ziffern: string[]) =>
    `<html><body><p class=41UeberschrG1>Artikel&nbsp;1</p><p class=43UeberschrG2>${title}</p>` +
    ziffern.map((z) => `<p class=21NovAo1>${z}</p>`).join('') +
    `</body></html>`
  const me = parseLawUnits(
    novelle('&Auml;nderung des Umsatzsteuergesetzes 1994', [
      '1. In &sect;&nbsp;3 Abs.&nbsp;1 wird das Wort &bdquo;sechs&ldquo; durch &bdquo;acht&ldquo; ersetzt.',
      '2. &sect;&nbsp;6 Abs.&nbsp;1 Z&nbsp;9 lautet: &bdquo;alter Text&ldquo;',
      '3. &sect;&nbsp;28 Abs.&nbsp;60 lautet: &bdquo;Inkrafttreten alt&ldquo;',
    ]),
  )
  const rv = parseLawUnits(
    novelle('Bundesgesetz, mit dem das Umsatzsteuergesetz 1994 ge&auml;ndert wird', [
      '1. In &sect;&nbsp;3 Abs.&nbsp;1 wird das Wort &bdquo;sechs&ldquo; durch &bdquo;acht&ldquo; ersetzt.',
      '2. In &sect;&nbsp;4 Abs.&nbsp;2 entf&auml;llt der letzte Satz.',
      '3. &sect;&nbsp;6 Abs.&nbsp;1 Z&nbsp;9 lautet: &bdquo;neuer Text&ldquo;',
      '4. &sect;&nbsp;28 Abs.&nbsp;60 lautet: &bdquo;Inkrafttreten alt&ldquo;',
    ]),
  )

  it('pairs the articles by the law they name', () => {
    const map = pairArticles(me, rv)
    expect(map.get('Änderung des Umsatzsteuergesetzes 1994')).toBe('Bundesgesetz, mit dem das Umsatzsteuergesetz 1994 geändert wird')
  })

  it('pairs renumbered Ziffern by their instruction line, not by number', () => {
    const a = alignUnits(me, rv)
    expect(a.pairs.map((p) => `${p.me.id}>${p.rv.id}`)).toEqual(['Z1>Z1', 'Z2>Z3', 'Z3>Z4'])
    const units = diffLawUnits(me, rv)
    expect(units.map((u) => `${u.id}:${u.change}`)).toEqual(['Z1:unchanged', 'Z2:inserted', 'Z3:changed', 'Z4:unchanged'])
    expect(units[0]!.article).toBe('Bundesgesetz, mit dem das Umsatzsteuergesetz 1994 geändert wird')
  })
})

describe('the Artikel marker sits on a different heading level per document', () => {
  // 125/ME (Glücksspielgesetz) against 594 d.B.: the draft puts the package
  // title in 41UeberschrG1 and "Artikel 1" one level down in 43UeberschrG2,
  // the bill does it the other way round. Read by class, the draft's units
  // end up with article null, nothing pairs, and all 108 units read as
  // inserted or removed.
  const ziffern = ['1. &sect;&nbsp;1 Abs.&nbsp;4 lautet: &bdquo;Text&ldquo;', '2. &sect;&nbsp;2 wird wie folgt ge&auml;ndert:']
  const body = ziffern.map((z) => `<p class=21NovAo1>${z}</p>`).join('')
  const draft =
    '<html><body><p class=41UeberschrG1>Bundesgesetz, mit dem das Gl&uuml;cksspielgesetz ge&auml;ndert wird</p>' +
    '<p class=43UeberschrG2>Artikel&nbsp;1</p><p class=43UeberschrG2>&Auml;nderung des Gl&uuml;cksspielgesetzes</p>' +
    body +
    '</body></html>'
  const bill =
    '<html><body><p class=11Titel>Bundesgesetz, mit dem das Gl&uuml;cksspielgesetz ge&auml;ndert wird</p>' +
    '<p class=41UeberschrG1>Artikel&nbsp;1</p><p class=43UeberschrG2>&Auml;nderung des Gl&uuml;cksspielgesetzes</p>' +
    body +
    '</body></html>'

  it('reads the article from the text, whichever class carries it', () => {
    const me = parseLawUnits(draft)
    const rv = parseLawUnits(bill)
    expect(me.map((u) => u.article)).toEqual(['Änderung des Glücksspielgesetzes', 'Änderung des Glücksspielgesetzes'])
    expect(me.map((u) => u.article)).toEqual(rv.map((u) => u.article))
  })

  it('accepts the X placeholder a draft for a collective act uses', () => {
    const withX = draft.replace('Artikel&nbsp;1', 'Artikel&nbsp;X1')
    expect(parseLawUnits(withX).map((u) => u.article)).toEqual(['Änderung des Glücksspielgesetzes', 'Änderung des Glücksspielgesetzes'])
  })

  it('pairs the units instead of reporting a rewritten law', () => {
    const units = diffLawUnits(parseLawUnits(draft), parseLawUnits(bill))
    expect(units.map((u) => u.change)).toEqual(['unchanged', 'unchanged'])
  })
})

describe('a Regierungsvorlage that merges several drafts', () => {
  // 22/ME: three articles from the Bundeskanzleramt, 138 in the bill that
  // merged every ministry's IFG draft. Counted unit by unit that reads as
  // "98 % new" — a verdict on a draft that never contained those laws.
  const pkg = (laws: { title: string; ziffern: string[] }[]) =>
    '<html><body>' +
    laws
      .map(
        (l, i) =>
          `<p class=41UeberschrG1>Artikel&nbsp;${i + 1}</p><p class=43UeberschrG2>${l.title}</p>` +
          l.ziffern.map((z) => `<p class=21NovAo1>${z}</p>`).join(''),
      )
      .join('') +
    '</body></html>'

  const draft = pkg([{ title: '&Auml;nderung des Auskunftspflichtgesetzes', ziffern: ['1. &sect;&nbsp;1 lautet: &bdquo;alt&ldquo;', '2. &sect;&nbsp;2 lautet: &bdquo;gleich&ldquo;'] }])
  const bill = pkg([
    { title: 'Bundesgesetz, mit dem das Auskunftspflichtgesetz ge&auml;ndert wird', ziffern: ['1. &sect;&nbsp;1 lautet: &bdquo;neu&ldquo;', '2. &sect;&nbsp;2 lautet: &bdquo;gleich&ldquo;'] },
    { title: '&Auml;nderung des Datenschutzgesetzes', ziffern: ['1. &sect;&nbsp;4 lautet: &bdquo;x&ldquo;', '2. &sect;&nbsp;5 lautet: &bdquo;y&ldquo;'] },
    { title: '&Auml;nderung des Sicherheitspolizeigesetzes', ziffern: ['1. &sect;&nbsp;9 lautet: &bdquo;z&ldquo;'] },
  ])

  it('compares only the law both texts carry', () => {
    const d = diffLawPackage(parseLawUnits(draft), parseLawUnits(bill))
    expect(summarizeDiff(d.units)).toMatchObject({ total: 2, changed: 1, unchanged: 1, inserted: 0, removed: 0 })
  })

  it('names the merged-in laws instead of counting their paragraphs as new', () => {
    const d = diffLawPackage(parseLawUnits(draft), parseLawUnits(bill))
    expect(d.lawsOnlyInRv).toEqual([
      { article: 'Änderung des Datenschutzgesetzes', units: 2 },
      { article: 'Änderung des Sicherheitspolizeigesetzes', units: 1 },
    ])
    expect(d.lawsOnlyInMe).toEqual([])
    // Without the scoping the same pair reads as a rewrite.
    expect(summarizeDiff(diffLawUnits(parseLawUnits(draft), parseLawUnits(bill))).inserted).toBe(3)
  })

  it('reports a law the package lost on the way', () => {
    const d = diffLawPackage(parseLawUnits(bill), parseLawUnits(draft))
    expect(d.lawsOnlyInMe.map((l) => l.article)).toEqual(['Änderung des Datenschutzgesetzes', 'Änderung des Sicherheitspolizeigesetzes'])
    expect(d.lawsOnlyInRv).toEqual([])
  })

  it('leaves an ordinary one-law comparison untouched', () => {
    const one = pkg([{ title: '&Auml;nderung des Auskunftspflichtgesetzes', ziffern: ['1. &sect;&nbsp;1 lautet: &bdquo;alt&ldquo;'] }])
    const d = diffLawPackage(parseLawUnits(one), parseLawUnits(one))
    expect(d.lawsOnlyInRv).toEqual([])
    expect(d.lawsOnlyInMe).toEqual([])
    expect(d.units).toHaveLength(1)
  })
})

describe('a § heading quoted inside a Novellierungsanordnung', () => {
  // "§ 5 lautet samt Überschrift:" installs a heading. Consumed as a pending
  // heading and dropped, it took the only readable name in the instruction
  // with it — and a Regierungsvorlage that changed nothing but that heading
  // produced no diff hit at all.
  const novelle = (heading: string, body: string) =>
    '<html><body><p class=41UeberschrG1>Artikel&nbsp;1</p><p class=43UeberschrG2>&Auml;nderung des Gl&uuml;cksspielgesetzes</p>' +
    '<p class=21NovAo1>1. &sect;&nbsp;5 lautet samt &Uuml;berschrift:</p>' +
    `<p class=45UeberschrPara>${heading}</p>` +
    `<p class=51Abs><span class=991GldSymbol>&sect;&nbsp;5.</span> ${body}</p>` +
    '</body></html>'

  it('keeps the heading as the readable name', () => {
    const units = parseLawUnits(novelle('Landesausspielungen', 'Ausspielungen sind zul&auml;ssig.'))
    expect(units).toHaveLength(1)
    expect(units[0]!.quotedHeadings).toEqual(['Landesausspielungen'])
    expect(units[0]!.text).toContain('Landesausspielungen')
  })

  it('drops the instructions own quotation marks around it', () => {
    const units = parseLawUnits(novelle('&bdquo;Landesausspielungen&ldquo; ', 'Text.'))
    expect(units[0]!.quotedHeadings).toEqual(['Landesausspielungen'])
  })

  it('surfaces it on the diff unit', () => {
    const a = parseLawUnits(novelle('Landesausspielungen', 'Ausspielungen sind zul&auml;ssig.'))
    const b = parseLawUnits(novelle('Landesausspielungen', 'Ausspielungen sind verboten.'))
    const [u] = diffLawUnits(a, b)
    expect(u!.quotedHeading).toBe('Landesausspielungen')
    expect(u!.change).toBe('changed')
  })

  it('sees a change that is only the heading', () => {
    const a = parseLawUnits(novelle('Landesausspielungen', 'Ausspielungen sind zul&auml;ssig.'))
    const b = parseLawUnits(novelle('Ausspielungen der L&auml;nder', 'Ausspielungen sind zul&auml;ssig.'))
    const [u] = diffLawUnits(a, b)
    expect(u!.change).toBe('changed')
  })
})

describe('diffTokens', () => {
  it('finds word-level changes and a similarity', () => {
    const d = diffTokens('Die Frist beträgt sechs Wochen.', 'Die Frist beträgt acht Wochen.')
    expect(d.segments).toEqual([
      { type: 'equal', text: 'Die Frist beträgt' },
      { type: 'removed', text: 'sechs' },
      { type: 'inserted', text: 'acht' },
      { type: 'equal', text: 'Wochen.' },
    ])
    expect(d.similarity).toBeCloseTo(0.8, 5)
  })
})

describe('diffLawUnits: the renumbering trap', () => {
  const me = parseLawUnits(
    law([
      { heading: 'Ziel', gld: '&sect;&nbsp;1.', abs: ['Ziel ist der Ausbau.'] },
      { heading: 'Begriffe', gld: '&sect;&nbsp;2.', abs: ['Es gelten die Begriffe des EAG.'] },
      { heading: 'Verfahren', gld: '&sect;&nbsp;3.', abs: ['Das Verfahren dauert sechs Monate.'] },
      { heading: 'Inkrafttreten', gld: '&sect;&nbsp;4.', abs: ['Dieses Gesetz tritt am 1. J&auml;nner 2026 in Kraft.'] },
    ]),
  )
  const rv = parseLawUnits(
    law([
      { heading: 'Ziel', gld: '&sect;&nbsp;1.', abs: ['Ziel ist der Ausbau.'] },
      { heading: 'Begriffe', gld: '&sect;&nbsp;2.', abs: ['Es gelten die Begriffe des EAG.'] },
      { heading: 'Beteiligung', gld: '&sect;&nbsp;3.', abs: ['Die &Ouml;ffentlichkeit ist zu beteiligen.'] },
      { heading: 'Verfahren', gld: '&sect;&nbsp;4.', abs: ['Das Verfahren dauert vier Monate.'] },
      { heading: 'Inkrafttreten', gld: '&sect;&nbsp;5.', abs: ['Dieses Gesetz tritt am 1. J&auml;nner 2026 in Kraft.'] },
    ]),
  )

  it('aligns by heading, so shifted paragraphs are not "changed"', () => {
    const a = alignUnits(me, rv)
    expect(a.pairs.map((p) => `${p.me.id}>${p.rv.id}`)).toEqual(['§1>§1', '§2>§2', '§3>§4', '§4>§5'])
    expect(a.onlyRv.map((u) => u.id)).toEqual(['§3'])
    expect(a.onlyMe).toEqual([])
  })

  it('reports one insertion and one real change, in RV order', () => {
    const units = diffLawUnits(me, rv)
    expect(units.map((u) => `${u.id}:${u.change}`)).toEqual(['§1:unchanged', '§2:unchanged', '§3:inserted', '§4:changed', '§5:unchanged'])
    const changed = units.find((u) => u.change === 'changed')!
    expect(changed.meId).toBe('§3')
    expect(changed.segments!.some((s) => s.type === 'removed' && s.text === 'sechs')).toBe(true)
    expect(summarizeDiff(units)).toEqual({ total: 5, unchanged: 3, changed: 1, editorial: 0, inserted: 1, removed: 0 })
    expect(changed.editorial).toBe(false)
  })

  it('places a removed § where it stood in the draft', () => {
    const units = diffLawUnits(rv, me) // reverse direction: § 3 Beteiligung disappears
    expect(units.map((u) => `${u.id}:${u.change}`)).toEqual(['§1:unchanged', '§2:unchanged', '§3:removed', '§3:changed', '§4:unchanged'])
  })
})

describe('RIS XML draft against Parliament HTML bill (GP XXVII, Informationsfreiheitsgesetz)', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
  const meBlocks = parseRisXml(read('./fixtures/ris-begut-95me-xxvii.xml'))
  const me = parseLawUnitsFromRis(read('./fixtures/ris-begut-95me-xxvii.xml'))
  const rv = parseLawUnits(read('./fixtures/parl-rv-2238-xxvii.html'))

  it('maps RIS types onto the same block kinds', () => {
    const kinds = new Set(meBlocks.map((b) => b.kind))
    expect(kinds).toContain('para_head')
    expect(kinds).toContain('novao')
    expect(kinds).toContain('article')
    expect(meBlocks.some((b) => b.gld === 'Artikel 22a.')).toBe(true)
    expect(meBlocks.filter((b) => b.cls.startsWith('inhaltsvz')).every((b) => b.kind === 'toc')).toBe(true)
  })

  it('segments the RIS draft into § and Z units with headings', () => {
    expect(me.length).toBeGreaterThan(20)
    expect(me.some((u) => /^Z\d/.test(u.id))).toBe(true)
    expect(me.some((u) => u.id === '§1' && u.heading === 'Anwendungsbereich')).toBe(true)
  })

  it('aligns most of the draft with the bill across the two sources', () => {
    const units = diffLawUnits(me, rv)
    const s = summarizeDiff(units)
    const paired = s.unchanged + s.changed
    expect(paired).toBeGreaterThan(s.inserted + s.removed)
    expect(paired).toBeGreaterThanOrEqual(Math.floor(me.length * 0.6))
    expect(s.unchanged).toBeGreaterThan(0)
  })
})
