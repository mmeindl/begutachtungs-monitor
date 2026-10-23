import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SALZBURG_LISTS,
  SALZBURG_REGISTERS,
  parseSalzburgList,
  parseSalzburgRegister,
  parseSalzburgStatements,
  salzburgDrafts,
  submitterOfFile,
} from '../server/utils/laender/salzburg'
import { LandSourceError } from '../server/utils/laender/gate'
import { formatSourceList, isDefaultSources, landDraftPath, landLawGroupTitle, landShortTitle, parseSourceList } from '../shared/utils/laender'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/laender/${name}`, import.meta.url), 'utf8')
const GESETZE = fixture('salzburg-gesetze-2026-10-22.html')
const VERORDNUNGEN = fixture('salzburg-verordnungen-2026-10-22.html')
/* The Gesetze register trimmed to 531 of its 836 rows, whitespace collapsed. */
const REGISTER = fixture('salzburg-register-gesetze-2026-10-22.html')

describe('Salzburg — the list page, as served on 22.10.2026', () => {
  it('reads every entry with its document and Frist', () => {
    const entries = parseSalzburgList(GESETZE, SALZBURG_LISTS.gesetz)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      title: 'Gesetz, mit dem das Salzburger Energieeffizienzgesetz erlassen und das S.EU-Rechtsvorschriften-Begleitgesetz geändert wird',
      url: 'https://service.salzburg.gv.at/pub/get/35442',
      deadline: '2026-10-27',
    })
  })

  it('folds a Verordnung’s annexes into the draft they belong to', () => {
    const drafts = salzburgDrafts(parseSalzburgList(VERORDNUNGEN, SALZBURG_LISTS.verordnung), 'verordnung')
    expect(drafts).toHaveLength(8)
    const rehhof = drafts.find((d) => d.title.includes('Schongebietsverordnung Rehhof'))!
    expect(rehhof.id).toBe('sbg-35580')
    expect(rehhof.documents.map((d) => d.title)).toEqual(['Entwurf', 'Anlage I', 'Anlage II'])
    expect(drafts.every((d) => d.kind === 'verordnung' && d.land === 'sbg')).toBe(true)
  })

  const entry = (n: number, title: string) => ({ title, url: `https://service.salzburg.gv.at/pub/get/${n}`, startedAt: '2024-11-05' })

  it('keeps an annex whose draft is not on the list as a row of its own, under the draft’s title', () => {
    const drafts = salzburgDrafts([{ title: 'Verordnung X - Anlage I', url: 'https://service.salzburg.gv.at/pub/get/2', deadline: '2026-11-01' }], 'verordnung')
    expect(drafts.map((d) => d.title)).toEqual(['Verordnung X'])
    expect(drafts[0]!.documents.map((d) => d.title)).toEqual(['Anlage I'])
  })

  it('makes one row of a Verordnung filed only as its annexes', () => {
    const drafts = salzburgDrafts([
      entry(31228, 'Verordnung Riedelwald - Anlage 1'),
      entry(31229, 'Verordnung Riedelwald - Anlage 2 Blatt 1'),
      entry(31230, 'Verordnung Riedelwald - Anlage 2 Blatt 2'),
    ], 'verordnung')
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ id: 'sbg-31228', title: 'Verordnung Riedelwald' })
    expect(drafts[0]!.documents.map((d) => d.title)).toEqual(['Anlage 1', 'Anlage 2 Blatt 1', 'Anlage 2 Blatt 2'])
  })

  it('puts the draft first when it is filed after its annex', () => {
    const drafts = salzburgDrafts([entry(5, 'Verordnung Y - Anlage I'), entry(6, 'Verordnung Y')], 'verordnung')
    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.documents.map((d) => d.title)).toEqual(['Entwurf', 'Anlage I'])
    expect(drafts[0]!.url).toBe('https://service.salzburg.gv.at/pub/get/6')
    // The draft's own number, the row's address before the fold.
    expect(drafts[0]!.id).toBe('sbg-6')
  })

  it('does not let a same-titled draft years later adopt an old annex', () => {
    const drafts = salzburgDrafts([
      { ...entry(18182, 'Gesetz Z - Anlage'), startedAt: '2006-01-10' },
      { ...entry(18447, 'Gesetz Z'), startedAt: '2015-02-01' },
    ], 'gesetz')
    expect(drafts).toHaveLength(2)
  })

  it('folds any addition after a separator, in the Land’s words — not a list of them', () => {
    const base = 'Verordnung, mit der die Seenschutzverordnung geändert wird'
    const drafts = salzburgDrafts([
      entry(10, base),
      entry(11, `${base} - Lageplan`),
      entry(12, `${base}; Plan`),
      entry(13, `${base} -Übersichtskarte`),
      entry(14, `${base} - Textgegenüerstellung`),
    ], 'verordnung')
    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.documents.map((d) => d.title)).toEqual(['Entwurf', 'Lageplan', 'Plan', 'Übersichtskarte', 'Textgegenüerstellung'])
  })

  it('keeps a later draft whose title extends an older one: a year is no attachment', () => {
    const base = 'Verordnung des Landeshauptmannes von Salzburg zur Änderung des Kehrtarifs'
    const drafts = salzburgDrafts([
      { ...entry(30610, base), startedAt: '2024-07-25' },
      { ...entry(32624, `${base} – Valorisierung 2025`), startedAt: '2025-06-30' },
    ], 'verordnung')
    expect(drafts).toHaveLength(2)
  })

  it('folds a document filed months later, and not years later', () => {
    const base = 'Gesetz, mit dem das Salzburger Gleichbehandlungsgesetz geändert wird'
    const late = salzburgDrafts([{ ...entry(18197, base), startedAt: '2015-04-07' }, { ...entry(18198, `${base} - TGÜ`), startedAt: '2015-11-09' }], 'gesetz')
    expect(late).toHaveLength(1)
    const decade = salzburgDrafts([{ ...entry(18455, base), startedAt: '2008-06-12' }, { ...entry(23090, `${base} (inkl. Textgegenüberstellung)`), startedAt: '2020-10-27' }], 'gesetz')
    expect(decade).toHaveLength(2)
  })

  it('does not take a longer law for an annex: a bare space is no separator', () => {
    const drafts = salzburgDrafts([
      entry(20, 'Gesetz, mit dem das A geändert wird'),
      entry(21, 'Gesetz, mit dem das A geändert wird und das B erlassen wird'),
    ], 'gesetz')
    expect(drafts).toHaveLength(2)
  })

  it('folds an annex that names its draft another way, filed right after it (35593, 23.10.2026)', () => {
    const drafts = salzburgDrafts([
      entry(35593, 'Verordnung der Landesregierung, mit der die Grundversorgungs-Verordnung geändert wird'),
      entry(35594, 'Verordnung, mit der die Grundversorgungs-Verordnung geändert wird - Textgegenüberstellung'),
    ], 'verordnung')
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ id: 'sbg-35593', title: 'Verordnung der Landesregierung, mit der die Grundversorgungs-Verordnung geändert wird' })
    expect(drafts[0]!.documents.map((d) => d.title)).toEqual(['Entwurf', 'Textgegenüberstellung'])
    // A year in the title is no name: „Naturschutzgesetz 1998 … - TGÜ" for 1999 (18194).
    expect(salzburgDrafts([
      entry(18194, 'Gesetz, mit dem das Salzburger Naturschutzgesetz 1999 geändert wird'),
      entry(18195, 'Gesetz, mit dem das Salzburger Naturschutzgesetz 1998 geändert wird - TGÜ'),
    ], 'gesetz')).toHaveLength(1)
  })

  it('folds such an annex only into the draft filed right before it, and only where it names nothing else', () => {
    // Not adjacent: another entry stood between them.
    expect(salzburgDrafts([
      entry(100, 'Verordnung der Landesregierung, mit der die X-Verordnung geändert wird'),
      entry(104, 'Verordnung, mit der die X-Verordnung geändert wird - Textgegenüberstellung'),
    ], 'verordnung')).toHaveLength(2)
    // Two drafts filed together: the second's plan is not the first's.
    expect(salzburgDrafts([
      entry(200, 'Verordnung, mit der Anordnungen zum Schutz des Grundwassers erlassen werden (Schongebietsverordnung Rehhof)'),
      entry(201, 'Verordnung, mit der Anordnungen zum Schutz des Grundwassers erlassen werden (Schongebietsverordnung Taxach) - Plan'),
    ], 'verordnung')).toHaveLength(2)
  })

  it('reads „X - Entwurf" as the draft X, whose Erläuterungen follow (29477, 32075)', () => {
    const base = 'Verordnung der Salzburger Landesregierung, mit der die Wohnbauförderungsverordnung 2015 geändert wird'
    const drafts = salzburgDrafts([
      { ...entry(29093, base), startedAt: '2023-10-02' },
      { ...entry(29477, `${base} - Entwurf`), startedAt: '2024-01-17' },
      { ...entry(29478, `${base} - Erläuterungen`), startedAt: '2024-01-17' },
    ], 'verordnung')
    expect(drafts).toHaveLength(2)
    // The Erläuterungen are the new draft's, not the older one's of the same title.
    expect(drafts.find((d) => d.id === 'sbg-29093')!.documents.map((d) => d.title)).toEqual(['Entwurf'])
    expect(drafts.find((d) => d.id === 'sbg-29477')).toMatchObject({ title: base })
    expect(drafts.find((d) => d.id === 'sbg-29477')!.documents.map((d) => d.title)).toEqual(['Entwurf', 'Erläuterungen'])
  })

  it('puts a plan filed before its draft under the draft, with the draft’s number (7654, 34471)', () => {
    const base = 'Verordnung der Salzburger Landesregierung, mit der die Tauglgries - Natur- und Europaschutzgebietsverordnung geändert wird'
    const drafts = salzburgDrafts([entry(7654, `${base} - Plan`), entry(7655, base)], 'verordnung')
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ id: 'sbg-7655', title: base })
    expect(drafts[0]!.documents.map((d) => d.title)).toEqual(['Entwurf', 'Plan'])
  })

  it('takes titles that differ only in spacing and punctuation for one (31215 and its annexes)', () => {
    const base = 'Verordnung des Landeshauptmannes, mit der Anordnungen zum Schutz des Grundwasservorkommens erlassen werden'
    const drafts = salzburgDrafts([
      entry(31215, `${base} (Schongebietsverordnung Riedelwaldplatte)`),
      entry(31216, 'Kundmachung der Salzburger Landesregierung über die Höhe der Richtsätze'),
      entry(31228, `${base} (Schongebietsverordnung Riedelwald-platte) - Anlage 1`),
      entry(31229, `${base} (Schongebietsverordnung Riedelwald-platte) - Anlage 2 Blatt 1`),
    ], 'verordnung')
    expect(drafts).toHaveLength(2)
    expect(drafts.find((d) => d.id === 'sbg-31215')!.documents.map((d) => d.title)).toEqual(['Entwurf', 'Anlage 1', 'Anlage 2 Blatt 1'])
  })

  it('folds a Textgegenüberstellung filed years late when the Land numbered it right after its draft (18170)', () => {
    const base = 'Gesetz, mit dem das Salzburger Landes-Personalvertretungsgesetz geändert wird'
    expect(salzburgDrafts([
      { ...entry(18170, base), startedAt: '2016-04-25' },
      { ...entry(18171, `${base} - Textgegenüberstellung`), startedAt: '2017-07-25' },
    ], 'gesetz')).toHaveLength(1)
  })
})

