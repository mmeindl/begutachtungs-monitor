/**
 * Does a Land's draft implement EU law, which act, and by when was it due?
 * — the measurement before step 2 of the EU feature (the Länder) is built
 * (04.11.2026). The Bund's measurement is `scripts/corpus/eu.ts`
 * (docs/architecture.md §12.66); this is the same question over every
 * Landesgesetz- and Verordnungsentwurf whose Begutachtung the monitor places
 * in the current Gesetzgebungsperiode's window.
 *
 * The Länder have no WFA tool, so the Bund's first source — the Vorblatt's
 * fixed sentence under „Verhältnis zu den Rechtsvorschriften der
 * Europäischen Union" — has no counterpart by construction. What a Land's
 * draft can say instead:
 *
 *  1. The ERLÄUTERUNGEN' general part, as the draft page reads it
 *     (`/api/laender/:land/:number/erlaeuterungen`): every heading is
 *     counted, those with an EU term listed verbatim, and the passages under
 *     them run through the Bund's classifiers (`classifyVorblattSentence`,
 *     `readExplanationsEuSignal`) to see whether those transfer.
 *  2. The LAW TEXT of the draft PDF, cut into blocks by the Länder's own
 *     reader (`lawBlocksFromPdfPages`) and read by the Bund's
 *     Umsetzungshinweis reader (`readUmsetzungshinweis`) — exactly the path a
 *     Land page would take.
 *  3. A VORBLATT where a Land writes one (Wien before its Erläuterungen,
 *     Burgenland as its general part): does it carry the Bund's heading
 *     (`vorblattEuSection`, `classifyVorblatt`)?
 *
 * Since step 2 (04.11.2026, docs/architecture.md §12.66, Nachtrag 2) the run
 * also takes THE PAGE'S OWN DECISION (phase C): the Erläuterungen read by the
 * page's reader from the cached PDFs (`readLandExplanations`, not the dev
 * server's stored answer, so a change of that reader shows here), then
 * `readLandEu` — the statement, the fact, the acts the page names and where
 * from — as `corpus:eu` applies `euMarker.ts` for the Bund (its section g).
 * Section 5 prints it per Land, with the acts gained from the quoted hint
 * Ziffern (c) and Oberösterreich's „Umsetzungshinweis:" entries (b), and
 * checks that no named law-text act stands outside the law text's part.
 * Sections 1–4 keep the measurement's own readings as diagnostics.
 *
 * Every act found is looked up in the EUR-Lex Cellar (`transpositionUrl`,
 * `parseTranspositionAnswer`) for its transposition dates, and a handful are
 * probed in RIS's consolidated Landesrecht (`Applikation=LrKons`), to know
 * whether rule D4 (`bundesrecht.ts`) generalises to the Länder.
 *
 * THE RULES ARE THE PRODUCT'S: every reading goes through
 * `server/utils/eu/` and `server/utils/laender/`; this file fetches, counts
 * and prints. Where a module misreads Land text the run shows it — the
 * module is not patched here.
 *
 *     pnpm corpus:eu-laender                       # every Land, GP XXVIII
 *     pnpm corpus:eu-laender -- --land ooe         # one Land
 *     pnpm corpus:eu-laender -- --show ooe-2024-16082
 *     pnpm corpus:eu-laender -- --out dir          # drafts.csv
 *     pnpm corpus:eu-laender -- --out dir --cached-only   # from .cache/eu-laender only, no request
 *
 * The list, the drafts and their Erläuterungen are read through a RUNNING
 * dev server (`--base`, default http://localhost:3011; start it with
 * `PORT=3011 pnpm dev --host localhost`). Only the first run needs it:
 * every server answer, every PDF (bytes, keyed by the URL's sha1), every
 * Cellar and RIS answer is kept under `.cache/eu-laender/` with the cost of
 * its first fetch beside it, so a second run makes no request and prints
 * the same stdout byte for byte (run-dependent counts go to stderr).
 * Concurrency: 4 against the dev server, 2 PDFs in flight overall (Tirol's
 * and Steiermark's through their paced sessions, `landPdfBytes`), 2 against
 * the Cellar.
 *
 * Runs with `-c vitest.config.ts`: `texts/read.ts` imports `#shared`.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LaenderResponse, LandCode, LandConsultation, LandDocument, LandDraftDetail, LandExplanationsResponse } from '../../shared/types'
import { LAND_CODES } from '../../shared/utils/laender'
import { withPdf } from '../../server/utils/text/pdfDocument'
import { fromMacRoman } from '../../server/utils/annex/annexPdfPages'
import { draftCandidates, landPdfBytes } from '../../server/utils/laender/texts/read'
import { lawBlocksFromPdfPages } from '../../server/utils/laender/draftPdfLaw'
import { baseActCelexes, readEuActCitations, uniqueActs, type EuAct } from '../../server/utils/eu/actCitations'
import { EU_ANCHOR, readExplanationsEuSignal, readUmsetzungshinweis, type LawSignal } from '../../server/utils/eu/umsetzungshinweis'
import { EU_HEADING, VORBLATT_CLASS_RANK, VORBLATT_EU_YES, classifyVorblatt, classifyVorblattSentence, linesOfPages, type VorblattClass } from '../../server/utils/eu/vorblatt'
import { deadlineOf, parseTranspositionAnswer, transpositionUrl, type SparqlAnswer, type TranspositionDates } from '../../server/utils/eu/cellar'
import { bundesrechtHits, bundesrechtPhrase, transposesAct, type BrKonsSearchAnswer } from '../../server/utils/eu/bundesrecht'
import { readLandEu, type LandEuReading } from '../../server/utils/eu/landEuReading'
import { landLawPart } from '../../server/utils/eu/landGesetzestext'
import { readLandExplanations } from '../../server/utils/laender/landExplanationsRead'
import { safeExternalUrl } from '../../shared/utils/safeExternalUrl'
import { getJson, getText, type HttpOptions } from '../lib/http'
import { pool } from '../lib/async'
import { argFlag, argPair } from '../lib/args'
import { quantile } from '../lib/fmt'

const SCRIPT = 'corpus/eu-laender'
const CACHE = join('.cache', 'eu-laender')
const GP = 'XXVIII'
const WINDOW_START = '2024-10-24'
const SERVER_CONCURRENCY = 4
const PDF_CONCURRENCY = 2
const CELLAR_CONCURRENCY = 2

const base = argPair('base') ?? 'http://localhost:3011'
const show = argPair('show')
const onlyLand = argPair('land')
const outDir = argPair('out')
/** Read only what is cached: no dev server, no upstream — a missing answer is an error row. */
const cachedOnly = argFlag('cached-only')

if (onlyLand && !(LAND_CODES as readonly string[]).includes(onlyLand)) {
  console.error(`Usage: pnpm corpus:eu-laender -- [--cached-only] [--land ${LAND_CODES.join('|')}] [--show <land>-<number>] [--out dir] [--base http://localhost:3011]`)
  process.exit(1)
}

/** The Cellar exactly as `scripts/corpus/eu.ts` asks it. */
const CELLAR_FETCH: HttpOptions = {
  script: SCRIPT,
  attempts: 3,
  backoffMs: (retry) => 1_000 * retry,
  retryOnHttpError: true,
  timeoutMs: 20_000,
  accept: 'application/sparql-results+json',
}
const RIS_FETCH: HttpOptions = { script: SCRIPT, attempts: 3, backoffMs: (retry) => 500 * retry, retryOnHttpError: true, timeoutMs: 45_000 }

for (const dir of ['server', 'docs', 'cellar', 'lrkons']) await mkdir(join(CACHE, dir), { recursive: true })

// ---------------------------------------------------------------------------
// Fetching, cached, with the first fetch's cost kept beside each answer
// ---------------------------------------------------------------------------

interface FetchCost {
  bytes: number
  ms: number
}
type CostClass = 'server-list' | 'server-detail' | 'server-erl' | 'pdf' | 'cellar' | 'lrkons'

const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex')
/** Requests this run made — stderr only, so stdout stays identical between runs. */
const requestsThisRun = new Map<CostClass, number>()
const costs: { cls: CostClass; cost: FetchCost }[] = []

async function readCostFile(file: string): Promise<FetchCost> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as FetchCost
  } catch {
    return { bytes: 0, ms: 0 }
  }
}

