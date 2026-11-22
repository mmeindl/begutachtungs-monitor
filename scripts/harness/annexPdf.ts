#!/usr/bin/env vite-node
/**
 * Checks the annex PDF parser against the standing law in RIS (docs/api-exploration.md §2c).
 *
 * The annex's *left* column claims to be the law as it stands when the draft
 * is published. RIS holds that text independently, so the claim is checkable —
 * a self-check the XML path does not even have. Elision ("(1) und (2) …") means
 * the column is a deliberate subset, so the test is **containment** of the
 * column's words in the RIS paragraph, never equality.
 *
 * The reference date is the draft's `BeginnBegutachtungsfrist`, not a value
 * passed in. Taking it from the command line made the score swing from 66,7 %
 * to 88,9 % on one and the same document (8/ME, 2026-09-09) — the measurement
 * was then saying more about the argument than about the parser.
 *
 * Multi-law packages are scored per law. The annex's Artikel headings are
 * cross-checked against the draft's own Artikel list (`annexBoundaries.ts`),
 * each § is looked up in the Stammnorm of *its* law, and a package whose
 * boundaries do not survive that check is refused rather than guessed — in
 * the multi-law annexes 15,1 % of § designations recur in another law of the
 * same package, so a misplaced boundary scores the parser against unrelated
 * text and would flatter or damn it at random.
 *
 * The Begut list is fetched afresh on every run, the rest comes from the
 * harness cache. `--liste-aus-cache` replays the cached list on purpose — an
 * offline run, or two worktrees over the same drafts — and the first line of
 * the run says when that list was fetched and how far it reaches.
 *
 * **And what the page marks on top of the gate** (21.11.2026): the draft
 * check and our Lesefassung, run once per draft through the page's own
 * sources (`lesefassungOf`), and the table of `annex/annexMark.ts` over every
 * shown § — „nicht bestätigt", the table's „nicht geprüft" by reason, both
 * values of its one open cell, and the oracle's word by the draft check's
 * state. The gate's own figures stay the gate's, so the drift baseline does
 * not move with the table; `--zeilen` carries the rows as the page gets them
 * and every shown § as the table saw it (`paragraphs`).
 *
 * Usage:  npx vite-node -c vitest.config.ts scripts/harness/annexPdf.ts --gp=XXVIII [--xml] [--limit=N] [--only=8] [--liste-aus-cache]
 */
import { annexParagraphKey, designationKey } from '../../server/utils/annex/annexText'
import { MIN_PROSE_TOKENS, coverageOf, displayedChangeRows, isDisplayedChange } from '../../server/utils/annex/coverage'
import { checkAnnexRows, notRunReason } from '../../server/utils/annex/gateRows'
import { draftBags, insertedStretches } from '../../server/utils/annex/rightColumn'
import {
  verifyAnnex,
  type AnnexDraft,
  type AnnexSources,
  type ParagraphVerdict,
} from '../../server/utils/annex/verdict'
import { parseAnnexParts, type AnnexPage } from '../../server/utils/annex/annexPdf'
import { lineAccounting } from '../lib/annexLines'
import { pagesOf } from '../../server/utils/annex/annexPdfPages'
import { plainText } from '../../server/utils/lawtext/konsTree'
import { parseRisXml } from '../../server/utils/lawtext/risXml'
import { draftArticles, type DraftArticle } from '../../server/utils/lawtext/draftArticles'
import { getText, type KonsLawAtDate } from '../../server/utils/ris/konsLaw'
import { fetchParagraphTree } from '../../server/utils/harness/risKonsHistory'
import { annexSection, parseTextComparison, type ComparisonParse, type ComparisonRow } from '../../server/utils/annex/comparisonRows'
import { isScanned } from '../../server/utils/annex/tableCells'
import { installFetchCache, isBegutSearch } from '../lib/harnessCache'
import { windowLine, windowOf, type AnnexReport } from '../lib/annexReport'
import type { ConsolidatedTextResponse, TextComparisonRow } from '../../shared/types'
import { argAssigned, argFlag } from '../lib/args'
import { risJson as risQuery, scriptUserAgent } from '../lib/http'
import { asArray, pickBundledTextComparisons, pickOlderTextComparisons, pickTextComparisons } from '../lib/ris'
import { holdsAsAnnex } from '../../server/utils/annex/olderAnnex'
import { annexSources, draftRenditionOf, fetchParagraphXml, resolveKonsLaw } from '../lib/productionSources'
import { annexStrictChecks } from '../../server/utils/annex/annexStrict'
import { MARK_DELETIONS, MARK_DRAFT_UNREAD, MARK_LONG, MARK_UNASSIGNED, MARK_WORDING, annexMarks, type AnnexMark, type ObjectionRule } from '../../server/utils/annex/annexMark'
import type { StruckBy } from '../../server/utils/laender/landTguStrict'
import { REASON_NOTHING_TO_COMPARE } from '../../server/utils/annex/verdict'
import { consolidate } from '../../server/utils/kons/consolidate'
import { oracleConfirmedRows } from '../../shared/utils/annexOutcomes'
import type { TextBlock } from '../../server/utils/lawtext/lawUnits'
import { corpusReach, harnessStamp } from '../lib/harnessRecord'

const cache = installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache', { fresh: isBegutSearch, replay: argFlag('liste-aus-cache') })

const SCRIPT = 'harness/annexPdf'

/* eslint-disable @typescript-eslint/no-explicit-any */
const risJson = (params: Record<string, string>): Promise<any> => risQuery(params, { script: SCRIPT })

/**
 * The standing law for the gate, uncached — the request path's own sources
 * (`annexSourcesOf` over `resolveKonsLaw`, `lib/productionSources.ts`),
 * minus Nitro. That is what `AnnexSources` is for: the verdict logic runs
 * here exactly as it runs in a request, so the corpus measures the shipped
 * decision instead of a copy of it that can drift. Until 21.11.2026 this
 * was `resolveLawByBgbl` without the clause, without `standingOnDay` and
 * without the bridge over a version gap, so the drift baseline and
 * /genauigkeit measured another standing text than the page shows.
 */
const gateSources: AnnexSources = annexSources

interface DraftResult {
  /**
   * The RIS document key. `cite` is no good as a key: most records in the
   * window are Verordnungen without a Begutachtungsverfahrennummer and fall
   * back on the Kurztitel cut at 34 characters — „Verordnung des
   * Bundesministers für" stands nine times in the table path on 16.09.2026.
   * Class B's baseline needs an identity that holds.
   */
  id: string
  cite: string
  source: 'xml' | 'pdf'
  checked: number
  clean: number
  note: string | null
  worst: string[]
  /** Every row's coverage ratio, for the distribution — a mean hides the shape */
  ratios: number[]
  /** (comparable words, ratio) per §, for calibrating the prose floor */
  points: { n: number; ratio: number }[]
  /** Rows carrying enough prose to be evidence either way, and their clean count */
  substantial: number
  substantialClean: number
  tooShort: number
  /** Amending Artikel in the draft — 1 for a plain Novelle, N for a package */
  laws: number
  /** Rows the boundary check could attribute to a law, and rows it could not */
  attributed: number
  unattributed: number
  /** Why a row carries no law: the annex left it outside every boundary, or RIS has no such law */
  noLaw: number
  unresolvedLaw: number
  /** Rows whose RIS paragraph is a table, which is refused rather than mangled */
  unrepresentable: number
  /**
   * The rows the left check never sees: `unchanged`, non-elided, with text.
   *
   * Printed because the decision to leave them out is a decision
   * (`annex/coverage.ts`, `isDisplayedChange`), and a decision nobody measures
   * becomes an assumption. The page shows their left text — folded behind „N Stellen
   * unverändert", but shown — so „never held against RIS" is a statement about
   * text the reader reads.
   *
   * `unchangedBelow` is what a rule over them would withhold and
   * `unchangedBelowVerified` what that would cost: a § the gate confirms today
   * loses its whole word diff, not just the unchanged line.
   */
  unchangedRows: number
  unchangedParas: number
  /** …§§ whose unchanged rows together clear `MIN_PROSE_TOKENS` */
  unchangedProse: number
  /** …of those, the ones under `PARAGRAPH_THRESHOLD` against the standing § */
  unchangedBelow: number
  unchangedBelowVerified: number
  /**
   * Pages of the PDF whose geometry the parser could not vouch for and did not
   * read (`annexPdf.ts`, `isProven`). 0 on the XML path and, today, on every
   * PDF annex of GP XXVIII — which is exactly why it has to be printed: a
   * number nobody looks at cannot say when that stops being true.
   */
  droppedPages: number
  /**
   * Line accounting (19.11.2026, `lineAccounting`): the PDF's column lines
   * whose words reach no row of their column, and of those the ones that
   * differ from the other column's line beside them — where a change could
   * hide that the page never shows. 0 on the table path.
   */
  lostLines: number
  lostDiffering: number
  /** …and the lines of parts read on their own that reach no row. */
  lostApart: number
  /**
   * Laws whose front matter differs between the columns
   * (`AnnexParse.frontMatterDiffers`): the parse leaves that text out and the
   * page now says so at the law (19.11.2026, audit A3). Most of the lost
   * lines above that differ are here; 0 on the table path.
   */
  frontMatterLaws: number
  /**
   * How far rule 2's reference reaches: instructions read, instructions that
   * addressed at least one §, and the annex's §§ split by whether the draft's
   * instructions name them (`annex/rightColumn.ts`, `draftBags`).
   *
   * Poor addressing does not fail a § — the words of an unreadable
   * instruction go to every § of its law — so it shows up nowhere in the
   * verdicts. It has to be printed, or the rule quietly returns to the
   * whole-draft reference it was narrowed away from.
   */
  units: number
  addressedUnits: number
  /** …of the rest, the ones that name no § by nature (`DraftBags`) */
  rightlyWithoutParagraph: number
  parasWithOwnBag: number
  parasWithoutOwnBag: number
  /**
   * The gate as the request path applies it (`verifyAnnex` + `checkAnnexRows`,
   * the very functions the service calls), so the harness measures the shipped
   * decision and not a replica of it.
   */
  gate: GateResult
}

