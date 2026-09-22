/**
 * GET /entwuerfe/:id/frist.ics — one Begutachtung without a Gegenstand as
 * a single-event iCalendar file ("Frist in den Kalender" on the detail page).
 *
 * The exact counterpart of `/entwuerfe/:gp/:inr/frist.ics`, and for the same
 * reason: it reuses the shared ICS builder, so the UID is identical to the
 * event in the full `/kalender.ics` subscription and importing both never
 * duplicates it.
 *
 * It matters more here than there. On a Ministerialentwurf the Frist is one
 * of several ways to act — parliament's form, the Stellungnahmen list, the
 * later stations. On these pages the Frist plus the Begleitschreiben is the
 * whole of it (docs/architecture.md §12.16), so the calendar file is half
 * the page's actionable surface, not a convenience.
 */
import { readRisId } from '../../../utils/http/params'

export default defineEventHandler(async (event) => {
  // A page route, so a malformed id is 404 and not 400 (`http/params.ts`).
  const id = readRisId(event, { notFoundOnInvalid: true })

  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const item = await getRisConsultation(id)
  if (!item) {
    throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  }
  if (!item.deadline) {
    throw createError({ statusCode: 404, statusMessage: 'Dieser Entwurf hat keine Frist' })
  }

  const body = buildIcsCalendar(siteUrl, [], [item])

  return respondWithEtag(event, body, 'text/calendar; charset=utf-8')
})
