#!/usr/bin/env vite-node
/**
 * Findet die Gesetze, die als Ministerialentwurf in Begutachtung waren und
 * danach als selbständiger Antrag ins Haus kamen — über den GESETZESTEXT,
 * nicht über den Titel.
 *
 * Usage:   npx vite-node scripts/corpus/meAntragJoin.ts XXVIII [cacheDir]
 *          (setzt voraus, dass corpus/begutachtungSkipped.ts für dieselbe GP
 *           gelaufen ist — dessen `<GP>-skipped.json` ist der Input.)
 *
 * Ergebnis: `<cacheDir>/<GP>-me-antrag.json`. `corpus/begutachtungSkipped.ts`
 * liest die Datei, wenn sie da ist, und ersetzt damit seinen eigenen
 * Titelabgleich.
 *
 * ---------------------------------------------------------------------------
 * WARUM ES DIESES SKRIPT GIBT
 *
 * Ein Ressort kann einen Entwurf begutachten lassen und ihn danach von den
 * eigenen Abgeordneten als Initiativantrag einbringen statt als
 * Regierungsvorlage. Das Gesetz WAR dann in Begutachtung. Wer das nicht
 * herausrechnet, zählt zu viele Gesetze als „ohne Begutachtung" — der
 * Rechts-, Legislativ- und Wissenschaftliche Dienst des Parlaments hat den
 * Weg 2024 beschrieben (Fachdossier 31.10.2024: 19 der 93 Anträge einer
 * Tagung; `docs/begutachtung-uebersprungen.md` §4b).
 *
 * In den Daten existiert dieser Weg nicht. Die `stages` eines
 * Ministerialentwurfs führen einen Nachfolger-Zeiger, aber gemessen auf GP
 * XXVIII zeigen alle 96 vorhandenen Zeiger auf eine Regierungsvorlage und
 * kein einziger auf einen Antrag. Auch der Antragstext selbst nennt seinen
 * Entwurf nicht (geprüft an vier bekannten Paaren, 16.09.2026).
 *
 * WARUM NICHT ÜBER DEN TITEL: gemessen an 91 Paaren, die nachweislich
 * zusammengehören, liegt ein Viertel unter jeder brauchbaren Schwelle —
 * „Einkommensteuergesetz, Änderung" ist als Schlüssel wertlos, und im großen
 * Korpus produziert derselbe Titel massenhaft falsche Paare.
 *
 * WAS STATTDESSEN: beide Seiten veröffentlichen ein Dokument „Gesetzestext".
 * Verglichen werden 5-Wort-Schindeln daraus, und zwar über CONTAINMENT — den
 * Anteil des kürzeren Textes, der im längeren steckt. Nicht über Jaccard: ein
 * Antrag hebt oft nur ein Stück aus einem großen Entwurf, und Jaccard
 * bestraft das Größenverhältnis so hart, dass ein vollständig enthaltener
 * Antrag unter jeder Schwelle landet (siehe den Kommentar bei `containment`).
 *
 * Die Schwelle wird nicht geraten, sondern kalibriert: an Paaren mit belegter
 * Zuordnung (Entwurf → seine eigene Regierungsvorlage), an KÜNSTLICH
 * ASYMMETRISCHEN Paaren daraus, und gegen versetzte falsche Paare. Findet
 * sich keine trennende Schwelle, liefert das Skript kein Ergebnis.
 *
 * Berichtet wird in zwei Stufen: „belegt" (Containment ≥ 0,6) trägt die
 * Korrektur, „schwach" wird als Spanne genannt. Die Grenze ist an einer
 * Lücke in den Daten abgelesen, nicht gewählt.
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
/* Keine Skizze mehr (1 = alles behalten). Die Mod-Skizze war für den
 * Speicher gedacht, aber Initiativanträge sind kurz — die Hälfte des Korpus
 * liegt unter 250 Wörtern, und aus 250 Wörtern bleibt bei 1/16 nichts
 * Beurteilbares übrig. Mit 1/4 waren 36 von 64 Anträgen „zu kurz für ein
 * Urteil", was die Messung zur Annahme gemacht hätte. Vollständige Schindeln
 * kosten für die größte GP wenige hundert MB und lösen das Problem ganz.
 * Der Mechanismus bleibt stehen, falls ein Korpus doch einmal zu groß wird. */
