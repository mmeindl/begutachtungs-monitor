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
import { draftUnits } from './annexDraft'
import { normalizeText, type TextBlock } from './lawText'
import type { DraftArticle } from './lawTitles'
import { NO_PARAGRAPH_ADDRESSED } from './novao'
import { mapWithConcurrency } from './pool'
import type { KonsLawAtDate, KonsParagraphRef } from './risKons'
import { summarizeComparison, type ComparisonRow, type ComparisonStats } from './textComparison'
import type { AnnexWithheldCause, TextComparisonRow } from '../../shared/types'

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
/**
 * "(Anm.: Abs. 2 aufgehoben durch …)" — and the spellings the PDF text layer
 * makes of it.
 *
 * `lawStructure.ts` strips this shape from the RIS side, so an annex copy the
 * pattern misses is an asymmetry scored against the parse: the column carries
 * words the standing text was never offered. Measured over the GP-XXVIII
 * corpus on 2026-09-10, 110 occurrences of "Anm" survived both sides of the
 * filter, and the misses were one form — **"(Anm. : aufgehoben durch …)"**,
 * a space between the period and the colon, which is how the PDF's positioned
 * runs come out. It cost the Bankwesengesetz annex "anm" and "aufgehoben" in
 * §§ 7, 22, 35, 44, 63, 64, 70a, 77a, 79 and 99c. The period is optional for
 * the same reason.
 *
 * Deliberately *not* widened to two neighbouring forms. "(Anm. 1)" is a
 * footnote marker RIS keeps on both sides, so dropping it here would create
 * the reverse asymmetry; and "Anmerkung 4: …" in the Bäderhygieneverordnung's
 * Anlage 1 is the schedule's **own** footnote text, which is law.
 */
