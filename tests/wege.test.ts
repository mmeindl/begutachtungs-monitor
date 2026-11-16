import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SOURCE_PARAM, parseSourceList } from '../shared/utils/laender'
import { ANLIEGEN_PATH } from '../shared/utils/anliegen'
import { artChoiceLabel, artChoiceOf, draftFiltersFromQuery, draftUrlQuery } from '../app/utils/draftFilters'
import { anliegenArtOf } from '../app/utils/anliegenView'
import { EU_RAIL_DE } from '../app/utils/euRail'
import { EU_BUERGERINITIATIVE_DE } from '../app/utils/euBuergerinitiative'
import { EU_MEMBER_STATE_NAME_DE, euPath, euWegePath } from '../shared/utils/eu'
import { buildSitemap } from '../server/utils/feeds'
import {
  ANLIEGEN_MATRIX,
  ANLIEGEN_STATION_NAMES,
  ECI_MATRIX,
  EU_IMPLEMENTING_LIST,
  EU_MATRIX,
  EU_WEG_IDS,
  NATIONAL_MATRICES,
  WEGE,
  WEGE_PAGES,
  WEGE_PATH,
  WEGE_PATH_OF,
  WEGE_STATE,
  WEG_MATRICES,
  WEG_IDS,
  WEG_INSTRUMENTS,
  WEG_LEGEND,
  WEG_SEAMS,
  WEG_STATIONS,
  WEG_STATION_ORDER,
  WEGE_COPY,
  euWegFor,
  isWegId,
  wegCellLabel,
  wegFor,
  wegGroups,
  wegHeaderLabel,
  wegHref,
  wegLegend,
  wegSelected,
  wegePageMatrices,
  wegePageRows,
} from '../app/utils/wege'

const isAnliegenLink = (href: string | null | undefined) => typeof href === 'string' && href.startsWith(`${ANLIEGEN_PATH}?`)

/** Every link into the list of Entwürfe: rows, station headers, the EU lead-in. */
const listLinks = [
  ...WEGE.map((w) => w.href).filter((h) => !isAnliegenLink(h)),
  ...WEG_STATIONS.map((s) => s.href),
  ...WEGE.map((w) => w.noteLink?.href ?? null).filter((h) => h !== null && h.startsWith('/entwuerfe')),
  EU_IMPLEMENTING_LIST.href,
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

  it('the legend names every mark the matrices draw, the dash too', () => {
    const drawn = new Set(WEG_MATRICES.flatMap((m) => m.groups.flatMap((g) => g.rows.flatMap((r) => Object.values(r.cells)))))
    expect(new Set(WEG_LEGEND.map((l) => l.cell))).toEqual(drawn)
  })

  it('each page\'s legend names every mark that page draws and no other (16.11.2026)', () => {
    for (const page of Object.values(WEGE_PAGES)) {
      const drawn = new Set(wegePageRows(page).flatMap((r) => Object.values(r.cells)))
      expect(new Set(wegLegend(page).map((l) => l.cell)), page.path).toEqual(drawn)
    }
    // The blue mark names only the ways to take part the page's rows name.
    const blue = (j: keyof typeof WEGE_PAGES) => wegLegend(WEGE_PAGES[j]).find((l) => l.cell === 'stellungnahme')!.label
    expect(blue(WEGE_STATE)).toBe('Stellungnahme oder Unterstützung möglich')
    expect(blue('eu')).toBe('Rückmeldung oder Unterstützung möglich')
  })

  it('an Ausschussbegutachtung is drawn in one place: „je nach Fall" at Begutachtung, at both levels (16.11.2026)', () => {
    for (const id of ['vorlage-ohne-begutachtung', 'antrag-ohne-begutachtung', 'ausschussantrag', 'landtag-antrag']) {
      const w = WEGE.find((x) => x.id === id)!
      expect(w.cells.begutachtung, id).toBe('offen')
    }
    // The Landtag itself every motion passes.
    expect(WEGE.find((x) => x.id === 'landtag-antrag')!.cells.parlament).toBe('durch')
  })
})

const rowsOf = (m: (typeof WEG_MATRICES)[number]) => m.groups.flatMap((g) => g.rows)
const rowOf = (m: (typeof WEG_MATRICES)[number], id: string) => rowsOf(m).find((r) => r.id === id)!

