#!/usr/bin/env vite-node
/**
 * The Länder station comparisons — Entwurf → Regierungsvorlage, Vorlage →
 * Ausschuss, Vorlage or Entwurf → Landesgesetzblatt — over the cached
 * population, with invariants that fail the run (19.11.2026).
 *
 *   npx vite-node -c vitest.config.ts scripts/harness/landStations.ts -- --out <dir> [--land sbg] [--show sbg-34234] [--cached-only] [--against <dir>]
 *
 * Until this file no instrument reached these comparisons: the Länder
 * corpus script read Oberösterreich only, through the dev server, with an
 * extraction of its own, and asserted nothing; the land guard reads the
 * Textgegenüberstellung. Four reader faults stood on the station pages
 * unseen — a cited „§ 8." wrapped onto its own line opened a § (an internal
 * „§ 8#dup" on the page), Salzburg's sub-instructions „15.1.1." split on the
 * Landesgesetzblatt's side only, table values standing alone on a line were
 * dropped from the PDFs, and Salzburg's running head wrapped onto two lines
 * was read as law.
 *
 * THE PIPELINE IS THE PRODUCT'S: `textSources` names the texts of a draft's
 * stations, their `read` runs the product's readers (`draftPdfLaw`,
 * `lgblUnits`), and `compareReadTexts` is the comparison the route serves
 * (`landLawDiffService.ts`). This file fetches, counts and prints. Not run:
 * the drafts that share a Kundmachung (a warning above the list, read from
 * the Land's site) — nothing below depends on it.
 *
 * The population is the cached Länder list of GP XXVIII and its drafts
 * (`.cache/eu-laender/server`, written by `corpus:eu-laender`), every pair
 * a draft offers (`LandDraftDetail.comparisons`) but the Textgegenüberstellung.
 * And the Land laws' pages (21.11.2026): every Landesgesetz of Salzburg's
 * and Oberösterreich's Landesgesetzblatt index, read as the route reads its
 * page (`readLandLawPage`, `lawAsDraftDetail`), its first text — Vorlage or
 * Initiativantrag — against the Landesgesetzblatt; a pair that is a draft's
 * own documents runs once, under the draft. Counted apart (`lawPages`), held
 * to the same invariants. Offline, Oberösterreich offers none: the Beilage
 * page that names its PDF is in no cache.
 * PDFs come from `.cache/eu-laender/docs`, `.harness-cache/land-guard-docs`
 * and this harness's own `.harness-cache/land-stations-docs`; a PDF in none
 * of them is fetched through `landPdfBytes` at one request per second and
 * kept (`--cached-only`: not fetched, the pair counted as missing). RIS — the
 * Landesgesetzblatt's record and XML — goes through the harness fetch cache
 * (`HARNESS_CACHE`, default `.harness-cache`); with `--cached-only` a record
 * or XML not on disk is not asked for either, and its pair ends as „Fehler".
 *
 * THE INVARIANTS. Each counts what the page would show and must not:
 *  - `#dup`: a unit id the parser marked as a repeat — the page prints it
 *    („§ 8#dup", „Z 15#dup") and pairs it as a unit of its own;
 *  - `Nur Ziffern neu`: a unit changed by nothing but inserted bare numbers
 *    — a table value or an enumerator one side's reader dropped;
 *    `Nur Ziffern weg` its mirror, removed (`numbersOnly`, 20.11.2026);
 *  - `Kopfzeile`: the Land's running head (a file path, Word's save stamp)
 *    in a unit's text;
 *  - `Unteranweisung neu`: an instruction shown as new whose text opens
 *    with a sub-instruction's number („1.1. In der Z 6 …");
 *  - `Wiederkehrender Einschub`: a unit changed by nothing but a short run
 *    (six to 40 characters, no digit; shorter is a word, which recurs as
 *    wording does) that changed units of three drafts of its Land insert,
 *    or remove, too
 *    (`recurringRuns`, 20.11.2026) — a page's furniture read as law, known
 *    by its recurrence rather than its shape: Kärnten's session stamp
 *    „REG.SITZG." stood in 198 units, and `Kopfzeile` knows Salzburg's head;
 *  - `Fehlgelesenes Zeichen`: a sign a misread font leaves and no German law
 *    text carries („ã", „Ò", „Ð", „¸", „ˆ", „‹", „‰" before a letter, a run
 *    of „É") in a unit's text (21.11.2026). The PDF reader repairs the fonts
 *    it knows (`repairMisreadFonts`); this sees the next document it does
 *    not. Until then 56 units of Tirol's 575/2026 carried such signs on the
 *    page, and nothing failed.
 * A hit fails the run (exit 1) and is printed with its comparison — unless
 * `landStationsAccepted.json` names it with the reason it is the documents'
 * own (19.11.2026: K-TDBG § 10 enumerates in the Landesgesetzblatt what the
 * draft ran on; the Biber-Verordnung adds Wildregion 5.4). An accepted hit
 * that no longer occurs fails the run too: the record moves with the
 * reading in the same commit, as `stationBaseline.json` does.
 *
 * THE BUND'S CHECKS (`lib/stationChecks.ts`, 20.11.2026), as `station.ts`
 * runs them over the Bund's pairs (`landPairChecks`): reconstruction over
 * the units the route serves, completeness and the later side's heading
 * over `diffLandDraft` before it withholds — blind to the law, see there —,
 * each breach failing the run; symmetry against the served comparison the
 * other way round, listed, not asserted.
 *
 * HELD TO FAULTS, as the Bund's (`station.ts --mutationen`, 21.11.2026):
 * every distinct unit of a pair's later text is compared, through
 * `compareReadTexts`, against itself with one change of substance in it
 * (`lib/stationMutations.ts`: a digit, a minus sign, „nicht" struck, „und"
 * and „oder" swapped, „%" for „‰", „<" for „>", two numbers joined, a range
 * collapsed). A fault forgiven („redaktionell", „unverändert") or unmarked
 * is a miss and fails the run; the record carries the table as `mutations`,
 * with the faults the comparison withheld instead (`withheld`). Its first
 * run found 12 long units whose words stood unmarked past the word diff's
 * ceiling.
 *
 * A NULL COMPARISON (21.11.2026), as `station.ts` holds the Bund's last
 * parliamentary text against the Kundmachung: where the committee's report
 * carries the text (Oberösterreich, `LAND_COMMITTEE_TEXT`), that text
 * against the Landesgesetzblatt, through `compareReadTexts`. Nothing may
 * change, unless the Landtag or the editing for publication changed it.
 * Every unit not unchanged is a residue, printed with its pieces and
 * compared for equality with `landStationsNullBaseline.json`, which names
 * for each one not editorial why it stands; one that came or went fails the
 * run. A residue is told apart by reading both documents' raw text at its
 * place: the source's where the texts themselves differ, the reader's where
 * both carry the same words and a reader put them elsewhere. RIS holds the
 * Landesgesetzblatt as its authentic PDF too, but no cache does: XML against
 * PDF, one document read twice, waits for a run with network.
 *
 * KÄRNTEN'S KUNDMACHUNG HELD AGAINST THE TEXTS (21.11.2026): the join
 * „beschluss" (`ktnKundmachung`) takes the Landesgesetzblatt by the
 * Beschluss's date and the title's words, with no text compared. Per find,
 * listed, not asserted: the two promulgation clauses (`amendmentChain`) and
 * the share of the draft's and the Vorlage's five-word runs in the
 * Landesgesetzblatt (`containedIn`); a clause naming another last amendment
 * or a share below 0.6 is marked to read. First run: 31 finds, 4 marked,
 * each read and right — the draft reworked before the Vorlage, which the
 * Landesgesetzblatt holds at 0.59 to 0.99, while another find's holds at
 * most 0.55 of a Vorlage (13199, which amends the other's Artikel II), 0.32
 * of every other.
 *
 * Counted beside them, not asserted: the instructions a pair withholds or
 * names as unread because one side or both did not read what they announce
 * (`announcedText.ts`, 19.11.2026), per pair in `comparisons.jsonl` and
 * `--against`; the pages inside a PDF without text (`textlessPages`,
 * 20.11.2026), which the page says; and the pairs to the
 * Landesgesetzblatt with no unit unchanged (`lgblNoneUnchanged`,
 * 21.11.2026), to be read by hand: a wrong Kundmachung passes there.
 *
 * Output: `<dir>/comparisons.jsonl` (one line per pair: state, stats, every
 * unit with its non-equal segments), `<dir>/summary.md`. `--against <dir>`
 * prints, pair by pair, every unit whose change or segments moved since that
 * run — the old-against-new reading of a reader change.
 *
 * Runs with `-c vitest.config.ts`: `texts/read.ts` imports `#shared`.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LaenderResponse, LandCode, LandDraftDetail, LandLawDiffResponse, LandTextDocument, LandTextStation, LawDiffUnit } from '../../shared/types'
import { installFetchCache } from '../lib/harnessCache'
import { harnessStamp, landListWindows } from '../lib/harnessRecord'
import { argFlag, argPair } from '../lib/args'
import { DERIVED_CACHE } from '../../server/utils/cache/base'
import { UpstreamError } from '../../server/utils/upstream/fetch'
import { landPdfBytes, pagesOfBytes } from '../../server/utils/laender/texts/read'
import { baselineMoves, landPairChecks, lgblNoneUnchanged, numbersOnly, pairsPerLand, recurringRuns, type PairState } from '../lib/landStationChecks'
import { residuesOf, type Breach, type Residue } from '../lib/stationChecks'
import { comparedText, diffLandDraft } from '../../server/utils/laender/landLawDiff'
import type { LawUnit } from '../../server/utils/lawtext/lawUnits'
import { amendmentChain, type ChainVerdict } from '../../server/utils/laender/amendmentChain'
import { containedIn, shingles, VORLAGE_CONTAINED } from '../../server/utils/laender/vorlageMatch'
import { MUTATION_KINDS, MUTATION_LABELS, isMiss, mutations, mutationOutcome, type MutationKind, type MutationOutcome } from '../lib/stationMutations'

const outDir = argPair('out')
const onlyLand = argPair('land') as LandCode | undefined
const show = argPair('show')
const against = argPair('against')
const cachedOnly = argFlag('cached-only')
if (!outDir) {
  console.error('Usage: npx vite-node -c vitest.config.ts scripts/harness/landStations.ts -- --out <dir> [--land <code>] [--show <id>] [--cached-only] [--against <dir>]')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })
// `--cached-only` keeps RIS offline too (21.11.2026): the fetch cache fetches
// what it does not hold, and a record or XML not on disk would have been
// asked for. Throwing underneath it, a miss fails its pair as „Fehler" —
// as an error the product's retry loop does not try again, which waited two
// seconds before each Land page's second try.
class NotCached extends UpstreamError {
  readonly retryable = false
}
if (cachedOnly) globalThis.fetch = (async (input: unknown) => { throw new NotCached(`nicht im Cache (--cached-only): ${String(input)}`) }) as typeof fetch
installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

// The comparison's module defines its Nitro cache at load: the identity
// stands in for it, so what runs is the comparison itself.
// Held for the run by its arguments, as Nitro holds it for its TTL: a law's
// page asks for the Land's register once per law (`readLandLawPage`), and
// asked anew each time it read the register 452 times (21.11.2026).
Object.assign(globalThis, {
  defineCachedFunction: <A extends unknown[], T>(fn: (...a: A) => Promise<T>) => {
    const held = new Map<string, Promise<T>>()
    return (...a: A) => {
      const key = JSON.stringify(a)
      if (!held.has(key)) held.set(key, fn(...a))
      return held.get(key)!
    }
  },
  DERIVED_CACHE,
  createError: (input: { statusCode?: number; statusMessage?: string }) => Object.assign(new Error(input.statusMessage ?? 'upstream'), input),
})
const { compareReadTexts } = await import('../../server/utils/laender/landLawDiffService')
const { textSources } = await import('../../server/utils/laender/texts/stations')
const { lawAsDraftDetail, readLandLawPage } = await import('../../server/utils/laender/landLawsService')
const { fetchLgblIndex } = await import('../../server/utils/laender/lgblIndex')
const { isLawEntry, lgblParts } = await import('../../server/utils/laender/landLaws')

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex')
const EU = '.cache/eu-laender'
const OWN_DOCS = '.harness-cache/land-stations-docs'
/** The invariant hits read and found to be the documents' own, each with why (committed). */
const ACCEPTED = 'scripts/harness/landStationsAccepted.json'
/** The null comparison's residues, compared for equality, each that is not editorial with why it stands (committed). */
const NULL_BASELINE = 'scripts/harness/landStationsNullBaseline.json'
mkdirSync(OWN_DOCS, { recursive: true })

