#!/usr/bin/env vite-node
/**
 * „Was das Gesetz geändert hat" on a Land's law page — the comparison of a
 * Landesgesetzblatt's §§ before and after, from RIS's consolidated
 * Landesrecht (`landLawChangesService.ts`) — over N Landesgesetzblätter per
 * Land, with one invariant that fails the run (20.11.2026).
 *
 *   npx vite-node -c vitest.config.ts scripts/harness/landLawChanges.ts -- --out <dir> [--n 10] [--land sbg] [--cached-only] [--against <dir> [--erwartet 'a→b,c→d']]
 *
 * Until this file nothing measured it: the per-Land figures of
 * `docs/decisions.md` (20 laws per Land, five read by hand, 12.11.2026)
 * came from a run that left no script, and the reader changed three times
 * since (the Schlussteil, sub-instructions, `enactedUnread`).
 *
 * THE PIPELINE IS THE PRODUCT'S: the population is each Land's
 * Landesgesetzblatt index (`fetchLgblIndex`, the laws `isLawEntry` takes),
 * each Landesgesetzblatt's record comes from `lgblRecord` and the comparison
 * from `compareLandLawChanges` with the arguments the route passes
 * (`vergleich.get.ts`). This file fetches, counts and prints.
 *
 * THE POPULATION: per Land, the laws since 2016 in the index, sorted by
 * Kundmachung, N of them evenly spaced from the oldest to the newest (the
 * newest always in). A law whose record holds no XML is one the page does
 * not offer the comparison for: counted, not run.
 *
 * NETWORK: RIS only (`data.bka.gv.at`, `ris.bka.gv.at`; any other host
 * throws), through the harness fetch cache (`HARNESS_CACHE`, default
 * `.harness-cache`), one request after the other. `--cached-only`: nothing
 * leaves the machine; what the cache lacks fails as RIS failing would, and
 * the run counts it as unreached.
 *
 * THE INVARIANT: every § RIS ties to the Landesgesetzblatt (named last in
 * its Kundmachungsorgan, or repealed by it — `namesAsLast`, `repealedBy`)
 * ends exactly once: shown, or withheld with a reason; or the section is
 * off as a whole, with its sentence. A § in neither, or in both, or twice,
 * fails the run (exit 1) and is printed.
 *
 * Output: `<dir>/lgbl.jsonl` (one line per Landesgesetzblatt: its record,
 * the section's state, every § with its outcome and both texts),
 * `<dir>/summary.md` (per Land: reasons with their counts), `<dir>/record.json`
 * (`harnessStamp`, reach, counts). `--against <dir>` prints every § whose
 * outcome or text moved since that run and fails on a move whose transition
 * `--erwartet` does not name („withheld:unpaired→withheld:lawUnmatched",
 * „text" for a text move of a § shown both times), and on every move of the
 * section's own state („Abschnitt: aus „Nicht veröffentlicht“→verglichen“),
 * which a section off with no § RIS ties to it shows alone.
 *
 * Runs with `-c vitest.config.ts`: the services import `#shared`.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LandCode, LandLawDiffResponse } from '../../shared/types'
import { installFetchCache } from '../lib/harnessCache'
import { corpusReach, harnessStamp } from '../lib/harnessRecord'
import { argFlag, argPair } from '../lib/args'
import { DERIVED_CACHE } from '../../server/utils/cache/base'

const LANDS: LandCode[] = ['bgld', 'ktn', 'noe', 'ooe', 'sbg', 'stmk', 't', 'vbg', 'w']
const outDir = argPair('out')
const n = Number(argPair('n') ?? 10)
const onlyLand = argPair('land') as LandCode | null
const against = argPair('against')
const expected = new Set((argPair('erwartet') ?? '').split(',').map((s) => s.trim()).filter(Boolean))
const cachedOnly = argFlag('cached-only')
if (!outDir || !Number.isInteger(n) || n < 1) {
  console.error('Usage: npx vite-node -c vitest.config.ts scripts/harness/landLawChanges.ts -- --out <dir> [--n 10] [--land <code>] [--cached-only] [--against <dir> [--erwartet a→b,…]]')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

// --- Network: RIS only, one request after the other, beneath the cache ----
let requests = 0
const realFetch = globalThis.fetch
let queue: Promise<unknown> = Promise.resolve()
globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === 'string' ? input : String((input as Request)?.url ?? input)
  const host = new URL(url).hostname
  if (host !== 'data.bka.gv.at' && host !== 'ris.bka.gv.at' && !host.endsWith('.ris.bka.gv.at')) return Promise.reject(new Error(`kein RIS-Host: ${url}`))
  if (cachedOnly) return Promise.reject(new Error(`nicht im Cache: ${url}`))
  const next = queue.then(async () => {
    requests++
    const res = await realFetch(input, init)
    const body = await res.arrayBuffer()
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers })
  })
  queue = next.catch(() => undefined)
  return next
}) as typeof fetch
installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

// The services define their Nitro caches at load: the identity stands in, so what runs is the function itself.
Object.assign(globalThis, {
  defineCachedFunction: <A extends unknown[], T>(fn: (...a: A) => Promise<T>) => fn,
  DERIVED_CACHE,
  createError: (input: { statusCode?: number; statusMessage?: string }) => Object.assign(new Error(input.statusMessage ?? 'upstream'), input),
})
const { compareLandLawChanges, NOT_CONSOLIDATED_YET_DE } = await import('../../server/utils/laender/landLawChangesService')
const { fetchLgblIndex, lgblRecord } = await import('../../server/utils/laender/lgblIndex')
const { isLawEntry } = await import('../../server/utils/laender/landLaws')
const { konsRefsOfLgbl, lgblNummer } = await import('../../server/utils/laender/landKonsLaws')
const { instructionLawFor, konsVersionOf, lgblInstructedParagraphs, lgblNamedParagraphs, namesAsLast, repealedBy, subInstructionHeads } = await import('../../server/utils/laender/landLawChanges')
const { lgblUnits } = await import('../../server/utils/laender/landLawDiff')
const { upstreamText } = await import('../../server/utils/upstream/fetch')
const { TEXT_POLICY } = await import('../../server/utils/laender/texts/read')

const sha = (s: string | null | undefined) => (s == null ? null : createHash('sha1').update(s).digest('hex').slice(0, 12))

/** One § RIS ties to the Landesgesetzblatt, and where it ended. */
interface ParagraphLine {
  law: string
  id: string
  /** `shown:<change>`, `withheld:<reason>`, `off` (the section as a whole), or `lost` / `twice` (the invariant broken). */
  outcome: string
  fromHash: string | null
  toHash: string | null
  fromText: string | null
  toText: string | null
  /** The shown unit's heading, for the „lautet:" census (RIS sets it apart from the text). */
  heading?: string | null
}
interface LgblLine {
  land: LandCode
  nr: string
  title: string
  datum: string | null
  offered: boolean
  error: string | null
  available: boolean | null
  reason: string | null
  complete: boolean | null
  paragraphs: ParagraphLine[]
  /** Withheld entries for §§ RIS does not tie to the Landesgesetzblatt — an instruction names them (`unpaired`). */
  instructedOnly: { law: string | null; id: string; reason: string }[]
}

