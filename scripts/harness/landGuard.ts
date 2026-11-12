#!/usr/bin/env vite-node
/**
 * The right column of a Land's Textgegenüberstellung against the Land's own
 * draft — what the Bund's rule „nicht im Entwurf" (`annex/rightColumn.ts`)
 * would say of every § a Land's comparison shows (12.11.2026).
 *
 *   pnpm harness:land-guard -- --out <dir> [--land ooe|sbg|t|w] [--show ooe-2025-16106] [--cached-only]
 *
 * THE PIPELINE IS THE PRODUCT'S: `compareTgu` reads the document and holds
 * its left column against RIS as the page does; `tguDraftBlocks` reads the
 * draft; `guardTguUnits` asks the rule of every § the comparison shows as
 * changed or new. This file fetches, counts and prints. Since the rule is
 * wired into `compareTgu` (12.11.2026) the comparison withholds what it
 * flags itself: the summary counts those from its `withheld` (the
 * product's path), and the table and the fault injection hold the rule
 * against the §§ it shows.
 *
 * The population is the cached Länder list of GP XXVIII
 * (`.cache/eu-laender/server`, written by `corpus:eu-laender`), so no dev
 * server is needed. PDFs come from `.cache/eu-laender/docs`,
 * `.harness-cache/tirol-tgu/docs` and this harness's own
 * `.harness-cache/land-guard-docs`; a PDF in none of them is fetched through
 * `landPdfBytes` at one request per second and kept. RIS answers go through
 * the harness fetch cache (`.harness-cache/land-guard`).
 *
 * Output: `<dir>/units.jsonl` (one line per § shown as changed or new, both
 * texts, the words the draft lacks, the draft's instructions for the §),
 * `<dir>/faults.jsonl` and `<dir>/summary.md`.
 *
 * Fault injection (`--faults`, on by default): every § the rule passes with
 * enough new words to be judged gets, one at a time, a sentence of ANOTHER §
 * of the same draft appended to its new text (R-neu, the Bund's fault), a
 * sentence of ANOTHER Land's draft appended (R-fremd), a number changed, a
 * word swapped, and a sentence dropped — and the rule is asked again. The
 * last three are below the rule's floors or outside its reach by design;
 * they are run so that is a measured statement, not an assumption.
 *
 * Runs with `-c vitest.config.ts`: `texts/read.ts` imports `#shared`.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LaenderResponse, LandCode, LandDraftDetail, LawDiffUnit } from '../../shared/types'
import { installFetchCache } from '../lib/harnessCache'
import { argFlag, argPair } from '../lib/args'
import { landPdfBytes, pagesOfBytes } from '../../server/utils/laender/texts/read'
import { compareTgu, sideBySide, tguDocument, tguDraftBlocks } from '../../server/utils/laender/landTguService'
import { tguPages } from '../../server/utils/laender/landTguPdf'
import { guardTguUnits } from '../../server/utils/laender/landTguGuard'
import { draftUnits } from '../../server/utils/annex/annexDraft'
import { designationKey, comparableTokens } from '../../server/utils/annex/annexText'
import { normalizeText } from '../../server/utils/lawtext/normalize'
import { MIN_NEW_WORDS, draftBags, draftWordBag } from '../../server/utils/annex/rightColumn'
import type { TextBlock } from '../../server/utils/lawtext/lawUnits'

const LANDS: LandCode[] = ['ooe', 'sbg', 't', 'w']
const outDir = argPair('out')
const onlyLand = argPair('land') as LandCode | undefined
const show = argPair('show')
const cachedOnly = argFlag('cached-only')
if (!outDir) {
  console.error('Usage: pnpm harness:land-guard -- --out <dir> [--land ooe|sbg|t|w] [--show <id>] [--cached-only]')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })
installFetchCache('.harness-cache/land-guard')

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex')
const EU = '.cache/eu-laender'
const OWN_DOCS = '.harness-cache/land-guard-docs'
mkdirSync(OWN_DOCS, { recursive: true })

// --- Bytes: cached wherever they are, else fetched at 1 request/s ---------
let lastFetch = 0
const fetched: string[] = []
const missing: string[] = []
async function bytesOf(url: string): Promise<Uint8Array> {
  const key = sha1(url)
  for (const file of [`${EU}/docs/${key}.pdf`, `.harness-cache/tirol-tgu/docs/${key}.pdf`, `${OWN_DOCS}/${key}.pdf`]) {
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

// --- The population ------------------------------------------------------
const list = JSON.parse(readFileSync(`${EU}/server/${sha1('/api/laender?gp=XXVIII&status=all')}.json`, 'utf8')) as LaenderResponse
const items = list.items
  .filter((i) => LANDS.includes(i.land) && (!onlyLand || i.land === onlyLand) && (!show || i.id === show))
  .sort((a, b) => a.id.localeCompare(b.id))

type Layout = 'zwei Spalten' | 'OÖ Spalten' | 'OÖ Striche' | 'Tirol' | 'Wien'
interface UnitRecord {
  land: LandCode
  draft: string
  layout: Layout
  law: string | null
  id: string
  fromId: string | null
  change: string
  newWords: number
  missingWords: number
  share: number | null
  judged: boolean
  /** Held against the whole draft: its law could not be named in the draft (`draftLawKey`). */
  wholeDraft: boolean
  notInDraft: boolean
  undiffed: number
  missing: string[]
  /** …of those, the ones the WHOLE draft lacks too: zero means the words are in the draft, under another address. */
  wholeMissing: string[]
  /** The draft's instructions that carry the most of the missing words, with the §§ they address — where the text sits in the draft. */
  foundIn: string
  inserted: string
  toText: string
  fromText: string
  draftFor: string
}
interface DraftRecord {
  land: LandCode
  id: string
  layout: Layout | null
  state: string
  shown: number
  checked: number
  blocks: number | null
  instructions: number
  addressed: number
  /** The draft's law keys (`DraftUnit.law`) and the laws the document files its §§ under: where they do not meet, the whole draft is the reference. */
  draftLaws: (string | null)[]
  tguLaws: (string | null)[]
  /** What `compareTgu` itself withheld as „nicht im Entwurf" — the product's path, wired since 12.11.2026. */
  productWithheld: string[]
  /** The guard's cost on this comparison, the draft's pages already read: `tguDraftBlocks` + `guardTguUnits`, in ms. */
  guardMs: number | null
}
const units: UnitRecord[] = []
const drafts: DraftRecord[] = []
/** The §§ the rule passes, with what is needed to inject into them. */
interface Site { record: UnitRecord; unit: LawDiffUnit; blocks: TextBlock[]; all: LawDiffUnit[] }
const sites: Site[] = []

