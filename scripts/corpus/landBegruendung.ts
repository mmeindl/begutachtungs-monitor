#!/usr/bin/env vite-node
/**
 * Where a Land's Begründungen land — a census over the cached Länder drafts
 * (20.11.2026), offline. Until this file no instrument reached them: which
 * law and which §§ the reader gives each „Zu …" entry of a draft's
 * Erläuterungen, and what the Begründungsvergleich Entwurf → Regierungsvorlage
 * makes of the changes beside it.
 *
 *   npx vite-node -c vitest.config.ts scripts/corpus/landBegruendung.ts -- --out <dir> [--land sbg] [--show sbg-34234] [--against <dir>] [--tgu <tgu.jsonl>]
 *
 * THE PIPELINE IS THE PRODUCT'S: `readLandExplanations` reads each draft's
 * Erläuterungen as its page does, `compareLandReasoning` is the route's
 * Begründungsvergleich, handed this file's reads (`textSources` and
 * `compareReadTexts`, the comparison the route serves). This file reads the
 * caches, counts and prints.
 *
 * OFFLINE ONLY. The population is the cached Länder list of GP XXVIII and
 * its drafts (`.cache/eu-laender/server`); PDFs come from the harnesses'
 * disk caches (`.cache/eu-laender/docs`, `.harness-cache/land-guard-docs`,
 * `.harness-cache/tirol-tgu/docs`, `.harness-cache/land-stations-docs`). A
 * PDF in none of them is not fetched: the draft is counted as missing. Any
 * other request throws.
 *
 * `--tgu <file>`: the Textgegenüberstellungen as a run of the land guard
 * recorded them (its `tgu.jsonl`, `scripts/harness/landGuard.ts`) — every
 * changed § of each, with the entries the page sets at it (`landReasonsAt`).
 * Without the record's renamed laws: an entry under a law RIS has renamed
 * since counts as not at its §.
 *
 * Output: `<dir>/explanations.jsonl` (per draft every entry: heading, law,
 * §§), `<dir>/reasoning.jsonl` (per draft with a Vorlage: every change of
 * the comparison, its entry and its gap line), with `--tgu`
 * `<dir>/attachments.jsonl` (per changed § the entries at it),
 * `<dir>/summary.md`.
 * `--against <dir>` prints, draft by draft, every entry and every change
 * whose attachment moved since that run — read each one.
 *
 * THE §§ OF A NEW LAW (21.11.2026). A unit of the comparison that IS a §
 * (`isParagraphUnit`) belongs to a law enacted anew, alone or inside a
 * package. Per draft with a Vorlage, `<dir>/own.jsonl` holds every such §
 * changed on both sides, whether each text titles a passage with its own §
 * — „Zu § 9:", „Zu §§ 8 bis 10:", read from the heading's own address, a
 * heading that names a Ziffer is an instruction's — and the entry the
 * comparison gave it. Both texts' entries come from `readLandReasoning`,
 * what `compareLandReasoning` reads.
 *
 * Runs with `-c vitest.config.ts`: `texts/read.ts` imports `#shared`.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LaenderResponse, LandCode, LandDraftDetail, LandTextStation } from '../../shared/types'
import { argPair } from '../lib/args'
import { DERIVED_CACHE } from '../../server/utils/cache/base'
import { pagesOfBytes } from '../../server/utils/laender/texts/read'
import { diffUnitKey } from '../../shared/utils/diffKey'
import { isParagraphUnit } from '../../shared/utils/unitName'
import { headingAddress, leadingAddress, ziffernOf } from '../../server/utils/explanations/risExplanations'
import { articleNumberKey } from '../../server/utils/text/designation'
import { landReasonsAt, unplacedLandReasons } from '../../app/utils/landReasons'

const outDir = argPair('out')
const onlyLand = argPair('land') as LandCode | null
const show = argPair('show')
const against = argPair('against')
const tguFile = argPair('tgu')
if (!outDir) {
  console.error('Usage: npx vite-node -c vitest.config.ts scripts/corpus/landBegruendung.ts -- --out <dir> [--land <code>] [--show <id>] [--against <dir>]')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

// No request leaves this run: the caches are the population.
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`offline: ${String(input)}`)
}) as typeof fetch
// The services define their Nitro caches at load: the identity stands in for them.
Object.assign(globalThis, {
  defineCachedFunction: <A extends unknown[], T>(fn: (...a: A) => Promise<T>) => fn,
  DERIVED_CACHE,
  createError: (input: { statusCode?: number; statusMessage?: string }) => Object.assign(new Error(input.statusMessage ?? 'upstream'), input),
})
const { readLandExplanations } = await import('../../server/utils/laender/landExplanationsRead')
const { compareLandReasoning, readLandReasoning } = await import('../../server/utils/laender/landReasoningService')
const { compareReadTexts } = await import('../../server/utils/laender/landLawDiffService')
const { textSources } = await import('../../server/utils/laender/texts/stations')

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex')
const EU = '.cache/eu-laender'
const missing = new Set<string>()
async function bytesOf(url: string): Promise<Uint8Array> {
  const key = sha1(url)
  for (const file of [`${EU}/docs/${key}.pdf`, `.harness-cache/land-guard-docs/${key}.pdf`, `.harness-cache/tirol-tgu/docs/${key}.pdf`, `.harness-cache/land-stations-docs/${key}.pdf`]) {
    if (existsSync(file)) return new Uint8Array(readFileSync(file))
  }
  missing.add(url)
  throw new Error(`nicht im Cache: ${url}`)
}
const pagesCache = new Map<string, Promise<string[]>>()
const pagesOf = (url: string) => {
  if (!pagesCache.has(url)) pagesCache.set(url, bytesOf(url).then((b) => pagesOfBytes(b.slice())))
  return pagesCache.get(url)!
}

// --- The population ------------------------------------------------------
const list = JSON.parse(readFileSync(`${EU}/server/${sha1('/api/laender?gp=XXVIII&status=all')}.json`, 'utf8')) as LaenderResponse
const items = list.items
  .filter((i) => (!onlyLand || i.land === onlyLand) && (!show || i.id === show))
  .sort((a, b) => a.id.localeCompare(b.id))

interface EntryLine { heading: string; law: string | null; paras: string[] }
interface ExplanationsLine { land: LandCode; draft: string; state: string; reason: string | null; entries: EntryLine[] }
interface ChangeLine { key: string; change: string; entry: string | null; verdict: string | null; gap: string | null }
interface ReasoningLine { land: LandCode; draft: string; state: string; reason: string | null; stats: Record<string, number> | null; changes: ChangeLine[] }
/** A § of a new law changed on both sides: the passages each text titles with its own § (indexes into its entries), and the comparison's entry. */
interface OwnUnit { key: string; before: number[]; after: number[]; entry: string | null; verdict: string | null }
interface OwnLine { land: LandCode; draft: string; laws: number; paragraphUnits: number; compared: number; units: OwnUnit[]; headings: { before: string[]; after: string[] } }

