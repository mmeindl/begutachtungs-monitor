#!/usr/bin/env vite-node
/**
 * Writes the figures `/genauigkeit` shows from one measurement round
 * (19.11.2026) into `shared/data/genauigkeit.json`.
 *
 * Usage:  npx vite-node -c vitest.config.ts scripts/harness/genauigkeit.ts -- --in=<dir> [--commit=<hash>] [--out=<file>]
 *
 * `<dir>` holds what the round wrote, under these names:
 *
 *   kons.json        kons.ts -- --discover=60 --sammel --cache --oracle --json=<dir>/kons.json
 *   fi-pdf.json      faultInjection.ts -- --gp=XXVIII --mindestens=95 --json=<dir>/fi-pdf.json
 *   fi-xml.json      faultInjection.ts -- --gp=XXVIII --xml --mindestens=95 --json=<dir>/fi-xml.json
 *   annex-pdf.json   annexPdf.ts -- --gp=XXVIII --json=<dir>/annex-pdf.json
 *   annex-xml.json   annexPdf.ts -- --gp=XXVIII --xml --json=<dir>/annex-xml.json
 *   station.json     station.ts -- --gp=XXVIII --cache --json=<dir>/station.json
 *   land-guard/      landGuard.ts -- --out <dir>/land-guard --cached-only
 *   land-st/         landStations.ts -- --out <dir>/land-st --cached-only
 *   acc.json         accounting.ts -- --json=<dir>/acc.json           (asks a running server)
 *   acc-ris.json     accounting.ts -- --ris --json=<dir>/acc-ris.json  (asks a running server)
 *
 * WHY A SCRIPT. Every figure the page shows comes out of a harness record,
 * never out of a hand: the count of Lesefassungen shown moved by two within
 * one day (19.11.2026), and a figure typed into copy goes stale without
 * anyone noticing. The script only adds up; what a figure means in words
 * is `shared/utils/genauigkeit.ts`.
 *
 * NOT IN CI, because the accounting asks a running server and a round takes
 * minutes. Run it after a round whose figures belong on the page, and read
 * the JSON's diff before committing it, as `stationBaseline.json`'s is read.
 *
 * A record that is missing or does not add up stops the script: a page with
 * half its figures from another round says nothing about either.
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConsolidatedWithheldCause, GenauigkeitFault, GenauigkeitRecord } from '../../shared/types'
import { argAssigned } from '../lib/args'

const dir = argAssigned('in')
if (!dir) {
  console.error('Usage: npx vite-node -c vitest.config.ts scripts/harness/genauigkeit.ts -- --in=<dir> [--commit=<hash>] [--out=<file>]')
  process.exit(1)
}
const outFile = argAssigned('out') ?? 'shared/data/genauigkeit.json'
const commit = argAssigned('commit') ?? execSync('git rev-parse --short=8 HEAD', { encoding: 'utf8' }).trim()

const stamps: string[] = []
function read<T>(name: string): T {
  const value = JSON.parse(readFileSync(join(dir!, name), 'utf8')) as T & { at?: string }
  if (value.at) stamps.push(value.at)
  return value
}

/* --- The Lesefassung -------------------------------------------------- */

const kons = read<{
  corpus: { bgbl: number; laws: number }
  checked: number
  unrefused: { checked: number; identical: number; divergent: number }
  gate: Record<string, number>
}>('kons.json')
/** The gate's tally summed over the keys a predicate takes: `plausibel|Orakel|Ergebnis|Verweigerung|Weg`. */
const gate = (pred: (p: string[]) => boolean): number =>
  Object.entries(kons.gate).filter(([k]) => pred(k.split('|'))).reduce((n, [, v]) => n + v, 0)
const shown = (p: string[]) => p[0] === 'plausibel' && p[1] === 'bestätigt'

interface FaultRecord { path: 'pdf' | 'table'; drafts: number; annex: GenauigkeitFault[]; result: GenauigkeitFault[] }
const faults = { pdf: read<FaultRecord>('fi-pdf.json'), table: read<FaultRecord>('fi-xml.json') }
for (const [path, record] of Object.entries(faults)) {
  if (record.path !== path) throw new Error(`fi-${path === 'table' ? 'xml' : 'pdf'}.json was written on the ${record.path} path`)
}
const classes = (list: GenauigkeitFault[]): GenauigkeitFault[] => list.map(({ key, tried, caught }) => ({ key, tried, caught }))

interface AccountingRecord { reports: { touched: number; shown: number; causes: Record<string, number> }[] }
function funnel(record: AccountingRecord) {
  const causes: Partial<Record<ConsolidatedWithheldCause, number>> = {}
  for (const r of record.reports) {
    for (const [cause, n] of Object.entries(r.causes)) causes[cause as ConsolidatedWithheldCause] = (causes[cause as ConsolidatedWithheldCause] ?? 0) + n
  }
  const changed = record.reports.reduce((n, r) => n + r.touched, 0)
  const shownCount = record.reports.reduce((n, r) => n + r.shown, 0)
  const withheld = Object.values(causes).reduce((n, v) => n + (v ?? 0), 0)
  if (shownCount + withheld !== changed) throw new Error(`accounting does not balance: ${shownCount} shown + ${withheld} withheld ≠ ${changed} changed`)
  /* By name, so two rounds' files differ only where a count moved. */
  const sorted = Object.fromEntries(Object.entries(causes).sort(([a], [b]) => a.localeCompare(b))) as typeof causes
  return { drafts: record.reports.length, changed, shown: shownCount, causes: sorted }
}
const accounted = funnel(read<AccountingRecord>('acc.json'))
const risOnly = funnel(read<AccountingRecord>('acc-ris.json'))

