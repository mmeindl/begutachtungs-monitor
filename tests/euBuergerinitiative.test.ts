import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { EciInitiative, EciOpenRow, EuBuergerinitiativenResponse } from '../shared/types'
import { EU_MEMBER_STATE_ECI, euCitizensInitiativeAddress, euCitizensInitiativePath, euCitizensInitiativeReference } from '../shared/utils/eu'
import { splitGap } from '../shared/utils/gaps'
import { ECI_DETAILS_FIELDS, ECI_LIST_FIELDS, eciDay, eciDetailsUrl, eciListUrl, eciOpenOn, eciPageUrl, parseEciDetails, parseEciList } from '../server/utils/eu/eciRegister'
import { ECI_KNOWN_STEPS, euBuergerinitiativeView } from '../app/utils/euBuergerinitiative'
import { EU_ECI_LIST_DE, euEciListView, sortEciRows } from '../app/utils/euEciList'

/**
 * The European Citizens' Initiative (step 5 of the EU cycle, 15.11.2026):
 * the register's reader with its fixed list of fields, the page's rail and
 * door, the list's order, the addresses. The fixtures are real register
 * answers of 15.11.2026 with organisers, funders, logos and the organisers'
 * own texts removed.
 */

const raw = (name: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(`./fixtures/eu-eci/${name}.json`, import.meta.url), 'utf8'))
const details = (name: string): EciInitiative => parseEciDetails(raw(`details-${name}`))

const FIXTURES = ['answered', 'insufficient-after-verification', 'insufficient', 'ongoing', 'registered-with-start', 'registered', 'submitted', 'withdrawn'] as const

describe('the register\'s addresses', () => {
  it('asks the list once, and one initiative by its padded number', () => {
    expect(eciListUrl()).toBe('https://register.eci.ec.europa.eu/core/api/register/search/ALL/DE/0/200')
    expect(eciDetailsUrl(2022, 2)).toBe('https://register.eci.ec.europa.eu/core/api/register/details/2022/000002')
    expect(() => eciDetailsUrl(2022, 0)).toThrow()
    expect(() => eciDetailsUrl(2011, 1)).toThrow()
    expect(() => eciDetailsUrl(2022, 1_000_000)).toThrow()
  })

  it('builds the register\'s public page of an initiative', () => {
    expect(eciPageUrl(2026, 9)).toBe('https://citizens-initiative.europa.eu/initiatives/details/2026/000009_de')
  })
})

describe('the monitor\'s address of an initiative', () => {
  it('carries year and number without padding', () => {
    expect(euCitizensInitiativePath(2022, 2)).toBe('/eu-recht/buergerinitiative/2022/2')
    expect(euCitizensInitiativePath(2026, 999_999)).toBe('/eu-recht/buergerinitiative/2026/999999')
    expect(euCitizensInitiativePath(2011, 2)).toBeNull()
    expect(euCitizensInitiativePath(2022, 0)).toBeNull()
    expect(euCitizensInitiativePath(2022, 1_000_000)).toBeNull()
    expect(euCitizensInitiativePath(2022, 1.5)).toBeNull()
    expect(euCitizensInitiativeReference(2022, 2)).toBe('ECI(2022)000002')
  })

  it('reads the route strictly: a padded number is null here — the page 301s it, the API answers 400', () => {
    const today = '2026-11-15'
    expect(euCitizensInitiativeAddress('2022', '2', today)).toEqual({ year: 2022, number: 2 })
    expect(euCitizensInitiativeAddress('2027', '1', today)).toEqual({ year: 2027, number: 1 })
    for (const [y, n] of [['2022', '000002'], ['2022', '02'], ['2028', '1'], ['2011', '1'], ['22', '2'], ['2022', '1234567'], ['2022', '2a'], ['2022', ''], ['2022', '-1']]) {
      expect(euCitizensInitiativeAddress(y!, n!, today), `${y}/${n}`).toBeNull()
    }
    // What the page's middleware does with a padded number: strips the zeros and finds a canonical address.
    const plain = '000002'.replace(/^0+(?=\d)/, '')
    expect(euCitizensInitiativeAddress('2022', plain, today)).toEqual({ year: 2022, number: 2 })
  })
})

