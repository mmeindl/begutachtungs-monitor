/**
 * Is the annex's "Geltende Fassung" really the law as it stands?
 * (docs/api-exploration.md §2c, docs/architecture.md §12.13)
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * The left column of a Textgegenüberstellung claims to be the standing law
 * on the day the consultation opens. RIS holds that text independently, so
 * the claim is checkable — and it was long the only self-check either annex
 * path had.
 *
 * That makes this module the whole basis of the gate. Where the left column
 * matches, the pairing is sound and the word diff beside it means what it
 * says. Where it does not, the page is diffing displayed text against a
 * provision it does not belong to — and the reader has no way to tell.
 *
 * **The right column has two references of its own (2026-09-10).** It is not
 * unverifiable, as this file said for two days: what it shows as *new* must
 * not already stand in the law, and it must occur in the Novellierungs-
 * anordnungen the draft addresses to *that* § — its Gesetzestext stands in
 * the same RIS document as the annex (`draftBags`, since 2026-09-10: the
 * reference was the whole draft for a day, which is blind to text dragged out
 * of a neighbouring §). Both are checked here
 * (`rightColumnCheck`), and the reason they had to be is measured: dropping
 * the second sentence of a verified §'s left column passed the one-sided
 * gate in **1.019 of 1.092 injected cases (93,3 %)**, and the word diff then
 * painted the lost sentence green — the page claiming the draft adds text the
 * law already contains.
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
import type { TextBlock } from '../lawtext/lawUnits'
import type { DraftArticle } from '../lawtext/draftArticles'
import { mapWithConcurrency } from '../pool'
import type { KonsLawAtDate, KonsParagraphRef } from '../risKons'
import type { ComparisonRow } from './comparisonRows'
import type { AnnexWithheldCause } from '../../../shared/types'
import { annexParagraphKey, designationKey } from './annexText'
import { PARAGRAPH_THRESHOLD, coverageOfParagraph, type Coverage } from './coverage'
import { draftBags, draftReference, rightColumnCheck, type RightColumnCheck, type StandingText, type WordBag } from './rightColumn'

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
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

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
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
  standingText: (ref: KonsParagraphRef) => Promise<StandingText | null>
}

/**
 * What the draft itself contributes, beside its annex.
 *
 * One object rather than three parameters, because two of them are strings:
 * an ISO date and a whole Gesetzestext, adjacent in the call and silently
 * interchangeable. Transposed, `asOf` would be truthy nonsense and the RIS
 * lookup would answer for a date that does not exist.
 */
