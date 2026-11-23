#!/usr/bin/env vite-node
/**
 * Serves this checkout's build with the harness's fetch cache under the
 * server's one fetch, as `scripts/ci/ssrSmoke.ts` does with its cassette:
 * what a harness fetched once is replayed from disk, the lists (Parliament's
 * filter lists, RIS's Begut search) are fetched fresh. For the two accounting
 * lanes of a measuring round (`round.sh`), which ask a running server.
 *
 * Usage (after `pnpm build`): PORT=3111 npx vite-node -c vitest.config.ts scripts/harness/serveBuilt.ts
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { installFetchCache, isBegutSearch } from '../lib/harnessCache'

const root = process.cwd()
const output = join(root, '.output/server/index.mjs')
if (!existsSync(output)) {
  console.error(`${output} fehlt: zuerst pnpm build`)
  process.exit(2)
}
const port = process.env.PORT ?? '3111'
const isList = (url: string): boolean => /\/Filter\/api\/filter\/data\/\d+\?/.test(url)
installFetchCache(process.env.HARNESS_CACHE ?? join(root, '.harness-cache'), { fresh: (url) => isList(url) || isBegutSearch(url) })
process.env.NITRO_PORT = port
process.env.PORT = port
// The built server starts its listener on import.
await import(pathToFileURL(output).href)
console.log(`gebauter Server auf http://127.0.0.1:${port}`)
