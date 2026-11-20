#!/usr/bin/env vite-node
/**
 * The § comparison held to what it promises, over a whole period — the
 * instrument the station path lacked until 19.11.2026 (`lib/stationChecks.ts`
 * says what each check means).
 *
 * Usage:  npx vite-node -c vitest.config.ts scripts/harness/station.ts [--gp=XXVIII] [--only=80] [--cache]
 *                                                                     [--json=<file>] [--baseline=<file>] [--zeige=<text>]
 *
 * Every station text of every draft of the period that reached a
 * Regierungsvorlage, read through the page's own parsers, and every pair the
 * station chooser offers compared through `diffLawPackage` with the
 * service's options (`scopeToDraft`, `keepAddedLaws`, `keepDroppedLaws`):
 *
 *  1. **Invariants**, which must hold without exception: reconstruction,
 *     completeness, a visible change in every „geändert" unit, and every
 *     unit under the heading of its own later text. A breach fails the run
 *     (exit 1).
 *  2. **Symmetry**: the same pairs, compared the other way round. Listed;
 *     the alignment is greedy, so a tie may break differently, and every
 *     line is one to read, not yet a defect.
 *  3. **Two null comparisons**, where nothing may change:
 *     - the last parliamentary text (Plenum, else Ausschuss, else Vorlage)
 *       against the Kundmachung, scoped to the draft where the Vorlage
 *       bundles others — what remains is a reader artefact, the Fundstelle
 *       being filled in (editorial), or a real difference after the Plenum;
 *     - the draft read from Parliament's HTML against the same draft read
 *       from RIS XML (`getRisMapForGp`'s join) — the page reads the XML for
 *       a PDF-only draft, so every residue here lands on those drafts.
 *     Every residue is printed with its pieces.
 *  4. **The ceiling**: units whose word diff stopped at its limit, with
 *     their sizes.
 *
 * `--json=<file>` writes the residues and breaches as a record;
 * `--baseline=<file>` compares the residues of both null comparisons with a
 * record written before and fails on any line that came or went, so a
 * change that moves the reading has to move the record in the same commit
 * (as `ci/annexDrift.ts` does for the annex). A residue in the record is not
 * thereby accepted: `scripts/harness/stationBaseline.json` names for each
 * one that is not editorial why it stands (`reasons`) — a source that
 * differs, or a reader asymmetry still open.
 *
 * Reads through the offline cache with `--cache` (`HARNESS_CACHE`, default
 * `.harness-cache`); a miss is fetched and stored. A hit is as old as the
 * cache: on 19.11.2026 it held the records of 104/ME to 110/ME XXVIII from
 * before their Vorlage, so a run over GP XXVIII read 91 drafts, not every
 * draft the page compares.
 *
 * With `--baseline`, every changed unit whose badge moved („geändert",
 * „redaktionell", „ohne Wortdiff") is printed with its pieces, in both
 * directions — the line-by-line reading a rate cannot replace.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import type { LawStationId } from '../../shared/types'
import { isLawStationPair } from '../../shared/utils/lawStations'
import { bundlesOtherDrafts, extractBgblLink, findComparisonRvLink, findRvLinks, parseStages } from '../../server/utils/parliament/detailJson'
import { mapDraftRow } from '../../server/utils/parliament/list81'
import { dedupeMeRows, joinRisToMe, toMeListRows } from '../../server/utils/ris/risJoin'
import { parseLawUnits, parseLawUnitsFromRis, type LawUnit } from '../../server/utils/lawtext/lawUnits'
import { diffLawPackage, isCommencementArticle, scopeToDraft } from '../../server/utils/diff/lawDiff'
import { compareWords } from '../../server/utils/diff/wordDiff'
import { findLawStations } from '../../server/utils/diff/stationDocuments'
import { completeness, headingBreaches, reconstructionBreaches, residuesOf, symmetryBreaches, type Breach, type Residue } from '../lib/stationChecks'
import { fetchRisBegutCorpus } from '../lib/corpus'
import { installFetchCache } from '../lib/harnessCache'
import { argAssigned, argFlag } from '../lib/args'
import { corpusReach, harnessStamp, type CorpusReach, type HarnessStamp } from '../lib/harnessRecord'
import { PARLIAMENT, RIS_API, getJson as fetchJson, getText as fetchText, type HttpOptions } from '../lib/http'

if (argFlag('cache')) installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

const SCRIPT = 'harness/station'
const gp = argAssigned('gp') ?? 'XXVIII'
const only = Number(argAssigned('only')) || 0
const jsonPath = argAssigned('json')
const baselinePath = argAssigned('baseline')
/** `--zeige=<text>`: the pieces of every changed unit whose line contains the text, to read one case. */
const show = argAssigned('zeige')
const PATIENT: HttpOptions = { script: SCRIPT, attempts: 3, backoffMs: (retry) => 1_200 * retry, timeoutMs: 60_000, retryOnHttpError: true }
const getJson = <T = unknown>(url: string): Promise<T> => fetchJson<T>(url, { ...PATIENT, onExhausted: (u) => new Error(`nicht erreichbar: ${u}`) })
const getText = (url: string): Promise<string> => fetchText(url, { script: SCRIPT, timeoutMs: 60_000 })

