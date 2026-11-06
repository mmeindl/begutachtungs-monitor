/**
 * Bund zu Land through the production modules — which Land drafts carry
 * out a Grundsatzgesetz or implement an Art.-15a agreement, and which act
 * (docs/architecture.md §12.67; the measurement before the build is §12.66
 * Nachtrag 10).
 *
 * READS ONLY THE CACHE of the Länder' EU measurement (`.cache/eu-laender`,
 * `pnpm corpus:eu-laender`): the list, each draft's detail and its PDFs.
 * No request — a draft whose answer is not cached is an error row. Every
 * reading is the page's: the Erläuterungen' reader (`readLandExplanations`)
 * over the cached bytes, the draft's own text where the Land files it
 * apart, then `ausfuehrungDocumentsOf` and `readAusfuehrungAll`. Only the
 * fetch is replaced, as in `euLaender.ts`.
 *
 *     pnpm corpus:bund-land
 *     pnpm corpus:bund-land -- --prototype <reader.out.json>   # disagreements with the measurement's prototype
 *     pnpm corpus:bund-land -- --show <land>-<number>          # every finding of one draft, with its sentence
 *
 * Runs with `-c vitest.config.ts`: `texts/read.ts` imports `#shared`.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LaenderResponse, LandDraftDetail } from '../../shared/types'
import { LAND_CODES } from '../../shared/utils/laender'
import { readLandExplanations } from '../../server/utils/laender/landExplanationsRead'
import { NOT_A_DRAFT, pagesOfBytes } from '../../server/utils/laender/texts/read'
import { safeExternalUrl } from '../../shared/utils/safeExternalUrl'
import { ausfuehrungDocumentsOf, isShown, readAusfuehrungAll, type Ausfuehrung } from '../../server/utils/bund-land/ausfuehrung'
import { pool } from '../lib/async'
import { argPair } from '../lib/args'

const CACHE = join('.cache', 'eu-laender')
const GP = 'XXVIII'
const PDF_CONCURRENCY = 4

const prototypePath = argPair('prototype')
const show = argPair('show')

const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex')
const serverJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(join(CACHE, 'server', `${sha1(path)}.json`), 'utf8')) as T
const pdfBytes = async (url: string): Promise<Uint8Array> => {
  try {
    return new Uint8Array(await readFile(join(CACHE, 'docs', `${sha1(url)}.pdf`)))
  } catch {
    throw new Error('nicht im Cache (pdf)')
  }
}

const list = await serverJson<LaenderResponse>(`/api/laender?gp=${GP}&status=all`)
let items = [...list.items].sort((a, b) => a.id.localeCompare(b.id))
if (show) items = items.filter((i) => i.id === show)
const numberOf = (id: string) => id.slice(id.indexOf('-') + 1)

interface Row {
  id: string
  land: string
  found: Ausfuehrung[]
  error: string | null
}

const rows: Row[] = await pool(items, PDF_CONCURRENCY, async (item): Promise<Row> => {
  try {
    const detail = await serverJson<LandDraftDetail>(`/api/laender/${item.land}/${encodeURIComponent(numberOf(item.id))}`).catch(() => null)
    const documents = detail?.draft.documents.length ? detail.draft.documents : item.documents
    const read = await readLandExplanations(item.land, { draft: { title: detail?.draft.title ?? item.title, documents } }, pdfBytes)
    if (read.response.unavailableReason === NOT_A_DRAFT) return { id: item.id, land: item.land, found: [], error: null }
    let draftPages = read.draftUrl ? read.pages.get(read.draftUrl) ?? null : null
    if (read.draftUrl && !draftPages && !read.draftFailed) draftPages = await pagesOfBytes(await pdfBytes(read.draftUrl)).catch(() => null)
    const erl = read.response
    const docs = ausfuehrungDocumentsOf({
      land: item.land,
      documents: documents.map((d) => ({ title: d.title, url: safeExternalUrl(d.url) ?? d.url })),
      pages: read.pages,
      explanations: { available: erl.available, general: erl.general, particular: erl.particular, url: erl.document?.url ?? null },
      draft: { url: read.draftUrl, pages: draftPages },
    })
    return { id: item.id, land: item.land, found: readAusfuehrungAll(docs), error: null }
  } catch (err) {
    return { id: item.id, land: item.land, found: [], error: String(err).slice(0, 160) }
  }
})

const cite = (a: Ausfuehrung) => (a.act.bgbl ? `${a.act.bgbl.number}/${a.act.bgbl.year}` : '—')

if (show) {
  for (const r of rows) {
    console.log(`## ${r.id}${r.error ? ` FEHLER ${r.error}` : ''}`)
    for (const a of r.found) console.log(`  ${a.kind} ${a.strength}${isShown(a) ? '' : ' (nicht gezeigt)'} · ${a.act.name ?? '—'} · BGBl. I ${cite(a)}${a.act.partial ? ' · teilweise' : ''}\n    „${a.sentence}"`)
  }
  process.exit(0)
}

console.log(`# Bund zu Land über die Produktionsmodule — ${GP}, ${rows.length} Entwürfe der Länder`)
console.log(`Fehler (nicht im Cache o. ä.): ${rows.filter((r) => r.error).length}`)
const tally = (pred: (a: Ausfuehrung) => boolean) => rows.filter((r) => r.found.some(pred)).length
console.log('\n## Befunde (Entwürfe)')
for (const kind of ['grundsatzgesetz', 'vereinbarung'] as const) {
  for (const strength of ['strong', 'medium'] as const) console.log(`  ${kind.padEnd(16)} ${strength.padEnd(7)} ${tally((a) => a.kind === kind && a.strength === strength)}`)
}
console.log(`  gezeigt: Grundsatzgesetz ${tally((a) => a.kind === 'grundsatzgesetz' && isShown(a))}, Vereinbarung ${tally((a) => a.kind === 'vereinbarung' && isShown(a))}, irgendeines ${rows.filter((r) => r.found.some(isShown)).length}`)

console.log('\n## Gezeigt je Land (Grundsatzgesetz / Vereinbarung)')
for (const land of LAND_CODES) {
  const of = rows.filter((r) => r.land === land)
  const n = (kind: Ausfuehrung['kind']) => of.filter((r) => r.found.some((a) => a.kind === kind && isShown(a))).length
  console.log(`  ${land.padEnd(5)} ${String(of.length).padStart(3)} Entwürfe · ${n('grundsatzgesetz')} / ${n('vereinbarung')}`)
}

console.log('\n## Grundsatzgesetze nach Kundmachung (gezeigte Befunde)')
const byAct = new Map<string, string[]>()
for (const r of rows) for (const a of r.found) if (a.kind === 'grundsatzgesetz') byAct.set(cite(a), [...(byAct.get(cite(a)) ?? []), `${r.id}${a.act.name ? ` (${a.act.name})` : ''}`])
for (const [k, ids] of [...byAct.entries()].sort((a, b) => b[1].length - a[1].length)) console.log(`  BGBl. I ${k}: ${ids.length} — ${ids.join(', ')}`)

console.log('\n## Vereinbarungen (strong) nach Gegenstand')
const byAgreement = new Map<string, number>()
for (const r of rows) for (const a of r.found) if (a.kind === 'vereinbarung' && a.strength === 'strong') byAgreement.set(a.act.name ?? '—', (byAgreement.get(a.act.name ?? '—') ?? 0) + 1)
for (const [k, n] of [...byAgreement.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n} × ${k}`)

if (prototypePath) {
  type Proto = { id: string; gg: { strength: string } | null; a15: { strength: string } | null }
  const proto = new Map((JSON.parse(await readFile(prototypePath, 'utf8')) as Proto[]).map((p) => [p.id, p]))
  console.log('\n## Abweichungen vom Prototyp (Klasse je Art)')
  let n = 0
  for (const r of rows) {
    const p = proto.get(r.id)
    const mine = (kind: Ausfuehrung['kind']) => r.found.find((a) => a.kind === kind)?.strength ?? null
    const gg = [p?.gg?.strength ?? null, mine('grundsatzgesetz')]
    const va = [p?.a15?.strength ?? null, mine('vereinbarung')]
    if (gg[0] !== gg[1] || va[0] !== va[1]) {
      n++
      console.log(`  ${r.id}: GG ${gg[0] ?? '—'} → ${gg[1] ?? '—'} · 15a ${va[0] ?? '—'} → ${va[1] ?? '—'}${r.error ? ` · ${r.error}` : ''}`)
    }
  }
  console.log(`  ${n} Abweichungen`)
}
process.exit(0)
