#!/usr/bin/env vite-node
/**
 * What moves in list 81 from one day to the next — read off a series of daily
 * snapshots, not off a single call.
 *
 * WHY THE SERIES EXISTS. Two questions cannot be answered by reading the API
 * once, however carefully:
 *
 *   §13.3 — is `Frist` updated when a Begutachtung is extended? The list shows
 *   a deadline, never its history. If an extension leaves the field untouched,
 *   an alert built on it announces a date that has passed and a deadline that
 *   has not — which decides the shape of the alerts package, not just a field.
 *   The same question is put to the Parlamentsdirektion directly; this is the
 *   half that does not depend on an answer.
 *
 *   The size of the persistence package — how many rows change per day at all,
 *   and how much of that is the statement counter ticking up. If almost nothing
 *   else moves, history is a small thing and belongs in ordinary work.
 *
 * The snapshots are written by `deploy/bin/list81-snapshot.sh` on the server
 * (daily, systemd timer) and stay there. Pull them to look:
 *
 *     rsync -az root@<SERVER_IP>:/var/lib/begutachtungs-monitor/list81/ .cache/list81/
 *     pnpm corpus:list81-drift
 *     pnpm corpus:list81-drift -- --dir .cache/list81 --show 40
 *
 * Read-only, offline, nothing is written. `--show <n>` prints up to n rows per
 * finding instead of the default 12.
 *
 * WHAT IT DOES NOT SAY. A Frist that never changes over two weeks is evidence
 * only in proportion to how many Begutachtungen were open and how many of them
 * were actually extended — with six open drafts, silence is a weak No, and the
 * report says so rather than letting the reader round it up.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { checkListHeader } from '../../server/utils/parliament/listHeaders'
import { argPair } from '../lib/args'
import { pct, quantileOfSorted } from '../lib/fmt'

const dir = argPair('dir') ?? join('.cache', 'list81')
const show = Number(argPair('show') ?? 12)

/** Positions this report names, from the header read live on 2026-09-24. */
const COL = {
  inr: 2,
  einlangen: 3,
  betreff: 4,
  nr: 5,
  min: 6,
  frist: 8,
  aktiv: 11,
  engagement: 12,
  stellungnahmen: 13,
  fristsort: 14,
} as const

interface HeaderCell {
  feld_name?: string | null
  label?: string | null
}

interface Snapshot {
  date: string
  lastSync: string
  header: HeaderCell[]
  /** One row per Ressort of a draft, keyed below. */
  rows: unknown[][]
}

/**
 * A draft is NOT identified by its number alone: a jointly issued one stands
 * in the list once per Ressort (`server/utils/parliament/list81.ts`), and both
 * rows carry the same INR. `wentry_id` would be unique, but it is upstream's
 * row identity — a re-created row would read as a departure plus an arrival,
 * which is exactly the kind of movement this report is counting.
 */
function keyOf(row: unknown[]): string {
  return `${String(row[COL.inr] ?? '')}|${String(row[COL.min] ?? '')}`
}

function cite(row: unknown[]): string {
  return String(row[COL.nr] ?? `?/${String(row[COL.inr] ?? '')}`)
}

/** „1 Änderung", not „1 Änderungen" — the report is read by a German reader. */
function changes(n: number): string {
  return `${n} ${n === 1 ? 'Änderung' : 'Änderungen'}`
}

function titleOf(row: unknown[]): string {
  return String(row[COL.betreff] ?? '').replace(/<[^>]*>/g, '').slice(0, 70)
}

/** The header's identity, for holding one snapshot's layout against another's. */
function headerSignature(header: HeaderCell[]): string {
  return header.map((h) => h?.feld_name ?? h?.label ?? '').join(' | ')
}

function readSnapshots(): Snapshot[] {
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  } catch {
    console.error(`Kein Verzeichnis ${dir}. Erst holen:`)
    console.error(`  rsync -az root@<SERVER_IP>:/var/lib/begutachtungs-monitor/list81/ ${dir}/`)
    process.exit(1)
  }
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
      lastSync?: string
      header?: HeaderCell[]
      rows?: unknown[][]
    }
    return {
      date: f.slice(0, 10),
      lastSync: String(raw.lastSync ?? ''),
      header: raw.header ?? [],
      rows: (raw.rows ?? []).filter(Array.isArray),
    }
  })
}

interface Change {
  from: string
  to: string
  key: string
  cite: string
  title: string
  column: number
  before: string
  after: string
  /** `AKTIV` of the later row — a Frist that moves while open is the case §13.3 asks about. */
  activeAfter: boolean
}

