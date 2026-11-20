import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { diffTokens, isEditorialChange } from '../server/utils/diff/wordDiff'
import { compareKey } from '../server/utils/lawtext/normalize'
import { parseLawUnits, parseLawUnitsFromRis } from '../server/utils/lawtext/lawUnits'
import { MUTATION_KINDS, mutations, type MutationKind } from '../scripts/lib/stationMutations'

// The first fault injection for what the § comparison forgives (20.11.2026,
// `scripts/lib/stationMutations.ts`): a change of substance put into a unit
// has to change the unit key AND stay out of „redaktionell". Without the
// renumbering context, as every caller outside `diffLawUnits` asks.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
// The frozen ME→RV comparison of `tests/lawDiff.test.ts`: 95/ME XXVII from
// RIS XML, 2238 d.B. from Parliament's HTML.
const fixtureUnits = [...parseLawUnitsFromRis(read('./fixtures/ris-begut-95me-xxvii.xml')), ...parseLawUnits(read('./fixtures/parl-rv-2238-xxvii.html'))]

/**
 * Lines of the station corpus of GP XXVIII for the classes the fixture has no
 * place for — it carries no „%", no „<"/">" and no range between two digits.
 */
const corpusLines = [
  // 4/ME Unternehmensgesetzbuch Z 61
  'beträgt der Strafrahmen gegen die Gesellschaft auf bis zu 5 % der jährlichen Umsatzerlöse; § 284 Abs. 1 gilt.',
  // 60/ME Anlage, Z 34
  '18. Hypertonie (> 140/90mmHg), 19. Eiweißausscheidung > 1g/l, 20. Mittelgradige - generalisierte Ödeme,',
  // Budgetbegleitgesetz 2027-2028, an Inkrafttretensbestimmung of its draft
  '(2) § 51 Abs. 1 in der Fassung des Budgetbegleitgesetzes 2027-2028, BGBl. I Nr. xxx/2026, tritt mit dem auf die Kundmachung folgenden Tag in Kraft.',
]

interface Miss {
  kind: MutationKind
  before: string
  after: string
  keyEqual: boolean
  editorial: boolean
}

function missesOver(texts: readonly string[]): { tried: Record<MutationKind, number>; misses: Miss[] } {
  const tried = Object.fromEntries(MUTATION_KINDS.map((k) => [k, 0])) as Record<MutationKind, number>
  const misses: Miss[] = []
  for (const text of texts) {
    for (const m of mutations(text)) {
      tried[m.kind]++
      const keyEqual = compareKey(text) === compareKey(m.text)
      const editorial = isEditorialChange(diffTokens(text, m.text).segments)
      if (keyEqual || editorial) misses.push({ kind: m.kind, before: m.before, after: m.after, keyEqual, editorial })
    }
  }
  return { tried, misses }
}

describe('a change of substance is never forgiven', () => {
  it('over every unit of the frozen fixture', () => {
    const { tried, misses } = missesOver(fixtureUnits.map((u) => u.text))
    // The fixture has a place for these classes (95/ME: „100 000 Euro" for
    // the joined numbers); a class without one would pass by never running.
    for (const k of ['ziffer', 'minus', 'nicht', 'und-oder', 'oder-und', 'zahlen-verbunden'] as const) expect(tried[k], k).toBeGreaterThan(0)
    expect(misses).toEqual([])
  })

  it('over the corpus lines for the classes the fixture lacks', () => {
    const { tried, misses } = missesOver(corpusLines)
    for (const k of ['prozent', 'vergleich', 'bereich-verbunden'] as const) expect(tried[k], k).toBeGreaterThan(0)
    expect(misses).toEqual([])
  })
})
