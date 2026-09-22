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
 * Every entry is an upstream payload, one per distinct call, holding
 * nothing our code made. There is no residual and no exception left: the one
 * response that may not be persisted at all — list 142, whose rows name
 * private persons — has no cached fetch under it, only a derived cache above
 * (`parliament.ts`).
 */
const FETCHED: Record<string, string> = {
  'law-html': 'a published Gesetzestext document, byte for byte',
  gegenstand: 'the upstream detail JSON, passed through unmapped',
  'kons-para-xml': 'a RIS paragraph document; its heading is parsed fresh on every call',
  'erlaeuterungen-xml': "the ressort's Erläuterungen as RIS sent them; the parse above is derived",
  'entwurfstext-xml': "the draft's own text as RIS sent it; its Artikel are parsed fresh on every call",
  'begut-dokument-xml':
    'any document of a Begut record as RIS sent it — the full-text search reads whichever one holds the ' +
    'word (§12.31). Deliberately its own entry and not the two above: those belong to the Erläuterungen ' +
    'section and are keyed by the same URLs, so a search may hold a second copy of a document. One cache ' +
    'name per consumer is the cheaper mistake — sharing one would tie the search to that section\'s TTL.',
  'begut-dokument-pdf':
    'the same document as a PDF, byte for byte as base64 — the search falls back to it because the XML of a '
    + 'Begleitschreiben is a stub (943 characters against 12.223, §12.31). Cached in dev only; what production '
    + 'keeps is the extracted text one layer up, which is derived and small.',
  'bgbl-nummer-suche': 'the RIS answer for one Bgblnummer, as it arrived — the §-comparison looks the Kundmachung up by the citation Parliament gives it (§12.33)',
  'bgbl-jahrgang-seite': 'one page of a CLOSED Bundesgesetzblatt year, as it arrived; that year is finished, so it keeps for a month',
  'bgbl-jahrgang-seite-laufend': 'the same page of the RUNNING year, which still grows — its own name because one cached function carries one maxAge (§12.32)',
  'ris-begut-page': 'one page of the RIS result set, as it arrived — cached in dev only',
  'annex-pdf': "the ressort's annex PDF, byte for byte as base64 — cached in dev only",
  'drafts-list': 'list 81 of one GP, exactly as the API answered',
  'parliament-me-config': "the ME list's page configuration, as served",
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
