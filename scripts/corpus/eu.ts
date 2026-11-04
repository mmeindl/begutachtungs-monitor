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
// EU acts: citation → CELEX
// ---------------------------------------------------------------------------

/** One EU act as a draft names it. */
interface Act {
  /** As printed, whitespace normalised */
  raw: string
  /** L Richtlinie, R Verordnung, D Beschluss/Entscheidung, F Rahmenbeschluss */
  type: 'L' | 'R' | 'D' | 'F'
  year: number
  number: number
  celex: string
}

const ORG = String.raw`\((?:EU|EG|EWG|EGKS|Euratom)(?:\s*,\s*Euratom)?\)`
const SUFFIX = String.raw`(?:EU|EG|EWG|EGKS|Euratom|JI|GASP)`
/**
 * The type word, inflected: „Richtlinie(n)", „Verordnung(en)", „Beschluss(es)",
 * „Entscheidung(en)", with the Durchführungs-/Delegierte/Rahmen- forms.
 * Case-insensitive on purpose: „Saisonarbeiter-Richtlinien (2014/36/EU)" and
 * „RL" both occur — the act number with its (EU)/EU anchor is what keeps a
 * national „Förderrichtlinie" out, not the capital R.
 */
const TYPE = String.raw`(?:(?:Durchführungs|Rahmen)?(?:richtlinie|verordnung|beschluss|entscheidung)|Delegierte[nr]?\s+(?:Richtlinie|Verordnung|Beschluss)|(?<![A-Za-zÄÖÜäöüß])(?:RL|VO))(?:en|n|es|e)?`

/** „Richtlinie (EU) 2024/1069", „Verordnung (EG) Nr. 1907/2006", „RL EU 2024/1069". */
const ACT_ORG = new RegExp(String.raw`(${TYPE})\s*(?:${ORG}|EU)\s*(Nr\.\s*)?(\d{1,4})\s*/\s*(\d{1,4})(?!\s*/\s*\d)`, 'giu')
/** „Richtlinie 2014/36/EU", „Richtlinien (2014/36/EU)", „Beschluss Nr. 1313/2013/EU". */
const ACT_SUFFIX = new RegExp(String.raw`(${TYPE})\s*\(?\s*(Nr\.\s*)?(\d{2,4})\s*/\s*(\d{1,4})\s*/\s*${SUFFIX}\b`, 'giu')
/** „RL 2019/1937", „VO 2016/679": the abbreviation with a four-digit year and no anchor at all. */
const ACT_ABBREVIATED = /(?<![A-Za-zÄÖÜäöüß])(RL|VO)\s*(\d{4})\s*\/\s*(\d{1,4})\b(?!\s*\/)/gu
/** „…, (EU) 2023/2775", „und 2014/36/EU" after a typed act: the list inherits the type. */
const ACT_CONTINUATION = new RegExp(
  String.raw`^\s*(?:,|und|sowie|oder|bzw\.)\s*(?:der|die|den|des)?\s*(?:${ORG}\s*(Nr\.\s*)?(\d{1,4})\s*/\s*(\d{1,4})(?!\s*/\s*\d)|\(?\s*(\d{2,4})\s*/\s*(\d{1,4})\s*/\s*${SUFFIX}\b)`,
  'u',
)

function typeLetter(word: string): Act['type'] {
  const w = word.toLowerCase()
  if (w.startsWith('rahmen')) return 'F'
  if (w.includes('richtlinie') || w === 'rl') return 'L'
  if (w.includes('verordnung') || w === 'vo' || w === 'voen') return 'R'
  return 'D'
}

function fullYear(y: number): number {
  return y < 100 ? 1900 + y : y
}

/**
 * Year and number from „a/b". „Nr." means the old order, number first
 * („Verordnung (EU) Nr. 517/2014"); without it a four-digit year in front is
 * the order since 2015 („Richtlinie (EU) 2024/1069"), and anything else is
 * number/year written without the „Nr." („(EU) 1303/2013").
 */
function orderOrg(nr: boolean, a: number, b: number): { year: number; number: number } {
  // „Verordnung (EU) Nr. 2022/2065": the „Nr." of the old form before the new
  // order — read year first where the second number cannot be a year.
  if (nr) return plausibleYear(b) || !plausibleYear(a) ? { year: fullYear(b), number: a } : { year: a, number: b }
  if (a >= 1990 && a <= 2030) return { year: a, number: b }
  return { year: fullYear(b), number: a }
}

