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
 * Usage:  npx vite-node scripts/annex-pdf-verify.ts --gp=XXVIII [--xml] [--limit=N] [--only=8]
 */
import { annexParagraphKey, designationKey } from '../server/utils/annex/annexText'
import { MIN_PROSE_TOKENS, coverageOf, displayedChangeRows, isDisplayedChange } from '../server/utils/annex/coverage'
import { checkAnnexRows, notRunReason } from '../server/utils/annex/gateRows'
import { draftBags } from '../server/utils/annex/rightColumn'
import {
  verifyAnnex,
  type AnnexDraft,
  type AnnexSources,
  type ParagraphVerdict,
} from '../server/utils/annex/verdict'
import { parseAnnexPdf } from '../server/utils/annexPdf'
import { pagesOf } from '../server/utils/annexPdfPages'
import { plainText } from '../server/utils/lawtext/konsTree'
import { parseRisXml } from '../server/utils/lawtext/risXml'
import { draftArticles, type DraftArticle } from '../server/utils/lawtext/draftArticles'
import { getText, resolveLawByBgbl, type KonsLawAtDate } from '../server/utils/ris/konsLaw'
import { fetchParagraphTree } from '../server/utils/harness/risKonsHistory'
import { parseTextComparison, type ComparisonParse, type ComparisonRow } from '../server/utils/annex/comparisonRows'
import { isScanned } from '../server/utils/annex/tableCells'
import { installFetchCache } from './harness-cache'
import type { AnnexReport } from './annex-report'

installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

const RIS = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'
const UA = { 'User-Agent': 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)', Accept: 'application/json' }

/* eslint-disable @typescript-eslint/no-explicit-any */
const asArray = <T>(x: T | T[] | null | undefined): T[] => (x === null || x === undefined ? [] : Array.isArray(x) ? x : [x])

