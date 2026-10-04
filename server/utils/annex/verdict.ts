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
 * **The right column has two references of its own (2026-09-10):** what it
 * shows as *new* must not already stand in the law, and it must occur in the
 * Novellierungsanordnungen the draft addresses to *that* § — its Gesetzestext
 * stands in the same RIS document as the annex (`draftBags`; the reference
 * was the whole draft for a day, which is blind to text dragged out of a
 * neighbouring §). Both are checked in `rightColumnCheck`, and the reason
 * they had to be is measured: dropping the second sentence of a verified §'s
 * left column passed the one-sided gate in **1.019 of 1.092 injected cases
 * (93,3 %)**, and the word diff then painted the lost sentence green — the
 * page claiming the draft adds text the law already contains.
 *
 * Measured 2026-09-09 over the annexes the page shows today (101 evaluable
 * drafts, 964 §§ with real prose): 86,9 % cover the standing § to 99 % or
 * better, and 45 §§ (4,7 %) fall below 80 %. A few fail in clusters, a whole
 * law at a time (the IVS-Gesetz annex, 51/ME, scores 9 of 16); most fail one
 * or two §§ per draft (docs/architecture.md §12.13).
 *
 * **Why this is not a text comparison.** The annex abbreviates unchanged
 * stretches by the Rundschreiben ("(2) bis (4) …"), prints markers RIS keeps
 * out of the text, and copies RIS's own editorial notes. So the test is what
 * share of the column's *comparable* words appear in the RIS paragraph at
 * all — containment of a deliberate subset, never equality.
 *
 * The whole gate is pure and lives here rather than in a harness script, so
 * what is measured is the decision that ships.
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
import { articleBlocks, type ClauseName, type DraftArticle } from '../lawtext/draftArticles'
import { mapWithConcurrency } from '../pool'
import type { KonsLawAtDate, KonsParagraphRef } from '../ris/konsLaw'
import type { ComparisonRow } from './comparisonRows'
import type { AnnexWithheldCause } from '../../../shared/types'
import { annexParagraphKey, designationKey } from './annexText'
import { PARAGRAPH_THRESHOLD, coverageOfParagraph, isDisplayedChange, type Coverage } from './coverage'
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
  resolveLaw: (organ: string, nummer: string, date: string, title: string, clause: ClauseName | null) => Promise<KonsLawAtDate | null>
  /**
   * The standing text of one §, group headings included — the Abschnitt and
   * Hauptstück lines above a § are outside `plainText` but the annex prints
   * them, so they have to be offered or they count as missing words. Null
   * for a § RIS holds as a table: `lawtext/konsTree.ts` does not represent
   * those as a tree, and a § that cannot be represented is left unjudged
   * rather than scored against nothing.
   */
  standingText: (ref: KonsParagraphRef) => Promise<StandingText | null>
  /**
   * The version of a § that stood on `date` where RIS has a hole there
   * (`bridgeVersionGap`, §12.42), or that was promulgated but not yet in
   * force (`promulgatedBeforeInForce`) — asked only for a § the law lacks on the
   * Stichtag and that owes a check. Optional: without it a missing § stays
   * missing, as it always did.
   */
  paragraphAcrossGap?: (gesetzesnummer: string, key: string, date: string) => Promise<KonsParagraphRef | null>
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

/**
 * Ceiling on § lookups per draft, so one monster Sammelgesetz cannot hang a
 * request.
 *
 * **160 was the corpus's own size, not a pathology — raised to 500 on
 * 26.09.2026, measured.** Six of the 83 PDF-path drafts of GP XXVIII address
 * more §§ than that (Vergaberechtsgesetz 2026 with 413, Budgetbegleitgesetz
 * 2027-2028 with 271, Asyl- und Migrationspakt-Anpassung 252,
 * Abgabenänderungsgesetz 2025 210, Gaswirtschaftsgesetz 194,
 * Finanzmarktsammelgesetz 170); on the table path not one does. Their tails
 * were 550 §§ the gate never looked at, and looking costs what a RIS document
 * costs: median 0,05 s measured live, so the largest draft's 253 extra
 * lookups are about three seconds at `CONCURRENCY` 4 — and the page is
 * derived-cached, so a reader pays it once a day at most. What it buys, over
 * the same corpus with `--obergrenze=500`: **confirmed §§ 1.435 → 1.696**,
 * withheld 257 → 286, unchecked 1.799 → 1.509.
 *
 * 500 still keeps a guard — an annex naming a thousand §§ stops — and it is
 * above everything GP XXVIII contains, so `REASON_CEILING` now means a
 * document outside anything measured rather than an ordinary Sammelgesetz.
 * The latencies were measured from a development machine against RIS, not
 * from the VPS.
 */
export const MAX_PARAGRAPHS = 500
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
/**
 * The § RIS does not hold is one the draft itself creates — so the annex's
 * „Geltende Fassung" beside it is either the text an earlier Artikel of the
 * same draft writes (126/ME XXVIII: Artikel 3 inserts § 8b, Artikel 4 „Teil
 * II" amends it) or text the ressort moved there from another §. Until
 * 04.10.2026 these said „das RIS führt diese Paragraphen nicht", true and
 * misleading: it read as a gap in RIS or in our lookup (§12.41).
 */
