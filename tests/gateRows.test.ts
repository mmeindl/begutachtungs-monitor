import { describe, expect, it } from 'vitest'
import { annexParagraphKey } from '../server/utils/annex/annexText'
import { checkAnnexRows, notRunReason } from '../server/utils/annex/gateRows'
import { REASON_NO_ARTICLES, REASON_TOO_SHORT, REASON_UNRESOLVED, type AnnexVerification } from '../server/utils/annex/verdict'
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
  elided: false,
  segments: null,
  editorial: false,
  ...over,
})

// ---------------------------------------------------------------------------
// checkAnnexRows — the gate as the response carries it
// ---------------------------------------------------------------------------

const verification = (over: Partial<AnnexVerification> = {}): AnnexVerification => ({
  ran: true,
  reasons: [],
  verdicts: {},
  withheldCauses: {},
  doubtfulLaws: [],
  judged: 0,
  verified: 0,
  ...over,
})

describe('checkAnnexRows', () => {
  it('empties a withheld row so no client can render it', () => {
    const rows = [row({ gld: '§ 1.', para: '§ 1.', current: 'alt', proposed: 'neu', segments: [{ type: 'equal', text: 'alt' }] })]
    const out = checkAnnexRows(rows, verification({ verdicts: { '#§ 1.': 'withheld' }, withheldCauses: { '#§ 1.': 'alreadyStanding' } }))
    expect(out.rows[0]).toMatchObject({ check: 'withheld', current: '', proposed: '', segments: null, withheldCause: 'alreadyStanding' })
    expect(out.withheldParagraphs).toBe(1)
  })

  it('splits the withheld count by cause, and the split sums to the total', () => {
    // The page prints both numbers in one sentence — "3 Paragraphen werden
    // nicht gezeigt: bei einem …, bei einem …, bei einem …" — so they cannot
    // be allowed to disagree.
    const rows = ['§ 1.', '§ 2.', '§ 3.', '§ 4.'].map((p) => row({ gld: p, para: p, current: 'alt', proposed: 'neu' }))
    const out = checkAnnexRows(rows, verification({
      verdicts: { '#§ 1.': 'withheld', '#§ 2.': 'withheld', '#§ 3.': 'withheld', '#§ 4.': 'verified' },
      withheldCauses: { '#§ 1.': 'standing', '#§ 2.': 'alreadyStanding', '#§ 3.': 'notInDraft' },
    }))
    expect(out.withheldByCause).toEqual({ standing: 1, alreadyStanding: 1, notInDraft: 1 })
    expect(Object.values(out.withheldByCause).reduce((a, b) => a + b, 0)).toBe(out.withheldParagraphs)
    expect(out.rows.map((r) => r.withheldCause)).toEqual(['standing', 'alreadyStanding', 'notInDraft', undefined])
  })

  it('vouches for nothing the check did not name', () => {
    // The shipped mapping was `unchecked.has(key) ? 'unchecked' : 'verified'`,
    // so a § with no verdict — and a whole response from a check that never
    // ran — went out as "geprüft".
    const rows = [row({ gld: '§ 1.', para: '§ 1.', current: 'alt', proposed: 'neu' })]
    const out = checkAnnexRows(rows, verification({ ran: false, verdicts: { '#§ 1.': 'unchecked' } }))
    expect(out.rows[0]!.check).toBe('unchecked')
    expect(checkAnnexRows(rows, verification()).rows[0]!.check).toBe('unchecked')
  })

  it('leaves a row without a § designation unchecked and counts it', () => {
    const rows = [
      row({ gld: null, para: null, current: 'alt', proposed: 'neu' }),
      // Unchanged rows carry no claim the check could vouch for either, but
      // they are not shown as a change, so they are not in the count.
      row({ gld: null, para: null, current: 'gleich', proposed: 'gleich', change: 'unchanged' }),
    ]
    const out = checkAnnexRows(rows, verification())
    expect(out.rows.map((r) => r.check)).toEqual(['unchecked', 'unchecked'])
    expect(out.rowsWithoutParagraph).toBe(1)
  })

  it('leaves an Artikel heading unchecked — it carries no law text', () => {
    const out = checkAnnexRows([row({ kind: 'article', heading: 'Artikel 2' })], verification())
    expect(out.rows[0]!.check).toBe('unchecked')
    expect(out.rowsWithoutParagraph).toBe(0)
  })

  it('counts the stats over the rows it actually sends', () => {
    const rows = [
      row({ gld: '§ 1.', para: '§ 1.', current: 'alt', proposed: 'neu' }),
      row({ gld: '§ 2.', para: '§ 2.', current: 'alt', proposed: 'neu' }),
      row({ gld: '§ 3.', para: '§ 3.', current: 'gleich', proposed: 'gleich', change: 'unchanged' }),
    ]
    const out = checkAnnexRows(rows, verification({ verdicts: { '#§ 1.': 'verified', '#§ 2.': 'withheld', '#§ 3.': 'verified' } }))
    expect(out.stats).toMatchObject({ total: 2, changed: 1, unchanged: 1 })
    expect(out.withheldParagraphs).toBe(1)
    expect(out.uncheckedParagraphs).toBe(0)
  })

  it('counts as unchecked only the §§ that show a change', () => {
    // The page prints this number after "… ließen sich nicht prüfen", so it
    // has to mean "this much of what you see is unvouched-for". A § whose
    // rows are unchanged is folded away behind a count and needs no check;
    // one the draft *inserts* has no standing text to check against, which is
    // the point of it and not a gap.
    const rows = [
      row({ gld: '§ 1.', para: '§ 1.', current: 'alt', proposed: 'neu' }),
      row({ gld: '§ 2.', para: '§ 2.', current: 'gleich', proposed: 'gleich', change: 'unchanged' }),
      row({ gld: '§ 3.', para: '§ 3.', current: '', proposed: 'ganz neu', change: 'inserted' }),
      row({ gld: '§ 4.', para: '§ 4.', current: 'entfällt', proposed: '', change: 'removed' }),
      row({ gld: '§ 5.', para: '§ 5.', current: '§ 5. …', proposed: '§ 5. …', change: 'unchanged', elided: true }),
    ]
    const verdicts = { '#§ 1.': 'unchecked', '#§ 2.': 'unchecked', '#§ 3.': 'unchecked', '#§ 4.': 'unchecked', '#§ 5.': 'unchecked' } as const
    expect(checkAnnexRows(rows, verification({ verdicts })).uncheckedParagraphs).toBe(2)
    // A verdict of its own takes a § out of the count whichever way it went.
    expect(checkAnnexRows(rows, verification({ verdicts: { ...verdicts, '#§ 1.': 'verified', '#§ 4.': 'withheld' } })).uncheckedParagraphs).toBe(0)
  })

  it('carries the verdict of the § a continuation row inherited', () => {
    // Two thirds of the annex's rows open no § of their own; they are judged
    // with the § they belong to and have to be labelled with it.
    const rows = [
      row({ gld: '§ 1.', para: '§ 1.', current: 'erster Absatz', proposed: 'neu' }),
      row({ gld: null, para: '§ 1.', current: 'zweiter Absatz', proposed: 'neu' }),
    ]
    const out = checkAnnexRows(rows, verification({ verdicts: { '#§ 1.': 'withheld' } }))
    expect(out.rows.map((r) => r.check)).toEqual(['withheld', 'withheld'])
    expect(out.rows.every((r) => r.current === '')).toBe(true)
  })

  it('keeps a package’s two § 5 apart', () => {
    const rows = [
      row({ law: 'X-Gesetz', gld: '§ 5.', para: '§ 5.', current: 'alt', proposed: 'neu' }),
      row({ law: 'Y-Gesetz', gld: '§ 5.', para: '§ 5.', current: 'alt', proposed: 'neu' }),
    ]
    const verdicts = { [annexParagraphKey('X-Gesetz', '§ 5.')]: 'verified' as const, [annexParagraphKey('Y-Gesetz', '§ 5.')]: 'withheld' as const }
    const out = checkAnnexRows(rows, verification({ verdicts }))
    expect(out.rows.map((r) => r.check)).toEqual(['verified', 'withheld'])
  })
})

describe('notRunReason', () => {
  it('is null as soon as one § was judged', () => {
    expect(notRunReason(verification({ judged: 1, reasons: [REASON_TOO_SHORT] }))).toBeNull()
  })

  it('joins every reason when nothing was judged', () => {
    expect(notRunReason(verification({ reasons: [REASON_NO_ARTICLES, REASON_UNRESOLVED] }))).toBe(`${REASON_NO_ARTICLES}; ${REASON_UNRESOLVED}`)
  })

  it('is null rather than empty when there is nothing to say', () => {
    expect(notRunReason(verification())).toBeNull()
  })
})
