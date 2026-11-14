import { describe, expect, it, vi } from 'vitest'
import { draftArticle } from './helpers/builders'

/**
 * The laws a draft amends, through the Nitro wrapper
 * (`server/utils/lawtext/amendedLawsService.ts`).
 *
 * WHY THIS FILE EXISTS. The list is a statement on the page — „ändert 65
 * Gesetze" in the spine, every law in the Entwurf's frame — and until
 * 22.10.2026 the ceiling on RIS lookups cut the list itself: 116/ME XXVIII
 * named 65 laws and the page said 40. The ceiling lives in the cached
 * function, so the test runs it.
 *
 * `defineCachedFunction` calls straight through, and the three neighbours are
 * the module's boundaries: the Parliament list (the reference date), the
 * draft's Artikel, and the RIS lookup, whose calls are what the ceiling
 * bounds.
 */
vi.stubGlobal('defineCachedFunction', <A extends unknown[], R>(fn: (...args: A) => R) => fn)
vi.stubGlobal('DERIVED_CACHE', 'derived')
vi.mock('../server/utils/parliament/drafts', () => ({ getDraftsForGp: vi.fn(), getGegenstand: vi.fn() }))
vi.mock('../server/utils/lawtext/draftArticlesService', () => ({ getDraftArticles: vi.fn(), getRootDraftArticles: vi.fn(), getMotionTextArticles: vi.fn() }))
vi.mock('../server/utils/kons/konsCache', () => ({ resolveKonsLaw: vi.fn() }))

const { getDraftsForGp, getGegenstand } = vi.mocked(await import('../server/utils/parliament/drafts'))
const { getDraftArticles, getRootDraftArticles, getMotionTextArticles } = vi.mocked(await import('../server/utils/lawtext/draftArticlesService'))
const { resolveKonsLaw } = vi.mocked(await import('../server/utils/kons/konsCache'))
const { getAmendedLaws, getRootAmendedLaws, createsNewLawFrom } = await import('../server/utils/lawtext/amendedLawsService')
const { parseParliamentHtml } = await import('../server/utils/lawtext/parliamentHtml')
const { draftArticles } = await import('../server/utils/lawtext/draftArticles')
const { motionTextOf } = await import('../server/utils/diff/stationDocuments')

/** A Parliament text as the parser reads it, from its paragraphs (class, text). */
function textOf(...paragraphs: [string, string][]) {
  const blocks = parseParliamentHtml(`<body>${paragraphs.map(([cls, text]) => `<p class="${cls}">${text}</p>`).join('')}</body>`)
  return { blocks, articles: draftArticles(blocks) }
}

/*
 * The real paragraphs (14.11.2026). 51 d.B. XXVII, a motion of the Bundesrat
 * filed as „Gesetzestext": it amends the B-VG, whose Promulgationsklausel
 * names no Stammnorm, so no law resolves — and it said „neues Gesetz".
 */
const BVG_51 = textOf(
  ['12PromKlEinlSatz', 'Der Nationalrat wolle beschließen:'],
  ['11Titel', 'Bundesverfassungsgesetz, mit dem das Bundes-Verfassungsgesetz geändert wird'],
  ['12PromKlEinlSatz', 'Der Nationalrat hat beschlossen:'],
  ['11Titel', 'Bundesverfassungsgesetz, mit dem das Bundes-Verfassungsgesetz geändert wird'],
  ['21NovAo1', 'Art. 42 Abs. 2 wird folgender Satz angefügt:'],
  ['23SatznachNovao', '„Der Einspruch des Bundesrates kann sich auch auf einzelne in einem Gesetzesbeschluss des Nationalrates zusammengefasste Gesetze beziehen.“'],
)

/* 154 d.B. XXVII, GABR13, its text filed as „Gesetzesantrag" with the Begründung after it. */
const ALVG_154 = textOf(
  ['11Titel', 'Bundesgesetz mit dem das Arbeitslosenversicherungsgesetz 1977 geändert wird'],
  ['12PromKlEinlSatz', 'Der Nationalrat hat beschlossen:'],
  ['12PromKlEinlSatz', 'Das Arbeitslosenversicherungsgesetz 1977, BGBl Nr. 609/1977, zuletzt geändert durch das Bundesgesetz BGBl. I Nr. 16/2020, wird wie folgt geändert:'],
  ['21NovAo1', '1. In § 21 wird folgender Abs. 9 angefügt:'],
  ['51Abs', '„(9) Zusätzlich zur gemäß § 20 und § 21 Abs. 1 bis 8 ermittelten Höhe des Arbeitslosengeldes gebührt ein Zuschlag …“'],
  ['81ErlUeberschrZ', 'Begründung:'],
  ['83ErlText', 'Die größte Gesundheitskrise unserer Zeit fordert enormen Tribut.'],
)

