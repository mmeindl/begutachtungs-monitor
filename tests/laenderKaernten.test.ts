import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ktnChainOf,
  ktnGzOf,
  ktnKundmachung,
  ktnNextStuecke,
  ktnPartsOfNumber,
  parseKtnBeschluesse,
  parseKtnList,
  parseKtnStatements,
  parseKtnVoDetail,
  parseKtnVoList,
  parseKtnVorlagen,
  ktnVoDeadline,
  ktnVoLetter,
  type KtnChainStep,
} from '../server/utils/laender/kaernten'
import { LandSourceError } from '../server/utils/laender/gate'
import type { LgblEntry } from '../server/utils/laender/lgblSearch'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/laender/${name}`, import.meta.url), 'utf8')
const CURRENT = fixture('kaernten-aktuell-2026-10-23.html')
const ARCHIVE_2026 = fixture('kaernten-abgeschlossen-2026-2026-10-23.html')
const ARCHIVE_2021 = fixture('kaernten-abgeschlossen-2021-2026-10-23.html')
const VORLAGEN_2026 = fixture('kaernten-vorlagen-2026-2026-10-23.html')
const BESCHLUESSE_2026 = fixture('kaernten-beschluesse-2026-2026-10-23.html')
const BESCHLUESSE_2021 = fixture('kaernten-beschluesse-2021-2026-10-23.html')
const STATEMENTS = fixture('kaernten-stellungnahmen-57687-2026-10-23.html')

describe('Kärnten — the running list, as served on 23.10.2026', () => {
  it('reads every entry with its Frist, its documents and its Geschäftszahl', () => {
    const entries = parseKtnList(CURRENT, { requireFrist: true })
    expect(entries.map((e) => [e.draft.id, e.draft.deadline])).toEqual([
      ['ktn-96045-2026-7', '2026-11-18'],
      ['ktn-37427-2025-79', '2026-11-09'],
      ['ktn-68550-2026-13', '2026-10-28'],
    ])
    const [first] = entries
    expect(first!.draft.title).toBe('Gesetz, mit dem das Kärntner Tourismusabgabegesetz geändert wird')
    expect(first!.draft.documents.map((d) => d.title)).toEqual(['Entwurf', 'Erläuterungen', 'Textgegenüberstellung'])
    // Unsigned: the CMS's `?exp=…&fps=…` changes with every read of the page.
    expect(first!.draft.documents[0]!.url).toBe('https://www.ktn.gv.at/DE/repos/files/ktn%2egv%2eat/Abteilungen/Verfassungsdienst/PDF/2026/Beg%5f2026/LG-96045%5f2026-7%20Gesetz%20%20Begutachtung%2epdf')
    expect(first!.statementsUrl).toBeNull()
  })

  it('refuses a page that is not the list', () => {
    expect(() => parseKtnList('<html><body>Wartung</body></html>', { requireFrist: true })).toThrow(LandSourceError)
  })
})

describe('Kärnten — the archive', () => {
  it('reads a year without dates, with the page of each draft\'s Stellungnahmen', () => {
    const entries = parseKtnList(ARCHIVE_2026, { requireFrist: false })
    expect(entries).toHaveLength(13)
    expect(entries.every((e) => e.draft.deadline === null && e.draft.startedAt === null)).toBe(true)
    expect(entries.every((e) => e.statementsUrl)).toBe(true)
  })

  it('reads the Geschäftszahl before 2022, and supplies no year the Land did not write', () => {
    const ids = parseKtnList(ARCHIVE_2021, { requireFrist: false }).map((e) => e.draft.id)
    expect(ids).toHaveLength(25)
    expect(ids).toContain('ktn-1994-6')
    expect(ktnGzOf('https://www.ktn.gv.at/x/LG-1927-42-2020_Ges%20Beg.pdf')).toEqual({ akt: '1927', year: '2020', stueck: '42' })
    expect(ktnGzOf('https://www.ktn.gv.at/x/LG-113253%5f2025-38%5fGe.pdf')).toEqual({ akt: '113253', year: '2025', stueck: '38' })
  })

  it('names only organisations among the Stellungnahmen', () => {
    const statements = parseKtnStatements(STATEMENTS)
    expect(statements).toHaveLength(6)
    expect(statements[0]!.name).toBe('Bundesministerium für Inneres')
  })
})

describe('Kärnten — the chain', () => {
  const vorlagen = parseKtnVorlagen(VORLAGEN_2026)
  const beschluesse = parseKtnBeschluesse(BESCHLUESSE_2026)

  it('reads the Vorlagen under their sitting, and the Beschlüsse with the Vorlage each links', () => {
    expect(vorlagen.find((v) => v.akt === '113253-2025')).toMatchObject({ stueck: 73, date: '2026-09-08', sitting: '78. Regierungssitzung am 08.09.2026' })
    expect(beschluesse.find((b) => b.akt === '113253-2025')).toMatchObject({ stueck: 73, date: '2026-10-01' })
    // An Initiativantrag links no Vorlage and joins no draft.
    expect(beschluesse.some((b) => /Landtagswahlordnung/.test(b.title))).toBe(false)
  })

  it('accepts the older heading of the Beschlüsse page („Landtags")', () => {
    expect(parseKtnBeschluesse(BESCHLUESSE_2021).length).toBeGreaterThan(0)
  })

  const lgbl = (titel: string, nr: string, typ = 'Landesgesetz'): LgblEntry => ({ nr, typ, titel, datum: '2026-10-20', url: null })

  it('takes the Kundmachung that carries the Beschluss\'s date and the draft\'s words — and only one', () => {
    const b = beschluesse.find((s) => s.akt === '113253-2025')!
    const title = 'Gesetz, mit dem das Kärntner Rettungsdienstgesetz geändert wird'
    const right = lgbl('Gesetz vom 1. Oktober 2026, mit dem das Kärntner Rettungsdienstgesetz geändert wird', 'LGBl. Nr. 67/2026')
    expect(ktnKundmachung(b, title, [right, lgbl('Gesetz vom 1. Oktober 2026, mit dem das Kärntner Jagdgesetz 2000 geändert wird', 'LGBl. Nr. 66/2026')])).toBe(right)
    expect(ktnKundmachung(b, title, [lgbl('Gesetz vom 2. Oktober 2026, mit dem das Kärntner Rettungsdienstgesetz geändert wird', 'LGBl. Nr. 67/2026')])).toBeNull()
    // RIS writes the type with a trailing space now and then.
    expect(ktnKundmachung(b, title, [{ ...right, typ: 'Landesgesetz ' }])).toEqual({ ...right, typ: 'Landesgesetz ' })
    expect(ktnKundmachung(b, title, [right, { ...right, nr: 'LGBl. Nr. 68/2026' }])).toBeNull()
  })

  it('joins by Stück: a later round in the same Akt does not take an earlier draft\'s Vorlage', () => {
    const step = (stueck: number, date: string): KtnChainStep => ({ akt: '2275-2021', stueck, date, sitting: `Sitzung am ${date}`, title: 't', url: `https://www.ktn.gv.at/${stueck}.pdf`, documents: [] })
    const vorlagenOfAkt = [step(40, '2021-09-01'), step(210, '2025-06-01')]
    const next = ktnNextStuecke(['2275-2021-26', '2275-2021-180'])
    const first = ktnChainOf({ ...ktnPartsOfNumber('2275-2021-26'), nextStueck: next.get('2275-2021-26')!, title: 't' }, vorlagenOfAkt, [], null)
    const second = ktnChainOf({ ...ktnPartsOfNumber('2275-2021-180'), nextStueck: next.get('2275-2021-180')!, title: 't' }, vorlagenOfAkt, [], null)
    expect(first.procedure[0]!.date).toBe('2021-09-01')
    expect(second.procedure[0]!.date).toBe('2025-06-01')
  })

  it('records the Kundmachung as the monitor\'s finding, not as a step of the Land\'s record', () => {
    const chain = ktnChainOf(
      { ...ktnPartsOfNumber('113253-2025-38'), nextStueck: Infinity, title: 'Gesetz, mit dem das Kärntner Rettungsdienstgesetz geändert wird' },
      vorlagen,
      beschluesse,
      [lgbl('Gesetz vom 1. Oktober 2026, mit dem das Kärntner Rettungsdienstgesetz geändert wird', 'LGBl. Nr. 67/2026')],
    )
    expect(chain.stage).toMatchObject({ station: 'bgbl', detail: 'LGBl. Nr. 67/2026', via: 'suche', certainBy: 'beschluss' })
    expect(chain.procedure.map((s) => s.station)).toEqual(['rv', 'parlament'])
    expect(chain.documents.map((d) => d.title)).toEqual(['Regierungsvorlage', 'Regierungsvorlage, Erläuterungen', 'Regierungsvorlage, Textgegenüberstellung'])
  })

  it('marks a Vorlage or Beschluss without what follows as its own join, not as the Land\'s word that nothing followed', () => {
    const draft = { ...ktnPartsOfNumber('113253-2025-38'), nextStueck: Infinity, title: 'Gesetz, mit dem das Kärntner Rettungsdienstgesetz geändert wird' }
    // The gazette was read and holds no Gesetz of that date and title: a miss of our search.
    expect(ktnChainOf(draft, vorlagen, beschluesse, []).stage).toMatchObject({ station: 'parlament', joined: true })
    expect(ktnChainOf(draft, vorlagen, [], []).stage).toMatchObject({ station: 'rv', joined: true })
  })
})

