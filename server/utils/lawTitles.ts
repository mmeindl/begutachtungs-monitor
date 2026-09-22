/**
 * Which law a draft's Artikel amends, read from its Promulgationsklausel
 * (docs/architecture.md §12.11).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * A change reads as legistic noise until the § it touches has a name: "In
 * § 9 Abs. 1 …" means nothing, "§ 9 Sofortlotterien" means something. That
 * name is the § heading in RIS Bundesrecht — a lookup, not a summary
 * (§12.11). The lookup needs to know *which* law, and every amending Artikel
 * opens by saying so:
 *
 *   "Das Audiovisuelle Mediendienste-Gesetz – AMD-G, BGBl. I Nr. 84/2001,
 *    zuletzt geändert durch …, wird wie folgt geändert:"
 *
 * The **first** citation is the Stammnorm; the second is the most recent
 * amendment. RIS carries the same pair as `StammnormPublikationsorgan` and
 * `StammnormBgblnummer`, so the join is an equality check, not a title match.
 *
 * The Teil matters and is not decorative: `Kundmachungsorgannummer=84/2001`
 * returns the AMD-G (BGBl. I) *and* an Amtssitz law (BGBl. III). Verified
 * 2026-09-09.
 */
import type { LawDiffUnit } from '../../shared/types'
import type { TextBlock } from './lawText'
import { normalizeText } from './lawText'
import { parseInstruction } from './novao'

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
function stem(word: string): string {
  return word.replace(/ß/g, 'ss').replace(/(?<=.{5})(?:es|en|s|n)$/, '')
}

function titleTokens(title: string): Set<string> {
  const words = normalizeText(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 3 && !TITLE_STOPWORDS.has(w))
  // Auch nach dem Stemmen: „geänderten" wird zu „geändert" und ist dann
  // dasselbe Füllwort, das die Liste oben schon kennt.
  return new Set(words.map(stem).filter((w) => !TITLE_STOPWORDS.has(w)))
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
  const x = titleTokens(a)
  const y = titleTokens(b)
  if (x.size === 0 || y.size === 0) return 0
  let shared = 0
  for (const w of x) if (y.has(w)) shared++
  return shared / (x.size + y.size - shared)
}

/**
 * A Promulgationsklausel announces that an existing law is being amended.
 * A Stammgesetz has none — it creates law rather than changing it, so there
 * is nothing to look up and nothing to name.
 */
/**
 * „wird **in seinem Artikel 1** wie folgt geändert" — zwischen dem Verb und
 * der Formel steht regelmäßig eine Einschränkung, und zwar bei genau den
 * Gesetzen, die selbst artikelgegliedert sind (Eltern-Kind-Pass-Gesetz,
 * 60/ME). Ohne die Lücke im Ausdruck fiel ihr Artikel aus *drei* Anzeigen
 * zugleich: Er fehlte unter „Geltendes Recht", seine §§ bekamen keinen Namen,
 * und die Lesefassung zählte sie nicht einmal in ihren Nenner (19.09.2026).
 *
 * Begrenzt und ohne Satzzeichen: Die Klausel ist ein Satz, und der Abstand
 * hält den Ausdruck von einem Querverweis fern, der in einem *neuen* Gesetz
 * steht („… wird in § 5 geregelt. Das Gesetz X wird wie folgt geändert" wäre
 * zwei Sätze) — die Verwechslung, die 101/ME einmal zu einer Novelle machte.
 */
const AMENDS_RE = /\b(?:wird|werden)\b[^.;:]{0,80}?\bwie folgt geändert|\bwird geändert\b|\bwerden geändert\b/i

/**
 * Exported so a caller that has to find the clause for itself uses the same
 * test rather than a second, drifting one. `draftArticles` cannot always do
 * it: a single-law Novelle prints no Artikel line and its clause arrives
 * classified as an instruction, so the article scanner never reaches this
 * check (92/ME). Without the test a leading BGBl looks like a clause even
 * when it is a cross-reference inside a new law's own text — which turned
 * the Stammgesetz 101/ME into an amendment of the law its § 1 cites.
 */
export function isAmendmentClause(text: string): boolean {
  return AMENDS_RE.test(text)
}

/** A qualifier printed where the law's name would be, and not a name. */
const QUALIFIER_RE = /^\((?:Verfassungs|Grundsatz)bestimmung(?:en)?\)$/i

/** The numeral of an Artikel heading: "3", "III", "X1". */
const ARTICLE_NUMERAL_RE = /^Artikel\s+(X?\d+[a-z]?|[IVXL]+)\b/

/**
 * One Artikel of a draft — the unit a package's annex divides into.
 *
 * A draft without Artikel yields a single entry with `number: null`, so that
 * a Novelle of one law and a package of twelve are the same shape to callers.
 */
