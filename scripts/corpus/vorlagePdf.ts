#!/usr/bin/env vite-node
/**
 * The Regierungsvorlagen without a Begutachtung whose Textgegenüberstellung
 * Parliament publishes as a PDF only: what the production reader makes of
 * each, document by document.
 *
 * Usage:
 *   pnpm -s corpus:ohne-begutachtung -- XXVIII > list.txt
 *   pnpm corpus:vorlage-pdf --gp=XXVIII --liste=list.txt --out=<dir> [--roh]
 *
 * The population is what that list names, the rows „ohne Begutachtung" and
 * „Ausschussbegutachtung" carried by a Vorlage (`d.B.`). Each PDF goes through
 * the request path's own steps, minus Nitro: `pagesOf`, `parseAnnexParts` with
 * the Vorlage's Artikel, `verifyAnnex` against RIS, `annexStrictChecks`,
 * `annexMarks` and `checkAnnexRows`. There is no Lesefassung of a Vorlage, so
 * the draft check stands alone, as it does on the page.
 *
 * One request at a time with a pause, through the harness cache: a second run
 * asks upstream for nothing it already holds.
 *
 * Writes `<out>/<gp>.json` (one record per Vorlage) and `<out>/<gp>-<inr>.rows.json`
 * (the shown §§ as the page gets them, for reading against the PDF).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { argAssigned, argFlag } from '../lib/args'
import { installFetchCache } from '../lib/harnessCache'
import { PARLIAMENT, getJson, scriptUserAgent } from '../lib/http'
import { cachedJson } from '../lib/diskCache'
import { annexSources } from '../lib/productionSources'
import { annexParagraphKey } from '../../server/utils/annex/annexText'
import { parseAnnexParts, type AnnexPage } from '../../server/utils/annex/annexPdf'
import { pagesOf } from '../../server/utils/annex/annexPdfPages'
import { withoutParliamentStamps } from '../../server/utils/annex/parliamentPdfStamps'
import { annexMarks } from '../../server/utils/annex/annexMark'
import { annexStrictChecks } from '../../server/utils/annex/annexStrict'
import { checkAnnexRows } from '../../server/utils/annex/gateRows'
import { verifyAnnex } from '../../server/utils/annex/verdict'
import { findLawStations } from '../../server/utils/diff/stationDocuments'
import { draftArticles } from '../../server/utils/lawtext/draftArticles'
import { parseParliamentHtml } from '../../server/utils/lawtext/parliamentHtml'
import { mapDocuments } from '../../server/utils/parliament/detailJson'
import { pickTextComparisons } from '../../server/utils/ris/risRecord'
import { decodeHtml } from '../../server/utils/upstream/decodeHtml'

const SCRIPT = 'corpus/vorlagePdf'
const PAUSE_MS = 300
const REQUEST_TIMEOUT_MS = 60_000

const gp = argAssigned('gp') ?? 'XXVIII'
const listFile = argAssigned('liste')
const outDir = argAssigned('out')
const only = argAssigned('only')
/** `--roh`: the pages as pdf.js gives them, Parliament's margin stamps still on. */
const raw = argFlag('roh')
if (!listFile || !outDir) {
  console.error('Usage: vorlagePdf.ts --gp=XXVIII --liste=<output of corpus:ohne-begutachtung> --out=<dir> [--only=<inr>]')
  process.exit(1)
}

/** Serial, paced and with its own timeout: a queued request must not spend the caller's. */
const direct = globalThis.fetch
let tail: Promise<unknown> = Promise.resolve()
globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const run = tail.then(async () => {
    const res = await direct(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    const body = res.status === 204 || res.status === 304 ? null : await res.arrayBuffer()
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
    return new Response(body, { status: res.status, headers: res.headers })
  })
  tail = run.catch(() => undefined)
  return run
}) as typeof fetch
installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

interface Detail {
  content?: Parameters<typeof findLawStations>[0] & { documents?: Parameters<typeof mapDocuments>[0]; einlangen?: string }
}

