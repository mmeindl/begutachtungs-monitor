#!/usr/bin/env vite-node
/**
 * Writes the figures `/genauigkeit` shows from one measurement round
 * (19.11.2026) into `shared/data/genauigkeit.json`.
 *
 * Usage:  npx vite-node -c vitest.config.ts scripts/harness/genauigkeit.ts -- --in=<dir> [--out=<file>]
 *                [--erlaube-ungehalten=<Klasse,…>] [--erlaube-gemischt [--commit=<hash>]]
 *
 * `<dir>` holds what the round wrote, under these names:
 *
 *   kons.json        kons.ts -- --seit=2024-10-24 --cache --oracle --entwurf --erstsicht=scripts/harness/firstSight.json --json=<dir>/kons.json  (the period's start, GP_STARTS)
 *   fi-pdf.json      faultInjection.ts -- --gp=XXVIII --nur-periode --mindestens=95 --json=<dir>/fi-pdf.json
 *   fi-xml.json      faultInjection.ts -- --gp=XXVIII --nur-periode --xml --mindestens=95 --json=<dir>/fi-xml.json
 *   annex-pdf.json   annexPdf.ts -- --gp=XXVIII --nur-periode --json=<dir>/annex-pdf.json
 *   annex-xml.json   annexPdf.ts -- --gp=XXVIII --nur-periode --xml --json=<dir>/annex-xml.json
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
 * half its figures from another round says nothing about either. So does a
 * round that failed its own gates (`scripts/lib/genauigkeitRound.ts`, which
 * names each): an accounting with invariant failures, a fault record whose
 * floor failed or was not run, a floored class with fewer than 20 tries,
 * records of different commits or a dirty tree, a corpus reached in part.
 * The two that can be let through on purpose are named in the record:
 * `--erlaube-ungehalten=Fehlt,Lücke` (`unheld`), `--erlaube-gemischt`
 * (`mixed`, the commit then from `--commit` or the checkout).
 *
 * FIRST SIGHT (24.11.2026, `scripts/lib/firstSight.ts`). A round that passes
 * also appends the drafts it met for the first time to
 * `scripts/harness/firstSight.json` (`--erstsicht=<file>` for another), the
 * only way anything enters that file. Commit both files together.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { argAssigned, argFlag } from '../lib/args'
import { RoundRefused, buildGenauigkeitRecord } from '../lib/genauigkeitRound'
import { fileAfterRound, formatFirstSight, type FirstSightFile, type FirstSightRound } from '../lib/firstSight'

const dir = argAssigned('in')
if (!dir) {
  console.error('Usage: npx vite-node -c vitest.config.ts scripts/harness/genauigkeit.ts -- --in=<dir> [--out=<file>] [--erstsicht=<file>] [--erlaube-ungehalten=<Klasse,…>] [--erlaube-gemischt [--commit=<hash>]]')
  process.exit(1)
}
const outFile = argAssigned('out') ?? 'shared/data/genauigkeit.json'
const firstSightFile = argAssigned('erstsicht') ?? 'scripts/harness/firstSight.json'

let record
let firstSight
try {
  record = buildGenauigkeitRecord(
    (name) => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), 'utf8')) : undefined),
    {
      allowUnheld: argAssigned('erlaube-ungehalten')?.split(',').map((k) => k.trim()).filter(Boolean) ?? [],
      allowMixed: argFlag('erlaube-gemischt'),
      commit: argAssigned('commit'),
      head: () => execSync('git rev-parse --short=8 HEAD', { encoding: 'utf8' }).trim(),
    },
  )
  const round = (JSON.parse(readFileSync(join(dir, 'kons.json'), 'utf8')) as { firstSight?: FirstSightRound }).firstSight
  const after = fileAfterRound(JSON.parse(readFileSync(firstSightFile, 'utf8')) as FirstSightFile, round)
  if ('refusals' in after) throw new RoundRefused(after.refusals)
  firstSight = { file: after.file, round: round! }
} catch (err) {
  if (!(err instanceof RoundRefused)) throw err
  console.error(err.message)
  process.exit(1)
}

/* One fault class per line, so the diff a reader checks before committing shows a class that moved as one line. */
const json = JSON.stringify(record, null, 2).replace(/\{\n\s+"(?:key|path)": [^{}]*?\n\s+\}/g, (m) => m.replace(/\s*\n\s*/g, ' '))
writeFileSync(outFile, `${json}\n`)
console.log(`${outFile}: Messung vom ${record.date}, Stand ${record.commit}${record.mixed ? ' (gemischt)' : ''}`)
writeFileSync(firstSightFile, formatFirstSight(firstSight.file))
const { scored } = firstSight.round
console.log(`${firstSightFile}: ${firstSight.file.drafts.length} Entwürfe auf den ersten Blick (${firstSight.round.captured.length} neu); gleiche Anweisung auf gleichem Text ${scored.comparable}, davon Wort für Wort das Gesetz ${scored.identical}`)
