import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import documentDriver, { documentPath, DOCUMENTS_SUBDIR } from '../server/utils/cache/documentDriver'

/**
 * Every cached function has to say which layer it belongs to
 * (`server/utils/cache/base.ts`). The persistent layer may hold only
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
 * nothing our code made. `entwurfstext-xml` was dropped on 22.09.2026: it
 * held the draft's own text under a second name, for URLs `law-html` already
 * carried, and the parse above it — the draft's Artikel, read three times per
 * cold detail page — now sits in the derived `draft-articles`
 * (`lawtext/draftArticlesService.ts`), keyed by draft AND source, because the
 * Geltendes-Recht section reads the Parliament copy where the other three read
 * the RIS XML. Derived names belong in no list here; that is the point of the
 * split.
 *
 * There is no residual and no exception left: the one
 * response that may not be persisted at all — list 142, whose rows name
 * private persons — has no cached fetch under it, only a derived cache above
 * (`parliament/statements.ts`).
 */
const FETCHED: Record<string, string> = {
  'law-html': 'a published Gesetzestext document, byte for byte',
  gegenstand: 'the upstream detail JSON, passed through unmapped',
  'kons-para-xml': 'a RIS paragraph document; its heading is parsed fresh on every call',
  'erlaeuterungen-xml': "the ressort's Erläuterungen as RIS sent them; the parse above is derived",
  'begut-dokument-xml':
    'any document of a Begut record as RIS sent it — the full-text search reads whichever one holds the ' +
    'word. Deliberately its own entry and not the two above: those belong to the Erläuterungen ' +
    'section and are keyed by the same URLs, so a search may hold a second copy of a document. One cache ' +
    'name per consumer is the cheaper mistake — sharing one would tie the search to that section\'s TTL.',
  'begut-dokument-pdf':
    'the same document as a PDF, byte for byte as base64 — the search falls back to it because the XML of a ' +
    'Begleitschreiben is a stub (943 characters against 12.223). Cached in dev only; what production ' +
    'keeps is the extracted text one layer up, which is derived and small.',
  'bgbl-nummer-suche': 'the RIS answer for one Bgblnummer, as it arrived — the §-comparison looks the Kundmachung up by the citation Parliament gives it',
  'bund-land-suche': 'the RIS full-text answer for one Grundsatz phrase in BGBl I since the window began, as it arrived — the Bund-zu-Land map reads the federal Grundsatzgesetze of the window from it',
  'bgbl-jahrgang-seite': 'one page of a CLOSED Bundesgesetzblatt year, as it arrived; that year is finished, so it keeps for a month',
  'bgbl-jahrgang-seite-laufend': 'the same page of the RUNNING year, which still grows — its own name because one cached function carries one maxAge',
  'ris-begut-page': 'one page of the RIS result set, as it arrived — cached in dev only',
  'annex-pdf': "the ressort's annex PDF, byte for byte as base64 — cached in dev only",
  'drafts-list': 'list 81 of one GP, exactly as the API answered',
  'parliament-me-config': "the ME list's page configuration, as served",
  'land-list-page': "a Land's list of drafts in Begutachtung, or a draft's page that names no Stellungnahmen, as its site served it; parsed and gated fresh on every call",
  'land-statements-page': "a page a Land's Stellungnahmen are read from — their own page, or the draft's page that lists them — as its site served it; parsed fresh on every call",
  'land-register-page': "a Land's whole register of drafts as its site served it (Salzburg since 2004); parsed once per version of the page, known by its hash (`registerDrafts`)",
  'land-record-page': "one draft's Landtag page as its site served it, read by the list for the station (Oberösterreich); parsed fresh on every call",
  'land-bgld-pages': "Burgenland's running list or this year's archive view, every page of it as the Land served it (the further ones by postback); parsed fresh on every call",
  'land-stmk-rows': "the Steiermark Landtag's list of Begutachtungen, all rows in one partial response as PALLAST served it; parsed fresh on every call",
  'land-stmk-page': "a page of PALLAST as a reader's view serves it — the list's newest ten, a draft's own page; parsed fresh on every call",
  'land-stmk-draft-page': "one draft's PALLAST page, read by the list for its Frist (Steiermark); parsed fresh on every call",
  'eu-vorblatt-pdf':
    "a draft's Vorblatt/WFA PDF, byte for byte as base64 — its EU sentence is in the text layer only. Cached in dev " +
    'only, like the search\'s PDFs; production keeps the extracted page texts one layer up, which are derived and small.',
  'eu-cellar': "the Cellar's SPARQL answer for one CELEX, as it arrived; the transposition dates are read from it fresh on every call",
  'eu-cellar-oj': "the Cellar's SPARQL answer on where one act was published, as it arrived; the Amtsblatt reference is read from it fresh on every call",
  'eu-bundesrecht': "whether Bundesrecht in force on one day names an EU act, from RIS's full-text search; the law as of a past day does not change (D4)",
  'eu-landesrecht': "the same search over one Land's consolidated Landesrecht (LrKons) on one day, as RIS answered it — the hits are read fresh on every call (D4)",
}

