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
 * Füllpunkte zählen aus demselben Grund nicht mit. Parlaments-HTML setzt in
 * Betragstabellen Punktreihen („monatlich........................"), das RIS
 * nicht — ohne diese Zeile stehen bei 15/ME zwölf von 398 Einheiten als
 * „geändert" da, weil eine Punktreihe unterschiedlich lang ist. Drei Punkte
 * oder mehr sind in einem Gesetzestext Layout, kein Satzzeichen.
 *
 * This is NOT the annex pipeline's line-break hyphen (`docs/api-exploration.md`);
 * that one decides whether to JOIN two tokens, this one only decides equality.
 *
 * NUR die Vergleichsform, nie die angezeigte: `normalizeText` bleibt
 * unverändert, also sieht der Leser weiter genau das, was im Dokument steht.
 * Was hier wegfällt, entscheidet, ob zwei Texte GLEICH heißen — nicht, wie
 * sie aussehen.
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
 * asymmetry `annexCheck.ANNOTATION_RE` exists to close: a word RIS wraps in
 * markup would then split on the RIS side only, and the annex column would
 * carry two tokens the standing § never offers. The three sides are the annex
 * cells (`textComparison.cellText`), the standing § from RIS Bundesrecht
 * (`lawStructure`) and the draft's own Gesetzestext plus the Parliament HTML
 * of the ME→RV comparison (`stripTags` below).
 *
 * **Measured over GP XXVIII, 2026-09-11** — 126 readable XML annexes, the
 * 3.858 standing §§ the gate looks up, and 240 drafts' Gesetzestext.
 * Occurrences of the tag, and how many of them sit *inside* a word:
 *
 * | | Beilage | geltendes Recht | Gesetzestext |
 * |---|---:|---:|---:|
 * | `i`    | 3.101 von 37.522 | 11 von 4.664 |  14 von 2.272 |
 * | `b`    |   616 von  3.246 | 25 von 4.618 | 175 von 3.178 |
 * | `span` | 3.155 von 38.672 |  0 von     0 |   0 von   116 |
 *
 * Splitting words is overwhelmingly a property of the *annex*, where the
 * ressort marks the changed characters (`Schlepplifte<i><span
 * style="background:yellow">n</span></i>,`), and the rule costs the other two
 * sides almost nothing — 12 of 202.966 standing blocks and 6 of 48.355 draft
 * blocks change a comparable token at all. Making it shared is nevertheless
 * the point: those 12 and 6 are exactly the cases that would otherwise become
 * the asymmetry, and eight of the twelve are RIS's own "(Anm.: …)" torn apart
 * by its italics (`lawStructure`); the other four are a compound whose hyphen
 * sat on the markup boundary ("Sollwert" → "-Sollwert").
 *
 * **Three failure modes were looked for; two do not exist in the corpus.**
 * Zero-width fuses two words where the markup carried the only separator —
 * `Wort<span></span>zwei`: **0** such runs on any of the three sides. `<a>`
 * around a citation: **0** occurrences, RIS does not use the tag. The third
 * is real, and it is why `<sup>`/`<sub>`/`<super>` stay out: they sit
 * directly on a word 152 times in the annexes, 785 times in the standing law
 * and 338 times in the drafts, and the two meanings **cannot be told apart by
 * shape** — `CO<sub>2</sub>` belongs to the token, `Meerkatzen<super>1)</super>`
 * is a footnote mark that does not, and both are "letter, then digits".
 * Welding them moved **no verdict** on either path, so there is nothing to
 * weigh against the risk; it only lifted the reported ≥ 99 % coverage from
 * 961 to 962 §§ on the table path and from 1.617 to 1.622 on the PDF path.
 * That gain is worth its own step, because it comes from a *different*
 * asymmetry: the PDF text layer carries no markup at all, so `KW<sub>el</sub>`
 * is one word there and two here.
 */
export function stripMarkup(html: string): string {
  return html.replace(INLINE_MARKUP_RE, '').replace(/<[^>]*>/g, ' ')
}

export function stripTags(html: string): string {
  return normalizeText(decodeEntities(stripMarkup(html)))
}
