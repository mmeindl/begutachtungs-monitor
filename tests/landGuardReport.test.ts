import { describe, expect, it } from 'vitest'
import { MIN_TRIES, baselineDocument, floorFailed, floorRows, landBaselineFindings, toLandBaseline } from '../scripts/lib/landGuardReport'

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
