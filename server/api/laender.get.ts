/**
 * GET /api/laender → LaenderResponse: the running Begutachtungen of the
 * Länder the monitor reads, and per Land whether it could be read
 * (`utils/laender/sources.ts`).
 *
 * Always every Land: the reader's choice is applied on the page, so one
 * cached answer serves every choice.
 */
import type { LaenderResponse } from '#shared/types'
import { readLaender } from '../utils/laender/sources'

export default defineEventHandler((): Promise<LaenderResponse> => readLaender())
