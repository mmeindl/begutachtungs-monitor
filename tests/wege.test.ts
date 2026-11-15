import { describe, expect, it } from 'vitest'
import { SOURCE_PARAM, parseSourceList } from '../shared/utils/laender'
import { ANLIEGEN_PATH } from '../shared/utils/anliegen'
import { artChoiceLabel, artChoiceOf, draftFiltersFromQuery, draftUrlQuery } from '../app/utils/draftFilters'
import { anliegenArtOf } from '../app/utils/anliegenView'
import {
  EU_LEAD,
  WEGE,
  WEG_IDS,
  WEG_INSTRUMENTS,
  WEG_LEGEND,
  WEG_STATIONS,
  WEG_STATION_ORDER,
  isWegId,
  wegFor,
  wegGroups,
  wegHref,
} from '../app/utils/wege'

const isAnliegenLink = (href: string | null | undefined) => typeof href === 'string' && href.startsWith(`${ANLIEGEN_PATH}?`)

/** Every link into the list of Entwürfe: rows, station headers, the EU lead-in. */
const listLinks = [
  ...WEGE.map((w) => w.href).filter((h) => !isAnliegenLink(h)),
  ...WEG_STATIONS.map((s) => s.href),
  ...WEGE.map((w) => w.noteLink?.href ?? null).filter((h) => h !== null && h.startsWith('/entwuerfe')),
  EU_LEAD.list.href,
].filter((href): href is string => href !== null)

/* The parameters `/entwuerfe` reads: its filter contract (`draftUrlQuery`
 * writes exactly the keys `draftFiltersFromQuery` reads) and the source
 * choice (`useSourceChoice`). */
const LIST_PARAMS = new Set(['status', 'station', 'art', 'gp', 'ministry', 'q', 'sort', 'reverse', 'eu', 'begutachtung', SOURCE_PARAM])

function queryOf(href: string): Record<string, string> {
  const url = new URL(href, 'https://example.invalid')
  return Object.fromEntries(url.searchParams)
}

