/**
 * GET /kalender.ics — Begutachtungsfristen of the current GP as an
 * iCalendar subscription (all-day events, stable UIDs). Reuses the cached
 * list-81 leaf; the route itself is uncached (architecture.md §5).
 * Calendar apps refresh on a schedule — ETag/304 keeps that cheap.
 */
export default defineEventHandler(async (event) => {
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const gp = await getCurrentGp()
  // Verordnungsfristen too — they are deadlines like any other, and this
  // calendar is the account-free substitute for the alerts that are not
  // built (docs/architecture.md §12.3, §12.16).
  const [{ items }, risOnly] = await Promise.all([getDraftsForGp(gp), getRisOnlyForGp(gp)])
  // Both halves get their `active` at request time, never from a cache:
  // `reconcileActive` for list 81, `withRisActiveOn` for the RIS records.
  const body = buildIcsCalendar(siteUrl, items.map(reconcileActive), withRisActiveOn(risOnly.items))

  return respondWithEtag(event, body, 'text/calendar; charset=utf-8')
})
