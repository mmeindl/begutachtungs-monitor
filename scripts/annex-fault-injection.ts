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
 * **Three faults, and each one is a real failure mode of this project.**
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
 *   dragged out of a neighbouring provision of the same draft. It is the
 *   known blind spot of rule 2, whose word bag is built for the whole draft:
 *   the words are in the draft, only in the wrong § (`TODO.md`).
 *
 * The left column is untouched in both R faults, so "die linke Prüfung
 * besteht" reads 100 % there by construction — that is the statement, not a
 * defect of the run.
 *
 * **How to read the table.** Per fault: how many §§ it could be injected into,
 * how many still pass the left check, and how many each rule catches. Beside
 * it, the corpus false-positive side, which is the number that has to stay
 * small — a rule that fires on sound annexes withholds real law, and this
 * harness would otherwise reward exactly that. The counts printed there are
 * the two right-column causes of `annex-pdf-verify.ts` over the same
 * population, so the two harnesses cross-check each other.
 *
 * **What it said on 2026-09-10** (GP XXVIII, both paths run separately):
 *
 * | | §§ | linke Prüfung | Regel 1 | Regel 2 | zusammen |
 * |---|---:|---:|---:|---:|---:|
 * | L, PDF-Pfad    | 918 | 847 (92,3 %) | 358 (39,0 %) | 144 | 450 (49,0 %) |
 * | L, Tabellenpfad| 243 | 243 (100 %)  | 146 (60,1 %) |  49 | 158 (65,0 %) |
 * | R-alt, PDF     | 881 | 881 (100 %)  |   6 ( 0,7 %) | 218 | 222 (25,2 %) |
 * | R-neu, PDF     | 880 | 880 (100 %)  |   7 ( 0,8 %) | 106 | 111 (12,6 %) |
 *
 * Read across: fault L gets past the left check in 92 to 100 % of cases,
 * which is what the right column had to be checked for at all; rule 1 is the
 * one that answers it. R-alt is rule 2's own case, and R-neu is the fault it
 * is measurably weakest on — the misfiled words are in the draft, only in
 * another §, and rule 2's word bag is built for the whole draft (`TODO.md`).
 * False alarms without any fault stay at 18 and 7 §§ (PDF) and 6 and 0 (XML).
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
import {
  MIN_STANDING_STRETCH,
  PARAGRAPH_THRESHOLD,
  annexParagraphKey,
  comparableTokens,
  coverageOfParagraph,
  designationKey,
  draftTextOf,
  draftWordBag,
  rightColumnCheck,
  type StandingText,
} from '../server/utils/annexCheck'
import { parseAnnexPdf } from '../server/utils/annexPdf'
import { pagesOf } from '../server/utils/annexPdfPages'
import { diffTokens } from '../server/utils/lawDiff'
import { plainText } from '../server/utils/lawStructure'
import { normalizeText, parseRisXml } from '../server/utils/lawText'
import { draftArticles, type DraftArticle } from '../server/utils/lawTitles'
import { fetchParagraphTree, getText, resolveLawByBgbl, type KonsLawAtDate, type KonsParagraphRef } from '../server/utils/risKons'
import { isScanned, parseTextComparison, type ComparisonRow } from '../server/utils/textComparison'
import { installFetchCache } from './harness-cache'

installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

const RIS = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'
const UA = { 'User-Agent': 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)', Accept: 'application/json' }

/* eslint-disable @typescript-eslint/no-explicit-any */
const asArray = <T,>(x: T | T[] | null | undefined): T[] => (x === null || x === undefined ? [] : Array.isArray(x) ? x : [x])

