import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EuFensterResponse, EuInitiative, EuOpenInitiative } from '../shared/types'
import { OPEN_WINDOWS_MAX_PAGES, OPEN_WINDOW_FIELDS, OPEN_WINDOW_STATUS_FIELDS, openWindowsUrl, parseInitiative, parseOpenWindows, readOpenWindows, windowsOpenOn } from '../server/utils/eu/haveYourSay'
import { buildIcsCalendar, buildRssFeed, buildSitemap } from '../server/utils/feeds'
import { euInitiativeId, euInitiativePath } from '../shared/utils/eu'
import { actTypeDe, windowStageDe } from '../shared/utils/euPortal'
import { EU_FENSTER_DE, euFensterView } from '../app/utils/euFenster'
import { euInitiativeView } from '../app/utils/euInitiative'

/* The open windows of the Commission's portal „Ihre Meinung zählt" (step 3
 * of the EU cycle): six rows cut from the answer of 15.11.2026 (49 rows) —
 * one per stage, one with two windows at once, only the German and English
 * titles kept. The rows carry no person: no name, no address, no number. */

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/eu-portal/${name}.json`, import.meta.url), 'utf8'))

const TODAY = '2026-11-15'

describe('the reader of the open windows', () => {
  it('reads every row as its id, reference, act type, German title, topics and open windows', () => {
    const page = parseOpenWindows(fixture('open-windows'))
    expect(page).toMatchObject({ page: 0, totalPages: 1, total: 6, rows: 6 })
    expect(page.initiatives.map((i) => i.id)).toEqual([18953, 17873, 19498, 19517, 16414, 19295])
    expect(page.initiatives[0]).toEqual({
      id: 18953,
      reference: 'Ares(2026)7463403',
      actType: 'PROP_REG',
      title: 'Passagierrechte – gezielte Überarbeitung der Rechtsvorschriften zur besseren Berücksichtigung der Bedürfnisse von Menschen mit Behinderungen und eingeschränkter Mobilität',
      titleIsGerman: true,
      topics: ['Transport'],
      windows: [{ stage: 'PLANNING_WORKFLOW', start: '2026-11-13', end: '2027-01-08' }],
    })
    // Two windows at once: each its own.
    expect(page.initiatives[1]!.windows.map((w) => w.stage)).toEqual(['PLANNING_WORKFLOW', 'OPC_LAUNCHED'])
    expect(page.initiatives[3]).toMatchObject({ reference: 'COM(2026)1020', windows: [{ stage: 'ADOPTION_WORKFLOW', end: '2027-01-10' }] })
  })

  it('takes the English title where the German one is missing, and says so', () => {
    const raw = fixture('open-windows') as { initiativeResultDtoPage: { content: { initiativeTranslations: { language: string }[] }[] } }
    const row = raw.initiativeResultDtoPage.content[0]!
    row.initiativeTranslations = row.initiativeTranslations.filter((t) => t.language !== 'DE')
    const first = parseOpenWindows(raw).initiatives[0]!
    expect(first.title).toBe('Targeted revision of EU passenger rights for persons with disabilities and reduced mobility')
    expect(first.titleIsGerman).toBe(false)
  })

  it('lets nothing through that is not on its list of fields', () => {
    const raw = fixture('open-windows') as { initiativeResultDtoPage: { content: Record<string, unknown>[] } }
    // Planted: the fields an initiative's record carries for its officials, and a description.
    const planted = { authorName: 'VORNAME9', authorSurname: 'NACHNAME9', authorMail: 'person9@example.org', authorPhoneNumber: '00009', surveyContactMail: 'kontakt9@example.org', dossierSummary: 'ZUSAMMENFASSUNG9' }
    for (const row of raw.initiativeResultDtoPage.content) {
      Object.assign(row, planted)
      for (const s of row.currentStatuses as Record<string, unknown>[]) Object.assign(s, planted)
    }
    const out = JSON.stringify(parseOpenWindows(raw))
    for (const value of Object.values(planted)) expect(out).not.toContain(value)
    expect(out).not.toMatch(/@|author|Mail|Phone|summary/i)
    expect([...OPEN_WINDOW_FIELDS, ...OPEN_WINDOW_STATUS_FIELDS].some((f) => /author|mail|phone|contact|name/i.test(f))).toBe(false)
  })

  it('throws on any shape it does not know — never a shorter list', () => {
    expect(() => parseOpenWindows({})).toThrow()
    expect(() => parseOpenWindows('<!doctype html>')).toThrow()
    expect(() => parseOpenWindows({ code: 'not_acceptable' })).toThrow()
    expect(() => parseOpenWindows({ initiativeResultDtoPage: { content: [{ id: 'x', currentStatuses: [] }] } })).toThrow()
    expect(() => parseOpenWindows({ initiativeResultDtoPage: { content: [{ id: 7 }] } })).toThrow()
    expect(() => parseOpenWindows({ initiativeResultDtoPage: { content: [{ id: 7, currentStatuses: [{ receivingFeedbackStatus: 'OPEN' }] }] } })).toThrow()
    expect(() => parseOpenWindows({ initiativeResultDtoPage: { content: [{ id: 1_000_000_000, currentStatuses: [] }] } })).toThrow()
    // A status that is not open is no window; a row without one is left out.
    expect(parseOpenWindows({ initiativeResultDtoPage: { content: [{ id: 7, currentStatuses: [{ frontEndStage: 'ROADMAP', receivingFeedbackStatus: 'CLOSED' }] }] } }).initiatives).toEqual([])
    // An empty list is a list: the portal's statement that nothing is open.
    expect(parseOpenWindows({ initiativeResultDtoPage: { content: [], totalPages: 0, totalElements: 0 } }).initiatives).toEqual([])
  })

  it('builds its address from a page number and from nothing else', () => {
    expect(openWindowsUrl(0)).toBe('https://ec.europa.eu/info/law/better-regulation/brpapi/searchInitiatives?feedbackStatus=OPEN&size=100&language=DE')
    expect(openWindowsUrl(2)).toBe('https://ec.europa.eu/info/law/better-regulation/brpapi/searchInitiatives?feedbackStatus=OPEN&size=100&language=DE&page=2')
    expect(() => openWindowsUrl(-1)).toThrow()
    expect(() => openWindowsUrl(1.5)).toThrow()
  })

  it('drops the windows that closed since the list was read', () => {
    const list: EuOpenInitiative[] = parseOpenWindows(fixture('open-windows')).initiatives
    expect(windowsOpenOn(list, '2026-12-10').map((i) => i.id)).toEqual([18953, 17873, 19498, 19517, 16414])
    expect(windowsOpenOn(list, '2027-02-10')).toEqual([])
  })
})

/** A page of the list as the portal would answer it. */
const pageOf = (number: number, ids: number[], totalPages: number, totalElements: number) => ({
  initiativeResultDtoPage: {
    number,
    totalPages,
    totalElements,
    content: ids.map((id) => ({ id, currentStatuses: [{ frontEndStage: 'PLANNING_WORKFLOW', receivingFeedbackStatus: 'OPEN', feedbackEndDate: '2027/01/08 23:59:59' }] })),
  },
})

describe('reading the whole list', () => {
  it('reads one page where one holds all', async () => {
    const asked: string[] = []
    const read = await readOpenWindows(async (url) => (asked.push(url), fixture('open-windows')))
    expect(asked).toHaveLength(1)
    expect(read.initiatives).toHaveLength(6)
    expect(read.cut).toBeNull()
  })

  it('pages up to the cap, keeps an initiative on two pages once, and says what the cap cut', async () => {
    const pages = [pageOf(0, [1, 2], 5, 10), pageOf(1, [2, 3], 5, 10), pageOf(2, [4, 5], 5, 10)]
    const asked: string[] = []
    const read = await readOpenWindows(async (url) => {
      asked.push(url)
      return pages[asked.length - 1]
    })
    expect(asked).toHaveLength(OPEN_WINDOWS_MAX_PAGES)
    expect(read.initiatives.map((i) => i.id)).toEqual([1, 2, 3, 4, 5])
    expect(read.cut).toEqual({ read: 6, total: 10 })
  })

  it('stops and says the list is cut where the portal ignores the page asked for', async () => {
    const read = await readOpenWindows(async () => pageOf(0, [1, 2], 2, 4))
    expect(read.initiatives.map((i) => i.id)).toEqual([1, 2])
    expect(read.cut).toEqual({ read: 2, total: 4 })
  })

  it('throws where a page fails, so nothing partial is cached as the list', async () => {
    let n = 0
    await expect(readOpenWindows(async () => {
      n++
      if (n === 2) throw new Error('HTTP 500')
      return pageOf(0, [1], 2, 2)
    })).rejects.toThrow()
  })
})

const response = (initiatives: EuOpenInitiative[] | null, cut: EuFensterResponse['cut'] = null): EuFensterResponse => ({ initiatives, cut, portalUrl: 'https://ec.europa.eu/info/law/better-regulation/have-your-say_de' })

describe('the list on /eu-recht', () => {
  // The state box counts the days to the closing day against the clock.
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`)) })
  afterAll(() => { vi.useRealTimers() })

  const list = parseOpenWindows(fixture('open-windows')).initiatives

  it('is one row per window, by closing day, the soonest first', () => {
    const v = euFensterView(response(list))
    expect(v.tabs!.alle.map((r) => r.key)).toEqual([
      '19295|ISC_WORKFLOW', '16414|ISC_WORKFLOW', '18953|PLANNING_WORKFLOW', '19517|ADOPTION_WORKFLOW',
      '19498|OPC_LAUNCHED', '17873|OPC_LAUNCHED', '17873|PLANNING_WORKFLOW',
    ])
    expect(v.tabs!.alle[0]).toMatchObject({
      path: '/eu-recht/initiative/19295',
      stage: 'Entwurf eines Rechtsakts',
      act: 'Durchführungsverordnung',
      // The draft list's box: the days left, the day with its weekday, the tone of the Frist (the clock is set to TODAY).
      state: { label: 'Noch 24 Tage', detail: 'bis Mi., 09.12.2026', tone: 'neutral' },
      titleNote: null,
    })
  })

  it('divides by where in the process, with a count per tab', () => {
    const v = euFensterView(response(list))
    expect(v.counts).toEqual({ alle: 7, konsultation: 4, vorschlag: 1, rechtsakt: 2 })
    expect(v.tabs!.vorschlag.map((r) => r.key)).toEqual(['19517|ADOPTION_WORKFLOW'])
    expect(v.cut).toBeNull()
  })

  it('prints an unknown act type and an unknown stage as the portal\'s code, never as nothing', () => {
    const odd: EuOpenInitiative = { id: 5, reference: null, actType: 'RECOMMENDATION', title: 'English only', titleIsGerman: false, topics: [], windows: [{ stage: 'NEW_STAGE', start: null, end: null }] }
    const v = euFensterView(response([odd]))
    const row = v.tabs!.alle[0]!
    expect(row).toMatchObject({ act: 'RECOMMENDATION', stage: 'NEW_STAGE', titleNote: 'Das Portal führt den Titel bisher nur auf Englisch', tab: null })
    expect(row.state).toMatchObject({ label: 'Rückmeldung möglich', detail: 'Enddatum im Portal nicht angegeben' })
    expect(v.counts).toEqual({ alle: 1, konsultation: 0, vorschlag: 0, rechtsakt: 0 })
    expect(actTypeDe(null)).toBeNull()
    expect(windowStageDe('OPC_LAUNCHED')).toBe('Öffentliche Konsultation')
  })

  it('tells „not read" from „nothing open", and says what the cap cut', () => {
    expect(euFensterView(response(null)).tabs).toBeNull()
    expect(euFensterView(response([])).tabs!.alle).toEqual([])
    expect(euFensterView(response(list, { read: 300, total: 320 })).cut).toBe('Das Portal zählt 320 Vorhaben mit offener Frist; der Monitor liest davon die ersten 300.')
  })

  it('says no verdict and ranks nothing: the days left are the reader\'s own deadline, as in the draft list', () => {
    // The monitor's words only — the portal's titles are not ours to hold to it.
    const rows = euFensterView(response(list)).tabs!.alle.map(({ title: _t, haystack: _h, ...rest }) => rest)
    const words = JSON.stringify([rows, EU_FENSTER_DE])
    expect(words).not.toMatch(/überfällig|abgelaufen|meistdiskutiert|\d+ Rückmeldungen/i)
  })
})

