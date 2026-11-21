#!/usr/bin/env vite-node
/**
 * The § comparison held to what it promises, over a whole period — the
 * instrument the station path lacked until 19.11.2026 (`lib/stationChecks.ts`
 * says what each check means).
 *
 * Usage:  npx vite-node -c vitest.config.ts scripts/harness/station.ts [--gp=XXVIII] [--only=80[,81,…]] [--cache]
 *                                                                     [--json=<file>] [--baseline=<file>] [--zeige=<text>] [--mutationen]
 *
 * Every station text of every draft of the period that reached a
 * Regierungsvorlage, read through the page's own parsers, and every pair the
 * station chooser offers made ready and compared by the service's own
 * `compareStationPair` (`server/utils/diff/stationPair.ts`, 21.11.2026: the
 * cut to the draft's laws, the laws kept, the pairs refused). A pair the page
 * refuses — a text only as PDF, one that parses into no §, Artikel that pair
 * with none of the other text — is counted and listed (`refused`), never
 * skipped unsaid:
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
 * The list of drafts (list 81) and the RIS Begut list the draft's XML is
 * joined from are fetched afresh on every run and still written, as the
 * annex harnesses' list is (`installFetchCache`'s `fresh`, 21.11.2026):
 * served from disk for ever, they froze every run at the list of the day
 * the cache first held it. `--liste-aus-cache` replays the cached lists on
 * purpose — an offline run, and a comparison with `--baseline`, which needs
 * the frozen corpus. The record says which (`window`): the oldest and the
 * newest draft of the list, and when the list was fetched. A draft's own
 * record is still read from the cache when it holds one.
 *
 * With `--baseline`, every changed unit whose badge moved („geändert",
 * „redaktionell", „ohne Wortdiff") is printed with its pieces, in both
 * directions — the line-by-line reading a rate cannot replace —, and every
 * unit that is newly or no longer changed (`badgeMoves`). Printed, not
 * failed; a baseline that carries no badges fails, because against it no
 * move could show (`stationBaseline.json` had none until 20.11.2026).
 *
 * `--ohne-begutachtung` (21.11.2026): the pages of the laws that never had a
 * draft — a Regierungsvorlage without a Ministerialentwurf, an Antrag —
 * instead of the drafts: the same pairs, invariants and null comparison 1,
 * read as `lawDiffService` reads a root that is no draft (`findLawStations`
 * with the item's own type, its own Kundmachung, nothing bundled). The
 * population is the list `scripts/corpus/begutachtungSkipped.ts` writes
 * (`.cache/begutachtung-skipped/<GP>-skipped.json`: every enacted law of the
 * period whose root had no Begutachtung, budget laws included), and the
 * record says when that list was measured (`population`). Null comparison 2
 * has no draft to read.
 *
 * `--zensus` (21.11.2026): what the readers leave out of each document they
 * read — the body's words no block carries (`lib/readerCensus.ts`). Listed
 * per document above a few words, the largest with their lost runs; a
 * census, read by hand, not failed.
 *
 * `--mutationen` (20.11.2026): fault injection for what the comparison
 * forgives. Every distinct unit of every later text (Vorlage, Ausschuss,
 * Plenum, Kundmachung) is compared through `diffLawUnits` against itself with
 * one change of substance in it (`lib/stationMutations.ts`), per class; the
 * table counts per class how often it applied, how often the unit came out a
 * change of substance with a marked run, „redaktionell", „unverändert",
 * „geändert" with nothing marked, and unpaired. A fault forgiven or hidden is
 * a miss and fails the run; the record carries the table as `mutations`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import type { LawStationId } from '../../shared/types'
import { LAW_STATION_ORDER, isLawStationPair } from '../../shared/utils/lawStations'
import { EBR_DOKTYP, bundlesOtherDrafts, extractBgblLink, findBundesratObjection, findComparisonRvLink, findRvLinks, lawOfEbr, parseStages } from '../../server/utils/parliament/detailJson'
import { mapDraftRow } from '../../server/utils/parliament/list81'
import { dedupeMeRows, joinRisToMe, toMeListRows } from '../../server/utils/ris/risJoin'
import { segmentUnits, type LawUnit } from '../../server/utils/lawtext/lawUnits'
import { parseParliamentHtml } from '../../server/utils/lawtext/parliamentHtml'
import { parseRisXml } from '../../server/utils/lawtext/risXml'
import { htmlBodyText, readerLoss, risBodyText, type ReaderLoss } from '../lib/readerCensus'
import { diffLawPackage, diffLawUnits, isCommencementArticle } from '../../server/utils/diff/lawDiff'
import { compareStationPair, cutsToDraft, type StationPairRefusal } from '../../server/utils/diff/stationPair'
import { compareWords } from '../../server/utils/diff/wordDiff'
import { findLawStations } from '../../server/utils/diff/stationDocuments'
import { badgeMoves, completeness, headingBreaches, reconstructionBreaches, residuesOf, symmetryBreaches, type Breach, type Residue } from '../lib/stationChecks'
import { MUTATION_KINDS, MUTATION_LABELS, isMiss, mutations, mutationOutcome, type MutationKind, type MutationOutcome } from '../lib/stationMutations'
import { fetchRisBegutCorpus } from '../lib/corpus'
import { installFetchCache, isBegutSearch } from '../lib/harnessCache'
import { argAssigned, argFlag } from '../lib/args'
import { corpusReach, harnessStamp, type CorpusReach, type HarnessStamp } from '../lib/harnessRecord'
import { PARLIAMENT, RIS_API, getBytes, getJson as fetchJson, getText as fetchText, type HttpOptions } from '../lib/http'
import { decodeHtml } from '../../server/utils/upstream/decodeHtml'

/** List 81, the period's Ministerialentwürfe — one POST address for every period, told apart by its body. */
const isList81 = (url: string): boolean => url.startsWith(`${PARLIAMENT}/Filter/api/filter/data/81?`)
/** `--liste-aus-cache`: the lists replayed from the cache, on purpose (see above). */
const replayLists = argFlag('liste-aus-cache')
const cache = argFlag('cache') ? installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache', { fresh: (url) => isList81(url) || isBegutSearch(url), replay: replayLists }) : null

