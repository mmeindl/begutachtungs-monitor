import { describe, expect, it } from 'vitest'
import { consolidate, consolidationBalance, type KonsSources } from '../server/utils/kons/consolidate'
import { parseRisXml } from '../server/utils/lawtext/risXml'
import type { ComparisonRow } from '../server/utils/annex/comparisonRows'
import type { KonsLawAtDate } from '../server/utils/ris/konsLaw'

/**
 * The engine run behind the page's Lesefassung, end to end, on a draft small
 * enough to read: RIS answers are fakes (`KonsSources`), everything between
 * them is the shipped code (26.10.2026).
 */

const clause = '<absatz typ="promkleinlsatz">Das Testgesetz, BGBl. I Nr. 1/2000, wird wie folgt ge&auml;ndert:</absatz>'
const artikel = (nr: string, title: string, instructions: string) =>
  `<ueberschrift typ="g1">Artikel ${nr}</ueberschrift><ueberschrift typ="g2">${title}</ueberschrift>${clause}${instructions}`
const draft = (body: string) => parseRisXml(`<risdok><nutzdaten><abschnitt>${body}</abschnitt></nutzdaten></risdok>`)

/** § 5 of the Testgesetz as RIS sends it: two Absätze. */
const PARA_5 = `<risdok><nutzdaten><abschnitt>
  <ueberschrift typ="para" ct="text">Zweck</ueberschrift>
  <absatz typ="abs" ct="text"><gldsym>§ 5.</gldsym> (1) Eins gilt.</absatz>
  <absatz typ="abs" ct="text">(2) Zwei gilt.</absatz>
</abschnitt></nutzdaten></risdok>`

const LAW: KonsLawAtDate = {
  gesetzesnummer: '10000001',
  kurztitel: 'Testgesetz',
  paragraphs: {
    '§ 5': { nor: 'NOR1', label: '§ 5', id: '5', inkrafttreten: null, ausserkrafttreten: null, kundmachungsorgan: null, stammnorm: null, gesetzesnummer: '10000001', xmlUrl: 'https://www.ris.bka.gv.at/x.xml' },
  },
}

const pair = (law: string, current: string, proposed: string, gld: string | null, elided = false): ComparisonRow => ({
  kind: 'pair', law, heading: null, gld, para: gld ?? '§ 5.', paraAfter: gld ?? '§ 5.', current, proposed,
  change: elided ? 'unchanged' : current ? 'changed' : 'inserted', elided, segments: null, editorial: false, elisionRange: false,
})

function sources(rows: ComparisonRow[] | null): KonsSources {
  return {
    resolveLaw: async () => LAW,
    paragraphXml: async () => PARA_5,
    annexRows: async () => rows,
  }
}

const who = { gp: 'XXVIII', inr: 1, risId: null }

