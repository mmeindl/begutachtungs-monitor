#!/usr/bin/env node
// The Länder archive (started 02.11.2026): what the monitor reads from the
// nine Länder, kept on the server, because four to five of them take their
// drafts offline — Wien after the Beschluss, Niederösterreich and Vorarlberg
// with the Frist, Tirol after weeks. For those, "was wurde daraus" cannot be
// answered later from the Land's site at all; every month without a copy is
// history that is gone. The free slice of the persistence package
// (TODO.md Teil 4; outreach/foerderantrag.md, Ergänzung 30.10.2026).
//
// Two layers, in one directory `laender/` under the StateDirectory:
//
//   lists/YYYY-MM-DD.json.gz  the app's own `/api/laender?status=all`, once a
//                             day, whole — every draft of the running period
//                             AND which Land could not be read that day. The
//                             archive never hides a gap: a Land marked
//                             `unavailable` is a day without its rows, said so
//                             in the file, not a day on which it had none.
//   docs/<sha256>.<ext>       every document those lists name, fetched ONCE
//                             per URL, stored by content (two URLs with the
//                             same PDF are one file).
//   docs/index.jsonl          one line per fetch: url → sha256, or the
//                             404/410 that says the Land had already removed
//                             it. Append-only; the last line per URL wins.
//
// Read from the app, not from the Länder: the nine readers, their gates and
// the WAF pacing live there (server/utils/laender/), and the prewarm at 04:30
// has just warmed exactly this answer — the list costs no upstream request.
// The documents do: 803 on the first run (02.11.2026), a handful a day after.
// They are fetched one after another, a second apart, and a host that answers
// 403 or 429 is left alone for the rest of the run (Länder firewalls block
// bursts, and asking on into a block prolongs it — `SitePacer` in
// server/utils/laender/session.ts); what was not fetched is fetched tomorrow.
//
// Known gaps, both by choice:
//   - Documents without an address of their own — the monitor's `#dok=` links
//     (`documentLink` in server/utils/laender/session.ts; Steiermark's PALLAST,
//     Tirol's Landtag) — are the answer to a form postback, not to a GET: the
//     GET returns the viewer page. Fetching them anyway got PALLAST's firewall
//     to answer 403 after twenty requests on 02.11.2026, and that firewall
//     blocks by address — the app's own Steiermark reader with it. PALLAST
//     keeps every period back to 2015 online, so nothing is lost by waiting
//     for a Land that deletes. Each day's list still names them.
//   - Kärnten's undated archive drafts (`undated` in the answer) are counted
//     there but have no rows, so their documents are not archived.
//
// IT STAYS ON THE SERVER, like the list-81 series: these are copies of the
// Länder's publications, kept as evidence; serving them again is a separate
// decision (licence, and the Stellungnahmen are not fetched at all). Pull it
// to look at it:
//
//   rsync -az root@<SERVER_IP>:/var/lib/begutachtungs-monitor/laender/ .cache/laender/
//
// Sizes at the start: the list is 355 KB a day, ~40 KB gzipped; the documents
// are the weight — budgeted at 1–2 GB a year, on a disk with 24 GB free.
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rename, rm, statfs, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { gzipSync } from 'node:zlib'