const SCRIPT = 'harness/station'
const gp = argAssigned('gp') ?? 'XXVIII'
/** `--only=80` or `--only=1,3,4`: these numbers of the list only. */
const only = new Set((argAssigned('only') ?? '').split(',').map(Number).filter((n) => n > 0))
const jsonPath = argAssigned('json')
const baselinePath = argAssigned('baseline')
/** `--zeige=<text>`: the pieces of every changed unit whose line contains the text, to read one case. */
const show = argAssigned('zeige')
/** `--mutationen`: the fault injection over every later text's units (see above). */
const mutate = argFlag('mutationen')
/** `--ohne-begutachtung`: the laws without a draft instead of the drafts (see above). */
const withoutDraft = argFlag('ohne-begutachtung')
const SKIPPED_LIST = `.cache/begutachtung-skipped/${gp}-skipped.json`
/** `--zensus`: what the readers leave out of each document (see above). */
const zensus = argFlag('zensus')
/** A census line is worth reading above this many lost words. */
const CENSUS_FEW_WORDS = 5
const PATIENT: HttpOptions = { script: SCRIPT, attempts: 3, backoffMs: (retry) => 1_200 * retry, timeoutMs: 60_000, retryOnHttpError: true }
const getJson = <T = unknown>(url: string): Promise<T> => fetchJson<T>(url, { ...PATIENT, onExhausted: (u) => new Error(`nicht erreichbar: ${u}`) })
const getText = (url: string): Promise<string> => fetchText(url, { script: SCRIPT, timeoutMs: 60_000 })
/**
 * A Parliament HTML document decoded as `fetchDocument` decodes it
 * (`decodeHtml`, 21.11.2026): Parliament serves Word HTML as windows-1252 or
 * UTF-8. Read as UTF-8 throughout, 306 d.B. XXVIII (windows-1252) came out
 * with every umlaut and „§" a replacement character, and 101 of its §§ stood
 * as residues against the Kundmachung. The cache keeps no header, so the
 * document's own meta tag decides, as it does in the server without one.
 */