export interface AnnexDraft {
  /**
   * The draft's own Artikel list — the same list that decides the annex's law
   * boundaries, because the Artikel's title is what tells the Bankwesengesetz
   * from the Bausparkassengesetz when one BGBl promulgated both.
   */
  articles: readonly DraftArticle[]
  /**
   * RIS's own `BeginnBegutachtungsfrist`: the day the ministry wrote the
   * annex, and therefore the version of the law its left column claims.
   */
  asOf: string
  /**
   * The draft's own Gesetzestext, as blocks, for rule 2 — empty where the
   * draft's XML could not be read, which disarms that rule instead of
   * condemning every §.
   *
   * The blocks rather than the joined string, because the rule needs to know
   * *which* Novellierungsanordnung wrote which words: the whole draft as one
   * bag passes text dragged out of a neighbouring § (`draftBags`). Splitting
   * them is the gate's own business, so the caller hands over what it read
   * and nothing more.
   */
  blocks: readonly TextBlock[]
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

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
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
   * Why each withheld § was withheld, under the same key as `verdicts`.
   *
   * One cause per §, the first that fired in the order the checks are worth
   * to a reader: the left column first, then the two right-column rules. A §
   * can fail more than one — the counts have to sum to the total the page
   * prints, so only the first is kept.
   */
  withheldCauses: Record<string, AnnexWithheldCause>
  /**
   * Laws where enough §§ failed to doubt the whole annex for that law. Named
   * on the page; their §§ are withheld only where each failed on its own.
   *
   * Left-column coverage only, deliberately: `LAW_THRESHOLD` is calibrated on
   * it, and the sentence the page builds from it says the annex deviates from
   * the *standing text*. A cluster of right-column failures is a different
   * claim and does not belong under that wording.
   */
  doubtfulLaws: LawCheck[]
  /** §§ that carried enough prose to judge */
  judged: number
  /**
   * …of those, the ones that came through everything: the standing text
   * accounts for the left column **and** neither right-column rule fired.
   * Counted off the verdict map, so it cannot drift from what is shown.
   */
  verified: number
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
    // key is nearly injective — but "no law's index collides", as this note
    // claimed until 2026-09-11, is **false**, and a first-wins rule is
    // precisely where that costs something. Re-measured over all 195.875
    // label occurrences the offline corpus holds (4.251 distinct): not one
    // fails to parse, 15 keys are claimed by more than one label, and 13 of
    // those claims collide *inside a single RIS answer*, which is the
    // population this map is built from.
    //
    // They are one shape, and it is the one the numeral half of
    // `DESIGNATION_PART_RE` half-covers: a schedule cut into lettered parts.
    // "Anl. 1/59" is read whole because the suffix is digits, while
    // "Anl. 1/e", "Anl. 2/m1" and "Anl. 1/01.1" lose theirs and land on
    // "Anl. 1", "Anl. 2" and "Anl. 1/01" beside the whole schedule. Three
    // laws carry it (Gesetzesnummer 10008944, 10008568, 20009369) and **no
    // GP-XXVIII draft amends any of them**, so nothing in the measured corpus
    // is scored against a fraction of its schedule today. Widening the
    // numeral is its own step with its own measurement: it moves every
    // designation on the annex and draft side too, not just the labels here.
    //
    // The pair the old note named does hold: "Anl. 5a"/"Anl. 5A" and
    // "Anl. 5b"/"Anl. 5B" sit in *different* laws (20009048 and 20003820) and
    // collide in no index. Both spellings are in the GP-XXVIII corpus.
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
 * Check every § of a parsed comparison against RIS and against the draft.
 *
 * Both columns are held to something: the left one to the standing § from RIS
 * Bundesrecht at `draft.asOf`, the right one to that same § (nothing shown as
 * new may already stand there) and to the draft's own Gesetzestext (whatever
 * is shown as new has to occur in it). See `rightColumnCheck`.
 *
 * **Throws when RIS does.** An error from `sources` is not an answer about
 * the annex, and the caller caches whatever it is handed: a swallowed timeout
 * used to become "keine Prüfung" for 24 hours, indistinguishable on the page
 * from a draft that has no standing law to check against. So the error leaves
 * here, nothing is cached, and the section says it is unavailable.
 */