describe('the initiative\'s address', () => {
  it('is built from the portal\'s number and from nothing else', () => {
    expect(euInitiativePath(13192)).toBe('/eu-recht/initiative/13192')
    expect(euInitiativePath(0)).toBeNull()
    expect(euInitiativePath(1.5)).toBeNull()
    expect(euInitiativePath(1_000_000_000)).toBeNull()
    expect(euInitiativeId('13192')).toBe(13192)
    for (const bad of ['013192', '-1', '1e3', '13192x', '', '1234567890']) expect(euInitiativeId(bad), bad).toBeNull()
  })
})

describe('the initiative\'s page', () => {
  const closed = parseInitiative(fixture('initiative-13192'))

  it('reads the German title and the foreseen act from the record', () => {
    expect(closed.titleDe).toBe('EU-Maßnahmen zum Schutz von Journalisten und Menschenrechtsverteidigern gegen missbräuchliche Gerichtsverfahren (SLAPP-Klagen)')
    expect(closed.actType).toBe('PROP_DIR')
  })

  it('is still a page when every window is closed: what was open, until when, how many', () => {
    const v = euInitiativeView(closed, TODAY)
    expect(v.title).toBe(closed.titleDe)
    expect(v.actType).toBe('Vorgesehen: Vorschlag für eine Richtlinie')
    expect(v.status).toBe('Vorschlag liegt vor')
    expect(v.action).toBeNull()
    expect(v.stations.map((s) => [s.id, s.name, !!s.ahead, s.current])).toEqual([
      ['konsultation', 'Konsultation', false, false],
      ['vorschlag', 'Vorschlag', false, true],
      ['beschluss', 'Parlament und Rat', true, false],
      ['amtsblatt', 'Amtsblatt', true, false],
      ['wirkung', 'Umsetzung', true, false],
    ])
    const konsultation = v.sections[0]!
    expect(konsultation.facts.map((f) => [f.title, f.parts])).toEqual([
      ['Fahrplan', ['04.10.2021 – 01.11.2021', '10 Rückmeldungen']],
      ['Öffentliche Konsultation', ['04.10.2021 – 10.01.2022', '146 Rückmeldungen']],
      ['Vorhaben der Kommission', ['Nr. 13192', { href: 'https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/13192_de', label: 'im Portal „Ihre Meinung zählt“' }]],
    ])
    expect(v.sections[1]!.facts.map((f) => [f.title, f.parts])).toEqual([
      ['Annahme durch die Kommission', ['veröffentlicht am 29.04.2022']],
      ['Nummer', ['COM(2022)177']],
      ['Rückmeldungen zum Vorschlag', ['29.04.2022 – 29.06.2022', '22 Rückmeldungen']],
      ['Verfahren', [{ href: '/eu-recht/vorschlag/2022/177', label: 'Verfahren zu COM(2022)177 im Monitor', internal: true }]],
    ])
    // The adoption is a day, the feedback on it a period: the rail names the period as what it is.
    expect(v.stations[1]!.facts).toEqual(['Rückmeldungen zum Vorschlag bis 29.06.2022'])
  })

  it('takes an adoption the portal only plans for no station reached (18953 on 15.11.2026)', () => {
    // The portal lists the adoption to come beside the call for evidence that is open: no day, feedback „UPCOMING".
    const planned = {
      ...closed,
      publications: [
        { stage: 'PLANNING_WORKFLOW', type: 'CALL_FOR_EVIDENCE', reference: 'Ares(2026)1', published: '2026-11-13', feedbackEnd: '2027-01-08', feedbackCount: 0, feedbackStatus: 'OPEN' },
        { stage: 'ADOPTION_WORKFLOW', type: 'PROP_REG', reference: null, published: null, feedbackEnd: null, feedbackCount: 0, feedbackStatus: 'UPCOMING' },
      ],
    }
    const v = euInitiativeView(planned, '2026-11-15')
    expect(v.stations.map((s) => [s.id, !!s.ahead, s.current])).toEqual([
      ['konsultation', false, true],
      ['vorschlag', true, false],
      ['beschluss', true, false],
      ['amtsblatt', true, false],
      ['wirkung', true, false],
    ])
    expect(v.stations[1]!.facts).toEqual([])
    expect(v.stations[1]!.gap).toBe('Das Portal verzeichnet zu diesem Vorhaben noch keinen Vorschlag.')
    // A station ahead stands in the rail only: sections are for stations reached, as on a draft's page.
    expect(v.sections.map((s) => s.id)).toEqual(['konsultation'])
    expect(JSON.stringify(v.sections)).not.toMatch(/[Vv]eröffentlicht/)
    expect(v.status).toBe('Sondierung läuft')
    expect(v.action?.end).toBe('2027-01-08')
  })

  it('says past the Commission, once and in the rail, what the monitor does not follow', () => {
    // Without a COM number on any publication: the monitor follows no proposal of it.
    const noCom: EuInitiative = { ...closed, publications: closed.publications.map((p) => ({ ...p, reference: p.reference?.startsWith('COM') ? null : p.reference })) }
    const v = euInitiativeView(noCom, TODAY)
    // No section for a station not reached; in the rail only the first one says it.
    expect(v.sections.map((s) => s.id)).toEqual(['konsultation', 'vorschlag'])
    expect(v.stations.filter((s) => s.gap?.startsWith('Nicht im Monitor')).map((s) => s.id)).toEqual(['beschluss'])
    expect(JSON.stringify(v)).not.toContain('/eu-recht/vorschlag/')
  })

  it('points past the Commission to the proposal\'s page where a publication carries the COM number (13192 → COM(2022)177)', () => {
    const v = euInitiativeView(closed, TODAY)
    const pointer = { href: '/eu-recht/vorschlag/2022/177', label: 'Verfahren zu COM(2022)177 im Monitor', internal: true }
    // The Commission's station links it ...
    expect(v.sections[1]!.facts.find((f) => f.key === 'verfahren-0')).toMatchObject({ title: 'Verfahren', parts: [pointer] })
    // ... and the first later station says so in the rail, instead of „Nicht im Monitor". None of them has a section.
    expect(v.sections.map((s) => s.id)).toEqual(['konsultation', 'vorschlag'])
    expect(JSON.stringify(v)).not.toContain('Nicht im Monitor')
    expect(v.stations.find((s) => s.id === 'beschluss')!.gap).toBe('Wie es weitergeht, zeigt die Seite des Vorschlags.')
    // The stations stay drawn as not reached: the initiative's page does not read the Cellar.
    expect(v.stations.slice(2).every((s) => s.ahead)).toBe(true)
  })

  it('carries the one action while a window is open: the portal\'s page, and the closing day', () => {
    const open: EuInitiative = {
      id: 17873,
      title: 'Ecodesign requirements on product repairability',
      titleDe: 'Ökodesign-Anforderungen an die Reparierbarkeit von Produkten',
      actType: 'REG_DEL',
      url: 'https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/17873_de',
      publications: [
        { stage: 'PLANNING_WORKFLOW', type: 'CFE_IMPACT_ASSESS', reference: 'Ares(2026)1', published: '2026-11-03', feedbackEnd: '2027-02-09', feedbackCount: 12, feedbackStatus: 'OPEN' },
        { stage: 'OPC_LAUNCHED', type: 'OPC_LAUNCHED', reference: 'X', published: '2026-11-03', feedbackEnd: '2027-02-09', feedbackCount: 3, feedbackStatus: 'OPEN' },
      ],
    }
    const v = euInitiativeView(open, TODAY)
    expect(v.status).toBe('Sondierung läuft · Öffentliche Konsultation läuft')
    expect(v.action).toEqual({
      end: '2027-02-09',
      heading: null,
      href: open.url,
      label: 'Rückmeldung im Portal der Kommission geben',
      note: 'Rückmeldungen nimmt die Kommission bis 09.02.2027 in ihrem Portal „Ihre Meinung zählt“ entgegen. Der Link führt zur Seite des Vorhabens dort.',
    })
    // A delegated act: no „Parlament und Rat", the Commission's station not reached yet.
    expect(v.stations.map((s) => [s.id, s.name, !!s.ahead])).toEqual([
      ['konsultation', 'Konsultation', false],
      ['vorschlag', 'Rechtsakt der Kommission', true],
      ['amtsblatt', 'Amtsblatt', true],
      ['wirkung', 'Geltung', true],
    ])
    expect(v.stations.find((s) => s.current)!.id).toBe('konsultation')
    expect(v.stations[1]!.gap).toBe('Das Portal verzeichnet zu diesem Vorhaben noch keinen Entwurf eines Rechtsakts.')
    // The day after it closed, the window is a fact, no action.
    expect(euInitiativeView(open, '2027-02-10').action).toBeNull()
  })

  it('says no duration and no countdown (rule D6)', () => {
    const words = JSON.stringify(euInitiativeView(closed, TODAY))
    expect(words).not.toMatch(/\bTage\b|noch \d|überfällig|verspätet/i)
  })
})

