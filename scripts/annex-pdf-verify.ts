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
 * Multi-law packages are skipped, not guessed: two thirds of drafts amend
 * several laws in one document, and attributing a § to the wrong one of them
 * would score the parser against unrelated text. That subset needs the annex's
 * Artikel boundaries first.
 *
 * Usage:  npx vite-node scripts/annex-pdf-verify.ts --gp=XXVIII [--limit=N] [--only=8]
 */
import { getDocumentProxy } from 'unpdf'
import { parseAnnexPdf, type AnnexPage } from '../server/utils/annexPdf'
import { plainText } from '../server/utils/lawStructure'
import { parseRisXml } from '../server/utils/lawText'
import { promulgationByArticle } from '../server/utils/lawTitles'
import { fetchParagraphTree, getText, resolveLawByBgbl } from '../server/utils/risKons'
import { isScanned } from '../server/utils/textComparison'
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

async function pagesOf(bytes: Uint8Array): Promise<AnnexPage[]> {
  const doc = await getDocumentProxy(bytes)
  const out: AnnexPage[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    out.push({
      width: page.getViewport({ scale: 1 }).width,
      items: content.items
        .filter((i: any) => typeof i.str === 'string')
        .map((i: any) => ({ x: i.transform[4], y: i.transform[5], width: i.width ?? 0, text: i.str })),
    })
  }
  return out
}

/**
 * The annex prints things RIS does not keep inside a paragraph, and counting
 * those as missing measured the ruler instead of the parse (2026-09-09):
 *
 * - **Elision.** "(1) bis (3) …" says three Absätze are unchanged and left
 *   out. It is the annex's own syntax; "bis" is not law text, and it was the
 *   single most frequent "missing" word in the corpus.
 * - **Table of contents.** The Inhaltsverzeichnis is its own RIS document.
 * - **Abschnitt and Hauptstück headings**, which sit above a § and belong to
 *   no § in RIS. `annexPdf.ts` deliberately keeps headings inline.
 */
/** Below this many comparable words a row says nothing about the parse. */
const MIN_PROSE_TOKENS = 15

const ELISION_RE = /\((\d+[a-z]*)\)(?:\s*(?:bis|und|,)\s*\(?(\d+[a-z]*)\)?)*\s*(?:\.\.\.|…)/g
const STRUCTURE_RE = /\b(?:inhaltsverzeichnis|abschnitt|hauptstück|teil|anlage|anhang)\b/gi

