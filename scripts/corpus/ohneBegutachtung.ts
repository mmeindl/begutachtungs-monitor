#!/usr/bin/env node
/**
 * The laws of one period without a Begutachtung, through the PRODUCTION
 * classification (`server/utils/ris/skippedLaws.ts`, docs/architecture.md
 * §12.68) — and every row it would show, printed in full, because the list
 * is validated by reading it.
 *
 * Usage:   pnpm corpus:ohne-begutachtung -- XXVIII [cacheDir] [memoJson]
 *
 * Reads what the endpoint reads, from the sources directly: the BGBl Teil-I
 * Jahrgänge of the period (RIS, through `bgblRecordOf`), list 81 of the
 * period and of the one before, list 101's Vorlagen and Anträge, and the
 * detail record of every Ministerialentwurf of both periods for the
 * Vorlagen its stage record links (`findRvLinks` — the station map's own
 * reading, `stationMap.chainOf`). ≈ 500 detail calls for GP XXVIII, four at
 * a time, raw JSON cached in `cacheDir` (default `.cache/ohne-begutachtung/`).
 *
 * ONE DIFFERENCE FROM THE ENDPOINT, on purpose: the chain's Kundmachung of a
 * Vorlage (the `bgbl` signal) needs the Vorlage's own record and RIS, i.e.
 * the whole station map; the script reads the Vorlage links only and the
 * Antrag route's Kundmachung from the table. The endpoint can therefore find
 * MORE laws consulted, never fewer — the script's `none` count is an upper
 * bound of the list's.
 *
 * Then the comparison with the memo's corpus (`begutachtungSkipped.ts`,
 * `<GP>-skipped.json`, read-only): per BGBl number, every disagreement on
 * consulted / exempt / skipped for laws both know, and the laws only one of
 * them knows.
 */
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { DraftSummary } from '../../shared/types'
import { ANTRAG_PATHS } from '../../shared/utils/antragPathTable'
import { previousGp } from '../../shared/utils/gp'
import { todayIso } from '../../shared/utils/format'
import { findRvLinks, parseStages, type RawStage } from '../../server/utils/parliament/detailJson'
import { mapDraftRow } from '../../server/utils/parliament/list81'
import { mapAntragRow, mapVorlageRow } from '../../server/utils/parliament/list101'
import { bgblIKey, classifySkippedLaws, yearsOfPeriod, type ClassifiedLaw, type ParliamentItem } from '../../server/utils/ris/skippedLaws'
import { PARLIAMENT, getJson } from '../lib/http'
import { cachedJson } from '../lib/diskCache'
import { fetchBgblRecords } from '../lib/corpus'
import { pool } from '../lib/async'
import type { SkippedRow } from '../lib/skippedReport'

const SCRIPT = 'corpus/ohneBegutachtung'
const CONCURRENCY = 4

const gp = process.argv[2] ?? 'XXVIII'
if (!/^[IVXLC]+$/.test(gp)) {
  console.error('Usage: pnpm corpus:ohne-begutachtung -- <GP, e.g. XXVIII> [cacheDir] [memoJson]')
  process.exit(1)
}
const cacheDir = process.argv[3] ?? join('.cache', 'ohne-begutachtung')
const memoFile = process.argv[4] ?? join('.cache', 'begutachtung-skipped', `${gp}-skipped.json`)
const prev = previousGp(gp)

interface ListAnswer {
  rows?: unknown[][]
}

const http = { script: SCRIPT, attempts: 3, backoffMs: (n: number) => 1000 * n, timeoutMs: 60_000 }

function filterList(listId: number, body: unknown): Promise<ListAnswer> {
  return getJson<ListAnswer>(`${PARLIAMENT}/Filter/api/filter/data/${listId}?js=eval&showAll=true`, { ...http, method: 'POST', body })
}

const say = (line = '') => console.log(line)

// ---------------------------------------------------------------------------
// 1. The inputs, as the endpoint gathers them
// ---------------------------------------------------------------------------

const years = yearsOfPeriod(gp, todayIso())
if (!years) {
  console.error(`GP ${gp}: der Kalender (GP_STARTS) kennt die Periode nicht.`)
  process.exit(1)
}
await mkdir(join(cacheDir, gp), { recursive: true })
if (prev) await mkdir(join(cacheDir, prev), { recursive: true })

