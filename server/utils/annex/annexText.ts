/**
 * What a word and a § designation are to the annex gate — its identity layer.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. Read by
 * every other module of `annex/`; the gate itself is `annex/verdict.ts`.
 */

/**
 * What is not comparable, on either side.
 *
 * - **Elision.** "(1) bis (3) …" says three Absätze are unchanged and left
 *   out. It is the annex's own syntax; "bis" is not law text, and it was the
 *   single most frequent "missing" word in the corpus. The same syntax runs
 *   over §§ and Ziffern too: "§ 21. bis § 25. …", "1. bis 100. …".
 * - **The row's own designation.** RIS keeps "§ 217." as the paragraph's
 *   marker, not as its text, so the column's designation can never be found
 *   and "217" would count as a missing word.
 * - **RIS's editorial notes.** "(Anm.: Abs. 2 aufgehoben durch …)" is not
 *   law; `lawStructure.ts` strips it from the RIS side and the annex copies
 *   it verbatim, so it has to go from the column side as well or the
 *   asymmetry is scored against the parse.
 * - **RIS web-view boilerplate.** A few annexes paste "Beachte für folgende
 *   Bestimmung" along with the text; it is in no XML.
 *
 * What is *not* discounted: Abschnitt, Hauptstück and Teil headings. The
 * premise was that RIS files them outside the §. It does not — they are
 * inside every § document, and callers pass them in from `node.context`.
 */
/** A chain of designations joined by "bis"/"und", closed by three dots. */
const ELISION_RE = /(?:§+\s*)?\(?\d+[a-z]*\)?\.?(?:\s*(?:bis|und|,)\s*(?:§+\s*)?\(?\d+[a-z]*\)?\.?)*\s*(?:\.\.\.|…)/g
/** "§ 217." — the designation form, which ends in a period; a citation does not. */
const DESIGNATION_RE = /(?:^|\s)§+\s*\d+[a-z]*\.(?=\s|$)/g
/**
 * "(Anm.: Abs. 2 aufgehoben durch …)" — and the spellings the PDF text layer
 * makes of it.
 *
 * `lawStructure.ts` strips this shape from the RIS side, so an annex copy the
 * pattern misses is an asymmetry scored against the parse: the column carries
 * words the standing text was never offered. Measured over the GP-XXVIII
 * corpus on 2026-09-10, 110 occurrences of "Anm" survived both sides of the
 * filter, and the misses were one form — **"(Anm. : aufgehoben durch …)"**,
 * a space between the period and the colon, which is how the PDF's positioned
 * runs come out. It cost the Bankwesengesetz annex "anm" and "aufgehoben" in
 * §§ 7, 22, 35, 44, 63, 64, 70a, 77a, 79 and 99c. The period is optional for
 * the same reason.
 *
 * Deliberately *not* widened to two neighbouring forms. "(Anm. 1)" is a
 * footnote marker RIS keeps on both sides, so dropping it here would create
 * the reverse asymmetry; and "Anmerkung 4: …" in the Bäderhygieneverordnung's
 * Anlage 1 is the schedule's **own** footnote text, which is law.
 */
const ANNOTATION_RE = /\(Anm\.?\s*:[^()]*(?:\([^()]*\)[^()]*)*\)/g
const BOILERPLATE_RE = /Beachte für folgende Bestimmung/gi

