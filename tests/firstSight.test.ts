import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { draftPathOf } from '../scripts/lib/konsDraftPath'
import {
  fileAfterRound,
  formatFirstSight,
  isFirstSight,
  keptParagraph,
  shownParagraph,
  type FirstSightFile,
  type FirstSightRound,
  type KeptDraft,
} from '../scripts/lib/firstSight'

/**
 * The first-sight record (24.11.2026): the page's text for a draft, kept the
 * first time a round met its law, never rewritten, and scored in every round
 * after. What it must hold is that nothing re-keeps a draft once a fix could
 * have changed its text.
 */
const draft = (record: string, over: Partial<KeptDraft> = {}): KeptDraft => ({
  record, me: `${record}/ME`, bgbl: ['110/2026'], seen: '2026-12-03', commit: 'abcd1234',
  paragraphs: [{ law: null, id: '5', heading: null, text: [['=', 'Text'], ['+', 'neu']] }], ...over,
})
const file = (over: Partial<FirstSightFile> = {}): FirstSightFile => ({ since: '2026-11-25', drafts: [], removed: [], ...over })
const round = (over: Partial<FirstSightRound> = {}): FirstSightRound => ({
  since: '2026-11-25', held: [], unscored: [], scored: draftPathOf([], 0, 0), captured: [], ...over,
})

describe('keptParagraph and shownParagraph', () => {
  it('keep the page text and give it back unchanged', () => {
    const p = {
      id: '5', annexLaw: 'Änderung des ASVG',
      segments: [{ type: 'equal' as const, text: 'Der' }, { type: 'removed' as const, text: 'alte' }, { type: 'inserted' as const, text: 'neue' }],
      headingSegments: [{ type: 'equal' as const, text: 'Titel' }],
    }
    const kept = keptParagraph(p)
    expect(kept).toEqual({ law: 'Änderung des ASVG', id: '5', heading: [['=', 'Titel']], text: [['=', 'Der'], ['-', 'alte'], ['+', 'neue']] })
    expect(shownParagraph(kept)).toEqual(p)
    expect(shownParagraph(keptParagraph({ ...p, annexLaw: null, headingSegments: null }))).toMatchObject({ annexLaw: null, headingSegments: null })
  })
})

describe('isFirstSight', () => {
  it('keeps a draft whose laws were all published on or after the start', () => {
    expect(isFirstSight('A', ['2026-11-25'], file())).toBe(true)
    expect(isFirstSight('A', ['2026-12-01', '2027-01-10'], file())).toBe(true)
  })
  it('does not keep a draft with a law from before: it was scored before', () => {
    expect(isFirstSight('A', ['2026-11-24'], file())).toBe(false)
    expect(isFirstSight('A', ['2026-10-01', '2026-12-01'], file())).toBe(false)
  })
  it('does not keep a draft joined to no law', () => {
    expect(isFirstSight('A', [], file())).toBe(false)
  })
  it('never keeps a draft twice, nor one removed', () => {
    expect(isFirstSight('A', ['2026-12-01'], file({ drafts: [draft('A')] }))).toBe(false)
    expect(isFirstSight('A', ['2026-12-01'], file({ removed: [{ record: 'A', why: 'falsch zugeordnet' }] }))).toBe(false)
  })
})

describe('fileAfterRound', () => {
  it('appends the drafts a round kept', () => {
    const out = fileAfterRound(file({ drafts: [draft('A')] }), round({ held: ['A'], captured: [draft('B')] }))
    expect(out).toEqual({ file: file({ drafts: [draft('A'), draft('B')] }) })
  })
  it('appends once when the builder runs twice on one round', () => {
    const r = round({ captured: [draft('B')] })
    const once = fileAfterRound(file(), r)
    if (!('file' in once)) throw new Error('refused')
    expect(fileAfterRound(once.file, r)).toEqual(once)
  })
  it('refuses a round without the record', () => {
    expect(fileAfterRound(file(), undefined)).toEqual({ refusals: [expect.stringContaining('--erstsicht')] })
  })
  it('refuses a round that read another start', () => {
    expect(fileAfterRound(file(), round({ since: '2026-12-01' }))).toEqual({ refusals: [expect.stringContaining('2026-12-01')] })
  })
  it('refuses to keep a draft again with another text', () => {
    const changed = draft('A', { paragraphs: [{ law: null, id: '5', heading: null, text: [['=', 'Text'], ['+', 'richtig']] }] })
    const out = fileAfterRound(file({ drafts: [draft('A')] }), round({ held: [], captured: [changed] }))
    expect(out).toEqual({ refusals: [expect.stringContaining('kept once')] })
  })
  it('refuses to keep a removed draft again', () => {
    const out = fileAfterRound(file({ removed: [{ record: 'A', why: 'falsch zugeordnet' }] }), round({ held: ['A'], captured: [draft('A')] }))
    expect(out).toEqual({ refusals: [expect.stringContaining('never kept again')] })
  })
  it('refuses a file that changed after the round', () => {
    expect(fileAfterRound(file({ drafts: [draft('A')] }), round())).toEqual({ refusals: [expect.stringContaining('changed after the round')] })
    expect(fileAfterRound(file(), round({ held: ['A'] }))).toEqual({ refusals: [expect.stringContaining('neither keeps nor names removed')] })
  })
  it('lets a draft go only through removed', () => {
    const out = fileAfterRound(file({ removed: [{ record: 'A', why: 'falsch zugeordnet' }] }), round({ held: ['A'] }))
    expect(out).toEqual({ file: file({ removed: [{ record: 'A', why: 'falsch zugeordnet' }] }) })
  })
  it('refuses a kept draft the round could not score', () => {
    expect(fileAfterRound(file({ drafts: [draft('A')] }), round({ held: ['A'], unscored: ['A'] }))).toEqual({ refusals: [expect.stringContaining('A/ME')] })
  })
  it('refuses a file that keeps a draft twice, or keeps and removes it', () => {
    expect('refusals' in fileAfterRound(file({ drafts: [draft('A'), draft('A')] }), round({ held: ['A'] }))).toBe(true)
    expect('refusals' in fileAfterRound(file({ drafts: [draft('A')], removed: [{ record: 'A', why: 'x' }] }), round({ held: ['A'] }))).toBe(true)
  })
})

describe('formatFirstSight', () => {
  it('writes one segment per line and reads back the same', () => {
    const f = file({ drafts: [draft('A', { paragraphs: [{ law: null, id: '5', heading: [['=', 'Ein „Titel"']], text: [['=', 'a\\b'], ['-', 'x'], ['+', 'y']] }] })] })
    const text = formatFirstSight(f)
    expect(text).toContain('["-", "x"]')
    expect(text).toContain('["=", "Ein „Titel\\""]')
    expect(JSON.parse(text)).toEqual(f)
  })
})

describe('scripts/harness/firstSight.json', () => {
  it('is a file the builder can append to', () => {
    const f = JSON.parse(readFileSync('scripts/harness/firstSight.json', 'utf8')) as FirstSightFile
    expect(f.since).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(fileAfterRound(f, round({ since: f.since, held: f.drafts.map((d) => d.record) }))).toEqual({ file: f })
  })
})