/** List 81 of the period: one row per Ministerialentwurf. */
async function list81(): Promise<unknown[][]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = await fetchJson<any>(`${PARLIAMENT}/Filter/api/filter/data/81?js=eval&showAll=true&export=true`, {
    script: SCRIPT,
    method: 'POST',
    body: { GP_CODE: [gp] },
    timeoutMs: 60_000,
  })
  return body?.rows ?? []
}

/** A Kundmachung's XML main document, by its Fundstelle — the request `corpus/bgblStation.ts` makes. */
async function bgblXmlUrl(nummer: string): Promise<string | null> {
  const p = new URLSearchParams({ Applikation: 'BgblAuth', DokumenteProSeite: 'Ten', Seitennummer: '1', Bgblnummer: nummer.replace(/^Bundesgesetzblatt\b/, 'BGBl.') })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = await getJson(`${RIS_API}?${p}`)
  let ref = r?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference
  if (!ref) return null
  ref = Array.isArray(ref) ? ref[0] : ref
  let crs = ref?.Data?.Dokumentliste?.ContentReference
  crs = Array.isArray(crs) ? crs : [crs]
  for (const cr of crs) {
    if (cr?.ContentType !== 'MainDocument') continue
    let urls = cr?.Urls?.ContentUrl ?? []
    urls = Array.isArray(urls) ? urls : [urls]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xml = urls.find((u: any) => u?.DataType === 'Xml')?.Url
    if (xml) return String(xml)
  }
  return null
}

interface Draft {
  inr: number
  stations: Map<LawStationId, LawUnit[]>
  /** The draft read from RIS XML, beside its HTML reading — for null comparison 2. */
  meFromRis: LawUnit[] | null
  bundled: boolean | null
  rvCount: number
}

/** One draft's station texts, as `lawDiffService` resolves and reads them. */
async function loadDraft(inr: number, risXmlOf: (inr: number) => Promise<string | null>): Promise<Draft | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any = (await getJson<any>(`${PARLIAMENT}/gegenstand/${gp}/ME/${inr}?json=True`))?.content ?? {}
  const found = findLawStations(content, 'ME')
  if (!found.has('rv')) return null
  const stations = new Map<LawStationId, LawUnit[]>()
  for (const id of ['me', 'rv', 'ausschuss', 'plenum'] as const) {
    const html = found.get(id)?.html
    if (html) stations.set(id, parseLawUnits(await getText(html)))
  }
  const xml = await risXmlOf(inr)
  const meFromRis = xml ? parseLawUnitsFromRis(await getText(xml)) : null
  // The page reads the RIS text where Parliament has the draft as PDF only.
  if (!stations.has('me') && found.has('me') && meFromRis) stations.set('me', meFromRis)
  const draft: Draft = { inr, stations, meFromRis: stations.get('me') === meFromRis ? null : meFromRis, bundled: null, rvCount: 0 }
  const stages = parseStages(content.stages)
  try {
    draft.rvCount = new Set(findRvLinks(stages).map((l) => `${l.gp}/${l.inr}`)).size
  } catch {
    // As the service: an unreadable stage record claims nothing.
  }
  const rvText = found.get('rv')
  const rvLink = findComparisonRvLink(stages, rvText?.html ?? rvText?.fallbackUrl)
  if (rvLink) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rv: any = (await getJson<any>(`${PARLIAMENT}/gegenstand/${rvLink.gp}/I/${rvLink.inr}?json=True`))?.content ?? {}
    draft.bundled = bundlesOtherDrafts(rv.preconst, gp, inr)
    const nummer = extractBgblLink(rv.status?.bgbllinks)?.number ?? null
    const url = nummer ? await bgblXmlUrl(nummer) : null
    if (url) stations.set('bgbl', parseLawUnitsFromRis(await getText(url)))
  }
  return draft
}

