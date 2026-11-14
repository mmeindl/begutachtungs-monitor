import { describe, expect, it } from 'vitest'
import type { DraftSummary } from '../shared/types'
import {
  buildNamedIndex,
  decideNamedInRv,
  explanationsFormats,
  htmlParagraphs,
  mayBeNamed,
  passageAround,
  titleCoreOf,
  witnessesIn,
  witnessGuard,
  type NamedIndexInput,
  type UnreadVorlage,
  type Witness,
  type WitnessDraft,
  type WitnessVorlage,
} from '../server/utils/parliament/namedInRv'
import type { VorlageRow } from '../server/utils/parliament/list101'

/**
 * „In 298 d.B. genannt" (`server/utils/parliament/namedInRv.ts`). Every
 * guard of the rule is held here by the real case that motivated it, as
 * the corpus of 14.11.2026 read it (`pnpm corpus:rv-genannt`).
 */

const KOPFTUCH = 'Bundesgesetz zur Stärkung der Selbstbestimmung von unmündigen Mädchen an Schulen mittels Einführung eines Kopftuchverbots'
const DAK = 'Bundesgesetz über die "Diplomatische Akademie Wien", Änderung'

/** 298 d.B. XXVIII, Allgemeiner Teil, as Parliament's HTML has it (shortened). */
const ERL_298 =
  '<html><head><style>p.MsoNormal { margin: 0 }</style></head><body>' +
  '<p class=MsoNormal><b>Hauptgesichtspunkte des Entwurfes:</b></p>' +
  '<p>Mit der gegenständlichen Novelle des Schulrechts sollen diese Punkte des Arbeitsprogramms durch folgende Maßnahmen umgesetzt werden:</p>' +
  '<p>– Standards für Suspendierungsbegleitung etablieren und begleitende Angebote ausbauen;</p>' +
  '<p>– Stärkung der Selbstbestimmung von unmündigen Mädchen an Schulen mittels Einführung eines Kopftuch<span lang=DE>verbots</span>.</p>' +
  '</body></html>'

/** 945 d.B. XXVII, the sentence that carries 93/ME. */
const SENTENCE_945 =
  'Aufgrund des inhaltlichen Zusammenhangs mit der hochschulischen Weiterbildung wird die Änderung des Bundesgesetzes über die ' +
  '„Diplomatische Akademie Wien“ (DAK – Gesetz 1996), BGBl. Nr. 178/1996, zuletzt geändert durch das Bundesgesetz BGBl. I Nr. 68/2006, ' +
  'ebenfalls in die vorliegende Regierungsvorlage aufgenommen – siehe Artikel 6.'

const draft = (over: Partial<WitnessDraft> & Pick<WitnessDraft, 'inr' | 'title'>): WitnessDraft => {
  const t = titleCoreOf(over.title)
  return { gp: 'XXVIII', citation: `${over.inr}/ME`, deadline: '2025-10-23', core: t.core ?? '', amendment: t.amendment, ...over }
}
const vorlage = (inr: number, date: string, gp = 'XXVIII'): WitnessVorlage => ({
  gp,
  inr,
  citation: `${inr} d.B.`,
  date,
  url: `https://www.parlament.gv.at/gegenstand/${gp}/I/${inr}`,
})
const witness = (v: WitnessVorlage, sentence: string, over: Partial<Witness> = {}): Witness => ({
  vorlage: v,
  explanationsUrl: `${v.url}/erl.html`,
  quote: sentence,
  sentence,
  before: '',
  linkedDrafts: [],
  ...over,
})

