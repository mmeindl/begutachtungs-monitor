import { describe, expect, it } from 'vitest'
import { DRAFT_THRESHOLD, MIN_MISSING_WORDS, MIN_NEW_WORDS, MIN_STANDING_STRETCH, draftBags, draftReference, draftWordBag, insertedStretches, rightColumnCheck, type StandingText, type WordBag } from '../server/utils/annex/rightColumn'
import type { TextBlock } from '../server/utils/lawtext/lawUnits'
import type { ComparisonRow } from '../server/utils/annex/comparisonRows'

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

/** Prose long enough to be judged — the same fixture `verdict.test.ts` drafts against. */
const PROSE = 'Die Behörde entscheidet über den Antrag binnen sechs Wochen nach seiner Einbringung.'

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
    // right column may draw on. Fault U of `scripts/harness/faultInjection.ts`
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
