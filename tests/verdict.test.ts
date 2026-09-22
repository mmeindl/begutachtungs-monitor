import { describe, expect, it } from 'vitest'
import type { Coverage } from '../server/utils/annex/coverage'
import { checkAnnexRows, notRunReason } from '../server/utils/annex/gateRows'
import type { StandingText } from '../server/utils/annex/rightColumn'
import {
  LAW_THRESHOLD,
  REASON_BOUNDARY,
  REASON_CEILING,
  REASON_NO_AMENDING,
  REASON_NO_ARTICLES,
  REASON_NO_ASOF,
  REASON_NO_PARAGRAPHS,
  REASON_NO_SUCH_PARAGRAPH,
  REASON_NOTHING_TO_COMPARE,
  REASON_NOT_REPRESENTABLE,
  REASON_TOO_SHORT,
  REASON_UNRESOLVED,
  lawCheck,
  verifyAnnex,
  type AnnexDraft,
  type AnnexSources,
} from '../server/utils/annex/verdict'
import type { TextBlock } from '../server/utils/lawtext/lawUnits'
import type { DraftArticle } from '../server/utils/lawtext/draftArticles'
import type { KonsLawAtDate, KonsParagraphRef } from '../server/utils/ris/konsLaw'
import { parseTextComparison, type ComparisonRow } from '../server/utils/annex/comparisonRows'

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

