/**
 * Does a draft implement EU law, which act, and by when was it due? — the
 * measurement before a marker „Setzt EU-Recht um: Richtlinie (EU) 2024/1069,
 * Umsetzungsfrist 7. Mai 2026" is built (Phase A, 04.11.2026).
 *
 * Three documents of a Begut record can say it, and they say different
 * things:
 *
 *  1. The VORBLATT/WFA says WHETHER, in one of a few fixed sentences the
 *     WFA tool prints under „Verhältnis zu den Rechtsvorschriften der
 *     Europäischen Union". Its RIS XML is page images; its PDF has a text
 *     layer, so it is read from the PDF. It almost never names the act.
 *  2. The LAW TEXT says WHICH, where the draft carries an Umsetzungshinweis
 *     („Mit … wird die Richtlinie (EU) 2024/1069 … umgesetzt") or a
 *     „Bezugnahme auf Unionsrecht" — read per Absatz from the RIS XML
 *     through `parseRisXml`, so a signal never spans two provisions.
 *  3. The ERLÄUTERUNGEN talk about it in prose, in the Allgemeiner Teil
 *     (`parseExplanations`). Readable, but noisy: citing an act is not
 *     implementing it, and „Umsetzungsfrist" is as often a Förderung's.
 *
 * The question is how often each one speaks, how often they agree, and
 * where they disagree — the disagreements decide the detector's rules. The
 * acts are resolved to CELEX numbers and looked up in the EUR-Lex Cellar
 * (SPARQL, no auth) for their transposition deadline, which gives the
 * headline: how many drafts enter the Begutachtung after their directive's
 * deadline has passed.
 *
 * Two populations, both through the shipped modules: all
 * Ministerialentwürfe of one GP (list 81, joined to their RIS record by
 * `joinRisToMe`), and every RIS Begut record since `--since`, split by
 * `classifyRisRecord` into Gesetze and Verordnungen.
 *
 *     pnpm corpus:eu                               # GP XXVIII + RIS since 2024-01-01
 *     pnpm corpus:eu -- --since 2025-01-01 --gp XXVIII
 *     pnpm corpus:eu -- --sample 80                # a deterministic subset of the RIS window
 *     pnpm corpus:eu -- --show BEGUT_…             # everything read from one record
 *     pnpm corpus:eu -- --out dir                  # drafts.csv, disagreements.md, handread.md
 *
 * THE RULES ARE THE PRODUCT'S. Since Phase B (04.11.2026) every pattern —
 * act citations, the Vorblatt classes, the Umsetzungshinweis windows, the
 * Erläuterungen signal — comes from `server/utils/eu/`, the modules the
 * draft page runs; this file only reads documents, counts and prints, so a
 * run stays the oracle for the page. Section g applies the page's own
 * decision (`euMarker.ts`) to the same readings. Kept here: the hand-count
 * patterns (`HAND_LAW`, `HAND_ERL`) for the comparison, and the Cellar
 * query, which asks for more than the page needs (entry into force, title).
 *
 * Reads only. Every document, every PDF and every SPARQL answer is cached
 * under `.cache/eu/`, so the second run makes no request; the cost section
 * reads the fetch times the first run recorded beside each document.
 * Concurrency: 4 against RIS, 2 against the Cellar.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { classifyRisRecord, dedupeMeRows, joinRisToMe, toMeListRows, type RisClass } from '../../server/utils/ris/risJoin'
import type { RisBegutFlat } from '../../server/utils/ris/risRecord'
import { parseExplanations, type ExplanationsPart } from '../../server/utils/explanations/risExplanations'
import { parseRisXml } from '../../server/utils/lawtext/risXml'
import type { TextBlock } from '../../server/utils/lawtext/lawUnits'
import { mapDraftRow } from '../../server/utils/parliament/list81'
import { withPdf } from '../../server/utils/text/pdfDocument'
import { readEuActCitations, uniqueActs, type EuAct } from '../../server/utils/eu/actCitations'
import { VORBLATT_CLASS_RANK, VORBLATT_EU_YES, classifyVorblatt, classifyVorblattSentence, hasTextLayer, isVorblattDocument, linesOfPages, type VorblattClass } from '../../server/utils/eu/vorblatt'
import { readExplanationsEuSignal, readUmsetzungshinweis, type LawSignal } from '../../server/utils/eu/umsetzungshinweis'
import { decideEuMarker } from '../../server/utils/eu/euMarker'
import { fetchRisBegutCorpus } from '../lib/corpus'
import { cachedJson } from '../lib/diskCache'
import { PARLIAMENT, getBytes, getJson, getText, type HttpOptions } from '../lib/http'
import { pool } from '../lib/async'
import { argPair } from '../lib/args'
import { quantile } from '../lib/fmt'

const SCRIPT = 'corpus/eu'
const CACHE = join('.cache', 'eu')
const RIS_CONCURRENCY = 4
const CELLAR_CONCURRENCY = 2

const since = argPair('since') ?? '2024-01-01'
const gp = (argPair('gp') ?? 'XXVIII').toUpperCase()
const sample = Number(argPair('sample') ?? 0)
const show = argPair('show')
const outDir = argPair('out')

if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^[IVXLC]+$/.test(gp)) {
  console.error('Usage: pnpm corpus:eu -- [--since 2024-01-01] [--gp XXVIII] [--sample n] [--show BEGUT_…] [--out dir]')
  process.exit(1)
}

/** Three attempts on any failure, as `corpus:erlaeuterungen` reads RIS. */
const RIS_FETCH: HttpOptions = { script: SCRIPT, attempts: 3, backoffMs: (retry) => 500 * retry, retryOnHttpError: true, timeoutMs: 45_000 }
/** The Cellar answers in ~0,25 s; a slow one is retried, not waited out. */
const CELLAR_FETCH: HttpOptions = {
  script: SCRIPT,
  attempts: 3,
  backoffMs: (retry) => 1_000 * retry,
  retryOnHttpError: true,
  timeoutMs: 20_000,
  accept: 'application/sparql-results+json',
}

for (const dir of ['docs', 'cellar', 'parliament']) await mkdir(join(CACHE, dir), { recursive: true })

// ---------------------------------------------------------------------------
// Fetching, with the cost of every first fetch kept beside the document
// ---------------------------------------------------------------------------

/** What one document cost when it was first fetched — the cost section sums these. */
interface FetchCost {
  bytes: number
  ms: number
}

const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex')

async function readCost(key: string): Promise<FetchCost> {
  try {
    return JSON.parse(await readFile(join(CACHE, 'docs', `${key}.json`), 'utf8')) as FetchCost
  } catch {
    return { bytes: 0, ms: 0 }
  }
}

/** A RIS document as text (XML), cached; the cost is the first fetch's. */
async function fetchRisText(url: string): Promise<{ text: string; cost: FetchCost }> {
  const key = sha1(url)
  const file = join(CACHE, 'docs', `${key}.xml`)
  try {
    return { text: await readFile(file, 'utf8'), cost: await readCost(key) }
  } catch {
    const started = Date.now()
    const text = await getText(url, RIS_FETCH)
    const cost = { bytes: Buffer.byteLength(text), ms: Date.now() - started }
    await writeFile(file, text)
    await writeFile(join(CACHE, 'docs', `${key}.json`), JSON.stringify(cost))
    return { text, cost }
  }
}

