#!/usr/bin/env vite-node
/**
 * Alt gegen neu über Segmente — what a change to the comparison form does to
 * the displayed text.
 *
 * WHY THIS EXISTS. `lawtext/normalize.ts` keeps three forms of one text: the
 * equality key (`compareKey`), the array a word diff ALIGNS on (`displayTokens`
 * + `compareToken`) and the array it SHOWS (`displayTokens`). A fold belongs
 * in exactly one of them, and on 25.09.2026 a fold in the wrong one reached
 * the page twice in one day: the inner hyphen, which the diff both aligned on
 * and emitted, so the Lesefassung printed „BundesKinder- und
 * Jugendhilfegesetzes" for the law's own name (126/ME § 9), and the dot run,
 * judged by its spelling instead of by its length, which hid 660 omissions
 * and invented changes on rows that omit on one side only. Neither breaks an
 * invariant a unit test states, and both are true of a handful of texts in a
 * corpus of fifty thousand — the tests stayed green through both. What found
 * them was this comparison: write down what today's code makes of a corpus,
 * change the code, look at what moved.
 *
 * ALIGNMENT AND DISPLAY ARE REPORTED APART, because that is the distinction
 * the two bugs turned on. A fold that moves a word BOUNDARY (leader dots, the
 * space in front of `.,;:`) has to move both arrays and may be shown; a fold
 * that rewrites a word without moving a boundary (the inner hyphen) belongs
 * in the alignment array alone and must never reach the display. So the
 * baseline carries a hash of each and the report says which one moved: a
 * change that moves the display alone is a rendering decision, one that moves
 * the alignment alone is a judgement decision, and one that moves both is
 * either a boundary fold or a mistake.
 *
 * NOT A GATE. It reports movement, it never fails — every intended change
 * moves something, and the size and shape of that movement is the whole
 * point. The scheduled watcher over verdicts is `scripts/ci/annexDrift.ts`.
 *
 * THE CORPUS IS WHAT IS ALREADY ON DISK, so a run costs seconds and can be
 * repeated after every edit:
 *   · `.cache/novao/xml/*.xml` — 300 drafts' Gesetzestext as single texts,
 *     which is where the token forms are exercised broadest (`corpus:novao`).
 *   · `.cache/erl-diff/<GP>/` — the Erläuterungen of draft and Vorlage, paired
 *     per § the way `explanations/reasoningDiff.ts` pairs them (`corpus:erl-diff`).
 *   · the Textgegenüberstellungen of RIS, `--annex=N` drafts of them, read
 *     through the harness cache. These are the pairs both of today's findings
 *     came from: two columns of law text, amount tables and omission marks
 *     included. Cold they cost one request each, warm they cost nothing.
 * Pairs that a content measurement would throw out stay in (an Erläuterungen
 * pair whose two sides are different laws, a row whose § is ambiguous): this
 * measures whether the forms are STABLE, not what they say, and a mismatched
 * pair exercises the tokenizer exactly as well as a matched one.
 *
 * Usage:
 *   pnpm harness:segments -- --record    # BEFORE the change
 *   pnpm harness:segments --             # after it: what moved?
 *   Options: --baseline=<file> (default .cache/segments-baseline.json)
 *            --annex=<n> (default 25, 0 skips) · --gp=XXVIII
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseTextComparison } from '../../server/utils/annex/comparisonRows'
import { isScanned } from '../../server/utils/annex/tableCells'
import { diffTokens, isAddressOnlyDifference, isEditorialChange } from '../../server/utils/diff/wordDiff'
import { parseExplanationsHtml, passagesByParagraph } from '../../server/utils/explanations/explanationsHtml'
import { draftArticles } from '../../server/utils/lawtext/draftArticles'
import { compareKey, compareToken, displayTokens } from '../../server/utils/lawtext/normalize'
import { parseRisXml } from '../../server/utils/lawtext/risXml'
import { argAssigned, argFlag } from '../lib/args'
import { pool } from '../lib/async'
import { installFetchCache } from '../lib/harnessCache'
import { getText } from '../lib/http'
import { asArray, pickTextComparisons } from '../lib/ris'

installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

const SCRIPT = 'harness/segments'
const NOVAO_DIR = join('.cache', 'novao')
const ERL_DIR = join('.cache', 'erl-diff')
const DEFAULT_BASELINE = join('.cache', 'segments-baseline.json')
/** Enough of a row to recognise it; a baseline is read by eye, not by machine. */
const SHOWN_CHARS = 220
const EXAMPLES = 5

