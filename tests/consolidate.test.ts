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