async function getHtml(url: string): Promise<string> {
  const bytes = await getBytes(url, { script: SCRIPT, timeoutMs: 60_000 })
  return decodeHtml(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, undefined)
}

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

/** With `--zensus`: per document read, what its reader left out. */
const readerLosses: ({ doc: string; url: string } & ReaderLoss)[] = []

/**
 * One station's text as units, read as the page reads it: Parliament's HTML
 * through `parseParliamentHtml`, RIS's XML through `parseRisXml` — and with
 * `--zensus`, the document's body held against the blocks.
 */
async function readUnits(doc: string, url: string, kind: 'html' | 'xml'): Promise<LawUnit[]> {
  const raw = kind === 'html' ? await getHtml(url) : await getText(url)
  const blocks = kind === 'html' ? parseParliamentHtml(raw) : parseRisXml(raw)
  if (zensus && !readerLosses.some((r) => r.url === url)) readerLosses.push({ doc, url, ...readerLoss(kind === 'html' ? htmlBodyText(raw) : risBodyText(raw), blocks) })
  return segmentUnits(blocks)
}

/**
 * The period's EBR items with the law each objects to, as
 * `getEbrIndexForGp` reads them (list 101, document type EBR) — loaded only
 * when a Vorlage's Verlauf names an Einspruch without linking its EBR.
 */
let ebrIndex: Promise<{ ebr: { gp: string; inr: number }; law: { gp: string; ityp: string; inr: number } | null }[]> | null = null
function ebrsOfPeriod() {
  ebrIndex ??= (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await fetchJson<any>(`${PARLIAMENT}/Filter/api/filter/data/101?js=eval&showAll=true`, { script: SCRIPT, method: 'POST', body: { GP_CODE: [gp], ITYP: ['I'], DOKTYP: [EBR_DOKTYP] }, timeoutMs: 60_000 })
    const rows: unknown[][] = (body?.rows ?? []).filter((r: unknown[]) => Array.isArray(r) && r[11] === EBR_DOKTYP)
    const out = []
    for (const row of rows) {
      const inr = Number(row[2])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content: any = (await getJson<any>(`${PARLIAMENT}/gegenstand/${gp}/I/${inr}?json=True`))?.content ?? {}
      out.push({ ebr: { gp, inr }, law: lawOfEbr(content.reference) })
    }
    return out
  })()
  return ebrIndex
}

/**
 * The Kundmachung's Fundstelle where the Vorlage links none and the Bundesrat
 * objected: Parliament links it on the Einspruch's own item
 * (`bgblViaObjection`). The Verlauf's stage names the EBR, else the period's
 * list does. One difference stays: the service asks the list for every
 * Vorlage without a Fundstelle, also where its Verlauf names no Einspruch at
 * all (a stage the reader missed); here only where the stage stands without
 * its EBR, so that a run over the cache does not ask for the list of every
 * period. List 101 held no EBR for GP XXVIII on 14.11.2026.
 */
async function bgblViaObjectionOf(rv: { phase?: unknown }, item: { gp: string; ityp: 'I' | 'A'; inr: number }): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anchor = findBundesratObjection(rv.phase as any)
  if (!anchor) return null
  const ebr = anchor.ebr ?? (await ebrsOfPeriod()).find((e) => e.law?.gp === item.gp && e.law.ityp === item.ityp && e.law.inr === item.inr)?.ebr
  if (!ebr) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any = (await getJson<any>(`${PARLIAMENT}/gegenstand/${ebr.gp}/I/${ebr.inr}?json=True`))?.content ?? {}
  return extractBgblLink(content.status?.bgbllinks)?.number ?? null
}

