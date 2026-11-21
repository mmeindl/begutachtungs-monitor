/**
 * Where a fault class of `harness/faultInjection.ts` can go — the site rules
 * that decide a class's population, kept apart from the script so a test can
 * hold them (code in a harness that passes judgement is tested like
 * production code).
 */
import type { ComparisonRow } from '../../server/utils/annex/comparisonRows'
import { normalizeText } from '../../server/utils/lawtext/normalize'

/** A bracketed Absatz marker standing as a word: „(4)", „(1h)". */
const MARKER = String.raw`\((\d+[a-z]*)\)`

/**
 * The Absätze the proposed column names in an elision only, and those either
 * column prints text of — the site rule of „Fehlt" (21.11.2026).
 *
 * `chained`: every marker of an elided row (the table path's shape, a row
 * of its own for „(1) bis (26) …"), and inside any other row a marker
 * followed by „…" or chained by „bis"/„und" („(1) bis (3) … (4) Der …"), the
 * PDF path's shape, where a whole § is one changed row. Until 21.11.2026
 * only elided rows counted, and the PDF path, whose rows are never elided,
 * had no site at all: „Fehlt" was tried 0 times there in every round.
 *
 * `withText`: the markers either column prints text of — words or a first
 * Ziffer after the marker, or after the „…" of an elided opening („(1) und
 * (2) ... 1. ... 2. die Anmeldung …": Abs. 2's Ziffern stand there). Such an
 * Absatz is read by the text checks, and „Fehlt" takes the Absatz out of the
 * standing text too (the 126/ME shape, where another Artikel was to insert
 * it), so where a column prints its text the fault was caught by check 1
 * for the injector's sake, not for the fault's: 14 of the first run's 830
 * catches on the PDF path, 13 of 670 on the table path.
 */
export function chainedAbsaetze(rows: readonly ComparisonRow[]): { chained: Set<string>; withText: Set<string> } {
  const chained = new Set<string>()
  const withText = new Set<string>()
  const pairs = rows.filter((r) => r.kind === 'pair')
  for (const r of pairs) {
    if (r.elided) for (const m of normalizeText(r.proposed).matchAll(new RegExp(String.raw`(?:^|\s)${MARKER}(?=\s|$)`, 'g'))) chained.add(m[1]!)
  }
  for (const column of ['proposed', 'current'] as const) {
    // One stream per column, rows in order: an elided row's „(2) …" can be
    // followed by Abs. 2's Ziffern in the next row.
    const text = pairs.map((r) => normalizeText(r[column])).join(' ')
    // A marker glued to its „…" („(1) bis (8)… (9)") is one too: check 5 does not read it, which is what a miss shows.
    for (const m of text.matchAll(new RegExp(String.raw`(?<=^|\s)${MARKER}(?=\s|$|…|\.\.\.)`, 'g'))) {
      const rest = text.slice(m.index! + m[0].length)
      const elision = /^\s*(?:…|\.\.\.)/.exec(rest)
      if (elision) {
        if (column === 'proposed') chained.add(m[1]!)
        // What follows the „…" is this Absatz's text unless another Absatz opens there (or more elision marks).
        if (!/^\s*(?:(?:\[\s*(?:…|\.\.\.)\s*\]|…|\.\.\.)\s*)*(?:\(\d+[a-z]*\)|$)/.test(rest.slice(elision[0].length))) withText.add(m[1]!)
      } else if (/^\s*(?:bis|und)\s+\(\d+[a-z]*\)/.test(rest)) {
        if (column === 'proposed') chained.add(m[1]!)
      // Anything else after it is the Absatz's own text — words, or its first Ziffer.
      } else if (!/^\s*(?:(?:bis|und|-|–)(?![\p{L}\p{N}])|$)/u.test(rest)) withText.add(m[1]!)
    }
  }
  return { chained, withText }
}
