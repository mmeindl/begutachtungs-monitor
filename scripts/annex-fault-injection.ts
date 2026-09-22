#!/usr/bin/env vite-node
/**
 * What the annex gate catches when the annex is deliberately broken
 * (docs/architecture.md §12.13).
 *
 * `annex-pdf-verify.ts` measures the gate against the corpus as it is, so it
 * can only ever report what the ressorts happen to have got wrong. That is
 * half a measurement: a gate is also defined by the faults it lets through,
 * and the corpus contains no labelled ones. So faults are injected into §§
 * the gate has just confirmed, and the gate is asked again.
 *
 * **Why this had to exist as a script.** Every threshold of the two
 * right-column rules — `MIN_STANDING_STRETCH`, `MIN_NEW_WORDS`,
 * `MIN_MISSING_WORDS`, `DRAFT_THRESHOLD` — and the sentence in `annexCheck.ts`
 * that states the gate's reach come from an injection run that lived in a
 * scratch file. A claim whose instrument is gone is a claim nobody can
 * re-check, and the reach is exactly the number that gets read as "the gate is
 * complete" if it is left unstated. This is the instrument, kept.
 *
 * **Four faults, and each one is a real failure mode of this project.**
 *
 * - **L** — drop the second sentence of a confirmed §'s left column and
 *   re-diff. That is what the PDF path does when a line is filed into the
 *   wrong column: the word diff then paints standing law green and the page
 *   claims the draft adds what the law already contains. The left check cannot
 *   see it, because containment is one-directional — it asks whether the
 *   standing § accounts for the column, never whether the column accounts for
 *   the §.
 * - **R-alt** — append a sentence of *another* §'s standing text to the right
 *   column. Old law misfiled into the proposed column; the GSpG § 56 shape,
 *   where the annex's right column carries "daß" twice.
 * - **R-neu** — append a sentence of another §'s *proposed* column. Text
 *   dragged out of a neighbouring provision of the same draft. It was the
 *   known blind spot of rule 2 as long as its word bag was built for the
 *   whole draft: the words are in the draft, only in the wrong §. This run is
 *   what measured that (12,0 % caught on the PDF path, 32,3 % on the table
 *   path) and what measured the per-§ reference that answered it (77,0 % and
 *   82,1 %).
 * - **U** — add a row printing another §'s standing text **identically in both
 *   columns**. A mirrored row the annex files under the wrong §, which is the
 *   shape the table path produces by construction: a Teil-, Abschnitt- or
 *   Unterabschnitt heading stands above the § it heads and therefore inherits
 *   the number of the § before it. The gate catches **none of it, by
 *   construction** — the left check reads only the rows shown as a change and
 *   both right-column rules read only inserted text — and that is the point of
 *   running it: the blind spot is stated as a measured 0 %, not assumed. What
 *   the run does decide is `silenced` (below).
 *
 * The left column is untouched in both R faults, so "die linke Prüfung
 * besteht" reads 100 % there by construction — that is the statement, not a
 * defect of the run. Fault U reads 100 % there for a different reason: its row
 * never enters the left bag at all.
 *
 * **Both references in one run.** Rule 2 is measured twice per §: against the
 * whole draft's Gesetzestext, as it was until 2026-09-10, and against the
 * Novellierungsanordnungen addressed to that § (`annexCheck.draftReference`).
 * One run rather than two, because a comparison across two runs of a script
 * whose corpus can change is not a comparison.
 *
 * **How to read the table.** Per fault: how many §§ it could be injected into,
 * how many still pass the left check, and how many each rule catches. Beside
 * it, the corpus false-positive side, which is the number that has to stay
 * small — a rule that fires on sound annexes withholds real law, and this
 * harness would otherwise reward exactly that. Every § that only the narrow
 * reference refuses is printed with the words it is missing, because a count
 * cannot be inspected. The counts are the two right-column causes of
 * `annex-pdf-verify.ts` over the same population, so the two harnesses
 * cross-check each other.
 *
 * **What it said on 2026-09-11** (GP XXVIII, both paths run separately, with
 * 93,6 % / 93,4 % of the drafts' instructions addressed to a § and the shared markup rule of
 * `lawText.stripMarkup` in place):
 *
 * | | §§ | linke Prüfung | Regel 1 | Regel 2 ganz | Regel 2 je § | zusammen je § |
 * |---|---:|---:|---:|---:|---:|---:|
 * | L, PDF-Pfad    | 942 | 870 (92,4 %) | 371 (39,4 %) | 146 (15,5 %) | 350 (37,2 %) | 584 (62,0 %) |
 * | L, Tabellenpfad| 246 | 246 (100 %)  | 145 (58,9 %) |  49 (19,9 %) |  95 (38,6 %) | 171 (69,5 %) |
 * | R-alt, PDF     | 905 | 905 (100 %)  |   7 ( 0,8 %) | 222 (24,5 %) | 596 (65,9 %) | 599 (66,2 %) |
 * | R-alt, Tabelle | 238 | 238 (100 %)  |   1 ( 0,4 %) |  98 (41,2 %) | 183 (76,9 %) | 183 (76,9 %) |
 * | R-neu, PDF     | 904 | 904 (100 %)  |   8 ( 0,9 %) | 107 (11,8 %) | 696 (77,0 %) | 696 (77,0 %) |
 * | R-neu, Tabelle | 237 | 237 (100 %)  |   1 ( 0,4 %) |  76 (32,1 %) | 196 (82,7 %) | 197 (83,1 %) |
 *
 * Read across: fault L gets past the left check in 92 to 100 % of cases,
 * which is what the right column had to be checked for at all; rule 1 is the
 * one that answers it. R-alt is rule 2's own case, and R-neu was the fault it
 * was measurably weakest on until its reference narrowed to one §. False
 * alarms without any fault: 19 and 22 §§ on the PDF path (rule 1 and rule 2)
 * and 5 and 4 on the table path — rule 2 stood at 7 and 0 with the
 * whole-draft reference; sixteen of the extra ones are named in
 * docs/architecture.md §12.13, the seventeenth is the one the better
 * addressing of 2026-09-11 uncovered (Obstweinverordnung § 13, whose right
 * column carries the start of the next Novellierungsanordnung — whether our
 * line reading or the annex's print put it there, the PDF decides; the R-neu
 * fault, found unstaged in the corpus), the eighteenth the one the shared
 * markup rule handed from the left check to rule 2 (MPBV § 11, below).
 *
 * **Moved on 2026-09-11** by the law-name window (`lawTitles.draftArticles`
 * and `lawText.segmentUnits`, §12.13: a heading after the Artikel's first
 * Novellierungsanordnung is quoted payload, not a name). The **table path is
 * unchanged in every injection cell**, and its corpus alarms drop from 5 and
 * 7 to 5 and 4 — the three were UH-Statistik-VO §§ 18, 35 and 37, which this
 * run had been printing under their wrong law key. On the **PDF path the
 * population grew**, because 22 §§ more are confirmed and so injectable at
 * all: L 920 → 936, R-alt 883 → 899, R-neu 882 → 898 (measured on top of the
 * two-column gutter of the same day), with L together unchanged at 62,1 %,
 * R-alt 67,0 → 66,4 % and R-neu 77,0 → 77,2 %. Its rule-1
 * alarms go from 18 to 19, and the one more is § 44 of the Seen- und
 * Fluss-Verkehrsordnung — a § the gate did not judge before at all. The closing
 * clause read under both RIS spellings (`lawStructure`, same evening) added six
 * §§ more — 942/905/904 — and one rule-2 alarm on the PDF path
 * (Geräuschemissionsverordnung Anlage 6, which the left check had masked until
 * then): 19 and 21 → 19 and 22.
 *
 * **Moved on 2026-09-11, table path only** (`lawText.stripMarkup`): the
 * population grew, because §§ whose words the ressort's markup used to cut in
 * half now pass the left check and reach the injection at all — L 244 → 245,
 * R-alt 236 → 237, R-neu 235 → 236. The rates are the same within a
 * percentage point (L together 69,8 %, R-alt 77,2 %, R-neu 82,2 %), and rule
 * 2's corpus alarms go from 3 to 4: MPBV § 11, which was withheld before too,
 * only by the left check and for a reason of our own making. The PDF path is
 * unchanged in every cell. The second designation per row (2026-09-11,
 * `textComparison.stripGld`) moved the table-path population once more, to
 * 246/238/237, with L 171, R-alt 183 and R-neu 195; the one-sided heading
 * rows (`heldHeadings`, same day) then took R-neu to 196 and rule 1's
 * table-path alarms from 6 to 5 — the table above shows that state. On the
 * PDF path the gutter read from the two-column lines (`annexPdf.gutterBand`,
 * same day) added the two §§ that now carry enough text for a site —
 * 918/881/880 → 920/883/882 — at unchanged rates.
 *
 * The reach stated in `annexCheck.ts` — 1.019 of 1.092, rule 1 464, rule 2
 * 181, together 567 — was measured over both paths at once and with a
 * narrower injection site (the § was skipped when its *first* changed row was
 * too short, even where a later one qualified). This script takes the first
 * row that satisfies the conditions, which is why its population is 1.161
 * rather than 1.092; the rates agree within a percentage point (43,4 % and
 * 52,4 % against 42,5 % and 51,9 %).
 *
 * Nothing is re-implemented here: the left check is `coverageOfParagraph` and
 * the right column is `rightColumnCheck`, the very functions the request path
 * calls, for the same reason `annex-pdf-verify.ts` calls `verifyAnnex` — a
 * rule measured through a copy of itself measures the copy. What this run does
 * *not* replicate is `MAX_PARAGRAPHS`: it measures the rules over the whole
 * annex, so its false-alarm count is three higher than the gate's on the PDF
 * path (18 against 15), and the three sit in the tail of Sammelnovellen that
 * no request reaches. With the ceiling emulated the two numbers are equal.
 *
 * Usage:  npx vite-node scripts/annex-fault-injection.ts --gp=XXVIII [--xml] [--limit=N] [--only=8]
 */
