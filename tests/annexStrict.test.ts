import { describe, expect, it } from 'vitest'
import { DRAFT_UNREAD, annexStrictChecks } from '../server/utils/annex/annexStrict'
import { parseRisXml } from '../server/utils/lawtext/risXml'
import { insertedStretches } from '../server/utils/annex/rightColumn'
import { REASON_CUT } from '../server/utils/annex/verdict'
import { STRICT_UNCHECKED, strictTokens } from '../server/utils/laender/landTguStrict'
import type { TextBlock } from '../server/utils/lawtext/lawUnits'
import { comparisonRow as row, draftArticle as article } from './helpers/builders'

/** A block as `parseRisXml` hands it over: the quotation marks folded to straight ones (`normalizeText`). */
const novao = (text: string): TextBlock => ({ kind: 'novao', cls: 'absatz/novao1', text, gld: null })
const abs = (text: string, gld: string | null = null): TextBlock => ({ kind: 'abs', cls: 'absatz/abs', text, gld })

const LAW = 'X-Gesetz'
const DRAFT: TextBlock[] = [
  { kind: 'article', cls: 'ueberschrift/g1', text: 'Artikel 1', gld: null },
  { kind: 'section', cls: 'ueberschrift/g2', text: LAW, gld: null },
  { kind: 'other', cls: 'absatz/promkleinlsatz', text: 'Das X-Gesetz, BGBl. I Nr. 1/2020, wird wie folgt geändert:', gld: null },
  novao('1. § 5 Abs. 2 lautet:'),
  abs('(2) Die Behörde hat binnen 14 Tagen über den Antrag zu entscheiden.'),
  novao('2. Nach § 8 wird folgender § 9 samt Überschrift eingefügt:'),
  abs('"Meldepflicht'),
  abs('(1) Wer eine Anlage betreibt, hat sie der Behörde zu melden."', '§ 9.'),
]
const draft = { articles: [article({ key: LAW, title: LAW })], blocks: DRAFT }
const STANDING_5 = '(1) Die Behörde ist zuständig. (2) Die Behörde hat über den Antrag zu entscheiden.'
const SHOWN_5 = '(1) Die Behörde ist zuständig. (2) Die Behörde hat binnen 14 Tagen über den Antrag zu entscheiden.'

