#!/usr/bin/env vite-node
/**
 * The drift alarm for the annex (§12.13).
 *
 * Reads the reports `harness/annexPdf.ts --json=` writes, applies class A and
 * (with `--grundlinie=`) class B from `lib/annexReport.ts`, and exits with
 * code 1 as soon as one finding stands. The workflow
 * `.github/workflows/annex-drift.yml` turns that into an issue.
 *
 * **Why this alarm exists.** The engine does not break because we change it —
 * the tests and the golden test with two frozen real annexes catch that. It
 * breaks because a ressort typesets its annex differently than before, and
 * does so silently: the page then shows a Gegenüberstellung nobody recognises
 * as wrong, because nobody is looking. That is exactly the operational load
 * the predecessor died of, so the alarm itself has to be free of operations:
 * a cron on GitHub's runners, an issue, a mail, no service on the VPS.
 *
 * Usage:
 *   pnpm ci:annex-drift -- bericht.json [weitere.json …]            — nur Klasse A
 *   pnpm ci:annex-drift -- --grundlinie=g.json bericht.json …        — A und B
 *   pnpm ci:annex-drift -- --grundlinie-schreiben=g.json bericht.json … — neu ziehen
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { classAFindings, classBFindings, maintenanceFindings, summarize, toBaseline, type AnnexBaseline, type AnnexReport, type Finding } from '../lib/annexReport'
import { argAssigned } from '../lib/args'

const paths = process.argv.slice(2).filter((a) => !a.startsWith('--') && a.endsWith('.json'))
const baselinePath = argAssigned('grundlinie')
const writePath = argAssigned('grundlinie-schreiben')

if (paths.length === 0) {
  console.error('Kein Bericht angegeben. Usage: pnpm ci:annex-drift -- [--grundlinie=g.json] bericht.json [weitere.json …]')
  process.exit(2)
}

function read<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch (err) {
    // A report the harness did not write is not an „ohne Befund". The run
    // failed then, and that is a state of its own — the workflow should let
    // it fail loudly rather than book it as an all-clear
    // (`lib/harnessCache.ts`: a measurement against nothing looks like a
    // result).
    console.error(`FEHLER: ${path} ließ sich nicht lesen — ${String(err).slice(0, 160)}`)
    process.exit(2)
  }
}

const reports = paths.map((p) => read<AnnexReport>(p))

// Drawing the baseline anew is an act of its own and not an alarm: it writes
// and does not judge. It belongs in the same commit as the change that makes
// it necessary — otherwise the next run is a finding about an improvement,
// and after the third time nobody reads it any more.
if (writePath) {
  const baseline = toBaseline(reports)
  writeFileSync(writePath, `${JSON.stringify(baseline, null, 2)}\n`)
  const n = (p: 'xml' | 'pdf') => Object.keys(baseline.paths[p]).length
  console.log(`Grundlinie geschrieben: ${writePath} — Tabellenpfad ${n('xml')}, PDF-Pfad ${n('pdf')} Entwürfe.`)
  process.exit(0)
}

const baseline = baselinePath ? read<AnnexBaseline>(baselinePath) : null
let total = 0
const lines: string[] = []
const all: Finding[] = []

for (const report of reports) {
  const findings = [...classAFindings(report), ...(baseline ? classBFindings(report, baseline) : [])]
  total += findings.length
  all.push(...findings)

  const label = `${report.path === 'xml' ? 'Tabellenpfad' : 'PDF-Pfad'} (GP ${report.gp}, ${report.drafts.length} Entwürfe mit Beilage, gemessen ${report.at.slice(0, 10)})`
  lines.push(`## ${label}`)
  if (findings.length === 0) lines.push('Ohne Befund.')
  else for (const f of findings) lines.push(`- **${f.kind}**${f.draft ? ` · \`${f.draft}\`` : ''}: ${f.text}`)
  lines.push('')
}

// Once per run, not per report: the baseline is one file for both paths. It
// counts towards `total`, so an over-aged baseline opens an issue and sends a
// mail — a reminder that depends on remembering is none.
const upkeep = maintenanceFindings(baseline)
if (upkeep.length > 0) {
  total += upkeep.length
  all.push(...upkeep)
  lines.push('## Wartung')
  for (const f of upkeep) lines.push(`- **${f.kind}**: ${f.text}`)
  lines.push('')
}

if (!baseline) lines.push('_Ohne Grundlinie gelaufen — Klasse B hat nichts geprüft._')

console.log(lines.join('\n'))

if (total === 0) {
  console.log('Ohne Befund über alle Berichte.')
  process.exit(0)
}

console.log(`\nBEFUND: ${total} (${summarize(all)})`)
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `summary=${summarize(all)}\n`)
  appendFileSync(process.env.GITHUB_OUTPUT, `count=${total}\n`)
}
process.exit(1)
