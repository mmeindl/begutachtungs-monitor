#!/usr/bin/env vite-node
/**
 * Checks a parsed annex PDF against the standing law in RIS (docs/api-exploration.md §2c).
 *
 * The annex's *left* column claims to be the law as it stands. RIS holds that
 * text independently, so the claim is checkable — a self-check the XML path
 * never had. Elision ("(1) und (2) …") means the column is a subset, so the
 * test is containment of tokens, not equality.
 *
 * Usage: npx vite-node scripts/annex-pdf-verify.ts <pdf> "<Kurztitel>" [asOf]
 */
import { readFileSync } from 'node:fs'
import { getDocumentProxy } from 'unpdf'
import { parseAnnexPdf, type AnnexPage } from '../server/utils/annexPdf'
import { plainText } from '../server/utils/lawStructure'
import { fetchAllVersions, fetchParagraphTree, resolveGesetzesnummer } from '../server/utils/risKons'
import { installFetchCache } from './harness-cache'
installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

async function pagesOf(bytes: Uint8Array): Promise<AnnexPage[]> {
  const doc = await getDocumentProxy(bytes)
  const out: AnnexPage[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    out.push({
      width: page.getViewport({ scale: 1 }).width,
      items: content.items.filter((i: any) => typeof i.str === 'string').map((i: any) => ({ x: i.transform[4], y: i.transform[5], width: i.width ?? 0, text: i.str })),
    })
  }
  return out
}

const norm = (t: string) => t.toLowerCase().replace(/[„“”"'‚‘’]/g, '').replace(/[­‑]/g, '-').replace(/\s+/g, ' ')
const tokens = (t: string) => norm(t).split(/[^\p{L}\p{N}§-]+/u).filter((w) => w.length > 2)

const [pdfPath, kurztitel, asOf = new Date().toISOString().slice(0, 10)] = process.argv.slice(2) as [string, string, string?]
const rows = parseAnnexPdf(await pagesOf(new Uint8Array(readFileSync(pdfPath))))

const gesetzesnummer = await resolveGesetzesnummer(kurztitel)
if (!gesetzesnummer) { console.error(`Kurztitel "${kurztitel}" nicht im BrKons`); process.exit(1) }
const versions = await fetchAllVersions(gesetzesnummer)

/** The version of a § in force on `asOf`. */
const inForce = (list: readonly { inkrafttreten: string | null }[]) =>
  [...list].filter((v) => (v.inkrafttreten ?? '0000') <= asOf).sort((a, b) => (a.inkrafttreten ?? '').localeCompare(b.inkrafttreten ?? '')).pop() ?? null

let checked = 0, clean = 0
const misses: string[] = []
for (const row of rows) {
  if (row.kind !== 'pair' || !row.gld || !row.current) continue
  const id = /(\d+[a-z]*)/.exec(row.gld)?.[1]
  const entry = [...versions].find(([label]) => new RegExp(`^§+\\s*${id}\\b`).test(label))
  if (!entry) continue
  const ref = inForce(entry[1] as any)
  if (!ref) continue
  const tree = await fetchParagraphTree(ref as any)
  if (!tree) continue
  checked++
  const have = new Set(tokens(plainText(tree)))
  const want = tokens(row.current)
  const missing = want.filter((w) => !have.has(w))
  const ratio = want.length ? 1 - missing.length / want.length : 1
  if (ratio >= 0.99) clean++
  else misses.push(`  ${row.gld.padEnd(9)} ${(ratio * 100).toFixed(1)} % gedeckt — fehlt: ${missing.slice(0, 10).join(' ')}`)
}
console.log(`\n${kurztitel} — ${checked} Paragraphen der linken Spalte gegen das RIS geprüft`)
console.log(`  ≥99 % im RIS wiedergefunden: ${clean} (${checked ? ((clean / checked) * 100).toFixed(1) : '—'} %)`)
for (const m of misses.slice(0, 12)) console.log(m)
