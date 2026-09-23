#!/usr/bin/env vite-node
/**
 * Finds the laws that were in Begutachtung as a Ministerialentwurf and then
 * arrived in the House as a selbständiger Antrag — by the GESETZESTEXT, not
 * by the title.
 *
 * Usage:   npx vite-node scripts/corpus/meAntragJoin.ts XXVIII [cacheDir]
 *          (assumes corpus/begutachtungSkipped.ts has run for the same GP —
 *           its `<GP>-skipped.json` is the input.)
 *
 * Result: `<cacheDir>/<GP>-me-antrag.json`. `corpus/begutachtungSkipped.ts`
 * reads the file when it is there and replaces its own title match with it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCRIPT EXISTS
 *
 * A ressort can put a draft through Begutachtung and then have its own MPs
 * file it as an Initiativantrag instead of a Regierungsvorlage. The law WAS
 * in Begutachtung then. Whoever does not take that out counts too many laws
 * as „ohne Begutachtung" — Parliament's Rechts-, Legislativ- und
 * Wissenschaftlicher Dienst described the route in 2024 (Fachdossier
 * 31.10.2024: 19 of the 93 motions of one session;
 * `docs/begutachtung-uebersprungen.md` §4b).
 *
 * In the data this route does not exist. A Ministerialentwurf's `stages` do
 * carry a successor pointer, but measured over GP XXVIII all 96 pointers
 * present point at a Regierungsvorlage and not one at a motion. Nor does the
 * motion's own text name its draft (checked against four known pairs,
 * 16.09.2026).
 *
 * WHY NOT BY THE TITLE: measured over 91 pairs that demonstrably belong
 * together, a quarter falls below any usable threshold — „Einkommensteuer-
 * gesetz, Änderung" is worthless as a key, and over the large corpus the same
 * title produces false pairs by the hundred.
 *
 * WHAT INSTEAD: both sides publish a document „Gesetzestext". 5-word shingles
 * of it are compared, and by CONTAINMENT — the share of the shorter text that
 * sits inside the longer one. Not by Jaccard: a motion often lifts only a
 * piece out of a large draft, and Jaccard punishes the size ratio so hard
 * that a fully contained motion lands below every threshold (see the comment
 * at `containment`).
 *
 * The threshold is not guessed but calibrated: against pairs with a
 * documented link (draft → its own Regierungsvorlage), against ARTIFICIALLY
 * ASYMMETRIC pairs built from those, and against shifted false pairs. Where
 * no separating threshold is found, the script delivers no result.
 *
 * It reports in two steps: „belegt" (containment ≥ 0,6) carries the
 * correction, „schwach" is named as a range. The boundary is read off a gap
 * in the data, not chosen.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PARLIAMENT as BASE, getJson, getText } from '../lib/http'
import { cachedJson, cachedText } from '../lib/diskCache'
import { pool } from '../lib/async'
import type { MeAntragHit, SkippedReport, SkippedRow } from '../lib/skippedReport'

const SCRIPT = 'corpus/meAntragJoin'
const CONCURRENCY = 4
const SHINGLE = 5
/* No sketch any more (1 = keep everything). The mod sketch was meant to save
 * memory, but Initiativanträge are short — half the corpus is under 250
 * words, and at 1/16 nothing judgeable is left of 250 words. At 1/4, 36 of
 * 64 motions were „zu kurz für ein Urteil", which would have turned the
 * measurement into an assumption. Full shingles cost a few hundred MB for
 * the largest GP and solve the problem entirely. The mechanism stays in
 * place in case a corpus does grow too large one day. */
const SKETCH_MOD = 1
/* Below this number of shingles (~64 words) nothing is judged; the report
 * says the text is too short instead: a dozen shingles are always
 * „enthalten" in some Gesetzestext or other. */
const MIN_SKETCH = 60