const ORDER: readonly LawStationId[] = ['me', 'rv', 'ausschuss', 'plenum', 'bgbl']

/** The two texts of a pair as the service hands them to `diffLawPackage`, with its options. */
function pairInput(d: Draft, from: LawStationId, to: LawStationId) {
  let f = d.stations.get(from)!
  let t = d.stations.get(to)!
  const draft = d.stations.get('me')
  if (from !== 'me' && d.bundled === true && draft?.length) {
    const scoped = scopeToDraft(draft, f, t)
    f = scoped.from
    t = scoped.to
  }
  const keepAddedLaws = from === 'me' && to === 'rv' && d.bundled === false
  return { f, t, options: { keepAddedLaws, keepDroppedLaws: keepAddedLaws && d.rvCount === 1, beyondCeiling: true } }
}

interface Record_ extends Partial<HarnessStamp>, Partial<CorpusReach> {
  gp: string
  drafts: number
  pairs: number
  breaches: (Breach & { pair: string })[]
  symmetry: (Breach & { pair: string })[]
  commencementLeftOut: number
  ceiling: { pair: string; unit: string; fromWords: number; toWords: number }[]
  residues: { kind: 'parlament-bgbl' | 'html-xml'; pair: string; residue: Residue }[]
  /**
   * How many units each null comparison held against each other (19.11.2026,
   * for `/genauigkeit`): the denominator of its residues. Absent in a record
   * written before.
   */
  nullUnits?: Record<'parlament-bgbl' | 'html-xml', number>
  /** Every changed unit of every pair and its badge, so two runs compare verdict by verdict. */
  verdicts: Record<string, 'geändert' | 'redaktionell' | 'ohne Wortdiff'>
  /** In a committed baseline (`stationBaseline.json`): why each residue that is not editorial stands. */
  reasons?: Record<string, string>
}

const rows = await list81()
const numbers = [...new Set(rows.map((r) => Number(r[2])))].sort((a, b) => a - b)
// The draft's RIS record, joined as `getRisMapForGp` joins it — loaded only
// when the first draft asks, because it is the whole Begut corpus.
let risMap: Map<number, string | null> | null = null
const risXmlOf = async (inr: number): Promise<string | null> => {
  if (!risMap) {
    const corpus = await fetchRisBegutCorpus(SCRIPT, 'Ascending')
    const byId = new Map(corpus.records.map((r) => [r.id, r]))
    risMap = new Map()
    for (const row of joinRisToMe(dedupeMeRows(toMeListRows(rows.map(mapDraftRow))), corpus.records)) {
      risMap.set(row.inr, (row.risId ? byId.get(row.risId)?.mainDocument?.xml : null) ?? null)
    }
  }
  return risMap.get(inr) ?? null
}