/**
 * The gate: a page that is not the list must never read as an empty list.
 * Each case is a way a Land's site has been seen to fail, or plausibly will.
 */
describe('Salzburg — the gate', () => {
  const refuses = (html: string) => expect(() => parseSalzburgList(html, SALZBURG_LISTS.gesetz)).toThrow(LandSourceError)

  it('refuses a maintenance page served with HTTP 200', () => {
    refuses('<html><body><h1>Wartungsarbeiten</h1><p>Die Seite ist vorübergehend nicht erreichbar.</p></body></html>')
  })

  it('refuses a page whose stated count differs from the entries read', () => {
    refuses(GESETZE.replace('2 Einträge', '3 Einträge'))
  })

  it('refuses an entry without a Frist', () => {
    refuses(GESETZE.replace('Ende der Begutachtungsfrist: 27.10.2026', 'Frist folgt'))
  })

  it('refuses an impossible date rather than guess one', () => {
    refuses(GESETZE.replace('27.10.2026', '31.02.2026'))
  })

  it('accepts an empty list only when the page says so itself', () => {
    const empty = GESETZE.replace('2 Einträge', 'Keine Einträge').replace(/<li class="margin-bottom-big">[\s\S]*?<\/li>/g, '')
    expect(parseSalzburgList(empty, SALZBURG_LISTS.gesetz)).toEqual([])
  })
})

