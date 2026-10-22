import { describe, expect, it } from 'vitest'
import { amendmentChain, followsOn, lastAmendments } from '../server/utils/laender/amendmentChain'

const clause = (last: string) => `Das Salzburger Schulorganisations-Ausführungsgesetz 1995 – SchuOG 1995, LGBl Nr 64, zuletzt geändert durch das Gesetz LGBl Nr ${last}, wird geändert wie folgt:`

describe('amendmentChain — does a Kundmachung follow on from the draft', () => {
  it('reads the Stammnorm without its year, as Salzburg prints it', () => {
    expect(lastAmendments(clause('49/2022'))).toEqual(new Map([['64', '49/2022']]))
    expect(lastAmendments('Das X-Gesetz, LGBl. Nr. 12/2001, zuletzt geändert durch LGBl. Nr. 7/2020, wird geändert:')).toEqual(new Map([['12', '7/2020']]))
  })

  it('is „same" for a draft and its own Kundmachung', () => {
    expect(amendmentChain(clause('49/2022'), clause('49/2022'))).toBe('same')
  })

  it('is „differ" for a later amendment of the same law (sbg-27156 against LGBl. Nr. 40/2024)', () => {
    expect(amendmentChain(clause('49/2022'), clause('13/2024'))).toBe('differ')
  })

  it('is „none" where the texts cite no law in common — a new law', () => {
    expect(amendmentChain('Gesetz zur Regelung des Grundverkehrs', clause('49/2022'))).toBe('none')
  })
})

describe('followsOn — the rule a searched Kundmachung must pass', () => {
  it('takes the same last amendment, and a single candidate where there is nothing to compare', () => {
    expect(followsOn('same', false)).toBe(true)
    expect(followsOn('none', true)).toBe(true)
    expect(followsOn('none', false)).toBe(false)
    expect(followsOn('differ', true)).toBe(false)
  })
})
