import { unchangedRowsNotStanding } from '../server/utils/annex/coverage'
import { describe, expect, it } from 'vitest'
import { MARK_DELETIONS, MARK_DRAFT_UNREAD, MARK_LONG, MARK_UNASSIGNED, MARK_WORDING, OBJECTION_OVER_CONFIRMATION, annexMarks, markOf, type MarkInput } from '../server/utils/annex/annexMark'
import { DRAFT_UNREAD } from '../server/utils/annex/annexStrict'
import type { ComparisonRow } from '../server/utils/annex/comparisonRows'
import { REASON_CUT, REASON_NOTHING_TO_COMPARE, REASON_TOO_SHORT, type AnnexVerification } from '../server/utils/annex/verdict'
import { STRICT_UNCHECKED, type StrictCheck } from '../server/utils/laender/landTguStrict'
import { landUncheckedNote } from '../app/utils/landUnchecked'
import { comparisonRow as row } from './helpers/builders'

const strict = (state: StrictCheck['state'], over: Partial<StrictCheck> = {}): StrictCheck => ({ state, reason: null, notInDraft: [], notShown: [], newWords: state === 'unchecked' ? 0 : 5, draftWords: 5, ...over })
const verified = (over: Partial<MarkInput> = {}): MarkInput => ({ verdict: 'verified', uncheckedReason: null, showsNewText: true, showsChange: true, strict: strict('holds'), oracleConfirmed: false, ...over })