interface VorlageRecord {
  gp: string
  inr: number
  kind: 'pdf-only' | 'html' | 'none'
  url: string | null
  articles?: number
  pages?: number
  pagesRefused?: number
  rows?: number
  refusal?: string | null
  unreadable?: string | null
  paragraphs?: number
  shown?: number
  withheld?: number
  withheldByCause?: Record<string, number>
  verified?: number
  uncheckedByGate?: number
  /** Of the shown §§: the draft check's word. */
  held?: number
  marked?: number
  uncheckable?: number
  /** Shown §§ the page marks „nicht bestätigt" / „nicht geprüft". */
  pageUnconfirmed?: number
  pageUnchecked?: number
  bytes?: number
  error?: string
}

/** The `d.B.` numbers of the two sections that name a law without a Begutachtung. */
function vorlagenOfList(text: string): number[] {
  const out = new Set<number>()
  let inSection = false
  for (const line of text.split('\n')) {
    if (line.startsWith('---')) inSection = /Alle \d+ Zeilen|Ausschussbegutachtung/.test(line)
    else if (inSection) {
      const m = /\s(\d+) d\.B\./.exec(line)
      if (m) out.add(Number(m[1]))
    }
  }
  return [...out].sort((a, b) => a - b)
}

async function textOf(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': scriptUserAgent(SCRIPT) } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return decodeHtml(await res.arrayBuffer(), undefined)
}

