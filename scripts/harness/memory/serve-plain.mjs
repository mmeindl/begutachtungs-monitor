// The built server as production starts it (plain node, its heap flags on the command line), with the harness's
// fetch cache under the server's one fetch: what a harness fetched once is replayed from disk, the rest is fetched
// and kept. For measuring the heap of the deploy sequence and of the comparisons before a deploy.
// usage (cwd = a worktree after pnpm build):
//   HARNESS_CACHE=<dir> PORT=3111 node --max-old-space-size=320 --trace-gc <this file>
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import v8 from 'node:v8'

const WT = process.cwd()
const OUTPUT = `${WT}/.output/server/index.mjs`
if (!existsSync(OUTPUT)) {
  console.error(`${OUTPUT} is missing: pnpm build first`)
  process.exit(2)
}
if (!process.env.HARNESS_CACHE) {
  console.error('HARNESS_CACHE is not set')
  process.exit(2)
}
// Node strips the types of this module itself: it imports node built-ins only.
const { installFetchCache } = await import(pathToFileURL(`${WT}/scripts/lib/harnessCache.ts`).href)
installFetchCache(process.env.HARNESS_CACHE)
const port = Number(process.env.PORT ?? 3111)
process.env.NITRO_PORT = String(port)
process.env.PORT = String(port)
console.log(`HEAP LIMIT ${Math.round(v8.getHeapStatistics().heap_size_limit / 1048576)} MB, node ${process.version}`)
// The built server starts its listener on import.
await import(pathToFileURL(OUTPUT).href)
console.log(`built server of ${WT} on http://127.0.0.1:${port}`)