const explanations: ExplanationsLine[] = []
const reasoning: ReasoningLine[] = []
const own: OwnLine[] = []
/**
 * The passages of one text titled with a §'s own designation: the heading's
 * own address names it (`leadingAddress`, as the Bund's join reads a
 * heading) and no Ziffer; on a side whose units carry an Artikel, under the
 * unit's own.
 */
function titledWith(entries: readonly { heading: string; article: string | null }[], para: string | null, article: string | null): number[] {
  if (!para) return []
  return entries.flatMap((e, i) => {
    if (ziffernOf(e.heading).length) return []
    if (!headingAddress(leadingAddress(e.heading)).paragraphs.includes(`§ ${para.toLowerCase()}`)) return []
    if (article && e.article && articleNumberKey(e.article) !== article) return []
    return [i]
  })
}
let done = 0
for (const item of items) {
  done++
  const number = item.id.slice(item.id.indexOf('-') + 1)
  const file = `${EU}/server/${sha1(`/api/laender/${item.land}/${encodeURIComponent(number)}`)}.json`
  if (!existsSync(file)) continue
  const detail = JSON.parse(readFileSync(file, 'utf8')) as LandDraftDetail

  // The Erläuterungen, as the draft page reads them.
  const e: ExplanationsLine = { land: item.land, draft: item.id, state: 'gelesen', reason: null, entries: [] }
  explanations.push(e)
  try {
    const read = await readLandExplanations(item.land, detail, bytesOf, pagesOf)
    if (!read.response.available) {
      e.state = 'nicht verfügbar'
      e.reason = read.response.unavailableReason
    }
    if (read.draftFailed) e.state = `${e.state}, Entwurf fehlt`
    e.entries = read.response.particular.map((p) => ({ heading: p.heading, law: p.law, paras: p.paras }))
  } catch (err) {
    e.state = /nicht im Cache/.test(String(err)) ? 'fehlt' : 'Fehler'
    e.reason = String(err).slice(0, 200)
  }

  // The Begründungsvergleich, where the draft has a Vorlage.
  if ((detail.comparisons ?? []).some(([a, b]) => a === 'entwurf' && b === 'rv')) {
    const r: ReasoningLine = { land: item.land, draft: item.id, state: 'verglichen', reason: null, stats: null, changes: [] }
    reasoning.push(r)
    try {
      const comparison = async () => {
        const sources = textSources(item.land, detail, pagesOf)
        const a = sources.entwurf!
        const b = sources.rv!
        return compareReadTexts('entwurf' as LandTextStation, 'rv' as LandTextStation, [await a.read(), await b.read()], [a.document, b.document])
      }
      const shown = await comparison()
      const value = await compareLandReasoning(item.land, number, detail, { pagesOf, comparison: async () => shown })
      if (!value.available) {
        r.state = 'nicht verfügbar'
        r.reason = value.unavailableReason
      }
      r.stats = value.stats
      const gaps = (value as { gaps?: Record<string, string> }).gaps ?? {}
      r.changes = (shown.available ? shown.units : []).filter((u) => u.change !== 'unchanged').map((u) => {
        const key = diffUnitKey(u)
        const entryKey = value.units[key] ?? null
        const entry = entryKey ? value.entries[entryKey] : null
        return { key, change: u.change, entry: entryKey, verdict: entry ? (!entry.comparable ? 'ohne Vergleich' : entry.changed ? 'geändert' : 'unverändert') : null, gap: gaps[key] ?? null }
      })
      // The §§ of a new law, beside both texts' entries.
      const paragraphUnits = (shown.available ? shown.units : []).filter(isParagraphUnit)
      const inputs = paragraphUnits.length ? await readLandReasoning(item.land, detail, { pagesOf, comparison: async () => shown }) : null
      if (inputs && !('unavailable' in inputs)) {
        const verdictOf = new Map(r.changes.map((c) => [c.key, c]))
        own.push({
          land: item.land,
          draft: item.id,
          laws: new Set(shown.units.map((u) => u.article)).size,
          paragraphUnits: paragraphUnits.length,
          compared: value.stats.compared,
          units: paragraphUnits.filter((u) => u.change === 'changed').map((u) => {
            const key = diffUnitKey(u)
            return {
              key,
              before: titledWith(inputs.before, u.fromId?.slice(1) ?? null, u.fromArticleKey),
              after: titledWith(inputs.after, u.id.slice(1), u.articleKey),
              entry: verdictOf.get(key)?.entry ?? null,
              verdict: verdictOf.get(key)?.verdict ?? null,
            }
          }),
          headings: { before: inputs.before.map((e) => `${e.article ?? '–'} ${e.heading}`), after: inputs.after.map((e) => `${e.article ?? '–'} ${e.heading}`) },
        })
      }
    } catch (err) {
      r.state = /nicht im Cache/.test(String(err)) ? 'fehlt' : 'Fehler'
      r.reason = String(err).slice(0, 200)
    }
  }
  process.stderr.write(`\r${done}/${items.length} ${item.id}            `)
}
process.stderr.write('\n')

