/**
 * Which law of a package a row of the Textgegenüberstellung belongs to
 * (docs/api-exploration.md §2c).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * Three in five drafts amend several laws at once, and the annex prints them
 * one after another with an "Artikel n" heading in between. Getting that
 * heading wrong is not a cosmetic problem: § 5 of the second law is a
 * different provision from § 5 of the first, so a misplaced boundary compares
 * a paragraph against unrelated text and reports the difference as a change
 * the draft makes. In the 36 multi-law annexes, **124 of 821 § designations
 * (15,1 %) recur in another law of the same package** (measured 2026-09-09) —
 * the collision is the normal case, not an edge case.
 *
 * The annex alone cannot say which of its headings is a law boundary. It
 * prints "Artikel VI" for an internal division of one law, "Artikel 10. (1)
 * Bundessache ist …" for a provision of the B-VG, and "Art. 31 EUStA-VO" for
 * a citation, in the same type as a real boundary — and 30 real boundaries
 * are set at body font size, so even the type is no test.
 *
 * What settles it is the draft itself. A Ministerialentwurf lists its Artikel
 * with their numbers and the law each one amends, and the annex is an annex
 * *to that draft*: every boundary it prints must be one of them. A heading
 * that joins to no draft Artikel is not a boundary. Of 413 candidates over
 * 109 annex PDFs, 396 join by number and title; the rest are exactly the
 * pseudo-boundaries above. The check also catches what no rule inside the
 * annex could: one draft prints its Artikel 3 and 4 the other way round in
 * the annex, and only the title says so.
 *
 * Where the annex marks nothing and the draft names several laws, this
 * refuses. An unattributed comparison is a usable answer; a confidently
 * mis-attributed one is not.
 */
import { normalizeText } from './lawText'
import { lawNameScore, type DraftArticle } from './lawTitles'

/**
 * A law boundary inside a package: "Artikel 3", "Artikel 3 (Änderung des …)",
 * "Artikel VI". Three things this must *not* match, all observed:
 * "Art. 31 EUStA-VO" is a citation, "Artikel 10. (1) Bundessache ist …" is a
 * *provision* of a law that is itself organised in Artikel (B-VG), and
 * "Artikel 29b der Bilanz-Richtlinie" is a citation whose title starts with an
 * article. Hence: the full word, no trailing period, and a title that does not
 * open with a genitive article.
 */
export const LAW_BOUNDARY_RE = /^Artikel\s+(X?\d+[a-z]?|[IVXL]+)(?:\s+(?!der\b|des\b|Abs\.)(.+))?$/
/** "Änderung des Aktiengesetzes" — the law's name, printed under its Artikel line. */
export const LAW_TITLE_RE = /^(?:Änderung(?:en)?\s+(?:des|der)\b|Bundesgesetz,|Aufhebung\s+(?:des|der)\b)/i

/** A heading in the annex that might open a new law. */
export interface BoundaryCandidate {
  /** The heading as printed. */
  text: string
  /** "3", "III", "X1" — null for a heading that is only a law title. */
  numeral: string | null
  /** "Änderung des Aktiengesetzes", from the same line or the one below it. */
  title: string | null
}

/** A heading line → a candidate, or null when it is not boundary-shaped. */
export function candidateOf(line: string): BoundaryCandidate | null {
  const text = normalizeText(line)
  const m = LAW_BOUNDARY_RE.exec(text)
  if (m) return { text, numeral: m[1]!, title: m[2]?.trim() || null }
  if (LAW_TITLE_RE.test(text)) return { text, numeral: null, title: text }
  return null
}

export interface BoundaryResolution {
  /** Candidate index → the draft Artikel it opens. Refused candidates are absent. */
  accepted: Map<number, DraftArticle>
  /**
   * Every row belongs to this one Artikel: the annex marks no boundaries and
   * the draft names exactly one law, so there is nothing to tell apart.
   */
  whole: DraftArticle | null
  /**
   * Why the laws of this annex cannot be told apart, in the ressort's own
   * terms; null when they can. Rows then carry `law: null` and are shown as
   * one undivided comparison.
   */
  refusal: string | null
}

/** A title is evidence only when it fits one Artikel clearly better than any other. */
const TITLE_MATCH = 0.6
/** Below this the title actively contradicts the number. */
const TITLE_AGREE = 0.34

function bestByTitle(title: string, articles: readonly DraftArticle[], amendingOnly = false): DraftArticle | null {
  let best: { article: DraftArticle; score: number } | null = null
  let runnerUp = 0
  for (const article of articles) {
    if (!article.title) continue
    if (amendingOnly && !article.amends) continue
    const score = lawNameScore(title, article.title)
    if (!best || score > best.score) {
      runnerUp = best?.score ?? 0
      best = { article, score }
    } else if (score > runnerUp) runnerUp = score
  }
  if (!best || best.score < TITLE_MATCH || best.score <= runnerUp) return null
  return best.article
}

