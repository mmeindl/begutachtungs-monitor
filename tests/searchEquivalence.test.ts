import { describe, expect, it } from 'vitest'
import { filterDraftList, sortDraftList } from '../server/utils/parliament/draftList'
import { filterRisConsultations } from '../server/utils/ris/risList'
import { ministryFilterOptions } from '../server/utils/http/params'
import { aliasHaystack } from '../shared/utils/draftAliases'
import { matchesQuery } from '../shared/utils/textMatch'
import { ministryTokens, stripMinistryMentions, withinListSearchCaps } from '../shared/utils/searchHaystack'
import { searchBundHalves } from '../app/utils/draftFilters'
import type { BgblOutcome, DraftSummary, RisConsultation } from '../shared/types'

/**
 * The search on `/entwuerfe` moved from the endpoints into the page on
 * 12.11.2026 (`searchBundHalves`, `shared/utils/searchHaystack.ts`). This
 * suite proves the move changed no answer: the endpoint as it filtered
 * BEFORE (its haystack copied here verbatim, as it stood in
 * `server/utils/parliament/draftList.ts` and `server/utils/ris/risList.ts`)
 * against the endpoint asked without `q` and the page's own filter after it
 * — the same rows, in the same order, and the same `carriedOverFrom`.
 */

/* ---- The filters as they stood before 12.11.2026, verbatim ---- */

function oldDraftHaystack(item: DraftSummary): string {
  const codes = [item.ministryCode, ...item.coMinistries.map((m) => m.code)].map((c) => c.toUpperCase())
  return `${item.title} ${item.citation} ${codes.join(' ')} ${aliasHaystack(item.gp, item.inr)}`
}

function oldRisHaystack(item: RisConsultation, tokens: ReturnType<typeof ministryTokens>): string {
  return `${item.title} ${stripMinistryMentions(item.longTitle ?? '', tokens)} ${item.ministryCode}`
}

/* ---- Fixtures in the shape the endpoints ship ---- */

function draft(over: Partial<DraftSummary> = {}): DraftSummary {
  return {
    gp: 'XXVIII',
    inr: 1,
    citation: '1/ME',
    title: 'Bundesgesetz, mit dem das Ökostromgesetz geändert wird',
    ministryCode: 'BMF',
    ministryName: 'Bundesministerium für Finanzen',
    coMinistries: [],
    arrivedAt: '2026-09-01',
    deadline: '2026-10-01',
    active: true,
    statementCount: 0,
    parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/ME/1',
    ...over,
  }
}

function rec(over: Partial<RisConsultation> = {}): RisConsultation {
  return {
    id: 'BEGUT_1',
    kind: 'verordnung',
    title: 'Krankentransportverordnung',
    longTitle: 'Verordnung der Bundesministerin für Landesverteidigung über den Krankentransport',
    ministryCode: 'BMLV',
    ministryName: 'Bundesministerium für Landesverteidigung',
    startedAt: '2026-09-01',
    deadline: '2026-10-01',
    active: true,
    risUrl: 'https://www.ris.bka.gv.at/Begut/1',
    outcome: null,
    ...over,
  }
}

const BMLUK = 'Bundesministerium für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft'

const DRAFTS: DraftSummary[] = [
  draft({ inr: 1, citation: '1/ME' }),
  draft({ inr: 8, citation: '8/ME', title: 'Staatsschutz- und Nachrichtendienst-Gesetz, Sicherheitspolizeigesetz u.a., Änderung', ministryCode: 'BMI', ministryName: 'Bundesministerium für Inneres' }),
  draft({ inr: 132, citation: '132/ME', title: 'Audiovisuelle Mediendienste-Gesetz u.a., Änderung', ministryCode: 'BKA', ministryName: 'Bundeskanzleramt', active: false, deadline: '2026-08-01' }),
  draft({ inr: 40, citation: '40/ME', title: 'Straßenverkehrsordnung 1960, Änderung (37. StVO-Novelle)', ministryCode: 'BMIMI', ministryName: 'Bundesministerium für Innovation, Mobilität und Infrastruktur' }),
  draft({ inr: 41, citation: '41/ME', title: 'Klimagesetz', ministryCode: 'BMLUK', ministryName: BMLUK }),
  draft({ inr: 42, citation: '42/ME', title: 'Wasserrechtsgesetz, Änderung', ministryCode: 'BMLUK', ministryName: BMLUK, active: false, deadline: '2026-07-01' }),
  // Jointly sent: the co-ressort stands on the row.
  draft({ inr: 302, citation: '302/ME', title: 'Gewaltschutzgesetz 2026', ministryCode: 'BMFFIM', ministryName: 'Frauen', coMinistries: [{ code: 'BMJ', name: 'Justiz' }] }),
  // Carried over from the period before, its Frist still running.
  draft({ gp: 'XXVII', inr: 350, citation: '350/ME', title: 'Übergangsfristengesetz', ministryCode: 'BMF', active: true, deadline: '2026-11-20' }),
]

