/**
 * GET /api/statistik → StatistikPayload: the page-view counts of the last
 * 30 days and since counting began (docs/architecture.md §12.65).
 */
import type { StatistikPayload } from '#shared/types'
import { getStatistik } from '../utils/zaehlung/statistikService'

export default defineEventHandler((): Promise<StatistikPayload> => getStatistik())