import { annexParagraphKey, comparableTokens, designationKey } from '../server/utils/annex/annexText'
import { PARAGRAPH_THRESHOLD, coverageOfParagraph } from '../server/utils/annex/coverage'
import {
  MIN_STANDING_STRETCH,
  draftBags,
  draftReference,
  rightColumnCheck,
  type StandingText,
  type WordBag,
} from '../server/utils/annex/rightColumn'
import { parseAnnexPdf } from '../server/utils/annex/annexPdf'
import { pagesOf } from '../server/utils/annex/annexPdfPages'
import { diffTokens } from '../server/utils/diff/wordDiff'
import { plainText } from '../server/utils/lawtext/konsTree'
import { normalizeText } from '../server/utils/lawtext/normalize'
import { parseRisXml } from '../server/utils/lawtext/risXml'
import { draftArticles, type DraftArticle } from '../server/utils/lawtext/draftArticles'
import { getText, resolveLawByBgbl, type KonsLawAtDate, type KonsParagraphRef } from '../server/utils/ris/konsLaw'
import { fetchParagraphTree } from '../server/utils/harness/risKonsHistory'
import { parseTextComparison, type ComparisonRow } from '../server/utils/annex/comparisonRows'
import { isScanned } from '../server/utils/annex/tableCells'
import { installFetchCache } from './lib/harnessCache'
import { argAssigned, argFlag } from './lib/args'
import { risJson as risQuery, scriptUserAgent } from './lib/http'
import { ANNEX_NAME_RE, asArray } from './lib/ris'

installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

const SCRIPT = 'annex-fault-injection'

/* eslint-disable @typescript-eslint/no-explicit-any */
const risJson = (params: Record<string, string>): Promise<any> => risQuery(params, { script: SCRIPT })

/**
 * Sentence boundaries in Austrian legal prose, which is mostly abbreviations.
 *
 * A plain `/(?<=\.)\s+(?=[A-Z])/` cuts "gemäß § 3 Abs. 2 Z 4 lit. b" into four
 * sentences, and the injected fault would then be a fragment rather than a
 * lost sentence — the instrument would be measuring itself. Kept verbatim from
 * the probe the published reach numbers were measured with (2026-09-10), so
 * this run stays comparable with them; it belongs here and not in production,
 * because nothing that ships splits sentences.
 */
const SENTENCE_SPLIT = /(?<![\s(](?:Abs|Nr|Z|Art|lit|sublit|BGBl|bzw|usw|vgl|idF|iVm|Dr|Mag|Ing|ca|Jg|Hrsg|Anm|gem|zB|bspw|inkl|exkl|Bd|Aufl|Kap|Pkt|Rz|RGBl|dRGBl|StGBl|ABl|EG|EU|EWR|GmbH|Co|AG|OG|KG|St|Hl|Nov|Dez|Jän|Feb|Mär|Apr|Jun|Jul|Aug|Sep|Okt|Vorst|Univ|Prof|Präs|Min|Sekt|Abt|Gr|Erg|Fn|Ziff|S|sog)\.)(?<=[.;:!?])\s+(?=[A-ZÄÖÜ(„"])/

const toks = (text: string): string[] => comparableTokens(normalizeText(text))
const sentencesOf = (text: string): string[] => text.split(SENTENCE_SPLIT)

/** A donor sentence has to carry enough words to be evidence of anything. */
const MIN_DONOR_TOKENS = 8
/** The injection site's left column: three sentences to lose the middle one of. */
const MIN_SITE_SENTENCES = 3
/** …and enough prose that losing one sentence still leaves a judgeable § */
const MIN_SITE_TOKENS = 30

/**
 * What one fault did to one §, under both references rule 2 can have.
 *
 * The two bags are measured in the same run on purpose: the whole-draft bag
 * and the per-§ bag differ only in what rule 2 may draw on, and a comparison
 * across two runs of a script whose corpus can change is not a comparison.
 */
interface Verdict {
  /** The left check on the faulted rows — 100 % by construction for R faults */
  leftPasses: boolean
  rule1: boolean
  /** Rule 2 against the whole draft's Gesetzestext */
  rule2Wide: boolean
  /** …and against the §'s own Novellierungsanordnungen plus its law's unreadable ones */
  rule2Para: boolean
}

/** One fault over the corpus. */
interface FaultTally {
  label: string
  tried: number
  leftPasses: number
  rule1: number
  rule2Wide: number
  rule2Para: number
  eitherWide: number
  eitherPara: number
  /** Catches that were already firing without any fault — not this fault's */
  rule1Already: number
  rule2WideAlready: number
  rule2ParaAlready: number
  /**
   * The opposite, and the one nobody was counting: a rule that fired on the
   * sound § and falls silent once the fault is in.
   *
   * It is not a hypothetical. Both right-column rules exempt whatever stands in
   * the *left* column of the § (`rightColumnCheck`, `leftTokens`) — rightly, so
   * a sentence the ministry merely moved does not read as new — and every pair
   * row counts towards it, `unchanged` rows included. Text smuggled into the
   * left column is therefore an alibi for the right one, which is exactly what
   * fault U tests.
   */
  silenced: number
}

function tally(label: string): FaultTally {
  return { label, tried: 0, leftPasses: 0, rule1: 0, rule2Wide: 0, rule2Para: 0, eitherWide: 0, eitherPara: 0, rule1Already: 0, rule2WideAlready: 0, rule2ParaAlready: 0, silenced: 0 }
}

function record(into: FaultTally, verdict: Verdict, base: Verdict): void {
  into.tried++
  if (verdict.leftPasses) into.leftPasses++
  if (verdict.rule1) into.rule1++
  if (verdict.rule2Wide) into.rule2Wide++
  if (verdict.rule2Para) into.rule2Para++
  if (verdict.rule1 || verdict.rule2Wide) into.eitherWide++
  if (verdict.rule1 || verdict.rule2Para) into.eitherPara++
  if (verdict.rule1 && base.rule1) into.rule1Already++
  if (verdict.rule2Wide && base.rule2Wide) into.rule2WideAlready++
  if (verdict.rule2Para && base.rule2Para) into.rule2ParaAlready++
  if ((base.rule1 && !verdict.rule1) || (base.rule2Para && !verdict.rule2Para)) into.silenced++
}

/** One § of one annex, resolved against RIS and ready to be broken. */
interface Judged {
  law: string | null
  para: string
  rows: ComparisonRow[]
  standing: StandingText
  /** The left column carried enough prose and the standing § accounts for it */
  leftPasses: boolean
  /** Whether the left check was even applicable (enough comparable words) */
  prose: boolean
}

/** The whole gate on one §'s rows, so a fault and its absence are measured alike. */
function judge(rows: readonly ComparisonRow[], standing: StandingText, wide: WordBag, para: WordBag): Verdict {
  const cover = coverageOfParagraph(rows, standing.text)
  const right = rightColumnCheck(rows, standing, wide)
  const narrow = rightColumnCheck(rows, standing, para)
  return {
    leftPasses: cover.prose && cover.ratio >= PARAGRAPH_THRESHOLD,
    rule1: right.alreadyStanding,
    rule2Wide: right.notInDraft,
    rule2Para: narrow.notInDraft,
  }
}

/** The rows of a § with one row replaced — the fault, and nothing else, changed. */
function withRow(rows: readonly ComparisonRow[], at: ComparisonRow, replacement: ComparisonRow): ComparisonRow[] {
  return rows.map((row) => (row === at ? replacement : row))
}

/**
 * The § with one more row, printing the same text in both columns — fault U.
 *
 * The shape of a mis-filed mirrored row: the annex prints a line that belongs
 * to another provision, identically left and right, and the row inherits the
 * designation of the § it stands under. It is what actually happens on the
 * table path, where a Teil-, Abschnitt- or Unterabschnitt heading stands
 * *above* the § it heads and therefore inherits the number of the one before it
 * (measured 11.09.2026: 52 of the 59 §§ such a rule would newly withhold).
 *
 * The donor is another §'s standing text rather than an invented sentence,
 * because the fault this measures is misfiling, not fabrication.
 */
function withMirroredRow(rows: readonly ComparisonRow[], like: ComparisonRow, text: string): ComparisonRow[] {
  return [...rows, { ...like, gld: null, current: text, proposed: text, change: 'unchanged', elided: false, segments: null, editorial: false }]
}

interface DraftResult {
  cite: string
  judged: number
  injected: number
}

async function inject(doc: any): Promise<DraftResult | null> {
  const meta = doc?.Data?.Metadaten
  const begut = meta?.Bundesrecht?.Begut
  const cite = String(begut?.Begutachtungsverfahrennummer ?? begut?.Verfahrensnummer ?? meta?.Bundesrecht?.Kurztitel ?? meta?.Technisch?.ID ?? '?').slice(0, 34)
  const beginn: string | null = begut?.BeginnBegutachtungsfrist ?? null
  if (!beginn) return null

  const contents = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
  const main = contents.find((c) => c?.ContentType === 'MainDocument')
  const annex = contents.find((c) => ANNEX_NAME_RE.test(String(c?.Name ?? '')))
  if (!annex) return null
  const annexXml = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  const pdfUrl = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Pdf')?.Url ?? null
  const annexXmlText = annexXml ? await getText(annexXml) : null
  const readable = annexXmlText !== null && !isScanned(annexXmlText)
  // One path per run, the same switch `annex-pdf-verify.ts` uses: the two
  // parsers fail differently, so an aggregate over both would hide which one
  // the gate is protecting the reader from.
  if (xmlMode !== readable) return null
  if (!readable && !pdfUrl) return null

  const mainXml = asArray<any>(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  if (!mainXml) return null
  const draftBlocks = parseRisXml(await getText(mainXml))
  const articles = draftArticles(draftBlocks)
  const amending = articles.filter((a) => a.amends)
  if (amending.length === 0) return null
  // Rule 2's two references, both built as the gate builds them: the whole
  // draft's Gesetzestext, and the §-wise index over its Novellierungs-
  // anordnungen (`draftBags`). Which of the two a § of the annex gets is
  // `bagFor`'s decision, not this script's.
  const bags = draftBags(draftBlocks)
  // The reference as it was until 2026-09-10: every word of the draft, for
  // whichever § asks. Kept beside the new one so the two are measured in the
  // same run over the same corpus.
  const wide: WordBag = { has: (w) => bags.whole.has(w), read: bags.whole.size > 0 }
  coverage.units += bags.units
  coverage.addressed += bags.addressed
  coverage.rightly += bags.rightlyWithoutParagraph
  for (const [reason, n] of bags.reasons) coverage.reasons.set(reason, (coverage.reasons.get(reason) ?? 0) + n)

  const parsed = readable
    ? parseTextComparison(annexXmlText, articles)
    : parseAnnexPdf(await pagesOf(new Uint8Array(await (await fetch(pdfUrl!, { headers: { 'User-Agent': scriptUserAgent(SCRIPT) } })).arrayBuffer())), articles)
  if (parsed.refusal || parsed.rows.length === 0) return null

  const byKey = new Map<string | null, DraftArticle>(articles.map((a) => [a.key, a]))
  const resolved = new Map<string | null, KonsLawAtDate | null>()
  const lawOf = async (key: string | null): Promise<KonsLawAtDate | null> => {
    if (resolved.has(key)) return resolved.get(key)!
    const article = key === null ? (amending.length === 1 ? amending[0]! : null) : byKey.get(key)
    const law = article?.amends && article.bgbl ? await resolveLawByBgbl(article.bgbl, beginn, article.title ?? undefined).catch(() => null) : null
    resolved.set(key, law)
    return law
  }
  const indexes = new Map<KonsLawAtDate, Map<string, KonsParagraphRef>>()
  const indexOf = (law: KonsLawAtDate): Map<string, KonsParagraphRef> => {
    let index = indexes.get(law)
    if (!index) {
      index = new Map<string, KonsParagraphRef>()
      for (const [label, ref] of Object.entries(law.paragraphs)) {
        const key = designationKey(label)
        if (key !== null && !index.has(key)) index.set(key, ref)
      }
      indexes.set(law, index)
    }
    return index
  }

  // Per §, not per row: the annex splits one provision over as many rows as
  // its layout needs, and a fault injected into one row is a fault in the §.
  const groups = new Map<string, { law: string | null; para: string; rows: ComparisonRow[] }>()
  for (const row of parsed.rows) {
    if (row.kind !== 'pair') continue
    const para = row.gld ?? row.para
    if (!para) continue
    const key = annexParagraphKey(row.law, para)
    const group = groups.get(key) ?? { law: row.law, para, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }

  const judgedParas: Judged[] = []
  for (const group of groups.values()) {
    const law = await lawOf(group.law)
    if (!law) continue
    const key = designationKey(group.para)
    if (key === null) continue
    const ref = indexOf(law).get(key)
    if (!ref) continue
    const tree = await fetchParagraphTree(ref)
    // A § RIS holds as a table is not represented as a tree, so there is
    // nothing to hold the column against and nothing to break.
    if (!tree) continue
    const heading = [...tree.context, tree.heading ?? ''].join(' ')
    const standing: StandingText = { text: [...tree.context, plainText(tree)].join(' '), heading }
    const cover = coverageOfParagraph(group.rows, standing.text)
    judgedParas.push({
      law: group.law,
      para: group.para,
      rows: group.rows,
      standing,
      leftPasses: cover.prose && cover.ratio >= PARAGRAPH_THRESHOLD,
      prose: cover.prose,
    })
  }

  // The false-positive side, over the population the shipped gate applies the
  // two right-column causes to: every § whose left column did not *fail*
  // (`verifyAnnex` records 'standing' first, so a § that failed the left check
  // never reaches the right-column causes). The counts are therefore the two
  // "einbehalten" lines of `annex-pdf-verify.ts`, up to `MAX_PARAGRAPHS` —
  // see the note under the table.
  /**
   * The §-wise reference for one § of the annex — `draftReference`'s own
   * decision, so the script measures the shipped lookup and not a second
   * reading of the index. `shown` is what the annex prints a block of its own
   * for, per law, which is the distinction that keeps a merged block from
   * reading as unexplained text.
   */
  const shown = new Map<string | null, Set<string>>()
  for (const group of groups.values()) {
    const key = designationKey(group.para)
    if (key === null) continue
    const into = shown.get(group.law) ?? new Set<string>()
    into.add(key)
    shown.set(group.law, into)
  }
  const references = new Map<string | null, (para: string) => WordBag>()
  const bagOf = (para: Judged): WordBag => {
    let reference = references.get(para.law)
    if (!reference) {
      reference = draftReference(bags, para.law, shown.get(para.law) ?? new Set<string>())
      references.set(para.law, reference)
    }
    return reference(para.para)
  }
  // Where that lookup landed, which is the coverage question: a § whose law
  // the index does not know falls back to the whole draft (the rule as it
  // shipped), and a § its law knows but never addresses gets the general bag
  // alone — the only class that can produce a new false alarm.
  for (const para of judgedParas) {
    if (!bags.byLaw.has(para.law) && !bags.general.has(para.law)) coverage.noLawBag++
    else if (bags.byLaw.get(para.law)?.get(designationKey(para.para) ?? '') === undefined) coverage.noOwnBag++
    else coverage.ownBag++
  }

  const base = new Map<Judged, Verdict>()
  for (const para of judgedParas) {
    const verdict = judge(para.rows, para.standing, wide, bagOf(para))
    base.set(para, verdict)
    if (para.prose && !para.leftPasses) continue
    corpus.held++
    if (verdict.rule1) corpus.rule1++
    if (verdict.rule2Wide) corpus.rule2Wide++
    if (verdict.rule2Para) corpus.rule2Para++
    if (verdict.rule1 || verdict.rule2Wide) corpus.eitherWide++
    if (verdict.rule1 || verdict.rule2Para) corpus.eitherPara++
    // The whole risk of the narrower reference. Every § that only the per-§
    // bag refuses is named here with the words it is missing, because a false
    // alarm withholds real law and a count cannot be inspected.
    if (verdict.rule2Para && !verdict.rule2Wide) {
      const check = rightColumnCheck(para.rows, para.standing, bagOf(para))
      const own = bags.byLaw.get(para.law)?.get(designationKey(para.para) ?? '')
      corpus.newAlarms.push(`${cite} ${para.para}${para.law ? ` [${para.law.slice(0, 28)}]` : ''} — ${check.missingWords}/${check.newWords} fehlen${own ? '' : ', ohne eigenen Sack'}: ${check.missing.slice(0, 9).join(' ')}`)
    }
    if (verdict.rule2Wide && !verdict.rule2Para) {
      corpus.lostAlarms.push(`${cite} ${para.para} — nur der ganze Entwurf meldete`)
    }
  }

  let injected = 0
  const confirmed = judgedParas.filter((p) => p.leftPasses)
  for (const para of confirmed) {
    const baseVerdict = base.get(para)!
    // The injection site: a row the page shows as a word diff, whose left
    // column is long enough that losing one sentence of it still leaves a
    // judgeable §. A row picked without those conditions would measure the
    // annex's line breaks rather than the gate.
    const site = para.rows.find((row) => {
      if (row.kind !== 'pair' || row.change !== 'changed' || row.elided || !row.segments) return false
      const sentences = sentencesOf(row.current)
      return sentences.length >= MIN_SITE_SENTENCES &&
        toks(row.current).length >= MIN_SITE_TOKENS &&
        // A second sentence below the rule's own floor is a fault the rule is
        // not built to see, and counting it as a miss would measure the
        // injector. Six words is `MIN_STANDING_STRETCH`.
        toks(sentences[1]!).length >= MIN_STANDING_STRETCH
    })
    if (!site) continue
    injected++

    // Fault L: the sentence is gone from the left column and the word diff is
    // recomputed, exactly as it would have been had the parser lost the line.
    const lostCurrent = sentencesOf(site.current).filter((_, i) => i !== 1).join(' ')
    const faultL = withRow(para.rows, site, { ...site, current: lostCurrent, segments: diffTokens(lostCurrent, site.proposed).segments })
    record(faults.L, judge(faultL, para.standing, wide, bagOf(para)), baseVerdict)

    // Both R faults take their donor from another § of the same law that the
    // gate also confirmed — one from the standing text RIS holds for it, one
    // from what the annex proposes for it.
    const donors = confirmed.filter((other) => other !== para && other.law === para.law)
    const sentence = (text: string): string | null => sentencesOf(text).find((s) => toks(s).length >= MIN_DONOR_TOKENS) ?? null
    const oldDonor = donors.map((other) => sentence(other.standing.text)).find((s) => s !== null) ?? null
    const newDonor = donors.map((other) => sentence(other.rows.map((r) => r.proposed).join(' '))).find((s) => s !== null) ?? null

    for (const [donor, into] of [[oldDonor, faults.Rold], [newDonor, faults.Rnew]] as const) {
      if (donor === null) continue
      const garbled = `${site.proposed} ${donor}`
      const faultR = withRow(para.rows, site, { ...site, proposed: garbled, segments: diffTokens(site.current, garbled).segments })
      record(into, judge(faultR, para.standing, wide, bagOf(para)), baseVerdict)
    }

    // Fault U: one more row, another §'s standing text printed in both columns.
    // The TODO's own wording for the class — „eine falsch gepaarte Zeile, die in
    // beiden Spalten dasselbe druckt, ist unsichtbar" — and this run is what
    // turns „unsichtbar" from a fear into a number. Nothing can catch it by
    // construction: the left check reads only the rows the page shows as a
    // change (`isDisplayedChange`), and both right-column rules read only what
    // the word diff shows as *inserted*, of which a mirrored row has nothing.
    // The number that is not settled in advance is `silenced`.
    if (oldDonor !== null) record(faults.U, judge(withMirroredRow(para.rows, site, oldDonor), para.standing, wide, bagOf(para)), baseVerdict)
  }
  return { cite, judged: confirmed.length, injected }
}

// --- CLI ----------------------------------------------------------------------
const gp = argAssigned('gp') ?? 'XXVIII'
const limit = Number(argAssigned('limit') ?? 400)
const only = argAssigned('only') ?? null
const xmlMode = argFlag('xml')

/** The corpus without any fault — the number that has to stay small. */
const corpus = { held: 0, rule1: 0, rule2Wide: 0, rule2Para: 0, eitherWide: 0, eitherPara: 0, newAlarms: [] as string[], lostAlarms: [] as string[] }
/** How far the §-wise addressing reaches — the precondition of the whole change. */
const coverage = { units: 0, addressed: 0, rightly: 0, reasons: new Map<string, number>(), ownBag: 0, noOwnBag: 0, noLawBag: 0 }
const faults = {
  L: tally('L     zweiter Satz links verloren'),
  Rold: tally('R-alt fremder geltender Satz rechts'),
  Rnew: tally('R-neu fremder Entwurfssatz rechts'),
  U: tally('U     fremder Satz beidspaltig gleich'),
}

const docs: any[] = []
for (let page = 1; page <= 4 && docs.length < limit; page++) {
  const body = await risJson({
    Applikation: 'Begut',
    'Begut.Gesetzgebungsperiode': gp,
    DokumenteProSeite: 'OneHundred',
    Seitennummer: String(page),
  })
  const refs = asArray<any>(body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference)
  if (refs.length === 0) break
  docs.push(...refs)
}
console.log(`GP ${gp}: ${docs.length} Entwürfe aus dem RIS\n`)

let drafts = 0
for (const doc of docs.slice(0, limit)) {
  const label = `${doc?.Data?.Metadaten?.Bundesrecht?.Begut?.Begutachtungsverfahrennummer ?? ''} ${doc?.Data?.Metadaten?.Bundesrecht?.Kurztitel ?? ''} ${doc?.Data?.Metadaten?.Bundesrecht?.Titel ?? ''}`
  if (only && !label.toLowerCase().includes(only.toLowerCase())) continue
  try {
    const result = await inject(doc)
    if (!result) continue
    drafts++
    console.log(`  ·  ${result.cite.padEnd(9)} ${String(result.judged).padStart(3)} bestätigte Paragraphen, ${String(result.injected).padStart(3)} davon mit Injektionsstelle`)
  } catch (err) {
    console.log(`  ?  ${String(doc?.Data?.Metadaten?.Bundesrecht?.Kurztitel ?? '?').slice(0, 9).padEnd(9)} ${String(err).slice(0, 90)}`)
  }
}

const pct = (n: number, of: number): string => (of === 0 ? '   —  ' : `${((n / of) * 100).toFixed(1).padStart(5)} %`)
console.log(`\n${'='.repeat(86)}`)
console.log(xmlMode ? 'Fehlerinjektion in die lesbaren XML-Beilagen (der Tabellenpfad)' : 'Fehlerinjektion in die gerasterten Beilagen (PDF-Textebene)')
console.log(`  auswertbare Entwürfe : ${drafts}`)
console.log(`\n  Ohne Injektion — Fehlalarme über die Paragraphen, die die linke Prüfung nicht verfehlen`)
console.log(`  (dieselbe Grundmenge wie die beiden Einbehalt-Zeilen in annex-pdf-verify.ts, ${corpus.held} Paragraphen;`)
console.log(`   dieser Lauf kennt keine MAX_PARAGRAPHS-Decke, zählt also auch den Schwanz der Sammelnovellen mit)`)
console.log(`    „bereits geltend"                      : ${String(corpus.rule1).padStart(4)} (${pct(corpus.rule1, corpus.held)})`)
console.log(`    „nicht im Entwurf", ganzer Entwurf     : ${String(corpus.rule2Wide).padStart(4)} (${pct(corpus.rule2Wide, corpus.held)})`)
console.log(`    „nicht im Entwurf", je Paragraph       : ${String(corpus.rule2Para).padStart(4)} (${pct(corpus.rule2Para, corpus.held)})`)
console.log(`    eine der beiden, ganzer Entwurf        : ${String(corpus.eitherWide).padStart(4)} (${pct(corpus.eitherWide, corpus.held)})`)
console.log(`    eine der beiden, je Paragraph          : ${String(corpus.eitherPara).padStart(4)} (${pct(corpus.eitherPara, corpus.held)})`)
for (const line of corpus.newAlarms) console.log(`      + ${line}`)
for (const line of corpus.lostAlarms) console.log(`      - ${line}`)

// Whether the §-wise reference reaches the §§ at all. It is the precondition
// of the whole change: an instruction nobody could address contributes to the
// general bag, so poor coverage does not fail a § — it silently returns the
// rule to the whole-draft bag, and a rate nobody prints cannot say so.
console.log(`\n  Adressierung der Novellierungsanordnungen`)
console.log(`    Anordnungen gelesen              : ${coverage.units}`)
console.log(`    davon mit mindestens einem §     : ${coverage.addressed} (${pct(coverage.addressed, coverage.units)})`)
// The rest is two different things, and a residual that adds them up reads as
// a bigger gap than it is: an Inhaltsverzeichnis, a Titel and an Abschnitt
// heading name no § and belong in the general bag whatever the grammar learns.
console.log(`    ohne Paragraph, zu Recht         : ${coverage.rightly} (${pct(coverage.rightly, coverage.units)})`)
console.log(`    ohne Paragraph, ungelesen        : ${coverage.units - coverage.addressed - coverage.rightly} (${pct(coverage.units - coverage.addressed - coverage.rightly, coverage.units)})`)
console.log(`    Paragraphen der Beilage mit eigenem Sack : ${coverage.ownBag}`)
console.log(`    …nur mit dem allgemeinen Sack ihres Gesetzes: ${coverage.noOwnBag}`)
console.log(`    …ohne jede Anordnung für ihr Gesetz (Rückfall auf den ganzen Entwurf): ${coverage.noLawBag}`)
for (const [reason, n] of [...coverage.reasons].sort((a, b) => b[1] - a[1])) {
  console.log(`      ${String(n).padStart(4)}× im allgemeinen Sack: ${reason}`)
}

console.log(`\n  Mit Injektion, je Fehler ("nicht im Entwurf" mit beiden Bezügen)`)
console.log(`  Fehler                                §§   linke Prüfung besteht   „bereits geltend"    n.i.E. ganz         n.i.E. je §         beide ganz          beide je §`)
for (const fault of [faults.L, faults.Rold, faults.Rnew, faults.U]) {
  const cell = (n: number): string => `${String(n).padStart(6)} (${pct(n, fault.tried)})`
  console.log(`  ${fault.label.padEnd(36)} ${String(fault.tried).padStart(4)}   ${cell(fault.leftPasses)}   ${cell(fault.rule1)}   ${cell(fault.rule2Wide)}   ${cell(fault.rule2Para)}   ${cell(fault.eitherWide)}   ${cell(fault.eitherPara)}`)
}
// A rule that was already firing on the sound § did not catch the fault; it
// was there before it. Small by construction (the false-positive rate above),
// and printed rather than assumed.
for (const fault of [faults.L, faults.Rold, faults.Rnew, faults.U]) {
  if (fault.rule1Already === 0 && fault.rule2WideAlready === 0 && fault.rule2ParaAlready === 0) continue
  console.log(`    ${fault.label.trim()}: davon schon ohne Injektion gemeldet — Regel 1 ${fault.rule1Already}, Regel 2 ganz ${fault.rule2WideAlready}, je § ${fault.rule2ParaAlready}`)
}
// And the other direction: a fault that takes an alarm *away*. Zero is the
// claim, not the assumption — the left column exempts the right one, so text
// smuggled left is an alibi.
for (const fault of [faults.L, faults.Rold, faults.Rnew, faults.U]) {
  if (fault.silenced === 0) continue
  console.log(`    ${fault.label.trim()}: bringt eine vorher feuernde Regel zum Schweigen — ${fault.silenced}`)
}
