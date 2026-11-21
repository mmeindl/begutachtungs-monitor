import { describe, expect, it } from 'vitest'
import { annexParagraphKey } from '../server/utils/annex/annexText'
import { checkAnnexRows, notRunReason } from '../server/utils/annex/gateRows'
import { REASON_NO_ARTICLES, REASON_NOTHING_TO_COMPARE, REASON_NO_SUCH_PARAGRAPH, REASON_TOO_SHORT, REASON_UNREADABLE_DESIGNATION, REASON_UNRESOLVED, type AnnexVerification } from '../server/utils/annex/verdict'
import { comparisonRow as row } from './helpers/builders'
import { MARK_DELETIONS, type AnnexMark } from '../server/utils/annex/annexMark'
import { groupAnnexRows } from '../app/utils/annexGroups'

// ---------------------------------------------------------------------------
// checkAnnexRows — the gate as the response carries it
// ---------------------------------------------------------------------------

const verification = (over: Partial<AnnexVerification> = {}): AnnexVerification => ({
  ran: true,
  reasons: [],
  verdicts: {},
  withheldCauses: {},
  uncheckedReasons: {},
  doubtfulLaws: [],
  judged: 0,
  verified: 0,
  ...over,
})

describe('checkAnnexRows with the table\'s marks (annexMark.ts)', () => {
  const rows = [
    row({ gld: '§ 1.', para: '§ 1.', current: 'alt', proposed: 'neu', segments: [{ type: 'removed', text: 'alt' }, { type: 'inserted', text: 'neu' }] }),
    row({ gld: '§ 2.', para: '§ 2.', current: 'weg', proposed: '', change: 'removed' }),
    row({ gld: '§ 3.', para: '§ 3.', current: '', proposed: 'ganz neu', change: 'inserted' }),
    row({ gld: '§ 4.', para: '§ 4.', current: 'alt', proposed: 'neu' }),
  ]
  const v = verification({
    verdicts: { '#§ 1.': 'verified', '#§ 2.': 'verified', '#§ 3.': 'unchecked', '#§ 4.': 'withheld' },
    uncheckedReasons: { '#§ 3.': REASON_NOTHING_TO_COMPARE },
    withheldCauses: { '#§ 4.': 'notInDraft' },
  })
  const marks = new Map<string, AnnexMark>([
    ['#§ 1.', { kind: 'unconfirmed' }],
    ['#§ 2.', { kind: 'unchecked', reason: MARK_DELETIONS }],
    ['#§ 3.', { kind: 'unconfirmed' }],
    ['#§ 4.', { kind: 'unconfirmed' }],
  ])

  it('carries „nicht bestätigt" as a state of its own, with the § text kept', () => {
    const out = checkAnnexRows(rows, v, marks)
    expect(out.rows[0]).toMatchObject({ check: 'unconfirmed', owesCheck: true, proposed: 'neu', current: 'alt' })
    expect(out.rows[0]!.uncheckedReason).toBeUndefined()
    // A § the gate owed nothing for (new text rule 2 held) owes a check once the table marks it.
    expect(out.rows[2]).toMatchObject({ check: 'unconfirmed', owesCheck: true, proposed: 'ganz neu' })
  })

  it('marks „nicht geprüft" with the table\'s reason on a § the gate verified', () => {
    expect(checkAnnexRows(rows, v, marks).rows[1]).toMatchObject({ check: 'unchecked', owesCheck: true, uncheckedReason: MARK_DELETIONS })
  })

  it('never lets a mark bring back a withheld § or its text', () => {
    expect(checkAnnexRows(rows, v, marks).rows[3]).toMatchObject({ check: 'withheld', proposed: '', withheldCause: 'notInDraft' })
  })

  it('counts each mark per draft, a § in one count at most', () => {
    const out = checkAnnexRows(rows, v, marks)
    expect(out.unconfirmedParagraphs).toBe(2)
    expect(out.uncheckedParagraphs).toBe(1)
    const alone = checkAnnexRows(rows, v)
    expect([alone.unconfirmedParagraphs, alone.uncheckedParagraphs]).toEqual([0, 0])
    expect(alone.rows.map((r) => r.check)).toEqual(['verified', 'verified', 'unchecked', 'withheld'])
  })
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
    expect(out.withheldByCause).toEqual({ standing: 1, alreadyStanding: 1, notInDraft: 1, repealUnproven: 0, repeated: 0 })
    expect(Object.values(out.withheldByCause).reduce((a, b) => a + b, 0)).toBe(out.withheldParagraphs)
    expect(out.rows.map((r) => r.withheldCause)).toEqual(['standing', 'alreadyStanding', 'notInDraft', undefined])
  })

  it('carries the reason onto each unchecked row, and onto no other', () => {
    // The page names it per law under the „nicht geprüft" pill (03.10.2026).
    const rows = [
      row({ gld: '§ 1.', para: '§ 1.', current: 'alt', proposed: 'neu' }),
      row({ gld: '§ 2.', para: '§ 2.', current: 'alt', proposed: 'neu' }),
      row({ gld: null, para: null, current: 'alt', proposed: 'neu' }),
    ]
    const out = checkAnnexRows(rows, verification({
      verdicts: { '#§ 1.': 'unchecked', '#§ 2.': 'verified' },
      uncheckedReasons: { '#§ 1.': REASON_NO_SUCH_PARAGRAPH },
    }))
    expect(out.rows.map((r) => r.uncheckedReason)).toEqual([REASON_NO_SUCH_PARAGRAPH, undefined, REASON_UNREADABLE_DESIGNATION])
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
    // rows are unchanged is folded away behind a count and needs no check.
    // One the draft *inserts* has no standing text, and owes nothing only
    // where rule 2 held its new text against the draft
    // (`REASON_NOTHING_TO_COMPARE`, 20.11.2026).
    const rows = [
      row({ gld: '§ 1.', para: '§ 1.', current: 'alt', proposed: 'neu' }),
      row({ gld: '§ 2.', para: '§ 2.', current: 'gleich', proposed: 'gleich', change: 'unchanged' }),
      row({ gld: '§ 3.', para: '§ 3.', current: '', proposed: 'ganz neu', change: 'inserted' }),
      row({ gld: '§ 4.', para: '§ 4.', current: 'entfällt', proposed: '', change: 'removed' }),
      row({ gld: '§ 5.', para: '§ 5.', current: '§ 5. …', proposed: '§ 5. …', change: 'unchanged', elided: true }),
    ]
    const verdicts = { '#§ 1.': 'unchecked', '#§ 2.': 'unchecked', '#§ 3.': 'unchecked', '#§ 4.': 'unchecked', '#§ 5.': 'unchecked' } as const
    const uncheckedReasons = { '#§ 3.': REASON_NOTHING_TO_COMPARE }
    expect(checkAnnexRows(rows, verification({ verdicts, uncheckedReasons })).uncheckedParagraphs).toBe(2)
    // …and where no rule held the new text, the inserted § is one of them.
    expect(checkAnnexRows(rows, verification({ verdicts, uncheckedReasons: { '#§ 3.': REASON_TOO_SHORT } })).uncheckedParagraphs).toBe(3)
    // A verdict of its own takes a § out of the count whichever way it went.
    expect(checkAnnexRows(rows, verification({ verdicts: { ...verdicts, '#§ 1.': 'verified', '#§ 4.': 'withheld' }, uncheckedReasons })).uncheckedParagraphs).toBe(0)
  })

  it('owes no check for a § with nothing in force to compare — and says so per row (03.10.2026)', () => {
    // „§ 20. (1) bis (5) …" against a new Abs. 6: a change, but its left
    // column is elision alone. The page counted it „nicht geprüft" with its
    // own copy of the rule; the server decides now, once.
    const rows = [
      row({ gld: '§ 1.', para: '§ 1.', current: 'alt', proposed: 'neu' }),
      row({ gld: '§ 20.', para: '§ 20.', current: '§ 20. (1) bis (5) …', proposed: '(6) Neu.' }),
      row({ gld: '§ 3.', para: '§ 3.', current: '', proposed: 'ganz neu', change: 'inserted' }),
    ]
    const out = checkAnnexRows(rows, verification({
      verdicts: { '#§ 1.': 'unchecked', '#§ 20.': 'unchecked', '#§ 3.': 'unchecked' },
      uncheckedReasons: { '#§ 1.': REASON_TOO_SHORT, '#§ 20.': REASON_NOTHING_TO_COMPARE, '#§ 3.': REASON_NOTHING_TO_COMPARE },
    }))
    expect(out.rows.map((r) => r.owesCheck)).toEqual([true, false, false])
    expect(out.uncheckedParagraphs).toBe(1)
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

  it('counts the §§ the page marks „nicht geprüft" and the §§ it withholds as the server does (21.11.2026)', () => {
    // annexPdf.ts records `uncheckedParagraphs + rowsWithoutParagraph` as the
    // §§ that carry the mark; the page counts them itself, row by row
    // (`groupAnnexRows`, `check === 'unchecked' && owesCheck`). The two must
    // be one number, or the record says something the page does not show.
    const rows = [
      row({ law: 'X-Gesetz', gld: '§ 1.', para: '§ 1.', current: 'alt', proposed: 'neu' }),
      row({ law: 'X-Gesetz', gld: '§ 1.', para: '§ 1.', current: 'mehr alt', proposed: 'mehr neu' }),
      row({ law: 'X-Gesetz', gld: '§ 2.', para: '§ 2.', current: 'gleich', proposed: 'gleich', change: 'unchanged' }),
      row({ law: 'X-Gesetz', gld: '§ 3.', para: '§ 3.', current: '', proposed: 'Der Bund entscheidet.', change: 'inserted' }),
      row({ law: 'X-Gesetz', gld: '§ 4.', para: '§ 4.', current: '', proposed: 'Ein ganz neuer Paragraph.', change: 'inserted' }),
      row({ law: 'X-Gesetz', gld: null, para: null, current: 'alt', proposed: 'neu' }),
      row({ law: 'Y-Gesetz', gld: '§ 1.', para: '§ 1.', current: 'alt', proposed: 'neu' }),
      row({ law: 'Y-Gesetz', gld: '§ 2.', para: '§ 2.', current: 'alt', proposed: 'neu' }),
      row({ law: 'Y-Gesetz', gld: '§ 2.', para: '§ 2.', current: 'mehr alt', proposed: 'mehr neu' }),
    ]
    const key = (law: string, p: string) => annexParagraphKey(law, p)
    const out = checkAnnexRows(rows, verification({
      verdicts: { [key('X-Gesetz', '§ 1.')]: 'unchecked', [key('X-Gesetz', '§ 2.')]: 'unchecked', [key('X-Gesetz', '§ 3.')]: 'unchecked', [key('X-Gesetz', '§ 4.')]: 'unchecked', [key('Y-Gesetz', '§ 1.')]: 'unchecked', [key('Y-Gesetz', '§ 2.')]: 'withheld' },
      withheldCauses: { [key('Y-Gesetz', '§ 2.')]: 'notInDraft' },
      uncheckedReasons: { [key('X-Gesetz', '§ 3.')]: REASON_TOO_SHORT, [key('X-Gesetz', '§ 4.')]: REASON_NOTHING_TO_COMPARE },
    }))
    const { groups } = groupAnnexRows(out.rows, { matches: null, hidden: [] })
    const marked = groups.reduce((n, g) => n + g.unchecked, 0)
    expect(marked).toBe(4)
    expect(out.uncheckedParagraphs + out.rowsWithoutParagraph).toBe(marked)
    // …and the pills of §§ not shown add up to the server's withheld count.
    expect(groups.reduce((n, g) => n + g.withheld, 0)).toBe(out.withheldParagraphs)
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
