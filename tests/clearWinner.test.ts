import { describe, expect, it } from 'vitest'
import { pickClearWinner } from '../server/utils/text/clearWinner'

/** Candidates as both joins hand them over: something with a name on it. */
const named = (...names: string[]): { name: string }[] => names.map((name) => ({ name }))
const nameOf = (c: { name: string }): string => c.name

describe('pickClearWinner', () => {
  it('takes the one candidate that fits clearly better', () => {
    const got = pickClearWinner(named('Umsatzsteuergesetz 1994', 'Einkommensteuergesetz 1988'), 'Umsatzsteuergesetz 1994', nameOf, 0.6)
    expect(got?.name).toBe('Umsatzsteuergesetz 1994')
  })

  it('refuses a tie rather than taking the first', () => {
    expect(pickClearWinner(named('Bundesgesetz über das Wasser', 'Bundesgesetz über das Wasser'), 'Bundesgesetz über das Wasser', nameOf, 0.6)).toBeNull()
  })

  it('refuses when the best candidate is below the threshold', () => {
    expect(pickClearWinner(named('Tabakgesetz'), 'Ärztegesetz 1998', nameOf, 0.6)).toBeNull()
  })

  it('is null without candidates', () => {
    expect(pickClearWinner([], 'Tabakgesetz', nameOf, 0.6)).toBeNull()
  })
})
