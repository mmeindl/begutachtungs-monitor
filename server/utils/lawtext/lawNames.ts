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
 * - 0,5 in `lawDiff.pairArticles` (article pairing, ME against RV)
 * - 0,5 as `explanationsJoin.NAME_MIN_JACCARD` (which law a passage explains)
 * - 0,6 as `annexBoundaries.TITLE_MATCH` (a title is evidence only when it
 *   fits one Artikel clearly better than any other)
 * - `annexBoundaries.TITLE_AGREE` (below it a title actively contradicts the
 *   number)
 *
 * A fifth, `risKons.NAME_MATCH`, reads `lawNameScore` through
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
 * **Die Vollform der Vorlage stand bis 19.09.2026 nicht darin.** Ein Entwurf
 * ohne Artikelzeile trägt seinen Titel als ganzen Satz — „Bundesgesetz, mit
 * dem das Lebensmittelsicherheits- und Verbraucherschutzgesetz **geändert
 * wird**" —, und die beiden Verben zählten als Inhalt. Gegen den Kurztitel
 * des RIS ergab das 2 von 4 gemeinsamen Wörtern, also 0,50, und `pickByName`
 * verlangt 0,60: Das LMSVG war damit gegen das zweite Gesetz desselben
 * Bundesgesetzblatts (BGBl. I Nr. 13/2006 schafft auch das Kontroll- und
 * Digitalisierungs-Durchführungsgesetz) nicht mehr bestimmbar — 20 von 20
 * Einheiten in 70/ME ohne Namen, und dasselbe Gesetz fehlte unter
 * „Geltendes Recht". Mit den Verben auf dieser Liste sind es 1,00 gegen 0,00.
 */
const TITLE_STOPWORDS = new Set([
  'änderung', 'änderungen', 'aufhebung', 'bundesgesetz', 'bundesgesetzes', 'gesetz', 'gesetzes',
  'über', 'sowie', 'mit', 'dem', 'des', 'der', 'die', 'das', 'den', 'und', 'von', 'zum', 'zur',
  // Die Vorlage in ihrer Satzform: „…, mit dem das X geändert wird".
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
  // Auch nach dem Stemmen: „geänderten" wird zu „geändert" und ist dann
  // dasselbe Füllwort, das die Liste oben schon kennt.
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
