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

import { stammnormOf, type BgblCitation } from './bgblCitation'
import type { TextBlock } from './lawUnits'

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
 *
 * The same window is applied a second time in `lawUnits.segmentUnits`; the two
 * copies are one rule and neither may move without the other.
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
