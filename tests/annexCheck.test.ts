import { describe, expect, it } from 'vitest'
import {
  DRAFT_THRESHOLD,
  LAW_THRESHOLD,
  MIN_MISSING_WORDS,
  MIN_NEW_WORDS,
  MIN_STANDING_STRETCH,
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
  draftBags,
  draftReference,
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
  type WordBag,
} from '../server/utils/annexCheck'
import type { TextBlock } from '../server/utils/lawText'
import type { DraftArticle } from '../server/utils/lawTitles'
import type { KonsLawAtDate, KonsParagraphRef } from '../server/utils/risKons'
import { parseTextComparison, type ComparisonRow } from '../server/utils/textComparison'

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

  it('leaves out an unchanged row even where it carries foreign prose — measured, not incidental', () => {
    // The gate's deliberate blind spot (`isDisplayedChange`, 11.09.2026): a row
    // printing the same text in both columns is shown on the page — folded
    // behind „N Stellen unverändert", then printed — and never held against
    // RIS. Scoring these rows was measured over GP XXVIII and rejected: it
    // withholds 59 §§ of the table path and 35 of the PDF path, of which 92 are
    // the law's own headings, the annex's notation, an orthography difference
    // or a gap in our own RIS reading, and exactly one is a real finding.
    //
    // The test stands so that a change here is a decision someone makes rather
    // than a line someone tidies.
    const rows = [
      row({ change: 'changed', current: 'geänderter Text' }),
      row({ change: 'unchanged', current: 'Rechtsgeschäfte über Grundstücke bedürfen zwingend behördlicher Zustimmung.' }),
    ]
    expect(displayedChangeRows(rows).map((r) => r.current)).toEqual(['geänderter Text'])
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

  it('counts an unchanged heading row as nothing, however far it is from the §', () => {
    // The class that decided the measurement: a Teil-, Abschnitt- or
    // Unterabschnitt heading stands *above* the § it heads, so it inherits the
    // designation of the § before it and its words are in no standing text this
    // gate ever asks for. 52 of the 59 §§ a rule over unchanged rows would
    // newly withhold on the table path are exactly this, among them
    // Strafvollzugsgesetz § 154 („Fünfter Abschnitt — Strafvollzug durch
    // elektronisch überwachten Hausarrest", 0 % against § 154, whose displayed
    // changes cover the standing text to 100 %).
    const rows = [
      row({ change: 'unchanged', current: 'FÜNFTER ABSCHNITT' }),
      row({ change: 'unchanged', current: 'Strafvollzug durch elektronisch überwachten Hausarrest' }),
      row({ change: 'changed', current: 'Die Behörde entscheidet über den Antrag binnen sechs Wochen nach Einbringung.' }),
    ]
    const c = coverageOfParagraph(rows, 'Die Behörde entscheidet über den Antrag binnen sechs Wochen nach Einbringung.')
    expect(c.ratio).toBe(1)
    expect(c.prose).toBe(true)
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

/** The draft's words as rule 2 receives them, for the tests that pass a text. */
const bag = (text: string): WordBag => {
  const words = draftWordBag(text)
  return { has: (w) => words.has(w), read: true }
}
/** A draft nobody could read — the one state that disarms rule 2. */
const NO_DRAFT: WordBag = { has: () => false, read: false }

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

  it('lets an unchanged row exempt the right column — the alibi, kept on purpose', () => {
    // A row printing the lost sentence in *both* columns shows it, so the rule
    // must not call it new: that is the same exemption as the moved sentence
    // above, and it is right. What it costs is the other half of the
    // 11.09.2026 measurement (`isDisplayedChange`): a mirrored row the annex
    // files under the wrong § is not merely unchecked, it is an excuse the
    // right column may draw on. Fault U of `scripts/annex-fault-injection.ts`
    // puts a number on it — 1 previously firing rule silenced in 881 §§ of the
    // PDF path — and this test says where that number comes from.
    const alibi = [...lostSentenceRows(), row({ gld: null, para: '§ 1.', change: 'unchanged', current: LOST, proposed: LOST })]
    expect(rightColumnCheck(alibi, STANDING, NO_DRAFT).alreadyStanding).toBe(false)
  })
})

describe('rightColumnCheck — „nicht im Entwurf"', () => {
  it('catches a right column carrying text the draft never wrote', () => {
    const check = rightColumnCheck(foreignRows(), STANDING, bag('Die Behörde entscheidet über den Antrag.'))
    expect(check.newWords).toBeGreaterThanOrEqual(MIN_NEW_WORDS)
    expect(check.missingWords).toBeGreaterThanOrEqual(MIN_MISSING_WORDS)
    expect(check.notInDraft).toBe(true)
  })

  it('needs eight missing words, not just a ratio', () => {
    // The next candidates below the ratio are all false positives with two or
    // three missing words — a ministry's name, a spelling. A ratio alone
    // cannot tell 2 of 12 from 39 of 89.
    const draftHasMost = bag('Die Behörde entscheidet über den Antrag. Rechtsgeschäfte über Grundstücke bedürfen zwingend')
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
    const check = rightColumnCheck(rows, STANDING, bag(written))
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

// ---------------------------------------------------------------------------
// The draft as a reference per §
// ---------------------------------------------------------------------------

describe('draftBags and draftReference', () => {
  const instruction = (text: string): TextBlock => ({ kind: 'novao', cls: 'absatz/novao1', text, gld: null })
  const NEIGHBOUR = 'Rechtsgeschäfte über Grundstücke bedürfen zwingend behördlicher Zustimmung wenn Nutzungsrechte begründet werden sollen.'
  /** Two instructions of one law: § 1 keeps its own text, § 2 gets the neighbour's. */
  const TWO = [instruction(`1. § 1 lautet: "${PROSE}"`), instruction(`2. § 2 lautet: "${NEIGHBOUR}"`)]
  /** § 1's block shows the *neighbour's* proposed text as new — the R-neu fault. */
  const draggedIn = (): ComparisonRow[] => [row({
    gld: '§ 1.',
    para: '§ 1.',
    current: PROSE,
    proposed: `${PROSE} ${NEIGHBOUR}`,
    segments: [{ type: 'equal', text: PROSE }, { type: 'inserted', text: NEIGHBOUR }],
  })]
  const standing: StandingText = { text: PROSE, heading: '' }
  /** What the annex prints a block of its own for. */
  const shown = (...keys: string[]): Set<string> => new Set(keys)

  it('catches a neighbour §s text that the whole draft let through', () => {
    // The fault the whole-draft reference cannot see: the words are in the
    // draft, only in another §. Measured over GP XXVIII, the wide bag caught
    // 12,0 % of these on the PDF path and 32,5 % on the table path; the
    // per-§ reference catches 75,6 % and 78,6 %.
    const bags = draftBags(TWO)
    expect(rightColumnCheck(draggedIn(), standing, { has: (w) => bags.whole.has(w), read: true }).notInDraft).toBe(false)
    const reference = draftReference(bags, null, shown('§ 1', '§ 2'))
    expect(rightColumnCheck(draggedIn(), standing, reference('§ 1.')).notInDraft).toBe(true)
  })

  it('does not fire on text of a § the annex shows no block of its own for', () => {
    // Where the annex prints no § 2, its text is not absent from the page —
    // it sits inside the block of § 1, whose designation the rows inherited.
    // "Not in the draft" would name the wrong finding; the draft has it, the
    // page has merged two provisions. Over GP XXVIII this takes the table
    // path from 15 alarms to 7.
    const reference = draftReference(draftBags(TWO), null, shown('§ 1'))
    expect(rightColumnCheck(draggedIn(), standing, reference('§ 1.')).notInDraft).toBe(false)
  })

  it('does not fire on words from an instruction nobody could address', () => {
    // An unreadable instruction may weaken the check and must never fail a §:
    // 13 % of the corpus's instructions land in that bag.
    const unreadable = [instruction(`1. § 1 lautet: "${PROSE}"`), instruction(`2. In den Bestimmungen dieses Bundesgesetzes: "${NEIGHBOUR}"`)]
    const bags = draftBags(unreadable)
    expect(bags.addressed).toBe(1)
    expect([...bags.reasons.values()].reduce((a, b) => a + b, 0)).toBe(1)
    const reference = draftReference(bags, null, shown('§ 1'))
    expect(rightColumnCheck(draggedIn(), standing, reference('§ 1.')).notInDraft).toBe(false)
  })

  it('pairs the two designations of a renumbering', () => {
    // The annex prints the § under the designation the standing law gives it,
    // while the instructions after the renumbering address its new number.
    // Four §§ of the table-path corpus read as unexplained without this —
    // three of them in a Verordnung that renumbers its whole text one up.
    const renumbered = [
      instruction('1. Der bisherige § 1 erhält die Paragraphenbezeichnung "§ 2." .'),
      instruction(`2. Der nunmehrige § 2 lautet: "${NEIGHBOUR}"`),
    ]
    const reference = draftReference(draftBags(renumbered), null, shown('§ 1', '§ 2'))
    const asNumberedToday = [row({
      gld: '§ 1.',
      para: '§ 1.',
      current: PROSE,
      proposed: NEIGHBOUR,
      segments: [{ type: 'removed', text: PROSE }, { type: 'inserted', text: NEIGHBOUR }],
    })]
    expect(rightColumnCheck(asNumberedToday, standing, reference('§ 1.')).notInDraft).toBe(false)
  })

  it('keeps the § 5 of two laws of one package apart', () => {
    const bags = draftBags([
      { kind: 'article', cls: 'ueberschrift/g1', text: 'Artikel 1', gld: null },
      { kind: 'section', cls: 'ueberschrift/g1min', text: 'Änderung des Aktiengesetzes', gld: null },
      instruction(`1. § 5 lautet: "${PROSE}"`),
      { kind: 'article', cls: 'ueberschrift/g1', text: 'Artikel 2', gld: null },
      { kind: 'section', cls: 'ueberschrift/g1min', text: 'Änderung des GmbH-Gesetzes', gld: null },
      instruction(`1. § 5 lautet: "${NEIGHBOUR}"`),
    ])
    const aktien = draftReference(bags, 'Änderung des Aktiengesetzes', shown('§ 5'))
    const rows = [row({ law: 'Änderung des Aktiengesetzes', gld: '§ 5.', para: '§ 5.', current: PROSE, proposed: `${PROSE} ${NEIGHBOUR}`, segments: [{ type: 'equal', text: PROSE }, { type: 'inserted', text: NEIGHBOUR }] })]
    expect(rightColumnCheck(rows, standing, aktien('§ 5.')).notInDraft).toBe(true)
  })

  it('falls back to the whole draft where no instruction could be read at all', () => {
    // Then the rule is exactly what shipped before — and it is still armed,
    // because the Gesetzestext was there to compare against.
    const noUnits = [{ kind: 'abs' as const, cls: 'absatz/abs', text: `${PROSE} ${NEIGHBOUR}`, gld: null }]
    const bags = draftBags(noUnits)
    expect(bags.units).toBe(0)
    const reference = draftReference(bags, null, shown('§ 1'))
    expect(reference('§ 1.').read).toBe(true)
    expect(rightColumnCheck(draggedIn(), standing, reference('§ 1.')).notInDraft).toBe(false)
  })

  it('stays disarmed where the Gesetzestext could not be read', () => {
    const reference = draftReference(draftBags([]), null, shown('§ 1'))
    expect(reference('§ 1.').read).toBe(false)
    expect(rightColumnCheck(draggedIn(), standing, reference('§ 1.')).notInDraft).toBe(false)
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

  it('stops the number at the first space, and has to', () => {
    // Whitespace inside a designation is never the document's: it is what a
    // parser makes of markup or of PDF geometry, and it has to be taken out
    // where it appears (for the annex table, `lawText.stripMarkup`, which the
    // designation has been read through since 2026-09-11). Gluing the parts
    // back together *here* was measured and decided against — the sequence
    // "numeral, space, numeral, full stop" is also how a real pair of
    // designations reads, and it is common:
    expect(designationKey('§ 5 3. Abschnitt')).toBe('§ 5')
    expect(designationKey('§ 5 Abs. 3')).toBe('§ 5')
    expect(designationKey('§§ 5 und 6')).toBe('§ 5')
  })

  it('ignores whatever stands beside the designation, and that was measured', () => {
    // The truncation is silent, so the question was whether an *unexplained*
    // remainder should make the key null — a row unkeyed and therefore never
    // checked against a possibly wrong §. Measured over GP XXVIII on
    // 2026-09-11: of the 11.169 table-path rows carrying a designation, 555
    // have anything at all beside it, and the classes are clean — but they say
    // the opposite of that rule. 434 of the 555 are schedule headings the
    // annex prints with their title ("Anlage 1 Mindestgliederung Bilanz",
    // "Anlage 3 zu § 10 und § 11"), and unkeying those would cost the §§ whose
    // key is right today to save the handful whose key is wrong. On the RIS
    // side the question does not arise at all: of the 1.959 distinct labels
    // the GP-XXVIII laws carry, **none** has a remainder, so `indexOf` reads
    // pure designations and its near-injectivity is untouched.
    expect(designationKey('Anlage 1 Mindestgliederung Bilanz')).toBe('Anl 1')
    expect(designationKey('Anlage 1 (wird hier nicht abgebildet)')).toBe('Anl 1')
  })

  it('reads a schedule title that cites §§ as a title, not as a name', () => {
    // The residual the same measurement named, and it was a *wrong* key rather
    // than a truncation: "Anlage 3 zu § 10 und § 11" became `Anl 3 § 10 § 11`,
    // which RIS never holds, so the § was looked up, missed, and left
    // unchecked — 12 §§ of GP XXVIII until 2026-09-11.
    expect(designationKey('Anlage 3 zu § 10 und § 11')).toBe('Anl 3')
    expect(designationKey('Anl. 1 zu § 5 Abs. 1')).toBe('Anl 1')
    expect(designationKey('Anlage 1 zu den §§ 5 und 6')).toBe('Anl 1')
    // The longest of the twelve, verbatim from the Bildungsdokumentations-VO.
    expect(designationKey('Anlage 1 zu § 5 Abs. 1, § 7 Abs. 1 und § 25 Teil I Daten der Schulen')).toBe('Anl 1')
    // The cut is a *joiner* between two parts, never a prefix. "Zu § 5" is how
    // the Erläuterungen head a section, and it names § 5 as surely as "§ 5"
    // does — there is no earlier designation for the word to separate from.
    expect(designationKey('Zu § 5')).toBe('§ 5')
    expect(designationKey('(zu § 5 Abs. 2)')).toBe('§ 5')
    // …so the one composite RIS *does* hold has to survive, and it does: its
    // parts are joined by a plain space. Every composite label reading in the
    // GP-XXVIII laws is of this shape (1.534 of 1.546), and the rule's own
    // predicate matches no RIS label anywhere in the offline corpus —
    // 0 of 195.875 occurrences, 0 of 4.251 distinct (2026-09-11).
    expect(designationKey('Art. 3 § 5')).toBe('Art 3 § 5')
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
