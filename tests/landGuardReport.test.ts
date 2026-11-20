import { describe, expect, it } from 'vitest'
import { MIN_TRIES, accountFor, accountingFailed, baselineDocument, floorFailed, floorRows, landBaselineFindings, toLandBaseline, unaccountedInstructed, anchorOf, landRecord, reachByLand } from '../scripts/lib/landGuardReport'

/**
 * The verdicts of the Land harness (`scripts/harness/landGuard.ts`), against
 * invented tallies: a floor, a baseline and an accounting show their edge
 * only on a break somebody puts in.
 */

describe('floorRows (--mindestens)', () => {
  it('holds a class with enough tries at or above the floor', () => {
    const [row] = floorRows([{ key: 'R-neu', tried: 100, caught: 95 }], 95)
    expect(row).toMatchObject({ key: 'R-neu', verdict: 'gehalten', rate: 95 })
    expect(floorFailed(floorRows([{ key: 'R-neu', tried: 100, caught: 95 }], 95))).toBe(false)
  })

  it('fails a class with enough tries below the floor', () => {
    const rows = floorRows([{ key: 'Zahl', tried: 652, caught: 611 }], 95)
    expect(rows[0]!.verdict).toBe('unter dem Boden')
    expect(floorFailed(rows)).toBe(true)
  })

  it('never passes a class with fewer than 20 tries in silence: it is „nicht gehalten", not „gehalten"', () => {
    const rows = floorRows([{ key: 'Satz weg', tried: MIN_TRIES - 1, caught: MIN_TRIES - 1 }], 95)
    expect(rows[0]!.verdict).toBe('nicht gehalten')
    // Not a failure of the run — the floor says nothing there, and says so.
    expect(floorFailed(rows)).toBe(false)
  })

  it('a class never tried is „nicht gehalten" with no rate, not a 0 % failure', () => {
    const [row] = floorRows([{ key: 'Wort', tried: 0, caught: 0 }], 95)
    expect(row).toMatchObject({ verdict: 'nicht gehalten', rate: null })
  })

  it('exactly 20 tries are enough to be held', () => {
    expect(floorRows([{ key: 'R-fremd', tried: MIN_TRIES, caught: 18 }], 95)[0]!.verdict).toBe('unter dem Boden')
  })
})

describe('the baseline of withheld §§ (--baseline, --baseline-schreiben)', () => {
  const answered = (withheld: { law: string | null; id: string; fromId?: string; reason?: string }[], shown = 3) =>
    baselineDocument('ooe', 'beantwortet', { available: true, units: Array.from({ length: shown }, () => ({})), withheld })
  const base = toLandBaseline({
    'ooe-2025-1': answered([
      { law: 'Oö. Testgesetz', id: '§ 5', reason: 'notInDraft' },
      { law: 'Oö. Testgesetz', id: '§ 7' },
      { law: null, id: '§ 9', fromId: '§ 8', reason: 'twice' },
    ]),
  }, new Date('2026-11-20T12:00:00Z'))
  const all = () => true

  it('names each withheld § by law, § and cause — a § RIS refused as „leftCheck"', () => {
    expect(base.documents['ooe-2025-1']!.withheld).toEqual([
      'leftCheck · Oö. Testgesetz · § 7',
      'notInDraft · Oö. Testgesetz · § 5',
      'twice · – · § 8 → § 9',
    ])
    expect(base.at).toBe('2026-11-20T12:00:00.000Z')
  })

  it('a run that measures the same has no finding', () => {
    expect(landBaselineFindings(base, structuredClone(base.documents), all)).toEqual([])
  })

  it('fails on every entry that came and every one that went, each named', () => {
    const now = { 'ooe-2025-1': answered([
      { law: 'Oö. Testgesetz', id: '§ 5', reason: 'draftDiffers' },
      { law: 'Oö. Testgesetz', id: '§ 7' },
      { law: null, id: '§ 9', fromId: '§ 8', reason: 'twice' },
    ]) }
    const findings = landBaselineFindings(base, now, all)
    expect(findings).toHaveLength(2)
    expect(findings.some((f) => f.includes('ooe-2025-1') && f.includes('draftDiffers · Oö. Testgesetz · § 5') && f.includes('kam dazu'))).toBe(true)
    expect(findings.some((f) => f.includes('notInDraft · Oö. Testgesetz · § 5') && f.includes('ist weg'))).toBe(true)
  })

  it('a document that answers differently — not reached, no longer available, fewer §§ shown — is a finding', () => {
    expect(landBaselineFindings(base, { 'ooe-2025-1': baselineDocument('ooe', 'Fehler', null) }, all).some((f) => f.includes('beantwortet') && f.includes('Fehler'))).toBe(true)
    const fewer = { 'ooe-2025-1': { ...base.documents['ooe-2025-1']!, shown: 2 } }
    expect(landBaselineFindings(base, fewer, all)).toEqual([expect.stringContaining('gezeigt: 3 → 2')])
  })

  it('a document the baseline does not know, and one it knows that the run in scope lacks, are findings', () => {
    const findings = landBaselineFindings(base, { ...structuredClone(base.documents), 'sbg-1': answered([]) }, all)
    expect(findings).toEqual([expect.stringContaining('sbg-1')])
    expect(landBaselineFindings(base, {}, all)).toEqual([expect.stringContaining('ooe-2025-1')])
  })

  it('a document outside the run (`--land`, `--show`) is not asked of', () => {
    expect(landBaselineFindings(base, {}, (id) => id !== 'ooe-2025-1')).toEqual([])
  })
})

