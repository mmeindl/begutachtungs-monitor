/** What a Landesgesetz changed, § by § (`landLawChanges.ts`): every doubt is a § not compared. */
import { describe, expect, it } from 'vitest'
import { diffLandDraft, lgblUnits } from '../server/utils/laender/landLawDiff'
import { instructionLawFor, instructionLawsOf, lautetMissing, lgblArticleClauses, lgblInstructedParagraphs, isNamed, konsKey, konsUnit, lgblNamedParagraphs, lgblRenumberedParagraphs, namesAsLast, pairOf, repealedBy, subInstructionHeads, type LandKonsVersion } from '../server/utils/laender/landLawChanges'

const v = (over: Partial<LandKonsVersion>): LandKonsVersion => ({ gesetzesnummer: '20001217', law: 'Salzburger Kinderbildungs- und -betreuungsgesetz 2019', key: '§5', from: null, to: null, organ: '', xmlUrl: 'x', stammnorm: '57/2019', abbreviation: null, ...over })

describe('versions', () => {
  it('keys §§ and Artikel, not § 0 or Anlagen', () => {
    expect(konsKey('§ 5')).toBe('§5')
    expect(konsKey('§ 15a')).toBe('§15a')
    expect(konsKey('Art. 19')).toBe('Art.19')
    expect(konsKey('§ 0')).toBeNull()
    expect(konsKey('Anl. 1')).toBeNull()
  })
  it('takes a version as this LGBl’s only where it is named last, and not as the repeal', () => {
    expect(namesAsLast('LGBl Nr 57/2019 zuletzt geändert durch LGBl Nr 31/2026', '31/2026')).toBe(true)
    expect(namesAsLast('LGBl Nr 57/2019 zuletzt geändert durch LGBl Nr 131/2026', '31/2026')).toBe(false)
    expect(namesAsLast('LGBl Nr 31/2026 zuletzt geändert durch LGBl Nr 40/2026', '31/2026')).toBe(false)
    expect(repealedBy('LGBl Nr 57/2019 aufgehoben durch LGBl Nr 31/2026', '31/2026')).toBe(true)
  })
  it('pairs only the version that ended the day before, and says why otherwise', () => {
    const neu = v({ from: '2026-04-15', xmlUrl: 'n' })
    const old = v({ from: '2023-01-01', to: '2026-04-14', xmlUrl: 'o' })
    expect(pairOf(neu, [neu, old])).toEqual({ kind: 'pair', old })
    expect(pairOf(neu, [neu])).toEqual({ kind: 'new' })
    expect(pairOf(neu, [neu, v({ from: '2023-01-01', to: '2026-03-01', xmlUrl: 'o' })])).toEqual({ kind: 'unpaired', why: 'gap' })
    expect(pairOf(neu, [neu, old, v({ from: '2026-01-01', to: '2026-04-14', xmlUrl: 'p' })])).toEqual({ kind: 'unpaired', why: 'several' })
    expect(pairOf(v({ from: null }), [old])).toEqual({ kind: 'unpaired', why: 'no-date' })
    // Began before the Kundmachung and since replaced: possibly the wording this LGBl replaced (RIS Kärnten).
    expect(pairOf({ ...neu, to: '2026-09-30' }, [neu, old], '2026-05-01')).toEqual({ kind: 'unpaired', why: 'early' })
    // Retroactive and still in force: the version is this Landesgesetzblatt's.
    expect(pairOf({ ...neu, to: null }, [neu, old], '2026-05-01')).toEqual({ kind: 'pair', old })
    expect(pairOf(neu, [neu, old], neu.from)).toEqual({ kind: 'pair', old })
  })
})

