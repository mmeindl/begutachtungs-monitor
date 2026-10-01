import { describe, expect, it } from 'vitest'
import { parseLawUnits, parseLawUnitsFromRis, type LawUnit } from '../server/utils/lawtext/lawUnits'
import { parseParliamentHtml } from '../server/utils/lawtext/parliamentHtml'
import { parseRisXml } from '../server/utils/lawtext/risXml'
import { diffLawPackage } from '../server/utils/diff/lawDiff'

/**
 * The block shapes of the drafts whose comparison was refused because no
 * Artikel paired (GP XXVII and XXVI, measured 27.09.2026), class and text as
 * the documents carry them, shortened. `refineArticleHeadings` runs inside
 * both readers, so the tests go through them.
 */

/** Parliament HTML from [class, text] rows; a third element is the § symbol. */
function html(rows: [string, string, string?][]): string {
  const ps = rows.map(([cls, text, gld]) => `<p class=${cls}>${gld ? `<span class=991GldSymbol>${gld}</span> ` : ''}${text}</p>`)
  return `<html><body>${ps.join('')}</body></html>`
}

/** RIS Begut XML from [element/typ, text] rows; a third element is the § symbol. */
function ris(rows: [string, string, string?][]): string {
  const els = rows.map(([el, text, gld]) => {
    const [tag, typ] = el.split('/')
    return `<${tag} typ="${typ}">${gld ? `<gldsym>${gld}</gldsym> ` : ''}${text}</${tag}>`
  })
  return `<risdok><nutzdaten><abschnitt>${els.join('')}</abschnitt></nutzdaten></risdok>`
}

const articles = (units: readonly LawUnit[]) => [...new Set(units.map((u) => u.article))]

