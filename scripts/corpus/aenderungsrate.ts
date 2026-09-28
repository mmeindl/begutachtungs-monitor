#!/usr/bin/env vite-node
/**
 * How many drafts of one Gesetzgebungsperiode changed after the
 * Begutachtung — the second half of the base rate whose first half
 * („wie viele werden zur Regierungsvorlage") `scripts/corpus/rvLatency.ts`
 * measured into `app/utils/outcomes.ts` (TODO.md Teil 3, „Die erste
 * Basisrate für eine ganze GP").
 *
 * Usage:   npx vite-node scripts/corpus/aenderungsrate.ts -- --gp XXVII [--out dir] [--show inr]
 *          npx vite-node -c vitest.config.ts scripts/corpus/aenderungsrate.ts -- --gp XXVII
 *          npx vite-node scripts/corpus/aenderungsrate.ts -- --gp XXVII --reasoning [--show-para inr]
 *
 * WHY THE SHIPPED COMPARISON AND NOT A NEW ONE. A base rate the page cannot
 * reproduce is a second opinion, not a number about the page. So every draft
 * goes down the ME→RV path of `server/utils/diff/lawDiffService.ts`
 * (`getLawDiff`) step for step: the stations from the draft's own detail
 * JSON, the draft's text from Parliament's HTML with the RIS XML of the
 * joined Begut record as the fallback for a PDF-only draft, the Vorlage's
 * text from the same detail's text-evolution list, then `parseLawUnits` /
 * `parseLawUnitsFromRis`, `diffLawPackage` and `summarizeDiff` — imported,
 * not copied. `getLawDiff` itself is Nitro-wrapped and cannot be imported.
 *
 * Copied, and only these, because their modules cannot load here:
 *  - `findLawStations` + `MISSING_STATION_REASON`
 *    (`server/utils/diff/stationDocuments.ts` imports `#shared/…` at
 *    runtime, which plain vite-node does not resolve). Run the second usage
 *    line — the vitest config carries the alias — and the script loads the
 *    shipped function too and checks the copy against it on every draft.
 *  - `decodeHtml` (private to `server/utils/upstream/fetchDocument.ts`,
 *    which is a `defineCachedFunction`). The bytes come through the shared
 *    client's `upstreamBytes` with the same 8 MB ceiling.
 *  - the per-GP RIS map (`getRisMapForGp`, Nitro-cached) is rebuilt from its
 *    pure parts: `mapDraftRow` → `toMeListRows` → `dedupeMeRows` →
 *    `joinRisToMe` over the whole Begut corpus, sorted Ascending as
 *    production fetches it.
 *
 * Not reproduced, because it cannot change an ME→RV answer: the BGBl
 * enrichment (a Regierungsvorlage detail and a BgblAuth lookup), which
 * `getLawDiff` wraps in a try/catch and only uses for the `bgbl` station.
 *
 * Every Ministerialentwurf lands in exactly one bucket:
 *   1  no Regierungsvorlage (by the stage record, as rvLatency.ts counts)
 *   2  a Vorlage, but no comparison — with getLawDiff's own reason
 *   3  compared, not one unit changed, inserted or removed
 *   4  compared, only units the diff marks `editorial`
 *   5  compared, at least one non-editorial change, insertion or removal
 * „Changed" is neither a failure nor a success: it says the text moved
 * between the stations, and the page is where the reader sees how.
 *
 * `--reasoning` adds a second question on the same diff units (TODO.md § 5b,
 * „Begründung: das Gesetz zur Passage"): how many Paragraphen the
 * Begründungsvergleich (`explanations/reasoningDiffService.ts`) drops as
 * ambiguous because two Artikel of the draft address the same § number — and
 * how many of them an Artikel key would bring back, because both
 * Erläuterungen place the passage under an Artikel mark whose number matches.
 * The shipped path runs as it is (`parseExplanationsHtml`,
 * `passagesByParagraph`, `compareReasoning`); see the section at the end for
 * what had to be copied. A flag here rather than a script of its own, because
 * the question needs exactly the diff units this script already reproduces.
 *
 * Reads only. Caches under `.cache/aenderungsrate/` (list 81 and details
 * are taken from `.cache/rv-latency/` and `.cache/stations/` when there),
 * so a second run makes no request. Concurrency 4 per host.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { DraftDocument, LawDiffUnit, LawStationId, LawPackageEntry } from '../../shared/types'
import { meTextTitleRank } from '../../shared/utils/lawStations'
import { ownChangeShare } from '../../shared/utils/changeShare'
import { findLastRvLink, findRvLinks, mapDocuments, mapTextEvolution, parseStages, type RawDocumentGroup, type RawStage } from '../../server/utils/parliament/detailJson'
import { parseLawUnits, parseLawUnitsFromRis, type LawUnit } from '../../server/utils/lawtext/lawUnits'
import { articlePairs, diffLawPackage, pairArticles, summarizeDiff } from '../../server/utils/diff/lawDiff'
import { articleNameTokens } from '../../server/utils/lawtext/lawNames'
import { mapDraftRow } from '../../server/utils/parliament/list81'
import { dedupeMeRows, joinRisToMe, toMeListRows } from '../../server/utils/ris/risJoin'
import type { RisBegutFlat } from '../../server/utils/ris/risRecord'
import { upstreamBytes } from '../../server/utils/upstream/fetch'
import { PARLIAMENT, getJson, scriptUserAgent } from '../lib/http'
import { cachedJson, cachedText } from '../lib/diskCache'
import { fetchRisBegutCorpus } from '../lib/corpus'
import { pool } from '../lib/async'
import { argFlag, argPair } from '../lib/args'
import { parseExplanationsHtml, passagesByArticleParagraph, passagesByParagraph, type HtmlPassage } from '../../server/utils/explanations/explanationsHtml'
import { compareReasoning } from '../../server/utils/explanations/reasoningDiff'
import { addressOf, isAddressHeading } from '../../server/utils/explanations/risExplanations'
import { addressedParagraphOf, addressedParagraphs } from '../../server/utils/lawtext/instructionAddress'
import { parseParliamentHtml } from '../../server/utils/lawtext/parliamentHtml'
import { normalizeText } from '../../server/utils/lawtext/normalize'
import { explanationParaId } from '../../shared/utils/explanationKey'
import { pct, quantile } from '../lib/fmt'

const SCRIPT = 'corpus/aenderungsrate'
const CONCURRENCY = 4
const CACHE = join('.cache', 'aenderungsrate')

const gp = (argPair('gp') ?? 'XXVII').toUpperCase()
if (!/^[IVXLC]+$/.test(gp)) {
  console.error('Usage: npx vite-node scripts/corpus/aenderungsrate.ts -- --gp XXVII [--out dir] [--show inr]')
  process.exit(1)
}
const outDir = argPair('out') ?? CACHE
const show = Number(argPair('show')) || 0
await mkdir(join(CACHE, gp), { recursive: true })
await mkdir(join(CACHE, 'docs'), { recursive: true })
await mkdir(outDir, { recursive: true })
const started = Date.now()

// ---------------------------------------------------------------------------
// Copies — see the header for why each one is not an import
// ---------------------------------------------------------------------------

interface ResolvedLawStation {
  id: LawStationId
  html: string | null
  xml: string | null
  fallbackUrl: string | null
}

/** Copy of `findLawStations` (server/utils/diff/stationDocuments.ts). */
function findLawStationsCopy(content: {
  documents?: RawDocumentGroup[] | null
  statements?: { documents?: RawDocumentGroup[] | null } | null
}): Map<LawStationId, ResolvedLawStation> {
  const out = new Map<LawStationId, ResolvedLawStation>()
  const documents = mapDocuments(content.documents)
  let best: { rank: number; formats: DraftDocument['formats'] } | null = null
  for (const doc of documents) {
    const rank = meTextTitleRank(doc.title)
    if (rank < 0) continue
    if (!best || rank < best.rank) best = { rank, formats: doc.formats }
  }
  if (best) {
    out.set('me', {
      id: 'me',
      html: best.formats.find((f) => f.type === 'html')?.url ?? null,
      xml: null,
      fallbackUrl: best.formats.find((f) => f.type === 'pdf')?.url ?? null,
    })
  }
  const meUrls = new Set(documents.flatMap((d) => d.formats.map((f) => f.url)))
  for (const v of mapTextEvolution(content.statements?.documents, meUrls)) {
    if (!v.stationId) continue
    const station = out.get(v.stationId) ?? { id: v.stationId, html: null, xml: null, fallbackUrl: null }
    if (v.url.endsWith('.html')) station.html ??= v.url
    else station.fallbackUrl ??= v.url
    out.set(v.stationId, station)
  }
  return out
}