describe('annexStrictChecks: the Bund\'s annex rows against the draft\'s wording', () => {
  it('holds a § whose new words are the payload of its instruction, in order', () => {
    const checks = annexStrictChecks([row({ law: LAW, gld: '§ 5.', para: '§ 5.', current: STANDING_5, proposed: SHOWN_5 })], draft)
    expect(checks.get(`${LAW}#§ 5.`)).toMatchObject({ state: 'holds', notInDraft: [], notShown: [] })
  })

  it('names a single changed figure as a difference — the word the bag rule cannot see', () => {
    const wrong = SHOWN_5.replace('14', '41')
    const check = annexStrictChecks([row({ law: LAW, gld: '§ 5.', para: '§ 5.', current: STANDING_5, proposed: wrong })], draft).get(`${LAW}#§ 5.`)!
    expect(check.state).toBe('differs')
    expect(check.notInDraft).toEqual(['41'])
    expect(check.notShown).toEqual(['14'])
  })

  it('holds a new § printed over several rows, its heading above the designation optional', () => {
    const rows = [
      row({ law: LAW, gld: '§ 9.', para: '§ 9.', change: 'inserted', current: '', proposed: 'Meldepflicht § 9. (1) Wer eine Anlage betreibt,' }),
      row({ law: LAW, gld: null, para: '§ 9.', change: 'inserted', current: '', proposed: 'hat sie der Behörde zu melden.' }),
    ]
    expect(annexStrictChecks(rows, draft).get(`${LAW}#§ 9.`)?.state).toBe('holds')
  })

  it('marks as new exactly what the gate calls new (`insertedStretches`): a removed row beside a new one does not take its words', () => {
    // The ministry moves „über den Antrag" into a new row: the page marks it new there, and so does the check.
    const rows = [
      row({ law: LAW, gld: '§ 5.', para: '§ 5.', current: '(1) Die Behörde ist zuständig.', proposed: '(1) Die Behörde ist zuständig.', change: 'unchanged' }),
      row({ law: LAW, gld: null, para: '§ 5.', current: '(2) Die Behörde hat über den Antrag zu entscheiden.', proposed: '', change: 'removed' }),
      row({ law: LAW, gld: null, para: '§ 5.', current: '', proposed: '(2) Die Behörde hat binnen 14 Tagen über den Antrag zu entscheiden.', change: 'inserted' }),
    ]
    const check = annexStrictChecks(rows, draft).get(`${LAW}#§ 5.`)!
    expect(check.state).toBe('holds')
    expect(check.newWords).toBe(strictTokens(insertedStretches(rows).join(' ')).length)
  })

  it('reads a § the annex prints renumbered under its new number too (`paraAfter`)', () => {
    const blocks = [...DRAFT.slice(0, 3), novao('1. Der bisherige § 4 erhält die Bezeichnung "§ 5".'), novao('2. § 5 Abs. 2 lautet:'), abs('(2) Die Behörde hat binnen 14 Tagen über den Antrag zu entscheiden.')]
    const rows = [row({ law: LAW, gld: '§ 4.', para: '§ 4.', paraAfter: '§ 5.', current: STANDING_5, proposed: SHOWN_5 })]
    expect(annexStrictChecks(rows, { ...draft, blocks }).get(`${LAW}#§ 4.`)).toMatchObject({ state: 'holds' })
  })

  it('gives an unattributed row the one law the draft amends, and refuses it where the draft amends two', () => {
    const rows = [row({ law: null, gld: '§ 5.', para: '§ 5.', current: STANDING_5, proposed: SHOWN_5 })]
    expect(annexStrictChecks(rows, draft).get('#§ 5.')?.state).toBe('holds')
    const two = { ...draft, articles: [article({ key: LAW, title: LAW }), article({ index: 1, number: 'Artikel 2', numeral: '2', key: 'Y-Gesetz', title: 'Y-Gesetz' })] }
    expect(annexStrictChecks(rows, two).get('#§ 5.')).toMatchObject({ state: 'unchecked', reason: STRICT_UNCHECKED.lawUnnamed })
  })

  it('says what it cannot hold, and never passes it', () => {
    const base = { law: LAW, gld: '§ 5.', para: '§ 5.', current: STANDING_5, proposed: SHOWN_5 }
    const reason = (rows: ReturnType<typeof row>[], d = draft) => annexStrictChecks(rows, d).get(`${LAW}#§ 5.`)
    // A changed row past the word diff's ceiling shows nothing marked new.
    expect(reason([row({ ...base, segments: null })])).toMatchObject({ state: 'unchecked', reason: STRICT_UNCHECKED.undiffed })
    // A page the reader could not read runs across the §.
    expect(reason([row({ ...base, cut: true })])).toMatchObject({ state: 'unchecked', reason: REASON_CUT })
    // Nothing new shown: an unchanged § and an elided row carry no word to hold.
    expect(reason([row({ ...base, change: 'unchanged', proposed: STANDING_5 })])).toMatchObject({ state: 'unchecked', reason: STRICT_UNCHECKED.nothingNew })
    expect(reason([row({ ...base, current: '(1) bis (3) …', proposed: '(1) bis (4) …', elided: true })])).toMatchObject({ state: 'unchecked', reason: STRICT_UNCHECKED.nothingNew })
    // A draft whose Gesetzestext could not be read.
    expect(reason([row(base)], { ...draft, blocks: [] })).toMatchObject({ state: 'unchecked', reason: DRAFT_UNREAD })
    // A § no instruction names.
    expect(annexStrictChecks([row({ ...base, gld: '§ 7.', para: '§ 7.' })], draft).get(`${LAW}#§ 7.`)).toMatchObject({ state: 'unchecked', reason: STRICT_UNCHECKED.unnamed })
  })

  it('reads an instruction\'s quotations with the marks RIS prints: which one opens says what is old and what is new', () => {
    // The folded text has one straight mark for both, and no quotation of a Bund draft was read (21.11.2026).
    const blocks = [...DRAFT.slice(0, 3), ...parseRisXml('<absatz typ="novao1">1. In § 6 Abs. 1 wird die Zahl „14“ durch die Zahl „21“ ersetzt.</absatz>')]
    const rows = [row({ law: LAW, gld: '§ 6.', para: '§ 6.', current: '(1) Die Frist beträgt 14 Tage.', proposed: '(1) Die Frist beträgt 21 Tage.' })]
    expect(annexStrictChecks(rows, { ...draft, blocks }).get(`${LAW}#§ 6.`)).toMatchObject({ state: 'holds' })
    const wrong = [row({ law: LAW, gld: '§ 6.', para: '§ 6.', current: '(1) Die Frist beträgt 14 Tage.', proposed: '(1) Die Frist beträgt 28 Tage.' })]
    expect(annexStrictChecks(wrong, { ...draft, blocks }).get(`${LAW}#§ 6.`)).toMatchObject({ state: 'differs', notInDraft: ['28'], notShown: ['21'] })
  })
})
