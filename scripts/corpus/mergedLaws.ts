#!/usr/bin/env vite-node
/**
 * How often the ME→RV comparison names laws only the Regierungsvorlage
 * carries (`lawsOnlyInTo`, the „ändert ein weiteres Gesetz, das in diesem
 * Entwurf nicht vorkommt" note), split by what Parliament's record says about
 * the Vorlage: does it bundle other Ministerialentwürfe (`bundlesOtherDrafts`
 * on its `preconst`) — true, false, or no record (null).
 *
 * Usage:   npx vite-node scripts/corpus/mergedLaws.ts XXVII [baseUrl]
 *
 * The diff comes from a running dev server (default http://localhost:3000),
 * i.e. the production path; the details are cached next to rvLatency's in
 * `.cache/rv-latency/`. Output: summary on stdout, rows in
 * `.cache/merged-laws/<GP>.json`.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LawDiffResponse } from '#shared/types'
import { PARLIAMENT as BASE, getJson } from '../lib/http'
import { cachedJson } from '../lib/diskCache'
import { pool } from '../lib/async'
import { bundlesOtherDrafts } from '../../server/utils/parliament/detailJson'

const SCRIPT = 'corpus/mergedLaws'
const gp = process.argv[2]
if (!gp || !/^[IVXLC]+$/.test(gp)) {
  console.error('Usage: npx vite-node scripts/corpus/mergedLaws.ts <GP> [baseUrl]')
  process.exit(1)
}
const app = process.argv[3] ?? 'http://localhost:3000'
const cacheDir = join('.cache', 'rv-latency')
const outDir = join('.cache', 'merged-laws')
await mkdir(join(cacheDir, gp), { recursive: true })
await mkdir(outDir, { recursive: true })

const fetchJson = <T>(url: string, body?: unknown, timeoutMs = 20_000) =>
  getJson<T>(url, {
    script: SCRIPT,
    attempts: 3,
    backoffMs: (r) => 1000 * r,
    timeoutMs,
    ...(body === undefined ? {} : { method: 'POST' as const, body }),
  })

interface Detail {
  content?: { stages?: { text?: string }[]; preconst?: { gp_code?: string; ityp?: string; inr?: number | string }[] }
}

const list = await cachedJson<{ rows?: unknown[][] }>(join(cacheDir, `${gp}-list81.json`), () =>
  fetchJson(`${BASE}/Filter/api/filter/data/81?js=eval&showAll=true&sortrnr=11&ascDesc=DESC`, { GP_CODE: [gp] }),
)
const inrs = (list.rows ?? []).filter((r) => Array.isArray(r) && r[0] === gp).map((r) => Number(r[2]))
console.error(`${gp}: ${inrs.length} Ministerialentwürfe`)

interface Row {
  inr: number
  rvs: string[]
  bundled: boolean | null
  available?: boolean
  reason?: string | null
  onlyInTo?: { article: string; units: number }[]
  onlyInFrom?: number
  error?: string
}

let done = 0
const rows: Row[] = await pool(inrs, 2, async (inr): Promise<Row> => {
  try {
    const me = await cachedJson<Detail>(join(cacheDir, gp, `ME-${inr}.json`), () =>
      fetchJson(`${BASE}/gegenstand/${gp}/ME/${inr}?json=True`),
    )
    const rvs = new Set<string>()
    for (const st of me.content?.stages ?? []) {
      for (const m of String(st?.text ?? '').matchAll(/\/gegenstand\/([IVXLC]+)\/I\/(\d+)/g)) rvs.add(`${m[1]}/${m[2]}`)
    }
    if (!rvs.size) return { inr, rvs: [], bundled: null }
    // Tri-state over every linked Vorlage: true if any bundles, null if none has a record.
    const states = await Promise.all(
      [...rvs].map(async (key) => {
        const [rgp, rinr] = key.split('/')
        const rv = await cachedJson<Detail>(join(cacheDir, rgp!, `I-${rinr}.json`), async () => {
          await mkdir(join(cacheDir, rgp!), { recursive: true })
          return fetchJson(`${BASE}/gegenstand/${rgp}/I/${rinr}?json=True`)
        })
        return bundlesOtherDrafts(rv.content?.preconst, gp, inr)
      }),
    )
    const bundled = states.includes(true) ? true : states.includes(false) ? false : null
    const diff = await fetchJson<LawDiffResponse>(`${app}/api/drafts/${gp}/${inr}/diff?von=me&bis=rv`, undefined, 120_000)
    return {
      inr,
      rvs: [...rvs],
      bundled,
      available: diff.available,
      reason: diff.unavailableReason,
      onlyInTo: diff.lawsOnlyInTo,
      onlyInFrom: diff.lawsOnlyInFrom.length,
    }
  } catch (err) {
    return { inr, rvs: [], bundled: null, error: String(err) }
  }
}, () => {
  if (++done % 25 === 0) console.error(`  ${done}/${inrs.length}`)
})
rows.sort((a, b) => a.inr - b.inr)
await writeFile(join(outDir, `${gp}.json`), JSON.stringify(rows, null, 1))

const withRv = rows.filter((r) => r.rvs.length)
const compared = withRv.filter((r) => r.available)
const noted = compared.filter((r) => r.onlyInTo?.length)
const by = (b: boolean | null) => noted.filter((r) => r.bundled === b)
const fmt = (r: Row) => `${r.inr}/ME (${r.onlyInTo!.length}: ${r.onlyInTo!.slice(0, 3).map((l) => l.article.slice(0, 60)).join(' | ')})`
console.log(`${gp}: ${rows.length} drafts, ${withRv.length} with RV, ${compared.length} compared ME→RV, ${rows.filter((r) => r.error).length} errors`)
console.log(`  note shown: ${noted.length}`)
for (const b of [false, true, null]) {
  const set = by(b)
  const one = set.filter((r) => r.onlyInTo!.length === 1).length
  console.log(`  bundled=${b}: ${set.length} (one law: ${one})`)
  for (const r of set) console.log(`    ${fmt(r)}`)
}
console.log(`  compared, by bundled: false ${compared.filter((r) => r.bundled === false).length}, true ${compared.filter((r) => r.bundled === true).length}, null ${compared.filter((r) => r.bundled === null).length}`)