/** The suffix form is year first („2014/36/EU") unless „Nr." says otherwise („Nr. 1313/2013/EU"). */
function orderSuffix(nr: boolean, a: number, b: number): { year: number; number: number } {
  return nr && plausibleYear(b) ? { year: fullYear(b), number: a } : { year: fullYear(a), number: b }
}

function plausibleYear(y: number): boolean {
  const full = fullYear(y)
  return full >= 1952 && full <= 2030
}

function makeAct(raw: string, type: Act['type'], year: number, number: number): Act | null {
  if (year < 1952 || year > 2030 || number < 1 || number > 9999) return null
  return { raw: raw.replace(/\s+/g, ' ').trim(), type, year, number, celex: `3${year}${type}${String(number).padStart(4, '0')}` }
}

/**
 * An act named inside another act's title: „Richtlinie (EU) 2019/944 … und
 * zur Änderung der Richtlinie 2012/27/EU", „… zur Aufhebung der Richtlinien
 * 2006/48/EG und 2006/49/EG". The draft implements the first, not the
 * second — run 5 (04.11.2026) counted 34 acts for one ElWG draft. „in der
 * Fassung der Richtlinie (EU) 2024/1711" stays: that is usually the act the
 * draft adds.
 */
const TITLE_REFERENCE = /(?:Änderung|Aufhebung|Ersetzung)\s+(?:der|des|von)\s*$/
/** Occurrences dropped by that rule, over the whole run. */
let titleReferencesDropped = 0

/**
 * Every act cited in `text`, in order, with list continuations; deduped by
 * CELEX. `implemented` drops the acts named inside another act's title — for
 * the windows that say which act a draft implements, not for counting
 * citations.
 */
function actsIn(text: string, implemented = false): Act[] {
  const found: { at: number; act: Act }[] = []
  const take = (at: number, end: number, type: Act['type'], order: { year: number; number: number }) => {
    const act = makeAct(text.slice(at, end), type, order.year, order.number)
    if (!act) return
    if (implemented && TITLE_REFERENCE.test(text.slice(Math.max(0, at - 40), at))) {
      // The list after it belongs to the same title: skip it as well.
      let rest = end
      for (let guard = 0; guard < 12; guard++) {
        const m = ACT_CONTINUATION.exec(text.slice(rest))
        if (!m) break
        rest += m[0].length
        titleReferencesDropped++
      }
      titleReferencesDropped++
      return
    }
    found.push({ at, act })
    // The list after it: „der Richtlinien (EU) 2022/2464 und (EU) 2023/2775".
    let rest = end
    for (let guard = 0; guard < 12; guard++) {
      const m = ACT_CONTINUATION.exec(text.slice(rest))
      if (!m) break
      const next = m[2] !== undefined
        ? orderOrg(Boolean(m[1]), Number(m[2]), Number(m[3]))
        : orderSuffix(false, Number(m[4]), Number(m[5]))
      const cont = makeAct(m[0], type, next.year, next.number)
      if (cont) found.push({ at: rest, act: cont })
      rest += m[0].length
    }
  }
  for (const m of text.matchAll(ACT_ORG)) take(m.index!, m.index! + m[0].length, typeLetter(m[1]!), orderOrg(Boolean(m[2]), Number(m[3]), Number(m[4])))
  for (const m of text.matchAll(ACT_SUFFIX)) take(m.index!, m.index! + m[0].length, typeLetter(m[1]!), orderSuffix(Boolean(m[2]), Number(m[3]), Number(m[4])))
  for (const m of text.matchAll(ACT_ABBREVIATED)) take(m.index!, m.index! + m[0].length, typeLetter(m[1]!), { year: Number(m[2]), number: Number(m[3]) })
  found.sort((a, b) => a.at - b.at)
  const seen = new Set<string>()
  return found.map((f) => f.act).filter((a) => !seen.has(a.celex) && seen.add(a.celex))
}

function uniqueActs(lists: Act[][]): Act[] {
  const seen = new Set<string>()
  return lists.flat().filter((a) => !seen.has(a.celex) && seen.add(a.celex))
}