describe('the page accounting: every § compared ends once, shown or withheld', () => {
  const u = (id: string, article: string | null = 'Oö. Testgesetz', fromId: string | null = null) => ({ article, id, fromId })

  it('a comparison whose §§ each end in one list is in balance', () => {
    const a = accountFor([u('§ 1'), u('§ 2'), u('§ 3', 'Oö. Testgesetz', '§ 2a')], [u('§ 1'), u('§ 3', 'Oö. Testgesetz', '§ 2a')], [
      { law: 'Oö. Testgesetz', id: '§ 2', reason: 'notInDraft' },
      { law: 'Oö. Testgesetz', id: '§ 9', reason: 'inserted' },
    ])
    expect(a).toMatchObject({ both: [], neither: [], unknownShown: [] })
    expect(accountingFailed(a)).toBe(false)
  })

  it('fails on a § shown and withheld at once', () => {
    const a = accountFor([u('§ 1')], [u('§ 1')], [{ law: 'Oö. Testgesetz', id: '§ 1', reason: 'draftDiffers' }])
    expect(a.both).toEqual(['Oö. Testgesetz · § 1'])
    expect(accountingFailed(a)).toBe(true)
  })

  it('fails on a § compared and then neither shown nor withheld', () => {
    const a = accountFor([u('§ 1'), u('§ 2')], [u('§ 1')], [])
    expect(a.neither).toEqual(['Oö. Testgesetz · § 2'])
    expect(accountingFailed(a)).toBe(true)
  })

  it('fails on a § shown that was never compared', () => {
    const a = accountFor([u('§ 1')], [u('§ 1'), u('§ 1', 'Oö. Anderes Gesetz')], [])
    expect(a.unknownShown).toEqual(['Oö. Anderes Gesetz · § 1'])
    expect(accountingFailed(a)).toBe(true)
  })

  it('keeps laws apart: § 1 of one law withheld does not account for § 1 of another', () => {
    const a = accountFor([u('§ 1'), u('§ 1', 'Oö. Anderes Gesetz')], [u('§ 1')], [{ law: 'Oö. Testgesetz', id: '§ 1', reason: 'notInDraft' }])
    expect(a.both).toEqual(['Oö. Testgesetz · § 1'])
    expect(a.neither).toEqual(['Oö. Anderes Gesetz · § 1'])
  })
})