describe('consolidate — two Artikel amending one law', () => {
  const blocks = draft(
    artikel('1', 'Änderung des Testgesetzes', '<absatz typ="novao1">1. Dem &sect; 5 wird folgender Abs. 3 angef&uuml;gt:</absatz><absatz typ="abs">&bdquo;(3) Drei gilt.&ldquo;</absatz>') +
    artikel('2', 'Änderung des Testgesetzes (Teil II)', '<absatz typ="novao1">1. Dem &sect; 5 wird folgender Abs. 4 angef&uuml;gt:</absatz><absatz typ="abs">&bdquo;(4) Vier gilt.&ldquo;</absatz>'),
  )
  const I = 'Änderung des Testgesetzes'
  const II = 'Änderung des Testgesetzes (Teil II)'
  const rows = [
    pair(I, '§ 5. (1) bis (2) …', '§ 5. (1) bis (2) …', '§ 5.', true),
    pair(I, '', '(3) Drei gilt.', null),
    pair(II, '§ 5. (1) bis (3) …', '§ 5. (1) bis (3) …', '§ 5.', true),
    pair(II, '', '(4) Vier gilt.', null),
  ]

  it('applies the second to what the first leaves, and the annex confirms both', async () => {
    const r = await consolidate(who, blocks, '2026-01-01', sources(rows))
    expect(r.paragraphs.map((p) => [p.annexLaw, p.id])).toEqual([[I, '5'], [II, '5']])
    const teilII = r.paragraphs[1]!.segments.map((s) => (s.type === 'removed' ? '' : s.text)).join(' ')
    // Teil I's (3) stands in Teil II's text — it was missing when each
    // Artikel ran on the untouched RIS text (126/ME, StAG § 42).
    expect(teilII).toMatch(/\(3\) Drei gilt\.[\s\S]*\(4\) Vier gilt\./)
    expect(consolidationBalance(r)).toEqual({ balanced: true, missing: 0, twice: [] })
  })

  it('accounts for every § it counts, with a cause, where nothing can be confirmed', async () => {
    const r = await consolidate(who, blocks, '2026-01-01', sources(null))
    expect(r.paragraphs).toEqual([])
    expect(r.withheld).toEqual([{ id: '5', annexLaw: I, cause: 'kein-anhang' }, { id: '5', annexLaw: II, cause: 'kein-anhang' }])
    expect(consolidationBalance(r).balanced).toBe(true)
  })

  it('says why a law it cannot find shows nothing', async () => {
    const r = await consolidate(who, blocks, '2026-01-01', { ...sources(rows), resolveLaw: async () => null })
    expect(r.withheld.map((w) => w.cause)).toEqual(['gesetz-unbekannt', 'gesetz-unbekannt'])
    expect(r.notRun).toBeNull()
  })

  it('names the reason a draft without an amending Artikel has no run', async () => {
    const r = await consolidate(who, draft('<ueberschrift typ="titel">Bundesgesetz über etwas Neues</ueberschrift><absatz typ="abs"><gldsym>§ 1.</gldsym> Dieses Gesetz gilt.</absatz>'), '2026-01-01', sources(rows))
    expect(r).toMatchObject({ touched: 0, notRun: 'keine-novelle' })
  })
})

