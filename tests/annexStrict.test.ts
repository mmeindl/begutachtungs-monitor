import { describe, expect, it } from 'vitest'
import { DRAFT_UNREAD, annexStrictChecks } from '../server/utils/annex/annexStrict'
import { parseRisXml } from '../server/utils/lawtext/risXml'
import { insertedStretches } from '../server/utils/annex/rightColumn'
import { REASON_CUT } from '../server/utils/annex/verdict'
import { STRICT_UNCHECKED, strictTokens } from '../server/utils/laender/landTguStrict'
import type { TextBlock } from '../server/utils/lawtext/lawUnits'
import type { ComparisonRow } from '../server/utils/annex/comparisonRows'
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

  it('lets a placeholder of a Bundesgesetzblatt citation stand for its figure, and nothing else', () => {
    // „BGBl. I Nr. xxx/202x": the number and year of the act the draft will be promulgated as, which neither document knows yet.
    const blocks = [...DRAFT.slice(0, 3), novao('1. Dem § 9 wird folgender Abs. 4 angefügt:'), abs('"(4) § 2 in der Fassung des Bundesgesetzes BGBl. I Nr. xxx/202x tritt mit 1. Jänner 2027 in Kraft."')]
    const shown = (text: string) => [row({ law: LAW, gld: '§ 9.', para: '§ 9.', current: '(3) Alt.', proposed: `(3) Alt. ${text}` })]
    const check = (text: string) => annexStrictChecks(shown(text), { ...draft, blocks }).get(`${LAW}#§ 9.`)!
    expect(check('(4) § 2 in der Fassung des Bundesgesetzes BGBl. I Nr. xx/2026 tritt mit 1. Jänner 2027 in Kraft.').state).toBe('holds')
    // The date the draft does fix is a figure of the text: one wrong is a difference.
    expect(check('(4) § 2 in der Fassung des Bundesgesetzes BGBl. I Nr. xx/2026 tritt mit 1. Jänner 2028 in Kraft.')).toMatchObject({ state: 'differs', notInDraft: ['2028'] })
    // A citation the draft writes out is held as written (TabMG § 9: „BGBl. Nr. 46/2003" against „BGBl. I Nr. 46/2023").
    const cited = [...DRAFT.slice(0, 3), novao('1. Dem § 9 wird folgender Abs. 4 angefügt:'), abs('"(4) Es gilt die Verordnung BGBl. I Nr. 46/2023."')]
    const held = annexStrictChecks(shown('(4) Es gilt die Verordnung BGBl. Nr. 46/2003.'), { ...draft, blocks: cited }).get(`${LAW}#§ 9.`)!
    expect(held).toMatchObject({ state: 'differs', notInDraft: ['2003'], notShown: ['i', '2023'] })
    // A placeholder for a figure of the law's own text is the text („(xx)" for an Absatz).
    const absatz = [...DRAFT.slice(0, 3), novao('1. Dem § 9 wird folgender Abs. xx angefügt:'), abs('"(xx) Die Frist beträgt drei Wochen."')]
    expect(annexStrictChecks(shown('(4) Die Frist beträgt drei Wochen.'), { ...draft, blocks: absatz }).get(`${LAW}#§ 9.`)).toMatchObject({ state: 'differs', notInDraft: ['4'], notShown: ['xx'] })
  })

  it('reads the division headings the annex prints over a new § as standing above it, not as its text', () => {
    // The payload prints the § from its heading on (`draftWording`): „Meldepflicht § 9. (1) …".
    const shown = (proposed: string) => annexStrictChecks([row({ law: LAW, gld: '§ 9.', para: '§ 9.', change: 'inserted', current: '', proposed })], draft).get(`${LAW}#§ 9.`)!
    const body = 'Meldepflicht § 9. (1) Wer eine Anlage betreibt, hat sie der Behörde zu melden.'
    expect(shown(`3. Hauptstück Anlagen 2. Abschnitt Pflichten der Betreiber ${body}`).state).toBe('holds')
    expect(shown(`ABSCHNITT II Pflichten der Betreiber ${body}`).state).toBe('holds')
    // Not a division's designator: text before the § that no instruction writes.
    expect(shown(`Pflichten der Betreiber ${body}`)).toMatchObject({ state: 'differs', notInDraft: ['pflichten', 'der', 'betreiber'] })
    // The § heading under the stack is held as before.
    expect(shown('2. Abschnitt Pflichten der Betreiber Meldepflichten § 9. (1) Wer eine Anlage betreibt, hat sie der Behörde zu melden.').state).toBe('differs')
  })

  it('reads the designations a renumbering gives in words between the two it quotes, and no other range', () => {
    // Vergaberechtsgesetz 2026, BVergG 2018 § 100: „In § 100 erhalten die Abs. 3 bis 6 die Absatzbezeichnungen „(4)" bis „(7)" und nach Abs. 2 wird folgender Abs. 3 eingefügt".
    const blocks = (line: string) => [...DRAFT.slice(0, 3), ...parseRisXml(`<absatz typ="novao1">${line}</absatz><absatz typ="abs">„(3) Neu.“</absatz>`)]
    const A = 'Der Antrag ist schriftlich einzubringen.'
    const B = 'Die Behörde entscheidet binnen einem Monat.'
    const C = 'Gegen den Bescheid ist die Beschwerde zulässig.'
    const rows = [row({ law: LAW, gld: '§ 4.', para: '§ 4.', current: `(3) ${A} (4) ${B} (5) ${C}`, proposed: `(3) Neu. (4) ${A} (5) ${B} (6) ${C}` })]
    const check = (line: string) => annexStrictChecks(rows, { ...draft, blocks: blocks(line) }).get(`${LAW}#§ 4.`)!
    expect(check('1. In § 4 erhalten die Abs. 3 bis 5 die Absatzbezeichnungen „(4)“ bis „(6)“ und nach Abs. 2 wird folgender Abs. 3 eingefügt:').state).toBe('holds')
    // „bis" between two quotations that are no designations given is no range.
    expect(check('1. In § 4 werden die Wörter „(4)“ bis „(6)“ eingefügt und nach Abs. 2 wird folgender Abs. 3 eingefügt:').state).toBe('differs')
  })

  it('holds a designation a renumbering gives only where the column prints one, never for the same figure in the text', () => {
    // „(5)" is the draft's; „binnen [5] Wochen" for „binnen 4 Wochen" is not, though „5" is a designation the line gives (21.11.2026).
    const line = '1. In § 4 erhalten die Abs. 3 bis 5 die Absatzbezeichnungen „(4)“ bis „(6)“ und nach Abs. 2 wird folgender Abs. 3 eingefügt:'
    const blocks = [...DRAFT.slice(0, 3), ...parseRisXml(`<absatz typ="novao1">${line}</absatz><absatz typ="abs">„(3) Neu.“</absatz>`)]
    const check = (from: string, to: string) => {
      const current = `(3) Der Antrag ist schriftlich einzubringen. (4) Die Behörde entscheidet binnen ${from} Wochen. (5) Die Beschwerde ist zulässig.`
      const proposed = `(3) Neu. (4) Der Antrag ist schriftlich einzubringen. (5) Die Behörde entscheidet binnen ${to} Wochen. (6) Die Beschwerde ist zulässig.`
      return annexStrictChecks([row({ law: LAW, gld: '§ 4.', para: '§ 4.', current, proposed })], { ...draft, blocks }).get(`${LAW}#§ 4.`)!
    }
    expect(check('2', '2').state).toBe('holds')
    expect(check('2', '5')).toMatchObject({ state: 'differs', notInDraft: ['5'] })
    // The quoted end of the range alike: „(4)" given as a designation is no figure „4".
    expect(check('2', '4')).toMatchObject({ state: 'differs', notInDraft: ['4'] })
  })

  it('holds a single new figure only at its place: one the payload prints elsewhere is not the draft\'s', () => {
    // „§ 5 Abs. 2 lautet" says nothing of Abs. 1: a „14" there is no figure of the draft, though the payload prints one (21.11.2026).
    const check = (count: string) => annexStrictChecks([row({ law: LAW, gld: '§ 5.', para: '§ 5.', current: `(1) Die Behörde ist in 3 Bezirken zuständig. ${STANDING_5.slice(30)}`, proposed: `(1) Die Behörde ist in ${count} Bezirken zuständig. ${SHOWN_5.slice(30)}` })], draft).get(`${LAW}#§ 5.`)!
    expect(check('3').state).toBe('holds')
    expect(check('14')).toMatchObject({ state: 'differs', notInDraft: ['14'] })
  })

  it('never joins a designation into the word beside it', () => {
    // Leitungsrechte-DÜV § 3: „§ 3. (1)" read as „31", because the payload prints „31. Dezember" and no „3".
    const blocks = [...DRAFT.slice(0, 3), ...parseRisXml('<absatz typ="novao1">1. Der bisherige Text des § 3 erhält die Absatzbezeichnung „(1)“; folgender Abs. 2 wird angefügt:</absatz><absatz typ="abs">„(2) Dies gilt für Zahlungen nach dem 31. Dezember 2024.“</absatz>')]
    const rows = [row({ law: LAW, gld: '§ 3.', para: '§ 3.', current: '§ 3. Diese Verordnung tritt mit 1. Jänner 2019 in Kraft.', proposed: '§ 3. (1) Diese Verordnung tritt mit 1. Jänner 2019 in Kraft. (2) Dies gilt für Zahlungen nach dem 31. Dezember 2024.' })]
    expect(annexStrictChecks(rows, { ...draft, blocks }).get(`${LAW}#§ 3.`)).toMatchObject({ state: 'holds', notInDraft: [], notShown: [] })
  })

  it('holds the headings a payload prints as blocks of their own, and no heading of another law', () => {
    // RIS sets the heading of each new § of a payload, a division's heading and a title as headings of their own,
    // which the draft's reader passes over (GSpG §§ 56b, 56c; TabStG Abschnitt 8a; 21.11.2026).
    const heading = (text: string): TextBlock => ({ kind: 'section', cls: 'ueberschrift/g2', text, gld: null })
    const blocks: TextBlock[] = [
      ...DRAFT.slice(0, 3),
      novao('1. Nach § 9 werden folgende §§ 9a und 9b samt Überschriften eingefügt:'),
      heading('"Aufsicht über die Anlagen'),
      abs('(1) Die Behörde überwacht die Anlagen.', '§ 9a.'),
      heading('Sperre von gemeldeten Anlagen'),
      abs('(1) Die Behörde kann eine Anlage sperren."', '§ 9b.'),
      { kind: 'article', cls: 'ueberschrift/g1', text: 'Artikel 2', gld: null },
      heading('Änderung des Gesetzes über Anlagen'),
      { kind: 'other', cls: 'absatz/promkleinlsatz', text: 'Das Gesetz über Anlagen wird wie folgt geändert:', gld: null },
    ]
    const check = (proposed: string) => annexStrictChecks([row({ law: LAW, gld: '§ 9b.', para: '§ 9b.', change: 'inserted', current: '', proposed })], { ...draft, blocks }).get(`${LAW}#§ 9b.`)!
    expect(check('Sperre von gemeldeten Anlagen § 9b. (1) Die Behörde kann eine Anlage sperren.').state).toBe('holds')
    expect(check('Sperre von gemeldeten Bauten § 9b. (1) Die Behörde kann eine Anlage sperren.')).toMatchObject({ state: 'differs', notInDraft: ['sperre', 'von', 'gemeldeten', 'bauten'] })
    // The heading that names the next Artikel's law stands after the payload, not in it.
    expect(check('Änderung des Gesetzes über Anlagen § 9b. (1) Die Behörde kann eine Anlage sperren.').state).toBe('differs')
  })

  it('takes a lone designation for the draft\'s though a quoted wording carries its figure', () => {
    // Fruchtsaft-VO § 4: „Abs. 2 wird angefügt" makes the text Abs. 1; „(1)" is no part of the quoted „§ 1 Z 8 bis 14".
    const blocks = [...DRAFT.slice(0, 3), ...parseRisXml('<absatz typ="novao1">1. Im § 4 Abs. 1 wird der Ausdruck „§ 1 Z 8 bis 12“ durch den Ausdruck „§ 1 Z 8 bis 14“ ersetzt.</absatz><absatz typ="novao1">2. Dem § 4 wird folgender Abs. 2 angefügt:</absatz><absatz typ="abs">„(2) Für die in § 1 Z 13 genannten Erzeugnisse gilt Abs. 1 sinngemäß.“</absatz>')]
    const rows = [row({ law: LAW, gld: '§ 4.', para: '§ 4.', current: 'Für die in § 1 Z 8 bis 12 genannten Erzeugnisse ist die Klärung zulässig.', proposed: '(1) Für die in § 1 Z 8 bis 14 genannten Erzeugnisse ist die Klärung zulässig. (2) Für die in § 1 Z 13 genannten Erzeugnisse gilt Abs. 1 sinngemäß.' })]
    expect(annexStrictChecks(rows, { ...draft, blocks }).get(`${LAW}#§ 4.`)).toMatchObject({ state: 'holds' })
  })

  it('parts two words the column runs together where the draft prints them side by side, and nothing else', () => {
    // „Lagerbehältermit", „155ElWG", „1und" (21.11.2026): only where a space stands differs — also where both words stand elsewhere in the §.
    const check = (proposed: string) => annexStrictChecks([row({ law: LAW, gld: '§ 5.', para: '§ 5.', current: STANDING_5, proposed })], draft).get(`${LAW}#§ 5.`)!
    expect(check(SHOWN_5.replace('(2) Die Behörde', '(2) Diebehörde')).state).toBe('holds')
    expect(check(SHOWN_5.replace('(2) Die Behörde', '(2) Diebehörden'))).toMatchObject({ state: 'differs', notInDraft: ['diebehörden'] })
    // The draft's side alike: „14Tagen" in a payload that prints „14" and „Tagen" elsewhere too (TabStG § 4: „Februar2026").
    const tail = 'Abs. 14 gilt an Tagen der Ruhe.'
    const glued = [...DRAFT.slice(0, 3), novao('1. § 5 Abs. 2 lautet:'), abs(`(2) Die Behörde hat binnen 14Tagen über den Antrag zu entscheiden. ${tail}`)]
    expect(annexStrictChecks([row({ law: LAW, gld: '§ 5.', para: '§ 5.', current: STANDING_5, proposed: `${SHOWN_5} ${tail}` })], { ...draft, blocks: glued }).get(`${LAW}#§ 5.`)!.state).toBe('holds')
  })

  it('holds a § the draft restates with a lead-in and a closing line RIS sets as an instruction', () => {
    // VersSichG § 19: „Die Organe … mitzuwirken durch" is the lead-in of a list, no heading; the closing sentence carries the instruction's class.
    const blocks: TextBlock[] = [
      ...DRAFT.slice(0, 3),
      novao('1. § 19 lautet:'),
      abs('„ Die Organe der Behörde haben an der Vollziehung des § 18 mitzuwirken durch', '§ 19.'),
      { kind: 'ziff', cls: 'absatz/ziffer', text: '1. Vorbeugungsmaßnahmen und', gld: null },
      { kind: 'ziff', cls: 'absatz/ziffer', text: '2. Anwendung angemessenen Zwangs.', gld: null },
      novao('Zu diesem Zweck dürfen Betriebsräume betreten werden.“'),
    ]
    const full = 'Die Organe der Behörde haben an der Vollziehung des § 18 mitzuwirken durch 1. Vorbeugungsmaßnahmen und 2. Anwendung angemessenen Zwangs. Zu diesem Zweck dürfen Betriebsräume betreten werden.'
    const check = (proposed: string) => annexStrictChecks([row({ law: LAW, gld: '§ 19.', para: '§ 19.', change: 'inserted', current: '', proposed: `§ 19. ${proposed}` })], { ...draft, blocks }).get(`${LAW}#§ 19.`)!
    expect(check(full).state).toBe('holds')
    expect(check(full.replace(' Zu diesem Zweck dürfen Betriebsräume betreten werden.', ''))).toMatchObject({ state: 'differs', notShown: ['zu', 'diesem', 'zweck', 'dürfen', 'betriebsräume', 'betreten', 'werden'] })
    expect(check(full.replace('Die Organe der Behörde haben an der Vollziehung des § 18 mitzuwirken durch ', '')).state).toBe('differs')
  })

  it('reads a word the row\'s diff shows as new as kept, where the left column carries it at that place and the draft writes the rest', () => {
    // Asylgesetz § 3a (22.11.2026): the diff keeps „der Status" and shows the old „oder" as new; read with „oder" kept, every new word is the draft's.
    const blocks = [...DRAFT.slice(0, 3), ...parseRisXml('<absatz typ="novao1">1. In § 3a wird die Wortfolge „der Status des Asylberechtigten“ durch die Wortfolge „die Flüchtlingseigenschaft“ und die Wortfolge „des subsidiär Schutzberechtigten“ durch die Wortfolge „der Status subsidiären Schutzes“ ersetzt.</absatz>')]
    const current = 'Einem Fremden ist von Amts wegen der Status des Asylberechtigten oder des subsidiär Schutzberechtigten zuzuerkennen.'
    const check = (proposed: string) => annexStrictChecks([row({ law: LAW, gld: '§ 3a.', para: '§ 3a.', current, proposed })], { ...draft, blocks }).get(`${LAW}#§ 3a.`)!
    // The struck text of that reading (22.11.2026): the old „oder" the diff struck is the twin kept there, no struck text the draft must name.
    expect(check('Einem Fremden ist von Amts wegen die Flüchtlingseigenschaft oder der Status subsidiären Schutzes zuzuerkennen.')).toMatchObject({ state: 'holds', notInDraft: [], struckNotInDraft: [] })
    // A word the left column carries only across a stretch of kept text is no kept word at that place: „Fremden" stays new, and not the draft's.
    expect(check('Einem Fremden ist von Amts wegen die Flüchtlingseigenschaft Fremden der Status subsidiären Schutzes zuzuerkennen.')).toMatchObject({ state: 'differs', notInDraft: ['fremden'] })
    // A word the left column lacks stays new.
    expect(check('Einem Fremden ist von Amts wegen die Flüchtlingseigenschaft sowie der Status subsidiären Schutzes zuzuerkennen.')).toMatchObject({ state: 'differs', notInDraft: ['sowie'] })
    // Nor the old designation a renumbering replaces, printed beside the new one (Tiroler Naturschutzgesetz § 3: „(11)(10)").
    const renumbering = [...DRAFT.slice(0, 3), ...parseRisXml('<absatz typ="novao1">1. § 3 Abs. 10 entfällt; Abs. 11 erhält die Absatzbezeichnung „(10)“.</absatz>')]
    const renumbered = annexStrictChecks([row({ law: LAW, gld: '§ 3.', para: '§ 3.', current: '(9) Die Behörde ist zuständig. (10) Die Anlage ist zu melden. (11) Die Frist beträgt vier Wochen.', proposed: '(9) Die Behörde ist zuständig. (11)(10) Die Frist beträgt vier Wochen.' })], { ...draft, blocks: renumbering }).get(`${LAW}#§ 3.`)!
    expect(renumbered).toMatchObject({ state: 'differs', notInDraft: ['11'] })
  })

  it('reads the annex\'s elision as it says: its designations are no text, and what it leaves out is not missing', () => {
    // „§ 9 Abs. 3 lautet:" restates the whole Absatz; the annex leaves its unchanged first sentence out.
    const blocks = [...DRAFT.slice(0, 3), novao('1. § 9 Abs. 3 lautet:'), abs('"(3) Die Behörde hat den Antrag zu prüfen. Sie entscheidet binnen 14 Tagen."')]
    const check = (current: string, proposed: string) => annexStrictChecks([row({ law: LAW, gld: '§ 9.', para: '§ 9.', current, proposed })], { ...draft, blocks }).get(`${LAW}#§ 9.`)!
    expect(check('(1) bis (2) … (3) … Sie entscheidet binnen einem Monat.', '(1) bis (2) … (3) … Sie entscheidet binnen 14 Tagen.').state).toBe('holds')
    // How far the elision reaches is the annex's notation: „(1) bis [(3)] …" against „(2)".
    expect(check('(1) bis (2) … (3) … Sie entscheidet binnen einem Monat.', '(1) bis (1a) … (3) … Sie entscheidet binnen 14 Tagen.').state).toBe('holds')
    // Without the mark, the sentence is missing from the column.
    expect(check('(3) Sie entscheidet binnen einem Monat.', '(3) Sie entscheidet binnen 14 Tagen.')).toMatchObject({ state: 'differs', notShown: ['die', 'behörde', 'hat', 'den', 'antrag', 'zu', 'prüfen'] })
    // A figure before a mark is the law's: „binnen [21] …" is no designation.
    expect(check('(3) … Sie entscheidet binnen 14 … Tagen.', '(3) … Sie entscheidet binnen 21 … Tagen.').state).toBe('differs')
  })

  it('reads a mark at the column\'s end as standing only for what follows the last word it prints', () => {
    // GSP-AV § 232 (22.11.2026): „… betragen. (6) …" does not stand for the sentence the column lost before „(6)".
    const blocks = [...DRAFT.slice(0, 3), novao('1. § 9 Abs. 3 lautet:'), abs('"(3) Die Behörde hat den Antrag zu prüfen. Sie entscheidet binnen 14 Tagen."')]
    const check = (current: string, proposed: string) => annexStrictChecks([row({ law: LAW, gld: '§ 9.', para: '§ 9.', current, proposed })], { ...draft, blocks }).get(`${LAW}#§ 9.`)!
    const current = '(3) Die Behörde hat den Antrag zu prüfen. Sie entscheidet binnen einem Monat. (4) bis (6) …'
    expect(check(current, '(3) Die Behörde hat den Antrag zu prüfen. Sie entscheidet binnen 14 Tagen. (4) bis (6) …').state).toBe('holds')
    expect(check(current, '(3) Die Behörde hat den Antrag zu prüfen. (4) bis (6) …')).toMatchObject({ state: 'differs', notShown: ['sie', 'entscheidet', 'binnen', '14', 'tagen'] })
    // Right behind the last word it prints, the mark leaves out what the wording goes on with.
    const two = [...DRAFT.slice(0, 3), novao('1. § 9 Abs. 3 und 4 lauten:'), abs('"(3) Die Behörde hat den Antrag zu prüfen.'), abs('(4) Sie entscheidet binnen 14 Tagen."')]
    expect(annexStrictChecks([row({ law: LAW, gld: '§ 9.', para: '§ 9.', current: '(3) Die Behörde ist zuständig. (4) …', proposed: '(3) Die Behörde hat den Antrag zu prüfen. (4) …' })], { ...draft, blocks: two }).get(`${LAW}#§ 9.`)!.state).toBe('holds')
  })
})

