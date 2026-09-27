/**
 * How many Ministerialentwürfe carry the ressort's Textgegenüberstellung, per
 * Gesetzgebungsperiode — and whether a low figure for the old periods is the
 * documents being absent or our reading of them (TODO Teil 3, „Deckung der
 * amtlichen Textgegenüberstellung in GP XXIII–XXVII").
 *
 * A hand sample of eight drafts suggested 1–3 of 8 for XXIII–XXVII against
 * 7 of 8 for XXVIII. Three things could make that number, and they need to be
 * told apart before anything is built or promised on it:
 *
 *  1. **The document is absent.** The ressort published none.
 *  2. **The join lost it.** The RIS record that carries it was never joined to
 *     the ME. Answered by (c) below, which does not use the join at all.
 *  3. **The name rule lost it.** The document is there under a name the rule
 *     does not read („BUAG_TGÜ_Begutachtung"), or inside a document that holds
 *     Vorblatt, Erläuterungen and Gegenüberstellung at once („Materialien" —
 *     every RIS Begut record before about 2010 has exactly two documents,
 *     „Hauptdokument" and „Materialien").
 *
 * Per ME of the period (list 81, deduped by INR):
 *   (a) Parliament: a group on the ME's own document list the SHIPPED name
 *       rule matches, and in which formats;
 *   (b) RIS, joined: the record the SHIPPED join (`joinRisToMe`, ruleVersion
 *       printed) assigns, and whether the SHIPPED mapper (`flattenRisRecord`)
 *       finds a `textComparison` on it;
 *   (d) the union of (a) and (b).
 * Join-free:
 *   (c) every RIS Begut record whose Beginn falls inside the period and that
 *       `classifyRisRecord` calls 'gesetz': how many carry `textComparison`.
 * Diagnostics, NOT the shipped rule and labelled as such in the output:
 *   - the document titles of the MEs the rule finds nothing on, so a name the
 *     rule misses shows up as a name and not as an absence;
 *   - the widened TOKEN rule (`WIDE_ANNEX` below) beside every shipped figure;
 *   - with `--probe`, the candidate documents of the MEs and records that
 *     neither rule finds a TGÜ on (Parliament: `BUNDLE_PARL`, as HTML or the
 *     PDF's text layer; RIS: `BUNDLE_RIS`, as XML with the shipped scan test,
 *     because RIS's HTML of a rasterised table is images only) are searched
 *     for the header ROW of a Gegenüberstellung, „Geltende Fassung" beside
 *     „Vorgeschlagene Fassung". Found = the annex is inside that document.
 *
 *     npx vite-node scripts/corpus/tguDeckung.ts -- --gp XXIII,XXIV,XXV,XXVI,XXVII,XXVIII
 *     npx vite-node scripts/corpus/tguDeckung.ts -- --gp XXIV --probe
 *     npx vite-node scripts/corpus/tguDeckung.ts -- --gp XXIV --probe --probe-max 60 --out /tmp/tgu
 *
 * Period windows are `GP_STARTS` (shared/utils/gp.ts): GP n runs from its
 * konstituierende Sitzung to the day before GP n+1's; the newest is open.
 *
 * Caching: details under `.cache/tgu-deckung/<GP>/ME-<inr>.json`, read first
 * from `.cache/rv-latency/<GP>/` and `.cache/stations/<GP>/` when they are
 * there (same endpoint, same payload); list 81 per GP and the flattened RIS
 * corpus under `.cache/tgu-deckung/`; probed documents as their verdict only.
 * Nothing expires — delete the directory to read the corpus again. Per-ME rows
 * go to `<out>/<GP>-rows.json` (default `.cache/tgu-deckung/`).
 *
 * The name rule is `ANNEX_NAME_RE` from `scripts/lib/ris.ts`, which is a copy:
 * the Parliament-side rule in `server/utils/annex/annexSource.ts` is not
 * exported and that module is not importable here (it pulls in the Nitro
 * cache through `parliament/drafts.ts`). So the run first reads both shipped
 * literals out of their source files and refuses to start if either differs
 * from the copy — a measurement with a drifted rule measures itself.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mapDocuments, mapTextEvolution, RV_STATION, type RawDocumentGroup } from '../../server/utils/parliament/detailJson'
import { mapDraftRow } from '../../server/utils/parliament/list81'
import { classifyRisRecord, dedupeMeRows, joinRisToMe, RULE_VERSION, toMeListRows, type JoinRow } from '../../server/utils/ris/risJoin'
import { isScanned } from '../../server/utils/annex/tableCells'
import { hasDocument, type RisBegutFlat, type RisDocumentUrls } from '../../server/utils/ris/risRecord'
import { meTextTitleRank } from '../../shared/utils/lawStations'
import { GP_STARTS } from '../../shared/utils/gp'
import { ANNEX_NAME_RE } from '../lib/ris'
import { fetchRisBegutCorpus, type RisCorpus } from '../lib/corpus'
import { argFlag, argPair } from '../lib/args'
import { PARLIAMENT as BASE, getJson, getText, scriptUserAgent } from '../lib/http'
import { cachedJson } from '../lib/diskCache'
import { pool, sleep } from '../lib/async'

const SCRIPT = 'corpus/tguDeckung'
const CONCURRENCY = 4
const CACHE = join('.cache', 'tgu-deckung')

const gps = (argPair('gp') ?? 'XXIII,XXIV,XXV,XXVI,XXVII,XXVIII').split(',').map((g) => g.trim().toUpperCase()).filter(Boolean)
const probe = argFlag('probe')
const probeMax = Number(argPair('probe-max') ?? Infinity)
const outDir = argPair('out') ?? CACHE
const ORDER = Object.keys(GP_STARTS)
for (const gp of gps) {
  if (!GP_STARTS[gp]) {
    console.error(`--gp: no start date for ${gp} in GP_STARTS (shared/utils/gp.ts)`)
    process.exit(1)
  }
}
mkdirSync(outDir, { recursive: true })

// --- the rule is the shipped one, or the run does not start -----------------
for (const file of ['server/utils/annex/annexSource.ts', 'server/utils/ris/risRecord.ts']) {
  const src = readFileSync(file, 'utf8')
  const m = /const (?:ANNEX_NAME_RE|TEXT_COMPARISON_NAME) = (\/.+\/[a-z]*)\s*$/m.exec(src)
  if (!m || m[1] !== String(ANNEX_NAME_RE)) {
    console.error(`Name rule drifted: ${file} has ${m?.[1] ?? '(none found)'}, scripts/lib/ris.ts has ${String(ANNEX_NAME_RE)}`)
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
    timeoutMs: 25_000,
    ...(body === undefined ? {} : { method: 'POST' as const, body }),
  })
}

/** The window of a period: [start, next start), the newest open to today. */
function windowOf(gp: string): [string, string] {
  const next = ORDER[ORDER.indexOf(gp) + 1]
  return [GP_STARTS[gp]!, next ? GP_STARTS[next]! : '9999-12-31']
}