describe('the reader’s choice of sources', () => {
  it('reads the URL value in display order, and never as an empty choice', () => {
    expect(parseSourceList('w,bund')).toEqual(['bund', 'w'])
    expect(parseSourceList('SBG, xyz')).toEqual(['sbg'])
    // Naming nothing known is not a choice: the caller falls back.
    expect(parseSourceList('')).toBeNull()
    expect(parseSourceList('xyz')).toBeNull()
    expect(parseSourceList(null)).toBeNull()
    expect(formatSourceList(['w', 'bund'])).toBe('bund,w')
  })

  it('knows the default, which the address and the cookie leave out', () => {
    expect(isDefaultSources(['bund'])).toBe(true)
    expect(isDefaultSources(['bund', 'sbg'])).toBe(false)
  })
})

/**
 * The register: every draft since 2004, the running ones included. What the
 * page of a closed draft stands on, so a shared link outlives the Frist.
 */
describe('Salzburg — the register', () => {
  const drafts = salzburgDrafts(parseSalzburgRegister(REGISTER, SALZBURG_REGISTERS.gesetz), 'gesetz')

  it('reads the start of the Begutachtung, not its end', () => {
    const energie = drafts.find((d) => d.id === 'sbg-35442')!
    expect(energie.startedAt).toBe('2026-09-29')
    expect(energie.deadline).toBeNull()
  })

  it('folds a Textgegenüberstellung into its draft, by the nearest number below', () => {
    const mindestsicherung = drafts.find((d) => d.id === 'sbg-18041')!
    expect(mindestsicherung.documents.map((d) => d.title)).toEqual(['Entwurf', 'Textgegenüberstellung'])
    // The same title three numbers earlier keeps its own documents.
    expect(drafts.find((d) => d.id === 'sbg-18040')!.documents).toHaveLength(1)
    expect(drafts.some((d) => d.id === 'sbg-18042')).toBe(false)
  })

  it('refuses a page that is not the register', () => {
    expect(() => parseSalzburgRegister(GESETZE, SALZBURG_REGISTERS.gesetz)).toThrow(LandSourceError)
    const shrunk = REGISTER.replace(/<tr>[\s\S]*<\/tr>/, '')
    expect(() => parseSalzburgRegister(shrunk, SALZBURG_REGISTERS.gesetz)).toThrow(LandSourceError)
  })
})

