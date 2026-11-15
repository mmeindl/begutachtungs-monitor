/**
 * What the Cellar records about how the map's EU acts came about — the
 * measurement behind the rail of an act (15.11.2026): who adopted each act,
 * whether a dossier with a procedure number and a proposal hangs on it,
 * which of the steps the monitor reads (`EU_EVENTS`) occur, and which dates
 * of entry into force and application are typed.
 *
 * THE RULES ARE THE PRODUCT'S. The query, the fetch policy and the reading
 * are `server/utils/eu/cellarDossier.ts` — the module the act's page runs
 * (`railOf`) — so a run is the oracle for the page. This file only picks
 * the acts, keeps the answers on disk, counts and prints.
 *
 * THE ACTS are the EU map's: every CELEX of a draft whose fact carries a
 * marker, from the map's store file (`.data/eu-recht/XXVIII.json`, written
 * by the running app; another file as the first argument).
 *
 *     pnpm exec vite-node scripts/corpus/euVerfahren.ts
 *     pnpm exec vite-node scripts/corpus/euVerfahren.ts -- .data/eu-recht/XXVII.json
 *     pnpm exec vite-node scripts/corpus/euVerfahren.ts -- --refresh       # ask the Cellar again
 *     pnpm exec vite-node scripts/corpus/euVerfahren.ts -- --dump 32024L1069   # one act's rail as JSON
 *
 * Reads only. Each raw answer is kept in `.harness-cache/eu-dossier/
 * <CELEX>.json` and read from there on the next run, so a second run makes
 * no request; two in flight against the Cellar, as the other corpus runs
 * and the server hold it (`cellarService.ts`).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CELEX_RE, type SparqlAnswer } from '../../server/utils/eu/cellar'
import { fetchDossierAnswer, parseDossierAnswer } from '../../server/utils/eu/cellarDossier'
import type { EuActRail } from '../../shared/types/eu'
import { EU_EVENTS } from '../../shared/utils/euEvents'
import { pool } from '../lib/async'
import { argFlag, argPair } from '../lib/args'
import { quantile } from '../lib/fmt'

const CACHE = join('.harness-cache', 'eu-dossier')
const CELLAR_CONCURRENCY = 2

const refresh = argFlag('refresh')
const dump = argPair('dump')
const args = process.argv.slice(2)
const storeFile = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--dump' && !a.endsWith('euVerfahren.ts')) ?? join('.data', 'eu-recht', 'XXVIII.json')

if (dump !== null && !CELEX_RE.test(dump)) {
  console.error('Usage: vite-node scripts/corpus/euVerfahren.ts [store.json] [--refresh] [--dump 32024L1069]')
  process.exit(1)
}

await mkdir(CACHE, { recursive: true })

/** One act's raw answer: from the disk unless `--refresh`, else from the Cellar, then kept. */
async function answerOf(celex: string): Promise<SparqlAnswer> {
  const file = join(CACHE, `${celex}.json`)
  if (!refresh) {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as SparqlAnswer
    } catch {
      // not kept yet
    }
  }
  const answer = await fetchDossierAnswer(celex)
  await writeFile(file, JSON.stringify(answer))
  return answer
}

if (dump !== null) {
  console.log(JSON.stringify(parseDossierAnswer(await answerOf(dump), dump), null, 2))
  process.exit(0)
}

/** The store file's shape, as far as it is read here. */
interface StoreLike {
  entries?: Record<string, { fact?: { marker?: unknown; acts?: { celex?: string }[] } }>
}

const store = JSON.parse(await readFile(storeFile, 'utf8')) as StoreLike
const celexes = [...new Set(Object.values(store.entries ?? {})
  .filter((e) => !!e.fact?.marker)
  .flatMap((e) => e.fact?.acts ?? [])
  .map((a) => a.celex)
  .filter((c): c is string => typeof c === 'string' && CELEX_RE.test(c)))].sort()

const results = await pool(celexes, CELLAR_CONCURRENCY, async (celex) => {
  try {
    return { celex, rail: parseDossierAnswer(await answerOf(celex), celex), error: null as string | null }
  } catch (err) {
    return { celex, rail: null as EuActRail | null, error: String(err) }
  }
}, (done, total) => {
  if (done % 25 === 0 || done === total) process.stderr.write(`  ${done}/${total}\n`)
})

const read = results.filter((r): r is { celex: string; rail: EuActRail; error: null } => r.rail !== null)
const failed = results.filter((r) => r.rail === null)
const kindOf = (celex: string): string => celex[5]!

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

const out: string[] = []
const line = (s = ''): void => {
  out.push(s)
}
const counts = <K extends string>(keys: K[]): [K, number][] => {
  const m = new Map<K, number>()
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
}
const spread = (xs: number[]): string => (xs.length ? `min ${Math.min(...xs)} · median ${quantile(xs, 0.5)} · max ${Math.max(...xs)}` : '—')