const insertedOf = (u: LawDiffUnit): string =>
  u.change === 'inserted' ? (u.toText ?? '') : (u.segments ?? []).filter((s) => s.type === 'inserted').map((s) => s.text).join(' … ')

/** The draft's instructions that name this § (`draftUnits`), for reading by eye. */
function draftTextFor(blocks: readonly TextBlock[] | null, id: string, fromId: string | null): string {
  if (!blocks) return ''
  const keys = new Set([id, fromId].filter((x): x is string => !!x).map((x) => designationKey(x.replace(/^§\s*/, '§ '))))
  return draftUnits(blocks)
    .filter((u) => u.paras.some((p) => keys.has(designationKey(p))))
    .map((u) => `[${u.law ?? '-'} ${u.id}] ${u.text}`)
    .join('\n')
    .slice(0, 3000)
}

/** The draft units carrying most of `words`, with what they address. */
function foundIn(blocks: readonly TextBlock[], words: readonly string[]): string {
  return draftUnits(blocks)
    .map((u) => {
      const bag = draftWordBag(u.text)
      return { u, n: words.filter((w) => bag.has(w)).length }
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .map(({ u, n }) => `[${u.law ?? '-'} ${u.id} → ${u.paras.join(', ') || u.reason} | ${n}/${words.length}] ${u.text.slice(0, 400)}`)
    .join('\n')
}

for (const item of items) {
  const number = item.id.slice(item.id.indexOf('-') + 1)
  const path = `/api/laender/${item.land}/${encodeURIComponent(number)}`
  const file = `${EU}/server/${sha1(path)}.json`
  const rec: DraftRecord = { land: item.land, id: item.id, layout: null, state: '', shown: 0, checked: 0, blocks: null, instructions: 0, addressed: 0, draftLaws: [], tguLaws: [], productWithheld: [], guardMs: null }
  drafts.push(rec)
  if (!existsSync(file)) {
    rec.state = 'kein Detail im Cache'
    continue
  }
  const detail = JSON.parse(readFileSync(file, 'utf8')) as LandDraftDetail
  const doc = item.land === 'w' ? (tguDocument(detail) ?? detail.draft.documents.at(-1)) : tguDocument(detail)
  if (!doc) {
    rec.state = 'keine Textgegenüberstellung'
    continue
  }
  try {
    const layout: Layout = item.land === 'sbg' ? 'zwei Spalten' : item.land === 't' ? 'Tirol' : item.land === 'w' ? 'Wien' : sideBySide(await tguPages((await bytesOf(doc.url)).slice())) ? 'OÖ Spalten' : 'OÖ Striche'
    rec.layout = layout
    const { value } = await compareTgu(item.land, detail, pagesOf, bytesOf)
    rec.productWithheld = value.withheld.filter((w) => w.reason === 'notInDraft').map((w) => `${w.law ?? '-'} ${w.fromId ? `${w.fromId} → ` : ''}${w.id}`)
    if (!value.available) {
      rec.state = `nicht verfügbar: ${value.unavailableReason?.slice(0, 80)}`
      continue
    }
    let blocks: TextBlock[] | null = null
    const t0 = performance.now()
    try {
      blocks = await tguDraftBlocks(item.land, detail, pagesOf, bytesOf)
    } catch (err) {
      rec.state = `Entwurf nicht lesbar: ${String(err).slice(0, 80)}`
    }
    rec.blocks = blocks?.length ?? null
    // `value.units` no longer holds what the product withheld: those are counted from `value.withheld` (`productWithheld`).
    const guard = guardTguUnits(value.units, blocks)
    rec.guardMs = performance.now() - t0
    rec.instructions = guard.units
    rec.draftLaws = blocks ? [...new Set(draftUnits(blocks).map((u) => u.law))] : []
    rec.tguLaws = [...new Set(value.units.map((u) => u.article))]
    rec.addressed = guard.addressed
    rec.shown = value.units.filter((u) => u.change !== 'unchanged').length
    rec.state ||= guard.read ? 'gelesen' : 'Entwurf ohne Gesetzestext'
    for (const [i, check] of guard.checks) {
      const u = value.units[i]!
      rec.checked++
      const record: UnitRecord = {
        land: item.land,
        draft: item.id,
        layout,
        law: u.article,
        id: u.id,
        fromId: u.fromId,
        change: u.change,
        newWords: check.newWords,
        missingWords: check.missingWords,
        share: check.newWords ? (check.newWords - check.missingWords) / check.newWords : null,
        judged: guard.read && check.newWords >= MIN_NEW_WORDS,
        wholeDraft: guard.wholeDraft.has(i),
        notInDraft: check.notInDraft,
        undiffed: check.undiffed,
        missing: check.missing,
        wholeMissing: blocks ? check.missing.filter((w) => !draftBags(blocks!).whole.has(w) && !draftBags(blocks!).whole.has(w.replace(/-/g, ''))) : check.missing,
        foundIn: check.notInDraft && blocks ? foundIn(blocks, check.missing) : '',
        inserted: insertedOf(u).slice(0, 2500),
        toText: (u.toText ?? '').slice(0, 2500),
        fromText: (u.fromText ?? '').slice(0, 1500),
        draftFor: draftTextFor(blocks, u.id, u.fromId),
      }
      units.push(record)
      if (record.judged && !record.notInDraft && blocks) sites.push({ record, unit: u, blocks, all: value.units })
    }
  } catch (err) {
    rec.state = `Fehler: ${String(err).slice(0, 120)}`
  }
  process.stderr.write(`\r${drafts.length}/${items.length} ${item.id}            `)
}
process.stderr.write('\n')

// --- Fault injection -----------------------------------------------------
const SENTENCE_SPLIT = /(?<![\s(](?:Abs|Nr|Z|Art|lit|sublit|LGBl|BGBl|bzw|usw|vgl|idF|iVm|Dr|Mag|Ing|ca|Jg|Anm|gem|zB|bspw|inkl|Kap|Pkt|Rz|ABl|EG|EU|EWR|GmbH|Co|AG|St|Ziff|S|sog|Oö|Stmk|NÖ)\.)(?<=[.;:!?])\s+(?=[A-ZÄÖÜ(„"])/
const toks = (t: string) => comparableTokens(normalizeText(t))
const sentenceOf = (text: string | null, minTokens = 8): string | null => (text ?? '').split(SENTENCE_SPLIT).find((s) => toks(s).length >= minTokens) ?? null

type Fault = 'R-neu' | 'R-fremd' | 'Zahl' | 'Wort' | 'Satz weg'
interface FaultRecord { fault: Fault; land: LandCode; layout: Layout; draft: string; id: string; caught: boolean; applied: boolean; newWords: number; missingWords: number; donor: string }
const faults: FaultRecord[] = []

/** The unit with `extra` shown as new at its end, as the word diff would show an appended sentence. */
function appended(u: LawDiffUnit, extra: string): LawDiffUnit {
  const toText = `${u.toText ?? ''} ${extra}`
  if (u.change === 'inserted') return { ...u, toText }
  return { ...u, toText, segments: [...(u.segments ?? []), { type: 'inserted', text: ` ${extra}` }] }
}
/** The unit with its inserted text rewritten by `edit` (both in `toText` and in the segments). */
function rewritten(u: LawDiffUnit, edit: (s: string) => string | null): LawDiffUnit | null {
  if (u.change === 'inserted') {
    const t = edit(u.toText ?? '')
    return t === null ? null : { ...u, toText: t }
  }
  let done = false
  const segments = (u.segments ?? []).map((s) => {
    if (done || s.type !== 'inserted') return s
    const t = edit(s.text)
    if (t === null) return s
    done = true
    return { ...s, text: t }
  })
  return done ? { ...u, segments, toText: segments.filter((s) => s.type !== 'removed').map((s) => s.text).join('') } : null
}

for (const [n, site] of sites.entries()) {
  const { record, unit, blocks, all } = site
  const ask = (u: LawDiffUnit) => guardTguUnits(all.map((x) => (x === unit ? u : x)), blocks).checks.get(all.indexOf(unit))!
  const push = (fault: Fault, u: LawDiffUnit | null, donor: string) => {
    if (!u) {
      faults.push({ fault, land: record.land, layout: record.layout, draft: record.draft, id: record.id, caught: false, applied: false, newWords: 0, missingWords: 0, donor })
      return
    }
    const c = ask(u)
    faults.push({ fault, land: record.land, layout: record.layout, draft: record.draft, id: record.id, caught: c.notInDraft, applied: true, newWords: c.newWords, missingWords: c.missingWords, donor: donor.slice(0, 300) })
  }
  // R-neu: another § of the same draft, its new text.
  const own = all.filter((x) => x !== unit && x.change !== 'unchanged' && x.change !== 'removed').map((x) => sentenceOf(x.toText)).find((s) => s !== null) ?? null
  push('R-neu', own ? appended(unit, own) : null, own ?? '')
  // R-fremd: a § of another draft, the next site's.
  const other = sites.slice(n + 1).concat(sites.slice(0, n)).find((s) => s.record.draft !== record.draft)
  const foreign = other ? sentenceOf(other.unit.toText) : null
  push('R-fremd', foreign ? appended(unit, foreign) : null, foreign ?? '')
  // Zahl: the first number of the inserted text, plus seven.
  push('Zahl', rewritten(unit, (s) => (/\d+/.test(s) ? s.replace(/\d+/, (d) => String(Number(d) + 7)) : null)), '')
  // Wort: the longest word of the inserted text swapped for one the draft does not use.
  push('Wort', rewritten(unit, (s) => {
    const longest = s.split(/\s+/).filter((w) => /^\p{L}{6,}$/u.test(w)).sort((a, b) => b.length - a.length)[0]
    return longest ? s.replace(longest, 'Bewilligungsvoraussetzung') : null
  }), '')
  // Satz weg: the inserted text's last sentence gone (the rule reads only what is shown as new: outside its reach).
  push('Satz weg', rewritten(unit, (s) => {
    const parts = s.split(SENTENCE_SPLIT)
    return parts.length > 1 ? parts.slice(0, -1).join(' ') : null
  }), '')
}

// --- Output --------------------------------------------------------------
writeFileSync(join(outDir, 'units.jsonl'), units.map((u) => JSON.stringify(u)).join('\n') + '\n')
writeFileSync(join(outDir, 'faults.jsonl'), faults.map((f) => JSON.stringify(f)).join('\n') + '\n')
writeFileSync(join(outDir, 'drafts.jsonl'), drafts.map((d) => JSON.stringify(d)).join('\n') + '\n')

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)} %` : '–')
const lines: string[] = []
lines.push(`# Land-Guard: rechte Spalte gegen den Entwurf — ${new Date().toISOString().slice(0, 16)}`)
lines.push('')
lines.push(`Population: ${items.length} Entwürfe (GP XXVIII, ${LANDS.join(', ')}); PDFs geholt: ${fetched.length}, fehlend: ${missing.length}`)
lines.push('')
lines.push('## Entwürfe')
lines.push('')
const states = new Map<string, number>()
for (const d of drafts) states.set(`${d.land} ${d.layout ?? '-'} — ${d.state.replace(/:.*$/, '')}`, (states.get(`${d.land} ${d.layout ?? '-'} — ${d.state.replace(/:.*$/, '')}`) ?? 0) + 1)
for (const [k, v] of [...states].sort()) lines.push(`- ${k}: ${v}`)
lines.push('')
lines.push('## Je Land und Layout (gezeigte §§, geändert oder neu)')
lines.push('')
lines.push('| Land | Layout | Entwürfe | §§ | davon gegen ganzen Entwurf | beurteilbar (≥ 10 neue Wörter) | stimmt | weicht ab | Anteil ab | Median-Anteil im Entwurf |')
lines.push('|---|---|---|---|---|---|---|---|---|---|')
const groups = new Map<string, UnitRecord[]>()
for (const u of units) groups.set(`${u.land}|${u.layout}`, [...(groups.get(`${u.land}|${u.layout}`) ?? []), u])
for (const [key, list] of [...groups].sort()) {
  const [land, layout] = key.split('|')
  const judged = list.filter((u) => u.judged)
  const off = judged.filter((u) => u.notInDraft)
  const shares = judged.map((u) => u.share!).sort((a, b) => a - b)
  const median = shares.length ? shares[Math.floor(shares.length / 2)]! : null
  lines.push(`| ${land} | ${layout} | ${new Set(list.map((u) => u.draft)).size} | ${list.length} | ${list.filter((u) => u.wholeDraft).length} | ${judged.length} | ${judged.length - off.length} | ${off.length} | ${pct(off.length, judged.length)} | ${median === null ? '–' : (100 * median).toFixed(0) + ' %'} |`)
}
const judgedAll = units.filter((u) => u.judged)
lines.push(`| **alle** | | ${new Set(units.map((u) => u.draft)).size} | ${units.length} | ${units.filter((u) => u.wholeDraft).length} | ${judgedAll.length} | ${judgedAll.filter((u) => !u.notInDraft).length} | ${judgedAll.filter((u) => u.notInDraft).length} | ${pct(judgedAll.filter((u) => u.notInDraft).length, judgedAll.length)} | |`)
lines.push('')
lines.push('Per Entwurf: Anteil der beurteilbaren §§, die abweichen')
const perDraft = new Map<string, UnitRecord[]>()
for (const u of judgedAll) perDraft.set(u.draft, [...(perDraft.get(u.draft) ?? []), u])
const draftShares = [...perDraft.values()].map((l) => l.filter((u) => u.notInDraft).length / l.length).sort((a, b) => a - b)
lines.push(`- Entwürfe mit beurteilbaren §§: ${draftShares.length}; mit ≥ 1 Abweichung: ${draftShares.filter((s) => s > 0).length}; Median-Anteil: ${draftShares.length ? (100 * draftShares[Math.floor(draftShares.length / 2)]!).toFixed(0) : '–'} %`)
lines.push('')
lines.push('## Produktpfad (compareTgu, seit 12.11.2026)')
lines.push('')
const productWithheld = drafts.flatMap((d) => d.productWithheld.map((w) => `${d.id} ${w}`))
lines.push(`- Von compareTgu als „nicht im Entwurf“ zurückgehalten: ${productWithheld.length}${productWithheld.length ? ` — ${productWithheld.join('; ')}` : ''}`)
const costs = drafts.flatMap((d) => (d.guardMs === null ? [] : [d.guardMs])).sort((a, b) => a - b)
if (costs.length) lines.push(`- Kosten des Wächters je Vergleich (Seiten des Entwurfs schon gelesen): Median ${costs[Math.floor(costs.length / 2)]!.toFixed(1)} ms, Maximum ${costs.at(-1)!.toFixed(1)} ms, über ${costs.length} Vergleiche`)
lines.push('')
lines.push('## Fehlerinjektion (an §§, die die Regel bestehen lässt)')
lines.push('')
lines.push('| Fehler | Land | angewandt | gefangen | Quote |')
lines.push('|---|---|---|---|---|')
for (const fault of ['R-neu', 'R-fremd', 'Zahl', 'Wort', 'Satz weg'] as Fault[]) {
  for (const land of [...LANDS, 'alle'] as const) {
    const f = faults.filter((x) => x.fault === fault && x.applied && (land === 'alle' || x.land === land))
    if (!f.length) continue
    lines.push(`| ${fault} | ${land} | ${f.length} | ${f.filter((x) => x.caught).length} | ${pct(f.filter((x) => x.caught).length, f.length)} |`)
  }
}
lines.push('')
lines.push('## Abweichende §§ (die das Produkt zurückhalten würde)')
lines.push('')
for (const u of units.filter((x) => x.notInDraft)) {
  lines.push(`### ${u.draft} ${u.law ?? ''} ${u.id} (${u.layout}, ${u.change}) — ${u.missingWords} von ${u.newWords} neuen Wörtern fehlen im Entwurf`)
  lines.push('')
  lines.push(`Fehlend: ${u.missing.join(', ')}`)
  lines.push('')
  lines.push(`Neu gezeigt: ${u.inserted.slice(0, 900)}`)
  lines.push('')
  lines.push(`Entwurf zu diesem §: ${u.draftFor ? u.draftFor.slice(0, 900) : '(keine Anordnung nennt ihn)'}`)
  lines.push('')
}
writeFileSync(join(outDir, 'summary.md'), lines.join('\n'))
console.log(lines.slice(0, lines.indexOf('## Abweichende §§ (die das Produkt zurückhalten würde)')).join('\n'))
if (missing.length) console.log(`\nFehlende PDFs:\n${missing.join('\n')}`)
