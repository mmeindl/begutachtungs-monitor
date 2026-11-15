import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOSSIER_QUERY_VERSION, adoptedByOf, dossierQuery, dossierUrl, parseDossierAnswer, procedureReference } from '../server/utils/eu/cellarDossier'
import type { SparqlAnswer } from '../server/utils/eu/cellar'
import { EU_EVENTS } from '../shared/utils/euEvents'

/*
 * Fourteen answers of the Cellar to `dossierQuery`, as the SPARQL endpoint
 * sent them (15.11.2026): every procedure type on the map's acts (OLP, COD,
 * CNS, SYN, NLE, APP), two dossiers on one act (2000/29/EG), a proposal in
 * parts (2001/110/EG), a dossier with no procedure number (76/207/EWG),
 * Commission acts with and without a dossier, a joint act with none
 * (2024/825), and the AI Act's staged application. No test touches the
 * network.
 */
const FIXTURES = join(import.meta.dirname, 'fixtures', 'eu-dossier')
const answer = (celex: string) => JSON.parse(readFileSync(join(FIXTURES, `${celex}.json`), 'utf8')) as SparqlAnswer
const rail = (celex: string) => parseDossierAnswer(answer(celex))
const codes = (celex: string) => rail(celex).procedure!.events.map((e) => e.code)

describe('dossierQuery', () => {
  it('puts only a validated CELEX into the query, and asks all five kinds of row at once', () => {
    const q = dossierQuery('32024L1069')
    expect(q).toContain('<http://publications.europa.eu/resource/celex/32024L1069>')
    expect(q).toContain('SELECT DISTINCT ?k ?a ?b ?c ?d ?e ?f WHERE')
    for (const k of ['author', 'force', 'dossier', 'proposal', 'event']) expect(q).toContain(`BIND("${k}" AS ?k)`)
    expect(dossierUrl('32024L1069')).toMatch(/^https:\/\/publications\.europa\.eu\/webapi\/rdf\/sparql\?query=/)
    expect(DOSSIER_QUERY_VERSION).toBe(1)
    for (const bad of ['32024L1069> . ?x ?y ?z', '52022PC0177', '2024L1069', '']) expect(() => dossierQuery(bad), bad).toThrow()
  })
})

