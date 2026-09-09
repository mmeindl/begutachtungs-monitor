/**
 * Opt-in disk cache for RIS traffic, for harness runs only (`--cache`).
 *
 * The harness fetches a few hundred RIS documents per run. Iterating on the
 * engine against a live API means minutes per measurement, which is the
 * difference between testing a hypothesis and guessing at one. Nothing here
 * ships: the production path in `risKons.ts` keeps its own Nitro cache.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

export function installFetchCache(dir: string): void {
  mkdirSync(dir, { recursive: true })
  const real = globalThis.fetch
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input)
    const hash = createHash('sha1').update(url).digest('hex')
    // Bodies are stored as bytes, not as a string. Round-tripping a PDF
    // through `res.text()` and back through utf8 corrupts every deflate
    // stream in it — pdf.js then reports "Bad FCHECK in flate stream" and
    // the document parses as empty (2026-09-09).
    const file = join(dir, `${hash}.bin`)
    if (existsSync(file)) {
      const cached = readFileSync(file)
      if (pdfIsIntact(cached)) return new Response(cached, { status: 200 })
      // Damaged on disk from an earlier run: drop it and fetch again rather
      // than measure against an empty document.
      console.warn(`harness-cache: verworfen, beschädigtes PDF im Cache — ${url}`)
      rmSync(file, { force: true })
    }
    const res = await real(input, init)
    if (res.ok) {
      const body = Buffer.from(await res.arrayBuffer())
      if (pdfIsIntact(body)) writeFileSync(file, body)
      return new Response(body, { status: 200, headers: res.headers })
    }
    return res
  }) as typeof fetch
}