export async function verifyAnnex(
  rows: readonly ComparisonRow[],
  draft: AnnexDraft,
  sources: AnnexSources,
  options: AnnexCheckOptions = {},
): Promise<AnnexVerification> {
  const maxParagraphs = options.maxParagraphs ?? MAX_PARAGRAPHS
  const concurrency = options.concurrency ?? CONCURRENCY
  const { articles, asOf } = draft

  const groups = paragraphGroups(rows)
  const reasons = new Set<string>()
  // Every § the annex names starts out unchecked, and only evidence moves it.
  // The inverse — verified unless something says otherwise — is what shipped,
  // and it vouched for §§ the check had never looked at.
  const verdicts: Record<string, ParagraphVerdict> = {}
  for (const key of groups.keys()) verdicts[key] = 'unchecked'
  const withheldCauses: Record<string, AnnexWithheldCause> = {}
  const nothing = (reason: string): AnnexVerification => {
    reasons.add(reason)
    return { ran: false, reasons: [...reasons], verdicts, withheldCauses, doubtfulLaws: [], judged: 0, verified: 0 }
  }
  if (groups.size === 0) return nothing(REASON_NO_PARAGRAPHS)
  if (!asOf) return nothing(REASON_NO_ASOF)

  const bags = draftBags(draft.blocks)
  // What the annex prints a block of its own for, per law. A § that is
  // *not* in here has its text somewhere inside another §'s block, and its
  // words must not be counted as missing there (`draftReference`).
  const shown = new Map<string | null, Set<string>>()
  for (const group of groups.values()) {
    const key = designationKey(group.para)
    if (key === null) continue
    const into = shown.get(group.law) ?? new Set<string>()
    into.add(key)
    shown.set(group.law, into)
  }
  const references = new Map<string | null, (para: string) => WordBag>()
  const draftWords = (law: string | null, para: string): WordBag => {
    let reference = references.get(law)
    if (!reference) {
      reference = draftReference(bags, law, shown.get(law) ?? new Set<string>())
      references.set(law, reference)
    }
    return reference(para)
  }
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
  const rightColumn = new Map<string, RightColumnCheck>()
  let looked = 0
  // `failFast`: stop the other workers too — a RIS that just failed four
  // times over is not worth another 150 requests, and the answer is thrown
  // away. The only call site of the pool that asks for it.
  await mapWithConcurrency([...groups.values()], concurrency, async (group) => {
    if (looked >= maxParagraphs) {
      reasons.add(REASON_CEILING)
      return
    }
    looked++
    const index = await lawOf(group.law)
    if (!index) return
    const key = designationKey(group.para)
    if (key === null) {
      reasons.add(REASON_UNREADABLE_DESIGNATION)
      return
    }
    const ref = index.paragraphs.get(key)
    if (!ref) {
      reasons.add(REASON_NO_SUCH_PARAGRAPH)
      return
    }
    const standing = await sources.standingText(ref)
    if (standing === null) {
      reasons.add(REASON_NOT_REPRESENTABLE)
      return
    }
    const byPara = coverage.get(group.law) ?? new Map<string, Coverage>()
    byPara.set(group.para, coverageOfParagraph(group.rows, standing.text))
    coverage.set(group.law, byPara)
    rightColumn.set(annexParagraphKey(group.law, group.para), rightColumnCheck(group.rows, standing, draftWords(group.law, group.para)))
  }, { failFast: true })

  const doubtfulLaws: LawCheck[] = []
  let compared = 0
  let judged = 0
  for (const [law, byPara] of coverage) {
    const check = lawCheck(law, byPara)
    judged += check.judged
    if (check.verdict === 'doubtful') doubtfulLaws.push(check)
    for (const [para, cover] of byPara) {
      compared++
      const key = annexParagraphKey(law, para)
      const right = rightColumn.get(key)
      // The order is what the reader is owed first, and it decides which of
      // several causes is recorded — the counts on the page have to sum.
      const cause: AnnexWithheldCause | null =
        cover.prose && cover.ratio < PARAGRAPH_THRESHOLD
          ? 'standing'
          : right?.alreadyStanding
            ? 'alreadyStanding'
            : right?.notInDraft
              ? 'notInDraft'
              : null
      if (cause !== null) {
        // Withholding is per §, whatever the law's verdict: a § that cleared
        // the threshold cleared it against the standing text, and a cluster
        // of failures around it does not make it wrong.
        verdicts[key] = 'withheld'
        withheldCauses[key] = cause
        continue
      }
      // Looked at, and silent: a § whose displayed changes carry almost no
      // comparable words says nothing either way, so it is not a pass. None
      // at all is its own state and its own sentence — a § the draft only
      // inserts has no standing text by definition. Neither right-column rule
      // may promote such a § either: the draft bag passes happily on garbage
      // lifted from another part of the same draft.
      if (!cover.prose) {
        reasons.add(cover.comparable === 0 ? REASON_NOTHING_TO_COMPARE : REASON_TOO_SHORT)
        continue
      }
      verdicts[key] = 'verified'
    }
  }
  // Counted off the verdicts rather than summed per law, so "bestätigt" means
  // "came through everything" and cannot drift from what the rows show.
  const verified = Object.values(verdicts).filter((v) => v === 'verified').length
  return { ran: compared > 0, reasons: [...reasons], verdicts, withheldCauses, doubtfulLaws, judged, verified }
}