describe('parseDossierAnswer — the ordinary procedure of today (2024/1069)', () => {
  const r = rail('32024L1069')

  it('reads who adopted it, the procedure, the proposal and the dates', () => {
    expect(r.adoptedBy).toBe('parlament-rat')
    expect(r.procedure).toMatchObject({
      reference: '2022/0117(COD)',
      type: 'OLP',
      observatoryUrl: 'https://oeil.europarl.europa.eu/oeil/de/procedure-file?reference=2022%2F0117(COD)',
    })
    expect(r.procedure!.proposals).toEqual([
      { reference: 'COM(2022) 177', celex: '52022PC0177', date: '2022-04-27', eurLexUrl: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:52022PC0177' },
    ])
    expect(r.inForce).toBe('2024-05-06')
    expect(r.applies).toBeNull()
    expect(r.partialApplication).toEqual([])
  })

  it('keeps the decisions, in date order, and counts the rest by event', () => {
    const events = r.procedure!.events
    for (const [code, date] of [
      ['ADP_byCOM', '2022-04-28'],
      ['OPI_byEESC', '2022-10-26'],
      ['ADP_R1_POS_byEP', '2024-02-27'],
      ['APR_R1_byCONSIL', '2024-03-19'],
      ['SIGN_byEP_CONSIL', '2024-04-11'],
      ['PUB_OJ', '2024-04-16'],
    ]) expect(events, code).toContainEqual({ code, date })
    expect(events.some((e) => e.code === 'DIS_byCONSIL')).toBe(false)
    const days = events.map((e) => e.date)
    expect(days).toEqual([...days].sort())
    // Counted by hand from the fixture: ten DIS_byCONSIL, two OPI_R1_byEP_CMT,
    // and one each of ADP_REP_byEP_CMT, AMEND_byEP, APR_AGRPROV_CONSIL_byEP_CMT,
    // REF_OF_byEP, REF_toCMT_NGTINST_byEP_PLEN — seventeen distinct events.
    expect(r.procedure!.otherEvents).toBe(17)
  })
})

describe('parseDossierAnswer — dates of entry into force and application', () => {
  it('splits a staged application into the general day and the partial ones (AI Act)', () => {
    expect(rail('32024R1689')).toMatchObject({ inForce: '2024-08-01', applies: '2026-08-02', partialApplication: ['2025-02-02', '2025-08-02', '2027-08-02'] })
  })

  it('reads a Commission act without a dossier, with its day of application', () => {
    expect(rail('32022R0931')).toMatchObject({ adoptedBy: 'kommission', procedure: null, inForce: '2022-07-07', applies: '2023-01-01' })
  })

  it('takes a partial day for no general one (2024/1499)', () => {
    expect(rail('32024L1499')).toMatchObject({ adoptedBy: 'rat', inForce: '2024-06-18', applies: null, partialApplication: ['2026-06-19'] })
    expect(rail('32024L1499').procedure!.type).toBe('APP')
  })
})

describe('parseDossierAnswer — who adopted it and which procedure', () => {
  it('reads a Commission act\'s dossier without number or proposal as such, a DG beside the Commission changing nothing', () => {
    const r = rail('32017R1926')
    expect(r.adoptedBy).toBe('kommission')
    expect(r.procedure).not.toBeNull()
    expect(r.procedure).toMatchObject({ reference: null, type: null, observatoryUrl: null, proposals: [] })
  })

  it('reads the Council\'s procedures: consultation, cooperation, non-legislative', () => {
    expect(rail('32000L0078')).toMatchObject({ adoptedBy: 'rat', procedure: { reference: '1999/0225(CNS)', type: 'CNS' } })
    expect(rail('31992L0013')).toMatchObject({ adoptedBy: 'rat', procedure: { reference: '1990/0292(SYN)', type: 'SYN' } })
    expect(rail('32013L0059')).toMatchObject({ adoptedBy: 'rat', procedure: { reference: '2011/0254(NLE)', type: 'NLE' } })
  })

  it('reads co-decision in the old vocabulary (94/22/EG)', () => {
    const r = rail('31994L0022')
    expect(r).toMatchObject({ adoptedBy: 'parlament-rat', procedure: { reference: '1992/0412(COD)', type: 'COD' } })
    const read = codes('31994L0022')
    for (const code of ['AMEND_R1_byEP', 'OPI_R1_byEP', 'ADP_R1_POS_byEP', 'ADP_COMPOS_byCONSIL', 'AMEND_R2_byEP', 'OPI_R2_byEP', 'APR_R2_byCONSIL', 'SIGN_byEP_CONSIL']) {
      expect(read, code).toContain(code)
    }
  })

  it('names a joint act and a Commission act without a dossier as having no procedure', () => {
    expect(rail('32024L0825')).toMatchObject({ adoptedBy: 'parlament-rat', procedure: null })
    expect(rail('32009L0106')).toMatchObject({ adoptedBy: 'kommission', procedure: null })
  })

  it('reads who adopted it from the authors alone', () => {
    expect(adoptedByOf(new Set(['EP', 'CONSIL']))).toBe('parlament-rat')
    expect(adoptedByOf(new Set(['CONSIL', 'COM']))).toBe('rat')
    expect(adoptedByOf(new Set(['COM', 'MOVE']))).toBe('kommission')
    expect(adoptedByOf(new Set(['EP', 'COM']))).toBe('unbekannt')
    expect(adoptedByOf(new Set())).toBe('unbekannt')
  })

  it('writes the procedure number as cited, and nothing for another shape', () => {
    expect(procedureReference('2022/0117/COD')).toBe('2022/0117(COD)')
    expect(procedureReference('2022/0117(COD)')).toBeNull()
    expect(procedureReference(null)).toBeNull()
  })
})

describe('parseDossierAnswer — proposals', () => {
  it('reads a proposal in parts, its CELEX percent-encoded as encodeURIComponent leaves it (2001/110/EG)', () => {
    // encodeURIComponent keeps parentheses: the link carries „(03)" as it is.
    expect(rail('32001L0110').procedure!.proposals).toEqual([
      { reference: 'COM(1995) 722 - 3', celex: '51995PC0722(03)', date: '1996-04-17', eurLexUrl: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:51995PC0722(03)' },
    ])
  })

  it('keeps both proposals of an act on two dossiers, and the number of the later procedure (2000/29/EG)', () => {
    const p = rail('32000L0029').procedure!
    expect(p.reference).toBe('1997/0338(CNS)')
    expect(p.proposals.map((x) => x.reference)).toEqual(['COM(1995) 239', 'COM(1997) 651'])
  })

  it('reads a COM reference without a CELEX or a date, and a dossier without a procedure number (76/207/EWG)', () => {
    const r = rail('31976L0207')
    expect(r.adoptedBy).toBe('rat')
    expect(r.procedure!.reference).toBeNull()
    expect(r.procedure!.proposals).toEqual([{ reference: 'COM(1975) 36 - 2', celex: null, date: null, eurLexUrl: null }])
  })
})

describe('parseDossierAnswer — no answer and broken answers', () => {
  it('reads an act the Cellar does not know as all unknown', () => {
    expect(parseDossierAnswer({ results: { bindings: [] } })).toEqual({ adoptedBy: 'unbekannt', procedure: null, inForce: null, applies: null, partialApplication: [] })
  })

  it('throws on a malformed answer', () => {
    expect(() => parseDossierAnswer({} as SparqlAnswer)).toThrow()
    expect(() => parseDossierAnswer({ results: {} })).toThrow()
  })

  it('ignores dates without a type and steps without a date', () => {
    const r = parseDossierAnswer({ results: { bindings: [
      { k: { value: 'force' }, a: { value: '2024-01-01' } },
      { k: { value: 'dossier' }, a: { value: 'http://x/d1' } },
      { k: { value: 'event' }, a: { value: 'http://x/d1' }, b: { value: 'http://x/e1' }, c: { value: 'http://x/event/PUB_OJ' } },
    ] } })
    expect(r.inForce).toBeNull()
    expect(r.procedure).toMatchObject({ events: [], otherEvents: 0, proposals: [] })
  })

  it('never puts a step the monitor does not read into a rail, over every fixture', () => {
    const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'))
    expect(files.length).toBe(14)
    for (const f of files) {
      for (const e of rail(f.replace(/\.json$/, '')).procedure?.events ?? []) expect(Object.hasOwn(EU_EVENTS, e.code), `${f} ${e.code}`).toBe(true)
    }
  })
})
