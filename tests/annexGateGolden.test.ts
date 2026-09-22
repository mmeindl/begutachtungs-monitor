import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { annexParagraphKey } from '../server/utils/annex/annexText'
import { checkAnnexRows, notRunReason } from '../server/utils/annex/gateRows'
import { verifyAnnex, type AnnexSources, type ParagraphVerdict } from '../server/utils/annex/verdict'
import { parseAnnexPdf, type AnnexPage } from '../server/utils/annexPdf'
import { parseRisXml } from '../server/utils/lawText'
import { draftArticles } from '../server/utils/lawTitles'
import { parseTextComparison, type ComparisonRow } from '../server/utils/textComparison'
import { expandLaw, resolveKey, standingKey, type RecordedLaw } from '../scripts/gate-golden-keys'

/**
 * Five real gate runs, frozen — verdicts, not parses.
 *
 * `annexGolden.test.ts` freezes what the two parsers make of a document. What
 * the *gate* concludes from it was watched by nothing but the weekly drift
 * alarm: once a week, over the network, against a baseline pulled by hand. On
 * 19.09.2026 the engine work of one afternoon moved verdicts in twelve drafts
 * and every test stayed green; the alarm found it the following Monday, and
 * the § that had moved the wrong way took a bisect over 46 commits to
 * explain. Two of the fixtures below fail on that change, in the commit that
 * makes it.
 *
 * `AnnexSources` is what makes this offline: the gate takes its two RIS
 * lookups as an interface, so the fixture records answers rather than HTTP,
 * and the replay drives the shipped decision instead of a copy of it.
 *
 * **An unrecorded question throws.** A gate that starts asking about a
 * different § would otherwise read the miss as "RIS does not hold it" and go
 * green on a verdict nothing checked — the failure this file exists to
 * prevent. So the replay refuses, and the fixture is re-recorded on purpose:
 *
 *     npx vite-node scripts/gate-golden-record.ts -- --only=<Titelteil> --out=tests/fixtures/gate-<name>.json
 *
 * Re-record in the SAME commit that changes the engine, and read the diff of
 * the verdict map: that diff is the change, in the only terms the reader of
 * the page cares about.
 *
 * All five are RIS open data, CC-BY 4.0 (data.bka.gv.at) — the settled source
 * for a draft and its Textgegenüberstellung. Parliament's copy of the same
 * annex is the one excluded from open data and is deliberately not used.
 *
 * Which fixture earns its place, measured rather than assumed — the engine of
 * 373b62d was run against each of them:
 *
 * - `gate-obsorge` and `gate-leitungspositionen` **fail** on it: one § each
 *   moves `unchecked → verified` (ABGB § 212, UGB § 284), and Obsorge's
 *   `notRunReason` changes with it. These two are the guard.
 * - `gate-organtransplantation`, `gate-avg` and `gate-informationssicherheit`
 *   do not move, and are kept for the other reason: between them they hold
 *   all three withholding causes — `alreadyStanding`, `notInDraft` (the cause
 *   that moved under the plural-§§ fix) and `standing` — and both annex
 *   paths, the XML table and the scanned PDF whose geometry the fixture
 *   carries as `annex-uwg-pages.json` does.
 */
interface GateFixture {
  cite: string
  path: 'xml' | 'pdf'
  asOf: string
  draftXml: string
  annexXml: string | null
  annexPages: AnnexPage[] | null
  recorded: {
    resolveLaw: Record<string, RecordedLaw | null>
    standingText: Record<string, { text: string; heading: string } | null>
  }
  expected: {
    ran: boolean
    notRunReason: string | null
    judged: number
    verdicts: Record<string, ParagraphVerdict>
    withheldCauses: Record<string, string>
  }
}

const fixture = (name: string): GateFixture =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8')) as GateFixture

/** The recorded answers, and a refusal for anything the recording does not hold. */
function replay(f: GateFixture): AnnexSources {
  return {
    resolveLaw: async (organ, nummer, date, title) => {
      const key = resolveKey(organ, nummer, date, title)
      if (!(key in f.recorded.resolveLaw)) throw new Error(`nicht aufgezeichnet: resolveLaw ${key}`)
      const rec = f.recorded.resolveLaw[key]
      return rec === null || rec === undefined ? null : expandLaw(rec)
    },
    standingText: async (ref) => {
      const key = standingKey(ref)
      if (!(key in f.recorded.standingText)) throw new Error(`nicht aufgezeichnet: standingText ${key}`)
      return f.recorded.standingText[key]!
    },
  }
}

async function run(f: GateFixture) {
  const blocks = parseRisXml(f.draftXml)
  const articles = draftArticles(blocks)
  const parse = f.path === 'xml' ? parseTextComparison(f.annexXml!, articles) : parseAnnexPdf(f.annexPages!, articles)
  expect(parse.refusal).toBeNull()
  const check = await verifyAnnex(parse.rows, { articles, asOf: f.asOf, blocks }, replay(f))
  return { rows: parse.rows as readonly ComparisonRow[], check }
}

const FIXTURES: { name: string; withholds: string | null }[] = [
  { name: 'gate-obsorge', withholds: null },
  { name: 'gate-leitungspositionen', withholds: null },
  { name: 'gate-organtransplantation', withholds: 'alreadyStanding' },
  { name: 'gate-avg', withholds: 'notInDraft' },
  { name: 'gate-informationssicherheit', withholds: 'standing' },
]

describe.each(FIXTURES)('$name', ({ name, withholds }) => {
  const f = fixture(name)

  it('judges every paragraph as it did when the fixture was recorded', async () => {
    const { check } = await run(f)
    expect(check.ran).toBe(f.expected.ran)
    expect(notRunReason(check)).toBe(f.expected.notRunReason)
    expect(check.judged).toBe(f.expected.judged)
    // The map, not a count: a § that swaps its verdict with another § leaves
    // every total intact, and that is exactly the drift worth catching.
    expect(check.verdicts).toEqual(f.expected.verdicts)
    expect(check.withheldCauses).toEqual(f.expected.withheldCauses)
  })

  if (withholds !== null) {
    it(`still withholds for ${withholds}`, async () => {
      const { check } = await run(f)
      expect(Object.values(check.withheldCauses)).toContain(withholds)
    })
  }

  /**
   * The four assurances the harness checks over the corpus
   * (`annex-pdf-verify.ts`), here on documents that never need the network.
   * They are what stands between a reader and a comparison labelled "geprüft"
   * that nothing checked.
   */
  it('keeps the four assurances', async () => {
    const { rows, check } = await run(f)
    const checked = checkAnnexRows(rows, check)

    const verdictless = rows.filter((r) => {
      if (r.kind !== 'pair') return false
      const para = r.gld ?? r.para
      return para !== null && check.verdicts[annexParagraphKey(r.law, para)] === undefined
    })
    expect(verdictless).toEqual([])

    const wronglyVerified = checked.rows.filter((r) => {
      if (r.check !== 'verified') return false
      const para = r.gld ?? r.para
      return para === null || check.verdicts[annexParagraphKey(r.law, para)] !== 'verified'
    })
    expect(wronglyVerified).toEqual([])

    const withheldWithText = checked.rows.filter((r) => r.check === 'withheld' && (r.current !== '' || r.proposed !== '' || r.segments !== null))
    expect(withheldWithText).toEqual([])

    const withheldWithoutCause = Object.entries(check.verdicts).filter(([key, v]) => v === 'withheld' && check.withheldCauses[key] === undefined)
    expect(withheldWithoutCause).toEqual([])
  })
})
