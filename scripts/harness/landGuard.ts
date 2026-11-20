#!/usr/bin/env vite-node
/**
 * The right column of a Land's Textgegenüberstellung against the Land's own
 * draft — what the Bund's rule „nicht im Entwurf" (`annex/rightColumn.ts`)
 * would say of every § a Land's comparison shows (12.11.2026).
 *
 *   pnpm harness:land-guard -- --out <dir> [--land ooe|sbg|t|w|ktn] [--show ooe-2025-16106] [--cached-only] [--mindestens=<pct>]
 *     [--baseline=<file> | --baseline-schreiben=<file>]
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
 * SINCE 20.11.2026 TWO RULES ARE MEASURED: the bag rule („nicht im Entwurf")
 * and the strict one (`landTguStrict.ts`, word for word against the draft's
 * wording for the §). The summary says for how many §§ the strict check
 * holds, differs or could not be run and why; `units.jsonl` carries both
 * verdicts with the words either side lacks. The §§ are asked as the product
 * asks them — before its own withholding (`compareTgu`'s `beforeDraftCheck`)
 * — and `corpus.jsonl` keeps them with each draft's blocks, so a rule can be
 * probed offline without reading a PDF again.
 *
 * Fault injection (`--faults`, on by default): every § the product shows
 * (until 20.11.2026: every § the bag rule passes with enough new words to be
 * judged — the table still counts those apart, old rule against product)
 * gets, one at a time, a sentence of ANOTHER §
 * of the same draft appended to its new text (R-neu, the Bund's fault), a
 * sentence of ANOTHER Land's draft appended (R-fremd), a number changed, a
 * word swapped, and a sentence dropped — and the rules are asked again. The
 * last three are below the bag rule's floors or outside its reach by design
 * (0 caught of each, 19.11.2026); the strict rule exists for them. What it
 * costs is the count of §§ it withholds with no fault injected („weicht
 * ab"): read those, they are sound §§ of ours or real findings.
 *
 * And faults for the LEFT column's check (19.11.2026, „Beide gekürzt"):
 * every § shown whose text in force leaves nothing out and stands in RIS is
 * cut in BOTH columns — near its middle (the reader failure that showed
 * Salzburg 34574's § 3 and Oberösterreich 2025-16103's § 25 „unverändert"),
 * and at its end, its start and inside it (`CUTS`) — and the product's RIS
 * rule is asked again: `standsInRis` alone (the rule until then) and with
 * `cutShort`. The control asks `cutShort` of the uncut texts, as if each
 * were printed unchanged: what the rule costs on sound §§.
 *
 * `--mindestens=<pct>` (20.11.2026): exit 1 when a fault class — the five
 * of the right column and the cuts of the left — tried at least
 * `MIN_TRIES` times is caught below `pct`; a class tried fewer times is
 * printed and recorded as „nicht gehalten", never passed in silence
 * (`lib/landGuardReport.ts`).
 *
 * `--baseline=<file>` (20.11.2026): every § the comparison withholds, by
 * document, law and § with its cause, and per document whether it was
 * answered and how many §§ it shows, compared for equality with the file —
 * the run fails on every entry that came or went (`landBaselineFindings`).
 * `--baseline-schreiben=<file>` draws it anew from a whole run; the committed
 * one is `landGuardBaseline.json`, drawn from the cached corpus.
 *
 * Runs with `-c vitest.config.ts`: `texts/read.ts` imports `#shared`.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LaenderResponse, LandCode, LandDraftDetail, LawDiffUnit } from '../../shared/types'
import { installFetchCache } from '../lib/harnessCache'
import { argAssigned, argFlag, argPair } from '../lib/args'
import { MIN_TRIES, baselineDocument, floorFailed, floorRows, landBaselineFindings, toLandBaseline, type FaultTally, type LandBaseline, type LandBaselineDocument } from '../lib/landGuardReport'
import { landPdfBytes, pagesOfBytes } from '../../server/utils/laender/texts/read'
import { compareTgu, sideBySide, tguDocument, tguDraftBlocks } from '../../server/utils/laender/landTguService'
import { tguPages } from '../../server/utils/laender/landTguPdf'
import { guardTguUnits, undrafted } from '../../server/utils/laender/landTguGuard'
import { lawInForce, paragraphText } from '../../server/utils/laender/landKons'
import { comparableWords, cutShort, standsInRis } from '../../server/utils/laender/landTgu'
import { draftUnits } from '../../server/utils/annex/annexDraft'
import { designationKey, comparableTokens } from '../../server/utils/annex/annexText'
import { normalizeText } from '../../server/utils/lawtext/normalize'
import { MIN_NEW_WORDS, draftBags, draftWordBag } from '../../server/utils/annex/rightColumn'
import type { TextBlock } from '../../server/utils/lawtext/lawUnits'

const LANDS: LandCode[] = ['ooe', 'sbg', 't', 'w']
/* Kärnten's answers are dumped too (`tgu.jsonl`): the RIS check is the same
   for every Land, the guard is not asked of Kärnten (`withoutUndrafted`). */