const SKETCH_MOD = 1
/* Unter dieser Zahl Schindeln (~64 Wörter) wird nicht geurteilt, sondern
 * berichtet, dass der Text zu kurz ist: ein Dutzend Schindeln ist in
 * irgendeinem Gesetzestext immer „enthalten". */
const MIN_SKETCH = 60

const gp = process.argv[2] ?? ''
if (!gp || !/^[IVXLC]+$/.test(gp)) {
  console.error('Usage: npx vite-node scripts/corpus/meAntragJoin.ts <GP, e.g. XXVIII> [cacheDir]')
  process.exit(1)
}
const cacheDir = process.argv[3] ?? join('.cache', 'begutachtung-skipped')
await mkdir(join(cacheDir, gp, 'text'), { recursive: true })

/** Drei Versuche auf 5xx und Verbindungsabbruch; ein 4xx ist die Antwort und wird nicht wiederholt. */
const RETRY = { script: SCRIPT, attempts: 3, backoffMs: (retry: number) => 500 * retry, timeoutMs: 20_000 } as const
function fetchJson<T>(url: string, body?: unknown): Promise<T> {
  return getJson<T>(url, { ...RETRY, ...(body === undefined ? {} : { method: 'POST' as const, body }) })
}
const fetchText = (url: string): Promise<string> => getText(url, RETRY)

// ---------------------------------------------------------------------------
// Text → Skizze
// ---------------------------------------------------------------------------

/* Nur Wörter und Paragraphenzeichen. Zahlen bleiben drin: Beträge und
 * Datumsangaben sind das Unterscheidende zwischen zwei Novellen zum selben
 * Gesetz. HTML-Entities werden entfernt, nicht dekodiert — beide Seiten
 * kommen aus derselben Quelle und sind gleich kodiert. */
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

/** FNV-1a, 32 bit. Kein Kryptobedarf, nur Streuung. */
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

/* WARUM NICHT JACCARD — der Fehler vom 16.09.2026.
 *
 * Ein Initiativantrag hebt oft ein Stück aus einem großen Entwurf heraus:
 * 72/A hat 570 Wörter, der zugehörige 6/ME 11.934. Selbst wenn der Antrag
 * vollständig im Entwurf steckt, kann Jaccard dann höchstens 570/11.934 ≈
 * 4,8 % erreichen — unter jeder sinnvollen Schwelle. Genau so ist 72/A trotz
 * identischem Titel durchgefallen; die Containment-Messung sagt 95 %.
 *
 * Die Kalibrierung konnte das nicht sehen: wahre Paare waren Entwurf gegen
 * die EIGENE Regierungsvorlage, und die sind ungefähr gleich lang. Kalibriert
 * wurde also an einer Population, der die entscheidende Eigenschaft fehlt.
 * Deshalb unten zusätzlich künstlich asymmetrische Paare.
 *
 * Containment ist nicht symmetrisch harmlos: ein sehr kurzer Text ist schnell
 * „enthalten". Dagegen MIN_SKETCH. */
function containment(a: Sketch | null | undefined, b: Sketch | null | undefined): number {
  if (!a?.size || !b?.size) return 0
  return shared(a, b) / Math.min(a.size, b.size)
}

// ---------------------------------------------------------------------------
// 1. Korpus
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

/** Detail-JSON eines Gegenstands; teilt den Cache mit corpus/begutachtungSkipped.ts. */
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

/** Die HTML-Fassung des Gesetzestexts. Beide Seiten führen eine Gruppe, die
 *  so heißt ("Gesetzestext", beim Antrag "Gesetzestext (Arbeitsdokument
 *  ParlDion)"). Erläuterungen und Textgegenüberstellung bleiben draußen:
 *  sie sind auf den beiden Seiten verschieden lang und verwässern nur. */
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
// 2. Kalibrierung an Paaren mit bekannter Wahrheit
// ---------------------------------------------------------------------------

/* Wahre Paare: ein Ministerialentwurf und die Regierungsvorlage, auf die sein
 * eigener Nachfolger-Zeiger verweist. Das ist dieselbe Textbeziehung wie die
 * gesuchte (begutachteter Entwurf → eingebrachte Fassung), nur mit Beleg. */
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