describe('Artikel lines the class mapping cannot see', () => {
  it('reads the Artikel class 44UeberschrArt, with the law named as a § heading below it (169/ME)', () => {
    const units = parseLawUnits(
      html([
        ['11Titel', 'Bundesgesetz, mit dem das Fern- und Auswärtsgeschäfte-Gesetz und das Konsumentenschutzgesetz geändert werden'],
        ['12PromKlEinlSatz', 'Der Nationalrat hat beschlossen:'],
        ['44UeberschrArt', 'Artikel 1'],
        ['45UeberschrPara', 'Änderung des Fern- und Auswärtsgeschäfte-Gesetzes'],
        ['83ErlText', 'Das Fern- und Auswärtsgeschäfte-Gesetz, BGBl. I Nr. 33/2014, wird wie folgt geändert:'],
        ['21NovAo1', '1. § 1 Abs. 1 lautet:'],
        ['51Abs', '„(1) Dieses Bundesgesetz gilt für Fernabsatzverträge.“'],
        ['44UeberschrArt', 'Artikel 2'],
        ['45UeberschrPara', 'Änderung des Konsumentenschutzgesetzes'],
        ['83ErlText', 'Das Konsumentenschutzgesetz, BGBl. Nr. 140/1979, wird wie folgt geändert:'],
        ['22NovAo2', '1. In § 5a Abs. 1 Z 5 wird das Wort „Ware“ durch die Wendung „Ware oder die digitale Leistung“ ersetzt.'],
      ]),
    )
    expect(articles(units)).toEqual(['Änderung des Fern- und Auswärtsgeschäfte-Gesetzes', 'Änderung des Konsumentenschutzgesetzes'])
    expect(units.map((u) => u.id)).toEqual(['Z1', 'Z1'])
    expect(units.map((u) => u.articleNumber)).toEqual(['Artikel 1', 'Artikel 2'])
  })

  it('pairs such a draft with a Vorlage in the usual classes (XXVI 129/ME)', () => {
    const me = parseLawUnits(
      html([
        ['44UeberschrArt', 'Artikel 1'],
        ['45UeberschrPara', 'Änderung des Allgemeinen Grundbuchsgesetzes 1955'],
        ['12PromKlEinlSatz', 'Das Allgemeine Grundbuchsgesetz 1955, BGBl. Nr. 39/1955, wird wie folgt geändert:'],
        ['21NovAo1', '1. Nach § 57a Abs. 2 wird folgender Absatz 2a eingefügt:'],
        ['51Abs', '„(2a) Neuer Text.“'],
        ['44UeberschrArt', 'Artikel 2'],
        ['45UeberschrPara', 'Änderung des Grundbuchsumstellungsgesetzes'],
        ['12PromKlEinlSatz', 'Das Grundbuchsumstellungsgesetz, BGBl. Nr. 550/1980, wird wie folgt geändert:'],
        ['22NovAo2', '1. In § 10 Abs. 2 entfällt im zweiten Satz die Wendung „die keine Anträge enthalten,“'],
      ]),
    )
    const rv = parseLawUnits(
      html([
        ['41UeberschrG1', 'Artikel 1'],
        ['43UeberschrG2', 'Änderung des Allgemeinen Grundbuchsgesetzes 1955'],
        ['12PromKlEinlSatz', 'Das Allgemeine Grundbuchsgesetz 1955, BGBl. Nr. 39/1955, wird wie folgt geändert:'],
        ['21NovAo1', '1. Nach § 57a Abs. 2 wird folgender Absatz 2a eingefügt:'],
        ['51Abs', '„(2a) Neuer Text.“'],
        ['41UeberschrG1', 'Artikel 2'],
        ['43UeberschrG2', 'Änderung des Grundbuchsumstellungsgesetzes'],
        ['12PromKlEinlSatz', 'Das Grundbuchsumstellungsgesetz, BGBl. Nr. 550/1980, wird wie folgt geändert:'],
        ['22NovAo2', '1. In § 10 Abs. 2 entfällt im zweiten Satz die Wendung „die keine Anträge enthalten,“'],
      ]),
    )
    const diff = diffLawPackage(me, rv)
    expect(diff.unpaired).toBe(false)
    expect(diff.units.every((u) => u.change === 'unchanged')).toBe(true)
  })

  it('reads RIS `ueberschrift typ="art"` the same way, the name as a second `art` (XXVI 1/ME)', () => {
    const units = parseLawUnitsFromRis(
      ris([
        ['ueberschrift/art', 'Artikel 1'],
        ['ueberschrift/art', 'Änderung des Familienlastenausgleichsgesetzes 1967'],
        ['absatz/promkleinlsatz', 'Das Familienlastenausgleichsgesetz 1967, BGBl. Nr. 376/1967, wird wie folgt geändert:'],
        ['absatz/novao1', '1. § 8 Abs. 3 lautet:'],
        ['ueberschrift/art', 'Artikel 2'],
        ['ueberschrift/art', 'Änderung des Einkommensteuergesetzes 1988'],
        ['absatz/promkleinlsatz', 'Das Einkommensteuergesetz 1988, BGBl. Nr. 400/1988, wird wie folgt geändert:'],
        ['absatz/novao1', '1. § 33 Abs. 3 lautet:'],
      ]),
    )
    expect(articles(units)).toEqual(['Änderung des Familienlastenausgleichsgesetzes 1967', 'Änderung des Einkommensteuergesetzes 1988'])
  })

  it('reads an Artikel line RIS converted as a table-of-contents column, where the law follows it (85/ME)', () => {
    const blocks = parseRisXml(
      ris([
        ['inhaltsvz/ueberschrift', 'Inhaltsverzeichnis'],
        ['inhaltsvz/eintrag', 'Artikel 1 Änderung des Bundesgesetzes über die Rechtspersönlichkeit von religiösen Bekenntnisgemeinschaften'],
        ['inhaltsvz/eintrag', 'Artikel 2 Änderung des Islamgesetzes'],
        ['inhaltsvz/spalte', 'Artikel 1'],
        ['inhaltsvz/eintrag', 'Das Bundesgesetzes über die Rechtspersönlichkeit von religiösen Bekenntnisgemeinschaften, zuletzt geändert durch BGBl. I Nr. 75/2013, wird wie folgt geändert:'],
        ['absatz/novao1', '1. Nach § 11a wird folgender § 11b eingefügt:'],
        ['inhaltsvz/spalte', 'Artikel 2'],
        ['inhaltsvz/eintrag', 'Das Bundesgesetzes über die äußeren Rechtsverhältnisse islamischer Religionsgesellschaften, BGBl. I Nr. 39/2015, wird wie folgt geändert:'],
        ['absatz/novao1', '1. § 5 Abs. 2 lautet:'],
      ]),
    )
    expect(blocks.filter((b) => b.kind === 'article').map((b) => b.text)).toEqual(['Artikel 1', 'Artikel 2'])
    // The table's own rows stay rows.
    expect(blocks.filter((b) => b.cls === 'inhaltsvz/eintrag').every((b) => b.kind === 'toc')).toBe(true)
  })

  it('reads the lower-case placeholder „Artikel x1" (XXVI 115/ME)', () => {
    const units = parseLawUnits(
      html([
        ['41UeberschrG1', 'Artikel x1'],
        ['43UeberschrG2', 'Änderung des Land- und forstwirtschaftlichen Landeslehrer-Dienstrechtsgesetzes'],
        ['12PromKlEinlSatz', 'Das LLDG 1985, BGBl. Nr. 296/1985, wird wie folgt geändert:'],
        ['21NovAo1', '1. Im 10. Abschnitt wird nach § 125e folgender § 125f eingefügt:'],
        ['41UeberschrG1', 'Artikel x2'],
        ['43UeberschrG2', 'Änderung des Marktordnungsgesetzes 2007'],
        ['12PromKlEinlSatz', 'Das Marktordnungsgesetz 2007, BGBl. I Nr. 55/2007, wird wie folgt geändert:'],
        ['21NovAo1', '1. Nach § 32 wird folgender § 33 eingefügt:'],
      ]),
    )
    expect(articles(units)).toEqual(['Änderung des Land- und forstwirtschaftlichen Landeslehrer-Dienstrechtsgesetzes', 'Änderung des Marktordnungsgesetzes 2007'])
    expect(units.map((u) => u.articleNumber)).toEqual(['Artikel x1', 'Artikel x2'])
  })

  it('reads a letter-spaced „A r t i k e l 2" as the word it spells (292/ME)', () => {
    const blocks = parseParliamentHtml(
      html([
        ['41UeberschrG1', 'A r t i k e l 2'],
        ['43UeberschrG2', 'Änderung des ASFINAG-Gesetzes'],
      ]),
    )
    expect(blocks[0]).toMatchObject({ kind: 'article', text: 'Artikel 2' })
  })
})

