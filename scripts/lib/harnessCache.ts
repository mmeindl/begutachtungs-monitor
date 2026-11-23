/**
 * Opt-in disk cache for upstream traffic, for harness and CI runs
 * (`--cache`, and the SSR smoke test's cassette).
 *
 * The harness fetches a few hundred RIS documents per run. Iterating on the
 * engine against a live API means minutes per measurement, which is the
 * difference between testing a hypothesis and guessing at one. Nothing here
 * ships: the production path (`server/utils/kons/konsCache.ts`) keeps its own
 * Nitro cache.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { join } from 'node:path'

/**
 * Whether a cached body is a PDF that survived being stored.
 *
 * The rename from `.txt` to `.bin` stopped new corruption; it could not
 * restore the bytes already lost, and three of the 114 cached PDFs stayed
 * damaged — runs of U+FFFD where a deflate stream used to be. pdf.js reads
 * such a file as an *empty* document rather than failing, so the harness
 * scored one production draft on nothing at all and reported "2/3" (128/ME,
 * Bilanzbuchhaltungsgesetz, 2026-09-09).
 *
 * An input the measurement cannot detect as broken is worse than a missing
 * one: the number it produces looks like evidence. So a body that claims to
 * be a PDF has to end like one and must not be littered with replacement
 * characters.
 *
 * "Littered", not "free of": U+FFFD is three ordinary bytes, and across two
 * megabytes of compressed streams a handful occur by chance — five of the
 * 114 cached PDFs carry exactly one and parse perfectly. A round trip
 * through UTF-8 replaces *every* byte it cannot decode, so real damage is
 * tens of thousands of them. Rejecting a single occurrence would refuse to
 * cache sound documents and re-fetch them on every run.
 */
const MAX_INCIDENTAL_FFFD = 16
const FFFD = Buffer.from([0xef, 0xbf, 0xbd])

function pdfIsIntact(body: Buffer): boolean {
  if (!body.subarray(0, 5).toString('latin1').startsWith('%PDF-')) return true
  if (!body.subarray(-2048).toString('latin1').includes('%%EOF')) return false
  let seen = 0
  for (let at = body.indexOf(FFFD); at !== -1; at = body.indexOf(FFFD, at + 3)) {
    if (++seen > MAX_INCIDENTAL_FFFD) return false
  }
  return true
}

/**
 * A RIS search: a query on a RIS host that pages (`Seitennummer`) and names
 * no single document (`Dokumentnummer`). Its answer is whatever RIS holds on
 * the day of asking — unlike a document, which a NOR keeps fixed.
 */
export function isRisSearch(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.hostname !== 'data.bka.gv.at' && !parsed.hostname.endsWith('ris.bka.gv.at')) return false
  return parsed.searchParams.has('Seitennummer') && !parsed.searchParams.has('Dokumentnummer')
}

/**
 * The Begut list: the RIS search whose answer is the harness's window.
 *
 * Narrower than `isRisSearch` on purpose. The other RIS searches of an annex
 * run are the standing-law lookups (`Applikation=BrKons`), some 3.300 per
 * run, pinned to the draft's Beginn by `Fassung.FassungVom`: fetched afresh
 * they would put every run online and move nothing about which drafts are
 * measured. Whether RIS corrected one of them after the fact is the other
 * question `annex-drift.yml` names, and it stays handwork.
 */
export function isBegutSearch(url: string): boolean {
  return isRisSearch(url) && new URL(url).searchParams.get('Applikation') === 'Begut'
}

/**
 * Every question whose answer can change once a new law is published: a query
 * to the RIS API, whatever its parameters, and Parliament's JSON about an
 * item. A document under its own address does not change and stays cached.
 *
 * WHY (23.11.2026). Scored from the frozen cache, 38 of the 53 laws in the 18
 * newest Bundesgesetzblätter read „in keiner Fassung genannt": the version
 * lists on disk predated them, while RIS had consolidated every one. A law
 * the cache cannot see looks exactly like a law RIS has not reached.
 */
export function isLiveQuery(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.hostname === 'data.bka.gv.at') return !parsed.searchParams.has('Dokumentnummer')
  return parsed.hostname.endsWith('parlament.gv.at') && parsed.searchParams.has('json')
}