const record = argFlag('record')
const gp = argAssigned('gp') ?? 'XXVIII'
const annexLimit = Number(argAssigned('annex') ?? 25)
const file = argAssigned('baseline') ?? argAssigned('out') ?? DEFAULT_BASELINE

type Segments = ReturnType<typeof diffTokens>['segments']

/** Short enough to read in a diff of the baseline, long enough not to collide. */
const hash = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 10)
/** `\u0000` because it cannot occur in the texts, so a join is a faithful key. */
const joined = (tokens: readonly string[]): string => tokens.join('\u0000')
const de = (n: number): string => n.toLocaleString('de')
const skippedNote = (skipped: Record<string, number>): string => {
  const parts = Object.entries(skipped).map(([reason, n]) => `${n} ${reason}`)
  return parts.length === 0 ? '' : ` (${parts.join(', ')})`
}

interface TextRecord {
  /** What the reader sees. */
  shown: string
  /** What the diff aligns on. */
  aligned: string
  /** What decides „geändert oder nicht". */
  key: string
  /** Tokens, so a mismatch can say whether a boundary moved. */
  n: number
}

interface PairRecord {
  /** The segment array — the diff as it is rendered. */
  segments: string
  /** Both sides' alignment arrays. */
  aligned: string
  /** `isEditorialChange` · `isAddressOnlyDifference` · `compareKey` equality. */
  verdicts: string
  /** The rendered diff, cut — so a moved row can be read, not just counted. */
  shown: string
}

interface Snapshot {
  recorded: string
  corpus: { files: number; texts: number; erlPairs: number; annexDrafts: number; pairs: number }
  /** File → one record per text, in document order. */
  texts: Record<string, TextRecord[]>
  /** Stable key → the four things a pair is judged by. */
  pairs: Record<string, PairRecord>
}

// ---------------------------------------------------------------------------
// The three forms, measured
// ---------------------------------------------------------------------------

function textRecord(text: string): TextRecord {
  const shown = displayTokens(text)
  // Never a different length than `shown`: `compareToken` folds inside a
  // token only. If that ever stops being true, the diff can no longer emit
  // one array while aligning on the other, and this is where it shows.
  const aligned = shown.map(compareToken)
  return { shown: hash(joined(shown)), aligned: hash(joined(aligned)), key: hash(compareKey(text)), n: shown.length }
}

/** The rendered diff: removed words in `[- -]`, inserted in `{+ +}`. */
function render(segments: Segments): string {
  if (segments === null) return '(ohne Segmente — über der DP-Grenze)'
  return segments
    .map((s) => (s.type === 'equal' ? s.text : s.type === 'removed' ? `[-${s.text}-]` : `{+${s.text}+}`))
    .join(' ')
    .slice(0, SHOWN_CHARS)
}

function pairRecord(a: string, b: string): PairRecord {
  const { segments } = diffTokens(a, b)
  const alignedA = joined(displayTokens(a).map(compareToken))
  const alignedB = joined(displayTokens(b).map(compareToken))
  const verdicts = [
    isEditorialChange(segments) ? 1 : 0,
    isAddressOnlyDifference(segments) ? 1 : 0,
    compareKey(a) === compareKey(b) ? 1 : 0,
  ].join('')
  return {
    segments: segments === null ? 'null' : hash(JSON.stringify(segments)),
    aligned: hash(`${alignedA}\u0001${alignedB}`),
    verdicts,
    shown: render(segments),
  }
}

// ---------------------------------------------------------------------------
// Corpus 1 — single texts from the drafts' Gesetzestext
// ---------------------------------------------------------------------------

/**
 * Every block of every cached draft XML, read by the reader that ships —
 * `parseRisXml`, the one the draft page and the engine use. A first version
 * stripped the markup and split at the newline and found 2.705 texts in 300
 * documents: RIS sets its XML on few long lines, so what that measured was
 * the source's line breaks. The shipped reader finds the blocks the product
 * actually shows.
 */
function draftTexts(): Map<string, string[]> {
  const dir = join(NOVAO_DIR, 'xml')
  const out = new Map<string, string[]>()
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.xml')).sort()) {
    const texts = parseRisXml(readFileSync(join(dir, name), 'utf8')).map((b) => b.text.trim()).filter(Boolean)
    if (texts.length > 0) out.set(name, texts)
  }
  return out
}