describe('the §§ a draft instructs that the comparison neither shows nor withholds', () => {
  it('lists the designations of each law not accounted for, by either number of a renumbered §', () => {
    const named = new Map([['Art. 1', new Set(['§ 1', '§ 2', '§ 5', '§ 11a'])], ['Art. 2', new Set(['§ 3'])]])
    const accounted = new Map([['Art. 1', new Set(['§ 1', '§ 11a', '§ 11d'])], ['Art. 2', new Set(['§ 3'])]])
    expect(unaccountedInstructed(named, accounted)).toEqual([{ law: 'Art. 1', para: '§ 2' }, { law: 'Art. 1', para: '§ 5' }])
  })

  it('a law of the draft the comparison has nothing of is not counted § by §', () => {
    expect(unaccountedInstructed(new Map([['Art. 3', new Set(['§ 1'])]]), new Map())).toEqual([])
  })
})

describe('anchorOf: the § an instruction inserts after, which it does not change', () => {
  it.each([
    ['Nach § 48 wird eingefügt:  „Besondere Bestimmungen', '§ 48'],
    ['Nach § 8a werden folgende §§ 8b bis 8e eingefügt:  „§ 8b', '§ 8a'],
    ['Nach § 139 wird folgende Bestimmung als § 139a eingefügt:', '§ 139'],
    ['Nach § 15 wird folgender § 16 samt Überschrift angefügt:', '§ 15'],
    ['Nach § 82 wird folgender § 83 eingefügt und der bisherige § 83 erhält die Bezeichnung „84“:', '§ 82'],
  ])('%s → %s', (text, anchor) => {
    expect(anchorOf(text)).toBe(anchor)
  })

  it('an instruction that changes the § it names has no anchor', () => {
    expect(anchorOf('Im § 12 wird angefügt:  „(8) § 8 Abs 1')).toBeNull()
    expect(anchorOf('In § 5 Abs. 2 wird nach dem Wort „Gemeinde“ eingefügt:')).toBeNull()
    expect(anchorOf('Die Anlage 9 wird aufgehoben.')).toBeNull()
  })
})

describe('a Land in the record through compareTgu alone (Kärnten)', () => {
  it('counts the documents with a comparison, the §§ shown, and the withheld ones by cause', () => {
    const r = landRecord([
      { available: true, units: [{ change: 'changed' }, { change: 'inserted' }, { change: 'unchanged' }], withheld: [{ law: 'K-X', id: '§ 1', reason: 'wording' }, { law: 'K-X', id: '§ 2' }] },
      { available: false, units: [], withheld: [{ law: 'K-Y', id: '§ 3', reason: 'wording' }, { law: 'K-Y', id: '§ 4', reason: 'gap' }] },
    ])
    expect(r).toEqual({ answered: 2, documents: 1, shownChangedOrNew: 2, shownUnchanged: 1, withheld: 4, withheldBy: { wording: 2, gap: 1, leftCheck: 1 } })
  })

  it('no answer is a record of zeros, not a missing one', () => {
    expect(landRecord([])).toEqual({ answered: 0, documents: 0, shownChangedOrNew: 0, shownUnchanged: 0, withheld: 0, withheldBy: {} })
  })
})

describe('documents requested and reached, per Land', () => {
  it('counts every document once, by where it ended', () => {
    const r = reachByLand([
      { land: 'ooe', reach: 'beantwortet', complete: true },
      { land: 'ooe', reach: 'beantwortet', complete: false },
      { land: 'ooe', reach: 'PDF nicht im Cache', complete: false },
      { land: 'sbg', reach: 'keine Textgegenüberstellung', complete: true },
      { land: 'sbg', reach: 'kein Detail im Cache', complete: true },
      { land: 'sbg', reach: 'Lesen fehlgeschlagen', complete: false },
    ])
    expect(r).toEqual({
      ooe: { requested: 3, answered: 2, incomplete: 1, noDetail: 0, noTgu: 0, pdfMissing: 1, failed: 0 },
      sbg: { requested: 3, answered: 0, incomplete: 0, noDetail: 1, noTgu: 1, pdfMissing: 0, failed: 1 },
    })
  })
})