const records = (
  await Promise.all(years.map((y) => cachedJson(join(cacheDir, `bgbl-${y}.json`), () => fetchBgblRecords(SCRIPT, `${y}-01-01`, `${y}-12-31`))))
).flat()

const list81 = async (period: string): Promise<DraftSummary[]> =>
  ((await cachedJson(join(cacheDir, period, 'list81.json'), () => filterList(81, { GP_CODE: [period] }))).rows ?? []).map(mapDraftRow)
const drafts = await list81(gp)
const draftsBefore = prev ? await list81(prev) : []

const toItem = (map: typeof mapVorlageRow) => (row: unknown[]): ParliamentItem => {
  const v = map(row)
  return { inr: v.inr, citation: v.citation, title: v.title, date: v.date }
}
const vorlagen = ((await cachedJson(join(cacheDir, gp, 'list101-rv.json'), () => filterList(101, { GP_CODE: [gp], ITYP: ['I'], VHG: ['RV'] }))).rows ?? []).map(toItem(mapVorlageRow))
const antragRows = (await cachedJson(join(cacheDir, gp, 'list101-a.json'), () => filterList(101, { GP_CODE: [gp], ITYP: ['A'], ART: ['A'] }))).rows ?? []
if (antragRows.some((r) => r[5] !== 'A')) throw new Error('Liste 101: der ART-Filter hat nicht gegriffen')
const antraege = antragRows.map(toItem(mapAntragRow))

// The chains' Vorlage links, read like `stationMap.chainOf` reads them.
const meOf = [...drafts.map((d) => ({ gp, inr: d.inr })), ...draftsBefore.map((d) => ({ gp: prev!, inr: d.inr }))]
const unique = [...new Map(meOf.map((m) => [`${m.gp}/${m.inr}`, m])).values()]
console.error(`Lade ${unique.length} Ministerialentwurf-Details (${CONCURRENCY} parallel) …`)
let unread = 0
const chains = await pool(unique, CONCURRENCY, async (me) => {
  try {
    const detail = await cachedJson<{ content?: { stages?: RawStage[] } }>(
      join(cacheDir, me.gp, `ME-${me.inr}.json`),
      () => getJson(`${PARLIAMENT}/gegenstand/${me.gp}/ME/${me.inr}?json=True`, http),
    )
    return { rvLinks: findRvLinks(parseStages(detail.content?.stages)).map((l) => ({ gp: l.gp, inr: l.inr })) }
  } catch {
    unread++
    return { rvLinks: [] }
  }
})

// ---------------------------------------------------------------------------
// 2. The production classification
// ---------------------------------------------------------------------------

const classified = classifySkippedLaws({ gp, records, chains, antragPaths: ANTRAG_PATHS, vorlagen, antraege, drafts })

const label = (c: ClassifiedLaw['class']): string =>
  c.kind === 'consulted' ? `consulted (${c.via})` : c.kind === 'unknown' ? `unknown (${c.reason})` : c.kind

const totals = new Map<string, number>()
for (const c of classified) totals.set(label(c.class), (totals.get(label(c.class)) ?? 0) + 1)

say(`GP ${gp} — Bundesgesetze laut RIS (Jahrgänge ${years.join(', ')}), gemessen ${todayIso()}`)
say(`  Eingaben: ${records.length} BGBl-Datensätze, ${drafts.length} + ${draftsBefore.length} Ministerialentwürfe (${gp}${prev ? ` + ${prev}` : ''}, ${unread} nicht lesbar), ${vorlagen.length} Regierungsvorlagen, ${antraege.length} Anträge`)
const typs = new Map<string, number>()
for (const r of records) if (r.teil === 'Teil1' && r.gp === gp) typs.set(r.typ ?? '(ohne Typ)', (typs.get(r.typ ?? '(ohne Typ)') ?? 0) + 1)
say(`  Teil I der Periode nach Typ: ${[...typs].map(([t, n]) => `${t} ${n}`).join(' · ')} — gezählt wird nur „Bundesgesetz"`)
say()
say(`Klassen (${classified.length} Gesetze):`)
for (const [k, n] of [...totals].sort((a, b) => b[1] - a[1])) say(`  ${String(n).padStart(4)}  ${k}`)