describe('titleCoreOf — condition 2', () => {
  it('cuts „Bundesgesetz zur" off 44/ME XXVIII and keeps what 298 d.B. quotes', () => {
    expect(titleCoreOf(KOPFTUCH)).toEqual({
      core: 'stärkung der selbstbestimmung von unmündigen mädchen an schulen mittels einführung eines kopftuchverbots',
      amendment: false,
      reason: null,
    })
  })

  it('reads 93/ME XXVII as an amendment whose core is the law’s name', () => {
    expect(titleCoreOf(DAK)).toEqual({ core: 'diplomatische akademie wien', amendment: true, reason: null })
  })

  it('refuses a list of laws ending in „u.a." (54/ME XXVIII) and a bare law name under 25 characters', () => {
    expect(titleCoreOf('Schulunterrichtsgesetz, Pflichtschulerhaltungs-Grundsatzgesetz u.a., Änderung').reason).toBe('gesetzesliste')
    expect(titleCoreOf('Schulunterrichtsgesetz, Änderung').reason).toBe('kurz')
    expect(titleCoreOf('Dienstrechts-Novelle 2025').reason).toBe('kurz')
  })

  it('takes „Bundesgesetz, mit dem" as a leading phrase', () => {
    expect(titleCoreOf('Bundesgesetz, mit dem das Bundesgesetz über die Errichtung eines Fonds für Kunst und Kultur erlassen wird').core).toBe(
      'das bundesgesetz über die errichtung eines fonds für kunst und kultur erlassen wird',
    )
  })
})

describe('witnessesIn — condition 3', () => {
  it('finds 44/ME in 298 d.B., although Word split the last word over two spans', () => {
    const found = witnessesIn(htmlParagraphs(ERL_298), [draft({ inr: 44, title: KOPFTUCH })])
    expect(found.get(44)?.quote).toBe('Stärkung der Selbstbestimmung von unmündigen Mädchen an Schulen mittels Einführung eines Kopftuchverbots.')
  })

  it('needs word boundaries: „Diplomatische Akademie Wiener …" does not name the Akademie', () => {
    const d = draft({ inr: 93, title: DAK, gp: 'XXVII' })
    expect(witnessesIn('Die Diplomatische Akademie Wiener Prägung wird erwähnt.', [d]).size).toBe(0)
    expect(witnessesIn(SENTENCE_945, [d]).size).toBe(1)
  })

  it('never matches across a paragraph break', () => {
    const d = draft({ inr: 93, title: DAK })
    expect(witnessesIn('Zur Diplomatische\nAkademie Wien', [d]).size).toBe(0)
  })

  it('prefers a passage that passes the guards over an earlier heading', () => {
    const d = draft({ inr: 93, title: DAK })
    const found = witnessesIn(`Zur Diplomatische Akademie Wien:\n${SENTENCE_945}`, [d])
    expect(found.get(93)?.sentence).toBe(SENTENCE_945)
  })
})

describe('passageAround — the quote', () => {
  it('keeps the end of a long sentence, where 945 d.B. says it took the text up', () => {
    const p = passageAround(SENTENCE_945, 'diplomatische akademie wien')!
    expect(p.quote.length).toBeLessThanOrEqual(310)
    expect(p.quote.startsWith('Aufgrund des inhaltlichen Zusammenhangs')).toBe(true)
    expect(p.quote).toContain('„Diplomatische Akademie Wien“ …')
    expect(p.quote.endsWith('ebenfalls in die vorliegende Regierungsvorlage aufgenommen – siehe Artikel 6.')).toBe(true)
    expect(p.sentence).toBe(SENTENCE_945)
  })

  it('stops at a sentence end, not at an abbreviation', () => {
    const p = passageAround('Vorher. Nach § 6 Abs. 2 ist die Diplomatische Akademie Wien zuständig. Nachher.', 'diplomatische akademie wien')!
    expect(p.quote).toBe('Nach § 6 Abs. 2 ist die Diplomatische Akademie Wien zuständig.')
  })
})

