import { describe, expect, it } from 'vitest'
import { LAW_THRESHOLD, PARAGRAPH_THRESHOLD, comparableTokens, coverageOf, coverageOfParagraph, displayedChangeRows, lawCheck, type Coverage } from '../server/utils/annexCheck'
import type { ComparisonRow } from '../server/utils/textComparison'

const row = (over: Partial<ComparisonRow> = {}): ComparisonRow => ({
  kind: 'pair',
  law: null,
  heading: null,
  gld: null,
  para: '§ 5.',
  current: '',
  proposed: '',
  change: 'changed',
  marked: false,
  elided: false,
  segments: null,
  editorial: false,
  ...over,
})

describe('what is not comparable', () => {
  // Three of these were once the ruler blaming the parse for its own gaps.
  it('discounts the annex elision syntax', () => {
    expect(comparableTokens('(1) bis (3) …')).toEqual([])
    expect(comparableTokens('§ 21. bis § 25. …')).toEqual([])
    expect(comparableTokens('1. bis 100. …')).toEqual([])
    // "bis" is the annex's own word, not law text, and was the single most
    // frequent "missing" word in the corpus.
    expect(comparableTokens('(1) bis (3) … Der Rest bleibt.')).toEqual(['der', 'rest', 'bleibt'])
  })

  it("discounts the row's own designation but not a citation", () => {
    expect(comparableTokens('§ 217. Die Behörde entscheidet.')).toEqual(['die', 'behörde', 'entscheidet'])
    // A citation does not end in a period, so its number is law text and stays.
    expect(comparableTokens('Nach § 217 Abs. 2 entscheidet die Behörde.')).toContain('217')
  })

  it("discounts RIS's editorial notes and web-view boilerplate", () => {
    expect(comparableTokens('(Anm.: Abs. 2 aufgehoben durch BGBl. I Nr. 1/2020)')).toEqual([])
    expect(comparableTokens('Beachte für folgende Bestimmung Der Text gilt.')).toEqual(['der', 'text', 'gilt'])
  })
})

describe('coverageOf', () => {
  it('is containment of a deliberate subset, never equality', () => {
    // The annex leaves unchanged text out on purpose, so the standing § is
    // allowed to say more than the column does.
    const c = coverageOf('Die Behörde entscheidet.', 'Die Behörde entscheidet. Ein weiterer Absatz steht daneben.')
    expect(c.ratio).toBe(1)
    expect(c.verified).toBe(true)
  })

  it('is a bag test, so line breaks are not evidence', () => {
    expect(coverageOf('entscheidet die Behörde', 'Die Behörde entscheidet.').ratio).toBe(1)
  })

  it('catches a column that belongs to another provision', () => {
    const c = coverageOf(
      'Die Bundesministerin hat die Kosten des Datenrechenzentrums nach Anhörung der Landesregierung zu tragen.',
      'Ein Antrag auf Genehmigung einer Ausspielung ist schriftlich einzubringen und zu begründen.',
    )
    expect(c.ratio).toBeLessThan(0.5)
    expect(c.verified).toBe(false)
    expect(c.missing).toContain('datenrechenzentrums')
  })

  it('leaves a row with too little prose unjudged rather than scoring it', () => {
    // A heading plus "(1) bis (3) …" shows nothing of the provision on
    // purpose; scoring it measures the Rundschreiben, not the parse.
    const c = coverageOf('§ 5. (1) bis (3) …', 'Ein völlig anderer Text.')
    expect(c.prose).toBe(false)
    expect(c.verified).toBe(true)
  })
})