describe('consolidate — §§ the draft changes without naming them one by one (26.10.2026)', () => {
  const T = 'Änderung des Testgesetzes'
  const N = 'Bundesgesetz über Neues'
  /** A law the draft enacts: an Artikel without a Promulgationsklausel. */
  const enacting = `<ueberschrift typ="g1">Artikel 1</ueberschrift><ueberschrift typ="g2">${N}</ueberschrift><absatz typ="abs"><gldsym>&sect; 5.</gldsym> Neu gilt.</absatz>`

  it('gives the §§ of a law the draft enacts anew their cause, where the annex sets them against the old one', async () => {
    const blocks = draft(enacting + artikel('2', T, '<absatz typ="novao1">1. Dem &sect; 5 wird folgender Abs. 3 angef&uuml;gt:</absatz><absatz typ="abs">&bdquo;(3) Drei gilt.&ldquo;</absatz>'))
    const rows = [
      pair(N, '§ 5. Alt gilt.', '§ 5. Neu gilt.', '§ 5.'),
      pair(T, '§ 5. (1) bis (2) …', '§ 5. (1) bis (2) …', '§ 5.', true),
      pair(T, '', '(3) Drei gilt.', null),
    ]
    const r = await consolidate(who, blocks, '2026-01-01', sources(rows))
    expect(r.withheld).toEqual([{ id: '5', annexLaw: N, cause: 'neu-erlassen' }])
    expect(r.paragraphs.map((p) => [p.annexLaw, p.id])).toEqual([[null, '5']])
    expect(consolidationBalance(r)).toEqual({ balanced: true, missing: 0, twice: [] })
    expect(r.touched).toBe(2)
  })

  it('never holds the Novelle against the rows of the law the draft enacts', async () => {
    // 144/ME XXVIII: the annex has rows of the new law only, and the Novelle's
    // § 1 and § 26 were held against them (`anhang-fremd`).
    const blocks = draft(enacting + artikel('2', T, '<absatz typ="novao1">1. Dem &sect; 5 wird folgender Abs. 3 angef&uuml;gt:</absatz><absatz typ="abs">&bdquo;(3) Drei gilt.&ldquo;</absatz>'))
    const r = await consolidate(who, blocks, '2026-01-01', sources([pair(N, '§ 5. Alt gilt.', '§ 5. Neu gilt.', '§ 5.')]))
    expect(r.withheld).toEqual([{ id: '5', annexLaw: null, cause: 'anhang-schweigt' }, { id: '5', annexLaw: N, cause: 'neu-erlassen' }])
  })

  it('counts and runs the §§ an instruction on the whole text reaches, as the annex lists them', async () => {
    // 145/ME XXVIII: „Im gesamten Gesetzestext wird jeweils …" names no §.
    const blocks = draft(artikel('1', T, '<absatz typ="novao1">1. Im gesamten Gesetzestext wird das Wort "Zwei" durch das Wort "Drei" ersetzt.</absatz>'))
    const rows = [pair(T, '§ 5. (1) Eins gilt.', '§ 5. (1) Eins gilt.', '§ 5.', true), pair(T, '(2) Zwei gilt.', '(2) Drei gilt.', null)]
    const r = await consolidate(who, blocks, '2026-01-01', sources(rows))
    expect(r.touched).toBe(1)
    expect(r.paragraphs.map((p) => p.id)).toEqual(['5'])
    // Without an annex there is no list of them, and nothing to say either.
    expect((await consolidate(who, blocks, '2026-01-01', sources(null))).touched).toBe(0)
  })

  it('follows a § through a renumbering run, each from the § it was before the run', async () => {
    // „Die §§ 5 bis 6 erhalten die Bezeichnungen § 6 bis § 7": the new § 7 is
    // the standing § 6, not the § 5 that has just become § 6.
    const para6 = PARA_5.replace('Zweck', 'Ziel').replace('§ 5.', '§ 6.').replace('Eins gilt', 'Sechs gilt').replace('Zwei gilt', 'Sieben gilt')
    const law: KonsLawAtDate = { ...LAW, paragraphs: { ...LAW.paragraphs, '§ 6': { ...LAW.paragraphs['§ 5']!, nor: 'NOR2', label: '§ 6', id: '6', xmlUrl: 'https://www.ris.bka.gv.at/y.xml' } } }
    const blocks = draft(artikel('1', T, '<absatz typ="novao1">1. Die &sect;&sect; 5 bis 6 erhalten die Paragraphenbezeichnungen "&sect; 6." bis "&sect; 7." .</absatz>'))
    // Each row filed under the number it has afterwards, as the annex parser files it (`designateAfter`).
    const rows = [{ ...pair(T, '§ 5. (1) Eins gilt.', '§ 6. (1) Eins gilt.', '§ 5.'), paraAfter: '§ 6.' }, { ...pair(T, '§ 6. (1) Sechs gilt.', '§ 7. (1) Sechs gilt.', '§ 6.'), paraAfter: '§ 7.' }]
    const r = await consolidate(who, blocks, '2026-01-01', { resolveLaw: async () => law, paragraphXml: async (ref) => (ref.id === '6' ? para6 : PARA_5), annexRows: async () => rows })
    expect(r.paragraphs.map((p) => [p.id, p.segments.every((s) => s.type === 'equal')])).toEqual([['6', true], ['7', true]])
  })

  it('shows a renumbered § against the text it came from, and the annex block it moves to', async () => {
    const blocks = draft(artikel('1', T, '<absatz typ="novao1">1. &sect; 5 erh&auml;lt die Paragraphenbezeichnung "&sect; 6." .</absatz>'))
    const rows = [pair(T, '§ 5. (1) Eins gilt.', '§ 6. (1) Eins gilt.', '§ 5.'), pair(T, '(2) Zwei gilt.', '(2) Zwei gilt.', null, true)].map((r) => ({ ...r, paraAfter: '§ 6.' }))
    const r = await consolidate(who, blocks, '2026-01-01', sources(rows))
    expect(r.paragraphs.map((p) => p.id)).toEqual(['6'])
    expect(r.paragraphs[0]!.segments.every((s) => s.type === 'equal')).toBe(true)
    expect(r.withheld).toEqual([{ id: '5', annexLaw: null, cause: 'entfaellt' }])
    expect(consolidationBalance(r).balanced).toBe(true)
  })
})
