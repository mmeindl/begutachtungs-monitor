/**
 * GET /api/suche?q=… → BegutSearchResponse: welche der laufenden
 * Begutachtungen dieses Stichwort in ihren Dokumenten führen
 * (docs/architecture.md §12.31).
 *
 * Ohne `q` ist die Antwort die leere Suche mit `corpusSize` — die Seite kann
 * damit sagen, worüber gesucht wird, bevor jemand etwas eingibt.
 *
 * Die Länge ist begrenzt, weil jede Anfrage eine Anfrage ans RIS auslöst und
 * der Parameter ungefiltert dorthin geht. Zu kurz ist kein Stichwort, zu
 * lang ist keine Suche.
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