// --- At the Textgegenüberstellung's §§ (`--tgu`) -------------------------
interface AttachmentLine { land: LandCode; draft: string; laws: number; units: { unit: string; entries: number[] }[]; unplaced?: number[] }
const attachments: AttachmentLine[] = []
if (tguFile) {
  const byDraft = new Map(explanations.map((l) => [l.draft, l]))
  for (const line of readFileSync(tguFile, 'utf8').split('\n').filter(Boolean)) {
    const t = JSON.parse(line) as { land: LandCode; draft: string; available: boolean; units: { law: string | null; id: string; change: string }[]; withheld?: { law: string | null }[] }
    const e = byDraft.get(t.draft)
    if (!t.available || !e) continue
    const particular = e.entries.map((x) => ({ ...x, text: [] as string[] }))
    // The record holds no enacted laws (`comparisonLaws` counts them too): a package of one amended and one enacted law reads as one law here.
    const laws = [...t.units.map((u) => u.law), ...(t.withheld ?? []).map((w) => w.law)]
    attachments.push({
      land: t.land,
      draft: t.draft,
      laws: new Set(laws.filter(Boolean)).size,
      units: t.units.filter((u) => u.change !== 'unchanged').map((u) => ({ unit: `${u.law ?? '-'}|${u.id}`, entries: landReasonsAt(particular, { id: u.id, article: u.law }, new Map(), laws).map((x) => particular.indexOf(x)) })),
      unplaced: unplacedLandReasons(particular, laws).map((x) => particular.indexOf(x)),
    })
  }
}

