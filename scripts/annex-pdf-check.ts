#!/usr/bin/env vite-node
/**
 * Reads an annex PDF through `annexPdf.ts` and prints the rows (docs/api-exploration.md §2c).
 * Usage: npx vite-node scripts/annex-pdf-check.ts <file.pdf|url> [maxRows]
 */
import { readFileSync } from 'node:fs'
import { parseAnnexPdf } from '../server/utils/annexPdf'
import { pagesOf } from '../server/utils/annexPdfPages'

const src = process.argv[2]!
const max = Number(process.argv[3] ?? 25)
const bytes = /^https?:/.test(src)
  ? new Uint8Array(await (await fetch(src, { headers: { 'User-Agent': 'begutachtungs-monitor/0.1' } })).arrayBuffer())
  : new Uint8Array(readFileSync(src))
// `parseAnnexPdf` gained its boundary refusal after this script was written
// (1056c1f), and the script kept destructuring nothing — it crashed on
// "rows is not iterable" from then until 2026-09-09. `scripts/` is outside
// the typecheck, which is how that stayed invisible.
const { rows, refusal } = parseAnnexPdf(await pagesOf(bytes))
if (refusal) console.log(`Gesetzesgrenzen verweigert: ${refusal}\n`)
const n = { article: 0, unchanged: 0, changed: 0, inserted: 0, removed: 0, elided: 0 }
for (const r of rows) {
  if (r.kind === 'article') n.article++
  else { n[r.change]++; if (r.elided) n.elided++ }
}
console.log(`${rows.length} Zeilen — ${JSON.stringify(n)}\n`)
for (const r of rows.slice(0, max)) {
  if (r.kind === 'article') { console.log(`\n### ${r.heading}`); continue }
  const tag = r.elided ? 'ausgelassen' : r.change
  console.log(`[${tag}]${r.gld ? ` ${r.gld}` : ''}`)
  console.log(`   ALT: ${r.current.slice(0, 110)}`)
  console.log(`   NEU: ${r.proposed.slice(0, 110)}`)
}