/** N evenly spaced from first to last, the last always in. */
function spread<T>(xs: readonly T[], k: number): T[] {
  if (xs.length <= k) return [...xs]
  if (k === 1) return [xs.at(-1)!]
  const at = new Set(Array.from({ length: k }, (_, i) => Math.round((i * (xs.length - 1)) / (k - 1))))
  return [...at].sort((a, b) => a - b).map((i) => xs[i]!)
}

/** Every § RIS ties to this Landesgesetzblatt, by law and key — read as the service reads them; `laws`: how many laws its records name, as the service counts them. */
async function tiedParagraphs(land: LandCode, nr: string): Promise<{ law: string; id: string }[] & { laws?: number }> {
  const nummer = lgblNummer(nr)
  if (!nummer) return []
  const { refs } = await konsRefsOfLgbl(land, nummer)
  const versions = refs.map(konsVersionOf).filter((v) => v !== null)
  const out = new Map<string, { law: string; id: string }>()
  for (const v of versions) {
    if (namesAsLast(v.organ, nummer) || repealedBy(v.organ, nummer)) out.set(`${v.law}|${v.key}`, { law: v.law, id: v.key })
  }
  return Object.assign([...out.values()], { laws: new Set(versions.map((v) => v.law)).size })
}

/** The §§ of one answer by outcome; a § that ends twice or nowhere breaks the invariant. */
function outcomes(value: LandLawDiffResponse, tied: readonly { law: string; id: string }[]): { paragraphs: ParagraphLine[]; instructedOnly: LgblLine['instructedOnly'] } {
  const seen = new Map<string, { outcome: string; from: string | null; to: string | null; heading?: string | null }[]>()
  const add = (law: string | null, id: string, o: { outcome: string; from: string | null; to: string | null; heading?: string | null }) => seen.set(`${law ?? ''}|${id}`, [...(seen.get(`${law ?? ''}|${id}`) ?? []), o])
  for (const u of value.units) {
    const o = { outcome: `shown:${u.change}`, from: u.fromText ?? null, to: u.toText ?? null, heading: u.heading }
    add(u.article, u.id, o)
    if (u.fromId && u.fromId !== u.id) add(u.fromArticle ?? u.article, u.fromId, o)
  }
  for (const w of value.withheld) add(w.law, w.id, { outcome: `withheld:${w.reason ?? 'none'}`, from: null, to: null })
  const tiedKeys = new Set(tied.map((t) => `${t.law}|${t.id}`))
  const paragraphs = tied.map(({ law, id }) => {
    const hits = seen.get(`${law}|${id}`) ?? []
    const outcome = hits.length === 1 ? hits[0]!.outcome : hits.length > 1 ? `twice:${hits.map((h) => h.outcome).join('+')}` : !value.available && value.withheld.length === 0 ? 'off' : 'lost'
    const h = hits.length === 1 ? hits[0]! : null
    return { law, id, outcome, fromHash: sha(h?.from), toHash: sha(h?.to), fromText: h?.from ?? null, toText: h?.to ?? null, heading: h?.heading ?? null }
  })
  const instructedOnly = value.withheld.filter((w) => !tiedKeys.has(`${w.law ?? ''}|${w.id}`)).map((w) => ({ law: w.law, id: w.id, reason: w.reason ?? 'none' }))
  return { paragraphs, instructedOnly }
}

