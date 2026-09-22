#!/usr/bin/env vite-node
/**
 * Measures the Begutachtungsende → Regierungsvorlage latency of one
 * Gesetzgebungsperiode, straight from the Parliament API — the base rate
 * behind the "bisher keine Regierungsvorlage" wording on the detail page
 * (app/utils/deadlines.ts, docs/architecture.md §12.10).
 *
 * Usage:   npx vite-node scripts/rv-latency.ts XXVII [cacheDir]
 *
 * One list-81 call plus one detail call per Ministerialentwurf (≈350 for GP
 * XXVII), four at a time, raw JSON cached in `cacheDir` (default
 * `.cache/rv-latency/`) so a rerun is free. `scripts/stations-corpus.ts`
 * reads the same directory. Output: a summary on stdout and
 * `<cacheDir>/<GP>-lags.json` with one row per draft.
 *
 * Was plain Node with no dependencies until 22.09.2026, which bought nothing
 * and cost a typecheck: `tsconfig.tools.json` covers every `.ts` under
 * `scripts/`, so 1.330 lines of `.mjs` were the one half of the repo that
 * nothing looked at.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PARLIAMENT as BASE, getJson } from './lib/http'
import { cachedJson } from './lib/diskCache'
import { pool } from './lib/async'

const SCRIPT = 'rv-latency'
const CONCURRENCY = 4

const gp = process.argv[2]
if (!gp || !/^[IVXLC]+$/.test(gp)) {
  console.error('Usage: npx vite-node scripts/rv-latency.ts <GP, e.g. XXVII> [cacheDir]')
  process.exit(1)
}
const cacheDir = process.argv[3] ?? join('.cache', 'rv-latency')
await mkdir(join(cacheDir, gp), { recursive: true })

/** Three attempts on a 5xx or a dropped connection; a 4xx is the answer and is not retried. */
function fetchJson<T>(url: string, body?: unknown): Promise<T> {
  return getJson<T>(url, {
    script: SCRIPT,
    attempts: 3,
    backoffMs: (retry) => 500 * retry,
    timeoutMs: 15_000,
    ...(body === undefined ? {} : { method: 'POST' as const, body }),
  })
}

/** "yyyymmdd" → ISO date; anything else → null. */
function fristsortToIso(v: unknown): string | null {
  const s = String(v ?? '')
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null
}

/** "dd.mm.yyyy" → ISO date; anything else → null. */
function germanToIso(v: unknown): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(v ?? ''))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}

function percentile(sorted: readonly number[], p: number): number | null {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]!
}

interface Draft {
  inr: number
  citation: string
  ministry: string
  arrival: string | null
  frist: string | null
}

interface Rv {
  gp: string
  inr: number
  date: string | null
}

interface Row extends Draft {
  rvCount?: number
  firstRv?: Rv | null
  rvInOtherGp?: boolean
  lagDays?: number | null
  error?: string
}

interface Stage {
  text?: string
  date?: string
}

// --- list 81 -------------------------------------------------------------
const list = await cachedJson<{ rows?: unknown[][] }>(join(cacheDir, `${gp}-list81.json`), () =>
  fetchJson(`${BASE}/Filter/api/filter/data/81?js=eval&showAll=true&sortrnr=11&ascDesc=DESC`, { GP_CODE: [gp] }),
)
const rows = (list.rows ?? []).filter((r) => Array.isArray(r) && r[0] === gp)
console.error(`${gp}: ${rows.length} Ministerialentwürfe in list 81`)

