#!/usr/bin/env vite-node
/**
 * Coverage report for the Novellierungsanordnung grammar (server/utils/novao.ts)
 * over the corpus harvested by `scripts/novao-corpus.ts`.
 *
 * Usage:  npx vite-node scripts/novao-forms.ts [cacheDir] [--samples N]
 *
 * Prints the share of instructions that become a typed operation, the mix of
 * operations, and — the part that matters — a sample of what is refused,
 * grouped by reason. Refusal is a feature: everything listed there stays an
 * instruction on screen instead of becoming a wrong law text.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseInstruction } from '../server/utils/novao'

const cacheDir = process.argv[2]?.startsWith('--') ? join('.cache', 'novao') : (process.argv[2] ?? join('.cache', 'novao'))
const samples = Number(process.argv.find((a) => a.startsWith('--samples='))?.split('=')[1] ?? 6)

const rows = (await readFile(join(cacheDir, 'novao.jsonl'), 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as { id: string; kurztitel: string; cls: string; text: string })

const byKind = new Map<string, number>()
const byReason = new Map<string, { n: number; lines: string[] }>()
let ok = 0
for (const r of rows) {
  const { ops, reason, line } = parseInstruction(r.text)
  if (ops.length) {
    ok++
    for (const op of ops) byKind.set(op.kind, (byKind.get(op.kind) ?? 0) + 1)
  } else {
    const entry = byReason.get(reason ?? '?') ?? { n: 0, lines: [] }
    entry.n++
    if (entry.lines.length < samples) entry.lines.push(line.slice(0, 160))
    byReason.set(reason ?? '?', entry)
  }
}

const pct = (n: number) => `${((n / rows.length) * 100).toFixed(1)} %`
console.log(`\n${rows.length} Novellierungsanordnungen`)
console.log(`typisiert: ${ok} (${pct(ok)})   verweigert: ${rows.length - ok} (${pct(rows.length - ok)})\n`)

console.log('Operationen:')
for (const [kind, n] of [...byKind].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)} ${pct(n).padStart(7)}  ${kind}`)

console.log('\nVerweigert, nach Grund:')
for (const [reason, e] of [...byReason].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${String(e.n).padStart(5)} ${pct(e.n).padStart(7)}  ${reason}`)
  for (const l of e.lines) console.log(`          · ${l}`)
}
