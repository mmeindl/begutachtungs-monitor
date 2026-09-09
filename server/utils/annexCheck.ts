/**
 * Is the annex's "Geltende Fassung" really the law as it stands?
 * (docs/api-exploration.md §2c, docs/architecture.md §12.13)
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * The left column of a Textgegenüberstellung claims to be the standing law
 * on the day the consultation opens. RIS holds that text independently, so
 * the claim is checkable — and it is the only self-check either annex path
 * has. The right column cannot be checked against anything: it is the law
 * the draft proposes, which exists nowhere else yet.
 *
 * That makes this module the whole basis of the gate. Where the left column
 * matches, the pairing is sound and the word diff beside it means what it
 * says. Where it does not, the page is diffing displayed text against a
 * provision it does not belong to — and the reader has no way to tell.
 *
 * Measured 2026-09-09 over the annexes the page shows today (101 evaluable
 * drafts, 964 §§ with real prose): 86,9 % cover the standing § to 99 % or
 * better, and 45 §§ (4,7 %) fall below 80 % — those are mis-paired or quote
 * a superseded version, and every one of them is on the page right now as a
 * word diff. A few fail in clusters, a whole law at a time (the IVS-Gesetz
 * annex, 51/ME, scores 9 of 16); most fail one or two §§ per draft.
 *
 * **Why this is not a text comparison.** The annex abbreviates unchanged
 * stretches by the Rundschreiben ("(2) bis (4) …"), prints markers RIS keeps
 * out of the text, and copies RIS's own editorial notes. So the test is what
 * share of the column's *comparable* words appear in the RIS paragraph at
 * all — containment of a deliberate subset, never equality.
 *
 * The verdict logic lived in `scripts/annex-pdf-verify.ts` and could
 * therefore neither be tested nor applied to the path that ships. Three of
 * the discounts below were once the ruler blaming the parse for its own
 * gaps, which is the third time in this project that the measuring
 * instrument was worse than the thing measured.
 *
 * **Three verdicts per §, and a fourth state for the whole annex.** A § is
 * `verified` only where it carried enough prose to judge *and* the standing
 * text accounts for it, `withheld` where it was judged and did not, and
 * `unchecked` in every other case — including the cases the check never
 * reached. Whether the check reached anything at all is `ran`, with a reason
 * beside it: "nothing failed" and "nothing was looked at" produce the same
 * counts and are not the same claim. Until 2026-09-10 the service inverted
 * this and labelled a row `verified` unless the check had named it, which
 * turned every one of those states into a vouched-for comparison.
 */
import { normalizeText } from './lawText'
import type { DraftArticle } from './lawTitles'
import type { KonsLawAtDate, KonsParagraphRef } from './risKons'
import { summarizeComparison, type ComparisonRow, type ComparisonStats } from './textComparison'
import type { TextComparisonRow } from '../../shared/types'

/**
 * What is not comparable, on either side.
 *
 * - **Elision.** "(1) bis (3) …" says three Absätze are unchanged and left
 *   out. It is the annex's own syntax; "bis" is not law text, and it was the
 *   single most frequent "missing" word in the corpus. The same syntax runs
 *   over §§ and Ziffern too: "§ 21. bis § 25. …", "1. bis 100. …".
 * - **The row's own designation.** RIS keeps "§ 217." as the paragraph's
 *   marker, not as its text, so the column's designation can never be found
 *   and "217" would count as a missing word.
 * - **RIS's editorial notes.** "(Anm.: Abs. 2 aufgehoben durch …)" is not
 *   law; `lawStructure.ts` strips it from the RIS side and the annex copies
 *   it verbatim, so it has to go from the column side as well or the
 *   asymmetry is scored against the parse.
 * - **RIS web-view boilerplate.** A few annexes paste "Beachte für folgende
 *   Bestimmung" along with the text; it is in no XML.
 *
 * What is *not* discounted: Abschnitt, Hauptstück and Teil headings. The
 * premise was that RIS files them outside the §. It does not — they are
 * inside every § document, and callers pass them in from `node.context`.
 */