interface Draft {
  /** „125/ME", or for a law without a draft its own item: „290/I", „34/A". */
  label: string
  /** The texts the comparison reads, by station: Parliament's HTML, RIS's XML for the draft and the Kundmachung. */
  stations: Map<LawStationId, LawUnit[]>
  /** Every station the record names, readable or not — a station only as PDF is offered and refused. */
  present: Set<LawStationId>
  /** The Kundmachung was found through the Bundesrat's Einspruch. */
  viaObjection: boolean
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
    if (html) stations.set(id, await readUnits(`${inr}/ME ${id}`, html, 'html'))
  }
  const xml = await risXmlOf(inr)
  const meFromRis = xml ? await readUnits(`${inr}/ME me (RIS)`, xml, 'xml') : null
  // The page reads the RIS text where Parliament has the draft as PDF only.
  if (!stations.has('me') && found.has('me') && meFromRis) stations.set('me', meFromRis)
  const draft: Draft = { label: `${inr}/ME`, stations, present: new Set(found.keys()), viaObjection: false, meFromRis: stations.get('me') === meFromRis ? null : meFromRis, bundled: null, rvCount: 0 }
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
    let nummer = extractBgblLink(rv.status?.bgbllinks)?.number ?? null
    if (!nummer) {
      nummer = await bgblViaObjectionOf(rv, { gp: rvLink.gp, ityp: 'I', inr: rvLink.inr })
      draft.viaObjection = nummer !== null
    }
    await addKundmachung(draft, nummer)
  }
  return draft
}

/** The Kundmachung's text as a station, where RIS has it as XML. */
async function addKundmachung(draft: Draft, nummer: string | null): Promise<void> {
  const url = nummer ? await bgblXmlUrl(nummer) : null
  if (url) {
    draft.stations.set('bgbl', await readUnits(`${draft.label} bgbl`, url, 'xml'))
    draft.present.add('bgbl')
  }
}

/**
 * One law without a draft, as `lawDiffService` reads a root that is a
 * Vorlage or an Antrag: its own record names the stations (the first text
 * under its own title, `findLawStations`), its own `status.bgbllinks` the
 * Kundmachung, and nothing is bundled. Null where the record names no first
 * text to compare.
 */
async function loadItem(ityp: 'I' | 'A', inr: number): Promise<Draft | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any = (await getJson<any>(`${PARLIAMENT}/gegenstand/${gp}/${ityp}/${inr}?json=True`))?.content ?? {}
  const found = findLawStations(content, ityp)
  if (!found.has(ityp === 'I' ? 'rv' : 'antrag')) return null
  const stations = new Map<LawStationId, LawUnit[]>()
  for (const id of ['antrag', 'rv', 'ausschuss', 'plenum'] as const) {
    const html = found.get(id)?.html
    if (html) stations.set(id, await readUnits(`${inr}/${ityp} ${id}`, html, 'html'))
  }
  const draft: Draft = { label: `${inr}/${ityp}`, stations, present: new Set(found.keys()), viaObjection: false, meFromRis: null, bundled: false, rvCount: 0 }
  let nummer = extractBgblLink(content.status?.bgbllinks)?.number ?? null
  if (!nummer) {
    nummer = await bgblViaObjectionOf(content, { gp, ityp, inr })
    draft.viaObjection = nummer !== null
  }
  await addKundmachung(draft, nummer)
  return draft
}

/** Every station in the chooser's order; a draft carries no `antrag`, an item no `me`. */
const ORDER: readonly LawStationId[] = LAW_STATION_ORDER

/** One pair as the service compares it (`compareStationPair`), or why the page refuses it. */
function comparePair(d: Draft, from: LawStationId, to: LawStationId) {
  const facts = { from, to, bundled: d.bundled, rvCount: d.rvCount }
  return compareStationPair(d.stations.get(from)!, d.stations.get(to)!, facts, cutsToDraft(facts) ? (d.stations.get('me') ?? null) : null)
}

/** Why a pair the station chooser offers shows no § list: the service's refusals, and a text only as PDF. */
type RefusalCause = 'nur PDF' | StationPairRefusal['refused']