describe('the register\'s days', () => {
  it('turns dd/mm/yyyy, with or without a time, into an ISO day; anything else is null', () => {
    expect(eciDay('13/11/2027')).toBe('2027-11-13')
    expect(eciDay('13/11/2026 00:00')).toBe('2026-11-13')
    expect(eciDay('25/01/2026 20:25')).toBe('2026-01-25')
    for (const v of ['', '31/02/2026', '2026-11-13', '13.11.2026', '1/1/2026', null, undefined, 13112026]) expect(eciDay(v), String(v)).toBeNull()
  })
})

describe('the reader of one initiative', () => {
  it('reads every fixture without throwing, each under its own number', () => {
    for (const f of FIXTURES) {
      const i = details(f)
      expect(i.reference, f).toMatch(/^ECI\(\d{4}\)\d{6}$/)
      expect(i.title, f).toBeTruthy()
      expect(i.titleIsGerman, f).toBe(true)
      expect(i.registerUrl, f).toBe(eciPageUrl(i.year, i.number))
    }
  })

  it('reads an answered initiative: days, the submitted count with the Member State\'s own entry, the answer\'s three links', () => {
    const i = details('answered')
    expect(i).toMatchObject({
      year: 2022, number: 2, reference: 'ECI(2022)000002', status: 'ANSWERED',
      registered: '2022-03-16', collectionStart: '2022-05-18', deadline: null, earlyClosure: '2023-03-01', updated: '2023-12-07',
      supportLink: 'https://furfreeeurope.eu/',
      registrationDecisionUrl: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32022D0482',
      collected: null,
      submitted: { total: 1502319, byCountry: expect.objectContaining({ AT: 25136 }) },
    })
    expect(i.answer).toEqual({
      date: '2023-12-07',
      links: [
        { kind: 'COMMUNICATION', url: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:52023XC01559', language: 'DE' },
        { kind: 'PRESS_RELEASE', url: 'https://ec.europa.eu/commission/presscorner/detail/en/ip_23_6251', language: 'EN' },
        { kind: 'FOLLOW_UP', url: 'https://citizens-initiative.europa.eu/fur-free-europe', language: 'EN' },
      ],
    })
  })

  it('reads the running count of an initiative in collection, with its day', () => {
    const i = details('ongoing')
    expect(i).toMatchObject({ status: 'ONGOING', deadline: '2027-11-13', collectionStart: '2026-11-13', supportLink: 'https://eci.ec.europa.eu/069/public/?lg=de' })
    expect(i.collected).toMatchObject({ total: 126, asOf: '2026-11-15' })
  })

  it('takes progress unordered, as it comes, with a missing day as null and the early closure as a flag', () => {
    const a = details('answered')
    expect(a.progress.map((p) => p.name)).toEqual(['REGISTERED', 'SUBMITTED', 'CLOSED', 'VERIFICATION', 'ANSWERED', 'COLLECTION_START_DATE'])
    expect(a.progress.find((p) => p.name === 'CLOSED')).toEqual({ name: 'CLOSED', date: '2023-03-01', active: false, earlyClosure: true })
    expect(a.progress.filter((p) => p.active).map((p) => p.name)).toEqual(['ANSWERED'])
    const v = details('insufficient-after-verification')
    expect(v.progress.find((p) => p.name === 'VERIFICATION')).toEqual({ name: 'VERIFICATION', date: null, active: false, earlyClosure: false })
  })

  it('falls back to the original-language title, flagged, where no German version exists', () => {
    const answer = raw('details-ongoing')
    answer.linguisticVersions = (answer.linguisticVersions as Record<string, unknown>[]).filter((v) => v.languageCode !== 'DE').map((v) => ({ ...v, original: true, title: 'Everyone included' }))
    const i = parseEciDetails(answer)
    expect(i).toMatchObject({ title: 'Everyone included', titleIsGerman: false, supportLink: null, registrationDecisionUrl: null })
  })

  it('throws on a shape that is no initiative — never a half-read one', () => {
    expect(() => parseEciDetails(null)).toThrow()
    expect(() => parseEciDetails({ status: 'ONGOING', linguisticVersions: [] })).toThrow()
    expect(() => parseEciDetails({ comRegNum: 'ECI(2026)000009', linguisticVersions: [] })).toThrow()
    expect(() => parseEciDetails({ comRegNum: 'ECI(2026)000009', status: 'ONGOING' })).toThrow()
    expect(() => parseEciDetails({ ...raw('details-ongoing'), progress: 'x' })).toThrow()
  })

  it('never reads organisers, funders, logos or the organisers\' texts into its result', () => {
    // Invented, obviously fictional values in every field the reader must not take.
    const secret = ['Erika Mustermann', 'erika.mustermann@example.org', 'Max Mustermann', 'Musterstiftung', 'LOGO-BYTES', 'Unser Ziel ist erfunden', 'Anhang erfunden', 'https://musterinitiative.example', 'SECRET-TREATY', 'SECRET-CATEGORY', 'SECRET-PREANSWER', 'SECRET-DRAFT']
    const answer = raw('details-answered')
    answer.members = [{ fullName: 'Erika Mustermann', email: 'erika.mustermann@example.org', residenceCountry: 'AT', type: 'REPRESENTATIVE', privacyApplied: false }]
    answer.funding = { sponsors: [{ name: 'Max Mustermann', amount: 1000 }, { name: 'Musterstiftung', amount: 2000 }] }
    answer.logo = 'LOGO-BYTES'
    answer.categories = [{ categoryType: 'SECRET-CATEGORY' }]
    answer.preAnswer = 'SECRET-PREANSWER'
    answer.linguisticVersions = (answer.linguisticVersions as Record<string, unknown>[]).map((v) => ({
      ...v, objectives: 'Unser Ziel ist erfunden', annexText: 'Anhang erfunden', website: 'https://musterinitiative.example', treaties: 'SECRET-TREATY', draftLegal: 'SECRET-DRAFT', additionalDocument: 'SECRET-DRAFT',
    }))
    const json = JSON.stringify(parseEciDetails(answer))
    for (const s of secret) expect(json, s).not.toContain(s)
    // The field lists name none of them.
    for (const f of ['members', 'funding', 'logo', 'objectives', 'annexText', 'website', 'categories', 'treaties']) expect(ECI_DETAILS_FIELDS as readonly string[]).not.toContain(f)
    expect(ECI_LIST_FIELDS as readonly string[]).not.toContain('logo')
  })

  it('keeps the count of every country, and the page picks the one it serves — or none', () => {
    const i = details('insufficient')
    expect(i.collected).toMatchObject({ total: 74016, asOf: '2026-01-25' })
    expect(i.collected!.byCountry[EU_MEMBER_STATE_ECI]).toBe(1139)
    expect(Object.keys(i.collected!.byCountry).length).toBe(27)
    const own = (v: ReturnType<typeof euBuergerinitiativeView>) => JSON.stringify(v.sections).includes('davon aus')
    expect(own(euBuergerinitiativeView(i, TODAY))).toBe(true)
    // A page that serves no country shows no country's count, and misses none.
    const neutral = euBuergerinitiativeView(i, TODAY, null)
    expect(own(neutral)).toBe(false)
    expect(JSON.stringify(neutral)).not.toContain('nennt das Register hier nicht')
    // A country the register lists no entry for: said, not shown as 0.
    expect(JSON.stringify(euBuergerinitiativeView(i, TODAY, 'XX'))).toContain('nennt das Register hier nicht')
  })
})

describe('the reader of the list', () => {
  const list = parseEciList(raw('search-de'))

  it('reads all 136 entries and the register\'s head counts', () => {
    expect(list.entries).toHaveLength(136)
    expect(list.counts).toEqual({ requests: 162, registered: 136, ongoing: 13, answered: 14, successful: 15, all: 136 })
    expect(list.entries.filter((e) => e.status === 'ONGOING')).toHaveLength(13)
    expect(list.entries[0]).toEqual({ year: 2026, number: 9, reference: 'ECI(2026)000009', title: 'Alle dabei – Für Ihr Recht auf eine Bürgerschaft ohne Grenzen', titleIsGerman: true, status: 'ONGOING', supporters: 126, updated: '2026-11-13' })
  })

  it('refuses a list the page cut, and a shape it does not know', () => {
    expect(() => parseEciList({ recordsFound: 137, entries: (raw('search-de').entries as unknown[]) })).toThrow()
    expect(() => parseEciList({})).toThrow()
    expect(() => parseEciList({ entries: [{ year: '2026', status: 'ONGOING' }] })).toThrow()
  })

  it('drops an initiative whose last day has passed since the register was read, and keeps one without a day', () => {
    const rows = [{ deadline: '2026-11-14' }, { deadline: '2026-11-15' }, { deadline: null }]
    expect(eciOpenOn(rows, '2026-11-15')).toEqual([{ deadline: '2026-11-15' }, { deadline: null }])
  })
})

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

const TODAY = '2026-11-15'
const view = (name: string, today = TODAY) => euBuergerinitiativeView(details(name), today)
const rail = (v: ReturnType<typeof view>) => v.stations.map((s) => `${s.name}${s.ahead ? ' (ahead)' : ''}${s.current ? ' *' : ''}`)

describe('the page of an initiative', () => {
  it('in collection: „Sammlung läuft", the door counting to the last day, the stations ahead without sections', () => {
    const v = view('ongoing')
    expect(v.identity).toBe('Europäische Bürgerinitiative · ECI(2026)000009')
    expect(v.status).toBe('Sammlung läuft')
    expect(rail(v)).toEqual(['Registrierung', 'Sammlung *', 'Prüfung (ahead)', 'Einreichung (ahead)', 'Antwort der Kommission (ahead)'])
    expect(v.stations.find((s) => s.id === 'sammlung')!.facts).toEqual(['seit 13.11.2026', 'bis 13.11.2027'])
    expect(v.stations.find((s) => s.id === 'pruefung')!.gap).toBe('Nach der Sammlung prüfen die Mitgliedstaaten die Unterstützungsbekundungen.')
    expect(v.stations.filter((s) => s.ahead).slice(1).every((s) => s.gap === null)).toBe(true)
    expect(v.sections.map((s) => s.id)).toEqual(['registrierung', 'sammlung'])
    expect(v.action).toEqual({
      end: '2027-11-13', heading: null, href: 'https://eci.ec.europa.eu/069/public/?lg=de', label: 'Bürgerinitiative unterstützen',
      // No sentence of ours: the day is the heading's, the way the button's. Above the button, the Commission's words on what a million signatures bring.
      note: null,
      quote: {
        text: 'Mit einer Europäischen Bürgerinitiative können Sie die EU mitgestalten und die Europäische Kommission auffordern, neue Gesetze vorzuschlagen. Dafür benötigen Sie eine Million gültige Unterschriften. Falls eine Initiative erfolgreich ist, entscheidet die Kommission, welche Maßnahmen sie ergreift.',
        source: 'Europäische Kommission',
      },
      gap: null,
    })
    const sammlung = v.sections.find((s) => s.id === 'sammlung')!
    // The door once more at the end of „Sammlung", with the card's label, and nowhere else.
    expect(v.sections.filter((s) => s.door).map((s) => s.id)).toEqual(['sammlung'])
    expect(sammlung.door).toEqual({ href: 'https://eci.ec.europa.eu/069/public/?lg=de', label: 'Bürgerinitiative unterstützen' })
    expect(sammlung.facts.map((f) => [f.title, f.parts])).toEqual([
      ['Beginn', ['13.11.2026']],
      ['Ende', ['bis 13.11.2027']],
      ['Unterstützungen laut Register', ['126', 'Stand 15.11.2026']],
      ['davon aus Österreich', ['0']],
    ])
    expect(splitGap(sammlung.notes.at(-1))?.lead).toBe('Nicht im Monitor')
    expect(sammlung.credits).toEqual(['Quelle:', 'Europäische Kommission, Register der Europäischen Bürgerinitiative'])
  })

  it('has no door once the last day has passed, whatever the cached status says', () => {
    const v = view('ongoing', '2027-11-14')
    expect(v.action).toBeNull()
    expect(v.sections.some((s) => s.door)).toBe(false)
    expect(v.status).toBe('Sammlung beendet')
    expect(v.stations.find((s) => s.id === 'sammlung')!.facts).toEqual(['begonnen am 13.11.2026', 'beendet am 13.11.2027'])
    // On the last day itself, the door stands.
    expect(view('ongoing', '2027-11-13').action?.end).toBe('2027-11-13')
  })

  it('without a link to sign: no button, a gap sentence', () => {
    const v = euBuergerinitiativeView({ ...details('ongoing'), supportLink: null }, TODAY)
    // No link, no sentence about it: the gap sentence alone, and no second door.
    expect(v.action).toMatchObject({ href: null, note: null, quote: null })
    expect(splitGap(v.action!.gap)?.lead).toBe('Nicht veröffentlicht')
    expect(v.sections.some((s) => s.door)).toBe(false)
  })

  it('registered, no start set: „Registriert", the collection ahead with one line', () => {
    const v = view('registered')
    expect(v.status).toBe('Registriert')
    expect(rail(v)).toEqual(['Registrierung *', 'Sammlung (ahead)', 'Prüfung (ahead)', 'Einreichung (ahead)', 'Antwort der Kommission (ahead)'])
    expect(v.stations[1]!.gap).toBe('Das Register nennt noch keinen Beginn der Sammlung.')
    expect(v.sections.map((s) => s.id)).toEqual(['registrierung'])
    expect(v.action).toBeNull()
  })

  it('registered with a start day: the collection ahead says when it begins', () => {
    const v = view('registered-with-start')
    expect(v.status).toBe('Registriert')
    expect(v.stations[1]).toMatchObject({ id: 'sammlung', ahead: true, gap: 'beginnt laut Register am 04.01.2027' })
    expect(v.sections.map((s) => s.id)).toEqual(['registrierung'])
  })

  it('the registration section links the Commission\'s decision on EUR-Lex and the register for the objectives', () => {
    const reg = view('registered').sections[0]!
    expect(reg.facts.map((f) => [f.title, f.parts])).toEqual([
      ['Registriert', ['06.10.2026']],
      ['Beschluss der Kommission', [{ href: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32026D2308', label: 'Registrierung auf EUR-Lex' }]],
      ['Ziele der Initiative', [{ href: 'https://citizens-initiative.europa.eu/initiatives/details/2026/000012_de', label: 'im Register' }]],
    ])
  })

  it('submitted: every station up to „Einreichung" reached, the answer ahead with its one line', () => {
    const v = view('submitted')
    expect(v.status).toBe('Eingereicht')
    expect(rail(v)).toEqual(['Registrierung', 'Sammlung', 'Prüfung', 'Einreichung *', 'Antwort der Kommission (ahead)'])
    expect(v.stations.find((s) => s.id === 'sammlung')!.facts).toEqual(['begonnen am 13.01.2026', 'beendet am 15.07.2026', 'vorzeitig beendet'])
    expect(v.stations.at(-1)!.gap).toBe('Binnen sechs Monaten antwortet die Kommission mit Gründen.')
    const einreichung = v.sections.find((s) => s.id === 'einreichung')!
    expect(einreichung.facts.map((f) => f.title)).toEqual(['Eingereicht', 'Unterstützungen bei der Einreichung', 'davon aus Österreich'])
    expect(einreichung.facts[1]!.parts).toEqual(['1.117.104'])
    // The collection had no running count; the sentence says where the count stands.
    expect(v.sections.find((s) => s.id === 'sammlung')!.notes).toEqual([expect.stringContaining('„Einreichung“')])
    expect(v.action).toBeNull()
  })

  it('answered: five stations reached, the answer highlighted, its links under our names', () => {
    const v = view('answered')
    expect(v.status).toBe('Von der Kommission beantwortet')
    expect(rail(v)).toEqual(['Registrierung', 'Sammlung', 'Prüfung', 'Einreichung', 'Antwort der Kommission *'])
    expect(v.stations.map((s) => s.facts)).toEqual([
      ['16.03.2022'],
      ['begonnen am 18.05.2022', 'beendet am 01.03.2023', 'vorzeitig beendet'],
      ['13.03.2023'],
      ['14.06.2023'],
      ['07.12.2023'],
    ])
    const antwort = v.sections.find((s) => s.id === 'antwort')!
    expect(antwort.facts[1]!.parts).toEqual([
      { href: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:52023XC01559', label: 'Mitteilung der Kommission' },
      { href: 'https://ec.europa.eu/commission/presscorner/detail/en/ip_23_6251', label: 'Pressemitteilung (englisch)' },
      { href: 'https://citizens-initiative.europa.eu/fur-free-europe', label: 'Folgemaßnahmen (englisch)' },
    ])
    expect(v.sections.map((s) => s.id)).toEqual(['registrierung', 'sammlung', 'pruefung', 'einreichung', 'antwort'])
  })

  it('withdrawn: ends on „Zurückgezogen" with the register\'s day; the later stations are not drawn', () => {
    const v = view('withdrawn')
    expect(v.status).toBe('Zurückgezogen')
    expect(rail(v)).toEqual(['Registrierung', 'Sammlung', 'Zurückgezogen *'])
    expect(v.stations.at(-1)!.facts).toEqual(['laut Register am 18.09.2024'])
    expect(v.sections.map((s) => s.id)).toEqual(['registrierung', 'sammlung', 'ruecknahme'])
    expect(v.action).toBeNull()
  })

  it('not enough support: ends on its own station, worded as the register\'s statement', () => {
    const v = view('insufficient')
    expect(v.status).toBe('Nicht genug Unterstützungen laut Register')
    expect(rail(v)).toEqual(['Registrierung', 'Sammlung', 'Nicht genug Unterstützungen *'])
    expect(v.stations.at(-1)!.facts).toEqual(['laut Register am 16.04.2026'])
    const sammlung = v.sections.find((s) => s.id === 'sammlung')!
    expect(sammlung.facts.find((f) => f.title === 'davon aus Österreich')!.parts).toEqual(['1.139'])

    const after = view('insufficient-after-verification')
    expect(after.status).toBe('Nicht genug Unterstützungen laut Register')
    expect(rail(after)).toEqual(['Registrierung', 'Sammlung', 'Prüfung', 'Nicht genug Unterstützungen *'])
    // The register gives the verification no day: said, not left empty.
    expect(after.stations.find((s) => s.id === 'pruefung')!.facts).toEqual(['ohne Datum im Register'])
  })

  it('a section exists only for a station reached, and the one highlight sits on the last reached station that shows something', () => {
    for (const f of FIXTURES) {
      const v = view(f)
      expect(v.stations.filter((s) => s.current), f).toHaveLength(1)
      const current = v.stations.find((s) => s.current)!
      expect(current.ahead, f).toBeUndefined()
      expect(v.stations.slice(v.stations.indexOf(current) + 1).every((s) => s.ahead), f).toBe(true)
      expect(v.sections.map((s) => s.id), f).toEqual(v.stations.filter((s) => !s.ahead).map((s) => s.id))
      expect(v.sections.every((s) => s.facts.length > 0), f).toBe(true)
      expect(v.unknownSteps, f).toBeNull()
    }
  })

  it('a step outside the known ten is shown nowhere as a station; a „Nicht im Monitor" sentence says it, and nothing throws', () => {
    const i = details('ongoing')
    const v = euBuergerinitiativeView({ ...i, progress: [...i.progress, { name: 'SUSPENDED', date: '2026-11-14', active: false, earlyClosure: false }] }, TODAY)
    expect(ECI_KNOWN_STEPS.has('SUSPENDED')).toBe(false)
    expect(rail(v)).toEqual(rail(view('ongoing')))
    expect(splitGap(v.unknownSteps)).toMatchObject({ lead: 'Nicht im Monitor' })
    expect(v.unknownSteps).toContain('„SUSPENDED“ (14.11.2026)')
    // An unknown status falls back to a neutral heading.
    expect(euBuergerinitiativeView({ ...i, status: 'SOMETHING_NEW' }, TODAY).status).toBe('Die Initiative im Verfahren')
  })

  it('flags a title that is not German', () => {
    const v = euBuergerinitiativeView({ ...details('ongoing'), title: 'Everyone included', titleIsGerman: false }, TODAY)
    expect(v.titleNote).toBe('Das Register führt den Titel nicht auf Deutsch; er steht hier in der Originalsprache.')
  })

  it('says no day count, threshold or judgement in the rail', () => {
    for (const f of FIXTURES) {
      const words = JSON.stringify(view(f).stations)
      expect(words, f).not.toMatch(/Tage|Schwelle erreicht|gescheitert|erfolgreich|verfehlt/)
    }
  })
})

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

const row = (over: Partial<EciOpenRow>): EciOpenRow => ({ year: 2026, number: 1, reference: 'ECI(2026)000001', title: 'Titel', titleIsGerman: true, status: 'ONGOING', supporters: 10, updated: null, deadline: '2027-01-01', details: 'gelesen', ...over })
const response = (initiatives: EciOpenRow[] | null): EuBuergerinitiativenResponse => ({ initiatives, counts: null, registerUrl: 'https://citizens-initiative.europa.eu/_de' })

describe('the list of initiatives in collection', () => {
  it('opens by last day, soonest first, then by number — not by supporters', () => {
    const v = euEciListView(response([
      row({ number: 3, deadline: '2027-05-01', supporters: 1_000_000 }),
      row({ number: 1, deadline: '2027-01-01', supporters: 5 }),
      row({ number: 10, deadline: null, details: 'ausstehend' }),
      row({ number: 2, deadline: '2027-01-01', supporters: 500 }),
      row({ year: 2025, number: 4, deadline: null, details: 'ungelesen' }),
    ]))
    expect(v.rows!.map((r) => r.key)).toEqual(['2026/1', '2026/2', '2026/3', '2025/4', '2026/10'])
    expect(v.rows![0]).toMatchObject({ path: '/eu-recht/buergerinitiative/2026/1', gap: null })
  })

  it('lets the reader order by last day, title or supporters, each reversible; a missing day or count last both ways', () => {
    const rows = euEciListView(response([
      row({ number: 1, title: 'Wasser', deadline: '2027-03-01', supporters: 500 }),
      row({ number: 2, title: 'Äpfel', deadline: '2027-01-01', supporters: null }),
      row({ number: 3, title: 'Bienen', deadline: null, details: 'ungelesen', supporters: 9000 }),
      row({ number: 4, title: 'Meer', deadline: '2027-02-01', supporters: 500 }),
      row({ number: 5, title: 'Luft', deadline: '2027-01-15', supporters: 0 }),
    ])).rows!
    const keys = (sort: 'ende' | 'titel' | 'unterstuetzungen', reversed: boolean) => sortEciRows(rows, sort, reversed).map((r) => r.key.split('/')[1])
    expect(keys('ende', false)).toEqual(['2', '5', '4', '1', '3'])
    expect(keys('ende', true)).toEqual(['1', '4', '5', '2', '3'])
    expect(keys('titel', false)).toEqual(['2', '3', '5', '4', '1'])
    expect(keys('titel', true)).toEqual(['1', '4', '5', '3', '2'])
    // Most first; ties by the last day, nearest first; 0 is a count, „nicht angegeben" is not.
    expect(keys('unterstuetzungen', false)).toEqual(['3', '4', '1', '5', '2'])
    expect(keys('unterstuetzungen', true)).toEqual(['5', '4', '1', '3', '2'])
    expect(EU_ECI_LIST_DE.order.supporters).toEqual(['meiste zuerst', 'wenigste zuerst'])
  })

  it('carries the count in its own column: the number in ink, „laut Register" in its words, a missing count a word and never 0', () => {
    const v = euEciListView(response([row({ number: 1, supporters: 1_000_000 }), row({ number: 2, supporters: null }), row({ number: 3, supporters: 0 })]))
    expect(v.rows!.map((r) => r.supporters)).toEqual([
      { value: '1.000.000', counted: true, detail: null, said: 'Unterstützungen laut Register: 1.000.000' },
      { value: 'nicht angegeben', counted: false, detail: null, said: 'Unterstützungen laut Register: nicht angegeben' },
      { value: '0', counted: true, detail: null, said: 'Unterstützungen laut Register: 0' },
    ])
    expect(EU_ECI_LIST_DE.column.supporters).toBe('Unterstützungen')
    expect(EU_ECI_LIST_DE.countSource).toBe('Unterstützungen laut Register')
  })

  it('keeps a row whose day is not read, with a gap sentence in place of the day', () => {
    const v = euEciListView(response([row({ deadline: null, details: 'ausstehend' }), row({ number: 2, deadline: null, details: 'ungelesen' })]))
    expect(v.rows).toHaveLength(2)
    for (const r of v.rows!) {
      expect(splitGap(r.gap)?.lead).toBe('Gerade nicht abrufbar')
      expect(r.state.tone).toBe('neutral')
    }
  })

  it('tells the unread register from an empty one', () => {
    expect(euEciListView(response(null)).rows).toBeNull()
    expect(euEciListView(response([])).rows).toEqual([])
  })

  it('flags a title that is not German, and names an untitled one by its number', () => {
    const v = euEciListView(response([row({ titleIsGerman: false }), row({ number: 2, reference: 'ECI(2026)000002', title: null })]))
    expect(v.rows!.map((r) => [r.title, r.titleNote])).toEqual([['Titel', 'Titel in der Originalsprache'], ['Europäische Bürgerinitiative ECI(2026)000002', null]])
  })
})
