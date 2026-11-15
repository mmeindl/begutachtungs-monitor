/**
 * The addresses that open Parliament's Stellungnahme forms
 * (`shared/utils/statementForm.ts`). That Parliament honours them is checked
 * in a browser, not here; this pins the shape that check confirmed.
 */
import { describe, expect, it } from 'vitest'
import { statementFormUrl } from '../shared/utils/statementForm'

const ME = 'https://www.parlament.gv.at/gegenstand/XXVIII/ME/162'

describe('statementFormUrl', () => {
  it('opens the Privatperson form — Parliament\'s own formlink', () => {
    expect(statementFormUrl(ME, 'person')).toBe(`${ME}?selectedStage=101&persForm=1#persForm`)
  })

  it('opens the Institution/Organisation form', () => {
    expect(statementFormUrl(ME, 'organisation')).toBe(`${ME}?selectedStage=101&orgForm=1#orgForm`)
  })

  it('replaces a query or fragment the item address already carries', () => {
    expect(statementFormUrl(`${ME}?selectedStage=101&FP_142_vhgsortrnr=6#x`, 'person'))
      .toBe(`${ME}?selectedStage=101&persForm=1#persForm`)
  })
})
