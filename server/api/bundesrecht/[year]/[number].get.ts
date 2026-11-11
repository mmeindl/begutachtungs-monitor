/**
 * GET /api/bundesrecht/:year/:number?gp= → BundLandActResponse: one
 * Grundsatzgesetz by its Kundmachung in BGBl I — its record, its Frist
 * clause in its own words, the Ministerialentwurf where its text carried
 * the Grundsatz content — and the Land drafts of the window that carry it
 * out. Two dates and a stand per draft, no
 * verdict (rule D6).
 *
 * 400 for a number that is none, 404 for an act the map does not hold, 503
 * while no build has finished — the page must not say „no draft" where
 * nobody has looked.
 */
import type { BundLandActResponse } from '#shared/types'
import { withLandActiveOn } from '../../../utils/laender/sources'
import { gpFromParam, readGpQuery, requirePlausibleGp } from '../../../utils/http/params'
import { actHeadOf, getBundLandMap } from '../../../utils/bund-land/bundLandMapService'
import { bgblKeyOf } from '../../../utils/bund-land/bundesgesetzblatt'

export default defineEventHandler(async (event): Promise<BundLandActResponse> => {
  const year = getRouterParam(event, 'year') ?? ''
  const number = getRouterParam(event, 'number') ?? ''
  if (!/^(?:19|20)\d{2}$/.test(year) || !/^[1-9]\d{0,3}$/.test(number)) throw createError({ statusCode: 400, statusMessage: 'Ungültige BGBl.-Nummer' })
  const currentGp = await getCurrentGp()
  const gp = requirePlausibleGp(gpFromParam(readGpQuery(event), currentGp), currentGp)
  const map = await getBundLandMap(gp)
  if (!map) throw createError({ statusCode: 503, statusMessage: 'Die Übersicht wird gerade aufgebaut' })
  const act = map.acts[bgblKeyOf({ year: Number(year), number: Number(number) })]
  if (!act) throw createError({ statusCode: 404, statusMessage: 'Kein Grundsatzgesetz unter dieser Nummer' })
  const head = await actHeadOf(act)
  if (!head) throw createError({ statusCode: 503, statusMessage: 'Das RIS antwortet gerade nicht' })
  return {
    gp,
    window: map.window,
    builtAt: map.builtAt,
    act: head,
    // `active` per request, as the lists decide it: the map is cached for hours.
    drafts: act.drafts.map((d) => (d.row.kind === 'land' ? { ...d, row: { ...d.row, item: withLandActiveOn([d.row.item])[0]! } } : d)),
    incomplete: map.incomplete,
  }
})