export interface FetchCacheOptions {
  /**
   * Requests the disk never answers: they are fetched every time, and the
   * answer is still written, so a later run can replay it on purpose.
   *
   * The Begut list is one constant URL per page. Served from disk for ever,
   * it froze every annex and fault-injection round from 09.09.2026 on at
   * that day's list, and the weekly drift alarm — whose CI cache is carried
   * from week to week — could not see a new draft, which is the only thing
   * that can show a ressort's new layout (20.11.2026).
   */
  fresh?: (url: string) => boolean
  /** Answer the `fresh` requests from disk after all, where it holds them: an offline replay, chosen and said. */
  replay?: boolean
}

/** Where the answer to a `fresh` request came from in this run. */
export interface ServedRequest {
  url: string
  fromCache: boolean
  /** When the answer was fetched: now, or the cache file's mtime for a replayed one */
  fetchedAt: Date
}

export interface FetchCache {
  /** Every request the `fresh` predicate named, in order — the list, not the documents. */
  served: ServedRequest[]
}

/**
 * The file that holds a request's answer.
 *
 * THE BODY IS PART OF THE KEY, since the SSR smoke test
 * (`scripts/ci/ssrSmoke.ts`) records Parliament traffic too: its Filter
 * API is one POST URL per list, and which rows come back is decided
 * entirely by the JSON body — `…/data/81` for GP XXVII and for GP XXVIII
 * is the same address. Keyed by URL alone the second period would have
 * been served the first one's rows, silently.
 *
 * A request WITHOUT a body hashes exactly as before, so every RIS entry
 * already on disk keeps its name and the drift alarm's cache
 * (`annex-drift.yml`, warmed since 16.09.2026) stays warm. What does get
 * new names is the Parliament traffic of `corpus/bgblStation.ts`, the one
 * other script that installs this cache and POSTs: those entries are
 * fetched once more, and they are exactly the ones that could collide
 * before.
 */
function cacheFile(dir: string, url: string, body: string | null): string {
  const hasher = createHash('sha1').update(url)
  if (body !== null) hasher.update('\u0000').update(body)
  return join(dir, `${hasher.digest('hex')}.bin`)
}

/** Whether the disk holds the answer to a GET of this address: a harness can choose its population without a request. */
export function isCached(dir: string, url: string): boolean {
  return existsSync(cacheFile(dir, url, null))
}

export function installFetchCache(dir: string, options: FetchCacheOptions = {}): FetchCache {
  mkdirSync(dir, { recursive: true })
  const real = globalThis.fetch
  const served: ServedRequest[] = []
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input)
    const tracked = options.fresh?.(url) ?? false
    // Bodies are stored as bytes, not as a string. Round-tripping a PDF
    // through `res.text()` and back through utf8 corrupts every deflate
    // stream in it — pdf.js then reports "Bad FCHECK in flate stream" and
    // the document parses as empty (2026-09-09).
    const file = cacheFile(dir, url, typeof init?.body === 'string' ? init.body : null)
    // A fresh request goes upstream even when the disk holds it, and a failure
    // there fails the run: an old list served in place of a failed one would
    // be the stale window again, unsaid.
    if ((!tracked || options.replay) && existsSync(file)) {
      const cached = readFileSync(file)
      if (pdfIsIntact(cached)) {
        if (tracked) served.push({ url, fromCache: true, fetchedAt: statSync(file).mtime })
        return new Response(cached, { status: 200 })
      }
      // Damaged on disk from an earlier run: drop it and fetch again rather
      // than measure against an empty document.
      console.warn(`harness-cache: verworfen, beschädigtes PDF im Cache — ${url}`)
      rmSync(file, { force: true })
    }
    const fetchedAt = new Date()
    const res = await real(input, init)
    if (res.ok) {
      const body = Buffer.from(await res.arrayBuffer())
      if (pdfIsIntact(body)) writeFileSync(file, body)
      if (tracked) served.push({ url, fromCache: false, fetchedAt })
      return new Response(body, { status: 200, headers: res.headers })
    }
    return res
  }) as typeof fetch
  return { served }
}