const STATE = process.env.STATE_DIRECTORY?.split(':')[0] || '/var/lib/begutachtungs-monitor'
const DIR = join(STATE, 'laender')
const APP = process.env.APP_URL || 'http://127.0.0.1:3000'
const USER_AGENT = 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at; deploy/laender-archive)'
const PAUSE_MS = 1000
// A reader that suddenly yields new URLs for everything (a session token in a
// link, a relaunch) would otherwise download the whole period every day.
// 1.000 covers the first run with room; above it, the run stops and says so.
const MAX_FETCHES = 1000
// Streamed, so not a memory bound but a sanity one: Salzburg's largest drafts
// are 64 and 78 MB (34471, 34472 — measured 02.11.2026); four times that is
// not a document.
const MAX_BYTES = 200 * 1024 * 1024
// The disk is the app's and the journal's too. A run stores at most this
// much, and none starts a fetch with less than MIN_FREE_BYTES left on it.
const MAX_RUN_BYTES = 3 * 1024 * 1024 * 1024
const MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024
// The URLs are the app's, already held to its allowlist; a redirect is
// followed by hand, over https and only to a host today's list names.
const MAX_HOPS = 5
// Gone for good: never asked again. Everything else is asked again tomorrow.
const GONE = new Set([404, 410])

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function writeAtomic(path, data) {
  const tmp = `${path}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
}

async function readList() {
  const res = await fetch(`${APP}/api/laender?status=all`, { signal: AbortSignal.timeout(300_000) })
  if (!res.ok) throw new Error(`/api/laender answered ${res.status}`)
  const text = await res.text()
  const body = JSON.parse(text)
  // The shape we read, checked before anything is written: a list without
  // its sources would be a day that cannot say which Land was missing.
  if (!Array.isArray(body.items) || !Array.isArray(body.sources) || body.sources.length === 0) {
    throw new Error('/api/laender: no items or sources in the answer')
  }
  return { text, body }
}

async function readIndex(path) {
  const known = new Map()
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return known
  }
  for (const line of text.split('\n')) {
    if (!line) continue
    try {
      const entry = JSON.parse(line)
      known.set(entry.url, entry)
    } catch {
      // A line cut by a crash mid-append; the URL is fetched again.
    }
  }
  return known
}

function extensionOf(url, contentType) {
  const fromPath = /\.([a-z0-9]{2,5})$/i.exec(new URL(url).pathname)?.[1]?.toLowerCase()
  if (fromPath) return fromPath
  if (contentType.includes('pdf')) return 'pdf'
  if (contentType.includes('wordprocessingml')) return 'docx'
  if (contentType.includes('msword')) return 'doc'
  return 'bin'
}

// Streamed to a file and hashed on the way: held whole in memory, the PDFs of
// the first run (up to 9.6 MB each) took the job to its MemoryMax and into
// swap (02.11.2026) — V8 sees no reason to free a buffer it may reuse.
async function fetchFollowing(url, hosts) {
  const signal = AbortSignal.timeout(120_000)
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const at = new URL(url)
    if (at.protocol !== 'https:' || !hosts.has(at.host)) return { error: `not fetched: ${url}` }
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual', signal })
    const location = res.headers.get('location')
    if (res.status < 300 || res.status > 399 || !location) return { res }
    await res.body?.cancel()
    url = new URL(location, url).href
  }
  return { error: `more than ${MAX_HOPS} redirects` }
}

async function fetchDocument(url, docsDir, hosts) {
  const { res, error } = await fetchFollowing(url, hosts)
  if (!res) return { status: 0, error }
  if (!res.ok) return { status: res.status }
  const contentType = res.headers.get('content-type') ?? ''
  // A WAF's block page or a relaunch's start page arrives as 200 text/html;
  // archived, it would stand for the document. Asked again tomorrow.
  if (contentType.includes('text/html')) {
    await res.body?.cancel()
    return { status: res.status, error: 'html instead of a document' }
  }
  const hash = createHash('sha256')
  let size = 0
  const measure = new Transform({
    transform(chunk, _enc, done) {
      size += chunk.length
      if (size > MAX_BYTES) return done(new Error(`more than ${MAX_BYTES} bytes`))
      hash.update(chunk)
      done(null, chunk)
    },
  })
  const tmp = join(docsDir, `.fetch-${process.pid}.tmp`)
  try {
    await pipeline(Readable.fromWeb(res.body), measure, createWriteStream(tmp))
  } catch (err) {
    await rm(tmp, { force: true })
    return { status: res.status, error: err.message }
  }
  if (size === 0) {
    await rm(tmp, { force: true })
    return { status: res.status, error: '0 bytes' }
  }
  const sha256 = hash.digest('hex')
  const file = join(docsDir, `${sha256}.${extensionOf(url, contentType)}`)
  // Two URLs with the same content are one file.
  if (existsSync(file)) await rm(tmp)
  else await rename(tmp, file)
  return { status: res.status, contentType, sha256, bytes: size }
}

async function main() {
  const day = new Date().toISOString().slice(0, 10)
  const listsDir = join(DIR, 'lists')
  const docsDir = join(DIR, 'docs')
  await mkdir(listsDir, { recursive: true })
  await mkdir(docsDir, { recursive: true })

  const { text, body } = await readList()
  const listFile = join(listsDir, `${day}.json.gz`)
  await writeAtomic(listFile, gzipSync(text))
  const unavailable = body.sources.filter((s) => s.state !== 'ok').map((s) => s.land)
  console.log(`list: ${body.items.length} drafts → ${listFile}` + (unavailable.length ? `; not readable today: ${unavailable.join(', ')}` : ''))

  const indexPath = join(docsDir, 'index.jsonl')
  const known = await readIndex(indexPath)
  const wanted = []
  const seen = new Set()
  const hosts = new Set()
  let postbackOnly = 0, malformed = 0
  for (const item of body.items) {
    for (const doc of item.documents ?? []) {
      if (seen.has(doc.url)) continue
      seen.add(doc.url)
      const entry = known.get(doc.url)
      if (entry && (entry.sha256 || GONE.has(entry.status))) continue
      let at
      try {
        at = new URL(doc.url)
      } catch {
        malformed++
        continue
      }
      if (at.protocol !== 'https:') { malformed++; continue }
      if (at.hash.startsWith('#dok=')) { postbackOnly++; continue }
      hosts.add(at.host)
      wanted.push({ url: doc.url, host: at.host, land: item.land, draft: item.id, title: doc.title })
    }
  }

  const blockedHosts = new Set()
  let stored = 0, gone = 0, failed = 0, skipped = 0, fetches = 0, storedBytes = 0
  for (const { host, ...doc } of wanted) {
    if (blockedHosts.has(host)) { skipped++; continue }
    if (fetches >= MAX_FETCHES) {
      console.log(`stopped after ${MAX_FETCHES} fetches; ${wanted.length - fetches - skipped} documents wait for tomorrow — a reader yielding new URLs for everything?`)
      break
    }
    if (storedBytes >= MAX_RUN_BYTES) {
      console.log(`stopped after ${storedBytes} bytes stored; the rest waits for tomorrow`)
      break
    }
    const disk = await statfs(docsDir)
    if (disk.bavail * disk.bsize < MIN_FREE_BYTES) {
      console.log(`stopped: less than ${MIN_FREE_BYTES} bytes free on the disk`)
      break
    }
    if (fetches > 0) await sleep(PAUSE_MS)
    fetches++
    let result
    try {
      result = await fetchDocument(doc.url, docsDir, hosts)
    } catch (err) {
      failed++
      console.log(`failed ${doc.url}: ${err.message}`)
      continue
    }
    const fetchedAt = new Date().toISOString()
    if (result.sha256) {
      await appendFile(indexPath, JSON.stringify({ ...doc, sha256: result.sha256, bytes: result.bytes, contentType: result.contentType, fetchedAt }) + '\n')
      stored++
      storedBytes += result.bytes
    } else if (GONE.has(result.status)) {
      await appendFile(indexPath, JSON.stringify({ ...doc, status: result.status, fetchedAt }) + '\n')
      gone++
    } else {
      failed++
      console.log(`failed ${doc.url}: HTTP ${result.status}${result.error ? `, ${result.error}` : ''}`)
      if (result.status === 403 || result.status === 429) blockedHosts.add(host)
    }
  }
  console.log(`documents: ${seen.size} named, ${wanted.length} new, ${postbackOnly} by postback only (not fetched), ${malformed} not an https URL; stored ${stored}, gone ${gone}, failed ${failed}, left for tomorrow ${skipped}` + (blockedHosts.size ? ` (blocked: ${[...blockedHosts].join(', ')})` : ''))
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
