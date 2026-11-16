import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { EuFeedbackReading } from '../shared/types'
import { EU_FEEDBACK_ORGANISATION_TYPES } from '../shared/utils/euPortal'
import {
  FEEDBACK_MAX_ROWS,
  FEEDBACK_NAMED_ROW_FIELDS,
  FEEDBACK_ROW_FIELDS,
  ORGANISATION_NAME_MAX,
  type FeedbackRow,
  feedbackDay,
  feedbackUrl,
  namedOrganisationOf,
  parseFeedbackPage,
  readFeedback,
  rowOf,
  summarize,
} from '../server/utils/eu/portalFeedback'
import { contributionPageUrl } from '../server/utils/eu/haveYourSay'
import { STATEMENT_PAGE_SIZE, STATEMENT_SEARCH_MIN } from '../app/utils/statementRows'
import {
  type EuFeedbackRow,
  type EuFeedbackSelection,
  citizenRowsOf,
  citizensSetLine,
  closingRowsOf,
  compareFeedbackRows,
  euFeedbackView,
  feedbackBlocksOf,
  feedbackRowsOf,
  feedbackSetLine,
  rowsOfKind,
} from '../app/utils/euFeedback'
import { countryNameOf } from '../shared/utils/countryNames'
import { fact, withFeedback } from '../app/utils/euRail'