const TGU_LANDS: LandCode[] = [...LANDS, 'ktn']
const outDir = argPair('out')
const onlyLand = argPair('land') as LandCode | undefined
const show = argPair('show')
const cachedOnly = argFlag('cached-only')
const floorArg = argAssigned('mindestens')
const floor = floorArg === null ? null : Number(floorArg)
const baselinePath = argAssigned('baseline')
const baselineWrite = argAssigned('baseline-schreiben')
// A baseline is drawn from the whole population only: one drawn from `--land` or `--show` would report every other document as unknown.
if (!outDir || (floor !== null && !(floor >= 0 && floor <= 100)) || (baselinePath && baselineWrite) || (baselineWrite && (onlyLand || show))) {
  console.error('Usage: pnpm harness:land-guard -- --out <dir> [--land ooe|sbg|t|w|ktn] [--show <id>] [--cached-only] [--mindestens=<pct>] [--baseline=<file> | --baseline-schreiben=<file> (ohne --land, --show)]')
  process.exit(1)
}
// Read before the run: a baseline that cannot be read is a failed run, not one with no finding.
let baseline: LandBaseline | null = null
if (baselinePath) {
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as LandBaseline
  } catch (err) {
    console.error(`FEHLER: Grundlinie ${baselinePath} ließ sich nicht lesen — ${String(err).slice(0, 160)}`)
    process.exit(2)
  }
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
  .filter((i) => TGU_LANDS.includes(i.land) && (!onlyLand || i.land === onlyLand) && (!show || i.id === show))
  .sort((a, b) => a.id.localeCompare(b.id))

type Layout = 'zwei Spalten' | 'OÖ Spalten' | 'OÖ Striche' | 'Tirol' | 'Wien' | 'Kärnten'
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
  /** The strict check (`landTguStrict.ts`): held word for word, differing, or not held this way — with why, and the words either side lacks. */
  strict: 'holds' | 'differs' | 'unchecked'
  strictReason: string | null
  strictNotInDraft: string[]
  strictNotShown: string[]
  /** Whether the product shows the §: neither rule withholds it. */
  shown: boolean
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
  /** The draft's law key the rules read the § under; null where the draft has no Artikel or the law could not be named (`wholeDraft`). */
  draftLaw: string | null
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
  /** …and as differing from the draft's wording word for word (`draftDiffers`, 20.11.2026). */
  productDiffers: string[]
  /** The guard's cost on this comparison, the draft's pages already read: `tguDraftBlocks` + `guardTguUnits`, in ms. */
  guardMs: number | null
}
const units: UnitRecord[] = []
const drafts: DraftRecord[] = []
/**
 * Every answer of `compareTgu` whole — the §§ shown, unchanged ones too, and
 * the §§ withheld with their reasons (`tgu.jsonl`), so that a change to the
 * RIS check or the readers can be read old against new, § by §. The guard's
 * tables above hold only the §§ shown as changed or new.
 */
interface TguAnswer {
  land: LandCode
  draft: string
  available: boolean
  reason: string | null
  /** The date the left column was held against RIS at, as the answer names it (`toDocument`). */
  date: string | null
  units: { law: string | null; id: string; fromId: string | null; change: string; editorial: boolean; fromText: string | null; toText: string | null }[]
  withheld: { law: string | null; id: string; fromId?: string; reason?: string }[]
}
const answers: TguAnswer[] = []
/** Each document of the population as the baseline holds it (`--baseline`). */
const baselineDocs: Record<string, LandBaselineDocument> = {}
/** The §§ the rule passes, with what is needed to inject into them. */
interface Site { record: UnitRecord; unit: LawDiffUnit; blocks: TextBlock[]; all: LawDiffUnit[] }
const sites: Site[] = []
/** Every comparison's §§ and its draft's blocks (`corpus.jsonl`): what a rule can be probed against offline, without reading a PDF again. */
const corpus: { land: LandCode; draft: string; layout: Layout; blocks: TextBlock[] | null; units: LawDiffUnit[] }[] = []

const insertedOf = (u: LawDiffUnit): string =>
  u.change === 'inserted' ? (u.toText ?? '') : (u.segments ?? []).filter((s) => s.type === 'inserted').map((s) => s.text).join(' … ')