// ---------------------------------------------------------------------------
// 1. The Vorblatt: the WFA tool's sentence
// ---------------------------------------------------------------------------

/**
 * The Vorblatt/WFA by its document name — every form in the window since
 * 2024: „Vorblatt und WFA", „WFA samt Vorblatt", „Vorblatt + WFV", „WF mit
 * Vorblatt", „wirkungsorientierte Folgenabschätzung", „Ergbnisdokument"
 * (sic), „begVorblatt_WFA", „Vbl…".
 */
const VORBLATT_NAME = /vorbl|wfa|wfv|(^|[^a-zäöüß])vbl|folgenabsch|^wf\b|erge?bnisdokument/i

const EU_HEADING = /Verhältnis\s+zu\s+den\s+Rechtsvorschriften\s+der\s+Europäischen\s+Union/
/** What follows the EU section in the WFA tool's layout. */
const AFTER_EU = /Besonderheiten\s+des\s+Normerzeugungsverfahrens|Vereinfachte\s+wirkungsorientierte|Wirkungsorientierte\s+Folgenabschätzung|Datenschutz-Folgenabschätzung|Inkrafttreten/
/** The WFA tool's page footer and header lines, cut per page before the pages are joined. */
const PAGE_NOISE = /^\s*(?:\d+\s+von\s+\d+|Seite\s+\d+(?:\s+von\s+\d+)?|www\.ris\.bka\.gv\.at.*)\s*$/i

/**
 * The fixed sentences of the WFA tool, as classes. Order matters only where
 * two could match the same sentence; none of these can.
 */
const VORBLATT_CLASSES: { cls: VorblattClass; re: RegExp }[] = [
  { cls: 'umsetzung', re: /dient\s+der\s+Umsetzung\s+(?:einer|von)\s+EU-Richtlinie/i },
  { cls: 'flankierend-vo', re: /flankierenden?\s+Regelungen\s+zu\s+(?:den\s+)?Verordnungen\s+der\s+Europäischen\s+Union/i },
  { cls: 'flankierend-rl', re: /flankierenden?\s+Regelungen\s+zu\s+(?:einer|der)\s+Richtlinie/i },
  { cls: 'ueber-umsetzung', re: /geht\s+über\s+eine\s+verpflichtende\s+Umsetzung/i },
  { cls: 'nur-zwingend', re: /ausschließlich\s+Maßnahmen\s+vor,\s+zu\s+denen\s+der\s+Bund\s+aufgrund\s+zwingender/i },
  { cls: 'eu-keine-umsetzung', re: /fallen\s+(?:zum\s+Teil\s+)?in\s+den\s+Anwendungsbereich\s+des\s+Rechts\s+der\s+Europäischen\s+Union,\s+dienen\s+aber\s+nicht/i },
  { cls: 'nicht-eu', re: /fallen\s+nicht\s+in\s+den\s+Anwendungsbereich\s+des\s+Rechts\s+der\s+Europäischen\s+Union/i },
]

type VorblattClass =
  | 'umsetzung'
  | 'flankierend-vo'
  | 'flankierend-rl'
  | 'ueber-umsetzung'
  | 'nur-zwingend'
  | 'eu-keine-umsetzung'
  | 'nicht-eu'
  /** free text that says it implements („dient der Umsetzung der Richtlinie (EU) 2024/2749") */
  | 'frei-umsetzung'
  /** free text that says no („Unionsrecht ist nicht betroffen", „steht im Einklang mit") */
  | 'frei-nein'
  /** any other free text — an aid, a goal, a mention */
  | 'freitext'
  /** a text layer, but no EU heading */
  | 'ohne-ueberschrift'
  /** a PDF without text */
  | 'kein-text'
  /** a Vorblatt document, but no PDF of it */
  | 'kein-pdf'
  | 'kein-vorblatt'

/** How firmly a class says „EU" — the order in which several Vorblätter of one draft are combined. */
const CLASS_RANK: VorblattClass[] = [
  'umsetzung',
  'flankierend-rl',
  'flankierend-vo',
  'nur-zwingend',
  'ueber-umsetzung',
  'frei-umsetzung',
  'freitext',
  'eu-keine-umsetzung',
  'frei-nein',
  'nicht-eu',
  'ohne-ueberschrift',
  'kein-text',
  'kein-pdf',
  'kein-vorblatt',
]