const gp = process.argv[2] ?? ''
if (!gp || !/^[IVXLC]+$/.test(gp)) {
  console.error('Usage: npx vite-node scripts/corpus/meAntragJoin.ts <GP, e.g. XXVIII> [cacheDir]')
  process.exit(1)
}
const cacheDir = process.argv[3] ?? join('.cache', 'begutachtung-skipped')
await mkdir(join(cacheDir, gp, 'text'), { recursive: true })

/** Three attempts on 5xx and a dropped connection; a 4xx is the answer and is not retried. */
const RETRY = { script: SCRIPT, attempts: 3, backoffMs: (retry: number) => 500 * retry, timeoutMs: 20_000 } as const
function fetchJson<T>(url: string, body?: unknown): Promise<T> {
  return getJson<T>(url, { ...RETRY, ...(body === undefined ? {} : { method: 'POST' as const, body }) })
}
const fetchText = (url: string): Promise<string> => getText(url, RETRY)

// ---------------------------------------------------------------------------
// Text → sketch
// ---------------------------------------------------------------------------

/* Words and Paragraph signs only. Numbers stay in: amounts and dates are
 * what tells two Novellen to the same law apart. HTML entities are removed,
 * not decoded — both sides come from the same source and are encoded
 * alike. */
function plainText(html: string): string {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#?[a-z0-9]+;/gi, ' ')
    .replace(/[^A-Za-zÄÖÜäöüß0-9§ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
}

/** FNV-1a, 32 bit. No cryptographic need, just spread. */
function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

type Sketch = Set<number>

function sketch(text: string): Sketch {
  const words = text.split(' ')
  const out = new Set<number>()
  for (let i = 0; i + SHINGLE <= words.length; i++) {
    const h = hash32(words.slice(i, i + SHINGLE).join(' '))
    if (h % SKETCH_MOD === 0) out.add(h)
  }
  return out
}

function shared(a: Sketch, b: Sketch): number {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a]
  let n = 0
  for (const x of small) if (big.has(x)) n++
  return n
}

function jaccard(a: Sketch | null | undefined, b: Sketch | null | undefined): number {
  if (!a?.size || !b?.size) return 0
  return shared(a, b) / (a.size + b.size - shared(a, b))
}

/* WHY NOT JACCARD — the mistake of 16.09.2026.
 *
 * An Initiativantrag often lifts a piece out of a large draft: 72/A has 570
 * words, the matching 6/ME has 11.934. Even where the motion sits fully
 * inside the draft, Jaccard can then reach at most 570/11.934 ≈ 4,8 % —
 * below any sensible threshold. That is exactly how 72/A failed despite an
 * identical title; the containment measure says 95 %.
 *
 * The calibration could not see it: true pairs were a draft against its OWN
 * Regierungsvorlage, and those are roughly the same length. So it was
 * calibrated on a population that lacks the decisive property. Hence the
 * artificially asymmetric pairs below as well.
 *
 * Containment is not symmetrically harmless: a very short text is quickly
 * „enthalten". MIN_SKETCH answers that. */
function containment(a: Sketch | null | undefined, b: Sketch | null | undefined): number {
  if (!a?.size || !b?.size) return 0
  return shared(a, b) / Math.min(a.size, b.size)
}

// ---------------------------------------------------------------------------
// 1. Corpus
// ---------------------------------------------------------------------------

const skippedFile = join(cacheDir, `${gp}-skipped.json`)
let skippedData: SkippedReport
try { skippedData = JSON.parse(await readFile(skippedFile, 'utf8')) as SkippedReport } catch {
  console.error(`Fehlt: ${skippedFile}\nZuerst laufen lassen: npx vite-node scripts/corpus/begutachtungSkipped.ts ${gp}`)
  process.exit(1)
}
const antraege = skippedData.rows.filter((r) => !r.consulted && !r.exemptReason && r.ityp === 'A')

interface ListRows { rows?: unknown[][] }

const meList = await cachedJson<ListRows>(join(cacheDir, gp, 'list81.json'), () =>
  fetchJson(`${BASE}/Filter/api/filter/data/81?js=eval&showAll=true`, { GP_CODE: [gp] }))

console.error(`GP ${gp}: ${antraege.length} übersprungene Initiativanträge, ${(meList.rows ?? []).length} Ministerialentwürfe.`)

/** A Gegenstand's detail JSON; shares the cache with corpus/begutachtungSkipped.ts. */
interface Detail {
  content?: {
    title?: string
    einlangen?: string
    stages?: { text?: string }[]
    documents?: { title?: string; documents?: { type?: string; link?: string }[] }[]
  }
}
const detailOf = (ityp: string, inr: string): Promise<Detail> => cachedJson<Detail>(
  join(cacheDir, gp, `${ityp}-${inr}.json`),
  () => fetchJson(`${BASE}/gegenstand/${gp}/${ityp}/${inr}?json=True`),
)

/** The HTML version of the Gesetzestext. Both sides carry a group of that
 *  name ("Gesetzestext", on the motion "Gesetzestext (Arbeitsdokument
 *  ParlDion)"). Erläuterungen and Textgegenüberstellung stay out: they are of
 *  different length on the two sides and only dilute. */
function gesetzestextLink(detail: Detail): string | null {
  const groups = detail?.content?.documents ?? []
  const preferred = groups.find((g) => /^Gesetzestext/i.test(String(g?.title ?? '')))
  const group = preferred ?? groups.find((g) => /Initiativantrag|Entwurf|Vorlage/i.test(String(g?.title ?? '')))
  return (group?.documents ?? []).find((d) => d?.type === 'HTML')?.link ?? null
}

function textOf(ityp: string, inr: string): Promise<string> {
  return cachedText(join(cacheDir, gp, 'text', `${ityp}-${inr}.txt`), async () => {
    const link = gesetzestextLink(await detailOf(ityp, inr))
    return link ? plainText(await fetchText(BASE + link)) : ''
  })
}

async function sketchOf(ityp: string, inr: string): Promise<Sketch | null> {
  const text = await textOf(ityp, inr)
  return text.length > 200 ? sketch(text) : null
}

// ---------------------------------------------------------------------------
// 2. Calibration against pairs whose truth is known
// ---------------------------------------------------------------------------

/* True pairs: a Ministerialentwurf and the Regierungsvorlage its own
 * successor pointer names. That is the same textual relation as the one we
 * are after (consulted draft → the version filed), only documented. */
interface MeRow {
  inr: string
  title: string
  start: string | null
  frist: string | null
  rv: string | null
}
const meInrs = (meList.rows ?? []).map((r) => String(r[2]))
console.error(`Lese ${meInrs.length} Ministerialentwurf-Details …`)
const mes: MeRow[] = await pool(meInrs, CONCURRENCY, async (inr) => {
  const c = (await detailOf('ME', inr))?.content ?? {}
  const stages = Array.isArray(c.stages) ? c.stages : []
  let frist: string | null = null
  for (const s of stages) {
    const m = /Ende der Begutachtungsfrist\s+(\d{2})\.(\d{2})\.(\d{4})/.exec(String(s.text ?? ''))
    if (m) frist = `${m[3]}-${m[2]}-${m[1]}`
  }
  const rv = stages.flatMap((s) => [...String(s.text ?? '').matchAll(/\/gegenstand\/[IVXLC]+\/I\/(\d+)/g)].map((m) => m[1]!))[0] ?? null
  return { inr, title: c.title ?? '', start: String(c.einlangen ?? '').slice(0, 10) || null, frist, rv }
})

const pairs = mes.filter((m): m is MeRow & { rv: string } => Boolean(m.rv))
console.error(`Lade Gesetzestexte: ${mes.length} Entwürfe, ${antraege.length} Anträge, ${pairs.length} Regierungsvorlagen …`)

const meSketch = new Map<string, Sketch | null>()
await pool(mes, CONCURRENCY, async (m) => meSketch.set(m.inr, await sketchOf('ME', m.inr)))
const aSketch = new Map<string, Sketch | null>()
await pool(antraege, CONCURRENCY, async (a) => aSketch.set(a.inr, await sketchOf('A', a.inr)))
const rvSketch = new Map<string, Sketch | null>()
await pool(pairs, CONCURRENCY, async (m) => rvSketch.set(m.rv, await sketchOf('I', m.rv)))

/* Formulaic language out. Gesetzestexte share building blocks — „tritt mit
 * dem der Kundmachung folgenden Tag in Kraft", „in der Fassung des
 * Bundesgesetzes BGBl. I Nr." — and at a window five words wide those produce
 * a small but reliable overlap between any two texts whatsoever. The first
 * run (16.09.2026) pinned four different motions to the same draft on that
 * basis, all at 3 % coverage. So: discard every shingle that occurs in more
 * than DF_MAX of the documents — the usual IDF cut, here as a hard boundary
 * instead of a weight, because a threshold follows after it. */
const DF_MAX = 0.02
const allSketches = [...meSketch.values(), ...aSketch.values(), ...rvSketch.values()].filter((s): s is Sketch => Boolean(s))
const df = new Map<number, number>()
for (const s of allSketches) for (const h of s) df.set(h, (df.get(h) ?? 0) + 1)
const dfLimit = Math.max(2, Math.ceil(allSketches.length * DF_MAX))
let dropped = 0
for (const s of allSketches) for (const h of [...s]) if ((df.get(h) ?? 0) > dfLimit) { s.delete(h); dropped++ }
console.error(`Formelfilter: ${df.size} verschiedene Schindeln, ` +
  `${[...df.values()].filter((n) => n > dfLimit).length} kommen in mehr als ${dfLimit} Dokumenten vor und fliegen raus ` +
  `(${dropped} Vorkommen).`)

const truth: number[] = []
for (const m of pairs) {
  const s = containment(meSketch.get(m.inr), rvSketch.get(m.rv))
  if (s > 0) truth.push(s)
}

/* ARTIFICIALLY ASYMMETRIC TRUE PAIRS — the population missing at the first
 * attempt. A contiguous tenth is cut out of every Regierungsvorlage and held
 * against the matching draft: the same size ratio as „kurzer Antrag hebt ein
 * Stück aus großem Entwurf". Where the measure fails here, it is no good for
 * the actual purpose. */
const truthAsym: number[] = []
for (const m of pairs) {
  const text = await textOf('I', m.rv)
  const words = text.split(' ')
  if (words.length < 500) continue
  const cut = Math.max(200, Math.floor(words.length * 0.1))
  const start = Math.floor(words.length * 0.3)
  const piece = sketch(words.slice(start, start + cut).join(' '))
  for (const h of [...piece]) if ((df.get(h) ?? 0) > dfLimit) piece.delete(h)
  if (piece.size < MIN_SKETCH) continue
  truthAsym.push(containment(meSketch.get(m.inr), piece))
}

/* False pairs: the same draft against another one's Regierungsvorlage.
 * Shifted deterministically rather than at random, so the run repeats. */
const noise: number[] = []
for (let i = 0; i < pairs.length; i++) {
  const other = pairs[(i + 7) % pairs.length]!
  if (other.rv === pairs[i]!.rv) continue
  const s = containment(meSketch.get(pairs[i]!.inr), rvSketch.get(other.rv))
  noise.push(s)
}
truth.sort((a, b) => a - b); noise.sort((a, b) => a - b); truthAsym.sort((a, b) => a - b)
const q = (arr: readonly number[], p: number): number => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]! : NaN)