describe('the matrices with rails of their own (16.11.2026)', () => {
  it('the national matrices come first, Bund then Länder, each the five stations, together every row of WEGE', () => {
    expect(WEG_MATRICES.slice(0, 2)).toEqual([...NATIONAL_MATRICES])
    // Each page: how a text becomes law, then how people start something themselves (16.11.2026: one page per jurisdiction).
    expect(WEG_MATRICES.map((m) => m.id)).toEqual(['bund', 'land', 'anliegen', 'eu', 'eci'])
    expect(wegePageMatrices(WEGE_PAGES[WEGE_STATE]).map((m) => m.id)).toEqual(['bund', 'land', 'anliegen'])
    expect(wegePageMatrices(WEGE_PAGES.eu).map((m) => m.id)).toEqual(['eu', 'eci'])
    expect(WEGE_COPY.title).toBe('Wege der Gesetzgebung')
    expect(NATIONAL_MATRICES.map((m) => m.id)).toEqual(['bund', 'land'])
    for (const m of NATIONAL_MATRICES) expect(m.stations.map((s) => s.id)).toEqual([...WEG_STATION_ORDER])
    expect(NATIONAL_MATRICES.flatMap(rowsOf).map((r) => r.id)).toEqual(WEGE.map((w) => w.id))
  })

  it('a header breaks a compound only at its joint, and leaves every other name alone (16.11.2026)', () => {
    expect(wegHeaderLabel('Regierungsvorlage')).toBe('Regierungs\u00ADvorlage')
    expect(wegHeaderLabel('Landesgesetzblatt')).toBe('Landes\u00ADgesetz\u00ADblatt')
    expect(wegHeaderLabel('Parlament und Rat')).toBe('Parlament und Rat')
    // Without the marks the name is the station's own, in every matrix.
    for (const s of WEG_MATRICES.flatMap((m) => m.stations)) expect(wegHeaderLabel(s.label).replaceAll('\u00AD', '')).toBe(s.label)
  })

  it('the first column is „Weg" in every matrix: the bar under it names whose ways (16.11.2026)', () => {
    expect(new Set(WEG_MATRICES.map((m) => m.pathColumn))).toEqual(new Set(['Weg']))
  })

  it('each level names its last two stations itself, and no sentence translates a shared header (16.11.2026)', () => {
    const [bund, land] = NATIONAL_MATRICES
    expect(bund!.stations.map((s) => s.label)).toEqual(['Entwurf', 'Begutachtung', 'Regierungsvorlage', 'Parlament', 'Bundesgesetzblatt'])
    expect(land!.stations.map((s) => s.label)).toEqual(['Entwurf', 'Begutachtung', 'Regierungsvorlage', 'Landtag', 'Landesgesetzblatt'])
    expect(NATIONAL_MATRICES.flatMap((m) => m.groups.map((g) => g.note))).toEqual([null, null])
    // A Länder header opens the list with the Länder alone, as the Länder rows do; the Bund's is the plain tab.
    expect(bund!.stations.map((s) => s.href)).toEqual(WEG_STATIONS.map((s) => s.href))
    for (const s of land!.stations.filter((x) => x.href)) expect(s.href).toMatch(/^\/entwuerfe\?station=\w+&quellen=bgld,/)
  })

  it('every row has a cell for each station of its matrix and passes one for certain; ids are unique across the pages', () => {
    const ids = WEG_MATRICES.flatMap(rowsOf).map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of WEG_MATRICES) {
      for (const r of rowsOf(m)) {
        expect(Object.keys(r.cells).sort(), r.id).toEqual(m.stations.map((s) => s.id).sort())
        expect(Object.values(r.cells).some((c) => c === 'durch' || c === 'stellungnahme'), r.id).toBe(true)
      }
    }
  })

  it('the EU act\'s columns are the rail\'s stations, by the rail\'s names, in its order', () => {
    expect(EU_MATRIX.stations.map((s) => s.label)).toEqual([
      EU_RAIL_DE.name.konsultation, EU_RAIL_DE.name.vorschlag, EU_RAIL_DE.name['parlament-rat'], EU_RAIL_DE.name.amtsblatt,
      `${EU_RAIL_DE.name.umsetzung} oder ${EU_RAIL_DE.name.geltung}`,
    ])
    expect(rowOf(EU_MATRIX, 'eu-richtlinie').stationLabels?.wirkung).toBe('Umsetzung')
    expect(rowOf(EU_MATRIX, 'eu-verordnung').stationLabels?.wirkung).toBe('Geltung')
  })

  it('an EU act: Rückmeldung at the Commission\'s windows, none at Parlament und Rat; a Commission act passes neither of them as a proposal', () => {
    for (const id of ['eu-richtlinie', 'eu-verordnung']) {
      const r = rowOf(EU_MATRIX, id)
      expect(r.cells, id).toEqual({ konsultation: 'stellungnahme', vorschlag: 'stellungnahme', beschluss: 'durch', amtsblatt: 'durch', wirkung: 'durch' })
      expect(wegCellLabel(r, 'stellungnahme')).toBe('Rückmeldung möglich')
    }
    // The directive's row leads to the directives Austria has to transpose; the open windows stand behind the two stations that carry them.
    expect(rowOf(EU_MATRIX, 'eu-richtlinie').href).toBe('/eu-recht#eu-umsetzung')
    expect(rowOf(EU_MATRIX, 'eu-verordnung').href).toBe('/eu-recht#eu-fenster')
    expect(EU_MATRIX.stations.map((s) => s.href)).toEqual(['/eu-recht#eu-fenster', '/eu-recht#eu-fenster', null, null, null])
    expect(rowOf(EU_MATRIX, 'eu-kommission').cells).toEqual({ konsultation: 'offen', vorschlag: 'stellungnahme', beschluss: 'entfaellt', amtsblatt: 'durch', wirkung: 'durch' })
    expect(rowOf(EU_MATRIX, 'eu-richtlinie').noteLink).toEqual(EU_IMPLEMENTING_LIST)
    // The seam back (16.11.2026): the note's own words lead to the country's ways.
    expect(rowOf(EU_MATRIX, 'eu-richtlinie').note).toBe('Umsetzung durch Bund oder Land')
    expect(rowOf(EU_MATRIX, 'eu-richtlinie').noteHref).toBe(WEGE_PATH)
  })

  it('a European Citizens\' Initiative: its rail\'s stations, Unterstützung at „Sammlung", the rest only with a million', () => {
    const n = EU_BUERGERINITIATIVE_DE.name
    expect(ECI_MATRIX.stations.map((s) => s.label)).toEqual([n.registrierung, n.sammlung, n.pruefung, n.einreichung, n.antwort])
    const r = rowOf(ECI_MATRIX, 'eu-buergerinitiative')
    expect(r.cells).toEqual({ registrierung: 'durch', sammlung: 'stellungnahme', pruefung: 'offen', einreichung: 'offen', antwort: 'offen' })
    expect(wegCellLabel(r, 'stellungnahme')).toBe('Unterstützung möglich')
    expect(r.note).toContain('die Kommission antwortet binnen sechs Monaten mit Gründen')
    expect(r.href).toBe('/eu-recht#eu-buergerinitiativen')
  })

  it('an Anliegen: the rail\'s station names as its code writes them, and where the three kinds differ', () => {
    const src = readFileSync(new URL('../app/utils/anliegenView.ts', import.meta.url), 'utf8')
    for (const name of ANLIEGEN_STATION_NAMES) expect(src, name).toContain(`'${name}'`)
    expect(ANLIEGEN_MATRIX.stations.map((s) => s.label)).toEqual(['Eingebracht', 'Erste Lesung', 'Ausschuss', 'Nationalrat'])
    for (const id of ['anliegen-petition', 'anliegen-buergerinitiative']) {
      const r = rowOf(ANLIEGEN_MATRIX, id)
      expect(r.cells, id).toEqual({ eingebracht: 'durch', 'erste-lesung': 'entfaellt', ausschuss: 'stellungnahme', nationalrat: 'durch' })
      expect(wegCellLabel(r, 'stellungnahme')).toBe('Unterstützung und Stellungnahme möglich')
      expect(r.source?.href).toMatch(/^https:\/\/www\.parlament\.gv\.at\//)
    }
    const vb = rowOf(ANLIEGEN_MATRIX, 'anliegen-volksbegehren')
    expect(vb.cells).toEqual({ eingebracht: 'durch', 'erste-lesung': 'offen', ausschuss: 'stellungnahme', nationalrat: 'durch' })
    expect(wegCellLabel(vb, 'stellungnahme')).toBe('Stellungnahme möglich')
    expect(vb.stationLabels?.eingebracht).toBe('Eingelangt')
    // Its way to a law is the national row, linked, not repeated.
    expect(vb.noteLink?.href).toBe(`${wegHref('volksbegehren')}#weg-volksbegehren`)
    // The Petition an den Bundesrat (§ 25 GO-BR): its rail's own names for two columns, the plenary only after a report.
    const br = rowOf(ANLIEGEN_MATRIX, 'anliegen-petition-bundesrat')
    expect(br.cells).toEqual({ eingebracht: 'durch', 'erste-lesung': 'entfaellt', ausschuss: 'stellungnahme', nationalrat: 'offen' })
    expect(br.stationLabels).toEqual({ nationalrat: 'Bundesrat' })
    expect(wegCellLabel(br, 'stellungnahme')).toBe('Unterstützung und Stellungnahme möglich')
    expect(br.source?.href).toMatch(/^https:\/\/www\.parlament\.gv\.at\//)
    expect(ANLIEGEN_MATRIX.groups[0]!.label).toBe('Anliegen an das Parlament')
  })

  it('Petition, Bürgerinitiative, Volksbegehren and Petition an den Bundesrat link to their kind on /anliegen', () => {
    for (const r of rowsOf(ANLIEGEN_MATRIX)) {
      expect(isAnliegenLink(r.href), r.id).toBe(true)
      // The two kinds of which hardly one is open link the list without „Nur offene" (`alle=1`): their plain link landed on an empty list.
      const rarelyOpen = ['anliegen-volksbegehren', 'anliegen-petition-bundesrat'].includes(r.id)
      expect(Object.keys(queryOf(r.href!)), r.id).toEqual(rarelyOpen ? ['art', 'alle'] : ['art'])
      if (rarelyOpen) expect(queryOf(r.href!).alle, r.id).toBe('1')
      expect(anliegenArtOf(queryOf(r.href!).art), r.id).toBe(r.id.replace('anliegen-', ''))
    }
  })
})

describe('instruments the monitor does not follow', () => {
  it('are the three without a matrix, with unique ids, words for what one can do, in the matrices\' order: Bund, Land, EU', () => {
    expect(WEG_INSTRUMENTS.map((i) => i.id)).toEqual(['volksbefragung', 'laender', 'eu-petition'])
    const order = { bund: 0, land: 1, eu: 2 }
    const levels = WEG_INSTRUMENTS.map((i) => order[i.level])
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
    for (const i of WEG_INSTRUMENTS) {
      expect(i.act.length, i.id).toBeGreaterThan(0)
      expect(i.notFollowed.length, i.id).toBeGreaterThan(0)
    }
  })

  it('a route of a matrix does not stand in the list a second time (15./16.11.2026)', () => {
    // The national rows: the Länder line's „Petition" is the Landtag's, not the Nationalrat's row of that name.
    const rowLabels = WEGE.map((w) => w.label)
    for (const i of WEG_INSTRUMENTS) {
      expect(i.name.split(/,\s*/).some((part) => rowLabels.includes(part)), i.id).toBe(false)
      expect(i.name, i.id).not.toMatch(/Volksbegehren|Volksabstimmung/)
    }
  })

  it('no reason says „nicht geprüft" where the sources were read (petitionen-laender-und-eu.md)', () => {
    for (const i of WEG_INSTRUMENTS) expect(i.notFollowed, i.id).not.toBe('Quellen nicht geprüft')
    expect(WEG_INSTRUMENTS.find((i) => i.id === 'eu-petition')!.source?.href).toMatch(/^https:\/\/www\.europarl\.europa\.eu\//)
  })

  it('the heading says what the list is, and the lede no longer lists what is followed', () => {
    expect(WEGE_COPY.instrumentsHeading).toBe('Nicht im Monitor')
    expect(WEGE_COPY.instrumentsLede).not.toMatch(/Petition|Konsultation|Bürgerinitiativ/)
  })
})

describe('the Volksabstimmung, a station of a law\'s path (16.11.2026)', () => {
  it('is a row for the Bund and one for the Länder: after the Beschluss, kundgemacht only if accepted, not followed', () => {
    for (const id of ['gesetz-volksabstimmung', 'landesgesetz-volksabstimmung'] as const) {
      const w = WEGE.find((x) => x.id === id)!
      expect(w.cells, id).toEqual({ entwurf: 'offen', begutachtung: 'offen', rv: 'offen', parlament: 'durch', bgbl: 'offen' })
      expect(w.notFollowed, id).not.toBeNull()
      expect(w.href, id).toBeNull()
    }
    expect(WEGE.find((x) => x.id === 'gesetz-volksabstimmung')!.level).toBe('bund')
    expect(WEGE.find((x) => x.id === 'landesgesetz-volksabstimmung')!.level).toBe('land')
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
    for (const w of WEG_MATRICES.flatMap(rowsOf).filter((x) => x.gap !== undefined)) {
      expect(w.notFollowed, w.id).toBeNull()
      expect(w.gap!.length, w.id).toBeGreaterThan(0)
    }
  })
})

describe('wege links into the list', () => {
  it('lead to /entwuerfe only', () => {
    for (const href of listLinks) expect(href.startsWith('/entwuerfe?'), href).toBe(true)
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

  it('leads every id to the page that holds its row, and that page selects it (16.11.2026)', () => {
    for (const id of [...WEG_IDS, ...EU_WEG_IDS]) {
      const url = new URL(wegHref(id), 'https://example.invalid')
      const pages = Object.values(WEGE_PAGES).filter((p) => wegePageRows(p).some((r) => r.id === id))
      expect(pages.length, id).toBe(1)
      expect(url.pathname, id).toBe(pages[0]!.path)
      expect(wegSelected(pages[0]!, url.searchParams.get('weg')), id).toBe(id)
    }
    expect(wegHref('gesetz')).toBe('/wege?weg=gesetz')
    expect(wegHref('eu-richtlinie')).toBe(`${euWegePath()}?weg=eu-richtlinie`)
  })
})

describe('one page per jurisdiction (16.11.2026)', () => {
  const pages = Object.values(WEGE_PAGES)
  const country = WEGE_PAGES[WEGE_STATE]
  const eu = WEGE_PAGES.eu

  it('the country\'s page stays at /wege, the EU\'s is built by the EU address helper', () => {
    expect(WEGE_STATE).toBe('at')
    expect(country.path).toBe('/wege')
    expect(eu.path).toBe(euWegePath())
    expect(eu.path).toBe(`${euPath()}/wege`)
    expect(WEGE_PATH_OF).toEqual({ [WEGE_STATE]: country.path, eu: eu.path })
  })

  it('both are „Wege der Gesetzgebung"; the H1 adds where, the country from configuration', () => {
    expect(country.title).toBe(`Wege der Gesetzgebung in ${EU_MEMBER_STATE_NAME_DE}`)
    expect(country.title).toBe('Wege der Gesetzgebung in Österreich')
    expect(eu.title).toBe('Wege der Gesetzgebung in der EU')
    for (const p of pages) {
      expect(p.title.startsWith(WEGE_COPY.title), p.path).toBe(true)
      expect(p.lede.length, p.path).toBeGreaterThan(0)
      expect(p.description.length, p.path).toBeGreaterThan(0)
    }
    expect(country.lede).toBe(WEGE_COPY.lede)
    // An ECI is no text that comes to apply: the EU's lede names both objects by their last stations.
    expect(eu.lede).toMatch(/Rechtsakt/)
    expect(eu.lede).toMatch(/Bürgerinitiative/)
  })

  it('every matrix, row and instrument stands on exactly one page', () => {
    for (const m of WEG_MATRICES) expect(pages.filter((p) => wegePageMatrices(p).includes(m)).length, m.id).toBe(1)
    for (const r of WEG_MATRICES.flatMap(rowsOf)) expect(pages.filter((p) => wegePageRows(p).includes(r)).length, r.id).toBe(1)
    for (const i of WEG_INSTRUMENTS) expect(pages.filter((p) => p.instruments.includes(i)).length, i.id).toBe(1)
    expect(pages.flatMap((p) => p.instruments).length).toBe(WEG_INSTRUMENTS.length)
  })

  it('the country holds Bund, Länder, Anliegen and its own instruments; the EU its act, the ECI and the EP petition', () => {
    expect(country.instruments.map((i) => i.id)).toEqual(['volksbefragung', 'laender'])
    expect(eu.instruments.map((i) => i.id)).toEqual(['eu-petition'])
    expect(wegePageRows(eu).map((r) => r.id)).toEqual([...EU_WEG_IDS])
  })

  it('the seam to the EU: one line that opens the country\'s page, linking the EU\'s page and the drafts that carry out EU law', () => {
    expect(WEG_SEAMS.map((s) => s.id)).toEqual(['eu-recht'])
    expect(country.blocks.map((b) => (b.kind === 'matrix' ? b.matrix.id : `seam:${b.seam.id}`))).toEqual(['seam:eu-recht', 'bund', 'land', 'anliegen'])
    expect(eu.blocks.every((b) => b.kind === 'matrix')).toBe(true)
    const seam = WEG_SEAMS[0]!
    expect(seam.jurisdiction).toBe(WEGE_STATE)
    expect(seam.href).toBe(eu.path)
    expect(seam.noteLink).toEqual(EU_IMPLEMENTING_LIST)
  })

  it('every internal link of a page leads to a page that exists, a row it holds, or a section it has', () => {
    const anchors: Record<string, Set<string>> = {
      [euPath()]: new Set(['eu-fenster', 'eu-umsetzung', 'eu-buergerinitiativen']),
      '/datenlage': new Set(['begutachtung-vorgeschrieben']),
    }
    for (const p of pages) {
      const links = [
        ...wegePageMatrices(p).flatMap((m) => m.stations.map((s) => s.href)),
        ...wegePageRows(p).flatMap((r) => [r.href, r.noteHref ?? null, r.noteLink?.href ?? null]),
        ...p.blocks.flatMap((b) => (b.kind === 'seam' ? [b.seam.href, b.seam.noteLink?.href ?? null] : [])),
      ].filter((h): h is string => h !== null)
      for (const href of links) {
        const url = new URL(href, 'https://example.invalid')
        const target = pages.find((x) => x.path === url.pathname)
        if (target) {
          const weg = url.searchParams.get('weg')
          if (weg !== null) expect(wegSelected(target, weg), href).toBe(weg)
          if (url.hash) expect(wegePageRows(target).some((r) => `#weg-${r.id}` === url.hash), href).toBe(true)
          continue
        }
        expect(['/entwuerfe', ANLIEGEN_PATH, '/datenlage', euPath()], href).toContain(url.pathname)
        if (url.hash) expect(anchors[url.pathname]?.has(url.hash.slice(1)), href).toBe(true)
      }
    }
  })

  it('?weg= selects only a row of the page: an unknown or foreign value selects nothing', () => {
    expect(wegSelected(country, 'gesetz')).toBe('gesetz')
    expect(wegSelected(country, ['landesgesetz'])).toBe('landesgesetz')
    expect(wegSelected(country, 'eu-richtlinie')).toBeNull()
    expect(wegSelected(eu, 'eu-buergerinitiative')).toBe('eu-buergerinitiative')
    expect(wegSelected(eu, 'gesetz')).toBeNull()
    for (const p of pages) {
      expect(wegSelected(p, 'nope')).toBeNull()
      expect(wegSelected(p, undefined)).toBeNull()
      expect(wegSelected(p, null)).toBeNull()
    }
  })

  it('the sitemap holds both pages', () => {
    const SITE = 'https://example.invalid'
    const xml = buildSitemap(SITE, [])
    for (const p of pages) expect(xml, p.path).toContain(`<loc>${SITE}${p.path}</loc>`)
  })
})

describe('euWegFor', () => {
  it('an act: its kind where the Cellar names its author; an act of the Commission its own row; nothing unread', () => {
    expect(euWegFor({ source: 'act', kind: 'richtlinie', adoptedBy: 'parlament-rat' })).toBe('eu-richtlinie')
    expect(euWegFor({ source: 'act', kind: 'verordnung', adoptedBy: 'rat' })).toBe('eu-verordnung')
    expect(euWegFor({ source: 'act', kind: 'verordnung', adoptedBy: 'kommission' })).toBe('eu-kommission')
    expect(euWegFor({ source: 'act', kind: 'richtlinie', adoptedBy: 'unbekannt' })).toBeNull()
    expect(euWegFor({ source: 'act', kind: 'verordnung', adoptedBy: null })).toBeNull()
    expect(euWegFor({ source: 'act', kind: 'beschluss', adoptedBy: 'parlament-rat' })).toBeNull()
    expect(euWegFor({ source: 'act', kind: 'rahmenbeschluss', adoptedBy: 'rat' })).toBeNull()
  })

  it('an initiative or a proposal\'s consultation: the act the Commission foresees', () => {
    expect(euWegFor({ source: 'portal', actType: 'PROP_DIR' })).toBe('eu-richtlinie')
    expect(euWegFor({ source: 'portal', actType: 'PROP_REG' })).toBe('eu-verordnung')
    expect(euWegFor({ source: 'portal', actType: 'REG_DEL' })).toBe('eu-kommission')
    expect(euWegFor({ source: 'portal', actType: 'DIR_IMPL' })).toBe('eu-kommission')
    expect(euWegFor({ source: 'portal', actType: 'PROP_DEC' })).toBeNull()
    expect(euWegFor({ source: 'portal', actType: 'COMMUNIC' })).toBeNull()
    expect(euWegFor({ source: 'portal', actType: null })).toBeNull()
  })
})