const RIS: RisConsultation[] = [
  rec({ id: 'BEGUT_1' }),
  rec({ id: 'BEGUT_2', title: 'Rebsortenverordnung, Änderung', longTitle: `Verordnung des Bundesministers für Land- und Forstwirtschaft, Klima und Umweltschutz, Regionen und Wasserwirtschaft, mit der die Rebsortenverordnung geändert wird`, ministryCode: 'BMLUK', ministryName: BMLUK }),
  rec({ id: 'BEGUT_3', title: 'Abgabenänderungsverordnung', longTitle: 'Verordnung des Bundesministers für Finanzen über die Finanzen der Gemeinden im Einvernehmen mit dem Bundesminister für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft', ministryCode: 'BMF', ministryName: 'Bundesministerium für Finanzen', active: false }),
  rec({ id: 'BEGUT_4', kind: 'gesetz', title: 'Bundesgesetz über die Straßenbenützung', longTitle: null, ministryCode: 'BKA', ministryName: 'Bundeskanzleramt' }),
  // Carried over: the id the endpoint names in `carriedOverIds`.
  rec({ id: 'BEGUT_ALT', title: 'Übergangsfristenverordnung', longTitle: null, ministryCode: 'BMF', ministryName: 'Bundesministerium für Finanzen' }),
]

const NO_OUTCOMES = {} as Record<string, BgblOutcome>

/** The two endpoints, reduced to what their answer is made of here. */
function draftsEndpoint(q: string | undefined, other: { status?: 'all' | 'open' | 'closed'; ministry?: string } = {}) {
  const items = sortDraftList(filterDraftList(DRAFTS, { status: other.status ?? 'all', stations: [], ministry: other.ministry, q, stationsUsable: true }))
  return { items, gp: 'XXVIII', carriedOverFrom: items.find((i) => i.gp !== 'XXVIII')?.gp ?? null }
}

function risEndpoint(q: string | undefined, other: { status?: 'all' | 'open' | 'closed'; ministry?: string } = {}) {
  const ministries = ministryFilterOptions(RIS)
  const tokens = ministryTokens(ministries.map((m) => m.name))
  const items = filterRisConsultations(RIS, { wants: { begutachtung: true, bgbl: false }, status: other.status ?? 'all', art: undefined, ministry: other.ministry, q, ministryTokens: tokens, outcomes: NO_OUTCOMES })
  const carried = items.filter((i) => i.id === 'BEGUT_ALT')
  return { items, ministries, carriedOverFrom: carried.length ? 'XXVII' : null, carriedOverIds: carried.map((i) => i.id) }
}

/**
 * What the page showed before: the endpoints asked WITH the term, lowercased
 * by `readListQuery`, and filtering with the OLD haystacks — the `q` branch
 * was the last conjunct of each filter, so applying it after the others is
 * the same filter. `carriedOverFrom` as each endpoint computed it after its
 * filter.
 */
function before(term: string, other = {}) {
  const q = term ? term.toLowerCase() : undefined
  const meAll = draftsEndpoint(undefined, other)
  const risAll = risEndpoint(undefined, other)
  const tokens = ministryTokens(risAll.ministries.map((m) => m.name))
  const me = meAll.items.filter((i) => !q || matchesQuery(oldDraftHaystack(i), q))
  const ris = risAll.items.filter((i) => !q || matchesQuery(oldRisHaystack(i, tokens), q))
  const meCarried = me.find((i) => i.gp !== 'XXVIII')?.gp ?? null
  const risCarried = ris.some((i) => i.id === 'BEGUT_ALT') ? 'XXVII' : null
  return { me: me.map((i) => i.citation), ris: ris.map((i) => i.id), carriedOverFrom: meCarried ?? risCarried }
}

/** What a feed or script gets that still asks the endpoints WITH `q`. */
function endpointsWithQ(term: string, other = {}) {
  const q = term ? term.toLowerCase() : undefined
  const me = draftsEndpoint(q, other)
  const ris = risEndpoint(q, other)
  return { me: me.items.map((i) => i.citation), ris: ris.items.map((i) => i.id), carriedOverFrom: me.carriedOverFrom ?? ris.carriedOverFrom }
}

/** What it shows now: the endpoints asked WITHOUT it, the page searching after them. */
function after(term: string, other = {}) {
  const s = searchBundHalves(draftsEndpoint(undefined, other), risEndpoint(undefined, other), term)
  return { me: s.me!.map((i) => i.citation), ris: s.ris!.map((i) => i.id), carriedOverFrom: s.carriedOverFrom }
}

