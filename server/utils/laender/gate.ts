import type { LandCode } from '#shared/types'

/**
 * A Land's page was fetched but is not the list it should be (`salzburg.ts`,
 * „THE GATE"). Thrown, never caught into an empty list: the Land then reads
 * as „nicht abrufbar", and the cache keeps nothing.
 */
export class LandSourceError extends Error {
  constructor(
    readonly land: LandCode,
    reason: string,
  ) {
    super(`${land}: ${reason}`)
    this.name = 'LandSourceError'
  }
}
