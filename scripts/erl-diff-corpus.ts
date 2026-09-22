#!/usr/bin/env vite-node
/**
 * Ändert sich die Begründung des Ressorts zwischen Entwurf und
 * Regierungsvorlage? — die Messung, die das letzte offene Stück des
 * Diff-Layers gattert (`TODO.md`, docs/architecture.md §12.10).
 *
 * Usage:  npx vite-node scripts/erl-diff-corpus.ts XXVIII [anzahl] [cacheDir]
 *
 * WARUM ERST MESSEN. Ein zweiter Vergleichsabschnitt kostet eine Seite, einen
 * Endpunkt und eine Erklärung; er lohnt nur, wenn die beiden Dokumente
 * überhaupt auseinandergehen. Sind sie fast immer gleich, ist das Ergebnis
 * ein Satz in den Docs und kein Feature — dieselbe Reihenfolge wie beim
 * zweiten Verifikationssignal (§12.12b), wo ein halber Tag Messung ein
 * Paket erspart hat.
 *
 * BEIDE SEITEN VOM PARLAMENT, absichtlich. Die Erläuterungen des Entwurfs
 * lägen auch im RIS als typisiertes XML, die der Regierungsvorlage nicht.
 * Ein Vergleich XML gegen Word-HTML misst zuerst die beiden Konverter — die
 * Lehre aus der sechsten Messung in §12.12. Also dieselbe Quelle, derselbe
 * Parser (`parseParliamentHtml`), und was übrig bleibt, ist Inhalt.
 *
 * Der Join Entwurf → Regierungsvorlage ist der von `scripts/rv-latency.mjs`:
 * die Verfahrensschritte des Entwurfs nennen die Vorlage im Link.
 *
 * **NUR 1:1-PAARE ZÄHLEN.** Mehrere Entwürfe können in derselben Vorlage
 * landen — in der XXVIII. GP ziehen acht Entwürfe auf I/129, ein
 * Sammelvorhaben mit 47.199 Wörtern Erläuterungen. Ein Entwurf mit 600
 * Wörtern dagegen gehalten ergibt 97 % „Abweichung", und gemessen ist damit
 * das Vehikel, nicht die Begründung. Solche Paare werden getrennt
 * ausgewiesen und nicht in den Median gerechnet; ein Vergleich, der sie
 * einbezöge, wäre die erste Fassung dieser Messung gewesen.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseParliamentHtml } from '../server/utils/lawText'
import { parseExplanationsHtml, passagesByParagraph } from '../server/utils/explanationsHtml'
import { diffTokens } from '../server/utils/diff/wordDiff'

const BASE = 'https://www.parlament.gv.at'
const UA = { 'User-Agent': 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at; scripts/erl-diff-corpus)' }
const CONCURRENCY = 4

const gp = process.argv.find((a) => /^[IVXLC]+$/.test(a)) ?? 'XXVIII'
const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 40)
const cacheDir = process.argv.find((a) => a.startsWith('.cache')) ?? join('.cache', 'erl-diff')
await mkdir(join(cacheDir, gp), { recursive: true })

async function cached<T>(file: string, load: () => Promise<T>, parse: (s: string) => T = JSON.parse): Promise<T> {
  try {
    return parse(await readFile(file, 'utf8'))
  } catch {
    const data = await load()
    await writeFile(file, typeof data === 'string' ? data : JSON.stringify(data))
    return data
  }
}

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, headers: { ...UA, Accept: 'application/json', 'Content-Type': 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`)
  return await res.json()
}

/** Das Erläuterungen-Dokument eines Gegenstands, als HTML. */
async function explanationsHtml(kind: 'ME' | 'I', inr: number): Promise<string | null> {
  const detail = await cached(join(cacheDir, gp, `${kind}-${inr}.json`), () => getJson(`${BASE}/gegenstand/${gp}/${kind}/${inr}?json=True`))
  const group = (detail?.content?.documents ?? []).find((g: any) => /^Erläuterungen$/i.test(String(g?.title ?? '').trim()))
  const link = (group?.documents ?? []).find((f: any) => /html/i.test(String(f?.type ?? '')))?.link
  if (!link) return null
  return cached(
    join(cacheDir, gp, `${kind}-${inr}-erl.html`),
    async () => await (await fetch(`${BASE}${link}`, { headers: UA })).text(),
    (s) => s,
  )
}