// ---------------------------------------------------------------------------
// Corpus 2 — Erläuterungen, draft against Vorlage, per §
// ---------------------------------------------------------------------------

interface Pair { key: string; a: string; b: string }

/* eslint-disable @typescript-eslint/no-explicit-any */

function explanationPairs(): { pairs: Pair[]; drafts: number } {
  const join81 = join(ERL_DIR, `${gp}-erl-diff.json`)
  if (!existsSync(join81)) return { pairs: [], drafts: 0 }
  const rows: any[] = JSON.parse(readFileSync(join81, 'utf8'))
  const pairs: Pair[] = []
  let drafts = 0
  for (const row of rows) {
    if (!row?.rv) continue
    const me = join(ERL_DIR, gp, `ME-${row.inr}-erl.html`)
    const rv = join(ERL_DIR, gp, `I-${row.rv}-erl.html`)
    if (!existsSync(me) || !existsSync(rv)) continue
    drafts++
    const left = passagesByParagraph(parseExplanationsHtml(readFileSync(me, 'utf8')))
    const right = passagesByParagraph(parseExplanationsHtml(readFileSync(rv, 'utf8')))
    for (const [para, passages] of [...left].sort(([x], [y]) => x.localeCompare(y))) {
      const other = right.get(para)
      if (!other) continue
      const a = passages.flatMap((p) => p.text).join(' ')
      const b = other.flatMap((p) => p.text).join(' ')
      if (!a.trim() && !b.trim()) continue
      pairs.push({ key: `erl:${row.inr}→${row.rv}:${para}`, a, b })
    }
  }
  return { pairs, drafts }
}

// ---------------------------------------------------------------------------
// Corpus 3 — the ressorts' own Textgegenüberstellung, row by row
// ---------------------------------------------------------------------------

/**
 * The list pages `corpus:novao` already wrote: they carry every document's
 * annex URL, so the drafts are chosen offline and only the annex itself is
 * fetched. Only drafts whose Gesetzestext is on disk qualify — the annex is
 * parsed against the draft's own Artikel list, and without it the row
 * boundaries of a Sammelnovelle are guesses (`annexBoundaries.ts`).
 */
function annexCandidates(): { id: string; cite: string; annexUrl: string; xml: string }[] {
  const out: { id: string; cite: string; annexUrl: string; xml: string }[] = []
  if (!existsSync(NOVAO_DIR)) return out
  for (const name of readdirSync(NOVAO_DIR).filter((f) => /^list-\d+\.json$/.test(f)).sort()) {
    const body: any = JSON.parse(readFileSync(join(NOVAO_DIR, name), 'utf8'))
    for (const ref of asArray<any>(body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference)) {
      const meta = ref?.Data?.Metadaten
      const id = String(meta?.Technisch?.ID ?? '')
      const xml = join(NOVAO_DIR, 'xml', `${id}.xml`)
      if (!id || !existsSync(xml)) continue
      const annex = pickTextComparisons(asArray<any>(ref?.Data?.Dokumentliste?.ContentReference), (c) => String(c?.Name ?? ''))[0]
      const url = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url
      if (!url) continue
      out.push({ id, cite: String(meta?.Bundesrecht?.Kurztitel ?? id).slice(0, 34), annexUrl: String(url), xml })
    }
  }
  return out
}

/**
 * Why a draft yielded nothing is counted, never swallowed: a corpus that
 * quietly shrinks between two runs is the one way this measurement can lie
 * (`scripts/lib/harnessCache.ts` carries the same lesson about inputs that
 * look sound). A scan and an unreachable document mean different things — the
 * first will never work, the second means the run was thinner than the
 * baseline it is compared against.
 */
type AnnexOutcome = { pairs: Pair[] } | { reason: 'Scan' | 'verweigert' | 'nicht erreichbar' }

