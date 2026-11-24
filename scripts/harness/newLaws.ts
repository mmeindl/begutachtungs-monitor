/**
 * Every Bundesgesetz published since the rules were frozen, scored with those
 * rules (23.11.2026). What it holds and why: `scripts/lib/newLaws.ts`.
 *
 *   pnpm harness:new-laws [--json=report.json] [--log=kons.log]
 *   pnpm harness:new-laws --probe                 on code that is not the frozen rules: nothing counts
 *   pnpm harness:new-laws --einfrieren=bench.json --tag=<tag>
 *
 * `--einfrieren` takes a `kons.ts --json` record of the development bench,
 * whose laws say which kinds of change the rules have met, and stores it with
 * the tree hashes of `server` and `shared` in `newLawScope.json`.
 *
 * Exit 0: clean. 1: a finding on a law of the holdout, or a number missing
 * from the list. 2: could not measure, which is no all-clear. Findings on the
 * trial laws are printed and do not turn the run red: those laws were open to
 * whoever worked on the rules, and a known one would keep the alarm on.
 *
 * The queries go upstream on every run (`--frisch`), into a cache of their own:
 * from the round's cache a new law reads as one RIS never consolidated.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bgblRecordOf } from '../../server/utils/ris/bgblJoin'
import { argAssigned, argFlag } from '../lib/args'
import { harnessStamp } from '../lib/harnessRecord'
import { risJson } from '../lib/http'
import {
  accountOf,
  atOrAfter,
  bgblNumberOf,
  findingsOf,
  gapsIn,
  poolOf,
  splitRead,
  type BgblAccount,
  type BgblListing,
  type Finding,
  type NewLawKonsRecord,
  type NewLawScope,
  type Pool,
} from '../lib/newLaws'
import { asArray } from '../lib/ris'

const SCOPE_FILE = argAssigned('scope') ?? 'scripts/harness/newLawScope.json'
const CACHE = process.env.HARNESS_CACHE ?? '.harness-cache-new-laws'
const POOLS: readonly Pool[] = ['holdout', 'trial', 'used']
const POOL_NAME: Record<Pool, string> = {
  holdout: 'Nach dem Einfrieren (zählt)',
  trial: 'Vorab: außerhalb des Prüfstands, aber nicht unberührt (zählt nicht)',
  used: 'Zum Beheben einer Regel verwendet (zählt nicht mehr)',
}

const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim()
const rulesTree = (): string => `${git('rev-parse', 'HEAD:server')} ${git('rev-parse', 'HEAD:shared')}`
const rulesDirty = (): boolean => git('status', '--porcelain', '--', 'server', 'shared') !== ''

const scope = JSON.parse(readFileSync(SCOPE_FILE, 'utf8')) as NewLawScope

const freezeFrom = argAssigned('einfrieren')
if (freezeFrom) {
  const tag = argAssigned('tag')
  if (!tag) throw new Error('--einfrieren braucht --tag=<tag>')
  if (rulesDirty()) throw new Error('server/ oder shared/ haben uncommittete Änderungen: das wären keine eingefrorenen Regeln')
  // One record or several, comma-separated: the bench, and laws read since.
  const laws = freezeFrom.split(',').flatMap((file) => {
    const record = JSON.parse(readFileSync(file, 'utf8')) as NewLawKonsRecord
    if (!record.laws?.length) throw new Error(`${file} nennt keine Gesetze: ein Lauf von kons.ts mit --json?`)
    return record.laws
  })
  const knownKinds = [...new Set(laws.flatMap((l) => l.kinds))].sort()
  writeFileSync(SCOPE_FILE, `${JSON.stringify({ ...scope, rules: { tag, tree: rulesTree() }, knownKinds }, null, 2)}\n`)
  console.log(`Eingefroren: ${tag}, ${knownKinds.length} bekannte Arten von Änderungen`)
  process.exit(0)
}

/** Teil I of one year. Refuses a list shorter than RIS's own count: a missing tail shows as no gap. */
async function listYear(year: number): Promise<BgblListing[]> {
  const ids = new Set<string>()
  const out: BgblListing[] = []
  let hits = 0
  for (let page = 1; page <= 50; page++) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const body = await risJson<any>({
      Applikation: 'BgblAuth',
      DokumenteProSeite: 'OneHundred',
      Seitennummer: String(page),
      VonKundmachungsdatum: `${year}-01-01`,
      BisKundmachungsdatum: `${year}-12-31`,
      'Sortierung.SortedByColumn': 'Kundmachungsdatum',
      'Sortierung.SortDirection': 'Ascending',
    }, { script: 'harness/new-laws' })
    const result = body?.OgdSearchResult?.OgdDocumentResults
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const docs = asArray<any>(result?.OgdDocumentReference)
    hits = Number(result?.Hits?.['#text'] ?? 0)
    for (const doc of docs) {
      const rec = bgblRecordOf(doc)
      if (!rec || ids.has(rec.id)) continue
      ids.add(rec.id)
      if (rec.teil !== 'Teil1') continue
      const number = bgblNumberOf(rec.nummer)
      if (!number) throw new Error(`Nummer nicht lesbar: ${rec.id} „${rec.nummer}"`)
      out.push({ ...number, id: rec.id, nummer: rec.nummer, date: rec.datum, typ: rec.typ, title: String(rec.kurztitel ?? rec.titel ?? '') })
    }
    if (docs.length < 100 || ids.size >= hits) break
  }
  if (ids.size !== hits) throw new Error(`Liste ${year} unvollständig: ${ids.size} von ${hits} Treffern gelesen`)
  return out
}

