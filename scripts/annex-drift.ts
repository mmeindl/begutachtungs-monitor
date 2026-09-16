#!/usr/bin/env vite-node
/**
 * Der Drift-Alarm für die Beilage (§12.13).
 *
 * Liest die Berichte, die `annex-pdf-verify.ts --json=` schreibt, wendet
 * Klasse A aus `annex-report.ts` an und endet mit Exit-Code 1, sobald ein
 * Befund dasteht. Der Workflow `.github/workflows/annex-drift.yml` macht
 * daraus ein Issue.
 *
 * **Warum es diesen Alarm gibt.** Die Engine bricht nicht daran, dass wir sie
 * ändern — das fangen 611 Tests und der Golden-Test mit zwei eingefrorenen
 * echten Beilagen. Sie bricht daran, dass ein Ressort seine Beilage anders
 * setzt als bisher, und zwar lautlos: die Seite zeigt dann eine
 * Gegenüberstellung, die niemand als falsch erkennt, weil niemand hinsieht.
 * Genau das ist die Betriebslast, an der der Vorgänger gestorben ist, also
 * muss der Alarm selbst betriebsfrei sein: ein Cron auf GitHubs Runnern, ein
 * Issue, eine Mail, kein Dienst auf dem VPS.
 *
 * Usage:  npx vite-node scripts/annex-drift.ts -- bericht.json [weitere.json …]
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { classAFindings, summarize, type AnnexReport, type Finding } from './annex-report'

const paths = process.argv.slice(2).filter((a) => a.endsWith('.json'))
if (paths.length === 0) {
  console.error('Kein Bericht angegeben. Usage: annex-drift.ts bericht.json [weitere.json …]')
  process.exit(2)
}

let total = 0
const lines: string[] = []

for (const path of paths) {
  let report: AnnexReport
  try {
    report = JSON.parse(readFileSync(path, 'utf8')) as AnnexReport
  } catch (err) {
    // Ein Bericht, den der Prüfstand nicht geschrieben hat, ist kein
    // „ohne Befund". Der Lauf ist dann gescheitert, und das ist ein eigener
    // Zustand — der Workflow soll ihn laut scheitern lassen, nicht als
    // Entwarnung verbuchen (`harness-cache.ts`: eine Messung gegen nichts
    // sieht aus wie ein Ergebnis).
    console.error(`FEHLER: ${path} ließ sich nicht lesen — ${String(err).slice(0, 160)}`)
    process.exit(2)
  }

  const findings: Finding[] = classAFindings(report)
  total += findings.length
  const label = `${report.path === 'xml' ? 'Tabellenpfad' : 'PDF-Pfad'} (GP ${report.gp}, ${report.drafts.length} Entwürfe mit Beilage, gemessen ${report.at.slice(0, 10)})`

  lines.push(`## ${label}`)
  if (findings.length === 0) {
    lines.push('Ohne Befund.')
  } else {
    for (const f of findings) {
      lines.push(`- **${f.kind}**${f.draft ? ` · \`${f.draft}\`` : ''}: ${f.text}`)
    }
  }
  lines.push('')
}

const body = lines.join('\n')
console.log(body)

if (total === 0) {
  console.log('Klasse A: ohne Befund über alle Berichte.')
  process.exit(0)
}

// Für den Workflow: Titelzeile und Rumpf getrennt, damit das Issue einen
// Titel bekommt, der ohne Aufklappen etwas sagt.
const all = paths.flatMap((p) => classAFindings(JSON.parse(readFileSync(p, 'utf8')) as AnnexReport))
console.log(`\nBEFUND: ${total} (${summarize(all)})`)
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `summary=${summarize(all)}\n`)
  appendFileSync(process.env.GITHUB_OUTPUT, `count=${total}\n`)
}
process.exit(1)