describe('witnessGuard — condition 6', () => {
  it('refuses 16/ME XXVI: 68 d.B. names it as a pending draft', () => {
    const sentence =
      'Soweit dies die Übermittlung davon regelt, stellt daher auch weiterhin § 77 Abs. 2 StPO (in Form des dzt. in Begutachtung ' +
      'befindlichen Entwurfs eines Datenschutz-Anpassungsgesetz Justiz 2018 – DS-AGJ 2018) die Grundlage der Übermittlung strafrechtlicher Daten zu wissenschaftlichen Zwecken dar.'
    const d = draft({ inr: 16, gp: 'XXVI', title: 'Datenschutz-Anpassungsgesetz Justiz 2018 – DS-AGJ 2018' })
    const p = witnessesIn(sentence, [d]).get(16)!
    expect(witnessGuard(d, p)).toBe('verweis')
  })

  it('refuses 24/ME XXVI: „Zum Einkommensteuergesetz 1988:" only says 190 d.B. amends that law too', () => {
    const d = draft({ inr: 24, gp: 'XXVI', title: 'Einkommensteuergesetz 1988, Änderung' })
    const p = witnessesIn('Zum Einkommensteuergesetz 1988:', [d]).get(24)!
    expect(witnessGuard(d, p)).toBe('gesetzesname')
  })

  it('lets 93/ME XXVII through: the law’s name, and „aufgenommen"', () => {
    const d = draft({ inr: 93, title: DAK })
    expect(witnessGuard(d, witnessesIn(SENTENCE_945, [d]).get(93)!)).toBeNull()
  })

  it('lets 44/ME XXVIII through: no amendment title, so the list item alone is a witness', () => {
    const d = draft({ inr: 44, title: KOPFTUCH })
    expect(witnessGuard(d, witnessesIn(htmlParagraphs(ERL_298), [d]).get(44)!)).toBeNull()
  })
})

describe('decideNamedInRv — conditions 4 and 5', () => {
  const d44 = draft({ inr: 44, title: KOPFTUCH })
  const k = 'Stärkung der Selbstbestimmung von unmündigen Mädchen an Schulen mittels Einführung eines Kopftuchverbots.'

  it('accepts 44/ME XXVIII: 298 d.B. came 26 days after the Frist', () => {
    const v = decideNamedInRv(d44, [witness(vorlage(298, '2025-11-18'), k)], [])
    expect(v).toMatchObject({ named: true, daysAfterFrist: 26 })
  })

  it('refuses 125/ME and 126/ME XXVII: the Vorlage that names the law came three years on', () => {
    const d125 = draft({ inr: 125, gp: 'XXVII', title: 'Bauarbeiter-Urlaubs- und Abfertigungsgesetz, Änderung', deadline: '2021-05-28' })
    expect(decideNamedInRv(d125, [witness(vorlage(2599, '2024-06-12', 'XXVII'), 'x aufgenommen')], [])).toEqual({ named: false, reason: 'nach-fenster' })
    const d126 = draft({ inr: 126, gp: 'XXVII', title: 'Bundesgesetz vom 23. Juni 1971 über die Erhöhung der Quote Österreichs beim Internationalen Währungsfonds und die Übernahme der gesamten Quote durch die Oesterreichische Nationalbank, Änderung', deadline: '2021-07-09' })
    expect(decideNamedInRv(d126, [witness(vorlage(2509, '2024-04-10', 'XXVII'), 'x')], [])).toEqual({ named: false, reason: 'nach-fenster' })
  })

  it('refuses 228/ME XXVII: the AbgÄG 2023 repeats its title 196 days after the Frist — one day past the window would still be past it', () => {
    const d228 = draft({ inr: 228, gp: 'XXVII', title: 'Bundesgesetz über die Wiener Zeitung GmbH und Einrichtung einer elektronischen Verlautbarungs- und Informationsplattform des Bundes – WZEVI-Gesetz', deadline: '2022-11-30' })
    expect(decideNamedInRv(d228, [witness(vorlage(2086, '2023-06-14', 'XXVII'), 'x')], [])).toEqual({ named: false, reason: 'nach-fenster' })
    // The window's own edge: 180 days is in, 181 is out.
    expect(decideNamedInRv(d44, [witness(vorlage(1, '2026-04-21'), k)], [])).toMatchObject({ named: true, daysAfterFrist: 180 })
    expect(decideNamedInRv(d44, [witness(vorlage(1, '2026-04-22'), k)], [])).toEqual({ named: false, reason: 'nach-fenster' })
  })

  it('refuses 138/ME XXVIII: every Vorlage naming the UVP-G came before its Frist', () => {
    const d138 = draft({ inr: 138, title: 'Umweltverträglichkeitsprüfungsgesetz, Änderung', deadline: '2026-11-01' })
    expect(decideNamedInRv(d138, [witness(vorlage(497, '2026-05-13'), 'x')], [])).toEqual({ named: false, reason: 'vor-fristende' })
  })

  it('refuses two Vorlagen in the window, and one beside an unread one in the window', () => {
    const two = [witness(vorlage(298, '2025-11-18'), k), witness(vorlage(313, '2025-11-20'), k)]
    expect(decideNamedInRv(d44, two, [])).toEqual({ named: false, reason: 'mehrere' })
    const unread: UnreadVorlage = { ...vorlage(296, '2025-11-18'), pdfUrl: null, linkedDrafts: [] }
    expect(decideNamedInRv(d44, [two[0]!], [unread])).toEqual({ named: false, reason: 'ungelesen' })
    // An unread Vorlage outside the window says nothing about it.
    expect(decideNamedInRv(d44, [two[0]!], [{ ...unread, date: '2025-05-13' }])).toMatchObject({ named: true })
  })

  it('never quotes a PDF, and never counts the Vorlage linked to the draft itself', () => {
    expect(decideNamedInRv(d44, [witness(vorlage(296, '2025-11-18'), k, { fromPdf: true })], [])).toEqual({ named: false, reason: 'nur-pdf' })
    const own = witness(vorlage(298, '2025-11-18'), k, { linkedDrafts: [{ gp: 'XXVIII', inr: 44, citation: '44/ME', title: KOPFTUCH }] })
    expect(decideNamedInRv(d44, [own], [])).toBeNull()
  })
})