describe('instructions', () => {
  it('names every § an instruction addresses, none of its quoted wording', () => {
    expect(lgblNamedParagraphs('§ 6 Abs. 1 Z 9 lautet:')).toEqual(['§6'])
    expect(lgblNamedParagraphs('In den §§ 5, 7 und 9a wird …')).toEqual(['§5', '§7', '§9a'])
    expect(lgblNamedParagraphs('Die §§ 48 bis 53 lauten:')).toEqual(['§48', '§53', '§48-53'])
    expect(lgblNamedParagraphs('Im § 3 Abs. 2 und im § 8 wird …')).toEqual(['§3', '§8'])
    expect(lgblNamedParagraphs('Nach § 5 wird folgender § 5a eingefügt: „§ 5a … § 99 …“')).toEqual(['§5', '§5a'])
  })
  it('names the §§ a sub-instruction joined to its instruction addresses, none of its quoted wording (Salzburg, 19.11.2026)', () => {
    const z = (heading: string, text: string) => ({ article: null, articleNumber: null, id: 'Z15', heading, quotedHeadings: [], text, blocks: [], stammnorm: null })
    const text = 'Im § 18 werden folgende Änderungen vorgenommen: 15.1. Im Abs 1 werden geändert: 15.1.1. In der Z 6 wird nach dem Wort „§ 9“ die Wortfolge „oder verwendet“ eingefügt. 15.2. Im § 12e tritt mit 1.1.2026 „§ 99“ in Kraft. 15.3 Im § 41 Abs 2 entfällt der letzte Satz.'
    expect([...lgblInstructedParagraphs([z('Im § 18 werden folgende Änderungen vorgenommen', text)]).get(null)!].sort()).toEqual(['§12e', '§18', '§41'])
    expect(subInstructionHeads('Im § 5 tritt mit 1.1.2026 in Kraft.')).toEqual([])
  })
  it('groups by the Artikel’s law, and finds it for a Kurztitel in the genitive', () => {
    const z = (article: string | null, heading: string) => ({ article, articleNumber: null, id: 'Z1', heading, quotedHeadings: [], text: '', blocks: [], stammnorm: null })
    const m = lgblInstructedParagraphs([z('Änderung des Salzburger Kinderbildungs- und -betreuungsgesetzes 2019', '§ 5 lautet:')])
    expect(instructionLawFor('Salzburger Kinderbildungs- und -betreuungsgesetz 2019', [...m.keys()])).toBe('Änderung des Salzburger Kinderbildungs- und -betreuungsgesetzes 2019')
    expect(instructionLawFor('Jagdgesetz 1993', [...m.keys()])).toBeUndefined()
    expect(instructionLawFor('Jagdgesetz 1993', [null])).toBeNull()
    expect(instructionLawFor('Wiener Pflanzenschutzmittelgesetz', ['Artikel I'], 1)).toBe('Artikel I')
    expect(instructionLawFor('Wiener Pflanzenschutzmittelgesetz', ['Artikel I', 'Artikel II'], 2)).toBeUndefined()
  })
})

describe('lgblArticleClauses', () => {
  it('reads the law an Artikel’s clause names, and the Stammnorm it cites with its year (22.11.2026)', () => {
    const xml = '<ueberschrift typ="art" halign="c">Artikel I</ueberschrift><absatz typ="promkleinlsatz" halign="j">Die Dienstordnung 1994, LGBl. Nr. 56, zuletzt geändert durch das Gesetz LGBl. Nr. 10/2019, wird wie folgt geändert:</absatz>' +
      '<ueberschrift typ="art" halign="c">Artikel II</ueberschrift><absatz typ="promkleinlsatz" halign="j">Das Pflichtschulorganisationsgesetz, LGBl.Nr. 17/1984, in der Fassung LGBl.Nr. 21/1988 und Nr. 81/2017, wird wie folgt geändert:</absatz>' +
      '<ueberschrift typ="art" halign="c">Artikel V</ueberschrift><absatz typ="abs" halign="j">Das Schulratgesetz, LGBl.Nr. 35/1963, in der Fassung LGBl.Nr. 30/1985, tritt mit Ablauf des 31. Dezember 2018 außer Kraft.</absatz>' +
      '<ueberschrift typ="g1" halign="c">Artikel 2</ueberschrift><ueberschrift typ="g1" halign="c">Änderung des Steiermärkischen Pensionsgesetzes 2009</ueberschrift><absatz typ="promkleinlsatz" halign="j">Das Steiermärkische Pensionsgesetz 2009, LGBl. Nr. 10/2009, zuletzt in der Fassung LGBl. Nr. 46/2024, wird wie folgt geändert:</absatz>'
    expect(Object.fromEntries(lgblArticleClauses(xml))).toEqual({
      I: { name: 'Dienstordnung 1994', cites: null },
      II: { name: 'Pflichtschulorganisationsgesetz', cites: '17/1984' },
      2: { name: 'Steiermärkische Pensionsgesetz 2009', cites: '10/2009' },
    })
  })
})