// --- Bytes: cached wherever they are, else fetched at 1 request/s ---------
let lastFetch = 0
const fetched: string[] = []
const missing: string[] = []
async function bytesOf(url: string): Promise<Uint8Array> {
  const key = sha1(url)
  for (const file of [`${EU}/docs/${key}.pdf`, `.harness-cache/land-guard-docs/${key}.pdf`, `.harness-cache/tirol-tgu/docs/${key}.pdf`, `${OWN_DOCS}/${key}.pdf`, `.cache/laender-ohne-begutachtung/docs/${key}.pdf`]) {
    if (existsSync(file)) return new Uint8Array(readFileSync(file))
  }
  if (cachedOnly) {
    missing.push(url)
    throw new Error(`nicht im Cache: ${url}`)
  }
  const wait = lastFetch + 1_000 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastFetch = Date.now()
  const bytes = await landPdfBytes(url)
  writeFileSync(`${OWN_DOCS}/${key}.pdf`, bytes)
  fetched.push(url)
  return bytes
}
const pagesCache = new Map<string, Promise<string[]>>()
const pagesOf = (url: string) => {
  if (!pagesCache.has(url)) pagesCache.set(url, bytesOf(url).then((b) => pagesOfBytes(b.slice())))
  return pagesCache.get(url)!
}

