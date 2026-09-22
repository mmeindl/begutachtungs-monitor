/**
 * The fixture shapes that were written out three and four times over.
 *
 * Not collected by vitest: its `include` matches `.test.ts` only, so a file under
 * `helpers/` is a module, not a suite. `tsconfig.tools.json` does typecheck
 * it.
 *
 * WHAT BELONGS HERE and what does not. A builder here carries the SHAPE — the
 * eleven fields of a `DraftSummary`, the ten of a `ComparisonRow` — and one
 * specimen's worth of defaults so a test that cares about none of them can
 * write `draftSummary()`. The SAMPLE VALUES stay in the test that asserts on
 * them: `precedingDraft.test.ts` is about 73/ME Gewerbeordnung and says so in
 * its own file, because a reader checking that test against the real draft
 * must not have to open a second one. So the builders take overrides, and a
 * test that reads off a document passes what it reads.
 *
 * The large inline synthetic documents stay in their test files too, for the
 * reason `annexGolden.test.ts` gives at the top of itself.
 */
import type { ComparisonRow } from '../../server/utils/annex/comparisonRows'
import type { DraftArticle } from '../../server/utils/lawtext/draftArticles'
import { makeNode, type LawNode } from '../../server/utils/lawtext/konsTree'
import type { DraftSummary, RisConsultation } from '../../shared/types'

// ---------------------------------------------------------------------------
// The annex: rows and the draft they belong to
// ---------------------------------------------------------------------------

/** One row of a Textgegenüberstellung, defaulting to a changed § 5 with no text. */
export const comparisonRow = (over: Partial<ComparisonRow> = {}): ComparisonRow => ({
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

/** One Artikel of a draft, defaulting to an amending Artikel 1 with a Stammnorm. */
export const draftArticle = (over: Partial<DraftArticle> = {}): DraftArticle => ({
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
 * The draft an annex belongs to, written as the annex tests need it: every law
 * boundary in an annex has to be one of the draft's own Artikel, so a fixture
 * that expects a boundary has to say which draft it is an annex to.
 *
 * `n` is the numeral („3", „VI"), and the key is the title where there is one —
 * which is how `draftArticles` keys a draft with no Artikel structure, the
 * shape of two drafts in three. No Stammnorm: these tests resolve laws by
 * title, not by BGBl number.
 */
export function draftArticles(...articles: { n?: string; title?: string | null; amends?: boolean }[]): DraftArticle[] {
  return articles.map((a, index) => ({
    index,
    number: a.n ? `Artikel ${a.n}` : null,
    numeral: a.n ?? null,
    title: a.title ?? null,
    key: a.title ?? (a.n ? `Artikel ${a.n}` : null),
    amends: a.amends ?? true,
    bgbl: null,
  }))
}

// ---------------------------------------------------------------------------
// The right column: „bereits geltend" and „nicht im Entwurf"
// ---------------------------------------------------------------------------

/** A § of three sentences, as RIS holds it. */
export const STANDING_BODY = 'Die Behörde entscheidet über den Antrag. Der Bescheid ergeht schriftlich und ist zu begründen. Eine Beschwerde hat keine aufschiebende Wirkung.'

/** The middle sentence — what a parse loses on the left and the diff then paints green. */
export const LOST = 'Der Bescheid ergeht schriftlich und ist zu begründen.'
export const KEPT = 'Die Behörde entscheidet über den Antrag. Eine Beschwerde hat keine aufschiebende Wirkung.'

/** The § after the left column lost `LOST`: the word diff calls it an addition. */
export function lostSentenceRows(current = KEPT): ComparisonRow[] {
  return [comparisonRow({
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
export const FOREIGN = 'Rechtsgeschäfte über Grundstücke bedürfen zwingend behördlicher Zustimmung wenn Nutzungsrechte begründet werden sollen.'

export function foreignRows(): ComparisonRow[] {
  return [comparisonRow({
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

/** Prose long enough to be judged — below `MIN_PROSE_TOKENS` nothing is. */
export const PROSE = 'Die Behörde entscheidet über den Antrag binnen sechs Wochen nach seiner Einbringung.'

// ---------------------------------------------------------------------------
// Standing law
// ---------------------------------------------------------------------------

/**
 * A § with numbered Absätze, the shape RIS BrKons delivers.
 *
 * A plain string is an Absatz of running text; the object form gives it
 * Ziffern, which is what the instruction grammar addresses with „Z 2".
 */
export function paraNode(id: string, heading: string, absaetze: (string | { text: string; ziffern: string[] })[]): LawNode {
  const node = makeNode('para', id, `§ ${id}.`, '', heading)
  absaetze.forEach((a, i) => {
    const abs = makeNode('abs', String(i + 1), `(${i + 1})`, typeof a === 'string' ? a : a.text)
    if (typeof a !== 'string') a.ziffern.forEach((z, j) => abs.children.push(makeNode('z', String(j + 1), `${j + 1}.`, z)))
    node.children.push(abs)
  })
  return node
}

// ---------------------------------------------------------------------------
// The list entries
// ---------------------------------------------------------------------------

/** A Ministerialentwurf as the list and the feeds carry it — 88/ME by default. */
export function draftSummary(over: Partial<DraftSummary> = {}): DraftSummary {
  return {
    gp: 'XXVIII',
    inr: 88,
    citation: '88/ME',
    title: 'Umsatzsteuergesetz, Änderung',
    ministryCode: 'BMF',
    ministryName: 'Bundesministerium für Finanzen',
    arrivedAt: '2026-03-11',
    deadline: '2026-04-08',
    active: false,
    statementCount: 707,
    parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/ME/88',
    ...over,
  }
}

/**
 * A Begutachtung without a parliamentary Gegenstand (docs/architecture.md
 * §12.16). `outcome: null` is the normal case and means "not determined",
 * never "nothing came of it".
 */
export function risConsultation(over: Partial<RisConsultation> = {}): RisConsultation {
  return {
    id: 'BEGUT_C769778C_3342_41D1_A1DF_931D7F4BBF1B',
    kind: 'verordnung',
    outcome: null,
    title: 'Änderung der Druckgeräteaufstellungsverordnung – DGAV',
    longTitle: null,
    ministryCode: 'BMWET',
    ministryName: 'Bundesministerium für Wirtschaft, Energie und Tourismus',
    startedAt: '2026-09-08',
    deadline: '2026-10-19',
    active: true,
    risUrl: 'https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Begut&Dokumentnummer=BEGUT_C769778C_3342_41D1_A1DF_931D7F4BBF1B',
    ...over,
  }
}
