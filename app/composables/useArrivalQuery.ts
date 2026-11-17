import { MAX_LIST_QUERY_CHARS, firstQueryValue } from '#shared/utils/queryParams'

/**
 * The search term a link brought (`?q=`), read once on arrival — the site
 * search's „In dieser Liste ansehen" (`/suche`, 17.11.2026). For the lists
 * on `/eu-recht`, which keep their search out of the address: the term
 * seeds every field there, and typing changes the field, not the address.
 */
export function useArrivalQuery(): string {
  const route = useRoute()
  return (firstQueryValue(route.query.q) ?? '').slice(0, MAX_LIST_QUERY_CHARS).trim()
}
