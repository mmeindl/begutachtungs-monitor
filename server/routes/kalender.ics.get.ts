/**
 * GET /kalender.ics — Begutachtungsfristen of the current GP, plus the ones
 * still running from the period before (§12.35), as an iCalendar
 * subscription (all-day events, stable UIDs). Reuses the cached
 * list-81 leaf; the route itself is uncached (architecture.md §5).
 * Calendar apps refresh on a schedule — ETag/304 keeps that cheap.
 */
export default defineEventHandler(async (event) => {
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const gp = await getCurrentGp()
  // Verordnungsfristen too — they are deadlines like any other, and this
  // calendar is the account-free substitute for the alerts that are not
  // built (docs/architecture.md §12.3, §12.16).
  const [{ items }, risOnly, carryOver] = await Promise.all([
    getDraftsForGp(gp),
    getRisOnlyForGp(gp),
    /* The Fristen that outlive a Periodenwechsel (§12.35). This is the
     * subscription that makes the case: a calendar app replaces the whole
     * event set on every refresh, so without this a Frist still 18 days away
     * would simply have fallen out of the subscriber's calendar on the day
     * the new period convened (352/ME, 24.10.2024). */
    getCarryOverDrafts(gp),
  ])
  // Both halves get their `active` at request time, never from a cache:
  // `reconcileActive` for list 81, `withRisActiveOn` for the RIS records.
  const body = buildIcsCalendar(
    siteUrl,
    [...items.map(reconcileActive), ...carryOver],
    withRisActiveOn(risOnly.items),
  )

  return respondWithEtag(event, body, 'text/calendar; charset=utf-8')
})