/** Earlier measurements' caches first: same endpoint, same payload. */
function cachedDetail(gp: string, inr: number): unknown | null {
  for (const dir of [join(CACHE, gp), join('.cache', 'rv-latency', gp), join('.cache', 'stations', gp)]) {
    try {
      return JSON.parse(readFileSync(join(dir, `ME-${inr}.json`), 'utf8'))
    } catch {
      /* not under this directory — ask the next one */
    }
  }
  return null
}

// --- diagnostics: NOT the shipped rule ---------------------------------------
/** Any title that could name a Gegenüberstellung in a way the rule does not read. */
const LOOSE_ANNEX = /TG(Ü|G|UE)|gegen|synops/i
/**
 * The widened TOKEN rule — what the documents actually carry, as opposed to
 * what the shipped rule reads. It finds the abbreviation anywhere in the name
 * as a word of its own („TGÜ Anpassung QJF-G", „42. KFG-Nov.TGÜ.11.05.2026",
 * „IFG-TGÜ (2025-05-07)", „CBDF_TGUe_201008", „TxtGGÜ", „PSG-Nov TextGG"), where the shipped one
 * takes it only at the end after an underscore. Matched on NFC: a handful of
 * names in the RIS corpus arrive decomposed (a + U+0308), and „Ü" would then
 * not be one character. Diagnostic only — reported beside the shipped figure,
 * never instead of it.
 */
