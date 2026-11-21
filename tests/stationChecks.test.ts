import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseLawUnits } from '../server/utils/lawtext/lawUnits'
import { diffLawPackage, isCommencementArticle } from '../server/utils/diff/lawDiff'
import { badgeMoves, completeness, headingBreaches, reconstructionBreaches, residuesOf, symmetryBreaches } from '../scripts/lib/stationChecks'

/** One instruction in Parliament's Word HTML. */
const html = (instruction: string, payload: string): string =>
  `<html><body><p class=11Titel>Bundesgesetz, mit dem das X-Gesetz ge&auml;ndert wird</p>` +
  `<p class=12PromKlEinlSatz>Das X-Gesetz, BGBl. I Nr. 1/2000, wird wie folgt ge&auml;ndert:</p>` +
  `<p class=21NovAo1>1. ${instruction}</p><p class=51Abs>${payload}</p></body></html>`

describe('the checks the station harness runs (`scripts/lib/stationChecks.ts`)', () => {
  const from = parseLawUnits(html('§ 2 lautet:', 'Der Antrag ist binnen sechs Wochen einzubringen.'))
  const to = parseLawUnits(html('§ 2 lautet:', 'Der Antrag ist binnen acht Wochen schriftlich einzubringen.'))

  it('finds nothing wrong with a correct comparison', () => {
    const diff = diffLawPackage(from, to)
    expect(diff.units.map((u) => u.change)).toEqual(['changed'])
    expect(reconstructionBreaches(diff.units)).toEqual([])
    expect(completeness(from, to, diff, isCommencementArticle).breaches).toEqual([])
    expect(symmetryBreaches(diff, diffLawPackage(to, from))).toEqual([])
    expect(residuesOf(diff.units)[0]!.pieces.join(' ')).toContain('⟦-sechs⟧')
  })

  it('catches runs that do not read the two texts', () => {
    const diff = diffLawPackage(from, to)
    const lost = { ...diff.units[0]!, segments: diff.units[0]!.segments!.filter((s) => s.type !== 'removed') }
    expect(reconstructionBreaches([lost]).map((b) => b.kind)).toEqual(['rekonstruktion'])
    const doubled = { ...diff.units[0]!, segments: [...diff.units[0]!.segments!, { type: 'inserted' as const, text: 'nochmals' }] }
    expect(reconstructionBreaches([doubled]).map((b) => b.kind)).toEqual(['rekonstruktion'])
    const empty = { ...diff.units[0]!, segments: [{ type: 'equal' as const, text: diff.units[0]!.toText! }] }
    expect(reconstructionBreaches([empty]).map((b) => b.kind)).toContain('ohne-änderung')
  })

  it('catches a unit that vanished, and one that stands twice', () => {
    const diff = diffLawPackage(from, to)
    expect(completeness(from, to, { ...diff, units: [] }, isCommencementArticle).breaches.length).toBeGreaterThan(0)
    expect(completeness(from, to, { ...diff, units: [...diff.units, ...diff.units] }, isCommencementArticle).breaches.length).toBeGreaterThan(0)
  })

  // 21.11.2026: a commencement Artikel only one side carries is neither in
  // the list nor named as a law. The page says so only through the sentence
  // on the laws only the later text carries („verglichen wird deshalb, was in
  // beiden Texten steht"); where no such law exists, nothing is said.
  it('lets a commencement Artikel only one side carries go only where the page says that only both texts are compared', () => {
    const pkg = (laws: { title: string; ziffer: string }[]) =>
      `<html><body>${laws.map((l, i) => `<p class=41UeberschrG1>Artikel&nbsp;${i + 1}</p><p class=43UeberschrG2>${l.title}</p><p class=21NovAo1>${l.ziffer}</p>`).join('')}</body></html>`
    const law = { title: '&Auml;nderung des Auskunftspflichtgesetzes', ziffer: '1. &sect;&nbsp;1 lautet: &bdquo;alt&ldquo;' }
    const commencement = { title: 'Inkrafttreten', ziffer: '1. Dieses Bundesgesetz tritt mit 1. J&auml;nner 2026 in Kraft.' }
    const other = { title: '&Auml;nderung des Datenschutzgesetzes', ziffer: '1. &sect;&nbsp;4 lautet: &bdquo;x&ldquo;' }
    const withIt = parseLawUnits(pkg([law, commencement]))
    const alone = parseLawUnits(pkg([law]))
    const shown = diffLawPackage(withIt, alone)
    expect(shown.lawsOnlyInTo).toEqual([])
    expect(completeness(withIt, alone, shown, isCommencementArticle).breaches).toEqual([])
    // The comparison shows it as removed since 21.11.2026; one that left it out unsaid is caught.
    const silent = { ...shown, units: shown.units.filter((u) => u.article !== 'Inkrafttreten') }
    expect(completeness(withIt, alone, silent, isCommencementArticle).breaches.map((b) => b.unit)).toEqual(['Inkrafttreten'])
    const grown = parseLawUnits(pkg([law, other]))
    const said = diffLawPackage(withIt, grown)
    expect(said.lawsOnlyInTo.map((l) => l.article)).toEqual(['Änderung des Datenschutzgesetzes'])
    const whole = completeness(withIt, grown, said, isCommencementArticle)
    expect(whole.breaches).toEqual([])
    expect(whole.commencementLeftOut).toEqual([{ side: 'from', article: 'Inkrafttreten', units: 1 }])
  })

  it('catches a unit under a heading its own text does not carry', () => {
    const diff = diffLawPackage(from, to)
    expect(headingBreaches(to, diff)).toEqual([])
    expect(headingBreaches(to, { ...diff, units: [{ ...diff.units[0]!, heading: 'Ein fremder Satz' }] }).map((b) => b.kind)).toEqual(['überschrift'])
  })
})

describe('the badges against the baseline (`station.ts --baseline`)', () => {
  it('has a committed baseline that carries every changed unit\'s badge beside the reasons, so a move can be reported', () => {
    const baseline = JSON.parse(readFileSync('scripts/harness/stationBaseline.json', 'utf8')) as { verdicts?: Record<string, string>; reasons?: Record<string, string>; pairs: number }
    expect(Object.keys(baseline.verdicts ?? {}).length).toBeGreaterThan(baseline.pairs)
    for (const badge of Object.values(baseline.verdicts ?? {})) expect(['geändert', 'redaktionell', 'ohne Wortdiff']).toContain(badge)
    expect(Object.keys(baseline.reasons ?? {}).length).toBeGreaterThan(0)
  })

  it('says it cannot compare against a baseline without badges, rather than reporting that none moved', () => {
    expect(badgeMoves(undefined, { '1/ME me>rv — · 2→2': 'geändert' })).toBeNull()
  })

  it('reports a badge that moved either way, and a changed unit that came or went', () => {
    const moves = badgeMoves(
      { a: 'geändert', b: 'redaktionell', c: 'geändert', d: 'ohne Wortdiff' },
      { a: 'redaktionell', b: 'geändert', c: 'geändert', e: 'geändert' },
    )
    expect(moves).toEqual({ moved: [['a', 'geändert', 'redaktionell'], ['b', 'redaktionell', 'geändert']], came: ['e'], went: ['d'] })
  })
})