/** A RIS PDF as bytes, cached the same way. */
async function fetchRisPdf(url: string): Promise<{ bytes: Uint8Array; cost: FetchCost }> {
  const key = sha1(url)
  const file = join(CACHE, 'docs', `${key}.pdf`)
  try {
    return { bytes: new Uint8Array(await readFile(file)), cost: await readCost(key) }
  } catch {
    const started = Date.now()
    const bytes = await getBytes(url, RIS_FETCH)
    const cost = { bytes: bytes.byteLength, ms: Date.now() - started }
    await writeFile(file, bytes)
    await writeFile(join(CACHE, 'docs', `${key}.json`), JSON.stringify(cost))
    return { bytes, cost }
  }
}

/**
 * The PDF's text, one string per page, through `withPdf` — the one door the
 * server opens PDFs through. Pages stay apart so the WFA tool's page footer
 * („2 von 10") can be cut where it stands, instead of out of the sentence it
 * was glued to.
 */
async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const { extractText } = await import('unpdf')
  // A copy: pdf.js takes the buffer over, and the caller may still hold it.
  const { text } = await withPdf(bytes.slice(), (doc) => extractText(doc, { mergePages: false }), { verbosity: 0 })
  return text as string[]
}

// ---------------------------------------------------------------------------
// EU acts: citation → CELEX — `server/utils/eu/actCitations.ts`
// ---------------------------------------------------------------------------

/** One EU act as a draft names it — the production shape. */
type Act = EuAct
/** What a law-text window or an Erläuterungen paragraph says. */
type Signal = LawSignal

/** Occurrences dropped as named inside another act's title, over the whole run. */
let titleReferencesDropped = 0

/**
 * Every act cited in `text` through the production parser; `implemented`
 * drops the acts named inside another act's title and counts them for the
 * EUR-Lex section.
 */
function actsIn(text: string, implemented = false): Act[] {
  const read = readEuActCitations(text, { implemented })
  titleReferencesDropped += read.titleReferencesDropped
  return read.acts
}

// ---------------------------------------------------------------------------
// 1. The Vorblatt: the WFA tool's sentence — `server/utils/eu/vorblatt.ts`
// ---------------------------------------------------------------------------

/** The production classes, plus the four ways a Vorblatt can be missing that only this run counts. */
type ScriptClass =
  | VorblattClass
  /** a text layer, but no EU heading */
  | 'ohne-ueberschrift'
  /** a PDF without text */
  | 'kein-text'
  /** a Vorblatt document, but no PDF of it */
  | 'kein-pdf'
  | 'kein-vorblatt'

/** How firmly a class says „EU" — the order in which several Vorblätter of one draft are combined. */
const CLASS_RANK: ScriptClass[] = [...VORBLATT_CLASS_RANK, 'ohne-ueberschrift', 'kein-text', 'kein-pdf', 'kein-vorblatt']

/** The marker classes: the Vorblatt says the draft implements or flanks EU law. */
const EU_YES: ReadonlySet<ScriptClass> = VORBLATT_EU_YES

interface VorblattRead {
  /** Vorblatt documents by name, with a PDF of them, with text, with the heading */
  docs: number
  withPdf: number
  withText: number
  withHeading: number
  /** Where the sentence came from when no Vorblatt document exists */
  source: 'vorblatt' | 'erl-pdf' | null
  cls: ScriptClass
  /** Every Vorblatt's class, in document order — the production decision (D2) reads them all */
  classes: VorblattClass[]
  /** Every EU section's text, normalised */
  sentences: string[]
  /** Acts anywhere in the Vorblatt/WFA, and those in a „Ziel n:" line */
  actsAll: Act[]
  actsZiele: Act[]
  ziele: string[]
  cost: FetchCost[]
}

/** „Ziel 1: vollständige und korrekte Umsetzung der RL EU 2024/1069 …" — one entry per Ziel. */
function zieleOf(pages: string[]): string[] {
  const text = pages.join('\n').replace(/\s+/g, ' ')
  const ziele = [...text.matchAll(/Ziel\s+\d+:\s*(.{0,300}?)(?=Ziel\s+\d+:|Beschreibung\s+des\s+Ziels|Wie\s+sieht|Dokumentinformationen|Umsetzung\s+durch|Inhalt|Maßnahme\s+\d+:|$)/g)]
  return [...new Set(ziele.map((m) => m[1]!.trim()))]
}

async function readVorblatt(record: RisBegutFlat): Promise<VorblattRead> {
  const docs = record.otherDocuments.filter((d) => isVorblattDocument(d.name))
  const out: VorblattRead = { docs: docs.length, withPdf: 0, withText: 0, withHeading: 0, source: null, cls: 'kein-vorblatt', classes: [], sentences: [], actsAll: [], actsZiele: [], ziele: [], cost: [] }
  const classes: ScriptClass[] = []
  const all: Act[][] = []
  const ziele: Act[][] = []
  // Without a Vorblatt of its own, the Erläuterungen PDF may carry it
  // („Vorblatt und Erläuterungen"): read for the heading, nothing else.
  const sources = docs.length
    ? docs.map((d) => ({ pdf: d.urls.pdf, source: 'vorblatt' as const }))
    : record.explanations?.pdf
      ? [{ pdf: record.explanations.pdf, source: 'erl-pdf' as const }]
      : []
  if (docs.length && !docs.some((d) => d.urls.pdf)) classes.push('kein-pdf')
  for (const { pdf, source } of sources) {
    if (!pdf) continue
    if (source === 'vorblatt') out.withPdf++
    let pages: string[]
    try {
      const { bytes, cost } = await fetchRisPdf(pdf)
      out.cost.push(cost)
      pages = await pdfPages(bytes)
    } catch {
      classes.push('kein-text')
      continue
    }
    const lines = linesOfPages(pages)
    if (!hasTextLayer(lines)) {
      if (source === 'vorblatt') classes.push('kein-text')
      continue
    }
    if (source === 'vorblatt') out.withText++
    const { sentence, cls } = classifyVorblatt(lines)
    if (sentence === null || cls === null) {
      if (source === 'vorblatt') classes.push('ohne-ueberschrift')
      continue
    }
    if (source === 'vorblatt') out.withHeading++
    out.source ??= source
    out.sentences.push(sentence)
    out.classes.push(cls)
    classes.push(cls)
    if (source === 'vorblatt') {
      all.push(actsIn(pages.join('\n').replace(/\s+/g, ' '), true))
      const z = zieleOf(pages)
      out.ziele.push(...z)
      ziele.push(...z.map((t) => actsIn(t, true)))
    }
  }
  if (classes.length) out.cls = CLASS_RANK.find((c) => classes.includes(c))!
  else if (!docs.length && record.explanations?.pdf) out.cls = 'kein-vorblatt'
  out.actsAll = uniqueActs(all)
  out.actsZiele = uniqueActs(ziele)
  return out
}

// ---------------------------------------------------------------------------
// 2. The law text: the Umsetzungshinweis — `server/utils/eu/umsetzungshinweis.ts`
// ---------------------------------------------------------------------------