/* --- The annex -------------------------------------------------------- */

interface AnnexRecord { drafts: { note: string | null; verifiedParas: number; withheldParas: number; withheldStanding: number; uncheckedParas: number }[] }
const gated = [...read<AnnexRecord>('annex-pdf.json').drafts, ...read<AnnexRecord>('annex-xml.json').drafts].filter((d) => d.note === null)
const annexSum = (pick: (d: AnnexRecord['drafts'][number]) => number): number => gated.reduce((n, d) => n + pick(d), 0)

/* --- The Bund's stations ---------------------------------------------- */

const station = read<{
  drafts: number
  pairs: number
  breaches: unknown[]
  residues: { residue: { editorial: boolean } }[]
  nullUnits?: Record<string, number>
}>('station.json')
if (!station.nullUnits) throw new Error('station.json was written before the null comparisons counted their units')

/* --- The Länder ------------------------------------------------------- */

const landGuard = read<{ lands: string[]; documents: number; compared: number; shown: number; judged: number; found: number; faults: GenauigkeitFault[]; strict: { held: number; differs: number; unchecked: number } }>('land-guard/summary.json')
const landStations = read<GenauigkeitRecord['laender']['stations'] & { stale: number }>('land-st/summary.json')

/* --- The record ------------------------------------------------------- */

/** The day in Vienna of the round's last record. */
const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date(stamps.sort().at(-1)!))

const record: GenauigkeitRecord = {
  date,
  commit,
  gp: 'XXVIII',
  lesefassung: {
    bench: {
      bgbl: kons.corpus.bgbl,
      laws: kons.corpus.laws,
      checked: kons.checked,
      shown: gate(shown),
      identical: gate((p) => shown(p) && p[2] === 'identisch'),
      invented: gate((p) => shown(p) && p[2] === 'abweichend'),
      incomplete: gate((p) => shown(p) && p[2] === 'unvollständig'),
      otherwise: gate((p) => shown(p) && !['identisch', 'abweichend', 'unvollständig'].includes(p[2]!)),
      ungated: { shown: kons.unrefused.checked, identical: kons.unrefused.identical },
    },
    faults: { pdf: classes(faults.pdf.result), table: classes(faults.table.result) },
    funnel: accounted,
    risOnly: { drafts: risOnly.drafts, changed: risOnly.changed, shown: risOnly.shown },
  },
  annex: {
    drafts: gated.length,
    confirmed: annexSum((d) => d.verifiedParas),
    withheld: annexSum((d) => d.withheldParas),
    withheldStanding: annexSum((d) => d.withheldStanding),
    unchecked: annexSum((d) => d.uncheckedParas),
    faults: { pdf: classes(faults.pdf.annex), table: classes(faults.table.annex) },
  },
  stations: {
    drafts: station.drafts,
    pairs: station.pairs,
    breaches: station.breaches.length,
    nullUnits: Object.values(station.nullUnits).reduce((n, v) => n + v, 0),
    nullResidues: station.residues.length,
    nullSubstantive: station.residues.filter((r) => !r.residue.editorial).length,
  },
  laender: {
    tgu: { lands: landGuard.lands, documents: landGuard.documents, compared: landGuard.compared, shown: landGuard.shown, strict: { held: landGuard.strict.held, differs: landGuard.strict.differs, unchecked: landGuard.strict.unchecked }, judged: landGuard.judged, found: landGuard.found, faults: landGuard.faults },
    stations: {
      pairs: landStations.pairs,
      compared: landStations.compared,
      hits: landStations.hits,
      accepted: landStations.accepted,
      withheld: landStations.withheld,
      withheldPairs: landStations.withheldPairs,
      unread: landStations.unread,
      unreadPairs: landStations.unreadPairs,
    },
  },
}

if (record.stations.breaches || record.laender.stations.hits || landStations.stale) {
  throw new Error('the round failed an invariant (station breaches, Länder hits or a stale accepted hit): fix that before its figures go on the page')
}
const firstDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date(stamps[0]!))
if (firstDay !== date) throw new Error(`the records span ${firstDay} to ${date}: one round, one day`)

/* One fault class per line, so the diff a reader checks before committing shows a class that moved as one line. */
const json = JSON.stringify(record, null, 2).replace(/\{\n\s+"key": [^{}]*?\n\s+\}/g, (m) => m.replace(/\s*\n\s*/g, ' '))
writeFileSync(outFile, `${json}\n`)
console.log(`${outFile}: Messung vom ${date}, Stand ${commit}`)