/** How long each pair's comparison took — the cost of the word diff past its ceiling shows here. */
const slow: { pair: string; ms: number }[] = []
/** The pieces of every changed unit, kept in memory for the lines that moved against a baseline. */
const piecesOf = new Map<string, string[]>()
/** The drafts of list 81 that could not be loaded, with why. */
const unreached: { id: string; cause: string }[] = []
const record: Record_ = { gp, drafts: 0, pairs: 0, breaches: [], symmetry: [], commencementLeftOut: 0, ceiling: [], residues: [], nullUnits: { 'parlament-bgbl': 0, 'html-xml': 0 }, verdicts: {} }
const requested = numbers.filter((inr) => !only || inr === only)
for (const inr of requested) {
  let d: Draft | null
  try {
    d = await loadDraft(inr, risXmlOf)
  } catch (err) {
    console.log(`  ${inr}/ME: nicht geladen — ${String(err).slice(0, 160)}`)
    unreached.push({ id: `${inr}/ME`, cause: String(err).slice(0, 200) })
    continue
  }
  if (!d) continue
  record.drafts++
  process.stderr.write(`\r${record.drafts} Entwürfe · ${inr}/ME   `)
  for (const from of ORDER) {
    for (const to of ORDER) {
      if (!isLawStationPair(from, to) || !d.stations.get(from)?.length || !d.stations.get(to)?.length) continue
      const pair = `${inr}/ME ${from}>${to}`
      const { f, t, options } = pairInput(d, from, to)
      const started = performance.now()
      const diff = diffLawPackage(f, t, options)
      slow.push({ pair, ms: performance.now() - started })
      if (diff.unpaired) continue
      record.pairs++
      const whole = completeness(f, t, diff, isCommencementArticle)
      record.commencementLeftOut += whole.commencementLeftOut.reduce((n, c) => n + c.units, 0)
      for (const b of [...reconstructionBreaches(diff.units), ...whole.breaches, ...headingBreaches(t, diff)]) record.breaches.push({ ...b, pair })
      const back = diffLawPackage(t, f, { keepAddedLaws: options.keepDroppedLaws, keepDroppedLaws: options.keepAddedLaws, beyondCeiling: true })
      for (const b of symmetryBreaches(diff, back)) record.symmetry.push({ ...b, pair })
      for (const u of diff.units) {
        if (u.change === 'changed') {
          const key = `${pair} ${(u.article ?? '—').slice(0, 50)} · ${u.fromId}→${u.id}`
          record.verdicts[key] = !u.segments ? 'ohne Wortdiff' : u.editorial ? 'redaktionell' : 'geändert'
          piecesOf.set(key, residuesOf([u])[0]!.pieces)
          if (show && key.includes(show)) console.log(`\n   ${record.verdicts[key]}: ${key}\n${piecesOf.get(key)!.map((p) => `        ${p}`).join('\n')}`)
        }
        if (u.change === 'changed' && !u.segments) {
          record.ceiling.push({ pair, unit: `${(u.article ?? '—').slice(0, 50)} · ${u.fromId}→${u.id}`, fromWords: compareWords(u.fromText ?? '').length, toWords: compareWords(u.toText ?? '').length })
        }
      }
    }
  }
  // Null comparison 1: the last parliamentary text against the Kundmachung.
  const last = (['plenum', 'ausschuss', 'rv'] as const).find((id) => d!.stations.get(id)?.length)
  if (last && d.stations.get('bgbl')?.length) {
    const { f, t, options } = pairInput(d, last, 'bgbl')
    const diff = diffLawPackage(f, t, options)
    if (!diff.unpaired) {
      record.nullUnits!['parlament-bgbl'] += diff.units.length
      for (const residue of residuesOf(diff.units)) record.residues.push({ kind: 'parlament-bgbl', pair: `${inr}/ME ${last}>bgbl`, residue })
    }
  }
  // Null comparison 2: one draft, two readers.
  const html = d.stations.get('me')
  if (html?.length && d.meFromRis?.length) {
    const diff = diffLawPackage(html, d.meFromRis, { beyondCeiling: true })
    if (diff.unpaired) record.residues.push({ kind: 'html-xml', pair: `${inr}/ME html>xml`, residue: { unit: '(ganzer Text)', change: 'changed', editorial: false, pieces: ['kein Artikel gepaart'], ceiling: false } })
    else {
      record.nullUnits!['html-xml'] += diff.units.length
      for (const residue of residuesOf(diff.units)) record.residues.push({ kind: 'html-xml', pair: `${inr}/ME html>xml`, residue })
    }
  }
}
process.stderr.write('\n')

// --- Report -----------------------------------------------------------------
const residueLine = (r: Record_['residues'][number]): string =>
  `${r.pair} ${r.residue.change}${r.residue.editorial ? ' (redaktionell)' : ''}${r.residue.ceiling ? ' (Deckel)' : ''} ${r.residue.unit}`

