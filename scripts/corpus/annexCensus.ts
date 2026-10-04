/**
 * „Nicht geprüft", counted the way the page counts it — and the old-against-new
 * comparison per § that every change to the annex check is measured with
 * (docs/architecture.md §12.41, §12.42).
 *
 * Until 04.10.2026 this lived as three Python files in a session scratchpad;
 * §12.41's figures (624 → 407 §§) had no command in the repo behind them.
 *
 *     pnpm corpus:annex-census -- --out .cache/annex-census/before.json
 *     pnpm corpus:annex-census -- --out .cache/annex-census/after.json
 *     pnpm corpus:annex-census -- --compare .cache/annex-census/before.json .cache/annex-census/after.json
 *
 * The first form reads `/gegenueberstellung` for every draft of the period
 * through a RUNNING server (dev on :3000, or `AUDIT_ORIGIN` for a production
 * build with cold caches — `PORT=3002 node .output/server/index.mjs`; measure
 * chain figures on that one, §12.37), writes one row per annex row to `--out`,
 * and prints:
 *
 *  - **Page view**: §§ shown as „nicht geprüft" — a (law, §) group with at
 *    least one row `check === 'unchecked' && owesCheck`, the page's own rule
 *    (`shared/types/annex.ts`, `owesCheck`). Not raw rows: a first count over
 *    rows (3.755) was wrong, because the page never counts new or unchanged
 *    text as a gap. Per reason: §§, drafts, law groups that print the line.
 *  - **Per §** verified / withheld / unchecked-owing, so a move from one to
 *    another shows up in the totals too.
 *  - **Draft-level** unavailable reasons and caveats (doubtful laws, boundary
 *    note, dropped PDF pages).
 *
 * `--compare` reads two dumps and prints every (law, §) whose state changed,
 * grouped by transition, with examples — the line a commit names („moves
 * class X, and nothing else by a line"). A group that appears or disappears
 * is listed apart: that is a parse change, not a verdict change.
 *
 * Options: `--gp XXVIII` (default), `--concurrency 3`, `--inr 83,121` to
 * restrict the run (the dump then holds only those; compare like with like).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { TextComparisonResponse } from '../../shared/types/annex'
import { argFlag, argPair } from '../lib/args'
import { pool } from '../lib/async'

const ORIGIN = process.env.AUDIT_ORIGIN ?? 'http://localhost:3000'

/** [law, para, change, check, uncheckedReason, owesCheck] — compact, the dumps run to a megabyte */
type Row = [string | null, string | null, string, string, string | null, boolean]
interface DraftDump {
  error?: string
  available?: boolean
  unavailableReason?: string | null
  readFrom?: string | null
  doubtful?: string[]
  boundary?: string | null
  droppedPages?: number
  rows?: Row[]
}
type Dump = Record<string, DraftDump>