/** Copy of the two entries of `MISSING_STATION_REASON` this path can return. */
const MISSING_REASON = {
  me: 'Zu diesem Entwurf ist kein Gesetzestext als eigenes Dokument veröffentlicht.',
  rv: 'Es liegt noch keine Regierungsvorlage vor, mit der sich der Entwurf vergleichen ließe.',
}
/**
 * Copy of `missingStationReason('rv', true)` (since 27.09.2026): this path only
 * gets there with a Vorlage linked, so it is the sentence the service says.
 */
const RV_WITHOUT_TEXT = 'Zur Regierungsvorlage ist kein Gesetzestext als eigenes Dokument veröffentlicht, mit dem sich der Entwurf vergleichen ließe.'
/** Copy of `getLawDiff`'s answer for a package whose Artikel pair nowhere (since 27.09.2026). */
const UNPAIRED = 'Die Artikel der beiden Texte ließen sich keinem gemeinsamen Gesetz zuordnen. Ein Vergleich Paragraph für Paragraph würde deshalb jede Bestimmung als entfallen und als neu zeigen.'

/** Copy of `decodeHtml` (server/utils/upstream/fetchDocument.ts). */
function decodeHtml(buf: ArrayBuffer, headerCharset: string | undefined): string {
  let charset = headerCharset
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 2048))
    charset = /charset=["']?([\w-]+)/i.exec(head)?.[1]
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(buf)
  } catch {
    return new TextDecoder('utf-8').decode(buf)
  }
}

// The shipped function, where the alias makes it loadable (second usage line).
type Finder = typeof findLawStationsCopy
const shipped: { findLawStations: Finder; MISSING_STATION_REASON: Record<string, string>; missingStationReason: (id: 'rv', linked: boolean) => string } | null = await import(
  '../../server/utils/diff/stationDocuments'
).catch(() => null)
let copyMismatches = 0
if (shipped) {
  for (const k of ['me', 'rv'] as const) {
    if (shipped.MISSING_STATION_REASON[k] !== MISSING_REASON[k]) {
      console.error(`MISSING_STATION_REASON.${k} weicht von der Kopie ab`)
      copyMismatches++
    }
  }
  if (shipped.missingStationReason('rv', true) !== RV_WITHOUT_TEXT) {
    console.error('missingStationReason(rv, true) weicht von der Kopie ab')
    copyMismatches++
  }
}

// ---------------------------------------------------------------------------
// Upstream, cached
// ---------------------------------------------------------------------------

function fetchJson<T>(url: string, body?: unknown): Promise<T> {
  return getJson<T>(url, {
    script: SCRIPT,
    attempts: 3,
    backoffMs: (retry) => 500 * retry,
    timeoutMs: 20_000,
    ...(body === undefined ? {} : { method: 'POST' as const, body }),
  })
}

function readFirst<T>(files: string[]): T | null {
  for (const f of files) {
    try {
      return JSON.parse(readFileSync(f, 'utf8')) as T
    } catch {
      /* next */
    }
  }
  return null
}

interface DetailContent {
  stages?: RawStage[] | null
  documents?: RawDocumentGroup[] | null
  statements?: { documents?: RawDocumentGroup[] | null } | null
}

async function listRows(): Promise<unknown[][]> {
  const cached = readFirst<{ rows?: unknown[][] }>([join('.cache', 'rv-latency', `${gp}-list81.json`)])
  const list =
    cached ??
    (await cachedJson<{ rows?: unknown[][] }>(join(CACHE, `${gp}-list81.json`), () =>
      fetchJson(`${PARLIAMENT}/Filter/api/filter/data/81?js=eval&showAll=true&sortrnr=11&ascDesc=DESC`, { GP_CODE: [gp] }),
    ))
  return (list.rows ?? []).filter((r) => Array.isArray(r) && r[0] === gp)
}

async function detailOf(inr: number): Promise<DetailContent> {
  const file = `ME-${inr}.json`
  const cached = readFirst<{ content?: DetailContent }>([
    join('.cache', 'rv-latency', gp, file),
    join('.cache', 'stations', gp, file),
  ])
  const detail =
    cached ??
    (await cachedJson<{ content?: DetailContent }>(join(CACHE, gp, file), () =>
      fetchJson(`${PARLIAMENT}/gegenstand/${gp}/ME/${inr}?json=True`),
    ))
  return detail.content ?? {}
}

/** One document as `fetchDocument` returns it: bytes → charset-decoded text. */
function fetchDocument(url: string): Promise<string> {
  const key = createHash('sha1').update(url).digest('hex')
  return cachedText(join(CACHE, 'docs', `${key}.txt`), async () => {
    const body = await upstreamBytes(url, {
      timeoutMs: 45_000,
      retries: 2,
      backoffMs: (n) => 1_000 * n,
      maxBytes: 8 * 1024 * 1024,
      userAgent: scriptUserAgent(SCRIPT),
    })
    const charset = /charset=([\w-]+)/i.exec(body.contentType ?? '')?.[1]
    return decodeHtml(body.bytes, charset)
  })
}

/** inr → the joined RIS record, as `getRisMapForGp` builds it. Lazy: only PDF-only drafts need it. */
let risMap: Map<number, { risId: string | null; xml: string | null; url: string | null }> | null = null
async function risRowFor(rows: unknown[][], inr: number) {
  if (!risMap) {
    const corpus = await cachedJson<{ records: RisBegutFlat[] }>(join(CACHE, 'ris-begut-corpus.json'), () =>
      fetchRisBegutCorpus(SCRIPT, 'Ascending'),
    )
    const byId = new Map(corpus.records.map((r) => [r.id, r]))
    const mes = dedupeMeRows(toMeListRows(rows.map(mapDraftRow)))
    risMap = new Map()
    for (const r of joinRisToMe(mes, corpus.records)) {
      const rec = r.risId ? byId.get(r.risId) ?? null : null
      risMap.set(r.inr, { risId: r.risId, xml: rec?.mainDocument?.xml ?? null, url: r.risId })
    }
  }
  return risMap.get(inr) ?? null
}

// ---------------------------------------------------------------------------
// One draft, down getLawDiff's ME→RV path
// ---------------------------------------------------------------------------

type Bucket = 1 | 2 | 3 | 4 | 5

/** Both parsed sides per draft, for `--reasoning`, which needs the article numbers the diff units drop. */
const parsed = new Map<number, { fromUnits: LawUnit[]; toUnits: LawUnit[]; units?: LawDiffUnit[] }>()

interface Row {
  inr: number
  citation: string
  title: string
  bucket: Bucket
  /** getLawDiff's unavailableReason (bucket 2), or the thrown error */
  reason: string | null
  rvLinks: string[]
  /** RV found in the stage record but not in the text evolution, or the other way round */
  rvDisagree: boolean
  meSource: 'parlament' | 'ris' | null
  meUrl: string | null
  rvUrl: string | null
  fromUnits: number
  toUnits: number
  stats: ReturnType<typeof summarizeDiff> | null
  substantive: number
  lawsOnlyInTo: LawPackageEntry[]
  lawsOnlyInFrom: LawPackageEntry[]
  copyMismatch: boolean
  /** Diagnostics, not buckets: what the shipped result is made of (see `diagnose`). */
  diag: Diagnosis | null
}

