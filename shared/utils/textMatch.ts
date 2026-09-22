/**
 * What a search field does with a space (docs/architecture.md §12.31).
 *
 * Since 22.09.2026 both halves link the tokens with AND — before that the
 * list searched the whole input as ONE substring while the full text beside
 * it linked the same words with AND. What holds INSIDE a word stays
 * different and must: the list searches substrings („klimages" finds the
 * Klimagesetz), RIS whole words with an asterisk.
 *
 * Pure module in `shared`, because both endpoints AND the rows the page
 * filters client-side (`vorlageRows`) need the one rule.
 */

// One rule for both lists since 22.09.2026: the tokens of a query are
// AND-linked and each one a substring, read in two normalisations — raw
// (lowercase) and folded (umlauts, transliterations, punctuation) — of which
// the query need clear only one. Why either and not just the folded one is
// the measurement under `matchesQuery`.

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
 * ("Quelle" → "qulle"). This said that was harmless because both sides go
 * through the same function — which holds only where the two align. The
 * replacement is greedy and left to right, so a query that STARTS on the "e"
 * the haystack's own fold swallowed is gone from the folded haystack:
 * "ergesetz" does not occur in the folded "Paketsteuergesetz", nor "ell" in
 * the folded "Audiovisuelle". Measured 22.09.2026 over the 472 GP-XXVIII
 * haystacks (504.210 generated queries): 375 such cases, every one of them a
 * mid-word fragment, none among whole words, word prefixes or word pairs.
 * `matchesQuery` reads the pair unfolded as well, which is what closes it. */
const UMLAUT_FOLD: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', ß: 'ss' }

/**
 * A string reduced to what a search should compare: lowercase, umlauts and
 * their transliterations folded, diacritics stripped, every punctuation run
 * one space.
 *
 * Deliberately NOT `orgMatchKey` (`server/utils/parliament/organisations.ts`),
 * which folds for near-duplicate DETECTION — it is tuned to decide if names
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

/** The input as words. Empty when nothing searchable is left. */
export function queryTokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Every token of the query somewhere in the haystack, in any order — so
 * "wiener recht" finds "Amt der Wiener Landesregierung; Magistratsdirektion
 * - Recht", which a single substring never would.
 *
 * An empty query matches everything: no filter is not the same as no result.
 *
 * TWO READINGS, AND EITHER MAY MATCH. Raw first, because it is the cheaper
 * one and carries most hits; folded second, so "oesterreichischer" finds
 * "Österreichischer" and a pasted "21/SN-8/ME" compares across the
 * punctuation. Folded ALONE was measured before it shipped (22.09.2026, the
 * run above): it takes 375 of 504.210 queries away from a reader, the
 * disjunction takes 0 — so the reading that can only ever add is the one
 * both lists use.
 */
export function matchesQuery(haystack: string, q: string): boolean {
  const folded = foldForSearch(q).split(' ').filter(Boolean)
  // Nothing searchable typed — punctuation only, or nothing at all.
  if (!folded.length) return true
  const lower = haystack.toLowerCase()
  if (queryTokens(q).every((t) => lower.includes(t))) return true
  const hay = foldForSearch(haystack)
  return folded.every((t) => hay.includes(t))
}