const trueLow = q(truth, 0.05)
const noiseHigh = q(noise, 0.95)
console.log(`\n=== Kalibrierung (GP ${gp}) — Maß: Containment des kleineren Texts ===`)
console.log(`Wahre Paare (Entwurf → eigene Regierungsvorlage): ${truth.length}`)
console.log(`  5 % ${trueLow.toFixed(3)}  Median ${q(truth, 0.5).toFixed(3)}  95 % ${q(truth, 0.95).toFixed(3)}`)
console.log(`Wahre Paare, künstlich asymmetrisch (Zehntel der Vorlage): ${truthAsym.length}`)
console.log(`  5 % ${q(truthAsym, 0.05).toFixed(3)}  Median ${q(truthAsym, 0.5).toFixed(3)}  95 % ${q(truthAsym, 0.95).toFixed(3)}`)
console.log(`Falsche Paare (versetzt): ${noise.length}`)
console.log(`  Median ${q(noise, 0.5).toFixed(4)}  95 % ${noiseHigh.toFixed(4)}  max ${noise.at(-1)?.toFixed(4)}`)

/* The threshold is set for PRECISION, not for completeness. A false hit
 * claims of a law named by name that it went through Begutachtung; a missed
 * one only leaves the number too high. So: well above the worst false pair,
 * and never below an absolute floor — two per cent of text coverage is
 * evidence for nothing, even where the corpus happens to offer nothing worse.
 *
 * What that costs stands below it: the share of the known true pairs the
 * threshold lets through. True pairs with low coverage really do exist — a
 * draft can be rewritten between Begutachtung and filing — and this method
 * does not find those, in principle. */