/** The hand count's law-text pattern of 04.11.2026, kept to show what the refinement changed. */
const HAND_LAW = /Umsetzungshinweis|Bezugnahme auf (?:das )?Unionsrecht|wird die (?:Richtlinie|Durchführungsrichtlinie|Delegierte Richtlinie)[^.]{0,400}?umgesetzt|werden (?:die|folgende) Richtlinien[^.]{0,600}?umgesetzt|dient der Umsetzung der Richtlinie|Durchführung der Verordnung \(EU\)|begleitende(?:n)? (?:Regelungen|Bestimmungen|Maßnahmen) zur (?:unmittelbar anwendbaren )?(?:Verordnung|Durchführungsverordnung) \(EU\)/

interface LawRead {
  available: boolean
  signal: Signal | null
  /** The strongest signal of a window that names an act — what the page decides on */
  actSignal: Signal | null
  /** The text each signal was read from — a heading's window or one Absatz */
  windows: string[]
  /** Acts named inside those windows */
  acts: Act[]
  /** Acts named anywhere in the law text */
  cited: number
  /** Inline matches dropped for want of anything European in their Absatz */
  unanchored: number
  /** Their text, so the rule's cost can be read */
  dropped: string[]
  handHit: boolean
  cost: FetchCost[]
}

function blockText(b: TextBlock): string {
  return [b.gld, b.text].filter(Boolean).join(' ')
}

function readLawBlocks(blocks: TextBlock[]): Omit<LawRead, 'available' | 'cost' | 'handHit'> {
  const read = readUmsetzungshinweis(blocks)
  const windows = read.windows.map((w) => w.text)
  const plain = blocks.map(blockText).join(' ')
  return {
    signal: read.signal,
    actSignal: read.actSignal,
    windows,
    // Through `actsIn` once more, for the title-reference count; the acts are the module's.
    acts: uniqueActs(windows.map((w) => actsIn(w, true))),
    cited: actsIn(plain).length,
    unanchored: read.dropped.length,
    dropped: read.dropped,
  }
}

async function readLaw(record: RisBegutFlat): Promise<LawRead> {
  const url = record.mainDocument.xml
  if (!url) return { available: false, signal: null, actSignal: null, windows: [], acts: [], cited: 0, unanchored: 0, dropped: [], handHit: false, cost: [] }
  const { text, cost } = await fetchRisText(url)
  const blocks = parseRisXml(text)
  const plain = blocks.map(blockText).join(' ')
  return { available: blocks.length > 0, ...readLawBlocks(blocks), handHit: HAND_LAW.test(plain), cost: [cost] }
}

// ---------------------------------------------------------------------------
// 3. The Erläuterungen: the Allgemeiner Teil — `readExplanationsEuSignal`
// ---------------------------------------------------------------------------

/** The hand count's Erläuterungen pattern of 04.11.2026, kept for the comparison. */
const HAND_ERL = /dient der Umsetzung|Umsetzung (?:der|von) (?:Art\. \d+[^.]{0,40}der )?(?:Richtlinie|Unionsrecht|unionsrechtlich)|(?:Richtlinie|Delegierte Richtlinie|Durchführungsrichtlinie)[^.]{0,300}?(?:umgesetzt|umzusetzen)|begleitende(?:n)? (?:Regelungen|Bestimmungen|Maßnahmen) zur (?:unmittelbar anwendbaren )?(?:Verordnung|Durchführungsverordnung)|Durchführung der (?:Verordnung|Durchführungsverordnung) \(EU\)|unmittelbar anwendbare[nr]? (?:Verordnung|Unionsrecht)|Umsetzungsfrist/

interface ErlRead {
  available: boolean
  /** A labelled or inferred Allgemeiner Teil exists */
  general: boolean
  signal: Signal | null
  /** The same rule over every part, for documents without a general part */
  signalAnyPart: Signal | null
  paragraphs: string[]
  acts: Act[]
  /** Acts cited anywhere in the Allgemeiner Teil */
  cited: number
  handHit: boolean
  /** The hand count's bare „Umsetzungsfrist" fired, and nothing of the refined rule did */
  bareFristOnly: boolean
  /** A signal without an EU anchor in its Absatz, dropped */
  unanchored: number
  cost: FetchCost[]
}

function partParagraphs(part: ExplanationsPart): string[] {
  return part.passages.flatMap((p) => [...(p.heading ? [p.heading] : []), ...p.text])
}

function readErlParts(parts: ExplanationsPart[]): { signal: Signal | null; paragraphs: string[]; acts: Act[]; unanchored: number } {
  const read = readExplanationsEuSignal(parts.flatMap((p) => p.passages))
  return { signal: read.signal, paragraphs: read.paragraphs, acts: uniqueActs(read.paragraphs.map((t) => actsIn(t, true))), unanchored: read.unanchored }
}

async function readErl(record: RisBegutFlat): Promise<ErlRead> {
  const empty: ErlRead = { available: false, general: false, signal: null, signalAnyPart: null, paragraphs: [], acts: [], cited: 0, handHit: false, bareFristOnly: false, unanchored: 0, cost: [] }
  const url = record.explanations?.xml
  if (!url) return empty
  const { text, cost } = await fetchRisText(url)
  const doc = parseExplanations(text)
  if (doc.chars === 0) return { ...empty, cost: [cost] }
  const general = doc.general
  const read = general ? readErlParts([general]) : { signal: null, paragraphs: [], acts: [], unanchored: 0 }
  const any = readErlParts(doc.parts.filter((p) => p.kind !== 'special' && p.kind !== 'wfa'))
  const generalText = general ? partParagraphs(general).join(' ') : ''
  const handHit = HAND_ERL.test(generalText)
  const bareFristOnly = handHit && /Umsetzungsfrist/.test(generalText) && !HAND_ERL.test(generalText.replace(/Umsetzungsfrist/g, ''))
  return {
    available: true,
    general: Boolean(general),
    ...read,
    signalAnyPart: any.signal,
    cited: actsIn(generalText).length,
    handHit,
    bareFristOnly,
    cost: [cost],
  }
}

// ---------------------------------------------------------------------------
// 4. The title
// ---------------------------------------------------------------------------

/** A title that says it: „Anti-SLAPP-Richtlinie-Umsetzungsnovelle", „EU-…-Anpassungsgesetz", „Begleitgesetz". */
const TITLE_SAYS = /Umsetzung|Richtlinie|Unionsrecht|EU-|Begleitgesetz|Durchführungsgesetz|(?:^|[^a-zäöüß])RL(?:[^a-zäöüß]|$)/

// ---------------------------------------------------------------------------
// The populations
// ---------------------------------------------------------------------------

interface MeInfo {
  cite: string
  inr: number
  title: string
  arrival: string
  frist: string | null
}

interface Row {
  record: RisBegutFlat
  cls: RisClass
  me: MeInfo | null
  inWindow: boolean
  title: string
  vorblatt: VorblattRead
  law: LawRead
  erl: ErlRead
  titleActs: Act[]
  titleSays: boolean
  error: string | null
}

const started = Date.now()
const corpus = await cachedJson(join(CACHE, 'ris-begut-corpus.json'), () => fetchRisBegutCorpus(SCRIPT, 'Ascending'))