/**
 * The disk in production (`DOCUMENT_CACHE`, `server/utils/cache/documentDriver.ts`,
 * 12.11.2026): the part of FETCHED that can never change, kept for a month
 * across every restart and deploy. Hard-coded for the same reason as the
 * list above — and narrower than it on purpose. Not here, each with its
 * reason:
 *
 *  - every list, and `gegenstand`: they move within a day;
 *  - every search answer (`bgbl-nummer-suche`, `bund-land-suche`,
 *    `eu-bundesrecht`, `eu-landesrecht`) and the Cellar's SPARQL answers
 *    (`eu-cellar`, `eu-cellar-oj`): an answer given before RIS or the Cellar
 *    knew the act — none, or a partial one — would stand for a month, and no
 *    restart would clear it;
 *  - `bgbl-jahrgang-seite-laufend`: the running year still grows;
 *  - the Länder's pages: their documents are archived on their own
 *    (`deploy/bin/laender-archive.mjs`); not in this round;
 *  - anything from list 142 or of a Stellungnahme — never, see the last test.
 */
const DOCUMENTS = [
  'law-html',
  'kons-para-xml',
  'erlaeuterungen-xml',
  'begut-dokument-xml',
  'bgbl-jahrgang-seite',
]

/** What a Stellungnahme cache is called, or what one would be — none of it may reach the disk. */
const STATEMENT_NAME = /statement|stellungnahm|snme|list-?142|beteiligung/i

const UTILS = join(import.meta.dirname, '..', 'server', 'utils')
const ROOT = join(import.meta.dirname, '..')

/**
 * Every `.ts` file under server/utils, at any depth. Recursive on purpose:
 * the folder moves of the refactor put cached
 * functions into subfolders, and a flat read would walk past them without a
 * word — the rule would stop being enforced and nothing would say so.
 */
function utilsFiles(): string[] {
  return readdirSync(UTILS, { encoding: 'utf8', recursive: true }).filter((f) => f.endsWith('.ts'))
}

/** The same walk written by hand — the second opinion for the test below. */
function walkTs(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...walkTs(join(dir, entry.name), join(prefix, entry.name)))
    else if (entry.name.endsWith('.ts')) out.push(join(prefix, entry.name))
  }
  return out
}

/** Every cached function in server/utils, with the layer it declares and its options' window. */
function cachedFunctions(): { name: string; file: string; derived: boolean; documents: boolean; options: string }[] {
  const out: { name: string; file: string; derived: boolean; documents: boolean; options: string }[] = []
  for (const file of utilsFiles()) {
    const src = readFileSync(join(UTILS, file), 'utf8')
    if (!src.includes('defineCachedFunction(')) continue
    // One options object holds exactly one `name:`, so the next `name:` ends
    // this one — that window is where its `base` has to be.
    const names = [...src.matchAll(/name: '([a-z0-9-]+)'/g)]
    for (const [i, m] of names.entries()) {
      const from = m.index!
      const to = names[i + 1]?.index ?? src.length
      const options = src.slice(from, to)
      out.push({ name: m[1]!, file, derived: options.includes('base: DERIVED_CACHE'), documents: options.includes('base: DOCUMENT_CACHE'), options })
    }
  }
  return out
}

