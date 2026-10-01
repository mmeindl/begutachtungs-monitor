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
 *
 * **The spelling is the ministry's, not the Rechtsinformationssystem's**
 * (25.09.2026). Measured over the 137 drafts of GP XXVIII that carry a RIS
 * document: of 511 amending Artikel, nine cite a Stammnorm this expression
 * could not read, and none of the nine was a different kind of citation —
 * they were the same citation typed differently. Four variants, each with
 * exactly one reading, are therefore accepted:
 *
 *   "BGBI. Nr. 283/1990"     capital i for the l — 20/ME, twice
 *   "BGBl. Nr. I Nr. 30/2006"  the marker printed twice — 109/ME
 *   "BGBl. I. Nr. 100/2018"    a period after the Teil — 20/ME
 *   "dRGBl. S 219/1897"        the marker without its period — UGB, 4+100/ME
 *   "BGBl. 624/1978"           no marker at all — FSVG, 96/ME
 *
 * Two stay unread, and deliberately: "BGBl. I Nr. 29/200" (61/ME) is a year
 * with three digits, and guessing 2000 from it would put a law behind a
 * number the draft does not carry; a clause naming no organ at all (4/ME,
 * "…(GenRevG 1997), wird wie folgt geändert") has no Stammnorm to read. A
 * wrong law is worse than none, and that is the whole rule of this module.
 */
const BGBL_RE = /(d?RGBl|BGB[lI]|StGBl|JGS|GBlÖ)(\.?)\s*(?:(?:Nr\.\s*)?(I{1,3})\b\.?\s*)?(?:(Nr|S)\.?\s*)?(\d+\/\d{4})/

/**
 * First promulgation citation in a text, or null.
 *
 * The abbreviation is kept **as the source writes it** rather than rebuilt
 * from a canonical list: RIS prints "JGS Nr." without a period after the
 * abbreviation and "dRGBl. S" with one, and a reconstruction has to be right
 * about a convention that differs per organ. `sameBgbl` normalises for the
 * comparison, so the stored string only has to be faithful, not canonical.
 *
 * Two things are levelled all the same, because both are printed on the page
 * under „Geltendes Recht": "BGBI" is no organ, it is the l typed as a capital
 * i, and the marker is written with its period — "BGBl. I. Nr." goes out as
 * "BGBl. I Nr.". The Teil is never touched.
 */
export function parseBgbl(text: string): BgblCitation | null {
  const m = BGBL_RE.exec(normalizeText(text))
  if (!m) return null
  // The abbreviation keeps the source's own period; only the impossible
  // letter is corrected, and the citation marker is given the period that
  // every organ writes it with. The Teil is never touched — it identifies
  // the law.
  const abbr = `${m[1] === 'BGBI' ? 'BGBl' : m[1]}${m[2]}`
  const organ = [abbr, m[3], m[4] ? `${m[4]}.` : null].filter(Boolean).join(' ')
  return { organ, nummer: m[5]! }
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
  const tokens = organ.toLowerCase().split(/[^a-zäöüß0-9]+/).filter(Boolean)
  // The citation marker is noise for the comparison and a ministry regularly
  // omits it ("BGBl. 624/1978", FSVG in 96/ME), while RIS always writes it.
  // Dropping it cannot merge two organs: no Bundesgesetzblatt is cited by
  // page and no older organ by number, so "Nr." and "S." never distinguish
  // two series of the same abbreviation — the Teil does, and it stays.
  if (tokens.length > 1 && (tokens.at(-1) === 'nr' || tokens.at(-1) === 's')) tokens.pop()
  return tokens.join('')
}

export function sameBgbl(a: BgblCitation, b: BgblCitation): boolean {
  return organKey(a.organ) === organKey(b.organ) && a.nummer === b.nummer
}

/** "BGBl. I Nr." → { series: "bgbl", teil: "i" }; "BGBl. Nr." → teil null. */
function organParts(organ: string): { series: string; teil: string | null } {
  const tokens = organ.toLowerCase().split(/[^a-zäöüß0-9]+/).filter(Boolean)
  if (tokens.length > 1 && (tokens.at(-1) === 'nr' || tokens.at(-1) === 's')) tokens.pop()
  const teil = tokens.length > 1 && /^i{1,3}$/.test(tokens.at(-1)!) ? tokens.pop()! : null
  return { series: tokens.join(''), teil }
}

/**
 * Two legislative texts citing the same Stammnorm, where one dropped the Teil
 * or added one (01.10.2026). Not for the RIS join — there `sameBgbl` holds,
 * because RIS always writes the Teil and „BGBl. I" against „BGBl. III" is two
 * laws. Between a draft and its Vorlage the Teil is typed by hand: of the
 * 1.620 Artikel pairs of GP XXVI–XXVIII where both clauses cite a Stammnorm,
 * 26 differ in nothing but a Teil one side left out or added — „BGBl. Nr.
 * 36/2004" for the EU-JZG (XXVI 162/ME), „BGBl. Nr. 53/2016" for the
 * Familienzeitbonusgesetz, „BGBl. I Nr. 839/1992" for the Passgesetz, which
 * predates the Teile. A missing Teil is therefore no contradiction; two
 * different Teile still are.
 */
export function sameStammnormCited(a: BgblCitation, b: BgblCitation): boolean {
  if (a.nummer !== b.nummer) return false
  const x = organParts(a.organ)
  const y = organParts(b.organ)
  return x.series === y.series && (x.teil === y.teil || x.teil === null || y.teil === null)
}