describe('instructionLawsOf — a law under another name (22.11.2026)', () => {
  /** An Artikel of a Landesgesetzblatt: its heading, its clause, one instruction. */
  const art = (heading: string, clause: string, instruction: string) =>
    `<ueberschrift typ="art" halign="c">${heading}</ueberschrift><absatz typ="promkleinlsatz" halign="j">${clause}</absatz><absatz typ="novao2" halign="j">1. ${instruction}</absatz>`
  const match = (xml: string, laws: { law: string; abbreviation?: string; stammnorm: string }[]) => {
    const doc = `<risdok><nutzdaten>${xml}</nutzdaten></risdok>`
    return Object.fromEntries(instructionLawsOf(laws.map((l) => ({ abbreviation: null, ...l })), lgblUnits(doc), doc))
  }

  it('holds the Kurztitel without the abbreviation RIS gives it (Kärnten LGBl. Nr. 73/2019)', () => {
    const xml = art('Artikel I<br />Änderung der Kärntner Gefahrenpolizei- und Feuerpolizeiordnung', 'Die Kärntner Gefahrenpolizei- und Feuerpolizeiordnung – K-GFPO, LGBl. Nr. 67/2000, zuletzt geändert durch LGBl. Nr. 71/2018, wird wie folgt geändert:', '§ 15 Abs. 1 lautet: „(1) Text.“') +
      art('Artikel II<br />Änderung der Kärntner Bauvorschriften', 'Die Kärntner Bauvorschriften – K-BV, LGBl. Nr. 56/1986, zuletzt geändert durch LGBl. Nr. 71/2018, werden wie folgt geändert:', '§ 14 Abs. 2 lautet: „(2) Text.“')
    expect(match(xml, [
      { law: 'Kärntner Gefahrenpolizei- und Feuerpolizeiordnung 2000 - K-GFPO', abbreviation: 'K-GFPO', stammnorm: '67/2000' },
      { law: 'Kärntner Bauvorschriften- K-BV', abbreviation: 'K-BV', stammnorm: '56/1985' },
    ])).toEqual({
      'Kärntner Gefahrenpolizei- und Feuerpolizeiordnung 2000 - K-GFPO': 'Artikel I Änderung der Kärntner Gefahrenpolizei- und Feuerpolizeiordnung',
      'Kärntner Bauvorschriften- K-BV': 'Artikel II Änderung der Kärntner Bauvorschriften',
    })
  })

  it('takes the Stammnorm the clause cites where the names differ (Kärnten LGBl. Nr. 89/2020)', () => {
    const xml = art('Artikel I<br />Änderung des Kärntner EU-Umwelt-Begleitgesetzes', 'Das Gesetz über begleitende Maßnahmen zur Durchführung von Verordnungen im Bereich des Landesrechts, LGBl. Nr. 58/2018, wird wie folgt geändert:', '§ 1 lautet: „§ 1 Text.“') +
      art('Artikel II<br />Änderung des Kärntner Dienstleistungsgesetzes', 'Das Kärntner Dienstleistungsgesetz – K-DLG, LGBl. Nr. 23/2012, zuletzt geändert durch LGBl. Nr. 71/2018, wird wie folgt geändert:', '§ 3 lautet: „§ 3 Text.“')
    expect(match(xml, [
      { law: 'Kärntner EU-Verordnungen-Begleitgesetz – K-EUBG', abbreviation: 'K-EUBG', stammnorm: '58/2018' },
      { law: 'Kärntner Dienstleistungsgesetz - K-DLG', abbreviation: 'K-DLG', stammnorm: '23/2012' },
    ])).toEqual({
      'Kärntner EU-Verordnungen-Begleitgesetz – K-EUBG': 'Artikel I Änderung des Kärntner EU-Umwelt-Begleitgesetzes',
      'Kärntner Dienstleistungsgesetz - K-DLG': 'Artikel II Änderung des Kärntner Dienstleistungsgesetzes',
    })
  })

  it('pairs a law with the one Artikel left to it, and never where two remain (Wien LGBl. Nr. 37/2026, Vorarlberg LGBl. Nr. 72/2022)', () => {
    const wien = art('Artikel V', 'Das Wiener Gleichbehandlungsgesetz, LGBl. für Wien Nr. 18/1996, zuletzt geändert durch das Gesetz LGBl. für Wien Nr. 39/2025, wird wie folgt geändert:', 'In § 27 Abs. 1 entfällt die Wortfolge „im Sinn“.') +
      art('Artikel VI', 'Das Wiener Landeslehrerinnen- und Landeslehrer-Gleichbehandlungsgesetz, LGBl. für Wien Nr. 41/2009, zuletzt geändert durch das Gesetz LGBl. für Wien Nr. 63/2018, wird wie folgt geändert:', '§ 4 Abs. 1 lautet: „(1) Text.“')
    expect(match(wien, [
      { law: 'Wiener Gleichbehandlungsgesetz', stammnorm: '18/1996' },
      { law: 'Wiener Landeslehrerinnen- und Landeslehrer-Gleichbehandlungsgesetz', stammnorm: '41/2009' },
    ])).toEqual({ 'Wiener Gleichbehandlungsgesetz': 'Artikel V', 'Wiener Landeslehrerinnen- und Landeslehrer-Gleichbehandlungsgesetz': 'Artikel VI' })
    // Both names hold both Artikel (the years are no word), and only one clause cites its law's Stammnorm: neither is taken.
    const vbg = art('Artikel III', 'Das Landesbedienstetengesetz 1988, LGBl.Nr. 1/1988, in der Fassung LGBl.Nr. 28/1991, wird wie folgt geändert:', '§ 120 lautet: „§ 120 Text.“') +
      art('Artikel IV', 'Das Landesbedienstetengesetz 2000, LGBl.Nr. 50/2000, in der Fassung LGBl.Nr. 15/2001, wird wie folgt geändert:', '§ 2 lautet: „§ 2 Text.“')
    expect(match(vbg, [
      { law: 'Landesbedienstetengesetz 1988', stammnorm: '1/1988' },
      { law: 'Landesbedienstetengesetz 2000', stammnorm: '44/2013' },
    ])).toEqual({ 'Landesbedienstetengesetz 1988': undefined, 'Landesbedienstetengesetz 2000': undefined })
  })
})

