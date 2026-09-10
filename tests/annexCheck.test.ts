import { describe, expect, it } from 'vitest'
import {
  DRAFT_THRESHOLD,
  LAW_THRESHOLD,
  MIN_MISSING_WORDS,
  MIN_NEW_WORDS,
  MIN_STANDING_STRETCH,
  PARAGRAPH_THRESHOLD,
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
  annexParagraphKey,
  checkAnnexRows,
  comparableTokens,
  coverageOf,
  coverageOfParagraph,
  designationKey,
  displayedChangeRows,
  draftTextOf,
  draftWordBag,
  insertedStretches,
  lawCheck,
  notRunReason,
  rightColumnCheck,
  verifyAnnex,
  type AnnexDraft,
  type AnnexSources,
  type AnnexVerification,
  type Coverage,
  type StandingText,
} from '../server/utils/annexCheck'
import type { DraftArticle } from '../server/utils/lawTitles'
import type { KonsLawAtDate, KonsParagraphRef } from '../server/utils/risKons'
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
    expect(c.prose).toBe(false)
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
    expect(c.prose).toBe(true)
    expect(c.missing).toContain('datenrechenzentrums')
  })

  it('reports too little prose rather than a verdict', () => {
    // A heading plus "(1) bis (3) …" shows nothing of the provision on
    // purpose; scoring it measures the Rundschreiben, not the parse. There
    // used to be a `verified: true` on this, which is how a § nobody could
    // judge reached the page as "geprüft".
    const c = coverageOf('§ 5. (1) bis (3) …', 'Ein völlig anderer Text.')
    expect(c.prose).toBe(false)
    expect(c).not.toHaveProperty('verified')
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
    expect(c.prose).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The right column: „bereits geltend" and „nicht im Entwurf"
// ---------------------------------------------------------------------------

/** A § of three sentences, as RIS holds it. */
const STANDING_BODY = 'Die Behörde entscheidet über den Antrag. Der Bescheid ergeht schriftlich und ist zu begründen. Eine Beschwerde hat keine aufschiebende Wirkung.'
const STANDING: StandingText = { text: STANDING_BODY, heading: '' }
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

const NO_DRAFT = draftWordBag('')

describe('insertedStretches', () => {
  it('takes what the page shows as new, and nothing the annex left out', () => {
    const rows = [
      row({ change: 'inserted', proposed: 'ein ganz neuer Absatz' }),
      row({ change: 'changed', proposed: 'egal', segments: [{ type: 'equal', text: 'alt' }, { type: 'inserted', text: 'dazu' }, { type: 'removed', text: 'weg' }] }),
      // The annex saying it left unchanged text out makes no claim either way.
      row({ change: 'inserted', proposed: '(2) bis (4) …', elided: true }),
      row({ change: 'removed', current: 'entfällt' }),
      row({ kind: 'article', heading: 'Artikel 2' }),
    ]
    expect(insertedStretches(rows)).toEqual(['ein ganz neuer Absatz', 'dazu'])
  })
})

describe('rightColumnCheck — „bereits geltend"', () => {
  it('catches a lost sentence the diff paints as an addition', () => {
    // The fault the one-sided gate could not see: 93,6 % of injected losses
    // passed it, because containment asks only whether the standing § accounts
    // for the column, never the other way round.
    const check = rightColumnCheck(lostSentenceRows(), STANDING, NO_DRAFT)
    expect(check.alreadyStanding).toBe(true)
    expect(check.standingStretch).toBe(LOST)
  })

  it('stays silent when the same sentence merely moved inside the §', () => {
    // Present on the left, so nothing was lost — the ministry reordered the
    // provision, which is an ordinary change and not a parse failure.
    const moved = lostSentenceRows(`${LOST} ${KEPT}`)
    expect(rightColumnCheck(moved, STANDING, NO_DRAFT).alreadyStanding).toBe(false)
  })

  it('needs six comparable words, because legal phrasing collides below that', () => {
    const stretch = (text: string): ComparisonRow[] => [row({ gld: '§ 1.', para: '§ 1.', current: KEPT, proposed: STANDING_BODY, segments: [{ type: 'inserted', text }] })]
    expect(MIN_STANDING_STRETCH).toBe(6)
    // "bescheid ergeht schriftlich und ist" — five comparable words, and a
    // verbatim run of the standing §. Not evidence.
    expect(rightColumnCheck(stretch('Bescheid ergeht schriftlich und ist'), STANDING, NO_DRAFT).alreadyStanding).toBe(false)
    expect(rightColumnCheck(stretch('Der Bescheid ergeht schriftlich und ist'), STANDING, NO_DRAFT).alreadyStanding).toBe(true)
  })

  it('is a sequence test, not a bag test', () => {
    // Every word of this stands in the § and none of it is the §. A bag test
    // fires here; that is why the rule takes the whole stretch, in order.
    const rows = [row({ gld: '§ 1.', para: '§ 1.', current: KEPT, proposed: STANDING_BODY, segments: [{ type: 'inserted', text: 'Eine Beschwerde entscheidet über den Bescheid und die Behörde' }] })]
    expect(rightColumnCheck(rows, STANDING, NO_DRAFT).alreadyStanding).toBe(false)
  })
})

describe('rightColumnCheck — „nicht im Entwurf"', () => {
  it('catches a right column carrying text the draft never wrote', () => {
    const check = rightColumnCheck(foreignRows(), STANDING, draftWordBag('Die Behörde entscheidet über den Antrag.'))
    expect(check.newWords).toBeGreaterThanOrEqual(MIN_NEW_WORDS)
    expect(check.missingWords).toBeGreaterThanOrEqual(MIN_MISSING_WORDS)
    expect(check.notInDraft).toBe(true)
  })

  it('needs eight missing words, not just a ratio', () => {
    // The next candidates below the ratio are all false positives with two or
    // three missing words — a ministry's name, a spelling. A ratio alone
    // cannot tell 2 of 12 from 39 of 89.
    const draftHasMost = draftWordBag('Die Behörde entscheidet über den Antrag. Rechtsgeschäfte über Grundstücke bedürfen zwingend')
    const check = rightColumnCheck(foreignRows(), STANDING, draftHasMost)
    expect(check.missingWords).toBe(7)
    expect(check.newWords > 0 && (check.newWords - check.missingWords) / check.newWords).toBeLessThan(DRAFT_THRESHOLD)
    expect(check.notInDraft).toBe(false)
  })

  it('does not count the § heading as missing', () => {
    // RIS files the heading above the body and the annex reprints it; the
    // draft's Novellierungsanordnung usually does not repeat it. Unhandled,
    // heading words were 20 of the missing words in the corpus.
    const heading = 'Zustimmung zu Rechtsgeschäften über Grundstücke und Nutzungsrechte'
    const rows = [row({ gld: '§ 1.', para: '§ 1.', current: 'Die Behörde entscheidet über den Antrag.', proposed: `${heading} Die Behörde entscheidet über den Antrag.`, segments: [{ type: 'inserted', text: heading }, { type: 'equal', text: 'Die Behörde entscheidet über den Antrag.' }] })]
    const withHeading: StandingText = { text: `${heading} ${STANDING_BODY}`, heading }
    expect(rightColumnCheck(rows, withHeading, NO_DRAFT).missingWords).toBe(0)
    // …and the same words do count where they are body text. Five, not six:
    // "über" already stands in the left column and was never new.
    expect(rightColumnCheck(rows, { text: withHeading.text, heading: '' }, NO_DRAFT).missingWords).toBe(5)
  })

  it('reads a hyphen as an Ergänzungsstrich and as a line break', () => {
    // "Land- und Forstwirtschaft" is one word split by a conjunction;
    // "Schieneninfrastruktur-|Dienstleistungsgesellschaft" is one word split
    // by the PDF's line break. Unhandled, hyphens were 36 of the missing words.
    const shown = 'Die Land- und Forstwirtschaft sowie die Schieneninfrastruktur- Dienstleistungsgesellschaft haben die Meldung unverzüglich zu erstatten'
    const written = 'Die Land- und Forstwirtschaft sowie die Schieneninfrastruktur-Dienstleistungsgesellschaft haben die Meldung unverzüglich zu erstatten'
    const rows = [row({ gld: '§ 1.', para: '§ 1.', change: 'inserted', current: '', proposed: shown })]
    const check = rightColumnCheck(rows, STANDING, draftWordBag(written))
    expect(check.newWords).toBeGreaterThanOrEqual(MIN_NEW_WORDS)
    expect(check.missingWords).toBe(0)
    expect(check.notInDraft).toBe(false)
  })

  it('is disarmed by a draft text nobody could read', () => {
    // An empty bag is not evidence that a word is absent. Failing every § of
    // a draft whose XML was missing would be the loudest possible way to
    // report our own gap as the ministry's. The counts stay honest, so a
    // report cannot read "nothing missing" where nothing was compared.
    const check = rightColumnCheck(foreignRows(), STANDING, NO_DRAFT)
    expect(check.notInDraft).toBe(false)
    expect(check.missingWords).toBe(check.newWords)
  })
})

describe('draftTextOf', () => {
  it('keeps the Gliederungssymbol, because a § marker is text on this side', () => {
    expect(draftTextOf([
      { kind: 'abs', cls: 'absatz/abs', text: 'Die Behörde entscheidet.', gld: '§ 5.' },
      { kind: 'abs', cls: 'absatz/abs', text: 'Der Bescheid ergeht schriftlich.', gld: null },
    ])).toBe('§ 5. Die Behörde entscheidet.  Der Bescheid ergeht schriftlich.')
  })
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

describe('designationKey', () => {
  it('reads the annex and RIS spellings of one provision onto the same key', () => {
    expect(designationKey('§ 5.')).toBe(designationKey('§ 5'))
    expect(designationKey('Anlage 1')).toBe(designationKey('Anl. 1'))
    expect(designationKey('Anhang 2')).toBe(designationKey('Anl. 2'))
    expect(designationKey('Artikel 3')).toBe(designationKey('Art. 3'))
    // A Gliederungssymbol that dropped its sign is still a §.
    expect(designationKey('5.')).toBe(designationKey('§ 5'))
  })

  it('keeps § 5 and § 5a apart', () => {
    // The shipped rule built `^§+\s*5(?![.\d])` and matched the RIS label
    // "§ 5a" with it, so whichever of the two RIS returned first decided —
    // and § 5 could be scored against § 5a's text.
    expect(designationKey('§ 5.')).not.toBe(designationKey('§ 5a'))
    expect(designationKey('§ 5a')).toBe(designationKey('§ 5A'))
  })

  it('keeps a § of an article-structured law out of reach', () => {
    // RIS files those as "Art. 3 § 5" (5.474 labels in the cached corpus).
    // The Artikel is part of the §'s identity there, which is exactly why
    // the amendment engine refuses such addresses too.
    expect(designationKey('Art. 3 § 5')).toBe('Art 3 § 5')
    expect(designationKey('§ 5')).not.toBe(designationKey('Art. 3 § 5'))
    expect(designationKey('Art. 3')).not.toBe(designationKey('Art. 3 § 5'))
  })

  it('keeps a split Anlage apart from the whole one', () => {
    expect(designationKey('Anl. 1/59')).not.toBe(designationKey('Anl. 1'))
  })

  it('reads the numeral forms RIS actually prints', () => {
    // "§ 373i1" and "§ 373i2" are two provisions; the old id regex cut both
    // to "373i" and then matched neither.
    expect(designationKey('§ 373i1')).toBe('§ 373i1')
    expect(designationKey('§ 373i1')).not.toBe(designationKey('§ 373i2'))
    expect(designationKey('§ 1.08')).toBe('§ 1.08')
    expect(designationKey('Anl. 1A')).toBe('Anl 1a')
  })

  it('refuses a text that names no provision', () => {
    expect(designationKey('Präambel')).toBeNull()
    expect(designationKey('')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// verifyAnnex, against fakes — `AnnexSources` exists for exactly this
// ---------------------------------------------------------------------------

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

/**
 * The draft's own Gesetzestext, the second reference the right column is held
 * against. Non-empty by default in every test below, so a rule that started
 * firing on ordinary annexes would show up here rather than only in its own
 * test — an empty one disarms rule 2 on purpose (`rightColumnCheck`).
 */
const DRAFT_TEXT = `§ 1 lautet: "${PROSE}" § 2 lautet: "${OTHER_PROSE}"`

function draft(over: Partial<AnnexDraft> = {}): AnnexDraft {
  return { articles: [article()], asOf: '2026-01-01', text: DRAFT_TEXT, ...over }
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

  it('says a § shows no standing text at all rather than "too little text"', async () => {
    // Two ways to reach zero comparable words, and both used to borrow the
    // sentence about too little text. That sentence only started reaching
    // readers on 2026-09-10 (§12.13), and 99/ME — an annex that inserts §§
    // and does nothing else — is where it read false: a screenful of new
    // provisions is not "zu wenig Text".
    const rows = [
      row({ gld: '§ 1.', para: '§ 1.', current: '', proposed: 'Ein ganz neuer Paragraf mit reichlich Text.', change: 'inserted' }),
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
    const blind = await verifyAnnex(foreignRows(), draft({ text: '' }), fakeSources({ 'BGBl. I 1/2020': { '§ 2': STANDING_BODY } }))
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
