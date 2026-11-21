import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { annexSourcesOf } from '../server/utils/annex/annexSources'
import type { KonsParagraphRef, KonsVersion } from '../server/utils/ris/konsLaw'

const ref = (nor: string, label: string, from: string, to: string | null, organ: string): KonsParagraphRef =>
  ({ nor, label, id: label.replace(/^§\s*/, ''), inkrafttreten: from, ausserkrafttreten: to, kundmachungsorgan: organ, xmlUrl: `https://ris.example/${nor}.xml` }) as KonsParagraphRef

// The annex check's sources are built once from the readers a caller hands
// in (audit of 20.11.2026): the request path hands in the cached readers,
// the harnesses the same functions uncached.
describe('annexSourcesOf', () => {
  // The Kulturgüterrückgabegesetz's hole (34/ME, Stichtag 2025-07-22): the old
  // version ends 2025-03-24, the next begins 2026-03-25 by BGBl. I Nr. 10/2026.
  const old = ref('NOR1', '§ 1', '2016-01-01', '2025-03-24', 'BGBl. I Nr. 19/2016')
  const next = ref('NOR2', '§ 1', '2026-03-25', null, 'BGBl. I Nr. 19/2016 zuletzt geändert durch BGBl. I Nr. 10/2026')
  const history: KonsVersion[] = [
    { ref: old, novelle: null, kundmachung: old.kundmachungsorgan! },
    { ref: next, novelle: '10/2026', kundmachung: next.kundmachungsorgan! },
  ]
  const sources = annexSourcesOf({
    resolveLaw: async () => null,
    history: async () => history,
    paragraphXml: async (nor) => {
      if (nor === 'NOR-OUTAGE') throw new Error('RIS antwortet nicht')
      return '<risdok><nutzdaten><abschnitt><absatz typ="gldsym">§ 1.</absatz><absatz typ="abs">(1) Text.</absatz></abschnitt></nutzdaten></risdok>'
    },
  })

  it('bridges a § across the gap in RIS, as the page does', async () => {
    expect(await sources.paragraphAcrossGap!('20009186', '§ 1', '2025-07-22')).toEqual(old)
  })

  it('lets an outage through: a § document that did not come is no answer about the §', async () => {
    await expect(sources.standingText(ref('NOR-OUTAGE', '§ 1', '2016-01-01', null, 'x'))).rejects.toThrow('RIS antwortet nicht')
  })
})

// Until 21.11.2026 the four harnesses that judge the annex or find a law for
// the engine built their own lookup over `resolveLawByBgbl` — without the
// clause, `standingOnDay` and the gap bridge — and caught a failed one into
// null. They measured another standing text than the page shows.
describe('the harnesses find a law as the page does', () => {
  const scripts = ['scripts/harness/annexPdf.ts', 'scripts/harness/faultInjection.ts', 'scripts/harness/me.ts', 'scripts/ci/gateGoldenRecord.ts']
  it.each(scripts)('%s reads through the page\'s own readers', (path) => {
    const source = readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8')
    expect(source).toContain("from '../lib/productionSources'")
    expect(source).not.toMatch(/resolveLawByBgbl\s*\(/)
  })
})