export interface DraftArticle {
  /** Position in printed order, 0-based. The annex must not reorder these. */
  index: number
  /** "Artikel 3" as printed, or null for a draft without Artikel. */
  number: string | null
  /** The numeral alone: "3", "III", "X1". Null without Artikel. */
  numeral: string | null
  /**
   * The law's name under the Artikel line, with a bare "(Verfassungs-
   * bestimmung)" skipped — that is a qualifier, not a name, and matching an
   * annex heading against it would join on a word the annex never prints.
   */
  title: string | null
  /**
   * The key `segmentUnits` and `promulgationByArticle` use (`articleTitle ??
   * articleNumber`), qualifier and all, so a row joins onto the diff units
   * without a second convention. Null only where both are — a draft that
   * neither numbers its Artikel nor names itself.
   */
  key: string | null
  /**
   * Whether the Artikel carries a Promulgationsklausel at all. Not the same
   * as `bgbl !== null`: the UGB's Stammnorm is "dRGBl. S. 219/1897", which is
   * no BGBl and so unresolvable — the Artikel still amends a law.
   */
  amends: boolean
  /** The Stammnorm this Artikel amends; null when it creates law instead. */
  bgbl: BgblCitation | null
}

/**
 * A draft's Artikel in printed order, each with the law it amends.
 *
 * `promulgationByArticle` answers "which law does this key amend"; this
 * answers "which laws does the draft contain, in what order, under what
 * numbers" — the question the annex's Artikel headings have to be checked
 * against. A heading in the annex that matches no entry here is not a law
 * boundary but an internal heading, and that single test removes every
 * pseudo-boundary the annex itself cannot distinguish (2026-09-09).
 *
 * **A law is named before its first instruction, and only there.** The window
 * is the same one the Promulgationsklausel stands in, and it has to be closed
 * for the name as well: an instruction that rewrites an Anlage or a Kapitel
 * prints the heading it installs, and RIS tags that quoted heading exactly as
 * it tags a law title — `ueberschrift typ="anlage"`, `"g2"`, `"titel"`. Read
 * as a name, it renamed the law half way through the draft, and the annex's
 * rows then carried a key that the instructions above it do not (the three
 * false alarms of the UH-Statistik- und Bildungsdokumentationsverordnung,
 * 2026-09-11).
 *
 * The position separates the two classes without a remainder. Measured over
 * the 400 GP-XXVIII drafts, 2026-09-11: of the **651 Abschnitt headings** this
 * rule accepted as an Artikel's name, **649 stand before the Artikel's first
 * Novellierungsanordnung and 2 after it**; of the **405 title blocks**,
 * **390 before and 15 after**. All **17** late ones are quoted payload — every
 * one of them opens with a quotation mark, which is the second, independent
 * signal that they are text rather than structure. The 2 are the Anlage
 * heading of the UH-Statistik-Verordnung ("Anlage 1 zu § 6 Anhang zum Diplom
 * …") and the Kapitel heading of the Wasserstraßen-Verkehrsordnung
 * ("Schallzeichen, Sprechfunk, …"); the 15 are Verordnungen that re-issue a
 * law in full and print its title inside the instruction.
 */
export function draftArticles(blocks: readonly TextBlock[]): DraftArticle[] {
  const out: DraftArticle[] = []
  let seenNovao = false
  let current: DraftArticle = { index: 0, number: null, numeral: null, title: null, key: null, amends: false, bgbl: null }
  /** An implicit leading article is only real once it carries something. */
  const filled = (a: DraftArticle): boolean => a.number !== null || a.key !== null || a.amends

  const close = (): void => {
    // `segmentUnits` keys its units `articleTitle ?? articleNumber`; an
    // Artikel that prints no law name under its line therefore answers to its
    // number, and this key has to be the same string or the annex's rows join
    // onto no instruction at all. 13 of GP XXVIII's 1.052 Artikel carry no
    // name, 9 of them a number and 7 an amended law (2026-09-11) — and two of
    // those seven are the two Artikel of one draft, which a null key merges
    // into a single entry.
    if (filled(current)) out.push(current.key === null ? { ...current, key: current.number } : current)
  }

  for (const b of blocks) {
    if (b.kind === 'article') {
      close()
      current = { index: out.length, number: b.text, numeral: ARTICLE_NUMERAL_RE.exec(b.text)?.[1] ?? null, title: null, key: null, amends: false, bgbl: null }
      seenNovao = false
      continue
    }
    if (b.kind === 'section') {
      if (current.number === null || seenNovao) continue
      if (current.key === null) current.key = b.text
      if (current.title === null && !QUALIFIER_RE.test(b.text.trim())) current.title = b.text
      continue
    }
    if (b.kind === 'title') {
      // The law's own title, for a draft without Artikel. The last one before
      // the first instruction wins, as it did before: a draft that prints
      // Lang- and Kurztitel names itself in the shorter one.
      if (current.number !== null || seenNovao) continue
      current.key = b.text
      if (!QUALIFIER_RE.test(b.text.trim())) current.title = b.text
      continue
    }
    if (b.kind === 'novao') {
      seenNovao = true
      continue
    }
    // The clause stands between the Artikel heading and the first
    // instruction; anything later that cites a BGBl is a cross-reference.
    if (seenNovao || current.amends) continue
    if (!AMENDS_RE.test(b.text)) continue
    current.amends = true
    current.bgbl = stammnormOf(b.text)
  }
  close()
  return out
}