const list = await cachedJson<{ rows?: unknown[][] }>(join(CACHE, 'parliament', `${gp}-list81.json`), () =>
  getJson(`${PARLIAMENT}/Filter/api/filter/data/81?js=eval&showAll=true&sortrnr=11&ascDesc=DESC`, {
    script: SCRIPT,
    attempts: 3,
    backoffMs: (retry) => 500 * retry,
    timeoutMs: 20_000,
    method: 'POST',
    body: { GP_CODE: [gp] },
  }),
)
const listRows = (list.rows ?? []).filter((r) => Array.isArray(r) && r[0] === gp)
const mes = dedupeMeRows(toMeListRows(listRows.map(mapDraftRow)))
const joined = joinRisToMe(mes, corpus.records)
/** RIS id → the ME it is the twin of, by the shipped join. */
const meOf = new Map<string, MeInfo>()
const meWithoutTwin: { cite: string; title: string; reason: string | null; status: string }[] = []
for (const j of joined) {
  const me = mes.find((m) => m.inr === j.inr)!
  if (j.risId && (j.status === 'matched' || j.status === 'matched_weak')) {
    meOf.set(j.risId, { cite: me.cite, inr: me.inr, title: me.title, arrival: me.arrival, frist: me.frist })
  } else {
    meWithoutTwin.push({ cite: me.cite, title: me.title, reason: j.reason, status: j.status })
  }
}

const windowIds = new Set(corpus.records.filter((r) => (r.beginn ?? '') >= since).map((r) => r.id))
let targets = corpus.records.filter((r) => windowIds.has(r.id) || meOf.has(r.id))
if (sample > 0 && !show) {
  targets = [...targets].sort((a, b) => sha1(a.id).localeCompare(sha1(b.id))).slice(0, sample)
}
if (show) targets = corpus.records.filter((r) => r.id === show)

console.log(`# EU-Recht in der Begutachtung`)
console.log(`RIS-Korpus ${corpus.records.length} Sätze · Fenster Beginn ab ${since}: ${windowIds.size} · ${gp}: ${mes.length} Ministerialentwürfe, ${meOf.size} mit RIS-Zwilling`)
console.log(`gelesen in diesem Lauf: ${targets.length} Sätze`)

const rows: Row[] = await pool(
  targets,
  RIS_CONCURRENCY,
  async (record): Promise<Row> => {
    const title = record.kurztitel ?? record.titel ?? ''
    const base = {
      record,
      cls: classifyRisRecord(record),
      me: meOf.get(record.id) ?? null,
      inWindow: windowIds.has(record.id),
      title,
      titleActs: actsIn(`${record.kurztitel ?? ''} ${record.titel ?? ''}`, true),
      titleSays: TITLE_SAYS.test(`${record.kurztitel ?? ''} ${record.titel ?? ''}`),
    }
    try {
      const vorblatt = await readVorblatt(record)
      const law = await readLaw(record)
      const erl = await readErl(record)
      return { ...base, vorblatt, law, erl, error: null }
    } catch (err) {
      return {
        ...base,
        vorblatt: { docs: 0, withPdf: 0, withText: 0, withHeading: 0, source: null, cls: 'kein-vorblatt', classes: [], sentences: [], actsAll: [], actsZiele: [], ziele: [], cost: [] },
        law: { available: false, signal: null, actSignal: null, windows: [], acts: [], cited: 0, unanchored: 0, dropped: [], handHit: false, cost: [] },
        erl: { available: false, general: false, signal: null, signalAnyPart: null, paragraphs: [], acts: [], cited: 0, handHit: false, bareFristOnly: false, unanchored: 0, cost: [] },
        error: String(err).slice(0, 200),
      }
    }
  },
  (done, total) => process.stderr.write(`\rEntwürfe: ${done}/${total}`),
)
process.stderr.write('\n')
const readSeconds = (Date.now() - started) / 1000

if (show) {
  for (const r of rows) {
    console.log(`\n## ${r.record.id} — ${r.cls}${r.me ? ` · ${r.me.cite}` : ''}`)
    console.log(`  ${r.title}`)
    console.log(`  Beginn ${r.record.beginn} · Ende ${r.record.ende}${r.error ? ` · FEHLER ${r.error}` : ''}`)
    console.log(`\n  Vorblatt: ${r.vorblatt.docs} Dokumente, ${r.vorblatt.withPdf} PDF, ${r.vorblatt.withText} Text, ${r.vorblatt.withHeading} Überschrift → ${r.vorblatt.cls} (${r.vorblatt.source ?? '—'})`)
    for (const s of r.vorblatt.sentences) console.log(`    „${s}"`)
    for (const z of r.vorblatt.ziele) console.log(`    Ziel: ${z.slice(0, 200)}`)
    console.log(`    Akte im Vorblatt: ${r.vorblatt.actsAll.map((a) => a.celex).join(', ') || '—'}`)
    console.log(`\n  Gesetzestext: ${r.law.available ? '' : 'nicht lesbar '}Signal ${r.law.signal ?? '—'} · ${r.law.cited} Akte zitiert · Handmuster ${r.law.handHit ? 'ja' : 'nein'}`)
    for (const w of r.law.windows) console.log(`    „${w.slice(0, 600)}"`)
    console.log(`    Akte: ${r.law.acts.map((a) => `${a.raw} → ${a.celex}`).join(' · ') || '—'}`)
    console.log(`\n  Erläuterungen: ${r.erl.available ? '' : 'nicht lesbar '}Allg. Teil ${r.erl.general ? 'ja' : 'nein'} · Signal ${r.erl.signal ?? '—'} (alle Teile ${r.erl.signalAnyPart ?? '—'}) · ${r.erl.cited} Akte zitiert · ohne EU-Anker ${r.erl.unanchored}`)
    for (const p of r.erl.paragraphs) console.log(`    „${p.slice(0, 600)}"`)
    console.log(`    Akte: ${r.erl.acts.map((a) => `${a.raw} → ${a.celex}`).join(' · ') || '—'}`)
    console.log(`\n  Titel: ${r.titleActs.map((a) => a.celex).join(', ') || '—'} · sagt es ${r.titleSays ? 'ja' : 'nein'}`)
  }
  process.exit(0)
}

// ---------------------------------------------------------------------------
// EUR-Lex: every named act in the Cellar
// ---------------------------------------------------------------------------

interface CellarAnswer {
  found: boolean
  transposition: string[]
  entryIntoForce: string[]
  documentDate: string | null
  titleDe: string | null
}

const SPARQL = 'https://publications.europa.eu/webapi/rdf/sparql'
const PREFIX = 'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> PREFIX owl: <http://www.w3.org/2002/07/owl#> '

interface SparqlResult {
  results?: { bindings?: Record<string, { value: string }>[] }
}

async function cellar(celex: string): Promise<CellarAnswer> {
  return cachedJson(join(CACHE, 'cellar', `${celex}.json`), async () => {
    const work = `<http://publications.europa.eu/resource/celex/${celex}>`
    const dates = await getJson<SparqlResult>(
      `${SPARQL}?query=${encodeURIComponent(`${PREFIX}SELECT ?p ?o WHERE { ?w owl:sameAs ${work} . ?w ?p ?o . FILTER(?p IN (cdm:directive_date_transposition, cdm:resource_legal_date_entry-into-force, cdm:work_date_document)) }`)}`,
      CELLAR_FETCH,
    )
    const title = await getJson<SparqlResult>(
      `${SPARQL}?query=${encodeURIComponent(`${PREFIX}SELECT ?t WHERE { ?w owl:sameAs ${work} . ?e cdm:expression_belongs_to_work ?w . ?e cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/DEU> . ?e cdm:expression_title ?t } LIMIT 1`)}`,
      CELLAR_FETCH,
    )
    const b = dates.results?.bindings ?? []
    const of = (p: string) => [...new Set(b.filter((x) => x.p?.value.endsWith(`#${p}`)).map((x) => x.o!.value.slice(0, 10)))].sort()
    const titleDe = title.results?.bindings?.[0]?.t?.value ?? null
    return {
      found: b.length > 0 || titleDe !== null,
      transposition: of('directive_date_transposition'),
      entryIntoForce: of('resource_legal_date_entry-into-force'),
      documentDate: of('work_date_document')[0] ?? null,
      titleDe,
    }
  })
}