describe('wege matrix', () => {
  it('has unique ids, and every row id is exported', () => {
    const ids = WEGE.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual([...WEG_IDS].sort())
  })

  it('gives every row a cell for each of the five stations, in the rail order', () => {
    expect(WEG_STATION_ORDER).toEqual(['entwurf', 'begutachtung', 'rv', 'parlament', 'bgbl'])
    for (const w of WEGE) {
      expect(Object.keys(w.cells).sort()).toEqual([...WEG_STATION_ORDER].sort())
    }
  })

  it('every path passes at least one station for certain', () => {
    for (const w of WEGE) {
      expect(Object.values(w.cells).some((c) => c === 'durch' || c === 'stellungnahme'), w.id).toBe(true)
    }
  })

  it('a path the monitor does not follow says why, and has no list link', () => {
    for (const w of WEGE.filter((x) => x.notFollowed !== null)) {
      expect(w.notFollowed!.length).toBeGreaterThan(0)
      expect(w.href).toBeNull()
    }
  })

  it('groups every row once, Bund before Länder', () => {
    const groups = wegGroups()
    expect(groups.map((g) => g.level)).toEqual(['bund', 'land'])
    expect(groups.flatMap((g) => g.rows).length).toBe(WEGE.length)
  })

  it('a Staatsvertrag is always kundgemacht, only the Teil varies (BGBlG §§ 3–5), and takes no Stellungnahme in Parliament (RVS)', () => {
    const w = WEGE.find((x) => x.id === 'staatsvertrag')!
    expect(w.cells.bgbl).toBe('durch')
    expect(w.cells.rv).toBe('offen')
    expect(w.cells.parlament).toBe('offen')
    expect(Object.values(w.cells)).not.toContain('stellungnahme')
    expect(w.note).toMatch(/keine Stellungnahme/)
  })

  it('the law as read (wege-zu-einer-rechtsnorm.md): § 23b GOG-NR on committee and Bundesrat motions, no Begutachtung for a Verordnung by default', () => {
    const cell = (id: string) => WEGE.find((x) => x.id === id)!.cells
    expect(cell('ausschussantrag').parlament).toBe('stellungnahme')
    expect(cell('bundesrat-antrag').parlament).toBe('stellungnahme')
    expect(cell('volksbegehren').parlament).toBe('stellungnahme')
    expect(cell('verordnung-ohne-begutachtung').begutachtung).toBe('entfaellt')
    // The Antrag route holds a draft whose Vorlage came first (2/ME → 80 d.B. → 416/A).
    expect(cell('gesetz-als-antrag').rv).toBe('offen')
  })

  it('a Land row with a blue Begutachtung points to the law per Land, not to one right', () => {
    for (const w of WEGE.filter((x) => x.level === 'land' && x.cells.begutachtung === 'stellungnahme')) {
      expect(w.noteLink?.href, w.id).toMatch(/^\/datenlage\?ansicht=schritt#begutachtung-vorgeschrieben$/)
    }
  })

  it('no row claims a Landtag window as certain: four Länder leave it to a committee', () => {
    for (const w of WEGE.filter((x) => x.level === 'land')) expect(w.cells.parlament, w.id).not.toBe('stellungnahme')
  })

  it('the legend names every mark the matrix draws except the self-explaining dash', () => {
    const drawn = new Set(WEGE.flatMap((w) => Object.values(w.cells)))
    drawn.delete('entfaellt')
    expect(new Set(WEG_LEGEND.map((l) => l.cell))).toEqual(drawn)
  })
})

describe('instruments beside the path', () => {
  it('have unique ids, words for what one can do, and EU, Bund, Land in that order', () => {
    const ids = WEG_INSTRUMENTS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    const order = { eu: 0, bund: 1, land: 2 }
    const levels = WEG_INSTRUMENTS.map((i) => order[i.level])
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
    for (const i of WEG_INSTRUMENTS) expect(i.act.length, i.id).toBeGreaterThan(0)
  })

  it('the Volksabstimmung is the only binding one', () => {
    expect(WEG_INSTRUMENTS.filter((i) => i.binding).map((i) => i.id)).toEqual(['volksabstimmung'])
  })

  it('link only to official https pages, each with its words', () => {
    for (const i of WEG_INSTRUMENTS.filter((x) => x.href !== null)) {
      const url = new URL(i.href!)
      expect(url.protocol).toBe('https:')
      expect(url.hostname.endsWith('.gv.at') || url.hostname.endsWith('europa.eu'), i.id).toBe(true)
      expect(i.hrefLabel).toBeTruthy()
    }
    for (const i of WEG_INSTRUMENTS.filter((x) => x.href === null)) expect(i.hrefLabel).toBeNull()
  })
})

describe('Anliegen an das Parlament (15.11.2026)', () => {
  it('the Volksbegehren row is followed for its time in the Nationalrat and says what before it is not', () => {
    const w = WEGE.find((x) => x.id === 'volksbegehren')!
    expect(w.notFollowed).toBeNull()
    expect(w.note).toBe('im Monitor für seine Zeit im Nationalrat')
    expect(w.gap).toBe('Nicht im Monitor: Unterstützung und Eintragung vor dem Einlangen im Nationalrat.')
    expect(isAnliegenLink(w.href)).toBe(true)
    expect(anliegenArtOf(queryOf(w.href!).art)).toBe('volksbegehren')
  })

  it('only a followed row names a gap', () => {
    for (const w of WEGE.filter((x) => x.gap !== undefined)) {
      expect(w.notFollowed, w.id).toBeNull()
      expect(w.gap!.length, w.id).toBeGreaterThan(0)
    }
  })

  it('Petition, Bürgerinitiative and Volksbegehren link to their kind on /anliegen; Parliament’s explainer stays beside them', () => {
    const followed = WEG_INSTRUMENTS.filter((i) => i.monitorHref !== undefined)
    expect(followed.map((i) => i.id)).toEqual(['petition', 'buergerinitiative', 'volksbegehren'])
    for (const i of followed) {
      expect(isAnliegenLink(i.monitorHref), i.id).toBe(true)
      expect(Object.keys(queryOf(i.monitorHref!)), i.id).toEqual(['art'])
      expect(anliegenArtOf(queryOf(i.monitorHref!).art), i.id).toBe(i.id)
    }
    expect(WEG_INSTRUMENTS.find((i) => i.id === 'petition')!.href).toMatch(/^https:\/\/www\.parlament\.gv\.at\//)
    expect(WEG_INSTRUMENTS.find((i) => i.id === 'buergerinitiative')!.href).toMatch(/^https:\/\/www\.parlament\.gv\.at\//)
  })
})

describe('wege links into the list', () => {
  it('lead to /entwuerfe or /eu-recht only', () => {
    for (const href of listLinks) expect(href.startsWith('/entwuerfe?'), href).toBe(true)
    expect(EU_LEAD.href).toBe('/eu-recht')
  })

  it('use only parameters the list page reads', () => {
    for (const href of listLinks) {
      for (const key of Object.keys(queryOf(href))) expect(LIST_PARAMS.has(key), `${href}: ${key}`).toBe(true)
    }
  })

  it('carry values the list keeps: the filter round trip reproduces each link', () => {
    for (const href of listLinks) {
      const { [SOURCE_PARAM]: sources, ...filters } = queryOf(href)
      expect(draftUrlQuery(draftFiltersFromQuery(filters)), href).toEqual(filters)
      if (sources !== undefined) expect(parseSourceList(sources), href).not.toBeNull()
    }
  })

  it('a station header links only where the list has that tab', () => {
    expect(WEG_STATIONS.find((s) => s.id === 'entwurf')!.href).toBeNull()
    for (const s of WEG_STATIONS.filter((x) => x.id !== 'entwurf')) {
      expect(draftFiltersFromQuery(queryOf(s.href!)).stations).toEqual([s.id])
    }
  })

  it('a row of „Ohne Entwurf" opens the select\'s option of the same name (14.11.2026)', () => {
    const optionOf = (id: string) => {
      const f = draftFiltersFromQuery(queryOf(WEGE.find((w) => w.id === id)!.href!))
      return artChoiceLabel(artChoiceOf(f.art, f.begutachtung))
    }
    expect(optionOf('vorlage-ohne-begutachtung')).toBe('Regierungsvorlagen ohne Entwurf')
    expect(optionOf('antrag-ohne-begutachtung')).toBe('Initiativanträge ohne Entwurf')
    expect(optionOf('landesgesetz-ohne-entwurf')).toBe('Landesgesetze ohne zugeordneten Entwurf')
    expect(optionOf('gesetz')).toBe('Gesetzesentwürfe')
    expect(optionOf('gesetz-als-antrag')).toBe('Gesetzesentwürfe, als Initiativantrag eingebracht')
    expect(optionOf('verordnung')).toBe('Verordnungsentwürfe')
    // The treaties' Vorlagen have their own option (step 5, decision 3 of 14.11.2026).
    expect(optionOf('staatsvertrag')).toBe('Staatsverträge')
  })

  it('the Länder rows open the Länder alone', () => {
    for (const w of WEGE.filter((x) => x.level === 'land' && x.href)) {
      const sources = parseSourceList(queryOf(w.href!)[SOURCE_PARAM])
      expect(sources).not.toBeNull()
      expect(sources).not.toContain('bund')
    }
  })
})

describe('wegFor', () => {
  it('maps a record to its row, or to none where none fits for certain', () => {
    expect(wegFor({ source: 'ministerialentwurf', viaAntrag: false })).toBe('gesetz')
    expect(wegFor({ source: 'ministerialentwurf', viaAntrag: true })).toBe('gesetz-als-antrag')
    expect(wegFor({ source: 'ris', kind: 'verordnung' })).toBe('verordnung')
    expect(wegFor({ source: 'ris', kind: 'gesetz' })).toBe('gesetz')
    expect(wegFor({ source: 'ris', kind: 'unbestimmt' })).toBeNull()
    expect(wegFor({ source: 'vorlage', ityp: 'I', withoutBegutachtung: true })).toBe('vorlage-ohne-begutachtung')
    expect(wegFor({ source: 'vorlage', ityp: 'A', withoutBegutachtung: true })).toBe('antrag-ohne-begutachtung')
    expect(wegFor({ source: 'vorlage', ityp: 'I', withoutBegutachtung: false })).toBeNull()
    expect(wegFor({ source: 'land', kind: 'gesetz' })).toBe('landesgesetz')
    expect(wegFor({ source: 'land', kind: 'verordnung' })).toBe('landesverordnung')
    expect(wegFor({ source: 'landesgesetz' })).toBe('landesgesetz-ohne-entwurf')
  })

  it('builds a link the page reads back', () => {
    for (const id of WEG_IDS) {
      const weg = new URL(wegHref(id), 'https://example.invalid').searchParams.get('weg')
      expect(isWegId(weg)).toBe(true)
    }
    expect(isWegId('nope')).toBe(false)
  })
})