const FLOOR = 0.25
const threshold = Math.max(FLOOR, (noise.at(-1) ?? 0) * 3)
const recall = truth.filter((s) => s >= threshold).length / Math.max(truth.length, 1)
const recallAsym = truthAsym.filter((s) => s >= threshold).length / Math.max(truthAsym.length, 1)
const falsePos = noise.filter((s) => s >= threshold).length
console.log(`Schwelle: ${threshold.toFixed(3)} (Boden ${FLOOR}, 3× schlechtestes falsches Paar)`)
console.log(`  fängt ${(recall * 100).toFixed(0)} % der wahren Paare, ${(recallAsym * 100).toFixed(0)} % der asymmetrischen,`)
console.log(`  und ${falsePos} der ${noise.length} falschen.`)
if (falsePos > 0) console.log(`  ACHTUNG: falsche Paare über der Schwelle — Ergebnis nur als Kandidatenliste lesen.`)
/* The asymmetric rate is a lower bound, not a defect: the tenth cut out can
 * contain material that reached the Vorlage only AFTER the Begutachtung — and
 * then zero is the right answer. Hence a note, not an alarm. */
console.log(`  (Die asymmetrische Quote ist eine Untergrenze: manche Ausschnitte enthalten Material,`)
console.log(`   das erst nach der Begutachtung dazukam — dort ist das Nichtfinden korrekt.)`)

