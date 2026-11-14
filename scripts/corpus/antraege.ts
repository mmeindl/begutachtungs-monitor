#!/usr/bin/env node
/**
 * Every Initiativantrag of one period through the PRODUCTION decisions of
 * `/api/antraege` (`server/utils/parliament/antraege.ts`) — and the
 * question the plan asked before the list column may stand in for the flag
 * (`docs/research/umsetzungsplan-weitere-wege.md`, step 3): does list 101's
 * `Status` predict `statementsstate`?
 *
 * Usage:   pnpm corpus:antraege -- XXVIII [cacheDir] [perState]
 *
 * Reads list 101's Anträge (`ITYP A`, `ART A`), the BGBl Teil-I Jahrgänge
 * of the period, and the detail record of EVERY Antrag — not only those the
 * endpoint reads (`needsReading`), since the comparison needs the flag on
 * all of them. One request at a time, paced; raw JSON cached in `cacheDir`
 * (default `.cache/antraege/`). The Jahrgänge come from
 * `.cache/ohne-begutachtung/` where `corpus:ohne-begutachtung` left them.
 *
 * For a period that has ended, an Antrag's record no longer changes, and
 * `.cache/begutachtung-skipped/<GP>/A-<n>.json` (`corpus:skipped`) is read
 * where it exists instead of asking Parliament again. A running period is
 * always read fresh into `cacheDir` — the flag is the thing measured.
 *
 * Output: the agreement tables (status × flag; Parliament's own
 * „Stellungnehmen" button in the row × flag), the state split, and up to
 * `perState` rows per state in full, to be read. No club is printed: the
 * titles come without them (`mapAntragRow`), and Parliament's prose is cut
 * before its „Dafür: …".
 */
import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { AntragState } from '../../shared/types'
import { carriesDraft } from '../../shared/utils/antragPath'
import { ANTRAG_PATHS } from '../../shared/utils/antragPathTable'
import { gpHasEnded } from '../../shared/utils/gp'
import { todayIso } from '../../shared/utils/format'
import { classifyAntrag, readAntragDetail } from '../../server/utils/parliament/antraege'
import { isMiterledigt, mergedDe, mergedWithOf } from '../../shared/utils/miterledigung'
import { stripHtmlToText } from '../../server/utils/parliament/htmlText'
import { mapAntragRow } from '../../server/utils/parliament/list101'
import { pickBgblIForItem } from '../../server/utils/ris/bgblVorlage'
import { yearsOfPeriod } from '../../server/utils/ris/skippedLaws'
import { PARLIAMENT, getJson } from '../lib/http'
import { cachedJson } from '../lib/diskCache'
import { fetchBgblRecords } from '../lib/corpus'
import { pool, sleep } from '../lib/async'

const SCRIPT = 'corpus/antraege'
/** One request at a time, and a pause between them. */
const PACE_MS = 300

const gp = process.argv[2] ?? 'XXVIII'
if (!/^[IVXLC]+$/.test(gp)) {
  console.error('Usage: pnpm corpus:antraege -- <GP, e.g. XXVIII> [cacheDir] [perState]')
  process.exit(1)
}
const cacheDir = process.argv[3] ?? join('.cache', 'antraege')
const perState = Number(process.argv[4] ?? 20)
const ended = gpHasEnded(gp, null)
const http = { script: SCRIPT, attempts: 3, backoffMs: (n: number) => 1000 * n, timeoutMs: 60_000 }
const say = (line = '') => console.log(line)

interface ListAnswer {
  rows?: unknown[][]
}
interface Detail {
  content?: { statementsstate?: unknown; status?: { description?: string | null } | null; phase?: { stages?: { text?: string | null }[] | null }[] | null }
}

await mkdir(join(cacheDir, gp), { recursive: true })
const rawRows = (await cachedJson<ListAnswer>(join(cacheDir, gp, 'list101.json'), () =>
  getJson(`${PARLIAMENT}/Filter/api/filter/data/101?js=eval&showAll=true`, { ...http, method: 'POST', body: { GP_CODE: [gp], ITYP: ['A'], ART: ['A'] } }))).rows ?? []