interface Record_ extends Partial<HarnessStamp>, Partial<CorpusReach> {
  gp: string
  drafts: number
  pairs: number
  breaches: (Breach & { pair: string })[]
  symmetry: (Breach & { pair: string })[]
  /** Units of a commencement Artikel only one side carries, left out under the sentence that only both texts are compared (`completeness`); one without it is a breach. */
  commencementLeftOut: number
  /**
   * Every pair the chooser offers and the page answers with a sentence
   * instead of a § list (21.11.2026), with why: not in `pairs`. Absent in a
   * record written before.
   */
  refused?: { pair: string; cause: RefusalCause }[]
  /**
   * Drafts of the list loaded and not compared, because they reached no
   * Vorlage with a Gesetzestext; with `--ohne-begutachtung`, laws whose record
   * names no first text. Absent before 21.11.2026.
   */
  withoutRv?: number
  /**
   * Which drafts the run walked (21.11.2026): the oldest and the newest of
   * list 81 by number, with the day each came in, when the list was fetched
   * (ISO; null where the run did not go through the cache) and whether it
   * was replayed from the cache (`--liste-aus-cache`). Absent with
   * `--ohne-begutachtung`, whose list is `population`.
   */
  window?: {
    oldest: { inr: number; arrivedAt: string } | null
    newest: { inr: number; arrivedAt: string } | null
    listFetchedAt: string | null
    fromCache: boolean
  }
  /** With `--ohne-begutachtung`: the list the laws come from, and when it was measured. */
  population?: { source: string; measuredAt: string | null }
  /** Drafts whose Kundmachung was found through the Bundesrat's Einspruch (`bgblViaObjection`). Absent before 21.11.2026. */
  viaObjection?: number
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
  /**
   * With `--zensus`: how many documents were read, and every one whose reader
   * left more than `CENSUS_FEW_WORDS` of its body's words in no block, with
   * the lost runs.
   */
  readerCensus?: { documents: number; overFewWords: ({ doc: string; url: string } & ReaderLoss)[] }
  /** With `--mutationen`: per class, how the comparison answered a fault, and the misses to read. */
  mutations?: {
    units: number
    classes: Record<MutationKind, { tried: number } & Record<MutationOutcome, number>>
    misses: { kind: MutationKind; outcome: MutationOutcome; unit: string; before: string; after: string }[]
  }
}