const tokens = (t: string): string[] =>
  t
    .replace(ELISION_RE, ' ')
    .replace(/(?:\.\.\.|…)/g, ' ')
    .replace(STRUCTURE_RE, ' ')
    .toLowerCase()
    .replace(/[„“”"'‚‘’]/g, '')
    .replace(/[­‑]/g, '-')
    .split(/[^\p{L}\p{N}§-]+/u)
    .filter((w) => w.length > 2)

interface DraftResult {
  cite: string
  source: 'xml' | 'pdf'
  checked: number
  clean: number
  note: string | null
  worst: string[]
  /** Every row's coverage ratio, for the distribution — a mean hides the shape */
  ratios: number[]
  /** Rows carrying enough prose to be evidence either way, and their clean count */
  substantial: number
  substantialClean: number
  tooShort: number
}

async function verify(doc: any): Promise<DraftResult | null> {
  const meta = doc?.Data?.Metadaten
  const begut = meta?.Bundesrecht?.Begut
  const cite = String(begut?.Begutachtungsverfahrennummer ?? begut?.Verfahrensnummer ?? meta?.Bundesrecht?.Kurztitel ?? meta?.Technisch?.ID ?? '?').slice(0, 34)
  const beginn: string | null = begut?.BeginnBegutachtungsfrist ?? null
  const blank = (note: string): DraftResult => ({ cite, source: 'pdf', checked: 0, clean: 0, note, worst: [], ratios: [], substantial: 0, substantialClean: 0, tooShort: 0 })
  if (!beginn) return blank('kein Beginn der Begutachtungsfrist')

  const contents = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
  const main = contents.find((c) => c?.ContentType === 'MainDocument')
  const annex = contents.find((c) => /gegen.?über|^TG(Ü|G|UE)$/i.test(String(c?.Name ?? '')))
  if (!annex) return null
  const annexXml = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  const pdfUrl = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Pdf')?.Url ?? null
  if (!pdfUrl) return blank('Beilage ohne PDF')
  // Only the rasterised ones are this parser's job; the readable XML has its
  // own path and is the better source where it exists.
  if (annexXml && !isScanned(await getText(annexXml))) return null

  const mainXml = asArray<any>(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  if (!mainXml) return blank('Entwurf ohne XML')
  const articles = promulgationByArticle(parseRisXml(await getText(mainXml)))
  if (articles.size === 0) return blank('keine Promulgationsklausel — Stammgesetz oder unlesbar')
  if (articles.size > 1) return blank(`Sammelgesetz (${articles.size} Gesetze) — Artikelgrenzen nötig`)

  const bgbl = [...articles.values()][0]!
  const law = await resolveLawByBgbl(bgbl, beginn)
  if (!law) return blank(`Stammnorm ${bgbl.organ} ${bgbl.nummer} nicht auflösbar`)

  const bytes = new Uint8Array(await (await fetch(pdfUrl, { headers: { 'User-Agent': UA['User-Agent'] } })).arrayBuffer())
  const rows = parseAnnexPdf(await pagesOf(bytes))

  let checked = 0
  let clean = 0
  const worst: string[] = []
  const ratios: number[] = []
  let substantial = 0
  let substantialClean = 0
  let tooShort = 0
  for (const row of rows) {
    if (row.kind !== 'pair' || !row.gld || !row.current) continue
    const id = /(\d+[a-z]*|[IVXL]+)/.exec(row.gld)?.[1]
    if (!id) continue
    // RIS prints an Anlage as "Anl. 1", never as "§ 1" — looking it up among
    // the paragraphs compared a schedule against an unrelated provision.
    const isAnlage = /^(?:Anlage|Anhang)/i.test(row.gld)
    const wanted = isAnlage ? new RegExp(`^Anl\\.?\\s*${id}\\b`, 'i') : new RegExp(`^§+\\s*${id}\\b`)
    const entry = Object.entries(law.paragraphs).find(([label]) => wanted.test(label))
    if (!entry) continue
    const tree = await fetchParagraphTree(entry[1])
    if (!tree) continue
    checked++
    const have = new Set(tokens(plainText(tree)))
    const want = tokens(row.current)
    if (want.length === 0) continue
    const missing = want.filter((w) => !have.has(w))
    const ratio = 1 - missing.length / want.length
    ratios.push(ratio)
    // A row that is a heading plus "(1) bis (3) …" carries almost no prose:
    // the annex deliberately shows nothing of the provision, and RIS files the
    // group heading above it elsewhere. Such a row is not evidence about the
    // parse in either direction, so it is counted and set aside rather than
    // scored (2026-09-09).
    if (want.length >= MIN_PROSE_TOKENS) {
      substantial++
      if (ratio >= 0.99) substantialClean++
    } else tooShort++
    if (ratio >= 0.99) clean++
    else worst.push(`${row.gld} ${(ratio * 100).toFixed(0)} % (fehlt: ${missing.slice(0, 6).join(' ')})`)
    if (dumpWorst && ratio < 0.5) {
      console.log(`\n    ### ${cite} ${row.gld} — ${(ratio * 100).toFixed(0)} % gedeckt`)
      console.log(`      SPALTE: ${row.current.slice(0, 230)}`)
      console.log(`      RIS   : ${plainText(tree).slice(0, 230)}`)
    }
  }
  return { cite, source: 'pdf', checked, clean, note: null, worst, ratios, substantial, substantialClean, tooShort }
}

// --- CLI ----------------------------------------------------------------------
const gp = process.argv.find((a) => a.startsWith('--gp='))?.slice('--gp='.length) ?? 'XXVIII'
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice('--limit='.length) ?? 400)
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? null
const dumpWorst = process.argv.includes('--dump-worst')

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
    if (r.note) console.log(`  ·  ${r.cite.padEnd(9)} ${r.note}`)
    else console.log(`  ${r.clean === r.checked ? '✓' : '✗'}  ${r.cite.padEnd(9)} ${r.clean}/${r.checked} Paragraphen ≥99 % im RIS${r.worst.length ? ` — ${r.worst.slice(0, 2).join('; ')}` : ''}`)
  } catch (err) {
    console.log(`  ?  ${nr.padEnd(9)} ${String(err).slice(0, 90)}`)
  }
}

const scored = results.filter((r) => r.note === null && r.checked > 0)
const checked = scored.reduce((n, r) => n + r.checked, 0)
const clean = scored.reduce((n, r) => n + r.clean, 0)
console.log(`\n${'='.repeat(74)}`)
console.log(`Gerasterte Beilagen mit PDF-Textebene, gegen den geltenden Text im RIS`)
console.log(`  auswertbare Entwürfe   : ${scored.length} von ${results.length} mit gerasterter Beilage`)
console.log(`  geprüfte Paragraphen   : ${checked}`)
console.log(`  ≥99 % im RIS gedeckt   : ${clean} (${checked ? ((clean / checked) * 100).toFixed(1) : '—'} %)`)
const sub = scored.reduce((n, r) => n + r.substantial, 0)
const subClean = scored.reduce((n, r) => n + r.substantialClean, 0)
console.log(`  davon mit echtem Fließtext (≥ ${MIN_PROSE_TOKENS} Wörter): ${sub}`)
console.log(`    ≥99 % gedeckt        : ${subClean} (${sub ? ((subClean / sub) * 100).toFixed(1) : '—'} %)`)
console.log(`  zu kurz zum Prüfen (Überschrift/Auslassung): ${scored.reduce((n, r) => n + r.tooShort, 0)}`)
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