describe('mayBeNamed — condition 1 at the page', () => {
  const base = { active: false, hasRv: false, coverage: 'linked' as const, antragPath: null, successor: null }
  it('holds only for a closed draft without Vorlage, Antrag or successor, in a period whose links exist', () => {
    expect(mayBeNamed(base)).toBe(true)
    expect(mayBeNamed({ ...base, active: true })).toBe(false)
    expect(mayBeNamed({ ...base, hasRv: true })).toBe(false)
    expect(mayBeNamed({ ...base, coverage: 'unknown' })).toBe(false)
    expect(mayBeNamed({ ...base, antragPath: {} })).toBe(false)
    expect(mayBeNamed({ ...base, successor: {} })).toBe(false)
  })
})

describe('explanationsFormats', () => {
  it('finds Erläuterungen filed under another name (1026 d.B. XXVII: „Vorblatt, WFA, Erläuterungen")', () => {
    const docs = [
      { title: 'Gesetzestext', formats: [{ type: 'html' as const, url: 'g.html' }] },
      { title: 'Vorblatt, WFA, Erläuterungen', formats: [{ type: 'pdf' as const, url: 'e.pdf' }, { type: 'html' as const, url: 'e.html' }] },
    ]
    expect(explanationsFormats(docs)).toEqual({ html: 'e.html', pdf: 'e.pdf' })
  })
})