/** What the shipped gate did with this draft, and whether it kept its promises. */
interface GateResult {
  ran: boolean
  notRunReason: string | null
  judged: number
  verifiedParas: number
  withheldParas: number
  /** …split by which of the three checks refused the §, and it has to sum */
  withheldStanding: number
  withheldAlreadyStanding: number
  withheldNotInDraft: number
  withheldRepealUnproven: number
  withheldRepeated: number
  uncheckedParas: number
  /**
   * The §§ the page marks „nicht geprüft" (21.11.2026): unchecked AND owing a
   * check (`checkAnnexRows`, `uncheckedParagraphs`), plus each row without a
   * § that owes one — what `groupAnnexRows` counts on the page. `uncheckedParas`
   * counts every unchecked verdict, also of §§ the page shows unmarked: a
   * § with no change shown, or one whose new text rule 2 held.
   */
  markedParas: number
  /** Pair rows without any § designation, and the subset the page shows as a change */
  rowsNoPara: number
  changeRowsNoPara: number
  /** Invariants. Every one of these has to stay at zero. */
  verdictless: number
  wronglyVerified: number
  withheldWithText: number
  withheldWithoutCause: number
  /** The verdict map itself, so a second pass can ask what the gate said. */
  verdicts: Record<string, ParagraphVerdict>
  /** The rows as the response carries them, for `--zeilen=`. */
  rows: readonly TextComparisonRow[]
  /** Every shown § as the table saw it (`annexMark.ts`). */
  paragraphs: MarkedParagraph[]
  /**
   * What the page shows on top of the gate (`annexMark.ts`, 21.11.2026): the
   * §§ shown, and of those the ones „nicht bestätigt" and the ones the table
   * marks „nicht geprüft" by its reason (the gate's own stay in
   * `markedParas`); „nicht bestätigt" also under each value of
   * `OBJECTION_OVER_CONFIRMATION`, the only figure it moves.
   */
  marks: MarkRecord
}

/** The table's figures for one draft (`GateResult.marks`, the record's `marks`). */
interface MarkRecord {
  shownParas: number
  unconfirmedParas: number
  /** „nicht bestätigt" under each value of `OBJECTION_OVER_CONFIRMATION` (`unconfirmedParas` is the default's). */
  unconfirmedParasBy: Record<ObjectionRule, number>
  /** „nicht geprüft" from the table, by reason: deletions, unassigned, wording, long, draftUnread. */
  markedWord: Record<MarkReasonKey, number>
  /** The gate's marked §§ the oracle confirms — kept marked; counted for a later rule. */
  gateMarkedConfirmed: number
  /**
   * Since the draft check reads struck text (22.11.2026, `struckAccount`):
   * the §§ „nicht bestätigt" whose objection is struck text alone (`struck`),
   * and the §§ showing no new wording that the table shows clean on the draft
   * check's word, the oracle not confirming — the „nicht geprüft" for
   * deletions they carried before (`deletionsCleared`).
   */
  struckUnconfirmed: number
  deletionsCleared: number
  /** The §§ the table decides (shown, not marked by the gate): the oracle's word by the draft check's state. */
  table: Record<'confirmed' | 'notConfirmed' | 'noLesefassung', Record<StrictCell, number>>
}
type MarkReasonKey = 'deletions' | 'unassigned' | 'wording' | 'long' | 'draftUnread'
const MARK_REASON_KEY: Record<string, MarkReasonKey> = { [MARK_DELETIONS]: 'deletions', [MARK_UNASSIGNED]: 'unassigned', [MARK_WORDING]: 'wording', [MARK_LONG]: 'long', [MARK_DRAFT_UNREAD]: 'draftUnread' }
const noCells = (): Record<StrictCell, number> => ({ holds: 0, 'holds-empty': 0, differs: 0, unchecked: 0, 'no-new-text': 0 })
const noMarks = (): MarkRecord => ({ shownParas: 0, unconfirmedParas: 0, unconfirmedParasBy: { clean: 0, unconfirmed: 0, missing: 0 }, markedWord: { deletions: 0, unassigned: 0, wording: 0, long: 0, draftUnread: 0 }, gateMarkedConfirmed: 0, struckUnconfirmed: 0, deletionsCleared: 0, table: { confirmed: noCells(), notConfirmed: noCells(), noLesefassung: noCells() } })

/**
 * `--zeilen=<path>`: every draft's rows as the response would carry them,
 * written as one JSON file — what an old-against-new comparison of a parser
 * or gate change reads item by item (19.11.2026). The figures above count;
 * only the rows show which § moved and how.
 */
const dumpedRows: Record<string, unknown> = {}
function dumpRows(id: string, cite: string, parsed: ComparisonParse, gate: GateResult): void {
  dumpedRows[id] = {
    cite,
    refusal: parsed.refusal,
    unplaced: 'unplacedKinds' in parsed ? parsed.unplacedKinds : undefined,
    rows: gate.rows.map((r) => ({
      kind: r.kind, law: r.law, heading: r.heading, para: r.para, gld: r.gld, paraAfter: r.paraAfter, change: r.change, check: r.check,
      cause: r.withheldCause ?? null, reason: r.uncheckedReason ?? null, owes: r.owesCheck, elided: r.elided, elisionRange: r.elisionRange, editorial: r.editorial,
      current: r.current, proposed: r.proposed,
    })),
    paragraphs: gate.paragraphs,
  }
}

/**
 * The first older-name candidate whose content holds as a Gegenüberstellung,
 * read the way `readOlder` in `annex/annexSource.ts` reads it: the table if
 * RIS has one, the PDF where RIS rasterised it, and the decision itself is the
 * shipped `holdsAsAnnex`.
 */
async function olderAnnexParts(contents: any[], main: any, urlOf: (ref: any, type: string) => string | null): Promise<any[]> {
  const candidates = pickOlderTextComparisons(contents, (c) => String(c?.Name ?? ''))
  if (candidates.length === 0) return []
  const mainXml = urlOf(main, 'Xml')
  const articles = mainXml ? draftArticles(parseRisXml(await getText(mainXml))) : []
  for (const candidate of candidates) {
    const xmlUrl = urlOf(candidate, 'Xml')
    const xml = xmlUrl ? await getText(xmlUrl) : null
    if (xml !== null && !isScanned(xml)) {
      if (holdsAsAnnex(parseTextComparison(xml, articles), 'table', xml)) return [candidate]
      continue
    }
    const pdfUrl = urlOf(candidate, 'Pdf')
    if (!pdfUrl) continue
    const pages = await pagesOf(new Uint8Array(await (await fetch(pdfUrl, { headers: { 'User-Agent': scriptUserAgent(SCRIPT) } })).arrayBuffer())).catch(() => null)
    const parsed = parseAnnexParts([pages], articles)
    if (parsed && holdsAsAnnex(parsed, 'pdf', null)) return [candidate]
  }
  return []
}

