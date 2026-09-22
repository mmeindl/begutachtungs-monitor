/**
 * GET /api/suche?q=… → BegutSearchResponse: which of the running
 * Begutachtungen carry this keyword in their documents
 * (docs/architecture.md §12.31).
 *
 * Without `q` the answer is the empty search with `corpusSize` — the page
 * can say what is being searched before anyone has typed anything.
 *
 * The length is capped, because every request triggers a request to RIS and
 * the parameter goes there unfiltered. Too short is not a keyword, too long
 * is not a search.
 */
import type { BegutSearchResponse } from '#shared/types'

const MAX_QUERY_LEN = 100

export default defineEventHandler(async (event): Promise<BegutSearchResponse> => {
  const raw = firstQueryValue(getQuery(event).q) ?? ''
  if (raw.length > MAX_QUERY_LEN) {
    throw createError({ statusCode: 400, statusMessage: 'Die Suche ist zu lang' })
  }
  return searchRunningBegut(raw)
})