/** A chain of designations joined by "bis"/"und", closed by three dots. */
const ELISION_RE = /(?:§+\s*)?\(?\d+[a-z]*\)?\.?(?:\s*(?:bis|und|,)\s*(?:§+\s*)?\(?\d+[a-z]*\)?\.?)*\s*(?:\.\.\.|…)/g
/** "§ 217." — the designation form, which ends in a period; a citation does not. */
const DESIGNATION_RE = /(?:^|\s)§+\s*\d+[a-z]*\.(?=\s|$)/g
const ANNOTATION_RE = /\(Anm\.:[^()]*(?:\([^()]*\)[^()]*)*\)/g
const BOILERPLATE_RE = /Beachte für folgende Bestimmung/gi

/**
 * Below this many comparable words a § says nothing either way: a row that is
 * a heading plus "(1) bis (3) …" shows nothing of the provision on purpose,
 * so scoring it would measure the Rundschreiben rather than the parse.
 *
 * Measured, because every § under the floor is one the gate waves through
 * unexamined. Over the 1.040 §§ of the live corpus with any comparable words
 * (`annex-pdf-verify.ts --xml --calibrate`, 2026-09-09):
 *
 * | Wörter | §§  | ≥ 95 % |
 * |--------|-----|--------|
 * | 1–4    |  10 |   50 % |
 * | 5–14   |  66 |   89 % |
 * | 15–∞   | 964 |   87 % |
 *
 * The 5–14 band verifies at the same rate as the whole corpus, so those §§
 * are evidence and belong inside the gate; the floor of 15 was inherited
 * from scoring single *rows* and excused 66 of them, seven wrongly. The 1–4
 * band is noise: with four words one missing word is 75 %, and half the band
 * falls short. Hence five.
 */
export const MIN_PROSE_TOKENS = 5

/**
 * A § whose displayed changes fall below this share of coverage is not shown.
 * Calibrated on the live corpus, where the per-§ distribution runs median
 * 100 %, p25 100 %, p10 98 %: the band between 0.95 and 0.99 is hyphenation,
 * footnotes and stray designations, while everything genuinely mis-paired
 * sits far below — 29 of the 45 failures are under 50 %. Drawing the line at
 * 0.99 would withhold about 60 sound §§ to catch nothing extra.
 */
export const PARAGRAPH_THRESHOLD = 0.95

/**
 * Below this verified share, a law is *flagged* — named on the page as
 * doubtful as a whole — but its §§ are not withheld beyond the ones that
 * failed on their own.
 *
 * The distinction is deliberate, and it is the opposite of what this module
 * first did. Clustered failure does say something a single § does not: the
 * ministry based the annex on a different version of the law, or the Artikel
 * resolved to the wrong law. But a § that clears 95 % coverage over real
 * prose has not done so by accident — a bag test over dozens of words does
 * not pass against an unrelated provision. So where a version differs, the
 * §§ that did not change between versions verify *correctly* and their
 * diffs are sound; withholding them buys no safety and costs the reader the
 * part of the annex that was right. Withholding stays per §; the cluster
 * becomes a sentence.
 */
export const LAW_THRESHOLD = 0.7

/**
 * A law needs at least this many judged §§ before a *share* means anything.
 * One failing § out of one is not a pattern, and calling that law doubtful
 * as a whole told the reader something much broader than the evidence — 14
 * of the 18 flags in the live corpus were laws with one or two judged §§.
 */
export const MIN_JUDGED_FOR_LAW_VERDICT = 3

