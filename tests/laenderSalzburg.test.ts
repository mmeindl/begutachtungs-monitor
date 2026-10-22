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
import { formatSourceList, isDefaultSources, landCoverageDe, landDraftPath, landShortTitle, parseSourceList } from '../shared/utils/laender'

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

  it('keeps an annex whose draft is not on the list as a row of its own', () => {
    const drafts = salzburgDrafts([{ title: 'Verordnung X - Anlage I', url: 'https://service.salzburg.gv.at/pub/get/2', deadline: '2026-11-01' }], 'verordnung')
    expect(drafts.map((d) => d.title)).toEqual(['Verordnung X (Anlage I)'])
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

  it('states the coverage', () => {
    expect(landCoverageDe()).toBe('Oberösterreich, Salzburg und Wien – 3 von 9')
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
})

describe('Land rows in the list order', () => {
  it('orders closed drafts without a Frist by their start, newest first', async () => {
    const { compareRowsByFrist, landRow } = await import('../shared/utils/draftOrder')
    const row = (id: string, startedAt: string) => landRow({ id, land: 'sbg', kind: 'gesetz', title: id, startedAt, deadline: null, url: '', documents: [], active: false })
    const sorted = [row('a', '2015-10-28'), row('b', '2017-01-18'), row('c', '2016-03-31')].sort(compareRowsByFrist)
    expect(sorted.map((r) => r.key)).toEqual(['land-b', 'land-c', 'land-a'])
  })
})