/**
 * Wie viel vom rohen Text eines Dokuments der Parser überhaupt aufliest.
 *
 * Ein Eingabewert, den die Messung nicht als kaputt erkennen kann, ist
 * schlimmer als ein fehlender: Die Zahl, die er erzeugt, sieht aus wie ein
 * Befund (`scripts/harness-cache.ts`, dieselbe Lehre). Gemessen über vier
 * Dokumente beider Seiten liegt die Deckung bei 94–96 % — Word-HTML ist zu
 * neun Zehnteln Formatierung. Fällt sie irgendwo darunter, ist nicht die
 * Begründung kürzer, sondern unser Parser blind, und das Paar gehört nicht
 * in den Median.
 */
const MIN_CAPTURE = 0.8

function captureRate(html: string, parsedWords: number): number {
  const raw = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .split(/\s+/)
    .filter((w) => /[A-Za-zÄÖÜäöüß0-9]/.test(w)).length
  return raw === 0 ? 1 : parsedWords / raw
}

/**
 * Der Text eines Erläuterungen-Dokuments, geteilt in Allgemeinen und
 * Besonderen Teil.
 *
 * Die Trennung entscheidet, wohin ein Vergleich gehörte: Ändert sich der
 * Allgemeine Teil, ist das eine Aussage über den Entwurf als Ganzes; ändert
 * sich nur der Besondere Teil, gehört sie an den Paragraphen, wo die Passagen
 * ohnehin schon stehen (§12.30).
 */
function parts(html: string): { general: string; special: string; words: number } {
  const blocks = parseParliamentHtml(html)
  let inSpecial = false
  const general: string[] = []
  const special: string[] = []
  for (const b of blocks) {
    // „B e s o n d e r e r  T e i l" kommt gesperrt gesetzt vor; die Leerzeichen
    // zwischen den Buchstaben sind Typografie, nicht Text (§12.29).
    const flat = b.text.replace(/\s+/g, '')
    if (/^Besonderer\s*Teil/i.test(b.text) || /^BesondererTeil/i.test(flat)) { inSpecial = true; continue }
    if (/^Allgemeiner\s*Teil/i.test(b.text) || /^AllgemeinerTeil/i.test(flat)) { inSpecial = false; continue }
    ;(inSpecial ? special : general).push(b.text)
  }
  const text = [...general, ...special].join(' ')
  return { general: general.join(' '), special: special.join(' '), words: text.split(/\s+/).filter(Boolean).length }
}

/**
 * Anteil der Wörter, die sich unterscheiden — 0 heißt identisch.
 *
 * `diffTokens` liefert **immer** eine Ähnlichkeit, aber nur unterhalb von
 * 2,5 Mio. Zellen auch Segmente; darüber fällt es auf einen Mengenvergleich
 * zurück. Erläuterungen sind lang genug, dass das der Normalfall ist: Die
 * erste Fassung dieser Messung las nur die Segmente und verwarf damit **32
 * von 43 Paaren** — und zwar die langen, also genau die interessanten. Die
 * Quote steht deshalb auf `similarity`, die es auf beiden Wegen gibt, und
 * der Prüfstand zählt, wie oft der gröbere gebraucht wurde.
 */
function drift(a: string, b: string): { value: number | null; exact: boolean } {
  if (!a.trim() && !b.trim()) return { value: null, exact: true }
  const { similarity, segments } = diffTokens(a, b)
  return { value: 1 - similarity, exact: segments !== null }
}