line(`EU acts and their procedure in the Cellar — ${storeFile}`)
line(`acts: ${celexes.length} (read ${read.length}, failed ${failed.length})`)
for (const f of failed) line(`  FAILED ${f.celex}: ${f.error}`)
line()

line('adoptedBy × procedure')
for (const by of ['parlament-rat', 'rat', 'kommission', 'unbekannt'] as const) {
  const of = read.filter((r) => r.rail.adoptedBy === by)
  line(`  ${by.padEnd(14)} ${String(of.length).padStart(4)}   procedure null ${String(of.filter((r) => !r.rail.procedure).length).padStart(4)} · not null ${String(of.filter((r) => r.rail.procedure).length).padStart(4)}`)
}
line()

const withProcedure = read.filter((r) => r.rail.procedure !== null)
line(`with a procedure: ${withProcedure.length}`)
line(`  with a procedure reference: ${withProcedure.filter((r) => r.rail.procedure!.reference).length}`)
line(`  with an Observatory link: ${withProcedure.filter((r) => r.rail.procedure!.observatoryUrl).length}`)
line(`  with ≥1 proposal: ${withProcedure.filter((r) => r.rail.procedure!.proposals.length > 0).length}`)
line(`  with a proposal CELEX: ${withProcedure.filter((r) => r.rail.procedure!.proposals.some((p) => p.celex)).length}`)
line(`  with ≥2 proposals: ${withProcedure.filter((r) => r.rail.procedure!.proposals.length > 1).length}`)
line('  by procedure type:')
for (const [type, n] of counts(withProcedure.map((r) => r.rail.procedure!.type ?? '(none)'))) line(`    ${type.padEnd(8)} ${n}`)
line(`  read events per act: ${spread(withProcedure.map((r) => r.rail.procedure!.events.length))}`)
line(`  otherEvents per act: ${spread(withProcedure.map((r) => r.rail.procedure!.otherEvents))}`)
line()

line('read event codes (acts having ≥1)')
const codeActs = counts(withProcedure.flatMap((r) => [...new Set(r.rail.procedure!.events.map((e) => e.code))]))
for (const [code, n] of codeActs) line(`  ${code.padEnd(24)} ${String(n).padStart(4)}   ${EU_EVENTS[code]?.role ?? '?'}`)
const never = Object.keys(EU_EVENTS).filter((c) => !codeActs.some(([k]) => k === c))
line(`  never occurring: ${never.join(', ') || '—'}`)
line()

line('dates by kind')
for (const kind of ['R', 'D', 'L', 'F']) {
  const of = read.filter((r) => kindOf(r.celex) === kind)
  if (!of.length) continue
  const inForce = of.filter((r) => r.rail.inForce).length
  if (kind === 'L') {
    line(`  ${kind}: ${of.length} acts · inForce ${inForce} · partialApplication ${of.filter((r) => r.rail.partialApplication.length).length}`)
  } else {
    // `effective` („PE") is what a Beschluss carries instead of an entry into force.
    line(`  ${kind}: ${of.length} acts · inForce ${inForce} · effective ${of.filter((r) => r.rail.effective).length} · applies ${of.filter((r) => r.rail.applies).length} · partialApplication ${of.filter((r) => r.rail.partialApplication.length).length}`)
  }
}
line()

const list = (title: string, rows: typeof read, detail: (r: (typeof read)[number]) => string): void => {
  line(`${title}: ${rows.length}`)
  for (const r of rows) line(`  ${r.celex}  ${detail(r)}`)
  line()
}
list('adoptedBy unbekannt', read.filter((r) => r.rail.adoptedBy === 'unbekannt'), (r) => `procedure ${r.rail.procedure ? r.rail.procedure.reference ?? '(no reference)' : 'null'}`)
list('parlament-rat or rat without a procedure', read.filter((r) => (r.rail.adoptedBy === 'parlament-rat' || r.rail.adoptedBy === 'rat') && !r.rail.procedure), (r) => `${r.rail.adoptedBy} · inForce ${r.rail.inForce ?? '—'}`)
list(
  'a procedure but no step of role parliament or council',
  withProcedure.filter((r) => !r.rail.procedure!.events.some((e) => EU_EVENTS[e.code]?.role === 'parliament' || EU_EVENTS[e.code]?.role === 'council')),
  (r) => `${r.rail.adoptedBy} · ${r.rail.procedure!.reference ?? '(no reference)'} · ${r.rail.procedure!.type ?? '(no type)'} · read ${r.rail.procedure!.events.map((e) => e.code).join(' ') || '—'} · other ${r.rail.procedure!.otherEvents}`,
)

console.log(out.join('\n'))