const WIDE_ANNEX = /(^|[^A-Za-zÄÖÜäöü])(TG(Ü|G|UE|Ue)|TxtGGÜ|TxTGGÜ|TxtGG|TGGÜ|TextGG)($|[^A-Za-zÄÖÜäöü])|gegen.?(ü|ue)ber/i
const wide = (name: string) => WIDE_ANNEX.test(name.normalize('NFC').trim())
/**
 * A RIS record under the widened rule: the shipped `textComparison`, or a
 * document among `otherDocuments` whose name the token finds. A name the
 * mapper classified as Erläuterungen, Hauptdokument or Begleitschreiben is not
 * among them — a bound, and a small one: none of the names quoted above would
 * be.
 */
const risWide = (r: RisBegutFlat | null) => Boolean(r && (hasDocument(r.textComparison) || r.otherDocuments.some((d) => wide(d.name))))

/** Parliament titles of a bundled document that may hold the annex. */
const BUNDLE_PARL = /materialien|erl(ä|ae|a)uterung|_erl\b|begmat|vorblatt/i
/**
 * RIS names worth opening: the bundle („Materialien", „Material", „begmat")
 * and the names that turned out to BE the annex under a label no token reads
 * — „begtxt"/„txt" (30 of 51 carry the header row, 26.09.2026), „textg",
 * „GGÜ"/„GGUe", „begtgue".
 */
const BUNDLE_RIS = /materialien|^material$|begmat|begtxt|^txt$|textg|gg(ü|ue)|tgue/i
/**
 * Both column headings of a Gegenüberstellung — the shipped header cells
 * (`annex/tableCells.ts` HEADER_CURRENT_RE / HEADER_PROPOSED_RE), unanchored,
 * because here they are searched in running text rather than tested on a cell.
 */
const HEADINGS = [/geltende[rn]?\s+(?:fassung|text)\b/i, /vorgeschlagene[rn]?\s+(?:fassung|text)\b/i]
/**
 * The header ROW: the two cells side by side. Erläuterungen say „in der
 * geltenden Fassung" and „die vorgeschlagene Fassung" in running prose, so
 * both words somewhere is not yet a Gegenüberstellung; the pair adjacent is.
 */
const HEADER_ROW = /geltende[rn]?\s+(?:fassung|text)\b[^.]{0,40}?vorgeschlagene[rn]?\s+(?:fassung|text)\b/i

type ProbeVerdict = 'enthält TGÜ' | 'Spaltenwörter nur im Fließtext' | 'Wort, keine Spalten' | 'nichts' | 'Scan ohne Text' | 'kein Format' | 'Fehler'
/** Which verdict speaks for an ME with several bundle documents: a find first, then what leaves it open. */
const VERDICT_ORDER: ProbeVerdict[] = ['enthält TGÜ', 'Spaltenwörter nur im Fließtext', 'Wort, keine Spalten', 'Fehler', 'Scan ohne Text', 'kein Format', 'nichts']

/** PDF text the way the search reads it (`search/begutSearchService.ts`): unpdf, pages merged. */
async function pdfText(url: string): Promise<string> {
  let last: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': scriptUserAgent(SCRIPT) }, signal: AbortSignal.timeout(60_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { extractText, getDocumentProxy } = await import('unpdf')
      const { text } = await extractText(await getDocumentProxy(new Uint8Array(await res.arrayBuffer())), { mergePages: true })
      return typeof text === 'string' ? text : (text as string[]).join('\n')
    } catch (err) {
      last = err
      await sleep(800 * attempt)
    }
  }
  throw last
}

/** The verdict on one document's text. */
function verdictOf(plain: string, fromPdf: boolean): ProbeVerdict {
  if (HEADER_ROW.test(plain.replace(/\s+/g, ' '))) return 'enthält TGÜ'
  if (HEADINGS.every((re) => re.test(plain))) return 'Spaltenwörter nur im Fließtext'
  if (/gegen\s*über\s*stellung/i.test(plain)) return 'Wort, keine Spalten'
  // A rasterised PDF has no text layer: that is not „nothing in it".
  if (fromPdf && plain.replace(/\s+/g, '').length < 200) return 'Scan ohne Text'
  return 'nichts'
}