// --- The invariants ------------------------------------------------------
type Invariant = '#dup' | 'Nur Ziffern neu' | 'Nur Ziffern weg' | 'Kopfzeile' | 'Unteranweisung neu' | 'Wiederkehrender Einschub' | 'Fehlgelesenes Zeichen'
const INVARIANTS: Invariant[] = ['#dup', 'Nur Ziffern neu', 'Nur Ziffern weg', 'Kopfzeile', 'Unteranweisung neu', 'Wiederkehrender Einschub', 'Fehlgelesenes Zeichen']
/** A sign a misread font leaves (`repairMisreadFonts`, `repairMacRoman`): none is a letter of a German law text; „‰" after a number is the per mille sign. */
const MISREAD_SIGN_RE = /[ãÒÐ¸ˆ‹]|‰(?=\p{L})|ÉÉ/u
/** A running head of Salzburg's template: a drive or network path, or Word's save stamp „….docx \ 27.11.2025 07:29:00". */
const HEAD_RE = /(?:^|\s)(?:[A-Z]:\\|\\\\)\S|\.docx?\s*\\\s*\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}/
/** What the instruction's number leaves when the parser takes only its first level: „1.1. In der Z 6", „1a. …", „2 Abs 3". */
const SUB_REST_RE = /^\s*\d+[a-z]?(?:\.\s?\d|\.[a-z]?\s|\s+(?:Im|In|Nach|Vor|Der|Die|Das|Dem|Abs)\b)/