describe('lgblRenumberedParagraphs (22.11.2026)', () => {
  const keys = (line: string) => new Set(lgblRenumberedParagraphs(line))
  it('reads the old numbers and the new ones of „werden als §§ … bezeichnet“ (Vorarlberg LGBl. Nr. 45/2018)', () => {
    expect(keys('Die bisherigen §§ 2a, 3 und 4 werden als §§ 3, 4 und 5 bezeichnet.')).toEqual(new Set(['§2a', '§3', '§4', '§5']))
    expect(keys('Der bisherige § 19 wird als § 20 bezeichnet.')).toEqual(new Set(['§19', '§20']))
    // A range on both sides: every § inside it, „§ 24“ as much as „§ 21“.
    const range = keys('Die bisherigen §§ 20 bis 22 werden als §§ 23 bis 25 bezeichnet.')
    expect(isNamed(range, '§21')).toBe(true)
    expect(isNamed(range, '§24')).toBe(true)
    expect(isNamed(range, '§26')).toBe(false)
  })
  it('reads „erhält die Bezeichnung „§ …““ with its quoted new numbers (Oberösterreich LGBl. Nr. 62/2026, Tirol LGBl. Nr. 128/2018)', () => {
    expect(keys('Der bisherige § 21 erhält die Bezeichnung "§ 19" .')).toEqual(new Set(['§21', '§19']))
    expect(keys('Die bisherigen §§ 112a und 112b erhalten die Bezeichnungen "§ 113" und "§ 114" .')).toEqual(new Set(['§112a', '§112b', '§113', '§114']))
    const range = keys('Die bisherigen §§ 113, 114, 116, 116a und 117 bis 127 erhalten die Bezeichnungen "§ 143" bis "§ 157" .')
    for (const k of ['§113', '§116a', '§120', '§143', '§150', '§157']) expect(isNamed(range, k)).toBe(true)
    expect(isNamed(range, '§115')).toBe(false)
    expect(isNamed(range, '§128')).toBe(false)
  })
  it('takes the § the clause renumbers, not the one an insertion stands after', () => {
    expect(keys('Nach § 49 wird folgende Bestimmung als neuer § 49a eingefügt; der bisherige § 49a erhält die Bezeichnung "§ 49b" : § 49a Entgeltausgleich bei Altersteilzeit (1) Dem Vertragsbediensteten gebührt ein Ausgleich.')).toEqual(new Set(['§49a', '§49b']))
  })
  it('reads „Paragraphenbezeichnung“ with the subject behind the verb, a bare number and a full stop inside the quotes', () => {
    expect(keys('Die bisherige Abschnittsbezeichnung „IIIa“ erhält die Abschnittsbezeichnung „IIIb“ und erhalten die bisherigen §§ 15a und 15b die Paragraphenbezeichnungen „§ 15b“ und „§ 15c“.')).toEqual(new Set(['§15a', '§15b', '§15c']))
    expect(keys('Der bisherige § 17b erhält die Paragraphenbezeichnung „ 17c “ und lautet:')).toEqual(new Set(['§17b', '§17c']))
    expect(keys('Der bisherige § 14 erhält die Paragraphenbezeichnung „§ 33.“')).toEqual(new Set(['§14', '§33']))
  })
  it('is no renumbering of a §: an Absatz or a Ziffer renamed, a citation replaced, §§ inserted', () => {
    expect(lgblRenumberedParagraphs('Im § 12 wird der bisherige Text als Abs. 1 bezeichnet und folgender Abs. 2 angefügt:')).toEqual([])
    expect(lgblRenumberedParagraphs('Im § 25 Abs 1 erhalten die Z 3 und 4 die Bezeichnungen „2.“ und „3.“')).toEqual([])
    expect(lgblRenumberedParagraphs('Im § 37 Abs 2 erhalten die bisherigen lit i bis n die Bezeichnungen „j“ bis „o“.')).toEqual([])
    expect(lgblRenumberedParagraphs('Im § 9 wird im Abs 2 die Paragraphenbezeichnung „§ 4“ durch die Paragraphenbezeichnung „§ 4a“ ersetzt.')).toEqual([])
    expect(lgblRenumberedParagraphs('Nach § 27 werden folgende Bestimmungen als §§ 27a bis 27f eingefügt: § 27a Unterscheidende Bezeichnung der Wählergruppen')).toEqual([])
    expect(lgblRenumberedParagraphs('Im nunmehrigen § 12 Abs. 3 wird der Ausdruck "§§ 3, 6, 8b und 12" durch den Ausdruck "§§ 4, 6, 9 und 14" ersetzt.')).toEqual([])
  })
})