const EMPTY: NewLawKonsRecord = { unreached: [], laws: [], removalFindings: [], gate: {}, witness: {}, markers: {} }

/** The bench over these Bundesgesetzblätter. Its exit 1 is a finding in the record; no record is a run that failed. */
function scoreWithKons(ids: readonly string[]): NewLawKonsRecord {
  if (ids.length === 0) return EMPTY
  const dir = mkdtempSync(join(tmpdir(), 'new-laws-'))
  const file = join(dir, 'kons.json')
  const logFile = argAssigned('log')
  const log = logFile ? openSync(logFile, 'a') : 'ignore'
  try {
    const run = spawnSync('node_modules/.bin/vite-node', ['-c', 'vitest.config.ts', 'scripts/harness/kons.ts', '--', ...ids, '--cache', '--frisch', '--oracle', '--entwurf', '--quiet', `--json=${file}`], {
      env: { ...process.env, HARNESS_CACHE: CACHE },
      stdio: ['ignore', log, log],
    })
    if (!existsSync(file)) throw new Error(`kons.ts schrieb keinen Bericht (Exit ${run.status})`)
    return JSON.parse(readFileSync(file, 'utf8')) as NewLawKonsRecord
  } finally {
    if (typeof log === 'number') closeSync(log)
    rmSync(dir, { recursive: true, force: true })
  }
}

interface PoolReport {
  listed: number
  outcomes: Record<string, number>
  lawsScored: number
  paragraphs: number
  identical: number
  draftPath: NewLawKonsRecord['draftPath'] | null
  accounts: BgblAccount[]
  findings: Finding[]
  read: (Finding & { why: string })[]
}

function reportOf(listings: readonly BgblListing[], record: NewLawKonsRecord, today: string): PoolReport {
  const accounts = accountOf(listings, record, today)
  const outcomes: Record<string, number> = {}
  for (const a of accounts) outcomes[a.outcome] = (outcomes[a.outcome] ?? 0) + 1
  const scored = record.laws.filter((l) => l.note === null)
  return {
    listed: listings.length,
    outcomes,
    lawsScored: scored.length,
    paragraphs: scored.reduce((n, l) => n + l.checked, 0),
    identical: scored.reduce((n, l) => n + l.identical, 0),
    draftPath: record.draftPath ?? null,
    accounts,
    ...(({ open, read }) => ({ findings: open, read }))(splitRead(findingsOf(record, new Set(scope.knownKinds), accounts), scope.read ?? [])),
  }
}