describe('the name under an Artikel line', () => {
  it('takes an 11Titel below the Artikel line, not the first Hauptstück heading after it (27/ME)', () => {
    const units = parseLawUnits(
      html([
        ['11Titel', 'Bundesgesetz, mit dem ein neues Tierärztegesetz erlassen und das Tierärztekammergesetz geändert wird'],
        ['12PromKlEinlSatz', 'Der Nationalrat hat beschlossen:'],
        ['41UeberschrG1', 'Artikel I.'],
        ['11Titel', 'Bundesgesetz mit dem das Berufsrecht der Tierärztinnen und Tierärzte neu geregelt wird (Tierärztegesetz)'],
        ['41UeberschrG1', '1. Hauptstück'],
        ['42UeberschrG1-', 'Geltungsbereich und allgemeine Bestimmungen'],
        ['45UeberschrPara', 'Geltungsbereich'],
        ['51Abs', '(1) Dieses Bundesgesetz regelt den tierärztlichen Beruf.', '§ 1.'],
        ['41UeberschrG1', 'Artikel II'],
        ['11Titel', 'Bundesgesetz mit dem das Tierärztekammergesetz - TÄKamG, geändert wird'],
        ['12PromKlEinlSatz', 'Das Tierärztekammergesetz - TÄKamG, BGBl. I Nr. 86/2012, wird geändert wie folgt:'],
        ['21NovAo1', '1. § 13 Abs.1 Z 15 lautet:'],
      ]),
    )
    expect(articles(units)).toEqual([
      'Bundesgesetz mit dem das Berufsrecht der Tierärztinnen und Tierärzte neu geregelt wird (Tierärztegesetz)',
      'Bundesgesetz mit dem das Tierärztekammergesetz - TÄKamG, geändert wird',
    ])
    expect(units[0]).toMatchObject({ id: '§1', heading: 'Geltungsbereich' })
  })

  it('reads the name set behind a line break in the Artikel paragraph, not the first Abschnitt (XXVI 77/ME)', () => {
    const me = parseLawUnits(
      html([
        ['11Titel', 'Bundesgesetz, mit dem das Bundesgesetz über die Prüfung lohnabhängiger Abgaben und Beiträge erlassen wird und das Einkommensteuergesetz 1988 geändert wird'],
        ['12PromKlEinlSatz', 'Der Nationalrat hat beschlossen:'],
        ['41UeberschrG1', 'Artikel&nbsp;1<br>\nBundesgesetz über die Prüfung lohnabhängiger Abgaben und\nBeiträge (PLABG)'],
        ['41UeberschrG1', '1.&nbsp;Abschnitt<br>\nPrüfdienst für lohnabhängige Abgaben und Beiträge'],
        ['45UeberschrPara', 'Einrichtung'],
        ['51Abs', '(1) Beim Bundesministerium für Finanzen wird ein Prüfdienst eingerichtet.', '§ 1.'],
        ['41UeberschrG1', 'Artikel&nbsp;2<br>\nÄnderung des Einkommensteuergesetzes 1988'],
        ['12PromKlEinlSatz', 'Das Einkommensteuergesetz 1988, BGBl. Nr. 400/1988, wird wie folgt geändert:'],
        ['21NovAo1', '1. § 86 Abs. 1 lautet:'],
      ]),
    )
    expect(articles(me)).toEqual(['Bundesgesetz über die Prüfung lohnabhängiger Abgaben und Beiträge (PLABG)', 'Änderung des Einkommensteuergesetzes 1988'])
    expect(me.map((u) => u.articleNumber)).toEqual(['Artikel 1', 'Artikel 2'])
    expect(me[0]).toMatchObject({ id: '§1', heading: 'Einrichtung' })

    const rv = parseLawUnits(
      html([
        ['41UeberschrG1', 'Artikel 1'],
        ['43UeberschrG2', 'Bundesgesetz über die Prüfung lohnabhängiger Abgaben und Beiträge (PLABG)'],
        ['41UeberschrG1', '1.&nbsp;Abschnitt<br>\nPrüfdienst für lohnabhängige Abgaben und Beiträge'],
        ['45UeberschrPara', 'Einrichtung'],
        ['51Abs', '(1) Beim Bundesministerium für Finanzen wird ein Prüfdienst eingerichtet.', '§ 1.'],
        ['41UeberschrG1', 'Artikel 2'],
        ['43UeberschrG2', 'Änderung des Einkommensteuergesetzes 1988'],
        ['12PromKlEinlSatz', 'Das Einkommensteuergesetz 1988, BGBl. Nr. 400/1988, wird wie folgt geändert:'],
        ['21NovAo1', '1. § 86 Abs. 1 lautet:'],
      ]),
    )
    const diff = diffLawPackage(me, rv)
    expect(diff.lawsOnlyInFrom).toEqual([])
    expect(diff.lawsOnlyInTo).toEqual([])
    expect(diff.units.map((u) => u.change)).toEqual(['unchanged', 'unchanged'])
  })

  it('keeps an Abschnitt heading with a line break one block, and a quoted Artikel text', () => {
    const blocks = parseParliamentHtml(
      html([
        ['41UeberschrG1', 'Artikel 1'],
        ['43UeberschrG2', 'Änderung des Bundes-Verfassungsgesetzes'],
        ['21NovAo1', '1. Art. 5 lautet:'],
        ['41UeberschrG1', '„Artikel&nbsp;5<br>\nSitz der Bundeshauptstadt'],
        ['51Abs', '(1) Bundeshauptstadt und Sitz der obersten Organe des Bundes ist Wien.“'],
        ['41UeberschrG1', '1.&nbsp;Abschnitt<br>\nAllgemeines'],
      ]),
    )
    expect(blocks.map((b) => [b.kind, b.text])).toEqual([
      ['article', 'Artikel 1'],
      ['section', 'Änderung des Bundes-Verfassungsgesetzes'],
      ['novao', '1. Art. 5 lautet:'],
      ['section', '"Artikel 5 Sitz der Bundeshauptstadt'],
      ['abs', '(1) Bundeshauptstadt und Sitz der obersten Organe des Bundes ist Wien."'],
      ['section', '1. Abschnitt Allgemeines'],
    ])
  })

  it('leaves a § heading below an Artikel line a § heading when the § follows it', () => {
    const units = parseLawUnits(
      html([
        ['44UeberschrArt', 'Artikel 1'],
        ['45UeberschrPara', 'Geltungsbereich'],
        ['51Abs', '(1) Dieses Bundesgesetz gilt für alle.', '§ 1.'],
      ]),
    )
    expect(units).toHaveLength(1)
    expect(units[0]).toMatchObject({ article: 'Artikel 1', id: '§1', heading: 'Geltungsbereich' })
  })
})