console.log(`\nGP ${gp}: ${record.drafts} Entwürfe mit Regierungsvorlage, ${record.pairs} Stationspaare verglichen`)
console.log(`\n── 1. Invarianten (müssen 0 sein): ${record.breaches.length}`)
for (const b of record.breaches.slice(0, 60)) console.log(`   ✗ ${b.kind} ${b.pair} ${b.unit} — ${b.detail}`)
console.log(`   Inkrafttretens-Artikel nur einer Seite, absichtlich nicht gezeigt (lawsOf): ${record.commencementLeftOut} Einheiten`)
console.log(`\n── 2. Symmetrie: ${record.symmetry.length} Paare nur in einer Richtung`)
for (const b of record.symmetry.slice(0, 60)) console.log(`   · ${b.pair} ${b.unit} — ${b.detail}`)
for (const kind of ['parlament-bgbl', 'html-xml'] as const) {
  const list = record.residues.filter((r) => r.kind === kind)
  const substantive = list.filter((r) => !r.residue.editorial)
  console.log(`\n── 3. Nullvergleich ${kind === 'parlament-bgbl' ? 'letzte parlamentarische Fassung → Kundmachung' : 'Entwurf aus Parlaments-HTML → derselbe aus RIS-XML'}: ${list.length} Reste in ${record.nullUnits![kind]} Einheiten, davon ${substantive.length} nicht redaktionell`)
  for (const r of list) {
    if (r.residue.editorial && kind === 'parlament-bgbl') continue
    console.log(`   ${residueLine(r)}`)
    for (const p of r.residue.pieces.slice(0, 6)) console.log(`        ${p}`)
  }
}
console.log(`\n── 4. Wortdiff am Deckel (keine Markierung möglich): ${record.ceiling.length}`)
for (const c of record.ceiling) console.log(`   ${c.pair} ${c.unit} (${c.fromWords}/${c.toWords} Wörter)`)
const slowest = slow.sort((x, y) => y.ms - x.ms).slice(0, 5)
console.log(`\n── Dauer: die langsamsten Paare (diffLawPackage) — ${slowest.map((x) => `${x.pair} ${Math.round(x.ms)} ms`).join(' · ')}`)

if (jsonPath) {
  // The drafts of the list asked for and loaded: a draft that reached no
  // Regierungsvorlage is loaded and not compared, one that threw is not loaded.
  writeFileSync(jsonPath, `${JSON.stringify({ ...harnessStamp(), ...corpusReach(requested.length, unreached), ...record }, null, 1)}\n`)
  console.log(`\nBericht geschrieben: ${jsonPath}`)
}

let failed = record.breaches.length > 0
if (baselinePath) {
  const before = JSON.parse(readFileSync(baselinePath, 'utf8')) as Record_
  // The badges first: a verdict that moved, in either direction, is a line to read.
  const moved = Object.entries(record.verdicts).filter(([key, v]) => before.verdicts?.[key] !== undefined && before.verdicts[key] !== v)
  const tally = new Map<string, number>()
  for (const [key, v] of moved) tally.set(`${before.verdicts[key]} → ${v}`, (tally.get(`${before.verdicts[key]} → ${v}`) ?? 0) + 1)
  console.log(`\n── Badges gegen die Baseline: ${moved.length} bewegt${[...tally].map(([k, n]) => ` · ${k} ${n}`).join('')}`)
  for (const [key, v] of moved) {
    console.log(`   ${before.verdicts[key]} → ${v}: ${key}`)
    for (const p of piecesOf.get(key)?.slice(0, 6) ?? []) console.log(`        ${p}`)
  }
  const lines = (r: Record_) => new Set(r.residues.map((x) => `${x.kind} ${residueLine(x)}`))
  const was = lines(before)
  const now = lines(record)
  const came = [...now].filter((l) => !was.has(l))
  const went = [...was].filter((l) => !now.has(l))
  console.log(`\n── Gegen die Baseline ${baselinePath}: ${came.length} neu, ${went.length} weg`)
  for (const l of came) console.log(`   + ${l}`)
  // A reason is keyed by the residue's whole line, its kind first, as `came` and `went` are.
  for (const l of went) console.log(`   − ${l}${before.reasons?.[l] ? ` (war: ${before.reasons[l]})` : ''}`)
  if (came.length || went.length) failed = true
}
process.exit(failed ? 1 : 0)