async function fetchJson<T>(url: string): Promise<T> {
  // A cold comparison reads the RIS for every law of a package; undici's
  // five-minute header timeout is shorter than the slowest (§ paraTitle.ts).
  const res = await fetch(url, { signal: AbortSignal.timeout(15 * 60 * 1000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

async function dump(gp: string, out: string): Promise<Dump> {
  const list = await fetchJson<{ items: { inr: number }[] }>(`${ORIGIN}/api/drafts?gp=${gp}`)
  const only = argPair('inr')?.split(',').map(Number)
  const inrs = [...new Set(list.items.map((i) => i.inr))].filter((i) => !only || only.includes(i)).sort((a, b) => a - b)
  console.log(`${inrs.length} Entwürfe in GP ${gp} über ${ORIGIN}`)
  const res: Dump = {}
  await pool(inrs, Number(argPair('concurrency') ?? 3), async (inr) => {
    try {
      const d = await fetchJson<TextComparisonResponse>(`${ORIGIN}/api/drafts/${gp}/${inr}/gegenueberstellung`)
      const v = d.verification
      res[inr] = {
        available: d.available,
        unavailableReason: d.unavailableReason,
        readFrom: d.readFrom,
        doubtful: v?.doubtfulLaws ?? [],
        boundary: d.boundaryNote,
        droppedPages: d.droppedPages,
        rows: d.rows.map((r) => [r.law, r.para, r.change, r.check, r.uncheckedReason ?? null, r.owesCheck]),
      }
    } catch (e) {
      res[inr] = { error: String(e) }
    }
  }, (done, total) => { if (done % 20 === 0) console.error(`  … ${done}/${total}`) })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(res))
  console.log(`geschrieben: ${out}`)
  return res
}

const key = (law: string | null, para: string | null) => `${law ?? ''}\u0000${para ?? ''}`

/**
 * One state per (law, §), the way the page resolves a group: withheld wins,
 * then unchecked-owing (that is the pill), then verified; anything else owes
 * nothing. Rows without a § designation form their own null-§ group.
 */
function paragraphStates(d: DraftDump): Map<string, string> {
  const per = new Map<string, Set<string>>()
  for (const [law, para, , check, reason, owes] of d.rows ?? []) {
    const k = key(law, para)
    const s = per.get(k) ?? new Set()
    if (check === 'withheld') s.add('withheld')
    else if (check === 'verified') s.add('verified')
    else if (owes) s.add(`unchecked: ${reason ?? '(kein Grund)'}`)
    per.set(k, s)
  }
  const out = new Map<string, string>()
  for (const [k, s] of per) {
    if (s.has('withheld')) out.set(k, 'withheld')
    else {
      const un = [...s].filter((x) => x.startsWith('unchecked')).sort()
      out.set(k, un.length ? un.join(' | ') : s.has('verified') ? 'verified' : 'owes nothing')
    }
  }
  return out
}

function report(res: Dump) {
  const unavailable = new Map<string, number>()
  const caveats = { doubtful: [] as string[], boundary: [] as string[], droppedPages: [] as string[] }
  const readFrom = new Map<string, number>()
  const states = new Map<string, number>()
  const reasonParas = new Map<string, number>()
  const reasonDrafts = new Map<string, Set<string>>()
  const reasonGroups = new Map<string, Set<string>>()
  let available = 0, errors = 0, shown = 0
  for (const [inr, d] of Object.entries(res)) {
    if (d.error) { errors++; continue }
    if (!d.available) { unavailable.set(d.unavailableReason ?? '?', (unavailable.get(d.unavailableReason ?? '?') ?? 0) + 1); continue }
    available++
    readFrom.set(d.readFrom ?? '?', (readFrom.get(d.readFrom ?? '?') ?? 0) + 1)
    if (d.doubtful?.length) caveats.doubtful.push(inr)
    if (d.boundary) caveats.boundary.push(inr)
    if (d.droppedPages) caveats.droppedPages.push(inr)
    // Reasons per (law, §): a § may carry two reasons on different rows, and
    // the page prints each under the law's pill.
    const reasons = new Map<string, Set<string>>()
    for (const [law, para, , check, reason, owes] of d.rows ?? []) {
      if (check !== 'unchecked' || !owes) continue
      const k = key(law, para)
      const s = reasons.get(k) ?? new Set()
      s.add(reason ?? '(kein Grund)')
      reasons.set(k, s)
    }
    for (const [k, rs] of reasons) {
      shown++
      const law = k.split('\u0000')[0]
      for (const r of rs) {
        reasonParas.set(r, (reasonParas.get(r) ?? 0) + 1)
        reasonDrafts.set(r, (reasonDrafts.get(r) ?? new Set()).add(inr))
        reasonGroups.set(r, (reasonGroups.get(r) ?? new Set()).add(`${inr}|${law}`))
      }
    }
    for (const s of paragraphStates(d).values()) {
      const label = s.startsWith('unchecked') ? 'unchecked (owes a check)' : s
      states.set(label, (states.get(label) ?? 0) + 1)
    }
  }
  const byCount = <K>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1])
  console.log(`\n${Object.keys(res).length} Entwürfe · ${available} mit Gegenüberstellung · ${errors} Fehler · gelesen aus ${byCount(readFrom).map(([k, n]) => `${k} ${n}`).join(', ')}`)
  console.log('\n§§ je Zustand (Gruppe Gesetz × §, wie die Seite sie auflöst)')
  for (const [s, n] of byCount(states)) console.log(`  ${String(n).padStart(5)}  ${s}`)
  console.log(`\nSEITE: ${shown} §§ „nicht geprüft" — je Grund: §§ / Entwürfe / Gesetzesgruppen`)
  for (const [r, n] of byCount(reasonParas)) {
    console.log(`  ${String(n).padStart(5)} / ${String(reasonDrafts.get(r)!.size).padStart(3)} / ${String(reasonGroups.get(r)!.size).padStart(3)}  ${r.slice(0, 90)}`)
  }
  console.log('\nOHNE GEGENÜBERSTELLUNG')
  for (const [r, n] of byCount(unavailable)) console.log(`  ${String(n).padStart(5)}  ${r.slice(0, 90)}`)
  console.log('\nHINWEISE (Entwürfe)')
  for (const [k, inrs] of Object.entries(caveats)) console.log(`  ${String(inrs.length).padStart(5)}  ${k}  ${inrs.slice(0, 15).join(' ')}`)
}

function compare(aPath: string, bPath: string) {
  const a = JSON.parse(readFileSync(aPath, 'utf8')) as Dump
  const b = JSON.parse(readFileSync(bPath, 'utf8')) as Dump
  const trans = new Map<string, { n: number; ex: string[] }>()
  const other: string[] = []
  const inrs = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort((x, y) => Number(x) - Number(y))
  for (const inr of inrs) {
    const A = a[inr] ?? {}, B = b[inr] ?? {}
    if (A.error || B.error) { other.push(`${inr}: Fehler ${A.error ?? ''} → ${B.error ?? ''}`); continue }
    if (A.available !== B.available) other.push(`${inr}: verfügbar ${A.available} → ${B.available}`)
    if (JSON.stringify(A.doubtful ?? []) !== JSON.stringify(B.doubtful ?? [])) other.push(`${inr}: auffällig ${JSON.stringify(A.doubtful)} → ${JSON.stringify(B.doubtful)}`)
    if ((A.boundary ?? null) !== (B.boundary ?? null)) other.push(`${inr}: Grenzhinweis geändert`)
    const sa = paragraphStates(A), sb = paragraphStates(B)
    for (const k of new Set([...sa.keys(), ...sb.keys()])) {
      const from = sa.get(k) ?? '(keine Gruppe)', to = sb.get(k) ?? '(keine Gruppe)'
      if (from === to) continue
      const t = `${from}  →  ${to}`
      const e = trans.get(t) ?? { n: 0, ex: [] }
      e.n++
      const [law, para] = k.split('\u0000')
      if (e.ex.length < 4) e.ex.push(`${inr}/ME ${(law || '–').slice(0, 30)} ${para || '–'}`)
      trans.set(t, e)
    }
  }
  const sorted = [...trans].sort((x, y) => y[1].n - x[1].n)
  console.log(`${sorted.reduce((s, [, e]) => s + e.n, 0)} §§ wechseln den Zustand`)
  for (const [t, e] of sorted) console.log(`  ${String(e.n).padStart(4)}  ${t}\n        z. B. ${e.ex.join(' · ')}`)
  if (other.length) { console.log('\nEntwurfsebene'); for (const o of other) console.log(`  ${o}`) }
}

if (argFlag('compare')) {
  const i = process.argv.indexOf('--compare')
  compare(process.argv[i + 1]!, process.argv[i + 2]!)
} else {
  const out = argPair('out') ?? '.cache/annex-census/latest.json'
  report(await dump(argPair('gp') ?? 'XXVIII', out))
}