async function annexPairs(limit: number): Promise<{ pairs: Pair[]; drafts: number; skipped: Record<string, number> }> {
  if (limit <= 0) return { pairs: [], drafts: 0, skipped: {} }
  const candidates = annexCandidates().slice(0, limit)
  const results = await pool(candidates, 4, async (c): Promise<AnnexOutcome> => {
    let annexXml: string
    try {
      annexXml = await getText(c.annexUrl, { script: SCRIPT, attempts: 2, timeoutMs: 30_000 })
    } catch {
      return { reason: 'nicht erreichbar' }
    }
    if (isScanned(annexXml)) return { reason: 'Scan' }
    const articles = draftArticles(parseRisXml(readFileSync(c.xml, 'utf8')))
    const parse = parseTextComparison(annexXml, articles)
    if (parse.refusal || parse.unreadable) return { reason: 'verweigert' }
    const pairs: Pair[] = []
    parse.rows.forEach((row, i) => {
      if (row.kind !== 'pair') return
      const a = row.current ?? ''
      const b = row.proposed ?? ''
      if (!a.trim() && !b.trim()) return
      pairs.push({ key: `tgü:${c.id}:${String(i).padStart(4, '0')}`, a, b })
    })
    return { pairs }
  })
  const skipped: Record<string, number> = {}
  for (const r of results) if ('reason' in r) skipped[r.reason] = (skipped[r.reason] ?? 0) + 1
  return {
    pairs: results.flatMap((r) => ('pairs' in r ? r.pairs : [])),
    drafts: results.filter((r) => 'pairs' in r).length,
    skipped,
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const texts = draftTexts()
const erl = explanationPairs()
const annex = await annexPairs(annexLimit)
const allPairs = [...erl.pairs, ...annex.pairs]

if (texts.size === 0 && allPairs.length === 0) {
  console.error('Kein Korpus auf der Platte. `pnpm corpus:novao` und `pnpm corpus:erl-diff` füllen ihn.')
  process.exit(2)
}

const snapshot: Snapshot = {
  recorded: new Date().toISOString(),
  corpus: {
    files: texts.size,
    texts: [...texts.values()].reduce((n, t) => n + t.length, 0),
    erlPairs: erl.pairs.length,
    annexDrafts: annex.drafts,
    pairs: allPairs.length,
  },
  texts: Object.fromEntries([...texts].map(([name, list]) => [name, list.map(textRecord)])),
  pairs: Object.fromEntries(allPairs.map((p) => [p.key, pairRecord(p.a, p.b)])),
}

const corpusLine = [
  `${de(snapshot.corpus.files)} Entwurfs-XML · ${de(snapshot.corpus.texts)} Texte`,
  `${de(erl.drafts)} ME→RV-Paare der Erläuterungen · ${de(erl.pairs.length)} §-Passagen`,
  `${de(annex.drafts)} Beilagen · ${de(annex.pairs.length)} Zeilenpaare${skippedNote(annex.skipped)}`,
].join(' | ')

if (record) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(snapshot, null, 1)}\n`)
  console.log(`Grundlinie geschrieben: ${file}`)
  console.log(`  ${corpusLine}`)
  console.log(`  Größe: ${(JSON.stringify(snapshot).length / 1024 / 1024).toFixed(1)} MB`)
  process.exit(0)
}

if (!existsSync(file)) {
  console.error(`Keine Grundlinie unter ${file}. Vor der Änderung: pnpm harness:segments -- --record`)
  process.exit(2)
}
const base: Snapshot = JSON.parse(readFileSync(file, 'utf8'))

// --- single texts ----------------------------------------------------------
let checkedTexts = 0
let shownMoved = 0
let alignedMoved = 0
let keyMoved = 0
let boundaryMoved = 0
let missingFiles = 0
let newFiles = 0
let resizedFiles = 0
const textExamples: string[] = []

for (const [name, list] of texts) {
  const before = base.texts[name]
  if (!before) { newFiles++; continue }
  if (before.length !== list.length) { resizedFiles++; continue }
  list.forEach((text, i) => {
    const now = textRecord(text)
    const then = before[i]!
    checkedTexts++
    const movedShown = now.shown !== then.shown
    const movedAligned = now.aligned !== then.aligned
    if (movedShown) shownMoved++
    if (movedAligned) alignedMoved++
    if (now.key !== then.key) keyMoved++
    if (now.n !== then.n) boundaryMoved++
    if ((movedShown || movedAligned) && textExamples.length < EXAMPLES) {
      const what = movedShown && movedAligned ? 'Anzeige+Ausrichtung' : movedShown ? 'nur Anzeige' : 'nur Ausrichtung'
      textExamples.push(`${name} #${i} (${what}, ${then.n}→${now.n} Token): ${JSON.stringify(text.slice(0, 160))}`)
    }
  })
}
for (const name of Object.keys(base.texts)) if (!texts.has(name)) missingFiles++

