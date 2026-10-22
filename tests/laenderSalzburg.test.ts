import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SALZBURG_LISTS, parseSalzburgList, salzburgDrafts } from '../server/utils/laender/salzburg'
import { LandSourceError } from '../server/utils/laender/gate'
import { formatLandList, landCoverageDe, parseLandList } from '../shared/utils/laender'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/laender/${name}`, import.meta.url), 'utf8')
const GESETZE = fixture('salzburg-gesetze-2026-10-22.html')
const VERORDNUNGEN = fixture('salzburg-verordnungen-2026-10-22.html')

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
    const drafts = salzburgDrafts([{ title: 'Verordnung X - Anlage I', url: 'https://service.salzburg.gv.at/pub/get/1', deadline: '2026-11-01' }], 'verordnung')
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

describe('the reader’s choice of Länder', () => {
  it('reads the URL value, keeping „said: none" apart from „not said"', () => {
    expect(parseLandList('sbg')).toEqual(['sbg'])
    expect(parseLandList('SBG, xyz')).toEqual(['sbg'])
    expect(parseLandList('')).toEqual([])
    expect(parseLandList(null)).toBeNull()
    expect(formatLandList(['sbg'])).toBe('sbg')
  })

  it('states the coverage', () => {
    expect(landCoverageDe()).toBe('Salzburg – 1 von 9 Ländern')
  })
})
