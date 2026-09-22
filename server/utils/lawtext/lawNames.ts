/**
 * Reading a law's name — two tokenizers, one Jaccard, and the thresholds that
 * consume them.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * **Two tokenizers, deliberately not one.** `articleNameTokens` strips a
 * boilerplate list and keeps every word of three characters or more;
 * `titleNameTokens` strips a stop-word list, keeps only words longer than
 * three and stems `es|en|s|n` off anything past five characters. They were
 * calibrated separately against different corpora and they are co-located
 * here, not merged: the names now say which is which.
 *
 * **Where the numbers they feed are decided — four thresholds, each staying
 * at its call site, because each was measured there:**
 *
 * - 0,5 in `pairArticles` (`diff/lawDiff.ts`, article pairing ME against RV)
 * - 0,5 as `NAME_MIN_JACCARD` (`explanations/explanationsJoin.ts`, which law
 *   a passage explains)
 * - 0,6 as `TITLE_MATCH` (`annex/annexBoundaries.ts`, a title is evidence
 *   only when it fits one Artikel clearly better than any other)
 * - `TITLE_AGREE` in the same file (below it a title actively contradicts the
 *   number)
 *
 * A fifth, `NAME_MATCH` in `ris/konsLaw.ts`, reads `lawNameScore` through
 * `text/clearWinner.ts`.
 */
import { normalizeText } from '../lawtext/normalize'

/**
 * Jaccard over two token sets: shared / (all distinct).
 *
 * Zero when either side is empty, which is the answer every caller wants —
 * an unnamed law matches nothing rather than everything.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / (a.size + b.size - shared)
}

// ---------------------------------------------------------------------------
// The article reading
// ---------------------------------------------------------------------------

// A Set, not a \b regex: JavaScript word boundaries are ASCII-only, "änderung" would survive.
const ARTICLE_BOILERPLATE = new Set(
  'bundesgesetz bundesverfassungsgesetz mit dem der das die des und sowie geändert geaendert wird werden änderung aenderung novelle artikel erlassen aufgehoben ein eine eines über ueber'.split(
    ' ',
  ),
)

/**
 * Token set naming the law an ARTICLE is about, stemmed, boilerplate removed.
 *
 * The draft's and the bill's Artikel titles, held against each other.
 */
export function articleNameTokens(title: string | null): Set<string> {
  const t = normalizeText(title ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[„“"'(),;:.\-–]/g, ' ')
  const out = new Set<string>()
  for (const raw of t.split(/\s+/)) {
    if (!raw || ARTICLE_BOILERPLATE.has(raw) || (raw.length < 3 && !/^\d+$/.test(raw))) continue
    out.add(raw.replace(/(gesetz|buch|ordnung|statut|vertrag)es$/, '$1').replace(/(gesetz|buch)s$/, '$1'))
  }
  return out
}

// ---------------------------------------------------------------------------
// The title reading
// ---------------------------------------------------------------------------

/**
 * Words that appear in almost every Artikel title and so carry no evidence.
 * "Änderung des …" is the template, not the name.
 *
 * **The template's full form was missing from the list until 19.09.2026.** A
 * draft without an Artikel line carries its title as a whole sentence —
 * „Bundesgesetz, mit dem das Lebensmittelsicherheits- und
 * Verbraucherschutzgesetz **geändert wird**" — and the two verbs counted as
 * content. Against the RIS Kurztitel that gave 2 of 4 shared words, so 0,50,
 * and `pickClearWinner` is called with 0,60 there: the LMSVG was no longer
 * decidable against the second law of the same Bundesgesetzblatt (BGBl. I
 * Nr. 13/2006 also creates the Kontroll- und Digitalisierungs-
 * Durchführungsgesetz) — 20 of 20 units in 70/ME without a name, and the same
 * law missing under „Geltendes Recht". With the verbs on this list it is 1,00
 * against 0,00.
 */
const TITLE_STOPWORDS = new Set([
  'änderung', 'änderungen', 'aufhebung', 'bundesgesetz', 'bundesgesetzes', 'gesetz', 'gesetzes',
  'über', 'sowie', 'mit', 'dem', 'des', 'der', 'die', 'das', 'den', 'und', 'von', 'zum', 'zur',
  // The template in its sentence form: „…, mit dem das X geändert wird".
  'geändert', 'wird', 'werden', 'erlassen', 'aufgehoben',
])

/**
 * A German title word reduced far enough that a genitive matches a nominative:
 * the draft writes "Änderung des Staatsanwaltschaftsgesetzes", the annex may
 * write "Staatsanwaltschaftsgesetz". Years survive intact and are the best
 * discriminator a title has ("Strafprozeßordnung 1975").
 */
function titleStem(word: string): string {
  return word.replace(/ß/g, 'ss').replace(/(?<=.{5})(?:es|en|s|n)$/, '')
}

/**
 * Token set of a TITLE, stemmed, stop words removed — the other reading, kept
 * apart from `articleNameTokens` on purpose.
 */
function titleNameTokens(title: string): Set<string> {
  const words = normalizeText(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 3 && !TITLE_STOPWORDS.has(w))
  // After stemming too: „geänderten" becomes „geändert" and is then the same
  // filler the list above already knows.
  return new Set(words.map(titleStem).filter((w) => !TITLE_STOPWORDS.has(w)))
}

/**
 * How much two law names have in common, 0 to 1 (Jaccard over content words).
 *
 * Used wherever two namings of the same law have to be recognised as one: the
 * annex's Artikel heading against the draft's, and an amending Artikel against
 * the Kurztitel RIS carries. Deliberately blunt — a law's name is a compound
 * noun and a year, so word overlap decides and word order does not.
 */
export function lawNameScore(a: string, b: string): number {
  return jaccardSimilarity(titleNameTokens(a), titleNameTokens(b))
}