function main(): void {
  const snaps = readSnapshots()
  if (!snaps.length) {
    console.error(`Keine Snapshots in ${dir}.`)
    process.exit(1)
  }

  console.log(`# Drift der Liste 81 — ${snaps.length} Snapshots aus ${dir}\n`)
  console.log('Datum        Zeilen  offen  lastSync')
  for (const s of snaps) {
    const open = s.rows.filter((r) => r[COL.aktiv] === 'J').length
    console.log(`${s.date}  ${String(s.rows.length).padStart(6)}  ${String(open).padStart(5)}  ${s.lastSync}`)
  }

  // THE LAYOUT FIRST. Every count below reads fixed positions; if a column was
  // inserted upstream mid-series, the diff measures the shift and calls it
  // change. `checkListHeader` is the production guard, so a mismatch here is
  // also a mismatch on the site.
  console.log('\n## Kopfzeile')
  const signatures = new Map<string, string[]>()
  let headerBroken = false
  for (const s of snaps) {
    const mismatch = checkListHeader(81, s.header)
    if (mismatch) {
      headerBroken = true
      console.log(`  ${s.date}: ${mismatch}`)
    }
    const sig = headerSignature(s.header)
    signatures.set(sig, [...(signatures.get(sig) ?? []), s.date])
  }
  if (!headerBroken) console.log('  Alle Snapshots: die gelesenen Spalten stehen, wo sie stehen sollen.')
  if (signatures.size > 1) {
    console.log(`  ACHTUNG — ${signatures.size} verschiedene Kopfzeilen in der Serie:`)
    for (const [sig, dates] of signatures) console.log(`    ${dates[0]}…${dates.at(-1)}: ${sig}`)
    console.log('  Die Zahlen unten sind erst vergleichbar, wenn das geklärt ist.')
  }

  if (snaps.length < 2) {
    console.log('\nEin Diff braucht zwei Tage. Bisher ein Snapshot — morgen wieder lesen.')
    return
  }

  const names = snaps[0]!.header.map((h, i) => h?.label ?? h?.feld_name ?? `Spalte ${i}`)
  const changesByColumn = new Map<number, number>()
  const allChanges: Change[] = []
  const arrivals: { date: string; cite: string; title: string }[] = []
  const departures: { date: string; cite: string; title: string }[] = []
  /** Rows changed per day pair, and how many of those changed ONLY the counter. */
  const perDay: { from: string; to: string; changed: number; counterOnly: number }[] = []

  for (let i = 1; i < snaps.length; i++) {
    const a = snaps[i - 1]!
    const b = snaps[i]!
    const before = new Map(a.rows.map((r) => [keyOf(r), r]))
    const after = new Map(b.rows.map((r) => [keyOf(r), r]))
    let changed = 0
    let counterOnly = 0

    for (const [key, row] of after) {
      const old = before.get(key)
      if (!old) {
        arrivals.push({ date: b.date, cite: cite(row), title: titleOf(row) })
        continue
      }
      const columns: number[] = []
      for (let c = 0; c < Math.max(old.length, row.length); c++) {
        if (String(old[c] ?? '') !== String(row[c] ?? '')) columns.push(c)
      }
      if (!columns.length) continue
      changed++
      if (columns.every((c) => c === COL.stellungnahmen || c === COL.engagement)) counterOnly++
      for (const c of columns) {
        changesByColumn.set(c, (changesByColumn.get(c) ?? 0) + 1)
        allChanges.push({
          from: a.date,
          to: b.date,
          key,
          cite: cite(row),
          title: titleOf(row),
          column: c,
          before: String(old[c] ?? ''),
          after: String(row[c] ?? ''),
          activeAfter: row[COL.aktiv] === 'J',
        })
      }
    }
    for (const [key, row] of before) {
      if (!after.has(key)) departures.push({ date: b.date, cite: cite(row), title: titleOf(row) })
    }
    perDay.push({ from: a.date, to: b.date, changed, counterOnly })
  }

  console.log('\n## Bewegung je Tagespaar')
  console.log('von → bis                geändert  davon nur Zähler')
  for (const d of perDay) {
    console.log(`${d.from} → ${d.to}  ${String(d.changed).padStart(8)}  ${String(d.counterOnly).padStart(16)}`)
  }
  console.log(`Neue Zeilen: ${arrivals.length} · verschwundene Zeilen: ${departures.length}`)
  for (const a of arrivals.slice(0, show)) console.log(`  + ${a.date}  ${a.cite.padEnd(9)} ${a.title}`)
  for (const d of departures.slice(0, show)) console.log(`  − ${d.date}  ${d.cite.padEnd(9)} ${d.title}`)

  console.log('\n## Welche Spalten sich ändern')
  const columns = [...changesByColumn].sort((x, y) => y[1] - x[1])
  if (!columns.length) console.log('  Keine. In der ganzen Serie hat sich keine Zelle bewegt.')
  for (const [c, n] of columns) {
    console.log(`  ${String(c).padStart(2)} ${String(names[c] ?? '').padEnd(22)} ${changes(n)}`)
  }

  // §13.3. The display Frist and the sortable Fristsort are reported together
  // and apart: a change in one without the other would itself be the finding.
  console.log('\n## §13.3 — bewegt sich die Frist?')
  const fristChanges = allChanges.filter((c) => c.column === COL.frist || c.column === COL.fristsort)
  const openDays = snaps.map((s) => s.rows.filter((r) => r[COL.aktiv] === 'J').length)
  if (!fristChanges.length) {
    console.log('  Keine Frist hat sich geändert.')
    console.log(
      `  Trägt so weit wie die Serie reicht: ${snaps.length} Tage, offene Begutachtungen ` +
      `Median ${quantileOfSorted([...openDays].sort((x, y) => x - y), 0.5)} ` +
      `(min ${Math.min(...openDays)}, max ${Math.max(...openDays)}). ` +
      'Ohne eine beobachtete Verlängerung ist das kein Nein, sondern eine kleine Stichprobe.',
    )
  } else {
    for (const c of fristChanges.slice(0, show)) {
      console.log(
        `  ${c.to}  ${c.cite.padEnd(9)} ${names[c.column]}: „${c.before}" → „${c.after}"` +
        `${c.activeAfter ? ' (noch offen)' : ' (nicht mehr offen)'}`,
      )
      console.log(`             ${c.title}`)
    }
    const bothCols = new Set(fristChanges.map((c) => c.column))
    if (bothCols.size === 1) {
      console.log(
        `  ACHTUNG: es bewegt sich nur ${names[[...bothCols][0]!]}, die andere Frist-Spalte nicht — ` +
        'die beiden Felder sagen dann nicht dasselbe.',
      )
    }
  }

  console.log('\n## AKTIV — wer aufhört, offen zu sein')
  const aktiv = allChanges.filter((c) => c.column === COL.aktiv)
  if (!aktiv.length) console.log('  Keine Änderung.')
  for (const c of aktiv.slice(0, show)) {
    console.log(`  ${c.to}  ${c.cite.padEnd(9)} „${c.before}" → „${c.after}"  ${c.title}`)
  }

  // §13.10 — the meaning of „Engagement" is an open question. If it moves with
  // the statement counter and never alone, that is an observation about it.
  const statements = allChanges.filter((c) => c.column === COL.stellungnahmen)
  const engagement = allChanges.filter((c) => c.column === COL.engagement)
  console.log('\n## Zähler')
  const delta = statements.reduce((sum, c) => sum + (Number(c.after) - Number(c.before)), 0)
  console.log(`  Stellungnahmen: ${changes(statements.length)}, netto ${delta > 0 ? '+' : ''}${delta}`)
  console.log(`  Engagement (§13.10): ${changes(engagement.length)}`)
  const engagementAlone = engagement.filter(
    (e) => !statements.some((s) => s.key === e.key && s.to === e.to),
  ).length
  if (engagement.length) {
    console.log(`    davon ohne gleichzeitige Stellungnahmen-Änderung: ${engagementAlone}`)
  }

  console.log('\n## Fazit für das Persistenz-Paket')
  const changedPerDay = perDay.map((d) => d.changed).sort((x, y) => x - y)
  const substantive = perDay.map((d) => d.changed - d.counterOnly).sort((x, y) => x - y)
  const rows = snaps.at(-1)!.rows.length
  console.log(`  Geänderte Zeilen je Tag: Median ${quantileOfSorted(changedPerDay, 0.5)} von ${rows} (${pct(quantileOfSorted(changedPerDay, 0.5), rows)}), max ${changedPerDay.at(-1)}`)
  console.log(`  Ohne die reinen Zähler:  Median ${quantileOfSorted(substantive, 0.5)}, max ${substantive.at(-1)}`)
  console.log(`  Zeilen neu/weg in ${snaps.length} Tagen: +${arrivals.length} / −${departures.length}`)
}

main()
