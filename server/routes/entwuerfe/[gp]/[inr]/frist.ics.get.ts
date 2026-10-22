/**
 * GET /entwuerfe/:gp/:inr/frist.ics — the one consultation's Frist as
 * a single-event iCalendar file ("Frist in den Kalender" on the detail
 * page). Reuses the cached list-81 leaf and the shared ICS builder, so the
 * UID stays identical to the event in the full /kalender.ics subscription —
 * importing both never duplicates the event.
 *
 * The row through `requireDraft`, not `.find`: a draft two Ressorts sent
 * stands in list 81 twice, and `.find` took whichever upstream returned
 * first and dropped the other Ressort from the event — which /kalender.ics,
 * folding, names. `requireDraft` folds the same way and 404s the same way.
 */
import { GP_RE, parseInr } from '#shared/utils/gp'

export default defineEventHandler(async (event) => {
  const gp = String(getRouterParam(event, 'gp') ?? '').toUpperCase()
  const inrRaw = String(getRouterParam(event, 'inr') ?? '')
  const inr = parseInr(inrRaw)
  if (!GP_RE.test(gp) || inr === null) {
    throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  }

  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const item = await requireDraft(gp, inr)
  if (!item.deadline) {
    throw createError({ statusCode: 404, statusMessage: 'Dieser Entwurf hat keine Frist' })
  }

  const body = buildIcsCalendar(siteUrl, [item])

  return respondWithEtag(event, body, 'text/calendar; charset=utf-8')
})