// --- Liste 81 und der Join auf die Regierungsvorlage ------------------------
const list = await cached(join(cacheDir, `${gp}-list81.json`), () =>
  getJson(`${BASE}/Filter/api/filter/data/81?js=eval&showAll=true&sortrnr=11&ascDesc=DESC`, { method: 'POST', body: JSON.stringify({ GP_CODE: [gp] }) }),
)
const drafts = (list.rows ?? []).filter((r: any) => Array.isArray(r) && r[0] === gp).map((r: any) => ({ inr: Number(r[2]), cite: String(r[5] ?? '') }))
console.log(`${gp}: ${drafts.length} Ministerialentwürfe`)

interface Row { inr: number; cite: string; rv: number | null; note: string | null; meWords?: number; rvWords?: number; all?: number | null; bes?: number | null; total?: number | null; exact?: boolean; meParas?: number; rvParas?: number; bothParas?: number; changedParas?: number }
const rows: Row[] = []
const queue = [...drafts]
let scored = 0

async function worker(): Promise<void> {
  for (;;) {
    const d = queue.shift()
    if (!d || scored >= limit) return
    try {
      const detail = await cached(join(cacheDir, gp, `ME-${d.inr}.json`), () => getJson(`${BASE}/gegenstand/${gp}/ME/${d.inr}?json=True`))
      const stages = detail?.content?.stages ?? []
      const rv = stages.flatMap((st: any) => [...String(st?.text ?? '').matchAll(/\/gegenstand\/[IVXLC]+\/I\/(\d+)/g)].map((m) => Number(m[1])))[0] ?? null
      if (!rv) { rows.push({ ...d, rv: null, note: 'keine Regierungsvorlage' }); continue }
      const [meHtml, rvHtml] = await Promise.all([explanationsHtml('ME', d.inr), explanationsHtml('I', rv)])
      if (!meHtml || !rvHtml) { rows.push({ ...d, rv, note: !meHtml ? 'Entwurf ohne Erläuterungen-HTML' : 'Vorlage ohne Erläuterungen-HTML' }); continue }
      const me = parts(meHtml)
      const rvp = parts(rvHtml)
      const capture = Math.min(captureRate(meHtml, me.words), captureRate(rvHtml, rvp.words))
      if (capture < MIN_CAPTURE) {
        rows.push({ ...d, rv, note: `Parser liest nur ${(capture * 100).toFixed(0)} % des Textes` })
        continue
      }
      scored++
      // Die Ebene, auf der ein Vergleich am Ende stünde: Paragraph für
      // Paragraph, wie die Gegenüberstellung ihn schon führt (§12.30).
      const meP = passagesByParagraph(parseExplanationsHtml(meHtml))
      const rvP = passagesByParagraph(parseExplanationsHtml(rvHtml))
      const both = [...meP.keys()].filter((id) => rvP.has(id))
      const changedParas = both.filter((id) => {
        const a = meP.get(id)!.flatMap((x) => x.text).join(' ')
        const b = rvP.get(id)!.flatMap((x) => x.text).join(' ')
        const d = drift(a, b).value
        return d !== null && d >= 0.02
      })
      const total = drift(`${me.general} ${me.special}`, `${rvp.general} ${rvp.special}`)
      rows.push({
        ...d,
        rv,
        note: null,
        meWords: me.words,
        rvWords: rvp.words,
        all: drift(me.general, rvp.general).value,
        bes: drift(me.special, rvp.special).value,
        total: total.value,
        exact: total.exact,
        meParas: meP.size,
        rvParas: rvP.size,
        bothParas: both.length,
        changedParas: changedParas.length,
      })
    } catch (err) {
      rows.push({ ...d, rv: null, note: `Fehler: ${String(err).slice(0, 60)}` })
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

// --- Auswertung --------------------------------------------------------------
/** Wie viele Entwürfe zeigen auf dieselbe Vorlage? */
const perRv = new Map<number, number>()
for (const r of rows) if (r.rv) perRv.set(r.rv, (perRv.get(r.rv) ?? 0) + 1)
const scoredRows = rows.filter((r) => r.total !== undefined && r.total !== null)
const shared = scoredRows.filter((r) => (perRv.get(r.rv!) ?? 0) > 1)
const pairs = scoredRows.filter((r) => (perRv.get(r.rv!) ?? 0) === 1)
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '  –  ' : `${(x * 100).toFixed(1).padStart(5)}%`)
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : null)

console.log(`\nEntwürfe bearbeitet: ${rows.length} von ${drafts.length}`)
console.log(`Paare mit beiden Dokumenten: ${scoredRows.length}`)
console.log(`  davon 1:1 (ausgewertet)    : ${pairs.length}  (Wortdiff exakt: ${pairs.filter((r) => r.exact).length}, Mengenvergleich: ${pairs.filter((r) => !r.exact).length})`)
console.log(`  davon Sammelvorlagen       : ${shared.length} — mehrere Entwürfe in derselben Vorlage, auf Dokumentebene nicht vergleichbar`)
for (const [rv, n] of [...perRv].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])) console.log(`      I/${rv}: ${n} Entwürfe`)
const notes = new Map<string, number>()
for (const r of rows) if (r.note) notes.set(r.note, (notes.get(r.note) ?? 0) + 1)
for (const [n, c] of [...notes].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(4)}× ${n}`)

const totals = pairs.map((r) => r.total!).filter((x): x is number => x !== null)
console.log(`\nAbweichung insgesamt: Median ${pct(median(totals))}`)
console.log(`  praktisch unverändert (< 2 %)  : ${totals.filter((x) => x < 0.02).length}`)
console.log(`  merklich geändert (2–20 %)     : ${totals.filter((x) => x >= 0.02 && x < 0.2).length}`)
console.log(`  stark geändert (≥ 20 %)        : ${totals.filter((x) => x >= 0.2).length}`)

const gen = pairs.map((r) => r.all).filter((x): x is number => x !== null && x !== undefined)
const spec = pairs.map((r) => r.bes).filter((x): x is number => x !== null && x !== undefined)
console.log(`\nWo die Änderung sitzt: Allgemeiner Teil Median ${pct(median(gen))} (n=${gen.length}) · Besonderer Teil Median ${pct(median(spec))} (n=${spec.length})`)

const withParas = pairs.filter((r) => (r.meParas ?? 0) > 0)
const joined = withParas.filter((r) => (r.bothParas ?? 0) > 0)
const sum = (f: (r: Row) => number) => withParas.reduce((n, r) => n + f(r), 0)
console.log(`\nParagraphweise (die Ebene, auf der ein Vergleich stünde):`)
console.log(`  Paare mit Passagen im Entwurf : ${withParas.length} von ${pairs.length}`)
console.log(`  davon mit gemeinsamen §§      : ${joined.length}`)
console.log(`  §§ im Entwurf / in der Vorlage: ${sum((r) => r.meParas ?? 0)} / ${sum((r) => r.rvParas ?? 0)}`)
console.log(`  §§ auf beiden Seiten          : ${sum((r) => r.bothParas ?? 0)}`)
console.log(`  davon Begründung geändert     : ${sum((r) => r.changedParas ?? 0)}`)

console.log(`\n  ME  →   RV   Wörter ME/RV     gesamt   Allg.   Bes.   §§ beide/geändert`)
for (const r of pairs.sort((a, b) => (b.total ?? 0) - (a.total ?? 0)).slice(0, 15)) {
  console.log(`  ${String(r.inr).padStart(3)} → I/${String(r.rv).padStart(4)}  ${String(r.meWords).padStart(5)}/${String(r.rvWords).padEnd(5)}  ${pct(r.total)}  ${pct(r.all)}  ${pct(r.bes)}   ${String(r.bothParas ?? 0).padStart(3)}/${String(r.changedParas ?? 0).padEnd(3)}`)
}
await writeFile(join(cacheDir, `${gp}-erl-diff.json`), JSON.stringify(rows, null, 2))
console.log(`\nZeilen: ${join(cacheDir, `${gp}-erl-diff.json`)}`)
