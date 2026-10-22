/**
 * Query-param normalization shared by app pages (route.query) and server
 * routes (getQuery) — ONE contract: first value, trimmed, empty → undefined.
 */
export function firstQueryValue(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

/**
 * The longest `?q=` the two list endpoints take, and the most words in it —
 * here, in `shared/`, because the search field on `/entwuerfe` sets the same
 * length as its `maxlength` (22.10.2026).
 *
 * Beyond them there is no search, only cost. Each word is a substring test
 * on every row, in two readings, so the work grows with words times rows:
 * a 14,7 KB query of 4.900 words that all occur cost 139 ms per pass over
 * GP XXVII's 350 rows, and still 18 ms once the query was folded only once
 * (`textMatch.queryReadings`) — while one client may send 240 requests at
 * once (`RATE_RULES.global`). Measured 22.10.2026; under both caps the worst
 * pass costs 0,7 ms.
 *
 * Both numbers stand above what a reader can produce. The longest text a
 * row is searched by is a RIS long title, 741 characters and 77 words (GP
 * XXVIII, 22.10.2026; the Ministerialentwürfe stop at 254 characters), and
 * pasting a whole title is a normal way to find a draft again. The field on
 * `/entwuerfe` takes no more than this (`maxlength`), so a reader typing
 * meets the limit there and never as an error card. Words are counted in
 * both readings, because the folded one splits at punctuation too: „a,b,c"
 * is one word as typed and three folded.
 *
 * 400, as `/api/suche` answers above its own cap, and not a query cut short:
 * a shortened query answers a different question, and a list that quietly
 * searched for less than was typed would read as an answer.
 */
export const MAX_LIST_QUERY_CHARS = 1_000
export const MAX_LIST_QUERY_TERMS = 100