describe('cache layers', () => {
  const found = cachedFunctions()

  it('reads every file under server/utils, subfolders included', () => {
    // A guard on the guard: the scan and an independent recursive walk have
    // to see the same files. Once a cached function moves into a subfolder,
    // a scan that silently went flat again fails here instead of quietly
    // approving whatever lives down there.
    expect(utilsFiles().sort()).toEqual(walkTs(UTILS).sort())
    expect(utilsFiles().length).toBeGreaterThan(40)
  })

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
      '(see server/utils/cache/base.ts).',
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

/**
 * The disk. Three ways onto it would be wrong, and each is held here: a
 * cached function that names the mount without being on the list, a name on
 * the list whose lifetime is not a published document's, and a Stellungnahme.
 */
describe('the document disk', () => {
  const found = cachedFunctions()
  /** The options object alone — the window up to its closing brace, so a later function's options cannot vouch for it. */
  const optionsOf = (options: string) => options.slice(0, (/\}\s*,?\s*\)/.exec(options)?.index ?? options.length) + 1)

  it('holds exactly the listed documents', () => {
    expect(found.filter((f) => f.documents).map((f) => f.name).sort(), 'A cached function names `base: DOCUMENT_CACHE` without being in DOCUMENTS, or the reverse.').toEqual([...DOCUMENTS].sort())
  })

  it('holds only fetched documents, never a derived value', () => {
    expect(DOCUMENTS.filter((n) => FETCHED[n] === undefined)).toEqual([])
    expect(found.filter((f) => f.documents && f.derived).map((f) => f.name)).toEqual([])
  })

  it('keeps each one for the lifetime of a published document, never served stale', () => {
    const wrong = found
      .filter((f) => f.documents)
      .filter((f) => {
        const own = optionsOf(f.options)
        return !/\bmaxAge:\s*PUBLISHED_DOCUMENT_TTL_S\b/.test(own) || !/\bswr:\s*false\b/.test(own) || own.includes('staleWithin(')
      })
    expect(wrong.map((f) => `${f.name} (${f.file})`), 'On the disk: `maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false` and nothing else.').toEqual([])
  })

  it('never holds a Stellungnahme', () => {
    // The guard on the list itself, and on whatever names the mount.
    expect(DOCUMENTS.filter((n) => STATEMENT_NAME.test(n))).toEqual([])
    expect(found.filter((f) => f.documents && STATEMENT_NAME.test(f.name)).map((f) => f.name)).toEqual([])
    // And the guard on the guard: the pattern does catch the Stellungnahmen
    // caches that exist, so a rename cannot make it a test of nothing.
    expect(found.some((f) => STATEMENT_NAME.test(f.name))).toBe(true)
  })

  it('is cleaned under the directory the driver writes to', () => {
    // The nightly `find … -delete` and the driver must name one directory;
    // a rename on one side would leave the other deleting nothing.
    const unit = readFileSync(join(ROOT, 'deploy', 'systemd', 'begutachtungs-monitor-prewarm.service'), 'utf8')
    const driver = readFileSync(join(UTILS, 'cache', 'documentDriver.ts'), 'utf8')
    const subdir = /export const DOCUMENTS_SUBDIR = '([^']+)'/.exec(driver)?.[1]
    expect(subdir).toBeTruthy()
    expect(unit).toMatch(new RegExp(`^ExecStart=-/usr/bin/find /var/lib/begutachtungs-monitor/${subdir} `, 'm'))
  })
})

/**
 * The second choice every cached function makes: how stale it may be served.
 * Nitro's own default is `swr: true` with no limit at all — an expired entry
 * served at any age, days old in dev (`server/utils/cache/ttl.ts`). So each
 * one says `swr: false`, or takes SWR from `staleWithin`
 * (`server/utils/cache/stale.ts`), whose limit refuses what is too old. A
 * bare `swr: true`, or no word on it, is Nitro's default and fails here.
 */
describe('cache staleness', () => {
  const windows: { name: string; file: string; options: string }[] = []
  for (const file of utilsFiles()) {
    const src = readFileSync(join(UTILS, file), 'utf8')
    if (!src.includes('defineCachedFunction(')) continue
    const names = [...src.matchAll(/name: '([a-z0-9-]+)'/g)]
    for (const [i, m] of names.entries()) {
      // The options object alone, up to its closing brace — up to the next
      // `name:` it could borrow the next function's `swr: false` (12.11.2026).
      const window = src.slice(m.index!, names[i + 1]?.index ?? src.length)
      windows.push({ name: m[1]!, file, options: window.slice(0, (/\}\s*,?\s*\)/.exec(window)?.index ?? window.length) + 1) })
    }
  }

  it('finds the cached functions at all', () => {
    expect(windows.length).toBeGreaterThan(8)
    expect(windows.some((w) => w.options.includes('staleWithin('))).toBe(true)
  })

  it('takes SWR only through the bounded helper', () => {
    const bare = windows.filter((w) => /\bswr:\s*true\b/.test(w.options))
    expect(bare.map((w) => `${w.name} (${w.file})`), 'Use `...staleWithin(maxAge, limit)` instead of `swr: true`.').toEqual([])
  })

  /**
   * The other half of the rule: SWR on the layer that pays upstream, and not
   * on one that recomputes over it — its limit would add to the leaf's
   * (`server/utils/cache/stale.ts`). Named here where a layer was split from
   * its leaf (12.11.2026): the § records of a law on a day and its history
   * (`kons-bgbl-fassung`, `kons-history`) are served stale; the resolution
   * and everything a draft's sections assemble over them are not.
   */
  it('keeps the layers over the RIS law reads off SWR', () => {
    const OVER_STALE_LEAVES = ['kons-law-by-bgbl', 'para-titles', 'annex-verification', 'kons-text', 'kons-text-ris', 'amended-laws']
    const leaves = ['kons-bgbl-fassung', 'kons-history']
    const byName = new Map(windows.map((w) => [w.name, w.options]))
    expect(leaves.filter((n) => !byName.get(n)?.includes('staleWithin('))).toEqual([])
    expect(OVER_STALE_LEAVES.filter((n) => byName.get(n) === undefined)).toEqual([])
    expect(OVER_STALE_LEAVES.filter((n) => !/\bswr:\s*false\b/.test(byName.get(n)!))).toEqual([])
  })

  it('says how stale every cached function may be served', () => {
    const silent = windows.filter((w) => !/\bswr:\s*false\b/.test(w.options) && !w.options.includes('staleWithin('))
    expect(
      silent.map((w) => `${w.name} (${w.file})`),
      'Without `swr: false` or `...staleWithin(…)` a cached function runs on Nitro\'s unbounded SWR default.',
    ).toEqual([])
  })
})