const allActs = uniqueActs(rows.flatMap((r) => [r.law.acts, r.erl.acts, r.titleActs, r.vorblatt.actsAll]))
const cellarStarted = Date.now()
const answers = new Map<string, CellarAnswer>()
const notAsked = new Set<string>()
await pool(
  allActs,
  CELLAR_CONCURRENCY,
  async (act) => {
    try {
      answers.set(act.celex, await cellar(act.celex))
    } catch {
      // Not cached and not retried beyond `CELLAR_FETCH`: the act's dates
      // count as „nicht abgefragt", and the next run asks again.
      notAsked.add(act.celex)
    }
  },
  (done, total) => process.stderr.write(`\rCellar: ${done}/${total}`),
)
process.stderr.write('\n')
const cellarSeconds = (Date.now() - cellarStarted) / 1000

// ---------------------------------------------------------------------------
// Derived per draft
// ---------------------------------------------------------------------------

/** The acts a marker would name, by the source order the rules propose. */
function namedActs(r: Row): { acts: Act[]; source: string } {
  if (r.law.acts.length) return { acts: r.law.acts, source: 'Gesetzestext' }
  if (r.erl.acts.length) return { acts: r.erl.acts, source: 'Erläuterungen' }
  if (r.vorblatt.actsZiele.length) return { acts: r.vorblatt.actsZiele, source: 'Vorblatt-Ziele' }
  if (r.titleActs.length) return { acts: r.titleActs, source: 'Titel' }
  return { acts: [], source: '—' }
}

/** The earliest transposition date of every directive among `acts`, per directive. */
function deadlines(acts: Act[]): { celex: string; deadline: string; last: string }[] {
  return acts
    .filter((a) => a.kind === 'richtlinie')
    .map((a) => ({ celex: a.celex, deadline: answers.get(a.celex)?.transposition[0] ?? '', last: answers.get(a.celex)?.transposition.at(-1) ?? '' }))
    .filter((d) => d.deadline)
}

/**
 * The directive with the latest (earliest-per-directive) transposition date
 * — the one the draft most likely adds. The Cellar does not say which of a
 * directive's dates is the general deadline: for 2024/1275 it answers
 * 2025-01-01 and 2026-05-29, and the Erläuterungen call the second the
 * deadline „großteils". So the newest directive's LAST date is carried as
 * the other bound.
 */
function newestDirective(dl: { deadline: string; last: string }[]): { deadline: string; last: string } {
  return [...dl].sort((a, b) => a.deadline.localeCompare(b.deadline)).at(-1)!
}

function newestDeadline(dl: { deadline: string; last: string }[]): string {
  return newestDirective(dl).deadline
}

const days = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

/** The proposed marker: the Vorblatt says EU, or the law text carries a hint. */
const isUmsetzung = (r: Row): boolean => r.vorblatt.cls === 'umsetzung' || r.vorblatt.cls === 'frei-umsetzung'
const markerFires = (r: Row): boolean => EU_YES.has(r.vorblatt.cls) || r.law.signal !== null
const erlOnly = (r: Row): boolean => !markerFires(r) && r.erl.signal !== null

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pad = (s: string | number, n: number) => String(s).padStart(n)
const share = (n: number, of: number) => `${pad(n, 4)}  ${of ? ((n / of) * 100).toFixed(1).padStart(5) : '    —'} %`

const populations: { label: string; rows: Row[] }[] = [
  { label: `Ministerialentwürfe ${gp} mit RIS-Zwilling`, rows: rows.filter((r) => r.me) },
  { label: `RIS-Fenster ab ${since}: Gesetze`, rows: rows.filter((r) => r.inWindow && r.cls === 'gesetz') },
  { label: `RIS-Fenster ab ${since}: Verordnungen`, rows: rows.filter((r) => r.inWindow && r.cls === 'verordnung') },
  { label: `RIS-Fenster ab ${since}: sonstige`, rows: rows.filter((r) => r.inWindow && r.cls === 'other') },
].filter((p) => p.rows.length)

console.log(`\n## a. Abdeckung des Vorblatts`)
console.log(`${gp}: ${mes.length} Ministerialentwürfe, davon ohne RIS-Zwilling ${meWithoutTwin.length}`)
for (const m of meWithoutTwin) console.log(`  ${m.cite.padEnd(9)} ${m.status.padEnd(10)} ${m.title.slice(0, 80)}`)
for (const p of populations) {
  const n = p.rows.length
  const v = p.rows.map((r) => r.vorblatt)
  console.log(`\n### ${p.label} (n = ${n})`)
  console.log(`  Vorblatt/WFA-Dokument im Satz          ${share(v.filter((x) => x.docs > 0).length, n)}`)
  console.log(`    davon mit PDF                        ${share(v.filter((x) => x.withPdf > 0).length, n)}`)
  console.log(`    davon mit Textschicht                ${share(v.filter((x) => x.withText > 0).length, n)}`)
  console.log(`    davon mit EU-Überschrift             ${share(v.filter((x) => x.withHeading > 0).length, n)}`)
  console.log(`  Satz aus dem Erläuterungen-PDF (Bündel) ${share(v.filter((x) => x.source === 'erl-pdf').length, n)}`)
  console.log(`  Klassen:`)
  for (const c of CLASS_RANK) {
    const k = v.filter((x) => x.cls === c).length
    if (k) console.log(`    ${c.padEnd(22)} ${share(k, n)}`)
  }
}