/* Who gave feedback on the Commission's portal (step 4 of the EU cycle).
 * The fixture (tests/fixtures/eu-portal/feedback-page.json) is SYNTHETIC:
 * the shape of the portal's answer as measured on 15.11.2026, every person
 * in it invented, every text written for this test. Real organisation names
 * only for large institutions. The rule's own cases below are built the
 * same way — the shapes measured, the people made up. */

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/eu-portal/${name}.json`, import.meta.url), 'utf8'))

/** A row the rule names: a large company, published anonymously — the person's name withheld, the organisation's published. */
const NAMED = {
  status: 'PUBLISHED',
  userType: 'COMPANY',
  publication: 'ANONYMOUS',
  organization: 'Siemens AG',
  companySize: 'LARGE',
  firstName: '',
  surname: '',
  country: 'DEU',
}
const with_ = (over: Record<string, unknown>) => ({ ...NAMED, ...over })
const without = (key: string) => Object.fromEntries(Object.entries(NAMED).filter(([k]) => k !== key))

describe('the naming rule', () => {
  it('names the base row, and each condition alone flips it to counted', () => {
    expect(namedOrganisationOf(NAMED)).toBe('Siemens AG')
    // 1. published
    expect(namedOrganisationOf(with_({ status: 'REJECTED' }))).toBeNull()
    expect(namedOrganisationOf(with_({ status: 'ANONYMISED_BY_USER' }))).toBeNull()
    expect(namedOrganisationOf(without('status'))).toBeNull()
    // 2. an organisation kind
    expect(namedOrganisationOf(with_({ userType: 'EU_CITIZEN' }))).toBeNull()
    // 3. a known way of publication
    expect(namedOrganisationOf(with_({ publication: 'SOMETHING_ELSE' }))).toBeNull()
    // 4. a name
    expect(namedOrganisationOf(with_({ organization: '' }))).toBeNull()
    // 5. a structural witness
    expect(namedOrganisationOf(with_({ companySize: 'MICRO' }))).toBeNull()
    // 6. a name witness
    expect(namedOrganisationOf(with_({ organization: 'Siemens Beispiel AG', surname: 'Beispiel' }))).toBeNull()
    // 7. A number or an address in the organisation field is no name (a sender typed an identity number there, 15.11.2026).
    expect(namedOrganisationOf(with_({ organization: '12345678Z' }))).toBeNull()
    expect(namedOrganisationOf(with_({ organization: 'Beispiel Verband, Tel. 0123 456 789' }))).toBeNull()
    expect(namedOrganisationOf(with_({ organization: 'Beispiel Verband (kontakt@beispiel.example)' }))).toBeNull()
    // 8. Only the head of the field is shown: what a sender appends after „;" or „Contact:" may name a person.
    expect(namedOrganisationOf(with_({ organization: 'Beispiel Verband (BV) Contact: Erika Mustermann' }))).toBe('Beispiel Verband (BV)')
    expect(namedOrganisationOf(with_({ organization: 'Universität Beispielstadt; Max Mustermann ist Mitautor dieser Antwort' }))).toBe('Universität Beispielstadt')
    expect(namedOrganisationOf(with_({ organization: '; Erika Mustermann' }))).toBeNull()
    expect(namedOrganisationOf(with_({ organization: 'European Contact Group' }))).toBe('European Contact Group')
    // A year or a short number stays a name.
    expect(namedOrganisationOf(with_({ organization: 'Autoridade de Gestão Programa Mar 2030' }))).toBe('Autoridade de Gestão Programa Mar 2030')
    expect(namedOrganisationOf(with_({ organization: '3F - The United Federation of Workers in Denmark' }))).toBe('3F - The United Federation of Workers in Denmark')
  })

  it('names the eight organisation kinds, and counts every other kind — the unknown and the misspelt-correctly too', () => {
    for (const type of EU_FEEDBACK_ORGANISATION_TYPES) expect(namedOrganisationOf(with_({ userType: type })), type).toBe('Siemens AG')
    // The portal's own spelling is the code; the correct spelling is no code it sends.
    expect(EU_FEEDBACK_ORGANISATION_TYPES).toContain('ACADEMIC_RESEARCH_INSTITTUTION')
    for (const type of ['EU_CITIZEN', 'NON_EU_CITIZEN', 'OTHER', 'ACADEMIC_RESEARCH_INSTITUTION', 'company', 'SOMETHING_NEW', '', 7, null]) {
      expect(namedOrganisationOf(with_({ userType: type })), String(type)).toBeNull()
    }
    expect(namedOrganisationOf(without('userType'))).toBeNull()
  })

  it('names WITHINFO and ANONYMOUS rows alike, and nothing published another way', () => {
    expect(namedOrganisationOf(with_({ publication: 'WITHINFO', firstName: 'Erika', surname: 'Mustermann' }))).toBe('Siemens AG')
    expect(namedOrganisationOf(with_({ publication: 'ANONYMOUS' }))).toBe('Siemens AG')
    expect(namedOrganisationOf(without('publication'))).toBeNull()
    expect(namedOrganisationOf(with_({ publication: 'anonymous' }))).toBeNull()
  })

  it('needs a name that is more than whitespace', () => {
    for (const organization of ['', '   ', ' \n\t ', null, 42, ['Siemens AG']]) {
      expect(namedOrganisationOf(with_({ organization })), JSON.stringify(organization)).toBeNull()
    }
    expect(namedOrganisationOf(without('organization'))).toBeNull()
  })

  it('takes SMALL, MEDIUM, LARGE or a register number as the structural witness, and nothing else', () => {
    for (const companySize of ['SMALL', 'MEDIUM', 'LARGE']) expect(namedOrganisationOf(with_({ companySize })), companySize).toBe('Siemens AG')
    // MICRO and no size: counted — a sole trader carries their own name as the business name …
    expect(namedOrganisationOf(with_({ companySize: 'MICRO' }))).toBeNull()
    expect(namedOrganisationOf(without('companySize'))).toBeNull()
    expect(namedOrganisationOf(with_({ companySize: null }))).toBeNull()
    expect(namedOrganisationOf(with_({ companySize: 'HUGE' }))).toBeNull()
    // … unless the row carries a number in the Transparency Register.
    expect(namedOrganisationOf(with_({ companySize: 'MICRO', trNumber: '12345678901-23' }))).toBe('Siemens AG')
    expect(namedOrganisationOf(with_({ companySize: null, trNumber: '12345678901-23' }))).toBe('Siemens AG')
    // A register field without a digit is no number.
    for (const trNumber of ['', '  ', 'n/a', 'keine', '-']) expect(namedOrganisationOf(with_({ companySize: 'MICRO', trNumber })), trNumber).toBeNull()
    // An odd kind of field: counted.
    expect(namedOrganisationOf(with_({ companySize: 3 }))).toBeNull()
    expect(namedOrganisationOf(with_({ companySize: 'MICRO', trNumber: 1234 }))).toBeNull()
  })

  it('counts a name that echoes the sender\'s, whatever the case or the accents (invented cases in the measured shapes)', () => {
    // A consultancy that carries its owner's name inside a longer name.
    expect(namedOrganisationOf(with_({ organization: 'Think Resiliency - Erich Fiktivhauser. Advisory', companySize: 'SMALL', firstName: 'Erich', surname: 'Fiktivhauser', publication: 'WITHINFO' }))).toBeNull()
    // The surname in capitals in the organisation, in title case in the field.
    expect(namedOrganisationOf(with_({ organization: 'IDEE ECONOMICHE di Marta BEISPIELINI', trNumber: '12345678901-23', firstName: 'Marta', surname: 'Beispielini', publication: 'WITHINFO' }))).toBeNull()
    // Only the surname matches: enough.
    expect(namedOrganisationOf(with_({ organization: 'Beispielini Holding', surname: 'Beispielini', firstName: 'Zoe' }))).toBeNull()
    // Accents and case folded both ways.
    expect(namedOrganisationOf(with_({ organization: 'Atelier José Beispiel', surname: 'JOSE' }))).toBeNull()
    expect(namedOrganisationOf(with_({ organization: 'Atelier Jose Beispiel', firstName: 'José' }))).toBeNull()
    expect(namedOrganisationOf(with_({ organization: 'Müllerfiktiv GmbH', surname: 'MÜLLERFIKTIV' }))).toBeNull()
    // Unicode-aware: Greek with its tonos, upper against lower case.
    expect(namedOrganisationOf(with_({ organization: 'Εταιρεία Παπαφιχτίδης ΑΕ', surname: 'ΠΑΠΑΦΙΧΤΊΔΗΣ' }))).toBeNull()
    // NFC against NFD: the same name in two encodings.
    expect(namedOrganisationOf(with_({ organization: 'Café Fiktiv'.normalize('NFD'), surname: 'Fiktiv' }))).toBeNull()
  })

  it('compares whole words of three letters or more, and nothing shorter', () => {
    // A word inside another word is no echo.
    expect(namedOrganisationOf(with_({ organization: 'Siemens AG', surname: 'Sie' }))).toBe('Siemens AG')
    expect(namedOrganisationOf(with_({ organization: 'Annaberg Werke AG', firstName: 'Anna' }))).toBe('Annaberg Werke AG')
    // Two letters are not compared.
    expect(namedOrganisationOf(with_({ organization: 'Ng Fiktiv Holdings', surname: 'Ng' }))).toBe('Ng Fiktiv Holdings')
    // Digits and punctuation are no part of a word.
    expect(namedOrganisationOf(with_({ organization: 'Fiktiv-Werke 2026 AG', surname: 'Werke' }))).toBeNull()
  })

  it('counts the measured sole-trader shapes, and names the large anonymous company', () => {
    // An anonymous micro association without a register number: its name may be a person's.
    expect(namedOrganisationOf({ ...NAMED, userType: 'NGO', organization: 'Musterhegyi Csilla Fiktív e.v.', companySize: 'MICRO' })).toBeNull()
    expect(namedOrganisationOf({ ...NAMED, organization: 'Siemens AG', companySize: 'LARGE', publication: 'ANONYMOUS', firstName: '', surname: '' })).toBe('Siemens AG')
  })

  it('counts a row whose name fields are odd, and anything that is no row', () => {
    expect(namedOrganisationOf(with_({ firstName: 42 }))).toBeNull()
    expect(namedOrganisationOf(with_({ surname: { text: 'x' } }))).toBeNull()
    // Absent or null name fields are no names (an anonymous row carries them empty).
    expect(namedOrganisationOf(without('firstName'))).toBe('Siemens AG')
    expect(namedOrganisationOf(with_({ surname: null }))).toBe('Siemens AG')
    for (const raw of [null, undefined, 'Siemens AG', 7, [NAMED]]) expect(namedOrganisationOf(raw)).toBeNull()
  })

  it('shows the name collapsed, and counts a text longer than a name gets', () => {
    expect(namedOrganisationOf(with_({ organization: '  Wirtschaftskammer\n\n   Österreich  ' }))).toBe('Wirtschaftskammer Österreich')
    const atCeiling = 'B'.repeat(ORGANISATION_NAME_MAX)
    expect(namedOrganisationOf(with_({ organization: atCeiling }))).toBe(atCeiling)
    // A description, not a name: counted, never cut and shown.
    expect(namedOrganisationOf(with_({ organization: `Beispielverband ${'für eine sehr lange Beschreibung '.repeat(20)}` }))).toBeNull()
    // A web address ends the name.
    expect(namedOrganisationOf(with_({ organization: 'Beispielverband [www.beispiel.example], zusammen mit Erika Mustermann' }))).toBe('Beispielverband')
  })
})

describe('the parser', () => {
  it('drops everything about the people and the texts: no name, no login, no text, no attachment', () => {
    const raw = fixture('feedback-page') as { content: Record<string, unknown>[] }
    const values = raw.content.flatMap((r) => [
      r.firstName,
      r.surname,
      r.login,
      r.feedback,
      r.feedbackTextUserLanguage,
      ...(r.attachments as { fileName: string; documentId: string }[]).flatMap((a) => [a.fileName, a.documentId]),
    ]).filter((v): v is string => typeof v === 'string' && v.length > 0)
    // The fixture does carry them — otherwise this test proves nothing.
    expect(values.length).toBeGreaterThan(40)
    const page = parseFeedbackPage(raw)
    for (const out of [JSON.stringify(page), JSON.stringify(summarize(page.rows, page.total, 13192)), JSON.stringify(euFeedbackView(summarize(page.rows, page.total, 13192)))]) {
      for (const value of values) expect(out, value).not.toContain(value)
      expect(out).not.toMatch(/login|feedbackText|attachment|firstName|surname|fileName/i)
    }
    // Two shapes, each with a fixed list of keys, and none of a person's.
    for (const row of page.rows) {
      expect(Object.keys(row).sort()).toEqual(row.named ? ['country', 'date', 'id', 'name', 'named', 'type'] : ['country', 'named', 'published', 'type'])
    }
    const fields: readonly string[] = [...FEEDBACK_ROW_FIELDS, ...FEEDBACK_NAMED_ROW_FIELDS]
    for (const personal of ['firstName', 'surname', 'login', 'feedback', 'feedbackTextUserLanguage', 'attachments']) expect(fields).not.toContain(personal)
  })

  it('keeps a counted row\'s day and number nowhere — structurally: a citizen and an unnamed organisation with both', () => {
    const citizen = { id: 424242001, dateFeedback: '2019/03/07 11:22:33', status: 'PUBLISHED', userType: 'EU_CITIZEN', publication: 'WITHINFO', firstName: 'Erika', surname: 'Mustermann', country: 'AUT' }
    const unnamed = { ...NAMED, id: 424242002, dateFeedback: '2018/04/09 01:02:03', companySize: 'MICRO', publication: 'WITHINFO', country: 'AUT' }
    const unpublished = { ...NAMED, id: 424242003, dateFeedback: '2017/05/11 04:05:06', status: 'REJECTED' }
    const rows = [citizen, unnamed, unpublished].map(rowOf)
    expect(rows.every((r) => !r.named)).toBe(true)
    const outs = [JSON.stringify(rows), JSON.stringify(summarize(rows, 3, 13192))]
    for (const out of outs) {
      for (const value of ['424242001', '424242002', '424242003', '2019-03-07', '2019/03/07', '2018-04-09', '2018/04/09', '2017-05-11', '2017/05/11']) expect(out, value).not.toContain(value)
      expect(out).not.toMatch(/"date"|"id"|"url"|"name"/)
    }
    // The same rows, named, keep both: the parser reads them, and only for a named row.
    const named = rowOf({ ...NAMED, id: 424242004, dateFeedback: '2026/11/15 18:15:22' })
    expect(named).toEqual({ named: true, type: 'COMPANY', name: 'Siemens AG', country: 'DEU', date: '2026-11-15', id: 424242004 })
  })

  it('reads the day of a contribution, and nothing that is no day', () => {
    expect(feedbackDay('2026/11/15 18:15:22')).toBe('2026-11-15')
    expect(feedbackDay('2026/11/15')).toBe('2026-11-15')
    expect(feedbackDay('2024/02/29 00:00:00')).toBe('2024-02-29')
    for (const bad of ['2026/13/40 10:00:00', '2025/02/29 10:00:00', '15.11.2026', '2026-11-15T18:15:22Z', '2026/11/15 garbage', '', null, undefined, 20261115]) {
      expect(feedbackDay(bad), String(bad)).toBeNull()
    }
  })

  it('keeps a named row\'s number only where it is a positive integer, and lists the row without a link otherwise', () => {
    for (const id of ['987654313', 0, -3, 1.5, null, undefined, Number.MAX_SAFE_INTEGER + 2]) {
      const row = rowOf({ ...NAMED, id, dateFeedback: '2026/11/15 10:00:00' }) as Extract<FeedbackRow, { named: true }>
      expect(row.named, String(id)).toBe(true)
      expect(row.id, String(id)).toBeNull()
      expect(summarize([row], 1, 13192).contributions[0]!.url).toBeNull()
    }
  })

  it('reads the fixture into the list and counts, every row in exactly one figure', () => {
    const page = parseFeedbackPage(fixture('feedback-page'))
    expect(page).toMatchObject({ page: 0, total: 14, last: true })
    const r = summarize(page.rows, page.total, 13192)
    const link = (id: number) => `https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/13192/F${id}_de`
    expect(r).toEqual({
      total: 14,
      read: 14,
      // One row per contribution, in the portal's order: Siemens twice, as typed each time — never merged.
      contributions: [
        { name: 'Siemens AG', type: 'COMPANY', country: 'DEU', date: '2026-11-14', url: link(987654301) },
        { name: 'European Trade Union Confederation (ETUC)', type: 'TRADE_UNION', country: 'BEL', date: '2026-11-13', url: link(987654302) },
        { name: 'City of Vienna', type: 'PUBLIC_AUTHORITY', country: 'AUT', date: '2026-11-12', url: link(987654303) },
        { name: 'Wirtschaftskammer Österreich', type: 'BUSINESS_ASSOCIATION', country: 'AUT', date: '2026-11-11', url: link(987654304) },
        { name: 'SIEMENS AG', type: 'COMPANY', country: 'AUT', date: '2026-11-13', url: link(987654312) },
        // A number that is a string: listed, without a link.
        { name: 'Bundesarbeitskammer', type: 'TRADE_UNION', country: 'AUT', date: '2026-11-05', url: null },
        // A day that is no day: listed, without a date.
        { name: 'Verein Beispielwald', type: 'NGO', country: 'AUT', date: null, url: link(987654314) },
      ],
      kinds: [
        { type: 'BUSINESS_ASSOCIATION', count: 1, unnamed: 0 },
        // The micro company and the echoing consultancy are counted.
        { type: 'COMPANY', count: 4, unnamed: 2 },
        { type: 'NGO', count: 1, unnamed: 0 },
        { type: 'PUBLIC_AUTHORITY', count: 1, unnamed: 0 },
        { type: 'TRADE_UNION', count: 2, unnamed: 0 },
      ],
      citizens: { count: 2, byCountry: { AUT: 1, CHE: 1 } },
      // OTHER and a kind the monitor does not know.
      other: 2,
      // The rejected row: of no kind, never named.
      unpublished: 1,
    })
    const sum = r.kinds.reduce((n, k) => n + k.count, 0) + r.citizens.count + r.other + r.unpublished
    expect(sum).toBe(r.read)
    expect(r.kinds.reduce((n, k) => n + k.count - k.unnamed, 0)).toBe(r.contributions.length)
  })

  it('keeps both invariants on a large mixed reading', () => {
    const types = ['COMPANY', 'NGO', 'EU_CITIZEN', 'NON_EU_CITIZEN', 'OTHER', 'SOMETHING_NEW', 'TRADE_UNION']
    const raws = Array.from({ length: 300 }, (_, i) => ({
      ...NAMED,
      id: 1000 + i,
      dateFeedback: '2026/11/01 10:00:00',
      userType: types[i % types.length],
      companySize: i % 3 === 0 ? 'MICRO' : 'LARGE',
      status: i % 11 === 0 ? 'REJECTED' : 'PUBLISHED',
      country: i % 2 ? 'AUT' : 'ITA',
    }))
    const r = summarize(raws.map(rowOf), 300, 13192)
    expect(r.kinds.reduce((n, k) => n + k.count, 0) + r.citizens.count + r.other + r.unpublished).toBe(r.read)
    expect(r.kinds.reduce((n, k) => n + k.count - k.unnamed, 0)).toBe(r.contributions.length)
    expect(Object.values(r.citizens.byCountry).reduce((a, b) => a + b, 0)).toBe(r.citizens.count)
  })

  it('throws on what is no page, so a changed interface is „not read", never a shorter count', () => {
    expect(() => parseFeedbackPage({})).toThrow()
    expect(() => parseFeedbackPage({ content: [] })).toThrow()
    expect(() => parseFeedbackPage({ content: [null], totalElements: 1 })).toThrow()
    expect(() => parseFeedbackPage('<!doctype html>')).toThrow()
    expect(parseFeedbackPage({ content: [], totalElements: 0, number: 0, last: true })).toEqual({ rows: [], page: 0, total: 0, last: true })
  })

  it('builds its address from a publication number and a page, and from nothing else', () => {
    expect(feedbackUrl(15080, 0)).toBe('https://ec.europa.eu/info/law/better-regulation/api/allFeedback?publicationId=15080&page=0&size=100&language=EN')
    for (const bad of [0, -1, 1.5, Number.NaN, 1_000_000_000]) expect(() => feedbackUrl(bad, 0)).toThrow()
    expect(() => feedbackUrl(15080, -1)).toThrow()
  })

  it('links a contribution on the portal by the initiative and its number, and by nothing else', () => {
    expect(contributionPageUrl(13192, 987654301)).toBe('https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/13192/F987654301_de')
    for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      expect(() => contributionPageUrl(bad, 1)).toThrow()
      expect(() => contributionPageUrl(13192, bad)).toThrow()
    }
  })
})

describe('the reading, page by page', () => {
  /** A fake portal: `total` contributions, pages of 100, newest first; every row a citizen. */
  function portal(total: number, opts: { wrongPageFrom?: number } = {}) {
    const urls: string[] = []
    const fetchJson = async (url: string) => {
      urls.push(url)
      const page = Number(new URL(url).searchParams.get('page'))
      const from = page * 100
      const n = Math.max(0, Math.min(100, total - from))
      const number = opts.wrongPageFrom !== undefined && page >= opts.wrongPageFrom ? 0 : page
      return {
        content: Array.from({ length: n }, (_, i) => ({ id: from + i + 1, dateFeedback: '2026/11/01 10:00:00', status: 'PUBLISHED', userType: 'EU_CITIZEN', firstName: 'Erika', surname: 'Mustermann', country: 'AUT', feedback: 'erfunden' })),
        totalElements: total,
        totalPages: Math.ceil(total / 100),
        number,
        last: from + n >= total,
      }
    }
    return { urls, fetchJson }
  }

  it('stops at 500 rows: five pages, and says how many of how many', async () => {
    const p = portal(2806)
    const r = await readFeedback(p.fetchJson, 13192, 15080)
    expect(p.urls.map((u) => new URL(u).searchParams.get('page'))).toEqual(['0', '1', '2', '3', '4'])
    expect(r).toMatchObject({ total: 2806, read: FEEDBACK_MAX_ROWS, citizens: { count: 500, byCountry: { AUT: 500 } }, contributions: [] })
    expect(euFeedbackView(r).cap).toBe('Nicht im Monitor: Gelesen sind die neuesten 500 von 2.806 Rückmeldungen; Suche, Filter und Sortierung reichen nur über sie.')
  })

  it('stops at the last page, and has nothing to say about a cap then', async () => {
    const p = portal(137)
    const r = await readFeedback(p.fetchJson, 13192, 15080)
    expect(p.urls).toHaveLength(2)
    expect(r).toMatchObject({ total: 137, read: 137 })
    expect(euFeedbackView(r).cap).toBeNull()
    const exact = portal(100)
    expect(await readFeedback(exact.fetchJson, 13192, 15080)).toMatchObject({ total: 100, read: 100 })
    expect(exact.urls).toHaveLength(1)
  })

  it('stops where a page answers with another number, and counts nothing twice', async () => {
    const p = portal(450, { wrongPageFrom: 2 })
    const r = await readFeedback(p.fetchJson, 13192, 15080)
    expect(r).toMatchObject({ total: 450, read: 200 })
    expect(euFeedbackView(r).cap).toBe('Nicht im Monitor: Gelesen sind die neuesten 200 von 450 Rückmeldungen; Suche, Filter und Sortierung reichen nur über sie.')
  })

  it('throws where a page fails, so nothing partial is cached as the whole', async () => {
    let calls = 0
    const failing = async (url: string) => {
      if (calls++ === 1) throw new Error('HTTP 500')
      return portal(300).fetchJson(url)
    }
    await expect(readFeedback(failing, 13192, 15080)).rejects.toThrow()
  })
})

describe('the block\'s list and words', () => {
  const reading: EuFeedbackReading = summarize(parseFeedbackPage(fixture('feedback-page')).rows, 14, 13192)
  const AT = { code: 'AUT', name: 'Österreich' }
  const sel = (over: Partial<EuFeedbackSelection> = {}): EuFeedbackSelection => ({ kind: 'alle', country: null, query: '', sort: 'date', reversed: false, ...over })
  const names = (rows: EuFeedbackRow[]) => rows.map((r) => r.name)
  const labels = (rows: { label: string }[]) => rows.map((r) => r.label)

  it('lists one row per contribution with day, kind in the singular, country by its German name and the link\'s accessible name', () => {
    const v = euFeedbackView(reading, AT)
    expect(v.rows.map((r) => [r.date, r.name, r.kind, r.country, r.countryName, r.url !== null])).toEqual([
      ['2026-11-14', 'Siemens AG', 'Unternehmen', 'DEU', 'Deutschland', true],
      ['2026-11-13', 'European Trade Union Confederation (ETUC)', 'Gewerkschaft', 'BEL', 'Belgien', true],
      ['2026-11-12', 'City of Vienna', 'Behörde', 'AUT', 'Österreich', true],
      ['2026-11-11', 'Wirtschaftskammer Österreich', 'Wirtschaftsverband', 'AUT', 'Österreich', true],
      ['2026-11-13', 'SIEMENS AG', 'Unternehmen', 'AUT', 'Österreich', true],
      ['2026-11-05', 'Bundesarbeitskammer', 'Gewerkschaft', 'AUT', 'Österreich', false],
      [null, 'Verein Beispielwald', 'Nichtregierungsorganisation', 'AUT', 'Österreich', true],
    ])
    expect(v.rows[0]!.linkLabel).toBe('Rückmeldung von Siemens AG im Portal der Kommission (neues Fenster)')
    expect(new Set(v.rows.map((r) => r.key)).size).toBe(v.rows.length)
    expect(v.empty).toBeNull()
    expect(v.cap).toBeNull()
  })

  it('names a country by its German name, and gives the code where it knows none', () => {
    expect(['AUT', 'DEU', 'GBR', 'CZE', 'XKX'].map((c) => countryNameOf(c))).toEqual(['Österreich', 'Deutschland', 'Vereinigtes Königreich', 'Tschechien', 'Kosovo'])
    expect(countryNameOf('ZZZ')).toBe('ZZZ')
  })

  it('tabs every kind with a row read and the citizens, counting the unnamed too, so the tabs add up to the rows read', () => {
    const v = euFeedbackView(reading, AT)
    expect(v.tabs.map((t) => [t.value, t.label, t.count])).toEqual([
      ['alle', 'Alle', 14],
      ['BUSINESS_ASSOCIATION', 'Wirtschaftsverbände', 1],
      ['COMPANY', 'Unternehmen', 4],
      ['NGO', 'Nichtregierungsorganisationen', 1],
      ['PUBLIC_AUTHORITY', 'Behörden', 1],
      ['TRADE_UNION', 'Gewerkschaften', 2],
      ['buerger', 'Bürgerinnen und Bürger', 2],
    ])
    const rest = v.tabs.slice(1).reduce((n, t) => n + t.count, 0) + reading.other + reading.unpublished
    expect(rest).toBe(v.tabs[0]!.count)
    // A kind whose every row is counted has a tab too; one tab alone is its own label, without „Alle".
    const onlyCompanies = { ...reading, read: 4, contributions: reading.contributions.filter((c) => c.type === 'COMPANY'), kinds: [{ type: 'COMPANY' as const, count: 4, unnamed: 2 }], citizens: { count: 0, byCountry: {} }, other: 0, unpublished: 0 }
    expect(euFeedbackView(onlyCompanies, AT).tabs.map((t) => [t.value, t.count])).toEqual([['COMPANY', 4]])
    const onlyUnnamed = { ...onlyCompanies, read: 7, contributions: [], kinds: [{ type: 'COMPANY' as const, count: 4, unnamed: 4 }, { type: 'NGO' as const, count: 3, unnamed: 3 }] }
    expect(euFeedbackView(onlyUnnamed, AT).tabs.map((t) => [t.value, t.count])).toEqual([['alle', 7], ['COMPANY', 4], ['NGO', 3]])
    // „Sonstige" stand in „Alle" only: one kind and Sonstige still get „Alle".
    expect(euFeedbackView({ ...onlyCompanies, read: 5, other: 1 }, AT).tabs.map((t) => t.value)).toEqual(['alle', 'COMPANY'])
  })

  it('closes the list with the counted figures: a kind\'s own under its tab, every figure under „Alle", none under the citizens\' tab', () => {
    const v = euFeedbackView(reading, AT)
    expect(labels(v.closing)).toEqual([
      '2 weitere Unternehmen · ohne Namen',
      '2 Bürgerinnen und Bürger · ohne Namen',
      '2 sonstige Rückmeldungen · ohne Namen',
      '1 nicht veröffentlichte Rückmeldung · ohne Namen',
    ])
    expect(labels(closingRowsOf(v.closing, sel(), false))).toHaveLength(4)
    expect(labels(closingRowsOf(v.closing, sel({ kind: 'COMPANY' }), false))).toEqual(['2 weitere Unternehmen · ohne Namen'])
    expect(closingRowsOf(v.closing, sel({ kind: 'NGO' }), false)).toEqual([])
    expect(closingRowsOf(v.closing, sel({ kind: 'buerger' }), false)).toEqual([])
    // Nothing a chip or a search could match: hidden under both.
    expect(closingRowsOf(v.closing, sel({ country: 'AUT' }), false)).toEqual([])
    expect(closingRowsOf(v.closing, sel({ query: 'x' }), true)).toEqual([])
    // A closing row carries no link, no day, no country.
    for (const row of v.closing) expect(Object.keys(row).sort()).toEqual(['key', 'label', 'of'])
  })

  it('words a closing row in the singular at one, in the kind\'s gender, and drops „weitere" where the kind has no named row', () => {
    const r = (kinds: EuFeedbackReading['kinds'], extra: Partial<EuFeedbackReading> = {}): EuFeedbackReading => ({ total: 9, read: 9, contributions: [], kinds, citizens: { count: 0, byCountry: {} }, other: 0, unpublished: 0, ...extra })
    const named = (type: EuFeedbackReading['kinds'][number]['type']) => ({ name: 'Beispiel', type, country: null, date: null, url: null })
    const one = (type: EuFeedbackReading['kinds'][number]['type']) => euFeedbackView(r([{ type, count: 2, unnamed: 1 }], { contributions: [named(type)] })).closing[0]!.label
    expect(one('NGO')).toBe('1 weitere Nichtregierungsorganisation · ohne Namen')
    expect(one('COMPANY')).toBe('1 weiteres Unternehmen · ohne Namen')
    expect(one('BUSINESS_ASSOCIATION')).toBe('1 weiterer Wirtschaftsverband · ohne Namen')
    expect(euFeedbackView(r([{ type: 'NGO', count: 13, unnamed: 13 }])).closing[0]!.label).toBe('13 Nichtregierungsorganisationen · ohne Namen')
    expect(euFeedbackView(r([{ type: 'NGO', count: 1, unnamed: 1 }])).closing[0]!.label).toBe('1 Nichtregierungsorganisation · ohne Namen')
    expect(labels(euFeedbackView(r([], { citizens: { count: 1, byCountry: {} }, other: 1, unpublished: 2 })).closing)).toEqual([
      '1 Bürgerin oder Bürger · ohne Namen',
      '1 sonstige Rückmeldung · ohne Namen',
      '2 nicht veröffentlichte Rückmeldungen · ohne Namen',
    ])
  })

  it('lists the citizens per country by count, the ones without a country as one row last, and narrows to the chip\'s country', () => {
    const r: EuFeedbackReading = { total: 9, read: 9, contributions: [], kinds: [], citizens: { count: 9, byCountry: { DEU: 2, AUT: 3, BEL: 2 } }, other: 0, unpublished: 0 }
    const v = euFeedbackView(r, AT)
    const rows = (s: Partial<EuFeedbackSelection>) => citizenRowsOf(v.citizens, { country: null, sort: 'date', reversed: false, ...s }).map((c) => `${c.name} ${c.count}`)
    expect(rows({})).toEqual(['Österreich 3', 'Belgien 2', 'Deutschland 2', 'ohne Angabe eines Landes 2'])
    expect(rows({ reversed: true })).toEqual(['Belgien 2', 'Deutschland 2', 'Österreich 3', 'ohne Angabe eines Landes 2'])
    expect(rows({ sort: 'country' })).toEqual(['Belgien 2', 'Deutschland 2', 'Österreich 3', 'ohne Angabe eines Landes 2'])
    expect(rows({ sort: 'country', reversed: true })).toEqual(['Österreich 3', 'Deutschland 2', 'Belgien 2', 'ohne Angabe eines Landes 2'])
    expect(rows({ country: 'AUT' })).toEqual(['Österreich 3'])
    expect(v.citizens.reduce((n, c) => n + c.count, 0)).toBe(9)
    // The chip exists for a country with citizens only.
    expect(v.country?.label).toBe('Aus Österreich')
    expect(citizensSetLine(9, 9, false)).toBe('9 Bürgerinnen und Bürger, nach Land gezählt')
    expect(citizensSetLine(3, 9, true)).toBe('3 von 9 Bürgerinnen und Bürgern')
  })

  it('offers „Aus <Land>" only with a country in scope and a row from it, and nothing about it without one', () => {
    expect(euFeedbackView(reading, AT).country).toMatchObject({ code: 'AUT', label: 'Aus Österreich' })
    // The configured member state is the default.
    expect(euFeedbackView(reading).country?.label).toBe('Aus Österreich')
    const none = euFeedbackView(reading, null)
    expect(none.country).toBeNull()
    expect(JSON.stringify(none)).not.toMatch(/"Aus /)
    // A country with only a citizen from it has the chip; one with nothing has none.
    expect(euFeedbackView(reading, { code: 'CHE', name: 'der Schweiz' }).country?.label).toBe('Aus der Schweiz')
    expect(euFeedbackView(reading, { code: 'ITA', name: 'Italien' }).country).toBeNull()
  })

  it('combines kind and country, and the chip counts within the kind above it', () => {
    const { rows } = euFeedbackView(reading, AT)
    expect(names(feedbackRowsOf(rows, sel({ country: 'AUT' })))).toEqual(['SIEMENS AG', 'City of Vienna', 'Wirtschaftskammer Österreich', 'Bundesarbeitskammer', 'Verein Beispielwald'])
    expect(names(feedbackRowsOf(rows, sel({ kind: 'COMPANY' })))).toEqual(['Siemens AG', 'SIEMENS AG'])
    expect(names(feedbackRowsOf(rows, sel({ kind: 'COMPANY', country: 'AUT' })))).toEqual(['SIEMENS AG'])
    expect(feedbackRowsOf(rows, sel({ kind: 'TRADE_UNION', country: 'DEU' }))).toEqual([])
    expect(feedbackRowsOf(rows, sel({ kind: 'buerger' }))).toEqual([])
    expect(rowsOfKind(rows, 'TRADE_UNION').filter((r) => r.country === 'AUT')).toHaveLength(1)
    expect(rowsOfKind(rows, 'alle')).toHaveLength(7)
  })

  it('searches the names alone, folded as the Stellungnahmen panel folds them', () => {
    const { rows } = euFeedbackView(reading, AT)
    expect(names(feedbackRowsOf(rows, sel({ query: 'oesterreich' })))).toEqual(['Wirtschaftskammer Österreich'])
    expect(names(feedbackRowsOf(rows, sel({ query: 'siemens' })))).toEqual(['Siemens AG', 'SIEMENS AG'])
    expect(names(feedbackRowsOf(rows, sel({ query: 'trade (etuc' })))).toEqual(['European Trade Union Confederation (ETUC)'])
    // The kind and the country are no part of what is searched; nor is a person.
    expect(feedbackRowsOf(rows, sel({ query: 'Gewerkschaft' }))).toEqual([])
    expect(feedbackRowsOf(rows, sel({ query: 'Mustermann' }))).toEqual([])
    expect(feedbackRowsOf(rows, sel({ query: 'AUT' }))).toEqual([])
  })

  it('orders by day, newest first, a row without a day last both ways; and by name, German collation; each turned round', () => {
    const { rows } = euFeedbackView(reading, AT)
    expect(names(feedbackRowsOf(rows, sel()))).toEqual(['Siemens AG', 'European Trade Union Confederation (ETUC)', 'SIEMENS AG', 'City of Vienna', 'Wirtschaftskammer Österreich', 'Bundesarbeitskammer', 'Verein Beispielwald'])
    expect(names(feedbackRowsOf(rows, sel({ reversed: true })))).toEqual(['Bundesarbeitskammer', 'Wirtschaftskammer Österreich', 'City of Vienna', 'SIEMENS AG', 'European Trade Union Confederation (ETUC)', 'Siemens AG', 'Verein Beispielwald'])
    // Same name in two cases: equal under the collation, the newer first.
    expect(names(feedbackRowsOf(rows, sel({ sort: 'name' })))).toEqual(['Bundesarbeitskammer', 'City of Vienna', 'European Trade Union Confederation (ETUC)', 'Siemens AG', 'SIEMENS AG', 'Verein Beispielwald', 'Wirtschaftskammer Österreich'])
    expect(names(feedbackRowsOf(rows, sel({ sort: 'name', reversed: true })))).toEqual(['Wirtschaftskammer Österreich', 'Verein Beispielwald', 'Siemens AG', 'SIEMENS AG', 'European Trade Union Confederation (ETUC)', 'City of Vienna', 'Bundesarbeitskammer'])
    // German collation: an umlaut sorts with its vowel, case does not lead.
    const mk = (name: string, index: number): EuFeedbackRow => ({ ...rows[0]!, name, index, key: String(index) })
    const sorted = ['Zeta AG', 'Österreichische Beispiel GmbH', 'alpha GmbH', 'Beta SE'].map(mk).sort((a, b) => compareFeedbackRows(a, b, 'name'))
    expect(names(sorted)).toEqual(['alpha GmbH', 'Beta SE', 'Österreichische Beispiel GmbH', 'Zeta AG'])
  })

  it('orders by Land: the German name, then newest first; a row without a country last both ways; only the Land turns round', () => {
    const { rows } = euFeedbackView(reading, AT)
    const noCountry: EuFeedbackRow = { ...rows[0]!, key: 'x', index: 99, name: 'Ohne Land e.V.', country: null, countryName: null }
    const all = [...rows, noCountry]
    const byLand = (reversed: boolean) => [...all].sort((a, b) => compareFeedbackRows(a, b, 'country', reversed)).map((r) => `${r.countryName ?? '–'}|${r.name}`)
    expect(byLand(false)).toEqual([
      'Belgien|European Trade Union Confederation (ETUC)',
      'Deutschland|Siemens AG',
      'Österreich|SIEMENS AG',
      'Österreich|City of Vienna',
      'Österreich|Wirtschaftskammer Österreich',
      'Österreich|Bundesarbeitskammer',
      'Österreich|Verein Beispielwald',
      '–|Ohne Land e.V.',
    ])
    expect(byLand(true)).toEqual([
      'Österreich|SIEMENS AG',
      'Österreich|City of Vienna',
      'Österreich|Wirtschaftskammer Österreich',
      'Österreich|Bundesarbeitskammer',
      'Österreich|Verein Beispielwald',
      'Deutschland|Siemens AG',
      'Belgien|European Trade Union Confederation (ETUC)',
      '–|Ohne Land e.V.',
    ])
  })

  it('says what the list is, how much of it a filter or search shows, and that none is named where none is', () => {
    expect(feedbackSetLine(7, 7, false)).toBe('7 Rückmeldungen von Organisationen mit Namen')
    expect(feedbackSetLine(1, 1, false)).toBe('1 Rückmeldung einer Organisation mit Namen')
    expect(feedbackSetLine(2, 1234, true)).toBe('2 von 1.234 Rückmeldungen von Organisationen mit Namen')
    expect(feedbackSetLine(0, 0, false)).toBe('Keine Organisation mit Namen unter den gelesenen Rückmeldungen.')
  })

  it('pages like the Stellungnahmen, and offers the search above the same threshold', () => {
    expect(STATEMENT_PAGE_SIZE).toBe(10)
    expect(STATEMENT_SEARCH_MIN).toBe(20)
  })

  it('says one line under the list, and keeps the cap as the list\'s frame row', () => {
    expect(euFeedbackView(reading, AT).note).toBe('Privatpersonen werden gezählt, nie genannt.')
    const persons = euFeedbackView({ total: 640, read: 500, contributions: [], kinds: [{ type: 'COMPANY', count: 3, unnamed: 3 }], citizens: { count: 497, byCountry: { AUT: 12 } }, other: 0, unpublished: 0 }, AT)
    expect(persons.cap).toMatch(/^Nicht im Monitor: Gelesen sind die neuesten 500 von 640/)
    expect(labels(persons.closing)).toEqual(['3 Unternehmen · ohne Namen', '497 Bürgerinnen und Bürger · ohne Namen'])
    expect(persons.tabs.map((t) => [t.value, t.count])).toEqual([['alle', 500], ['COMPANY', 3], ['buerger', 497]])
  })

  it('says when nobody answered', () => {
    expect(euFeedbackView({ total: 0, read: 0, contributions: [], kinds: [], citizens: { count: 0, byCountry: {} }, other: 0, unpublished: 0 })).toMatchObject({
      empty: 'Das Portal verzeichnet zu dieser Frist keine Rückmeldung.', rows: [], tabs: [], closing: [], citizens: [], cap: null,
    })
  })

  it('holds no word of ranking or blame', () => {
    const words = JSON.stringify(euFeedbackView(reading))
    expect(words).not.toMatch(/aktivst|meiste|Rang|Top|führend|Einfluss|erfolgreich|durchgesetzt/i)
  })

  it('gives each window its own block, named by its fact only where a section has several', () => {
    const ref = (publication: number) => ({ initiative: 13192, publication })
    const one = feedbackBlocksOf([withFeedback(fact('frist-0', 'Fahrplan', ['x']), ref(15129)), fact('vorhaben', 'Vorhaben der Kommission', ['Nr. 13192'])])
    expect(one).toEqual([{ key: 'rueckmeldungen-13192-15129', heading: 'Wer Rückmeldung gegeben hat', initiative: 13192, publication: 15129 }])
    const two = feedbackBlocksOf([withFeedback(fact('frist-0', 'Fahrplan', ['x']), ref(15129)), withFeedback(fact('frist-1', 'Öffentliche Konsultation', ['y']), ref(15080))])
    expect(two.map((f) => [f.heading, f.key])).toEqual([
      ['Wer Rückmeldung gegeben hat (Fahrplan)', 'rueckmeldungen-13192-15129'],
      ['Wer Rückmeldung gegeben hat (Öffentliche Konsultation)', 'rueckmeldungen-13192-15080'],
    ])
    expect(feedbackBlocksOf([fact('frist-0', 'Fahrplan', ['x'])])).toEqual([])
  })

  it('reads the portal on approach, never with the page, and keeps one key per window', () => {
    const block = readFileSync(new URL('../app/components/eu/EuFeedbackBlock.vue', import.meta.url), 'utf8')
    expect(block).toMatch(/server: false, immediate: false/)
    expect(block).toMatch(/useNearViewportSection\(root/)
    expect(block).toMatch(/key: `eu-rueckmeldungen-\$\{props\.block\.initiative\}-\$\{props\.block\.publication\}`/)
    expect(block).not.toMatch(/<FoldSection/)
  })
})