// --- Output --------------------------------------------------------------
writeFileSync(join(outDir, 'explanations.jsonl'), explanations.map((l) => JSON.stringify(l)).join('\n') + '\n')
if (tguFile) writeFileSync(join(outDir, 'attachments.jsonl'), attachments.map((l) => JSON.stringify(l)).join('\n') + '\n')
writeFileSync(join(outDir, 'reasoning.jsonl'), reasoning.map((l) => JSON.stringify(l)).join('\n') + '\n')
writeFileSync(join(outDir, 'own.jsonl'), own.map((l) => JSON.stringify(l)).join('\n') + '\n')
const out: string[] = []
out.push(`# Begründungen der Länder: wo sie stehen — ${new Date().toISOString().slice(0, 16)}`)
out.push('')
out.push(`Population: ${items.length} Entwürfe (GP XXVIII), ${explanations.length} im Cache; PDFs nicht im Cache: ${missing.size}`)
out.push('')
out.push('## Erläuterungen (readLandExplanations)')
out.push('')
out.push('| Land | Entwürfe | gelesen | Einträge | ohne Gesetz | ohne §§ |')
out.push('|---|---|---|---|---|---|')
const lands = [...new Set(explanations.map((l) => l.land))]
for (const land of lands) {
  const ls = explanations.filter((l) => l.land === land)
  const entries = ls.flatMap((l) => l.entries)
  out.push(`| ${land} | ${ls.length} | ${ls.filter((l) => l.state.startsWith('gelesen')).length} | ${entries.length} | ${entries.filter((x) => !x.law).length} | ${entries.filter((x) => !x.paras.length).length} |`)
}
const states = [...explanations.reduce((m, l) => m.set(l.state, (m.get(l.state) ?? 0) + 1), new Map<string, number>())]
out.push('')
out.push(`Zustände: ${states.map(([s, n]) => `${s} ${n}`).join(', ')}`)
const reasons = [...explanations.filter((l) => l.reason && l.state !== 'fehlt').reduce((m, l) => m.set(l.reason!, (m.get(l.reason!) ?? 0) + 1), new Map<string, number>())]
for (const [reason, n] of reasons) out.push(`- ${n}× ${reason}`)
out.push('')
out.push('## Begründungsvergleich Entwurf → Regierungsvorlage (compareLandReasoning)')
out.push('')
const changes = reasoning.flatMap((r) => r.changes.map((c) => ({ r, c })))
const paired = changes.filter(({ c }) => c.change === 'changed')
out.push(`Entwürfe mit Vorlage: ${reasoning.length}; verglichen: ${reasoning.filter((r) => r.state === 'verglichen').length}; Änderungen: ${changes.length}, davon geändert (beidseits): ${paired.length}`)
out.push(`- mit Eintrag: ${changes.filter(({ c }) => c.entry).length} (geändert ${changes.filter(({ c }) => c.verdict === 'geändert').length}, unverändert ${changes.filter(({ c }) => c.verdict === 'unverändert').length}, ohne Vergleich ${changes.filter(({ c }) => c.verdict === 'ohne Vergleich').length})`)
out.push(`- beidseits, ohne Eintrag: ${paired.filter(({ c }) => !c.entry).length}, davon mit Zeile: ${paired.filter(({ c }) => !c.entry && c.gap).length}`)
/* A PDF not in the cache is counted, not named: `explanations.jsonl` and `reasoning.jsonl` keep the URL. */
const stateOf = (l: { state: string; reason: string | null }) => (l.state === 'fehlt' || !l.reason ? l.state : `${l.state} — ${l.reason}`)
const rStates = [...reasoning.reduce((m, l) => m.set(stateOf(l), (m.get(stateOf(l)) ?? 0) + 1), new Map<string, number>())]
for (const [s, n] of rStates) out.push(`- ${n}× ${s}`)
out.push('')
out.push('## Die Paragraphen neuer Gesetze (Einheiten, die ein § sind)')
out.push('')
const ownUnits = own.flatMap((l) => l.units)
const titledBoth = ownUnits.filter((u) => u.before.length && u.after.length)
out.push(`Entwürfe mit Vorlage und §-Einheiten: ${own.length}, davon Pakete: ${own.filter((l) => l.laws > 1).length}; §-Einheiten: ${own.reduce((n, l) => n + l.paragraphUnits, 0)}; geändert (beidseits): ${ownUnits.length}`)
out.push(`- mit einer Passage zum eigenen § in beiden Texten: ${titledBoth.length}; nur im Entwurf: ${ownUnits.filter((u) => u.before.length && !u.after.length).length}; nur in der Vorlage: ${ownUnits.filter((u) => !u.before.length && u.after.length).length}; in keinem: ${ownUnits.filter((u) => !u.before.length && !u.after.length).length}`)
out.push(`- mit Eintrag: ${ownUnits.filter((u) => u.entry).length} (geändert ${ownUnits.filter((u) => u.verdict === 'geändert').length}, unverändert ${ownUnits.filter((u) => u.verdict === 'unverändert').length}, ohne Vergleich ${ownUnits.filter((u) => u.verdict === 'ohne Vergleich').length})`)
out.push('')
out.push('| Entwurf | Gesetze | §-Einheiten | geändert | Passage beidseits | mit Eintrag | verglichen (Entwurf) |')
out.push('|---|---|---|---|---|---|---|')
for (const l of own) out.push(`| ${l.draft} | ${l.laws} | ${l.paragraphUnits} | ${l.units.length} | ${l.units.filter((u) => u.before.length && u.after.length).length} | ${l.units.filter((u) => u.entry).length} | ${l.compared} |`)
if (tguFile) {
  const at = attachments.flatMap((a) => a.units.map((u) => ({ a, u })))
  out.push('')
  out.push('## An den Paragraphen der Textgegenüberstellung (landReasonsAt)')
  out.push('')
  out.push(`Entwürfe: ${attachments.length}, davon Pakete: ${attachments.filter((a) => a.laws > 1).length}; geänderte §§: ${at.length}, mit Begründung: ${at.filter(({ u }) => u.entries.length).length}, Zuordnungen: ${at.reduce((n, { u }) => n + u.entries.length, 0)}; am Ende der Liste, ohne Gesetz: ${attachments.reduce((n, a) => n + (a.unplaced?.length ?? 0), 0)}`)
}
writeFileSync(join(outDir, 'summary.md'), out.join('\n') + '\n')
console.log(out.join('\n'))

