import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every cached function has to say which layer it belongs to
 * (`server/utils/cacheBase.ts`). The persistent layer may hold only
 * documents we fetched; anything we computed belongs in `derived`, or a
 * parser change stays invisible on localhost for a day — which is how this
 * rule came to exist.
 *
 * The list below is the persistent layer, with the reason each entry is
 * allowed to be there. It is deliberately a hard-coded list: adding a cached
 * function now fails this test until someone decides which half it is, and
 * that decision is the whole point.
 *
 * Three entries are not pure documents and are named as such. Two map
 * upstream list rows field for field — a stable, shipped shape that is not
 * where development happens. `statements-me` is the deliberate exception and
 * the interesting one: it caches the **classified** rows, because the raw
 * list-142 response carries the names of private persons and the persistent
 * layer must not hold those (GDPR, `CLAUDE.md`; `mapStatementRow` drops them
 * before anything is stored). Privacy wins over cache hygiene here, so a
 * change to `classifySubmitter` is the one change that still needs
 * `rm -rf .nuxt/cache/nitro/functions/statements-me`.
 */
const FETCHED: Record<string, string> = {
  'law-html': 'a published Gesetzestext document, byte for byte',
  gegenstand: 'the upstream detail JSON, passed through unmapped',
  'kons-para-xml': 'a RIS paragraph document; its heading is parsed fresh on every call',
  'ris-begut-page': 'one page of the RIS result set, as it arrived — cached in dev only',
  'consultations-gp': 'list 81 rows, mapped field for field (residual, see above)',
  'statements-me': 'list 142 rows, classified — the raw rows must not be persisted (see above)',
  'current-gp': 'one GP code read out of the list configuration (residual, see above)',
}

const UTILS = join(import.meta.dirname, '..', 'server', 'utils')

/** Every cached function in server/utils, with the layer it declares. */
function cachedFunctions(): { name: string; file: string; derived: boolean }[] {
  const out: { name: string; file: string; derived: boolean }[] = []
  for (const file of readdirSync(UTILS).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(UTILS, file), 'utf8')
    if (!src.includes('defineCachedFunction(')) continue
    // One options object holds exactly one `name:`, so the next `name:` ends
    // this one — that window is where its `base` has to be.
    const names = [...src.matchAll(/name: '([a-z0-9-]+)'/g)]
    for (const [i, m] of names.entries()) {
      const from = m.index!
      const to = names[i + 1]?.index ?? src.length
      out.push({ name: m[1]!, file, derived: src.slice(from, to).includes('base: DERIVED_CACHE') })
    }
  }
  return out
}

describe('cache layers', () => {
  const found = cachedFunctions()

  it('finds the cached functions at all', () => {
    // A guard on the guard: a refactor that renames the helper must not
    // quietly turn this file into a test of nothing.
    expect(found.length).toBeGreaterThan(8)
  })

  it('keeps computed values out of the persistent layer', () => {
    const wrong = found.filter((f) => !f.derived && FETCHED[f.name] === undefined)
    expect(
      wrong.map((f) => `${f.name} (${f.file})`),
      'A cached function is persistent but not a fetched document. Either add ' +
        '`base: DERIVED_CACHE` to its options — right after `name` — or, if it ' +
        'really caches an upstream document verbatim, list it in FETCHED with ' +
        'the reason. A function that fetches *and* parses has to be split first ' +
        '(see server/utils/cacheBase.ts).',
    ).toEqual([])
  })

  it('does not keep stale entries in the allow-list', () => {
    const names = new Set(found.map((f) => f.name))
    expect([...Object.keys(FETCHED)].filter((n) => !names.has(n))).toEqual([])
  })

  it('lists nothing in the allow-list that declares itself derived', () => {
    expect(found.filter((f) => f.derived && FETCHED[f.name] !== undefined).map((f) => f.name)).toEqual([])
  })
})