/**
 * The draft's instructions that name this § (`draftUnits`), for reading by
 * eye — of the law the rules read the § under (`TguGuard.lawKeys`), and of
 * every law only where that could not be named. Until 20.11.2026 this
 * listed every law's: under „Oö. Gleichbehandlungsgesetz 2021 § 7" stood
 * the Agrarrecht-Organisationsgesetz's instructions for its own § 7, which
 * the rules never read.
 */
function draftTextFor(blocks: readonly TextBlock[] | null, id: string, fromId: string | null, lawKey: string | null | undefined): string {
  if (!blocks) return ''
  const keys = new Set([id, fromId].filter((x): x is string => !!x).map((x) => designationKey(x.replace(/^§\s*/, '§ '))))
  return draftUnits(blocks)
    .filter((u) => (lawKey === undefined || u.law === lawKey) && u.paras.some((p) => keys.has(designationKey(p))))
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
  const rec: DraftRecord = { land: item.land, id: item.id, layout: null, state: '', shown: 0, checked: 0, blocks: null, instructions: 0, addressed: 0, draftLaws: [], tguLaws: [], productWithheld: [], productDiffers: [], guardMs: null }
  drafts.push(rec)
  if (!existsSync(file)) {
    rec.state = 'kein Detail im Cache'
    baselineDocs[item.id] = baselineDocument(item.land, rec.state, null)
    continue
  }
  const detail = JSON.parse(readFileSync(file, 'utf8')) as LandDraftDetail
  const doc = item.land === 'w' ? (tguDocument(detail) ?? detail.draft.documents.at(-1)) : tguDocument(detail)
  if (!doc) {
    rec.state = 'keine Textgegenüberstellung'
    baselineDocs[item.id] = baselineDocument(item.land, rec.state, null)
    continue
  }
  try {
    const layout: Layout = item.land === 'sbg' ? 'zwei Spalten' : item.land === 't' ? 'Tirol' : item.land === 'w' ? 'Wien' : item.land === 'ktn' ? 'Kärnten' : sideBySide(await tguPages((await bytesOf(doc.url)).slice())) ? 'OÖ Spalten' : 'OÖ Striche'
    rec.layout = layout
    // The §§ as the comparison holds them before its draft check: what the two rules are asked of here, as `withoutUndrafted` asks them.
    let compared: LawDiffUnit[] = []
    const { value } = await compareTgu(item.land, detail, pagesOf, bytesOf, (all) => { compared = [...all] })
    const date = /Fassung vom (\d{2})\.(\d{2})\.(\d{4})/.exec(value.toDocument?.label ?? '')
    answers.push({
      land: item.land,
      draft: item.id,
      available: value.available,
      reason: value.unavailableReason,
      date: date ? `${date[3]}-${date[2]}-${date[1]}` : null,
      units: value.units.map((u) => ({ law: u.article, id: u.id, fromId: u.fromId, change: u.change, editorial: !!u.editorial, fromText: u.fromText, toText: u.toText })),
      withheld: value.withheld,
    })
    baselineDocs[item.id] = baselineDocument(item.land, 'beantwortet', value)
    // Kärnten: the answer only — its right column is the Novelle's instructions, which the guard does not judge.
    if (item.land === 'ktn') {
      rec.state = value.available ? 'nur Antwort (Kärnten)' : `nicht verfügbar: ${value.unavailableReason?.slice(0, 80)}`
      continue
    }
    rec.productWithheld = value.withheld.filter((w) => w.reason === 'notInDraft').map((w) => `${w.law ?? '-'} ${w.fromId ? `${w.fromId} → ` : ''}${w.id}`)
    rec.productDiffers = value.withheld.filter((w) => w.reason === 'draftDiffers').map((w) => `${w.law ?? '-'} ${w.fromId ? `${w.fromId} → ` : ''}${w.id}`)
    if (!value.available && !compared.length) {
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
    // `value.units` no longer holds what the product withheld; the rules are asked of the §§ before that (`compared`), as the product asks them.
    const guard = guardTguUnits(compared, blocks)
    const off = undrafted(guard)
    rec.guardMs = performance.now() - t0
    rec.instructions = guard.units
    corpus.push({ land: item.land, draft: item.id, layout, blocks, units: compared })
    rec.draftLaws = blocks ? [...new Set(draftUnits(blocks).map((u) => u.law))] : []
    rec.tguLaws = [...new Set(compared.map((u) => u.article))]
    rec.addressed = guard.addressed
    rec.shown = compared.filter((u, i) => u.change !== 'unchanged' && !off.has(i)).length
    rec.state ||= guard.read ? 'gelesen' : 'Entwurf ohne Gesetzestext'
    for (const [i, check] of guard.checks) {
      const u = compared[i]!
      const strict = guard.strict.get(i)
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
        strict: strict?.state ?? 'unchecked',
        strictReason: strict?.reason ?? (guard.read ? null : 'der Entwurf wurde nicht gelesen'),
        strictNotInDraft: strict?.notInDraft ?? [],
        strictNotShown: strict?.notShown ?? [],
        shown: !off.has(i),
        undiffed: check.undiffed,
        missing: check.missing,
        wholeMissing: blocks ? check.missing.filter((w) => !draftBags(blocks!).whole.has(w) && !draftBags(blocks!).whole.has(w.replace(/-/g, ''))) : check.missing,
        foundIn: check.notInDraft && blocks ? foundIn(blocks, check.missing) : '',
        inserted: insertedOf(u).slice(0, 2500),
        toText: (u.toText ?? '').slice(0, 2500),
        fromText: (u.fromText ?? '').slice(0, 1500),
        draftFor: draftTextFor(blocks, u.id, u.fromId, guard.lawKeys.get(u.article)),
        draftLaw: guard.lawKeys.has(u.article) ? (guard.lawKeys.get(u.article) ?? null) : null,
      }
      units.push(record)
      // Every § the product shows, with a draft read: the bag rule's faults are counted over those it can judge (`judged`), the strict rule's over all.
      if (record.shown && blocks) sites.push({ record, unit: u, blocks, all: compared })
    }
  } catch (err) {
    rec.state = `Fehler: ${String(err).slice(0, 120)}`
    // Only where `compareTgu` gave no answer: a later step failing does not unmake it.
    baselineDocs[item.id] ??= baselineDocument(item.land, 'Fehler', null)
  }
  process.stderr.write(`\r${drafts.length}/${items.length} ${item.id}            `)
}
process.stderr.write('\n')