/**
 * Checks on the instrument, never a second comparison. The buckets stay the
 * shipped ones; these say how much of a bucket-5 verdict the texts carry and
 * how much the alignment does.
 */
interface Diagnosis {
  /** Distinct articles per side, and how many `pairArticles` paired */
  articlesFrom: number
  articlesTo: number
  articlesPaired: number
  /** An inserted and a removed unit with the same text: one unit the alignment failed to pair */
  phantom: number
  /** Non-editorial changed units whose words differ (letters only, case-folded) */
  wordChanged: number
  /** Non-editorial changed units whose words are identical — only digits, punctuation or spacing moved */
  nonWordChanged: number
  /** wordChanged + inserted + removed − 2 × phantom */
  robust: number
  /** Of those, the units that are commencement clauses („in Kraft", „Inkrafttreten") */
  robustInForce: number
}

const IN_FORCE = /\b(in|au(ß|ss)er)\s+Kraft\b|Inkrafttret/i

const wordsOf = (t: string | null) => (t ?? '').toLowerCase().replace(/[^a-zäöüß]+/g, ' ').trim()
const spaced = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim()

function diagnose(fromUnits: readonly LawUnit[], toUnits: readonly LawUnit[], units: readonly LawDiffUnit[]): Diagnosis {
  const arts = (xs: readonly LawUnit[]) => new Set(xs.map((u) => u.article ?? '')).size
  const removed = new Map<string, number>()
  for (const u of units) if (u.change === 'removed') removed.set(spaced(u.fromText), (removed.get(spaced(u.fromText)) ?? 0) + 1)
  let phantom = 0
  const phantomTexts = new Map<string, number>()
  for (const u of units) {
    if (u.change !== 'inserted') continue
    const k = spaced(u.toText)
    const left = removed.get(k) ?? 0
    if (left > 0) {
      phantom++
      removed.set(k, left - 1)
      phantomTexts.set(k, (phantomTexts.get(k) ?? 0) + 2)
    }
  }
  // The units that carry the robust count, phantoms taken out once per side.
  const carriers: LawDiffUnit[] = []
  for (const u of units) {
    if (u.change === 'unchanged' || (u.change === 'changed' && (u.editorial || wordsOf(u.fromText) === wordsOf(u.toText)))) continue
    const k = spaced(u.toText ?? u.fromText)
    if (u.change !== 'changed' && (phantomTexts.get(k) ?? 0) > 0) {
      phantomTexts.set(k, phantomTexts.get(k)! - 1)
      continue
    }
    carriers.push(u)
  }
  const sub = units.filter((u) => u.change === 'changed' && !u.editorial)
  const wordChanged = sub.filter((u) => wordsOf(u.fromText) !== wordsOf(u.toText)).length
  const ins = units.filter((u) => u.change === 'inserted').length
  const rem = units.filter((u) => u.change === 'removed').length
  return {
    articlesFrom: arts(fromUnits),
    articlesTo: arts(toUnits),
    articlesPaired: pairArticles(fromUnits, toUnits).size,
    phantom,
    wordChanged,
    nonWordChanged: sub.length - wordChanged,
    robust: wordChanged + ins + rem - 2 * phantom,
    robustInForce: carriers.filter((u) => IN_FORCE.test(`${u.fromText ?? ''} ${u.toText ?? ''}`)).length,
  }
}

function sameStations(a: Map<LawStationId, ResolvedLawStation>, b: Map<LawStationId, ResolvedLawStation>): boolean {
  return JSON.stringify([...a]) === JSON.stringify([...b])
}

