/**
 * The handler behind `/entwuerfe/<land>/<number>/frist.ics` (22.10.2026): a
 * Land's draft as a single-event iCalendar file, „Frist in den Kalender" on
 * its page. One route file per Land, because a static segment is what keeps
 * the path from `[gp]/[inr]/frist.ics`; the body is this one function.
 *
 * Through the shared ICS builder (`buildIcsCalendar`), so the UID is the one
 * the Länder will carry in `/kalender.ics` too and importing both never
 * duplicates the event.
 */
import type { H3Event } from 'h3'
import type { LandCode } from '#shared/types'
import { readLandDraft } from './sources'
import { buildIcsCalendar } from '../feeds'
import { respondWithEtag } from '../http/respond'

export async function landFristIcs(event: H3Event, land: LandCode, valid: RegExp) {
  const number = getRouterParam(event, 'id') ?? ''
  if (!valid.test(number)) throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  const detail = await readLandDraft(land, number)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  if (!detail.draft.deadline) throw createError({ statusCode: 404, statusMessage: 'Dieser Entwurf hat keine Frist' })
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  return respondWithEtag(event, buildIcsCalendar(siteUrl, [], [], [detail.draft]), 'text/calendar; charset=utf-8')
}
