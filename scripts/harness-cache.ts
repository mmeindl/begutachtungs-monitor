/**
 * Opt-in disk cache for RIS traffic, for harness runs only (`--cache`).
 *
 * The harness fetches a few hundred RIS documents per run. Iterating on the
 * engine against a live API means minutes per measurement, which is the
 * difference between testing a hypothesis and guessing at one. Nothing here
 * ships: the production path in `risKons.ts` keeps its own Nitro cache.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export function installFetchCache(dir: string): void {
  mkdirSync(dir, { recursive: true })
  const real = globalThis.fetch
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input)
    const file = join(dir, `${createHash('sha1').update(url).digest('hex')}.txt`)
    if (existsSync(file)) {
      return new Response(readFileSync(file, 'utf8'), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    const res = await real(input, init)
    if (res.ok) {
      const body = await res.text()
      writeFileSync(file, body)
      return new Response(body, { status: 200, headers: res.headers })
    }
    return res
  }) as typeof fetch
}