export const REASON_INSERTED_BY_DRAFT = 'der Entwurf fügt diese Paragraphen erst ein — im geltenden Recht gibt es sie noch nicht'
/**
 * The law the Artikel amends is itself an amending act — „Änderung des
 * Bundesgesetzes, mit dem das … geändert werden" (116/ME XXVIII). RIS
 * Bundesrecht consolidates the laws such an act changed, not the act, so
 * there is nothing to resolve; „ließ sich nicht auflösen" read as our failure.
 */
export const REASON_AMENDING_ACT = 'das geänderte Gesetz ist selbst ein Änderungsgesetz, das das RIS Bundesrecht nicht als eigene Fassung führt'
/**
 * Narrowed on 26.09.2026: a table alone is no longer a reason. `konsTree`
 * reads it as one opaque block, and only a § whose designations then repeat —
 * a dozen Absätze „(2)", one per Tarifpost of the Gebührengesetz — stays
 * unloaded, because there is no telling which „Abs. 2" an instruction means.
 */
export const REASON_NOT_REPRESENTABLE = 'der geltende Paragraph ist im RIS nicht eindeutig gegliedert und so nicht vergleichbar'
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
   * Why each unchecked § went unchecked (`REASON_*`), under the same key as
   * `verdicts`. One reason per §: the step at which the check gave up on it.
   *
   * Since 03.10.2026 the page says why at each law's „nicht geprüft" pill
   * instead of in one sentence above the comparison, and a draft-wide list
   * of reasons would hand one law the reasons of another. A verified or
   * withheld § has no entry.
   */
  uncheckedReasons: Record<string, string>
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
    // First wins — and since 30.09.2026 no key of the offline corpus is
    // claimed by two labels. The 14 that were came from one shape, a
    // schedule cut into lettered parts („Anl. 1/e", „Anl. 1/01.1"), whose
    // suffix `DESIGNATION_PART_RE` now reads whole; the measurement across
    // all three sides — labels, annex, draft — is in docs/architecture.md
    // §12.13. First wins stays as the rule for a collision the corpus has
    // not shown yet.
    if (key !== null && !paragraphs.has(key)) paragraphs.set(key, ref)
  }
  addBareParagraphKeys(paragraphs)
  return { law, paragraphs }
}

const ARTICLE_PARAGRAPH_KEY_RE = /^Art \S+ (§ \S+)$/

/**
 * „§ 13" for a law RIS files as „Art. 2 § 13" — only where the law itself
 * proves the Artikel is no part of the §'s identity.
 *
 * `designationKey` keeps the Artikel on purpose: in a law whose §§ restart in
 * each Artikel, „§ 5" is several provisions. But RIS also files laws that
 * number their §§ straight through as „Art. N § M" (Preisgesetz 1992 § 13 is
 * „Art. 2 § 13", Finanzstrafgesetz § 57a „Art. 1 § 57a", Nationalbankgesetz
 * 1984 § 45 „Art. 9 § 45"), and the annex cites them as plain §§: 68 §§ of
 * GP XXVIII went unchecked as „führt diese Paragraphen nicht" (03.10.2026,
 * §12.41).
 *
 * The test is the whole law, not the one §: no plain „§ N" label besides
 * § 0, and no § number under two Artikel. Then a bare key names exactly one
 * provision. Added only where the exact key is absent, so it never shadows one.
 */