describe('buildNamedIndex', () => {
  const summary = (inr: number, title: string, deadline: string, gp = 'XXVIII'): DraftSummary => ({
    gp,
    inr,
    citation: `${inr}/ME`,
    title,
    ministryCode: 'BMB',
    ministryName: 'BMB',
    coMinistries: [],
    arrivedAt: '2025-09-01',
    deadline,
    active: false,
    statementCount: 0,
    parliamentUrl: '',
  })
  const row = (inr: number, date: string): VorlageRow => ({
    gp: 'XXVIII',
    inr,
    citation: `${inr} d.B.`,
    title: '',
    date,
    status: '5',
    parliamentUrl: `https://www.parlament.gv.at/gegenstand/XXVIII/I/${inr}`,
  })
  const input = (over: Partial<NamedIndexInput> = {}): NamedIndexInput => ({
    gp: 'XXVIII',
    drafts: [summary(44, KOPFTUCH, '2025-10-23'), summary(54, 'Schulunterrichtsgesetz, Pflichtschulerhaltungs-Grundsatzgesetz u.a., Änderung', '2025-10-31')],
    laterDrafts: [],
    linked: (inr) => inr === 54,
    vorlagen: [row(298, '2025-11-18'), row(296, '2025-11-18'), row(68, '2025-05-13')],
    linksOf: (v) => (v.inr === 298 ? [{ gp: 'XXVIII', inr: 54, citation: '54/ME', title: 'Schulunterrichtsgesetz …' }] : []),
    read: async (v) =>
      v.inr === 298
        ? { explanationsUrl: 'erl298.html', html: ERL_298, pdfUrl: null, linkedDrafts: [] }
        : { explanationsUrl: null, html: null, pdfUrl: `erl${v.inr}.pdf`, linkedDrafts: [] },
    readPdf: async () => 'Preisgesetz und Energie-Control-Gesetz',
    limit: 2,
    ...over,
  })

  it('names 44/ME in 298 d.B., with 54/ME as the linked draft, after reading the one PDF in its window', async () => {
    const pdfs: string[] = []
    const r = await buildNamedIndex(input({ readPdf: async (url) => (pdfs.push(url), 'Dokumentationsgesetz') }))
    expect(r.complete).toBe(true)
    expect(r.named[44]).toMatchObject({ rv: { citation: '298 d.B.' }, daysAfterFrist: 26, explanationsUrl: 'erl298.html' })
    expect(r.named[44]!.linkedDrafts.map((l) => l.citation)).toEqual(['54/ME'])
    // 68 d.B. lies before the Frist: neither read nor its PDF.
    expect(pdfs).toEqual(['erl296.pdf'])
  })

  it('refuses the state where the PDF in the window names the title too', async () => {
    const r = await buildNamedIndex(input({ readPdf: async () => 'Stärkung der Selbstbestimmung von unmündigen Mädchen an Schulen mittels Einführung eines Kopftuchverbots' }))
    expect(r.named[44]).toBeUndefined()
    expect(r.rejected[0]).toMatchObject({ reason: 'mehrere' })
  })

  it('claims nothing from a scan in which a Vorlage could not be fetched', async () => {
    const r = await buildNamedIndex(input({ read: async () => Promise.reject(new Error('502')) }))
    expect(r.complete).toBe(false)
    const r2 = await buildNamedIndex(input({ readPdf: async () => Promise.reject(new Error('502')) }))
    expect(r2.complete).toBe(false)
  })

  it('does not look for a draft with a same-title successor or an Initiativantrag route', async () => {
    const r = await buildNamedIndex(input({ laterDrafts: [summary(3, KOPFTUCH, '2026-01-10', 'XXIX')] }))
    expect(r.excluded.find((e) => e.draft.inr === 44)?.reason).toBe('nachfolger')
    // 228/ME XXVII stands in the Antrag table (`antragPathTable.ts`).
    const r2 = await buildNamedIndex(input({ gp: 'XXVII', drafts: [summary(228, 'Bundesgesetz über die Wiener Zeitung GmbH und Einrichtung einer elektronischen Verlautbarungs- und Informationsplattform des Bundes – WZEVI-Gesetz', '2022-11-30', 'XXVII')] }))
    expect(r2.excluded[0]?.reason).toBe('antrag')
  })
})
