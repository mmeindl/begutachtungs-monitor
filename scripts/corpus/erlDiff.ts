#!/usr/bin/env vite-node
/**
 * Does the ressort's reasoning change between the draft and the
 * Regierungsvorlage? — the measurement that gates the last open piece of the
 * diff layer (`TODO.md`, docs/architecture.md §12.10).
 *
 * Usage:  npx vite-node scripts/corpus/erlDiff.ts XXVIII [anzahl] [cacheDir]
 *
 * WHY MEASURE FIRST. A second comparison section costs a page, an endpoint
 * and an explanation; it only pays off where the two documents diverge at
 * all. Where they are almost always the same, the result is a sentence in the
 * docs and not a feature — the same order as with the second verification
 * signal (§12.12b), where half a day of measuring saved a whole package.
 *
 * BOTH SIDES FROM PARLIAMENT, on purpose. The draft's Erläuterungen would
 * also be in RIS as typed XML; the Regierungsvorlage's would not. A
 * comparison of XML against Word HTML measures the two converters first —
 * the lesson of the sixth measurement in §12.12. So the same source, the same
 * parser (`parseParliamentHtml`), and what is left over is content.
 *
 * The join draft → Regierungsvorlage is the one from
 * `scripts/corpus/rvLatency.ts`: the draft's stages name the Vorlage in the
 * link.
 *
 * **ONLY 1:1 PAIRS COUNT.** Several drafts can end up in the same Vorlage —
 * in GP XXVIII eight drafts pull to I/129, a package with 47.199 words of
 * Erläuterungen. A draft of 600 words held against it yields 97 %
 * „Abweichung", and what is then measured is the vehicle, not the reasoning.
 * Such pairs are shown separately and are not counted into the median; a
 * comparison that included them would have been the first version of this
 * measurement.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseParliamentHtml } from '../../server/utils/lawtext/parliamentHtml'
import { parseExplanationsHtml, passagesByParagraph } from '../../server/utils/explanations/explanationsHtml'
import { diffTokens } from '../../server/utils/diff/wordDiff'
import { PARLIAMENT as BASE, getJson, getText } from '../lib/http'
import { cachedJson, cachedText } from '../lib/diskCache'

const SCRIPT = 'corpus/erlDiff'
const CONCURRENCY = 4

const gp = process.argv.find((a) => /^[IVXLC]+$/.test(a)) ?? 'XXVIII'
const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 40)
const cacheDir = process.argv.find((a) => a.startsWith('.cache')) ?? join('.cache', 'erl-diff')
await mkdir(join(cacheDir, gp), { recursive: true })

/** One attempt, like the rest of this script: everything it reads is cached on disk. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fetchJson(url: string, body?: unknown): Promise<any> {
  return getJson(url, { script: SCRIPT, ...(body === undefined ? {} : { method: 'POST' as const, body }) })
}

/** A Gegenstand's Erläuterungen document, as HTML. */
async function explanationsHtml(kind: 'ME' | 'I', inr: number): Promise<string | null> {
  const detail = await cachedJson(join(cacheDir, gp, `${kind}-${inr}.json`), () => fetchJson(`${BASE}/gegenstand/${gp}/${kind}/${inr}?json=True`))
  const group = (detail?.content?.documents ?? []).find((g: any) => /^Erläuterungen$/i.test(String(g?.title ?? '').trim()))
  const link = (group?.documents ?? []).find((f: any) => /html/i.test(String(f?.type ?? '')))?.link
  if (!link) return null
  return cachedText(join(cacheDir, gp, `${kind}-${inr}-erl.html`), () => getText(`${BASE}${link}`, { script: SCRIPT }))
}

/**
 * How much of a document's raw text the parser picks up at all.
 *
 * An input the measurement cannot detect as broken is worse than a missing
 * one: the number it produces looks like a finding
 * (`scripts/lib/harnessCache.ts`, the same lesson). Measured over four
 * documents from both sides, the capture sits at 94–96 % — Word HTML is nine
 * tenths formatting. Where it falls below that anywhere, the reasoning is not
 * shorter, our parser is blind, and the pair does not belong in the median.
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
 * The text of an Erläuterungen document, split into the Allgemeiner and the
 * Besonderer Teil.
 *
 * The split decides where a comparison would belong: if the Allgemeiner Teil
 * changes, that is a statement about the draft as a whole; if only the
 * Besonderer Teil changes, it belongs at the Paragraph, where the passages
 * already stand anyway (§12.30).
 */
function parts(html: string): { general: string; special: string; words: number } {
  const blocks = parseParliamentHtml(html)
  let inSpecial = false
  const general: string[] = []
  const special: string[] = []
  for (const b of blocks) {
    // „B e s o n d e r e r  T e i l" occurs letterspaced; the spaces between
    // the letters are typography, not text (§12.29).
    const flat = b.text.replace(/\s+/g, '')
    if (/^Besonderer\s*Teil/i.test(b.text) || /^BesondererTeil/i.test(flat)) { inSpecial = true; continue }
    if (/^Allgemeiner\s*Teil/i.test(b.text) || /^AllgemeinerTeil/i.test(flat)) { inSpecial = false; continue }
    ;(inSpecial ? special : general).push(b.text)
  }
  const text = [...general, ...special].join(' ')
  return { general: general.join(' '), special: special.join(' '), words: text.split(/\s+/).filter(Boolean).length }
}

/**
 * The share of words that differ — 0 means identical.
 *
 * `diffTokens` **always** returns a similarity, but segments only below 2,5
 * million cells; above that it falls back on a set comparison. Erläuterungen
 * are long enough for that to be the normal case: the first version of this
 * measurement read only the segments and so discarded **32 of 43 pairs** —
 * the long ones, that is, which are exactly the interesting ones. The rate
 * therefore rests on `similarity`, which exists on both routes, and the
 * harness counts how often the coarser one was needed.
 */
function drift(a: string, b: string): { value: number | null; exact: boolean } {
  if (!a.trim() && !b.trim()) return { value: null, exact: true }
  const { similarity, segments } = diffTokens(a, b)
  return { value: 1 - similarity, exact: segments !== null }
}

// --- List 81 and the join onto the Regierungsvorlage ------------------------
const list = await cachedJson(join(cacheDir, `${gp}-list81.json`), () =>
  fetchJson(`${BASE}/Filter/api/filter/data/81?js=eval&showAll=true&sortrnr=11&ascDesc=DESC`, { GP_CODE: [gp] }),
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
      const detail = await cachedJson(join(cacheDir, gp, `ME-${d.inr}.json`), () => fetchJson(`${BASE}/gegenstand/${gp}/ME/${d.inr}?json=True`))
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
      // The level a comparison would end up on: Paragraph by Paragraph, the
      // way the Gegenüberstellung already carries it (§12.30).
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

// --- Evaluation --------------------------------------------------------------
/** How many drafts point at the same Vorlage? */
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
