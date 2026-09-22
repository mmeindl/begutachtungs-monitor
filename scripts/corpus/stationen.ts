/**
 * Which versions of the law text a Begutachtung actually produces after the
 * Regierungsvorlage — the evidence behind the station selector of the §
 * comparison (docs/architecture.md §12.18).
 *
 * The comparison shipped hard-wired to ME→RV. The later texts have been on
 * the page as documents all along ("Geändert im Ausschuss", "Geändert im
 * Plenum") and were never compared, which is where a Begutachtungsergebnis
 * quietly disappears: the last-minute Abänderungsantrag.
 *
 * Two questions decide whether a selector is worth building, and both need
 * the corpus rather than one page read by eye:
 *
 *  1. HOW OFTEN is there anything after the Regierungsvorlage at all?
 *  2. Is that text HTML — i.e. comparable — or only a PDF? (`parseLawUnits`
 *     needs the Word-HTML export; a PDF-only station can be named but not
 *     compared, exactly as the ME side already is for the older GPs.)
 *
 * And one that decides whether a whitelist is safe: what is the full station
 * VOCABULARY? Upstream titles the groups in free text, the same trap
 * documented for shortinfo headings and document names
 * (docs/api-exploration.md §1) — so the run prints every title it saw, and
 * anything unknown is listed rather than silently mapped.
 *
 *     pnpm corpus:stationen                     # GP XXVII + XXVIII
 *     pnpm corpus:stationen -- --gp XXVI,XXV    # older periods
 *
 * Reads the `.cache/rv-latency/<GP>/ME-<inr>.json` details when they are
 * there (identical payload, same endpoint), else fetches into
 * `.cache/stations/`. The mappers are the SHIPPED ones — the numbers below
 * are what the site sees, not what a second implementation would see.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mapDocuments, mapTextEvolution, RV_STATION, type RawDocumentGroup } from '../../server/utils/parliament/detailJson'
import { argPair } from '../lib/args'
import { PARLIAMENT as BASE, getJson } from '../lib/http'

const SCRIPT = 'corpus/stationen'
const CONCURRENCY = 4

const gps = (argPair('gp') ?? 'XXVII,XXVIII').split(',').map((g) => g.trim().toUpperCase()).filter(Boolean)
for (const gp of gps) {
  if (!/^[IVXLC]+$/.test(gp)) {
    console.error(`--gp expects roman numerals, got ${gp}`)
    process.exit(1)
  }
}

/** Three attempts on a 5xx or a dropped connection; a 4xx is the answer and is not retried. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fetchJson(url: string, body?: unknown): Promise<any> {
  return getJson(url, {
    script: SCRIPT,
    attempts: 3,
    backoffMs: (retry) => 500 * retry,
    timeoutMs: 20_000,
    ...(body === undefined ? {} : { method: 'POST' as const, body }),
  })
}

/** The rv-latency cache first: same endpoint, same payload, 482 details already on disk. */
function cachedDetail(gp: string, inr: number): unknown | null {
  for (const dir of [join('.cache', 'rv-latency', gp), join('.cache', 'stations', gp)]) {
    try {
      return JSON.parse(readFileSync(join(dir, `ME-${inr}.json`), 'utf8'))
    } catch {
      /* next */
    }
  }
  return null
}

interface Row {
  inr: number
  /** Station title → the formats offered, as the shipped mapper names them. */
  stations: Map<string, Set<string>>
  error?: string
}

const formatOf = (url: string) => (url.endsWith('.html') ? 'html' : url.endsWith('.pdf') ? 'pdf' : 'other')