async function measure(rows: unknown[][], inr: number, citation: string, title: string): Promise<{ row: Row; units: LawDiffUnit[] }> {
  const content = await detailOf(inr)
  const rvLinks = findRvLinks(parseStages(content.stages)).map((l) => `${l.gp}/I/${l.inr}`)
  const found = findLawStationsCopy(content)
  const copyMismatch = shipped ? !sameStations(found, shipped.findLawStations(content)) : false
  const row: Row = {
    inr,
    citation,
    title,
    bucket: 1,
    reason: null,
    rvLinks,
    rvDisagree: (rvLinks.length > 0) !== found.has('rv'),
    meSource: null,
    meUrl: null,
    rvUrl: found.get('rv')?.html ?? found.get('rv')?.fallbackUrl ?? null,
    fromUnits: 0,
    toUnits: 0,
    stats: null,
    substantive: 0,
    lawsOnlyInTo: [],
    lawsOnlyInFrom: [],
    copyMismatch,
    diag: null,
  }
  if (rvLinks.length === 0) return { row, units: [] }
  row.bucket = 2

  // getLawDiff: the RIS fallback for a draft Parliament has only as PDF.
  const meStation = found.get('me')
  let risRowExists = false
  if (meStation && !meStation.html) {
    const r = await risRowFor(rows, inr)
    risRowExists = Boolean(r?.risId)
    meStation.xml = r?.xml ?? null
  }
  row.meUrl = meStation?.html ?? meStation?.xml ?? meStation?.fallbackUrl ?? null
  const comparable = (id: LawStationId) => Boolean(found.get(id)?.html) || Boolean(found.get(id)?.xml)

  // Same order as getLawDiff: `to` first, then `from`.
  // A Vorlage is linked here (bucket 1 returned above), so this is the sentence
  // for a Vorlage without an accepted Gesetzestext.
  if (!found.has('rv')) return { row: { ...row, reason: RV_WITHOUT_TEXT }, units: [] }
  if (!found.has('me')) return { row: { ...row, reason: MISSING_REASON.me }, units: [] }
  if (!comparable('me')) {
    row.reason = risRowExists
      ? 'Der Gesetzestext des Entwurfs liegt beim Parlament nur als PDF vor, und das RIS bietet ihn nicht als XML an.'
      : 'Der Gesetzestext des Entwurfs liegt beim Parlament nur als PDF vor und ist im RIS nicht veröffentlicht.'
    return { row, units: [] }
  }
  if (!comparable('rv')) return { row: { ...row, reason: 'Der Gesetzestext der Regierungsvorlage liegt nur als PDF vor.' }, units: [] }

  const fromHtml = found.get('me')!.html
  const toHtml = found.get('rv')!.html
  row.meSource = fromHtml ? 'parlament' : 'ris'
  // Sequential, not Promise.all: keeps the pool's four the ceiling per host.
  const fromDoc = await fetchDocument(fromHtml ?? found.get('me')!.xml!)
  const toDoc = await fetchDocument(toHtml ?? found.get('rv')!.xml!)
  const fromUnits: LawUnit[] = fromHtml ? parseLawUnits(fromDoc) : parseLawUnitsFromRis(fromDoc)
  const toUnits: LawUnit[] = toHtml ? parseLawUnits(toDoc) : parseLawUnitsFromRis(toDoc)
  row.fromUnits = fromUnits.length
  row.toUnits = toUnits.length
  parsed.set(inr, { fromUnits, toUnits })

  const { units, lawsOnlyInTo, lawsOnlyInFrom, unpaired } = diffLawPackage(fromUnits, toUnits)
  if (unpaired) return { row: { ...row, reason: UNPAIRED }, units: [] }
  if (units.length === 0) return { row: { ...row, reason: 'Der Gesetzestext ließ sich nicht in Paragraphen gliedern.' }, units }
  const stats = summarizeDiff(units)
  const substantive = units.filter((u) => u.change === 'changed' && !u.editorial).length + stats.inserted + stats.removed
  const bucket: Bucket =
    stats.changed + stats.inserted + stats.removed === 0 ? 3 : substantive === 0 ? 4 : 5
  const diag = diagnose(fromUnits, toUnits, units)
  parsed.get(inr)!.units = units
  return { row: { ...row, bucket, stats, substantive, lawsOnlyInTo, lawsOnlyInFrom, diag }, units }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const rows = await listRows()
const byInr = new Map<number, { citation: string; title: string }>()
for (const r of rows) {
  const inr = Number(r[2])
  if (!byInr.has(inr)) byInr.set(inr, { citation: String(r[5] ?? ''), title: String(r[4] ?? '') })
}
console.error(`${gp}: ${rows.length} Zeilen in Liste 81, ${byInr.size} Entwürfe${shipped ? ' · Kopie wird gegen findLawStations geprüft' : ''}`)

if (show) {
  const meta = byInr.get(show)
  const { row, units } = await measure(rows, show, meta?.citation ?? '', meta?.title ?? '')
  console.log(JSON.stringify({ ...row, lawsOnlyInTo: row.lawsOnlyInTo, lawsOnlyInFrom: row.lawsOnlyInFrom }, null, 1))
  for (const u of units) {
    const a = u.fromText ?? ''
    const b = u.toText ?? ''
    let at = 0
    while (at < a.length && at < b.length && a[at] === b[at]) at++
    const from = Math.max(0, at - 40)
    console.log(`\n${u.change}${u.editorial ? ' (redaktionell)' : ''} · ${u.article ?? '—'} · ${u.fromId ?? '–'} → ${u.id} · ${a.length}/${b.length} Zeichen, gleich bis ${at}`)
    if (u.change !== 'unchanged') {
      if (a) console.log(`  ME: …${JSON.stringify(a.slice(from, at + 140))}`)
      if (b) console.log(`  RV: …${JSON.stringify(b.slice(from, at + 140))}`)
    }
  }
  process.exit(0)
}

const results: Row[] = await pool(
  [...byInr.entries()],
  CONCURRENCY,
  async ([inr, meta]): Promise<Row> => {
    try {
      return (await measure(rows, inr, meta.citation, meta.title)).row
    } catch (err) {
      // getLawDiff would answer 502 here (document unreachable or > 8 MB).
      return {
        inr, citation: meta.citation, title: meta.title, bucket: 2, reason: `Fehler: ${String(err).slice(0, 160)}`,
        rvLinks: [], rvDisagree: false, meSource: null, meUrl: null, rvUrl: null, fromUnits: 0, toUnits: 0,
        stats: null, substantive: 0, lawsOnlyInTo: [], lawsOnlyInFrom: [], copyMismatch: false, diag: null,
      }
    }
  },
  (n, total) => {
    if (n % 25 === 0) console.error(`  ${n}/${total}`)
  },
)
results.sort((a, b) => a.inr - b.inr)
await writeFile(join(outDir, `${gp}-rows.json`), JSON.stringify(results, null, 1))

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const n = results.length
const inBucket = (b: Bucket) => results.filter((r) => r.bucket === b)
const line = (label: string, k: number, of = n) => console.log(`  ${label.padEnd(52)} ${String(k).padStart(4)} von ${of}  (${pct(k, of)})`)

// Reproduction check against outcomes.ts, which counts list-81 ROWS (joint drafts twice).
const noRvInrs = new Set(inBucket(1).map((r) => r.inr))
const noRvRows = rows.filter((r) => noRvInrs.has(Number(r[2]))).length

console.log(`\nGP ${gp} — Ministerialentwurf → Regierungsvorlage, Vergleich wie getLawDiff`)
console.log(`  Liste-81-Zeilen ${rows.length}, davon ohne RV ${noRvRows}, mit RV ${rows.length - noRvRows}  (outcomes.ts zählt Zeilen)`)
console.log(`  Entwürfe (je INR) ${n}\n`)
line('1  keine Regierungsvorlage', inBucket(1).length)
line('2  Regierungsvorlage, aber kein Vergleich', inBucket(2).length)
line('3  verglichen, textgleich', inBucket(3).length)
line('4  verglichen, nur redaktionell', inBucket(4).length)
line('5  verglichen, inhaltlich geändert', inBucket(5).length)
const withRv = n - inBucket(1).length
const compared = inBucket(3).length + inBucket(4).length + inBucket(5).length
console.log(`\n  Bezogen auf die ${compared} verglichenen Entwürfe:`)
for (const b of [3, 4, 5] as const) line(`  Eimer ${b}`, inBucket(b).length, compared)
console.log(`  (mit RV: ${withRv}; verglichen: ${pct(compared, withRv)} davon)`)

console.log(`\n  Gründe in Eimer 2:`)
const reasons = new Map<string, number[]>()
for (const r of inBucket(2)) reasons.set(r.reason ?? '?', [...(reasons.get(r.reason ?? '?') ?? []), r.inr])
for (const [reason, inrs] of [...reasons].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`    ${String(inrs.length).padStart(3)}  ${reason}\n         ${inrs.map((i) => `${i}/ME`).join(', ')}`)
}

const b5 = inBucket(5)
const touched = b5.map((r) => (r.stats!.total - r.stats!.unchanged) / r.stats!.total)
const subst = b5.map((r) => r.substantive / r.stats!.total)
const q = (xs: number[], p: number) => `${(100 * quantile(xs, p)).toFixed(1)} %`
console.log(`\n  Eimer 5 — Anteil berührter Einheiten (n = ${b5.length}):`)
console.log(`    alle nicht-gleichen (inkl. redaktionell)  p10 ${q(touched, 0.1)} · Median ${q(touched, 0.5)} · p90 ${q(touched, 0.9)}`)
console.log(`    nur inhaltliche (geändert/neu/entfallen)  p10 ${q(subst, 0.1)} · Median ${q(subst, 0.5)} · p90 ${q(subst, 0.9)}`)

const pkg = results.filter((r) => r.lawsOnlyInTo.length || r.lawsOnlyInFrom.length)
console.log(`\n  Paket anders geschnitten (lawsOnlyInTo/From nicht leer): ${pkg.length}`)
for (const r of pkg) {
  const to = r.lawsOnlyInTo.map((e) => `+${e.units}`).join(' ')
  const from = r.lawsOnlyInFrom.map((e) => `-${e.units}`).join(' ')
  console.log(`    ${String(r.inr).padStart(3)}/ME  Eimer ${r.bucket}  RV ${r.rvLinks.join(',')}  nur RV: ${r.lawsOnlyInTo.length} Gesetze ${to}  nur ME: ${r.lawsOnlyInFrom.length} ${from}`)
}

const multi = results.filter((r) => r.rvLinks.length > 1)
console.log(`\n  Mehr als ein /I/-Link im Verlauf (1:n): ${multi.length}  ${multi.map((r) => `${r.inr}/ME→${r.rvLinks.join('+')} (Eimer ${r.bucket})`).join(', ')}`)
const disagree = results.filter((r) => r.rvDisagree)
console.log(`  RV im Verlauf ≠ RV-Textstation: ${disagree.length}  ${disagree.map((r) => `${r.inr}/ME (Eimer ${r.bucket})`).join(', ')}`)

const asym = results.filter((r) => r.stats && Math.min(r.fromUnits, r.toUnits) < 0.5 * Math.max(r.fromUnits, r.toUnits))
console.log(`\n  Parser-Asymmetrie (eine Seite < 50 % der Einheiten der anderen, vor dem Paket-Zuschnitt): ${asym.length}`)
for (const r of asym) console.log(`    ${String(r.inr).padStart(3)}/ME  Eimer ${r.bucket}  ME ${r.fromUnits} · RV ${r.toUnits}  Paket: +${r.lawsOnlyInTo.length}/-${r.lawsOnlyInFrom.length}  ${r.meSource}`)
const asymScoped = results.filter((r) => {
  if (!r.stats) return false
  const from = r.stats.total - r.stats.inserted
  const to = r.stats.total - r.stats.removed
  return Math.min(from, to) < 0.5 * Math.max(from, to)
})
console.log(`  … nach dem Paket-Zuschnitt: ${asymScoped.length}  ${asymScoped.map((r) => `${r.inr}/ME (Eimer ${r.bucket})`).join(', ')}`)