/**
 * The first bundle whose cut yields rows, read the way `readBundle` in
 * `annex/annexSource.ts` reads it: the table path only, and only the section
 * `annexSection` cuts out. The cut is returned with it, because that — not
 * the whole bundle — is the document the rows come from.
 */
async function bundledAnnex(contents: any[], main: any, urlOf: (ref: any, type: string) => string | null): Promise<{ part: any; section: string } | null> {
  const bundles = pickBundledTextComparisons(contents, (c) => String(c?.Name ?? ''))
  if (bundles.length === 0) return null
  const mainXml = urlOf(main, 'Xml')
  const articles = mainXml ? draftArticles(parseRisXml(await getText(mainXml))) : []
  for (const part of bundles) {
    const xmlUrl = urlOf(part, 'Xml')
    const xml = xmlUrl ? await getText(xmlUrl) : null
    if (xml === null || isScanned(xml)) continue
    const section = annexSection(xml)
    if (section !== null && parseTextComparison(section, articles).rows.length > 0) return { part, section }
  }
  return null
}

async function verify(doc: any): Promise<DraftResult | null> {
  const meta = doc?.Data?.Metadaten
  const begut = meta?.Bundesrecht?.Begut
  const cite = String(begut?.Begutachtungsverfahrennummer ?? begut?.Verfahrensnummer ?? meta?.Bundesrecht?.Kurztitel ?? meta?.Technisch?.ID ?? '?').slice(0, 34)
  const id = String(meta?.Technisch?.ID ?? cite)
  const beginn: string | null = begut?.BeginnBegutachtungsfrist ?? null
  const noGate: GateResult = { ran: false, notRunReason: null, judged: 0, verifiedParas: 0, withheldParas: 0, withheldStanding: 0, withheldAlreadyStanding: 0, withheldNotInDraft: 0, withheldRepealUnproven: 0, withheldRepeated: 0, uncheckedParas: 0, markedParas: 0, rowsNoPara: 0, changeRowsNoPara: 0, verdictless: 0, wronglyVerified: 0, withheldWithText: 0, withheldWithoutCause: 0, verdicts: {}, rows: [], paragraphs: [], marks: noMarks() }
  const blank = (note: string, laws = 0): DraftResult => ({ id, cite, source: 'pdf', checked: 0, clean: 0, note, worst: [], ratios: [], points: [], substantial: 0, substantialClean: 0, tooShort: 0, laws, attributed: 0, unattributed: 0, noLaw: 0, unresolvedLaw: 0, unrepresentable: 0, unchangedRows: 0, unchangedParas: 0, unchangedProse: 0, unchangedBelow: 0, unchangedBelowVerified: 0, droppedPages: 0, lostLines: 0, lostDiffering: 0, lostApart: 0, frontMatterLaws: 0, units: 0, addressedUnits: 0, rightlyWithoutParagraph: 0, parasWithOwnBag: 0, parasWithoutOwnBag: 0, gate: noGate })
  if (!beginn) return blank('kein Beginn der Begutachtungsfrist')

  const contents = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
  const main = contents.find((c) => c?.ContentType === 'MainDocument')
  // EVERY document of the annex, in RIS's order — the same rule the request
  // path applies (`ris/risRecord.ts`, `annex/annexSource.ts`). 2 of the 240
  // records with a Gegenüberstellung publish it in parts, and a harness that
  // read only the first would measure a decision the site does not make.
  const urlOf = (ref: any, type: string): string | null => asArray<any>(ref?.Urls?.ContentUrl).find((u) => u?.DataType === type)?.Url ?? null
  const named = pickTextComparisons(contents, (c) => String(c?.Name ?? ''))
  // Where no name reads as a Gegenüberstellung, the older names „begtxt",
  // „GGUe" — decided by content, as the request path decides them
  // (`annex/annexSource.ts`, `readOlder`). Without this the harness would
  // report „no effect" for a change it never reaches.
  const older = named.length > 0 ? named : await olderAnnexParts(contents, main, urlOf)
  // Last, the bundle — only where neither found anything, and read only
  // through its cut (`annexSection`), as the request path reads it.
  const bundle = older.length > 0 ? null : await bundledAnnex(contents, main, urlOf)
  const parts = bundle ? [bundle.part] : older
  if (onlyByContent && named.length > 0) return null
  const annex = parts[0]
  if (!annex) return null
  const annexXml = urlOf(annex, 'Xml')
  // A bundle has no PDF path: of the rasterised ones, the PDF reader finds
  // the column headings in none.
  const pdfUrl = bundle ? null : urlOf(annex, 'Pdf')
  const annexXmlText = bundle ? bundle.section : annexXml ? await getText(annexXml) : null
  const readable = annexXmlText !== null && !isScanned(annexXmlText)
  // Two paths, one ruler. `--xml` measures the annexes the page shows today
  // (a real HTML table in the RIS XML); the default measures the rasterised
  // ones, which only the PDF's text layer can reach. Scoring the shipped
  // path against the same RIS check was what turned its correctness from
  // asserted into measured — and it came out *below* the PDF path.
  if (xmlMode !== readable) return null
  if (!readable && !pdfUrl) return blank('Beilage ohne PDF')

  const mainXml = asArray<any>(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  if (!mainXml) return blank('Entwurf ohne XML')
  // The same blocks twice: the Artikel list that bounds the annex's laws, and
  // the draft's own Gesetzestext, which is the check's second reference —
  // built here exactly as the service builds it (`draftTextOf`), so the
  // harness measures the shipped decision and not a copy of it.
  const draftBlocks = parseRisXml(await getText(mainXml))
  const articles = draftArticles(draftBlocks)
  const amending = articles.filter((a) => a.amends)
  if (amending.length === 0) return blank('keine Promulgationsklausel — Stammgesetz oder unlesbar')

  // The PDF parse is held under its own name because it answers one thing the
  // table parse cannot: how many pages it refused for want of provable page
  // geometry. `'droppedPages' in parsed` would not narrow a union whose other
  // member simply lacks the field — the property comes out `unknown` — and
  // which parser ran is known here anyway.
  // Joined before the parse, not after: the law boundaries are resolved
  // against the draft's whole Artikel list, so half an annex is refused for
  // skipping a law it never claimed to carry. Joined only where the parts are
  // set alike, because joined pages are measured as one document — the same
  // two rules the request path applies (`annex/annexPdfService.ts`).
  // The parts as the request path reads them (`parseAnnexParts`): a part
  // pdf.js cannot open is null, and one the annex cannot do without refuses
  // the whole annex — counted, never skipped (19.11.2026).
  const pageBytes = async (url: string) =>
    pagesOf(new Uint8Array(await (await fetch(url, { headers: { 'User-Agent': scriptUserAgent(SCRIPT) } })).arrayBuffer())).catch(() => null)
  const pdfParts = readable ? [] : await Promise.all(parts.map((p) => urlOf(p, 'Pdf')).filter((u): u is string => u !== null).map(pageBytes))
  const fromPdf = readable ? null : parseAnnexParts(pdfParts, articles)
  if (!readable && fromPdf === null) return blank('PDF ohne lesbaren Text')
  if (fromPdf?.unreadable && fromPdf.rows.length === 0) return blank(`unlesbar: ${fromPdf.unreadable.slice(0, 60)}`)
  const rest = readable ? await Promise.all(parts.slice(1).map((p) => (urlOf(p, 'Xml') ? getText(urlOf(p, 'Xml')!) : null))) : []
  // The table path's further parts, as `readRis` reads them: one without a
  // table refuses the annex.
  if (rest.some((x) => x === null || isScanned(x))) return blank('unlesbar: ein Teil der Beilage liegt nicht als Tabelle vor')
  const restXml = rest.filter((x): x is string => x !== null)
  const parsed: ComparisonParse = fromPdf ?? parseTextComparison([annexXmlText!, ...restXml], articles)
  const droppedPages = fromPdf?.droppedPages ?? 0
  if (parsed.refusal) {
    // The request path runs the gate over a refused package all the same;
    // the figures above leave it out, the row dump does not.
    if (rowsPath) dumpRows(id, cite, parsed, await runGate(parsed.rows, { articles, asOf: beginn, blocks: draftBlocks }, await lesefassungOf(id, draftBlocks, beginn, parsed.rows, urlOf(main, 'Pdf'))))
    return { ...blank(`verweigert: ${parsed.refusal.slice(0, 52)}`, amending.length), droppedPages }
  }

  // One RIS lookup per law of the package, not per row. A law whose Stammnorm
  // is not a BGBl at all (the UGB is "dRGBl. S. 219/1897") has nothing to
  // resolve — its rows are set aside, not scored against a wrong law.
  const byKey = new Map<string | null, DraftArticle>(articles.map((a) => [a.key, a]))
  const resolved = new Map<string | null, KonsLawAtDate | null>()
  const lawOf = async (key: string | null): Promise<KonsLawAtDate | null> => {
    if (resolved.has(key)) return resolved.get(key)!
    const article = key === null ? (amending.length === 1 ? amending[0]! : null) : byKey.get(key)
    // The Artikel's own title is what tells the Bankwesengesetz from the
    // Bausparkassengesetz when both were promulgated by BGBl. Nr. 532/1993.
    // Asked as the gate asks it, and a failure throws: the draft is then not
    // reached, never a draft whose law RIS does not know.
    const law = article?.bgbl ? await gateSources.resolveLaw(article.bgbl.organ, article.bgbl.nummer, beginn, article.title ?? '', article.clause) : null
    resolved.set(key, law)
    return law
  }

  let checked = 0
  let clean = 0
  const worst: string[] = []
  const ratios: number[] = []
  const points: { n: number; ratio: number }[] = []
  let substantial = 0
  let substantialClean = 0
  let tooShort = 0
  let attributed = 0
  let unattributed = 0
  let noLaw = 0
  let unresolvedLaw = 0
  let unrepresentable = 0
  // The PDF path emits one row per §; the XML path emits one per Absatz, two
  // thirds of which open no § of their own and inherit it through `para`.
  // Scoring those rows individually measured the Rundschreiben's line breaks
  // — every § is judged on all of its displayed changes at once.
  const groups = new Map<string, { gld: string; law: string | null; rows: ComparisonRow[] }>()
  for (const row of parsed.rows) {
    if (row.kind !== 'pair') continue
    const gld = row.gld ?? row.para
    if (!gld) continue
    const key = `${row.law ?? ''}#${gld}`
    const group = groups.get(key) ?? { gld, law: row.law, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    const row = { gld: group.gld, law: group.law, current: displayedChangeRows(group.rows).map((r) => r.current).join(' ') }
    if (!row.current) continue
    // Exact designation match, the rule the service uses (`designationKey`):
    // the prefix regex this line used to build matched "§ 5a" for id "5", so
    // whichever label RIS returned first decided which text a § was scored
    // against — and the harness taught the service that mistake.
    const key = designationKey(row.gld)
    if (!key) continue
    const law = await lawOf(row.law)
    if (!law) {
      unattributed++
      if (row.law === null) noLaw++
      else unresolvedLaw++
      continue
    }
    attributed++
    // RIS prints an Anlage as "Anl. 1", never as "§ 1", an article-structured
    // law's § as "Art. 3 § 5", and a split schedule as "Anl. 1/59" —
    // `designationKey` reads all of those and compares them exactly.
    const entry = Object.entries(law.paragraphs).find(([label]) => designationKey(label) === key)
    if (!entry) continue
    const tree = await fetchParagraphTree(entry[1])
    // A § that contains a table is deliberately not represented as a tree
    // (`lawtext/konsTree.ts`): its cells would read as Absätze in document order.
    // That is the right answer for the engine and it makes the row
    // incomparable here — counted, so the denominator stays honest, rather
    // than dropped silently.
    if (!tree) {
      unrepresentable++
      continue
    }
    checked++
    // The headings above the § belong to a group of §§ and are deliberately
    // out of `plainText`; the annex prints them over the § all the same.
    const { ratio, missing, comparable, prose } = coverageOf(row.current, [...tree.context, plainText(tree)].join(' '))
    if (comparable === 0) continue
    ratios.push(ratio)
    points.push({ n: comparable, ratio })
    if (prose) {
      substantial++
      if (ratio >= 0.99) substantialClean++
    } else tooShort++
    if (ratio >= 0.99) clean++
    else worst.push(`${row.gld} ${(ratio * 100).toFixed(0)} % (fehlt: ${missing.slice(0, 6).join(' ')})`)
    if (dumpWorst && ratio < 0.5) {
      console.log(`\n    ### ${cite} ${row.gld} — ${(ratio * 100).toFixed(0)} % gedeckt`)
      console.log(`      LAW   : ${row.law ?? '—'}`)
      console.log(`      SPALTE: ${row.current.slice(0, 230)}`)
      console.log(`      RIS   : ${plainText(tree).slice(0, 230)}`)
    }
  }
  // What the left check never looks at, in a pass of its own.
  //
  // Separate on purpose rather than folded into the loop above: that loop
  // leaves a § with no displayed change before it ever reaches RIS
  // (`if (!row.current) continue`), and those §§ are exactly where the PDF
  // path's unchanged rows sit — but counting them there would move
  // `attributed`, `checked` and `unrepresentable`, whose published numbers say
  // something else. Nothing here decides anything; the verdicts below still
  // come from `verifyAnnex`.
  const gate = await runGate(parsed.rows, { articles, asOf: beginn, blocks: draftBlocks }, await lesefassungOf(id, draftBlocks, beginn, parsed.rows, urlOf(main, 'Pdf')))
  if (rowsPath) dumpRows(id, cite, parsed, gate)
  let unchangedRows = 0
  let unchangedParas = 0
  let unchangedProse = 0
  let unchangedBelow = 0
  let unchangedBelowVerified = 0
  for (const group of groups.values()) {
    // Elided rows are the annex saying it left text out; a row with no text at
    // all is a layout artefact. Neither carries a claim about the standing law.
    const unchanged = group.rows.filter((r) => r.kind === 'pair' && !r.elided && r.change === 'unchanged' && r.current !== '')
    if (unchanged.length === 0) continue
    unchangedRows += unchanged.length
    unchangedParas++
    const key = designationKey(group.gld)
    if (!key) continue
    const law = await lawOf(group.law)
    if (!law) continue
    const entry = Object.entries(law.paragraphs).find(([label]) => designationKey(label) === key)
    if (!entry) continue
    const tree = await fetchParagraphTree(entry[1])
    if (!tree) continue
    // Per § and not per row, for the same reason the left check is: the annex
    // splits one provision over as many rows as its layout needs.
    const cover = coverageOf(unchanged.map((r) => r.current).join(' '), [...tree.context, plainText(tree)].join(' '))
    if (!cover.prose) continue
    unchangedProse++
    if (cover.ratio >= 0.95) continue
    unchangedBelow++
    if (gate.verdicts[annexParagraphKey(group.law, group.gld)] === 'verified') unchangedBelowVerified++
  }
  // The same index the gate builds, for the coverage line only — the verdicts
  // below come from `verifyAnnex` itself, so nothing here decides anything.
  const bags = draftBags(draftBlocks)
  let parasWithOwnBag = 0
  let parasWithoutOwnBag = 0
  for (const group of groups.values()) {
    const key = designationKey(group.gld)
    if (key === null) continue
    if (bags.byLaw.get(group.law)?.get(key) === undefined) parasWithoutOwnBag++
    else parasWithOwnBag++
  }
  // Every line of the annex against the rows (`lineAccounting`): what no other figure here can see.
  const lost = fromPdf ? lineAccounting(pdfParts.filter((p): p is AnnexPage[] => p !== null), parsed.rows) : { lost: 0, differing: [], apart: 0 }
  if (dumpLost) for (const l of lost.differing) console.log(`    ~ ${cite} S. ${l.page} ${l.side}: ${l.text.slice(0, 140)}`)
  return { id, cite, source: readable ? 'xml' : 'pdf', checked, clean, note: null, worst, ratios, points, substantial, substantialClean, tooShort, laws: amending.length, attributed, unattributed, noLaw, unresolvedLaw, unrepresentable, droppedPages, lostLines: lost.lost, lostDiffering: lost.differing.length, lostApart: lost.apart, frontMatterLaws: fromPdf?.frontMatterDiffers?.length ?? 0, units: bags.units, addressedUnits: bags.addressed, rightlyWithoutParagraph: bags.rightlyWithoutParagraph, parasWithOwnBag, parasWithoutOwnBag, unchangedRows, unchangedParas, unchangedProse, unchangedBelow, unchangedBelowVerified, gate }
}

/**
 * The shipped gate over the same annex, and its promises checked.
 *
 * The loop above measures *coverage*; this measures the **decision**, by
 * calling the two functions the request path calls. It exists because the
 * decision was the part nobody was measuring: the service labelled a row
 * `verified` unless the check had explicitly named it, so a check that never
 * ran, and every row without a § designation, went out vouched for. A number
 * for the ratio distribution says nothing about that.
 *
 * The four invariants are the gate's whole claim, and each of them has to
 * stay at zero over the corpus:
 *
 *  - no displayed change is labelled `verified` unless its § was judged and
 *    passed;
 *  - no § the annex names is missing from the verdict map;
 *  - no withheld row still carries text;
 *  - no withheld § without a recorded cause — otherwise the split the page
 *    prints would not sum to the total beside it (2026-09-10).
 */
/**
 * Our Lesefassung of the draft, run as the page runs it (`kons/konsService.ts`):
 * `consolidate` over the page's own sources — the cached § resolution and §
 * documents, the draft's PDF for the second witness — with the annex rows
 * this run parsed, which is the document the page's source choice reads.
 * Once per draft. Timed, for what the annex section now waits for (`lesefassungMs`).
 */
const lesefassungMs: { id: string; ms: number; touched: number }[] = []
async function lesefassungOf(id: string, blocks: readonly TextBlock[], asOf: string, rows: readonly ComparisonRow[], draftPdf: string | null): Promise<ConsolidatedTextResponse> {
  const t0 = performance.now()
  const out = await consolidate({ gp, inr: null, risId: id }, blocks, asOf, {
    resolveLaw: resolveKonsLaw,
    paragraphXml: (ref) => fetchParagraphXml(ref.nor, ref.xmlUrl!),
    annexRows: async () => rows,
    draftRendition: () => draftRenditionOf(draftPdf),
  })
  lesefassungMs.push({ id, ms: performance.now() - t0, touched: out.touched })
  return out
}

/** The draft check's state as the table reads it (`markOf`): its four outcomes and the held § with no new word apart. */
type StrictCell = 'holds' | 'holds-empty' | 'differs' | 'unchecked' | 'no-new-text'
const strictCellOf = (state: string | undefined, newWords: number, showsNewText: boolean): StrictCell =>
  !showsNewText ? 'no-new-text' : state === 'holds' ? (newWords > 0 ? 'holds' : 'holds-empty') : state === 'differs' ? 'differs' : 'unchecked'

/** One shown § as the table saw it (`--zeilen`, and the record's tables). */
interface MarkedParagraph {
  key: string
  /** 'verified' | 'unmarked' (unchecked, nothing owed or no change shown) | 'marked' (the gate's „nicht geprüft") */
  population: 'verified' | 'unmarked' | 'marked'
  gateReason: string | null
  showsChange: boolean
  strict: StrictCell
  strictReason: string | null
  notInDraft: string[]
  notShown: string[]
  /** Struck words no instruction strikes, and the struck words by what accounts for them (`struckAccount`). */
  struckNotInDraft: string[]
  struck: StruckBy | null
  oracle: boolean | null
  mark: AnnexMark
  /** The same § under each value of `OBJECTION_OVER_CONFIRMATION`. */
  markBy: Record<ObjectionRule, AnnexMark>
}

async function runGate(rows: readonly ComparisonRow[], draft: AnnexDraft, lesefassung: ConsolidatedTextResponse): Promise<GateResult> {
  const check = await verifyAnnex(rows, draft, gateSources, ceiling === null ? {} : { maxParagraphs: ceiling })
  const strict = annexStrictChecks(rows, draft)
  const confirmed = oracleConfirmedRows(rows, lesefassung)
  const marks = annexMarks(rows, check, strict, confirmed)
  const by = { clean: annexMarks(rows, check, strict, confirmed, 'clean'), unconfirmed: annexMarks(rows, check, strict, confirmed, 'unconfirmed'), missing: annexMarks(rows, check, strict, confirmed, 'missing') }
  const paragraphs: MarkedParagraph[] = []
  {
    const groups = new Map<string, ComparisonRow[]>()
    for (const row of rows) {
      const para = row.kind === 'pair' ? (row.gld ?? row.para) : null
      if (para !== null) groups.set(annexParagraphKey(row.law, para), [...(groups.get(annexParagraphKey(row.law, para)) ?? []), row])
    }
    for (const [key, group] of groups) {
      const verdict = check.verdicts[key] ?? 'unchecked'
      if (verdict === 'withheld') continue
      const reason = check.uncheckedReasons[key] ?? null
      const showsNewText = insertedStretches(group).length > 0
      const showsChange = showsNewText || group.some(isDisplayedChange)
      const s = strict.get(key)
      const printed = group.filter((r) => !r.elided)
      paragraphs.push({
        key,
        population: verdict === 'verified' ? 'verified' : reason !== REASON_NOTHING_TO_COMPARE && showsChange ? 'marked' : 'unmarked',
        gateReason: verdict === 'unchecked' ? reason : null,
        showsChange,
        strict: strictCellOf(s?.state, s?.newWords ?? 0, showsNewText),
        strictReason: s?.reason ?? null,
        notInDraft: s?.notInDraft ?? [],
        notShown: s?.notShown ?? [],
        struckNotInDraft: s?.struckNotInDraft ?? [],
        struck: s?.struck ?? null,
        oracle: confirmed === null ? null : printed.length > 0 && printed.every((r) => confirmed.has(r)),
        mark: marks.get(key)!,
        markBy: { clean: by.clean.get(key)!, unconfirmed: by.unconfirmed.get(key)!, missing: by.missing.get(key)! },
      })
    }
  }
  const checked = checkAnnexRows(rows, check)
  // The rows as the page gets them, the table's marks applied (`readAndCheck`); the gate's figures below stay the gate's.
  const page = checkAnnexRows(rows, check, marks)
  const markRecord = noMarks()
  for (const q of paragraphs) {
    markRecord.shownParas++
    if (q.mark.kind === 'unconfirmed') markRecord.unconfirmedParas++
    for (const rule of ['clean', 'unconfirmed', 'missing'] as const) if (q.markBy[rule].kind === 'unconfirmed') markRecord.unconfirmedParasBy[rule]++
    if (q.mark.kind === 'unchecked') markRecord.markedWord[MARK_REASON_KEY[q.mark.reason]!]++
    if (q.mark.kind === 'unconfirmed' && q.struckNotInDraft.length && !q.notInDraft.length && !q.notShown.length) markRecord.struckUnconfirmed++
    if (q.mark.kind === 'gate' && q.population !== 'marked' && q.showsChange && !q.oracle && (q.strict === 'no-new-text' || q.strict === 'holds-empty')) markRecord.deletionsCleared++
    if (q.population === 'marked') {
      if (q.oracle) markRecord.gateMarkedConfirmed++
      continue
    }
    markRecord.table[q.oracle === null ? 'noLesefassung' : q.oracle ? 'confirmed' : 'notConfirmed'][q.strict]++
  }

  let rowsNoPara = 0
  let changeRowsNoPara = 0
  let verdictless = 0
  let wronglyVerified = 0
  for (const row of rows) {
    if (row.kind !== 'pair') continue
    const para = row.gld ?? row.para
    if (para === null) {
      rowsNoPara++
      if (isDisplayedChange(row)) changeRowsNoPara++
      continue
    }
    if (check.verdicts[annexParagraphKey(row.law, para)] === undefined) verdictless++
  }
  for (const [i, row] of checked.rows.entries()) {
    if (row.check !== 'verified') continue
    const para = row.gld ?? row.para
    const verdict = para === null ? undefined : check.verdicts[annexParagraphKey(row.law, para)]
    if (verdict !== 'verified') {
      wronglyVerified++
      if (dumpWorst) console.log(`    !!! Zeile ${i} als geprüft ausgeliefert, Urteil ${verdict ?? 'keines'}`)
    }
  }
  const verdicts = Object.values(check.verdicts)
  return {
    ran: check.ran,
    notRunReason: notRunReason(check),
    judged: check.judged,
    verifiedParas: verdicts.filter((v) => v === 'verified').length,
    withheldParas: verdicts.filter((v) => v === 'withheld').length,
    withheldStanding: checked.withheldByCause.standing,
    withheldAlreadyStanding: checked.withheldByCause.alreadyStanding,
    withheldNotInDraft: checked.withheldByCause.notInDraft,
    withheldRepealUnproven: checked.withheldByCause.repealUnproven,
    withheldRepeated: checked.withheldByCause.repeated,
    uncheckedParas: verdicts.filter((v) => v === 'unchecked').length,
    markedParas: checked.uncheckedParagraphs + checked.rowsWithoutParagraph,
    rowsNoPara,
    changeRowsNoPara,
    verdictless,
    wronglyVerified,
    withheldWithText: checked.rows.filter((r) => r.check === 'withheld' && (r.current !== '' || r.proposed !== '' || r.segments !== null)).length,
    withheldWithoutCause: Object.entries(check.verdicts).filter(([key, v]) => v === 'withheld' && check.withheldCauses[key] === undefined).length,
    verdicts: check.verdicts,
    rows: rowsPath ? page.rows : [],
    paragraphs,
    marks: markRecord,
  }
}

// --- CLI ----------------------------------------------------------------------
const gp = argAssigned('gp') ?? 'XXVIII'
const limit = Number(argAssigned('limit') ?? 400)
const only = argAssigned('only') ?? null
/**
 * `--obergrenze=` raises `MAX_PARAGRAPHS` for one run.
 *
 * The production ceiling exists so that one monster Sammelgesetz cannot hang
 * a request, and what it costs in coverage is only knowable by lifting it —
 * so the knob lives here and nowhere else (26.09.2026).
 */
const ceilingArg = argAssigned('obergrenze')
const ceiling = ceilingArg === null ? null : Number(ceilingArg)
const dumpWorst = argFlag('dump-worst')
const rowsPath = argAssigned('zeilen') ?? null
/** `--verloren`: list every column line that reaches no row and differs from the other column (`lineAccounting`). */
const dumpLost = argFlag('verloren')
const xmlMode = argFlag('xml')
/**
 * `--nur-inhalt` scores only the drafts whose annex was picked by content
 * (`annex/olderAnnex.ts`) — and, since 02.10.2026, the bundles read through
 * their cut (`annexSection`). The older names stand in GP XXIV to XXVII, the
 * bundles that print the header pair between 2004 and 2013; the default
 * window of the 400 newest records reaches neither, so it goes with a
 * `--limit=` over the whole corpus (4.600, 30.09.2026).
 */
const onlyByContent = argFlag('nur-inhalt')
const calibrate = argFlag('calibrate')

// RIS **ignores** `Begut.Gesetzgebungsperiode` — it answers with the whole
// Begut corpus, newest first, so `--gp` narrows the label and not the window
// (measured 23.09.2026, `lib/annexReport.ts`). `--limit` is what bounds a run.
const docs: any[] = []
// As many pages as `--limit` asks for. The loop stopped at page 4 whatever the
// limit said, so `--limit=1000` measured the same 400 records.
for (let page = 1; page <= Math.ceil(limit / 100) && docs.length < limit; page++) {
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
// The first line of the run: which drafts it measures, and from which list.
const listWindow = windowOf(docs.slice(0, limit), cache.served)
console.log(`GP ${gp}: ${docs.length} Entwürfe aus dem RIS — ${windowLine(listWindow)}\n`)

const results: DraftResult[] = []
/** The drafts of the list the run looked at, and those whose reading threw, with why — the record's reach. */
let requested = 0
const unreached: { id: string; cause: string }[] = []
for (const doc of docs.slice(0, limit)) {
  const label = `${doc?.Data?.Metadaten?.Bundesrecht?.Begut?.Begutachtungsverfahrennummer ?? ''} ${doc?.Data?.Metadaten?.Bundesrecht?.Kurztitel ?? ''} ${doc?.Data?.Metadaten?.Bundesrecht?.Titel ?? ''}`
  if (only && !label.toLowerCase().includes(only.toLowerCase())) continue
  requested++
  try {
    const r = await verify(doc)
    if (!r) continue
    results.push(r)
    // A dropped page is named on the draft's own line, not only in the total:
    // it is a hole in *this* annex, and a sum over the corpus cannot say which
    // document is missing a page.
    const dropped = (r.droppedPages > 0 ? ` [${r.droppedPages} Seite${r.droppedPages === 1 ? '' : 'n'} ungelesen]` : '') + (r.lostDiffering > 0 ? ` [${r.lostDiffering} Zeile${r.lostDiffering === 1 ? '' : 'n'} ohne Zeile, abweichend]` : '') + (r.frontMatterLaws > 0 ? ` [Vorspann abweichend, gesagt: ${r.frontMatterLaws}]` : '')
    if (r.note) console.log(`  ·  ${r.cite.padEnd(9)} ${r.note}${dropped}`)
    else console.log(`  ${r.clean === r.checked ? '✓' : '✗'}  ${r.cite.padEnd(9)} ${r.clean}/${r.checked} Paragraphen ≥99 % im RIS${dropped}${r.worst.length ? ` — ${r.worst.slice(0, 2).join('; ')}` : ''}`)
  } catch (err) {
    console.log(`  ?  ${String(doc?.Data?.Metadaten?.Bundesrecht?.Kurztitel ?? '?').slice(0, 9).padEnd(9)} ${String(err).slice(0, 90)}`)
    unreached.push({ id: String(doc?.Data?.Metadaten?.Technisch?.ID ?? label.trim()), cause: String(err).slice(0, 200) })
  }
}
// A draft whose reading threw is missing from every figure below; the count says so (20.11.2026: the
// lookups' failures were caught into „no law" and the draft scored as one without a law).
if (unreached.length > 0) console.log(`\n  ✗ ${unreached.length} von ${requested} Entwürfen nicht erreicht (oben mit „?")`)

const scored = results.filter((r) => r.note === null && r.checked > 0)
const checked = scored.reduce((n, r) => n + r.checked, 0)
const clean = scored.reduce((n, r) => n + r.clean, 0)
console.log(`\n${'='.repeat(74)}`)
console.log(xmlMode ? 'Lesbare XML-Beilagen (der ausgelieferte Pfad), gegen den geltenden Text im RIS' : 'Gerasterte Beilagen mit PDF-Textebene, gegen den geltenden Text im RIS')
console.log(`  auswertbare Entwürfe   : ${scored.length} von ${results.length} mit ${xmlMode ? 'lesbarer' : 'gerasterter'} Beilage`)
console.log(`  geprüfte Paragraphen   : ${checked}`)
console.log(`  ≥99 % im RIS gedeckt   : ${clean} (${checked ? ((clean / checked) * 100).toFixed(1) : '—'} %)`)
const sub = scored.reduce((n, r) => n + r.substantial, 0)
const subClean = scored.reduce((n, r) => n + r.substantialClean, 0)
console.log(`  davon mit echtem Fließtext (≥ ${MIN_PROSE_TOKENS} Wörter): ${sub}`)
console.log(`    ≥99 % gedeckt        : ${subClean} (${sub ? ((subClean / sub) * 100).toFixed(1) : '—'} %)`)
console.log(`  zu kurz zum Prüfen (Überschrift/Auslassung): ${scored.reduce((n, r) => n + r.tooShort, 0)}`)
const packages = results.filter((r) => r.laws > 1)
console.log(`  Sammelgesetze              : ${packages.length} (${packages.reduce((n, r) => n + r.laws, 0)} Gesetze), abgegrenzt: ${packages.filter((r) => r.note === null).length}`)
console.log(`  Zeilen ohne Gesetzeszuordnung: ${scored.reduce((n, r) => n + r.unattributed, 0)} von ${scored.reduce((n, r) => n + r.attributed + r.unattributed, 0)}`)
console.log(`    außerhalb jeder Artikelgrenze: ${scored.reduce((n, r) => n + r.noLaw, 0)}`)
console.log(`    Stammnorm im RIS nicht auflösbar: ${scored.reduce((n, r) => n + r.unresolvedLaw, 0)}`)
console.log(`  RIS-Paragraph ist eine Tabelle (nicht darstellbar, verweigert): ${scored.reduce((n, r) => n + r.unrepresentable, 0)}`)
// Summed over every draft with a parse, refusals included: a document whose
// laws could not be told apart can still have had a page refused, and both
// are losses the reader is owed.
const droppedTotal = results.reduce((n, r) => n + r.droppedPages, 0)
console.log(`  Seiten ohne belegte Seitengeometrie (nicht gelesen): ${droppedTotal}${droppedTotal > 0 ? ` in ${results.filter((r) => r.droppedPages > 0).length} Beilagen` : ''}`)
// What no other line here measures: text of the annex that reaches no row (`lineAccounting`).
if (!xmlMode) {
  const lostAll = results.reduce((n, r) => n + r.lostLines, 0)
  const lostDiff = results.reduce((n, r) => n + r.lostDiffering, 0)
  console.log(`  Spaltenzeilen, die keine Zeile erreichen: ${lostAll}; davon von der anderen Spalte verschieden: ${lostDiff} in ${results.filter((r) => r.lostDiffering > 0).length} Beilagen (--verloren listet sie)`)
  console.log(`    in Teilen, die für sich gelesen werden (andere Seitengröße): ${results.reduce((n, r) => n + r.lostApart, 0)} in ${results.filter((r) => r.lostApart > 0).length} Beilagen`)
  console.log(`  Gesetze, deren Vorspann (Text vor dem ersten Paragraphen) zwischen den Spalten abweicht — die Seite sagt es: ${results.reduce((n, r) => n + r.frontMatterLaws, 0)} in ${results.filter((r) => r.frontMatterLaws > 0).length} Beilagen`)
}

// The gate as it ships, over every draft with a readable annex — including
// the ones the coverage loop scores as zero, because "nothing was checked" is
// exactly the state that used to leave the server labelled "geprüft".
const gated = results.filter((r) => r.note === null)
const gsum = (pick: (g: GateResult) => number) => gated.reduce((n, r) => n + pick(r.gate), 0)
console.log(`\n  Das Tor, wie es ausgeliefert wird (${gated.length} Entwürfe)`)
console.log(`    Paragraphen bestätigt / einbehalten / ungeprüft: ${gsum((g) => g.verifiedParas)} / ${gsum((g) => g.withheldParas)} / ${gsum((g) => g.uncheckedParas)}`)
console.log(`    davon auf der Seite mit „nicht geprüft“ markiert (samt Zeilen ohne Paragraph): ${gsum((g) => g.markedParas)}`)
// Which of the three checks refused a §. The two right-column rules are new
// on 2026-09-10; before them the first line was the whole story.
console.log(`    einbehalten, weil die geltende Fassung so nicht im RIS steht : ${gsum((g) => g.withheldStanding)}`)
console.log(`    einbehalten, weil die vorgeschlagene Fassung Geltendes als neu zeigt: ${gsum((g) => g.withheldAlreadyStanding)}`)
console.log(`    einbehalten, weil sie Text trägt, den der Entwurf für diesen Paragraphen nicht anordnet: ${gsum((g) => g.withheldNotInDraft)}`)
console.log(`    einbehalten, weil sie den Paragraphen als aufgehoben zeigt und der Entwurf ihn nicht aufhebt: ${gsum((g) => g.withheldRepealUnproven)}`)
console.log(`    einbehalten, weil eine Spalte den Paragraphen mehrmals druckt und die Stellen sich nicht zuordnen lassen: ${gsum((g) => g.withheldRepeated)}`)
console.log(`    Entwürfe ohne jede Prüfung   : ${gated.filter((r) => !r.gate.ran).length}`)
console.log(`    Zeilen ohne Paragraphenangabe: ${gsum((g) => g.rowsNoPara)}, davon als Änderung gezeigt: ${gsum((g) => g.changeRowsNoPara)}`)
const dsum = (pick: (r: DraftResult) => number): number => gated.reduce((n, r) => n + pick(r), 0)
const units = dsum((r) => r.units)
const addressed = dsum((r) => r.addressedUnits)
const rightly = dsum((r) => r.rightlyWithoutParagraph)
console.log(`    Adressierung der Anordnungen: ${addressed} von ${units} nennen einen Paragraphen${units ? ` (${((addressed / units) * 100).toFixed(1)} %)` : ''}; Paragraphen der Beilage mit eigenem Sack ${dsum((r) => r.parasWithOwnBag)}, ohne ${dsum((r) => r.parasWithoutOwnBag)}`)
// A residual that lumps the two together reads as a bigger gap than it is: an
// Inhaltsverzeichnis, a Titel and an Abschnitt heading have no § to name and
// belong in the general bag whatever the grammar learns.
console.log(`      davon ohne Paragraph zu Recht (Inhaltsverzeichnis, Titel, Abschnitt, ganzer Text): ${rightly}; ungelesen: ${units - addressed - rightly}`)
// What the left check never looks at. Measured and left out
// (11.09.2026), so the numbers have to stand where the decision can be
// re-checked: `unchangedBelow` is what a rule over these rows would withhold,
// and the second number what it would cost — a § the gate confirms today loses
// its whole word diff, not just the unchanged line.
console.log(`    Unveränderte Zeilen, nie gegen das RIS gehalten: ${dsum((r) => r.unchangedRows)} in ${dsum((r) => r.unchangedParas)} Paragraphen`)
console.log(`      davon Paragraphen mit ≥ ${MIN_PROSE_TOKENS} vergleichbaren Wörtern: ${dsum((r) => r.unchangedProse)}, unter der Schwelle: ${dsum((r) => r.unchangedBelow)} (davon heute bestätigt: ${dsum((r) => r.unchangedBelowVerified)})`)
// The table on top of the gate (`annexMark.ts`, 21.11.2026): what the page marks beyond the gate's „nicht geprüft".
{
  const msum = (pick: (m: MarkRecord) => number) => gated.reduce((n, r) => n + pick(r.gate.marks), 0)
  const shown = msum((m) => m.shownParas)
  const word = msum((m) => Object.values(m.markedWord).reduce((a, b) => a + b, 0))
  const gateMarked = gsum((g) => g.markedParas)
  const pct = (n: number) => (shown ? `${((n / shown) * 100).toFixed(1)} %` : '—')
  console.log(`    Wort für Wort (die Tabelle über dem Tor): gezeigte Paragraphen ${shown}`)
  console.log(`      „nicht bestätigt“: ${msum((m) => m.unconfirmedParas)} (je Wert der Regel: fehlender Wortlaut zählt ${msum((m) => m.unconfirmedParasBy.missing)}, die Lesefassung gilt immer ${msum((m) => m.unconfirmedParasBy.clean)}, der Einwand gilt immer ${msum((m) => m.unconfirmedParasBy.unconfirmed)})`)
  console.log(`      „nicht geprüft“ aus der Tabelle: ${word} — nur Streichungen ${msum((m) => m.markedWord.deletions)}, keiner Anordnung zugeordnet ${msum((m) => m.markedWord.unassigned)}, Anordnung nicht lesbar ${msum((m) => m.markedWord.wording)}, zu lang ${msum((m) => m.markedWord.long)}, Entwurf ungelesen ${msum((m) => m.markedWord.draftUnread)}`)
  console.log(`      markiert insgesamt (Tor + Tabelle): ${gateMarked + word + msum((m) => m.unconfirmedParas)} (${pct(gateMarked + word + msum((m) => m.unconfirmedParas))}); je Wert ${(['missing', 'clean', 'unconfirmed'] as const).map((rule) => gateMarked + word + msum((m) => m.unconfirmedParasBy[rule])).join(' / ')}`)
  console.log(`      vom Tor markiert und von der Lesefassung bestätigt (bleibt markiert): ${msum((m) => m.gateMarkedConfirmed)}`)
  console.log(`      gestrichener Text: „nicht bestätigt“ allein wegen Gestrichenem ${msum((m) => m.struckUnconfirmed)}; nur Streichungen, ohne die Lesefassung bestätigt ${msum((m) => m.deletionsCleared)}`)
  const cells: StrictCell[] = ['holds', 'holds-empty', 'differs', 'unchecked', 'no-new-text']
  console.log(`      Lesefassung \\ Entwurfsprüfung   ${cells.map((c) => c.padStart(12)).join('')}`)
  for (const [key, label] of [['confirmed', 'bestätigt'], ['notConfirmed', 'nicht bestätigt'], ['noLesefassung', 'keine Lesefassung']] as const) {
    console.log(`        ${label.padEnd(26)}${cells.map((c) => String(msum((m) => m.table[key][c])).padStart(12)).join('')}`)
  }
}
console.log(`    Zusicherungen (müssen 0 sein): ohne Urteil ${gsum((g) => g.verdictless)}, zu Unrecht geprüft ${gsum((g) => g.wronglyVerified)}, einbehalten mit Text ${gsum((g) => g.withheldWithText)}, einbehalten ohne Grund ${gsum((g) => g.withheldWithoutCause)}`)
for (const [reason, n] of [...gated.filter((r) => !r.gate.ran).reduce((m, r) => m.set(r.gate.notRunReason ?? '—', (m.get(r.gate.notRunReason ?? '—') ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])) {
  console.log(`      ${String(n).padStart(3)}× ${reason}`)
}

const all = scored.flatMap((r) => r.ratios).sort((a, b) => a - b)
if (all.length) {
  const q = (p: number) => all[Math.min(all.length - 1, Math.floor(all.length * p))]!
  console.log(`  Deckungsgrad je Paragraph: Median ${(q(0.5) * 100).toFixed(0)} %, p25 ${(q(0.25) * 100).toFixed(0)} %, p10 ${(q(0.1) * 100).toFixed(0)} %`)
  const buckets = [0.5, 0.8, 0.9, 0.95, 0.99, 1.01]
  let low = 0
  for (const b of buckets) {
    const n = all.filter((r) => r >= low && r < b).length
    console.log(`    ${(low * 100).toFixed(0).padStart(3)}–${(Math.min(b, 1) * 100).toFixed(0).padStart(3)} % : ${String(n).padStart(4)}`)
    low = b
  }
}
for (const [note, n] of [...results.filter((r) => r.note).reduce((m, r) => m.set(r.note!.replace(/\(\d+ Gesetze\)/, '(N Gesetze)').replace(/BGBl\.[^ ]* \d+\/\d+/, 'BGBl. …'), (m.get(r.note!.replace(/\(\d+ Gesetze\)/, '(N Gesetze)').replace(/BGBl\.[^ ]* \d+\/\d+/, 'BGBl. …')) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])) {
  console.log(`  ·  ${String(n).padStart(3)}× ${note}`)
}

// Why `MIN_PROSE_TOKENS` is where it is. A § whose displayed changes carry
// almost no comparable words says nothing about the parse — but "almost no"
// has to be a measured number, not a guess, because every § below the floor
// is one the gate waves through unexamined.
if (calibrate) {
  const points = scored.flatMap((r) => r.points)
  console.log(`\nDeckung nach Umfang (${points.length} Paragraphen mit vergleichbaren Wörtern)`)
  console.log('  Wörter      §§   <50 %   <80 %   <95 %   ≥95 %')
  for (const [lo, hi] of [[1, 4], [5, 7], [8, 11], [12, 14], [15, 29], [30, Number.MAX_SAFE_INTEGER]] as const) {
    const band = points.filter((p) => p.n >= lo && p.n <= hi)
    const below = (t: number) => String(band.filter((p) => p.ratio < t).length).padStart(7)
    const label = `${lo}-${hi === Number.MAX_SAFE_INTEGER ? '∞' : hi}`
    console.log(`  ${label.padEnd(8)} ${String(band.length).padStart(5)} ${below(0.5)} ${below(0.8)} ${below(0.95)} ${String(band.filter((p) => p.ratio >= 0.95).length).padStart(7)}`)
  }
}

// --- Report for the drift alarm -----------------------------------------------
// `--json=<path>` writes the same measurement as a record, in addition to the
// report above. In addition, not instead: the prose report is what stands in
// the CI log when the alarm fires and somebody wants to know why.
//
// The verdicts are not here but in `lib/annexReport.ts`: logic in a CLI
// script is logic no test reaches.
// All that happens here is the pouring over.
const jsonPath = argAssigned('json') ?? null
if (jsonPath) {
  const { writeFileSync } = await import('node:fs')
  const report: AnnexReport = {
    // When, on which code, and how much of the list it reached (`lib/harnessRecord.ts`).
    ...harnessStamp(),
    ...corpusReach(requested, unreached),
    gp,
    path: xmlMode ? 'xml' : 'pdf',
    limit,
    records: docs.length,
    window: listWindow,
    // `results`, not `gated` or `scored`: a draft whose annex was refused can
    // have lost pages all the same, and its assurances hold just as much. The
    // prose report's filters are there for percentages, not for assurances.
    drafts: results.map((r) => ({
      id: r.id,
      cite: r.cite,
      source: r.source,
      note: r.note,
      checked: r.checked,
      clean: r.clean,
      substantial: r.substantial,
      substantialClean: r.substantialClean,
      noLaw: r.noLaw,
      droppedPages: r.droppedPages,
      lostLines: r.lostLines,
      lostDiffering: r.lostDiffering,
      frontMatterLaws: r.frontMatterLaws,
      ran: r.gate.ran,
      notRunReason: r.gate.notRunReason,
      verifiedParas: r.gate.verifiedParas,
      withheldParas: r.gate.withheldParas,
      withheldStanding: r.gate.withheldStanding,
      withheldAlreadyStanding: r.gate.withheldAlreadyStanding,
      withheldNotInDraft: r.gate.withheldNotInDraft,
      withheldRepealUnproven: r.gate.withheldRepealUnproven,
      withheldRepeated: r.gate.withheldRepeated,
      uncheckedParas: r.gate.uncheckedParas,
      markedParas: r.gate.markedParas,
      shownParas: r.gate.marks.shownParas,
      unconfirmedParas: r.gate.marks.unconfirmedParas,
      unconfirmedParasBy: r.gate.marks.unconfirmedParasBy,
      markedWordParas: Object.values(r.gate.marks.markedWord).reduce((a, b) => a + b, 0),
      markedWord: r.gate.marks.markedWord,
      gateMarkedConfirmed: r.gate.marks.gateMarkedConfirmed,
      struckUnconfirmed: r.gate.marks.struckUnconfirmed,
      deletionsCleared: r.gate.marks.deletionsCleared,
      markTable: r.gate.marks.table,
      rowsNoPara: r.gate.rowsNoPara,
      changeRowsNoPara: r.gate.changeRowsNoPara,
      verdictless: r.gate.verdictless,
      wronglyVerified: r.gate.wronglyVerified,
      withheldWithText: r.gate.withheldWithText,
      withheldWithoutCause: r.gate.withheldWithoutCause,
    })),
  }
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`\nBericht geschrieben: ${jsonPath} (${report.drafts.length} Entwürfe)`)
}
{
  const slow = [...lesefassungMs].sort((a, b) => b.touched - a.touched).slice(0, 5)
  console.log(`\n  Lesefassung je Entwurf (consolidate, wie die Seite): ${lesefassungMs.length} Läufe, zusammen ${(lesefassungMs.reduce((n, l) => n + l.ms, 0) / 1000).toFixed(1)} s; die fünf mit den meisten Paragraphen: ${slow.map((l) => `${l.id} ${l.touched} §§ ${(l.ms / 1000).toFixed(2)} s`).join(', ')}`)
}
if (rowsPath) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(rowsPath, `${JSON.stringify(dumpedRows)}\n`)
  console.log(`Zeilen geschrieben: ${rowsPath} (${Object.keys(dumpedRows).length} Entwürfe)`)
}