/* TWO STEPS, and the boundary is not chosen but read off: in GP XXVIII the
 * hits sit at 29–35 % and then again at 77–100 %. In between there is
 * nothing. What lies above is a continuation; what lies below shares passages
 * with the draft without being its continuation — typically another Novelle
 * to the same law. Only the strong step goes into the correction, the weak
 * one is reported as a range. */
const STRONG = 0.6

// ---------------------------------------------------------------------------
// 3. The match itself
// ---------------------------------------------------------------------------

const hits: MeAntragHit[] = []
const zuKurz: (SkippedRow & { sketchSize: number })[] = []
for (const a of antraege) {
  const as = aSketch.get(a.inr)
  const when = String(a.einlangen ?? a.date).slice(0, 10)
  if (!as || as.size < MIN_SKETCH) { zuKurz.push({ ...a, sketchSize: as?.size ?? 0 }); continue }
  const candidates = mes
    .filter((m) => m.start && m.start < when && (meSketch.get(m.inr)?.size ?? 0) >= MIN_SKETCH)
    .map((m) => ({ me: m, score: containment(as, meSketch.get(m.inr)), jac: jaccard(as, meSketch.get(m.inr)) }))
    .filter((x) => x.score >= threshold)
    .sort((x, y) => y.score - x.score)
  if (!candidates.length) continue
  const best = candidates[0]!
  hits.push({
    citation: a.citation, inr: a.inr, title: a.title, bgbl: a.bgbl,
    einlangen: when, kind: a.kind ?? null,
    meInr: best.me.inr, meTitle: best.me.title, meStart: best.me.start, meFrist: best.me.frist,
    meBecameRv: Boolean(best.me.rv),
    score: Number(best.score.toFixed(3)),
    jaccard: Number(best.jac.toFixed(3)),
    strong: best.score >= STRONG,
    titleIdentical: a.title.trim() === best.me.title.trim(),
    fristOffen: Boolean(best.me.frist && when <= best.me.frist),
    weitereKandidaten: candidates.length - 1,
  })
}
hits.sort((a, b) => a.einlangen.localeCompare(b.einlangen))