/* 627 d.B. XXVI, GABR13, filed as „Antrag": a clause the reader does not take as one. */
const SVOG_627 = textOf(
  ['11Titel', 'Bundesgesetz, mit dem das Sozialversicherungs-Organisationsgesetz (SV-OG) in der Fassung des BGBl. I Nr. 100/2018 abgeändert wird'],
  ['12PromKlEinlSatz', 'Der Nationalrat hat beschlossen:'],
  ['12PromKlEinlSatz', 'Das Sozialversicherungs-Organisationsgesetz in der Fassung des BGBl. I Nr. 100/2018 wird wie folgt abgeändert:'],
  ['22NovAo2', '10. In Art 9 wird in § 111 die Jahreszahl „2020“ durch „2021“ ersetzt.'],
)

/* A Stammgesetz: a title and §§, no instruction — the title of 120/ME XXVIII, a new law. */
const NEW_LAW = textOf(
  ['11Titel', 'Bundesgesetz hinsichtlich der Benennung der zentralen Kontaktstelle und der für die Anerkennung von strategischen Projekten zuständigen Stelle zur Durchführung der Verordnung (EU) 2024/1735 zur Schaffung eines Rahmens für Maßnahmen zur Stärkung des europäischen Ökosystems der Fertigung von Netto-Null-Technologien und zur Änderung der Verordnung (EU) 2018/1724 (Begleitmaßnahmengesetz Netto-Null-Industrie-Verordnung)'],
  ['45UeberschrPara', 'Zentrale Kontaktstelle'],
  ['51Abs', '…'],
)

describe('getAmendedLaws — every law the draft names (22.10.2026)', () => {
  it('lists all 65 laws of a Sammelgesetz and asks RIS for the first 40 only', async () => {
    getDraftsForGp.mockResolvedValue({ items: [{ inr: 116, arrivedAt: '2026-10-01' }] } as never)
    const articles = Array.from({ length: 65 }, (_, i) =>
      draftArticle({ index: i, number: `Artikel ${i + 1}`, numeral: String(i + 1), title: `Änderung des Gesetzes ${i + 1}`, key: `Gesetz ${i + 1}`, bgbl: { organ: 'BGBl. I', nummer: `${i + 1}/2020` } }),
    )
    getDraftArticles.mockResolvedValue({ blocks: [], articles } as never)
    resolveKonsLaw.mockImplementation(async (_organ: string, nummer: string) => ({ gesetzesnummer: `G${nummer.replace('/', '-')}`, kurztitel: `Gesetz ${nummer}`, paragraphs: {} }))

    const r = await getAmendedLaws('XXVIII', 116)

    expect(r.laws).toHaveLength(65)
    expect(resolveKonsLaw).toHaveBeenCalledTimes(40)
    expect(r.laws[39]).toMatchObject({ title: 'Gesetz 40/2020', bgbl: 'BGBl. I 40/2020' })
    expect(r.laws[39]!.risUrl).toMatch(/Gesetzesnummer=G40-2020/)
    // Beyond the ceiling: listed as the draft names it, without a RIS link.
    expect(r.laws[40]).toMatchObject({ title: 'Änderung des Gesetzes 41', bgbl: 'BGBl. I 41/2020', risUrl: null, amendedBy: null })
    expect(r.createsNewLaw).toBe(false)
  })
})