/**
 * A draft's Artikel with the blocks each one owns.
 *
 * `draftArticles` answers "which laws, in what order"; this adds "and which
 * text belongs to each", which is what any caller that wants to *work* on one
 * law of a package needs. A Sammelnovelle is not one amendment: each Artikel
 * names its own law in its own Promulgationsklausel, numbers its instructions
 * from 1, and addresses a § space the next Artikel re-uses — so § 5 of
 * Artikel 3 and § 5 of Artikel 7 are different provisions of different laws,
 * and anything that reads the whole document at once conflates them.
 *
 * The split is the printed Artikel line, the same boundary `segmentUnits`
 * resets its state on. Each partition is then read by `draftArticles` itself,
 * so there is one rule for what an Artikel is and where its name comes from,
 * not two; only `index` is restored across the partitions, because a per-part
 * reading starts counting at zero and the annex joins on printed order.
 *
 * Text before the first Artikel line is its own entry — the package's own
 * title block. It carries no Promulgationsklausel, so a caller filtering on
 * `amends` drops it without a special case.
 */
export function articleBlocks(blocks: readonly TextBlock[]): { article: DraftArticle; blocks: TextBlock[] }[] {
  const parts: TextBlock[][] = []
  let current: TextBlock[] = []
  for (const b of blocks) {
    if (b.kind === 'article' && current.length > 0) {
      parts.push(current)
      current = []
    }
    current.push(b)
  }
  if (current.length > 0) parts.push(current)
  const out: { article: DraftArticle; blocks: TextBlock[] }[] = []
  for (const part of parts) {
    const article = draftArticles(part).at(-1)
    if (article) out.push({ article: { ...article, index: out.length }, blocks: part })
  }
  return out
}

/**
 * Artikel title → the Stammnorm of the law it amends.
 *
 * Keyed exactly as `segmentUnits` keys its units (`articleTitle ??
 * articleNumber`, null for a package without Artikel), so the result joins
 * onto the diff units without a second convention.
 */
export function promulgationByArticle(blocks: readonly TextBlock[]): Map<string | null, BgblCitation> {
  const out = new Map<string | null, BgblCitation>()
  for (const article of draftArticles(blocks)) {
    if (article.bgbl && !out.has(article.key)) out.set(article.key, article.bgbl)
  }
  return out
}

/**
 * The § whose heading names this instruction — or null when there is none.
 *
 * An instruction that creates a paragraph names its *anchor*: "Nach § 5 wird
 * folgender § 5a eingefügt" addresses § 5, but the change is § 5a. Titling it
 * "§ 5 …" would put a real heading from the standing law onto a paragraph it
 * does not describe — a wrong name, which is worse than none. Those changes
 * carry their own heading from the draft anyway (the quoted-heading path).
 *
 * An instruction that adds a sub-unit ("In § 5 wird folgender Abs. 3
 * eingefügt") does happen inside § 5, so its heading fits.
 */
export function addressedParagraph(line: string): string | null {
  const { ops } = parseInstruction(line)
  if (ops.length === 0) return null
  const paras = new Set<string>()
  for (const op of ops) {
    if (op.kind === 'toc' || op.kind === 'container') continue
    if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') return null
    const address = 'target' in op ? op.target : op.anchor
    if (address.para) paras.add(address.para)
  }
  // Several paragraphs in one instruction have no single name.
  return paras.size === 1 ? [...paras][0]! : null
}

/**
 * Dasselbe für eine Einheit des Vergleichs: Welchen Paragraphen ändert diese
 * Novellierungsanordnung?
 *
 * Gelesen wird der ungekürzte Anweisungstext, nicht `heading` — das ist die
 * auf rund 100 Zeichen geschnittene Anzeigezeile, und mit dem Schnitt fällt
 * regelmäßig die schließende Klammer weg, sodass der Parser die Anweisung
 * verwirft statt sie zu verstehen. Eine Stelle für alle Aufrufer: die §-Namen
 * und der Begründungsvergleich müssen denselben Paragraphen meinen.
 */
export function addressedParagraphOf(unit: LawDiffUnit): string | null {
  const line = unit.toText ?? unit.fromText ?? unit.heading
  return line ? addressedParagraph(line) : null
}
