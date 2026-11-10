/**
 * Landesgesetze without a Begutachtung — may a list say so per law, as the
 * Bund's does (`ohneBegutachtung.ts`, docs/architecture.md §12.68)? The
 * measurement before anything is built, for Salzburg and Burgenland
 * (10.11.2026).
 *
 * The Bund has a hard key: a Ministerialentwurf's stage record links its
 * Regierungsvorlage. A Land has none — the app joins a Land's draft to its
 * Landesgesetzblatt BY TITLE (`matchLgbl`, §12.43), and every consulted
 * draft that join misses would make its law look unconsulted. So each law
 * is put in one of three tiers, never blended:
 *
 *  - `consulted`: a draft of the Land's register is joined to it by the
 *    production title match, exactly as `lgblAssignment` does it
 *    (`READERS[land].all()` against `fetchLgblIndex`, `matchLgbl`).
 *  - `unknown`: no join, but a draft of the register begun before the
 *    Beschluss (within `RELAXED_DAYS`) shares enough of the law's
 *    distinctive title words (overlap coefficient ≥ `--threshold`; the
 *    calibration table shows what each threshold costs).
 *  - `none`: neither.
 *
 * Then, where the Landtag's material can be read (Salzburg: RIS links the
 * Regierungsvorlage, the Initiativantrag and the committee's report), every
 * `unknown` and `none` law's documents and a fixed sample of `consulted`
 * ones are searched for „Begutachtung" — the Vorlage's Erläuterungen say
 * whether one was held. That is a signal, not a tier: it is printed beside
 * the tier.
 *
 * WHAT IS PRODUCTION HERE: the register parsers and groupers
 * (`parseSalzburgRegister`, `salzburgDrafts`, `parseBgldPage`,
 * `bgldNextPage`, `LandSession`), the LGBl index (`fetchLgblIndex`, its
 * Nitro cache wrapper replaced by the identity), the title match
 * (`matchLgbl`, `lgblWords`) and the PDF text (`pagesOfBytes`). WHAT IS
 * NOT: the page loop of Burgenland's views (sources.ts's `readBgldPages`,
 * ten lines inside a Nitro module, mirrored), and the text decision that
 * moves or refutes a Salzburg title find (`texts/kundmachung.ts`, which
 * reads the draft PDF and up to five Vorlagen per draft) — measured on
 * 153 finds at 2 moved and 3 refuted (§12.47), so the `consulted` tier here
 * can hold a handful of laws the page would not join, and miss as many.
 *
 * Usage:
 *   pnpm corpus:laender-ohne-begutachtung                       # sbg and bgld
 *   pnpm corpus:laender-ohne-begutachtung -- --land sbg
 *   pnpm corpus:laender-ohne-begutachtung -- --threshold 0.5
 *   pnpm corpus:laender-ohne-begutachtung -- --land sbg --search wohnbau,förderung   # register by hand
 *   pnpm corpus:laender-ohne-begutachtung -- --no-docs          # skip the Landtag documents
 *
 * Every upstream answer is kept under `.cache/laender-ohne-begutachtung/`
 * (RIS pages by URL hash, the Salzburg register as HTML, each Burgenland
 * view's pages, each Landtag PDF), so a rerun makes no request. Pace: RIS
 * pages as the index reads them; Salzburg one register page; Burgenland one
 * view at a time (production reads two); Landtag PDFs two at a time.
 *
 * Runs with `-c vitest.config.ts`: the Land modules import `#shared`.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LandConsultation } from '../../shared/types'
import { todayIso } from '../../shared/utils/format'
import { parseSalzburgRegister, salzburgDrafts, SALZBURG_REGISTERS } from '../../server/utils/laender/salzburg'
import { BGLD_CURRENT, BGLD_FIRST_YEAR, BGLD_ORIGIN, bgldArchiveUrl, bgldNextPage, parseBgldPage } from '../../server/utils/laender/burgenland'
import { LandSession } from '../../server/utils/laender/session'
import { matchLgbl, lgblWords, type LgblEntry } from '../../server/utils/laender/lgblSearch'
import { pagesOfBytes } from '../../server/utils/laender/texts/read'
import { getBytes, getText } from '../lib/http'
import { cachedJson, cachedText } from '../lib/diskCache'
import { pool } from '../lib/async'
import { argFlag, argPair } from '../lib/args'

const SCRIPT = 'corpus/laenderOhneBegutachtung'
const CACHE = join('.cache', 'laender-ohne-begutachtung')
const FROM = '2016-01-01'
const TODAY = todayIso()
const DOC_CONCURRENCY = 2
const SAMPLE_SEED = 20261110
const HAND_SAMPLE = 25

type Land = 'sbg' | 'bgld'
const LANDS: Land[] = (argPair('land') ? [argPair('land') as Land] : ['sbg', 'bgld'])
const threshold = Number(argPair('threshold') ?? '0.5')
/** The relaxed check looks this far back from the Beschluss for a draft. */
const RELAXED_DAYS = Number(argPair('window') ?? '730')
const search = argPair('search')
const withDocs = !argFlag('no-docs')
const say = (line = '') => console.log(line)
const http = { script: SCRIPT, attempts: 3, backoffMs: (n: number) => 2000 * n, timeoutMs: 60_000 }

