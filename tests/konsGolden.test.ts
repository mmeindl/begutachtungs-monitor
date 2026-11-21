import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { consolidate, consolidationBalance, type KonsSources } from '../server/utils/kons/consolidate'
import { parseRisXml } from '../server/utils/lawtext/risXml'
import { expandKonsLaw, lawKey, outcomesOf, type KonsFixture } from '../scripts/lib/konsGoldenKeys'

/**
 * Two real Lesefassung runs, frozen — every § with its outcome and its text.
 *
 * `annexGateGolden.test.ts` replays the annex check; what `consolidate`
 * makes of a real draft — the engine, the guard, the oracle's five checks,
 * the second witness — had synthetic tests only, and a drift in it reached
 * the page unseen until a hand-run round (audit of 20.11.2026).
 *
 * `KonsSources` makes it offline: the fixture records the answers the
 * page's own sources gave (`ci/konsGoldenRecord.ts`), and the replay drives
 * the shipped run. **An unrecorded question throws**, as in the gate's
 * golden: a run that starts asking about another § or law would otherwise
 * read the miss as an answer. Re-record in the SAME commit that moves an
 * outcome, and read the diff of `expected`:
 *
 *     npx vite-node -c vitest.config.ts scripts/ci/konsGoldenRecord.ts -- --only=<Titelteil> --out=tests/fixtures/kons-<name>.json
 *
 * Both drafts are RIS open data, CC BY 4.0 (data.bka.gv.at), and single-law
 * drafts, so the fixtures stay small. Between them they hold both annex
 * paths and every outcome the oracle and the witness decide:
 *
 * - `kons-hochleistungsstrecken` (29/ME XXVIII, the annex's XML table): one §
 *   the oracle confirms, one the witness shows.
 * - `kons-fiskalrat` (67/ME XXVIII, the annex as PDF, a whole § per cell):
 *   three confirmed, two shown by the witness, one the annex contradicts and
 *   the draft's PDF does not settle, one whose annex starts from another
 *   standing text (`anhang-fremd`).
 *
 * Recorded offline from the harness cache on 21.11.2026; the outcomes are
 * the ones the page gave on the dev server in the round of 20.11.2026.
 */
const fixture = (name: string): KonsFixture =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8')) as KonsFixture

function replay(f: KonsFixture): KonsSources {
  return {
    resolveLaw: async (organ, nummer, date, title, clause) => {
      const key = lawKey(organ, nummer, date, title, clause)
      if (!(key in f.recorded.resolveLaw)) throw new Error(`nicht aufgezeichnet: resolveLaw ${key}`)
      const rec = f.recorded.resolveLaw[key]
      return rec ? expandKonsLaw(rec) : null
    },
    paragraphXml: async (ref) => {
      const xml = f.recorded.paragraphXml[ref.nor]
      if (xml === undefined) throw new Error(`nicht aufgezeichnet: paragraphXml ${ref.nor} ${ref.label}`)
      return xml
    },
    annexRows: async () => f.recorded.annexRows,
    draftRendition: async () => {
      if (f.recorded.rendition === undefined) throw new Error('nicht aufgezeichnet: draftRendition')
      return f.recorded.rendition
    },
  }
}

describe.each(['kons-hochleistungsstrecken', 'kons-fiskalrat'])('%s', (name) => {
  const f = fixture(name)

  it('gives every § the outcome and the text it had when the fixture was recorded', async () => {
    const r = await consolidate({ gp: 'XXVIII', inr: null, risId: null }, parseRisXml(f.draftXml), f.asOf, replay(f))
    // The map, not the counts: two §§ that swap their outcomes leave every
    // count intact.
    expect(outcomesOf(r)).toEqual(f.expected)
    expect(consolidationBalance(r).balanced).toBe(true)
    expect(Object.keys(f.expected.outcomes)).toHaveLength(f.expected.touched)
  })
})