describe('Kärnten — the Verordnungen, as served on 23.10.2026', () => {
  it('lists every tile once', () => {
    const tiles = parseKtnVoList(fixture('kaernten-verordnungen-2026-10-23.html'))
    expect(tiles).toHaveLength(28)
    expect(tiles.find((t) => t.detail === '1631')?.title).toBe('Begutachtungsentwurf 08-NATRE-124959/2026-2')
  })

  it('reads a draft with the Frist on its page, and its own sentence as the title', () => {
    const vo = parseKtnVoDetail(fixture('kaernten-verordnung-1631-2026-10-23.html'))
    expect(vo).toMatchObject({ deadline: '2026-10-29', email: null })
    expect(vo!.title).toMatch(/^Verordnung der Kärntner Landesregierung mit der das Europaschutzgebiet „Turnersee“ geändert wird$/)
    expect(vo!.letterUrl).toMatch(/Anschreiben/)
  })

  it('reads the Frist in words and the department\'s address', () => {
    expect(parseKtnVoDetail(fixture('kaernten-verordnung-1426-2026-10-23.html'))).toMatchObject({ deadline: '2026-01-19', email: 'abt5post@ktn.gv.at' })
    // `<a target="_new" href=…>`: the href need not come first.
    expect(parseKtnVoDetail(fixture('kaernten-verordnung-1369-2026-10-23.html'))).toMatchObject({ deadline: '2023-11-03', email: 'abt6.sport@ktn.gv.at' })
  })

  it('ends the title at the second sentence', () => {
    expect(parseKtnVoDetail(fixture('kaernten-verordnung-1615-2026-10-23.html'))!.title)
      .toBe('Verordnung betreffend Forstbezirke, Forstaufsichtsgebiete, Bezirksforstinspektionen und Forstaufsichtsstationen')
  })

  it('takes a tile that is no draft for none', () => {
    expect(parseKtnVoDetail(fixture('kaernten-verordnung-1309-2026-10-23.html'))).toBeNull()
  })

  it('reads the cover letter\'s date and span — letter-spaced too — and reckons the Frist from them', () => {
    const letter = ktnVoLetter('AMT DER KÄRNTNER LANDESREGIERUNG Datum 23.09.2026 Zahl 10-AR-VO-63163/2026-9 … wird um Stellungnahme innerhalb von v i e r Wochen ab Zustellung ersucht.')
    expect(letter).toEqual({ date: '2026-09-23', weeks: 4 })
    expect(ktnVoDeadline(letter)).toBe('2026-10-21')
    expect(ktnVoLetter('Datum 18. Dezember 2025 … Stellungnahme innerhalb von vier Wochen ab Zusendung')).toEqual({ date: '2025-12-18', weeks: 4 })
    expect(ktnVoDeadline(ktnVoLetter('Datum 18. Dezember 2025, ohne Frist'))).toBeNull()
  })
})
