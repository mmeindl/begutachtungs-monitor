import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { EuFeedbackReading } from '../shared/types'
import { EU_FEEDBACK_AUTO_PAGES, EU_FEEDBACK_ORGANISATION_TYPES, EU_FEEDBACK_PAGE_SIZE, EU_FEEDBACK_STEP_PAGES } from '../shared/utils/euPortal'
import {
  FEEDBACK_MAX_ROWS,
  FEEDBACK_NAMED_ROW_FIELDS,
  isFeedbackStep,
  progressOfFirstPage,
  progressReading,
  readFeedbackStep,
  readFirstFeedbackPage,
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
  EU_FEEDBACK_DE,
  feedbackAnnouncement,
  feedbackStageOf,
  feedbackMoreOf,
  feedbackSetLineVisible,
  moreRowsOf,
  automaticStepOf,
  nextAutomaticStep,
  FEEDBACK_AUTO_ROWS,
} from '../app/utils/euFeedback'
import { formatNumberDe } from '../shared/utils/format'
import { countryNameOf } from '../shared/utils/countryNames'
import { splitGap } from '../shared/utils/gaps'
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
    expect(r).toMatchObject({ total: 2806, read: 500, citizens: { count: 500, byCountry: { AUT: 500 } }, contributions: [] })
    expect(feedbackMoreOf(r, 5)).toEqual({ kind: 'offer', sentence: 'Gelesen sind die neuesten 500 von 2.806 Rückmeldungen.', label: 'Weitere 500 lesen', next: 10 })
  })

  it('stops at the last page, and has nothing to say about a cap then', async () => {
    const p = portal(137)
    const r = await readFeedback(p.fetchJson, 13192, 15080)
    expect(p.urls).toHaveLength(2)
    expect(r).toMatchObject({ total: 137, read: 137 })
    expect(feedbackMoreOf(r, 5)).toBeNull()
    const exact = portal(100)
    expect(await readFeedback(exact.fetchJson, 13192, 15080)).toMatchObject({ total: 100, read: 100 })
    expect(exact.urls).toHaveLength(1)
  })

  it('stops where a page answers with another number, and counts nothing twice', async () => {
    const p = portal(450, { wrongPageFrom: 2 })
    const r = await readFeedback(p.fetchJson, 13192, 15080)
    expect(r).toMatchObject({ total: 450, read: 200 })
    expect(feedbackMoreOf(r, 5)).toMatchObject({ kind: 'offer', sentence: 'Gelesen sind die neuesten 200 von 450 Rückmeldungen.', label: 'Weitere 250 lesen' })
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
    expect(feedbackMoreOf(reading, 5)).toBeNull()
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

  it('shows the set line only while the search or the chip narrows the list, or where none is named', () => {
    // Unfiltered, and under a tab alone: for a screen reader only — the tabs, the closing rows and the pager say it.
    expect(feedbackSetLineVisible({ searchActive: false, chip: false, noneNamed: false })).toBe(false)
    // Narrowed: the result's count, the zero included.
    expect(feedbackSetLineVisible({ searchActive: true, chip: false, noneNamed: false })).toBe(true)
    expect(feedbackSetLineVisible({ searchActive: false, chip: true, noneNamed: false })).toBe(true)
    // No organisation named at all: the box would hold no word else.
    expect(feedbackSetLineVisible({ searchActive: false, chip: false, noneNamed: true })).toBe(true)
    const panel = readFileSync(new URL('../app/components/eu/EuFeedbackPanel.vue', import.meta.url), 'utf8')
    // Still the polite live region, mounted anew per reading so a further step's count is not said twice.
    expect(panel).toMatch(/<p v-if="!isPartial" :key="reading\.read" :class="setLineVisible \? '[^']+' : 'sr-only'" aria-live="polite">\{\{ setLine \}\}<\/p>/)
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

  it('says how much was read in the list\'s first row', () => {
    const r640: EuFeedbackReading = { total: 640, read: 500, contributions: [], kinds: [{ type: 'COMPANY', count: 3, unnamed: 3 }], citizens: { count: 497, byCountry: { AUT: 12 } }, other: 0, unpublished: 0 }
    const persons = euFeedbackView(r640, AT)
    expect(feedbackMoreOf(r640, 5)).toMatchObject({ kind: 'offer', sentence: 'Gelesen sind die neuesten 500 von 640 Rückmeldungen.', label: 'Weitere 140 lesen' })
    expect(labels(persons.closing)).toEqual(['3 Unternehmen · ohne Namen', '497 Bürgerinnen und Bürger · ohne Namen'])
    expect(persons.tabs.map((t) => [t.value, t.count])).toEqual([['alle', 500], ['COMPANY', 3], ['buerger', 497]])
  })

  it('says when nobody answered', () => {
    expect(euFeedbackView({ total: 0, read: 0, contributions: [], kinds: [], citizens: { count: 0, byCountry: {} }, other: 0, unpublished: 0 })).toMatchObject({
      empty: 'Das Portal verzeichnet zu dieser Frist keine Rückmeldung.', rows: [], tabs: [], closing: [], citizens: [],
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

  it('reads the portal on approach, never with the page, and keeps one key per window and per step', () => {
    const block = readFileSync(new URL('../app/components/eu/EuFeedbackBlock.vue', import.meta.url), 'utf8')
    expect(block.match(/server: false,\s*immediate: false/g)).toHaveLength(1)
    expect(block).toMatch(/useNearViewportSection\(root/)
    expect(block).toMatch(/key: `eu-rueckmeldungen-\$\{props\.block\.initiative\}-\$\{props\.block\.publication\}-erste`/)
    expect(block).toMatch(/query: \{ teil: 'erste' \}/)
    // Every step — automatic or on a press — with its number of pages, one fetch at a time.
    expect(block).toMatch(/\$fetch<EuRueckmeldungenResponse>\(url\(\), \{ query: \{ seiten: pages \} \}\)/)
    expect(block).toMatch(/automaticStepOf\(s, stepStatus\.value\)/)
    expect(block).not.toMatch(/<FoldSection/)
  })
})

describe('the automatic reading to 1,000 (nextAutomaticStep)', () => {
  const reading = (read: number, total: number): EuFeedbackReading => ({ total, read, contributions: [], kinds: [], citizens: { count: read, byCountry: {} }, other: 0, unpublished: 0 })
  const gelesen = (read: number, total: number, pages: number) => ({ state: 'gelesen' as const, reading: reading(read, total), pages })
  const teilweise = (total: number) => ({ state: 'teilweise' as const, reading: reading(100, total), pages: 1 })
  /** The requests the block makes for a window of `total`, answered as the server answers a window that holds still. */
  function sequence(total: number): (string | number)[] {
    const asked: (string | number)[] = ['erste']
    let answer = total <= 100 ? gelesen(total, total, 1) : teilweise(total)
    for (let next = nextAutomaticStep(answer); next !== null; next = nextAutomaticStep(answer)) {
      asked.push(next)
      answer = gelesen(Math.min(total, next * 100), total, next)
    }
    return asked
  }

  it('is one constant: ten pages, a multiple of the step, the newest 1,000', () => {
    expect(EU_FEEDBACK_AUTO_PAGES % EU_FEEDBACK_STEP_PAGES).toBe(0)
    expect(FEEDBACK_AUTO_ROWS).toBe(EU_FEEDBACK_AUTO_PAGES * EU_FEEDBACK_PAGE_SIZE)
    expect(FEEDBACK_AUTO_ROWS).toBe(1000)
  })

  it('asks no superfluous step: ≤ 100, ≤ 500, exactly 500, ≤ 1,000, exactly 1,000, more', () => {
    expect(sequence(80)).toEqual(['erste'])
    expect(sequence(100)).toEqual(['erste'])
    expect(sequence(480)).toEqual(['erste', 5])
    expect(sequence(500)).toEqual(['erste', 5])
    expect(sequence(501)).toEqual(['erste', 5, 10])
    expect(sequence(900)).toEqual(['erste', 5, 10])
    expect(sequence(1000)).toEqual(['erste', 5, 10])
    expect(sequence(2300)).toEqual(['erste', 5, 10])
  })

  it('decides the next step from one answer alone', () => {
    expect(nextAutomaticStep(teilweise(350))).toBe(5)
    expect(nextAutomaticStep(gelesen(500, 2300, 5))).toBe(10)
    expect(nextAutomaticStep(gelesen(1000, 2300, 10))).toBeNull()
    expect(nextAutomaticStep(gelesen(480, 480, 5))).toBeNull()
    expect(nextAutomaticStep(gelesen(14, 14, 1))).toBeNull()
    expect(nextAutomaticStep(gelesen(0, 0, 0))).toBeNull()
    // A step that fell short (a page that answered with another number) goes on: at most one request more.
    expect(nextAutomaticStep(gelesen(300, 2300, 5))).toBe(10)
    // A step of ten that had to begin again at page one holds 500: the reader asks from there (`feedbackMoreOf`), the block asks nothing more.
    expect(nextAutomaticStep(gelesen(500, 2300, 10))).toBeNull()
    // Further steps are a reader's.
    expect(nextAutomaticStep(gelesen(1500, 2300, 15))).toBeNull()
    expect(nextAutomaticStep({ state: 'ungelesen' })).toBeNull()
    expect(nextAutomaticStep(null)).toBeNull()
  })

  it('goes on to ten pages where page one was answered from a cached step of five', () => {
    // A server that had `seiten=5` cached answers `teil=erste` with it (`feedbackOf`).
    const cached = { status: 'success' as const, data: gelesen(500, 1234, 5) }
    const s = feedbackStageOf(cached)
    expect(s).toEqual({ kind: 'partial', reading: reading(500, 1234), restFailed: false, next: 10 })
    expect(automaticStepOf(s, 'idle')).toBe(10)
  })

  it('names the automatic depth in the method text and the Datenschutzerklärung by the constant\'s figure', () => {
    const figure = `zunächst die neuesten ${formatNumberDe(FEEDBACK_AUTO_ROWS)}`
    const method = readFileSync(new URL('../app/components/method/MethodEuRueckmeldungen.vue', import.meta.url), 'utf8').replace(/\s+/g, ' ')
    const datenschutz = readFileSync(new URL('../app/pages/datenschutz.vue', import.meta.url), 'utf8').replace(/\s+/g, ' ')
    expect(method).toContain(`${figure} Rückmeldungen, mit „Weitere … lesen“ jeweils bis zu 500 mehr, höchstens 5.000 je Frist`)
    expect(datenschutz).toContain(`${figure} Rückmeldungen, weitere nur, wenn jemand sie anfordert, höchstens 5.000 je Frist`)
  })
})

describe('the block\'s stages (feedbackStageOf)', () => {
  const reading = (read: number, total: number): EuFeedbackReading => ({ total, read, contributions: [], kinds: [], citizens: { count: read, byCountry: {} }, other: 0, unpublished: 0 })
  const idle = { status: 'idle' as const, data: null }
  const page1 = { status: 'success' as const, data: { state: 'teilweise' as const, reading: reading(100, 350), pages: 1 } }
  const page1Of = (total: number) => ({ status: 'success' as const, data: { state: 'teilweise' as const, reading: reading(100, total), pages: 1 } })

  it('waits until page one is in, and says page one failed as „unread"', () => {
    expect(feedbackStageOf(idle)).toEqual({ kind: 'waiting' })
    expect(feedbackStageOf({ status: 'pending', data: null })).toEqual({ kind: 'waiting' })
    expect(feedbackStageOf({ status: 'error', data: null })).toEqual({ kind: 'unread' })
    expect(feedbackStageOf({ status: 'success', data: { state: 'ungelesen' } })).toEqual({ kind: 'unread' })
  })

  it('is partial with page one, asks for the first step once, and is complete when it holds the whole', () => {
    const partial = feedbackStageOf(page1)
    expect(partial).toEqual({ kind: 'partial', reading: reading(100, 350), restFailed: false, next: 5 })
    expect(automaticStepOf(partial, 'idle')).toBe(5)
    expect(automaticStepOf(feedbackStageOf(page1, null, 'pending'), 'pending')).toBeNull()
    expect(feedbackStageOf(page1, { state: 'gelesen', reading: reading(350, 350), pages: 5 })).toEqual({ kind: 'complete', reading: reading(350, 350), pages: 5 })
  })

  it('stays partial over the first step where more are counted, swaps its rows in, and asks the second step', () => {
    const afterFirst = feedbackStageOf(page1Of(2300), { state: 'gelesen', reading: reading(500, 2300), pages: 5 })
    // The rows of 500 in, still no counts: partial, the next step ten pages.
    expect(afterFirst).toEqual({ kind: 'partial', reading: reading(500, 2300), restFailed: false, next: 10 })
    expect(automaticStepOf(afterFirst, 'idle')).toBe(10)
    // One line through the whole automatic reading: said once, not after each step.
    expect(feedbackAnnouncement(afterFirst)).toBe(feedbackAnnouncement(feedbackStageOf(page1Of(2300))))
    const done = feedbackStageOf(page1Of(2300), { state: 'gelesen', reading: reading(1000, 2300), pages: 10 })
    expect(done).toEqual({ kind: 'complete', reading: reading(1000, 2300), pages: 10 })
    // The end of the automatic reading is the arrival, not „further".
    expect(feedbackAnnouncement(done)).toBe(EU_FEEDBACK_DE.read)
  })

  it('is complete at once where page one is the whole list: no second request', () => {
    const whole = feedbackStageOf({ status: 'success', data: { state: 'gelesen', reading: reading(14, 14), pages: 1 } })
    expect(whole).toEqual({ kind: 'complete', reading: reading(14, 14), pages: 1 })
    expect(automaticStepOf(whole, 'idle')).toBeNull()
  })

  it('keeps the rows read so far where an automatic step failed, says so, and retries that step alone', () => {
    const s = feedbackStageOf(page1, null, 'error')
    expect(s).toEqual({ kind: 'partial', reading: reading(100, 350), restFailed: true, next: 5 })
    expect(automaticStepOf(s, 'error')).toBeNull()
    expect(splitGap(feedbackAnnouncement(s))?.lead).toBe('Gerade nicht abrufbar')
    expect(feedbackAnnouncement(s)).toContain('unter den neuesten 100')
    // The second step failed: the 500 stay, still partial, and the retry is step ten.
    const second = feedbackStageOf(page1Of(2300), { state: 'gelesen', reading: reading(500, 2300), pages: 5 }, 'error')
    expect(second).toEqual({ kind: 'partial', reading: reading(500, 2300), restFailed: true, next: 10 })
    expect(feedbackAnnouncement(second)).toContain('unter den neuesten 500')
    // Retried: pending again is the progress line, not the gap.
    expect(feedbackStageOf(page1, null, 'pending')).toMatchObject({ kind: 'partial', restFailed: false })
  })

  it('announces each stage once: loading, the rest still read, the arrival', () => {
    expect(feedbackAnnouncement({ kind: 'waiting' })).toBe(EU_FEEDBACK_DE.loading)
    expect(feedbackAnnouncement({ kind: 'partial', reading: reading(100, 350), restFailed: false, next: 5 })).toBe('Die übrigen Rückmeldungen werden noch gelesen …')
    expect(feedbackAnnouncement({ kind: 'complete', reading: reading(350, 350), pages: 5 })).toBe(EU_FEEDBACK_DE.read)
  })
})

describe('more on request: the list\'s first row (feedbackMoreOf)', () => {
  const reading = (read: number, total: number): EuFeedbackReading => ({ total, read, contributions: [], kinds: [], citizens: { count: read, byCountry: {} }, other: 0, unpublished: 0 })

  it('offers the next step with the real number: what remains, at most 500', () => {
    // After the automatic reading: the first press reads rows 1,001–1,500.
    expect(feedbackMoreOf(reading(FEEDBACK_AUTO_ROWS, 3000), EU_FEEDBACK_AUTO_PAGES)).toEqual({ kind: 'offer', sentence: 'Gelesen sind die neuesten 1.000 von 3.000 Rückmeldungen.', label: 'Weitere 500 lesen', next: 15 })
    expect(feedbackMoreOf(reading(500, 599), 5)).toEqual({ kind: 'offer', sentence: 'Gelesen sind die neuesten 500 von 599 Rückmeldungen.', label: 'Weitere 99 lesen', next: 10 })
    expect(feedbackMoreOf(reading(500, 1000), 5)).toMatchObject({ label: 'Weitere 500 lesen', next: 10 })
    expect(feedbackMoreOf(reading(1000, 12_345), 10)).toMatchObject({ sentence: 'Gelesen sind die neuesten 1.000 von 12.345 Rückmeldungen.', label: 'Weitere 500 lesen', next: 15 })
    // A step that fell short (rows moved, or the step before was gone): the label counts what remains, the next step goes on from the one held.
    expect(feedbackMoreOf(reading(989, 2000), 10)).toMatchObject({ label: 'Weitere 500 lesen', next: 15 })
    expect(moreRowsOf(4_900, 9_000)).toBe(100)
    expect(moreRowsOf(500, 501)).toBe(1)
  })

  it('shows nothing where everything is read', () => {
    expect(feedbackMoreOf(reading(599, 599), 10)).toBeNull()
    expect(feedbackMoreOf(reading(14, 14), 1)).toBeNull()
    expect(feedbackMoreOf(reading(0, 0), 0)).toBeNull()
  })

  it('puts the progress line in the button\'s place while the step is read, and keeps the sentence', () => {
    expect(feedbackMoreOf(reading(500, 599), 5, 'pending')).toEqual({ kind: 'reading', sentence: 'Gelesen sind die neuesten 500 von 599 Rückmeldungen.', progress: 'Weitere Rückmeldungen werden gelesen …' })
  })

  it('says a failed step as „Gerade nicht abrufbar", with „Erneut versuchen" for the same step', () => {
    const failed = feedbackMoreOf(reading(1000, 1234), 10, 'error')
    expect(failed).toMatchObject({ kind: 'failed', retry: 'Erneut versuchen', next: 15 })
    expect(failed?.kind === 'failed' && splitGap(failed.gap)).toMatchObject({ lead: 'Gerade nicht abrufbar', rest: 'Weitere Rückmeldungen konnten nicht gelesen werden; gelesen sind die neuesten 1.000 von 1.234.' })
  })

  it('stops at fifty pages with a „Nicht im Monitor" sentence and no button', () => {
    const cap = feedbackMoreOf(reading(5000, 6123), 50)
    expect(cap?.kind).toBe('cap')
    expect(cap?.kind === 'cap' && splitGap(cap.gap)).toMatchObject({ lead: 'Nicht im Monitor', rest: 'Gelesen sind die neuesten 5.000 von 6.123 Rückmeldungen; mehr liest der Monitor zu einer Frist nicht, und Suche, Filter und Sortierung reichen nur über sie.' })
    // The cap whatever status a step had: nothing more is asked.
    expect(feedbackMoreOf(reading(4989, 6123), 50, 'error')?.kind).toBe('cap')
    expect(FEEDBACK_MAX_ROWS).toBe(5000)
  })

  it('swaps a further step in only once it arrived, and announces its arrival once', () => {
    const page1 = { status: 'success' as const, data: { state: 'teilweise' as const, reading: reading(100, 2300), pages: 1 } }
    const auto = { state: 'gelesen' as const, reading: reading(1000, 2300), pages: 10 }
    // While the step is read the list keeps the automatic reading.
    expect(feedbackStageOf(page1, auto, 'pending')).toEqual({ kind: 'complete', reading: reading(1000, 2300), pages: 10 })
    const step = feedbackStageOf(page1, { state: 'gelesen', reading: reading(1500, 2300), pages: 15 })
    expect(step).toEqual({ kind: 'complete', reading: reading(1500, 2300), pages: 15 })
    expect(feedbackAnnouncement(step)).toBe('Weitere Rückmeldungen sind gelesen, jetzt die neuesten 1.500 von 2.300.')
    expect(feedbackAnnouncement({ kind: 'complete', reading: reading(2300, 2300), pages: 25 })).toBe('Weitere Rückmeldungen sind gelesen, jetzt alle 2.300.')
    // While a step is read the line stays as it was: nothing is said twice.
    expect(feedbackAnnouncement(step, 'pending')).toBe(feedbackAnnouncement(step))
    expect(splitGap(feedbackAnnouncement(step, 'error'))?.lead).toBe('Gerade nicht abrufbar')
  })
})

/* ------------------------------------------------------------------ *
 * Steps, and rows that move between reads
 * ------------------------------------------------------------------ */

/**
 * A window that lives: rows newest first, numbered in the order they
 * arrived, and the window can grow at its head, lose a row anywhere, or
 * take one in out of order, between any two reads (`before`). Every row is
 * a citizen, counted — the shape whose repeat the reader cannot recognise
 * afterwards — and its country carries its number as three letters (a test
 * device: a valid alpha-3 shape, no real country), so the test can tell
 * which rows the reading counted, and how often.
 */
const code = (n: number) => [Math.floor(n / 676) % 26, Math.floor(n / 26) % 26, n % 26].map((d) => String.fromCharCode(65 + d)).join('')
function liveWindow(count: number, opts: { named?: boolean } = {}) {
  let arrived = 0
  let list: number[] = []
  const add = (k: number) => { for (let i = 0; i < k; i++) list.unshift(arrived++) }
  add(count)
  const asked: number[] = []
  const w = {
    asked,
    before: (_page: number, _call: number) => {},
    add,
    /** Withdraws the row at a place of the list (0 = newest). */
    remove: (index: number) => { list.splice(index, 1) },
    /** A row that arrives below the head — out of the newest-first order. */
    insertAt: (index: number) => { list.splice(index, 0, arrived++) },
    /** The rows as they stand now, newest first. */
    now: () => [...list],
    reset: (l: number[]) => { list = l },
    fetchJson: async (url: string) => {
      const page = Number(new URL(url).searchParams.get('page'))
      w.before(page, asked.length)
      asked.push(page)
      const slice = list.slice(page * 100, page * 100 + 100)
      return {
        content: slice.map((n) => (opts.named
          ? { id: n + 1, dateFeedback: '2026/11/10 10:00:00', status: 'PUBLISHED', publication: 'WITHINFO', userType: 'COMPANY', companySize: 'LARGE', organization: `Firma ${code(n)} AG`, firstName: '', surname: '', country: 'AUT' }
          : { userType: 'EU_CITIZEN', status: 'PUBLISHED', country: code(n), firstName: 'Erika', surname: 'Beispiel' })),
        totalElements: list.length,
        number: page,
        last: (page + 1) * 100 >= list.length,
      }
    },
  }
  return w
}
/** Which rows a reading of the citizens counted, and how often each. */
const countedRows = (r: EuFeedbackReading) => r.citizens.byCountry
const codes = (ns: number[]) => ns.map(code).sort()

describe('the reading in steps (readFeedbackStep)', () => {
  it('takes only steps of five pages, up to fifty', () => {
    expect([5, 10, 25, 50].every(isFeedbackStep)).toBe(true)
    expect([0, 1, 4, 6, 55, 100, 7.5, Number.NaN].some(isFeedbackStep)).toBe(false)
  })

  it('goes on from the step before: only the pages it lacks, never one twice, five at most', async () => {
    const w = liveWindow(1234)
    const first = progressOfFirstPage(await readFirstFeedbackPage(w.fetchJson, 15080))
    const five = await readFeedbackStep(w.fetchJson, 15080, first, 5)
    expect(five.progress.rows).toHaveLength(500)
    const ten = await readFeedbackStep(w.fetchJson, 15080, five.progress, 10)
    expect(ten.progress).toMatchObject({ pages: 10, total: 1234 })
    expect(ten.progress.rows).toHaveLength(1000)
    expect(w.asked).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    const fifteen = await readFeedbackStep(w.fetchJson, 15080, ten.progress, 15)
    expect(fifteen.progress.rows).toHaveLength(1234)
    expect(w.asked).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    const r = progressReading(fifteen.progress, 13192)
    expect(r).toMatchObject({ read: 1234, total: 1234 })
    expect(Object.values(countedRows(r)).every((n) => n === 1)).toBe(true)
    // Asked for no more than five pages in one step, whatever the step's number.
    const w2 = liveWindow(9000)
    const from = progressOfFirstPage(await readFirstFeedbackPage(w2.fetchJson, 15080))
    const far = await readFeedbackStep(w2.fetchJson, 15080, from, 50)
    expect(w2.asked).toHaveLength(6)
    expect(far.progress.rows).toHaveLength(600)
  })

  it('is no guard of nothing: the synthetic window does repeat rows on the next page when it grows', async () => {
    const w = liveWindow(350)
    const page0 = (await w.fetchJson('https://x/api/allFeedback?page=0')) as { content: { country: string }[] }
    w.add(3)
    const page1 = (await w.fetchJson('https://x/api/allFeedback?page=1')) as { content: { country: string }[] }
    // The last three rows of page one, read before, open page two now.
    expect(page1.content.slice(0, 3).map((r) => r.country)).toEqual(page0.content.slice(97).map((r) => r.country))
  })

  it('counts no row twice and loses none at the seam where the window grows between two pages of one step', async () => {
    const w = liveWindow(350)
    w.before = (page, call) => { if (call === 1) w.add(3) }
    const r = await readFeedback(w.fetchJson, 13192, 15080)
    // The three new rows too: once the run down the list is read, page one's head gives them.
    expect(r).toMatchObject({ read: 353, total: 353 })
    expect(Object.values(countedRows(r)).every((n) => n === 1)).toBe(true)
    expect(Object.keys(countedRows(r)).sort()).toEqual(codes(w.now()))
    expect(w.asked).toEqual([0, 1, 2, 3, 0])
  })

  it('counts no row twice and loses none where the window grew between two steps, and again inside the step', async () => {
    const w = liveWindow(1234)
    const first = progressOfFirstPage(await readFirstFeedbackPage(w.fetchJson, 15080))
    const originals = w.now()
    const five = await readFeedbackStep(w.fetchJson, 15080, first, 5)
    // Hours later, seven more; and during the step two more before its third page.
    w.add(7)
    w.before = (_page, call) => { if (call === 7) w.add(2) }
    const ten = await readFeedbackStep(w.fetchJson, 15080, five.progress, 10)
    const r = progressReading(ten.progress, 13192)
    expect(r.total).toBe(1243)
    expect(Object.values(countedRows(r)).every((n) => n === 1)).toBe(true)
    // An unbroken run of the list as it stood at page one's read, from its head down: none skipped.
    expect(Object.keys(countedRows(r)).sort()).toEqual(codes(originals.slice(0, r.read)))
    expect(r.read).toBe(991)
    // The next step goes on below them, and at the end of the list takes the nine new ones from page one's head.
    const rest = await readFeedbackStep(w.fetchJson, 15080, ten.progress, 15)
    const all = progressReading(rest.progress, 13192)
    expect(all).toMatchObject({ read: 1243, total: 1243 })
    expect(Object.values(countedRows(all)).every((n) => n === 1)).toBe(true)
    expect(Object.keys(countedRows(all)).sort()).toEqual(codes(w.now()))
  })

  it('reads again from page one where the window shrank, once, and counts the list as it stands then', async () => {
    const w = liveWindow(450)
    // A contribution withdrawn below the rows read, before page three.
    w.before = (_page, call) => { if (call === 2) w.remove(400) }
    const r = await readFeedback(w.fetchJson, 13192, 15080)
    expect(w.asked.slice(0, 4)).toEqual([0, 1, 2, 0])
    expect(Object.values(countedRows(r)).every((n) => n === 1)).toBe(true)
    expect(Object.keys(countedRows(r)).sort()).toEqual(codes(w.now().slice(0, r.read)))
    expect(r.total).toBe(449)
  })

  it('reads again from page one where the count fits and the rows do not: one arrived out of order', async () => {
    const w = liveWindow(450)
    // Grows by one, but below the seam: the row skipped as a repeat would be a row never read.
    w.before = (_page, call) => { if (call === 2) w.insertAt(250) }
    const r = await readFeedback(w.fetchJson, 13192, 15080)
    expect(w.asked.slice(0, 4)).toEqual([0, 1, 2, 0])
    expect(Object.values(countedRows(r)).every((n) => n === 1)).toBe(true)
    expect(Object.keys(countedRows(r)).sort()).toEqual(codes(w.now().slice(0, r.read)))
  })

  it('throws where the list moves again after the new start: nothing partial is taken for the whole', async () => {
    const w = liveWindow(450)
    w.before = (_page, call) => { if (call === 2 || call === 5) w.remove(440) }
    await expect(readFeedback(w.fetchJson, 13192, 15080)).rejects.toThrow(/verschoben/)
  })

  it('keeps what fits where no request is left to begin again, and the next step meets the list anew', async () => {
    const w = liveWindow(1234)
    const first = progressOfFirstPage(await readFirstFeedbackPage(w.fetchJson, 15080))
    w.before = (_page, call) => { if (call === 5) w.remove(1200) }
    // Pages 1–4 fit, the fifth request finds the shrink: four pages' rows stand, nothing of the fifth.
    const step = await readFeedbackStep(w.fetchJson, 15080, first, 10, 5)
    expect(step.restarted).toBe(false)
    expect(step.progress.rows).toHaveLength(500)
  })

  it('cannot see a withdrawal below the seam paired with an arrival: a counted row is counted twice there, a named one is caught by its number', async () => {
    const counted = liveWindow(350)
    counted.before = (_page, call) => { if (call === 2) { counted.remove(300); counted.add(1) } }
    const r = await readFeedback(counted.fetchJson, 13192, 15080)
    // The count stayed at 350; the row at the head of page three had been read already.
    expect(Object.values(countedRows(r)).some((n) => n === 2)).toBe(true)

    const named = liveWindow(350, { named: true })
    named.before = (_page, call) => { if (call === 2) { named.remove(300); named.add(1) } }
    const n = await readFeedback(named.fetchJson, 13192, 15080)
    expect(named.asked.slice(0, 4)).toEqual([0, 1, 2, 0])
    const names = n.contributions.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