describe('annexStrictChecks: what the right column strikes, the draft strikes (22.11.2026)', () => {
  const blocksWith = (...lines: string[]) => [...DRAFT.slice(0, 3), ...lines.map((l) => novao(l))]
  const STANDING = '(1) Die Behörde ist zuständig. Sie ist an Weisungen nicht gebunden. (2) Die Behörde hat über den Antrag zu entscheiden. (3) Die Frist beträgt vier Wochen.'
  const check = (blocks: TextBlock[], proposed: string, current = STANDING) => annexStrictChecks([row({ law: LAW, gld: '§ 5.', para: '§ 5.', current, proposed })], { ...draft, blocks }).get(`${LAW}#§ 5.`)!

  it('names a sentence the draft keeps that the column strikes, and holds what an instruction strikes', () => {
    // The fault „behaltener Satz gestrichen": the page would show a deletion the draft does not make.
    const lost = STANDING.replace(' Sie ist an Weisungen nicht gebunden.', '')
    expect(check(blocksWith('1. In § 5 Abs. 3 wird das Wort „vier“ durch das Wort „sechs“ ersetzt.'), lost.replace('vier', 'sechs'))).toMatchObject({ state: 'differs', notInDraft: [], notShown: [], struckNotInDraft: ['sie', 'ist', 'an', 'weisungen', 'nicht', 'gebunden'] })
    // Struck by a quotation of the old wording, by repeal of its unit, by a payload rewriting it, by its position.
    expect(check(blocksWith('1. In § 5 Abs. 1 entfällt die Wortfolge „ Sie ist an Weisungen nicht gebunden.“'), lost)).toMatchObject({ state: 'holds', struckNotInDraft: [], struck: { named: 6 } })
    expect(check(blocksWith('1. In § 5 Abs. 1 entfällt der letzte Satz.'), lost)).toMatchObject({ state: 'holds', struck: { byPosition: 6 } })
    expect(check([...blocksWith('1. § 5 Abs. 1 lautet:'), abs('"(1) Die Behörde ist zuständig."')], lost)).toMatchObject({ state: 'holds', struck: { rewritten: 6 } })
    // One sentence struck by position, a second struck with no instruction: more stretches than the draft counts, and the one
    // outside the unit the line names is the one no instruction strikes (22.11.2026: each line its own count, in its own unit).
    const two = lost.replace(' Die Frist beträgt vier Wochen.', '')
    expect(check(blocksWith('1. In § 5 Abs. 1 entfällt der letzte Satz.'), two)).toMatchObject({ state: 'differs', struckNotInDraft: ['die', 'frist', 'beträgt', 'vier', 'wochen'] })
  })

  it('takes no kept sentence of another Absatz for the payload\'s, nor one a position strikes in another unit', () => {
    // Fault injection (22.11.2026): a payload's alignment reached past its Absatz, and a „letzter Satz" of Abs. 2 swallowed one of Abs. 1.
    const lost = STANDING.replace(' Sie ist an Weisungen nicht gebunden.', '')
    const payload = [...blocksWith('1. § 5 Abs. 2 lautet:'), abs('"(2) Die Behörde hat binnen 14 Tagen über den Antrag zu entscheiden."')]
    expect(check(payload, lost.replace('hat über', 'hat binnen 14 Tagen über'))).toMatchObject({ state: 'differs', struckNotInDraft: ['sie', 'ist', 'an', 'weisungen', 'nicht', 'gebunden'] })
    expect(check(blocksWith('1. In § 5 Abs. 2 entfällt der letzte Satz.'), lost).state).toBe('differs')
  })

  it('holds a unit the draft repeals by its designation, shown struck in a row of its own', () => {
    const rows = (struck: string) => [
      row({ law: LAW, gld: '§ 5.', para: '§ 5.', change: 'unchanged', current: '(1) Die Behörde ist zuständig.', proposed: '(1) Die Behörde ist zuständig.' }),
      row({ law: LAW, gld: null, para: '§ 5.', change: 'removed', current: struck, proposed: '' }),
    ]
    const of = (blocks: TextBlock[], struck = '(3) Die Frist beträgt vier Wochen.') => annexStrictChecks(rows(struck), { ...draft, blocks }).get(`${LAW}#§ 5.`)!
    // Until 22.11.2026 such a § was „kein neuer Text" and the check never ran.
    expect(of(blocksWith('1. In § 5 entfällt Abs. 3.'))).toMatchObject({ state: 'holds', newWords: 0, struck: { repealed: 6 } })
    expect(of(blocksWith('1. § 5 Abs. 2 und 3 entfallen.'))).toMatchObject({ state: 'holds', struck: { repealed: 6 } })
    expect(of(blocksWith('1. § 5 samt Überschrift entfällt.'))).toMatchObject({ state: 'holds', struck: { repealed: 6 } })
    // Another Absatz repealed, or a place named, is not this one.
    expect(of(blocksWith('1. In § 5 entfällt Abs. 4.'))).toMatchObject({ state: 'differs', struckNotInDraft: ['3', 'die', 'frist', 'beträgt', 'vier', 'wochen'] })
    expect(of(blocksWith('1. In § 5 Abs. 3 entfällt der Punkt.'))).toMatchObject({ state: 'differs' })
    // A version label the annex prints in the left column is its notation, no struck text.
    expect(of(blocksWith('1. In § 5 entfällt Abs. 3.'), 'Ab 1.9.2025:')).toMatchObject({ state: 'holds', struck: { repealed: 0 } })
  })

  it('holds a § whose „(1)“ the draft removes: the designation struck is the one it names, and no new „(1)“ is asked of the column (BAO § 98, 22.11.2026)', () => {
    const blocks = blocksWith('1. In § 5 entfallen die Absatzbezeichnung „(1)“ sowie Abs. 2.')
    // Until then the quoted „(1)“ was read as a designation the draft gives: the § differed, „1“ missing from the column.
    expect(check(blocks, 'Die Behörde ist zuständig.', '(1) Die Behörde ist zuständig. (2) Die Frist beträgt vier Wochen.')).toMatchObject({ state: 'holds', notShown: [], struckNotInDraft: [], struck: { named: 1, repealed: 6 } })
    // The same figure struck in the text is not that designation.
    expect(check(blocksWith('1. In § 5 entfällt die Absatzbezeichnung „(1)“.'), 'Die Behörde ist in Bezirken zuständig.', '(1) Die Behörde ist in 1 Bezirken zuständig.')).toMatchObject({ state: 'differs', notShown: [], struckNotInDraft: ['1'] })
  })

  it('reads a struck stretch whose twin stands kept inside a repealed unit as the twin the draft strikes', () => {
    // Fremdenpolizeigesetz § 94 (22.11.2026): the word diff keeps the first „Die Behörde" and strikes the second, which the draft keeps.
    const blocks = blocksWith('1. In § 5 entfällt Abs. 1; Abs. 2 erhält die Absatzbezeichnung „(1)“.')
    expect(check(blocks, '(1) Die Behörde entscheidet.', '(1) Die Behörde ist zuständig. (2) Die Behörde entscheidet.')).toMatchObject({ state: 'holds', struckNotInDraft: [] })
    // Not where the kept copy stands outside what the draft strikes.
    expect(check(blocksWith('1. In § 5 entfällt Abs. 3.'), '(1) Die Behörde entscheidet.', '(1) Die Behörde ist zuständig. (2) Die Behörde entscheidet.').state).toBe('differs')
  })

  it('judges the struck text of the reading the check holds: the twin a flipped reading keeps is no struck text', () => {
    // Staatsanwaltschaftsgesetz § 8b (22.11.2026): the diff strikes „kann die" before the old wording and shows it new after the
    // inserted one; read with „kann die" kept, every new word is the draft's, and the struck „kann die" is that reading's kept twin.
    const blocks = blocksWith('1. In § 8b Abs. 2 wird die Wortfolge „Bundesministerin für Justiz“ durch das Wort „Bundesstaatsanwaltschaft“ ersetzt und nach der Wortfolge „internationalen Organisationen“ die Wortfolge „und dem Bundesministerium für Justiz“ eingefügt.')
    const current = '(2) Zur Berichterstattung gegenüber internationalen Organisationen kann die Bundesministerin für Justiz gemäß § 8 Abs. 2 vorgehen.'
    const proposed = '(2) Zur Berichterstattung gegenüber internationalen Organisationen und dem Bundesministerium für Justiz kann die Bundesstaatsanwaltschaft gemäß § 8 Abs. 2 vorgehen.'
    expect(annexStrictChecks([row({ law: LAW, gld: '§ 8b.', para: '§ 8b.', current, proposed })], { ...draft, blocks }).get(`${LAW}#§ 8b.`)).toMatchObject({ state: 'holds', notInDraft: [], struckNotInDraft: [] })
  })

  it('takes a unit an instruction names only inside the parents its address names (22.11.2026)', () => {
    // The review of the struck-text check: „In § 5 Abs. 2 entfällt die Z 3" repealed every Ziffer 3 of the §.
    const current = '(1) Die Behörde hat zu prüfen: 1. die Identität, 2. die Staatsangehörigkeit, 3. den Wohnsitz. (2) Der Antrag hat zu enthalten: 1. den Namen, 2. die Anschrift, 3. die Unterschrift.'
    const lostAbs1 = '(1) Die Behörde hat zu prüfen: 1. die Identität, 2. die Staatsangehörigkeit, (2) Der Antrag hat zu enthalten: 1. den Namen, 2. die Anschrift, 3. die Unterschrift.'
    const lostAbs2 = '(1) Die Behörde hat zu prüfen: 1. die Identität, 2. die Staatsangehörigkeit, 3. den Wohnsitz. (2) Der Antrag hat zu enthalten: 1. den Namen, 2. die Anschrift,'
    for (const line of ['1. In § 5 Abs. 2 entfällt die Z 3.', '1. § 5 Abs. 2 Z 3 entfällt.']) {
      expect(check(blocksWith(line), lostAbs2, current)).toMatchObject({ state: 'holds', struck: { repealed: 3 } })
      expect(check(blocksWith(line), lostAbs1, current)).toMatchObject({ state: 'differs', struckNotInDraft: ['3', 'den', 'wohnsitz'] })
    }
    const rewritten = [...blocksWith('1. In § 5 Abs. 2 lautet die Z 3:'), abs('"3. die eigenhändige Unterschrift."')]
    expect(check(rewritten, lostAbs1.replace('3. die Unterschrift', '3. die eigenhändige Unterschrift'), current)).toMatchObject({ state: 'differs', struckNotInDraft: ['3', 'den', 'wohnsitz'] })
    // A position the draft names in Abs. 2 Z 3 is not the one of Abs. 1 Z 3.
    const sentences = '(1) Es gilt: 1. A gilt. 2. B gilt. 3. C gilt. Cc gilt auch. (2) Ferner gilt: 1. D gilt. 2. E gilt. 3. F gilt. Ff gilt auch.'
    const position = blocksWith('1. In § 5 Abs. 2 Z 3 entfällt der letzte Satz.')
    expect(check(position, sentences.replace(' Ff gilt auch.', ''), sentences)).toMatchObject({ state: 'holds', struck: { byPosition: 3 } })
    expect(check(position, sentences.replace(' Cc gilt auch.', ''), sentences)).toMatchObject({ state: 'differs', struckNotInDraft: ['cc', 'gilt', 'auch'] })
    // A line that lists several §§ gives this § only its own Absätze (EU-JZG § 42b).
    const list = blocksWith('1. § 4 Abs. 3 und § 5 Abs. 2 entfallen.')
    expect(check(list, '(1) Die Behörde ist zuständig. (3) Die Frist beträgt vier Wochen.', '(1) Die Behörde ist zuständig. (2) Die Behörde entscheidet. (3) Die Frist beträgt vier Wochen.')).toMatchObject({ state: 'holds', struck: { repealed: 4 } })
    expect(check(list, '(1) Die Behörde ist zuständig. (2) Die Behörde entscheidet.', '(1) Die Behörde ist zuständig. (2) Die Behörde entscheidet. (3) Die Frist beträgt vier Wochen.')).toMatchObject({ state: 'differs', struckNotInDraft: ['3', 'die', 'frist', 'beträgt', 'vier', 'wochen'] })
  })

  it('repeals no unit by a verb that has an object of its own, and reads „Art." as an address (22.11.2026)', () => {
    // B-VG Art. 11, SchUG § 42: „entfällt die Wortfolge „…““ was read as a repeal of the Absatz the line names as its place.
    const current = '(1) Die Behörde ist zuständig. (2) Die Behörde entscheidet und andere. Sie ist an Weisungen nicht gebunden.'
    const lost = '(1) Die Behörde ist zuständig. (2) Die Behörde entscheidet.'
    expect(check(blocksWith('1. § 5 Abs. 2 entfällt die Wendung „ und andere“.'), lost, current)).toMatchObject({ state: 'differs', struckNotInDraft: ['sie', 'ist', 'an', 'weisungen', 'nicht', 'gebunden'] })
    expect(check(blocksWith('1. § 5 Abs. 2 entfällt.'), '(1) Die Behörde ist zuständig.', current)).toMatchObject({ state: 'holds' })
    const art = (line: string, proposed: string) => annexStrictChecks([row({ law: LAW, gld: 'Art. 11.', para: 'Art. 11.', current: `Artikel 11. ${current}`, proposed: `Artikel 11. ${proposed}` })], { ...draft, blocks: blocksWith(line) }).get(`${LAW}#Art. 11.`)!
    expect(art('1. In Art. 11 Abs. 2 entfällt die Wortfolge „ und andere“.', lost)).toMatchObject({ state: 'differs', struckNotInDraft: ['sie', 'ist', 'an', 'weisungen', 'nicht', 'gebunden'] })
    expect(art('1. Art. 11 Abs. 2 entfällt.', '(1) Die Behörde ist zuständig.')).toMatchObject({ state: 'holds' })
    // RAO § 51: „§ 51 zweiter Satz wird durch folgende Sätze ersetzt" replaces a sentence by position, not the whole §.
    const sentences = '(1) Die Behörde ist zuständig. Die Frist beträgt vier Wochen. (2) Anträge sind schriftlich einzubringen. Mündliche Anträge sind unzulässig. (3) Die Behörde entscheidet. Sie ist an Weisungen nicht gebunden.'
    const replaced = [...blocksWith('1. § 5 zweiter Satz wird durch folgenden Satz ersetzt:'), abs('"Die Frist beträgt sechs Wochen."')]
    expect(check(replaced, '(1) Die Behörde ist zuständig. Die Frist beträgt sechs Wochen. (2) Anträge sind schriftlich einzubringen. Mündliche Anträge sind unzulässig. (3) Die Behörde entscheidet. Sie ist an Weisungen nicht gebunden.', sentences)).toMatchObject({ state: 'holds' })
    expect(check(replaced, '(1) Die Behörde ist zuständig. Die Frist beträgt sechs Wochen. (2) Anträge sind schriftlich einzubringen. (3) Die Behörde entscheidet.', sentences)).toMatchObject({ state: 'differs', struckNotInDraft: ['mündliche', 'anträge', 'sind', 'unzulässig', 'sie', 'ist', 'an', 'weisungen', 'nicht', 'gebunden'] })
    // „§ 5 Abs. 3 und § 5 des Zustellgesetzes entfallen": another law's § is no unit of this one, and Abs. 3 is repealed.
    expect(check(blocksWith('1. § 5 Abs. 3 und § 5 des Zustellgesetzes entfallen.'), '(1) Die Behörde ist zuständig.', '(1) Die Behörde ist zuständig. (3) Die Frist beträgt vier Wochen.')).toMatchObject({ state: 'holds', struck: { repealed: 6 } })
  })

  it('takes no repeal of the § a renumbered § takes the number of for its own (BohrarbV § 19, 22.11.2026)', () => {
    // „§ 18 entfällt mitsamt Überschrift" is the old § 18; the left column prints the old § 19, which becomes § 18.
    const rows = [row({ law: LAW, gld: '§ 19.', para: '§ 19.', paraAfter: '§ 18.', current: '§ 19. (1) Die Behörde ist zuständig. (2) Die Frist beträgt vier Wochen.', proposed: '§ 18. (1) Die Behörde ist zuständig.' })]
    const of = (...lines: string[]) => annexStrictChecks(rows, { ...draft, blocks: blocksWith(...lines) }).get(`${LAW}#§ 19.`)!
    const renumbered = '2. Der bisherige § 19 erhält die Paragraphenbezeichnung „§ 18.“.'
    expect(of('1. § 18 entfällt mitsamt Überschrift.', renumbered)).toMatchObject({ state: 'differs', struckNotInDraft: ['2', 'die', 'frist', 'beträgt', 'vier', 'wochen'] })
    expect(of('1. § 18 entfällt mitsamt Überschrift; die bisherigen §§ 19 und 20 erhalten die Paragraphenbezeichnungen „§ 18.“ und „§ 19.“.')).toMatchObject({ state: 'differs', struckNotInDraft: ['2', 'die', 'frist', 'beträgt', 'vier', 'wochen'] })
    // A line that names the new number as new is this §'s.
    expect(of('1. § 18 entfällt mitsamt Überschrift.', renumbered, '3. Im nunmehrigen § 18 entfällt Abs. 2.')).toMatchObject({ state: 'holds', struck: { repealed: 6 } })
    expect(of('1. § 18 entfällt mitsamt Überschrift.', renumbered, '3. § 19 Abs. 2 entfällt.')).toMatchObject({ state: 'holds', struck: { repealed: 6 } })
  })

  it('ends a list\'s item where its row ends, before the list\'s Schlussteil, and never at a citation (22.11.2026)', () => {
    // The table path sets one row per element: the Schlussteil after the last Ziffer is a row of its own, which the draft keeps.
    const r = (gld: string | null, change: ComparisonRow['change'], current: string) => row({ law: LAW, gld, para: '§ 5.', change, current, proposed: change === 'removed' ? '' : current })
    const rows = (zifferStruck: boolean, schlussStruck: boolean) => [
      r('§ 5.', 'unchanged', '(1) Die Behörde hat'),
      r(null, 'unchanged', '1. die Identität und'),
      r(null, zifferStruck ? 'removed' : 'unchanged', '2. den Wohnsitz'),
      r(null, schlussStruck ? 'removed' : 'unchanged', 'des Antragstellers zu prüfen.'),
      r(null, 'unchanged', '(2) Die Frist beträgt vier Wochen.'),
    ]
    const blocks = blocksWith('1. In § 5 Abs. 1 entfällt die Z 2.')
    expect(annexStrictChecks(rows(true, false), { ...draft, blocks }).get(`${LAW}#§ 5.`)).toMatchObject({ state: 'holds', struck: { repealed: 3 } })
    expect(annexStrictChecks(rows(false, true), { ...draft, blocks }).get(`${LAW}#§ 5.`)).toMatchObject({ state: 'differs', struckNotInDraft: ['des', 'antragstellers', 'zu', 'prüfen'] })
    expect(annexStrictChecks(rows(true, true), { ...draft, blocks }).get(`${LAW}#§ 5.`)).toMatchObject({ state: 'differs', struckNotInDraft: ['des', 'antragstellers', 'zu', 'prüfen'] })
    // SpielzeugV Anlage 2: „BGBl." after a comma is printed like a designation, but opens no Litera.
    const lit = [
      r('§ 5.', 'unchanged', '2. Spielzeug muss auch'),
      r(null, 'removed', 'a) der Chemikalienverordnung, BGBl. II Nr. 81/2000, zuletzt geändert durch BGBl. II Nr. 393/2008,'),
      r(null, 'unchanged', 'b) dem Chemikaliengesetz entsprechen.'),
    ]
    expect(annexStrictChecks(lit, { ...draft, blocks: blocksWith('1. In § 5 Z 2 entfällt lit. a.') }).get(`${LAW}#§ 5.`)).toMatchObject({ state: 'holds', struckNotInDraft: [] })
  })

  it('takes a wording quoted as old only where its line names it, and a piece of a law-wide one only in its own words (22.11.2026)', () => {
    // A wording quoted for Abs. 1 accounted for every place of the § it stood at.
    const twice = '(1) Die Behörde entscheidet nach Anhörung des Beirats. (2) Die Frist beginnt nach Anhörung des Beirats zu laufen.'
    const quoted = blocksWith('1. In § 5 Abs. 1 entfällt die Wortfolge „ nach Anhörung des Beirats“.')
    expect(check(quoted, '(1) Die Behörde entscheidet. (2) Die Frist beginnt nach Anhörung des Beirats zu laufen.', twice)).toMatchObject({ state: 'holds', struck: { named: 4 } })
    expect(check(quoted, '(1) Die Behörde entscheidet. (2) Die Frist beginnt zu laufen.', twice)).toMatchObject({ state: 'differs', struckNotInDraft: ['nach', 'anhörung', 'des', 'beirats'] })
    expect(check(blocksWith('1. In § 5 Abs. 1 entfällt das Wort „nicht“.'), '(1) Die Behörde ist zuständig. (2) Sie ist an Weisungen gebunden.', '(1) Die Behörde ist nicht zuständig. (2) Sie ist an Weisungen nicht gebunden.')).toMatchObject({ state: 'differs', struckNotInDraft: ['nicht'] })
    // A law-wide line: its wording at every place, a piece of it only beside its own words — not „und" of „… Arbeit und Soziales".
    const law = blocksWith('1. Im gesamten Bundesgesetz wird die Wortfolge „Bundesminister für Arbeit und Soziales“ durch die Wortfolge „Bundesministerin für Arbeit“ ersetzt.', '2. In § 5 Abs. 1 wird das Wort „vier“ durch das Wort „sechs“ ersetzt.')
    const current = '(1) Die Frist beträgt vier Wochen. (2) Die Behörde hat den Antrag zu prüfen und zu entscheiden.'
    expect(check(law, '(1) Die Frist beträgt sechs Wochen. (2) Die Behörde hat den Antrag zu prüfen und zu entscheiden.', current)).toMatchObject({ state: 'holds' })
    expect(check(law, '(1) Die Frist beträgt sechs Wochen. (2) Die Behörde hat den Antrag zu prüfen zu entscheiden.', current)).toMatchObject({ state: 'differs', struckNotInDraft: ['und'] })
  })

  it('counts a position a line strikes in its own unit, a heading in the heading, and a sentence written anew only where its wording stands (22.11.2026)', () => {
    // The count of a line for Abs. 3 let a second stretch pass in Abs. 1.
    const sentences = '(1) Satz A gilt. Satz B gilt auch. Satz C gilt weiter. Satz D gilt zuletzt. (2) Die Frist beträgt vier Wochen. (3) Satz E gilt. Satz F gilt zuletzt.'
    const two = blocksWith('1. In § 5 Abs. 1 entfällt der letzte Satz.', '2. In § 5 Abs. 3 lautet der letzte Satz: „Satz G gilt neu.“')
    expect(check(two, '(1) Satz A gilt. Satz B gilt auch. Satz C gilt weiter. (2) Die Frist beträgt vier Wochen. (3) Satz E gilt. Satz G gilt neu.', sentences)).toMatchObject({ state: 'holds' })
    expect(check(two, '(1) Satz A gilt. Satz C gilt weiter. (2) Die Frist beträgt vier Wochen. (3) Satz E gilt. Satz G gilt neu.', sentences).state).toBe('differs')
    // „§ 24 Abs. 2 zweiter Satz lautet:" (BSVG § 24) writes the second sentence anew; its count is no allowance for another one.
    const rewritten = [...blocksWith('1. § 5 Abs. 1 zweiter Satz lautet:'), abs('"Die Frist beträgt sechs Wochen."')]
    const current = '(1) Die Behörde ist zuständig. Die Frist beträgt vier Wochen. Sie ist an Weisungen nicht gebunden. (2) Die Behörde entscheidet.'
    expect(check(rewritten, '(1) Die Behörde ist zuständig. Die Frist beträgt sechs Wochen. Sie ist an Weisungen nicht gebunden. (2) Die Behörde entscheidet.', current)).toMatchObject({ state: 'holds' })
    expect(check(rewritten, '(1) Die Behörde ist zuständig. Die Frist beträgt sechs Wochen. (2) Die Behörde entscheidet.', current)).toMatchObject({ state: 'differs', struckNotInDraft: ['sie', 'ist', 'an', 'weisungen', 'nicht', 'gebunden'] })
    // LDG § 33: a heading line strikes nothing in the body; E-ControlG: a line quoting what it replaces strikes nothing by position.
    expect(check([...blocksWith('1. Die Überschrift zu § 5 lautet:'), abs('"Zuständigkeit"')], '(1) Die Behörde ist zuständig. (2) Die Behörde entscheidet.', '(1) Die Behörde ist zuständig. Sie ist an Weisungen nicht gebunden. (2) Die Behörde entscheidet.').state).toBe('differs')
    expect(check(blocksWith('1. In § 4, § 5 Abs. 2 und der Überschrift des § 6 wird der Ausdruck „Behörde“ jeweils durch den Ausdruck „Stelle“ ersetzt.'), '(1) Die Stelle ist zuständig. (2) Die Stelle entscheidet.', '(1) Die Behörde ist zuständig. Sie ist an Weisungen nicht gebunden. (2) Die Behörde entscheidet.').state).toBe('differs')
  })

  it('takes a payload for what it replaces only: not under a line that only adds, nor the whole § from a unit\'s payload (22.11.2026)', () => {
    const current = '(1) Die Behörde ist zuständig. (2) Die Behörde entscheidet. Sie ist an Weisungen nicht gebunden. (3) Die Frist beträgt vier Wochen.'
    // A payload under „angefügt" replaces nothing (FMABG § 7, PartFörG § 7 under fault injection).
    const added = [...blocksWith('1. Dem § 5 wird folgender Abs. 4 angefügt:'), abs('"(4) Sie ist an Weisungen nicht gebunden."')]
    expect(check(added, '(1) Die Behörde ist zuständig. (2) Die Behörde entscheidet. Sie ist an Weisungen nicht gebunden. (3) Die Frist beträgt vier Wochen. (4) Sie ist an Weisungen nicht gebunden.', current)).toMatchObject({ state: 'holds' })
    expect(check(added, '(1) Die Behörde ist zuständig. (2) Die Behörde entscheidet. (3) Die Frist beträgt vier Wochen. (4) Sie ist an Weisungen nicht gebunden.', current)).toMatchObject({ state: 'differs', struckNotInDraft: ['sie', 'ist', 'an', 'weisungen', 'nicht', 'gebunden'] })
    // RAO § 24: „§ 24 Abs. 1 lautet: § 24. „(1) …“" prints the § from its designation on, and rewrites Abs. 1 only.
    const unit = [...blocksWith('1. § 5 Abs. 1 lautet:'), abs('"(1) Die Stelle ist zuständig."', '§ 5.')]
    expect(check(unit, '(1) Die Stelle ist zuständig. (2) Die Behörde entscheidet. Sie ist an Weisungen nicht gebunden. (3) Die Frist beträgt vier Wochen.', current)).toMatchObject({ state: 'holds' })
    expect(check(unit, '(1) Die Stelle ist zuständig. (2) Die Behörde entscheidet. (3) Die Frist beträgt vier Wochen.', current)).toMatchObject({ state: 'differs', struckNotInDraft: ['sie', 'ist', 'an', 'weisungen', 'nicht', 'gebunden'] })
    // RAO § 23: a wording quoted as new spans no whole sentence struck between two of its words.
    const quote = blocksWith('1. In § 5 Abs. 2 wird das Wort „entscheidet“ durch die Wortfolge „ist zuständig“ ersetzt.')
    expect(check(quote, '(1) Die Behörde ist zuständig. (2) Die Behörde ist zuständig. (3) Die Frist beträgt vier Wochen.', '(1) Die Behörde ist zuständig. (2) Die Behörde ist an Weisungen nicht gebunden. Sie entscheidet zuständig. (3) Die Frist beträgt vier Wochen.').state).toBe('differs')
  })

  it('takes a §\'s old text for moved away only where a line gives the § another number and the column keeps none of it (22.11.2026)', () => {
    const old = 'Die Behörde ist zuständig. Sie ist an Weisungen nicht gebunden. Die Frist beträgt vier Wochen.'
    // AVG § 44f: the § gets another number and a new one takes its place — the annex strikes the old text whole.
    const taken = [...blocksWith('1. § 5 erhält die Paragraphenbezeichnung „§ 6.“ und nach § 4 wird folgender § 5 eingefügt:'), abs('"Wer eine Anlage betreibt, hat sie der Stelle zu melden."', '§ 5.')]
    expect(check(taken, 'Wer eine Anlage betreibt, hat sie der Stelle zu melden.', old)).toMatchObject({ state: 'holds', struckNotInDraft: [] })
    // The same line, and the annex prints the § where it was, without one of its sentences: it did not move away. A kept
    // sentence is six words and more, the gate's floor for a stretch of text; below it a kept run says nothing.
    const stayed = 'Die Behörde ist für die Erteilung der Bewilligung zuständig. Sie ist an Weisungen nicht gebunden. Die Frist beträgt vier Wochen.'
    expect(check(blocksWith('1. § 5 erhält die Paragraphenbezeichnung „§ 6.“.'), stayed.replace(' Sie ist an Weisungen nicht gebunden.', ''), stayed)).toMatchObject({ state: 'differs', struckNotInDraft: ['sie', 'ist', 'an', 'weisungen', 'nicht', 'gebunden'] })
    // APAG § 55: „erhält die Bezeichnung „§ 55. (1)“" gives the §'s text an Absatz designation, and so does „Der bisherige Text
    // des § 5 erhält die Bezeichnung „(1)“" — no renumbering of the §, and a sentence lost from the column is none it moved.
    const whole = `§ 5. (1) ${old} (2) Die Behörde entscheidet.`
    for (const line of ['1. § 5 erhält die Bezeichnung „§ 5. (1)“.', '1. Der bisherige Text des § 5 erhält die Bezeichnung „(1)“.']) {
      const blocks = [...blocksWith(line, '2. Dem § 5 wird folgender Abs. 2 angefügt:'), abs('"(2) Die Behörde entscheidet."')]
      expect(check(blocks, whole, `§ 5. ${old}`).state).toBe('holds')
      expect(check(blocks, whole.replace(' Sie ist an Weisungen nicht gebunden.', ''), `§ 5. ${old}`)).toMatchObject({ state: 'differs', struckNotInDraft: ['sie', 'ist', 'an', 'weisungen', 'nicht', 'gebunden'] })
    }
  })

  it('reads a lone struck designation as notation only where a line gives or removes designations (22.11.2026)', () => {
    // „die Bezeichnung „Bundesminister für Inneres““ names a Ressort, and switched the exception on for a struck „3" of „Z 1 bis 3.".
    const current = '(1) Der Bundesminister für Inneres ist zuständig. (2) Dies gilt für die Fälle des § 4 Abs. 1 Z 1 bis 3. (3) Die Frist beträgt vier Wochen.'
    const ressort = blocksWith('1. In § 5 Abs. 1 wird die Bezeichnung „Bundesminister für Inneres“ durch die Bezeichnung „Bundesministerin für Inneres“ ersetzt.')
    expect(check(ressort, '(1) Der Bundesministerin für Inneres ist zuständig. (2) Dies gilt für die Fälle des § 4 Abs. 1 Z 1 bis. (3) Die Frist beträgt vier Wochen.', current)).toMatchObject({ state: 'differs', struckNotInDraft: ['3'] })
    const quoted = blocksWith('1. In § 5 Abs. 1 wird die Wortfolge „in Abs. 2 bezeichneten“ durch die Wortfolge „in Abs. 2 genannten“ ersetzt.')
    expect(check(quoted, '(1) Die in Abs. 2 genannten Stellen sind zu hören. (2) Dies gilt für die Fälle des § 4 Abs. 1 Z 1 bis. (3) X.', '(1) Die in Abs. 2 bezeichneten Stellen sind zu hören. (2) Dies gilt für die Fälle des § 4 Abs. 1 Z 1 bis 3. (3) X.')).toMatchObject({ state: 'differs', struckNotInDraft: ['3'] })
  })

  it('reads no struck text where the column prints nothing new ahead of the § designation', () => {
    // SPG § 57: the heading printed shorter on the right is no heading struck; a heading replaced is.
    const blocks = blocksWith('1. In § 5 Abs. 3 wird das Wort „vier“ durch das Wort „sechs“ ersetzt.')
    expect(check(blocks, 'Übermittlung § 5. (3) Die Frist beträgt sechs Wochen.', 'Zentrale Informationssammlung; Übermittlung § 5. (3) Die Frist beträgt vier Wochen.')).toMatchObject({ state: 'holds', struckNotInDraft: [] })
    expect(check(blocks, 'Meldung § 5. (3) Die Frist beträgt sechs Wochen.', 'Übermittlung § 5. (3) Die Frist beträgt vier Wochen.').state).toBe('differs')
  })

  it('reads the head zone only off the designation the group opens with, never off a citation of the § in its text (22.11.2026)', () => {
    // AWG 2002 § 28c (table path): the rows print no „§ 28c."; the first „§ 28c" is the citation „des § 28c in der Fassung …",
    // and the struck lead-in of Abs. 3 before it, which no instruction strikes, was taken for the head zone.
    const rows = (cite: string) => [
      row({ law: LAW, gld: '§ 5.', para: '§ 5.', change: 'removed', current: '(3) Bei der Festlegung der Beiträge sind folgende Mindestanforderungen einzuhalten:', proposed: '' }),
      row({ law: LAW, gld: null, para: '§ 5.', change: 'changed', current: `1. Dies gilt nicht für Regime, die bei Inkrafttreten des ${cite} in der Fassung der Novelle bestehen, betreffend Batterien und Fahrzeuge.`, proposed: `1. Dies gilt nicht für Regime, die bei Inkrafttreten des ${cite} in der Fassung der Novelle bestehen, betreffend Fahrzeuge.` }),
    ]
    const blocks = blocksWith('1. Im § 5 Abs. 3 Z 1 entfällt die Wortfolge „ Batterien und“.')
    const struck = ['3', 'bei', 'der', 'festlegung', 'der', 'beiträge', 'sind', 'folgende', 'mindestanforderungen', 'einzuhalten']
    expect(annexStrictChecks(rows('§ 6'), { ...draft, blocks }).get(`${LAW}#§ 5.`)).toMatchObject({ state: 'differs', struckNotInDraft: struck })
    expect(annexStrictChecks(rows('§ 5'), { ...draft, blocks }).get(`${LAW}#§ 5.`)).toMatchObject({ state: 'differs', struckNotInDraft: struck })
  })

  it('lets a line that names its sentences account for those sentences, all of them and nothing beside them (22.11.2026)', () => {
    // A second review of the check: „§ 16 Abs. 4 erster Satz lautet: „(4) …“" (HlSchG) took the whole Absatz, and a kept
    // sentence beside the one written anew passed; a count of two let a kept neighbour pass in its window.
    const current = '(1) Die Probenahme obliegt dem Landeshauptmann. Er wählt die Betriebe nach Risiko aus. Die Ergebnisse sind jährlich zu veröffentlichen. Die Kosten trägt der Bund. (2) Die Behörde entscheidet.'
    const first = [...blocksWith('1. § 5 Abs. 1 erster Satz lautet:'), abs('"(1) Die Durchführung der Probenahme obliegt dem Landeshauptmann hinsichtlich des Kontrollplanes."')]
    const sound = current.replace('Die Probenahme obliegt dem Landeshauptmann.', 'Die Durchführung der Probenahme obliegt dem Landeshauptmann hinsichtlich des Kontrollplanes.')
    expect(check(first, sound, current).state).toBe('holds')
    expect(check(first, sound.replace(' Er wählt die Betriebe nach Risiko aus.', ''), current)).toMatchObject({ state: 'differs', struckNotInDraft: ['er', 'wählt', 'die', 'betriebe', 'nach', 'risiko', 'aus'] })
    const two = [...blocksWith('1. In § 5 Abs. 1 lauten der zweite und dritte Satz:'), abs('"Die Auswahl erfolgt risikobasiert. Die Ergebnisse sind zu veröffentlichen."')]
    const both = current.replace('Er wählt die Betriebe nach Risiko aus. Die Ergebnisse sind jährlich zu veröffentlichen.', 'Die Auswahl erfolgt risikobasiert. Die Ergebnisse sind zu veröffentlichen.')
    expect(check(two, both, current).state).toBe('holds')
    expect(check(two, both.replace(' Die Kosten trägt der Bund.', ''), current)).toMatchObject({ state: 'differs', struckNotInDraft: ['die', 'kosten', 'trägt', 'der', 'bund'] })
    // A sentence written anew with no word of the old one: before, nothing of it was accounted (`rewrittenIn` empty). A date
    // („31. Dezember") ends no sentence.
    const dated = '(1) Die Frist endet am 31. Dezember 2025. Anträge sind schriftlich einzubringen. Sie sind zu begründen. (2) Die Behörde entscheidet.'
    const second = [...blocksWith('1. § 5 Abs. 1 zweiter Satz lautet:'), abs('"Eine Verlängerung um sechs Monate ist zulässig."')]
    expect(check(second, dated.replace('Anträge sind schriftlich einzubringen.', 'Eine Verlängerung um sechs Monate ist zulässig.'), dated)).toMatchObject({ state: 'holds', struck: { byPosition: 4 } })
    // One sentence struck by position that the word diff cuts in two at a kept run is one sentence (TDBG § 43, GrEStG § 16).
    const ruled = '(1) Die Behörde ist zuständig. Die nähere Regelung wird einer Verordnung im Einvernehmen mit dem Bundesminister für Justiz vorbehalten. (2) Die Frist beträgt vier Wochen.'
    const cut = [...blocksWith('1. In § 5 Abs. 1 entfällt der letzte Satz.', '2. Dem § 5 Abs. 1 wird folgender Satz angefügt:'), abs('"Das Einvernehmen mit dem Bundesminister für Justiz ist herzustellen."')]
    const shown = '(1) Die Behörde ist zuständig. Das Einvernehmen mit dem Bundesminister für Justiz ist herzustellen. (2) Die Frist beträgt vier Wochen.'
    expect(check(cut, shown, ruled)).toMatchObject({ state: 'holds', struckNotInDraft: [] })
    expect(check(cut, shown.replace(' (2) Die Frist beträgt vier Wochen.', ''), ruled).state).toBe('differs')
  })

  it('lets a payload account only inside the units its line names (22.11.2026)', () => {
    // A second review of the check: „§ 5a Abs. 1 Z 1 lautet:" paid for the lead-in of Abs. 1 (BlutspenderV, StVG § 17), and
    // „§ 3b Abs. 2 Z 2 lautet:" for Z 3 (AußWV).
    const ziff = (text: string): TextBlock => ({ kind: 'ziff', cls: 'listelem/', text, gld: null })
    const persons = '§ 5. (1) Folgende Personen sind von der Spende auszuschließen: 1. Personen mit Herzerkrankung, 2. Personen mit Fieber.'
    const z1 = [...blocksWith('1. § 5 Abs. 1 Z 1 lautet:'), ziff('"1. Personen, die an einer schweren Herzerkrankung leiden,"')]
    const sound = persons.replace('Personen mit Herzerkrankung', 'Personen, die an einer schweren Herzerkrankung leiden')
    expect(check(z1, sound, persons).state).toBe('holds')
    expect(check(z1, sound.replace(' Folgende Personen sind von der Spende auszuschließen:', ''), persons)).toMatchObject({ state: 'differs', struckNotInDraft: ['folgende', 'personen', 'sind', 'von', 'der', 'spende', 'auszuschlieflen'] })
    const fibres = '§ 5. (1) Für Messungen gilt der 5. Abschnitt. (2) Die Fasern sind zu zählen: 1. mit dem Lichtmikroskop oder 2. mit dem Rasterelektronenmikroskop oder 3. mit einem Gerät der Klasse B. (3) Die Behörde prüft.'
    const shown = '§ 5. (1) Für Messungen gilt der 5. Abschnitt. (2) Die Fasern sind zu zählen: 1. durch Elektronenmikroskopie oder 2. mit einem anderen Verfahren. (3) Die Behörde prüft.'
    const payload = [ziff('"1. durch Elektronenmikroskopie oder'), ziff('2. mit einem anderen Verfahren."')]
    expect(check([...blocksWith('1. In § 5 Abs. 2 werden Z 1 bis 3 durch folgende Z 1 und 2 ersetzt:'), ...payload], shown, fibres).state).toBe('holds')
    expect(check([...blocksWith('1. In § 5 Abs. 2 werden Z 1 und 2 durch folgende Z 1 und 2 ersetzt:'), ...payload], shown, fibres)).toMatchObject({ state: 'differs', struckNotInDraft: ['3', 'mit', 'gerät', 'der', 'klasse', 'b'] })
    // A figure inside a citation („§ 1.22.") opens no Ziffer that would end the one the payload writes.
    const board = '§ 5. 1. An Bord muss sich ein Abdruck der Verordnung befinden. Im Donauraum betrifft dies auch die Anordnungen gemäß § 1.22. 2. Im Donauraum muss das Handbuch mitgeführt werden.'
    const aboard = [...blocksWith('1. § 5 Z 1 lautet:'), ziff('"1. An Bord muss sich ein aktueller Abdruck der Verordnung befinden."')]
    expect(check(aboard, '§ 5. 1. An Bord muss sich ein aktueller Abdruck der Verordnung befinden. 2. Im Donauraum muss das Handbuch mitgeführt werden.', board)).toMatchObject({ state: 'holds', struckNotInDraft: [] })
    // The table path drops an elided row: a row that opens a lower Ziffer than the list's last stands in an Absatz the column
    // does not print (StVG § 17: Abs. 2 Z 2 read as Abs. 1's), and the wording the line quotes for it stands in its place.
    const r = (gld: string | null, change: ComparisonRow['change'], current: string, proposed = current) => row({ law: LAW, gld, para: '§ 5.', change, current, proposed })
    const rows = [
      r('§ 5.', 'unchanged', '(1) Für Entscheidungen gelten die folgenden Bestimmungen:'),
      r(null, 'unchanged', '1. Das Gericht hat eine Äußerung einzuholen.'),
      r(null, 'unchanged', '3. Die Beschwerde hat aufschiebende Wirkung.'),
      r(null, 'unchanged', '(2) …', '(2) …'),
      r(null, 'changed', '2. im Verfahren die §§ 1 bis 8, 51 Abs. 7, 52 und 55 VStG,', '2. im Verfahren die §§ 1 bis 8, 52 und 55 VStG,'),
    ]
    expect(annexStrictChecks(rows, { ...draft, blocks: blocksWith('1. In § 5 Abs. 2 Z 2 entfällt die Wortfolge „51 Abs. 7,“.') }).get(`${LAW}#§ 5.`)).toMatchObject({ state: 'holds', struck: { named: 3 } })
  })

  it('takes a new § printed under a number another § had for nothing of that one (22.11.2026)', () => {
    // A second review of the check: „§§ 5 bis 7 … durch folgende §§ 7 bis 9 ersetzt:" printed a new § 9, and its payload
    // took every struck word of the old § 9, which the draft keeps as § 16 (IVS-G; HSG-WirtschaftsVO § 18 alike).
    const old = 'Die Anbieter haften nach den Bestimmungen des bürgerlichen Rechts.'
    const rows = (struck: boolean) => [
      row({ law: LAW, gld: '§ 9.', para: '§ 9.', paraAfter: '§ 9.', change: 'inserted', current: '', proposed: '§ 9. Die Daten sind über den Zugangspunkt bereitzustellen.' }),
      row({ law: LAW, gld: '§ 9.', para: '§ 9.', paraAfter: '§ 16.', current: old, proposed: struck ? '§ 16.' : `§ 16. ${old}` }),
    ]
    const replaced = (line: string) => ({ ...draft, blocks: [...blocksWith(line), abs('"§ 7. Die Behörde ist zuständig.'), abs('§ 8. Die Frist beträgt vier Wochen.'), abs('§ 9. Die Daten sind über den Zugangspunkt bereitzustellen."'), novao('2. Der bisherige § 9 wird zu § 16.')] })
    const others = replaced('1. Die bisherigen §§ 5 bis 7 werden durch folgende §§ 7 bis 9 ersetzt:')
    expect(annexStrictChecks(rows(false), others).get(`${LAW}#§ 9.`)?.state).toBe('holds')
    expect(annexStrictChecks(rows(true), others).get(`${LAW}#§ 9.`)).toMatchObject({ state: 'differs', struckNotInDraft: ['die', 'anbieter', 'haften', 'nach', 'den', 'bestimmungen', 'des', 'bürgerlichen', 'rechts'] })
    // A line that writes this § anew rewrites it whole.
    expect(annexStrictChecks(rows(true), replaced('1. Die bisherigen §§ 5 bis 9 werden durch folgende §§ 7 bis 9 ersetzt:')).get(`${LAW}#§ 9.`)?.state).toBe('holds')
  })

  it('lets a heading line strike only in the heading, in a § without Absätze too (22.11.2026)', () => {
    // A second review of the check: with no Absatz printed, „Die Überschrift zu § 52 lautet:" paid for a sentence of the body
    // (SchifffahrtsVO § 52; AVG § 53b on the table path, its heading a row of its own).
    const heading = [...blocksWith('1. Die Überschrift zu § 5 lautet:'), abs('"Zuständigkeit der Behörde"')]
    const body = 'Die Behörde ist zuständig. Sie ist an Weisungen nicht gebunden.'
    expect(check(heading, `Zuständigkeit der Behörde § 5. ${body}`, `Zuständigkeit § 5. ${body}`).state).toBe('holds')
    expect(check(heading, 'Zuständigkeit der Behörde § 5. Die Behörde ist zuständig.', `Zuständigkeit § 5. ${body}`)).toMatchObject({ state: 'differs', struckNotInDraft: ['sie', 'ist', 'an', 'weisungen', 'nicht', 'gebunden'] })
    const r = (gld: string | null, current: string, proposed: string) => row({ law: LAW, gld, para: '§ 5.', current, proposed, change: current === proposed ? 'unchanged' : 'changed' })
    expect(annexStrictChecks([r('§ 5.', 'Zuständigkeit', 'Zuständigkeit der Behörde'), r(null, body, body)], { ...draft, blocks: heading }).get(`${LAW}#§ 5.`)?.state).toBe('holds')
    expect(annexStrictChecks([r('§ 5.', 'Zuständigkeit', 'Zuständigkeit der Behörde'), r(null, body, 'Die Behörde ist zuständig.')], { ...draft, blocks: heading }).get(`${LAW}#§ 5.`)).toMatchObject({ state: 'differs', struckNotInDraft: ['sie', 'ist', 'an', 'weisungen', 'nicht', 'gebunden'] })
  })

  it('ends a unit where it ends: the closing row of a deeper list, an item run on over rows, the subject of the next clause (22.11.2026)', () => {
    // A second review of the check: an earlier Ziffer's Litera list closing with a row of its own made the repeal of the last
    // Ziffer take the list's Schlussteil; a repealed Ziffer printed over two rows ended with its first; „entfällt Abs. 2 und
    // Abs. 3 erhält die Absatzbezeichnung „(2)“" repealed Abs. 3 too (GVG-B § 12).
    const r = (gld: string | null, change: ComparisonRow['change'], current: string) => row({ law: LAW, gld, para: '§ 5.', change, current, proposed: change === 'removed' ? '' : current })
    const closing = (z2: boolean, schluss: boolean) => [
      r('§ 5.', 'unchanged', '(1) Die Behörde hat'),
      r(null, 'unchanged', '1. die Identität, und zwar'),
      r(null, 'unchanged', 'a) den Namen und'),
      r(null, 'unchanged', 'b) das Geburtsdatum,'),
      r(null, 'unchanged', 'jeweils urkundlich, und'),
      r(null, z2 ? 'removed' : 'unchanged', '2. den Wohnsitz'),
      r(null, schluss ? 'removed' : 'unchanged', 'des Antragstellers zu prüfen.'),
      r(null, 'unchanged', '(2) Die Frist beträgt vier Wochen.'),
    ]
    const z2 = { ...draft, blocks: blocksWith('1. In § 5 Abs. 1 entfällt die Z 2.') }
    expect(annexStrictChecks(closing(true, false), z2).get(`${LAW}#§ 5.`)?.state).toBe('holds')
    expect(annexStrictChecks(closing(false, true), z2).get(`${LAW}#§ 5.`)).toMatchObject({ state: 'differs', struckNotInDraft: ['des', 'antragstellers', 'zu', 'prüfen'] })
    const dashes = [
      r('§ 5.', 'unchanged', '(1) Die Behörde hat'),
      r(null, 'unchanged', '1. die Identität und'),
      r(null, 'removed', '2. den Wohnsitz, nachgewiesen durch'),
      r(null, 'removed', '– den Meldezettel,'),
      r(null, 'unchanged', '3. das Alter des Antragstellers zu prüfen.'),
    ]
    expect(annexStrictChecks(dashes, z2).get(`${LAW}#§ 5.`)).toMatchObject({ state: 'holds', struckNotInDraft: [] })
    const current = '(1) Die Behörde ist zuständig. (2) Die Hilfe umfasst die Kosten der Rückreise. (3) Der Bundesminister kann Beratungsstellen einrichten. Er bedient sich dabei der Agentur.'
    const renumbered = blocksWith('1. In § 5 entfällt Abs. 2 und Abs. 3 erhält die Absatzbezeichnung „(2)“.')
    expect(check(renumbered, '(1) Die Behörde ist zuständig. (2) Der Bundesminister kann Beratungsstellen einrichten. Er bedient sich dabei der Agentur.', current).state).toBe('holds')
    expect(check(renumbered, '(1) Die Behörde ist zuständig. (2) Er bedient sich dabei der Agentur.', current)).toMatchObject({ state: 'differs', struckNotInDraft: ['der', 'bundesminister', 'kann', 'beratungsstellen', 'einrichten'] })
  })

  it('strikes nothing by position where a line quotes what it removes, and reads a number as new only where the line says so (22.11.2026)', () => {
    // A second review of the check: „entfällt die Zeile mit der Wortfolge „Verwendete Badezusätze““ let any one struck line pass
    // (BäderhygV Anlage 9); „… die Einträge zu den neuen §§ 18a und 18b eingefügt" made the line's repeal of the old § 18 the
    // renumbered § 19's.
    const r = (gld: string | null, change: ComparisonRow['change'], current: string) => row({ law: LAW, gld, para: '§ 5.', change, current, proposed: change === 'removed' ? '' : current })
    const form = (wanne: boolean) => [r('§ 5.', 'unchanged', 'Name des Bades:'), r(null, wanne ? 'removed' : 'unchanged', 'Standort der Wanne:'), r(null, 'removed', 'Verwendete Badezusätze:'), r(null, 'unchanged', 'Datum:')]
    const line = { ...draft, blocks: blocksWith('1. In § 5 entfällt die Zeile mit der Wortfolge „Verwendete Badezusätze“.') }
    expect(annexStrictChecks(form(false), line).get(`${LAW}#§ 5.`)?.state).toBe('holds')
    expect(annexStrictChecks(form(true), line).get(`${LAW}#§ 5.`)).toMatchObject({ state: 'differs', struckNotInDraft: ['standort', 'der', 'wanne'] })
    const rows = [row({ law: LAW, gld: '§ 19.', para: '§ 19.', paraAfter: '§ 18.', current: '§ 19. (1) Die Behörde ist zuständig. (2) Die Frist beträgt vier Wochen.', proposed: '§ 18. (1) Die Behörde ist zuständig.' })]
    const of = (...lines: string[]) => annexStrictChecks(rows, { ...draft, blocks: blocksWith(...lines) }).get(`${LAW}#§ 19.`)!
    expect(of('1. § 18 entfällt mitsamt Überschrift; im Inhaltsverzeichnis werden die Einträge zu den neuen §§ 18a und 18b eingefügt.', '2. Der bisherige § 19 erhält die Paragraphenbezeichnung „§ 18.“.')).toMatchObject({ state: 'differs', struckNotInDraft: ['2', 'die', 'frist', 'beträgt', 'vier', 'wochen'] })
    expect(of('1. § 18 entfällt mitsamt Überschrift.', '2. Der bisherige § 19 erhält die Paragraphenbezeichnung „§ 18.“.', '3. In § 18 (neu) entfällt Abs. 2.')).toMatchObject({ state: 'holds', struck: { repealed: 6 } })
  })

  it('charges a line that strikes a sentence per sentence, and opens a Ziffer after a citation in brackets (22.11.2026)', () => {
    // A second review of the check: where the sentences of the unit cannot be counted (an elision in it), one sentence struck by
    // position that the word diff cuts at a kept run spent the count with its first piece (TDBG § 43); „(§ 9 AsylG 2005), oder 3."
    // was not read as Ziffer 3, and a wording quoted for Z 3 was refused there (BFA-VG § 21).
    const ruled = '(1) ... (2) Die Behörde ist zuständig. ... Die nähere Regelung wird einer Verordnung im Einvernehmen mit dem Bundesminister für Justiz vorbehalten. (3) Die Frist beträgt vier Wochen.'
    const cut = [...blocksWith('1. In § 5 Abs. 2 entfällt der letzte Satz.', '2. Dem § 5 Abs. 2 wird folgender Satz angefügt:'), abs('"Das Einvernehmen mit dem Bundesminister für Justiz ist herzustellen."')]
    const shown = '(1) ... (2) Die Behörde ist zuständig. ... Das Einvernehmen mit dem Bundesminister für Justiz ist herzustellen. (3) Die Frist beträgt vier Wochen.'
    expect(check(cut, shown, ruled)).toMatchObject({ state: 'holds', struckNotInDraft: [] })
    expect(check(cut, shown.replace(' (3) Die Frist beträgt vier Wochen.', ''), ruled).state).toBe('differs')
    const court = '(2a) Das Gericht erkennt über Beschwerden gegen Entscheidungen, mit denen 1. der Status aberkannt wurde (§ 7 AsylG 2005), 2. der Schutz aberkannt wurde (§ 9 AsylG 2005), oder 3. bei Fremden, deren Aufenthalt geduldet war, die Zulässigkeit festgestellt wurde. (3) Weiteres gilt.'
    const z3 = blocksWith('1. In § 5 Abs. 2a Z 3 wird die Wortfolge „bei Fremden“ durch die Wortfolge „gegen Fremde“ ersetzt.')
    expect(check(z3, court.replace('3. bei Fremden', '3. gegen Fremde'), court)).toMatchObject({ state: 'holds', struckNotInDraft: [] })
  })

  it('reads an id list behind a deeper part at the level the column prints (22.11.2026)', () => {
    // „In § 31 Abs. 19 Z 1, 20 und 21 wird die Zahl „710“ jeweils … ersetzt" (ORF-G): Abs. 20 and 21, not Z 20 and 21 of Abs. 19.
    const fees = '(19) Das Entgelt beträgt 1. 710 Euro für Haushalte, 2. 500 Euro für Betriebe. (20) Der Zuschlag beträgt 710 Euro. (21) Die Gebühr beträgt 710 Euro. (22) Die Pauschale beträgt 710 Euro.'
    const line = blocksWith('1. In § 5 Abs. 19 Z 1, 20 und 21 wird die Zahl „710“ jeweils durch die Zahl „780“ ersetzt.')
    const sound = '(19) Das Entgelt beträgt 1. 780 Euro für Haushalte, 2. 500 Euro für Betriebe. (20) Der Zuschlag beträgt 780 Euro. (21) Die Gebühr beträgt 780 Euro. (22) Die Pauschale beträgt 710 Euro.'
    expect(check(line, sound, fees)).toMatchObject({ state: 'holds', struckNotInDraft: [] })
    expect(check(line, sound.replace('Pauschale beträgt 710', 'Pauschale beträgt 780'), fees)).toMatchObject({ state: 'differs', struckNotInDraft: ['710'] })
  })

  it('reads what a removing verb strikes in its own clause, not what the next clause inserts, renumbers or adds to (22.11.2026)', () => {
    // Read on drafts the check was never measured on: „entfällt § 16b und wird folgender § 23 samt Überschrift eingefügt" repealed
    // § 23 too („folgender" ends like an article), and an old § 23 the column struck with no instruction behind it was accounted for
    // (Integrationsgesetz § 23).
    const penal = '§ 5. (1) Wer die Meldung unterlässt, begeht eine Verwaltungsübertretung. (2) Strafbehörde ist die Bezirksverwaltungsbehörde.'
    const inserted = [...blocksWith('1. Nach der Überschrift zum 3. Hauptstück entfällt § 4b und wird folgender § 5 samt Überschrift eingefügt:'), abs('"Kursangebot'), abs('§ 5. Der Fonds stellt Kurse bereit."')]
    expect(check(inserted, 'Kursangebot § 5. Der Fonds stellt Kurse bereit.', penal)).toMatchObject({ state: 'differs', struck: { repealed: 0 } })
    // „entfällt die Z 2, die Z 3 erhält die Bezeichnung „2.“": the Z 3 is renumbered and kept, and what the column strikes in it no line strikes.
    const tasks = '(1) Die Behörde hat 1. die Anträge zu prüfen, 2. das Register der Anlagen zu führen, 3. die Betreiber der Anlagen im Bundesgebiet zu beaufsichtigen. (2) Die Behörde ist unabhängig.'
    const kept = '(1) Die Behörde hat 1. die Anträge zu prüfen, 2. die Betreiber der Anlagen im Bundesgebiet zu beaufsichtigen. (2) Die Behörde ist unabhängig.'
    for (const line of ['1. In § 5 Abs. 1 entfällt die Z 2, die Z 3 erhält die Bezeichnung „2.“.', '1. In § 5 Abs. 1 entfällt die Z 2 und die Z 3 erhält die Bezeichnung „2.“.']) {
      expect(check(blocksWith(line), kept, tasks)).toMatchObject({ state: 'holds', struckNotInDraft: [] })
      expect(check(blocksWith(line), kept.replace(' im Bundesgebiet', ''), tasks)).toMatchObject({ state: 'differs', struckNotInDraft: ['im', 'bundesgebiet'] })
    }
    // „entfällt die Z 2 und wird der Z 3 folgender Halbsatz angefügt": the Z 3 is where the next clause adds.
    const added = [...blocksWith('1. In § 5 Abs. 1 entfällt die Z 2 und wird der Z 3 folgender Halbsatz angefügt:'), abs('"; dies gilt auch für Anlagen im Ausland"')]
    const longer = '(1) Die Behörde hat 1. die Anträge zu prüfen, 3. die Betreiber der Anlagen im Bundesgebiet zu beaufsichtigen; dies gilt auch für Anlagen im Ausland. (2) Die Behörde ist unabhängig.'
    expect(check(added, longer, tasks)).toMatchObject({ state: 'holds', struckNotInDraft: [] })
    const struck = check(added, longer.replace('der Anlagen im Bundesgebiet zu', 'zu'), tasks)
    expect(struck.state).toBe('differs')
    expect(struck.struckNotInDraft).toContain('bundesgebiet')
  })
})