function violations(u: LawDiffUnit): Invariant[] {
  const out: Invariant[] = []
  if (/#dup/.test(u.id) || /#dup/.test(u.fromId ?? '')) out.push('#dup')
  const numbers = numbersOnly(u.change, u.segments ?? [])
  if (numbers) out.push(numbers === 'neu' ? 'Nur Ziffern neu' : 'Nur Ziffern weg')
  if (HEAD_RE.test(u.fromText ?? '') || HEAD_RE.test(u.toText ?? '')) out.push('Kopfzeile')
  if (u.change === 'inserted' && /^Z\d+[a-z]*#dup/.test(u.id) && SUB_REST_RE.test(u.toText ?? '')) out.push('Unteranweisung neu')
  if (MISREAD_SIGN_RE.test(u.fromText ?? '') || MISREAD_SIGN_RE.test(u.toText ?? '')) out.push('Fehlgelesenes Zeichen')
  return out
}

// --- The population ------------------------------------------------------
const LIST = `${EU}/server/${sha1('/api/laender?gp=XXVIII&status=all')}.json`
const list = JSON.parse(readFileSync(LIST, 'utf8')) as LaenderResponse
const items = list.items
  .filter((i) => (!onlyLand || i.land === onlyLand) && (!show || i.id === show))
  .sort((a, b) => a.id.localeCompare(b.id))

interface UnitLine { article: string | null; id: string; fromId: string | null; change: string; editorial: boolean; segments: string[]; violations: Invariant[] }
interface ComparisonLine {
  land: LandCode
  draft: string
  pair: string
  state: PairState
  reason: string | null
  from: string | null
  to: string | null
  stats: LandLawDiffResponse['stats'] | null
  units: UnitLine[]
  /** Units the comparison withholds, with the reason; and those it shows with their announced text unread (`announcedText.ts`). */
  withheld: string[]
  unread: string[]
  /** The Bund's checks (`stationChecks.ts`): breaches fail the run, symmetry is listed. */
  breaches: string[]
  symmetry: string[]
  /** Pages inside either PDF without text (`textlessPages`), which the page says (20.11.2026). */
  droppedPages?: number
  /** A Land law's page (an Initiativantrag or Vorlage without a draft), not a draft's. */
  law?: true
}
const lines: ComparisonLine[] = []
/**
 * The null comparison (21.11.2026): the committee's text against the
 * Landesgesetzblatt, where the committee's report carries the text
 * (Oberösterreich) — the Bund's „last parliamentary text against the
 * Kundmachung" in a Land's shape. Kept apart from the pairs the page offers.
 */
const nullLines: (ComparisonLine & { residues: Residue[] })[] = []
/**
 * Kärnten's Kundmachung held against the texts (21.11.2026): the join
 * („beschluss", `ktnKundmachung`) rests on the Beschluss's date and the
 * title's words, with no text compared. Per find: the two promulgation
 * clauses (`amendmentChain`, the rule Salzburg's title finds are held to)
 * and the share of the draft's and the Vorlage's five-word runs that stand
 * in the Landesgesetzblatt (`containedIn`). A clause that names another last
 * amendment, or a share below the Vorlage oracle's 0.6, is listed to read.
 */
const ktnFinds: { draft: string; lgbl: string; chain: ChainVerdict | null; draftShare: number | null; rvShare: number | null; error?: string }[] = []
const lawWords = (r: { units: LawUnit[] | null; text: string }) => (r.units?.length ? r.units.map((u) => `${u.heading ?? ''} ${u.text}`).join(' ') : r.text)
/** Every distinct unit of a pair's later text, by its text, with its pair and where it stands — for the fault injection below. */
const laterUnits = new Map<string, { unit: LawUnit; from: LandTextStation; to: LandTextStation; where: string }>()
/** Every draft of the population: its detail in the cache, and the pairs it offers (`pairsPerLand`). */
const draftsRun: { land: LandCode; cached: boolean; pairs: number }[] = []
const segmentsOf = (u: LawDiffUnit): string[] =>
  u.change === 'unchanged'
    ? []
    : u.change === 'inserted' || u.change === 'removed'
      ? [`${u.change === 'inserted' ? '+' : '-'}${(u.change === 'inserted' ? u.toText : u.fromText ?? '')?.slice(0, 160) ?? ''}`]
      : (u.segments ?? []).filter((s) => s.type !== 'equal').map((s) => `${s.type === 'inserted' ? '+' : '-'}${s.text.slice(0, 160)}`)

// --- The Land laws' pages (21.11.2026) -------------------------------------
// A Landesgesetz's page — an Initiativantrag or a Vorlage that never had a
// draft — compares its first text with the Landesgesetzblatt through the
// same readers, and stood in no population. Read as the route reads it
// (`readLandLawPage`, `lawAsDraftDetail`); only Salzburg and Oberösterreich
// offer a first text (`firstTextOf`). Its pairs run with the drafts' and
// under the same invariants, counted apart (`lawPages`).
const LAW_LANDS: LandCode[] = ['ooe', 'sbg']
const lawDetails = new Map<string, LandDraftDetail>()
const lawPages: Record<string, { laws: number; pages: number; firstTextUnread: number; offered: number; failed: number; sameAsDraft: number }> = {}
/** The documents of every draft pair run, so a law page's pair that is one of them is not run twice. */
const draftDocs = new Set<string>()
for (const land of LAW_LANDS.filter((l) => (!onlyLand || l === onlyLand) && !show)) {
  const count = (lawPages[land] = { laws: 0, pages: 0, firstTextUnread: 0, offered: 0, failed: 0, sameAsDraft: 0 })
  const index = await fetchLgblIndex(land).catch(() => [])
  for (const e of index.filter(isLawEntry)) {
    const parts = lgblParts(e.nr)
    if (!parts) continue
    count.laws++
    const page = await readLandLawPage(land, parts.year, parts.number).catch(() => null)
    if (!page) {
      count.failed++
      continue
    }
    count.pages++
    // A route with an address and no first text: the page that names the PDF was not read (Oberösterreich's Beilage page offline).
    if (!page.firstText && page.law.route?.url) count.firstTextUnread++
    if (page.comparisons.some(([a]) => a === 'rv' || a === 'antrag')) {
      count.offered++
      lawDetails.set(`${land}-lgbl/${parts.year}/${parts.number}`, lawAsDraftDetail(page))
    }
  }
}
const lawItems = [...lawDetails.values()].map((d) => ({ id: d.draft.id, land: d.draft.land }))

let done = 0
for (const item of [...items, ...lawItems]) {
  const number = item.id.slice(item.id.indexOf('-') + 1)
  const file = `${EU}/server/${sha1(`/api/laender/${item.land}/${encodeURIComponent(number)}`)}.json`
  const lawDetail = lawDetails.get(item.id)
  done++
  if (!lawDetail && !existsSync(file)) {
    draftsRun.push({ land: item.land, cached: false, pairs: 0 })
    continue
  }
  const detail = lawDetail ?? JSON.parse(readFileSync(file, 'utf8')) as LandDraftDetail
  const pairs = (detail.comparisons ?? []).filter(([a]) => a !== 'geltend' && a !== 'vorher')
  if (!lawDetail) draftsRun.push({ land: item.land, cached: true, pairs: pairs.length })
  if (!pairs.length) continue
  const sources = textSources(item.land, detail, pagesOf)
  for (const [from, to] of pairs as [LandTextStation, LandTextStation][]) {
    // A law with a draft has its page too, and the page's pair is often the
    // draft's own documents: compared once, under the draft (the run-across
    // check would count one comparison as two drafts).
    const docs = `${sources[from]?.document.url ?? ''}|${sources[to]?.document.label ?? ''}`
    if (lawDetail && draftDocs.has(docs)) {
      lawPages[item.land]!.sameAsDraft++
      continue
    }
    if (!lawDetail) draftDocs.add(docs)
    const line: ComparisonLine = { land: item.land, draft: item.id, pair: `${from}→${to}`, state: 'verglichen', reason: null, from: null, to: null, stats: null, units: [], withheld: [], unread: [], breaches: [], symmetry: [], ...(lawDetail ? { law: true as const } : {}) }
    lines.push(line)
    const a = sources[from]
    const b = sources[to]
    if (!a || !b) {
      line.state = 'nicht verfügbar'
      line.reason = 'keine Quelle'
      continue
    }
    try {
      const reads = [await a.read(), await b.read()] as const
      for (const unit of reads[1].units ?? []) if (!laterUnits.has(unit.text)) laterUnits.set(unit.text, { unit, from, to, where: `${item.id} ${to} ${(unit.article ?? '—').slice(0, 50)} · ${unit.id}` })
      const value = compareReadTexts(from, to, reads, [a.document, b.document])
      line.from = value.fromDocument?.url ?? value.fromDocument?.label ?? null
      line.to = value.toDocument?.url ?? value.toDocument?.label ?? null
      if (!value.available) {
        line.state = 'nicht verfügbar'
        line.reason = value.unavailableReason
        continue
      }
      line.stats = value.stats
      line.units = value.units.map((u) => ({ article: u.article, id: u.id, fromId: u.fromId, change: u.change, editorial: !!u.editorial, segments: segmentsOf(u), violations: violations(u) }))
      line.withheld = value.withheld.map((w) => `${w.law ?? '-'}|${w.id}|${w.reason ?? 'standing'}`)
      line.unread = (value.unreadAnnounced ?? []).map((w) => `${w.law ?? '-'}|${w.id}`)
      if (value.droppedPages) line.droppedPages = value.droppedPages
      // The Bund's checks (`landPairChecks`).
      const back = compareReadTexts(to, from, [reads[1], reads[0]], [b.document, a.document])
      const checks = landPairChecks({
        from: reads[0].units ?? [],
        to: reads[1].units ?? [],
        served: value.units,
        before: diffLandDraft(reads[0].units ?? [], reads[1].units ?? []),
        back: back.available ? back.units : null,
        compared: comparedText,
      })
      const said = (b: Breach) => `${b.kind} | ${b.unit} | ${b.detail}`
      line.breaches = checks.breaches.map(said)
      line.symmetry = back.available ? checks.symmetry.map(said) : [`rückwärts nicht verfügbar | ${back.unavailableReason ?? ''}`]
    } catch (err) {
      line.state = /nicht im Cache/.test(String(err)) ? 'fehlt' : 'Fehler'
      line.reason = String(err).slice(0, 200)
    }
  }
  const stage = detail.draft.stage
  if (item.land === 'ktn' && stage && stage !== 'unknown' && stage.certainBy === 'beschluss' && sources.lgbl) {
    const find: (typeof ktnFinds)[number] = { draft: item.id, lgbl: stage.detail ?? '', chain: null, draftShare: null, rvShare: null }
    ktnFinds.push(find)
    try {
      const lgbl = await sources.lgbl.read()
      const theirs = shingles(lgbl.text)
      if (sources.entwurf) {
        const draft = await sources.entwurf.read()
        find.chain = amendmentChain(draft.text, lgbl.text)
        find.draftShare = containedIn(shingles(lawWords(draft)), theirs)
      }
      if (sources.rv) find.rvShare = containedIn(shingles(lawWords(await sources.rv.read())), theirs)
    } catch (err) {
      find.error = String(err).slice(0, 200)
    }
  }
  // The null comparison: nothing may change between the committee's text and the Kundmachung, unless the Landtag changed it.
  if (!lawDetail && sources.ausschuss && sources.lgbl) {
    const line = { land: item.land, draft: item.id, pair: 'ausschuss→lgbl', state: 'verglichen' as PairState, reason: null as string | null, from: null, to: null, stats: null as LandLawDiffResponse['stats'] | null, units: [], withheld: [], unread: [], breaches: [], symmetry: [], residues: [] as Residue[] }
    nullLines.push(line)
    try {
      const value = compareReadTexts('ausschuss', 'lgbl', [await sources.ausschuss.read(), await sources.lgbl.read()], [sources.ausschuss.document, sources.lgbl.document])
      if (!value.available) {
        line.state = 'nicht verfügbar'
        line.reason = value.unavailableReason
      } else {
        line.stats = value.stats
        line.residues = residuesOf(value.units)
      }
    } catch (err) {
      line.state = /nicht im Cache/.test(String(err)) ? 'fehlt' : 'Fehler'
      line.reason = String(err).slice(0, 200)
    }
  }
  process.stderr.write(`\r${done}/${items.length + lawItems.length} ${item.id}            `)
}
process.stderr.write('\n')

// --- Across pairs: the same short run in a Land's drafts (`recurringRuns`) ---
const recurring = recurringRuns(lines.flatMap((l) => l.units.map((u) => ({
  land: l.land,
  draft: l.draft,
  change: u.change,
  segments: u.segments.map((s) => ({ type: s.startsWith('+') ? 'inserted' as const : 'removed' as const, text: s.slice(1) })),
  line: u,
}))))
for (const r of recurring) for (const u of r.only) if (!u.line.violations.includes('Wiederkehrender Einschub')) u.line.violations.push('Wiederkehrender Einschub')

// --- Held to faults, as the Bund's (`station.ts --mutationen`) ----------------
// Every distinct unit of a later text against itself with one change of
// substance in it, through the comparison the route serves — the Land's
// cleaning, Artikel pairing and withholding included.
const unitDoc: LandTextDocument = { label: 'Einheit', url: null, publisher: '' }
const emptyTally = (): { tried: number } & Record<MutationOutcome, number> => ({ tried: 0, änderung: 0, redaktionell: 0, unverändert: 0, unsichtbar: 0, ungepaart: 0 })
const faults = { units: laterUnits.size, classes: Object.fromEntries(MUTATION_KINDS.map((k) => [k, emptyTally()])) as Record<MutationKind, ReturnType<typeof emptyTally>>, misses: [] as { kind: MutationKind; outcome: MutationOutcome; unit: string; before: string; after: string }[] }
/** Faults whose unit the comparison withheld (`announcedText.ts`) — counted apart, as the Bund has no such answer. */
let faultsWithheld = 0
for (const { unit, from, to, where } of laterUnits.values()) {
  for (const m of mutations(unit.text)) {
    const value = compareReadTexts(from, to, [{ units: [unit], text: unit.text }, { units: [{ ...unit, text: m.text }], text: m.text }], [unitDoc, unitDoc])
    if (value.withheld.length) faultsWithheld++
    const outcome = mutationOutcome(value.units)
    const tally = faults.classes[m.kind]
    tally.tried++
    tally[outcome]++
    if (isMiss(outcome)) faults.misses.push({ kind: m.kind, outcome, unit: where, before: m.before, after: m.after })
  }
}

// --- Output --------------------------------------------------------------
writeFileSync(join(outDir, 'comparisons.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
const out: string[] = []
/* The drafts' pairs, which /genauigkeit counts, and the law pages' apart. */
const draftLines = lines.filter((l) => !l.law)
const lawLines = lines.filter((l) => l.law)
out.push(`# Länder-Stationen: Vergleiche und Invarianten — ${new Date().toISOString().slice(0, 16)}`)
out.push('')
// A draft whose detail the cache lacks is not fetched (Steiermark's 30 of 40 on 21.11.2026): named here, not only in the table.
const uncachedDrafts = Object.entries(pairsPerLand(draftsRun, [])).filter(([, c]) => c.uncached).map(([land, c]) => `${land} ${c.uncached} von ${c.drafts}`)
/* The list's window: as `corpus:eu-laender` fetched it, not as of the run (21.11.2026). */
const windows = landListWindows(items, statSync(LIST).mtime)
out.push(`Liste der Länder abgerufen am ${statSync(LIST).mtime.toISOString().slice(0, 10)}; jüngster Beginn je Land: ${Object.entries(windows).map(([land, w]) => `${land} ${w.newestStart ?? '—'}`).join(', ')}`)
out.push('')
out.push(`Population: ${items.length} Entwürfe (GP XXVIII), ${draftLines.length} Stationspaare; ${lawItems.length} Seiten von Landesgesetzen, ${lawLines.length} Paare; PDFs geholt: ${fetched.length}, fehlend: ${missing.length}${uncachedDrafts.length ? `; Entwürfe ohne Detail im Cache (nicht geholt): ${uncachedDrafts.join(', ')}` : ''}`)
out.push('')
out.push('| Paar | angeboten | verglichen | nicht verfügbar | fehlt | Fehler | Einheiten | geändert | neu | entfallen |')
out.push('|---|---|---|---|---|---|---|---|---|---|')
const byPair = new Map<string, ComparisonLine[]>()
for (const l of lines) byPair.set(`${l.law ? 'Gesetz: ' : ''}${l.pair}`, [...(byPair.get(`${l.law ? 'Gesetz: ' : ''}${l.pair}`) ?? []), l])
for (const [pair, ls] of [...byPair].sort()) {
  const ok = ls.filter((l) => l.state === 'verglichen')
  const sum = (k: keyof LandLawDiffResponse['stats']) => ok.reduce((n, l) => n + (l.stats?.[k] ?? 0), 0)
  out.push(`| ${pair} | ${ls.length} | ${ok.length} | ${ls.filter((l) => l.state === 'nicht verfügbar').length} | ${ls.filter((l) => l.state === 'fehlt').length} | ${ls.filter((l) => l.state === 'Fehler').length} | ${sum('total')} | ${sum('changed')} | ${sum('inserted')} | ${sum('removed')} |`)
}
out.push('')
out.push('| Land | Entwürfe | Detail nicht im Cache | mit Paaren | Paare angefragt | verglichen | nicht verfügbar | fehlt (PDF nicht im Cache) | Fehler |')
out.push('|---|---|---|---|---|---|---|---|---|')
const perLand = pairsPerLand(draftsRun, draftLines)
for (const [land, c] of Object.entries(perLand)) out.push(`| ${land} | ${c.drafts} | ${c.uncached} | ${c.withPairs} | ${c.requested} | ${c.compared} | ${c.unavailable} | ${c.missing} | ${c.errored} |`)
out.push('')
out.push('| Land: Seiten von Landesgesetzen | Gesetze im Index | Seite gelesen | erster Text nicht gelesen (Seite mit dem PDF nicht im Cache) | mit Paar | dasselbe Paar wie ein Entwurf | verglichen | nicht verfügbar | fehlt (PDF oder RIS nicht im Cache) | Fehler |')
out.push('|---|---|---|---|---|---|---|---|---|---|')
for (const [land, c] of Object.entries(lawPages)) {
  const ls = lawLines.filter((l) => l.land === land)
  out.push(`| ${land} | ${c.laws} | ${c.pages} | ${c.firstTextUnread} | ${c.offered} | ${c.sameAsDraft} | ${ls.filter((l) => l.state === 'verglichen').length} | ${ls.filter((l) => l.state === 'nicht verfügbar').length} | ${ls.filter((l) => l.state === 'fehlt').length} | ${ls.filter((l) => l.state === 'Fehler').length} |`)
}
out.push('')
out.push('## Invarianten')
out.push('')
const allHits = lines.flatMap((l) => l.units.filter((u) => u.violations.length).map((u) => ({ l, u })))
/* A hit is keyed by what it is, not by where it stands in the output: the invariants, the draft, the pair, the law and the unit. */
const hitKey = ({ l, u }: { l: ComparisonLine; u: UnitLine }) => `${u.violations.join(', ')} | ${l.draft} ${l.pair} | ${u.article ?? '-'} | ${u.id}`
const acceptedRecord = JSON.parse(readFileSync(ACCEPTED, 'utf8')) as { note: string; accepted: Record<string, string> }
const hits = allHits.filter((h) => !(hitKey(h) in acceptedRecord.accepted))
const accepted = allHits.filter((h) => hitKey(h) in acceptedRecord.accepted)
/* Only where the run covers the record's drafts: a run limited to one Land or one draft says nothing of the others. */
const ranDrafts = new Set(lines.map((l) => l.draft))
const stale = Object.keys(acceptedRecord.accepted).filter((k) => ranDrafts.has(k.split(' | ')[1]!.split(' ')[0]!) && !accepted.some((h) => hitKey(h) === k))
for (const inv of INVARIANTS) {
  const h = hits.filter((x) => x.u.violations.includes(inv))
  const a = accepted.filter((x) => x.u.violations.includes(inv)).length
  out.push(`- ${inv}: ${h.length} Einheiten in ${new Set(h.map((x) => `${x.l.draft} ${x.l.pair}`)).size} Vergleichen${a ? ` (dazu ${a} angenommen, landStationsAccepted.json)` : ''}`)
}
for (const r of recurring) out.push(`  - ${r.land} ${r.side === 'inserted' ? '+' : '-'}„${r.text}" in ${r.drafts} Entwürfen, ${r.units} Einheiten, einzige Änderung in ${r.only.length}`)
out.push('')
for (const { l, u } of hits) out.push(`- [${u.violations.join(', ')}] ${l.draft} ${l.pair} ${u.article ?? '-'} ${u.fromId && u.fromId !== u.id ? `${u.fromId} → ` : ''}${u.id} ${u.change}${u.editorial ? ' (redaktionell)' : ''} ${u.segments.slice(0, 4).join(' | ').slice(0, 300)}`)
for (const k of stale) out.push(`- [angenommen, tritt nicht mehr auf] ${k} — ${acceptedRecord.accepted[k]}`)
const withheldUnits = draftLines.flatMap((l) => l.withheld.filter((w) => w.endsWith('|announced')))
const unreadUnits = draftLines.flatMap((l) => l.unread)
out.push('')
const droppedLines = lines.filter((l) => l.droppedPages)
out.push(`Seiten ohne Text im Dokument (textlessPages): ${droppedLines.reduce((n, l) => n + l.droppedPages!, 0)} in ${droppedLines.length} Vergleichen${droppedLines.length ? ` — ${droppedLines.map((l) => `${l.draft} ${l.pair}`).join(', ')}` : ''}`)
const noneUnchanged = lgblNoneUnchanged(lines)
out.push(`Gegen das Landesgesetzblatt ohne unveränderte Einheit (lgblNoneUnchanged, von Hand lesen): ${noneUnchanged.length} von ${lines.filter((l) => l.pair.endsWith('→lgbl') && l.state === 'verglichen').length} Vergleichen${noneUnchanged.length ? ` — ${noneUnchanged.map((l) => `${l.draft} ${l.pair}`).join(', ')}` : ''}`)
out.push(`Angekündigter Text nicht gelesen (announcedText.ts): ${withheldUnits.length} Anweisungen zurückgehalten in ${draftLines.filter((l) => l.withheld.some((w) => w.endsWith('|announced'))).length} Vergleichen, ${unreadUnits.length} gezeigt und als „nicht lesbar" genannt in ${draftLines.filter((l) => l.unread.length).length} Vergleichen; auf Seiten von Landesgesetzen ${lawLines.flatMap((l) => l.withheld.filter((w) => w.endsWith('|announced'))).length} zurückgehalten, ${lawLines.flatMap((l) => l.unread).length} als „nicht lesbar" genannt`)
const breachLines = lines.flatMap((l) => l.breaches.map((b) => ({ l, b })))
const symmetryLines = lines.flatMap((l) => l.symmetry.map((b) => ({ l, b })))
const kinds = (xs: { b: string }[]) => [...xs.reduce((m, x) => m.set(x.b.split(' | ')[0]!, (m.get(x.b.split(' | ')[0]!) ?? 0) + 1), new Map<string, number>())].map(([k, n]) => `${k} ${n}`).join(', ') || '0'
out.push('')
out.push('## Prüfungen des Bundes (stationChecks.ts)')
out.push('')
out.push(`- Brüche (müssen 0 sein): ${breachLines.length} in ${new Set(breachLines.map((x) => `${x.l.draft} ${x.l.pair}`)).size} Vergleichen — ${kinds(breachLines)}`)
out.push(`- Symmetrie (gelistet): ${symmetryLines.length} in ${new Set(symmetryLines.map((x) => `${x.l.draft} ${x.l.pair}`)).size} Vergleichen — ${kinds(symmetryLines)}`)
out.push('')
for (const { l, b } of breachLines) out.push(`- [Bruch] ${l.draft} ${l.pair} ${b.slice(0, 300)}`)
for (const { l, b } of symmetryLines) out.push(`- [Symmetrie] ${l.draft} ${l.pair} ${b.slice(0, 300)}`)
out.push('')
out.push(`## Mutationen über ${faults.units} Einheiten der späteren Texte (stationMutations.ts): versucht · Änderung · redaktionell · unverändert · ohne Markierung · ungepaart`)
out.push('')
for (const k of MUTATION_KINDS) {
  const c = faults.classes[k]
  out.push(`- ${MUTATION_LABELS[k]}: ${[c.tried, c.änderung, c.redaktionell, c.unverändert, c.unsichtbar, c.ungepaart].join(' · ')}`)
}
out.push(`- zurückgehalten (announcedText.ts): ${faultsWithheld}`)
for (const miss of faults.misses) out.push(`- [Mutation verfehlt] ${MUTATION_LABELS[miss.kind]} → ${miss.outcome}: ${miss.unit} „${miss.before}" → „${miss.after}"`)
// --- Kärnten's Kundmachung against the texts ---------------------------------
const share = (x: number | null) => (x === null ? '—' : x.toFixed(2))
const ktnToRead = ktnFinds.filter((f) => f.error || f.chain === 'differ' || (f.draftShare ?? 1) < VORLAGE_CONTAINED || (f.rvShare ?? 1) < VORLAGE_CONTAINED)
out.push('')
out.push(`## Kärnten: Kundmachung aus Beschlussdatum und Titel (certainBy „beschluss"), gegen die Texte gehalten`)
out.push('')
out.push(`${ktnFinds.length} Funde; Promulgationsklausel gleich ${ktnFinds.filter((f) => f.chain === 'same').length}, anders ${ktnFinds.filter((f) => f.chain === 'differ').length}, kein gemeinsames Gesetz ${ktnFinds.filter((f) => f.chain === 'none').length}; zu lesen (Klausel anders, Anteil unter ${VORLAGE_CONTAINED} oder nicht gelesen): ${ktnToRead.length}`)
out.push('')
for (const f of ktnFinds) out.push(`- ${ktnToRead.includes(f) ? '[lesen] ' : ''}${f.draft} → ${f.lgbl}: Klausel ${f.chain ?? '—'}, Entwurf im LGBl ${share(f.draftShare)}, Vorlage im LGBl ${share(f.rvShare)}${f.error ? ` — ${f.error}` : ''}`)

// --- The null comparison against its baseline ------------------------------
const residueLine = (l: (typeof nullLines)[number], r: Residue) => `${l.draft} ${l.pair} ${r.change}${r.editorial ? ' (redaktionell)' : ''} ${r.unit}`
const nullBaseline = JSON.parse(readFileSync(NULL_BASELINE, 'utf8')) as { note: string; pairs: number; residues: string[]; reasons: Record<string, string> }
const nullNow = nullLines.flatMap((l) => l.residues.map((r) => residueLine(l, r)))
const { came: nullCame, went: nullWent } = baselineMoves(nullNow, nullBaseline.residues, new Set(nullLines.map((l) => l.draft)))
const nullCompared = nullLines.filter((l) => l.state === 'verglichen')
const nullUnits = nullCompared.reduce((n, l) => n + (l.stats?.total ?? 0), 0)
const nullResidues = nullLines.flatMap((l) => l.residues)
out.push('')
out.push(`## Nullvergleich: Ausschusstext → Landesgesetzblatt (${NULL_BASELINE})`)
out.push('')
out.push(`${nullLines.length} Paare, ${nullCompared.length} verglichen${nullLines.length - nullCompared.length ? ` (${nullLines.filter((l) => l.state !== 'verglichen').map((l) => `${l.draft}: ${l.state}`).join(', ')})` : ''}; ${nullResidues.length} Reste in ${nullUnits} Einheiten, davon ${nullResidues.filter((r) => !r.editorial).length} nicht redaktionell; gegen die Baseline ${nullCame.length} neu, ${nullWent.length} weg`)
out.push('')
for (const l of nullLines) {
  for (const r of l.residues) {
    const key = residueLine(l, r)
    out.push(`- ${nullCame.includes(key) ? '[neu] ' : ''}${key}${nullBaseline.reasons[key] ? ` — ${nullBaseline.reasons[key]}` : ''}`)
    for (const p of r.pieces.slice(0, 6)) out.push(`  - ${p}`)
  }
}
for (const r of nullWent) out.push(`- [weg] ${r}${nullBaseline.reasons[r] ? ` (war: ${nullBaseline.reasons[r]})` : ''}`)
const errors = lines.filter((l) => l.state === 'Fehler')
if (errors.length) {
  out.push('')
  out.push('## Fehler')
  out.push('')
  for (const l of errors) out.push(`- ${l.draft} ${l.pair}: ${l.reason}`)
}

// --- Old against new -----------------------------------------------------
if (against) {
  const key = (l: ComparisonLine) => `${l.draft} ${l.pair}`
  const old = new Map(readFileSync(join(against, 'comparisons.jsonl'), 'utf8').trim().split('\n').map((s) => JSON.parse(s) as ComparisonLine).map((l) => [key(l), l]))
  const unitKey = (u: UnitLine) => `${u.article ?? '-'}|${u.fromId ?? ''}|${u.id}`
  const shown = (u: UnitLine | undefined) => (u ? `${u.change}${u.editorial ? '/red' : ''} ${u.segments.join(' | ').slice(0, 400)}` : 'fehlt')
  out.push('')
  out.push(`## Gegen ${against}`)
  out.push('')
  let moved = 0
  for (const l of lines) {
    const o = old.get(key(l))
    if (!o) {
      out.push(`- ${key(l)}: neu im Lauf`)
      continue
    }
    const om = new Map(o.units.map((u) => [unitKey(u), u]))
    const nm = new Map(l.units.map((u) => [unitKey(u), u]))
    const diffs = [...new Set([...om.keys(), ...nm.keys()])].filter((k) => shown(om.get(k)) !== shown(nm.get(k)))
    // A record from before 19.11.2026 has neither list.
    const heldOld = new Set([...(o.withheld ?? []), ...(o.unread ?? []).map((w) => `${w}|unread`)])
    const heldNew = new Set([...l.withheld, ...l.unread.map((w) => `${w}|unread`)])
    const held = [...heldNew].filter((w) => !heldOld.has(w)).map((w) => `+ ${w}`).concat([...heldOld].filter((w) => !heldNew.has(w)).map((w) => `- ${w}`))
    const stats = (x: ComparisonLine) => (x.stats ? `t${x.stats.total} u${x.stats.unchanged} c${x.stats.changed} e${x.stats.editorial} i${x.stats.inserted} r${x.stats.removed}` : x.state)
    if (!diffs.length && !held.length && stats(o) === stats(l)) continue
    moved++
    out.push(`### ${key(l)}: ${stats(o)} → ${stats(l)}`)
    for (const k of diffs) out.push(`- ${k.replace(/\|/g, ' ')}\n  - alt: ${shown(om.get(k))}\n  - neu: ${shown(nm.get(k))}`)
    for (const w of held) out.push(`- zurückgehalten/nicht lesbar ${w.replace(/\|/g, ' ')}`)
  }
  out.push('')
  out.push(`Bewegte Vergleiche: ${moved} von ${lines.length}`)
}
writeFileSync(join(outDir, 'summary.md'), out.join('\n'))
/* The figures above as a record (19.11.2026), for
   `scripts/harness/genauigkeit.ts`, which writes what `/genauigkeit` shows. */
writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify({
  // `at` and `commit`: the builder of /genauigkeit takes only records of one clean commit (`scripts/lib/genauigkeitRound.ts`).
  ...harnessStamp(),
  // Per Land: the latest Beginn and Frist of the cached list's drafts, those with neither, and when the list was fetched (the cache file's time).
  windows,
  pairs: draftLines.length,
  compared: draftLines.filter((l) => l.state === 'verglichen').length,
  lands: perLand,
  units: draftLines.reduce((n, l) => n + (l.stats?.total ?? 0), 0),
  hits: hits.length,
  accepted: accepted.length,
  breaches: breachLines.length,
  symmetry: symmetryLines.length,
  stale: stale.length,
  withheld: withheldUnits.length,
  withheldPairs: draftLines.filter((l) => l.withheld.some((w) => w.endsWith('|announced'))).length,
  unread: unreadUnits.length,
  unreadPairs: draftLines.filter((l) => l.unread.length).length,
  // Per class: tried and how the comparison answered, as `station.ts --mutationen` writes it; the misses to read.
  mutations: { ...faults, withheld: faultsWithheld },
  // Kärnten's date-and-title join held against the texts: finds, clauses alike / other / none to compare, finds listed to read.
  ktnKundmachung: { finds: ktnFinds.length, same: ktnFinds.filter((f) => f.chain === 'same').length, differ: ktnFinds.filter((f) => f.chain === 'differ').length, none: ktnFinds.filter((f) => f.chain === 'none').length, toRead: ktnToRead.length },
  // The committee's text against the Landesgesetzblatt: pairs, those compared, units held against each other, residues (not unchanged) and those not editorial; against the baseline.
  // The Land laws' pages, apart from the drafts' pairs (hits, breaches and faults above count both): per Land the laws, pages read, first texts not read, pages with a pair; the pairs and how they ended.
  lawPages: {
    lands: lawPages,
    pairs: lawLines.length,
    compared: lawLines.filter((l) => l.state === 'verglichen').length,
    unavailable: lawLines.filter((l) => l.state === 'nicht verfügbar').length,
    missing: lawLines.filter((l) => l.state === 'fehlt').length,
    errored: lawLines.filter((l) => l.state === 'Fehler').length,
    units: lawLines.reduce((n, l) => n + (l.stats?.total ?? 0), 0),
    withheld: lawLines.flatMap((l) => l.withheld.filter((w) => w.endsWith('|announced'))).length,
    unread: lawLines.flatMap((l) => l.unread).length,
  },
  nullComparison: { pairs: nullLines.length, compared: nullCompared.length, units: nullUnits, residues: nullResidues.length, substantive: nullResidues.filter((r) => !r.editorial).length, came: nullCame.length, went: nullWent.length },
}, null, 1)}\n`)
console.log(out.join('\n'))
if (missing.length) console.log(`\nFehlende PDFs:\n${missing.join('\n')}`)
process.exit(hits.length || stale.length || breachLines.length || faults.misses.length || nullCame.length || nullWent.length ? 1 : 0)