/** Comparable words of a text: the discounts above, lowercased, short words dropped. */
export function comparableTokens(text: string): string[] {
  return text
    .replace(ANNOTATION_RE, ' ')
    .replace(BOILERPLATE_RE, ' ')
    .replace(ELISION_RE, ' ')
    .replace(DESIGNATION_RE, ' ')
    .replace(/(?:\.\.\.|…)/g, ' ')
    .toLowerCase()
    .replace(/[„“”"'‚‘’]/g, '')
    .replace(/[­‑]/g, '-')
    .split(/[^\p{L}\p{N}§-]+/u)
    .filter((w) => w.length > 2)
}

export interface Coverage {
  /** Share of the column's comparable words found in the standing text, 0–1 */
  ratio: number
  /** Words the standing text does not have, for the report */
  missing: string[]
  /** How many comparable words the column carried */
  comparable: number
  /**
   * Enough prose to be evidence either way.
   *
   * A `verified` field used to stand beside this one, computed as `!prose ||
   * ratio >= PARAGRAPH_THRESHOLD` — "passed, or nothing to judge". That is
   * the conflation the gate was built on and got wrong: a § nobody could
   * judge left the service labelled *geprüft*. Callers read `prose` and
   * `ratio` separately now, so the three states stay three.
   */
  prose: boolean
}

/**
 * How much of `column` the `standing` text accounts for.
 *
 * A bag test, deliberately: the annex breaks lines where the layout demands
 * and RIS where the structure does, so word order is not evidence. What it
 * catches is the case that matters — a column belonging to another provision
 * shares almost no vocabulary with this one.
 */
export function coverageOf(column: string, standing: string): Coverage {
  const want = comparableTokens(normalizeText(column))
  const have = new Set(comparableTokens(normalizeText(standing)))
  const missing = want.filter((w) => !have.has(w))
  const ratio = want.length === 0 ? 1 : 1 - missing.length / want.length
  return { ratio, missing, comparable: want.length, prose: want.length >= MIN_PROSE_TOKENS }
}

/**
 * The rows whose left column the page presents as a change.
 *
 * Only these need to hold: an `unchanged` row is folded away behind a count,
 * and an `inserted` row has no left column to check — the provision it
 * proposes does not exist in the standing law, which is the point of it. An
 * `elided` row is the annex saying it left text out.
 */
export function isDisplayedChange(row: ComparisonRow): boolean {
  return row.kind === 'pair' && !row.elided && row.current.length > 0 && (row.change === 'changed' || row.change === 'removed')
}

export function displayedChangeRows(rows: readonly ComparisonRow[]): ComparisonRow[] {
  return rows.filter(isDisplayedChange)
}

/**
 * Coverage of every displayed change of one § at once.
 *
 * Per § rather than per row, because the annex splits one provision over as
 * many rows as its layout needs: a single Absatz continued on the next row
 * would score twice, and a row carrying six words would drag a sound §
 * below the line on its own.
 */
export function coverageOfParagraph(rows: readonly ComparisonRow[], standing: string): Coverage {
  return coverageOf(displayedChangeRows(rows).map((r) => r.current).join(' '), standing)
}

/**
 * What the check concluded about a law.
 *
 * "Checked and wrong" and "not checkable" are different states, and
 * collapsing them either hides real failures or throws away sound work: a
 * draft that creates new law has no Stammnorm to check against, a
 * Verordnung is not in Bundesrecht at all, and neither is evidence of
 * anything. `doubtful` is the third: enough §§ of this law failed that the
 * annex probably quotes another version of it — a sentence for the reader,
 * not a reason to withhold the §§ that verified.
 */
export type LawVerdict = 'verified' | 'doubtful' | 'unchecked'

export interface LawCheck {
  law: string | null
  verdict: LawVerdict
  /** §§ carrying enough prose to judge */
  judged: number
  /** …of those, the ones that cleared the threshold */
  verified: number
  /** Every § that fell below it */
  failed: string[]
}

/**
 * The verdict on one law of a package, from the coverage of its §§.
 *
 * `doubtful` needs a cluster: enough §§ judged for a share to mean something
 * (`MIN_JUDGED_FOR_LAW_VERDICT`) and enough of them failing. The IVS-Gesetz
 * annex (51/ME) is the case it is for — 7 of its 16 §§ miss, which is a
 * version difference and not sixteen coincidences.
 */
export function lawCheck(law: string | null, byParagraph: ReadonlyMap<string, Coverage>): LawCheck {
  const judged = [...byParagraph].filter(([, c]) => c.prose)
  const failed = judged.filter(([, c]) => c.ratio < PARAGRAPH_THRESHOLD).map(([para]) => para)
  const verified = judged.length - failed.length
  const verdict: LawVerdict =
    judged.length === 0
      ? 'unchecked'
      : judged.length >= MIN_JUDGED_FOR_LAW_VERDICT && verified / judged.length < LAW_THRESHOLD
        ? 'doubtful'
        : 'verified'
  return { law, verdict, judged: judged.length, verified, failed }
}

/**
 * Where the standing law comes from.
 *
 * Injected rather than imported, so the whole gate is one pure function: the
 * service passes Nitro-cached lookups, a test passes fakes, and the harness
 * passes uncached ones and measures exactly what the request path decides.
 * A gate that could only run inside a request would be a gate nobody could
 * check, which is the mistake this project has already made once with the
 * verdict logic living in a script.
 */
export interface AnnexSources {
  /** Which law a Stammnorm means at a date, with its § index. */
  resolveLaw: (organ: string, nummer: string, date: string, title: string) => Promise<KonsLawAtDate | null>
  /**
   * The standing text of one §, group headings included — the Abschnitt and
   * Hauptstück lines above a § are outside `plainText` but the annex prints
   * them, so they have to be offered or they count as missing words. Null
   * for a § RIS holds as a table: `lawStructure.ts` does not represent those
   * as a tree, and a § that cannot be represented is left unjudged rather
   * than scored against nothing.
   */
  standingText: (ref: KonsParagraphRef) => Promise<string | null>
}

/** Ceiling on § lookups per draft, so one monster Sammelgesetz cannot hang a request. */
export const MAX_PARAGRAPHS = 160
const CONCURRENCY = 4

/** Knobs the tests turn; the defaults are what a request uses. */
export interface AnnexCheckOptions {
  /** Ceiling on § lookups; the §§ past it stay `unchecked`. */
  maxParagraphs?: number
  /** Parallel RIS lookups. */
  concurrency?: number
}

/**
 * Why §§ went unchecked, in words fit to show a reader.
 *
 * Fragments rather than sentences: the page joins them behind "Nichts konnte
 * geprüft werden: …". Each names a state that is genuinely ours to explain —
 * a RIS outage is deliberately *not* among them, because a failing upstream
 * throws out of this module instead of answering, so no cache ever holds a
 * definitive-sounding sentence about a network hiccup (§12.13).
 */
export const REASON_NO_PARAGRAPHS = 'die Beilage nennt keine Paragraphen'
export const REASON_NO_ASOF = 'im RIS fehlt der Beginn der Begutachtungsfrist'
export const REASON_NO_ARTICLES = 'die Artikel des Entwurfs ließen sich nicht lesen'
export const REASON_NO_AMENDING = 'der Entwurf schafft neues Recht oder ist eine Verordnung — es gibt keinen geltenden Text im RIS Bundesrecht'
export const REASON_BOUNDARY = 'die Gesetze der Beilage ließen sich nicht abgrenzen'
export const REASON_NO_BGBL = 'im Entwurf steht keine Fundstelle im Bundesgesetzblatt, über die sich das geltende Recht auffinden ließe'
export const REASON_UNRESOLVED = 'das geänderte Gesetz ließ sich im RIS Bundesrecht nicht auflösen'
export const REASON_UNREADABLE_DESIGNATION = 'die Beilage bezeichnet diese Stellen nicht als Paragraphen'
export const REASON_NO_SUCH_PARAGRAPH = 'das RIS Bundesrecht führt diese Paragraphen nicht'
export const REASON_NOT_REPRESENTABLE = 'der geltende Paragraph steht im RIS als Tabelle und ist so nicht vergleichbar'
export const REASON_CEILING = 'die Beilage nennt mehr Paragraphen, als in einer Anfrage geprüft werden können'
export const REASON_TOO_SHORT = 'die gezeigten Änderungen tragen zu wenig Text für einen Abgleich'
/**
 * The same silence as `REASON_TOO_SHORT`, one step further: not a few words
 * but none at all. A § whose changes are all *insertions* has no "Geltende
 * Fassung" to check — which is the point of an insertion — and so has one
 * whose only displayed change is elision syntax.
 *
 * Split off on 2026-09-10 because the page started printing these reasons
 * (§12.13): 99/ME inserts §§ and nothing else, and telling its reader that
 * "die gezeigten Änderungen tragen zu wenig Text" about a screen full of new
 * provisions is false in the ordinary reading of it.
 */
export const REASON_NOTHING_TO_COMPARE = 'die Beilage zeigt an diesen Stellen keinen geltenden Text, der sich vergleichen ließe'

/** What the check concluded about one § of the annex. */
export type ParagraphVerdict = 'verified' | 'withheld' | 'unchecked'

/** The verdict on one annex: which §§ may be shown, and which laws may not. */
export interface AnnexVerification {
  /**
   * At least one § was compared against a standing text from RIS.
   *
   * False means the check never got that far — no Beginn der
   * Begutachtungsfrist, no law to resolve, no § designation in the annex.
   * The page needs the difference: "nothing failed" and "nothing was looked
   * at" produce the same counts and are not the same claim.
   */
  ran: boolean
  /** Why §§ went unchecked, first observed first (`REASON_*`). */
  reasons: string[]
  /**
   * The verdict per § key (`annexParagraphKey`). Every § the annex names has
   * an entry; a key that is missing was never seen, and callers must read
   * that as `unchecked`. A row may be shown as verified only where its § is
   * `verified` here.
   */
  verdicts: Record<string, ParagraphVerdict>
  /**
   * Laws where enough §§ failed to doubt the whole annex for that law. Named
   * on the page; their §§ are withheld only where each failed on its own.
   */
  doubtfulLaws: LawCheck[]
  /** §§ that carried enough prose to judge */
  judged: number
  /** …of those, the ones that cleared the threshold */
  verified: number
}

/**
 * The key a § is filed under, so a package's two § 5 stay apart — 15,1 % of
 * § designations in the multi-law annexes recur in another law of the same
 * package, so the law has to be part of the identity.
 *
 * Named apart from `tguOracle.paragraphKey`, which builds the same shape from
 * the *normalised* id ("5") while this one keeps the annex's own designation
 * ("§ 5."). Two functions of the same name and the same shape whose arguments
 * are in the opposite order is the kind of thing auto-import resolves
 * silently and wrongly.
 */
export function annexParagraphKey(law: string | null, para: string): string {
  return `${law ?? ''}#${para}`
}

/** "§ 5", "Art. 3 § 5", "Anl. 1/59" — a designation and its numeral, in order. */
const DESIGNATION_PART_RE = /(§|Art|Anl|Anh)[a-zäöüß.]*\s*(\d+(?:\.\d+)?[a-z]*\d*(?:\/\d+)?)/gi
/** A Gliederungssymbol that dropped its sign: "5.", "12a". */
const BARE_NUMERAL_RE = /^\s*(\d+(?:\.\d+)?[a-z]*\d*)\s*\.?\s*$/i

/**
 * A designation as a comparable key — the annex's "§ 5." and RIS's "§ 5" name
 * the same provision, "§ 5a" names another one.
 *
 * Exact equality, and that is the point. The shipped rule built
 * ``^§+\s*${id}(?![.\d])`` from the annex's id and took the first RIS label it
 * matched; for id "5" that pattern matches **"§ 5a"**, so whichever of the two
 * RIS happened to return first decided, and § 5 could be scored against § 5a's
 * text — withheld for a divergence it never had, or vouched for against the
 * wrong provision. It is no corner case either: of 195.000 RIS labels in the
 * cached corpus, 34.000 carry a letter suffix (measured 2026-09-10).
 *
 * Composite labels are the same mistake one level up, and they fall out of an
 * exact comparison on their own. RIS files an article-structured law as
 * **"Art. 3 § 5"** (5.474 labels), and "§ 5" must not find it: in such a law
 * the Artikel is part of a §'s identity, which is why the amendment engine
 * refuses those addresses too (`lawApply.ts`). An Anlage cut into parts is
 * "Anl. 1/59" (118 labels), which is not "Anl. 1" — matching it would have
 * scored a whole schedule against one fifty-ninth of it.
 *
 * Measured against every RIS label in the cached corpus (195.148 occurrences,
 * 4.198 distinct, 2026-09-10): none is unreadable here, so the exactness
 * costs no coverage.
 *
 * Null for a text carrying no designation at all.
 */
export function designationKey(text: string): string | null {
  const parts: string[] = []
  for (const m of text.matchAll(DESIGNATION_PART_RE)) {
    const word = m[1]!.toLowerCase()
    parts.push(`${word === '§' ? '§' : word === 'art' ? 'Art' : 'Anl'} ${m[2]!.toLowerCase()}`)
  }
  if (parts.length > 0) return parts.join(' ')
  // A bare numeral is a §: the annex's Gliederungssymbol drops the sign often
  // enough that refusing here would cost coverage and buy nothing — a wrong
  // guess still has to survive the coverage test on the § it lands on.
  const bare = BARE_NUMERAL_RE.exec(text)
  return bare ? `§ ${bare[1]!.toLowerCase()}` : null
}

/** One resolved law of the package, its §§ addressable by `designationKey`. */
interface LawIndex {
  law: KonsLawAtDate
  paragraphs: Map<string, KonsParagraphRef>
}

function indexOf(law: KonsLawAtDate): LawIndex {
  const paragraphs = new Map<string, KonsParagraphRef>()
  for (const [label, ref] of Object.entries(law.paragraphs)) {
    const key = designationKey(label)
    // First wins. RIS returns one version per label at a given date, and the
    // key is nearly injective: over the 195.148 labels in the cached corpus
    // (4.198 distinct) not one fails to parse and exactly two keys are
    // claimed twice — "Anl. 5a"/"Anl. 5A" and "Anl. 5b"/"Anl. 5B", and those
    // two spellings sit in *different* laws (Gesetzesnummer 20009048 and
    // 20003820), so no law's index collides (measured 2026-09-10).
    if (key !== null && !paragraphs.has(key)) paragraphs.set(key, ref)
  }
  return { law, paragraphs }
}

/** Every pair row of a §, grouped by the law it belongs to. */
function paragraphGroups(rows: readonly ComparisonRow[]): Map<string, { law: string | null; para: string; rows: ComparisonRow[] }> {
  const groups = new Map<string, { law: string | null; para: string; rows: ComparisonRow[] }>()
  for (const row of rows) {
    if (row.kind !== 'pair') continue
    // `para` carries the designation the row inherited where it opens none of
    // its own — two thirds of the rows do, and judging them one by one would
    // measure the annex's line breaks rather than the provision.
    const para = row.gld ?? row.para
    if (!para) continue
    const key = annexParagraphKey(row.law, para)
    const group = groups.get(key) ?? { law: row.law, para, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  return groups
}

/**
 * Check every § of a parsed comparison against RIS.
 *
 * `articles` is the draft's own Artikel list — the same list that decides the
 * annex's law boundaries — because the Artikel's title is what tells the
 * Bankwesengesetz from the Bausparkassengesetz when one BGBl promulgated
 * both.
 *
 * **Throws when RIS does.** An error from `sources` is not an answer about
 * the annex, and the caller caches whatever it is handed: a swallowed timeout
 * used to become "keine Prüfung" for 24 hours, indistinguishable on the page
 * from a draft that has no standing law to check against. So the error leaves
 * here, nothing is cached, and the section says it is unavailable.
 */
export async function verifyAnnex(
  rows: readonly ComparisonRow[],
  articles: readonly DraftArticle[],
  asOf: string,
  sources: AnnexSources,
  options: AnnexCheckOptions = {},
): Promise<AnnexVerification> {
  const maxParagraphs = options.maxParagraphs ?? MAX_PARAGRAPHS
  const concurrency = options.concurrency ?? CONCURRENCY

  const groups = paragraphGroups(rows)
  const reasons = new Set<string>()
  // Every § the annex names starts out unchecked, and only evidence moves it.
  // The inverse — verified unless something says otherwise — is what shipped,
  // and it vouched for §§ the check had never looked at.
  const verdicts: Record<string, ParagraphVerdict> = {}
  for (const key of groups.keys()) verdicts[key] = 'unchecked'
  const nothing = (reason: string): AnnexVerification => {
    reasons.add(reason)
    return { ran: false, reasons: [...reasons], verdicts, doubtfulLaws: [], judged: 0, verified: 0 }
  }
  if (groups.size === 0) return nothing(REASON_NO_PARAGRAPHS)
  if (!asOf) return nothing(REASON_NO_ASOF)

  const amending = articles.filter((a) => a.amends)
  if (articles.length === 0) reasons.add(REASON_NO_ARTICLES)
  else if (amending.length === 0) reasons.add(REASON_NO_AMENDING)

  const byKey = new Map<string | null, DraftArticle>(articles.map((a) => [a.key, a]))
  const resolved = new Map<string | null, Promise<LawIndex | null>>()
  const resolveOnce = async (key: string | null): Promise<LawIndex | null> => {
    // An unattributed row can only be resolved when the draft amends exactly
    // one law; with several, which § 5 it means is unknowable and guessing is
    // what the boundary refusal exists to prevent.
    const article = key === null ? (amending.length === 1 ? amending[0]! : null) : byKey.get(key)
    if (!article) {
      if (key === null && amending.length > 1) reasons.add(REASON_BOUNDARY)
      else if (key !== null) reasons.add(REASON_UNRESOLVED)
      return null
    }
    if (!article.amends) {
      reasons.add(REASON_NO_AMENDING)
      return null
    }
    // The UGB's Stammnorm is "dRGBl. S. 219/1897": the Artikel amends a law
    // all right, but no Bundesgesetzblatt addresses it.
    if (!article.bgbl) {
      reasons.add(REASON_NO_BGBL)
      return null
    }
    const law = await sources.resolveLaw(article.bgbl.organ, article.bgbl.nummer, asOf, article.title ?? '')
    if (!law) {
      reasons.add(REASON_UNRESOLVED)
      return null
    }
    return indexOf(law)
  }
  /** One RIS lookup per law of the package, not per §. */
  const lawOf = (key: string | null): Promise<LawIndex | null> => {
    const pending = resolved.get(key) ?? resolveOnce(key)
    resolved.set(key, pending)
    return pending
  }

  const coverage = new Map<string | null, Map<string, Coverage>>()
  const queue = [...groups.values()]
  let looked = 0
  let failure: unknown = null
  const worker = async (): Promise<void> => {
    while (failure === null) {
      const group = queue.shift()
      if (!group) return
      if (looked >= maxParagraphs) {
        reasons.add(REASON_CEILING)
        return
      }
      looked++
      try {
        const index = await lawOf(group.law)
        if (!index) continue
        const key = designationKey(group.para)
        if (key === null) {
          reasons.add(REASON_UNREADABLE_DESIGNATION)
          continue
        }
        const ref = index.paragraphs.get(key)
        if (!ref) {
          reasons.add(REASON_NO_SUCH_PARAGRAPH)
          continue
        }
        const standing = await sources.standingText(ref)
        if (standing === null) {
          reasons.add(REASON_NOT_REPRESENTABLE)
          continue
        }
        const byPara = coverage.get(group.law) ?? new Map<string, Coverage>()
        byPara.set(group.para, coverageOfParagraph(group.rows, standing))
        coverage.set(group.law, byPara)
      } catch (err) {
        // Stop the other workers too: a RIS that just failed four times over
        // is not worth another 150 requests, and the answer is thrown away.
        failure ??= err
        return
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  if (failure !== null) throw failure

  const doubtfulLaws: LawCheck[] = []
  let compared = 0
  let judged = 0
  let verified = 0
  for (const [law, byPara] of coverage) {
    const check = lawCheck(law, byPara)
    judged += check.judged
    verified += check.verified
    if (check.verdict === 'doubtful') doubtfulLaws.push(check)
    for (const [para, cover] of byPara) {
      compared++
      // Looked at, and silent: a § whose displayed changes carry almost no
      // comparable words says nothing either way, so it is not a pass. None
      // at all is its own state and its own sentence — a § the draft only
      // inserts has no standing text by definition.
      if (!cover.prose) {
        reasons.add(cover.comparable === 0 ? REASON_NOTHING_TO_COMPARE : REASON_TOO_SHORT)
        continue
      }
      // Withholding is per §, whatever the law's verdict: a § that cleared
      // the threshold cleared it against the standing text, and a cluster of
      // failures around it does not make it wrong.
      verdicts[annexParagraphKey(law, para)] = cover.ratio >= PARAGRAPH_THRESHOLD ? 'verified' : 'withheld'
    }
  }
  return { ran: compared > 0, reasons: [...reasons], verdicts, doubtfulLaws, judged, verified }
}

/**
 * The one sentence fragment the page needs when the check produced no verdict
 * at all — null when it produced one.
 *
 * Keyed on `judged`, not on `ran`: a check that reached RIS for ten §§ and
 * found nothing judgeable in any of them has also said nothing, and the page
 * has to be able to say so rather than fall silent.
 */
export function notRunReason(verification: AnnexVerification): string | null {
  return verification.judged > 0 ? null : verification.reasons.join('; ') || null
}

/** The rows as the response carries them, with what the check made of each. */
export interface CheckedComparison {
  rows: TextComparisonRow[]
  /** Counted over the rows as sent, withheld ones excluded */
  stats: ComparisonStats
  /** §§ whose text was withheld because the standing law does not carry it */
  withheldParagraphs: number
  /**
   * §§ that show at least one change and carry no verdict.
   *
   * Only those. Counting every unchecked verdict put §§ into the sentence
   * "… ließen sich nicht prüfen" that need no check at all: a § whose rows
   * are unchanged is folded away behind a count, and a § the draft *inserts*
   * has no standing text to check against — that is the point of it, not a
   * gap. The number the page prints has to mean "this much of what you see is
   * unvouched-for", or it reads as an alarm about the ministry's annex.
   */
  uncheckedParagraphs: number
  /**
   * Rows the page shows as a change that carry no § designation at all, so no
   * § verdict can address them. Shown as `unchecked`.
   *
   * A property of the table path only. Measured 2026-09-10: it emits 285 rows
   * without a designation, 83 of them shown as a change. On the PDF path a
   * row *is* a provision — it is cut at the § marker — so a unit without one
   * is the annex's front matter, and since 2026-09-10 the parser drops it
   * instead of emitting it as new law (`annexPdf.ts`, `AnnexParse.unplaced`).
   * Every row that path emits carries a designation by construction, so this
   * is 0 there.
   */
  rowsWithoutParagraph: number
}

/**
 * Apply the check to the rows — the gate itself, and therefore pure.
 *
 * The shipped version of this lived in the service and read
 * `unchecked.has(key) ? 'unchecked' : 'verified'`, which vouches for a row
 * whenever the check has not named it: for a check that never ran, for every
 * row without a § designation, and for every § in a law that was judged but
 * carried no prose of its own.
 *
 * Measured over GP XXVIII on 2026-09-10: 21 drafts where not a single § was
 * ever compared and every row went out as *geprüft* all the same (6 on the
 * table path, 15 on the PDF path), and 83 rows shown as a change that carry
 * no designation for a verdict to address. Counting the rest honestly moves
 * 180 §§ of the table path out of "bestätigt" and into "ungeprüft" (584 →
 * 764), against 967 that really were judged and passed.
 *
 * A row is verified here only where its § stands as `verified`; a `withheld`
 * § loses its text before the response leaves the server, because a wrong
 * comparison must not be renderable by any client.
 */
export function checkAnnexRows(rows: readonly ComparisonRow[], verification: AnnexVerification): CheckedComparison {
  let rowsWithoutParagraph = 0
  /** §§ the page shows at least one change for — the only ones a check is owed. */
  const showsChange = new Set<string>()
  for (const row of rows) {
    if (row.kind !== 'pair' || !isDisplayedChange(row)) continue
    const para = row.gld ?? row.para
    if (para !== null) showsChange.add(annexParagraphKey(row.law, para))
  }
  const out: TextComparisonRow[] = rows.map((row) => {
    // An Artikel heading is a divider, not law text: nothing to check, and
    // nothing to vouch for either.
    if (row.kind !== 'pair') return { ...row, check: 'unchecked' as const }
    const para = row.gld ?? row.para
    if (para === null) {
      if (isDisplayedChange(row)) rowsWithoutParagraph++
      return { ...row, check: 'unchecked' as const }
    }
    const verdict = verification.verdicts[annexParagraphKey(row.law, para)] ?? 'unchecked'
    if (verdict !== 'withheld') return { ...row, check: verdict }
    return { ...row, current: '', proposed: '', segments: null, check: 'withheld' as const }
  })
  return {
    rows: out,
    stats: summarizeComparison(out.filter((r) => r.check !== 'withheld')),
    withheldParagraphs: Object.values(verification.verdicts).filter((v) => v === 'withheld').length,
    uncheckedParagraphs: [...showsChange].filter((key) => (verification.verdicts[key] ?? 'unchecked') === 'unchecked').length,
    rowsWithoutParagraph,
  }
}