describe('feed and calendar of the open windows (?quelle=eu)', () => {
  const SITE = 'https://example.test'
  const list = parseOpenWindows(fixture('open-windows')).initiatives

  it('is a feed of its own: one item per window, its stage leading, the page here linked', () => {
    const rss = buildRssFeed(SITE, [], undefined, [], undefined, { items: list })
    expect(rss).toContain('<title>Begutachtungs-Monitor – Offene Rückmeldefristen der Europäischen Kommission</title>')
    expect(rss).toContain(`<atom:link href="${SITE}/feed.xml?quelle=eu"`)
    expect(rss.split('<item>').length - 1).toBe(7)
    expect(rss).toContain('<guid isPermaLink="false">eu-17873-opc_launched@begutachtungs-monitor.at</guid>')
    expect(rss).toContain('<guid isPermaLink="false">eu-17873-planning_workflow@begutachtungs-monitor.at</guid>')
    expect(rss).toContain(`<link>${SITE}/eu-recht/initiative/18953</link>`)
    expect(rss).toContain('<title>Sondierung: Passagierrechte')
    expect(rss).toContain('Rückmeldung bis 08.01.2027 · Vorschlag für eine Verordnung · Rückmeldung im Portal')
    // The Bund's feed stays the Bund's.
    expect(buildRssFeed(SITE, [])).not.toContain('eu-18953')
  })

  it('puts each window on its closing day in a calendar of its own', () => {
    const ics = buildIcsCalendar(SITE, [], [], [], 'Rückmeldefristen der Europäischen Kommission', list)
    expect(ics).toContain('X-WR-CALNAME:Rückmeldefristen der Europäischen Kommission')
    expect(ics.split('BEGIN:VEVENT').length - 1).toBe(7)
    expect(ics).toContain('UID:eu-18953-planning_workflow@begutachtungs-monitor.at')
    expect(ics).toContain('DTSTART;VALUE=DATE:20270108')
    expect(ics).toContain(`URL:${SITE}/eu-recht/initiative/18953`)
    // The first event is the soonest closing day.
    expect(ics.indexOf('UID:eu-19295-')).toBeLessThan(ics.indexOf('UID:eu-18953-'))
  })

  it('lists the open initiatives\' pages in the sitemap', () => {
    const xml = buildSitemap(SITE, [], [], [], [], [], ['/eu-recht/initiative/18953'])
    expect(xml).toContain(`<loc>${SITE}/eu-recht/initiative/18953</loc>`)
  })
})
