/**
 * Opt-in disk cache for RIS traffic, for harness runs only (`--cache`).
 *
 * The harness fetches a few hundred RIS documents per run. Iterating on the
 * engine against a live API means minutes per measurement, which is the
 * difference between testing a hypothesis and guessing at one. Nothing here
 * ships: the production path in `risKons.ts` keeps its own Nitro cache.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { join } from 'node:path'

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
      return new Response(readFileSync(file), { status: 200 })
    }
    const res = await real(input, init)
    if (res.ok) {
      const body = Buffer.from(await res.arrayBuffer())
      writeFileSync(file, body)
      return new Response(body, { status: 200, headers: res.headers })
    }
    return res
  }) as typeof fetch
}
