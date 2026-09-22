import { describe, expect, it } from 'vitest'
import { draftTextOf } from '../server/utils/annex/draftText'

describe('draftTextOf', () => {
  it('keeps the Gliederungssymbol, because a § marker is text on this side', () => {
    expect(draftTextOf([
      { kind: 'abs', cls: 'absatz/abs', text: 'Die Behörde entscheidet.', gld: '§ 5.' },
      { kind: 'abs', cls: 'absatz/abs', text: 'Der Bescheid ergeht schriftlich.', gld: null },
    ])).toBe('§ 5. Die Behörde entscheidet.  Der Bescheid ergeht schriftlich.')
  })

  it("reads a unit's blocks exactly as it reads the whole draft", () => {
    const blocks = [
      { kind: 'abs' as const, cls: 'absatz/abs', text: 'Erster Satz.', gld: '§ 1.' },
      { kind: 'abs' as const, cls: 'absatz/abs', text: 'Zweiter Satz.', gld: null },
    ]
    expect(draftTextOf(blocks.slice(0, 1)) + ' ' + draftTextOf(blocks.slice(1))).toBe(draftTextOf(blocks))
  })
})
