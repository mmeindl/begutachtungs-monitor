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
 * ONE run of dot characters — „...", „…", „…………………..", and „..... ........"
 * too, because a leader is regularly broken by spaces.
 *
 * A piece is two or more dots or one „…", never a single dot: a lone full stop
 * next to a run belongs to the sentence or to the ordinal in front of it, and
 * letting it join swallowed the „6." of „3. bis 6. ..." in 289 of 1.566 runs
 * when this was first measured (25.09.2026).
 */
const DOT_RUN_RE = /(?:…+|\.{2,})(?:\s+(?:…+|\.{2,}))*/g

/** What a run PRINTS, „…" counting for the three dots it shows. */
function dotWeight(run: string): number {
  return (run.match(/\./g) ?? []).length + 3 * (run.match(/…/g) ?? []).length
}

/**
 * Where a dot run stops being an omission and becomes column padding.
 *
 * **Measured over 1.566 runs** — 300 Entwurfs-XML, die Erläuterungen der
 * GP XXVIII und 13 Textgegenüberstellungen (25.09.2026): 1.375 runs weigh
 * exactly 3 and every one of them is the annex's „unchanged, left out"; 176
 * weigh 10 or more and every one of them pads an amount table to its figure
 * („monatlich........................ 1,21 Euro"). Fifteen lie between, and
 * all fifteen are pieces of form templates and rate tables — leaders, not
 * omissions. The two uses do not overlap, so a threshold separates them.
 */
const LEADER_WEIGHT = 10

/** The layout runs, gone; the omissions kept. */
function foldLeaders(t: string): string {
  return t.replace(DOT_RUN_RE, (run) => (dotWeight(run) >= LEADER_WEIGHT ? ' ' : run))
}

/** Every dot run, layout and omission alike — for the equality form only. */
function foldDotRuns(t: string): string {
  return t.replace(DOT_RUN_RE, (run) => (dotWeight(run) >= 3 ? ' ' : run))
}

/** A token that is nothing but dots — the omission mark, in whichever spelling. */
const DOT_TOKEN_RE = /^[.…]+$/

/** A hyphen BETWEEN letters or digits: the one `compareKey` folds away, „E-Mail" → „EMail". */
const INNER_HYPHEN_RE = /(?<=[\p{L}\p{N}])-+(?=[\p{L}\p{N}])/gu
/**
 * The space a source sets in front of the punctuation mark that closes a
 * sentence or a list item.
 *
 * Not in front of a dot RUN: „(1) bis (5) ..." would otherwise weld the
 * omission onto the designation before it and print „(5)...".
 */
const SPACE_BEFORE_PUNCT_RE = /\s+([.,;:])(?![.…])/g

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
 *
 * Its word-level twin is `displayTokens` + `compareToken` below, and the
 * three have to agree: this one answers „sind die Texte gleich?", those two
 * „ist DIESES Wort geändert?" — and a difference only one side sees is a
 * false verdict. That the word level needs TWO functions where this one needs
 * none is the difference between them: an equality form is never shown, a
 * word diff is.
 */
export function compareKey(t: string): string {
  return foldDotRuns(normalizeText(t)).replace(/[\s-]+/g, '')
}

/**
 * The words of a text as a word diff SHOWS them — the reader's form, and the
 * one the token count is defined by.
 *
 * **Measured 23.09.2026, rv→bgbl over GP XXVIII.** `compareKey` decides
 * whether a unit counts as unchanged, the word diff decides which words
 * inside a changed unit are marked — and the two used different rules, so
 * once a unit was „geändert" for any other reason, every difference the
 * equality form already forgives counted as a changed word and made the whole
 * unit substantive. Three drafts stood in the measurement only for this:
 * 51/ME („(1)"; ↔ „(1)" ;, „13 ,“ ↔ „13,“), 60/ME („4.", ↔ „4." ,) and 58/ME,
 * where the Bundesgesetzblatt writes „Bundes-Vergabekontrollkommission",
 * „BT-06", „E-GoVG" and „E-Mail-Adresse" and the Parliament document sets the
 * same words without the hyphen.
 *
 * **Two of those three folds live here and the third does not, and the split
 * is the whole point (25.09.2026).** Leader dots and the space in front of
 * `.,;:` change where the word boundaries ARE — a run of dots is a token that
 * exists on one side only, and „13 ," is two tokens against one — so they have
 * to fall away before anything is counted, and they are layout either way: no
 * reader loses a word by them. The hyphen is not like that. It sits INSIDE a
 * word, it folds no boundary, and folding it rewrites the word itself.
 *
 * Which is why it is `compareToken` below and not part of this: for two
 * days this function folded all three and the word diff built its segments
 * from the result, so the page published „BundesKinder- und
 * Jugendhilfegesetzes" for „Bundes-Kinder- und Jugendhilfegesetzes" — the law's
 * own name misspelt in a law text (126/ME § 9, found 25.09.2026; across that
 * draft's whole Lesefassung not one inner hyphen survived). The same mistake
 * as the comparison form on the page in §12.12a, one level further down: a
 * form that is right for a judgement is not thereby right for a text.
 */
export function displayTokens(t: string): string[] {
  return foldLeaders(normalizeText(t))
    .replace(SPACE_BEFORE_PUNCT_RE, '$1')
    .split(' ')
    .filter(Boolean)
}

/**
 * The comparison key of ONE displayed word — the hyphen `compareKey` folds,
 * folded the same way.
 *
 * Per token, not per text, and that is what makes it safe to show a word and
 * compare it by something else: `INNER_HYPHEN_RE` needs a letter or digit on
 * both sides, so it can never split a token, join two or empty one. The two
 * arrays therefore run index for index, and the diff can align on this while
 * emitting what `displayTokens` gave it.
 *
 * The measurement it carries is `compareKey`'s: Parliament's HTML sets a SOFT
 * hyphen where the law has a hard one, `normalizeText` strips soft hyphens to
 * nothing, and „OTCDerivaten" against „OTC-Derivaten" reported 11 of 58 units
 * changed in 9/ME and 7 of 78 in 10/ME — every one of them a verdict on
 * parliament that nobody had earned.
 */
export function compareToken(word: string): string {
  const folded = word.replace(INNER_HYPHEN_RE, '')
  // „..." and „…" are one notation in two spellings, and „…." is it with the
  // sentence's full stop behind it. Compared as written, the same omission on
  // the two sides of a Gegenüberstellung reads as a changed word.
  return DOT_TOKEN_RE.test(folded) ? '…' : folded
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