describe('markOf: the table, one line at a time', () => {
  it('leaves a withheld § as the gate says, whatever the checks say', () => {
    expect(markOf(verified({ verdict: 'withheld', strict: strict('differs') }))).toEqual({ kind: 'gate' })
  })

  it('keeps the gate\'s own „nicht geprüft" and its reason where the gate owes a check, even where the oracle confirms', () => {
    expect(markOf(verified({ verdict: 'unchecked', uncheckedReason: REASON_TOO_SHORT, strict: strict('differs'), oracleConfirmed: true }))).toEqual({ kind: 'gate' })
    expect(markOf(verified({ verdict: 'unchecked', uncheckedReason: REASON_CUT, strict: strict('unchecked', { reason: REASON_CUT }) }))).toEqual({ kind: 'gate' })
  })

  it('does not ask about a § that shows no change', () => {
    expect(markOf(verified({ showsNewText: false, showsChange: false, strict: strict('unchecked', { reason: STRICT_UNCHECKED.nothingNew }) }))).toEqual({ kind: 'gate' })
  })

  it('shows a § clean where the draft check holds its new words', () => {
    expect(markOf(verified())).toEqual({ kind: 'gate' })
    // …also a § the gate left unchecked with nothing owed (new text, rule 2 held it).
    expect(markOf(verified({ verdict: 'unchecked', uncheckedReason: REASON_NOTHING_TO_COMPARE }))).toEqual({ kind: 'gate' })
  })

  it('marks „nicht bestätigt" where the draft check objects and the oracle does not confirm — also without a Lesefassung', () => {
    expect(markOf(verified({ strict: strict('differs'), oracleConfirmed: false }))).toEqual({ kind: 'unconfirmed' })
    expect(markOf(verified({ strict: strict('differs'), oracleConfirmed: null }))).toEqual({ kind: 'unconfirmed' })
    expect(markOf(verified({ verdict: 'unchecked', uncheckedReason: REASON_NOTHING_TO_COMPARE, strict: strict('differs') }))).toEqual({ kind: 'unconfirmed' })
  })

  describe('the cell „the oracle confirms, the draft check objects", by its one constant', () => {
    // Words the column shows beyond the draft's wording, and wording of the draft the column lacks.
    const shownBeyond = verified({ strict: strict('differs', { notInDraft: ['anm'] }), oracleConfirmed: true })
    const lacking = verified({ strict: strict('differs', { notShown: ['dabei', 'hat', 'sie'] }), oracleConfirmed: true })
    const both = verified({ strict: strict('differs', { notInDraft: ['anm'], notShown: ['dabei'] }), oracleConfirmed: true })

    it('splits by what the objection is about by default: clean only where it names no wording the column lacks', () => {
      expect(OBJECTION_OVER_CONFIRMATION).toBe('missing')
      expect(markOf(shownBeyond)).toEqual({ kind: 'gate' })
      expect(markOf(lacking)).toEqual({ kind: 'unconfirmed' })
      expect(markOf(both)).toEqual({ kind: 'unconfirmed' })
      // The oracle's word counts only in the cell: without it the objection stands either way.
      expect(markOf({ ...shownBeyond, oracleConfirmed: false })).toEqual({ kind: 'unconfirmed' })
      expect(markOf({ ...shownBeyond, oracleConfirmed: null })).toEqual({ kind: 'unconfirmed' })
    })

    it('lets every confirmation stand under \'clean\'', () => {
      for (const cell of [shownBeyond, lacking, both]) expect(markOf(cell, 'clean')).toEqual({ kind: 'gate' })
    })

    it('never overrules the draft check under \'unconfirmed\'', () => {
      for (const cell of [shownBeyond, lacking, both]) expect(markOf(cell, 'unconfirmed')).toEqual({ kind: 'unconfirmed' })
    })
  })

  it('where the draft check could not run: clean where the oracle confirms, else „nicht geprüft" with the reason in three classes', () => {
    const could = (reason: string | null) => verified({ strict: strict('unchecked', { reason }) })
    expect(markOf({ ...could(STRICT_UNCHECKED.unnamed), oracleConfirmed: true })).toEqual({ kind: 'gate' })
    expect(markOf(could(STRICT_UNCHECKED.unnamed))).toEqual({ kind: 'unchecked', reason: MARK_UNASSIGNED })
    expect(markOf(could(STRICT_UNCHECKED.lawUnnamed))).toEqual({ kind: 'unchecked', reason: MARK_UNASSIGNED })
    expect(markOf(could(`${STRICT_UNCHECKED.quoteRole}„x"`))).toEqual({ kind: 'unchecked', reason: MARK_WORDING })
    expect(markOf(could(STRICT_UNCHECKED.tooLong))).toEqual({ kind: 'unchecked', reason: MARK_LONG })
    expect(markOf(could(DRAFT_UNREAD))).toEqual({ kind: 'unchecked', reason: MARK_DRAFT_UNREAD })
    // No state for the key at all: could not run, never clean on its own.
    expect(markOf(verified({ strict: undefined }))).toEqual({ kind: 'unchecked', reason: MARK_UNASSIGNED })
    expect(markOf(verified({ strict: undefined, oracleConfirmed: true }))).toEqual({ kind: 'gate' })
  })

  it('confirms no deletion by the draft check: only removed text, or held with no new word, is clean only where the oracle confirms', () => {
    const removedOnly = verified({ showsNewText: false, showsChange: true, strict: strict('unchecked', { reason: STRICT_UNCHECKED.nothingNew }) })
    expect(markOf(removedOnly)).toEqual({ kind: 'unchecked', reason: MARK_DELETIONS })
    expect(markOf({ ...removedOnly, oracleConfirmed: true })).toEqual({ kind: 'gate' })
    const heldEmpty = verified({ strict: strict('holds', { newWords: 0 }) })
    expect(markOf(heldEmpty)).toEqual({ kind: 'unchecked', reason: MARK_DELETIONS })
    expect(markOf({ ...heldEmpty, oracleConfirmed: true })).toEqual({ kind: 'gate' })
  })

  it('reads a § that only strikes by what the draft check made of its struck text (22.11.2026)', () => {
    const struck = (over: Partial<NonNullable<StrictCheck['struck']>>) => ({ named: 0, rewritten: 0, repealed: 0, byPosition: 0, notation: 0, ...over })
    const removed = (s: StrictCheck) => verified({ showsNewText: false, strict: s })
    // Every struck word repealed, quoted or rewritten by the draft: clean, without the oracle.
    expect(markOf(removed(strict('holds', { newWords: 0, struck: struck({ repealed: 6 }) })))).toEqual({ kind: 'gate' })
    expect(markOf(verified({ strict: strict('holds', { newWords: 0, struck: struck({ named: 2, notation: 1 }) }) }))).toEqual({ kind: 'gate' })
    // Struck only by a position the draft counts, or nothing but notation: „nicht geprüft" unless the oracle confirms.
    expect(markOf(removed(strict('holds', { newWords: 0, struck: struck({ repealed: 3, byPosition: 6 }) })))).toEqual({ kind: 'unchecked', reason: MARK_DELETIONS })
    expect(markOf(removed(strict('holds', { newWords: 0, struck: struck({ notation: 2 }) })))).toEqual({ kind: 'unchecked', reason: MARK_DELETIONS })
    expect(markOf({ ...removed(strict('holds', { newWords: 0, struck: struck({ byPosition: 6 }) })), oracleConfirmed: true })).toEqual({ kind: 'gate' })
    // Struck text the draft keeps: „nicht bestätigt", whatever the oracle says (22.11.2026: of 27 kept sentences lost from
    // the column that it confirmed against the check, the check was right in every one).
    const kept = removed(strict('differs', { newWords: 0, struckNotInDraft: ['sie', 'ist', 'zuständig'], struck: struck({}) }))
    expect(markOf(kept)).toEqual({ kind: 'unconfirmed' })
    expect(markOf({ ...kept, oracleConfirmed: null })).toEqual({ kind: 'unconfirmed' })
    expect(markOf({ ...kept, oracleConfirmed: true })).toEqual({ kind: 'unconfirmed' })
    expect(markOf({ ...kept, oracleConfirmed: true }, 'unconfirmed')).toEqual({ kind: 'unconfirmed' })
    // The older value of the cell, kept measurable: every confirmation stands.
    expect(markOf({ ...kept, oracleConfirmed: true }, 'clean')).toEqual({ kind: 'gate' })
    // The same at a § that shows new text, where the objection is about struck text alone.
    const alone = verified({ strict: strict('differs', { struckNotInDraft: ['sie', 'ist', 'zuständig'] }), oracleConfirmed: true })
    expect(markOf(alone)).toEqual({ kind: 'unconfirmed' })
    // Struck words beside new ones the oracle vouches for are one replacement („bestimmtenräumen" / „bestimmten Räumen"): its word covers both.
    const replaced = verified({ strict: strict('differs', { notInDraft: ['bestimmten', 'räumen'], struckNotInDraft: ['bestimmtenräumen'] }), oracleConfirmed: true })
    expect(markOf(replaced)).toEqual({ kind: 'gate' })
    expect(markOf({ ...replaced, oracleConfirmed: false })).toEqual({ kind: 'unconfirmed' })
    // An objection to wording the column lacks, at a § that only strikes: judged as at any § — not „nicht geprüft" for
    // its deletions, nor clean on the oracle's word where the rule in force says wording is missing.
    const lacks = removed(strict('differs', { newWords: 0, notShown: ['frist'], struckNotInDraft: ['x'] }))
    expect(markOf(lacks)).toEqual({ kind: 'unconfirmed' })
    expect(markOf({ ...lacks, oracleConfirmed: true })).toEqual({ kind: 'unconfirmed' })
    expect(markOf({ ...lacks, oracleConfirmed: true }, 'clean')).toEqual({ kind: 'gate' })
  })
})