/**
 * The driver under the disk mount. Its directory is decided when the mount
 * is made — at server start, from systemd's `STATE_DIRECTORY` — never when
 * the bundle is built.
 */
describe('the document driver', () => {
  const dirs: string[] = []
  const env = { BM_STATE_DIR: process.env.BM_STATE_DIR, STATE_DIRECTORY: process.env.STATE_DIRECTORY }
  const scratch = () => {
    const dir = mkdtempSync(join(tmpdir(), 'bm-documents-'))
    dirs.push(dir)
    return dir
  }
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
    if (env.BM_STATE_DIR === undefined) delete process.env.BM_STATE_DIR
    else process.env.BM_STATE_DIR = env.BM_STATE_DIR
    if (env.STATE_DIRECTORY === undefined) delete process.env.STATE_DIRECTORY
    else process.env.STATE_DIRECTORY = env.STATE_DIRECTORY
  })

  it('finds its directory at mount time: StateDirectory first, ./.data without it', () => {
    delete process.env.BM_STATE_DIR
    process.env.STATE_DIRECTORY = '/var/lib/begutachtungs-monitor:/var/lib/begutachtungs-monitor/reports'
    expect(documentDriver().options.base).toBe(join('/var/lib/begutachtungs-monitor', DOCUMENTS_SUBDIR))
    delete process.env.STATE_DIRECTORY
    expect(documentDriver().options.base).toBe(join(process.cwd(), '.data', DOCUMENTS_SUBDIR))
  })

  it('round-trips an entry under the key Nitro writes, and leaves no temp file', async () => {
    const base = scratch()
    const driver = documentDriver({ base })
    const key = 'nitro:functions:law-html:https%3A%2F%2Fwww.parlament.gv.at%2Fdokument%2FXXVIII%2FME%2F1%2Ffname_1.html.json'
    expect(await driver.getItem(key)).toBeNull()
    await driver.setItem(key, '{"value":"„Text“"}')
    expect(await driver.getItem(key)).toBe('{"value":"„Text“"}')
    expect(driver.hasItem(key)).toBe(true)
    expect(await driver.getKeys()).toEqual([key])
    await driver.removeItem(key)
    expect(await driver.getItem(key)).toBeNull()
    await driver.removeItem(key)
  })

  it('answers a read while the write of that key is still out — no second fetch in the window', async () => {
    const driver = documentDriver({ base: scratch() })
    const key = 'nitro:functions:law-html:x.json'
    // Nitro starts the write after it has let go of the pending call; a
    // reader in between must find the value, not a missing file.
    const write = driver.setItem(key, '{"value":"doc"}')
    expect(driver.hasItem(key)).toBe(true)
    expect(await driver.getItem(key)).toBe('{"value":"doc"}')
    await write
    expect(await driver.getItem(key)).toBe('{"value":"doc"}')
  })

  it('refuses a key that would leave its directory', () => {
    expect(() => documentPath('/x', 'nitro:..:etc')).toThrow()
    expect(() => documentPath('/x', 'nitro:a/b')).toThrow()
    expect(documentPath('/x', 'nitro:functions:a.json')).toBe(join('/x', 'nitro', 'functions', 'a.json'))
  })

  it('costs the cache and not the answer when the disk fails', async () => {
    // A file where the directory should be: every write fails, and says so once.
    const base = join(scratch(), 'occupied')
    writeFileSync(base, '')
    const driver = documentDriver({ base })
    await expect(driver.setItem('nitro:functions:x.json', '{}')).resolves.toBeUndefined()
    expect(await driver.getItem('nitro:functions:x.json')).toBeNull()
  })
})
