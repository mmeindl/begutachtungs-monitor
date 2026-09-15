/**
 * Name search for the Stellungnahmen lists (auto-imported by Nuxt from
 * shared/utils).
 *
 * Why a field of our own, on a page that ships every organisation name in
 * its SSR HTML: Cmd+F is the reflex, and it loses on this list three times
 * over.
 *
 *   - It cannot fold "Oesterreichischer" onto "Österreichischer". On a list
 *     where a third of the names begin that way, that is not a corner case.
 *   - `line-clamp-3` cuts names after three lines, and the tail is exactly
 *     where these names differ ("Amt der Kärntner Landesregierung;
 *     Abteilung 1 – Verfassungsdienst"). Find-in-page scrolls to a match it
 *     then leaves visually clipped; a filter puts the row on screen.
 *   - Searched for a private person's name it answers with silence, which
 *     reads as "did not file" when the truth is "we do not publish that"
 *     (GDPR, CLAUDE.md). A field of ours can say which one it is.
 *
 * The overflow rows stay findable all the same — `hidden="until-found"` in
 * the panel — because the field needs JavaScript and the SSR HTML does not.
 */

/* ONE of the two spellings, both folded onto it: a reader who types
 * "Muller", "Mueller" or "Müller" is looking for the same office, and which
 * transliteration the ministry's own clerk chose is not something they can
 * be expected to guess. Folding "ue" → "u" also hits genuine digraphs
 * ("Quelle" → "qulle"), which is harmless: both sides of the comparison go
 * through the same function, so the pair still matches. */
const UMLAUT_FOLD: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', ß: 'ss' }

/**
 * A string reduced to what a search should compare: lowercase, umlauts and
 * their transliterations folded, diacritics stripped, every punctuation run
 * one space.
 *
 * Deliberately NOT `orgMatchKey` (server/utils/mappers.ts), which folds for
 * near-duplicate DETECTION — that one is tuned to decide whether two names
 * are the same office, and its own comment warns it is never a display
 * name. Two jobs, two functions, each free to drift.
 *
 * Punctuation-folding is what lets a reader find "Amt der Wiener
 * Landesregierung; Magistratsdirektion - Recht" without reproducing the
 * semicolon — and it makes a pasted citation ("21/SN-8/ME") comparable too.
 */
export function foldForSearch(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[äöüß]/g, (c) => UMLAUT_FOLD[c] ?? c)
      /* After the map, before the digraph fold: a decomposed "ä" (a + U+0308)
       * misses the map and lands on "a" here, which is where the precomposed
       * one already is. Both spellings, one result. */
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .replace(/ae|oe|ue/g, (m) => m[0]!)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  )
}

/**
 * Every token of the query somewhere in the haystack, in any order — so
 * "wiener recht" finds "Amt der Wiener Landesregierung; Magistratsdirektion
 * - Recht", which a single substring never would.
 *
 * An empty query matches everything: no filter is not the same as no result.
 */
export function matchesSearch(haystack: string, query: string): boolean {
  const q = foldForSearch(query)
  if (!q) return true
  const hay = foldForSearch(haystack)
  return q.split(' ').every((token) => hay.includes(token))
}