const ANNOTATION_RE = /\(Anm\.?\s*:[^()]*(?:\([^()]*\)[^()]*)*\)/g
const BOILERPLATE_RE = /Beachte für folgende Bestimmung/gi

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
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

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
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
 * An `inserted` row has no left column to check — the provision it proposes
 * does not exist in the standing law, which is the point of it. An `elided`
 * row is the annex saying it left text out.
 *
 * **`unchanged` rows are the third exclusion, and it is a decision rather than
 * a triviality** (measured 2026-09-11, docs/architecture.md §12.13). A row
 * printing the same text in both columns shows no change, but its left text
 * *is* on the page — folded behind „N Stellen unverändert", then printed —
 * and nothing here ever holds it against RIS. A mirrored row filed under the
 * wrong § is therefore invisible, which is what this note used to wave away
 * with "folded away behind a count".
 *
 * So the alternative was measured through these same functions over GP XXVIII,
 * scoring each §'s unchanged rows as a bag of their own (which cannot dilute
 * the changed rows, unlike one combined bag — that variant *frees* three §§ the
 * gate withholds today):
 *
 * | | unveränderte Zeilen | §§ mit Prosa | unter der Schwelle | neu einbehalten | davon heute bestätigt |
 * |---|---:|---:|---:|---:|---:|
 * | Tabellenpfad | 1.738 in 474 §§ | 330 | 11 |  — |  4 |
 * | PDF-Pfad     |   287 in 287 §§ | 129 | 33 | 33 |  0 |
 *
 * The table-path row is the state after `textComparison.heldTwoSided`
 * (11.09.2026): a two-sided heading row now becomes the *heading* of the § that
 * opens below it instead of a row of the § above, which took the class from 59
 * to 10. **When this was first measured it was 59 and 34, all 93 read one by
 * one, and 91 were the annex being right.** On the table path, 52 of 59 were
 * the law's own structural headings — Teil, Abschnitt,
 * Unterabschnitt, the lettered divisions of a Verordnung, the heading of the
 * *following* § — which stand *above* the § they head and were therefore filed
 * under the § before them (57 of the 59 failed on a row that carries no
 * designation of its own); 3 are the annex's own notation („Anlage 1
 * (wird hier nicht abgebildet)", „[entfällt durch ein früher in Kraft tretendes
 * Vorhaben]"); 1 is orthography (Konfitürenverordnung § 5, „In-Kraft-Treten"
 * against „Inkrafttreten"); and **2 were gaps in our own RIS reading**, closed the same evening
 * (`lawStructure` reads both RIS spellings of the closing clause) — StGB
 * § 321c and BMSVG § 28, where `lawStructure.plainText` ends an Absatz with its
 * enumeration and drops the clause after it („ist mit Freiheitsstrafe von einem
 * bis zu zehn Jahren zu bestrafen."), so the annex is quoting law the ruler
 * does not offer. That is the third time this project would have scored its own
 * gap as the ministry's. On the PDF path 33 of 34 were Inhaltsverzeichnis lines (the 34th the same
 * closing-clause gap, closed)
 * and Hauptstück headings, and every one of them sits in a § that shows **no
 * change at all**, so the rule would buy nothing a reader can see.
 *
 * **One case in the whole corpus is the real finding**: GTelG § 23, whose
 * unchanged rows print an Abs. 2 („über *Portale*", two Ziffern) that the
 * standing § does not have („über *Anwendungen*", no Ziffern) — a version
 * difference the page shows today as unchanged law. One true positive against
 * 54 confirmed §§ that would lose their whole word diff is not a rule this gate
 * may ship: rule 1's 5 table-path alarms are all true, rule 2's floors were set
 * precisely to keep 6 real contaminations apart from two-word false alarms.
 *
 * **What was expected to change the decision** was the heading filing, not a
 * threshold: no floor separates the classes (headings run 0–95 %, the real
 * cases 44–95 %), and at any floor of 20 comparable words nothing at all is
 * caught below 90 %. That half was right and the other half was not.
 * *Filing* a mirrored heading row under the § it heads buys almost nothing —
 * 63 → 62, because RIS's own § documents mostly carry no group headings either
 * (99 of the 111 rows still uncovered land on a § with an empty `context`).
 * What works is `lift` one level up: the row stops being a row and becomes the
 * § 's heading, which took the table path to **13 below the threshold, 10
 * newly withheld, 6 of them confirmed today** (docs/architecture.md §12.13,
 * 11.09.2026). The decision itself stands — one true positive against six
 * confirmations is still not a rule — but the residue is now small enough to
 * re-read. Until then the blind spot is stated rather than closed: fault **U** of
 * `scripts/annex-fault-injection.ts` injects exactly this row and the gate
 * catches **0 of 238** on the table path and **0 of 883** on the PDF path
 * (every alarm under the fault was already firing without it), and
 * `annex-pdf-verify.ts` prints the population on every run.
 *
 * One thing the injection did *not* settle in advance, and it is the sharper
 * half: a mirrored row is not merely unchecked, it is an **alibi**. Both
 * right-column rules exempt whatever stands in the left column
 * (`rightColumnCheck`), every pair row counts towards that, and fault U
 * silences a previously firing rule in 1 of 883 §§ of the PDF path. Rare, but
 * it is the direction in which this exclusion can cost rather than merely
 * miss.
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

// ---------------------------------------------------------------------------
// The right column: „bereits geltend" and „nicht im Entwurf" (2026-09-10)
// ---------------------------------------------------------------------------

/**
 * Rule 1's floor: an inserted stretch shorter than this says nothing.
 *
 * Six comparable words, exact and in order. Below that, ordinary legal
 * phrasing collides by itself — and above it, the rule fires on 8 §§ of the
 * GP-XXVIII corpus through the ressort's own XML cells, every one of them a
 * true positive (WiEReG § 5, Ärztegesetz §§ 12 and 12a, OTPG § 4, FSG § 26 …),
 * plus the § headings the PDF path loses on the left.
 */
export const MIN_STANDING_STRETCH = 6

/**
 * Rule 2's floors: how much unexplained new text is evidence.
 *
 * Over the 1.145 §§ of the corpus with at least ten new words, the share
 * found in the draft's own Gesetzestext is 100 % at the median and 98 % at
 * p10 — the reference is that tight. Exactly **6 §§** have ≥ 8 missing words
 * *and* a ratio below 0,9, and each one is a genuine right-column
 * contamination: GSpG § 56 (89 %, 23 of 213 missing, "daß" twice — pre-1996
 * spelling, which can only be old standing text misfiled into the right
 * column), the Geräte- und Maschinenlärm-VO § 2 (68 %, 30 of 94), the
 * Bäderhygiene-VO § 36 (80 %, 16 of 80), AVG § 44g (56 %, 39 of 89), the
 * Energie-Control-Gesetz §§ 3 (83 %) and 42 (78 %, a Firmenbuchnummer).
 *
 * The absolute floor of 8 is what separates those from the next candidates
 * below 0,9, which are all false positives with two or three missing words:
 * a ministry's name ("Mobilität Infrastruktur", FSG §§ 4b and 16a), a
 * spelling ("Massnahmen", Finanzkonglomerategesetz § 14). A ratio alone
 * cannot tell 2 of 12 from 39 of 89.
 *
 * All three were **kept** when the reference narrowed to one § (`draftBags`,
 * 2026-09-10). They were calibrated on how tightly the annex's new words
 * follow the draft's wording, and narrowing the reference does not loosen
 * that: it removes words the § was never entitled to draw on. Re-measured
 * with the narrow reference, the rule fires on **20 §§ of the PDF path and 3
 * of the table path** (against 7 and 0), and all sixteen new ones were read
 * one by one before this shipped — none of them is a sound annex
 * (docs/architecture.md §12.13). A *ceiling* on the missing share was the one
 * variant tried and rejected there: it would have cost the table path its
 * whole gain (R-neu 184 → 64 catches, below the 76 the whole-draft bag
 * already had).
 */
export const MIN_NEW_WORDS = 10
export const MIN_MISSING_WORDS = 8
export const DRAFT_THRESHOLD = 0.9

/**
 * The standing text of one §, in the two shapes the check needs.
 *
 * `text` is everything the annex may print over the provision: the Abschnitt
 * and Hauptstück lines RIS files above the §, the § heading, and the body.
 * A word the offer leaves out counts against the parse, so all three go in.
 *
 * `heading` is the same minus the body, and it exists for rule 2 alone. RIS
 * files the heading above the § and the annex reprints it, while the draft's
 * Novellierungsanordnung usually does not repeat it — so heading words would
 * count as "new words the draft does not carry", and 20 of them did before
 * this was split out (measured 2026-09-10).
 */
export interface StandingText {
  text: string
  heading: string
}

/** Comparable words in order, since a bag test cannot see a *moved* sentence. */
function seqContains(hay: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let j = 0
    while (j < needle.length && hay[i + j] === needle[j]) j++
    if (j === needle.length) return true
  }
  return false
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * The stretches of text the page shows as **new** in one §.
 *
 * An `inserted` row's whole proposed column, and every `inserted` segment of
 * a `changed` row's word diff. An `elided` row is the annex saying it left
 * text out and carries no claim either way.
 */
export function insertedStretches(rows: readonly ComparisonRow[]): string[] {
  const out: string[] = []
  for (const row of rows) {
    if (row.kind !== 'pair' || row.elided) continue
    if (row.change === 'inserted' && row.proposed) out.push(row.proposed)
    else if (row.change === 'changed' && row.segments) {
      for (const s of row.segments) if (s.type === 'inserted') out.push(s.text)
    }
  }
  return out
}

/**
 * The draft's own Gesetzestext as one string — `gld` included, since a § marker
 * is text here.
 *
 * Since 2026-09-10 this is rule 2's *fallback* rather than its reference: the
 * whole draft is what a § may draw on where the draft's instructions could not
 * be segmented at all (`draftReference`). Everything else reads them one by
 * one.
 */
export function draftTextOf(blocks: readonly TextBlock[]): string {
  return blocks.map((b) => `${b.gld ?? ''} ${b.text}`).join(' ')
}

const withoutHyphens = (w: string): string => w.replace(/-/g, '')

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * Every comparable word of the draft's Gesetzestext, hyphen-insensitive.
 *
 * Both spellings of each word go in, because the two documents break lines in
 * different places: the annex's PDF splits
 * "Schieneninfrastruktur-Dienstleistungsgesellschaft" across a line and the
 * draft does not, or the other way round.
 */
export function draftWordBag(text: string): Set<string> {
  const bag = new Set<string>()
  for (const w of comparableTokens(normalizeText(text))) {
    bag.add(w)
    bag.add(withoutHyphens(w))
  }
  return bag
}

/**
 * What rule 2 asks of the draft's words.
 *
 * Two questions, and they are deliberately separate. The rule took a `Set`
 * and asked `size > 0` to decide whether it had anything to compare against
 * — which was the same question as "does this § have words" only as long as
 * the bag was the whole draft. With a reference per §, an *empty* bag is the
 * finding rather than the excuse: a § the draft's instructions never address
 * is the annex showing a change nobody ordered. So the disarm switch names
 * what it means — was the Gesetzestext readable at all — and a bag with no
 * words for this § still speaks.
 *
 * An interface rather than a `Set` because a per-§ reference is the union of
 * up to three bags, and a view over them beats a third copy per §.
 */
export interface WordBag {
  /** Does the draft's Gesetzestext offer this word for this §? */
  has: (word: string) => boolean
  /** Was there a Gesetzestext to compare against at all? */
  read: boolean
}

/**
 * The draft's words, per law and per §, plus what could not be addressed.
 *
 * Rule 2's reference used to be the whole draft, which is blind to the fault
 * it meets most often: a sentence dragged out of a *neighbouring*
 * Novellierungsanordnung is in the draft, only in the wrong §. Measured by
 * fault injection over GP XXVIII (`scripts/annex-fault-injection.ts`), the
 * whole-draft bag caught 11,8 % of such faults on the PDF path and 32,1 % on
 * the table path — the weakest number the gate had. Per § it is 77,0 % and
 * 82,7 % (populations of 2026-09-11 evening: 904 and 237 sites).
 *
 * `general` is what keeps the narrowing honest. An instruction whose address
 * could not be read contributes its words to every § of its law, so a parse
 * failure of ours can only *weaken* the rule and never fail a §. Every per-§
 * bag is a subset of `whole` — `annexDraft.ts` reads a unit's blocks with the
 * same Gliederungssymbole `draftTextOf` reads the whole draft with — so no
 * catch the wide reference had can be lost; the whole risk of the change is
 * false alarms, and that is the number the harness watches. Building it costs
 * a median 1,4 ms per draft and 60 ms for the largest of GP XXVIII, once per
 * draft per day behind `annexGuardService.ts`.
 */
export interface DraftBags {
  /** Law key → § key (`designationKey`) → the words its own instructions carry. */
  byLaw: Map<string | null, Map<string, Set<string>>>
  /** Law key → the words of its instructions that name no § at all. */
  general: Map<string | null, Set<string>>
  /** Every word of the draft — the fallback where a law could not be addressed. */
  whole: Set<string>
  /** Instructions read, and how many named a §. For the coverage line. */
  units: number
  addressed: number
  /**
   * …and how many of the rest name no § *by nature* rather than by our
   * failure: the table of contents, the law's title, an Abschnitt heading, an
   * instruction to the whole text. Those belong in the general bag and always
   * will, so a residual that counts them reads as a bigger gap than it is —
   * on GP XXVIII they are 173 of the PDF path's 321 remaining units and 93 of
   * the table path's 184.
   */
  rightlyWithoutParagraph: number
  /** Why the others did not, counted by reason. */
  reasons: Map<string, number>
}

/** An address `designationKey` reads as no § at all: "Abschnitt 9b", the title. */
const REASON_NOT_A_PARAGRAPH = 'die Anordnung adressiert keinen Paragraphen, sondern einen Abschnitt oder den Titel'

/**
 * Group the draft's instructions into the bags rule 2 compares against.
 *
 * Pure and inside the gate on purpose: the caller passes the draft's blocks
 * and the *rule* decides what a § may draw on, so the harness measures the
 * shipped decision rather than a caller's copy of it — the mistake this
 * module was extracted to undo.
 */
export function draftBags(blocks: readonly TextBlock[]): DraftBags {
  const byLaw = new Map<string | null, Map<string, Set<string>>>()
  const general = new Map<string | null, Set<string>>()
  const reasons = new Map<string, number>()
  /** Law → the designation pairs a renumbering declares to be one provision. */
  const aliases = new Map<string | null, [string, string][]>()
  let addressed = 0
  let rightlyWithoutParagraph = 0
  const units = draftUnits(blocks)
  for (const unit of units) {
    for (const [from, to] of unit.aliases) {
      const a = designationKey(from)
      const b = designationKey(to)
      if (a === null || b === null || a === b) continue
      const pairs = aliases.get(unit.law) ?? []
      pairs.push([a, b])
      aliases.set(unit.law, pairs)
    }
    const words = draftWordBag(unit.text)
    // A § key that cannot be read is not an address: `designationKey` refuses
    // an Abschnitt heading and a bare "(Titel)", and those units belong in
    // the general bag rather than under an invented key.
    const keys = unit.paras.map((p) => designationKey(p)).filter((k): k is string => k !== null)
    if (keys.length === 0) {
      const into = general.get(unit.law) ?? new Set<string>()
      for (const w of words) into.add(w)
      general.set(unit.law, into)
      // Two different silences, and the report keeps them apart: the
      // instruction named nothing (`unit.reason`), or it named a unit that is
      // not a § — an Abschnitt heading, the law's title — which addresses a
      // group of §§ and so belongs to all of them.
      const reason = unit.reason ?? REASON_NOT_A_PARAGRAPH
      // Both of those are the instruction *read*: it names an Abschnitt, the
      // title, the table of contents or the whole text, and there is no § for
      // it to name. Only the remaining reasons are a gap in the grammar.
      if (reason === REASON_NOT_A_PARAGRAPH || reason === NO_PARAGRAPH_ADDRESSED) rightlyWithoutParagraph++
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
      continue
    }
    addressed++
    const law = byLaw.get(unit.law) ?? new Map<string, Set<string>>()
    for (const key of keys) {
      const into = law.get(key) ?? new Set<string>()
      for (const w of words) into.add(w)
      law.set(key, into)
    }
    byLaw.set(unit.law, law)
  }
  // A renumbered § is one provision under two numbers, and the two documents
  // use different ones: the annex prints the § as the standing law designates
  // it, while every instruction after the renumbering addresses it by its new
  // number. So the two designations share a bag — one hop, from the snapshot,
  // because a chain of renumberings ("§ 2 wird § 3, § 3 wird § 4, …") would
  // otherwise merge a whole Verordnung into one bag and the reference would
  // be back to where it started.
  for (const [law, pairs] of aliases) {
    const map = byLaw.get(law)
    if (!map) continue
    const before = new Map([...map].map(([k, v]) => [k, new Set(v)]))
    for (const [a, b] of pairs) {
      for (const [x, y] of [[a, b], [b, a]] as const) {
        const from = before.get(y)
        if (!from) continue
        const into = map.get(x) ?? new Set<string>()
        for (const w of from) into.add(w)
        map.set(x, into)
      }
    }
  }
  return { byLaw, general, whole: draftWordBag(draftTextOf(blocks)), units: units.length, addressed, rightlyWithoutParagraph, reasons }
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * The reference rule 2 holds one law's §§ against, as a lookup per §.
 *
 * Three bags, and each of the last two is there because a narrower reference
 * without it would report our own gap as the ministry's:
 *
 * - **the §'s own** instructions — the point of the exercise;
 * - **the law's unreadable** instructions (`general`), because an
 *   instruction whose address nobody could read must weaken the check and
 *   never fail a §;
 * - **the §§ the annex shows no block of its own for** (`shown`). This is the
 *   one the corpus insisted on. Where the annex prints no block for § 8, its
 *   text is not absent from the page — it sits inside the block of § 7,
 *   whose designation the rows inherited. Counting it as "not in the draft"
 *   names the wrong finding: the draft has that text, the *page* has merged
 *   two provisions. Measured over GP XXVIII, it takes the table path from
 *   **15 alarms to 7** (the renumbering pairs below take it from 7 to 3) —
 *   and the PDF path only from 21 to 20, which is the tell: there a row *is*
 *   a provision, cut at the § marker, so almost every § has a block of its
 *   own and the merge cannot happen. It costs the injected faults nothing
 *   worth counting, because their donor is a § the annex does show.
 *
 * A `renumber` op makes two designations one provision, so the two share a
 * bag (`draftBags`): the annex prints the § under the designation the
 * standing law gives it and the instruction addresses the other one, and
 * without that link every renumbered § of a Verordnung reads as unexplained.
 * Worth **4 of the table path's 7 remaining alarms** — three §§ of the
 * Straßenverkehrs-Sicherheitsmanagement-VO, which renumbers its whole text
 * one step up, and one of the Tierschutz-Sonderhaltungsverordnung.
 *
 * The fallback is per law: where a law's instructions could not be read at
 * all — no Artikel key of the draft matches the annex's attribution, a
 * Gesetzestext that segmented to nothing — the whole draft is the reference
 * again and the rule is exactly what shipped before.
 */
export function draftReference(bags: DraftBags, law: string | null, shown: ReadonlySet<string>): (para: string) => WordBag {
  // Whether anything was read at all is a property of the draft, not of one
  // §, and it is the only thing that may disarm the rule.
  const read = bags.whole.size > 0
  const own = bags.byLaw.get(law)
  const general = bags.general.get(law)
  const wide: WordBag = { has: (w) => bags.whole.has(w), read }
  if (own === undefined && general === undefined) return () => wide
  // Everything every § of this law may draw on, built once: the unreadable
  // instructions, and the ones addressed to §§ the annex does not show.
  const inherited = new Set<string>(general ?? [])
  if (own !== undefined) {
    for (const [key, words] of own) {
      if (shown.has(key)) continue
      for (const w of words) inherited.add(w)
    }
  }
  return (para: string): WordBag => {
    const key = designationKey(para)
    const mine = key === null ? undefined : own?.get(key)
    if (mine === undefined) return { has: (w) => inherited.has(w), read }
    return { has: (w) => mine.has(w) || inherited.has(w), read }
  }
}

/** "Land- **und** Forstwirtschaft": an Ergänzungsstrich, not a broken word. */
const HYPHEN_JOINER_RE = /^(?:und|oder|bzw|sowie|beziehungsweise)$/

/** One word the § shows as new, with the spellings the draft may carry it in. */
interface NewWord {
  word: string
  /** The hyphen fragment before it, glued on with and without the hyphen */
  joined: string[]
}

/**
 * The words of a § that are new to the reader — inserted, and in neither the
 * left column nor the standing heading.
 *
 * A token ending in "-" is a fragment either way and never counts on its own:
 * in "Land- und Forstwirtschaft" it is an Ergänzungsstrich, in
 * "Schieneninfrastruktur-|Dienstleistungsgesellschaft" a line break. What
 * differs is the *next* token — after a joiner it stands for itself, and
 * otherwise it may be the tail of one word, so it is offered to the draft bag
 * glued to the fragment as well. Left unhandled, hyphen breaks were 36 of the
 * missing words in the corpus (2026-09-10).
 */
function newWordsOf(inserted: readonly string[], left: ReadonlySet<string>, heading: ReadonlySet<string>): NewWord[] {
  const items: NewWord[] = []
  let i = 0
  while (i < inserted.length) {
    const word = inserted[i]!
    i++
    if (word.endsWith('-')) {
      const next = inserted[i]
      if (next !== undefined && !HYPHEN_JOINER_RE.test(next)) {
        items.push({ word: next, joined: [word.slice(0, -1) + next, word + next] })
        i++
      }
      continue
    }
    items.push({ word, joined: [] })
  }
  return items.filter((it) => !left.has(it.word) && !heading.has(it.word))
}

function inDraft(bag: WordBag, it: NewWord): boolean {
  if (bag.has(it.word) || bag.has(withoutHyphens(it.word))) return true
  return it.joined.some((j) => bag.has(j) || bag.has(withoutHyphens(j)))
}

/** What the two right-column rules made of one §. */
export interface RightColumnCheck {
  /**
   * The § shows as new a stretch of ≥ `MIN_STANDING_STRETCH` comparable words
   * that stands verbatim in the RIS § and is absent from the left column.
   */
  alreadyStanding: boolean
  /** Too much of what the § shows as new is missing from the draft's Gesetzestext. */
  notInDraft: boolean
  /** Words shown as new that the left column and the § heading do not carry */
  newWords: number
  /** …of those, the ones the draft's Gesetzestext does not have */
  missingWords: number
  /**
   * …and which words those are, for the report.
   *
   * Every false alarm of this rule has to be inspectable, and a count cannot
   * be: "39 of 89 missing" is a finding, "a ministry's name and a spelling"
   * is a verdict on it. `Coverage.missing` carries the same for the left
   * column and for the same reason.
   */
  missing: string[]
  /** The first stretch that fired rule 1, for the report */
  standingStretch: string | null
}

/**
 * Hold the §'s right column against the standing law and against the draft.
 *
 * Pure, and exported so the harness measures the shipped decision instead of
 * a replica of it — the mistake this module was extracted to undo.
 *
 * **Why the left check alone is not enough.** Containment is one-directional:
 * it asks whether the standing § accounts for the column, never whether the
 * column accounts for the §. Text the parse *loses* on the left therefore
 * passes, and the word diff beside it paints that text green as an addition —
 * the page then claims the draft adds what the law already contains.
 * Injected over the corpus (drop the second sentence of a verified §'s left
 * column, re-diff, 1.092 §§, 2026-09-10): **1.019 of them, 93,3 %, still pass
 * the left check.**
 *
 * **Rule 1, „bereits geltend".** Whole stretch, contiguous, exact after
 * `comparableTokens`: no partial runs and no bag ratio, both measured and
 * rejected (below). The left column is checked too, and that exception is the
 * point — a sentence the ministry *moved* within the § is present on the left
 * and must not fire.
 *
 * **Rule 2, „nicht im Entwurf".** Everything the annex shows as new should
 * come from the draft's own Gesetzestext, which RIS publishes beside the
 * annex — and from the part of it that is addressed to *this* §. A draft
 * whose text could not be read disarms this rule rather than condemning every
 * § of it (`WordBag.read`), and so does every instruction whose address
 * nobody could read: those words go to every § of their law (`draftBags`).
 *
 * Neither rule may *verify* anything, and the caller must not let them: the
 * bag test in particular passes happily on garbage lifted from another part
 * of the same draft.
 *
 * **Reach, measured against the same injection** — stated because a gate
 * whose reach is unstated gets read as complete. Rule 1 catches **464 of
 * 1.092 (42,5 %)**, rule 2 catches 181 of the same faults (a sentence the
 * parser loses is unchanged law, so the draft's instructions usually do not
 * quote it either), together **567, 51,9 %** — against 73 (6,7 %) for the
 * left check alone.
 *
 * Those are the numbers for the whole-draft reference. With the reference per
 * § (`draftBags`, 2026-09-10) rule 2 roughly triples on its own fault and
 * more than doubles on the other two, measured per path with
 * `scripts/annex-fault-injection.ts`. The last column is the same reference
 * with the addressing of 2026-09-11 — 93,6 % of the draft's instructions name
 * a § instead of 87,1 % (`novao.refusedAddresses`) — which is a narrower
 * reference at unchanged thresholds, and cost exactly one more alarm on an
 * intact annex, itself a true finding (docs/architecture.md §12.13). The table-path rows
 * count 246/238/237 sites since `lawText.stripMarkup` and the second
 * designation per row (`textComparison.stripGld`) let more §§ reach the
 * injection at all, the PDF rows 942/905/904 since the gutter is read from the
 * two-column lines (`annexPdf.gutterBand`), a law is named only before its
 * first instruction (`lawTitles.draftArticles`) and the closing clause is read
 * under both RIS spellings (`lawStructure`):
 *
 * | Fehler | ganzer Entwurf | je §, 87 % | je §, 93 % |
 * |---|---:|---:|---:|
 * | R-neu, PDF-Pfad     | 107 (11,8 %) | 665 (75,6 %) | 696 (77,0 %) |
 * | R-neu, Tabellenpfad |  76 (32,1 %) | 184 (78,3 %) | 196 (82,7 %) |
 * | R-alt, PDF-Pfad     | 222 (24,5 %) | 584 (66,3 %) | 596 (65,9 %) |
 * | R-alt, Tabellenpfad |  98 (41,2 %) | 178 (75,4 %) | 183 (76,9 %) |
 * | L, PDF-Pfad         | 146 (15,5 %) | 332 (36,2 %) | 350 (37,2 %) |
 * | L, Tabellenpfad     |  49 (19,9 %) |  90 (36,9 %) |  95 (38,6 %) |
 *
 * Of rule 1's 628 misses, **464 are not misses**: the draft
 * changes that sentence too, so its proposed wording really is new and no
 * honest rule may fire. 130 are annex wordings that are not verbatim in RIS
 * at all, 29 are stretch boundaries (below), 5 sentences still stood on the
 * left. On the subset where the rule can apply, it catches 464 of 628, 74 %.
 *
 * **Variants measured and rejected — so nobody re-invents them:**
 *
 * - **Longest common run** of an inserted stretch inside the standing § (the
 *   obvious relaxation of rule 1) catches 87 % of the injected losses but
 *   fires on 191 §§ of the corpus at k = 6, 116 at k = 8, 60 at k = 10.
 *   Legal drafting repeats formulae: "begeht eine Verwaltungsübertretung und
 *   ist von der FMA mit Geldstrafe bis zu … zu bestrafen" recurs 29 tokens
 *   long inside BWG § 98, "tritt mit dem auf die Kundmachung folgenden Tag
 *   in Kraft" in every Inkrafttreten-§. A rule that fires on legal boilerplate
 *   withholds sound law. Those 29 boundary misses are what it would buy, and
 *   191 false positives is not the price for 29.
 * - **Whole sentences of the right column** that stand in the § and are
 *   absent left (abbreviation-aware splitter, ≥ 8 tokens) catch *fewer*
 *   injected faults than the whole-stretch rule (423 against 540 of 1.074)
 *   and add false positives from legitimately repeated sentences
 *   ("Gesetzliche Verpflichtungen zur Verschwiegenheit bleiben unberührt.").
 * - **A ceiling on the missing share** — the obvious way to keep the per-§
 *   reference from firing where a § block spans two provisions, since those
 *   §§ are mostly unexplained while a *contaminated* § keeps its own new text
 *   as well. Measured and rejected: at 50 % it would cost the table path its
 *   whole gain (R-neu 184 → 64 catches, below the 76 the whole-draft bag had),
 *   because a § with little new text of its own is exactly the case where an
 *   injected sentence dominates the share.
 *
 * The **per-§ reference** itself is no longer among them: it shipped on
 * 2026-09-10 (`draftBags`), together with the two things that keep it honest
 * — the general bag for instructions nobody could address, and the rule that
 * text of a § the annex prints no block of its own for is inherited rather
 * than missing.
 */
export function rightColumnCheck(rows: readonly ComparisonRow[], standing: StandingText, draft: WordBag): RightColumnCheck {
  const pairs = rows.filter((r) => r.kind === 'pair')
  const standingTokens = comparableTokens(normalizeText(standing.text))
  // The whole left column, unchanged and elided rows included: a stretch the
  // annex prints on both sides is shown, not lost.
  const leftTokens = comparableTokens(normalizeText(pairs.map((r) => r.current).join(' ')))
  const leftBag = new Set(leftTokens)
  const headingBag = new Set(comparableTokens(normalizeText(standing.heading)))

  let standingStretch: string | null = null
  const inserted: string[] = []
  for (const stretch of insertedStretches(pairs)) {
    const tokens = comparableTokens(normalizeText(stretch))
    inserted.push(...tokens)
    if (standingStretch === null && tokens.length >= MIN_STANDING_STRETCH && seqContains(standingTokens, tokens) && !seqContains(leftTokens, tokens)) {
      standingStretch = stretch
    }
  }

  const words = newWordsOf(inserted, leftBag, headingBag)
  const missing = words.filter((it) => !inDraft(draft, it))
  // A draft whose XML could not be read disarms the rule instead of failing
  // every § of it — but a bag that is empty *for this §* does not: since the
  // reference is per § (`draftBags`), that is the annex showing a change no
  // instruction of the draft orders. The counts stay honest either way, so a
  // report cannot read "nothing missing" where nothing was compared.
  const notInDraft = draft.read && words.length >= MIN_NEW_WORDS && missing.length >= MIN_MISSING_WORDS && (words.length - missing.length) / words.length < DRAFT_THRESHOLD
  return { alreadyStanding: standingStretch !== null, notInDraft, newWords: words.length, missingWords: missing.length, missing: missing.map((it) => it.word), standingStretch }
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
 * The word that makes the designation after it a **citation** rather than a
 * second part of the name: "Anlage 3 *zu* § 10 und § 11" is the schedule's
 * title saying which §§ it belongs to. RIS calls that schedule "Anl. 3".
 *
 * Tested on the gap *between* two parts only, and that is the whole safety of
 * it: a leading "Zu § 5" — the form the Erläuterungen head their sections with
 * — keeps its §, because there is no earlier part for the word to separate
 * from.
 *
 * The two classes separate on this one word without a remainder (GP XXVIII,
 * 2026-09-11). Of the 1.546 designation strings the key reads as composite,
 * **1.534 are RIS's "Art. 3 § 5"** — an article-structured law, where the
 * Artikel really is part of the §'s identity — and every one of them joins its
 * parts with a plain space. The other **12 are the annex's schedule headings**,
 * and every one of them joins with " zu ". Over all 195.875 RIS label
 * occurrences in the offline corpus, **not one label contains "zu" at all**,
 * so the lookup side of the key cannot move.
 */
const CITATION_JOINER_RE = /\bzu\b/i

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
 * Measured against every RIS label in the cached corpus (195.875 occurrences,
 * 4.251 distinct, 2026-09-11): none is unreadable here, so the exactness
 * costs no coverage.
 *
 * **A composite the RIS never holds is the same mistake mirrored** (fixed
 * 2026-09-11). The key reads the leading designation and ignores the rest,
 * which is right for "§ 5 3. Abschnitt" and for "Anlage 1 Mindestgliederung
 * Bilanz" — but where a schedule's title *cites* §§, the citation was read as
 * part of the name: "Anlage 3 zu § 10 und § 11" became `Anl 3 § 10 § 11`, a
 * label no law carries, so the § was looked up, not found, and left
 * `unchecked` for a reason of our own making. 12 §§ of GP XXVIII, across four
 * drafts, and the lookup they want exists in every case — RIS holds "Anl. 3".
 * `CITATION_JOINER_RE` is where the cut is and why it is safe.
 *
 * Null for a text carrying no designation at all.
 */
export function designationKey(text: string): string | null {
  const parts: string[] = []
  let end = 0
  for (const m of text.matchAll(DESIGNATION_PART_RE)) {
    // Everything from a "zu" onwards is the Anlage's title, not its name.
    if (parts.length > 0 && CITATION_JOINER_RE.test(text.slice(end, m.index))) break
    const word = m[1]!.toLowerCase()
    parts.push(`${word === '§' ? '§' : word === 'art' ? 'Art' : 'Anl'} ${m[2]!.toLowerCase()}`)
    end = m.index + m[0].length
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
  /** §§ whose text was withheld, whichever of the three checks refused them */
  withheldParagraphs: number
  /**
   * The same number split by cause, and it always sums to it: a withheld §
   * carries exactly one cause. The page names them separately because they
   * are three different things to a reader — the ministry's left column not
   * matching RIS, the right column repeating law that already stands, and
   * the right column carrying text the draft does not order for this §.
   */
  withheldByCause: Record<AnnexWithheldCause, number>
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
    const key = annexParagraphKey(row.law, para)
    const verdict = verification.verdicts[key] ?? 'unchecked'
    if (verdict !== 'withheld') return { ...row, check: verdict }
    // The cause travels with the row, because the notice that replaces the
    // text stands inside the § and has to name what was found there.
    return { ...row, current: '', proposed: '', segments: null, check: 'withheld' as const, withheldCause: causeOf(verification, key) }
  })
  const withheldByCause: Record<AnnexWithheldCause, number> = { standing: 0, alreadyStanding: 0, notInDraft: 0 }
  for (const [key, verdict] of Object.entries(verification.verdicts)) {
    if (verdict === 'withheld') withheldByCause[causeOf(verification, key)]++
  }
  return {
    rows: out,
    stats: summarizeComparison(out.filter((r) => r.check !== 'withheld')),
    withheldParagraphs: Object.values(verification.verdicts).filter((v) => v === 'withheld').length,
    withheldByCause,
    uncheckedParagraphs: [...showsChange].filter((key) => (verification.verdicts[key] ?? 'unchecked') === 'unchecked').length,
    rowsWithoutParagraph,
  }
}

/**
 * The recorded cause of a withholding, falling back to the one every
 * withholding meant before 2026-09-10.
 *
 * `verifyAnnex` writes verdict and cause together, so the fallback is
 * unreachable — and the harness keeps it that way (`withheldWithoutCause`
 * has to stay at zero over the corpus). It exists so that the split the page
 * prints always sums to the total it prints beside it.
 */
function causeOf(verification: AnnexVerification, key: string): AnnexWithheldCause {
  return verification.withheldCauses[key] ?? 'standing'
}
