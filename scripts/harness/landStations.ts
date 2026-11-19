#!/usr/bin/env vite-node
/**
 * The Länder station comparisons — Entwurf → Regierungsvorlage, Vorlage →
 * Ausschuss, Vorlage or Entwurf → Landesgesetzblatt — over the cached
 * population, with invariants that fail the run (19.11.2026).
 *
 *   npx vite-node -c vitest.config.ts scripts/harness/landStations.ts -- --out <dir> [--land sbg] [--show sbg-34234] [--cached-only] [--against <dir>]
 *
 * Until this file no instrument reached these comparisons: the Länder
 * corpus script read Oberösterreich only, through the dev server, with an
 * extraction of its own, and asserted nothing; the land guard reads the
 * Textgegenüberstellung. Four reader faults stood on the station pages
 * unseen — a cited „§ 8." wrapped onto its own line opened a § (an internal
 * „§ 8#dup" on the page), Salzburg's sub-instructions „15.1.1." split on the
 * Landesgesetzblatt's side only, table values standing alone on a line were
 * dropped from the PDFs, and Salzburg's running head wrapped onto two lines
 * was read as law.
 *
 * THE PIPELINE IS THE PRODUCT'S: `textSources` names the texts of a draft's
 * stations, their `read` runs the product's readers (`draftPdfLaw`,
 * `lgblUnits`), and `compareReadTexts` is the comparison the route serves
 * (`landLawDiffService.ts`). This file fetches, counts and prints. Not run:
 * the drafts that share a Kundmachung (a warning above the list, read from
 * the Land's site) — nothing below depends on it.
 *
 * The population is the cached Länder list of GP XXVIII and its drafts
 * (`.cache/eu-laender/server`, written by `corpus:eu-laender`), every pair
 * a draft offers (`LandDraftDetail.comparisons`) but the Textgegenüberstellung.
 * PDFs come from `.cache/eu-laender/docs`, `.harness-cache/land-guard-docs`
 * and this harness's own `.harness-cache/land-stations-docs`; a PDF in none
 * of them is fetched through `landPdfBytes` at one request per second and
 * kept (`--cached-only`: not fetched, the pair counted as missing). RIS — the
 * Landesgesetzblatt's record and XML — goes through the harness fetch cache
 * (`HARNESS_CACHE`, default `.harness-cache`).
 *
 * THE INVARIANTS. Each counts what the page would show and must not:
 *  - `#dup`: a unit id the parser marked as a repeat — the page prints it
 *    („§ 8#dup", „Z 15#dup") and pairs it as a unit of its own;
 *  - `Nur Ziffern neu`: a unit changed by nothing but inserted bare numbers
 *    — a table value or an enumerator one side's reader dropped;
 *  - `Kopfzeile`: the Land's running head (a file path, Word's save stamp)
 *    in a unit's text;
 *  - `Unteranweisung neu`: an instruction shown as new whose text opens
 *    with a sub-instruction's number („1.1. In der Z 6 …").
 * A hit fails the run (exit 1) and is printed with its comparison.
 *
 * Output: `<dir>/comparisons.jsonl` (one line per pair: state, stats, every
 * unit with its non-equal segments), `<dir>/summary.md`. `--against <dir>`
 * prints, pair by pair, every unit whose change or segments moved since that
 * run — the old-against-new reading of a reader change.
 *
 * Runs with `-c vitest.config.ts`: `texts/read.ts` imports `#shared`.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LaenderResponse, LandCode, LandDraftDetail, LandLawDiffResponse, LandTextStation, LawDiffUnit } from '../../shared/types'
import { installFetchCache } from '../lib/harnessCache'
import { argFlag, argPair } from '../lib/args'
import { DERIVED_CACHE } from '../../server/utils/cache/base'
import { landPdfBytes, pagesOfBytes } from '../../server/utils/laender/texts/read'

const outDir = argPair('out')
const onlyLand = argPair('land') as LandCode | undefined
const show = argPair('show')
const against = argPair('against')
const cachedOnly = argFlag('cached-only')
if (!outDir) {
  console.error('Usage: npx vite-node -c vitest.config.ts scripts/harness/landStations.ts -- --out <dir> [--land <code>] [--show <id>] [--cached-only] [--against <dir>]')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })
installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

// The comparison's module defines its Nitro cache at load: the identity
// stands in for it, so what runs is the comparison itself.
Object.assign(globalThis, {
  defineCachedFunction: <A extends unknown[], T>(fn: (...a: A) => Promise<T>) => fn,
  DERIVED_CACHE,
  createError: (input: { statusCode?: number; statusMessage?: string }) => Object.assign(new Error(input.statusMessage ?? 'upstream'), input),
})
const { compareReadTexts } = await import('../../server/utils/laender/landLawDiffService')
const { textSources } = await import('../../server/utils/laender/texts/stations')

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex')
const EU = '.cache/eu-laender'
const OWN_DOCS = '.harness-cache/land-stations-docs'
mkdirSync(OWN_DOCS, { recursive: true })

// --- Bytes: cached wherever they are, else fetched at 1 request/s ---------
let lastFetch = 0
const fetched: string[] = []
const missing: string[] = []
async function bytesOf(url: string): Promise<Uint8Array> {
  const key = sha1(url)
  for (const file of [`${EU}/docs/${key}.pdf`, `.harness-cache/land-guard-docs/${key}.pdf`, `.harness-cache/tirol-tgu/docs/${key}.pdf`, `${OWN_DOCS}/${key}.pdf`]) {
    if (existsSync(file)) return new Uint8Array(readFileSync(file))
  }
  if (cachedOnly) {
    missing.push(url)
    throw new Error(`nicht im Cache: ${url}`)
  }
  const wait = lastFetch + 1_000 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastFetch = Date.now()
  const bytes = await landPdfBytes(url)
  writeFileSync(`${OWN_DOCS}/${key}.pdf`, bytes)
  fetched.push(url)
  return bytes
}
const pagesCache = new Map<string, Promise<string[]>>()
const pagesOf = (url: string) => {
  if (!pagesCache.has(url)) pagesCache.set(url, bytesOf(url).then((b) => pagesOfBytes(b.slice())))
  return pagesCache.get(url)!
}

// --- The invariants ------------------------------------------------------
type Invariant = '#dup' | 'Nur Ziffern neu' | 'Kopfzeile' | 'Unteranweisung neu'
const INVARIANTS: Invariant[] = ['#dup', 'Nur Ziffern neu', 'Kopfzeile', 'Unteranweisung neu']
/** A running head of Salzburg's template: a drive or network path, or Word's save stamp „….docx \ 27.11.2025 07:29:00". */
const HEAD_RE = /(?:^|\s)(?:[A-Z]:\\|\\\\)\S|\.docx?\s*\\\s*\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}/
/** What the instruction's number leaves when the parser takes only its first level: „1.1. In der Z 6", „1a. …", „2 Abs 3". */
const SUB_REST_RE = /^\s*\d+[a-z]?(?:\.\s?\d|\.[a-z]?\s|\s+(?:Im|In|Nach|Vor|Der|Die|Das|Dem|Abs)\b)/

