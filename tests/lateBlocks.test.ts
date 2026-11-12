import { describe, expect, it } from 'vitest'
import { blockStateLine, settledCount } from '../app/utils/lateBlocks'
import { halfState, pendingHalvesLine } from '../app/utils/draftFilters'

/* The homepage's late blocks (12.11.2026): a block that missed the server's
 * deadline arrives as `null` without an error, and every count and sentence
 * that reads it must say „noch geladen", never „none" and never „nicht
 * abrufbar". */

describe('settledCount', () => {
  it('holds the number back while a block it sums over is on its way', () => {
    expect(settledCount(7, ['ready', 'loading'])).toBeUndefined()
    expect(settledCount(0, ['loading'])).toBeUndefined()
  })

  it('counts once every block has answered, failed or not asked for', () => {
    expect(settledCount(7, ['ready', 'off'])).toBe(7)
    expect(settledCount(3, ['ready', 'failed'])).toBe(3)
    expect(settledCount(5, [])).toBe(5)
  })

  it('reads the server’s missed deadline as pending: null data, no error', () => {
    expect(settledCount(5, [halfState(true, null, undefined)])).toBeUndefined()
  })
})

describe('blockStateLine', () => {
  it('tells pending from failed in words', () => {
    const pending = blockStateLine('Die Kundmachungen des Bundes', 'plural', 'loading')
    const failed = blockStateLine('Die Kundmachungen des Bundes', 'plural', 'failed')
    expect(pending).toBe('Die Kundmachungen des Bundes werden noch geladen.')
    // The page's existing failure sentence, word for word.
    expect(failed).toBe('Die Kundmachungen des Bundes sind gerade nicht abrufbar.')
    expect(pending).not.toContain('nicht abrufbar')
  })

  it('conjugates a clause subject in the singular', () => {
    expect(blockStateLine('Was aus den Entwürfen wurde,', 'singular', 'loading')).toBe('Was aus den Entwürfen wurde, wird noch geladen.')
    expect(blockStateLine('Was aus den Entwürfen wurde,', 'singular', 'failed')).toBe('Was aus den Entwürfen wurde, ist gerade nicht abrufbar.')
  })

  it('says nothing where the block is there or not asked for', () => {
    expect(blockStateLine('Die Kundmachungen des Bundes', 'plural', 'ready')).toBeNull()
    expect(blockStateLine('Die Kundmachungen des Bundes', 'plural', 'off')).toBeNull()
  })
})

describe('pendingHalvesLine', () => {
  it('speaks the count line’s pending terms, as a sentence', () => {
    expect(pendingHalvesLine(true, null)).toBe('Die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen.')
    expect(pendingHalvesLine(false, ['sbg'])).toBe('Die Entwürfe des Landes Salzburg werden noch geladen.')
    expect(pendingHalvesLine(false, ['w'])).toBe('Die Entwürfe Wiens werden noch geladen.')
    expect(pendingHalvesLine(true, ['sbg', 'w'])).toBe(
      'Die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen · die Entwürfe der Länder werden noch geladen.',
    )
  })

  it('is null when nothing is pending, an empty choice included', () => {
    expect(pendingHalvesLine(false, null)).toBeNull()
    expect(pendingHalvesLine(false, [])).toBeNull()
  })

  it('never claims a failure', () => {
    expect(pendingHalvesLine(true, ['sbg'])).not.toContain('nicht abrufbar')
  })
})