if (rawRows.some((r) => r[0] !== gp || r[5] !== 'A')) throw new Error('Liste 101: GP- oder ART-Filter hat nicht gegriffen')
const rows = rawRows.map(mapAntragRow)
/** Parliament's own „Stellungnehmen" link in the row's buttons (column 19) — a second candidate for the flag. */
const hasButton = new Map(rawRows.map((r) => [Number(r[2]), String(r[19] ?? '').includes('Stellungnehmen')]))

const years = yearsOfPeriod(gp, todayIso()) ?? []
const records: Awaited<ReturnType<typeof fetchBgblRecords>> = []
for (const y of years) records.push(...(await cachedJson(join('.cache', 'ohne-begutachtung', `bgbl-${y}-v2.json`), () => fetchBgblRecords(SCRIPT, `${y}-01-01`, `${y}-12-31`))))

const exists = (file: string) => access(file).then(() => true, () => false)
let fetched = 0
console.error(`GP ${gp}: ${rows.length} Anträge, ${ended ? 'Periode beendet' : 'laufende Periode'}; lese die Details einzeln …`)
const details = await pool(rows, 1, async (row) => {
  const seeded = join('.cache', 'begutachtung-skipped', gp, `A-${row.inr}.json`)
  const file = ended && (await exists(seeded)) ? seeded : join(cacheDir, gp, `A-${row.inr}.json`)
  try {
    return await cachedJson<Detail>(file, async () => {
      fetched++
      await sleep(PACE_MS)
      return getJson<Detail>(`${PARLIAMENT}/gegenstand/${gp}/A/${row.inr}?json=True`, http)
    })
  } catch {
    return null
  }
}, (done, total) => { if (done % 50 === 0) console.error(`  ${done}/${total}`) })
console.error(`${fetched} Details neu gelesen.`)

const carried = new Set(Object.values(ANTRAG_PATHS[gp] ?? {}).filter((p) => carriesDraft(p)).map((p) => p.antrag.inr))
const flagOf = (d: Detail | null): string => {
  const s = d?.content?.statementsstate
  if (d === null) return 'unread'
  if (s === '1' || s === 1) return '1'
  if (s === '0' || s === 0) return '0'
  return typeof s === 'string' ? `${s.slice(0, 1)}…` : String(s)
}
/* Parliament's prose with every vote taken out — the clubs' (`Dafür: …`,
 * `(dafür: V, S; dagegen: F)`) and the house's word for it — so no club
 * reaches the output. */
const prose = (d: Detail | null) => stripHtmlToText(d?.content?.status?.description ?? '')
  .replace(/\s*(?:Einstimmig|Einhellig|mehrstimmig)?\s*\((?:[^()]*\bdafür\b[^()]*|Zustimmung[^()]*)\)/gi, '')
  .replace(/,?\s*Dafür:[\s\S]*?(?=Beschlossen|$)/gi, ' ')
  .replace(/\s+/g, ' ')
  .slice(0, 140)

// ---------------------------------------------------------------------------
// 1. Does the list column predict the flag?
// ---------------------------------------------------------------------------
function crossTab(label: string, keyOf: (i: number) => string) {
  const table = new Map<string, Map<string, number>>()
  rows.forEach((_, i) => {
    const k = keyOf(i)
    const f = flagOf(details[i]!)
    const row = table.get(k) ?? new Map<string, number>()
    row.set(f, (row.get(f) ?? 0) + 1)
    table.set(k, row)
  })
  const flags = [...new Set(rows.map((_, i) => flagOf(details[i]!)))].sort()
  say(`\n=== ${label} × statementsstate (GP ${gp}, n = ${rows.length}) ===`)
  say(['', ...flags].map((c) => c.padStart(10)).join(''))
  for (const [k, row] of [...table.entries()].sort()) say([k, ...flags.map((f) => String(row.get(f) ?? 0))].map((c) => c.padStart(10)).join(''))
}
crossTab('Status (Spalte 10)', (i) => `Status ${rows[i]!.status}`)
crossTab('„Stellungnehmen"-Knopf (Spalte 19)', (i) => (hasButton.get(rows[i]!.inr) ? 'Knopf' : 'kein Knopf'))
// The proxy the endpoint would use if it trusted the column: status 1–4 ⇒ open.
const proxyOpen = (i: number) => ['1', '2', '3', '4'].includes(rows[i]!.status)
const agree = rows.filter((_, i) => proxyOpen(i) === (flagOf(details[i]!) === '1')).length
const agreeButton = rows.filter((r, i) => hasButton.get(r.inr) === (flagOf(details[i]!) === '1')).length
say(`\nStatus 1–4 ⇔ Flag „1": ${agree} von ${rows.length} übereinstimmend.`)
say(`Knopf ⇔ Flag „1":        ${agreeButton} von ${rows.length} übereinstimmend.`)
const disagree = rows.flatMap((r, i) => (proxyOpen(i) !== (flagOf(details[i]!) === '1') ? [`  ${r.citation}  Status ${r.status}  Flag ${flagOf(details[i]!)}  Knopf ${hasButton.get(r.inr) ? 'ja' : 'nein'}  ${prose(details[i]!)}`] : []))
if (disagree.length) say(`Abweichungen:\n${disagree.join('\n')}`)