/** What the run walks: the drafts of list 81, or the laws without a draft. */
interface Target {
  id: string
  inr: number
  load: () => Promise<Draft | null>
}
const rows = withoutDraft ? [] : await list81()
let population: Record_['population']
let targets: Target[]
if (withoutDraft) {
  let list: { measuredAt?: string; rows?: { ityp: string; inr: string | number; enacted?: boolean; consulted?: boolean }[] }
  try {
    list = JSON.parse(readFileSync(SKIPPED_LIST, 'utf8'))
  } catch {
    console.error(`${SKIPPED_LIST} fehlt: zuerst npx vite-node scripts/corpus/begutachtungSkipped.ts ${gp}`)
    process.exit(2)
  }
  population = { source: SKIPPED_LIST, measuredAt: list.measuredAt ?? null }
  targets = (list.rows ?? [])
    .filter((r) => r.enacted && !r.consulted && (r.ityp === 'I' || r.ityp === 'A'))
    .map((r) => ({ ityp: r.ityp as 'I' | 'A', inr: Number(r.inr) }))
    .sort((a, b) => a.ityp.localeCompare(b.ityp) || a.inr - b.inr)
    .map(({ ityp, inr }) => ({ id: `${inr}/${ityp}`, inr, load: () => loadItem(ityp, inr) }))
} else {
  targets = [...new Set(rows.map((r) => Number(r[2])))].sort((a, b) => a - b).map((inr) => ({ id: `${inr}/ME`, inr, load: () => loadDraft(inr, risXmlOf) }))
}
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
/** The list's span and where it came from: the drafts of list 81 by number, and the list request as the cache served it. */
function windowOfList(): Record_['window'] {
  const drafts = rows.map(mapDraftRow).filter((d) => d.inr > 0).sort((a, b) => a.inr - b.inr)
  const at = (d: (typeof drafts)[number] | undefined) => (d ? { inr: d.inr, arrivedAt: d.arrivedAt } : null)
  const served = (cache?.served ?? []).filter((r) => isList81(r.url))
  const fetched = served.map((r) => r.fetchedAt.getTime()).sort((a, b) => a - b)
  return { oldest: at(drafts[0]), newest: at(drafts.at(-1)), listFetchedAt: fetched.length ? new Date(fetched[0]!).toISOString() : null, fromCache: served.some((r) => r.fromCache) }
}
const listWindow = withoutDraft ? undefined : windowOfList()
const record: Record_ = { gp, ...(population ? { population } : {}), ...(listWindow ? { window: listWindow } : {}), drafts: 0, pairs: 0, breaches: [], symmetry: [], commencementLeftOut: 0, refused: [], withoutRv: 0, viaObjection: 0, ceiling: [], residues: [], nullUnits: { 'parlament-bgbl': 0, 'html-xml': 0 }, verdicts: {} }
/** With `--mutationen`: every distinct unit of a later text, by its text, with where it stands. */
const laterUnits = new Map<string, { unit: LawUnit; where: string }>()
const requested = targets.filter((x) => !only.size || only.has(x.inr))
for (const target of requested) {
  let d: Draft | null
  try {
    d = await target.load()
  } catch (err) {
    console.log(`  ${target.id}: nicht geladen — ${String(err).slice(0, 160)}`)
    unreached.push({ id: target.id, cause: String(err).slice(0, 200) })
    continue
  }
  if (!d) {
    record.withoutRv!++
    continue
  }
  record.drafts++
  if (d.viaObjection) record.viaObjection!++
  if (mutate) {
    for (const id of ['rv', 'ausschuss', 'plenum', 'bgbl'] as const) {
      for (const unit of d.stations.get(id) ?? []) if (!laterUnits.has(unit.text)) laterUnits.set(unit.text, { unit, where: `${d.label} ${id} ${(unit.article ?? '—').slice(0, 50)} · ${unit.id}` })
    }
  }
  process.stderr.write(`\r${record.drafts} ${withoutDraft ? 'Gesetze' : 'Entwürfe'} · ${d.label}   `)
  for (const from of ORDER) {
    for (const to of ORDER) {
      if (!isLawStationPair(from, to) || !d.present.has(from) || !d.present.has(to)) continue
      const pair = `${d.label} ${from}>${to}`
      if (!d.stations.has(from) || !d.stations.has(to)) {
        record.refused!.push({ pair, cause: 'nur PDF' })
        continue
      }
      const started = performance.now()
      const compared = comparePair(d, from, to)
      slow.push({ pair, ms: performance.now() - started })
      if (compared.refused) {
        record.refused!.push({ pair, cause: compared.refused })
        continue
      }
      const { from: f, to: t, options, diff } = compared
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
  const last = (['plenum', 'ausschuss', 'rv', 'antrag'] as const).find((id) => d!.stations.get(id)?.length)
  if (last && d.stations.get('bgbl')?.length) {
    const compared = comparePair(d, last, 'bgbl')
    if (!compared.refused) {
      record.nullUnits!['parlament-bgbl'] += compared.diff.units.length
      for (const residue of residuesOf(compared.diff.units)) record.residues.push({ kind: 'parlament-bgbl', pair: `${d.label} ${last}>bgbl`, residue })
    }
  }
  // Null comparison 2: one draft, two readers.
  const html = d.stations.get('me')
  if (html?.length && d.meFromRis?.length) {
    const diff = diffLawPackage(html, d.meFromRis, { beyondCeiling: true })
    if (diff.unpaired) record.residues.push({ kind: 'html-xml', pair: `${d.label} html>xml`, residue: { unit: '(ganzer Text)', change: 'changed', editorial: false, pieces: ['kein Artikel gepaart'], ceiling: false } })
    else {
      record.nullUnits!['html-xml'] += diff.units.length
      for (const residue of residuesOf(diff.units)) record.residues.push({ kind: 'html-xml', pair: `${d.label} html>xml`, residue })
    }
  }
}
process.stderr.write('\n')

// --- Report -----------------------------------------------------------------
const residueLine = (r: Record_['residues'][number]): string =>
  `${r.pair} ${r.residue.change}${r.residue.editorial ? ' (redaktionell)' : ''}${r.residue.ceiling ? ' (Deckel)' : ''} ${r.residue.unit}`

const reachLine = withoutDraft
  ? `GP ${gp}, Gesetze ohne Begutachtung (${SKIPPED_LIST}, gemessen ${population?.measuredAt ?? '?'}): ${requested.length - unreached.length} von ${requested.length} geladen, ${record.drafts} mit einem ersten Text (${record.withoutRv} ohne)`
  : `GP ${gp}: ${requested.length - unreached.length} von ${requested.length} Entwürfen der Liste geladen, ${record.drafts} mit Regierungsvorlage (${record.withoutRv} ohne)`
if (listWindow) {
  const day = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.')
  console.log(`\nListe 81: ${listWindow.oldest ? `${listWindow.oldest.inr}/ME (${day(listWindow.oldest.arrivedAt)})` : '—'} bis ${listWindow.newest ? `${listWindow.newest.inr}/ME (${day(listWindow.newest.arrivedAt)})` : '—'}, ${listWindow.listFetchedAt ? `${listWindow.fromCache ? 'aus dem Cache, abgerufen am' : 'frisch abgerufen am'} ${day(listWindow.listFetchedAt)}` : 'Abruf unbekannt'}`)
  if (baselinePath && !listWindow.fromCache) console.log(`   Achtung: --baseline gegen eine frisch abgerufene Liste — ein neuer Entwurf steht als neuer Rest da; den eingefrorenen Korpus liest --liste-aus-cache`)
}
console.log(`\n${reachLine}, ${record.pairs} Stationspaare verglichen, ${record.refused!.length} vom Dienst abgelehnt${record.viaObjection ? `, ${record.viaObjection} Kundmachungen über den Einspruch des Bundesrats` : ''}`)
const refusedBy = new Map<string, string[]>()
for (const r of record.refused!) refusedBy.set(r.cause, [...(refusedBy.get(r.cause) ?? []), r.pair])
for (const [cause, pairs] of refusedBy) console.log(`   abgelehnt (${cause}): ${pairs.length} — ${pairs.slice(0, 12).join(' · ')}${pairs.length > 12 ? ' …' : ''}`)
console.log(`\n── 1. Invarianten (müssen 0 sein): ${record.breaches.length}`)
for (const b of record.breaches.slice(0, 60)) console.log(`   ✗ ${b.kind} ${b.pair} ${b.unit} — ${b.detail}`)
console.log(`   Inkrafttretens-Artikel nur einer Seite, nicht gezeigt unter dem Satz „verglichen wird deshalb, was in beiden Texten steht" (lawsOf, mergedLawsNote): ${record.commencementLeftOut} Einheiten`)
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

if (zensus) {
  const over = readerLosses.filter((r) => r.lost > CENSUS_FEW_WORDS).sort((a, b) => b.lost - a.lost)
  record.readerCensus = { documents: readerLosses.length, overFewWords: over }
  const words = readerLosses.reduce((n, r) => n + r.bodyWords, 0)
  const lost = readerLosses.reduce((n, r) => n + r.lost, 0)
  console.log(`\n── Zensus der Leser: ${readerLosses.length} Dokumente, ${lost} von ${words} Wörtern in keinem Block, ${over.length} Dokumente mit mehr als ${CENSUS_FEW_WORDS}`)
  for (const r of over.slice(0, 10)) {
    console.log(`   ${r.doc}: ${r.lost} von ${r.bodyWords} Wörtern — ${r.url}`)
    for (const run of r.runs.slice(0, 4)) console.log(`        „${run.slice(0, 200)}"`)
  }
}

if (mutate) {
  const empty = (): { tried: number } & Record<MutationOutcome, number> => ({ tried: 0, änderung: 0, redaktionell: 0, unverändert: 0, unsichtbar: 0, ungepaart: 0 })
  const result: NonNullable<Record_['mutations']> = { units: laterUnits.size, classes: Object.fromEntries(MUTATION_KINDS.map((k) => [k, empty()])) as NonNullable<Record_['mutations']>['classes'], misses: [] }
  let done = 0
  for (const { unit, where } of laterUnits.values()) {
    if (++done % 500 === 0) process.stderr.write(`\rMutationen: ${done}/${laterUnits.size} Einheiten   `)
    for (const m of mutations(unit.text)) {
      const outcome = mutationOutcome(diffLawUnits([unit], [{ ...unit, text: m.text }], { beyondCeiling: true }))
      const tally = result.classes[m.kind]
      tally.tried++
      tally[outcome]++
      if (isMiss(outcome)) result.misses.push({ kind: m.kind, outcome, unit: where, before: m.before, after: m.after })
    }
  }
  process.stderr.write('\n')
  record.mutations = result
  console.log(`\n── 5. Mutationen über ${result.units} Einheiten der späteren Texte: versucht · Änderung · redaktionell · unverändert · ohne Markierung · ungepaart`)
  for (const k of MUTATION_KINDS) {
    const c = result.classes[k]
    console.log(`   ${MUTATION_LABELS[k].padEnd(40)} ${[c.tried, c.änderung, c.redaktionell, c.unverändert, c.unsichtbar, c.ungepaart].map((n) => String(n).padStart(6)).join(' ')}`)
  }
  for (const miss of result.misses.slice(0, 60)) console.log(`   ✗ ${MUTATION_LABELS[miss.kind]} → ${miss.outcome}: ${miss.unit} „${miss.before}" → „${miss.after}"`)
}

if (jsonPath) {
  // The drafts of the list asked for and loaded: a draft that reached no
  // Regierungsvorlage is loaded and not compared, one that threw is not loaded.
  writeFileSync(jsonPath, `${JSON.stringify({ ...harnessStamp(), ...corpusReach(requested.length, unreached), ...record }, null, 1)}\n`)
  console.log(`\nBericht geschrieben: ${jsonPath}`)
}

// A run that compared nothing measured nothing, and must not pass as clean.
if (record.pairs === 0) console.log('\n✗ kein Stationspaar verglichen')
let failed = record.pairs === 0 || record.breaches.length > 0 || (record.mutations?.misses.length ?? 0) > 0
if (baselinePath) {
  const before = JSON.parse(readFileSync(baselinePath, 'utf8')) as Record_
  // The badges first: a verdict that moved, in either direction, is a line to
  // read, and so is a unit that is newly or no longer changed. A baseline
  // without badges cannot say any of it, and fails rather than report none.
  const badges = badgeMoves(before.verdicts, record.verdicts)
  if (!badges) {
    console.log(`\n── Badges gegen die Baseline: ${baselinePath} trägt keine (verdicts) — nicht verglichen`)
    failed = true
  } else {
    const tally = new Map<string, number>()
    for (const [, from, to] of badges.moved) tally.set(`${from} → ${to}`, (tally.get(`${from} → ${to}`) ?? 0) + 1)
    console.log(`\n── Badges gegen die Baseline: ${badges.moved.length} bewegt${[...tally].map(([k, n]) => ` · ${k} ${n}`).join('')} · ${badges.came.length} neu geändert · ${badges.went.length} nicht mehr geändert`)
    for (const [key, from, to] of badges.moved) {
      console.log(`   ${from} → ${to}: ${key}`)
      for (const p of piecesOf.get(key)?.slice(0, 6) ?? []) console.log(`        ${p}`)
    }
    for (const key of badges.came) {
      console.log(`   + ${record.verdicts[key]}: ${key}`)
      for (const p of piecesOf.get(key)?.slice(0, 6) ?? []) console.log(`        ${p}`)
    }
    for (const key of badges.went) console.log(`   − ${before.verdicts[key]}: ${key}`)
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