describe('lawCheck', () => {
  const cov = (ratio: number, prose = true): Coverage => ({ ratio, missing: [], comparable: prose ? 40 : 3, prose })

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

// ---------------------------------------------------------------------------
// verifyAnnex, against fakes — `AnnexSources` exists for exactly this
// ---------------------------------------------------------------------------

/** A § of three sentences, as RIS holds it. */
const STANDING_BODY = 'Die Behörde entscheidet über den Antrag. Der Bescheid ergeht schriftlich und ist zu begründen. Eine Beschwerde hat keine aufschiebende Wirkung.'

/** The middle sentence — what a parse loses on the left and the diff then paints green. */
const LOST = 'Der Bescheid ergeht schriftlich und ist zu begründen.'
const KEPT = 'Die Behörde entscheidet über den Antrag. Eine Beschwerde hat keine aufschiebende Wirkung.'

/** The § after the left column lost `LOST`: the word diff calls it an addition. */
function lostSentenceRows(current = KEPT): ComparisonRow[] {
  return [row({
    gld: '§ 1.',
    para: '§ 1.',
    current,
    proposed: STANDING_BODY,
    segments: [
      { type: 'equal', text: 'Die Behörde entscheidet über den Antrag.' },
      { type: 'inserted', text: LOST },
      { type: 'equal', text: 'Eine Beschwerde hat keine aufschiebende Wirkung.' },
    ],
  })]
}

/** Twelve words of law belonging to no part of this draft — a contaminated right column. */
const FOREIGN = 'Rechtsgeschäfte über Grundstücke bedürfen zwingend behördlicher Zustimmung wenn Nutzungsrechte begründet werden sollen.'

function foreignRows(): ComparisonRow[] {
  return [row({
    gld: '§ 2.',
    para: '§ 2.',
    current: 'Die Behörde entscheidet über den Antrag.',
    proposed: `Die Behörde entscheidet über den Antrag. ${FOREIGN}`,
    segments: [
      { type: 'equal', text: 'Die Behörde entscheidet über den Antrag.' },
      { type: 'inserted', text: FOREIGN },
    ],
  })]
}

const article = (over: Partial<DraftArticle> = {}): DraftArticle => ({
  index: 0,
  number: 'Artikel 1',
  numeral: '1',
  title: 'X-Gesetz',
  key: 'X-Gesetz',
  amends: true,
  bgbl: { organ: 'BGBl. I', nummer: '1/2020' },
  ...over,
})

/**
 * label → standing text, or null for a § RIS holds as a table.
 *
 * A bare string is a § whose headings play no part; the object form gives the
 * Abschnitt lines and the § heading separately, which is what rule 2 needs to
 * discount them.
 */
type FakeLaw = Record<string, string | StandingText | null>

function fakeSources(laws: Record<string, FakeLaw>, over: Partial<AnnexSources> = {}): AnnexSources {
  const texts = new Map<string, StandingText | null>()
  const built = new Map<string, KonsLawAtDate>()
  for (const [bgbl, paragraphs] of Object.entries(laws)) {
    const refs: Record<string, KonsParagraphRef> = {}
    for (const [label, text] of Object.entries(paragraphs)) {
      const nor = `${bgbl}|${label}`
      texts.set(nor, typeof text === 'string' ? { text, heading: '' } : text)
      refs[label] = {
        nor,
        label,
        id: label.replace(/^\D*/, ''),
        inkrafttreten: null,
        ausserkrafttreten: null,
        kundmachungsorgan: null,
        stammnorm: null,
        gesetzesnummer: bgbl,
        xmlUrl: `https://ris.example/${nor}`,
      }
    }
    built.set(bgbl, { gesetzesnummer: bgbl, kurztitel: bgbl, paragraphs: refs })
  }
  return {
    resolveLaw: async (organ, nummer) => built.get(`${organ} ${nummer}`) ?? null,
    standingText: async (ref) => texts.get(ref.nor) ?? null,
    ...over,
  }
}

/** Prose long enough to be judged, and its verbatim twin for the RIS side. */
const PROSE = 'Die Behörde entscheidet über den Antrag binnen sechs Wochen nach seiner Einbringung.'
const OTHER_PROSE = 'Der Bund trägt die Kosten des Datenrechenzentrums nach Anhörung der Landesregierung.'

/** One Novellierungsanordnung, in the shape `parseRisXml` hands it over. */
const instruction = (text: string): TextBlock => ({ kind: 'novao', cls: 'absatz/novao1', text, gld: null })

/**
 * The draft's own Gesetzestext, the second reference the right column is held
 * against. Non-empty by default in every test below, so a rule that started
 * firing on ordinary annexes would show up here rather than only in its own
 * test — an unreadable draft disarms rule 2 on purpose (`rightColumnCheck`).
 *
 * Blocks, not one string: since 2026-09-10 the rule reads them per
 * instruction, so a fixture of two instructions is what separates "the draft
 * writes this" from "the draft writes this *here*".
 */
const DRAFT_BLOCKS: TextBlock[] = [
  instruction(`1. § 1 lautet: "${PROSE}"`),
  instruction(`2. § 2 lautet: "${OTHER_PROSE}"`),
]

function draft(over: Partial<AnnexDraft> = {}): AnnexDraft {
  return { articles: [article()], asOf: '2026-01-01', blocks: DRAFT_BLOCKS, ...over }
}

describe('verifyAnnex', () => {
  it('verifies a § the standing text accounts for and withholds one it does not', async () => {
    const rows = [
      row({ gld: '§ 1.', para: '§ 1.', current: PROSE }),
      row({ gld: '§ 2.', para: '§ 2.', current: OTHER_PROSE }),
    ]
    const check = await verifyAnnex(rows, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': PROSE, '§ 2': PROSE } }))
    expect(check.ran).toBe(true)
    expect(check.judged).toBe(2)
    expect(check.verified).toBe(1)
    expect(check.verdicts).toEqual({ '#§ 1.': 'verified', '#§ 2.': 'withheld' })
    expect(notRunReason(check)).toBeNull()
  })

  it('leaves a § that shows too little text unchecked rather than passing it', async () => {
    // The bug this whole module was rewritten for: a § in a law that *was*
    // judged, but with nothing of its own to judge, used to come out as
    // "geprüft" because nothing had named it.
    const rows = [
      row({ gld: '§ 1.', para: '§ 1.', current: PROSE }),
      row({ gld: '§ 2.', para: '§ 2.', current: 'Der Bund entscheidet.' }),
    ]
    const check = await verifyAnnex(rows, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': PROSE, '§ 2': PROSE } }))
    expect(check.verdicts['#§ 2.']).toBe('unchecked')
    expect(check.reasons).toContain(REASON_TOO_SHORT)
    expect(check.judged).toBe(1)
  })

  it('keeps a § verified whose unchanged row carries foreign prose, and says so', async () => {
    // The decision of 11.09.2026, pinned (`isDisplayedChange`). The § reads
    // like the fear the TODO recorded — a mirrored row belonging to another
    // provision, invisible to the gate — and it stays `verified`, because
    // measuring the alternative over GP XXVIII showed the class to be 52
    // headings, 3 annex notations, 1 orthography difference and 2 gaps in our
    // own RIS reading against a single real finding (GTelG § 23).
    const rows = [
      row({ gld: '§ 1.', para: '§ 1.', current: PROSE }),
      row({ gld: null, para: '§ 1.', change: 'unchanged', current: FOREIGN, proposed: FOREIGN }),
    ]
    const check = await verifyAnnex(rows, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': PROSE } }))
    expect(check.verdicts['#§ 1.']).toBe('verified')
    // …and the reader sees that text: the row keeps it, folded but printed.
    expect(checkAnnexRows(rows, check).rows[1]!.current).toBe(FOREIGN)
  })

  it('leaves a § of nothing but unchanged text unchecked, never verified', async () => {
    // Where the annex prints a whole § identically in both columns — the PDF
    // path's Inhaltsverzeichnis lines, 288 rows of GP XXVIII — there is no
    // claim about a change to vouch for. All 35 of those that a rule over
    // unchanged rows would withhold are §§ in this state, which is why that
    // rule would have bought a reader nothing.
    const rows = [row({ gld: '§ 1.', para: '§ 1.', change: 'unchanged', current: PROSE, proposed: PROSE })]
    const check = await verifyAnnex(rows, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': PROSE } }))
    expect(check.verdicts['#§ 1.']).toBe('unchecked')
    expect(check.reasons).toEqual([REASON_NOTHING_TO_COMPARE])
    expect(check.verified).toBe(0)
    // Not counted as a gap either: only §§ that show a change are owed one.
    expect(checkAnnexRows(rows, check).uncheckedParagraphs).toBe(0)
  })

  it('says a § shows no standing text at all rather than "too little text"', async () => {
    // Two ways to reach zero comparable words, and both used to borrow the
    // sentence about too little text. That sentence only started reaching
    // readers on 2026-09-10 (§12.13), and 99/ME — an annex that inserts §§
    // and does nothing else — is where it read false: a screenful of new
    // provisions is not "zu wenig Text".
    const rows = [
      row({ gld: '§ 1.', para: '§ 1.', current: '', proposed: 'Ein ganz neuer Paragraph mit reichlich Text.', change: 'inserted' }),
      row({ gld: '§ 2.', para: '§ 2.', current: '(1) bis (3) …', elided: false }),
    ]
    const check = await verifyAnnex(rows, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': PROSE, '§ 2': PROSE } }))
    expect(check.judged).toBe(0)
    expect(check.reasons).toEqual([REASON_NOTHING_TO_COMPARE])
    expect(notRunReason(check)).toBe(REASON_NOTHING_TO_COMPARE)
  })

  it('withholds a § that shows as new what already stands, and does not verify it', async () => {
    // Judged on the left and clean there — the whole point: the one-sided
    // check passed 93,6 % of injected losses of exactly this shape.
    const check = await verifyAnnex(lostSentenceRows(), draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': STANDING_BODY } }))
    expect(check.verdicts['#§ 1.']).toBe('withheld')
    expect(check.withheldCauses['#§ 1.']).toBe('alreadyStanding')
    expect(check.judged).toBe(1)
    expect(check.verified).toBe(0)
  })

  it('withholds a § whose proposed column carries text the draft never wrote', async () => {
    const check = await verifyAnnex(foreignRows(), draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 2': STANDING_BODY } }))
    expect(check.verdicts['#§ 2.']).toBe('withheld')
    expect(check.withheldCauses['#§ 2.']).toBe('notInDraft')
    // …and the same § comes through where the draft's text could not be read,
    // because an empty bag proves nothing.
    const blind = await verifyAnnex(foreignRows(), draft({ blocks: [] }), fakeSources({ 'BGBl. I 1/2020': { '§ 2': STANDING_BODY } }))
    expect(blind.verdicts['#§ 2.']).toBe('verified')
  })

  it('withholds an inserted § whose text is nowhere in the draft, and vouches for none', async () => {
    // A § with no left column cannot be judged — but text that appears
    // neither in the draft nor in the standing law is invented, and that is
    // worth withholding. The bag test may never promote in the other
    // direction: it passes happily on garbage lifted from another part of
    // the same draft.
    const invented = [row({ gld: '§ 3.', para: '§ 3.', change: 'inserted', current: '', proposed: FOREIGN })]
    const check = await verifyAnnex(invented, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 3': STANDING_BODY } }))
    expect(check.verdicts['#§ 3.']).toBe('withheld')
    expect(check.withheldCauses['#§ 3.']).toBe('notInDraft')
    expect(check.judged).toBe(0)

    const sound = [row({ gld: '§ 3.', para: '§ 3.', change: 'inserted', current: '', proposed: OTHER_PROSE })]
    const passed = await verifyAnnex(sound, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 3': STANDING_BODY } }))
    expect(passed.verdicts['#§ 3.']).toBe('unchecked')
    expect(passed.verified).toBe(0)
  })

  it('holds a § whose designation the ressort marked against that §, not against its first digit', async () => {
    // End to end, because this failed *between* the two modules. The ressort
    // marks the changed digit of the designation — "§ 1<i>3</i>." — every tag
    // became a space, the row read "§ 1 3 ." and the key came out as § 1: the
    // left column of § 13 was then held against the standing § 1 and its
    // right column against § 1's instructions. Blutspenderverordnung and two
    // others, GP XXVIII (2026-09-10, docs/architecture.md §12.13).
    const annex = `<risdok><nutzdaten><abschnitt>
      <ueberschrift typ="g2">Textgegenüberstellung</ueberschrift>
      <table>
        <tr><td><ueberschrift typ="tgue">Geltende Fassung</ueberschrift></td><td><ueberschrift typ="tgue">Vorgeschlagene Fassung</ueberschrift></td></tr>
        <tr><td><absatz typ="abs"><gldsym>§ 1<i><span style="background:yellow">3</span></i>.</gldsym> ${PROSE}</absatz></td><td><absatz typ="abs"><gldsym>§ 1<i><span style="background:yellow">3</span></i>.</gldsym> ${OTHER_PROSE}</absatz></td></tr>
      </table></abschnitt></nutzdaten></risdok>`
    const rows = parseTextComparison(annex, [article()]).rows
    expect(rows[0]!.gld).toBe('§ 13.')
    // § 1 holds text § 13's column does not have: read as § 1 the § failed the
    // left check, read as § 13 it passes it.
    const check = await verifyAnnex(rows, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': OTHER_PROSE, '§ 13': PROSE } }))
    expect(check.verdicts).toEqual({ 'X-Gesetz#§ 13.': 'verified' })
  })

  it('names the left column first when a § fails on both sides', async () => {
    // Several causes can fire on one §; only the first is recorded, so the
    // split the page prints sums to the total beside it.
    const rows = [row({ gld: '§ 1.', para: '§ 1.', current: OTHER_PROSE, proposed: STANDING_BODY, segments: [{ type: 'inserted', text: LOST }] })]
    const check = await verifyAnnex(rows, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': STANDING_BODY } }))
    expect(check.withheldCauses['#§ 1.']).toBe('standing')
  })

  it('doubts a law whose §§ fail in a cluster without withholding the sound ones', async () => {
    const rows = ['§ 1.', '§ 2.'].map((p) => row({ gld: p, para: p, current: OTHER_PROSE }))
    rows.push(row({ gld: '§ 3.', para: '§ 3.', current: PROSE }))
    const check = await verifyAnnex(rows, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': PROSE, '§ 2': PROSE, '§ 3': PROSE } }))
    expect(check.doubtfulLaws.map((l) => l.law)).toEqual([null])
    expect(check.verdicts).toEqual({ '#§ 1.': 'withheld', '#§ 2.': 'withheld', '#§ 3.': 'verified' })
  })

  it('scores § 5 against § 5, even when RIS returns § 5a first', async () => {
    const rows = [row({ gld: '§ 5.', para: '§ 5.', current: PROSE })]
    const laws = { 'BGBl. I 1/2020': { '§ 5a': OTHER_PROSE, '§ 5': PROSE } }
    const check = await verifyAnnex(rows, draft(), fakeSources(laws))
    expect(check.verdicts['#§ 5.']).toBe('verified')
  })

  it('looks an Anlage up as RIS prints it', async () => {
    // RIS files a schedule as "Anl. 1", never as "§ 1"; looking one up among
    // the paragraphs compared a schedule against an unrelated provision.
    const rows = [row({ gld: 'Anlage 1', para: 'Anlage 1', current: PROSE })]
    const check = await verifyAnnex(rows, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': OTHER_PROSE, 'Anl. 1': PROSE } }))
    expect(check.verdicts['#Anlage 1']).toBe('verified')
  })

  it('resolves an unattributed row when the draft amends exactly one law', async () => {
    const rows = [row({ law: null, gld: '§ 1.', para: '§ 1.', current: PROSE })]
    const check = await verifyAnnex(rows, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': PROSE } }))
    expect(check.verdicts['#§ 1.']).toBe('verified')
  })

  it('refuses an unattributed row when the draft amends several laws', async () => {
    // Which § 1 the row means is unknowable, and 15,1 % of § designations in
    // the multi-law annexes recur in another law of the same package.
    const articles = [article(), article({ index: 1, number: 'Artikel 2', numeral: '2', title: 'Y-Gesetz', key: 'Y-Gesetz', bgbl: { organ: 'BGBl. I', nummer: '2/2020' } })]
    const rows = [row({ law: null, gld: '§ 1.', para: '§ 1.', current: PROSE })]
    const check = await verifyAnnex(rows, draft({ articles }), fakeSources({ 'BGBl. I 1/2020': { '§ 1': PROSE }, 'BGBl. I 2/2020': { '§ 1': PROSE } }))
    expect(check.ran).toBe(false)
    expect(check.verdicts['#§ 1.']).toBe('unchecked')
    expect(notRunReason(check)).toBe(REASON_BOUNDARY)
  })

  it('leaves a § unchecked when RIS holds it as a table', async () => {
    const rows = [row({ gld: '§ 1.', para: '§ 1.', current: PROSE })]
    const check = await verifyAnnex(rows, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': null } }))
    expect(check.ran).toBe(false)
    expect(check.verdicts['#§ 1.']).toBe('unchecked')
    expect(notRunReason(check)).toBe(REASON_NOT_REPRESENTABLE)
  })

  it('leaves a § unchecked when RIS has no such paragraph', async () => {
    const rows = [row({ gld: '§ 9.', para: '§ 9.', current: PROSE })]
    const check = await verifyAnnex(rows, draft(), fakeSources({ 'BGBl. I 1/2020': { '§ 1': PROSE } }))
    expect(check.verdicts['#§ 9.']).toBe('unchecked')
    expect(notRunReason(check)).toBe(REASON_NO_SUCH_PARAGRAPH)
  })

  it('finds the standing Anlage behind a heading that cites §§', async () => {
    // The shape of all 12 §§ GP XXVIII lost to the composite key: the annex
    // prints the schedule under its full title, RIS holds it as "Anl. 3", and
    // `Anl 3 § 10 § 11` matched nothing — so a sound row came out unchecked
    // with "das RIS Bundesrecht führt diese Paragraphen nicht" beside it.
    const heading = 'Anlage 3 zu § 10 und § 11'
    const rows = [row({ gld: heading, para: heading, current: PROSE })]
    const blocks = [instruction(`1. Anlage 3 lautet: "${PROSE}"`)]
    const check = await verifyAnnex(rows, draft({ blocks }), fakeSources({ 'BGBl. I 1/2020': { 'Anl. 3': PROSE } }))
    expect(check.verdicts[`#${heading}`]).toBe('verified')
    expect(check.reasons).not.toContain(REASON_NO_SUCH_PARAGRAPH)
  })

  it('leaves everything unchecked when the law does not resolve', async () => {
    const rows = [row({ gld: '§ 1.', para: '§ 1.', current: PROSE })]
    const check = await verifyAnnex(rows, draft(), fakeSources({}))
    expect(check.ran).toBe(false)
    expect(check.verdicts['#§ 1.']).toBe('unchecked')
    expect(notRunReason(check)).toBe(REASON_UNRESOLVED)
  })

  it('names the reason when the draft amends nothing at all', async () => {
    const rows = [row({ gld: '§ 1.', para: '§ 1.', current: PROSE })]
    const check = await verifyAnnex(rows, draft({ articles: [article({ amends: false, bgbl: null })] }), fakeSources({}))
    expect(notRunReason(check)).toBe(REASON_NO_AMENDING)
  })

  it('says the Artikel could not be read rather than blaming the draft', async () => {
    // `articles` is empty when the draft's own RIS XML was missing, and the
    // reason has to say that instead of "der Entwurf schafft neues Recht".
    const rows = [row({ gld: '§ 1.', para: '§ 1.', current: PROSE })]
    const check = await verifyAnnex(rows, draft({ articles: [] }), fakeSources({}))
    expect(notRunReason(check)).toBe(REASON_NO_ARTICLES)
  })

  it('does not run without a reference date, and says so', async () => {
    const rows = [row({ gld: '§ 1.', para: '§ 1.', current: PROSE })]
    const check = await verifyAnnex(rows, draft({ asOf: '' }), fakeSources({ 'BGBl. I 1/2020': { '§ 1': PROSE } }))
    expect(check.ran).toBe(false)
    // Every § the annex names is still in the map, as unchecked — otherwise
    // the row mapping has nothing to refuse with.
    expect(check.verdicts).toEqual({ '#§ 1.': 'unchecked' })
    expect(notRunReason(check)).toBe(REASON_NO_ASOF)
  })

  it('says so when the annex names no paragraph at all', async () => {
    const check = await verifyAnnex([row({ gld: null, para: null, current: PROSE })], draft(), fakeSources({}))
    expect(check.ran).toBe(false)
    expect(check.verdicts).toEqual({})
    expect(notRunReason(check)).toBe(REASON_NO_PARAGRAPHS)
  })

  it('stops at the ceiling and leaves the rest unchecked', async () => {
    const rows = ['§ 1.', '§ 2.', '§ 3.'].map((p) => row({ gld: p, para: p, current: PROSE }))
    const laws = { 'BGBl. I 1/2020': { '§ 1': PROSE, '§ 2': PROSE, '§ 3': PROSE } }
    const check = await verifyAnnex(rows, draft(), fakeSources(laws), { maxParagraphs: 1, concurrency: 1 })
    expect(check.judged).toBe(1)
    expect(Object.values(check.verdicts).filter((v) => v === 'unchecked')).toHaveLength(2)
    expect(check.reasons).toContain(REASON_CEILING)
  })

  it('throws when RIS fails instead of answering "ungeprüft"', async () => {
    // A cached "keine Prüfung" reads on the page exactly like a draft with no
    // standing law to check against. Nothing about an outage may be cached,
    // so the error leaves the module and the section reports itself
    // unavailable.
    const rows = [row({ gld: '§ 1.', para: '§ 1.', current: PROSE })]
    const failing = fakeSources({ 'BGBl. I 1/2020': { '§ 1': PROSE } }, {
      standingText: async () => {
        throw new Error('RIS-Dokument nicht abrufbar')
      },
    })
    await expect(verifyAnnex(rows, draft(), failing)).rejects.toThrow('RIS-Dokument nicht abrufbar')
  })

  it('throws when the law lookup fails, not once per paragraph', async () => {
    const rows = ['§ 1.', '§ 2.'].map((p) => row({ gld: p, para: p, current: PROSE }))
    let calls = 0
    const failing = fakeSources({}, {
      resolveLaw: async () => {
        calls++
        throw new Error('RIS BrKons nicht abrufbar')
      },
    })
    await expect(verifyAnnex(rows, draft(), failing)).rejects.toThrow('RIS BrKons nicht abrufbar')
    expect(calls).toBe(1)
  })
})
