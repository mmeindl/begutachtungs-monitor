#!/usr/bin/env node
/**
 * Measures the Begutachtungsende → Regierungsvorlage latency of one
 * Gesetzgebungsperiode, straight from the Parliament API — the base rate
 * behind the "bisher keine Regierungsvorlage" wording on the detail page
 * (shared/utils/deadlines.ts, docs/architecture.md §12.10).
 *
 * Usage:   node scripts/rv-latency.mjs XXVII [cacheDir]
 *
 * Plain Node ≥ 18, no dependencies. One list-81 call plus one detail call
 * per Ministerialentwurf (≈350 for GP XXVII), four at a time, raw JSON
 * cached in `cacheDir` (default `.cache/rv-latency/`) so a rerun is free.
 * Output: a summary on stdout and `<cacheDir>/<GP>-lags.json` with one
 * row per draft.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = 'https://www.parlament.gv.at'
const HEADERS = {
  'User-Agent': 'begutachtungs-monitor/0.1 (ziviltech-prototyp; scripts/rv-latency)',
  Accept: 'application/json',
}
const CONCURRENCY = 4

const gp = process.argv[2]
if (!gp || !/^[IVXLC]+$/.test(gp)) {
  console.error('Usage: node scripts/rv-latency.mjs <GP, e.g. XXVII> [cacheDir]')
  process.exit(1)
}
const cacheDir = process.argv[3] ?? join('.cache', 'rv-latency')
await mkdir(join(cacheDir, gp), { recursive: true })

async function cachedJson(file, load) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    const data = await load()
    await writeFile(file, JSON.stringify(data))
    return data
  }
}

async function fetchJson(url, init) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: HEADERS, signal: AbortSignal.timeout(15_000) })
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`)
      if (!res.ok) throw new Error(`HTTP ${res.status} (not retried)`)
      return await res.json()
    } catch (err) {
      if (attempt === 2 || String(err).includes('not retried')) throw err
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
}

/** "yyyymmdd" → ISO date; anything else → null. */
function fristsortToIso(v) {
  const s = String(v ?? '')
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null
}

/** "dd.mm.yyyy" → ISO date; anything else → null. */
function germanToIso(v) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(v ?? ''))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}

function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

// --- list 81 -------------------------------------------------------------
const list = await cachedJson(join(cacheDir, `${gp}-list81.json`), () =>
  fetchJson(`${BASE}/Filter/api/filter/data/81?js=eval&showAll=true&sortrnr=11&ascDesc=DESC`, {
    method: 'POST',
    body: JSON.stringify({ GP_CODE: [gp] }),
  }),
)
const rows = (list.rows ?? []).filter((r) => Array.isArray(r) && r[0] === gp)
console.error(`${gp}: ${rows.length} Ministerialentwürfe in list 81`)

// --- details, four at a time ---------------------------------------------
const queue = rows.map((r) => ({
  inr: Number(r[2]),
  citation: String(r[5] ?? ''),
  ministry: String(r[6] ?? ''),
  arrival: String(r[10] ?? '').slice(0, 10) || null,
  frist: fristsortToIso(r[14]),
}))
const out = []
let done = 0
async function worker() {
  for (;;) {
    const item = queue.shift()
    if (!item) return
    try {
      const detail = await cachedJson(join(cacheDir, gp, `ME-${item.inr}.json`), () =>
        fetchJson(`${BASE}/gegenstand/${gp}/ME/${item.inr}?json=True`),
      )
      const stages = detail?.content?.stages ?? []
      const rvs = []
      for (const st of stages) {
        for (const m of String(st?.text ?? '').matchAll(/\/gegenstand\/([IVXLC]+)\/I\/(\d+)/g)) {
          rvs.push({ gp: m[1], inr: Number(m[2]), date: germanToIso(st?.date) })
        }
      }
      const firstRv = rvs[0] ?? null
      out.push({
        ...item,
        rvCount: rvs.length,
        firstRv,
        rvInOtherGp: rvs.some((rv) => rv.gp !== gp),
        lagDays: firstRv?.date && item.frist ? daysBetween(item.frist, firstRv.date) : null,
      })
    } catch (err) {
      out.push({ ...item, error: String(err) })
    }
    done++
    if (done % 25 === 0) console.error(`  ${done}/${rows.length}`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
out.sort((a, b) => a.inr - b.inr)
await writeFile(join(cacheDir, `${gp}-lags.json`), JSON.stringify(out, null, 1))

// --- summary -------------------------------------------------------------
const ok = out.filter((r) => !r.error)
const withRv = ok.filter((r) => r.firstRv)
const lags = withRv.map((r) => r.lagDays).filter((d) => d !== null).sort((a, b) => a - b)
const within = (days) => lags.filter((d) => d <= days).length
const pct = (n, of) => (of ? `${Math.round((1000 * n) / of) / 10} %` : '–')
const lastFrist = ok.map((r) => r.frist).filter(Boolean).sort().at(-1)

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
  const buckets = [[0, 180], [181, 365], [366, 730], [731, 99_999]]
  console.log(`\nEntwürfe ohne RV nach Abstand ihres Fristendes zum letzten Fristende der GP (n = ${dead.length})`)
  for (const [lo, hi] of buckets) {
    const n = dead.filter((r) => {
      const d = daysBetween(r.frist, lastFrist)
      return d >= lo && d <= hi
    }).length
    console.log(`  ${String(lo).padStart(4)}–${hi === 99_999 ? '…' : String(hi).padStart(4)} Tage   ${n}`)
  }
}