/**
 * A RIS document, read the way the annex engine reads it: the XML, and a scan
 * recognised by the SHIPPED test (`annex/tableCells.ts` isScanned) — RIS
 * rasterises tables into GIFs, and its HTML of such a document is CSS and
 * images with no text at all, which a text search would call „nichts". A
 * scan falls back to the PDF's text layer and is a scan when it has none.
 */
async function probeRisDocument(key: string, u: RisDocumentUrls): Promise<ProbeVerdict> {
  if (!u.xml) return probeDocument(key, u.html, u.pdf)
  return cachedJson<ProbeVerdict>(join(CACHE, 'probe', `${key}.json`), async () => {
    try {
      const xml = await getText(u.xml!, { script: SCRIPT, attempts: 3, backoffMs: (r) => 800 * r, timeoutMs: 45_000 })
      if (!isScanned(xml)) return verdictOf(xml.replace(/<[^>]+>/g, ' '), false)
      if (!u.pdf) return 'Scan ohne Text'
      const v = verdictOf(await pdfText(u.pdf), true)
      return v === 'nichts' ? 'Scan ohne Text' : v
    } catch {
      return 'Fehler'
    }
  })
}

async function probeDocument(key: string, html: string | null, pdf: string | null): Promise<ProbeVerdict> {
  if (!html && !pdf) return 'kein Format'
  return cachedJson<ProbeVerdict>(join(CACHE, 'probe', `${key}.json`), async () => {
    try {
      const plain = html
        ? (await getText(html, { script: SCRIPT, attempts: 3, backoffMs: (r) => 800 * r, timeoutMs: 45_000 })).replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
            // Parliament's Word export writes umlauts as entities („Textgegen&uuml;berstellung").
            .replace(/&([aouAOU])uml;/g, (_, v: string) => ({ a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' })[v]!).replace(/&szlig;/g, 'ß')
        : await pdfText(pdf!)
      return verdictOf(plain, !html)
    } catch {
      return 'Fehler'
    }
  })
}

// --- the RIS corpus, once -------------------------------------------------------
mkdirSync(join(CACHE, 'probe'), { recursive: true })
const corpus = await cachedJson<RisCorpus>(join(CACHE, 'ris-begut.json'), () => fetchRisBegutCorpus(SCRIPT))
const risById = new Map(corpus.records.map((r) => [r.id, r]))
const dated = corpus.records.map((r) => r.beginn).filter((d): d is string => Boolean(d)).sort()
console.log(`RIS Begut: ${corpus.records.length} Records gelesen, API meldet ${corpus.hits}; ` +
  `frühester Beginn ${dated[0] ?? '–'}, ohne Beginn ${corpus.records.length - dated.length}`)
console.log(`Join ruleVersion ${RULE_VERSION}, Namensregel ${String(ANNEX_NAME_RE)}${probe ? ', mit Inhaltsprobe' : ''}`)

interface Row {
  inr: number
  cite: string
  title: string
  parl: { tgu: boolean; html: boolean; pdf: boolean; titles: string[] }
  meTextHtml: boolean
  /** The diff path's fallback: the joined record's Hauptdokument as XML (`diff/lawDiffService.ts`). */
  meTextRisXml: boolean
  rvHtml: boolean
  join: { status: JoinRow['status']; risId: string | null }
  risTgu: boolean
  /** Diagnostic: the widened token on the same joined record. */
  risTguWide: boolean
  /** Diagnostic: the widened token on the ME's Parliament titles. */
  parlTguWide: boolean
  risClass: string | null
  /** Diagnostics */
  looseTitles: string[]
  bundleProbe?: ProbeVerdict
  risBundleProbe?: ProbeVerdict
  error?: string
}

const pct = (n: number, of: number) => (of ? `${Math.round((1000 * n) / of) / 10} %` : '–')
const kv = (n: number, of: number) => `${n}/${of} (${pct(n, of)})`
const summary: string[] = []

for (const gp of gps) {
  mkdirSync(join(CACHE, gp), { recursive: true })
  const [from, to] = windowOf(gp)
  const list = await cachedJson<{ rows?: unknown[][] }>(join(CACHE, `${gp}-list81.json`), () =>
    fetchJson(`${BASE}/Filter/api/filter/data/81?js=eval&showAll=true&sortrnr=11&ascDesc=DESC`, { GP_CODE: [gp] }),
  )
  const listRows = (list.rows ?? []).filter((r) => Array.isArray(r) && r[0] === gp)
  // Exactly the join's input on the site (`ris/begutCorpus.ts` getRisMapForGp):
  // every list-81 row mapped, then deduped per INR with its co-ministries.
  const mes = dedupeMeRows(toMeListRows(listRows.map(mapDraftRow)))
  const joinByInr = new Map(joinRisToMe(mes, corpus.records).map((j) => [j.inr, j]))
  console.error(`\n${gp}: ${mes.length} Ministerialentwürfe (${listRows.length} Zeilen), Fenster ${from} … ${to}`)

  const rows: Row[] = await pool(mes, CONCURRENCY, async (me): Promise<Row> => {
    const j = joinByInr.get(me.inr)
    const rec: RisBegutFlat | null = j?.risId ? risById.get(j.risId) ?? null : null
    const base = {
      inr: me.inr,
      cite: me.cite,
      title: me.title,
      join: { status: j?.status ?? 'unmatched', risId: j?.risId ?? null },
      risTgu: hasDocument(rec?.textComparison ?? null),
      risTguWide: risWide(rec),
      meTextRisXml: Boolean(rec?.mainDocument.xml),
      risClass: rec ? classifyRisRecord(rec) : null,
    }
    try {
      let detail = cachedDetail(gp, me.inr)
      if (!detail) {
        detail = await fetchJson(`${BASE}/gegenstand/${gp}/ME/${me.inr}?json=True`)
        await cachedJson(join(CACHE, gp, `ME-${me.inr}.json`), async () => detail)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = (detail as any)?.content ?? {}
      const documents = mapDocuments(content.documents as RawDocumentGroup[] | null)
      // The shipped Parliament-side lookup (`annex/annexSource.ts` parliamentAnnex).
      const group = documents.find((d) => ANNEX_NAME_RE.test(d.title.trim()))
      const meUrls = new Set(documents.flatMap((d) => d.formats.map((f) => f.url)))
      const rvHtml = mapTextEvolution(content.statements?.documents, meUrls).some((v) => v.station === RV_STATION && v.url.endsWith('.html'))
      const meText = documents.filter((d) => meTextTitleRank(d.title) >= 0).sort((a, b) => meTextTitleRank(a.title) - meTextTitleRank(b.title))[0]
      return {
        ...base,
        parl: {
          tgu: Boolean(group),
          html: Boolean(group?.formats.some((f) => f.type === 'html')),
          pdf: Boolean(group?.formats.some((f) => f.type === 'pdf')),
          titles: documents.map((d) => d.title.trim()),
        },
        parlTguWide: Boolean(group) || documents.some((d) => wide(d.title)),
        meTextHtml: Boolean(meText?.formats.some((f) => f.type === 'html')),
        rvHtml,
        looseTitles: documents.map((d) => d.title.trim()).filter((t) => !ANNEX_NAME_RE.test(t) && LOOSE_ANNEX.test(t)),
      }
    } catch (err) {
      return { ...base, parl: { tgu: false, html: false, pdf: false, titles: [] }, parlTguWide: false, meTextHtml: false, rvHtml: false, looseTitles: [], error: String(err) }
    }
  }, (done, total) => {
    if (done % 50 === 0 || done === total) process.stderr.write(`\r  Details ${done}/${total}`)
  })
  process.stderr.write('\n')

  // --- (c) join-free: RIS Gesetzesentwürfe of the window -----------------------
  const inWindow = corpus.records.filter((r) => r.beginn && r.beginn >= from && r.beginn < to)
  const gesetz = inWindow.filter((r) => classifyRisRecord(r) === 'gesetz')
  const gesetzTgu = gesetz.filter((r) => hasDocument(r.textComparison))
  const gesetzWide = gesetz.filter((r) => risWide(r))
  const joinedIds = new Set(rows.map((r) => r.join.risId).filter(Boolean))
  const joinedInWindow = gesetz.filter((r) => joinedIds.has(r.id))

  // --- optional content probe of bundled documents -----------------------------
  if (probe) {
    // Only what neither rule finds: the question is whether the rest is absent.
    const parlCands = rows.filter((r) => !r.error && !r.parlTguWide && !r.risTguWide && r.parl.titles.some((t) => BUNDLE_PARL.test(t)))
    const probeable = (r: RisBegutFlat) => !risWide(r) && r.otherDocuments.some((d) => BUNDLE_RIS.test(d.name.normalize('NFC')))
    const risCands = gesetz.filter(probeable)
    // The joined records too, whatever `classifyRisRecord` calls them and
    // wherever their Beginn falls: otherwise „nur Parlament" below would be an
    // upper bound. Counted into (c) only where they are in `gesetz`.
    const joinedCands = rows
      .map((r) => (r.join.risId ? risById.get(r.join.risId) ?? null : null))
      .filter((r): r is RisBegutFlat => r !== null && probeable(r) && !risCands.includes(r))
    const pick = <T>(xs: T[]): T[] => (Number.isFinite(probeMax) && xs.length > probeMax ? xs.filter((_, i) => i % Math.ceil(xs.length / probeMax) === 0) : xs)
    const parlPick = pick(parlCands)
    const risPick = pick(risCands)
    await pool(parlPick, CONCURRENCY, async (r) => {
      const detail = cachedDetail(gp, r.inr)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docs = mapDocuments((detail as any)?.content?.documents)
      const verdicts: ProbeVerdict[] = []
      for (const d of docs.filter((x) => BUNDLE_PARL.test(x.title))) {
        const url = (t: 'html' | 'pdf') => d.formats.find((f) => f.type === t)?.url ?? null
        verdicts.push(await probeDocument(`parl-${gp}-${r.inr}-${Buffer.from(d.title).toString('hex').slice(0, 24)}`, url('html'), url('pdf')))
      }
      r.bundleProbe = VERDICT_ORDER.find((v) => verdicts.includes(v)) ?? 'nichts'
    }, (d, t) => process.stderr.write(`\r  Probe Parlament ${d}/${t}`))
    process.stderr.write('\n')
    const risVerdict = new Map<string, ProbeVerdict>()
    await pool([...risPick, ...joinedCands], CONCURRENCY, async (r) => {
      const verdicts: ProbeVerdict[] = []
      for (const doc of r.otherDocuments.filter((d) => BUNDLE_RIS.test(d.name.normalize('NFC')))) {
        const u: RisDocumentUrls = doc.urls
        verdicts.push(await probeRisDocument(`ris-${r.id}-${Buffer.from(doc.name).toString('hex').slice(0, 24)}`, u))
      }
      risVerdict.set(r.id, VERDICT_ORDER.find((v) => verdicts.includes(v)) ?? 'nichts')
    }, (d, t) => process.stderr.write(`\r  Probe RIS ${d}/${t}`))
    process.stderr.write('\n')
    for (const r of rows) if (r.join.risId && risVerdict.has(r.join.risId)) r.risBundleProbe = risVerdict.get(r.join.risId)
    const parlProbed = parlPick.length
    const risProbed = risPick.length
    const count = (vs: (ProbeVerdict | undefined)[]) => {
      const m = new Map<string, number>()
      for (const v of vs) if (v) m.set(v, (m.get(v) ?? 0) + 1)
      return [...m].map(([k, n]) => `${k} ${n}`).join(', ') || '–'
    }
    const parlFound = rows.filter((r) => r.bundleProbe === 'enthält TGÜ').length
    const risFound = risPick.filter((r) => risVerdict.get(r.id) === 'enthält TGÜ').length
    summary.push(`${gp} Probe Parlament: ${parlProbed} von ${parlCands.length} Kandidaten gelesen → ${count(rows.map((r) => r.bundleProbe))}`)
    summary.push(`${gp} Probe RIS:       ${risProbed} von ${risCands.length} Kandidaten gelesen → ${count(risPick.map((r) => risVerdict.get(r.id)))}` +
      ` (dazu ${joinedCands.length} gejointe außerhalb von 'gesetz'/Fenster → ${count(joinedCands.map((r) => risVerdict.get(r.id)))})`)
    summary.push(`${gp} → mit gebündelter TGÜ: Parlament +${parlFound}, RIS (Gesetz, joinfrei) +${risFound}`)
  }

  writeFileSync(join(outDir, `${gp}-rows.json`), JSON.stringify(rows, null, 1))

  // --- per-period report ----------------------------------------------------------
  const ok = rows.filter((r) => !r.error)
  const joined = ok.filter((r) => r.join.risId)
  const parl = ok.filter((r) => r.parl.tgu)
  const risJ = ok.filter((r) => r.risTgu)
  const union = ok.filter((r) => r.parl.tgu || r.risTgu)
  const status = new Map<string, number>()
  for (const r of ok) status.set(r.join.status, (status.get(r.join.status) ?? 0) + 1)

  console.log(`\n=== GP ${gp} — ${ok.length} Ministerialentwürfe${rows.length - ok.length ? ` (+${rows.length - ok.length} Fehler)` : ''}, Fenster ${from} … ${to}`)
  console.log(`  mit RIS-Record gejoint      ${kv(joined.length, ok.length)}   (${[...status].map(([k, n]) => `${k} ${n}`).join(', ')})`)
  console.log(`  (a) TGÜ beim Parlament      ${kv(parl.length, ok.length)}   HTML ${parl.filter((r) => r.parl.html).length}, nur PDF ${parl.filter((r) => !r.parl.html).length}`)
  console.log(`  (b) TGÜ im RIS (gejoint)    ${kv(risJ.length, ok.length)}   — von den gejointen ${kv(risJ.length, joined.length)}`)
  console.log(`      nur Parlament ${ok.filter((r) => r.parl.tgu && !r.risTgu).length}, nur RIS ${ok.filter((r) => !r.parl.tgu && r.risTgu).length}, beide ${ok.filter((r) => r.parl.tgu && r.risTgu).length}`)
  console.log(`  (d) Vereinigung             ${kv(union.length, ok.length)}`)
  console.log(`  (c) joinfrei: RIS-Records im Fenster ${inWindow.length}, davon 'gesetz' ${gesetz.length}, mit TGÜ ${kv(gesetzTgu.length, gesetz.length)}`)
  console.log(`      davon an ein ME dieser GP gejoint ${joinedInWindow.length}; TGÜ-Quote der nicht gejointen ${kv(gesetz.filter((r) => !joinedIds.has(r.id) && hasDocument(r.textComparison)).length, gesetz.length - joinedInWindow.length)}`)
  // The same four figures under the widened token (diagnostic).
  const parlW = ok.filter((r) => r.parlTguWide)
  const risW = ok.filter((r) => r.risTguWide)
  const unionW = ok.filter((r) => r.parlTguWide || r.risTguWide)
  console.log(`  [breit] (a) Parlament ${kv(parlW.length, ok.length)} · (b) RIS gejoint ${kv(risW.length, ok.length)} · (d) Vereinigung ${kv(unionW.length, ok.length)} · (c) joinfrei ${kv(gesetzWide.length, gesetz.length)}`)
  // The headline split: Parliament has one, the joined RIS record has none
  // under the shipped rule — really Parliament-only, or a name the rule misses?
  const parlOnly = ok.filter((r) => r.parl.tgu && !r.risTgu)
  const tag = (r: Row) => (!r.join.risId ? `kein Join (${r.join.status})` : r.risTguWide ? 'RIS hat sie (Name)' : 'nur Parlament')
  const tags = new Map<string, Row[]>()
  for (const r of parlOnly) tags.set(tag(r), [...(tags.get(tag(r)) ?? []), r])
  console.log(`  TGÜ beim Parlament, gejointer RIS-Record ohne (Regel): ${parlOnly.length} — ${[...tags].map(([k, v]) => `${k} ${v.length}`).join(', ') || '–'}`)
  for (const [k, v] of tags) {
    console.log(`      ${k}: ${v.map((r) => {
      const rec = r.join.risId ? risById.get(r.join.risId) : null
      const name = rec?.otherDocuments.find((d) => wide(d.name))?.name
      return `${r.cite}${r.join.risId ? ` ${r.join.risId}` : ''}${name ? ` ${JSON.stringify(name)}` : ''}`
    }).join('; ')}`)
  }
  console.log(`  Kontext § -Vergleich: Entwurfstext als HTML ${kv(ok.filter((r) => r.meTextHtml).length, ok.length)}, RV als HTML ${kv(ok.filter((r) => r.rvHtml).length, ok.length)}, beide ${kv(ok.filter((r) => r.meTextHtml && r.rvHtml).length, ok.length)}; ` +
    `mit RIS-XML-Fallback Entwurf ${kv(ok.filter((r) => r.meTextHtml || r.meTextRisXml).length, ok.length)}, vergleichbar ME→RV ${kv(ok.filter((r) => (r.meTextHtml || r.meTextRisXml) && r.rvHtml).length, ok.length)}`)

  // Diagnostics: what the MEs WITHOUT a TGÜ publish, by title.
  const without = ok.filter((r) => !r.parl.tgu && !r.risTgu)
  const titles = new Map<string, number>()
  for (const r of without) for (const t of new Set(r.parl.titles)) titles.set(t, (titles.get(t) ?? 0) + 1)
  console.log(`  [Diagnose] Dokumenttitel der ${without.length} MEs ohne TGÜ (häufigste 12):`)
  for (const [t, n] of [...titles].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`      ${String(n).padStart(4)}  ${JSON.stringify(t)}`)
  const loose = ok.filter((r) => !r.parl.tgu && r.looseTitles.length)
  console.log(`  [Diagnose] Titel, die die Regel NICHT liest und nach TGÜ aussehen: ${loose.length} MEs` +
    (loose.length ? ` — z. B. ${loose.slice(0, 6).map((r) => `${r.cite} ${JSON.stringify(r.looseTitles[0])}`).join('; ')}` : ''))
  const risOther = new Map<string, number>()
  for (const r of gesetz.filter((x) => !hasDocument(x.textComparison))) for (const d of r.otherDocuments) risOther.set(d.name, (risOther.get(d.name) ?? 0) + 1)
  console.log(`  [Diagnose] RIS 'gesetz' ohne TGÜ: sonstige Dokumente (häufigste 6): ` +
    [...risOther].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `${JSON.stringify(t)} ${n}`).join(', '))
  const tguParl = new Map<string, number>()
  for (const r of parl) for (const t of r.parl.titles.filter((x) => ANNEX_NAME_RE.test(x))) tguParl.set(t, (tguParl.get(t) ?? 0) + 1)
  console.log(`  [Diagnose] Titel, die die Regel beim Parlament als TGÜ liest (häufigste 5): ` +
    [...tguParl].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `${JSON.stringify(t)} ${n}`).join(', '))

  summary.push(`|| ${gp} | ${ok.length} | ${joined.length} (${pct(joined.length, ok.length)}) | ${parlW.length} (${pct(parlW.length, ok.length)}) | ${risW.length} (${pct(risW.length, ok.length)}) | ${unionW.length} (${pct(unionW.length, ok.length)}) | ${gesetzWide.length} von ${gesetz.length} (${pct(gesetzWide.length, gesetz.length)}) |`)
  summary.push(`| ${gp} | ${ok.length} | ${joined.length} (${pct(joined.length, ok.length)}) | ${parl.length} (${pct(parl.length, ok.length)}; HTML ${parl.filter((r) => r.parl.html).length}) | ${risJ.length} (${pct(risJ.length, ok.length)}) | ${union.length} (${pct(union.length, ok.length)}) | ${gesetzTgu.length} von ${gesetz.length} (${pct(gesetzTgu.length, gesetz.length)}) |`)
}

console.log(`\n| GP | MEs | gejoint | TGÜ Parlament | TGÜ RIS (gejoint) | Vereinigung | joinfrei RIS 'gesetz' mit TGÜ |`)
console.log(`|---|---|---|---|---|---|---|`)
for (const line of summary.filter((l) => l.startsWith('| '))) console.log(line)
console.log(`\nDasselbe mit der breiten Token-Regel (Diagnose, nicht die ausgelieferte Regel)`)
console.log(`| GP | MEs | gejoint | TGÜ Parlament | TGÜ RIS (gejoint) | Vereinigung | joinfrei RIS 'gesetz' mit TGÜ |`)
console.log(`|---|---|---|---|---|---|---|`)
for (const line of summary.filter((l) => l.startsWith('||'))) console.log(line.slice(1))
for (const line of summary.filter((l) => !l.startsWith('|'))) console.log(line)