describe('Salzburg — published Stellungnahmen', () => {
  it('names an organisation and withholds what is not certainly one', () => {
    const url = 'https://service.salzburg.gv.at/pub/get/attachments/35442'
    expect(parseSalzburgStatements(fixture('salzburg-stellungnahmen-35442-2026-10-22.html'), url)).toEqual([
      { name: 'Arbeiterkammer Salzburg', url: 'https://service.salzburg.gv.at/pub/get/attachment/23538443' },
      { name: null, url: 'https://service.salzburg.gv.at/pub/get/attachment/23536003' },
    ])
  })

  it('reads the submitter off the file name, without the Land’s Geschäftszahl', () => {
    expect(submitterOfFile('Arbeiterkammer Salzburg WIRT-818-33.pdf')).toBe('Arbeiterkammer Salzburg')
    expect(submitterOfFile('Caritas_Salzburg_SOZ-1201-165-235.pdf')).toBe('Caritas Salzburg')
    expect(submitterOfFile('IG Windkraft RUB-900-208-27- .pdf')).toBe('IG Windkraft')
    expect(submitterOfFile('Personalvertretung Fraktion FCG_ÖABB&amp;Unabhängige DR-325-62.pdf')).toBe('Personalvertretung Fraktion FCG ÖABB&Unabhängige')
  })
})

