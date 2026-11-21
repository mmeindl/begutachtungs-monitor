import { describe, expect, it } from 'vitest'
import type { LawUnit } from '../server/utils/lawtext/lawUnits'
import { compareStationPair, cutsToDraft, type StationPairFacts } from '../server/utils/diff/stationPair'

/**
 * The pair decision the page's § comparison and `scripts/harness/station.ts`
 * share (`server/utils/diff/stationPair.ts`, 21.11.2026). Until then the
 * harness held its own copy and skipped a refused pair without counting it;
 * these cases pin what both now get from the one function.
 */

const ins = (p: number, word: string) => `In § ${p} Abs. 1 wird das Wort „a" durch das Wort „${word}" ersetzt.`
const u = (article: string, id: string, text: string, articleNumber: string): LawUnit => ({
  article, articleNumber, id, heading: null, quotedHeadings: [], text, blocks: [], stammnorm: null,
})
const art = (title: string, n: number, paras: [number, string][]) => paras.map(([p, w], i) => u(title, `Z${i + 1}`, ins(p, w), `Artikel ${n}`))

const ESTG = 'Änderung des Einkommensteuergesetzes 1988'
const UMSTG = 'Änderung des Umsatzsteuergesetzes 1994'
const MELDEG = 'Änderung des Meldegesetzes 1991'

const facts = (from: StationPairFacts['from'], to: StationPairFacts['to'], bundled: boolean | null, rvCount = 1): StationPairFacts => ({ from, to, bundled, rvCount })

describe('compareStationPair', () => {
  const draft = art(ESTG, 1, [[3, 'b'], [4, 'c']])
  // A Sammelgesetz: the draft's law and another draft's, in two later texts.
  const rv = [...art(ESTG, 1, [[3, 'b'], [4, 'c']]), ...art(UMSTG, 2, [[6, 'd']])]
  const ausschuss = [...art(ESTG, 1, [[3, 'x'], [4, 'c']]), ...art(UMSTG, 2, [[6, 'e']])]

  it('refuses a text that parses into no §, and says which', () => {
    expect(compareStationPair([], rv, facts('me', 'rv', false), null)).toEqual({ refused: 'unparsed', side: 'from' })
    expect(compareStationPair(rv, [], facts('rv', 'ausschuss', true), draft)).toEqual({ refused: 'unparsed', side: 'to' })
    expect(compareStationPair([], [], facts('rv', 'ausschuss', true), draft)).toEqual({ refused: 'unparsed', side: 'both' })
  })

  it('refuses two texts whose Artikel pair with none of the other', () => {
    const other = [...art('Änderung des Forstgesetzes 1975', 1, [[40, 'b'], [41, 'c']]), ...art(MELDEG, 2, [[90, 'm']])]
    expect(compareStationPair(rv, other, facts('me', 'rv', false), null)).toEqual({ refused: 'unpaired' })
  })

  it('cuts a later pair of a bundled Vorlage to the draft’s laws, and names the rest', () => {
    expect(cutsToDraft({ from: 'rv', bundled: true })).toBe(true)
    const c = compareStationPair(rv, ausschuss, facts('rv', 'ausschuss', true), draft)
    if (c.refused) throw new Error(c.refused)
    expect(new Set(c.diff.units.map((x) => x.article))).toEqual(new Set([ESTG]))
    expect(c.outside).toEqual([{ article: UMSTG, units: 1 }])
  })

  it('cuts nothing where the Vorlage is the draft’s alone, or the draft is unreadable', () => {
    expect(cutsToDraft({ from: 'rv', bundled: false })).toBe(false)
    expect(cutsToDraft({ from: 'me', bundled: true })).toBe(false)
    for (const c of [compareStationPair(rv, ausschuss, facts('rv', 'ausschuss', false), draft), compareStationPair(rv, ausschuss, facts('rv', 'ausschuss', true), [])]) {
      if (c.refused) throw new Error(c.refused)
      expect(c.outside).toEqual([])
      expect(c.diff.units).toHaveLength(3)
    }
  })

  it('keeps the laws a Ressort added to its own Vorlage only on ME→RV, and dropped ones only where the draft went into one Vorlage', () => {
    const grown = [...draft, ...art(MELDEG, 2, [[3, 'm']])]
    const own = compareStationPair(draft, grown, facts('me', 'rv', false, 1), null)
    if (own.refused) throw new Error(own.refused)
    expect(own.options).toEqual({ keepAddedLaws: true, keepDroppedLaws: true, beyondCeiling: true })
    expect(own.diff.addedLaws.map((l) => l.article)).toEqual([MELDEG])
    const split = compareStationPair(draft, grown, facts('me', 'rv', false, 2), null)
    if (split.refused) throw new Error(split.refused)
    expect(split.options.keepDroppedLaws).toBe(false)
    for (const f of [facts('me', 'rv', true), facts('me', 'rv', null), facts('rv', 'ausschuss', false)]) {
      const c = compareStationPair(draft, grown, f, null)
      if (c.refused) throw new Error(c.refused)
      expect(c.options.keepAddedLaws).toBe(false)
      expect(c.diff.lawsOnlyInTo.map((l) => l.article)).toEqual([MELDEG])
    }
  })
})