function addBareParagraphKeys(paragraphs: Map<string, KonsParagraphRef>): void {
  const bare = new Map<string, KonsParagraphRef>()
  for (const [key, ref] of paragraphs) {
    if (key.startsWith('§ ') && key !== '§ 0') return
    const m = ARTICLE_PARAGRAPH_KEY_RE.exec(key)
    if (!m) continue
    if (bare.has(m[1]!)) return
    bare.set(m[1]!, ref)
  }
  for (const [key, ref] of bare) if (!paragraphs.has(key)) paragraphs.set(key, ref)
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

/** „Änderung des Bundesgesetzes, mit dem das … geändert werden" — an Artikel that amends an amending act. */
const AMENDING_ACT_TITLE_RE = /^Änderung de[rs]\s+Bundesgesetze?s?,\s+mit\s+dem\b[\s\S]*\bgeändert\s+(?:wird|werden)\b/

export function isAmendingActTitle(title: string | null): boolean {
  return title !== null && AMENDING_ACT_TITLE_RE.test(title.replace(/\s+/g, ' ').trim())
}

/** An instruction that brings §§ into being: „wird folgender § 12e … eingefügt", „durch folgende §§ 8 bis 8c … ersetzt". */
const CREATES_RE = /\b(?:eingefügt|angefügt|ersetzt)\b/

/**
 * The §§ the draft writes into the law `article` amends with an instruction
 * that creates them — read off the Gliederungssymbol each new § is printed
 * with, under an instruction that inserts, appends or replaces. Every Artikel
 * of the draft that amends the same Stammnorm counts, not just this one: a
 * „Teil II" Artikel amends what „Teil I" inserted (126/ME XXVIII).
 *
 * Only consulted once RIS has no such §, so a „lautet:" over an existing §
 * never reaches here, and a § this set names is one RIS cannot hold yet.
 */
export function paragraphsInsertedBy(blocks: readonly TextBlock[], article: DraftArticle): Set<string> {
  const same = (a: DraftArticle): boolean =>
    a.key === article.key || (a.bgbl !== null && article.bgbl !== null && a.bgbl.organ === article.bgbl.organ && a.bgbl.nummer === article.bgbl.nummer)
  const out = new Set<string>()
  for (const part of articleBlocks(blocks)) {
    if (!same(part.article)) continue
    let creating = false
    for (const b of part.blocks) {
      if (b.kind === 'novao') creating = CREATES_RE.test(b.text)
      else if (creating && b.gld) {
        const key = designationKey(b.gld)
        if (key !== null) out.add(key)
      }
    }
  }
  return out
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
  const uncheckedReasons: Record<string, string> = {}
  /** The check gives up on one §, and says why — draft-wide and for that §. */
  const skip = (key: string, reason: string): void => {
    reasons.add(reason)
    uncheckedReasons[key] = reason
  }
  const nothing = (reason: string): AnnexVerification => {
    reasons.add(reason)
    for (const key of groups.keys()) uncheckedReasons[key] = reason
    return { ran: false, reasons: [...reasons], verdicts, withheldCauses, uncheckedReasons, doubtfulLaws: [], judged: 0, verified: 0 }
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
  const inserted = new Map<string | null, Set<string>>()
  const insertedByDraft = (law: string | null): Set<string> => {
    let keys = inserted.get(law)
    if (!keys) {
      const article = law === null ? (amending.length === 1 ? amending[0]! : null) : byKey.get(law)
      keys = article ? paragraphsInsertedBy(draft.blocks, article) : new Set<string>()
      inserted.set(law, keys)
    }
    return keys
  }
  /** A law's §§ ready to look up, or why the law could not be (`REASON_*`). */
  type Resolved = LawIndex | string
  const resolved = new Map<string | null, Promise<Resolved>>()
  const resolveOnce = async (key: string | null): Promise<Resolved> => {
    // An unattributed row can only be resolved when the draft amends exactly
    // one law; with several, which § 5 it means is unknowable and guessing is
    // what the boundary refusal exists to prevent.
    const article = key === null ? (amending.length === 1 ? amending[0]! : null) : byKey.get(key)
    if (!article) {
      if (key !== null) return REASON_UNRESOLVED
      if (amending.length > 1) return REASON_BOUNDARY
      return articles.length === 0 ? REASON_NO_ARTICLES : REASON_NO_AMENDING
    }
    if (!article.amends) return REASON_NO_AMENDING
    // The UGB's Stammnorm is "dRGBl. S. 219/1897": the Artikel amends a law
    // all right, but no Bundesgesetzblatt addresses it.
    if (!article.bgbl) return REASON_NO_BGBL
    const law = await sources.resolveLaw(article.bgbl.organ, article.bgbl.nummer, asOf, article.title ?? '', article.clause)
    if (!law) return isAmendingActTitle(article.title) ? REASON_AMENDING_ACT : REASON_UNRESOLVED
    return indexOf(law)
  }
  /** One RIS lookup per law of the package, not per §. */
  const lawOf = (key: string | null): Promise<Resolved> => {
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
  await mapWithConcurrency([...groups.entries()], concurrency, async ([groupKey, group]) => {
    if (looked >= maxParagraphs) return skip(groupKey, REASON_CEILING)
    looked++
    const index = await lawOf(group.law)
    if (typeof index === 'string') return skip(groupKey, index)
    const key = designationKey(group.para)
    if (key === null) return skip(groupKey, REASON_UNREADABLE_DESIGNATION)
    const ref =
      index.paragraphs.get(key) ??
      (group.rows.some(isDisplayedChange) && sources.paragraphAcrossGap
        ? await sources.paragraphAcrossGap(index.law.gesetzesnummer, key, asOf)
        : undefined)
    if (!ref) return skip(groupKey, insertedByDraft(group.law).has(key) ? REASON_INSERTED_BY_DRAFT : REASON_NO_SUCH_PARAGRAPH)
    const standing = await sources.standingText(ref)
    if (standing === null) return skip(groupKey, REASON_NOT_REPRESENTABLE)
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
        skip(key, cover.comparable === 0 ? REASON_NOTHING_TO_COMPARE : REASON_TOO_SHORT)
        continue
      }
      verdicts[key] = 'verified'
    }
  }
  // Counted off the verdicts rather than summed per law, so "bestätigt" means
  // "came through everything" and cannot drift from what the rows show.
  const verified = Object.values(verdicts).filter((v) => v === 'verified').length
  return { ran: compared > 0, reasons: [...reasons], verdicts, withheldCauses, uncheckedReasons, doubtfulLaws, judged, verified }
}
