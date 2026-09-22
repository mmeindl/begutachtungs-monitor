/**
 * Query-param normalization shared by app pages (route.query) and server
 * routes (getQuery) — ONE contract: first value, trimmed, empty → undefined.
 */
export function firstQueryValue(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}