const isRoman = (numeral: string): boolean => /^[IVXL]+$/.test(numeral)

/**
 * The annex's candidate headings, checked against the draft's own Artikel.
 *
 * Every rule here exists because the annex on its own gets it wrong somewhere:
 * the number carries the join, the title corrects it where the two disagree,
 * and printed order rejects an internal heading that happens to look like one.
 */
export function resolveBoundaries(candidates: readonly BoundaryCandidate[], articles: readonly DraftArticle[]): BoundaryResolution {
  const numbered = articles.filter((a) => a.numeral !== null)
  const romanDraft = numbered.some((a) => isRoman(a.numeral!))
  const amending = articles.filter((a) => a.amends)
  const accepted = new Map<number, DraftArticle>()
  /** Candidates whose only evidence is the number — printed order may veto those. */
  const numberOnly = new Set<number>()

  for (const [i, candidate] of candidates.entries()) {
    const byTitle = candidate.title ? bestByTitle(candidate.title, articles, candidate.numeral === null) : null
    if (candidate.numeral === null) {
      // A heading that is only a law title. It opens a law only when it names
      // one of the draft's amending Artikel and no other.
      if (byTitle) accepted.set(i, byTitle)
      continue
    }
    // Roman numerals are how a single law divides itself internally. They are
    // a law boundary only in a draft that numbers its own Artikel that way.
    if (isRoman(candidate.numeral) && !romanDraft) continue
    const sameNumber = numbered.filter((a) => a.numeral === candidate.numeral)
    const byNumber = sameNumber.length === 1 ? sameNumber[0]! : null
    if (!byNumber) {
      if (byTitle) accepted.set(i, byTitle)
      continue
    }
    // The number wins unless the title says something else entirely and fits
    // another Artikel unambiguously — one draft prints its Artikel 3 and 4 in
    // the reverse order in the annex, and nothing but the title reveals it.
    const agrees = !candidate.title || !byNumber.title || lawNameScore(candidate.title, byNumber.title) >= TITLE_AGREE
    if (!agrees && byTitle && byTitle !== byNumber) {
      accepted.set(i, byTitle)
      continue
    }
    accepted.set(i, byNumber)
    if (!agrees || !candidate.title || !byTitle) numberOnly.add(i)
  }

  // A law is opened once. Annexes repeat a law's title over its later pages,
  // and a repeat is not a second law.
  const opened = new Set<number>()
  for (const i of [...accepted.keys()].sort((a, b) => a - b)) {
    const index = accepted.get(i)!.index
    if (opened.has(index)) accepted.delete(i)
    else opened.add(index)
  }

  // Printed order. The annex runs through the draft's laws front to back, so a
  // heading that jumps backwards is an internal division that happens to be
  // numbered like an Artikel. A heading whose title also matches is exempt:
  // there the backwards jump is the annex reordering two real laws.
  let furthest = -1
  for (const i of [...accepted.keys()].sort((a, b) => a - b)) {
    const article = accepted.get(i)!
    if (article.index <= furthest && numberOnly.has(i)) {
      accepted.delete(i)
      continue
    }
    furthest = Math.max(furthest, article.index)
  }

  if (accepted.size > 0) return { accepted, whole: null, refusal: null }

  // Nothing survived. Either there was nothing to find, or the annex does not
  // mark what the draft says is there.
  if (candidates.some((c) => c.numeral !== null) && numbered.length === 0) {
    // The cross-check is symmetric, and here it indicts the draft: the annex
    // is divided into Artikel that the draft's own parse does not know about.
    return { accepted, whole: null, refusal: 'Der Entwurf nennt keine Artikel, die Beilage schon — die Zuordnung wäre geraten.' }
  }
  if (amending.length === 1) return { accepted, whole: amending[0]!, refusal: null }
  if (amending.length === 0) return { accepted, whole: articles.length === 1 ? articles[0]! : null, refusal: null }
  return {
    accepted,
    whole: null,
    refusal: `Die Beilage grenzt die ${amending.length} Gesetze des Entwurfs nicht ab; die Paragraphen lassen sich keinem einzelnen zuordnen.`,
  }
}

/** The heading a boundary gets in the UI: the draft's wording, not the annex's. */
export function headingOf(article: DraftArticle): string {
  if (article.number && article.title) return `${article.number} — ${article.title}`
  return article.number ?? article.title ?? 'Gesetzestext'
}
