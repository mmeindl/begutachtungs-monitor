import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * nitropack's cached-function runtime as installed — reached through Nuxt,
 * which brings it — for the tests that hold our code to how it behaves
 * (`memoryDriver.test.ts`, `risCorpusIndex.test.ts`, `staleWithin.test.ts`,
 * `storageKey.test.ts`). A nitropack update that
 * changed what they rest on fails them instead of changing an answer.
 */
export function nitroCacheSource(): string {
  return readFileSync(join(dirname(nitropackPackageJson()), 'dist', 'runtime', 'internal', 'cache.mjs'), 'utf8')
}

function nitropackPackageJson(): string {
  const root = join(import.meta.dirname, '..', '..')
  const fromNuxt = createRequire(realpathSync(join(root, 'node_modules', 'nuxt', 'package.json')))
  const fromServer = createRequire(realpathSync(fromNuxt.resolve('@nuxt/nitro-server/package.json')))
  return fromServer.resolve('nitropack/package.json')
}

/**
 * The h3 and node-mock-http the installed nitropack serves requests with —
 * h3 runs the middleware chain, node-mock-http is `localFetch`, a page's
 * in-process API call. Executed, for the test that holds the waiting context
 * (`cache/stale.ts`) to how a request carries it (`staleWithin.test.ts`).
 */
export async function nitroRequestModules(): Promise<{
  h3: typeof import('h3')
  fetchNodeRequestHandler: (
    handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => unknown,
    url: string,
    init?: { headers?: Record<string, string> },
  ) => Promise<Response>
}> {
  const fromNitro = createRequire(realpathSync(nitropackPackageJson()))
  // `require.resolve` finds the CommonJS build; Nitro runs the ES one beside it.
  const esm = (name: string) => pathToFileURL(fromNitro.resolve(name).replace(/\.cjs$/, '.mjs')).href
  const h3 = (await import(esm('h3'))) as typeof import('h3')
  const mock = (await import(esm('node-mock-http'))) as Awaited<ReturnType<typeof nitroRequestModules>>
  return { h3, fetchNodeRequestHandler: mock.fetchNodeRequestHandler }
}

/**
 * unstorage's `normalizeKey` as the installed nitropack uses it — every key
 * a cached function writes passes through it (`server/utils/cache/key.ts`).
 * Executed, not matched as text: what it does to a key is the subject.
 */
export async function unstorageNormalizeKey(): Promise<(key: string) => string> {
  const fromNitro = createRequire(realpathSync(nitropackPackageJson()))
  const mod = (await import(pathToFileURL(fromNitro.resolve('unstorage')).href)) as { normalizeKey: (key: string) => string }
  return mod.normalizeKey
}