async function main(): Promise<number> {
  const stamp = harnessStamp()
  const today = stamp.at.slice(0, 10)
  const frozen = !rulesDirty() && scope.rules.tree === rulesTree()
  const probe = argFlag('probe')

  const listed: BgblListing[] = []
  for (let year = scope.trialFrom.year; year <= Number(today.slice(0, 4)); year++) listed.push(...await listYear(year))
  const inScope = listed.filter((l) => atOrAfter(l, scope.trialFrom)).sort((a, b) => a.year - b.year || a.number - b.number)
  const gaps = gapsIn(inScope, scope.trialFrom)
  const byPool = (pool: Pool) => inScope.filter((l) => poolOf(l, scope) === pool)

  if (byPool('holdout').length > 0 && !frozen && !probe) {
    console.error(`✘ ${byPool('holdout').length} Gesetz(e) nach dem Einfrieren, aber dieser Code ist nicht ${scope.rules.tag ?? 'eingefroren'}: mit --probe messen oder den Stand auschecken`)
    return 2
  }

  const pools = {} as Record<Pool, PoolReport>
  for (const pool of POOLS) {
    const entries = byPool(pool)
    const ids = entries.filter((l) => l.typ === 'Bundesgesetz').map((l) => l.id)
    if (ids.length > 0) console.log(`… ${POOL_NAME[pool]}: ${ids.length} Bundesgesetzblätter`)
    pools[pool] = reportOf(entries, scoreWithKons(ids), today)
  }

  console.log(`\nBGBl. I ab Nr. ${scope.trialFrom.number}/${scope.trialFrom.year}: ${inScope.length} gelistet, ${gaps.length ? `FEHLEND: ${gaps.join(', ')}` : 'keine Nummer fehlt'}`)
  console.log(`Regeln: ${frozen ? `eingefroren (${scope.rules.tag})` : `NICHT der eingefrorene Stand${probe ? ' (--probe: nichts zählt)' : ''}`}`)
  for (const pool of POOLS) {
    const p = pools[pool]
    if (p.listed === 0) {
      console.log(`\n${POOL_NAME[pool]}: noch keine`)
      continue
    }
    console.log(`\n${POOL_NAME[pool]}: ${p.listed}`)
    console.log(`  Ausgang: ${Object.entries(p.outcomes).map(([k, n]) => `${k} ${n}`).join(', ')}`)
    console.log(`  Gesetze gemessen ${p.lawsScored}, Paragraphen ${p.paragraphs}, identisch ${p.identical}`)
    const d = p.draftPath
    if (d) console.log(`  Entwurfspfad: ${d.shown} §§, vergleichbar ${d.comparable}, Wort für Wort das Gesetz ${d.identical}; nicht bewertet ${d.shown - d.comparable}`)
    for (const a of p.accounts.filter((x) => x.outcome === 'pending')) console.log(`  wartet: ${a.nummer} — ${a.reason}`)
    for (const f of p.findings) console.log(`  ✗ [${f.kind}] ${f.detail}`)
    for (const f of p.read) console.log(`  · gelesen [${f.kind}] ${f.detail} — ${f.why}`)
  }

  const jsonFile = argAssigned('json')
  if (jsonFile) writeFileSync(jsonFile, `${JSON.stringify({ ...stamp, rules: { tag: scope.rules.tag, frozen, probe }, census: { from: scope.trialFrom, listed: inScope.length, gaps }, pools }, null, 1)}\n`)
  return gaps.length > 0 || pools.holdout.findings.length > 0 ? 1 : 0
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(`✘ nicht gemessen: ${String(err)}`)
  process.exit(2)
})