// What bucket 5 is made of — the instrument check, see `Diagnosis`.
const d5 = b5.map((r) => r.diag!)
const unpaired = b5.filter((r) => r.diag!.articlesPaired === 0)
const phantomDrafts = b5.filter((r) => r.diag!.phantom > 0)
const robustZero = b5.filter((r) => r.diag!.robust <= 0)
const onlyNonWord = b5.filter((r) => r.diag!.wordChanged === 0 && r.stats!.inserted + r.stats!.removed === 0)
console.log(`\n  Eimer 5 — woraus das Urteil besteht (Diagnose, keine eigenen Eimer):`)
console.log(`    Artikel gar nicht gepaart (pairArticles leer, ungeschnittener Vergleich): ${unpaired.length}  ${unpaired.map((r) => `${r.inr}/ME (${r.diag!.articlesFrom}→${r.diag!.articlesTo})`).join(', ')}`)
console.log(`    mit Phantom-Paaren (neu + entfallen, gleicher Text): ${phantomDrafts.length} Entwürfe, ${d5.reduce((a, d) => a + d.phantom, 0)} Paare`)
console.log(`    nur Ziffern/Satzzeichen geändert, nichts neu/entfallen: ${onlyNonWord.length}  ${onlyNonWord.map((r) => `${r.inr}/ME`).join(', ')}`)
console.log(`    ohne jede Wortänderung nach Abzug der Phantome: ${robustZero.length}  ${robustZero.map((r) => `${r.inr}/ME`).join(', ')}`)
console.log(`    geänderte Einheiten ohne Wortunterschied: ${d5.reduce((a, d) => a + d.nonWordChanged, 0)} von ${b5.reduce((a, r) => a + r.stats!.changed - r.stats!.editorial, 0)} nicht-redaktionellen`)
const inForceOnly = b5.filter((r) => r.diag!.robust > 0 && r.diag!.robustInForce === r.diag!.robust)
console.log(`    Wortänderungen nur in Inkrafttretens-Einheiten: ${inForceOnly.length}  ${inForceOnly.map((r) => `${r.inr}/ME`).join(', ')}`)
const few = [1, 2, 3, 5].map((k) => `≤${k}: ${b5.filter((r) => r.diag!.robust <= k).length}`).join(' · ')
console.log(`    Einheiten mit Wortänderung/echt neu/entfallen, Anzahl je Entwurf: p10 ${quantile(b5.map((r) => r.diag!.robust), 0.1)} · Median ${quantile(b5.map((r) => r.diag!.robust), 0.5)} · ${few}`)
const robustShare = b5.map((r) => Math.max(0, r.diag!.robust) / r.stats!.total)
console.log(`    Anteil mit Wortänderung/echt neu/entfallen  p10 ${q(robustShare, 0.1)} · Median ${q(robustShare, 0.5)} · p90 ${q(robustShare, 0.9)}`)

{
  // The base rate the page prints (§12.38), through the page's own formula.
  const shares = results
    .filter((r) => r.bucket === 3 || r.bucket === 4 || r.bucket === 5)
    .map((r) => (r.stats ? ownChangeShare(r.stats) : null))
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .map((x) => x.share)
  const pctOf = (q: number) => Math.round(quantile(shares, q) * 100)
  console.log(`\n  Basisrate (ownChangeShare, verglichene Entwürfe): n ${shares.length}, p25 ${pctOf(0.25)} %, Median ${pctOf(0.5)} %, p75 ${pctOf(0.75)} %`)
  console.log(`    für app/utils/outcomes.ts: { gp: '${gp}', drafts: ${shares.length}, p25: ${pctOf(0.25)}, median: ${pctOf(0.5)}, p75: ${pctOf(0.75)} }`)
}
console.log(`\n  ME-Quelle der verglichenen: Parlament ${results.filter((r) => r.stats && r.meSource === 'parlament').length} · RIS ${results.filter((r) => r.stats && r.meSource === 'ris').length}`)
if (shipped) console.log(`  Kopie ≠ findLawStations: ${results.filter((r) => r.copyMismatch).length + copyMismatches} Abweichungen`)
else console.log('  (Kopie von findLawStations ungeprüft — mit -c vitest.config.ts laufen lassen)')
console.log(`\n  Laufzeit ${((Date.now() - started) / 1000).toFixed(1)} s · Zeilen: ${join(outDir, `${gp}-rows.json`)}`)

// ---------------------------------------------------------------------------
// --reasoning: the Begründungsvergleich and its ambiguous Paragraphen
// ---------------------------------------------------------------------------

/** Copy of `explanationsDocument` (reasoningDiffService.ts, Nitro): the „Erläuterungen" group's HTML. */
function explanationsUrl(documents: RawDocumentGroup[] | null | undefined): string | null {
  const group = mapDocuments(documents).find((d) => /^Erläuterungen$/i.test(d.title.trim()))
  return group?.formats.find((f) => f.type === 'html')?.url ?? null
}

/** Copy of `passageTexts` (reasoningDiffService.ts). */
function passageTexts(byParagraph: Map<string, HtmlPassage[]>): Map<string, string> {
  return new Map([...byParagraph].map(([id, passages]) => [id, passages.flatMap((p) => p.text).join(' ')]))
}

/** Copy of `ambiguousParagraphs` (reasoningDiff.ts, not exported) — returning the Artikel per number too. */
function articlesPerParagraph(units: readonly LawDiffUnit[]): Map<string, Set<string>> {
  const articles = new Map<string, Set<string>>()
  for (const unit of units) {
    const para = addressedParagraphOf(unit)
    if (!para) continue
    const seen = articles.get(para) ?? new Set<string>()
    seen.add(unit.article ?? '')
    articles.set(para, seen)
  }
  return articles
}

/** Copy of `ARTICLE_HEADING_RE` (risExplanations.ts, not exported). */
const ARTICLE_HEADING_RE = /^(?:zu\s+)?art(?:ikel)?\.?\s*(?:[0-9]+[a-z]?|[ivxlc]+)\b/i
/** The number an Artikel heading or an address heading („Zu Art. 5 Z 1 (§ 15)") names. Ours. */
const ARTICLE_NUMBER_RE = /^(?:zu\s+)?art(?:ikel)?\.?\s*([0-9]+[a-z]?|[ivxlc]+)\b/i
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 }
function articleNumber(raw: string | null | undefined): string | null {
  const m = ARTICLE_NUMBER_RE.exec((raw ?? '').trim())
  if (!m) return null
  const v = m[1]!.toLowerCase()
  if (/^\d/.test(v)) return v
  let n = 0
  for (let i = 0; i < v.length; i++) {
    const cur = ROMAN[v[i]!]!
    const next = ROMAN[v[i + 1] ?? ''] ?? 0
    n += cur < next ? -cur : cur
  }
  return String(n)
}

interface MarkedPassage {
  heading: string
  paragraphs: string[]
  /** The Artikel number the passage stands under, or null */
  article: string | null
  /** Where the number came from: its own heading, a mark above it, several Artikel in its heading, or nowhere */
  via: 'own' | 'mark' | 'multi' | null
}

/** Every Artikel number a heading names — „Zu Art. 1 Z 5 sowie zu Art. 13 Z 1" names two. */
function articlesNamed(heading: string): string[] {
  const out = new Set<string>()
  for (const m of heading.matchAll(/\bart(?:ikel)?\.?\s*([0-9]+[a-z]?|[ivxlc]+)\b/gi)) {
    const n = articleNumber(`Art. ${m[1]}`)
    if (n) out.add(n)
  }
  return [...out]
}

/**
 * The walk of `parseExplanationsHtml`, copied block for block, with one thing
 * added: the running Artikel mark. A mark is a block of the `ARTICLE_HEADING_RE`
 * form that names no § — „Zu Art. 5 (Änderung des …)" (which the shipped walk
 * opens as an empty passage) or a bare „Artikel 1" line (which it files as
 * text of the passage before). The bare form is only taken as a mark when
 * its Word class is a heading class (`…Ueberschr…`): prose and table cells
 * match the same expression. A heading naming several Artikel („Zu Art. 1
 * Z 5 sowie zu Art. 13 Z 1") gets none and clears the running mark. The passages are checked against
 * the shipped parser's own output before any number is used.
 */
