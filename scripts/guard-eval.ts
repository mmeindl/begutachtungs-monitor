#!/usr/bin/env vite-node
/**
 * Scores the draft-time guard (`server/utils/applyGuard.ts`) against a
 * harness dump (`kons-harness.ts --dump=<file>`).
 *
 * Usage:  npx vite-node scripts/guard-eval.ts <dump.jsonl> [<dump2.jsonl> …]
 *
 * The question is precision and recall on the dangerous class: of the
 * paragraphs the guard lets through, how many diverge from RIS, and how
 * many correct paragraphs does it reject for that. A dump taken with an
 * *older* engine is the adversarial case — the failures in it are the ones
 * nobody had fixed yet, which is what a future bug will look like.
 *
 * The dump carries the trees before and after and every instruction that
 * addressed the paragraph, so the real `guardParagraph` runs here, not a
 * replica of it.
 */
import { readFileSync } from 'node:fs'
import { guardParagraph, type GuardFlag } from '../server/utils/applyGuard'
import type { ApplyResult, Instruction, StandingLaw } from '../server/utils/lawApply'
import type { LawNode } from '../server/utils/lawStructure'

interface Record_ {
  bgbl: string
  label: string
  id: string
  verdict: 'identisch' | 'unverändert' | 'unvollständig' | 'abweichend'
  refused: boolean
  comparable?: boolean
  beforeTree: LawNode | null
  afterTree: LawNode
  touching: { kind: string; applied: boolean; reason: string | null; line: string; op: Instruction['op']; payload: LawNode[] }[]
}

const files = process.argv.slice(2).filter((a) => !a.startsWith('-'))
if (files.length === 0) {
  console.error('Usage: npx vite-node scripts/guard-eval.ts <dump.jsonl> …')
  process.exit(1)
}

const pct = (n: number, of: number) => (of === 0 ? '—' : `${((n / of) * 100).toFixed(1)} %`)

for (const file of files) {
  const records: Record_[] = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const scored = records.map((r) => {
    const before: StandingLaw = { paragraphs: r.beforeTree ? [r.beforeTree] : [] }
    const touching = r.touching.map((t) => ({
      instruction: { op: t.op, payload: t.payload, line: t.line } as Instruction,
      result: { line: t.line, kind: t.op.kind, applied: t.applied, reason: t.reason, para: null } as ApplyResult,
    }))
    const guard = guardParagraph(r.id, before, r.beforeTree, r.afterTree, touching)
    // The harness marks a refusal on the § from grammar-level refusals too,
    // which the guard cannot see in the instruction list; take the union.
    const flags = new Set<GuardFlag>(guard.flags)
    if (r.refused) flags.add('verweigert')
    const dangerous = r.verdict === 'abweichend' && r.comparable !== false
    return { r, flags, dangerous }
  })

  console.log(`\n${'='.repeat(78)}\n${file}: ${scored.length} Paragraphen`)
  const total = { n: scored.length, danger: scored.filter((s) => s.dangerous).length, ident: scored.filter((s) => s.r.verdict === 'identisch').length }
  console.log(`  insgesamt: ${total.n}, davon abweichend ${total.danger}, identisch ${total.ident}`)

  const row = (name: string, pass: (s: (typeof scored)[number]) => boolean) => {
    const passed = scored.filter(pass)
    const danger = passed.filter((s) => s.dangerous).length
    const ident = passed.filter((s) => s.r.verdict === 'identisch').length
    console.log(
      `  ${name.padEnd(40)} lässt durch ${String(passed.length).padStart(3)}  abweichend ${String(danger).padStart(2)} (${pct(danger, passed.length).padStart(6)})  identisch ${String(ident).padStart(3)}/${total.ident} (Recall ${pct(ident, total.ident)})  gefangen ${total.danger - danger}/${total.danger}`,
    )
  }
  row('kein Gate', () => true)
  row('nur Verweigerung', (s) => !s.flags.has('verweigert'))
  for (const f of ['umfang', 'fuge', 'marker', 'unerklärt', 'unprüfbar'] as GuardFlag[]) row(`Verweigerung + ${f}`, (s) => !s.flags.has('verweigert') && !s.flags.has(f))
  row('Verweigerung + umfang + fuge + marker', (s) => !s.flags.has('verweigert') && !s.flags.has('umfang') && !s.flags.has('fuge') && !s.flags.has('marker') && !s.flags.has('unprüfbar'))
  row('alle Signale (plausible)', (s) => s.flags.size === 0)

  const missed = scored.filter((s) => s.dangerous && s.flags.size === 0)
  if (missed.length) {
    console.log(`  durchgerutscht (${missed.length}):`)
    for (const m of missed) console.log(`    ${m.r.bgbl} ${m.r.label}  ${m.r.touching.map((t) => t.kind).join(',')}`)
  }
}