// --- details, four at a time ---------------------------------------------
const drafts: Draft[] = rows.map((r) => ({
  inr: Number(r[2]),
  citation: String(r[5] ?? ''),
  ministry: String(r[6] ?? ''),
  arrival: String(r[10] ?? '').slice(0, 10) || null,
  frist: fristsortToIso(r[14]),
}))
let done = 0
const out: Row[] = await pool(drafts, CONCURRENCY, async (item): Promise<Row> => {
  try {
    const detail = await cachedJson<{ content?: { stages?: Stage[] } }>(join(cacheDir, gp, `ME-${item.inr}.json`), () =>
      fetchJson(`${BASE}/gegenstand/${gp}/ME/${item.inr}?json=True`),
    )
    const stages = detail?.content?.stages ?? []
    const rvs: Rv[] = []
    for (const st of stages) {
      for (const m of String(st?.text ?? '').matchAll(/\/gegenstand\/([IVXLC]+)\/I\/(\d+)/g)) {
        rvs.push({ gp: m[1]!, inr: Number(m[2]), date: germanToIso(st?.date) })
      }
    }
    const firstRv = rvs[0] ?? null
    return {
      ...item,
      rvCount: rvs.length,
      firstRv,
      rvInOtherGp: rvs.some((rv) => rv.gp !== gp),
      lagDays: firstRv?.date && item.frist ? daysBetween(item.frist, firstRv.date) : null,
    }
  } catch (err) {
    return { ...item, error: String(err) }
  }
}, () => {
  if (++done % 25 === 0) console.error(`  ${done}/${rows.length}`)
})
out.sort((a, b) => a.inr - b.inr)
await writeFile(join(cacheDir, `${gp}-lags.json`), JSON.stringify(out, null, 1))

// --- summary -------------------------------------------------------------
const ok = out.filter((r) => !r.error)
const withRv = ok.filter((r) => r.firstRv)
const lags = withRv.map((r) => r.lagDays).filter((d): d is number => d !== null && d !== undefined).sort((a, b) => a - b)
const within = (days: number) => lags.filter((d) => d <= days).length
const pct = (n: number, of: number) => (of ? `${Math.round((1000 * n) / of) / 10} %` : '–')
const lastFrist = ok.map((r) => r.frist).filter((f): f is string => Boolean(f)).sort().at(-1)

console.log(`\nGP ${gp} — Begutachtungsende → erste Regierungsvorlage`)
console.log(`Ministerialentwürfe           ${ok.length}${out.length - ok.length ? ` (+${out.length - ok.length} Fehler)` : ''}`)
console.log(`… mit Regierungsvorlage       ${withRv.length} (${pct(withRv.length, ok.length)})`)
console.log(`… davon RV in anderer GP      ${withRv.filter((r) => r.rvInOtherGp).length}`)
console.log(`… ohne Regierungsvorlage      ${ok.length - withRv.length} (${pct(ok.length - withRv.length, ok.length)})`)
console.log(`Letztes Fristende in der GP   ${lastFrist ?? '–'}`)
console.log(`\nLatenz in Tagen (n = ${lags.length})`)
for (const p of [25, 50, 75, 90, 95]) console.log(`  p${p}   ${percentile(lags, p)}`)
console.log(`  max   ${lags.at(-1) ?? '–'}`)
console.log(`  negativ (RV vor Fristende)   ${lags.filter((d) => d < 0).length}`)
console.log(`\nAnteil der RVs binnen …`)
for (const d of [90, 180, 270, 365, 545, 730]) console.log(`  ${String(d).padStart(3)} Tagen   ${pct(within(d), lags.length)}`)

// When did the drafts without RV end their Frist, relative to the GP's last Frist?
if (lastFrist) {
  const dead = ok.filter((r) => !r.firstRv && r.frist)
  const buckets: [number, number][] = [[0, 180], [181, 365], [366, 730], [731, 99_999]]
  console.log(`\nEntwürfe ohne RV nach Abstand ihres Fristendes zum letzten Fristende der GP (n = ${dead.length})`)
  for (const [lo, hi] of buckets) {
    const n = dead.filter((r) => {
      const d = daysBetween(r.frist!, lastFrist)
      return d >= lo && d <= hi
    }).length
    console.log(`  ${String(lo).padStart(4)}–${hi === 99_999 ? '…' : String(hi).padStart(4)} Tage   ${n}`)
  }
}
