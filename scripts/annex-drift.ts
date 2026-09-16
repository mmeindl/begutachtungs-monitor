#!/usr/bin/env vite-node
/**
 * Der Drift-Alarm für die Beilage (§12.13).
 *
 * Liest die Berichte, die `annex-pdf-verify.ts --json=` schreibt, wendet
 * Klasse A und (mit `--grundlinie=`) Klasse B aus `annex-report.ts` an und
 * endet mit Exit-Code 1, sobald ein Befund dasteht. Der Workflow
 * `.github/workflows/annex-drift.yml` macht daraus ein Issue.
 *
 * **Warum es diesen Alarm gibt.** Die Engine bricht nicht daran, dass wir sie
 * ändern — das fangen die Tests und der Golden-Test mit zwei eingefrorenen
 * echten Beilagen. Sie bricht daran, dass ein Ressort seine Beilage anders
 * setzt als bisher, und zwar lautlos: die Seite zeigt dann eine
 * Gegenüberstellung, die niemand als falsch erkennt, weil niemand hinsieht.
 * Genau das ist die Betriebslast, an der der Vorgänger gestorben ist, also
 * muss der Alarm selbst betriebsfrei sein: ein Cron auf GitHubs Runnern, ein
 * Issue, eine Mail, kein Dienst auf dem VPS.
 *
 * Usage:
 *   annex-drift.ts bericht.json [weitere.json …]            — nur Klasse A
 *   annex-drift.ts --grundlinie=g.json bericht.json …        — A und B
 *   annex-drift.ts --grundlinie-schreiben=g.json bericht.json … — neu ziehen
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { classAFindings, classBFindings, summarize, toBaseline, type AnnexBaseline, type AnnexReport, type Finding } from './annex-report'

const arg = (name: string): string | null => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const paths = process.argv.slice(2).filter((a) => !a.startsWith('--') && a.endsWith('.json'))
const baselinePath = arg('grundlinie')
const writePath = arg('grundlinie-schreiben')

if (paths.length === 0) {
  console.error('Kein Bericht angegeben. Usage: annex-drift.ts [--grundlinie=g.json] bericht.json [weitere.json …]')
  process.exit(2)
}

function read<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch (err) {
    // Ein Bericht, den der Prüfstand nicht geschrieben hat, ist kein
    // „ohne Befund". Der Lauf ist dann gescheitert, und das ist ein eigener
    // Zustand — der Workflow soll ihn laut scheitern lassen, nicht als
    // Entwarnung verbuchen (`harness-cache.ts`: eine Messung gegen nichts
    // sieht aus wie ein Ergebnis).
    console.error(`FEHLER: ${path} ließ sich nicht lesen — ${String(err).slice(0, 160)}`)
    process.exit(2)
  }
}

const reports = paths.map((p) => read<AnnexReport>(p))

// Die Grundlinie neu ziehen ist eine eigene Handlung und kein Alarm: sie
// schreibt und urteilt nicht. Sie gehört in denselben Commit wie die
// Änderung, die sie nötig macht — sonst ist der nächste Lauf ein Befund über
// eine Verbesserung, und nach dem dritten Mal liest niemand mehr hin.
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
