import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PUBLICATION_FIELDS, carriesReference, comReferenceOf, initiativeUrl, parseInitiative, parseSearch, searchUrl } from '../server/utils/eu/haveYourSay'

/* The Commission's portal „Ihre Meinung zählt": the answers of 14.11.2026
 * for COM(2022)177 (tests/fixtures/eu-portal). In the fixture the
 * officials' names, addresses and numbers are placeholders — the real
 * record carries real ones, and the repository holds no personal data. */

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/eu-portal/${name}.json`, import.meta.url), 'utf8'))

describe('the portal reader', () => {
  it('reads an initiative as its publications: stage, reference, days, count', () => {
    const i = parseInitiative(fixture('initiative-13192'))
    expect(i).toMatchObject({ id: 13192, url: 'https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/13192_de' })
    expect(i.title).toMatch(/^EU action against abusive litigation/)
    expect(i.publications).toEqual([
      { stage: 'INIT_PLANNED', type: 'INIT_PLANNED', reference: 'Ares(2021)5351797', published: '2021-09-03', feedbackEnd: null, feedbackCount: 0, feedbackStatus: 'DISABLED' },
      { stage: 'ROADMAP', type: 'ROADMAP', reference: 'Ares(2021)6011536', published: '2021-10-04', feedbackEnd: '2021-11-01', feedbackCount: 10, feedbackStatus: 'CLOSED' },
      { stage: 'OPC_LAUNCHED', type: 'OPC_LAUNCHED', reference: 'ANTISLAPP', published: '2021-10-04', feedbackEnd: '2022-01-10', feedbackCount: 146, feedbackStatus: 'CLOSED' },
      { stage: 'ADOPTION_WORKFLOW', type: 'PROP_DIR', reference: 'COM(2022)177', published: '2022-04-29', feedbackEnd: '2022-06-29', feedbackCount: 22, feedbackStatus: 'CLOSED' },
    ])
  })

  it('lets nothing about an official through: no name, no address, no number', () => {
    const raw = fixture('initiative-13192') as { publications: Record<string, unknown>[] }
    // The record does carry them — otherwise this test proves nothing.
    const personal = raw.publications.flatMap((p) => [p.authorName, p.authorSurname, p.authorMail, p.authorPhoneNumber, p.surveyContactMail]).filter((v): v is string => typeof v === 'string' && v.length > 0)
    expect(personal.length).toBeGreaterThanOrEqual(16)
    const out = JSON.stringify(parseInitiative(raw))
    for (const value of personal) expect(out).not.toContain(value)
    expect(out).not.toMatch(/@|author|Mail|Phone/i)
    // The reader names every field it takes; none of them is a person's.
    expect(PUBLICATION_FIELDS.some((f) => /author|mail|phone|contact|name/i.test(f))).toBe(false)
  })

  it('proves the join by the COM number on a publication, not by the search\'s word', () => {
    const i = parseInitiative(fixture('initiative-13192'))
    expect(carriesReference(i, 'COM(2022)177')).toBe(true)
    expect(carriesReference(i, 'COM(2022)17')).toBe(false)
    expect(carriesReference(i, 'COM(2021)177')).toBe(false)
    expect(parseSearch(fixture('suche-COM-2022-177'))).toEqual([13192, 13194])
  })

  it('throws on what is no answer', () => {
    expect(() => parseSearch({})).toThrow()
    expect(() => parseSearch('<!doctype html>')).toThrow()
    expect(() => parseInitiative({ id: '13192' })).toThrow()
    expect(() => parseInitiative({ publications: [] })).toThrow()
    expect(parseInitiative({ id: '7', publications: [{ authorMail: 'x@example.org' }, null, 'x'] }).publications).toEqual([])
  })

  it('builds its two addresses from a COM number and an id, and from nothing else', () => {
    expect(comReferenceOf('COM(2022) 177')).toEqual({ text: 'COM(2022)177', year: 2022 })
    expect(comReferenceOf('COM(2016) 0593')).toEqual({ text: 'COM(2016)593', year: 2016 })
    expect(comReferenceOf('KOM(2008) 426')).toBeNull()
    expect(comReferenceOf('COM(2022) 177 & size=1000')).toBeNull()
    expect(comReferenceOf(null)).toBeNull()
    expect(searchUrl('COM(2022)177')).toBe('https://ec.europa.eu/info/law/better-regulation/brpapi/searchInitiatives?text=%22COM%282022%29177%22&size=3&language=EN')
    expect(() => searchUrl('COM(2022)177&x=1')).toThrow()
    expect(initiativeUrl(13192)).toBe('https://ec.europa.eu/info/law/better-regulation/brpapi/groupInitiatives/13192')
    expect(() => initiativeUrl(1.5)).toThrow()
    expect(() => initiativeUrl(-1)).toThrow()
  })
})
