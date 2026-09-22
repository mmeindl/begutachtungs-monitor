/**
 * A promulgation citation — "BGBl. I Nr. 84/2001" — read, split and compared
 * the way RIS stores it.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. The clause
 * it is read out of is `lawtext/draftArticles.ts`.
 */
import { normalizeText } from './normalize'

/** A promulgation citation, split the way RIS stores it. */
export interface BgblCitation {
  /** "BGBl. Nr.", "BGBl. I Nr.", "JGS Nr.", "RGBl. Nr.", "dRGBl. S" */
  organ: string
  /** "620/1989" */
  nummer: string
}

/**
 * The organs a Stammnorm is promulgated in.
 *
 * Austria's most-cited laws predate the Bundesgesetzblatt: the ABGB is
 * JGS Nr. 946/1811, the Zivilprozessordnung and the Notariatsordnung are
 * RGBl., the Unternehmensgesetzbuch is dRGBl. S. 219/1897. Reading only
 * "BGBl." meant `stammnormOf` returned null for all of them, so the Artikel
 * that amends them resolved to no law at all — no § heading, no RIS link —
 * and that hit precisely the statutes a reader is most likely to look up.
 *
 * RIS carries them in the same field pair as any Bundesgesetzblatt
 * (`StammnormPublikationsorgan` / `StammnormBgblnummer`), so this is not a
 * second join but the same one with a fuller vocabulary: verified live
 * 19.09.2026 that `Kundmachungsorgannummer=946/1811` returns the ABGB with
 * organ "JGS Nr.", 113/1895 the ZPO with "RGBl. Nr.", and the UGB with
 * "dRGBl. S".
 *
 * "S." next to "Nr." because a page citation is how the older organs number
 * their entries; RIS stores the UGB's organ as "dRGBl. S", without the
 * closing period, which is why `sameBgbl` compares normalised and not
 * literally.
 */
const BGBL_RE = /(d?RGBl\.?|BGBl\.?|StGBl\.?|JGS\.?|GBlÖ\.?)\s*(I{1,3})?\s*(Nr|S)\.\s*(\d+\/\d{4})/

/**
 * First promulgation citation in a text, or null.
 *
 * The organ is kept **as the source writes it** rather than rebuilt from a
 * canonical list: RIS prints "JGS Nr." without a period after the
 * abbreviation and "dRGBl. S" with one, and a reconstruction has to be right
 * about a convention that differs per organ. `sameBgbl` normalises for the
 * comparison, so the stored string only has to be faithful, not canonical.
 */
export function parseBgbl(text: string): BgblCitation | null {
  const m = BGBL_RE.exec(normalizeText(text))
  if (!m) return null
  return { organ: `${m[1]}${m[2] ? ` ${m[2]}` : ''} ${m[3]}.`, nummer: m[4]! }
}

/**
 * The *Stammnorm* citation of a Promulgationsklausel: the BGBl that created
 * the law, printed directly after its name and before any amendment history.
 *
 * Reading the whole clause took the first BGBl anywhere in it, which is the
 * last amendment whenever the Stammnorm is not a BGBl at all — the UGB is
 * "dRGBl. S. 219/1897", so the lookup resolved to a different law entirely,
 * one that the cited amendment happened to create, and said nothing about it
 * (2026-09-09). A clause whose head names no BGBl has no usable Stammnorm;
 * returning null there is the whole point, because the alternative is a
 * confident wrong answer.
 */
export function stammnormOf(text: string): BgblCitation | null {
  const head = normalizeText(text).split(/\bzuletzt geändert\b|\bin der Fassung\b|\bgeändert durch\b/i)[0] ?? ''
  return parseBgbl(head)
}

/**
 * Two citations of the same Stammnorm.
 *
 * The organ is compared without punctuation or case, because the two sides
 * spell it differently and neither is wrong: a draft writes "dRGBl. S. 219/1897",
 * RIS stores the organ as "dRGBl. S". The Teil is *not* decorative and
 * survives the normalisation — `Kundmachungsorgannummer=84/2001` returns the
 * Audiovisuelle Mediendienste-Gesetz (BGBl. I) and an Amtssitz law
 * (BGBl. III), and telling those apart is the whole point of the field.
 */
function organKey(organ: string): string {
  return organ.toLowerCase().replace(/[^a-zäöüß0-9i]+/g, '')
}

export function sameBgbl(a: BgblCitation, b: BgblCitation): boolean {
  return organKey(a.organ) === organKey(b.organ) && a.nummer === b.nummer
}