/** A JSON answer, cached under `dir/key.json`, its cost under `dir/key.cost.json`. A failure is not cached. */
async function cachedFetchJson<T>(cls: CostClass, dir: string, key: string, load: () => Promise<{ data: T; bytes: number }>): Promise<T> {
  const file = join(CACHE, dir, `${key}.json`)
  const costFile = join(CACHE, dir, `${key}.cost.json`)
  try {
    const data = JSON.parse(await readFile(file, 'utf8')) as T
    costs.push({ cls, cost: await readCostFile(costFile) })
    return data
  } catch {
    if (cachedOnly) throw new Error(`nicht im Cache (${cls})`)
    const started = Date.now()
    requestsThisRun.set(cls, (requestsThisRun.get(cls) ?? 0) + 1)
    const { data, bytes } = await load()
    const cost = { bytes, ms: Date.now() - started }
    await writeFile(file, JSON.stringify(data))
    await writeFile(costFile, JSON.stringify(cost))
    costs.push({ cls, cost })
    return data
  }
}

/** The dev server: plain `fetch` to localhost (the upstream client admits only the upstream hosts). */
async function serverJson<T>(cls: CostClass, path: string): Promise<T> {
  return cachedFetchJson<T>(cls, 'server', sha1(path), async () => {
    // The guard holds a Land's draft routes to 30 a minute
    // (`RATE_RULES.landDraft`): a 429 is waited out as its Retry-After says.
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(600_000) })
      const text = await res.text()
      if (res.status === 429 && attempt < 60) {
        await new Promise((r) => setTimeout(r, 1_000 * Math.max(1, Number(res.headers.get('retry-after')) || 5)))
        continue
      }
      if (!res.ok) throw new Error(`${res.status} ${path}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`)
      return { data: JSON.parse(text) as T, bytes: Buffer.byteLength(text) }
    }
  })
}

/** A Land's PDF as bytes, through the door the server reads it through (`landPdfBytes`), cached by the URL's sha1. */
async function pdfBytes(url: string): Promise<Uint8Array> {
  const key = sha1(url)
  const file = join(CACHE, 'docs', `${key}.pdf`)
  try {
    const bytes = new Uint8Array(await readFile(file))
    costs.push({ cls: 'pdf', cost: await readCostFile(join(CACHE, 'docs', `${key}.json`)) })
    return bytes
  } catch {
    if (cachedOnly) throw new Error('nicht im Cache (pdf)')
    const started = Date.now()
    requestsThisRun.set('pdf', (requestsThisRun.get('pdf') ?? 0) + 1)
    const bytes = await landPdfBytes(url)
    const cost = { bytes: bytes.byteLength, ms: Date.now() - started }
    await writeFile(file, bytes)
    await writeFile(join(CACHE, 'docs', `${key}.json`), JSON.stringify(cost))
    costs.push({ cls: 'pdf', cost })
    return bytes
  }
}

/**
 * The PDF's text per page — `texts/read.ts`'s `pdfPages` over cached bytes:
 * the same `withPdf` + unpdf extraction and the same Mac-Roman repair rule
 * (`repairMacRoman` there is private; restated here, unchanged, because
 * `pdfPages` fetches the bytes itself and could not be cached).
 */
let macRomanRepaired = 0
async function pagesOf(bytes: Uint8Array): Promise<string[]> {
  const { extractText } = await import('unpdf')
  const { text } = await withPdf(bytes.slice(), (doc) => extractText(doc, { mergePages: false }), { verbosity: 0 })
  const pages = Array.isArray(text) ? text : [text]
  const all = pages.join('')
  const misread = (all.match(/[¸‰ˆ]/g) ?? []).length
  const real = (all.match(/[äöüÄÖÜ§]/g) ?? []).length
  const paraSigns = (all.match(/ß\s*\d/g) ?? []).length
  const realParas = (all.match(/§/g) ?? []).length
  const byParas = paraSigns >= 10 && paraSigns >= 5 * realParas
  if (!byParas && (misread < 20 || misread < 20 * real)) return pages
  macRomanRepaired++
  return pages.map((page) => page.split('\n').map(fromMacRoman).join('\n'))
}

// ---------------------------------------------------------------------------
// The population: the list, retried for a Land that does not answer
// ---------------------------------------------------------------------------

const listPath = `/api/laender?gp=${GP}&status=all`
let list = await serverJson<LaenderResponse>('server-list', listPath)
const unreadable = () => list.sources.filter((s) => s.state !== 'ok').map((s) => s.land)
for (let attempt = 1; attempt <= 3 && unreadable().length; attempt++) {
  // Only on a first run — a cached list is the population as measured.
  if (!requestsThisRun.get('server-list')) break
  process.stderr.write(`Not readable: ${unreadable().join(', ')} — retry ${attempt} in 60 s\n`)
  await new Promise((r) => setTimeout(r, 60_000))
  const res = await fetch(`${base}${listPath}`, { signal: AbortSignal.timeout(600_000) })
  requestsThisRun.set('server-list', (requestsThisRun.get('server-list') ?? 0) + 1)
  if (!res.ok) continue
  const again = (await res.json()) as LaenderResponse
  const now = new Set(again.sources.filter((s) => s.state === 'ok').map((s) => s.land))
  const gained = unreadable().filter((l) => now.has(l))
  if (!gained.length) continue
  list = {
    ...list,
    items: [...list.items, ...again.items.filter((i) => gained.includes(i.land))],
    sources: list.sources.map((s) => (gained.includes(s.land) ? again.sources.find((x) => x.land === s.land)! : s)),
  }
  await writeFile(join(CACHE, 'server', `${sha1(listPath)}.json`), JSON.stringify(list))
}

let items = list.items.filter((i) => !onlyLand || i.land === onlyLand)
if (show) items = items.filter((i) => i.id === show)
items = [...items].sort((a, b) => a.id.localeCompare(b.id))

console.log(`# EU-Recht in den Begutachtungen der Länder — ${GP} (Fenster ab ${WINDOW_START})`)
console.log(`\nSources as the list answered:`)
for (const s of list.sources) console.log(`  ${s.land.padEnd(5)} ${s.state}`)
console.log(`drafts read in this run: ${items.length}`)

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

/** Acts named inside another act's title, dropped over the whole run. */
let titleReferencesDropped = 0
function actsIn(text: string, implemented = true): EuAct[] {
  const read = readEuActCitations(text, { implemented })
  titleReferencesDropped += read.titleReferencesDropped
  return read.acts
}

/** A heading that names Europe: the terms the brief lists. */
const EU_TERM = /Union|\bEU\b|EU-|Europ|Gemeinschaftsrecht|Richtlinie|Verordnung\s*\((?:EU|EG)\)/i

/** „3.", „III.", „c)", „A.", „1.2." — a heading's numbering, stripped. */
function normaliseHeading(h: string): string {
  return h
    .trim()
    .replace(/^(?:(?:[IVXLC]+|\d+(?:\.\d+)*|[A-Za-z])[.)]\s*)+/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*:$/, '')
    .toLowerCase()
}

const ABBREVIATIONS = /\b(Abs|Nr|Art|lit|Z|ABl|bzw|vgl|idF|zB|ua|S|iVm|gem|Pkt|Kap|Anh|Bgld|Oö|Stmk|NÖ|Ktn|Sbg|Vbg|LGBl|BGBl|ca|bspw|insb|u\.a|d\.h|z\.B)\./g