describe('lautetMissing (22.11.2026)', () => {
  const z = (text: string) => ({ article: null, articleNumber: null, id: 'Z4', heading: null, quotedHeadings: [], text, blocks: [], stammnorm: null })
  const instruction = z('§ 14 Abs. 6 lautet: "(6) § 13 Abs. 3, 6, 6a, 6b und 7 gelten sinngemäß."')
  it('names the words of the instruction’s wording the new version lacks', () => {
    expect(lautetMissing(instruction, '§14', { id: '§14', heading: null, text: '(6) § 13 Abs. 3, 6 und 7 gelten sinngemäß.' })).toEqual(['6a', '6b'])
    expect(lautetMissing(instruction, '§14', { id: '§14', heading: null, text: '(6) § 13 Abs. 3, 6, 6a, 6b und 7 gelten sinngemäß.' })).toEqual([])
  })
  it('checks nothing it cannot hold to one § (null)', () => {
    expect(lautetMissing(instruction, '§16', { id: '§16', heading: null, text: 'x' })).toBeNull()
    expect(lautetMissing(z('In § 14 Abs. 6 wird das Wort "sechs" durch das Wort "sieben" ersetzt.'), '§14', { id: '§14', heading: null, text: 'x' })).toBeNull()
    expect(lautetMissing(z('Die §§ 14 und 15 lauten: "§ 14 … § 15 …"'), '§14', { id: '§14', heading: null, text: 'x' })).toBeNull()
    expect(lautetMissing(z('Im § 18 werden folgende Änderungen vorgenommen: 15.1. Im Abs 1 lautet die Z 6: "6. x"'), '§18', { id: '§18', heading: null, text: 'y' })).toBeNull()
  })
})