/* Formelsprache raus. Gesetzestexte teilen Bausteine — „tritt mit dem der
 * Kundmachung folgenden Tag in Kraft", „in der Fassung des Bundesgesetzes
 * BGBl. I Nr." — und bei fünf Wörtern Fensterbreite erzeugen die zwischen
 * je zwei beliebigen Texten eine kleine, aber verlässliche Überlappung. Der
 * erste Lauf (16.09.2026) hat daran vier verschiedene Anträge an denselben
 * Entwurf geheftet, alle bei 3 % Deckung. Also: jede Schindel verwerfen, die
 * in mehr als DF_MAX der Dokumente vorkommt — der übliche IDF-Schnitt, hier
 * als harte Grenze statt als Gewicht, weil danach noch eine Schwelle folgt. */
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

/* KÜNSTLICH ASYMMETRISCHE WAHRE PAARE — die Population, die im ersten Anlauf
 * gefehlt hat. Aus jeder Regierungsvorlage wird ein zusammenhängendes Zehntel
 * herausgeschnitten und gegen den zugehörigen Entwurf gehalten: dasselbe
 * Größenverhältnis wie „kurzer Antrag hebt ein Stück aus großem Entwurf".
 * Wenn das Maß hier durchfällt, taugt es für den eigentlichen Zweck nicht. */
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

/* Falsche Paare: derselbe Entwurf gegen die Regierungsvorlage eines anderen.
 * Deterministisch versetzt statt zufällig, damit der Lauf wiederholbar ist. */
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

/* Die Schwelle wird auf TREFFSICHERHEIT gestellt, nicht auf Vollständigkeit.
 * Ein falscher Treffer behauptet von einem namentlich genannten Gesetz, es
 * sei begutachtet worden; ein verpasster lässt die Zahl nur zu hoch. Also:
 * deutlich über das schlechteste falsche Paar, und nie unter einen absoluten
 * Boden — zwei Prozent Textdeckung sind kein Beleg für irgendetwas, auch
 * wenn der Korpus zufällig nichts Schlechteres hergibt.
 *
 * Was das kostet, steht darunter: der Anteil der bekannten wahren Paare, den
 * die Schwelle durchlässt. Wahre Paare mit niedriger Deckung gibt es wirklich
 * — ein Entwurf kann zwischen Begutachtung und Einbringung neu geschrieben
 * werden —, und die findet dieses Verfahren prinzipiell nicht. */
const FLOOR = 0.25
const threshold = Math.max(FLOOR, (noise.at(-1) ?? 0) * 3)
const recall = truth.filter((s) => s >= threshold).length / Math.max(truth.length, 1)
const recallAsym = truthAsym.filter((s) => s >= threshold).length / Math.max(truthAsym.length, 1)
const falsePos = noise.filter((s) => s >= threshold).length
console.log(`Schwelle: ${threshold.toFixed(3)} (Boden ${FLOOR}, 3× schlechtestes falsches Paar)`)
console.log(`  fängt ${(recall * 100).toFixed(0)} % der wahren Paare, ${(recallAsym * 100).toFixed(0)} % der asymmetrischen,`)
console.log(`  und ${falsePos} der ${noise.length} falschen.`)
if (falsePos > 0) console.log(`  ACHTUNG: falsche Paare über der Schwelle — Ergebnis nur als Kandidatenliste lesen.`)
/* Die asymmetrische Quote ist eine Untergrenze, kein Defekt: das
 * herausgeschnittene Zehntel kann Material enthalten, das erst NACH der
 * Begutachtung in die Vorlage kam — dann ist die Null die richtige Antwort.
 * Deshalb nur als Hinweis, nicht als Alarm. */
console.log(`  (Die asymmetrische Quote ist eine Untergrenze: manche Ausschnitte enthalten Material,`)
console.log(`   das erst nach der Begutachtung dazukam — dort ist das Nichtfinden korrekt.)`)

/* ZWEI STUFEN, und die Grenze ist nicht gewählt, sondern abgelesen: die
 * Treffer liegen in GP XXVIII bei 29–35 % und dann wieder bei 77–100 %.
 * Dazwischen ist nichts. Was oben liegt, ist eine Fortsetzung; was unten
 * liegt, teilt Passagen mit dem Entwurf, ohne seine Fortsetzung zu sein —
 * typischerweise eine andere Novelle zum selben Gesetz. Nur die starke
 * Stufe geht in die Korrektur, die schwache wird als Spanne berichtet. */
const STRONG = 0.6

// ---------------------------------------------------------------------------
// 3. Der eigentliche Abgleich
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