describe('the title of a draft without Artikel', () => {
  it('takes a law title typed as 41UeberschrG1 (124/ME, XXVI 9/ME)', () => {
    const units = parseLawUnits(
      html([
        ['10Entwurf', 'Entwurf'],
        ['41UeberschrG1', 'Bundesgesetz, mit dem das Weingesetz 2009 geändert wird'],
        ['12PromKlEinlSatz', 'Der Nationalrat hat beschlossen:'],
        ['12PromKlEinlSatz', 'Das Weingesetz 2009, BGBl. I Nr. 111/2009, wird wie folgt geändert:'],
        ['21NovAo1', 'Nach § 26 wird folgender § 26a eingefügt:'],
        ['41UeberschrG1', '„Datenschutzregelungen - Weindatenbank'],
        ['51Abs', '(1) Die Bundesbehörden sind Verantwortliche.“', '§ 26a.'],
      ]),
    )
    expect(articles(units)).toEqual(['Bundesgesetz, mit dem das Weingesetz 2009 geändert wird'])
  })

  it('pairs it with the Vorlage that made it one Artikel of several (124/ME)', () => {
    const me = parseLawUnits(
      html([
        ['41UeberschrG1', 'Bundesgesetz, mit dem das Lebensmittelsicherheits- und Verbraucherschutzgesetz geändert wird'],
        ['12PromKlEinlSatz', 'Der Nationalrat hat beschlossen:'],
        ['12PromKlEinlSatz', 'Das LMSVG, BGBl. I Nr. 13/2006, wird wie folgt geändert:'],
        ['21NovAo1', '1. § 8 Abs. 1 lautet:'],
        ['51Abs', '„(1) Neuer Text.“'],
      ]),
    )
    const rv = parseLawUnits(
      html([
        ['11Titel', 'Bundesgesetz, mit dem das LMSVG und das Gesundheits- und Ernährungssicherheitsgesetz geändert werden'],
        ['41UeberschrG1', 'Artikel 1'],
        ['43UeberschrG2', 'Bundesgesetz, mit dem das Lebensmittelsicherheits- und Verbraucherschutzgesetz geändert wird'],
        ['12PromKlEinlSatz', 'Das LMSVG, BGBl. I Nr. 13/2006, wird wie folgt geändert:'],
        ['21NovAo1', '1. § 8 Abs. 1 lautet:'],
        ['51Abs', '„(1) Neuer Text.“'],
        ['41UeberschrG1', 'Artikel 2'],
        ['43UeberschrG2', 'Bundesgesetz, mit dem das Gesundheits- und Ernährungssicherheitsgesetz geändert wird'],
        ['12PromKlEinlSatz', 'Das GESG, BGBl. I Nr. 63/2002, wird wie folgt geändert:'],
        ['21NovAo1', '1. § 1 lautet:'],
      ]),
    )
    const diff = diffLawPackage(me, rv)
    expect(diff.unpaired).toBe(false)
    expect(diff.lawsOnlyInTo).toHaveLength(1)
  })

  it('takes a title RIS converted as a table-of-contents column (151/ME)', () => {
    const units = parseLawUnitsFromRis(
      ris([
        ['inhaltsvz/spalte', 'Entwurf'],
        ['inhaltsvz/spalte', 'Bundesgesetz, mit dem ein Hospiz- und Palliativfonds eingerichtet wird (Hospiz- und Palliativfondsgesetz – HosPalFG)'],
        ['inhaltsvz/spalte', 'Inhaltsverzeichnis'],
        ['inhaltsvz/eintrag', '§ 1. Einrichtung und Ziele des Hospiz- und Palliativfonds'],
        ['ueberschrift/para', 'Einrichtung und Ziele des Hospiz- und Palliativfonds'],
        ['absatz/abs', '(1) Beim Bundesministerium wird ein Fonds eingerichtet.', '§ 1.'],
      ]),
    )
    expect(articles(units)).toEqual(['Bundesgesetz, mit dem ein Hospiz- und Palliativfonds eingerichtet wird (Hospiz- und Palliativfondsgesetz - HosPalFG)'])
  })

  it('does not rename a draft that has a title block', () => {
    const blocks = parseParliamentHtml(
      html([
        ['11Titel', 'Bundesgesetz, mit dem das KommAustria-Gesetz geändert wird'],
        ['41UeberschrG1', 'Bundesgesetz über die Einrichtung einer Kommunikationsbehörde'],
        ['21NovAo1', '1. § 17 Abs. 6 lautet:'],
      ]),
    )
    expect(blocks.map((b) => b.kind)).toEqual(['title', 'section', 'novao'])
  })
})

