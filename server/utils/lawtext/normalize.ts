/**
 * Typographic normalisation and markup stripping, shared by every reader of
 * law text — the Parliament HTML, the RIS XML and the standing-law tree.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 */
import { decodeEntities } from '../parliament/htmlText'

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

/** Typographic normalisation; keeps words, drops layout noise. */
export function normalizeText(t: string): string {
  return t
    // eslint-disable-next-line no-irregular-whitespace -- the NBSP in the class is what this line replaces
    .replace(/ /g, ' ')
    .replace(/[‑–‒]/g, '-')
    .replace(/­/g, '')
    .replace(/[„“”]/g, '"')
    .replace(/[‚‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A quoted § heading arrives inside the quotation marks of the instruction
 * that installs it ("§ 5 lautet samt Überschrift: \u0022Landesausspielungen\u0022").
 * The marks belong to the instruction, not to the heading — and the UI puts
 * its own around it, so leaving them nests two pairs.
 */
export function stripQuotes(t: string): string {
  return normalizeText(t).replace(/^["'\u00ab\u00bb\u2039\u203a\s]+|["'\u00ab\u00bb\u2039\u203a\s]+$/g, '')
}

/**
 * Comparison form: insensitive to whitespace AND to hyphens.
 *
 * Whitespace, because PDF and HTML render spaces differently. Hyphens for the
 * same kind of reason, measured on 19.09.2026 when the Bundesgesetzblatt was
 * first compared against Parliament's HTML: the Parliament document carries
 * a SOFT hyphen (U+00AD) where the law has a hard one, `normalizeText` strips
 * soft hyphens to nothing, and the two sides then read „OTCDerivaten" against
 * „OTC-Derivaten". 9/ME reported 11 of 58 units changed that way and 10/ME 7
 * of 78 — every one of them false, and every one of them a verdict on
 * parliament that nobody had earned.
 *
 * The cost is stated plainly: two texts that differ ONLY in hyphenation now
 * compare equal. In legistic German that is typography, not law — and the
 * alternative, keeping a difference we know to be an artefact of the source
 * format, is the worse trade. The same judgement `normalizeText` already
 * makes for the non-breaking space and the three dash characters.
 *
 * Leader dots drop out for the same reason. Parliament's HTML sets runs of
 * dots in amount tables („monatlich........................"), RIS does not —
 * without this line 15/ME reads twelve of 398 units as „geändert" because one
 * run of dots is a different length. Three dots or more are layout in a law
 * text, not punctuation.
 *
 * This is NOT the annex pipeline's line-break hyphen (`docs/api-exploration.md`);
 * that one decides whether to JOIN two tokens, this one only decides equality.
 *
 * ONLY the comparison form, never the displayed one: `normalizeText` stays
 * as it is, so the reader still sees exactly what the document says. What
 * falls away here decides whether two texts count as EQUAL — not how they
 * look.
 */
export function compareKey(t: string): string {
  return normalizeText(t)
    .replace(/\.{3,}/g, ' ')
    .replace(/[\s-]+/g, '')
}

/**
 * Character-level markup, which is **not** a word boundary.
 *
 * Every other tag is one: an `<absatz>`, `<listelem>`, `<td>` or `<br/>` is
 * exactly the place where one sentence ends and the next begins, so it has to
 * become a space. These seven wrap *characters of the same word* — the
 * ministries mark the changed letters of a word in yellow, and RIS italicises
 * a symbol inside a formula — so a space there invents a word boundary the
 * document does not have.
 *
 * `<sup>`/`<sub>`/`<super>` are deliberately **not** here, and that is a
 * measurement, not an oversight: see `stripMarkup`.
 */
const INLINE_MARKUP_RE = /<\/?(?:i|b|u|em|strong|span|font)\b[^>]*>/gi

/**
 * Markup → text, with the one distinction the comparison depends on: a block
 * tag is a word boundary, an inline tag is not.
 *
 * Shared by all three sides on purpose, because the annex is scored against
 * the other two and a rule applied to one of them alone rebuilds exactly the
 * asymmetry the editorial-note patterns exist to close: a word RIS wraps in
 * markup would then split on the RIS side only, and the annex column would
 * carry two tokens the standing § never offers. Those patterns are
 * `ANNOTATION_RE` in `lawtext/konsTree.ts` and the deliberately wider one of
 * the same name in `annex/annexText.ts`. The three sides are the annex cells
 * (`cellText` in `annex/tableCells.ts`), the standing § from RIS Bundesrecht
 * (`lawtext/konsTree.ts`) and the draft's own Gesetzestext plus the
 * Parliament HTML of the ME→RV comparison (`stripTags` below).
 *
 * **Measured over GP XXVIII, 2026-09-11** — 126 readable XML annexes, the
 * 3.858 standing §§ the gate looks up, 240 drafts' Gesetzestext. Splitting
 * words is overwhelmingly a property of the *annex*, where the ressort marks
 * the changed characters: `i` sits inside a word 3.101 times of 37.522 there
 * against 11 of 4.664 in the standing law, `span` 3.155 times against 0. The
 * rule costs the other two sides 12 of 202.966 standing blocks and 6 of
 * 48.355 draft blocks; making it shared is the point, because those 18 are
 * exactly the cases that would otherwise become the asymmetry. The full
 * table and the six §§ that changed their verdict are in
 * docs/architecture.md §12.13.
 *
 * **Two failure modes were looked for and do not exist in the corpus:**
 * zero-width markup fusing two words (`Wort<span></span>zwei`, 0 runs on any
 * of the three sides) and `<a>` around a citation (0 occurrences, RIS does
 * not use the tag).
 *
 * **`<sup>`/`<sub>`/`<super>` stay out, and that is a measurement, not an
 * oversight:** they sit directly on a word 152 times in the annexes, 785
 * times in the standing law and 338 times in the drafts, and the two meanings
 * **cannot be told apart by shape** — `CO<sub>2</sub>` belongs to the token,
 * `Meerkatzen<super>1)</super>` is a footnote mark that does not, and both
 * are "letter, then digits". Welding them moved **no verdict** on either
 * path, so there is nothing to weigh against the risk. The gain it does carry
 * belongs to a *different* asymmetry and to its own step: the PDF text layer
 * has no markup at all, so `KW<sub>el</sub>` is one word there and two here.
 */
export function stripMarkup(html: string): string {
  return html.replace(INLINE_MARKUP_RE, '').replace(/<[^>]*>/g, ' ')
}

export function stripTags(html: string): string {
  return normalizeText(decodeEntities(stripMarkup(html)))
}