const variants = new Map<string, { n: number; cls: VorblattClass }>()
for (const r of rows) {
  for (const s of r.vorblatt.sentences) {
    const key = s.replace(/\s*\.$/, '').trim()
    variants.set(key, { n: (variants.get(key)?.n ?? 0) + 1, cls: classifyVorblattSentence(s) })
  }
}
console.log(`\n### Jede Satzvariante unter der EU-Überschrift (alle gelesenen Sätze, Punkt am Ende ignoriert)`)
for (const [s, { n, cls }] of [...variants].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${pad(n, 4)}  ${cls.padEnd(19)} „${s.slice(0, 400)}"`)

console.log(`\n## b. Welcher Akt — Entwürfe mit Vorblatt „Umsetzung" oder „flankierend"`)
for (const p of populations) {
  const eu = p.rows.filter((r) => ['umsetzung', 'frei-umsetzung', 'flankierend-rl', 'flankierend-vo'].includes(r.vorblatt.cls))
  if (!eu.length) continue
  console.log(`\n### ${p.label}`)
  for (const group of [
    { label: 'Umsetzung (Toolsatz oder Freitext)', rows: eu.filter((r) => isUmsetzung(r)) },
    { label: 'flankierend', rows: eu.filter((r) => !isUmsetzung(r)) },
  ]) {
    const n = group.rows.length
    if (!n) continue
    const any = group.rows.filter((r) => namedActs(r).acts.length)
    console.log(`  ${group.label} (n = ${n})`)
    console.log(`    Akt im Gesetzestext (Umsetzungshinweis)  ${share(group.rows.filter((r) => r.law.acts.length).length, n)}`)
    console.log(`    Signal im Gesetzestext ohne Akt         ${share(group.rows.filter((r) => r.law.signal && !r.law.acts.length).length, n)}`)
    console.log(`    Akt in den Erläuterungen (Allg. Teil)   ${share(group.rows.filter((r) => r.erl.acts.length).length, n)}`)
    console.log(`    Akt im Titel                            ${share(group.rows.filter((r) => r.titleActs.length).length, n)}`)
    console.log(`    Akt in den Vorblatt-Zielen              ${share(group.rows.filter((r) => r.vorblatt.actsZiele.length).length, n)}`)
    console.log(`    Akt irgendwo davon                      ${share(any.length, n)}`)
    console.log(`    nirgends ein Akt                        ${share(n - any.length, n)}`)
    const per = any.map((r) => namedActs(r).acts.length)
    console.log(`    Akte je Entwurf (nach Quellreihenfolge) Median ${quantile(per, 0.5)} · p90 ${quantile(per, 0.9)} · max ${Math.max(0, ...per)}`)
    const src = new Map<string, number>()
    for (const r of any) src.set(namedActs(r).source, (src.get(namedActs(r).source) ?? 0) + 1)
    console.log(`    Quelle des genannten Akts               ${[...src].map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  }
}

console.log(`\n## c. Übereinstimmung: Vorblatt × Gesetzestext × Erläuterungen`)
function vGroup(c: ScriptClass): string {
  if (c === 'umsetzung') return 'V:Umsetzung'
  if (c === 'frei-umsetzung') return 'V:Umsetzung(frei)'
  if (c === 'frei-nein') return 'V:nicht-EU(frei)'
  if (c === 'flankierend-rl' || c === 'flankierend-vo') return 'V:flankierend'
  if (c === 'nur-zwingend' || c === 'ueber-umsetzung') return 'V:sonst-EU'
  if (c === 'eu-keine-umsetzung') return 'V:EU-ohne-Umsetzung'
  if (c === 'nicht-eu') return 'V:nicht-EU'
  if (c === 'freitext') return 'V:Freitext'
  return 'V:fehlt'
}
const lGroup = (r: Row) => (!r.law.available ? 'G:—' : `G:${r.law.signal ?? 'kein'}`)
const eGroup = (r: Row) => (!r.erl.available ? 'E:—' : !r.erl.general ? `E:ohneAT/${r.erl.signalAnyPart ?? 'kein'}` : `E:${r.erl.signal ?? 'kein'}`)
for (const p of populations) {
  const cells = new Map<string, number>()
  for (const r of p.rows) {
    const k = `${vGroup(r.vorblatt.cls).padEnd(20)} ${lGroup(r).padEnd(16)} ${eGroup(r)}`
    cells.set(k, (cells.get(k) ?? 0) + 1)
  }
  console.log(`\n### ${p.label} (n = ${p.rows.length})`)
  for (const [k, n] of [...cells].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${pad(n, 4)}  ${k}`)
}

/** Every disagreement, by kind — written out in full with `--out`. */
const disagreements: { kind: string; row: Row }[] = []
for (const r of rows) {
  const v: ScriptClass = r.vorblatt.cls === 'frei-nein' ? 'nicht-eu' : r.vorblatt.cls === 'frei-umsetzung' ? 'umsetzung' : r.vorblatt.cls
  if (v === 'nicht-eu' && r.law.signal) disagreements.push({ kind: 'Vorblatt „nicht im Anwendungsbereich", Gesetzestext mit Hinweis', row: r })
  if (v === 'nicht-eu' && r.erl.signal) disagreements.push({ kind: 'Vorblatt „nicht im Anwendungsbereich", Erläuterungen mit Signal', row: r })
  if (v === 'eu-keine-umsetzung' && r.law.signal === 'umsetzung') disagreements.push({ kind: 'Vorblatt „EU, dient nicht der Umsetzung", Gesetzestext sagt umgesetzt', row: r })
  if (v === 'umsetzung' && !r.law.signal) disagreements.push({ kind: 'Vorblatt „Umsetzung", Gesetzestext ohne Hinweis', row: r })
  if (EU_YES.has(v) && v !== 'umsetzung' && !r.law.signal && !r.erl.signal) disagreements.push({ kind: 'Vorblatt EU (flankierend/sonst), weder Gesetzestext noch Erläuterungen', row: r })
  if (!EU_YES.has(v) && v !== 'nicht-eu' && v !== 'eu-keine-umsetzung' && r.law.signal) disagreements.push({ kind: 'Vorblatt fehlt/unklar, Gesetzestext mit Hinweis', row: r })
}
console.log(`\n### Widersprüche (vollständig in disagreements.md)`)
const dKinds = new Map<string, number>()
for (const d of disagreements) dKinds.set(d.kind, (dKinds.get(d.kind) ?? 0) + 1)
for (const [k, n] of dKinds) console.log(`  ${pad(n, 4)}  ${k}`)

console.log(`\n### Die Muster gegen die Handzählung vom 04.11.2026`)
for (const p of populations) {
  const n = p.rows.length
  console.log(`  ${p.label}`)
  console.log(`    Gesetzestext  Handmuster ${pad(p.rows.filter((r) => r.law.handHit).length, 4)} · verfeinert ${pad(p.rows.filter((r) => r.law.signal).length, 4)} (davon mit Akt ${p.rows.filter((r) => r.law.acts.length).length}) von ${n} · Treffer ohne EU-Anker verworfen ${p.rows.reduce((s, r) => s + r.law.unanchored, 0)}`)
  console.log(`    Erläuterungen Handmuster ${pad(p.rows.filter((r) => r.erl.handHit).length, 4)} · verfeinert ${pad(p.rows.filter((r) => r.erl.signal).length, 4)} · nur „Umsetzungsfrist" ${p.rows.filter((r) => r.erl.bareFristOnly).length} · Signale ohne EU-Anker verworfen ${p.rows.reduce((s, r) => s + r.erl.unanchored, 0)}`)
  console.log(`    zitieren irgendeinen Akt: Gesetzestext ${p.rows.filter((r) => r.law.cited > 0).length} · Erläuterungen Allg. Teil ${p.rows.filter((r) => r.erl.cited > 0).length}`)
  console.log(`    Titel nennt Akt ${p.rows.filter((r) => r.titleActs.length).length} · Titel sagt Umsetzung/EU ${p.rows.filter((r) => r.titleSays).length}`)
}

// What the EU anchor costs, in words: every law-text match it dropped. A
// national „Richtlinie" here is the rule working; an Umsetzungshinweis is a miss.
console.log(`\n### Gesetzestext: ohne EU-Anker verworfene Treffer`)
for (const r of rows.filter((x) => x.law.dropped.length)) {
  for (const w of r.law.dropped) console.log(`  ${r.record.id.slice(0, 20)}  „${w.slice(0, 220)}"`)
}

console.log(`\n## d. Zum Lesen von Hand (vollständig in handread.md)`)
const ordered = [...rows].sort((a, b) => sha1(a.record.id).localeCompare(sha1(b.record.id)))
const fires = ordered.filter(markerFires).slice(0, 10)
const erlOnlyRows = ordered.filter(erlOnly).slice(0, 10)
// Fewer than ten drafts have an Erläuterungen-only signal (3 on 04.11.2026);
// the rest of the twenty are the marker cases whose ACT comes only from the
// Erläuterungen — the question when they may fill in.
const erlActRows = ordered
  .filter((r) => markerFires(r) && namedActs(r).source === 'Erläuterungen' && !fires.includes(r))
  .slice(0, Math.max(0, 20 - fires.length - erlOnlyRows.length))
console.log(`  Marker feuert: ${rows.filter(markerFires).length} · nur Erläuterungen: ${rows.filter(erlOnly).length}`)
for (const r of fires) console.log(`  Marker   ${r.record.id}  ${r.title.slice(0, 70)}`)
for (const r of erlOnlyRows) console.log(`  nur Erl. ${r.record.id}  ${r.title.slice(0, 70)}`)
for (const r of erlActRows) console.log(`  Akt/Erl. ${r.record.id}  ${r.title.slice(0, 70)}`)

console.log(`\n## e. EUR-Lex`)
const byType = (k: Act['kind']) => allActs.filter((a) => a.kind === k)
console.log(`  Nennungen im Titel eines anderen Akts verworfen („zur Änderung der …"): ${titleReferencesDropped}`)
console.log(`  genannte Akte gesamt ${allActs.length} (Richtlinien ${byType('richtlinie').length}, Verordnungen ${byType('verordnung').length}, Beschlüsse ${byType('beschluss').length}, Rahmenbeschlüsse ${byType('rahmenbeschluss').length})`)
console.log(`  Cellar antwortet mit einem Werk          ${allActs.filter((a) => answers.get(a.celex)?.found).length}`)
console.log(`  nicht abgefragt (Cellar nicht erreicht)  ${notAsked.size}`)
console.log(`  Cellar antwortet, aber kein Werk         ${allActs.filter((a) => answers.has(a.celex) && !answers.get(a.celex)!.found).length}`)
for (const a of allActs.filter((x) => answers.has(x.celex) && !answers.get(x.celex)!.found)) console.log(`     ${a.celex}  „${a.raw}"`)
const dirs = byType('richtlinie').filter((a) => answers.get(a.celex)?.found)
console.log(`  Richtlinien mit Umsetzungsdatum          ${dirs.filter((a) => answers.get(a.celex)!.transposition.length).length} von ${dirs.length}`)
console.log(`    davon mit mehreren Umsetzungsdaten     ${dirs.filter((a) => answers.get(a.celex)!.transposition.length > 1).length}`)
console.log(`  Cellar-Laufzeit dieses Laufs ${cellarSeconds.toFixed(1)} s (0 bei voller Zwischenablage)`)

function deadlineReport(label: string, group: Row[]): void {
  const withDl = group
    .map((r) => {
      const dl = deadlines(namedActs(r).acts)
      if (!dl.length || !r.record.beginn) return null
      const earliest = dl.map((d) => d.deadline).sort()[0]!
      return { r, earliest: days(earliest, r.record.beginn), latest: days(newestDeadline(dl), r.record.beginn), latestLast: days(newestDirective(dl).last, r.record.beginn) }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  console.log(`\n  ${label} (n = ${group.length}, mit Richtlinie und Datum ${withDl.length})`)
  if (!withDl.length) return
  // The HEADLINE is the newest directive's deadline. A cumulative
  // Umsetzungshinweis lists every directive the law ever implemented
  // („§ 3. Durch dieses Bundesgesetz werden 1. die Richtlinie 2005/36/EG …"),
  // and the earliest of those is two decades old: measured over it, the
  // median draft would be twelve years late (first run, 04.11.2026).
  for (const [what, pick] of [
    ['jüngste Richtlinie, erstes Datum (Schlagzeile)', (x: { latest: number }) => x.latest],
    ['jüngste Richtlinie, letztes Datum', (x: { latestLast: number }) => x.latestLast],
    ['früheste genannte Richtlinie', (x: { earliest: number }) => x.earliest],
  ] as const) {
    const d = withDl.map(pick)
    console.log(`    Beginn − Frist der ${what}, Tage: p10 ${quantile(d, 0.1)} · p25 ${quantile(d, 0.25)} · Median ${quantile(d, 0.5)} · p75 ${quantile(d, 0.75)} · p90 ${quantile(d, 0.9)}`)
    console.log(`      Begutachtung beginnt NACH dieser Frist        ${share(d.filter((x) => x > 0).length, withDl.length)}`)
    console.log(`      mehr als ein Jahr danach                       ${share(d.filter((x) => x > 365).length, withDl.length)}`)
    console.log(`      Frist liegt noch mehr als ein Jahr voraus      ${share(d.filter((x) => x < -365).length, withDl.length)}`)
  }
}
for (const p of populations) {
  console.log(`\n### ${p.label}`)
  deadlineReport('Vorblatt „Umsetzung" (Toolsatz oder Freitext)', p.rows.filter(isUmsetzung))
  deadlineReport('Marker feuert, Akt mit Frist', p.rows.filter(markerFires))
}

console.log(`\n### Begutachtungsfrist in Tagen: EU-Entwürfe (Marker) gegen alle anderen`)
function fristLine(label: string, group: Row[], fristOf: (r: Row) => number | null): void {
  const d = group.map(fristOf).filter((x): x is number => x !== null && x >= 0)
  console.log(`  ${label.padEnd(44)} n ${pad(d.length, 4)} · p25 ${pad(quantile(d, 0.25), 3)} · Median ${pad(quantile(d, 0.5), 3)} · p75 ${pad(quantile(d, 0.75), 3)}`)
}
const risFrist = (r: Row) => (r.record.beginn && r.record.ende ? days(r.record.beginn, r.record.ende) : null)
const meFrist = (r: Row) => (r.me?.frist && r.me.arrival ? days(r.me.arrival, r.me.frist) : null)
for (const p of populations) {
  console.log(`  ${p.label}`)
  fristLine('  EU (Marker), RIS Beginn→Ende', p.rows.filter(markerFires), risFrist)
  fristLine('  alle anderen, RIS Beginn→Ende', p.rows.filter((r) => !markerFires(r)), risFrist)
  fristLine('  nur Vorblatt „Umsetzung"', p.rows.filter(isUmsetzung), risFrist)
  if (p.rows.some((r) => r.me)) {
    fristLine('  EU (Marker), Liste 81 Einlangen→Frist', p.rows.filter(markerFires), meFrist)
    fristLine('  alle anderen, Liste 81 Einlangen→Frist', p.rows.filter((r) => !markerFires(r)), meFrist)
  }
}

console.log(`\n## f. Kosten`)
for (const p of populations) {
  const costs = p.rows.flatMap((r) => [...r.vorblatt.cost, ...r.law.cost, ...r.erl.cost])
  const pdf = p.rows.flatMap((r) => r.vorblatt.cost)
  const bytes = costs.reduce((s, c) => s + c.bytes, 0)
  const ms = costs.reduce((s, c) => s + c.ms, 0)
  console.log(`  ${p.label}: ${costs.length} Dokumente (davon ${pdf.length} PDF), ${(bytes / 1e6).toFixed(1)} MB, Abrufzeit Summe ${(ms / 1000).toFixed(0)} s → bei ${RIS_CONCURRENCY} parallel ≈ ${(ms / 1000 / RIS_CONCURRENCY).toFixed(0)} s`)
}
const acts = new Set(rows.filter((r) => r.me).flatMap((r) => namedActs(r).acts.map((a) => a.celex)))
console.log(`  Cellar je ${gp}: ${acts.size} Akte × 2 Abfragen`)
console.log(`  Laufzeit dieses Laufs: Lesen ${readSeconds.toFixed(0)} s (inkl. PDF-Text), gesamt ${((Date.now() - started) / 1000).toFixed(0)} s`)

// The page's own decision (`server/utils/eu/euMarker.ts`, rules D1, D2,
// D5) over the same readings — what the ProcedureCard would show, without
// the law-in-force check (D4), which needs RIS Bundesrecht and is not cached
// here. Added 04.11.2026 with the feature; everything above is unchanged.
console.log(`\n## g. Die Regel der Seite (euMarker.ts, ohne D4)`)
/** The page's decision for one row — section g and the CSV's `page_marker`. */
const pageDecision = (r: Row) => decideEuMarker({
  vorblatt: r.vorblatt.classes,
  law: { signal: r.law.actSignal, acts: r.law.acts },
  explanations: r.erl.signal === 'bezug' ? null : r.erl.signal,
})
for (const p of populations) {
  const decided = p.rows.map(pageDecision)
  const n = p.rows.length
  const count = new Map<string, number>()
  for (const d of decided) {
    const key = `${d.marker ?? 'kein Fakt'}${d.source && d.source !== 'vorblatt' ? ` (${d.source})` : ''}`
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  console.log(`  ${p.label} (n = ${n}) · widersprüchliche Vorblätter ${decided.filter((d) => d.contradicting).length}`)
  for (const [k, v] of [...count].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(36)} ${share(v, n)}`)
}

const failed = rows.filter((r) => r.error)
if (failed.length) {
  console.log(`\n## Fehler (${failed.length})`)
  for (const r of failed) console.log(`  ${r.record.id}  ${r.error}`)
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

if (outDir) {
  await mkdir(outDir, { recursive: true })
  const csvCell = (v: string | number | null | undefined) => {
    const s = String(v ?? '')
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = ['id', 'me', 'title', 'kind', 'beginn', 'frist', 'frist_tage', 'vorblatt_class', 'vorblatt_sentence', 'law_signal', 'acts_law', 'erl_signal', 'acts_erl', 'acts_title', 'acts_vorblatt_ziele', 'marker', 'acts_named', 'acts_source', 'celex', 'transposition', 'days_after_newest_deadline', 'days_after_earliest_deadline', 'page_marker', 'page_source']
  const lines = [header.join(',')]
  for (const r of [...rows].sort((a, b) => (a.record.beginn ?? '').localeCompare(b.record.beginn ?? ''))) {
    const named = namedActs(r)
    const dl = deadlines(named.acts)
    const earliest = dl.map((d) => d.deadline).sort()[0]
    const newest = dl.length ? newestDeadline(dl) : null
    lines.push([
      r.record.id,
      r.me ? `${gp} ${r.me.cite}` : '',
      r.title,
      r.cls,
      r.record.beginn,
      r.record.ende,
      risFrist(r),
      r.vorblatt.cls,
      r.vorblatt.sentences.join(' | '),
      r.law.signal,
      r.law.acts.map((a) => a.celex).join(' '),
      r.erl.signal,
      r.erl.acts.map((a) => a.celex).join(' '),
      r.titleActs.map((a) => a.celex).join(' '),
      r.vorblatt.actsZiele.map((a) => a.celex).join(' '),
      markerFires(r) ? 'ja' : '',
      named.acts.length,
      named.source,
      named.acts.map((a) => a.celex).join(' '),
      named.acts.filter((a) => a.kind === 'richtlinie').map((a) => `${a.celex}:${answers.get(a.celex)?.transposition.join('/') ?? '?'}`).join(' '),
      newest && r.record.beginn ? days(newest, r.record.beginn) : '',
      earliest && r.record.beginn ? days(earliest, r.record.beginn) : '',
      pageDecision(r).marker,
      pageDecision(r).source,
    ].map(csvCell).join(','))
  }
  await writeFile(join(outDir, 'drafts.csv'), `${lines.join('\n')}\n`)

  const quote = (r: Row): string[] => [
    `- **${r.record.id}** — ${r.cls}${r.me ? ` · ${gp} ${r.me.cite}` : ''} · Beginn ${r.record.beginn}`,
    `  - Titel: ${r.title}`,
    `  - Vorblatt (${r.vorblatt.cls}): ${r.vorblatt.sentences.map((s) => `„${s}"`).join(' / ') || '—'}`,
    ...r.vorblatt.ziele.filter((z) => actsIn(z).length).map((z) => `  - Vorblatt-Ziel: „${z.slice(0, 300)}"`),
    `  - Gesetzestext (${r.law.signal ?? 'kein Signal'}): ${r.law.windows.map((w) => `„${w.slice(0, 700)}"`).join(' / ') || '—'}`,
    `  - Erläuterungen (${r.erl.signal ?? 'kein Signal'}${r.erl.general ? '' : ', kein Allg. Teil'}): ${r.erl.paragraphs.map((p) => `„${p.slice(0, 700)}"`).join(' / ') || '—'}`,
    `  - Akte: Gesetz ${r.law.acts.map((a) => a.celex).join(' ') || '—'} · Erl ${r.erl.acts.map((a) => a.celex).join(' ') || '—'} · Titel ${r.titleActs.map((a) => a.celex).join(' ') || '—'}`,
  ]
  const dis: string[] = ['# Widersprüche Vorblatt × Gesetzestext × Erläuterungen', '', `Erzeugt von \`pnpm corpus:eu -- --out …\`, Fenster ab ${since}, ${gp}.`, '']
  for (const [kind, n] of dKinds) {
    dis.push(`## ${kind} (${n})`, '')
    for (const d of disagreements.filter((x) => x.kind === kind)) dis.push(...quote(d.row), '')
  }
  await writeFile(join(outDir, 'disagreements.md'), `${dis.join('\n')}\n`)

  const hand: string[] = ['# Von Hand zu lesen', '', 'Je zehn Fälle, deterministisch nach sha1 der RIS-ID gewählt.', '', '## Marker feuert', '']
  for (const r of fires) hand.push(...quote(r), '  - **Urteil:** ', '')
  hand.push('## Nur die Erläuterungen geben ein Signal', '')
  for (const r of erlOnlyRows) hand.push(...quote(r), '  - **Urteil:** ', '')
  hand.push('## Marker feuert, der Akt kommt nur aus den Erläuterungen', '')
  for (const r of erlActRows) hand.push(...quote(r), '  - **Urteil:** ', '')
  await writeFile(join(outDir, 'handread.md'), `${hand.join('\n')}\n`)

  const actLines = ['celex,raw,found,transposition,entry_into_force,title_de']
  for (const a of allActs) {
    const c = answers.get(a.celex)
    actLines.push([a.celex, a.raw, c?.found ? 'ja' : 'nein', c?.transposition.join(' '), c?.entryIntoForce.join(' '), c?.titleDe].map(csvCell).join(','))
  }
  await writeFile(join(outDir, 'acts.csv'), `${actLines.join('\n')}\n`)
  console.log(`\nDateien: ${join(outDir, 'drafts.csv')}, disagreements.md, handread.md, acts.csv`)
}
