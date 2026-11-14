#!/usr/bin/env vite-node
/**
 * „In … d.B. genannt" over one Gesetzgebungsperiode — every draft without a
 * linked Regierungsvorlage whose title the Erläuterungen of another draft's
 * Vorlage name, through the production rule (`server/utils/parliament/namedInRv.ts`,
 * `buildNamedIndex`). Only the fetching is the script's own: list 81 and
 * 101, each draft's and each Vorlage's detail JSON and the Erläuterungen'
 * HTML, straight from Parliament, kept in `--cache` (default
 * `.cache/rv-genannt/`) so a rerun is free.
 *
 *     pnpm corpus:rv-genannt -- --gp XXVII
 *     pnpm corpus:rv-genannt -- --gp XXVII --candidates   # also every hit the rule rejected, with the condition
 *     pnpm corpus:rv-genannt -- --gp XXVII --cache <dir>
 *
 * EVERY Vorlage of the period is read here (`everyVorlage`), not only those
 * inside a candidate's window as on the server, so `--candidates` can name
 * the hits the window rejects. The accepted list is the same either way:
 * a verdict reads only the Vorlagen inside its own window.
 *
 * What the page adds at request time is not decided here: the Frist must be
 * over (it is for every accepted draft, whose Vorlage came after it) and the
 * period's links must exist — printed once as „Verknüpfungen".
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { DraftSummary } from '../../shared/types'
import { intToRoman, romanToInt } from '../../shared/utils/gp'
import { mapDocuments, findRvLinks, parseStages, type RawDocumentGroup, type RawStage } from '../../server/utils/parliament/detailJson'
import { dedupeDraftList } from '../../server/utils/parliament/draftList'
import { mapDraftRow } from '../../server/utils/parliament/list81'
import { mapVorlageRow } from '../../server/utils/parliament/list101'
import { buildNamedIndex, explanationsFormats, pdfParagraphs, type LinkedDraft, type VorlageReading, type WitnessVorlage } from '../../server/utils/parliament/namedInRv'
import { decodeHtml } from '../../server/utils/upstream/decodeHtml'
import { upstreamBytes } from '../../server/utils/upstream/fetch'
import { cachedJson, cachedText } from '../lib/diskCache'
import { PARLIAMENT as BASE, getJson, scriptUserAgent } from '../lib/http'
import { pool } from '../lib/async'
import { argFlag, argPair } from '../lib/args'

const SCRIPT = 'corpus/rvGenannt'
const CONCURRENCY = 4

const gp = argPair('gp')
if (!gp || !/^[IVXLC]+$/.test(gp)) {
  console.error('Usage: pnpm corpus:rv-genannt -- --gp <GP, e.g. XXVII> [--candidates] [--cache <dir>]')
  process.exit(1)
}
const showCandidates = argFlag('candidates')
const cacheDir = argPair('cache') ?? join('.cache', 'rv-genannt')
await mkdir(join(cacheDir, gp), { recursive: true })
await mkdir(join(cacheDir, 'docs'), { recursive: true })

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex')
const http = { script: SCRIPT, attempts: 3, backoffMs: (n: number) => 500 * n, timeoutMs: 20_000 }

interface FilterList {
  rows?: unknown[][]
}
const filterList = (id: number, file: string, body: Record<string, unknown>) =>
  cachedJson<FilterList>(join(cacheDir, file), () =>
    getJson<FilterList>(`${BASE}/Filter/api/filter/data/${id}?js=eval&showAll=true`, { ...http, method: 'POST', body }),
  )

interface Detail {
  content?: {
    stages?: RawStage[] | null
    documents?: RawDocumentGroup[] | null
    preconst?: { gp_code?: string | null; ityp?: string | null; inr?: number | string | null; zitation?: string | null; betreff?: string | null }[] | null
  }
}
const detail = (g: string, ityp: string, inr: number) =>
  cachedJson<Detail>(join(cacheDir, g, `${ityp}-${inr}.json`), () => getJson<Detail>(`${BASE}/gegenstand/${g}/${ityp}/${inr}?json=True`, http))

const draftsOf = async (g: string): Promise<DraftSummary[]> => {
  await mkdir(join(cacheDir, g), { recursive: true })
  const list = await filterList(81, `${g}-list81.json`, { GP_CODE: [g] })
  return dedupeDraftList((list.rows ?? []).filter((r) => Array.isArray(r) && r[0] === g).map(mapDraftRow))
}

// --- the period's lists ----------------------------------------------------
const drafts = await draftsOf(gp)
const n = romanToInt(gp)
const next = n === null ? null : intToRoman(n + 1)
const laterDrafts = next ? await draftsOf(next).catch(() => []) : []
const vorlagen = ((await filterList(101, `${gp}-list101.json`, { GP_CODE: [gp], ITYP: ['I'], VHG: ['RV'] })).rows ?? [])
  .filter((r) => Array.isArray(r) && r[0] === gp)
  .map(mapVorlageRow)
console.error(`${gp}: ${drafts.length} Entwürfe, ${vorlagen.length} Regierungsvorlagen`)

// --- each draft's own links, as the station map reads them -----------------
const linkedRvs = new Map<number, { gp: string; inr: number }[]>()
let readDrafts = 0
await pool(drafts, CONCURRENCY, async (d) => {
  const det = await detail(gp, 'ME', d.inr)
  linkedRvs.set(d.inr, findRvLinks(parseStages(det.content?.stages)).map((l) => ({ gp: l.gp, inr: l.inr })))
}, () => {
  if (++readDrafts % 50 === 0) console.error(`  Entwürfe ${readDrafts}/${drafts.length}`)
})
const anyLinked = [...linkedRvs.values()].some((l) => l.length > 0)

// --- the rule, through the production module ---------------------------------
let readVorlagen = 0
const result = await buildNamedIndex({
  gp,
  drafts,
  laterDrafts,
  linked: (inr) => (linkedRvs.get(inr)?.length ?? 0) > 0,
  vorlagen,
  linksOf: (v: WitnessVorlage): LinkedDraft[] =>
    drafts
      .filter((d) => linkedRvs.get(d.inr)?.some((l) => l.gp === v.gp && l.inr === v.inr))
      .map((d) => ({ gp: d.gp, inr: d.inr, citation: d.citation, title: d.title })),
  read: async (v): Promise<VorlageReading> => {
    const det = await detail(v.gp, 'I', v.inr)
    if (++readVorlagen % 50 === 0) console.error(`  Vorlagen ${readVorlagen}/${vorlagen.length}`)
    const linkedDrafts: LinkedDraft[] = (det.content?.preconst ?? [])
      .filter((p) => p?.ityp === 'ME' && p.gp_code && p.inr != null)
      .map((p) => ({ gp: String(p.gp_code), inr: Number(p.inr), citation: String(p.zitation ?? `${p.inr}/ME`), title: String(p.betreff ?? '') }))
    const { html, pdf: pdfUrl } = explanationsFormats(mapDocuments(det.content?.documents))
    if (!html) return { explanationsUrl: null, html: null, pdfUrl, linkedDrafts }
    const text = await cachedText(join(cacheDir, 'docs', `${sha1(html)}.html`), async () => {
      const body = await upstreamBytes(html, { timeoutMs: 20_000, retries: 2, userAgent: scriptUserAgent(SCRIPT), maxBytes: Number.POSITIVE_INFINITY })
      return decodeHtml(body.bytes, /charset=([\w-]+)/i.exec(body.contentType ?? '')?.[1])
    })
    return { explanationsUrl: html, html: text, pdfUrl, linkedDrafts }
  },
  readPdf: async (url) => {
    const file = join(cacheDir, 'docs', `${sha1(url)}.pdf`)
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await readFile(file))
    } catch {
      bytes = new Uint8Array((await upstreamBytes(url, { timeoutMs: 30_000, retries: 2, userAgent: scriptUserAgent(SCRIPT), maxBytes: Number.POSITIVE_INFINITY })).bytes)
      await writeFile(file, bytes)
    }
    console.error(`  PDF ${url}`)
    return pdfParagraphs(bytes)
  },
  limit: CONCURRENCY,
  everyVorlage: true,
})

// --- report -----------------------------------------------------------------
const byInr = new Map(drafts.map((d) => [d.inr, d]))
const fmtDays = (from: string | null, to: string) => {
  if (!from || !to) return '?'
  const d = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
  return `${d > 0 ? '+' : ''}${d}`
}
const c = result.counts
console.log(`\nGP ${gp} — „genannt": Entwürfe ohne verknüpfte Regierungsvorlage, deren Titel die Erläuterungen einer anderen Vorlage nennen`)
console.log(`Verknüpfungen der Periode     ${anyLinked ? 'vorhanden' : 'KEINE – die Seite zeigt den Zustand nicht (mayClaimOutcome)'}`)
console.log(`Kandidaten                    ${c.candidates}`)
console.log(`Vorlagen                      ${c.vorlagen} (HTML gelesen ${c.read}, PDF gelesen ${c.pdfsRead}, ungelesen ${c.unread}, Fehler ${c.failed})`)
console.log(`Vollständig                   ${result.complete ? 'ja' : 'NEIN – der Server würde nichts behaupten'}`)
const ex = new Map<string, number>()
for (const e of result.excluded) ex.set(e.reason, (ex.get(e.reason) ?? 0) + 1)
console.log(`Nicht gesucht                 ${[...ex].map(([k, v]) => `${k} ${v}`).join(', ')}`)

const named = Object.entries(result.named).sort((a, b) => Number(a[0]) - Number(b[0]))
console.log(`\nAngenommen: ${named.length}`)
for (const [inr, s] of named) {
  const d = byInr.get(Number(inr))!
  console.log(`\n  ${d.citation} ${gp} — ${d.title}`)
  console.log(`    Frist ${d.deadline} → ${s.rv.citation} (${s.rv.date}, +${s.daysAfterFrist} Tage)`)
  console.log(`    verknüpft mit: ${s.linkedDrafts.map((l) => `${l.citation} ${l.title}`).join(' | ') || '—'}`)
  console.log(`    Erläuterungen: ${s.explanationsUrl}`)
  console.log(`    „${s.quote}"`)
}

if (showCandidates) {
  console.log(`\nVerworfen (Titel-Zeuge vorhanden, eine andere Bedingung nicht): ${result.rejected.length}`)
  for (const r of result.rejected.sort((a, b) => a.draft.inr - b.draft.inr)) {
    console.log(`\n  ${r.draft.citation} ${gp} [${r.reason}] — ${r.draft.title}`)
    console.log(`    Kern: „${r.draft.core}", Frist ${r.draft.deadline}`)
    for (const w of r.witnesses) {
      console.log(`    · ${w.vorlage.citation}${w.fromPdf ? ' [PDF]' : ''} (${w.vorlage.date}, ${fmtDays(r.draft.deadline, w.vorlage.date)} Tage): „${w.quote.slice(0, 220)}${w.quote.length > 220 ? '…' : ''}"`)
    }
  }
}