describe('the reasons are the Länder\'s words where the fact is the same', () => {
  it('reads each Bund reason in the Länder\'s line', () => {
    expect(landUncheckedNote(['unassigned'])).toContain(MARK_UNASSIGNED)
    expect(landUncheckedNote(['wording'])).toContain(MARK_WORDING)
    expect(landUncheckedNote(['long'])).toContain(MARK_LONG)
    expect(landUncheckedNote(['draftUnread'])).toContain(MARK_DRAFT_UNREAD)
  })
})

describe('annexMarks: the table over a parsed annex, under the gate\'s keys', () => {
  const verification = (over: Partial<AnnexVerification>): AnnexVerification => ({ ran: true, reasons: [], verdicts: {}, withheldCauses: {}, uncheckedReasons: {}, doubtfulLaws: [], judged: 1, verified: 1, ...over })
  const rows = [
    row({ law: 'G', gld: '§ 1.', para: '§ 1.', current: 'a b c', proposed: 'a b c d e' }),
    row({ law: 'G', gld: '§ 2.', para: '§ 2.', change: 'removed', current: 'f g h', proposed: '' }),
    row({ law: 'G', gld: '§ 3.', para: '§ 3.', change: 'unchanged', current: 'i j', proposed: 'i j' }),
  ]
  const v = verification({ verdicts: { 'G#§ 1.': 'verified', 'G#§ 2.': 'verified', 'G#§ 3.': 'verified' } })

  it('reads new text and change off the rows, and the oracle\'s rows', () => {
    const checks = new Map([['G#§ 1.', strict('differs')], ['G#§ 2.', strict('unchecked', { reason: STRICT_UNCHECKED.nothingNew })], ['G#§ 3.', strict('unchecked', { reason: STRICT_UNCHECKED.nothingNew })]])
    const marks = annexMarks(rows, v, checks, null)
    expect(marks.get('G#§ 1.')).toEqual({ kind: 'unconfirmed' })
    expect(marks.get('G#§ 2.')).toEqual({ kind: 'unchecked', reason: MARK_DELETIONS })
    expect(marks.get('G#§ 3.')).toEqual({ kind: 'gate' })
    const confirmed = annexMarks(rows, v, checks, new Set([rows[0]!, rows[1]!]))
    expect(confirmed.get('G#§ 1.')).toEqual({ kind: 'gate' })
    expect(confirmed.get('G#§ 2.')).toEqual({ kind: 'gate' })
    expect(annexMarks(rows, v, checks, new Set([rows[0]!]), 'unconfirmed').get('G#§ 1.')).toEqual({ kind: 'unconfirmed' })
  })

  it('confirms a § only where every printed row of it is confirmed', () => {
    const two = [
      row({ law: 'G', gld: '§ 4.', para: '§ 4.', paraAfter: '§ 4.', current: 'k l', proposed: 'k l m n' }),
      row({ law: 'G', gld: null, para: '§ 4.', paraAfter: '§ 4a.', change: 'inserted', current: '', proposed: 'o p q' }),
    ]
    const checks = new Map([['G#§ 4.', strict('differs')]])
    const vv = verification({ verdicts: { 'G#§ 4.': 'verified' } })
    expect(annexMarks(two, vv, checks, new Set([two[0]!])).get('G#§ 4.')).toEqual({ kind: 'unconfirmed' })
    expect(annexMarks(two, vv, checks, new Set(two)).get('G#§ 4.')).toEqual({ kind: 'gate' })
  })
})