describe('isNamed', () => {
  it('reads a range', () => {
    expect(isNamed(new Set(['§48-53']), '§51a')).toBe(true)
    expect(isNamed(new Set(['§48-53']), '§54')).toBe(false)
  })
})

describe('konsUnit', () => {
  it('reads the § heading and its text, not the metadata', () => {
    const xml = '<risdok><nutzdaten><absatz typ="erltext" ct="kurztitel">X</absatz><ueberschrift typ="para" ct="text">Bedarfsplanung</ueberschrift><ueberschrift typ="para" ct="text">§ 5</ueberschrift><absatz typ="abs" ct="text">(1) Die Bedarfsplanung …</absatz><listelem ct="text"><symbol>1.</symbol>die Bestandserhebung,</listelem></nutzdaten></risdok>'
    const u = konsUnit(xml, { key: '§5', law: 'X' }, 'X')!
    expect(u).toMatchObject({ id: '§5', heading: 'Bedarfsplanung', article: 'X' })
    expect(u.blocks.map((b) => b.text)).toEqual(['(1) Die Bedarfsplanung …', '1. die Bestandserhebung,'])
  })
  it('drops RIS’s notes on Landesgesetzblätter, never the law’s own words about them', () => {
    const xml = '<nutzdaten><absatz typ="abs" ct="text"><gldsym>§ 5.</gldsym> (1) Der Fonds trägt die Bezeichnung „Fonds“. <i>(Anm: LGBl.Nr. 96/2017, 22/2025)</i></absatz>' +
      '<absatz typ="satz" ct="text">*) Fassung LGBl.Nr. 2/2006, 55/2011, 27/2019</absatz>' +
      '<absatz typ="satz" ct="text">Anm.: in der Fassung LGBl. Nr.&#160;102/2005, LGBl. Nr. 103/2018</absatz>' +
      '<absatz typ="satz" ct="text">Anm.: in der Fassung LGBl. Nr. 136/2016, (seit LGBl. Nr. 97/2020 Steiermärkisches Gesetz)</absatz>' +
      '<absatz typ="abs" ct="text">(3) entfallen <i>(Anm: entfallen auf Grund LGBl Nr 103/2022)</i></absatz>' +
      '<absatz typ="abs" ct="text">(16) In der Fassung der 16. Novelle, LGBl. Nr. 103/2018, treten § 26 und § 29 in Kraft.</absatz></nutzdaten>'
    expect(konsUnit(xml, { key: '§5', law: 'X' }, 'X')!.blocks.map((b) => b.text)).toEqual([
      // The shared reader folds the quotation marks, as the Bund's does (`normalizeText`); the comparison drops them (`comparedText`).
      '(1) Der Fonds trägt die Bezeichnung "Fonds".',
      '(3) entfallen (Anm: entfallen auf Grund LGBl Nr 103/2022)',
      '(16) In der Fassung der 16. Novelle, LGBl. Nr. 103/2018, treten § 26 und § 29 in Kraft.',
    ])
  })
  it('keeps the Schlussteil that closes a list, so a change made only there is a change (Tirol LGBl. Nr. 39/2026 § 23, 19.11.2026)', () => {
    const xml = (frist: string) => '<nutzdaten><absatz typ="abs" ct="text">(9) Ansprüche sind</absatz><listelem ct="text"><symbol>a)</symbol>gegenüber dem Land binnen sechs Monaten,</listelem>' +
      `<listelem ct="text"><symbol>b)</symbol>gegenüber dem Belästiger binnen drei Jahren</listelem><schlussteil ebene="1" art="normal" ct="text">gerichtlich geltend zu machen. ${frist}</schlussteil>` +
      '<schluss typ="Abs" ct="text">Die Frist ist gewahrt.</schluss></nutzdaten>'
    const old = konsUnit(xml('Die Frist beginnt mit der Beendigung.'), { key: '§23', law: 'X' }, 'X')!
    expect(old.text).toBe('(9) Ansprüche sind a) gegenüber dem Land binnen sechs Monaten, b) gegenüber dem Belästiger binnen drei Jahren gerichtlich geltend zu machen. Die Frist beginnt mit der Beendigung. Die Frist ist gewahrt.')
    const neu = konsUnit(xml('Die Frist beginnt mit der Kenntnis.'), { key: '§23', law: 'X' }, 'X')!
    expect(diffLandDraft([old], [neu]).map((u) => u.change)).toEqual(['changed'])
  })
  it('reads the text through the shared RIS reader: signs, images and inline markup as the Bund’s readers do (20.11.2026)', () => {
    const xml = (sign: string) => `<nutzdaten><absatz typ="abs" ct="text">(1) Die Abgabe beträgt bei Flächen <${sign} /> 500 m<super>2</super> ein Prozent; CO<sub>2</sub>-Ausstoß, Bau<gdash />Ordnung &amp; Recht.</absatz>` +
      '<absatz typ="abs" ct="text">(2) Das Muster: <binary nr="1" shapetype="is" datatype="png"><src>/Dokumente/Landesnormen/LST40032790/hauptdokument.img1is.png</src></binary> gilt.</absatz></nutzdaten>'
    const gt = konsUnit(xml('gt'), { key: '§5', law: 'X' }, 'X')!
    expect(gt.blocks.map((b) => b.text)).toEqual([
      '(1) Die Abgabe beträgt bei Flächen > 500 m 2 ein Prozent; CO2-Ausstoß, Bau-Ordnung & Recht.',
      '(2) Das Muster: [Abbildung] gilt.',
    ])
    // A change made only in the sign is a change.
    expect(diffLandDraft([gt], [konsUnit(xml('lt'), { key: '§5', law: 'X' }, 'X')!]).map((u) => u.change)).toEqual(['changed'])
  })
  it('reads a title RIS writes in one element with the number as the heading (Oö. Polizeistrafgesetz § 8, 21.11.2026)', () => {
    const xml = '<nutzdaten><ueberschrift typ="para" ct="text" halign="c">§ 8<br />Ausnahmen</ueberschrift><absatz typ="abs" ct="text" halign="j">Von der Anwendung ist ausgenommen.</absatz></nutzdaten>'
    const u = konsUnit(xml, { key: '§8', law: 'X' }, 'X')!
    expect(u.heading).toBe('Ausnahmen')
    expect(u.text).toBe('Von der Anwendung ist ausgenommen.')
    // Vorarlberg's form: the number in its own element, a note mark after it (Jagdgesetz § 40).
    expect(konsUnit('<nutzdaten><ueberschrift typ="art" ct="text"><n>§ 40*)</n><br />Hegeabschuss</ueberschrift><absatz typ="abs" ct="text">Text.</absatz></nutzdaten>', { key: '§40', law: 'X' }, 'X')!.heading).toBe('Hegeabschuss')
    // The number alone is the id still, never a title.
    expect(konsUnit('<nutzdaten><ueberschrift typ="para" ct="text">§ 8</ueberschrift><absatz typ="abs" ct="text">Text.</absatz></nutzdaten>', { key: '§8', law: 'X' }, 'X')!.heading).toBeNull()
  })
})