/** The marker classes: the Vorblatt says the draft implements or flanks EU law. */
const EU_YES: ReadonlySet<VorblattClass> = new Set(['umsetzung', 'flankierend-rl', 'flankierend-vo', 'nur-zwingend', 'ueber-umsetzung', 'frei-umsetzung'])

interface VorblattRead {
  /** Vorblatt documents by name, with a PDF of them, with text, with the heading */
  docs: number
  withPdf: number
  withText: number
  withHeading: number
  /** Where the sentence came from when no Vorblatt document exists */
  source: 'vorblatt' | 'erl-pdf' | null
  cls: VorblattClass
  /** Every EU section's text, normalised */
  sentences: string[]
  /** Acts anywhere in the Vorblatt/WFA, and those in a „Ziel n:" line */
  actsAll: Act[]
  actsZiele: Act[]
  ziele: string[]
  cost: FetchCost[]
}

/**
 * What the ressorts write instead of the tool's sentence — measured in the
 * first run (04.11.2026): „Das Vorhaben dient der Umsetzung der Richtlinie
 * (EU) 2024/2749 und …", „Dient auch der Umsetzung der Richtlinie
 * 2005/36/EG", „… ausschließlich zur Umsetzung von zwei EU- Richtlinien",
 * „… im Sinne der Durchführungsverordnung (EU) 2019/947 umgesetzt werden".
 */
const FREE_YES = /\bUmsetzung\s+(?:einer|der|von|zweier|mehrerer)\s+[^.]{0,40}?(?:Richtlinie|Richtlinien)\b|\bUmsetzung\s+(?:von|der)\s+(?:zwei|mehreren)\s+EU-\s?Richtlinien|(?:Richtlinie|Verordnung)[^.]{0,120}?umgesetzt\s+werden|aus\s+zwingendem\s+Unionsrecht\s+ergeben/i
/** „Unionsrecht wird nicht tangiert", „nicht berührt", „keine Auswirkungen", „im Einklang mit". */
const FREE_NO = /nicht\s+(?:tangiert|betroffen|berührt)|keine\s+Auswirkungen\s+auf\s+Rechtsvorschriften|im\s+Einklang\s+mit|nicht\s+in\s+den\s+Anwendungsbereich/i

function classify(sentence: string): VorblattClass {
  const fixed = VORBLATT_CLASSES.find((c) => c.re.test(sentence))?.cls
  // „… flankierenden Regelungen zu Verordnungen … und dient der Umsetzung
  // mehrerer Richtlinien": the tool sentence plus an implementation.
  if (fixed && fixed !== 'umsetzung' && EU_YES.has(fixed) && FREE_YES.test(sentence)) return 'umsetzung'
  if (fixed) return fixed
  if (FREE_YES.test(sentence)) return 'frei-umsetzung'
  if (FREE_NO.test(sentence)) return 'frei-nein'
  return 'freitext'
}

/** The EU section of one WFA text: everything between the heading and the next WFA heading. */
function euSection(pages: string[]): string | null {
  const text = pages
    .map((p) => p.split('\n').filter((line) => !PAGE_NOISE.test(line)).join('\n'))
    .join('\n')
  const head = EU_HEADING.exec(text)
  if (!head) return null
  const rest = text.slice(head.index + head[0].length)
  const end = AFTER_EU.exec(rest)
  // „: Die vorgesehenen …", „[Profil] Suchwert: p Das Vorhaben …" — form residue before the sentence.
  return rest.slice(0, end ? end.index : 600).replace(/\s+/g, ' ').replace(/^(?:\[Profil\]\s*Suchwert:\s*\S+\s*|[:\s])+/, '').trim()
}

/** „Ziel 1: vollständige und korrekte Umsetzung der RL EU 2024/1069 …" — one entry per Ziel. */
function zieleOf(pages: string[]): string[] {
  const text = pages.join('\n').replace(/\s+/g, ' ')
  const ziele = [...text.matchAll(/Ziel\s+\d+:\s*(.{0,300}?)(?=Ziel\s+\d+:|Beschreibung\s+des\s+Ziels|Wie\s+sieht|Dokumentinformationen|Umsetzung\s+durch|Inhalt|Maßnahme\s+\d+:|$)/g)]
  return [...new Set(ziele.map((m) => m[1]!.trim()))]
}