/**
 * THE „LAUTET:" CENSUS (G088, 21.11.2026; a count, no rule): the new
 * wording the page shows is RIS's, the Landesgesetzblatt only addresses
 * the §. Where an instruction quotes the wording itself („§ 5 lautet:",
 * „§ 5 Abs. 2 lautet:"), its words must stand in RIS's new version; and
 * where it replaces the whole §, RIS's words must stand in its wording too.
 * Words, not sequence: a miss is a word one side has and the other lacks;
 * RIS's side is the shown unit's heading, number and text. The § is the
 * one of the instruction's law, matched as the service matches it
 * (`instructionLawFor`). Skipped and counted: nested instructions
 * (Salzburg's „15.1."), and an instruction whose § is not shown.
 */
interface LautetLine { land: LandCode; nr: string; id: string; instruction: string; whole: boolean; notInRis: string[]; notInLgbl: string[] }
const lautet = { instructions: 0, skipped: 0, checked: 0, lines: [] as LautetLine[] }
const wordsOf = (s: string) => new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []))
function lautetCensus(land: LandCode, nr: string, lgblXml: string, paragraphs: readonly ParagraphLine[], risLaws: number): void {
  const units = lgblUnits(lgblXml)
  const instructionLaws = [...lgblInstructedParagraphs(units).keys()]
  for (const u of units) {
    if (!/^Z/.test(u.id)) continue
    const at = /\blautet\b[^:„"]*:/.exec(u.text)
    if (!at || /[„"]/.test(u.text.slice(0, at.index))) continue
    const head = u.text.slice(0, at.index)
    const keys = lgblNamedParagraphs(head).filter((k) => k.startsWith('§'))
    if (keys.length !== 1 || /Inhaltsverzeichnis|Anlage|Anhang/.test(head)) continue
    lautet.instructions++
    const shown = paragraphs.filter((p) => p.id === keys[0] && p.toText && /^shown:(changed|inserted)$/.test(p.outcome) && instructionLawFor(p.law, instructionLaws, risLaws) === u.article)
    if (subInstructionHeads(u.text).length || shown.length !== 1) {
      lautet.skipped++
      continue
    }
    lautet.checked++
    const quoted = wordsOf(u.text.slice(at.index + at[0].length))
    const ris = wordsOf(`${shown[0]!.id} ${shown[0]!.heading ?? ''} ${shown[0]!.toText}`)
    const whole = /^(?:Der\s+)?(?:nunmehrige\s+)?§\s*\d+[a-z]*\s*$/.test(head.trim())
    const notInRis = [...quoted].filter((w) => !ris.has(w))
    const notInLgbl = whole ? [...ris].filter((w) => !quoted.has(w)) : []
    if (notInRis.length || notInLgbl.length) lautet.lines.push({ land, nr, id: keys[0]!, instruction: u.text.slice(0, 300), whole, notInRis, notInLgbl })
  }
}

// --- The run -------------------------------------------------------------
const lines: LgblLine[] = []
const unreached: { id: string; cause: string }[] = []
let requested = 0
for (const land of LANDS.filter((l) => !onlyLand || l === onlyLand)) {
  let entries: Awaited<ReturnType<typeof fetchLgblIndex>>
  try {
    entries = await fetchLgblIndex(land)
  } catch (err) {
    requested += n
    unreached.push({ id: `${land}:index`, cause: (err as Error).message })
    console.log(`${land}: Index nicht gelesen — ${(err as Error).message}`)
    continue
  }
  const laws = entries.filter(isLawEntry).filter((e) => e.datum >= '2016-01-01').sort((a, b) => a.datum.localeCompare(b.datum) || a.nr.localeCompare(b.nr, 'de', { numeric: true }))
  const chosen = spread(laws, n)
  requested += chosen.length
  for (const e of chosen) {
    const line: LgblLine = { land, nr: e.nr, title: e.titel, datum: e.datum.slice(0, 10), offered: false, error: null, available: null, reason: null, complete: null, paragraphs: [], instructedOnly: [] }
    try {
      const record = await lgblRecord(land, e.nr)
      line.offered = !!record?.xmlUrl
      if (record?.xmlUrl) {
        // As the route calls it (`vergleich.get.ts`).
        const { value, complete } = await compareLandLawChanges(land, e.nr, record.xmlUrl, e.url, record.datum?.slice(0, 10) ?? null)
        line.available = value.available
        line.reason = value.unavailableReason
        line.complete = complete
        const tied = await tiedParagraphs(land, e.nr)
        Object.assign(line, outcomes(value, tied))
        if (value.available) lautetCensus(land, e.nr, await upstreamText(record.xmlUrl, TEXT_POLICY), line.paragraphs, tied.laws ?? 0)
        // Not held on purpose where RIS has not consolidated yet; any other incomplete answer rests on a failed read.
        if (!complete && value.unavailableReason !== NOT_CONSOLIDATED_YET_DE) unreached.push({ id: `${land}:${e.nr}`, cause: 'unvollständig (eine Quelle antwortete nicht)' })
      }
    } catch (err) {
      line.error = (err as Error).message
      unreached.push({ id: `${land}:${e.nr}`, cause: line.error })
    }
    lines.push(line)
    const broken = line.paragraphs.filter((p) => p.outcome === 'lost' || p.outcome.startsWith('twice')).length
    console.log(`${land} ${e.nr} ${line.datum} · ${line.error ? `Fehler: ${line.error}` : line.offered ? `${line.paragraphs.length} §§ · ${line.available ? 'verglichen' : 'aus'}${broken ? ` · ${broken} VERLETZT` : ''}` : 'kein Vergleich angeboten'} · ${requests} Anfragen`)
  }
}

// --- Report --------------------------------------------------------------
writeFileSync(join(outDir, 'lgbl.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
const count = (xs: readonly string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])
const md: string[] = ['# „Was das Gesetz geändert hat" — Landesgesetzblätter', '', `${harnessStamp().commit} · ${new Date().toISOString()} · N = ${n} je Land · ${requests} Anfragen ans RIS`, '']
const perLand: Record<string, { lgbl: number; offered: number; compared: number; paragraphs: number; outcomes: Record<string, number>; off: Record<string, number> }> = {}
for (const land of LANDS) {
  const own = lines.filter((l) => l.land === land)
  if (!own.length) continue
  const ps = own.flatMap((l) => l.paragraphs)
  const offs = own.filter((l) => l.offered && l.available === false).map((l) => (l.reason ?? '').slice(0, 90))
  perLand[land] = {
    lgbl: own.length,
    offered: own.filter((l) => l.offered).length,
    compared: own.filter((l) => l.available).length,
    paragraphs: ps.length,
    outcomes: Object.fromEntries(count(ps.map((p) => p.outcome))),
    off: Object.fromEntries(count(offs)),
  }
  md.push(`## ${land}`, '', `${own.length} Landesgesetzblätter, ${perLand[land]!.offered} mit Vergleich, ${perLand[land]!.compared} mit Liste · ${ps.length} §§ vom RIS zugeordnet`, '')
  for (const [o, k] of count(ps.map((p) => p.outcome))) md.push(`- ${o}: ${k}`)
  for (const [o, k] of count(offs)) md.push(`- Abschnitt aus (${k}×): ${o}`)
  const extra = own.flatMap((l) => l.instructedOnly)
  if (extra.length) md.push(`- nur angewiesen, vom RIS nicht zugeordnet: ${extra.length}`)
  md.push('')
}
const violations = lines.flatMap((l) => l.paragraphs.filter((p) => p.outcome === 'lost' || p.outcome.startsWith('twice')).map((p) => `${l.land} ${l.nr} ${p.law} ${p.id}: ${p.outcome}`))
md.push('## Invariante', '', violations.length ? violations.map((v) => `- ${v}`).join('\n') : 'Jeder vom RIS zugeordnete Paragraph endet genau einmal.', '')
if (unreached.length) md.push('## Nicht erreicht', '', ...unreached.map((u) => `- ${u.id}: ${u.cause}`), '')
const wholeMiss = lautet.lines.filter((l) => l.whole && l.notInLgbl.length).length
md.push('## „lautet:" (Zählung, keine Regel)', '', `${lautet.instructions} Anweisungen „… lautet:" zu einem Paragraphen, ${lautet.skipped} übersprungen, ${lautet.checked} geprüft: ${lautet.lines.filter((l) => l.notInRis.length).length} mit Wörtern, die in der neuen Fassung des RIS fehlen; ${wholeMiss} ganze Paragraphen mit Wörtern des RIS, die das Landesgesetzblatt nicht hat (${join(outDir, 'lautet.txt')}).`, '')
writeFileSync(join(outDir, 'lautet.txt'), lautet.lines.map((l) => `${l.land} ${l.nr} ${l.id}${l.whole ? ' (ganz)' : ''}\n  ${l.instruction}\n  fehlt im RIS: ${l.notInRis.join(' ') || '—'}${l.whole ? `\n  fehlt im LGBl: ${l.notInLgbl.join(' ') || '—'}` : ''}`).join('\n') + '\n')

// --- Against an earlier run ----------------------------------------------
let unexplained = 0
if (against) {
  const file = join(against, 'lgbl.jsonl')
  if (!existsSync(file)) {
    console.error(`--against: ${file} fehlt`)
    process.exit(1)
  }
  const old = new Map<string, ParagraphLine>()
  const oldLgbl = new Map<string, LgblLine>()
  // The section's own state: a section off with no § RIS ties to it moves in its sentence alone.
  const section = (l: LgblLine) => (!l.offered ? 'nicht angeboten' : l.available ? 'verglichen' : `aus „${(l.reason ?? '').split(':')[0]}“`)
  for (const l of readFileSync(file, 'utf8').split('\n').filter(Boolean).map((s) => JSON.parse(s) as LgblLine)) {
    oldLgbl.set(`${l.land} ${l.nr}`, l)
    for (const p of l.paragraphs) old.set(`${l.land} ${l.nr} ${p.law} ${p.id}`, p)
  }
  const moves: string[] = []
  const transitions: string[] = []
  for (const l of lines) {
    if (!oldLgbl.has(`${l.land} ${l.nr}`)) {
      moves.push(`${l.land} ${l.nr}: nur in diesem Lauf`)
      continue
    }
    const was = section(oldLgbl.get(`${l.land} ${l.nr}`)!)
    if (was !== section(l)) {
      const t = `Abschnitt: ${was}→${section(l)}`
      transitions.push(t)
      if (!expected.has(t)) unexplained++
      moves.push(`${l.land} ${l.nr}: ${t}${expected.has(t) ? '' : ' (UNERKLÄRT)'}`)
    }
    for (const p of l.paragraphs) {
      const key = `${l.land} ${l.nr} ${p.law} ${p.id}`
      const o = old.get(key)
      old.delete(key)
      const before = o?.outcome ?? 'fehlt'
      let t: string | null = null
      if (before !== p.outcome) t = `${before}→${p.outcome}`
      else if (o && (o.fromHash !== p.fromHash || o.toHash !== p.toHash)) t = 'text'
      if (!t) continue
      transitions.push(t)
      if (!expected.has(t)) unexplained++
      moves.push(`${key}: ${t}${expected.has(t) ? '' : ' (UNERKLÄRT)'}${t === 'text' ? `\n    vorher: ${o?.fromText ?? '—'} ⟶ ${o?.toText ?? '—'}\n    jetzt:  ${p.fromText ?? '—'} ⟶ ${p.toText ?? '—'}` : ''}`)
    }
  }
  for (const [key, o] of old) {
    if (lines.some((l) => key.startsWith(`${l.land} ${l.nr} `))) {
      transitions.push(`${o.outcome}→fehlt`)
      unexplained++
      moves.push(`${key}: ${o.outcome}→fehlt (UNERKLÄRT)`)
    }
  }
  md.push(`## Gegen ${against}`, '', ...count(transitions).map(([t, k]) => `- ${t}: ${k}${expected.has(t) ? ' (erwartet)' : ''}`), '')
  writeFileSync(join(outDir, 'moves.txt'), moves.join('\n') + '\n')
  console.log(`\n--against: ${moves.length} Bewegungen, ${unexplained} unerklärt (${join(outDir, 'moves.txt')})`)
  for (const [t, k] of count(transitions)) console.log(`  ${t}: ${k}${expected.has(t) ? ' (erwartet)' : ''}`)
}

writeFileSync(join(outDir, 'summary.md'), md.join('\n'))
writeFileSync(join(outDir, 'record.json'), JSON.stringify({
  ...harnessStamp(),
  n,
  reach: corpusReach(requested, unreached),
  requests,
  violations: violations.length,
  lautet: { instructions: lautet.instructions, skipped: lautet.skipped, checked: lautet.checked, misses: lautet.lines.length },
  perLand,
}, null, 2) + '\n')
console.log(`\n${md.join('\n')}`)
if (violations.length || unexplained) process.exit(1)