const markClasses = new Map<string, number>()
function markedPassages(html: string): MarkedPassage[] {
  const out: MarkedPassage[] = []
  let inSpecial = false
  let mark: string | null = null
  for (const block of parseParliamentHtml(html)) {
    const text = normalizeText(block.text).trim()
    if (!text) continue
    const flat = normalizeText(text).replace(/\s+/g, '').toLowerCase().replace(/[:.]+$/, '')
    if (/^besondererteil/.test(flat) || /^allgemeinerteil/.test(flat)) {
      inSpecial = /^besondererteil/.test(flat)
      mark = null
      continue
    }
    const paragraphs = addressOf(text).paragraphs
    const isMark = ARTICLE_HEADING_RE.test(text) && paragraphs.length === 0
    if (isAddressHeading(text)) {
      const named = articlesNamed(text)
      const own = articleNumber(text)
      if (named.length > 1) {
        // One passage for several laws: no single Artikel, and no running mark either.
        out.push({ heading: text, paragraphs, article: null, via: 'multi' })
        mark = null
      } else {
        if (own) mark = own
        out.push({ heading: text, paragraphs, article: own ?? mark, via: own ? 'own' : mark ? 'mark' : null })
      }
      inSpecial = true
      continue
    }
    if (isMark) {
      const k = `${block.cls}${text.length <= 160 && !/[.;]$/.test(text) ? '' : ' (lang/Satz)'}`
      markClasses.set(k, (markClasses.get(k) ?? 0) + 1)
    }
    // Only a block the ressort typed as a heading: a short prose line of the
    // same shape is a citation („Art. 13 der Richtlinie 2019/790", 83ErlText)
    // or a table cell (61cTabTextBlock) — measured, 184 of them in XXVII alone.
    if (isMark && /Ueberschr/i.test(block.cls)) mark = articleNumber(text)
  }
  void inSpecial
  return out
}

/**
 * Per ambiguous §, the first reason that blocks every key of it — or none.
 * A passage under an Artikel number that none of the § 's units carries is
 * not a blocker: an (Artikel, §) lookup would simply never ask for it.
 */
type Why = 'recovered' | 'no key with a Begründung on both sides' | 'unit Artikel without number' | 'no marks' | 'marks one side only' | 'multi-Artikel heading'

