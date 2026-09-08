#!/usr/bin/env vite-node
/**
 * Harvests Novellierungsanordnungen from the RIS `Begut` corpus into one
 * JSONL file, so the instruction grammar can be measured against real text
 * instead of guessed (docs/architecture.md §12.12: the cost is verification).
 *
 * Usage:  npx vite-node scripts/novao-corpus.ts [sampleSize] [cacheDir]
 *
 * One list call per 100 records, then one main-document XML per sampled
 * draft, four at a time, everything cached on disk so a rerun is free.
 * Output: `<cacheDir>/novao.jsonl`, one instruction per line.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseRisXml } from '../server/utils/lawText'

const RIS = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'
const HEADERS = { 'User-Agent': 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)', Accept: 'application/json' }
const CONCURRENCY = 4

const sampleSize = Number(process.argv[2] ?? 300)
const cacheDir = process.argv[3] ?? join('.cache', 'novao')
await mkdir(join(cacheDir, 'xml'), { recursive: true })

async function cached<T>(file: string, load: () => Promise<T>, parse: (s: string) => T = JSON.parse): Promise<T> {
  try {
    return parse(await readFile(file, 'utf8'))
  } catch {
    const data = await load()
    await writeFile(file, typeof data === 'string' ? data : JSON.stringify(data))
    return data
  }
}

async function get(url: string, accept = 'application/json'): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { ...HEADERS, Accept: accept }, signal: AbortSignal.timeout(20_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      if (attempt === 2) throw err
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    }
  }
  throw new Error('unreachable')
}

/** XML-to-JSON trap: one element → bare object, several → array. */
function asArray<T>(x: T | T[] | null | undefined): T[] {
  return x === null || x === undefined ? [] : Array.isArray(x) ? x : [x]
}

interface Draft {
  id: string
  kurztitel: string
  xml: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function listPage(page: number): Promise<{ hits: number; drafts: Draft[] }> {
  const url = `${RIS}?Applikation=Begut&DokumenteProSeite=OneHundred&Seitennummer=${page}`
  const body = await cached(join(cacheDir, `list-${page}.json`), () => get(url).then(JSON.parse))
  const results = (body as any)?.OgdSearchResult?.OgdDocumentResults
  const hits = Number(results?.Hits?.['#text'] ?? 0)
  const drafts: Draft[] = []
  for (const ref of asArray<any>(results?.OgdDocumentReference)) {
    const meta = ref?.Data?.Metadaten
    const id = meta?.Technisch?.ID
    const main = asArray<any>(ref?.Data?.Dokumentliste?.ContentReference).find((c) => c?.ContentType === 'MainDocument')
    const xml = asArray<any>(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url
    if (id && xml) drafts.push({ id, kurztitel: meta?.Bundesrecht?.Kurztitel ?? '', xml })
  }
  return { hits, drafts }
}

const first = await listPage(1)
const pages = Math.min(Math.ceil(first.hits / 100), Math.ceil(sampleSize / 100) * 3)
let drafts = [...first.drafts]
for (let p = 2; p <= pages; p++) drafts.push(...(await listPage(p)).drafts)
// Newest first is what the API gives; take an even spread over the corpus
// instead, so the sample is not one season's legistic habits.
const step = Math.max(1, Math.floor(drafts.length / sampleSize))
drafts = drafts.filter((_, i) => i % step === 0).slice(0, sampleSize)
console.log(`Korpus ${first.hits} Entwürfe, ${pages} Seiten gelesen, Stichprobe ${drafts.length}`)

const lines: string[] = []
let done = 0
let failed = 0
async function worker(queue: Draft[]) {
  for (;;) {
    const d = queue.pop()
    if (!d) return
    try {
      const xml = await cached(join(cacheDir, 'xml', `${d.id}.xml`), () => get(d.xml, 'application/xml'), (s) => s)
      for (const b of parseRisXml(xml)) {
        if (b.kind !== 'novao') continue
        lines.push(JSON.stringify({ id: d.id, kurztitel: d.kurztitel, cls: b.cls, text: b.text }))
      }
    } catch (err) {
      failed++
      if (failed <= 3) console.warn(`  ${d.id}: ${String(err)}`)
    }
    if (++done % 25 === 0) console.log(`  ${done}/${drafts.length} …`)
  }
}
const queue = [...drafts]
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)))

const out = join(cacheDir, 'novao.jsonl')
await writeFile(out, `${lines.join('\n')}\n`)
console.log(`${lines.length} Novellierungsanordnungen aus ${drafts.length - failed} Entwürfen → ${out}`)