/** Comparable words of a text: the discounts above, lowercased, short words dropped. */
export function comparableTokens(text: string): string[] {
  return text
    .replace(ANNOTATION_RE, ' ')
    .replace(BOILERPLATE_RE, ' ')
    .replace(ELISION_RE, ' ')
    .replace(DESIGNATION_RE, ' ')
    .replace(/(?:\.\.\.|…)/g, ' ')
    .toLowerCase()
    .replace(/[„“”"'‚‘’]/g, '')
    .replace(/[­‑]/g, '-')
    .split(/[^\p{L}\p{N}§-]+/u)
    .filter((w) => w.length > 2)
}

/**
 * The key a § is filed under, so a package's two § 5 stay apart — 15,1 % of
 * § designations in the multi-law annexes recur in another law of the same
 * package, so the law has to be part of the identity.
 *
 * Named apart from `tguOracle.paragraphKey`, which builds the same shape from
 * the *normalised* id ("5") while this one keeps the annex's own designation
 * ("§ 5."). Two functions of the same name and the same shape whose arguments
 * are in the opposite order is the kind of thing auto-import resolves
 * silently and wrongly.
 */
export function annexParagraphKey(law: string | null, para: string): string {
  return `${law ?? ''}#${para}`
}

/** "§ 5", "Art. 3 § 5", "Anl. 1/59" — a designation and its numeral, in order. */
const DESIGNATION_PART_RE = /(§|Art|Anl|Anh)[a-zäöüß.]*\s*(\d+(?:\.\d+)?[a-z]*\d*(?:\/\d+)?)/gi
/** A Gliederungssymbol that dropped its sign: "5.", "12a". */
const BARE_NUMERAL_RE = /^\s*(\d+(?:\.\d+)?[a-z]*\d*)\s*\.?\s*$/i
/**
 * The word that makes the designation after it a **citation** rather than a
 * second part of the name: "Anlage 3 *zu* § 10 und § 11" is the schedule's
 * title saying which §§ it belongs to. RIS calls that schedule "Anl. 3".
 *
 * Tested on the gap *between* two parts only, and that is the whole safety of
 * it: a leading "Zu § 5" — the form the Erläuterungen head their sections with
 * — keeps its §, because there is no earlier part for the word to separate
 * from.
 *
 * The two classes separate on this one word without a remainder (GP XXVIII,
 * 2026-09-11). Of the 1.546 designation strings the key reads as composite,
 * **1.534 are RIS's "Art. 3 § 5"** — an article-structured law, where the
 * Artikel really is part of the §'s identity — and every one of them joins its
 * parts with a plain space. The other **12 are the annex's schedule headings**,
 * and every one of them joins with " zu ". Over all 195.875 RIS label
 * occurrences in the offline corpus, **not one label contains "zu" at all**,
 * so the lookup side of the key cannot move.
 */
const CITATION_JOINER_RE = /\bzu\b/i

/**
 * A designation as a comparable key — the annex's "§ 5." and RIS's "§ 5" name
 * the same provision, "§ 5a" names another one.
 *
 * Exact equality, and that is the point. The shipped rule built
 * ``^§+\s*${id}(?![.\d])`` from the annex's id and took the first RIS label it
 * matched; for id "5" that pattern matches **"§ 5a"**, so whichever of the two
 * RIS happened to return first decided, and § 5 could be scored against § 5a's
 * text — withheld for a divergence it never had, or vouched for against the
 * wrong provision. It is no corner case either: of 195.000 RIS labels in the
 * cached corpus, 34.000 carry a letter suffix (measured 2026-09-10).
 *
 * Composite labels are the same mistake one level up, and they fall out of an
 * exact comparison on their own. RIS files an article-structured law as
 * **"Art. 3 § 5"** (5.474 labels), and "§ 5" must not find it: in such a law
 * the Artikel is part of a §'s identity, which is why the amendment engine
 * refuses those addresses too (`lawApply.ts`). An Anlage cut into parts is
 * "Anl. 1/59" (118 labels), which is not "Anl. 1" — matching it would have
 * scored a whole schedule against one fifty-ninth of it.
 *
 * Measured against every RIS label in the cached corpus (195.875 occurrences,
 * 4.251 distinct, 2026-09-11): none is unreadable here, so the exactness
 * costs no coverage.
 *
 * **A composite the RIS never holds is the same mistake mirrored** (fixed
 * 2026-09-11). The key reads the leading designation and ignores the rest,
 * which is right for "§ 5 3. Abschnitt" and for "Anlage 1 Mindestgliederung
 * Bilanz" — but where a schedule's title *cites* §§, the citation was read as
 * part of the name: "Anlage 3 zu § 10 und § 11" became `Anl 3 § 10 § 11`, a
 * label no law carries, so the § was looked up, not found, and left
 * `unchecked` for a reason of our own making. 12 §§ of GP XXVIII, across four
 * drafts, and the lookup they want exists in every case — RIS holds "Anl. 3".
 * `CITATION_JOINER_RE` is where the cut is and why it is safe.
 *
 * Null for a text carrying no designation at all.
 */
export function designationKey(text: string): string | null {
  const parts: string[] = []
  let end = 0
  for (const m of text.matchAll(DESIGNATION_PART_RE)) {
    // Everything from a "zu" onwards is the Anlage's title, not its name.
    if (parts.length > 0 && CITATION_JOINER_RE.test(text.slice(end, m.index))) break
    const word = m[1]!.toLowerCase()
    parts.push(`${word === '§' ? '§' : word === 'art' ? 'Art' : 'Anl'} ${m[2]!.toLowerCase()}`)
    end = m.index + m[0].length
  }
  if (parts.length > 0) return parts.join(' ')
  // A bare numeral is a §: the annex's Gliederungssymbol drops the sign often
  // enough that refusing here would cost coverage and buy nothing — a wrong
  // guess still has to survive the coverage test on the § it lands on.
  const bare = BARE_NUMERAL_RE.exec(text)
  return bare ? `§ ${bare[1]!.toLowerCase()}` : null
}