async function reasoningReport(): Promise<void> {
  const population: number[] = []
  const notIn = new Map<string, number>()
  let draftsCompared = 0
  let parasCompared = 0
  let shippedByArticle = 0
  let shippedByArticleParas = 0
  let draftsGained = 0
  const keyedMismatch: string[] = []
  const keyedLost: string[] = []
  const potentialEntries: { draft: string; n: number }[] = []
  let draftsAmbiguous = 0
  let ambiguousTotal = 0
  let ambiguousBoth = 0
  let keysTotal = 0
  let keysRecovered = 0
  let unmatchedShape = 0
  let keysNoBegruendung = 0
  let foreignMark = 0
  const foreignLabels: string[] = []
  const viaCount = new Map<string, number>()
  const ambiguousUnpaired = new Set<string>()
  let ambiguousUnpairedParas = 0
  const markLabels: string[] = []
  const why = new Map<Why, string[]>()
  const note = (w: Why, label: string) => why.set(w, [...(why.get(w) ?? []), label])
  const show = Number(argPair('show-para')) || 0

  const candidates = results.filter((r) => r.bucket >= 3)
  await pool(candidates, CONCURRENCY, async (r) => {
    const content = await detailOf(r.inr)
    const rv = findLastRvLink(parseStages(content.stages))!
    await mkdir(join(CACHE, rv.gp), { recursive: true })
    const rvDetail = await cachedJson<{ content?: DetailContent }>(join(CACHE, rv.gp, `I-${rv.inr}.json`), () =>
      fetchJson(`${PARLIAMENT}/gegenstand/${rv.gp}/I/${rv.inr}?json=True`),
    )
    const meUrl = explanationsUrl(content.documents)
    const rvUrl = explanationsUrl(rvDetail.content?.documents)
    if (!meUrl || !rvUrl) {
      const k = !meUrl && !rvUrl ? 'beide ohne HTML-Erläuterungen' : !meUrl ? 'ME ohne HTML-Erläuterungen' : 'RV ohne HTML-Erläuterungen'
      notIn.set(k, (notIn.get(k) ?? 0) + 1)
      return
    }
    population.push(r.inr)
    const meHtml = await fetchDocument(meUrl)
    const rvHtml = await fetchDocument(rvUrl)
    const meParsed = parseExplanationsHtml(meHtml)
    const rvParsed = parseExplanationsHtml(rvHtml)
    const before = passageTexts(passagesByParagraph(meParsed))
    const after = passageTexts(passagesByParagraph(rvParsed))
    if (before.size === 0 && after.size === 0) {
      notIn.set('nicht nach Paragraphen gegliedert (in der Population)', (notIn.get('nicht nach Paragraphen gegliedert (in der Population)') ?? 0) + 1)
      return
    }
    const { units, fromUnits, toUnits } = parsed.get(r.inr) as { units: LawDiffUnit[]; fromUnits: LawUnit[]; toUnits: LawUnit[] }
    const cmp = compareReasoning(units, before, after)
    if (cmp.stats.compared > 0) draftsCompared++
    parasCompared += cmp.stats.compared
    // The shipped second key (since 27.09.2026): the same call as the service.
    const keyed = compareReasoning(units, before, after, {
      before: passageTexts(passagesByArticleParagraph(meParsed)),
      after: passageTexts(passagesByArticleParagraph(rvParsed)),
    })
    const keyedEntries = Object.keys(keyed.paragraphs).filter((k) => k.startsWith('Art. '))
    // What the comparison would hold without its ceiling: the same keys
    // `compareReasoning` forms, counted instead of built.
    {
      const amb = new Set([...articlesPerParagraph(units)].filter(([, a]) => a.size > 1).map(([p]) => p))
      const byArtBefore = passageTexts(passagesByArticleParagraph(meParsed))
      const byArtAfter = passageTexts(passagesByArticleParagraph(rvParsed))
      const keys = new Set<string>()
      for (const u of units) {
        const para = addressedParagraphOf(u)
        const id = explanationParaId(para)
        if (!para || !id) continue
        if (!amb.has(para)) {
          if (before.get(id) && after.get(id)) keys.add(para)
        } else if (u.fromArticleKey && u.articleKey && byArtBefore.get(`${u.fromArticleKey}|${id}`) && byArtAfter.get(`${u.articleKey}|${id}`)) {
          keys.add(`Art. ${u.articleKey} ${para}`)
        }
      }
      potentialEntries.push({ draft: `${r.inr}/ME`, n: keys.size })
    }
    shippedByArticle += keyedEntries.length
    shippedByArticleParas += new Set(keyedEntries.map((k) => k.replace(/^Art\. \S+ /, ''))).size
    // Nothing shown before may go: every entry of the call without the second key stays.
    const lost = Object.keys(cmp.paragraphs).filter((k) => !keyed.paragraphs[k])
    if (lost.length) keyedLost.push(`${r.inr}/ME (${lost.join(', ')})`)
    if (keyed.stats.compared !== cmp.stats.compared + keyedEntries.length) keyedMismatch.push(`${r.inr}/ME (${cmp.stats.compared} + ${keyedEntries.length} → ${keyed.stats.compared})`)
    if (keyedEntries.length) draftsGained++

    const perPara = articlesPerParagraph(units)
    const ambiguous = [...perPara].filter(([, arts]) => arts.size > 1)
    if (ambiguous.length) draftsAmbiguous++
    ambiguousTotal += ambiguous.length

    // The shipped parser's passages, and ours, must be the same list.
    const meMarked = markedPassages(meHtml)
    const rvMarked = markedPassages(rvHtml)
    const same = (a: MarkedPassage[], b: HtmlPassage[]) => a.length === b.length && a.every((p, i) => p.heading === b[i]!.heading)
    if (!same(meMarked, meParsed.special) || !same(rvMarked, rvParsed.special)) unmatchedShape++

    // Unit Artikel title → its number on each side. Diff units carry the
    // RV's title; the ME's number comes through the shipped article pairing.
    const rvNum = new Map<string, string | null>()
    for (const u of toUnits) if (u.article !== null && !rvNum.has(u.article)) rvNum.set(u.article, articleNumber(u.articleNumber))
    const meNum = new Map<string, string | null>()
    for (const u of fromUnits) if (u.article !== null && !meNum.has(u.article)) meNum.set(u.article, articleNumber(u.articleNumber))
    const pairing = pairArticles(fromUnits, toUnits)
    const meNumberFor = (rvTitle: string): string | null => {
      if (rvTitle.endsWith('\u0000unpaired')) return meNum.get(rvTitle.replace('\u0000unpaired', '')) ?? null
      const fromTitle = [...pairing].find(([, to]) => to === rvTitle)?.[0]
      return fromTitle ? meNum.get(fromTitle) ?? null : null
    }
    const rvNumberFor = (rvTitle: string): string | null => (rvTitle.endsWith('\u0000unpaired') ? null : rvNum.get(rvTitle) ?? null)

    for (const [para, arts] of ambiguous) {
      const id = explanationParaId(para)
      if (!id || !before.get(id) || !after.get(id)) continue
      ambiguousBoth++
      if (pairing.size === 0) {
        ambiguousUnpaired.add(`${r.inr}/ME`)
        ambiguousUnpairedParas++
      }
      const naming = (ps: MarkedPassage[]) => ps.filter((p) => p.paragraphs.some((x) => explanationParaId(x) === id))
      const sides = [
        { name: 'ME', passages: naming(meMarked), num: meNumberFor },
        { name: 'RV', passages: naming(rvMarked), num: rvNumberFor },
      ]
      const nums = [...arts].map((a) => [meNumberFor(a), rvNumberFor(a)] as const)
      const unmarked = sides.map((sd) => sd.passages.some((p) => p.article === null))
      const multi = sides.some((sd) => sd.passages.some((p) => p.via === 'multi'))
      let reason: Why | null = null
      if (nums.some(([a, b]) => a === null || b === null)) reason = 'unit Artikel without number'
      else if (multi) reason = 'multi-Artikel heading'
      else if (unmarked[0] && unmarked[1]) reason = 'no marks'
      else if (unmarked[0] || unmarked[1]) reason = 'marks one side only'
      let hits = 0
      for (const [meN, rvN] of nums) {
        keysTotal++
        if (reason) continue
        const meHits = sides[0]!.passages.filter((p) => p.article === meN)
        const rvHits = sides[1]!.passages.filter((p) => p.article === rvN)
        const hit = meHits.length > 0 && rvHits.length > 0
        if (hit) {
          hits++
          const v = [...meHits, ...rvHits].every((p) => p.via === 'own') ? 'own' : [...meHits, ...rvHits].every((p) => p.via === 'mark') ? 'mark' : 'mixed'
          viaCount.set(v, (viaCount.get(v) ?? 0) + 1)
          if (v !== 'own') markLabels.push(`${r.inr}/ME ${para} Art ${meN}|${rvN} (${v})`)
        } else keysNoBegruendung++
      }
      keysRecovered += hits
      if (!reason && hits === 0) reason = 'no key with a Begründung on both sides'
      const expected = [new Set(nums.map(([a]) => a)), new Set(nums.map(([, b]) => b))]
      const foreign = sides.some((sd, i) => sd.passages.some((p) => p.article !== null && !expected[i]!.has(p.article)))
      if (foreign) foreignMark++
      const paraOk = reason === null
      const label = `${r.inr}/ME ${para} [${[...arts].map((a) => `${meNumberFor(a) ?? '?'}|${rvNumberFor(a) ?? '?'}`).join(', ')}] ME:${sides[0]!.passages.map((p) => p.article ?? '–').join('/')} RV:${sides[1]!.passages.map((p) => p.article ?? '–').join('/')}`
      note(paraOk ? 'recovered' : reason!, label)
      if (foreign) foreignLabels.push(`${paraOk ? '(rückholbar) ' : ''}${label}`)
      if (show === r.inr) {
        console.log(`\n${label}`)
        for (const s of sides) for (const p of s.passages) console.log(`  ${s.name} [Art ${p.article ?? '–'} via ${p.via ?? '–'}] ${p.heading.slice(0, 140)}`)
      }
    }
    if (show === r.inr) console.log(`  ME ${meUrl}\n  RV ${rvUrl}\n  Einheiten-Artikel: ${[...new Set(units.map((u) => u.article))].map((a) => `${JSON.stringify(a?.slice(0, 60))} → ME ${a ? meNumberFor(a) : '–'} / RV ${a ? rvNumberFor(a) : '–'}`).join('\n    ')}`)
  })

  console.log(`\nGP ${gp} — Begründungsvergleich ME→RV und die mehrdeutigen Paragraphen`)
  console.log(`  Eimer 3–5: ${candidates.length} · Population (beide mit HTML-Erläuterungen): ${population.length}`)
  for (const [k, v] of notIn) console.log(`    nicht dabei: ${String(v).padStart(3)}  ${k}`)
  console.log(`  Entwürfe mit ≥ 1 verglichenem §: ${draftsCompared} · §§ verglichen: ${parasCompared}`)
  {
    const ns = potentialEntries.map((p) => p.n)
    const over = potentialEntries.filter((p) => p.n > 120).sort((a, b) => b.n - a.n)
    console.log(`  Einträge ohne Obergrenze je Entwurf: Median ${quantile(ns, 0.5)}, p90 ${quantile(ns, 0.9)}, p99 ${quantile(ns, 0.99)}, max ${Math.max(0, ...ns)}; über 120: ${over.map((p) => `${p.draft} (${p.n})`).join(', ') || 'keiner'}`)
  }
  console.log(`  Ausgeliefert (Artikel, §), seit 27.09.2026: +${shippedByArticle} Vergleiche je Artikel über ${shippedByArticleParas} vorher mehrdeutige §§ (je Entwurf gezählt) in ${draftsGained} Entwürfen${keyedMismatch.length ? ` — an der Obergrenze: ${keyedMismatch.join(', ')}` : ''}; vorher gezeigt und jetzt verloren: ${keyedLost.length ? keyedLost.join(', ') : 'keiner'}`)
  console.log(`  Entwürfe mit ≥ 1 mehrdeutigen §: ${draftsAmbiguous} · mehrdeutige §§: ${ambiguousTotal}, davon mit Begründung auf beiden Seiten: ${ambiguousBoth}`)
  console.log(`  Anteil mehrdeutig an (verglichen + mehrdeutig mit Begründung beidseits): ${ambiguousBoth} / ${parasCompared + ambiguousBoth} = ${pct(ambiguousBoth, parasCompared + ambiguousBoth)}`)
  console.log(`    davon nur scheinbar mehrdeutig — Artikel gar nicht gepaart, dieselbe Nummer unter ME- und RV-Titel: ${ambiguousUnpairedParas} §§ in ${[...ambiguousUnpaired].join(', ') || '–'}`)
  console.log(`  Rückholbar über (Artikel, §): ${(why.get('recovered') ?? []).length} von ${ambiguousBoth} §§`)
  console.log(`    Schlüssel (Artikel, §) dieser §§: ${keysTotal} · verglichen würden ${keysRecovered} · ohne Begründung unter diesem Artikel auf ≥ 1 Seite ${keysNoBegruendung} · blockiert ${keysTotal - keysRecovered - keysNoBegruendung}`)
  for (const w of ['no key with a Begründung on both sides', 'unit Artikel without number', 'multi-Artikel heading', 'no marks', 'marks one side only'] as const) {
    const labels = why.get(w) ?? []
    const drafts = new Set(labels.map((l) => l.split(' ')[0]))
    console.log(`    ${w.padEnd(40)} ${String(labels.length).padStart(3)} §§ in ${drafts.size} Entwürfen`)
  }
  console.log(`    davon Artikel aus der eigenen Überschrift ${viaCount.get('own') ?? 0} · aus einer Marke darüber ${viaCount.get('mark') ?? 0} · gemischt ${viaCount.get('mixed') ?? 0}`)
  console.log(`    über Marken: ${markLabels.slice(0, 12).join(', ')}${markLabels.length > 12 ? ' …' : ''}`)
  console.log(`  §§ mit einer Passage unter einer Artikelnummer, die keine ihrer Einheiten trägt: ${foreignMark}`)
  console.log(`  Blöcke der Form „Artikel N" ohne §, nach Word-Klasse: ${[...markClasses].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  console.log(`  Passagenliste der Kopie ≠ parseExplanationsHtml: ${unmatchedShape} Entwürfe`)
  console.log(`\n  [Passage unter fremder Artikelnummer]\n    ${foreignLabels.sort().join('\n    ')}`)
  for (const [w, labels] of why) console.log(`\n  [${w}]\n    ${labels.sort().join('\n    ')}`)
}

// Last, so every constant above is initialised before the pass reads it.
if (argFlag('reasoning')) await reasoningReport()
if (argFlag('pairs')) pairsReport()

/**
 * `--pairs` (27.09.2026): which rule of `pairArticles` made each pair, over
 * every draft that reached the diff. The question behind it is the number
 * fallback — an Artikel paired by its number because the titles did not
 * match (XXVI 76/ME: Notarversorgungsgesetz → GSVG after renumbering). A
 * number pair whose two titles share no word of a law name is printed in
 * full, to be read by eye.
 */
/** The §§ an article's Novellierungsanordnungen address, as a set. */
function addressesOf(units: readonly LawUnit[], article: string | null): Set<string> {
  const out = new Set<string>()
  for (const u of units) {
    if (u.article !== article) continue
    for (const para of addressedParagraphs(u.text)) out.add(para)
  }
  return out
}

/** How much of the smaller address set the other one carries; null when either side addresses nothing. */
function addressOverlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number | null {
  if (a.size === 0 || b.size === 0) return null
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let n = 0
  for (const x of small) if (large.has(x)) n++
  return n / small.size
}

function pairsReport(): void {
  const byVia = new Map<string, number>()
  const numberPairs: { alternative: string | null; draft: string; from: string; to: string; shared: number; fromUnits: number; toUnits: number; overlap: number | null; sizes: string }[] = []
  // Calibration: the overlap of pairs the TITLE made (right by construction
  // in all the cases read), and of a draft article against every Vorlage
  // article it is NOT paired with (a different law by construction).
  const titleOverlaps: number[] = []
  const strangerOverlaps: number[] = []
  const strangerBySize = new Map<string, { n: number; hit: number }>()
  for (const [inr, { fromUnits, toUnits }] of parsed) {
    const pairs = articlePairs(fromUnits, toUnits)
    const toArticles = [...new Set(toUnits.map((u) => u.article))]
    for (const p of pairs) {
      byVia.set(p.via, (byVia.get(p.via) ?? 0) + 1)
      if (p.via === 'addressed' || p.via === 'contained' || p.via === 'sameName' || p.via === 'shortTitle') console.log(`    ${p.via.padEnd(9)} ${inr}/ME  ${String(p.from).slice(0, 70)}  ⇒  ${String(p.to).slice(0, 70)}`)
      const a = addressesOf(fromUnits, p.from)
      if (p.via === 'title') {
        const o = addressOverlap(a, addressesOf(toUnits, p.to))
        if (o !== null) titleOverlaps.push(o)
        for (const other of toArticles) {
          if (other === p.to) continue
          const ob = addressesOf(toUnits, other)
          const so = addressOverlap(a, ob)
          if (so !== null) strangerOverlaps.push(so)
          if (so !== null) {
            const m = Math.min(a.size, ob.size)
            const k = m >= 3 ? '≥3' : m === 2 ? '2' : '1'
            const e = strangerBySize.get(k) ?? { n: 0, hit: 0 }
            e.n++
            if (so >= 0.8) e.hit++
            strangerBySize.set(k, e)
          }
        }
      }
      if (p.via !== 'number') continue
      const ta = articleNameTokens(p.from)
      const tb = articleNameTokens(p.to)
      const shared = [...ta].filter((t) => tb.has(t) && !/^\d+$/.test(t)).length
      const b2 = addressesOf(toUnits, p.to)
      // Where the number pair is doubtful: is the draft article's real partner
      // elsewhere in the Vorlage? The best §-overlap among all its articles.
      let alternative: string | null = null
      const own = addressOverlap(a, b2)
      if (own === null || own < 0.8) {
        const best = toArticles
          .filter((t) => t !== p.to)
          .map((t) => ({ t, o: addressOverlap(a, addressesOf(toUnits, t)), n: addressesOf(toUnits, t).size }))
          .filter((x) => x.o !== null)
          .sort((x, y) => y.o! - x.o!)[0]
        if (best) alternative = `${(best.o! * 100).toFixed(0)} % (${a.size}/${best.n}) ${String(best.t).slice(0, 60)}${pairs.some((q) => q.to === best.t) ? ' [schon gepaart]' : ''}`
      }
      numberPairs.push({
        alternative,
        overlap: addressOverlap(a, b2),
        sizes: `${a.size}/${b2.size}`,
        draft: `${inr}/ME`,
        from: p.from ?? '(ohne Titel)',
        to: p.to ?? '(ohne Titel)',
        shared,
        fromUnits: fromUnits.filter((u) => u.article === p.from).length,
        toUnits: toUnits.filter((u) => u.article === p.to).length,
      })
    }
  }
  console.log(`\nGP ${gp} — Artikelpaare je Regel (über ${parsed.size} verglichene Entwürfe)`)
  for (const [v, n] of [...byVia].sort((x, y) => y[1] - x[1])) console.log(`  ${v.padEnd(10)} ${n}`)
  const blind = numberPairs.filter((p) => p.shared === 0)
  console.log(`  davon nach Nummer: ${numberPairs.length}, ohne gemeinsames Wort im Gesetzesnamen: ${blind.length} in ${new Set(blind.map((p) => p.draft)).size} Entwürfen`)
  for (const p of numberPairs.sort((x, y) => x.shared - y.shared || x.draft.localeCompare(y.draft))) {
    const o = p.overlap === null ? '  –  ' : `${(p.overlap * 100).toFixed(0).padStart(3)} %`
    if (p.alternative) console.log(`        bester andere Partner nach §§: ${p.alternative}`)
    console.log(`    ${p.shared === 0 ? '✗' : '·'} ${p.draft.padEnd(7)} [${p.fromUnits}→${p.toUnits}] §-Überlappung ${o} (${p.sizes})  ${p.from.slice(0, 60)}  ⇒  ${p.to.slice(0, 60)}`)
  }
  const dist = (xs: number[]) => xs.length ? `n ${xs.length}, p10 ${(quantile(xs, 0.1) * 100).toFixed(0)} %, Median ${(quantile(xs, 0.5) * 100).toFixed(0)} %, p90 ${(quantile(xs, 0.9) * 100).toFixed(0)} %, max ${(Math.max(...xs) * 100).toFixed(0)} %` : 'n 0'
  console.log(`  Eichung §-Überlappung — nach Titel gepaart: ${dist(titleOverlaps)}`)
  console.log(`  Eichung §-Überlappung — fremde Artikel:     ${dist(strangerOverlaps)}; ≥ 50 %: ${strangerOverlaps.filter((x) => x >= 0.5).length}`)
  console.log(`  fremde Artikel mit ≥ 80 % nach kleinerer Menge: ${[...strangerBySize].sort().map(([k, v]) => `${k}: ${v.hit} von ${v.n}`).join(' · ')}`)
}