for (const dir of ['ris', 'sbg', 'bgld', 'docs']) mkdirSync(join(CACHE, dir), { recursive: true })
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex')

// ---------------------------------------------------------------------------
// RIS through the production index, every page kept on disk
// ---------------------------------------------------------------------------

/* The raw RIS pages the index read, for the fields it does not keep
   (Initiativantrag, the Typ of each record). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const risPages: any[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.startsWith('https://data.bka.gv.at/')) return realFetch(input, init)
  const file = join(CACHE, 'ris', `${sha1(url)}.json`)
  let body: string
  if (existsSync(file)) body = readFileSync(file, 'utf8')
  else {
    const res = await realFetch(input, init)
    if (!res.ok) return res
    body = await res.text()
    JSON.parse(body)
    writeFileSync(file, body)
  }
  if (url.includes('Applikation=LgblAuth')) risPages.push(JSON.parse(body))
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

// The index's Nitro cache, as the identity: the read is the production one.
Object.assign(globalThis, { defineCachedFunction: <A extends unknown[], T>(fn: (...a: A) => Promise<T>) => fn })
const { fetchLgblIndex } = await import('../../server/utils/laender/lgblIndex')

interface Route { vorlage: string | null; vorlageUrl: string | null; antrag: string | null; antragUrl: string | null; ausschuss: string | null; ausschussUrl: string | null; beschluss: string | null; periode: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function routesOf(pages: any[]): Map<string, Route> {
  const out = new Map<string, Route>()
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  for (const page of pages) {
    const refs = page?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference
    for (const ref of Array.isArray(refs) ? refs : refs ? [refs] : []) {
      const a = ref?.Data?.Metadaten?.Landesrecht?.LgblAuth
      if (typeof a?.Lgblnummer !== 'string') continue
      out.set(a.Lgblnummer, {
        vorlage: str(a.Regierungsvorlage), vorlageUrl: str(a.RegierungsvorlageLink),
        antrag: str(a.Initiativantrag), antragUrl: str(a.InitiativantragLink),
        ausschuss: str(a.Ausschussbericht), ausschussUrl: str(a.AusschussberichtLink),
        beschluss: str(a.BeschlussDatum), periode: str(a.Gesetzgebungsperiode),
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// The registers, through the production parsers
// ---------------------------------------------------------------------------

async function salzburgGesetze(): Promise<LandConsultation[]> {
  const url = SALZBURG_REGISTERS.gesetz
  const html = await cachedText(join(CACHE, 'sbg', 'register-gesetz.html'), () =>
    getText(url, { ...http, timeoutMs: 90_000 }))
  return salzburgDrafts(parseSalzburgRegister(html, url), 'gesetz')
}

/** One Burgenland view, every page — `readBgldPages` in sources.ts, mirrored. */
async function bgldPages(url: string): Promise<string[]> {
  const session = new LandSession(BGLD_ORIGIN, { timeoutMs: 30_000, retries: 1, backoffMs: () => 2_000, accept: 'text/html', maxBytes: 4 * 1024 * 1024, upstreamHostsOnly: true })
  let page = await session.text(url)
  const pages = [page.html]
  for (let i = 0; i < 20; i++) {
    const next = bgldNextPage(page.html)
    if (!next) return pages
    page = await session.text(new URL(next.action, page.url).href, { form: next.form })
    const titles = (html: string) => [...html.matchAll(/computedField1">([^<]*)/g)].map((m) => m[1]).join('|')
    if (titles(page.html) === titles(pages.at(-1)!)) throw new Error(`Blättern ohne neue Seite: ${url}`)
    pages.push(page.html)
  }
  throw new Error(`mehr als 20 Seiten: ${url}`)
}

async function burgenlandGesetze(): Promise<LandConsultation[]> {
  const now = Number(TODAY.slice(0, 4))
  const out: LandConsultation[] = []
  const seen = new Set<string>()
  const current = await cachedJson(join(CACHE, 'bgld', 'current.json'), () => bgldPages(BGLD_CURRENT))
  for (const html of current) for (const e of parseBgldPage(html, BGLD_CURRENT)) if (!seen.has(e.draft.id) && seen.add(e.draft.id)) out.push(e.draft)
  for (let year = now; year >= BGLD_FIRST_YEAR; year--) {
    const url = bgldArchiveUrl(year, 'gesetz')
    process.stderr.write(`  Burgenland ${year} …\r`)
    const pages = await cachedJson(join(CACHE, 'bgld', `archive-${year}-gesetz.json`), () => bgldPages(url))
    for (const html of pages) for (const e of parseBgldPage(html, url, 'gesetz')) if (!seen.has(e.draft.id) && seen.add(e.draft.id)) out.push(e.draft)
  }
  return out.filter((d) => d.kind === 'gesetz')
}

// ---------------------------------------------------------------------------
// The Landtag's documents: does the Vorlage (or Antrag, or report) say Begutachtung?
// ---------------------------------------------------------------------------

/**
 * What one Landtag document says. `heading`: Salzburg's Regierungsvorlagen
 * end their Erläuterungen' general part with „Ergebnis(se) des
 * Begutachtungsverfahrens" (read off the first run: 20 of 20 sampled
 * Vorlagen of consulted laws). `negative`: a sentence saying there was none.
 * `hits`: up to three other sentences naming a Begutachtung or written
 * statements — for reading, not counting.
 */
interface DocSignal { url: string; heading: boolean; negative: string | null; hits: string[]; error?: string }
const HEADING_RE = /Ergebnis(?:se)?\s+des\s+Begutachtungs/i
const NEGATIVE_RE = /[^.]{0,80}(?:(?:kein\w*|ohne|nicht)\s+(?:\S+\s+){0,3}Begutachtung\w*|Begutachtung\w*\s+(?:\S+\s+){0,6}(?:abgesehen|entfallen|unterblieben|nicht durchgeführt|verzichtet))[^.]{0,80}/i
const BEGUT_RE = /[^.]{0,90}(?:Begutachtung\w*|Stellungnahmen? (?:eingelangt|abgegeben|eingeholt|eingeladen)|Hearing|Expertenanhörung|Enquete)[^.]{0,90}/gi
const hasSignal = (s: DocSignal) => s.heading || !!s.negative || s.hits.length > 0
async function docSignal(url: string): Promise<DocSignal> {
  const file = join(CACHE, 'docs', `${sha1(url)}.pdf`)
  try {
    let bytes: Uint8Array
    if (existsSync(file)) bytes = new Uint8Array(readFileSync(file))
    else {
      bytes = await getBytes(url, { ...http, timeoutMs: 90_000 })
      writeFileSync(file, bytes)
    }
    const text = (await pagesOfBytes(bytes)).join(' ').replace(/\s+/g, ' ')
    return {
      url,
      heading: HEADING_RE.test(text),
      negative: NEGATIVE_RE.exec(text)?.[0].trim() ?? null,
      hits: [...new Set([...text.matchAll(BEGUT_RE)].map((m) => m[0].trim()))].slice(0, 3),
    }
  } catch (err) {
    return { url, heading: false, negative: null, hits: [], error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// The measurement
// ---------------------------------------------------------------------------

const DAY = 86_400_000
const LAW_TYPES = new Set(['Landesgesetz', 'Landesverfassungsgesetz'])
type RouteKind = 'Vorlage' | 'Antrag' | 'beide' | 'keine'
const routeKind = (r: Route | undefined): RouteKind => (r?.vorlage && r?.antrag ? 'beide' : r?.vorlage ? 'Vorlage' : r?.antrag ? 'Antrag' : 'keine')

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return shared / Math.min(a.size, b.size)
}

/** Mulberry32, for a sample that is the same on every run. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function sample<T>(items: readonly T[], n: number, seed: number): T[] {
  const r = rng(seed)
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy.slice(0, n)
}

const refOf = (d: LandConsultation) => d.startedAt ?? d.deadline
const pad = (s: unknown, n: number) => String(s).padEnd(n)
const num = (n: number) => String(n).padStart(5)

for (const land of LANDS) {
  risPages.length = 0
  say(`==================== ${land === 'sbg' ? 'Salzburg' : 'Burgenland'} — gemessen ${TODAY} ====================`)
  const index: LgblEntry[] = await fetchLgblIndex(land)
  const routes = routesOf(risPages)
  const drafts = land === 'sbg' ? await salzburgGesetze() : await burgenlandGesetze()
  process.stderr.write('\n')
  const draftsById = new Map(drafts.map((d) => [d.id, d]))

  if (search) {
    // „a,b;c": drafts whose title holds a and b, then those holding c.
    for (const query of search.split(';')) {
      const words = query.toLowerCase().split(',').map((w) => w.trim()).filter(Boolean)
      say(`--- Register (${drafts.length} Gesetzesentwürfe), Titel mit allen von: ${words.join(', ')} ---`)
      for (const d of drafts) if (words.every((w) => d.title.toLowerCase().includes(w))) say(`  ${pad(refOf(d), 11)} ${pad(d.id, 40)} ${d.title}`)
    }
    continue
  }

  // The production join, over the whole register.
  const results = matchLgbl(drafts, index, TODAY)
  const joined = new Map<string, string[]>()
  for (const [id, r] of results) if (r.state === 'gefunden' && r.stage.detail) joined.set(r.stage.detail, [...(joined.get(r.stage.detail) ?? []), id])

  const laws = index.filter((e) => LAW_TYPES.has(e.typ) && e.datum >= FROM).sort((a, b) => a.datum.localeCompare(b.datum) || a.nr.localeCompare(b.nr))
  const firstDraft = drafts.reduce((m, d) => (refOf(d) && refOf(d)! < m ? refOf(d)! : m), '9999')
  say(`  RIS: ${index.length} LGBl insgesamt, ältestes ${index.reduce((m, e) => (e.datum < m ? e.datum : m), '9999')}; Gesetze seit ${FROM}: ${laws.length}`)
  say(`  Register: ${drafts.length} Gesetzesentwürfe, ältester Beginn/Frist ${firstDraft}; Titelsuche: ${[...results.values()].filter((r) => r.state === 'gefunden').length} gefunden, ${[...results.values()].filter((r) => r.state === 'nicht-gefunden').length} nicht gefunden, ${[...results.values()].filter((r) => r.state === 'vor-ris').length} vor RIS`)
  say()

  // 1. Corpus and route
  say('1. Gesetze je Jahr und Weg laut RIS (Vorlage / Antrag / beide / keine) · Felder: Beschluss, Periode, Ausschussbericht, Link zur Vorlage bzw. zum Antrag')
  const years = [...new Set(laws.map((l) => l.datum.slice(0, 4)))]
  for (const y of years) {
    const ls = laws.filter((l) => l.datum.startsWith(y))
    const c = (k: RouteKind) => ls.filter((l) => routeKind(routes.get(l.nr)) === k).length
    const f = (p: (r: Route) => boolean) => ls.filter((l) => { const r = routes.get(l.nr); return r ? p(r) : false }).length
    const lgbt = ls.filter((l) => l.typ === 'Landesverfassungsgesetz').length
    say(`   ${y}  ${num(ls.length)} (LVG ${lgbt})   V ${num(c('Vorlage'))}  A ${num(c('Antrag'))}  beide ${num(c('beide'))}  keine ${num(c('keine'))}   | Beschluss ${num(f((r) => !!r.beschluss))}  Periode ${num(f((r) => !!r.periode))}  AB ${num(f((r) => !!r.ausschuss))}  Link V/A ${num(f((r) => !!(r.vorlageUrl || r.antragUrl)))}`)
  }
  say()

  // 2. Tiers
  const lawWords = new Map(laws.map((l) => [l.nr, lgblWords(l.titel)]))
  const draftWords = new Map(drafts.map((d) => [d.id, lgblWords(d.title)]))
  const endOf = (law: LgblEntry) => routes.get(law.nr)?.beschluss ?? law.datum
  const relaxedScore = (law: LgblEntry, d: LandConsultation, days = RELAXED_DAYS): number | null => {
    const ref = refOf(d)
    if (!ref) return null
    const end = endOf(law)
    if (ref > end || Date.parse(ref) < Date.parse(end) - days * DAY) return null
    return overlap(lawWords.get(law.nr)!, draftWords.get(d.id)!)
  }
  const joinedTo = new Map<string, string>()
  for (const [nr, ids] of joined) for (const id of ids) joinedTo.set(id, nr)
  /* `free`: only drafts the title search joined to no Landesgesetzblatt — a
     draft is one Begutachtung and normally one law. Reported beside, never
     used for the tier: a draft can become two laws. */
  const bestRelaxed = (law: LgblEntry, days = RELAXED_DAYS, free = false) => {
    let best: { d: LandConsultation; s: number } | null = null
    for (const d of drafts) {
      if (free && joinedTo.has(d.id) && joinedTo.get(d.id) !== law.nr) continue
      const s = relaxedScore(law, d, days)
      if (s !== null && (!best || s > best.s)) best = { d, s }
    }
    return best
  }

  // Calibration: the relaxed score of every pair the strict join confirms.
  const pairs: { law: LgblEntry; d: LandConsultation }[] = []
  for (const l of laws) for (const id of joined.get(l.nr) ?? []) pairs.push({ law: l, d: draftsById.get(id)! })
  const unjoined = laws.filter((l) => !joined.has(l.nr))
  const unjoinedBest = new Map(unjoined.map((l) => [l.nr, bestRelaxed(l)]))
  const lag = pairs.map((p) => (Date.parse(endOf(p.law)) - Date.parse(refOf(p.d)!)) / DAY).sort((a, b) => a - b)
  const q = (f: number) => Math.round(lag[Math.min(lag.length - 1, Math.floor(f * lag.length))] ?? Number.NaN)
  say('2a. Kalibrierung des gelockerten Checks: Überlappung der Titelwörter (lgblWords, geteilt / kleinere Menge), Entwurf ≤ Beschluss und ≥ Beschluss − Fenster')
  say(`    ${pairs.length} bestätigte Paare (Gesetz ← Entwurf), ${unjoined.length} Gesetze ohne Join`)
  say(`    Tage vom Entwurf (Beginn bzw. Frist) bis zum Beschluss, bestätigte Paare: min ${q(0)} · p10 ${q(0.1)} · Median ${q(0.5)} · p90 ${q(0.9)} · p95 ${q(0.95)} · max ${Math.round(lag.at(-1) ?? Number.NaN)}; nach dem Beschluss begonnen: ${lag.filter((x) => x < 0).length}`)
  say('    (Die Titelsuche nimmt nur Kundmachungen ≤ 730 Tage nach dem Entwurf: längere Abstände kann diese Kalibrierung nicht zeigen.)')
  say('    Fenster  Schwelle   bestätigte Paare wiedergefunden   feuert auf Gesetze ohne Join   … nur mit Entwürfen ohne eigenes LGBl')
  for (const days of [180, 365, 730, 1095]) {
    const best = new Map(unjoined.map((l) => [l.nr, bestRelaxed(l, days)?.s ?? 0]))
    const bestFree = new Map(unjoined.map((l) => [l.nr, bestRelaxed(l, days, true)?.s ?? 0]))
    for (const t of [0.34, 0.5, 0.67, 0.8, 1]) {
      const rec = pairs.filter((p) => (relaxedScore(p.law, p.d, days) ?? -1) >= t - 1e-9).length
      const fires = unjoined.filter((l) => best.get(l.nr)! >= t - 1e-9).length
      const firesFree = unjoined.filter((l) => bestFree.get(l.nr)! >= t - 1e-9).length
      say(`    ${String(days).padStart(6)}  ${t.toFixed(2).padStart(7)}    ${num(rec)} / ${pairs.length} (${((100 * rec) / (pairs.length || 1)).toFixed(1).padStart(5)} %)        ${num(fires)} / ${unjoined.length}                    ${num(firesFree)}`)
    }
  }
  say(`    gewählt: Fenster ${RELAXED_DAYS} Tage, Schwelle ${threshold}`)
  say()

  type Tier = 'consulted' | 'unknown' | 'none'
  const tierOf = (l: LgblEntry): Tier => (joined.has(l.nr) ? 'consulted' : (unjoinedBest.get(l.nr)?.s ?? 0) >= threshold - 1e-9 ? 'unknown' : 'none')
  const tiers = new Map(laws.map((l) => [l.nr, tierOf(l)]))
  say('2b. Stufen × Weg')
  say(`    ${pad('', 10)} ${['Vorlage', 'Antrag', 'beide', 'keine', 'gesamt'].map((h) => h.padStart(8)).join('')}`)
  for (const t of ['consulted', 'unknown', 'none'] as Tier[]) {
    const row = (['Vorlage', 'Antrag', 'beide', 'keine'] as RouteKind[]).map((k) => laws.filter((l) => tiers.get(l.nr) === t && routeKind(routes.get(l.nr)) === k).length)
    say(`    ${pad(t, 10)} ${[...row, row.reduce((a, b) => a + b, 0)].map((n) => String(n).padStart(8)).join('')}`)
  }
  const recent = (l: LgblEntry) => l.datum >= `${Number(TODAY.slice(0, 4)) - 3}${TODAY.slice(4)}`
  say(`    letzte drei Jahre: ${['consulted', 'unknown', 'none'].map((t) => `${t} ${laws.filter((l) => recent(l) && tiers.get(l.nr) === t).length}`).join(' · ')}`)
  say()

  // Documents of the Landtag
  const signals = new Map<string, DocSignal[]>()
  if (withDocs) {
    // Every Vorlage (the heading's base rate is read off the consulted ones);
    // Antrag and report only where no draft is joined.
    const jobs = laws.flatMap((l) => {
      const r = routes.get(l.nr)
      const urls = tiers.get(l.nr) === 'consulted' ? [r?.vorlageUrl] : [r?.vorlageUrl, r?.antragUrl, r?.ausschussUrl]
      return urls.filter((u): u is string => !!u).map((u) => ({ nr: l.nr, url: u }))
    })
    if (jobs.length) {
      process.stderr.write(`  ${jobs.length} Landtagsdokumente …\n`)
      const read = await pool(jobs, DOC_CONCURRENCY, (j) => docSignal(j.url), (d, n) => process.stderr.write(`  ${d}/${n}\r`))
      jobs.forEach((j, i) => signals.set(j.nr, [...(signals.get(j.nr) ?? []), read[i]!]))
      process.stderr.write('\n')
      const sig = (l: LgblEntry, kind: 'vorlage' | 'antrag' | 'ausschuss') => {
        const u = routes.get(l.nr)?.[`${kind}Url`]
        return u ? signals.get(l.nr)?.find((s) => s.url === u) : undefined
      }
      say('2c. Die Landtagsdokumente: Überschrift „Ergebnis(se) des Begutachtungsverfahrens" in der Vorlage; ein Satz, dass keine stattfand; sonst „Begutachtung" in Antrag bzw. Bericht')
      for (const t of ['consulted', 'unknown', 'none'] as Tier[]) {
        const ls = laws.filter((l) => tiers.get(l.nr) === t)
        const v = ls.filter((l) => sig(l, 'vorlage'))
        const nonTier = t !== 'consulted'
        say(`    ${pad(t, 10)} Vorlagen ${v.length}: Überschrift ${v.filter((l) => sig(l, 'vorlage')!.heading).length} · „keine" ${v.filter((l) => sig(l, 'vorlage')!.negative).length} · Lesefehler ${v.filter((l) => sig(l, 'vorlage')!.error).length}` +
          (nonTier ? ` | Anträge ${ls.filter((l) => sig(l, 'antrag')).length}: Überschrift ${ls.filter((l) => sig(l, 'antrag')?.heading).length} · „keine" ${ls.filter((l) => sig(l, 'antrag')?.negative).length} · sonst genannt ${ls.filter((l) => { const x = sig(l, 'antrag'); return x && !x.heading && !x.negative && x.hits.length }).length} | Berichte ${ls.filter((l) => sig(l, 'ausschuss')).length}: „keine" ${ls.filter((l) => sig(l, 'ausschuss')?.negative).length} · genannt ${ls.filter((l) => sig(l, 'ausschuss')?.hits.length).length}` : ''))
      }
      const noHeading = laws.filter((l) => tiers.get(l.nr) === 'consulted' && sig(l, 'vorlage') && !sig(l, 'vorlage')!.heading)
      say(`    consulted, aber die Vorlage ohne Überschrift (${noHeading.length}):`)
      for (const l of noHeading) say(`      ${pad(l.nr, 20)} ${pad(joined.get(l.nr)!.join(','), 12)} ${sig(l, 'vorlage')!.error ? `[Lesefehler] ` : ''}${l.titel.slice(0, 150)}`)
      const vNon = laws.filter((l) => tiers.get(l.nr) !== 'consulted' && sig(l, 'vorlage'))
      say(`    unknown/none mit Vorlage: Überschrift ja ${vNon.filter((l) => sig(l, 'vorlage')!.heading).length} (die Titelsuche hat einen begutachteten Entwurf verfehlt), nein ${vNon.filter((l) => !sig(l, 'vorlage')!.heading).length}`)
      say()
    }
  }

  const line = (l: LgblEntry) => {
    const r = routes.get(l.nr)
    const via = r?.vorlage ? `RV ${r.vorlage}` : r?.antrag ? `IA ${r.antrag}` : '—'
    const b = unjoinedBest.get(l.nr)
    const tag = (s: DocSignal) => (s.url === r?.vorlageUrl ? 'V' : s.url === r?.antragUrl ? 'A' : 'AB')
    const sig = (signals.get(l.nr) ?? []).filter(hasSignal).flatMap((s) => [
      ...(s.heading ? [`[${tag(s)}] Überschrift „Ergebnis des Begutachtungsverfahrens"`] : []),
      ...(s.negative ? [`[${tag(s)}] keine: …${s.negative}…`] : []),
      ...s.hits.filter((h) => h !== s.negative).map((h) => `[${tag(s)}] …${h}…`),
    ])
    const err = (signals.get(l.nr) ?? []).filter((s) => s.error).map((s) => `[Lesefehler ${s.error}]`)
    return [
      `  ${pad(l.nr, 20)} ${l.datum}  ${pad(routeKind(r), 7)} ${pad(via, 9)} ${l.titel}`,
      b && b.s > 0 ? `      nächster Entwurf: ${b.s.toFixed(2)} ${refOf(b.d)} ${b.d.id}${joinedTo.has(b.d.id) ? ` (selbst → ${joinedTo.get(b.d.id)})` : ' (ohne eigenes LGBl)'} „${b.d.title}"` : '      nächster Entwurf: —',
      ...sig.map((s) => `      ${s}`),
      ...err.map((s) => `      ${s}`),
    ].join('\n')
  }

  // Laws that came as an Initiativantrag and still have a joined draft:
  // a government draft passed on as a motion, or a Begutachtung the Landtag
  // opened itself (Burgenland: LGBl. Nr. 46/1981 § 6 Abs. 2).
  const antragConsulted = laws.filter((l) => tiers.get(l.nr) === 'consulted' && routes.get(l.nr)?.antrag)
  say(`2d. consulted und als Initiativantrag eingebracht (${antragConsulted.length})`)
  for (const l of antragConsulted) {
    const d = draftsById.get(joined.get(l.nr)![0]!)!
    say(`  ${pad(l.nr, 20)} ${l.datum}  IA ${pad(routes.get(l.nr)!.antrag, 6)} ← ${refOf(d)} ${d.id} „${d.title.slice(0, 120)}"`)
  }
  say()

  // 3. None rows
  const noneRecent = laws.filter((l) => tiers.get(l.nr) === 'none' && recent(l))
  say(`3. Alle ${noneRecent.length} none-Gesetze der letzten drei Jahre`)
  for (const l of noneRecent) say(line(l))
  say()
  const noneAll = laws.filter((l) => tiers.get(l.nr) === 'none')
  say(`3b. Stichprobe zur Handprüfung: ${Math.min(HAND_SAMPLE, noneAll.length)} von ${noneAll.length} none-Gesetzen seit ${FROM} (Seed ${SAMPLE_SEED})`)
  for (const l of sample(noneAll, HAND_SAMPLE, SAMPLE_SEED).sort((a, b) => a.datum.localeCompare(b.datum))) say(line(l))
  say()
  const unknownAll = laws.filter((l) => tiers.get(l.nr) === 'unknown')
  say(`3c. Alle ${unknownAll.length} unknown-Gesetze seit ${FROM}`)
  for (const l of unknownAll) say(line(l))
  say()
  say(`3d. Ältere none-Gesetze (vor den letzten drei Jahren), nur Titel`)
  for (const l of noneAll.filter((x) => !recent(x))) say(`  ${pad(l.nr, 20)} ${l.datum}  ${pad(routeKind(routes.get(l.nr)), 7)} ${l.titel}`)
  say()
}