// --- Fault injection -----------------------------------------------------
const SENTENCE_SPLIT = /(?<![\s(](?:Abs|Nr|Z|Art|lit|sublit|LGBl|BGBl|bzw|usw|vgl|idF|iVm|Dr|Mag|Ing|ca|Jg|Anm|gem|zB|bspw|inkl|Kap|Pkt|Rz|ABl|EG|EU|EWR|GmbH|Co|AG|St|Ziff|S|sog|Oö|Stmk|NÖ)\.)(?<=[.;:!?])\s+(?=[A-ZÄÖÜ(„"])/
const toks = (t: string) => comparableTokens(normalizeText(t))
const sentenceOf = (text: string | null, minTokens = 8): string | null => (text ?? '').split(SENTENCE_SPLIT).find((s) => toks(s).length >= minTokens) ?? null

type Fault = 'R-neu' | 'R-fremd' | 'Zahl' | 'Wort' | 'Satz weg'
/** `caught`: the product withholds the § with the fault in it. `bag`: the rule „nicht im Entwurf“ alone does — the product until 20.11.2026. `judged`/`strict`: what the two rules made of the § without the fault. */
interface FaultRecord { fault: Fault; land: LandCode; layout: Layout; draft: string; id: string; caught: boolean; bag: boolean; judged: boolean; strict: UnitRecord['strict']; applied: boolean; newWords: number; missingWords: number; donor: string; lacks: string }
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
  const at = all.indexOf(unit)
  const ask = (u: LawDiffUnit) => guardTguUnits(all.map((x) => (x === unit ? u : x)), blocks, at)
  const base = { land: record.land, layout: record.layout, draft: record.draft, id: record.id, judged: record.judged, strict: record.strict }
  const push = (fault: Fault, u: LawDiffUnit | null, donor: string) => {
    if (!u) {
      faults.push({ fault, ...base, caught: false, bag: false, applied: false, newWords: 0, missingWords: 0, donor, lacks: '' })
      return
    }
    const guard = ask(u)
    const c = guard.checks.get(at)!
    const st = guard.strict.get(at)
    faults.push({ fault, ...base, caught: undrafted(guard).has(at), bag: c.notInDraft, applied: true, newWords: c.newWords, missingWords: c.missingWords, donor: donor.slice(0, 300), lacks: `${st?.state ?? ''} ${st?.reason ?? ''} | neu, nicht im Entwurf: ${(st?.notInDraft ?? []).slice(0, 12).join(' ')} | im Entwurf, nicht gezeigt: ${(st?.notShown ?? []).slice(0, 12).join(' ')}` })
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

// --- Fault: both columns cut (the left column's check) --------------------
/**
 * Where a reader cuts a § short in both columns (19.11.2026): near its
 * middle (`Mitte`, the first class, 34574 § 3 and 16103 § 25), and the
 * likelier failures the review named — the last sentence, the last Absatz,
 * the last line or only its last word (a short last line), the first line,
 * a line or a single word inside, and a number standing alone (a table
 * value, the draft reader's failure of fcf3eae). A line is six words, as in
 * a two-column Textgegenüberstellung.
 */
type Cut = 'Mitte' | 'letzter Satz' | 'letzter Absatz' | 'letzte Zeile' | 'letztes Wort' | 'erste Zeile' | 'Zeile innen' | 'Wort innen' | 'Zahl innen'
const CUTS: Cut[] = ['Mitte', 'letzter Satz', 'letzter Absatz', 'letzte Zeile', 'letztes Wort', 'erste Zeile', 'Zeile innen', 'Wort innen', 'Zahl innen']
const LINE = 6
const middleCut = (text: string, words: number): string => {
  let cut = ''
  for (const sentence of text.split(SENTENCE_SPLIT)) {
    if (cut && comparableWords(`${cut} ${sentence}`).length > words / 2) break
    cut = cut ? `${cut} ${sentence}` : sentence
  }
  if (comparableWords(cut).length >= words * 0.8) cut = text.split(/\s+/).slice(0, Math.ceil(text.split(/\s+/).length / 2)).join(' ')
  return cut
}
/** `text` without `n` whitespace tokens from `at` on. */
const without = (tokens: string[], at: number, n: number) => [...tokens.slice(0, at), ...tokens.slice(at + n)].join(' ')
function cutOf(kind: Cut, text: string, words: number): string | null {
  const tokens = text.split(/\s+/)
  const middle = Math.floor(tokens.length / 2)
  /** The index of the token nearest the middle that `ok` accepts, or -1. */
  const nearMiddle = (ok: (t: string) => boolean) => tokens.map((t, i) => [t, i] as const).filter(([t, i]) => i > 0 && i < tokens.length - 1 && ok(t)).sort((a, b) => Math.abs(a[1] - middle) - Math.abs(b[1] - middle))[0]?.[1] ?? -1
  switch (kind) {
    case 'Mitte': return middleCut(text, words)
    case 'letzter Satz': {
      const parts = text.split(SENTENCE_SPLIT)
      return parts.length > 1 ? parts.slice(0, -1).join(' ') : null
    }
    case 'letzter Absatz': {
      const parts = text.split(/\s(?=\(\d+[a-z]?\)\s)/)
      return parts.length > 2 ? parts.slice(0, -1).join(' ') : null
    }
    case 'letzte Zeile': return tokens.length >= 3 * LINE ? tokens.slice(0, -LINE).join(' ') : null
    case 'letztes Wort': return tokens.slice(0, -1).join(' ')
    case 'erste Zeile': return tokens.length >= 3 * LINE ? tokens.slice(LINE).join(' ') : null
    case 'Zeile innen': return tokens.length >= 3 * LINE ? without(tokens, middle - LINE / 2, LINE) : null
    case 'Wort innen': {
      const at = nearMiddle((t) => /\p{L}{3,}/u.test(t))
      return at < 0 ? null : without(tokens, at, 1)
    }
    case 'Zahl innen': {
      const at = nearMiddle((t) => /^\d[\d.,]*[,;.]?$/.test(t))
      return at < 0 ? null : without(tokens, at, 1)
    }
  }
}
/** What a cut took, with a few words around it: the first and last place where the texts part. */
function lostOf(text: string, cut: string): string {
  const a = text.split(/\s+/)
  const b = cut.split(/\s+/)
  let i = 0
  while (i < b.length && a[i] === b[i]) i++
  let j = 0
  while (j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++
  const lost = a.slice(i, a.length - j).join(' ')
  return `${a.slice(Math.max(0, i - 3), i).join(' ')} [${lost.length > 120 ? `${lost.slice(0, 60)} … ${lost.slice(-50)}` : lost}] ${a.slice(a.length - j, a.length - j + 3).join(' ')}`.trim()
}
interface CutRecord { cut: Cut; land: LandCode; draft: string; law: string | null; id: string; words: number; kept: number; standsAlone: boolean; refused: boolean; lost: string }
/** The control: `cutShort` asked of the uncut text, as if it were printed unchanged — what the rule costs on sound §§. */
interface ControlRecord { land: LandCode; draft: string; law: string | null; id: string; change: string; refused: boolean }
const cuts: CutRecord[] = []
const controls: ControlRecord[] = []
const ELIDES = /…|\.\.\./
for (const answer of answers) {
  if (!answer.available || !answer.date) continue
  const laws = new Map<string, Map<string, string> | null>()
  for (const u of answer.units) {
    if (!u.fromText || ELIDES.test(u.fromText) || !/^§/.test(u.id) || !u.law) continue
    const words = comparableWords(u.fromText).length
    if (words < 12) continue
    if (!laws.has(u.law)) laws.set(u.law, await lawInForce(answer.land, u.law, answer.date).catch(() => null))
    const url = laws.get(u.law)?.get((u.fromId ?? u.id).replace(/^§/, ''))
    const ris = url ? await paragraphText(url).catch(() => null) : null
    const bare = answer.land === 'sbg'
    // Only §§ whose whole text the rule passes: the fault is the cut, nothing else.
    if (!ris || !standsInRis(u.fromText, ris, bare)) continue
    const at = { land: answer.land, draft: answer.draft, law: u.law, id: u.id }
    controls.push({ ...at, change: u.change, refused: cutShort({ old: [u.fromText], neu: [u.fromText] }, ris, bare) })
    for (const kind of CUTS) {
      const cut = cutOf(kind, u.fromText, words)
      if (cut === null || cut === u.fromText) continue
      const standsAlone = standsInRis(cut, ris, bare)
      cuts.push({ cut: kind, ...at, words, kept: comparableWords(cut).length, standsAlone, refused: !standsAlone || cutShort({ old: [cut], neu: [cut] }, ris, bare), lost: lostOf(u.fromText, cut) })
    }
  }
}

// --- Output --------------------------------------------------------------
writeFileSync(join(outDir, 'units.jsonl'), units.map((u) => JSON.stringify(u)).join('\n') + '\n')
writeFileSync(join(outDir, 'faults.jsonl'), faults.map((f) => JSON.stringify(f)).join('\n') + '\n')
writeFileSync(join(outDir, 'corpus.jsonl'), corpus.map((c) => JSON.stringify(c)).join('\n') + '\n')
writeFileSync(join(outDir, 'drafts.jsonl'), drafts.map((d) => JSON.stringify(d)).join('\n') + '\n')
writeFileSync(join(outDir, 'tgu.jsonl'), answers.map((a) => JSON.stringify(a)).join('\n') + '\n')
writeFileSync(join(outDir, 'cuts.jsonl'), cuts.map((c) => JSON.stringify(c)).join('\n') + '\n')
writeFileSync(join(outDir, 'controls.jsonl'), controls.map((c) => JSON.stringify(c)).join('\n') + '\n')

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
const productDiffers = drafts.flatMap((d) => d.productDiffers.map((w) => `${d.id} ${w}`))
lines.push('## Wort für Wort gegen den Wortlaut des Entwurfs (landTguStrict.ts, seit 20.11.2026)')
lines.push('')
lines.push('| Land | §§ geändert oder neu | Wort für Wort gehalten | weicht ab (nicht gezeigt) | so nicht prüfbar (alte Regel entscheidet) | gezeigt |')
lines.push('|---|---|---|---|---|---|')
for (const land of [...LANDS, 'alle'] as const) {
  const l = units.filter((u) => land === 'alle' || u.land === land)
  if (!l.length) continue
  lines.push(`| ${land} | ${l.length} | ${l.filter((u) => u.strict === 'holds').length} | ${l.filter((u) => u.strict === 'differs').length} (${pct(l.filter((u) => u.strict === 'differs').length, l.length)}) | ${l.filter((u) => u.strict === 'unchecked').length} | ${l.filter((u) => u.shown).length} |`)
}
lines.push('')
lines.push(`- Von compareTgu als „weicht vom Wortlaut des Entwurfs ab“ zurückgehalten: ${productDiffers.length} (die Tabelle zählt ${units.filter((u) => u.strict === 'differs').length})`)
lines.push('- Nicht so prüfbar, nach Grund:')
const whyNot = new Map<string, number>()
for (const u of units.filter((x) => x.strict === 'unchecked')) whyNot.set((u.strictReason ?? '').replace(/:.*$/, ''), (whyNot.get((u.strictReason ?? '').replace(/:.*$/, '')) ?? 0) + 1)
for (const [k, v] of [...whyNot].sort((a, b) => b[1] - a[1])) lines.push(`  - ${k}: ${v}`)
lines.push('')
lines.push('## Fehlerinjektion (an §§, die das Produkt zeigt)')
lines.push('')
lines.push('„Alte Regel“: „nicht im Entwurf“ allein, an den §§, die sie beurteilen kann (≥ 10 neue Wörter) — die Messung bis 19.11.2026. „Produkt“: beide Regeln, an denselben §§ und an allen gezeigten.')
lines.push('')
lines.push('| Fehler | Land | beurteilbar: angewandt | alte Regel fängt | Produkt fängt | alle gezeigten: angewandt | Produkt fängt | davon Wort für Wort gehalten: angewandt | gefangen |')
lines.push('|---|---|---|---|---|---|---|---|---|')
const FAULTS: Fault[] = ['R-neu', 'R-fremd', 'Zahl', 'Wort', 'Satz weg']
for (const fault of FAULTS) {
  for (const land of [...LANDS, 'alle'] as const) {
    const f = faults.filter((x) => x.fault === fault && x.applied && (land === 'alle' || x.land === land))
    if (!f.length) continue
    const j = f.filter((x) => x.judged)
    const h = f.filter((x) => x.strict === 'holds')
    const n = (l: FaultRecord[], by: (x: FaultRecord) => boolean) => `${l.filter(by).length} (${pct(l.filter(by).length, l.length)})`
    lines.push(`| ${fault} | ${land} | ${j.length} | ${n(j, (x) => x.bag)} | ${n(j, (x) => x.caught)} | ${f.length} | ${n(f, (x) => x.caught)} | ${h.length} | ${n(h, (x) => x.caught)} |`)
  }
}
lines.push('')
lines.push('## Beide Spalten gekürzt (linke Spalte gegen RIS)')
lines.push('')
lines.push('| Schnitt | Land | §§ | standsInRis allein fängt | mit cutShort fängt |')
lines.push('|---|---|---|---|---|')
for (const kind of CUTS) {
  for (const land of [...TGU_LANDS, 'alle'] as const) {
    const c = cuts.filter((x) => x.cut === kind && (land === 'alle' || x.land === land))
    if (!c.length || (land !== 'alle' && c.every((x) => x.refused))) continue
    lines.push(`| ${kind} | ${land} | ${c.length} | ${c.filter((x) => !x.standsAlone).length} (${pct(c.filter((x) => !x.standsAlone).length, c.length)}) | ${c.filter((x) => x.refused).length} (${pct(c.filter((x) => x.refused).length, c.length)}) |`)
  }
}
for (const c of cuts.filter((x) => !x.refused)) lines.push(`- nicht gefangen (${c.cut}): ${c.draft} ${c.law ?? ''} ${c.id} (${c.kept} von ${c.words} Wörtern): ${c.lost}`)
lines.push('')
lines.push('Kontrolle: cutShort am ungekürzten Text, als wäre er unverändert gedruckt — gezeigt werden nur unveränderte §§, die anderen sind ein Stellvertreter dafür, wie ganz eine linke Spalte RIS trifft.')
lines.push('')
lines.push('| Änderung | §§ | abgelehnt |')
lines.push('|---|---|---|')
for (const change of [...new Set(controls.map((c) => c.change))].sort()) {
  const c = controls.filter((x) => x.change === change)
  lines.push(`| ${change} | ${c.length} | ${c.filter((x) => x.refused).length} |`)
}
for (const c of controls.filter((x) => x.refused && x.change !== 'changed')) lines.push(`- Kontrolle abgelehnt (${c.change}): ${c.draft} ${c.law ?? ''} ${c.id}`)
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
/* The floor (`--mindestens`): every class the run injects — the right
   column's faults, the left column's cuts — against it. */
const tallies: FaultTally[] = [
  ...FAULTS.map((fault) => {
    const f = faults.filter((x) => x.fault === fault && x.applied)
    return { key: fault, tried: f.length, caught: f.filter((x) => x.caught).length }
  }),
  ...CUTS.map((kind) => {
    const c = cuts.filter((x) => x.cut === kind)
    return { key: `Beide gekürzt: ${kind}`, tried: c.length, caught: c.filter((x) => x.refused).length }
  }),
]
const floorTable = floor === null ? null : floorRows(tallies, floor)
if (floorTable) {
  lines.push('')
  lines.push(`## Boden (--mindestens=${floor})`)
  lines.push('')
  lines.push(`Eine Klasse mit weniger als ${MIN_TRIES} Versuchen hält der Boden nicht: sie steht als „nicht gehalten" da, nicht als bestanden.`)
  lines.push('')
  lines.push('| Fehlerklasse | angewandt | gefangen | Anteil | Urteil |')
  lines.push('|---|---|---|---|---|')
  for (const r of floorTable) lines.push(`| ${r.key} | ${r.tried} | ${r.caught} | ${pct(r.caught, r.tried)} | ${r.verdict} |`)
}
writeFileSync(join(outDir, 'summary.md'), lines.join('\n'))
/* The figures of the tables above as a record (19.11.2026), for
   `scripts/harness/genauigkeit.ts`, which writes what `/genauigkeit` shows. */
/* The baseline: drawn anew, or compared. A document of the baseline is
   asked of where this run's filters (`--land`, `--show`) would have asked
   of it. */
if (baselineWrite) writeFileSync(baselineWrite, `${JSON.stringify(toLandBaseline(baselineDocs), null, 1)}\n`)
const baselineFindings = baseline
  ? landBaselineFindings(baseline, baselineDocs, (id, d) => TGU_LANDS.includes(d.land as LandCode) && (!onlyLand || d.land === onlyLand) && (!show || id === show))
  : null
if (baselineFindings) writeFileSync(join(outDir, 'baseline-findings.txt'), baselineFindings.map((f) => `${f}\n`).join(''))
writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify({
  at: new Date().toISOString(),
  lands: LANDS,
  documents: new Set(units.map((u) => u.draft)).size,
  // The §§ the product shows as changed or new: neither rule withholds them.
  compared: units.length,
  shown: units.filter((u) => u.shown).length,
  judged: judgedAll.length,
  found: judgedAll.filter((u) => !u.notInDraft).length,
  // Over every § the product shows (20.11.2026; until then over the §§ the bag rule could judge).
  faults: FAULTS.map((fault) => {
    const f = faults.filter((x) => x.fault === fault && x.applied)
    return { key: fault, tried: f.length, caught: f.filter((x) => x.caught).length }
  }),
  strict: {
    held: units.filter((u) => u.strict === 'holds').length,
    differs: units.filter((u) => u.strict === 'differs').length,
    unchecked: units.filter((u) => u.strict === 'unchecked').length,
    faultsWhereHeld: FAULTS.map((fault) => {
      const f = faults.filter((x) => x.fault === fault && x.applied && x.strict === 'holds')
      return { key: fault, tried: f.length, caught: f.filter((x) => x.caught).length }
    }),
    faultsWhereJudged: FAULTS.map((fault) => {
      const f = faults.filter((x) => x.fault === fault && x.applied && x.judged)
      return { key: fault, tried: f.length, bag: f.filter((x) => x.bag).length, caught: f.filter((x) => x.caught).length }
    }),
  },
  // `--mindestens`: null when the run had no floor. A class under `minTries` tries is „nicht gehalten".
  floor: floorTable === null ? null : { pct: floor, minTries: MIN_TRIES, classes: floorTable },
  // `--baseline`: null when the run compared none; the findings themselves in `baseline-findings.txt`.
  baseline: baselineFindings === null ? null : { file: baselinePath, at: baseline!.at, findings: baselineFindings.length },
}, null, 1)}\n`)
console.log(lines.slice(0, lines.indexOf('## Abweichende §§ (die das Produkt zurückhalten würde)')).join('\n'))
if (missing.length) console.log(`\nFehlende PDFs:\n${missing.join('\n')}`)
let failed = false
if (floorTable) {
  console.log(`\n## Boden (--mindestens=${floor})`)
  for (const r of floorTable) {
    if (r.verdict === 'unter dem Boden') console.log(`  ✗ unter ${floor} %: ${r.key} — ${r.caught}/${r.tried}`)
    else if (r.verdict === 'nicht gehalten') console.log(`  ? nicht gehalten (weniger als ${MIN_TRIES} Versuche): ${r.key} — ${r.caught}/${r.tried}`)
  }
  if (floorFailed(floorTable)) failed = true
  const held = floorTable.filter((r) => r.verdict === 'gehalten').length
  // Zero of zero is no all-clear: a run too small for the floor says that it held nothing.
  console.log(held
    ? `  ✓ ${held} von ${floorTable.length} Fehlerklassen mit mindestens ${MIN_TRIES} Versuchen zu mindestens ${floor} % gefangen${held < floorTable.length ? `; ${floorTable.length - held} nicht gehalten` : ''}`
    : `  ? keine Fehlerklasse mit mindestens ${MIN_TRIES} Versuchen — der Boden hat nichts gehalten`)
}
if (baselineWrite) console.log(`\nGrundlinie geschrieben: ${baselineWrite} — ${Object.keys(baselineDocs).length} Entwürfe, ${Object.values(baselineDocs).reduce((n, d) => n + d.withheld.length, 0)} einbehaltene §§.`)
if (baselineFindings) {
  console.log(`\n## Grundlinie (${baselinePath}, gezogen ${baseline!.at.slice(0, 10)})`)
  for (const f of baselineFindings) console.log(`  ✗ ${f}`)
  if (baselineFindings.length) failed = true
  else console.log(`  ✓ ohne Befund: ${Object.keys(baselineDocs).length} Entwürfe messen sich wie in der Grundlinie`)
}
if (failed) process.exit(1)
