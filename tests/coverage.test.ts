import { describe, expect, it } from 'vitest'
import { coverageOf, coverageOfParagraph, displayedChangeRows } from '../server/utils/annex/coverage'
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
