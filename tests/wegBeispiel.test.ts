import { describe, expect, it } from 'vitest'
import type { ConsolidatedParagraph } from '../shared/types'
import { WEG_BEISPIEL } from '../shared/utils/genauigkeit'
import { wegBeispielFailures } from '../scripts/lib/wegBeispiel'

/**
 * The § `/genauigkeit` walks through its steps is typed into the page and
 * told in the present tense. A measuring round asks its draft anyway, so it
 * holds the page's telling against the answer (20.11.2026).
 */
const shown = (over: Partial<ConsolidatedParagraph> = {}): ConsolidatedParagraph => ({
  id: '6a',
  segments: [
    { type: 'equal', text: 'Der Bund hat dem Sozial- und Weiterbildungsfonds … ab dem Jahr ' },
    { type: 'removed', text: '2027' },
    { type: 'inserted', text: '2029' },
    { type: 'equal', text: ' jährlich eineinhalb Mio. € …' },
  ],
  headingSegments: null,
  risUrl: null,
  annexLaw: 'Änderung des Arbeitsmarktpolitik-Finanzierungsgesetzes',
  ...over,
})

describe('wegBeispielFailures', () => {
  it('finds nothing where the draft shows the § as the page tells it', () => {
    expect(wegBeispielFailures({ paragraphs: [shown({ annexLaw: 'Änderung des Umweltförderungsgesetzes', segments: [] }), shown()] })).toEqual([])
  })

  it('says so where the § is not shown as a whole paragraph, though another law\'s § 6a is', () => {
    const failures = wegBeispielFailures({ paragraphs: [shown({ annexLaw: 'Änderung des Umweltförderungsgesetzes' })] })
    expect(failures).toEqual([expect.stringMatching(/^beispiel: § 6a Arbeitsmarktpolitik-Finanzierungsgesetz ist nicht als ganzer Paragraph gezeigt/)])
  })

  it('says so where the § is shown on the second reading: the page says the check was passed', () => {
    const failures = wegBeispielFailures({ paragraphs: [shown({ draftWitness: [{ annex: 'dem Jahr 2028', draft: 'dem Jahr 2029' }] })] })
    expect(failures).toEqual([expect.stringContaining('zweiten Lesung')])
  })

  it('says so where the § shows another change than the page prints', () => {
    const failures = wegBeispielFailures({ paragraphs: [shown({ segments: [{ type: 'removed', text: '2027' }, { type: 'inserted', text: '2030' }] })] })
    expect(failures).toEqual([expect.stringContaining('removed:2027|inserted:2030')])
  })

  it('reads the § and the law from the page\'s own example', () => {
    expect(WEG_BEISPIEL.para).toBe('§ 6a')
    expect(WEG_BEISPIEL.draft.citation).toBe('116/ME')
  })
})