async function risJson(params: Record<string, string>): Promise<any> {
  const res = await fetch(`${RIS}?${new URLSearchParams(params)}`, { headers: UA, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

const ANNEX_NAME_RE = /gegen.?über|^TG(Ü|G|UE)$/i

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

/** What one fault did to one §. */
interface Verdict {
  /** The left check on the faulted rows — 100 % by construction for R faults */
  leftPasses: boolean
  rule1: boolean
  rule2: boolean
}

/** One fault over the corpus. */
interface FaultTally {
  label: string
  tried: number
  leftPasses: number
  rule1: number
  rule2: number
  either: number
  /** Catches that were already firing without any fault — not this fault's */
  rule1Already: number
  rule2Already: number
}

function tally(label: string): FaultTally {
  return { label, tried: 0, leftPasses: 0, rule1: 0, rule2: 0, either: 0, rule1Already: 0, rule2Already: 0 }
}

function record(into: FaultTally, verdict: Verdict, base: Verdict): void {
  into.tried++
  if (verdict.leftPasses) into.leftPasses++
  if (verdict.rule1) into.rule1++
  if (verdict.rule2) into.rule2++
  if (verdict.rule1 || verdict.rule2) into.either++
  if (verdict.rule1 && base.rule1) into.rule1Already++
  if (verdict.rule2 && base.rule2) into.rule2Already++
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
function judge(rows: readonly ComparisonRow[], standing: StandingText, bag: ReadonlySet<string>): Verdict {
  const cover = coverageOfParagraph(rows, standing.text)
  const right = rightColumnCheck(rows, standing, bag)
  return { leftPasses: cover.prose && cover.ratio >= PARAGRAPH_THRESHOLD, rule1: right.alreadyStanding, rule2: right.notInDraft }
}

/** The rows of a § with one row replaced — the fault, and nothing else, changed. */
function withRow(rows: readonly ComparisonRow[], at: ComparisonRow, replacement: ComparisonRow): ComparisonRow[] {
  return rows.map((row) => (row === at ? replacement : row))
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
  // Rule 2's reference, built as the service builds it (`draftTextOf`).
  const bag = draftWordBag(draftTextOf(draftBlocks))

  const parsed = readable
    ? parseTextComparison(annexXmlText, articles)
    : parseAnnexPdf(await pagesOf(new Uint8Array(await (await fetch(pdfUrl!, { headers: { 'User-Agent': UA['User-Agent'] } })).arrayBuffer())), articles)
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
  const base = new Map<Judged, Verdict>()
  for (const para of judgedParas) {
    const verdict = judge(para.rows, para.standing, bag)
    base.set(para, verdict)
    if (para.prose && !para.leftPasses) continue
    corpus.held++
    if (verdict.rule1) corpus.rule1++
    if (verdict.rule2) corpus.rule2++
    if (verdict.rule1 || verdict.rule2) corpus.either++
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
      return sentences.length >= MIN_SITE_SENTENCES
        && toks(row.current).length >= MIN_SITE_TOKENS
        // A second sentence below the rule's own floor is a fault the rule is
        // not built to see, and counting it as a miss would measure the
        // injector. Six words is `MIN_STANDING_STRETCH`.
        && toks(sentences[1]!).length >= MIN_STANDING_STRETCH
    })
    if (!site) continue
    injected++

    // Fault L: the sentence is gone from the left column and the word diff is
    // recomputed, exactly as it would have been had the parser lost the line.
    const lostCurrent = sentencesOf(site.current).filter((_, i) => i !== 1).join(' ')
    const faultL = withRow(para.rows, site, { ...site, current: lostCurrent, segments: diffTokens(lostCurrent, site.proposed).segments })
    record(faults.L, judge(faultL, para.standing, bag), baseVerdict)

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
      record(into, judge(faultR, para.standing, bag), baseVerdict)
    }
  }
  return { cite, judged: confirmed.length, injected }
}

// --- CLI ----------------------------------------------------------------------
const gp = process.argv.find((a) => a.startsWith('--gp='))?.slice('--gp='.length) ?? 'XXVIII'
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice('--limit='.length) ?? 400)
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? null
const xmlMode = process.argv.includes('--xml')

/** The corpus without any fault — the number that has to stay small. */
const corpus = { held: 0, rule1: 0, rule2: 0, either: 0 }
const faults = {
  L: tally('L     zweiter Satz links verloren'),
  Rold: tally('R-alt fremder geltender Satz rechts'),
  Rnew: tally('R-neu fremder Entwurfssatz rechts'),
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
console.log(`    „bereits geltend"  : ${String(corpus.rule1).padStart(4)} (${pct(corpus.rule1, corpus.held)})`)
console.log(`    „nicht im Entwurf" : ${String(corpus.rule2).padStart(4)} (${pct(corpus.rule2, corpus.held)})`)
console.log(`    eine der beiden    : ${String(corpus.either).padStart(4)} (${pct(corpus.either, corpus.held)})`)

console.log(`\n  Mit Injektion, je Fehler`)
console.log(`  Fehler                                §§   linke Prüfung besteht   „bereits geltend"   „nicht im Entwurf"    eine der beiden`)
for (const fault of [faults.L, faults.Rold, faults.Rnew]) {
  const cell = (n: number): string => `${String(n).padStart(6)} (${pct(n, fault.tried)})`
  console.log(`  ${fault.label.padEnd(36)} ${String(fault.tried).padStart(4)}   ${cell(fault.leftPasses)}   ${cell(fault.rule1)}   ${cell(fault.rule2)}   ${cell(fault.either)}`)
}
// A rule that was already firing on the sound § did not catch the fault; it
// was there before it. Small by construction (the false-positive rate above),
// and printed rather than assumed.
for (const fault of [faults.L, faults.Rold, faults.Rnew]) {
  if (fault.rule1Already === 0 && fault.rule2Already === 0) continue
  console.log(`    ${fault.label.trim()}: davon schon ohne Injektion gemeldet — Regel 1 ${fault.rule1Already}, Regel 2 ${fault.rule2Already}`)
}