// --- Against an earlier run: every attachment that moved -----------------
if (against) {
  const read = <T>(f: string): T[] => readFileSync(join(against, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T)
  const entryText = (x: EntryLine) => `${x.heading} → ${x.law ?? '–'} | ${x.paras.join(', ') || '–'}`
  const before = new Map(read<ExplanationsLine>('explanations.jsonl').map((l) => [l.draft, l]))
  const moved: string[] = []
  for (const l of explanations) {
    const old = before.get(l.draft)
    if (!old) continue
    if (old.state !== l.state || old.reason !== l.reason) moved.push(`${l.draft} Zustand: ${old.state} (${old.reason ?? ''}) → ${l.state} (${l.reason ?? ''})`)
    const n = Math.max(old.entries.length, l.entries.length)
    for (let i = 0; i < n; i++) {
      const a = old.entries[i] ? entryText(old.entries[i]!) : '(keiner)'
      const b = l.entries[i] ? entryText(l.entries[i]!) : '(keiner)'
      if (a !== b) moved.push(`${l.draft} #${i}: ${a}\n    → ${b}`)
    }
  }
  const beforeR = new Map(read<ReasoningLine>('reasoning.jsonl').map((l) => [l.draft, l]))
  for (const l of reasoning) {
    const old = beforeR.get(l.draft)
    if (!old) continue
    if (old.state !== l.state || old.reason !== l.reason) moved.push(`${l.draft} Vergleich: ${old.state} (${old.reason ?? ''}) → ${l.state} (${l.reason ?? ''})`)
    const oldChanges = new Map(old.changes.map((c) => [c.key, c]))
    for (const c of l.changes) {
      const o = oldChanges.get(c.key)
      const said = (x: ChangeLine | undefined) => (x ? `${x.entry ?? '–'} ${x.verdict ?? ''} ${x.gap ?? ''}`.trim() : '(fehlt)')
      if (said(o) !== said(c)) moved.push(`${l.draft} ${c.key}: ${said(o)} → ${said(c)}`)
    }
  }
  if (tguFile && existsSync(join(against, 'attachments.jsonl'))) {
    const beforeA = new Map(read<AttachmentLine>('attachments.jsonl').map((l) => [l.draft, l]))
    const entriesOf = new Map(explanations.map((l) => [l.draft, l.entries]))
    for (const l of attachments) {
      const old = new Map((beforeA.get(l.draft)?.units ?? []).map((u) => [u.unit, u.entries]))
      for (const u of l.units) {
        const was = old.get(u.unit) ?? []
        if (was.join() === u.entries.join()) continue
        const named = (xs: number[]) => xs.map((i) => entryText(entriesOf.get(l.draft)![i]!)).join(' ¦ ') || '–'
        moved.push(`${l.draft} an ${u.unit}: ${named(was.filter((i) => !u.entries.includes(i)))} weg; ${named(u.entries.filter((i) => !was.includes(i)))} dazu`)
      }
      const wasEnd = beforeA.get(l.draft)?.unplaced ?? []
      const isEnd = l.unplaced ?? []
      if (wasEnd.join() !== isEnd.join()) moved.push(`${l.draft} am Ende der Liste: ${isEnd.map((i) => entryText(entriesOf.get(l.draft)![i]!)).join(' ¦ ') || '–'} (vorher ${wasEnd.length})`)
    }
  }
  console.log(`\n## Bewegt gegen ${against}: ${moved.length}\n`)
  for (const m of moved) console.log(`- ${m}`)
}