async function measure(gp: string): Promise<Row[]> {
  mkdirSync(join('.cache', 'stations', gp), { recursive: true })
  const list = await fetchJson(
    `${BASE}/Filter/api/filter/data/81?js=eval&showAll=true&sortrnr=11&ascDesc=DESC`,
    { GP_CODE: [gp] },
  )
  const inrs = (list.rows ?? [])
    .filter((r: unknown[]) => Array.isArray(r) && r[0] === gp)
    .map((r: unknown[]) => Number(r[2]))
    .filter((n: number) => Number.isFinite(n))
  console.error(`${gp}: ${inrs.length} Ministerialentwürfe`)

  const queue = [...inrs]
  const rows: Row[] = []
  let done = 0
  const worker = async () => {
    for (;;) {
      const inr = queue.shift()
      if (inr === undefined) return
      try {
        let detail = cachedDetail(gp, inr)
        if (!detail) {
          detail = await fetchJson(`${BASE}/gegenstand/${gp}/ME/${inr}?json=True`)
          writeFileSync(join('.cache', 'stations', gp, `ME-${inr}.json`), JSON.stringify(detail))
        }
        const content = (detail as any)?.content ?? {}
        // Exactly what the detail endpoint does (server/utils/parliament/draftDetail.ts).
        const documents = mapDocuments(content.documents as RawDocumentGroup[] | null)
        const meUrls = new Set(documents.flatMap((d) => d.formats.map((f) => f.url)))
        const versions = mapTextEvolution(content.statements?.documents, meUrls)
        const stations = new Map<string, Set<string>>()
        for (const v of versions) {
          const set = stations.get(v.station) ?? new Set<string>()
          set.add(formatOf(v.url))
          stations.set(v.station, set)
        }
        // The ME's own text, under whatever title it carries.
        for (const d of documents) {
          if (!/^Gesetzestext\b/.test(d.title.trim())) continue
          const set = stations.get(`ME: ${d.title.trim()}`) ?? new Set<string>()
          for (const f of d.formats) set.add(f.type)
          stations.set(`ME: ${d.title.trim()}`, set)
        }
        rows.push({ inr, stations })
      } catch (err) {
        rows.push({ inr, stations: new Map(), error: String(err) })
      }
      if (++done % 50 === 0) console.error(`  ${done}/${inrs.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return rows.sort((a, b) => a.inr - b.inr)
}

const KNOWN = new Set(['Regierungsvorlage', 'Geändert im Ausschuss', 'Geändert im Plenum'])
const pct = (n: number, of: number) => (of ? `${Math.round((1000 * n) / of) / 10} %` : '–')

for (const gp of gps) {
  const rows = await measure(gp)
  const ok = rows.filter((r) => !r.error)

  const has = (r: Row, title: string, format?: string) => {
    const set = r.stations.get(title)
    return Boolean(set && (!format || set.has(format)))
  }
  const count = (title: string, format?: string) => ok.filter((r) => has(r, title, format)).length

  console.log(`\n=== GP ${gp} — ${ok.length} Ministerialentwürfe${rows.length - ok.length ? ` (+${rows.length - ok.length} Fehler)` : ''}`)

  console.log(`\nStationen je Entwurf (nach Abzug der Dokumente, die nur den Entwurf wiederholen)`)
  for (const title of [RV_STATION, 'Geändert im Ausschuss', 'Geändert im Plenum']) {
    const n = count(title)
    console.log(
      `  ${title.padEnd(24)} ${String(n).padStart(4)}  ${pct(n, ok.length).padStart(7)}` +
      `   davon HTML ${String(count(title, 'html')).padStart(4)}  nur PDF ${String(n - count(title, 'html')).padStart(3)}`,
    )
  }

  // What a selector can actually offer: both ends HTML.
  const meHtml = ok.filter((r) => [...r.stations].some(([t, f]) => t.startsWith('ME: ') && f.has('html')))
  const pairs: [string, (r: Row) => boolean][] = [
    ['ME → RV', (r) => [...r.stations].some(([t, f]) => t.startsWith('ME: ') && f.has('html')) && has(r, RV_STATION, 'html')],
    ['RV → Ausschuss', (r) => has(r, RV_STATION, 'html') && has(r, 'Geändert im Ausschuss', 'html')],
    ['RV → Plenum', (r) => has(r, RV_STATION, 'html') && has(r, 'Geändert im Plenum', 'html')],
    ['Ausschuss → Plenum', (r) => has(r, 'Geändert im Ausschuss', 'html') && has(r, 'Geändert im Plenum', 'html')],
  ]
  console.log(`\nVergleichbare Paare (beide Seiten als HTML)`)
  for (const [label, test] of pairs) {
    const n = ok.filter(test).length
    console.log(`  ${label.padEnd(24)} ${String(n).padStart(4)}  ${pct(n, ok.length).padStart(7)}`)
  }
  console.log(`  ${'(Entwurfstext als HTML)'.padEnd(24)} ${String(meHtml.length).padStart(4)}  ${pct(meHtml.length, ok.length).padStart(7)}`)

  // Everything beyond the three known stations, so a whitelist is a decision
  // and not a guess.
  const unknown = new Map<string, number[]>()
  for (const r of ok) {
    for (const title of r.stations.keys()) {
      if (KNOWN.has(title) || title.startsWith('ME: ')) continue
      unknown.set(title, [...(unknown.get(title) ?? []), r.inr])
    }
  }
  console.log(`\nUnbekannte Titel in der Stationsliste: ${unknown.size || 'keine'}`)
  for (const [title, inrs] of [...unknown].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(inrs.length).padStart(3)}  ${JSON.stringify(title)}  ${inrs.slice(0, 6).map((i) => `${i}/ME`).join(', ')}${inrs.length > 6 ? ' …' : ''}`)
  }

  // The ME's own text is titled freely too — "Gesetzestext (korrigierte
  // Version)" exists, and the resolver matched the bare word only.
  const meTitles = new Map<string, number>()
  for (const r of ok) for (const t of r.stations.keys()) if (t.startsWith('ME: ')) meTitles.set(t.slice(4), (meTitles.get(t.slice(4)) ?? 0) + 1)
  console.log(`\nTitel des Entwurfstexts`)
  for (const [t, n] of [...meTitles].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${JSON.stringify(t)}`)
}