// --- pairs -----------------------------------------------------------------
let checkedPairs = 0
let segmentsMoved = 0
let pairAlignMoved = 0
let displayOnly = 0
let editorialFlips = 0
let addressFlips = 0
let toEqual = 0
let toChanged = 0
let missingPairs = 0
let newPairs = 0
const pairExamples: string[] = []
const verdictExamples: string[] = []

for (const pair of allPairs) {
  const then = base.pairs[pair.key]
  if (!then) { newPairs++; continue }
  const now = pairRecord(pair.a, pair.b)
  checkedPairs++
  const movedSegments = now.segments !== then.segments
  const movedAlign = now.aligned !== then.aligned
  if (movedSegments) segmentsMoved++
  if (movedAlign) pairAlignMoved++
  if (movedSegments && !movedAlign) displayOnly++
  if (now.verdicts[0] !== then.verdicts[0]) editorialFlips++
  if (now.verdicts[1] !== then.verdicts[1]) addressFlips++
  if (now.verdicts[2] !== then.verdicts[2]) {
    if (now.verdicts[2] === '1') toEqual++
    else toChanged++
    if (verdictExamples.length < EXAMPLES) {
      verdictExamples.push(`${pair.key}: ${then.verdicts[2] === '1' ? 'gleich → geändert' : 'geändert → gleich'}\n      alt: ${then.shown}\n      neu: ${now.shown}`)
    }
  }
  if (movedSegments && pairExamples.length < EXAMPLES) {
    pairExamples.push(`${pair.key} (${movedAlign ? 'Ausrichtung mitbewegt' : 'nur Anzeige'})\n      alt: ${then.shown}\n      neu: ${now.shown}`)
  }
}
const seen = new Set(allPairs.map((p) => p.key))
for (const key of Object.keys(base.pairs)) if (!seen.has(key)) missingPairs++

// --- report ----------------------------------------------------------------
console.log(`Grundlinie vom ${base.recorded.slice(0, 16).replace('T', ' ')} · ${file}`)
console.log(`Korpus jetzt: ${corpusLine}`)
if (missingFiles || newFiles || resizedFiles || missingPairs || newPairs) {
  console.log(`\n⚠ Korpus bewegt: ${missingFiles} Dateien fehlen, ${newFiles} sind neu, ${resizedFiles} haben eine andere Textzahl, ${missingPairs} Paare fehlen, ${newPairs} sind neu.`)
  console.log('  Diese Einheiten sind aus dem Vergleich heraus — bewegt hat sich nur, was unten steht.')
}

console.log(`\nA — Einzeltexte (${de(checkedTexts)} verglichen)`)
console.log(`   Anzeige (displayTokens) bewegt:     ${de(shownMoved)}`)
console.log(`   Ausrichtung (compareToken) bewegt:  ${de(alignedMoved)}`)
console.log(`   Gleichheitsform (compareKey) bewegt: ${de(keyMoved)}`)
console.log(`   davon mit verschobener Wortgrenze:  ${de(boundaryMoved)}`)
for (const e of textExamples) console.log(`     · ${e}`)

console.log(`\nB — Paare (${de(checkedPairs)} verglichen)`)
console.log(`   Segmente bewegt: ${de(segmentsMoved)} · davon nur Anzeige: ${de(displayOnly)} · Ausrichtung mitbewegt: ${de(pairAlignMoved)}`)
console.log(`   isEditorialChange: ${de(editorialFlips)} Kippen · isAddressOnlyDifference: ${de(addressFlips)} Kippen`)
console.log(`   compareKey-Gleichheit: ${de(toEqual + toChanged)} Kippen (geändert→gleich ${de(toEqual)}, gleich→geändert ${de(toChanged)})`)
for (const e of pairExamples) console.log(`     · ${e}`)
if (verdictExamples.length > 0) {
  console.log('\n   Gekippte Gleichheit im Wortlaut:')
  for (const e of verdictExamples) console.log(`     · ${e}`)
}

const moved = shownMoved + alignedMoved + keyMoved + segmentsMoved + editorialFlips + addressFlips + toEqual + toChanged
console.log(`\n${moved === 0 ? 'Nichts bewegt.' : `Bewegt: ${de(moved)} Befunde über ${de(checkedTexts + checkedPairs)} Einheiten.`} Kein Urteil — die Bewertung steht im Commit.`)