describe('an unchanged row the standing § does not account for (23.11.2026)', () => {
  const pair = (current: string, change: ComparisonRow['change'] = 'unchanged', elided = false) => ({ kind: 'pair', law: 'G', heading: null, gld: '§ 1.', para: '§ 1.', paraAfter: null, current, proposed: current, change, elided, segments: null, editorial: false }) as unknown as ComparisonRow
  const standing = 'Die Behörde hat den Antrag binnen vier Wochen zu prüfen und das Ergebnis der antragstellenden Person mitzuteilen.'

  it('finds a foreign sentence, and leaves the § its own text', () => {
    expect(unchangedRowsNotStanding([pair('Die Behörde hat den Antrag binnen vier Wochen zu prüfen.')], standing)).toEqual([])
    const foreign = pair('Der Rechnungshof veröffentlicht seinen jährlichen Bericht über sämtliche Förderungen.')
    expect(unchangedRowsNotStanding([foreign], standing)).toEqual([foreign])
  })

  it('needs three missing words: one is a spelling, and a short row moves by a fifth', () => {
    expect(unchangedRowsNotStanding([pair('Die Behörde hat den Antragsteller binnen vier Wochen')], standing)).toEqual([])
  })

  it('asks neither a changed row nor one the annex elides', () => {
    const foreign = 'Der Rechnungshof veröffentlicht seinen jährlichen Bericht über sämtliche Förderungen.'
    expect(unchangedRowsNotStanding([pair(foreign, 'changed'), pair(foreign, 'unchanged', true)], standing)).toEqual([])
  })

  it('costs a § its clean state, even where the oracle confirms it, and never withholds', () => {
    const input = { verdict: 'verified' as const, uncheckedReason: null, showsNewText: true, showsChange: true, strict: undefined, oracleConfirmed: true }
    expect(markOf(input)).toEqual({ kind: 'gate' })
    expect(markOf({ ...input, unchangedNotStanding: true })).toEqual({ kind: 'unconfirmed' })
    expect(markOf({ ...input, verdict: 'withheld', unchangedNotStanding: true })).toEqual({ kind: 'gate' })
    expect(markOf({ ...input, showsNewText: false, showsChange: false, unchangedNotStanding: true })).toEqual({ kind: 'gate' })
  })
})