describe('displayedChangeRows', () => {
  it('takes only the rows whose left column the page shows as a change', () => {
    const rows = [
      row({ change: 'changed', current: 'geänderter Text' }),
      row({ change: 'removed', current: 'entfallener Text' }),
      row({ change: 'unchanged', current: 'gleicher Text' }),
      // An inserted row has no left column to check: the provision it
      // proposes does not exist in the standing law, which is the point.
      row({ change: 'inserted', current: '', proposed: 'neuer Text' }),
      // The annex saying it left text out.
      row({ change: 'changed', current: '(2) bis (4) …', elided: true }),
      row({ kind: 'article', heading: 'Artikel 2', current: '', proposed: '' }),
    ]
    expect(displayedChangeRows(rows).map((r) => r.current)).toEqual(['geänderter Text', 'entfallener Text'])
  })
})

describe('coverageOfParagraph', () => {
  it('judges a § on all of its displayed changes at once', () => {
    // The annex splits one provision over as many rows as the layout needs.
    // A six-word row would drag a sound § below the line on its own.
    const rows = [
      row({ change: 'changed', current: 'Die Behörde entscheidet über den Antrag binnen sechs Wochen nach Einbringung' }),
      row({ change: 'changed', current: 'und hat die Entscheidung zu begründen' }),
    ]
    const standing = 'Die Behörde entscheidet über den Antrag binnen sechs Wochen nach Einbringung und hat die Entscheidung zu begründen.'
    expect(coverageOfParagraph(rows, standing).ratio).toBe(1)
  })

  it('is silent about a § whose rows show no change', () => {
    const c = coverageOfParagraph([row({ change: 'unchanged', current: 'gleich' })], 'irgendein Text')
    expect(c.comparable).toBe(0)
    expect(c.verified).toBe(true)
  })
})

describe('lawCheck', () => {
  const cov = (ratio: number, prose = true): Coverage => ({ ratio, missing: [], comparable: prose ? 40 : 3, prose, verified: !prose || ratio >= PARAGRAPH_THRESHOLD })

  it('passes a law whose §§ hold', () => {
    const check = lawCheck('Änderung des X-Gesetzes', new Map([['§ 1.', cov(1)], ['§ 2.', cov(0.99)]]))
    expect(check.verdict).toBe('verified')
    expect(check.failed).toEqual([])
  })

  it('names the single § that fails without refusing the law', () => {
    const paras = new Map([['§ 1.', cov(1)], ['§ 2.', cov(1)], ['§ 3.', cov(1)], ['§ 4.', cov(0.2)]])
    const check = lawCheck(null, paras)
    expect(check.verdict).toBe('verified')
    expect(check.failed).toEqual(['§ 4.'])
  })

  it('doubts the whole law when the failures come in a cluster', () => {
    // The IVS-Gesetz annex (51/ME) fails this way: the ministry quoted
    // another version, so a third of the §§ miss at once. That is a sentence
    // for the reader — the §§ that verified are still shown.
    const paras = new Map([['§ 1.', cov(0.3)], ['§ 2.', cov(0.4)], ['§ 3.', cov(1)]])
    const check = lawCheck(null, paras)
    expect(check.verdict).toBe('doubtful')
    expect(check.verified / check.judged).toBeLessThan(LAW_THRESHOLD)
    expect(check.failed).toEqual(['§ 1.', '§ 2.'])
  })

  it('does not call one failure out of two a pattern', () => {
    // A share needs a denominator. Calling this law doubtful as a whole told
    // the reader far more than one § of evidence supports.
    const check = lawCheck(null, new Map([['§ 1.', cov(0.2)], ['§ 2.', cov(1)]]))
    expect(check.verdict).toBe('verified')
    expect(check.failed).toEqual(['§ 1.'])
  })

  it('calls a law nobody could judge unchecked, not verified and not refused', () => {
    // Silence is neither a pass nor a failure. A draft creating new law has
    // no Stammnorm to check against, and that is not evidence of anything.
    const check = lawCheck(null, new Map([['§ 1.', cov(1, false)], ['§ 2.', cov(0.1, false)]]))
    expect(check.verdict).toBe('unchecked')
    expect(check.judged).toBe(0)
  })

  it('calls a law with no §§ at all unchecked', () => {
    expect(lawCheck(null, new Map()).verdict).toBe('unchecked')
  })
})
