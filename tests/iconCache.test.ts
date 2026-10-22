import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * @nuxt/icon's endpoint keeps its answers in a mount of their own
 * (`nuxt.config.ts`, `nitro.storage`, 22.10.2026).
 *
 * The endpoint is a cached handler, and its key is whatever list of icons a
 * request names: 968 lucide names in one request stored 287 KB — in the
 * same 64 MB LRU as every document fetched from Parliament and RIS, so ~220
 * such requests evicted all of them. The mount `cache:nuxt:icon` takes those
 * entries instead, because unstorage routes a key to the longest mount point
 * it starts with.
 *
 * Two halves can drift apart, and each is held here: our mount, and the key
 * the module writes under. A module update that renamed its cache group
 * would send the entries back into `cache` without a word, and only the
 * second test would notice.
 */

const ROOT = join(import.meta.dirname, '..')

/** The handler as installed — the copy beside @nuxt/ui, which is what the app runs. */
function iconHandlerSource(): string {
  const ui = realpathSync(join(ROOT, 'node_modules', '@nuxt', 'ui'))
  return readFileSync(join(dirname(ui), 'icon', 'dist', 'runtime', 'server', 'api.js'), 'utf8')
}

interface StorageMount {
  driver: string
  maxSize?: number
  max?: number
}

async function storageConfig(): Promise<Record<string, StorageMount>> {
  vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
  // By a computed path: the config names Nuxt's own global, which the tools
  // project does not declare.
  const path: string = join(ROOT, 'nuxt.config.ts')
  const mod = (await import(/* @vite-ignore */ path)) as { default: { nitro: { storage: Record<string, StorageMount> } } }
  return mod.default.nitro.storage
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the icon cache', () => {
  it('is a small LRU of its own, beside the documents', async () => {
    const storage = await storageConfig()
    const icons = storage['cache:nuxt:icon']
    expect(icons).toMatchObject({ driver: 'lru-cache' })
    expect(icons!.maxSize).toBeGreaterThan(0)
    // Small beside the documents' budget: what it holds is cheap to rebuild.
    expect(icons!.maxSize!).toBeLessThanOrEqual(storage.cache!.maxSize! / 32)
  })

  it('is where the endpoint writes: Nitro\'s default base, group "nuxt", name "icon"', () => {
    const source = iconHandlerSource()
    const options = /}, \{\s*([\s\S]*?)\n\}\);\s*$/.exec(source)?.[1] ?? ''
    expect(options).toMatch(/group: "nuxt"/)
    expect(options).toMatch(/name: "icon"/)
    // No base of its own, so the key begins with Nitro's `/cache`.
    expect(options).not.toMatch(/\bbase:/)
  })
})