async function probe(inr: number): Promise<VorlageRecord> {
  const detail = await cachedJson<Detail>(join('.cache', 'ohne-begutachtung', gp, `I-${inr}.json`), () =>
    getJson(`${PARLIAMENT}/gegenstand/${gp}/I/${inr}?json=True`, { script: SCRIPT, attempts: 3, backoffMs: (n: number) => 1000 * n, timeoutMs: 60_000 }),
  )
  const group = pickTextComparisons(mapDocuments(detail.content?.documents), (d) => d.title)[0]
  const pdf = group?.formats.find((f) => f.type === 'pdf')?.url ?? null
  const html = group?.formats.find((f) => f.type === 'html')?.url ?? null
  if (html) return { gp, inr, kind: 'html', url: html }
  if (!pdf) return { gp, inr, kind: 'none', url: null }
  const record: VorlageRecord = { gp, inr, kind: 'pdf-only', url: pdf }
  const station = findLawStations(detail.content ?? {}, 'I').get('rv')
  const blocks = station?.html ? parseParliamentHtml(await textOf(station.html)) : []
  const articles = draftArticles(blocks)
  record.articles = articles.length
  const res = await fetch(pdf, { headers: { 'User-Agent': scriptUserAgent(SCRIPT) } })
  if (!res.ok) throw new Error(`${res.status} ${pdf}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  record.bytes = bytes.length
  const read: AnnexPage[] | null = await pagesOf(bytes).catch(() => null)
  const pages = read && !raw ? withoutParliamentStamps(read) : read
  record.pages = pages?.length ?? 0
  const parsed = parseAnnexParts([pages], articles)
  if (!parsed) return { ...record, rows: 0, unreadable: 'pdf.js konnte das Dokument nicht öffnen' }
  record.pagesRefused = parsed.droppedPages
  record.rows = parsed.rows.length
  record.refusal = parsed.refusal ?? null
  record.unreadable = parsed.unreadable ?? null
  if (parsed.rows.length === 0) return record

  const draft = { articles, asOf: detail.content?.einlangen?.slice(0, 10) ?? '', blocks }
  const check = await verifyAnnex(parsed.rows, draft, annexSources)
  const strict = annexStrictChecks(parsed.rows, draft)
  const marks = annexMarks(parsed.rows, check, strict, null)
  const checked = checkAnnexRows(parsed.rows, check, marks)
  const verdicts = Object.entries(check.verdicts)
  const shownKeys = verdicts.filter(([, v]) => v !== 'withheld').map(([k]) => k)
  record.paragraphs = verdicts.length
  record.shown = shownKeys.length
  record.withheld = verdicts.length - shownKeys.length
  record.withheldByCause = { ...checked.withheldByCause }
  record.verified = verdicts.filter(([, v]) => v === 'verified').length
  record.uncheckedByGate = verdicts.filter(([, v]) => v === 'unchecked').length
  let held = 0
  let marked = 0
  let uncheckable = 0
  for (const key of shownKeys) {
    const state = strict.get(key)?.state
    if (state === 'holds') held++
    else if (state === 'differs') marked++
    else uncheckable++
  }
  Object.assign(record, { held, marked, uncheckable, pageUnconfirmed: checked.unconfirmedParagraphs, pageUnchecked: checked.uncheckedParagraphs })

  const shown = new Set(shownKeys)
  const dump = checked.rows.flatMap((row) => {
    if (row.kind !== 'pair') return []
    const para = row.gld ?? row.para
    const key = para === null ? null : annexParagraphKey(row.law, para)
    if (key === null || !shown.has(key)) return []
    const s = strict.get(key)
    return [{ key, check: row.check, mark: marks.get(key)?.kind ?? null, strict: s?.state ?? null, reason: s?.reason ?? null, notInDraft: s?.notInDraft ?? [], notShown: s?.notShown ?? [], current: row.current, proposed: row.proposed }]
  })
  await writeFile(join(outDir!, `${gp}-${inr}.rows.json`), JSON.stringify(dump, null, 1))
  return record
}

await mkdir(outDir, { recursive: true })
const population = only ? [Number(only)] : vorlagenOfList(await readFile(listFile, 'utf8'))
const records: VorlageRecord[] = []
for (const inr of population) {
  try {
    const record = await probe(inr)
    records.push(record)
    if (record.kind === 'pdf-only') {
      console.log(`${inr} d.B.: ${record.pages} S., ${record.pagesRefused ?? '–'} abgelehnt, ${record.rows} Zeilen, §§ ${record.shown ?? 0} gezeigt / ${record.withheld ?? 0} zurückgehalten; hält ${record.held ?? 0}, markiert ${record.marked ?? 0}, nicht prüfbar ${record.uncheckable ?? 0}${record.refusal ? ' [Grenzen abgelehnt]' : ''}${record.unreadable ? ` [${record.unreadable}]` : ''}`)
    }
  } catch (err) {
    records.push({ gp, inr, kind: 'pdf-only', url: null, error: String(err) })
    console.log(`${inr} d.B.: FEHLER ${String(err)}`)
  }
  await writeFile(join(outDir, `${gp}.json`), JSON.stringify(records, null, 1))
}
const pdfOnly = records.filter((r) => r.kind === 'pdf-only')
console.log(`\nGP ${gp}: ${records.length} Vorlagen · HTML ${records.filter((r) => r.kind === 'html').length} · nur PDF ${pdfOnly.length} · keine ${records.filter((r) => r.kind === 'none').length}`)
console.log(`  nur PDF mit gezeigten §§: ${pdfOnly.filter((r) => (r.shown ?? 0) > 0).length} von ${pdfOnly.length}`)
const sum = (f: (r: VorlageRecord) => number | undefined) => pdfOnly.reduce((a, r) => a + (f(r) ?? 0), 0)
console.log(`  Seiten ${sum((r) => r.pages)}, abgelehnt ${sum((r) => r.pagesRefused)}, Zeilen ${sum((r) => r.rows)}, §§ gezeigt ${sum((r) => r.shown)}, zurückgehalten ${sum((r) => r.withheld)}`)
console.log(`  der gezeigten: hält ${sum((r) => r.held)}, markiert ${sum((r) => r.marked)}, nicht prüfbar ${sum((r) => r.uncheckable)}; Seite: „nicht bestätigt" ${sum((r) => r.pageUnconfirmed)}, „nicht geprüft" ${sum((r) => r.pageUnchecked)}`)