async function risJson(params: Record<string, string>): Promise<any> {
  const res = await fetch(`${RIS}?${new URLSearchParams(params)}`, { headers: UA, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

/**
 * The standing law for the gate, uncached — the same two lookups the request
 * path injects through `annexGuardService.ts`, minus Nitro. That is what
 * `AnnexSources` is for: the verdict logic runs here exactly as it runs in a
 * request, so the corpus measures the shipped decision instead of a copy of
 * it that can drift.
 */
const gateSources: AnnexSources = {
  resolveLaw: (organ, nummer, date, title) => resolveLawByBgbl({ organ, nummer }, date, title || undefined),
  standingText: async (ref) => {
    const tree = await fetchParagraphTree(ref)
    if (!tree) return null
    return { text: [...tree.context, plainText(tree)].join(' '), heading: [...tree.context, tree.heading ?? ''].join(' ') }
  },
}

interface DraftResult {
  /**
   * Der RIS-Dokumentschlüssel. `cite` taugt als Schlüssel nicht: die meisten
   * Datensätze im Fenster sind Verordnungen ohne
   * Begutachtungsverfahrennummer und fallen auf den bei 34 Zeichen
   * abgeschnittenen Kurztitel zurück — „Verordnung des Bundesministers für"
   * steht am 16.09.2026 neunmal im Tabellenpfad. Die Grundlinie von Klasse B
   * braucht eine Identität, die hält.
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
   * (`annexCheck.isDisplayedChange`), and a decision nobody measures becomes an
   * assumption. The page shows their left text — folded behind „N Stellen
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
   * How far rule 2's reference reaches: instructions read, instructions that
   * addressed at least one §, and the annex's §§ split by whether the draft's
   * instructions name them (`annexCheck.draftBags`).
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
  uncheckedParas: number
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
}

async function verify(doc: any): Promise<DraftResult | null> {
  const meta = doc?.Data?.Metadaten
  const begut = meta?.Bundesrecht?.Begut
  const cite = String(begut?.Begutachtungsverfahrennummer ?? begut?.Verfahrensnummer ?? meta?.Bundesrecht?.Kurztitel ?? meta?.Technisch?.ID ?? '?').slice(0, 34)
  const id = String(meta?.Technisch?.ID ?? cite)
  const beginn: string | null = begut?.BeginnBegutachtungsfrist ?? null
  const noGate: GateResult = { ran: false, notRunReason: null, judged: 0, verifiedParas: 0, withheldParas: 0, withheldStanding: 0, withheldAlreadyStanding: 0, withheldNotInDraft: 0, uncheckedParas: 0, rowsNoPara: 0, changeRowsNoPara: 0, verdictless: 0, wronglyVerified: 0, withheldWithText: 0, withheldWithoutCause: 0, verdicts: {} }
  const blank = (note: string, laws = 0): DraftResult => ({ id, cite, source: 'pdf', checked: 0, clean: 0, note, worst: [], ratios: [], points: [], substantial: 0, substantialClean: 0, tooShort: 0, laws, attributed: 0, unattributed: 0, noLaw: 0, unresolvedLaw: 0, unrepresentable: 0, unchangedRows: 0, unchangedParas: 0, unchangedProse: 0, unchangedBelow: 0, unchangedBelowVerified: 0, droppedPages: 0, units: 0, addressedUnits: 0, rightlyWithoutParagraph: 0, parasWithOwnBag: 0, parasWithoutOwnBag: 0, gate: noGate })
  if (!beginn) return blank('kein Beginn der Begutachtungsfrist')

  const contents = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
  const main = contents.find((c) => c?.ContentType === 'MainDocument')
  const annex = contents.find((c) => /gegen.?über|^TG(Ü|G|UE)$/i.test(String(c?.Name ?? '')))
  if (!annex) return null
  const annexXml = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  const pdfUrl = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Pdf')?.Url ?? null
  const annexXmlText = annexXml ? await getText(annexXml) : null
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
  const fromPdf = readable
    ? null
    : parseAnnexPdf(await pagesOf(new Uint8Array(await (await fetch(pdfUrl!, { headers: { 'User-Agent': UA['User-Agent'] } })).arrayBuffer())), articles)
  const parsed: ComparisonParse = fromPdf ?? parseTextComparison(annexXmlText!, articles)
  const droppedPages = fromPdf?.droppedPages ?? 0
  if (parsed.refusal) return { ...blank(`verweigert: ${parsed.refusal.slice(0, 52)}`, amending.length), droppedPages }

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
    const law = article?.bgbl ? await resolveLawByBgbl(article.bgbl, beginn, article.title).catch(() => null) : null
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
    // (`lawStructure.ts`): its cells would read as Absätze in document order.
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
  const gate = await runGate(parsed.rows, { articles, asOf: beginn, blocks: draftBlocks })
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
  return { id, cite, source: readable ? 'xml' : 'pdf', checked, clean, note: null, worst, ratios, points, substantial, substantialClean, tooShort, laws: amending.length, attributed, unattributed, noLaw, unresolvedLaw, unrepresentable, droppedPages, units: bags.units, addressedUnits: bags.addressed, rightlyWithoutParagraph: bags.rightlyWithoutParagraph, parasWithOwnBag, parasWithoutOwnBag, unchangedRows, unchangedParas, unchangedProse, unchangedBelow, unchangedBelowVerified, gate }
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
async function runGate(rows: readonly ComparisonRow[], draft: AnnexDraft): Promise<GateResult> {
  const check = await verifyAnnex(rows, draft, gateSources)
  const checked = checkAnnexRows(rows, check)

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
    uncheckedParas: verdicts.filter((v) => v === 'unchecked').length,
    rowsNoPara,
    changeRowsNoPara,
    verdictless,
    wronglyVerified,
    withheldWithText: checked.rows.filter((r) => r.check === 'withheld' && (r.current !== '' || r.proposed !== '' || r.segments !== null)).length,
    withheldWithoutCause: Object.entries(check.verdicts).filter(([key, v]) => v === 'withheld' && check.withheldCauses[key] === undefined).length,
    verdicts: check.verdicts,
  }
}

// --- CLI ----------------------------------------------------------------------
const gp = process.argv.find((a) => a.startsWith('--gp='))?.slice('--gp='.length) ?? 'XXVIII'
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice('--limit='.length) ?? 400)
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? null
const dumpWorst = process.argv.includes('--dump-worst')
const xmlMode = process.argv.includes('--xml')
const calibrate = process.argv.includes('--calibrate')

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

const results: DraftResult[] = []
for (const doc of docs.slice(0, limit)) {
  const label = `${doc?.Data?.Metadaten?.Bundesrecht?.Begut?.Begutachtungsverfahrennummer ?? ''} ${doc?.Data?.Metadaten?.Bundesrecht?.Kurztitel ?? ''} ${doc?.Data?.Metadaten?.Bundesrecht?.Titel ?? ''}`
  if (only && !label.toLowerCase().includes(only.toLowerCase())) continue
  try {
    const r = await verify(doc)
    if (!r) continue
    results.push(r)
    // A dropped page is named on the draft's own line, not only in the total:
    // it is a hole in *this* annex, and a sum over the corpus cannot say which
    // document is missing a page.
    const dropped = r.droppedPages > 0 ? ` [${r.droppedPages} Seite${r.droppedPages === 1 ? '' : 'n'} ungelesen]` : ''
    if (r.note) console.log(`  ·  ${r.cite.padEnd(9)} ${r.note}${dropped}`)
    else console.log(`  ${r.clean === r.checked ? '✓' : '✗'}  ${r.cite.padEnd(9)} ${r.clean}/${r.checked} Paragraphen ≥99 % im RIS${dropped}${r.worst.length ? ` — ${r.worst.slice(0, 2).join('; ')}` : ''}`)
  } catch (err) {
    console.log(`  ?  ${String(doc?.Data?.Metadaten?.Bundesrecht?.Kurztitel ?? '?').slice(0, 9).padEnd(9)} ${String(err).slice(0, 90)}`)
  }
}

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

// The gate as it ships, over every draft with a readable annex — including
// the ones the coverage loop scores as zero, because "nothing was checked" is
// exactly the state that used to leave the server labelled "geprüft".
const gated = results.filter((r) => r.note === null)
const gsum = (pick: (g: GateResult) => number) => gated.reduce((n, r) => n + pick(r.gate), 0)
console.log(`\n  Das Tor, wie es ausgeliefert wird (${gated.length} Entwürfe)`)
console.log(`    Paragraphen bestätigt / einbehalten / ungeprüft: ${gsum((g) => g.verifiedParas)} / ${gsum((g) => g.withheldParas)} / ${gsum((g) => g.uncheckedParas)}`)
// Which of the three checks refused a §. The two right-column rules are new
// on 2026-09-10; before them the first line was the whole story.
console.log(`    einbehalten, weil die geltende Fassung so nicht im RIS steht : ${gsum((g) => g.withheldStanding)}`)
console.log(`    einbehalten, weil die vorgeschlagene Fassung Geltendes als neu zeigt: ${gsum((g) => g.withheldAlreadyStanding)}`)
console.log(`    einbehalten, weil sie Text trägt, den der Entwurf für diesen Paragraphen nicht anordnet: ${gsum((g) => g.withheldNotInDraft)}`)
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
// What the left check never looks at. Measured and left out (§12.13,
// 11.09.2026), so the numbers have to stand where the decision can be
// re-checked: `unchangedBelow` is what a rule over these rows would withhold,
// and the second number what it would cost — a § the gate confirms today loses
// its whole word diff, not just the unchanged line.
console.log(`    Unveränderte Zeilen, nie gegen das RIS gehalten: ${dsum((r) => r.unchangedRows)} in ${dsum((r) => r.unchangedParas)} Paragraphen`)
console.log(`      davon Paragraphen mit ≥ ${MIN_PROSE_TOKENS} vergleichbaren Wörtern: ${dsum((r) => r.unchangedProse)}, unter der Schwelle: ${dsum((r) => r.unchangedBelow)} (davon heute bestätigt: ${dsum((r) => r.unchangedBelowVerified)})`)
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

// --- Bericht für den Drift-Alarm ----------------------------------------------
// `--json=<pfad>` schreibt dieselbe Messung als Datensatz, zusätzlich zum
// Bericht oben. Zusätzlich, nicht statt: der Prosabericht ist das, was im
// CI-Log steht, wenn der Alarm anschlägt und jemand wissen will, warum.
//
// Die Urteile stehen nicht hier, sondern in `annex-report.ts` — dieselbe
// Lehre, die §12.13 schon zweimal zieht: Logik in einem CLI-Skript ist Logik,
// die kein Test erreicht. Hier wird nur umgefüllt.
const jsonPath = process.argv.find((a) => a.startsWith('--json='))?.slice('--json='.length) ?? null
if (jsonPath) {
  const { writeFileSync } = await import('node:fs')
  const report: AnnexReport = {
    at: new Date().toISOString(),
    gp,
    path: xmlMode ? 'xml' : 'pdf',
    limit,
    records: docs.length,
    // `results`, nicht `gated` oder `scored`: ein Entwurf, dessen Beilage
    // verweigert wurde, hat trotzdem Seiten verlieren können, und seine
    // Zusicherungen gelten genauso. Die Filter des Prosaberichts sind für
    // Prozentzahlen da, nicht für Zusicherungen.
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
      ran: r.gate.ran,
      notRunReason: r.gate.notRunReason,
      verifiedParas: r.gate.verifiedParas,
      withheldParas: r.gate.withheldParas,
      withheldStanding: r.gate.withheldStanding,
      withheldAlreadyStanding: r.gate.withheldAlreadyStanding,
      withheldNotInDraft: r.gate.withheldNotInDraft,
      uncheckedParas: r.gate.uncheckedParas,
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
