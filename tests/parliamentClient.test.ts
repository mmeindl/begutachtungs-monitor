import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFilterList, fetchGegenstand } from '../server/utils/upstream/parliament'

/**
 * How much the Parliament client reads before it refuses
 * (`server/utils/upstream/parliament.ts`, 22.10.2026).
 *
 * Two caps, because one list is a hundred times the rest: list 142 of one
 * Ministerialentwurf reaches ~42 MB and gets 64 MB, every other answer stays
 * under 300 KB and gets 8 MB. What is under test is the pairing — the wrong
 * one either breaks the largest legitimate read or lets twelve parallel
 * answers grow eight times past their need.
 */

const MB = 1024 * 1024

/** An endless answer without a length, one megabyte at a time, counting what was pulled. */
function serveEndless(): { pulled: () => number } {
  const chunk = new Uint8Array(MB).fill(32)
  let pulled = 0
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulled += MB
            controller.enqueue(chunk)
          },
        }),
      ),
    ),
  )
  return { pulled: () => pulled }
}

const tooLarge = { statusCode: 502, statusMessage: 'Antwort der Parlament-API zu groß' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Parliament answer caps', () => {
  it('reads list 142 up to 64 MB', async () => {
    const { pulled } = serveEndless()
    await expect(fetchFilterList(142, { BEZUG_GP_CODE: ['XXVII'] })).rejects.toEqual(tooLarge)
    expect(pulled()).toBeGreaterThan(64 * MB)
    expect(pulled()).toBeLessThanOrEqual(66 * MB)
  })

  it('reads every other list up to 8 MB', async () => {
    const { pulled } = serveEndless()
    await expect(fetchFilterList(81, { GP_CODE: ['XXVII'] })).rejects.toEqual(tooLarge)
    expect(pulled()).toBeGreaterThan(8 * MB)
    expect(pulled()).toBeLessThanOrEqual(10 * MB)
  })

  it('reads a Gegenstand up to 8 MB', async () => {
    const { pulled } = serveEndless()
    await expect(fetchGegenstand('XXVII', 'ME', 164)).rejects.toEqual(tooLarge)
    expect(pulled()).toBeLessThanOrEqual(10 * MB)
  })
})