describe('createsNewLaw only on positive evidence (14.11.2026)', () => {
  it('is no new law where the text gives Novellierungsanordnungen, though no law resolves (51 d.B. XXVII)', () => {
    expect(BVG_51.articles.some((a) => a.amends)).toBe(false)
    expect(createsNewLawFrom(BVG_51, 0)).toBe(false)
  })

  it('is no new law where a title says it amends, even without an instruction class', () => {
    const titleOnly = textOf(['11Titel', 'Bundesverfassungsgesetz, mit dem das Bundes-Verfassungsgesetz geändert wird'], ['51Abs', 'Art. 41a lautet: …'])
    expect(createsNewLawFrom(titleOnly, 0)).toBe(false)
    const repeal = textOf(['11Titel', 'Bundesgesetz, mit dem das Bundesgesetz über das Verbot der geologischen Speicherung von Kohlenstoffdioxid aufgehoben wird'], ['51Abs', '…'])
    expect(createsNewLawFrom(repeal, 0)).toBe(false)
  })

  it('is a new law where the text names itself and carries §§ but no instruction', () => {
    expect(createsNewLawFrom(NEW_LAW, 0)).toBe(true)
    // The EU act a new law carries out may itself amend one; that is not the law's own name (352/ME XXVII).
    const dzg = textOf(['11Titel', 'Bundesgesetz, mit dem ein Bundesgesetz über Daten-Governance, Anbieter von Datenvermittlungsdiensten und datenaltruistische Organisationen nach der Verordnung (EU) 2022/868 über europäische Daten-Governance und zur Änderung der Verordnung (EU) 2018/1724 (Datenzugangsgesetz - DZG) erlassen wird'], ['45UeberschrPara', 'Gegenstand'], ['51Abs', '…'])
    expect(createsNewLawFrom(dzg, 0)).toBe(true)
    expect(createsNewLawFrom(textOf(['11Titel', 'Strafvollzugsnovelle 2026'], ['51Abs', '…']), 0)).toBe(false)
    expect(createsNewLawFrom(NEW_LAW, 1)).toBe(false)
    expect(createsNewLawFrom({ blocks: [], articles: [] }, 0)).toBe(false)
  })

  it('says the laws could not be read instead of „neues Gesetz" (51 d.B. XXVII)', async () => {
    getGegenstand.mockResolvedValue({ content: { einlangen: '2020-02-14T00:00:00' } } as never)
    getRootDraftArticles.mockResolvedValue(BVG_51 as never)
    const r = await getRootAmendedLaws({ gp: 'XXVII', ityp: 'I', inr: 51 })
    expect(r).toMatchObject({ createsNewLaw: false, laws: [], unread: 'unnamed' })
  })

  it('reads a GABR13 motion\'s „Gesetzesantrag" where it publishes no „Gesetzestext" (154 d.B. XXVII)', async () => {
    getGegenstand.mockResolvedValue({ content: { einlangen: '2020-05-05T00:00:00' } } as never)
    getRootDraftArticles.mockResolvedValue({ blocks: [], articles: [] } as never)
    getMotionTextArticles.mockResolvedValue(ALVG_154 as never)
    resolveKonsLaw.mockResolvedValue({ gesetzesnummer: '10008407', kurztitel: 'Arbeitslosenversicherungsgesetz 1977', paragraphs: {} } as never)
    const r = await getRootAmendedLaws({ gp: 'XXVII', ityp: 'I', inr: 154 })
    expect(r.laws).toMatchObject([{ title: 'Arbeitslosenversicherungsgesetz 1977', bgbl: 'BGBl Nr. 609/1977' }])
    expect(r).toMatchObject({ createsNewLaw: false, unread: null })
  })

  it('states a gap, never silence, where the motion text names no law it can read (627 d.B. XXVI) or there is none', async () => {
    getGegenstand.mockResolvedValue({ content: { einlangen: '2019-05-29T00:00:00' } } as never)
    getRootDraftArticles.mockResolvedValue({ blocks: [], articles: [] } as never)
    getMotionTextArticles.mockResolvedValue(SVOG_627 as never)
    expect(await getRootAmendedLaws({ gp: 'XXVI', ityp: 'I', inr: 627 })).toMatchObject({ createsNewLaw: false, laws: [], unread: 'unnamed' })
    getMotionTextArticles.mockResolvedValue({ blocks: [], articles: [] } as never)
    expect(await getRootAmendedLaws({ gp: 'XXVI', ityp: 'I', inr: 627 })).toMatchObject({ createsNewLaw: false, laws: [], unread: 'no-text' })
  })

  it('keeps „neues Gesetz" for a Stammgesetz', async () => {
    getDraftsForGp.mockResolvedValue({ items: [{ inr: 42, arrivedAt: '2025-09-01' }] } as never)
    getDraftArticles.mockResolvedValue(NEW_LAW as never)
    expect(await getAmendedLaws('XXVIII', 42)).toMatchObject({ createsNewLaw: true, laws: [], unread: null })
  })
})

describe('motionTextOf — the document a GABR13 motion files its text under', () => {
  const group = (title: string, n: number) => ({ title, documents: [{ link: `/dokument/XXVII/I/${n}/fname_${n}.pdf`, type: 'PDF' }, { link: `/dokument/XXVII/I/${n}/fnameorig_${n}.html`, type: 'HTML' }] })

  it('takes „Gesetzesantrag" (154 d.B. XXVII) and „Antrag" beside a „Begründung" (627 d.B. XXVI)', () => {
    expect(motionTextOf({ documents: [group('Gesetzesantrag', 795674), { title: 'Textgegenüberstellung nicht angeboten', documents: [{ link: '/services/hilfe/website-funktionen/textgegenueberstellung', type: 'DEFAULT' }] }] })).toMatch(/fnameorig_795674\.html$/)
    expect(motionTextOf({ documents: [group('Antrag', 755282), group('Begründung', 755284)] })).toMatch(/fnameorig_755282\.html$/)
  })

  it('takes nothing else: a committee report, a Begründung alone', () => {
    expect(motionTextOf({ documents: [group('Berichterstattung', 1663017), group('Begründung', 755284)] })).toBeNull()
  })
})
