import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { EuFeedbackReading } from '../shared/types'
import { EU_FEEDBACK_ORGANISATION_TYPES } from '../shared/utils/euPortal'
import {
  FEEDBACK_MAX_ROWS,
  FEEDBACK_ROW_FIELDS,
  ORGANISATION_NAME_MAX,
  feedbackUrl,
  namedOrganisationOf,
  parseFeedbackPage,
  readFeedback,
  summarize,
} from '../server/utils/eu/portalFeedback'
import { euFeedbackView, feedbackFoldsOf } from '../app/utils/euFeedback'
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
  it('drops everything about the people and the texts: no name, no login, no text, no attachment, no row number', () => {
    const raw = fixture('feedback-page') as { content: Record<string, unknown>[] }
    const values = raw.content.flatMap((r) => [
      r.firstName,
      r.surname,
      r.login,
      r.feedback,
      r.feedbackTextUserLanguage,
      String(r.id),
      ...(r.attachments as { fileName: string; documentId: string }[]).flatMap((a) => [a.fileName, a.documentId]),
    ]).filter((v): v is string => typeof v === 'string' && v.length > 0)
    // The fixture does carry them — otherwise this test proves nothing.
    expect(values.length).toBeGreaterThan(40)
    const page = parseFeedbackPage(raw)
    for (const out of [JSON.stringify(page), JSON.stringify(summarize(page.rows, page.total))]) {
      for (const value of values) expect(out, value).not.toContain(value)
      expect(out).not.toMatch(/login|feedbackText|attachment|firstName|surname|fileName/i)
    }
    // Each row keeps exactly four fields, and the reader names none of a person's.
    for (const row of page.rows) expect(Object.keys(row).sort()).toEqual(['country', 'name', 'published', 'type'])
    expect(FEEDBACK_ROW_FIELDS.some((f) => /name|login|feedback|attach|id/i.test(f))).toBe(false)
  })

  it('reads the fixture into counts and names, every row in exactly one figure', () => {
    const page = parseFeedbackPage(fixture('feedback-page'))
    expect(page).toMatchObject({ page: 0, total: 12, last: true })
    const r = summarize(page.rows, page.total)
    expect(r).toEqual({
      total: 12,
      read: 12,
      organisations: [
        { type: 'BUSINESS_ASSOCIATION', count: 1, named: [{ name: 'Wirtschaftskammer Österreich', countries: ['AUT'], rows: 1 }], unnamed: 0 },
        // Siemens twice (DEU and AUT, two spellings of case): one name, two rows. The micro company and the echoing consultancy are counted.
        { type: 'COMPANY', count: 4, named: [{ name: 'Siemens AG', countries: ['DEU', 'AUT'], rows: 2 }], unnamed: 2 },
        { type: 'PUBLIC_AUTHORITY', count: 1, named: [{ name: 'City of Vienna', countries: ['AUT'], rows: 1 }], unnamed: 0 },
        { type: 'TRADE_UNION', count: 1, named: [{ name: 'European Trade Union Confederation (ETUC)', countries: ['BEL'], rows: 1 }], unnamed: 0 },
      ],
      citizens: 2,
      // OTHER and a kind the monitor does not know.
      other: 2,
      // The rejected row: of no kind, never named.
      unpublished: 1,
    })
    const sum = r.organisations.reduce((n, g) => n + g.count, 0) + r.citizens + r.other + r.unpublished
    expect(sum).toBe(r.read)
  })

  it('sorts names alphabetically, German collation, and by nothing else', () => {
    const rows = ['Zeta AG', 'Österreichische Beispiel GmbH', 'alpha GmbH', 'Beta SE'].flatMap((name, i) => Array.from({ length: i + 1 }, () => ({ type: 'COMPANY', published: true, country: null, name })))
    expect(summarize(rows, rows.length).organisations[0]!.named.map((o) => o.name)).toEqual(['alpha GmbH', 'Beta SE', 'Österreichische Beispiel GmbH', 'Zeta AG'])
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
        content: Array.from({ length: n }, (_, i) => ({ id: from + i, status: 'PUBLISHED', userType: 'EU_CITIZEN', firstName: 'Erika', surname: 'Mustermann', country: 'AUT', feedback: 'erfunden' })),
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
    const r = await readFeedback(p.fetchJson, 15080)
    expect(p.urls.map((u) => new URL(u).searchParams.get('page'))).toEqual(['0', '1', '2', '3', '4'])
    expect(r).toMatchObject({ total: 2806, read: FEEDBACK_MAX_ROWS, citizens: 500 })
    expect(euFeedbackView(r).cap).toBe('Gelesen sind die neuesten 500 von 2.806 Rückmeldungen.')
  })

  it('stops at the last page, and has nothing to say about a cap then', async () => {
    const p = portal(137)
    const r = await readFeedback(p.fetchJson, 15080)
    expect(p.urls).toHaveLength(2)
    expect(r).toMatchObject({ total: 137, read: 137 })
    expect(euFeedbackView(r).cap).toBeNull()
    const exact = portal(100)
    expect(await readFeedback(exact.fetchJson, 15080)).toMatchObject({ total: 100, read: 100 })
    expect(exact.urls).toHaveLength(1)
  })

  it('stops where a page answers with another number, and counts nothing twice', async () => {
    const p = portal(450, { wrongPageFrom: 2 })
    const r = await readFeedback(p.fetchJson, 15080)
    expect(r).toMatchObject({ total: 450, read: 200 })
    expect(euFeedbackView(r).cap).toBe('Gelesen sind die neuesten 200 von 450 Rückmeldungen.')
  })

  it('throws where a page fails, so nothing partial is cached as the whole', async () => {
    let calls = 0
    const failing = async (url: string) => {
      if (calls++ === 1) throw new Error('HTTP 500')
      return portal(300).fetchJson(url)
    }
    await expect(readFeedback(failing, 15080)).rejects.toThrow()
  })
})