describe('what stays as it was', () => {
  it('keeps the rows of a table of contents that lists the Artikel (281/ME)', () => {
    const blocks = parseParliamentHtml(
      html([
        ['30InhaltUeberschrift', 'Inhaltsverzeichnis'],
        ['31InhaltSpalte', 'Artikel 1'],
        ['31InhaltSpalte', 'Erlassung des Kontroll- und Digitalisierungs-Durchführungsgesetzes'],
        ['31InhaltSpalte', 'Artikel 2'],
        ['31InhaltSpalte', 'Änderung des Tierseuchengesetzes'],
        ['41UeberschrG1', 'Artikel 1'],
        ['43UeberschrG2', 'Bundesgesetz über die behördliche Zusammenarbeit'],
      ]),
    )
    expect(blocks.filter((b) => b.kind === 'article').map((b) => b.cls)).toEqual(['41UeberschrG1'])
  })

  it('keeps a table of contents whose Artikel row is followed by the next row (295/ME)', () => {
    const blocks = parseParliamentHtml(
      html([
        ['41UeberschrG1', 'Artikel 1'],
        ['11Titel', 'Bundesgesetz zur Durchführung des europäischen Tiergesundheitsrechts (Tiergesundheitsgesetz 2023 - TGG 2023)'],
        ['30InhaltUeberschrift', 'Inhaltsverzeichnis'],
        ['31InhaltSpalte', 'Art / Paragraph'],
        ['31InhaltSpalte', 'Gegenstand / Bezeichnung'],
        ['31InhaltSpalte', 'Artikel 1'],
        ['31InhaltSpalte', '1. Hauptstück'],
        ['31InhaltSpalte', '1. Abschnitt Allgemeine Bestimmungen'],
        ['32InhaltEintrag', '§ 1.'],
      ]),
    )
    expect(blocks.filter((b) => b.kind === 'article')).toHaveLength(1)
    expect(blocks[1]!.kind).toBe('section')
    expect(blocks.slice(2).every((b) => b.kind === 'toc')).toBe(true)
  })

  it('does not hand the body of Artikel 1 to the last row of the table (36/RV)', () => {
    const units = parseLawUnits(
      html([
        ['41UeberschrG1', 'Artikel 1'],
        ['43UeberschrG2', 'Bundesgesetz über das Arbeitsrecht in der Land- und Forstwirtschaft (Landarbeitsgesetz 2021 - LAG)'],
        ['30InhaltUeberschrift', 'Inhaltsverzeichnis'],
        ['31InhaltSpalte', 'Artikel 5'],
        ['31InhaltSpalte', 'Änderung des Betrieblichen Mitarbeiter- und Selbständigenvorsorgegesetzes'],
        ['41UeberschrG1', 'Abschnitt 1'],
        ['43UeberschrG2', 'Geltungsbereich und Begriffsbestimmungen'],
        ['45UeberschrPara', 'Geltungsbereich'],
        ['51Abs', '(1) Dieses Bundesgesetz regelt', '§ 1.'],
      ]),
    )
    expect(articles(units)).toEqual(['Bundesgesetz über das Arbeitsrecht in der Land- und Forstwirtschaft (Landarbeitsgesetz 2021 - LAG)'])
  })

  it('keeps headings quoted in amendment text in the 44UeberschrArt class as text of the instruction (128/ME)', () => {
    const units = parseLawUnits(
      html([
        ['21NovAo1', '4. Nach der Überschrift des 21. Hauptstücks wird folgende Überschrift eingefügt:'],
        ['44UeberschrArt', '„1. Abschnitt'],
        ['44UeberschrArt', 'Verfahren zur Unterbringung in einem forensisch-therapeutischen Zentrum nach § 21 StGB“'],
        ['21NovAo1', '5. § 429 lautet:'],
      ]),
    )
    expect(units.map((u) => u.id)).toEqual(['Z4', 'Z5'])
    expect(units[0]!.text).toContain('Verfahren zur Unterbringung')
    expect(articles(units)).toEqual([null])
  })

  it('keeps an Artikel quoted in amendment text, on its first line and on the lines after it', () => {
    const blocks = parseParliamentHtml(
      html([
        ['21NovAo1', '3. Die Art. VII und VIII lauten:'],
        ['44UeberschrArt', '„Artikel VII'],
        ['51Abs', '(1) Die oder der Bedienstete ist zu informieren.'],
        ['44UeberschrArt', 'Artikel VIII'],
        ['51Abs', '(1) Die Information erfolgt schriftlich.“'],
        ['21NovAo1', '4. § 5 lautet:'],
      ]),
    )
    expect(blocks.filter((b) => b.cls === '44UeberschrArt').map((b) => b.kind)).toEqual(['other', 'other'])
  })
})