// ---------------------------------------------------------------------------
// 2. The state split, through the production classifier
// ---------------------------------------------------------------------------
const running = !ended
const states = rows.map((row, i) => {
  if (carried.has(row.inr)) return 'excluded (Zeile des Entwurfs)' as const
  const bgbl = pickBgblIForItem(records, gp, { ityp: 'A', inr: row.inr })
  const d = details[i]
  // Every record is read here, so the endpoint's state is the one with
  // the reading wherever the endpoint would read it.
  return classifyAntrag(row, { running, promulgated: bgbl !== null, reading: d ? readAntragDetail(d.content) : undefined })
})
const split = new Map<string, number>()
for (const s of states) split.set(s, (split.get(s) ?? 0) + 1)
say(`\n=== Zustände (GP ${gp}) ===`)
for (const [s, n] of [...split.entries()].sort((a, b) => b[1] - a[1])) say(`${String(n).padStart(5)}  ${s}`)

// ---------------------------------------------------------------------------
// 3. Up to `perState` rows per state, to be read
// ---------------------------------------------------------------------------
const order: (AntragState | 'excluded (Zeile des Entwurfs)')[] = ['open', 'pending', 'pending-unverified', 'decided', 'promulgated', 'rejected', 'withdrawn', 'merged', 'ended', 'lapsed', 'excluded (Zeile des Entwurfs)']
for (const s of order) {
  const idx = states.flatMap((st, i) => (st === s ? [i] : []))
  if (!idx.length) continue
  say(`\n--- ${s} (${idx.length}, gezeigt ${Math.min(perState, idx.length)}) ---`)
  for (const i of idx.slice(0, perState)) {
    const r = rows[i]!
    const bgbl = pickBgblIForItem(records, gp, { ityp: 'A', inr: r.inr })
    say(`${r.citation.padEnd(8)} S${r.status} ${r.voteCarried ? 'V' : '-'} F${flagOf(details[i]!).padEnd(6)} ${r.date}  ${r.title.slice(0, 60)}`)
    say(`         ${bgbl ? `${bgbl.nummer} · ` : ''}${prose(details[i]!)}`)
  }
}

// ---------------------------------------------------------------------------
// 4. The Miterledigungen: what the item's page said before 14.11.2026
// ---------------------------------------------------------------------------
// Before `shared/utils/miterledigung.ts` the page's outcome reading
// (`houseOutcomeOf`) knew no Miterledigung: without a Kundmachung such an
// item read „Im Parlament" in a running period and „Ohne Beschluss –
// Gesetzgebungsperiode beendet" after it.
const merged = rows.flatMap((r, i) => (isMiterledigt(details[i]?.content?.status?.description) ? [{ r, i }] : []))
say(`\n=== Miterledigt (GP ${gp}): ${merged.length} ===`)
for (const { r, i } of merged) {
  const bgbl = pickBgblIForItem(records, gp, { ityp: 'A', inr: r.inr })
  const before = bgbl ? 'Gesetz geworden' : ended ? 'Ohne Beschluss – Gesetzgebungsperiode beendet' : 'Im Parlament'
  say(`${r.citation.padEnd(8)} vorher „${before}" → jetzt „${bgbl ? 'Gesetz geworden' : mergedDe(mergedWithOf(details[i]?.content?.status?.description, details[i]?.content?.phase))}"`)
}