/** The sentences of a passage — abbreviations protected so „Abs. 1" does not end one. */
function sentencesOf(text: string): string[] {
  const protectedText = text.replace(/\s+/g, ' ').replace(ABBREVIATIONS, '$1\uE000')
  return protectedText
    .split(/(?<=[.;!?])\s+(?=[„"A-ZÄÖÜ])/)
    .map((s) => s.replace(/\uE000/g, '.').trim())
    .filter((s) => s.length > 3)
}

/** A sentence's form: act citations, OJ references and numbers as placeholders. */
function sentenceForm(sentence: string): string {
  let s = sentence
  for (const a of readEuActCitations(sentence).occurrences.map((o) => o.act.raw).sort((x, y) => y.length - x.length)) s = s.split(a).join('<AKT>')
  return s
    .replace(/ABl\.\s*(?:Nr\.\s*)?[LC]\s*[\d/]+[^,;)]*?S\.\s*\d+/g, '<ABl>')
    .replace(/\d+(?:[./]\d+)*/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
}

interface ErlRead {
  available: boolean
  reason: string | null
  error: string | null
  labelled: boolean
  /** Every general-part heading, as printed. */
  headings: string[]
  /** The EU headings, as printed. */
  euHeadings: string[]
  /** The text under the EU headings. */
  euPassages: { heading: string; text: string }[]
  /** `classifyVorblattSentence` over each EU passage, strongest first. */
  headingClasses: VorblattClass[]
  /** No EU heading, but a general passage carries `EU_ANCHOR`. */
  freeProse: boolean
  freeProseText: string[]
  /** `readExplanationsEuSignal` over the general part. */
  signal: 'umsetzung' | 'durchfuehrung' | null
  signalParagraphs: string[]
  unanchored: number
  /** Acts in the signal paragraphs. */
  signalActs: EuAct[]
  /** Acts anywhere in the Erläuterungen, general and particular. */
  actsAll: EuAct[]
}

function readErl(erl: LandExplanationsResponse | null, error: string | null): ErlRead {
  const empty: ErlRead = { available: false, reason: erl?.unavailableReason ?? null, error, labelled: false, headings: [], euHeadings: [], euPassages: [], headingClasses: [], freeProse: false, freeProseText: [], signal: null, signalParagraphs: [], unanchored: 0, signalActs: [], actsAll: [] }
  if (!erl || !erl.available) return empty
  const general = erl.general
  const headings = general.map((g) => g.heading).filter((h): h is string => Boolean(h && h.trim()))
  const euPassages = general.filter((g) => g.heading && EU_TERM.test(g.heading)).map((g) => ({ heading: g.heading!, text: g.text.join(' ').replace(/\s+/g, ' ').trim() }))
  const headingClasses = euPassages
    .map((p) => classifyVorblattSentence(p.text))
    .sort((a, b) => VORBLATT_CLASS_RANK.indexOf(a) - VORBLATT_CLASS_RANK.indexOf(b))
  const freeProseText = euPassages.length ? [] : general.flatMap((g) => g.text).filter((t) => EU_ANCHOR.test(t)).map((t) => t.replace(/\s+/g, ' ').trim())
  const sig = readExplanationsEuSignal(general)
  return {
    available: true,
    reason: null,
    error: null,
    labelled: erl.labelled,
    headings,
    euHeadings: euPassages.map((p) => p.heading),
    euPassages,
    headingClasses,
    freeProse: freeProseText.length > 0,
    freeProseText,
    signal: sig.signal,
    signalParagraphs: sig.paragraphs,
    unanchored: sig.unanchored,
    signalActs: uniqueActs(sig.paragraphs.map((p) => actsIn(p))),
    actsAll: uniqueActs([...general.flatMap((g) => [g.heading ?? '', ...g.text]), ...erl.particular.flatMap((p) => [p.heading, ...p.text])].map((t) => actsIn(t))),
  }
}

interface LawRead {
  /** The draft document taken (`draftCandidates`), or null. */
  doc: LandDocument | null
  candidates: number
  pdfRead: boolean
  error: string | null
  /** `lawBlocksFromPdfPages` found an enacting clause. */
  blocks: number | null
  signal: LawSignal | null
  windows: string[]
  acts: EuAct[]
  /** Acts named only as the base of an amending act (D4a). */
  baseActs: string[]
  dropped: string[]
  /** Acts cited anywhere in the blocks. */
  cited: number
  /** Diagnostic: the same reader over the whole PDF as plain text (law, Erläuterungen, everything). */
  plainSignal: LawSignal | null
  plainWindows: string[]
  plainActs: EuAct[]
}

interface VorblattRead {
  /** Documents read for a Vorblatt, and how many have one. */
  docsRead: number
  withVorblatt: number
  /** The Bund's heading anywhere in the document. */
  withEuHeading: number
  sentences: string[]
  classes: VorblattClass[]
  /** Lines of a Vorblatt region that name Europe (a Land's own EU heading). */
  euLines: string[]
}

interface Row {
  item: LandConsultation
  detail: LandDraftDetail['draft'] | null
  date: string | null
  erl: ErlRead
  law: LawRead
  vorblatt: VorblattRead
  error: string | null
}

const blockText = (b: { gld: string | null; text: string }) => [b.gld, b.text].filter(Boolean).join(' ')

function readLawPages(pages: string[]): Omit<LawRead, 'doc' | 'candidates' | 'pdfRead' | 'error'> {
  const blocks = lawBlocksFromPdfPages(pages)
  const plain = readUmsetzungshinweis(pages.join('\n'))
  const plainPart = { plainSignal: plain.signal, plainWindows: plain.windows.map((w) => w.text), plainActs: plain.acts }
  if (!blocks) return { blocks: null, signal: null, windows: [], acts: [], baseActs: [], dropped: [], cited: 0, ...plainPart }
  const read = readUmsetzungshinweis(blocks)
  const base = new Set<string>()
  for (const w of read.windows) for (const c of baseActCelexes(w.text)) base.add(c)
  return {
    blocks: blocks.length,
    signal: read.signal,
    windows: read.windows.map((w) => w.text),
    acts: read.acts,
    baseActs: [...base],
    dropped: read.dropped,
    cited: actsIn(blocks.map(blockText).join(' '), false).length,
    ...plainPart,
  }
}

const VORBLATT_LINE = /^(?:Vorblatt|VORBLATT|V O R B L A T T)\b/
const VORBLATT_END = /^(?:Erläuterungen|ERLÄUTERUNGEN|Erläuternde Bemerkungen|Textgegenüberstellung|TEXTGEGENÜBERSTELLUNG)\b/

function readVorblattPages(pagesByDoc: string[][]): VorblattRead {
  const out: VorblattRead = { docsRead: pagesByDoc.length, withVorblatt: 0, withEuHeading: 0, sentences: [], classes: [], euLines: [] }
  for (const pages of pagesByDoc) {
    const lines = linesOfPages(pages).map((l) => l.replace(/\s+/g, ' ').trim())
    const at = lines.findIndex((l) => VORBLATT_LINE.test(l))
    if (at >= 0) {
      out.withVorblatt++
      const end = lines.findIndex((l, i) => i > at && VORBLATT_END.test(l))
      const region = lines.slice(at, end > at ? end : at + 200)
      out.euLines.push(...region.filter((l) => l.length <= 140 && EU_TERM.test(l)))
    }
    if (EU_HEADING.test(lines.join('\n'))) {
      out.withEuHeading++
      const { sentence, cls } = classifyVorblatt(lines)
      if (sentence !== null && cls !== null) {
        out.sentences.push(sentence)
        out.classes.push(cls)
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Phase A: the dev server — detail and Erläuterungen of every draft
// ---------------------------------------------------------------------------

const numberOf = (id: string) => id.slice(id.indexOf('-') + 1)
const started = Date.now()

const serverReads = await pool(
  items,
  SERVER_CONCURRENCY,
  async (item) => {
    const path = `/api/laender/${item.land}/${encodeURIComponent(numberOf(item.id))}`
    let detail: LandDraftDetail | null = null
    let erl: LandExplanationsResponse | null = null
    let error: string | null = null
    try {
      detail = await serverJson<LandDraftDetail>('server-detail', path)
    } catch (err) {
      error = `detail: ${String(err).slice(0, 200)}`
    }
    try {
      erl = await serverJson<LandExplanationsResponse>('server-erl', `${path}/erlaeuterungen`)
    } catch (err) {
      error = `${error ? `${error}; ` : ''}erl: ${String(err).slice(0, 200)}`
    }
    return { item, detail, erl, error }
  },
  (done, total) => process.stderr.write(`\rServer: ${done}/${total}`),
)
process.stderr.write('\n')

// ---------------------------------------------------------------------------
// Phase B: the PDFs — the draft's text, and every document that may hold a Vorblatt
// ---------------------------------------------------------------------------

const rows: Row[] = await pool(
  serverReads,
  PDF_CONCURRENCY,
  async ({ item, detail, erl, error }): Promise<Row> => {
    const draft = detail?.draft ?? null
    const docs = draft?.documents.length ? draft.documents : item.documents
    const candidates = draftCandidates(docs)
    const doc = candidates[0] ?? null
    const law: LawRead = { doc, candidates: candidates.length, pdfRead: false, error: null, blocks: null, signal: null, windows: [], acts: [], baseActs: [], dropped: [], cited: 0, plainSignal: null, plainWindows: [], plainActs: [] }
    const vorblattDocs: string[][] = []
    const urls = [...new Set([doc?.url, docs.find((d) => /erläuter/i.test(d.title))?.url, ...docs.filter((d) => /vorblatt/i.test(d.title)).map((d) => d.url)].filter((u): u is string => Boolean(u)))]
    for (const url of urls) {
      try {
        const pages = await pagesOf(await pdfBytes(url))
        vorblattDocs.push(pages)
        if (url === doc?.url) {
          Object.assign(law, readLawPages(pages), { pdfRead: true })
        }
      } catch (err) {
        if (url === doc?.url) law.error = String(err).slice(0, 200)
      }
    }
    return {
      item,
      detail: draft,
      date: draft?.startedAt ?? item.startedAt ?? draft?.placedAt ?? item.placedAt ?? null,
      erl: readErl(erl, error),
      law,
      vorblatt: readVorblattPages(vorblattDocs),
      error,
    }
  },
  (done, total) => process.stderr.write(`\rPDFs: ${done}/${total}`),
)
process.stderr.write('\n')
const readSeconds = (Date.now() - started) / 1000

// ---------------------------------------------------------------------------
// Phase C: the page's own reading (`landEuReading.ts`), over what the page reads
// ---------------------------------------------------------------------------

/**
 * What the draft page decides, short of EUR-Lex and the law in force: the
 * Erläuterungen read by the page's reader (`readLandExplanations`) from the
 * cached PDFs — not the dev server's stored answer, so a change of that
 * reader shows here —, then `readLandEu`. `lawPart` is the law text's
 * part, for the prose check.
 */
interface PageRead {
  reading: LandEuReading
  lawPart: string | null
}
const pageReads = new Map<string, PageRead | string>()
await pool(
  rows,
  PDF_CONCURRENCY,
  async (r) => {
    const documents = r.detail?.documents.length ? r.detail.documents : r.item.documents
    try {
      const read = await readLandExplanations(r.item.land, { draft: { title: r.detail?.title ?? r.item.title, documents } }, pdfBytes)
      let draftPages = read.draftUrl ? read.pages.get(read.draftUrl) ?? null : null
      if (read.draftUrl && !draftPages && !read.draftFailed) draftPages = await pagesOf(await pdfBytes(read.draftUrl))
      const erl = read.response
      const reading = readLandEu({
        land: r.item.land,
        documents: documents.map((d) => ({ title: d.title, url: safeExternalUrl(d.url) ?? d.url })),
        pages: read.pages,
        explanations: { available: erl.available, general: erl.general, particular: erl.particular, url: erl.document?.url ?? null },
        draft: { url: read.draftUrl, pages: draftPages },
      })
      pageReads.set(r.item.id, { reading, lawPart: draftPages ? landLawPart(draftPages)?.join(' ').replace(/\s+/g, ' ') ?? null : null })
    } catch (err) {
      pageReads.set(r.item.id, String(err).slice(0, 160))
    }
  },
  (done, total) => process.stderr.write(`\rPage: ${done}/${total}`),
)
process.stderr.write('\n')
const pageOf = (r: Row): PageRead | null => {
  const p = pageReads.get(r.item.id)
  return p && typeof p !== 'string' ? p : null
}

// ---------------------------------------------------------------------------
// --show: everything read from one draft
// ---------------------------------------------------------------------------

const q = (s: string, n = 600) => `„${s.length > n ? `${s.slice(0, n)} …` : s}"`
if (show) {
  for (const r of rows) {
    console.log(`\n## ${r.item.id} — ${r.item.kind}`)
    console.log(`  ${r.item.title}`)
    console.log(`  Beginn ${r.date ?? '—'} · Frist ${r.item.deadline ?? '—'}${r.error ? ` · FEHLER ${r.error}` : ''}`)
    console.log(`  Dokumente: ${(r.detail?.documents ?? r.item.documents).map((d) => d.title).join(' | ') || '—'}`)
    console.log(`\n  Erläuterungen: ${r.erl.available ? `lesbar (${r.erl.labelled ? 'Allg. Teil benannt' : 'Allg. Teil erschlossen'})` : `nicht lesbar — ${r.erl.reason ?? r.erl.error ?? '?'}`}`)
    for (const h of r.erl.headings) console.log(`    Überschrift: ${h}${EU_TERM.test(h) ? '   ← EU' : ''}`)
    for (const p of r.erl.euPassages) console.log(`    EU-Abschnitt „${p.heading}" → ${classifyVorblattSentence(p.text)}\n      ${q(p.text)}`)
    for (const t of r.erl.freeProseText) console.log(`    Freitext mit EU-Anker: ${q(t, 400)}`)
    console.log(`    Signal ${r.erl.signal ?? '—'} · ohne Anker verworfen ${r.erl.unanchored}`)
    for (const p of r.erl.signalParagraphs) console.log(`      ${q(p, 400)}`)
    console.log(`    Akte (Signal): ${r.erl.signalActs.map((a) => a.celex).join(' ') || '—'} · Akte (überall): ${r.erl.actsAll.map((a) => a.celex).join(' ') || '—'}`)
    console.log(`\n  Gesetzestext: ${r.law.doc ? `„${r.law.doc.title}" (${r.law.candidates} Kandidaten)` : 'kein Entwurfsdokument'} · ${r.law.pdfRead ? `${r.law.blocks ?? 'keine Promulgationsklausel —'} Blöcke` : `nicht gelesen ${r.law.error ?? ''}`}`)
    console.log(`    Signal ${r.law.signal ?? '—'} · zitiert ${r.law.cited} · Basisakte ${r.law.baseActs.join(' ') || '—'}`)
    for (const w of r.law.windows) console.log(`      ${q(w)}`)
    for (const w of r.law.dropped) console.log(`      verworfen (ohne EU-Anker): ${q(w, 300)}`)
    console.log(`    Akte: ${r.law.acts.map((a) => `${a.raw} → ${a.celex}`).join(' · ') || '—'}`)
    console.log(`    Ganzes PDF als Klartext: Signal ${r.law.plainSignal ?? '—'} · Akte ${r.law.plainActs.map((a) => a.celex).join(' ') || '—'}`)
    for (const w of r.law.plainWindows) console.log(`      ${q(w, 400)}`)
    console.log(`\n  Vorblatt: ${r.vorblatt.docsRead} Dokumente gelesen, ${r.vorblatt.withVorblatt} mit „Vorblatt", ${r.vorblatt.withEuHeading} mit der Bundesüberschrift`)
    for (const l of r.vorblatt.euLines) console.log(`    EU-Zeile im Vorblatt: ${l}`)
    for (const [i, s] of r.vorblatt.sentences.entries()) console.log(`    ${r.vorblatt.classes[i]} ${q(s)}`)
    // The page's reading (`readLandEu`), every text in full: what the draft page decides and names.
    const raw = pageReads.get(r.item.id)
    if (typeof raw === 'string' || !raw) {
      console.log(`\n  Seite: nicht gelesen ${raw ?? ''}`)
      continue
    }
    const p = raw.reading
    console.log(`\n  Seite: ${p.decision.marker ?? 'kein Fakt'} · Quelle ${p.decision.source ?? '—'} · Akte aus ${p.actsSource ?? '—'}${p.decision.contradicting ? ' · widersprüchlich' : ''}`)
    if (p.found) console.log(`    Aussage (${p.found.label}, ${p.found.statement.road}, ${p.found.statement.cls}): ${q(p.found.statement.sentence, 100_000)}`)
    console.log(`    Gesetzestext: ${p.law.read ? 'gelesen' : 'nicht gelesen'} · Signal ${p.law.signal ?? '—'} · Akt-Signal ${p.law.actSignal ?? '—'}`)
    for (const w of p.law.windows) console.log(`      Fenster ${w.signal} [${w.acts.map((a) => a.celex).join(' ') || '—'}]: ${q(w.text, 100_000)}`)
    for (const h of p.law.quoted) console.log(`      zitierte Ziffer [${h.acts.map((a) => a.celex).join(' ')}]: ${q(h.text, 100_000)}`)
    for (const h of p.hinweise) console.log(`      OÖ-Hinweis [${h.acts.map((a) => a.celex).join(' ')}]: ${q(h.text, 100_000)}`)
    console.log(`    Akte der Seite: ${p.named.map((a) => `${a.label} (${a.celex})`).join(' · ') || '—'}`)
  }
  process.exit(0)
}

// ---------------------------------------------------------------------------
// The Cellar: every act named in the law text or the Erläuterungen
// ---------------------------------------------------------------------------

const allActs = uniqueActs(rows.flatMap((r) => [r.law.acts, r.erl.signalActs, r.erl.actsAll]))
const answers = new Map<string, TranspositionDates>()
const notAsked = new Set<string>()
await pool(
  allActs,
  CELLAR_CONCURRENCY,
  async (act) => {
    try {
      const raw = await cachedFetchJson<SparqlAnswer>('cellar', 'cellar', act.celex, async () => {
        const data = await getJson<SparqlAnswer>(transpositionUrl(act.celex), CELLAR_FETCH)
        return { data, bytes: Buffer.byteLength(JSON.stringify(data)) }
      })
      answers.set(act.celex, parseTranspositionAnswer(raw))
    } catch {
      notAsked.add(act.celex)
    }
  },
  (done, total) => process.stderr.write(`\rCellar: ${done}/${total}`),
)
process.stderr.write('\n')

// ---------------------------------------------------------------------------
// Derived per draft
// ---------------------------------------------------------------------------

const LANDS = LAND_CODES.filter((l) => !onlyLand || l === onlyLand)
const pad = (s: string | number, n: number) => String(s).padStart(n)
const pctOf = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)} %` : '—')
const share = (n: number, of: number) => `${pad(n, 4)} ${pad(pctOf(n, of), 7)}`
const byLand = (land: LandCode) => rows.filter((r) => r.item.land === land)
const days = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

/** The Erläuterungen say EU: an EU heading whose passage classifies as a yes, or the general part's signal. */
const erlSaysEu = (r: Row) => r.erl.headingClasses.some((c) => VORBLATT_EU_YES.has(c)) || r.erl.signal !== null
const lawNamesAct = (r: Row) => r.law.acts.length > 0
/** A heading class for the CSV: the strongest one, or a marker for the cases without. */
const headingClass = (r: Row) => (!r.erl.available ? '' : r.erl.headingClasses[0] ?? (r.erl.freeProse ? 'nur-freitext' : 'keine'))

/** The acts whose deadline counts: the law text's, base acts out (D4a); else the Erläuterungen signal's. */
function deadlineActs(r: Row): { acts: EuAct[]; source: 'gesetz' | 'erl' | null } {
  const law = r.law.acts.filter((a) => !r.law.baseActs.includes(a.celex) || r.law.acts.every((b) => r.law.baseActs.includes(b.celex)))
  if (law.length) return { acts: law, source: 'gesetz' }
  if (r.erl.signalActs.length) return { acts: r.erl.signalActs, source: 'erl' }
  return { acts: [], source: null }
}

/** Per directive the page's deadline (D3: the latest Cellar date). */
function directiveDeadlines(acts: EuAct[]): { celex: string; deadline: string; first: string }[] {
  return acts
    .filter((a) => a.kind === 'richtlinie')
    .map((a) => {
      const dates = answers.get(a.celex)?.dates ?? []
      const d = deadlineOf(dates)
      return d ? { celex: a.celex, deadline: d.deadline, first: dates[0]! } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}

interface Order {
  latest: string
  first: string
  /** Beginn − latest deadline, days. */
  gapLatest: number
  gapFirst: number
  verdict: 'vor-allen' | 'nach-allen' | 'dazwischen'
}
function orderOf(r: Row): Order | null {
  const dl = directiveDeadlines(deadlineActs(r).acts)
  if (!dl.length || !r.date) return null
  const latest = dl.map((d) => d.deadline).sort().at(-1)!
  const first = dl.map((d) => d.deadline).sort()[0]!
  const verdict = r.date > latest ? 'nach-allen' : r.date <= first ? 'vor-allen' : 'dazwischen'
  return { latest, first, gapLatest: days(latest, r.date), gapFirst: days(first, r.date), verdict }
}

// ---------------------------------------------------------------------------
// 1. Population
// ---------------------------------------------------------------------------

console.log(`\n## 1. Population`)
console.log(`  Land   all  gesetz  verord.  Erl. lesbar        Entwurfsdokument  PDF gelesen  Promulg.klausel (Blöcke)  Beginn vor ${WINDOW_START}  ohne Beginn`)
for (const land of LANDS) {
  const rs = byLand(land)
  const n = rs.length
  console.log(`  ${land.padEnd(5)} ${pad(n, 4)} ${pad(rs.filter((r) => r.item.kind === 'gesetz').length, 7)} ${pad(rs.filter((r) => r.item.kind === 'verordnung').length, 8)}  ${share(rs.filter((r) => r.erl.available).length, n)}  ${share(rs.filter((r) => r.law.doc).length, n)}  ${share(rs.filter((r) => r.law.pdfRead).length, n)}  ${share(rs.filter((r) => r.law.blocks !== null).length, n)}   ${pad(rs.filter((r) => r.date && r.date < WINDOW_START).length, 4)}   ${pad(rs.filter((r) => !r.date).length, 4)}`)
}
const n = rows.length
console.log(`  all   ${pad(n, 4)} ${pad(rows.filter((r) => r.item.kind === 'gesetz').length, 7)} ${pad(rows.filter((r) => r.item.kind === 'verordnung').length, 8)}  ${share(rows.filter((r) => r.erl.available).length, n)}  ${share(rows.filter((r) => r.law.doc).length, n)}  ${share(rows.filter((r) => r.law.pdfRead).length, n)}  ${share(rows.filter((r) => r.law.blocks !== null).length, n)}`)
console.log(`\n  Why the Erläuterungen are not readable:`)
const reasons = new Map<string, number>()
for (const r of rows.filter((x) => !x.erl.available)) {
  const k = `${r.item.land.padEnd(5)} ${(r.erl.reason ?? r.erl.error ?? '?').slice(0, 110)}`
  reasons.set(k, (reasons.get(k) ?? 0) + 1)
}
for (const [k, v] of [...reasons].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`    ${pad(v, 4)}  ${k}`)
console.log(`  Mac-Roman text layers repaired: ${macRomanRepaired}`)

// ---------------------------------------------------------------------------
// 2. The EU heading in the Erläuterungen
// ---------------------------------------------------------------------------

console.log(`\n## 2. The EU heading in the Erläuterungen (general part)`)
console.log(`  Land  Erl.  mit EU-Überschrift   nur Freitext mit EU-Anker   Signal (readExplanationsEuSignal) umsetzung / durchf.`)
for (const land of LANDS) {
  const rs = byLand(land).filter((r) => r.erl.available)
  const k = rs.length
  console.log(`  ${land.padEnd(5)} ${pad(k, 4)}  ${share(rs.filter((r) => r.erl.euHeadings.length).length, k)}         ${share(rs.filter((r) => r.erl.freeProse).length, k)}                 ${pad(rs.filter((r) => r.erl.signal === 'umsetzung').length, 4)} / ${pad(rs.filter((r) => r.erl.signal === 'durchfuehrung').length, 4)}`)
}

console.log(`\n### Most frequent general-part headings per Land (normalised; top 12)`)
for (const land of LANDS) {
  const rs = byLand(land).filter((r) => r.erl.available)
  if (!rs.length) continue
  const count = new Map<string, number>()
  for (const r of rs) for (const h of new Set(r.erl.headings.map(normaliseHeading))) count.set(h, (count.get(h) ?? 0) + 1)
  console.log(`  ${land} (${rs.length} drafts, ${count.size} distinct headings)`)
  for (const [h, v] of [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12)) console.log(`    ${pad(v, 4)}  ${h.slice(0, 110)}`)
}

console.log(`\n### Every heading with an EU term, exact spelling, per Land`)
for (const land of LANDS) {
  const count = new Map<string, number>()
  for (const r of byLand(land)) for (const h of r.erl.euHeadings) count.set(h, (count.get(h) ?? 0) + 1)
  if (!count.size) continue
  console.log(`  ${land}`)
  for (const [h, v] of [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) console.log(`    ${pad(v, 4)}  „${h}"`)
}

console.log(`\n### Sentence forms under the EU headings (numbers <n>, acts <AKT>; top 10 per Land)`)
for (const land of LANDS) {
  const forms = new Map<string, { n: number; cls: VorblattClass }>()
  let total = 0
  for (const r of byLand(land)) {
    for (const p of r.erl.euPassages) {
      for (const s of sentencesOf(p.text)) {
        total++
        const f = sentenceForm(s)
        forms.set(f, { n: (forms.get(f)?.n ?? 0) + 1, cls: classifyVorblattSentence(s) })
      }
    }
  }
  if (!total) continue
  const top = [...forms].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
  const repeated = top.filter(([, v]) => v.n > 1).reduce((s, [, v]) => s + v.n, 0)
  console.log(`  ${land}: ${total} sentences, ${forms.size} distinct forms, ${repeated} (${pctOf(repeated, total)}) in a form that repeats`)
  for (const [f, v] of top.slice(0, 10)) console.log(`    ${pad(v.n, 4)}  ${v.cls.padEnd(18)} ${q(f, 260)}`)
}

console.log(`\n### The Bund's classifiers over the EU passages`)
console.log(`  classifyVorblattSentence per EU passage:`)
for (const land of LANDS) {
  const count = new Map<VorblattClass, number>()
  for (const r of byLand(land)) for (const p of r.erl.euPassages) {
    const c = classifyVorblattSentence(p.text)
    count.set(c, (count.get(c) ?? 0) + 1)
  }
  if (count.size) console.log(`    ${land.padEnd(5)} ${[...count].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c} ${v}`).join(' · ')}`)
}
console.log(`  readExplanationsEuSignal over the EU passages only, and over the whole general part:`)
for (const land of LANDS) {
  const rs = byLand(land).filter((r) => r.erl.euPassages.length)
  if (!rs.length) continue
  const onEu = rs.map((r) => readExplanationsEuSignal(r.erl.euPassages.map((p) => ({ heading: p.heading, text: [p.text] }))).signal)
  console.log(`    ${land.padEnd(5)} EU passages: umsetzung ${onEu.filter((s) => s === 'umsetzung').length} · durchfuehrung ${onEu.filter((s) => s === 'durchfuehrung').length} · none ${onEu.filter((s) => !s).length}   | general part: umsetzung ${rs.filter((r) => r.erl.signal === 'umsetzung').length} · durchfuehrung ${rs.filter((r) => r.erl.signal === 'durchfuehrung').length} · none ${rs.filter((r) => !r.erl.signal).length}`)
}

console.log(`\n### Free prose: drafts without an EU heading whose general part carries EU_ANCHOR`)
for (const land of LANDS) {
  const rs = byLand(land).filter((r) => r.erl.freeProse)
  if (!rs.length) continue
  console.log(`  ${land}: ${rs.length} · with signal ${rs.filter((r) => r.erl.signal).length}`)
}

// ---------------------------------------------------------------------------
// 3. The law text
// ---------------------------------------------------------------------------

console.log(`\n## 3. The law text: Umsetzungshinweis (lawBlocksFromPdfPages → readUmsetzungshinweis)`)
console.log(`  Land  Blöcke  Signal: umsetzung durchf. bezug   nennt Akt       Akt in Erl. (überall)   Klartext-Gegenprobe: Signal ohne Block-Signal`)
for (const land of LANDS) {
  const rs = byLand(land)
  const k = rs.filter((r) => r.law.blocks !== null).length
  console.log(`  ${land.padEnd(5)} ${pad(k, 5)}   ${pad(rs.filter((r) => r.law.signal === 'umsetzung').length, 9)} ${pad(rs.filter((r) => r.law.signal === 'durchfuehrung').length, 7)} ${pad(rs.filter((r) => r.law.signal === 'bezug').length, 5)}   ${share(rs.filter(lawNamesAct).length, rs.length)}   ${share(rs.filter((r) => r.erl.actsAll.length).length, rs.length)}            ${pad(rs.filter((r) => r.law.plainSignal && !r.law.signal).length, 4)}`)
}
console.log(`\n### Acts named in the law text, per Land (kind, CELEX, drafts)`)
for (const land of LANDS) {
  const count = new Map<string, { act: EuAct; n: number }>()
  for (const r of byLand(land)) for (const a of r.law.acts) count.set(a.celex, { act: a, n: (count.get(a.celex)?.n ?? 0) + 1 })
  if (!count.size) continue
  console.log(`  ${land}: ${count.size} acts`)
  for (const { act, n: k } of [...count.values()].sort((a, b) => b.n - a.n || a.act.celex.localeCompare(b.act.celex))) console.log(`    ${pad(k, 3)}  ${act.kind.padEnd(10)} ${act.celex}  ${act.label}`)
}
console.log(`\n### Law-text windows (every draft with a signal)`)
for (const r of rows.filter((x) => x.law.signal)) {
  console.log(`  ${r.item.id}  ${r.law.signal}  ${r.law.acts.map((a) => a.celex).join(' ') || '—'}`)
  for (const w of r.law.windows) console.log(`      ${q(w, 300)}`)
}
console.log(`\n### Dropped for want of an EU anchor (law text)`)
for (const r of rows.filter((x) => x.law.dropped.length)) for (const w of r.law.dropped) console.log(`  ${r.item.id}  ${q(w, 200)}`)
console.log(`\n### Gegenprobe: the whole PDF as plain text gives a signal, the blocks none`)
for (const r of rows.filter((x) => x.law.plainSignal && !x.law.signal)) {
  console.log(`  ${r.item.id}  blocks ${r.law.blocks ?? 'null'} · plain ${r.law.plainSignal} ${r.law.plainActs.map((a) => a.celex).join(' ')}`)
  for (const w of r.law.plainWindows.slice(0, 2)) console.log(`      ${q(w, 300)}`)
}

// ---------------------------------------------------------------------------
// 4. Vorblatt
// ---------------------------------------------------------------------------

console.log(`\n## 4. Vorblatt: does a Land's Vorblatt carry the Bund's heading?`)
console.log(`  Land  docs read  with „Vorblatt"  with EU_HEADING  classifyVorblatt classes`)
for (const land of LANDS) {
  const rs = byLand(land)
  const cls = new Map<string, number>()
  for (const r of rs) for (const c of r.vorblatt.classes) cls.set(c, (cls.get(c) ?? 0) + 1)
  console.log(`  ${land.padEnd(5)} ${pad(rs.reduce((s, r) => s + r.vorblatt.docsRead, 0), 8)}  ${pad(rs.filter((r) => r.vorblatt.withVorblatt).length, 14)}  ${pad(rs.filter((r) => r.vorblatt.withEuHeading).length, 14)}   ${[...cls].map(([c, v]) => `${c} ${v}`).join(' · ') || '—'}`)
}
console.log(`  EU lines inside a Vorblatt region (≤140 chars, EU term), per Land:`)
for (const land of LANDS) {
  const count = new Map<string, number>()
  for (const r of byLand(land)) for (const l of new Set(r.vorblatt.euLines)) count.set(l, (count.get(l) ?? 0) + 1)
  if (!count.size) continue
  console.log(`  ${land}`)
  for (const [l, v] of [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12)) console.log(`    ${pad(v, 4)}  ${q(l, 140)}`)
}
for (const r of rows.filter((x) => x.vorblatt.sentences.length)) {
  for (const [i, s] of r.vorblatt.sentences.entries()) console.log(`  ${r.item.id}  ${r.vorblatt.classes[i]}  ${q(s, 300)}`)
}

// ---------------------------------------------------------------------------
// 5. Agreement
// ---------------------------------------------------------------------------

console.log(`\n## 5. Agreement: Erläuterungen × law text`)
const ePart = (r: Row) => (!r.erl.available ? 'E:—' : r.erl.headingClasses.length ? `E:Üb/${r.erl.headingClasses[0]}${r.erl.signal ? `+${r.erl.signal}` : ''}` : r.erl.signal ? `E:${r.erl.signal}` : r.erl.freeProse ? 'E:Freitext' : 'E:kein')
const lPart = (r: Row) => (!r.law.pdfRead ? 'G:—' : r.law.blocks === null ? 'G:keineKlausel' : `G:${r.law.signal ?? 'kein'}${r.law.acts.length ? '+Akt' : ''}`)
const cells = new Map<string, number>()
for (const r of rows) {
  const k = `${r.item.land.padEnd(5)} ${ePart(r).padEnd(34)} ${lPart(r)}`
  cells.set(k, (cells.get(k) ?? 0) + 1)
}
for (const [k, v] of [...cells].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${pad(v, 4)}  ${k}`)

const disErlOnly = rows.filter((r) => erlSaysEu(r) && !lawNamesAct(r))
const disLawOnly = rows.filter((r) => (lawNamesAct(r) || r.law.signal) && !erlSaysEu(r))
console.log(`\n  Erläuterungen say EU, law text names no act: ${disErlOnly.length}`)
for (const r of disErlOnly) console.log(`    ${r.item.id.padEnd(48)} ${ePart(r).padEnd(34)} ${lPart(r)}`)
console.log(`  Law text has a signal or an act, Erläuterungen do not say EU: ${disLawOnly.length}`)
for (const r of disLawOnly) console.log(`    ${r.item.id.padEnd(48)} ${ePart(r).padEnd(34)} ${lPart(r)}`)

console.log(`\n### The decisive sentences (up to 15)`)
for (const r of [...disErlOnly, ...disLawOnly].slice(0, 15)) {
  console.log(`  ${r.item.id} — ${r.item.title.slice(0, 120)}`)
  for (const p of r.erl.euPassages) console.log(`    Erl. „${p.heading}": ${q(p.text, 500)}`)
  for (const p of r.erl.signalParagraphs.slice(0, 2)) console.log(`    Erl. Signal: ${q(p, 500)}`)
  for (const w of r.law.windows.slice(0, 2)) console.log(`    Gesetz: ${q(w, 500)}`)
  if (!r.law.windows.length) console.log(`    Gesetz: — (${lPart(r)}${r.law.plainSignal ? `, Klartext ${r.law.plainSignal}: ${q(r.law.plainWindows[0] ?? '', 300)}` : ''})`)
}

console.log(`\n### The page's own decision (landEuReading.ts: the Land's EU statement, else the prose per D5), per Land`)
const roadOf = (p: PageRead) => (p.reading.decision.source === 'erlaeuterungen' && !p.reading.found ? 'prosa' : p.reading.found?.statement.road === 'vorblatt' ? 'wfa' : p.reading.decision.source === 'erlaeuterungen' ? 'eu-abschnitt' : (p.reading.decision.source ?? '—'))
console.log(`  Land  Fakten  (WFA / EU-Abschnitt / Prosa)  kein Fakt  nicht gelesen   Akt genannt   aus (c) zitierter Ziffer   aus (b) OÖ-Hinweis   Akt aus Prosa   Gesetzestext nennt Akt (mit/ohne Fakt)`)
for (const land of LANDS) {
  const rs = byLand(land)
  const ps = rs.map(pageOf)
  const facts = ps.filter((p): p is PageRead => !!p?.reading.decision.marker)
  const roads = (k: string) => facts.filter((p) => roadOf(p) === k).length
  const law = (p: PageRead) => new Set(p.reading.law.acts.map((a) => a.celex))
  const stmt = (p: PageRead) => new Set(p.reading.found ? p.reading.named.filter((a) => p.reading.found!.statement.sentence.includes(a.raw)).map((a) => a.celex) : [])
  const quotedGain = facts.filter((p) => p.reading.named.some((a) => p.reading.law.quotedOnly.some((q) => q.celex === a.celex) && !stmt(p).has(a.celex))).length
  const entryGain = facts.filter((p) => p.reading.named.some((a) => p.reading.hinweise.some((h) => h.acts.some((x) => x.celex === a.celex)) && !law(p).has(a.celex) && !stmt(p).has(a.celex))).length
  const prose = facts.filter((p) => roadOf(p) === 'prosa' && p.reading.named.length).length
  console.log(`  ${land.padEnd(5)} ${pad(facts.length, 6)}  (${pad(roads('wfa'), 3)} / ${pad(roads('eu-abschnitt'), 3)} / ${pad(roads('prosa'), 3)})          ${pad(ps.filter((p) => p && !p.reading.decision.marker).length, 5)}  ${pad(ps.filter((p) => !p).length, 12)}   ${pad(facts.filter((p) => p.reading.named.length).length, 11)}   ${pad(quotedGain, 24)}   ${pad(entryGain, 18)}   ${pad(prose, 13)}   ${pad(ps.filter((p) => p?.reading.law.acts.length).length, 22)}`)
}
const pageFacts = rows.map((r) => ({ r, p: pageOf(r) })).filter((x): x is { r: Row; p: PageRead } => !!x.p?.reading.decision.marker)
console.log(`  all   ${pad(pageFacts.length, 6)} facts · ${pageFacts.filter((x) => x.p.reading.named.length).length} name an act · law text names an act in ${rows.filter((r) => pageOf(r)?.reading.law.acts.length).length} drafts · not read ${rows.filter((r) => !pageOf(r)).length}`)
console.log(`\n  Law-text acts the page names whose citation is not in the law text's part (must be none):`)
let outsideLaw = 0
for (const { r, p } of pageFacts) {
  for (const a of p.reading.law.acts) {
    if (!p.reading.named.some((n) => n.celex === a.celex)) continue
    if (p.lawPart && p.lawPart.includes(a.raw.replace(/\s+/g, ' '))) continue
    outsideLaw++
    console.log(`    ${r.item.id}  ${a.celex}  „${a.raw}"`)
  }
}
console.log(`    ${outsideLaw}`)
console.log(`\n  Every fact by the page rule:`)
for (const { r, p } of pageFacts.sort((a, b) => a.r.item.id.localeCompare(b.r.item.id))) {
  console.log(`    ${r.item.id.padEnd(48)} ${p.reading.decision.marker!.padEnd(15)} ${roadOf(p).padEnd(12)} ${(p.reading.actsSource ?? '—').padEnd(14)} ${p.reading.named.map((a) => a.celex).join(' ') || '—'}`)
}
const unread = rows.filter((r) => !pageOf(r))
if (unread.length) {
  console.log(`\n  Not read by the page's reader (${unread.length}):`)
  for (const r of unread) console.log(`    ${r.item.id}  ${pageReads.get(r.item.id)}`)
}

// ---------------------------------------------------------------------------
// 6. Until when
// ---------------------------------------------------------------------------

console.log(`\n## 6. Until when: EUR-Lex Cellar`)
const kinds = (k: EuAct['kind']) => allActs.filter((a) => a.kind === k).length
console.log(`  acts named (law text, Erläuterungen signal, Erläuterungen anywhere): ${allActs.length} — Richtlinien ${kinds('richtlinie')}, Verordnungen ${kinds('verordnung')}, Beschlüsse ${kinds('beschluss')}, Rahmenbeschlüsse ${kinds('rahmenbeschluss')}`)
console.log(`  title references dropped („zur Änderung der …"): ${titleReferencesDropped}`)
console.log(`  Cellar knows the act: ${allActs.filter((a) => answers.get(a.celex)?.found).length} · not found: ${allActs.filter((a) => answers.has(a.celex) && !answers.get(a.celex)!.found).length} · not asked: ${notAsked.size}`)
for (const a of allActs.filter((x) => answers.has(x.celex) && !answers.get(x.celex)!.found)) console.log(`    not found ${a.celex}  „${a.raw}"`)
const dirsFound = allActs.filter((a) => a.kind === 'richtlinie' && answers.get(a.celex)?.found)
console.log(`  Richtlinien with a transposition date: ${dirsFound.filter((a) => answers.get(a.celex)!.dates.length).length} of ${dirsFound.length}, several dates ${dirsFound.filter((a) => answers.get(a.celex)!.dates.length > 1).length}`)

for (const source of ['gesetz', 'erl'] as const) {
  const group = rows.map((r) => ({ r, o: orderOf(r) })).filter((x) => x.o && deadlineActs(x.r).source === source) as { r: Row; o: Order }[]
  console.log(`\n### Drafts with a directive deadline — acts from ${source === 'gesetz' ? 'the law text' : 'the Erläuterungen signal (no act in the law text)'}: ${group.length}`)
  if (!group.length) continue
  for (const land of LANDS) {
    const g = group.filter((x) => x.r.item.land === land)
    if (!g.length) continue
    console.log(`  ${land.padEnd(5)} n ${pad(g.length, 3)} · Beginn nach der spätesten Frist ${pad(g.filter((x) => x.o.gapLatest > 0).length, 3)} · nach der ersten ${pad(g.filter((x) => x.o.gapFirst > 0).length, 3)} · vor allen ${pad(g.filter((x) => x.o.verdict === 'vor-allen').length, 3)}`)
  }
  const gl = group.map((x) => x.o.gapLatest)
  const gf = group.map((x) => x.o.gapFirst)
  console.log(`  all   Beginn − späteste Frist, Tage: p10 ${quantile(gl, 0.1)} · p25 ${quantile(gl, 0.25)} · Median ${quantile(gl, 0.5)} · p75 ${quantile(gl, 0.75)} · p90 ${quantile(gl, 0.9)} · nach ${gl.filter((d) => d > 0).length} · mehr als ein Jahr nach ${gl.filter((d) => d > 365).length} · mehr als ein Jahr vor ${gl.filter((d) => d < -365).length}`)
  console.log(`  all   Beginn − erste Frist, Tage:    p10 ${quantile(gf, 0.1)} · p25 ${quantile(gf, 0.25)} · Median ${quantile(gf, 0.5)} · p75 ${quantile(gf, 0.75)} · p90 ${quantile(gf, 0.9)} · nach ${gf.filter((d) => d > 0).length}`)
  for (const { r, o } of group.sort((a, b) => a.r.item.id.localeCompare(b.r.item.id))) {
    const dl = directiveDeadlines(deadlineActs(r).acts)
    console.log(`    ${r.item.id.padEnd(48)} Beginn ${r.date} · ${o.verdict.padEnd(10)} ${pad(o.gapLatest, 6)} d · ${dl.map((d) => `${d.celex}:${d.deadline}`).join(' ')}`)
  }
}

console.log(`\n### Old directives restated (the D4 case): a law-text directive whose deadline lies more than two years before the Begutachtung`)
const restated: { r: Row; act: EuAct; deadline: string }[] = []
for (const r of rows) {
  if (!r.date) continue
  for (const d of directiveDeadlines(r.law.acts)) {
    if (days(d.deadline, r.date) > 730) restated.push({ r, act: r.law.acts.find((a) => a.celex === d.celex)!, deadline: d.deadline })
  }
}
console.log(`  ${restated.length} act-in-draft pairs, ${new Set(restated.map((x) => x.r.item.id)).size} drafts, ${new Set(restated.map((x) => x.act.celex)).size} acts`)
for (const x of restated) console.log(`    ${x.r.item.id.padEnd(48)} ${x.act.celex} ${x.act.label.padEnd(36)} Frist ${x.deadline} · Beginn ${x.r.date}`)

// ---------------------------------------------------------------------------
// 7. Landesrecht in force — the D4 probe
// ---------------------------------------------------------------------------

const RIS_LAND: Record<LandCode, string> = { bgld: 'Burgenland', ktn: 'Kaernten', noe: 'Niederoesterreich', ooe: 'Oberoesterreich', sbg: 'Salzburg', stmk: 'Steiermark', t: 'Tirol', vbg: 'Vorarlberg', w: 'Wien' }
const LANDESRECHT_API = 'https://data.bka.gv.at/ris/api/v2.6/Landesrecht'

/** The Landesrecht shape this probe reads (`landKons.ts` reads the same corner). */
interface LrKonsAnswer {
  OgdSearchResult?: {
    OgdDocumentResults?: {
      Hits?: { '#text'?: string }
      OgdDocumentReference?: LrHit | LrHit[] | null
    }
  }
}
interface LrHit {
  Data?: {
    Metadaten?: { Technisch?: { ID?: string }; Landesrecht?: { Kurztitel?: string; Bundesland?: string; LrKons?: { ArtikelParagraphAnlage?: string; Typ?: string } & Record<string, unknown> } & Record<string, unknown> }
    Dokumentliste?: { ContentReference?: { ContentType?: string; Urls?: { ContentUrl?: { DataType?: string; Url?: string } | { DataType?: string; Url?: string }[] } } | { ContentType?: string; Urls?: { ContentUrl?: { DataType?: string; Url?: string } | { DataType?: string; Url?: string }[] } }[] }
  }
}
const asList = <T>(x: T | T[] | null | undefined): T[] => (x === null || x === undefined ? [] : Array.isArray(x) ? x : [x])

console.log(`\n## 7. Landesrecht in force (D4 analogue), probe`)
// Five directives from the law text, oldest deadline first: the D4 case is
// the old one, and an old directive is the likeliest to stand in force.
const probes = uniqueActs([restated.map((x) => x.act), rows.flatMap((r) => r.law.acts.filter((a) => a.kind === 'richtlinie'))])
  .map((act) => ({ act, row: rows.find((r) => r.law.acts.some((a) => a.celex === act.celex) && r.date)! }))
  .filter((p) => p.row)
  .slice(0, 5)
for (const { act, row } of probes) {
  const phrase = bundesrechtPhrase(act.label)
  if (!phrase) continue
  const params = { Applikation: 'LrKons', [`Bundesland_SucheIn${RIS_LAND[row.item.land]}`]: 'true', Suchworte: `"${phrase}"`, 'Fassung.FassungVom': row.date!, DokumenteProSeite: 'OneHundred' }
  const url = `${LANDESRECHT_API}?${new URLSearchParams(params)}`
  console.log(`\n  ${act.celex} „${phrase}" in ${row.item.land} as of ${row.date} (${row.item.id})`)
  console.log(`    GET ${url}`)
  try {
    const answer = await cachedFetchJson<LrKonsAnswer>('lrkons', 'lrkons', sha1(url), async () => {
      const text = await getText(url, { ...RIS_FETCH, accept: 'application/json' })
      return { data: JSON.parse(text) as LrKonsAnswer, bytes: Buffer.byteLength(text) }
    })
    const results = answer.OgdSearchResult?.OgdDocumentResults
    const refs = asList(results?.OgdDocumentReference)
    console.log(`    Hits ${results?.Hits?.['#text'] ?? '0'} · references on the page ${refs.length}`)
    const viaBund = bundesrechtHits(answer as BrKonsSearchAnswer)
    console.log(`    bundesrechtHits() over this answer: total ${viaBund.total}, hits kept ${viaBund.hits.length} (it reads Metadaten.Bundesrecht)`)
    const first = refs[0]?.Data?.Metadaten
    if (first) {
      console.log(`    first hit: ID ${first.Technisch?.ID} · Metadaten keys ${Object.keys(first).join(', ')} · Landesrecht keys ${Object.keys(first.Landesrecht ?? {}).join(', ')} · LrKons keys ${Object.keys(first.Landesrecht?.LrKons ?? {}).join(', ')}`)
    }
    for (const ref of refs.slice(0, 3)) {
      const meta = ref.Data?.Metadaten
      const main = asList(ref.Data?.Dokumentliste?.ContentReference).find((c) => c?.ContentType === 'MainDocument') ?? asList(ref.Data?.Dokumentliste?.ContentReference)[0]
      const xmlUrl = asList(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
      let verdict = 'no XML'
      if (xmlUrl) {
        const xml = await cachedFetchJson<string>('lrkons', 'lrkons', sha1(xmlUrl), async () => {
          const text = await getText(xmlUrl, RIS_FETCH)
          return { data: text, bytes: Buffer.byteLength(text) }
        })
        const body = xml.slice(Math.max(0, xml.indexOf('<nutzdaten'))).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        verdict = `transposesAct ${transposesAct(body, act.celex)} · ${q(body.slice(0, 260), 260)}`
      }
      console.log(`    ${meta?.Technisch?.ID} · ${meta?.Landesrecht?.Kurztitel ?? '—'} ${meta?.Landesrecht?.LrKons?.ArtikelParagraphAnlage ?? ''} · Typ ${meta?.Landesrecht?.LrKons?.Typ ?? '—'}\n      ${verdict}`)
    }
  } catch (err) {
    console.log(`    FEHLER ${String(err).slice(0, 200)}`)
  }
}

// ---------------------------------------------------------------------------
// 8. Cost
// ---------------------------------------------------------------------------

console.log(`\n## 8. Cost (first fetch of each answer, read from the cache's cost files)`)
for (const cls of ['server-list', 'server-detail', 'server-erl', 'pdf', 'cellar', 'lrkons'] as CostClass[]) {
  const cs = costs.filter((c) => c.cls === cls).map((c) => c.cost)
  if (!cs.length) continue
  const bytes = cs.reduce((s, c) => s + c.bytes, 0)
  const ms = cs.reduce((s, c) => s + c.ms, 0)
  console.log(`  ${cls.padEnd(14)} ${pad(cs.length, 5)} answers · ${pad((bytes / 1e6).toFixed(1), 6)} MB · fetch time sum ${pad((ms / 1000).toFixed(0), 5)} s · median ${pad((quantile(cs.map((c) => c.ms), 0.5) / 1000).toFixed(1), 5)} s`)
}
process.stderr.write(`Requests this run: ${[...requestsThisRun].map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'} · read ${readSeconds.toFixed(0)} s · total ${((Date.now() - started) / 1000).toFixed(0)} s\n`)

const failed = rows.filter((r) => r.error || r.law.error)
if (failed.length) {
  console.log(`\n## Errors (${failed.length})`)
  for (const r of failed) console.log(`  ${r.item.id}  ${[r.error, r.law.error].filter(Boolean).join(' · ')}`)
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

if (outDir) {
  await mkdir(outDir, { recursive: true })
  const cell = (v: string | number | boolean | null | undefined) => {
    const s = String(v ?? '')
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = ['id', 'land', 'kind', 'startedAt', 'deadline', 'explanations_available', 'eu_heading', 'heading_class', 'prose_eu', 'erl_signal', 'law_read', 'law_signal', 'acts', 'erl_acts', 'erl_signal_acts', 'cellar_deadlines', 'order_verdict', 'days_after_latest_deadline', 'deadline_source', 'page_marker', 'page_source', 'page_acts_source', 'page_acts']
  const lines = [header.join(',')]
  for (const r of rows) {
    const o = orderOf(r)
    const dl = directiveDeadlines(deadlineActs(r).acts)
    lines.push([
      r.item.id,
      r.item.land,
      r.item.kind,
      r.date,
      r.item.deadline,
      r.erl.available ? 'ja' : 'nein',
      r.erl.euHeadings.join(' | '),
      headingClass(r),
      r.erl.freeProse ? 'ja' : '',
      r.erl.signal,
      r.law.pdfRead ? (r.law.blocks === null ? 'keine-klausel' : 'ja') : 'nein',
      r.law.signal,
      r.law.acts.map((a) => a.celex).join(' '),
      r.erl.actsAll.map((a) => a.celex).join(' '),
      r.erl.signalActs.map((a) => a.celex).join(' '),
      dl.map((d) => `${d.celex}:${d.deadline}`).join(' '),
      o?.verdict ?? '',
      o?.gapLatest ?? '',
      deadlineActs(r).source ?? '',
      pageOf(r)?.reading.decision.marker ?? '',
      pageOf(r)?.reading.decision.source ?? '',
      pageOf(r)?.reading.actsSource ?? '',
      pageOf(r)?.reading.named.map((a) => a.celex).join(' ') ?? '',
    ].map(cell).join(','))
  }
  await writeFile(join(outDir, 'drafts.csv'), `${lines.join('\n')}\n`)
  console.log(`\nFile: ${join(outDir, 'drafts.csv')}`)
}
