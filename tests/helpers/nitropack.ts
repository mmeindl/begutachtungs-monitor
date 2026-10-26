import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * nitropack's cached-function runtime as installed — reached through Nuxt,
 * which brings it — for the tests that hold our code to how it behaves
 * (`memoryDriver.test.ts`, `risCorpusIndex.test.ts`). A nitropack update that
 * changed what they rest on fails them instead of changing an answer.
 */
export function nitroCacheSource(): string {
  const root = join(import.meta.dirname, '..', '..')
  const fromNuxt = createRequire(realpathSync(join(root, 'node_modules', 'nuxt', 'package.json')))
  const fromServer = createRequire(realpathSync(fromNuxt.resolve('@nuxt/nitro-server/package.json')))
  return readFileSync(join(dirname(fromServer.resolve('nitropack/package.json')), 'dist', 'runtime', 'internal', 'cache.mjs'), 'utf8')
}