const TERMS = [
  '', '   ', '-',
  // Umlauts and their transliterations, „ß"
  'ökostrom', 'Ökostrom', 'oekostrom', 'okostrom', 'straße', 'strasse', 'STRASSENVERKEHR', 'Strassenbenützung', 'übergang', 'uebergangsfristen',
  // A Geschäftszahl, a Ressort code, a co-ressort
  '132/ME', '132', '/me', 'bmluk', 'BMJ', 'bkA',
  // Aliases (the debate names of 8/ME)
  'bundestrojaner', 'Staatstrojaner',
  // Two terms, either order; AND
  'klima gesetz', 'gesetz klima', 'änderung gesetz', 'ökostrom strafrecht',
  // The Ressort name is not searched, the Ministerklausel is struck
  'finanzen', 'klima', 'landesverteidigung', 'krankentransport', 'rebsorten', 'wasserwirtschaft', 'einvernehmen',
  // Mid-word fragments the fold swallows („ergesetz", „ell")
  'ell', 'ergesetz', 'novelle 37',
  // Only the carried-over rows of the period before
  'übergangsfristen',
]

describe('the search moved into the page — same rows as the endpoints found', () => {
  it.each(TERMS)('„%s"', (term) => {
    expect(after(term)).toEqual(before(term))
  })

  it.each(TERMS)('and the endpoints asked with „%s" still answer the same', (term) => {
    expect(endpointsWithQ(term)).toEqual(before(term))
  })

  it.each(['klima', 'bmf', 'übergang', 'änderung'])('combined with status and Ressort: „%s"', (term) => {
    for (const other of [{ status: 'open' as const }, { status: 'closed' as const }, { ministry: 'BMF' }, { ministry: 'BMLUK' }, { status: 'open' as const, ministry: 'BMJ' }]) {
      expect(after(term, other)).toEqual(before(term, other))
    }
  })

  // Not a vacuous agreement: the fixtures hit what they are there for.
  it('finds what each fixture is there for', () => {
    expect(after('bundestrojaner').me).toEqual(['8/ME'])
    expect(after('132/ME').me).toEqual(['132/ME'])
    expect(after('bmj').me).toEqual(['302/ME'])
    expect(after('strasse').me).toEqual(['40/ME'])
    expect(after('strasse').ris).toEqual(['BEGUT_4'])
    // „klima" only in the Ministerklausel of a Langtitel finds nothing there …
    expect(after('klima').ris).toEqual([])
    expect(after('klima').me).toEqual(['41/ME'])
    // … „Finanzen" as a subject word stays findable, as a Ressort name not.
    expect(after('finanzen').ris).toEqual(['BEGUT_3'])
    expect(after('finanzen').me).toEqual([])
  })

  it('names the period before only while one of its rows survives the term', () => {
    expect(after('übergangsfristen').carriedOverFrom).toBe('XXVII')
    expect(after('übergangsfristen').me).toEqual(['350/ME'])
    expect(after('übergangsfristen').ris).toEqual(['BEGUT_ALT'])
    // The endpoint without the term reports the carried rows …
    expect(after('').carriedOverFrom).toBe('XXVII')
    // … and a term that removes them takes the sentence with them.
    expect(after('ökostrom').carriedOverFrom).toBeNull()
  })

  it('a term beyond the endpoints\' caps finds nothing — where the endpoints answered 400', () => {
    const tooLong = Array.from({ length: 101 }, () => 'a').join(' ')
    expect(withinListSearchCaps(tooLong)).toBe(false)
    const s = searchBundHalves(draftsEndpoint(undefined), risEndpoint(undefined), tooLong)
    expect(s.me).toEqual([])
    expect(s.ris).toEqual([])
  })

  it('a half that is not there stays null', () => {
    const s = searchBundHalves(null, risEndpoint(undefined), 'klima')
    expect(s.me).toBeNull()
    expect(s.ris).not.toBeNull()
  })
})

describe('the matching rule of the Länder, Vorlagen and law rows is the same function', () => {
  // The page searches those rows with `matchesQuery` directly, raw term as
  // typed; the Bund rows lowercase it first. Lowercasing is part of both
  // readings, so the two calls agree term by term.
  it.each(TERMS)('„%s" — typed or lowercased, one answer', (term) => {
    for (const d of DRAFTS) expect(matchesQuery(oldDraftHaystack(d), term)).toBe(matchesQuery(oldDraftHaystack(d), term.toLowerCase()))
    const tokens = ministryTokens(ministryFilterOptions(RIS).map((m) => m.name))
    for (const r of RIS) expect(matchesQuery(oldRisHaystack(r, tokens), term)).toBe(matchesQuery(oldRisHaystack(r, tokens), term.toLowerCase()))
  })
})