function violations(u: LawDiffUnit): Invariant[] {
  const out: Invariant[] = []
  if (/#dup/.test(u.id) || /#dup/.test(u.fromId ?? '')) out.push('#dup')
  const changed = (u.segments ?? []).filter((s) => s.type !== 'equal')
  if (u.change === 'changed' && changed.length && changed.every((s) => s.type === 'inserted' && /^[\s\d.,%]+$/.test(s.text) && /\d/.test(s.text))) out.push('Nur Ziffern neu')
  if (HEAD_RE.test(u.fromText ?? '') || HEAD_RE.test(u.toText ?? '')) out.push('Kopfzeile')
  if (u.change === 'inserted' && /^Z\d+[a-z]*#dup/.test(u.id) && SUB_REST_RE.test(u.toText ?? '')) out.push('Unteranweisung neu')
  return out
}

// --- The population ------------------------------------------------------
const list = JSON.parse(readFileSync(`${EU}/server/${sha1('/api/laender?gp=XXVIII&status=all')}.json`, 'utf8')) as LaenderResponse
const items = list.items
  .filter((i) => (!onlyLand || i.land === onlyLand) && (!show || i.id === show))
  .sort((a, b) => a.id.localeCompare(b.id))

interface UnitLine { article: string | null; id: string; fromId: string | null; change: string; editorial: boolean; segments: string[]; violations: Invariant[] }
interface ComparisonLine {
  land: LandCode
  draft: string
  pair: string
  state: 'verglichen' | 'nicht verfügbar' | 'fehlt' | 'Fehler'
  reason: string | null
  from: string | null
  to: string | null
  stats: LandLawDiffResponse['stats'] | null
  units: UnitLine[]
}
const lines: ComparisonLine[] = []
const segmentsOf = (u: LawDiffUnit): string[] =>
  u.change === 'unchanged'
    ? []
    : u.change === 'inserted' || u.change === 'removed'
      ? [`${u.change === 'inserted' ? '+' : '-'}${(u.change === 'inserted' ? u.toText : u.fromText ?? '')?.slice(0, 160) ?? ''}`]
      : (u.segments ?? []).filter((s) => s.type !== 'equal').map((s) => `${s.type === 'inserted' ? '+' : '-'}${s.text.slice(0, 160)}`)

let done = 0
for (const item of items) {
  const number = item.id.slice(item.id.indexOf('-') + 1)
  const file = `${EU}/server/${sha1(`/api/laender/${item.land}/${encodeURIComponent(number)}`)}.json`
  done++
  if (!existsSync(file)) continue
  const detail = JSON.parse(readFileSync(file, 'utf8')) as LandDraftDetail
  const pairs = (detail.comparisons ?? []).filter(([a]) => a !== 'geltend' && a !== 'vorher')
  if (!pairs.length) continue
  const sources = textSources(item.land, detail, pagesOf)
  for (const [from, to] of pairs as [LandTextStation, LandTextStation][]) {
    const line: ComparisonLine = { land: item.land, draft: item.id, pair: `${from}→${to}`, state: 'verglichen', reason: null, from: null, to: null, stats: null, units: [] }
    lines.push(line)
    const a = sources[from]
    const b = sources[to]
    if (!a || !b) {
      line.state = 'nicht verfügbar'
      line.reason = 'keine Quelle'
      continue
    }
    try {
      const value = compareReadTexts(from, to, [await a.read(), await b.read()], [a.document, b.document])
      line.from = value.fromDocument?.url ?? value.fromDocument?.label ?? null
      line.to = value.toDocument?.url ?? value.toDocument?.label ?? null
      if (!value.available) {
        line.state = 'nicht verfügbar'
        line.reason = value.unavailableReason
        continue
      }
      line.stats = value.stats
      line.units = value.units.map((u) => ({ article: u.article, id: u.id, fromId: u.fromId, change: u.change, editorial: !!u.editorial, segments: segmentsOf(u), violations: violations(u) }))
    } catch (err) {
      line.state = /nicht im Cache/.test(String(err)) ? 'fehlt' : 'Fehler'
      line.reason = String(err).slice(0, 200)
    }
  }
  process.stderr.write(`\r${done}/${items.length} ${item.id}            `)
}
process.stderr.write('\n')

// --- Output --------------------------------------------------------------
writeFileSync(join(outDir, 'comparisons.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
const out: string[] = []
out.push(`# Länder-Stationen: Vergleiche und Invarianten — ${new Date().toISOString().slice(0, 16)}`)
out.push('')
out.push(`Population: ${items.length} Entwürfe (GP XXVIII), ${lines.length} Stationspaare; PDFs geholt: ${fetched.length}, fehlend: ${missing.length}`)
out.push('')
out.push('| Paar | angeboten | verglichen | nicht verfügbar | fehlt | Fehler | Einheiten | geändert | neu | entfallen |')
out.push('|---|---|---|---|---|---|---|---|---|---|')
const byPair = new Map<string, ComparisonLine[]>()
for (const l of lines) byPair.set(l.pair, [...(byPair.get(l.pair) ?? []), l])
for (const [pair, ls] of [...byPair].sort()) {
  const ok = ls.filter((l) => l.state === 'verglichen')
  const sum = (k: keyof LandLawDiffResponse['stats']) => ok.reduce((n, l) => n + (l.stats?.[k] ?? 0), 0)
  out.push(`| ${pair} | ${ls.length} | ${ok.length} | ${ls.filter((l) => l.state === 'nicht verfügbar').length} | ${ls.filter((l) => l.state === 'fehlt').length} | ${ls.filter((l) => l.state === 'Fehler').length} | ${sum('total')} | ${sum('changed')} | ${sum('inserted')} | ${sum('removed')} |`)
}
out.push('')
out.push('## Invarianten')
out.push('')
const hits = lines.flatMap((l) => l.units.filter((u) => u.violations.length).map((u) => ({ l, u })))
for (const inv of INVARIANTS) {
  const h = hits.filter((x) => x.u.violations.includes(inv))
  out.push(`- ${inv}: ${h.length} Einheiten in ${new Set(h.map((x) => `${x.l.draft} ${x.l.pair}`)).size} Vergleichen`)
}
out.push('')
for (const { l, u } of hits) out.push(`- [${u.violations.join(', ')}] ${l.draft} ${l.pair} ${u.article ?? '-'} ${u.fromId && u.fromId !== u.id ? `${u.fromId} → ` : ''}${u.id} ${u.change}${u.editorial ? ' (redaktionell)' : ''} ${u.segments.slice(0, 4).join(' | ').slice(0, 300)}`)
const errors = lines.filter((l) => l.state === 'Fehler')
if (errors.length) {
  out.push('')
  out.push('## Fehler')
  out.push('')
  for (const l of errors) out.push(`- ${l.draft} ${l.pair}: ${l.reason}`)
}

// --- Old against new -----------------------------------------------------
if (against) {
  const key = (l: ComparisonLine) => `${l.draft} ${l.pair}`
  const old = new Map(readFileSync(join(against, 'comparisons.jsonl'), 'utf8').trim().split('\n').map((s) => JSON.parse(s) as ComparisonLine).map((l) => [key(l), l]))
  const unitKey = (u: UnitLine) => `${u.article ?? '-'}|${u.fromId ?? ''}|${u.id}`
  const shown = (u: UnitLine | undefined) => (u ? `${u.change}${u.editorial ? '/red' : ''} ${u.segments.join(' | ').slice(0, 400)}` : 'fehlt')
  out.push('')
  out.push(`## Gegen ${against}`)
  out.push('')
  let moved = 0
  for (const l of lines) {
    const o = old.get(key(l))
    if (!o) {
      out.push(`- ${key(l)}: neu im Lauf`)
      continue
    }
    const om = new Map(o.units.map((u) => [unitKey(u), u]))
    const nm = new Map(l.units.map((u) => [unitKey(u), u]))
    const diffs = [...new Set([...om.keys(), ...nm.keys()])].filter((k) => shown(om.get(k)) !== shown(nm.get(k)))
    const stats = (x: ComparisonLine) => (x.stats ? `t${x.stats.total} u${x.stats.unchanged} c${x.stats.changed} e${x.stats.editorial} i${x.stats.inserted} r${x.stats.removed}` : x.state)
    if (!diffs.length && stats(o) === stats(l)) continue
    moved++
    out.push(`### ${key(l)}: ${stats(o)} → ${stats(l)}`)
    for (const k of diffs) out.push(`- ${k.replace(/\|/g, ' ')}\n  - alt: ${shown(om.get(k))}\n  - neu: ${shown(nm.get(k))}`)
  }
  out.push('')
  out.push(`Bewegte Vergleiche: ${moved} von ${lines.length}`)
}
writeFileSync(join(outDir, 'summary.md'), out.join('\n'))
console.log(out.join('\n'))
if (missing.length) console.log(`\nFehlende PDFs:\n${missing.join('\n')}`)
process.exit(hits.length ? 1 : 0)
