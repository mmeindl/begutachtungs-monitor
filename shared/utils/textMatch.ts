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
 * filters client-side (`openVorlagen`) need the one rule.
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
 *     (GDPR, docs/architecture.md §3). A field of ours can say which one it is.
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

/** A string's characters with where each came from in the source, so a match
 * found in a normalised reading can be marked in the text as printed. */
interface MappedText {
  chars: string[]
  from: number[]
  to: number[]
}

/** The raw reading of `matchesQuery`, character by character: lowercase. */
function lowerWithMap(s: string): MappedText {
  const out: MappedText = { chars: [], from: [], to: [] }
  let i = 0
  for (const ch of s) {
    for (const c of ch.toLowerCase()) {
      out.chars.push(c)
      out.from.push(i)
      out.to.push(i + ch.length)
    }
    i += ch.length
  }
  return out
}

/**
 * `foldForSearch`, character by character — the same steps in the same order,
 * so the folded text it yields is the one `matchesQuery` compares against
 * (`matchRanges` tests pin that). A folded „oesterreich" then marks the
 * „Österreich" that stands in the row.
 */
function foldWithMap(s: string): MappedText {
  const lowered = lowerWithMap(s)
  const step1: MappedText = { chars: [], from: [], to: [] }
  lowered.chars.forEach((c, k) => {
    const piece = (UMLAUT_FOLD[c] ?? c).normalize('NFD').replace(/\p{M}+/gu, '')
    for (const p of piece) {
      step1.chars.push(p)
      step1.from.push(lowered.from[k]!)
      step1.to.push(lowered.to[k]!)
    }
  })
  // The digraph fold, greedy left to right like the regex in `foldForSearch`.
  const step2: MappedText = { chars: [], from: [], to: [] }
  for (let k = 0; k < step1.chars.length; k++) {
    const c = step1.chars[k]!
    step2.chars.push(c)
    step2.from.push(step1.from[k]!)
    if ('aou'.includes(c) && step1.chars[k + 1] === 'e') {
      step2.to.push(step1.to[k + 1]!)
      k++
    } else {
      step2.to.push(step1.to[k]!)
    }
  }
  // Every punctuation run one space.
  const out: MappedText = { chars: [], from: [], to: [] }
  for (let k = 0; k < step2.chars.length; k++) {
    if (/[\p{L}\p{N}]/u.test(step2.chars[k]!)) {
      out.chars.push(step2.chars[k]!)
      out.from.push(step2.from[k]!)
      out.to.push(step2.to[k]!)
    } else if (out.chars[out.chars.length - 1] !== ' ') {
      out.chars.push(' ')
      out.from.push(step2.from[k]!)
      out.to.push(step2.to[k]!)
    }
  }
  return out
}

function rangesIn(mapped: MappedText, tokens: string[]): Array<[number, number]> {
  const text = mapped.chars.join('')
  const ranges: Array<[number, number]> = []
  for (const t of tokens) {
    for (let at = text.indexOf(t); at !== -1; at = text.indexOf(t, at + 1)) {
      ranges.push([mapped.from[at]!, mapped.to[at + t.length - 1]!])
    }
  }
  return ranges
}

/**
 * WHERE the query stands in a text — the half of `matchesQuery` a reader
 * sees: the row that a search kept marks the words it was kept for
 * (03.10.2026). Before, only the full-text evidence carried a mark, and a row
 * found by its title gave no sign why it was there.
 *
 * The same two readings as `matchesQuery`, united: a token found raw or
 * folded is marked, so a row never stands in the list without its mark when
 * the match is in the text passed here. Returned as sorted, merged
 * `[start, end)` ranges into `text` as given.
 *
 * It does NOT apply the AND: a text holding one of two tokens marks that one.
 * A row is kept by its whole haystack (title, citation, codes, Debattenname),
 * and each of those fields is marked on its own.
 */
export function matchRanges(text: string, q: string): Array<[number, number]> {
  const folded = foldForSearch(q).split(' ').filter(Boolean)
  if (!folded.length || !text) return []
  const ranges = [
    ...rangesIn(lowerWithMap(text), queryTokens(q)),
    ...rangesIn(foldWithMap(text), folded),
  ].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return merged
}