describe('the fold\'s words', () => {
  const reading: EuFeedbackReading = summarize(parseFeedbackPage(fixture('feedback-page')).rows, 12)

  it('says each kind with its count, names under it, and why some are counted without a name', () => {
    const v = euFeedbackView(reading)
    expect(v.lines.map((l) => [l.label, l.count, l.names.map((n) => [n.name, n.countries, n.repeated]), l.note])).toEqual([
      ['Wirtschaftsverbände', '1, davon 1 genannt', [['Wirtschaftskammer Österreich', 'AUT', null]], null],
      ['Unternehmen', '4, davon 2 genannt', [['Siemens AG', 'DEU, AUT', '2 Rückmeldungen']], '2 Rückmeldungen ohne Namen gezählt'],
      ['Behörden', '1, davon 1 genannt', [['City of Vienna', 'AUT', null]], null],
      ['Gewerkschaften', '1, davon 1 genannt', [['European Trade Union Confederation (ETUC)', 'BEL', null]], null],
      ['Bürgerinnen und Bürger', '2', [], 'Privatpersonen werden gezählt, nie genannt.'],
      ['Sonstige', '2', [], 'Ohne Angabe einer Organisationsart; gezählt, nie genannt.'],
    ])
    expect(v.cap).toBeNull()
    expect(v.empty).toBeNull()
    expect(v.unnamedReason).toMatch(/^Ohne Namen zählt der Monitor Organisationen, hinter deren Namen eine einzelne Person stehen kann: Kleinstunternehmen/)
    expect(v.unpublished).toBe('Eine weitere Rückmeldung führt das Portal nicht als veröffentlicht; der Monitor zählt sie ohne Art und nennt niemanden.')
  })

  it('says nothing about unnamed organisations where every one is named, and says when nobody answered', () => {
    expect(euFeedbackView({ ...reading, organisations: reading.organisations.map((g) => ({ ...g, count: g.count - g.unnamed, unnamed: 0 })) }).unnamedReason).toBeNull()
    expect(euFeedbackView({ total: 0, read: 0, organisations: [], citizens: 0, other: 0, unpublished: 0 })).toMatchObject({ empty: 'Das Portal verzeichnet zu dieser Frist keine Rückmeldung.', lines: [], cap: null })
  })

  it('holds no word of ranking or blame', () => {
    const words = JSON.stringify(euFeedbackView(reading))
    expect(words).not.toMatch(/aktivst|meiste|Rang|Top|führend|Einfluss|erfolgreich|durchgesetzt/i)
  })

  it('gives each window its own fold, named by its fact only where a section has several', () => {
    const ref = (publication: number) => ({ initiative: 13192, publication })
    const one = feedbackFoldsOf([withFeedback(fact('frist-0', 'Fahrplan', ['x']), ref(15129)), fact('vorhaben', 'Vorhaben der Kommission', ['Nr. 13192'])])
    expect(one).toEqual([{ key: 'rueckmeldungen-13192-15129', heading: 'Wer Rückmeldung gegeben hat', initiative: 13192, publication: 15129 }])
    const two = feedbackFoldsOf([withFeedback(fact('frist-0', 'Fahrplan', ['x']), ref(15129)), withFeedback(fact('frist-1', 'Öffentliche Konsultation', ['y']), ref(15080))])
    expect(two.map((f) => [f.heading, f.key])).toEqual([
      ['Wer Rückmeldung gegeben hat (Fahrplan)', 'rueckmeldungen-13192-15129'],
      ['Wer Rückmeldung gegeben hat (Öffentliche Konsultation)', 'rueckmeldungen-13192-15080'],
    ])
    expect(feedbackFoldsOf([fact('frist-0', 'Fahrplan', ['x'])])).toEqual([])
  })
})