const stark = hits.filter((h) => h.strong)
console.log(`\n=== Treffer: ${stark.length} belegt, ${hits.length - stark.length} schwach, von ${antraege.length} Initiativanträgen ===`)
console.log(`(belegt = Containment ≥ ${STRONG}; die Lücke in den Daten liegt zwischen ` +
  `${Math.max(...hits.filter((h) => !h.strong).map((h) => h.score), 0).toFixed(2)} und ` +
  `${Math.min(...stark.map((h) => h.score), 1).toFixed(2)})`)
if (zuKurz.length) {
  console.log(`(${zuKurz.length} Anträge zu kurz für ein Urteil — unter ${MIN_SKETCH} Schindeln, ~250 Wörter.`)
  console.log(` Sie zählen weiter als „ohne Begutachtung", aber das ist eine Annahme, keine Messung:`)
  console.log(` ${zuKurz.slice(0, 8).map((z) => z.citation).join(', ')}${zuKurz.length > 8 ? ' …' : ''})`)
}
for (const h of hits) {
  console.log(`  ${h.einlangen}  ${String(h.citation).padEnd(9)} ${h.title}`)
  console.log(`      ← ${h.meInr}/ME ab ${h.meStart}, Frist bis ${h.meFrist ?? '—'}  Containment ${(h.score * 100).toFixed(1)} %` +
    ` (Jaccard ${(h.jaccard * 100).toFixed(1)} %)` +
    `${h.titleIdentical ? '' : '  [Titel weicht ab]'}${h.meBecameRv ? '  [Entwurf wurde auch Regierungsvorlage]' : ''}` +
    `${h.fristOffen ? '  ⚠ Antrag eingebracht, WÄHREND die Frist lief' : ''}`)
}

const outFile = join(cacheDir, `${gp}-me-antrag.json`)
await writeFile(outFile, JSON.stringify({
  gp,
  measuredAt: new Date().toISOString().slice(0, 10),
  method: { shingle: SHINGLE, sketchMod: SKETCH_MOD, threshold: Number(threshold.toFixed(4)) },
  calibration: {
    measure: 'containment',
    truePairs: truth.length, trueP05: Number(trueLow.toFixed(4)), trueMedian: Number(q(truth, 0.5).toFixed(4)),
    asymPairs: truthAsym.length, asymP05: Number((q(truthAsym, 0.05) || 0).toFixed(4)), asymRecall: Number(recallAsym.toFixed(3)),
    noisePairs: noise.length, noiseP95: Number(noiseHigh.toFixed(4)), noiseMax: Number((noise.at(-1) ?? 0).toFixed(4)),
    recall: Number(recall.toFixed(3)), falsePositives: falsePos,
  },
  antraegeGeprueft: antraege.length,
  antraegeZuKurz: zuKurz.length,
  zuKurz: zuKurz.map((z) => ({ citation: z.citation, title: z.title, sketchSize: z.sketchSize })),
  treffer: hits.length,
  trefferBelegt: stark.length,
  strongThreshold: STRONG,
  hits,
}, null, 1))
console.log(`\nErgebnis: ${outFile}`)
console.log(`Wird von corpus/begutachtungSkipped.ts gelesen, sobald die Datei da ist.`)