const none = classified.filter((c) => c.class.kind === 'none')
say()
say(`--- Alle ${none.length} Zeilen „ohne Begutachtung" ---`)
for (const { record, class: c } of none) {
  if (c.kind !== 'none') continue
  say(`  ${record.nummer.padEnd(20)} ${record.datum}  ${c.item.citation.padEnd(10)} ${c.title}`)
}
const exempt = classified.filter((c) => c.class.kind === 'exempt')
say()
say(`--- Ausgenommen (${exempt.length}) ---`)
for (const { record, class: c } of exempt) if (c.kind === 'exempt') say(`  ${record.nummer.padEnd(20)} ${c.reason}`)
const unknown = classified.filter((c) => c.class.kind === 'unknown')
say()
say(`--- Unbekannt, sagt nichts (${unknown.length}) ---`)
for (const { record, class: c } of unknown) {
  const items = [...record.regierungsvorlagen.map((n) => `${n} d.B.`), ...record.initiativantraege.map((n) => `${n}/A`)].join(', ') || '—'
  say(`  ${record.nummer.padEnd(20)} ${label(c).padEnd(26)} ${items.padEnd(14)} ${record.kurztitel ?? ''}`)
}

// ---------------------------------------------------------------------------
// 3. Against the memo's corpus
// ---------------------------------------------------------------------------

let memo: { rows: SkippedRow[] } | null = null
try {
  memo = JSON.parse(await readFile(memoFile, 'utf8'))
} catch {
  say()
  say(`(Kein Memo-Korpus unter ${memoFile} — Vergleich entfällt.)`)
}

if (memo) {
  const memoClass = (r: SkippedRow) => (r.consulted ? 'consulted' : r.exemptReason ? 'exempt' : 'skipped')
  const oursClass = (c: ClassifiedLaw['class']) =>
    c.kind === 'none' ? 'skipped' : c.kind === 'unknown' ? `unknown/${c.reason}` : c.kind
  const memoBy = new Map(memo.rows.map((r) => [`I ${r.bgbl.replace(/^I\s+/, '')}`, r]))
  const oursBy = new Map(classified.map((c) => [bgblIKey(c.record.nummer)!, c]))

  const rows: string[] = []
  const kinds = new Map<string, number>()
  for (const [key, ours] of oursBy) {
    const m = memoBy.get(key)
    if (!m) continue
    const a = memoClass(m)
    const b = oursClass(ours.class)
    if (a === b) continue
    const kind = `memo ${a} → hier ${b}`
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
    rows.push(`  ${key.padEnd(12)} ${kind.padEnd(44)} ${m.citation.padEnd(10)} ${m.title}`)
  }
  const onlyOurs = [...oursBy.keys()].filter((k) => !memoBy.has(k))
  const onlyMemo = [...memoBy.keys()].filter((k) => !oursBy.has(k))

  say()
  say(`--- Vergleich mit ${memoFile} (${memo.rows.length} Gesetze, Stand des Memos) ---`)
  say(`  beide kennen: ${[...oursBy.keys()].filter((k) => memoBy.has(k)).length} · nur RIS: ${onlyOurs.length} · nur Memo: ${onlyMemo.length}`)
  for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1])) say(`  ${String(n).padStart(4)}  ${k}`)
  say()
  say('  Jede Abweichung:')
  for (const line of rows.sort()) say(line)
  say()
  say('  Nur in RIS (nicht im Memo-Korpus):')
  for (const k of onlyOurs) {
    const c = oursBy.get(k)!
    say(`  ${k.padEnd(12)} ${oursClass(c.class).padEnd(26)} ${c.record.datum}  ${c.record.kurztitel ?? ''}`)
  }
  say()
  say('  Nur im Memo (nicht als Bundesgesetz dieser Periode in RIS):')
  for (const k of onlyMemo) {
    const m = memoBy.get(k)!
    say(`  ${k.padEnd(12)} ${memoClass(m).padEnd(10)} ${m.citation.padEnd(10)} ${m.title}`)
  }
}