describe('a Land draft’s short name and page', () => {
  it('takes the short name a title ends with, and nothing else', () => {
    expect(landShortTitle('Verordnung der Salzburger Landesregierung, mit der pensionsrechtliche Bestimmungen erlassen werden (Pensionsverordnung 2027)')).toBe('Pensionsverordnung 2027')
    expect(landShortTitle('Verordnung X (Anlage I)')).toBeNull()
    expect(landShortTitle('Gesetz, mit dem das Jagdgesetz 1993 geändert wird')).toBeNull()
  })

  it('addresses the page by the Land’s name and number', () => {
    expect(landDraftPath('sbg', 'sbg-35442')).toBe('/entwuerfe/salzburg/35442')
  })

  it('names a comparison’s group by the title without date, blanks and running number', () => {
    // The draft and the Vorlage leave the date blank, the Landesgesetzblatt numbers its pieces.
    expect(landLawGroupTitle('Gesetz vom ......................................., mit dem das Salzburger Raumordnungsgesetz 2009 geändert wird'))
      .toBe('Gesetz, mit dem das Salzburger Raumordnungsgesetz 2009 geändert wird')
    expect(landLawGroupTitle('11. Gesetz vom 4. Februar 2026, mit dem das Salzburger Raumordnungsgesetz 2009 geändert wird'))
      .toBe('Gesetz, mit dem das Salzburger Raumordnungsgesetz 2009 geändert wird')
    expect(landLawGroupTitle('Verordnung der Salzburger Landesregierung vom …………, mit der die Hegeschau-Verordnung geändert wird'))
      .toBe('Verordnung der Salzburger Landesregierung, mit der die Hegeschau-Verordnung geändert wird')
    expect(landLawGroupTitle('Gesetz vom 2. Juli 2025 über die Förderung des Sports')).toBe('Gesetz über die Förderung des Sports')
    // An Artikel's own name stays as it is; so does a date that is part of a law's name.
    expect(landLawGroupTitle('Artikel I Änderung des Oö. Agrarrecht-Organisationsgesetzes')).toBe('Artikel I Änderung des Oö. Agrarrecht-Organisationsgesetzes')
    expect(landLawGroupTitle('Änderung des Gesetzes vom 24. April 2002')).toBe('Änderung des Gesetzes vom 24. April 2002')
    expect(landLawGroupTitle('')).toBe('')
  })
})

describe('Land rows in the list order', () => {
  it('orders closed drafts without a Frist by their start, newest first', async () => {
    const { compareRowsByFrist, landRow } = await import('../shared/utils/draftOrder')
    const row = (id: string, startedAt: string) => landRow({ id, land: 'sbg', kind: 'gesetz', title: id, startedAt, deadline: null, url: '', documents: [], active: false })
    const sorted = [row('a', '2015-10-28'), row('b', '2017-01-18'), row('c', '2016-03-31')].sort(compareRowsByFrist)
    expect(sorted.map((r) => r.key)).toEqual(['land-b', 'land-c', 'land-a'])
  })
})