async function readVorblatt(record: RisBegutFlat): Promise<VorblattRead> {
  const docs = record.otherDocuments.filter((d) => VORBLATT_NAME.test(d.name.normalize('NFC')))
  const out: VorblattRead = { docs: docs.length, withPdf: 0, withText: 0, withHeading: 0, source: null, cls: 'kein-vorblatt', sentences: [], actsAll: [], actsZiele: [], ziele: [], cost: [] }
  const classes: VorblattClass[] = []
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
    const chars = pages.join('').replace(/\s/g, '').length
    if (chars < 200) {
      if (source === 'vorblatt') classes.push('kein-text')
      continue
    }
    if (source === 'vorblatt') out.withText++
    const section = euSection(pages)
    if (section === null) {
      if (source === 'vorblatt') classes.push('ohne-ueberschrift')
      continue
    }
    if (source === 'vorblatt') out.withHeading++
    out.source ??= source
    out.sentences.push(section)
    classes.push(classify(section))
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
// 2. The law text: the Umsetzungshinweis
// ---------------------------------------------------------------------------

type Signal = 'umsetzung' | 'durchfuehrung' | 'bezug'

/** A § heading that announces the EU reference; its text follows in the next blocks. */
const LAW_HEADING = /^(?:Umsetzungshinweis(?:e)?|Hinweis auf (?:die )?Umsetzung|Bezugnahmen? auf (?:das )?Unionsrecht|Bezugnahmen? auf Rechtsakte der (?:Europäischen )?Union|(?:Durchführung und )?Umsetzung von Rechtsakten der (?:Europäischen )?Union|Unionsrechtliche Bezugnahmen?|Bezugnahme auf Richtlinien|Umsetzung (?:von|der) (?:Unionsrecht|Richtlinien?|EU-Richtlinien?)(?:\b.*)?|Richtlinienumsetzung|Verweisungen? auf (?:das )?Unionsrecht|Unionsrecht|Durchführung (?:von|der) (?:Unionsrecht|Verordnungen?)(?:\b.*)?)\.?$/i
/** The heading word inside a longer heading line. */
const LAW_HEADING_WORD = /Umsetzungshinweis|Bezugnahmen?\s+auf\s+(?:das\s+)?Unionsrecht|Bezugnahmen?\s+auf\s+Rechtsakte\s+der\s+(?:Europäischen\s+)?Union|Umsetzung\s+von\s+(?:Unionsrecht|Rechtsakten\s+der\s+(?:Europäischen\s+)?Union)/
/** A sentence inside one Absatz that implements or flanks. */
// „wird/werden … Richtlinie … umgesetzt" with its subject, not any
// „umgesetzt" after a Richtlinie: the WiEReG's „Staaten …, die den Nachweis
// gemäß Verordnung (EU) Nr. 910/2014 nicht umgesetzt haben" is a provision,
// not a hint (hand reading, 04.11.2026).
// „werden die Vorgaben folgender Rechtsakte der Europäischen Union …
// umgesetzt: 1. IE-Richtlinie" (the AEVs) and „werden folgende Rechtsakte
// der Union umgesetzt bzw. berücksichtigt" (BVergG) name the act after the verb.
// The act may stand far from the verb („werden für den Bereich des
// Mineralrohstoffrechts Art. 3 … der Richtlinie 2010/75/EU … umgesetzt") and
// may be a Durchführungsbeschluss (Tabak- und Nikotinsucht-Gesetz).
const LAW_UMSETZUNG = /Umsetzungshinweis|\b(?:wird|werden)\s+[\s\S]{0,300}?\b(?:Richtlinien?|RL|Rechtsakte?|Durchführungsbeschlusses|Durchführungsbeschluss|Beschluss)\b[\s\S]{0,800}?(?<!nicht\s)\bumgesetzt\b|dient\s+(?:der|zur)\s+Umsetzung|zur\s+Umsetzung\s+(?:der|von|einer)\s+[\s\S]{0,60}?Richtlinie/
const LAW_DURCHFUEHRUNG = /Bezugnahmen?\s+auf\s+(?:das\s+)?Unionsrecht|Durchführung\s+(?:der|von|zur)\s+[\s\S]{0,40}?(?:Verordnung|Durchführungsverordnung|Delegierten\s+Verordnung)\s*\((?:EU|EG)|begleitende[n]?\s+(?:Regelungen|Bestimmungen|Maßnahmen)\s+zu[rm]?\s+(?:unmittelbar\s+anwendbaren\s+)?(?:Verordnung|Durchführungsverordnung)|flankierende[n]?\s+(?:Regelungen|Bestimmungen)\s+zu/

/** The hand count's law-text pattern of 04.11.2026, kept to show what the refinement changed. */
const HAND_LAW = /Umsetzungshinweis|Bezugnahme auf (?:das )?Unionsrecht|wird die (?:Richtlinie|Durchführungsrichtlinie|Delegierte Richtlinie)[^.]{0,400}?umgesetzt|werden (?:die|folgende) Richtlinien[^.]{0,600}?umgesetzt|dient der Umsetzung der Richtlinie|Durchführung der Verordnung \(EU\)|begleitende(?:n)? (?:Regelungen|Bestimmungen|Maßnahmen) zur (?:unmittelbar anwendbaren )?(?:Verordnung|Durchführungsverordnung) \(EU\)/

/** Kinds that end the window a heading opens. */
const WINDOW_END: ReadonlySet<string> = new Set(['para_head', 'article', 'section', 'title', 'novao'])

interface LawRead {
  available: boolean
  signal: Signal | null
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

/**
 * What a window says, with its heading word taken out first: under
 * „Umsetzungshinweis" the MiCA-Vollzugsgesetz writes „dient dem Wirksamwerden
 * der Verordnung (EU) 2023/1114" — that flanks a regulation, it implements
 * nothing.
 */
function signalOf(text: string): Signal {
  const body = text.replace(/Umsetzungshinweis(?:e)?/g, '')
  if (/umgesetzt|\bUmsetzung\s+(?:der|von|einer|des)\b/.test(body)) return 'umsetzung'
  if (/Durchführung|Wirksamwerden|begleitend|flankierend|unmittelbar anwendbar|Verordnung/.test(body)) return 'durchfuehrung'
  return 'bezug'
}

const SIGNAL_RANK: Signal[] = ['umsetzung', 'durchfuehrung', 'bezug']
const strongest = (s: Signal[]): Signal | null => SIGNAL_RANK.find((k) => s.includes(k)) ?? null

function readLawBlocks(blocks: TextBlock[]): Omit<LawRead, 'available' | 'cost' | 'handHit'> {
  const windows: string[] = []
  const signals: Signal[] = []
  let unanchored = 0
  const dropped: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!
    const text = blockText(b)
    // The table of contents names the Umsetzungshinweis without its text.
    if (b.kind === 'toc') continue
    // A heading, however RIS typed it: „Umsetzungshinweis" as a § heading,
    // as a quoted heading inside a Novellierungsanordnung, as „§ 21a.
    // Umsetzungshinweis", or in a combined heading („Vollziehung,
    // Inkrafttreten, Übergangsbestimmungen, Umsetzungshinweis") — run 4.
    const bare = b.text.replace(/^[\s"„]+|[\s"“]+$/g, '').replace(/^§\s*\d+[a-z]*\.\s*/, '').trim()
    const headed = b.kind !== 'abs' && b.kind !== 'novao'
      ? LAW_HEADING.test(bare) || (bare.length < 140 && LAW_HEADING_WORD.test(bare))
      : bare.length < 60 && LAW_HEADING.test(bare)
    const inline = LAW_UMSETZUNG.test(text) || LAW_DURCHFUEHRUNG.test(text)
    if (!headed && !inline) continue
    // A heading (or a Novellierungsanordnung naming one) opens a window to
    // the next provision; a sentence is read in its own Absatz only.
    let window = text
    // „… werden folgende Richtlinien umgesetzt:" — the acts are the list below it.
    // „… werden folgende Richtlinien umgesetzt:", „§ 327. Dieses Bundesgesetz
    // dient der Umsetzung" — a sentence that does not end goes on below.
    if (headed || b.kind === 'novao' || !/[.;]["“]?\s*$/.test(text)) {
      const parts = [text]
      for (let j = i + 1; j < blocks.length && j <= i + 12; j++) {
        if (WINDOW_END.has(blocks[j]!.kind)) break
        parts.push(blockText(blocks[j]!))
      }
      window = parts.join(' ')
    }
    window = window.replace(/\s+/g, ' ').trim()
    // A sentence without anything European in it is a national „Richtlinie"
    // („… Richtlinien zur Erstellung dieser Maßnahmenpakete …") or a national
    // goal („dient der Umsetzung eines anbieterübergreifenden
    // Einzahlungslimits") — first run, 04.11.2026. A heading is its own anchor.
    if (!headed && !EU_ANCHOR.test(window) && !actsIn(window).length) {
      unanchored++
      dropped.push(window)
      continue
    }
    // A window inside another is the same provision read twice — the
    // table of contents' „Umsetzungshinweis" beside the § it names.
    if (windows.some((w) => w.includes(window))) continue
    for (let k = windows.length - 1; k >= 0; k--) {
      if (window.includes(windows[k]!)) {
        windows.splice(k, 1)
        signals.splice(k, 1)
      }
    }
    windows.push(window)
    signals.push(signalOf(window))
  }
  const plain = blocks.map(blockText).join(' ')
  return { signal: strongest(signals), windows, acts: uniqueActs(windows.map((w) => actsIn(w, true))), cited: actsIn(plain).length, unanchored, dropped }
}

async function readLaw(record: RisBegutFlat): Promise<LawRead> {
  const url = record.mainDocument.xml
  if (!url) return { available: false, signal: null, windows: [], acts: [], cited: 0, unanchored: 0, dropped: [], handHit: false, cost: [] }
  const { text, cost } = await fetchRisText(url)
  const blocks = parseRisXml(text)
  const plain = blocks.map(blockText).join(' ')
  return { available: blocks.length > 0, ...readLawBlocks(blocks), handHit: HAND_LAW.test(plain), cost: [cost] }
}

// ---------------------------------------------------------------------------
// 3. The Erläuterungen: the Allgemeiner Teil
// ---------------------------------------------------------------------------

/**
 * Per Absatz of the Allgemeiner Teil. The bare „Umsetzungsfrist" of the hand
 * count is gone — it fired on „Umsetzungsfrist von 48 Monaten ab Gewährung
 * der Förderung"; a deadline counts only beside a Richtlinie.
 */
const ERL_UMSETZUNG = /dient\s+(?:der|zur)\s+Umsetzung|(?:der|zur)\s+Umsetzung\s+(?:der|von|einer|dieser|des)\s+(?:[^.]{0,60}?\s)?(?:Richtlinie|RL\b|unionsrechtlich|Unionsrecht|EU-Richtlinie|Vorgaben\s+der\s+Richtlinie)|\b(?:Richtlinien?|RL)\b[\s\S]{0,300}?\b(?:umgesetzt|umzusetzen|Umsetzungsfrist)\b|in\s+(?:nationales|innerstaatliches|österreichisches)\s+Recht\s+(?:umgesetzt|umzusetzen|zu\s+übernehmen)/
const ERL_DURCHFUEHRUNG = /begleitende[n]?\s+(?:Regelungen|Bestimmungen|Maßnahmen)\s+zu[rm]?\s+(?:unmittelbar\s+anwendbaren\s+)?(?:Verordnung|Durchführungsverordnung|Delegierten\s+Verordnung|EU-Verordnung)|Durchführung\s+(?:der|von|zur)\s+[\s\S]{0,40}?(?:Verordnung|Durchführungsverordnung)\s*\((?:EU|EG)|unmittelbar\s+anwendbare[nr]?\s+(?:Verordnung|Unionsrecht|EU-Verordnung)|flankierende[n]?\s+(?:Regelungen|Bestimmungen|Maßnahmen)/
/** Without an EU anchor in the same Absatz a signal is a national „Richtlinie" or a programme. */
const EU_ANCHOR = /\((?:EU|EG|EWG)\)|\/E(?:U|G|WG)\b|Europäische[nr]?\s+Union|Unionsrecht|unionsrechtlich|EU-|[A-Za-zÄÖÜäöüß]-Richtlinie\b/
/** A passage heading of the Allgemeiner Teil that is the EU section itself. */
const ERL_EU_HEADING = /Unionsrecht|Europäischen\s+Union|EU-Recht|Verhältnis\s+zu(?:m)?\s+(?:den\s+)?Rechtsvorschriften/i

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

function partParagraphs(part: ExplanationsPart): { text: string; euHeading: boolean }[] {
  return part.passages.flatMap((p) => {
    const euHeading = ERL_EU_HEADING.test(p.heading ?? '')
    return [...(p.heading ? [p.heading] : []), ...p.text].map((text) => ({ text, euHeading }))
  })
}

function readErlParts(parts: ExplanationsPart[]): { signal: Signal | null; paragraphs: string[]; acts: Act[]; unanchored: number } {
  const paragraphs: string[] = []
  const signals: Signal[] = []
  let unanchored = 0
  for (const { text, euHeading } of parts.flatMap(partParagraphs)) {
    const ums = ERL_UMSETZUNG.test(text)
    const dur = ERL_DURCHFUEHRUNG.test(text)
    if (!ums && !dur) continue
    if (!euHeading && !EU_ANCHOR.test(text)) {
      unanchored++
      continue
    }
    paragraphs.push(text.replace(/\s+/g, ' ').trim())
    signals.push(ums ? 'umsetzung' : 'durchfuehrung')
  }
  return { signal: strongest(signals), paragraphs, acts: uniqueActs(paragraphs.map((t) => actsIn(t, true))), unanchored }
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
  const generalText = general ? partParagraphs(general).map((p) => p.text).join(' ') : ''
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
        vorblatt: { docs: 0, withPdf: 0, withText: 0, withHeading: 0, source: null, cls: 'kein-vorblatt', sentences: [], actsAll: [], actsZiele: [], ziele: [], cost: [] },
        law: { available: false, signal: null, windows: [], acts: [], cited: 0, unanchored: 0, dropped: [], handHit: false, cost: [] },
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
    .filter((a) => a.type === 'L')
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
    variants.set(key, { n: (variants.get(key)?.n ?? 0) + 1, cls: classify(s) })
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
function vGroup(c: VorblattClass): string {
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
  const v: VorblattClass = r.vorblatt.cls === 'frei-nein' ? 'nicht-eu' : r.vorblatt.cls === 'frei-umsetzung' ? 'umsetzung' : r.vorblatt.cls
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
const byType = (t: Act['type']) => allActs.filter((a) => a.type === t)
console.log(`  Nennungen im Titel eines anderen Akts verworfen („zur Änderung der …"): ${titleReferencesDropped}`)
console.log(`  genannte Akte gesamt ${allActs.length} (Richtlinien ${byType('L').length}, Verordnungen ${byType('R').length}, Beschlüsse ${byType('D').length}, Rahmenbeschlüsse ${byType('F').length})`)
console.log(`  Cellar antwortet mit einem Werk          ${allActs.filter((a) => answers.get(a.celex)?.found).length}`)
console.log(`  nicht abgefragt (Cellar nicht erreicht)  ${notAsked.size}`)
console.log(`  Cellar antwortet, aber kein Werk         ${allActs.filter((a) => answers.has(a.celex) && !answers.get(a.celex)!.found).length}`)
for (const a of allActs.filter((x) => answers.has(x.celex) && !answers.get(x.celex)!.found)) console.log(`     ${a.celex}  „${a.raw}"`)
const dirs = byType('L').filter((a) => answers.get(a.celex)?.found)
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
  const header = ['id', 'me', 'title', 'kind', 'beginn', 'frist', 'frist_tage', 'vorblatt_class', 'vorblatt_sentence', 'law_signal', 'acts_law', 'erl_signal', 'acts_erl', 'acts_title', 'acts_vorblatt_ziele', 'marker', 'acts_named', 'acts_source', 'celex', 'transposition', 'days_after_newest_deadline', 'days_after_earliest_deadline']
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
      named.acts.filter((a) => a.type === 'L').map((a) => `${a.celex}:${answers.get(a.celex)?.transposition.join('/') ?? '?'}`).join(' '),
      newest && r.record.beginn ? days(newest, r.record.beginn) : '',
      earliest && r.record.beginn ? days(earliest, r.record.beginn) : '',
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
