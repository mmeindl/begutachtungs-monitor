#!/usr/bin/env vite-node
/**
 * Does the draft page account for every § a draft amends? (26.10.2026)
 *
 * Usage:  npx vite-node -c vitest.config.ts scripts/harness/accounting.ts -- [--base=http://localhost:3000] [--gp=XXVIII] [--only=48,126] [--ris] [--json=report.json]
 *
 * `--ris` runs the Begutachtungen RIS carries without a Gegenstand at
 * Parliament (Verordnungsentwürfe above all) instead of the
 * Ministerialentwürfe — the same section, behind `/api/ris-drafts/:id`.
 *
 * **What it measures is the page, not the engine.** It asks a running server
 * — the dev server, or a built one — the same two questions the
 * Textgegenüberstellung section asks (`/gegenueberstellung`,
 * `/konsolidiert`), and puts the answers through the section's own pure
 * functions (`placeAtParagraphs`, `groupAnnexRows`, `annexParas`). So what it
 * counts is what a reader would see, and a draft that fails here fails on
 * the page.
 *
 * **The invariants, and why each is one.**
 *
 *  - `balance` — shown + withheld = touched, no § twice
 *    (`consolidationBalance`). A § that falls out of both lists is the bare
 *    `continue` that silenced eight causes until 26.10.2026.
 *  - `stumm` — a § block of the annex that shows a change the draft would
 *    have to instruct, and says nothing about the Lesefassung. Zero by
 *    construction today (`nicht-gefunden`); a regression would bring it
 *    back silently, and this is where it shows. A block whose unit's
 *    outcome stands at another block of the unit is not silent
 *    (`ParaPlacement.outcomeElsewhere`, one outcome per block).
 *  - `ortlos` — a § the gate CONFIRMED that no block of the annex takes.
 *    The page still shows it, at the end of its law (`UnplacedLesefassung`),
 *    so nothing is lost — but the oracle found rows for it that the page
 *    cannot find, and that disagreement is a bug in one of the two keys.
 *  - `quelle` — the annex section and the Lesefassung disagree about whether
 *    there is an annex at all: one reads rows, the other none.
 *  - `doppelt` — one outcome of the server placed at more than one block
 *    (19.11.2026). Each § has one outcome, and the page may say it once: a
 *    second placement repeats a reason, or a confirmed text, at a block that
 *    is not that § (24/ME XXVIII: BSFG § 40 under its table-of-contents
 *    entry and under § 40 itself), and a schedule's outcome stood at every
 *    numbered schedule of its law (58/ME: one at eleven Anhänge).
 *  - `entfällt-stehend` — an outcome `entfaellt` at a block whose shown rows
 *    keep the unit standing (`annexKeepsUnit`). The page prints no line for
 *    a repeal, trusting the struck rows to say it; where the rows show the
 *    unit still there, the block is silent about a Lesefassung the engine
 *    got wrong (8CA8E8B1 Anl. 2, C3F4E0AD Anl. 1, 19.11.2026).
 *  - `verloren` — an outcome of the server that a block took and no block
 *    shows, nor the end of its law (`placeAtParagraphs`, `lost`; 19.11.2026).
 *    Zero by construction today; a vacated old number is said by its struck
 *    rows and is no loss.
 *  - `obergrenze` — `nicht-geladen` in a draft whose §§ fit the budget
 *    (`KONS_MAX_PARAGRAPHS`). The page's sentence names that ceiling and no
 *    other; 116/ME's 139 §§ stood under it while a ceiling of 40 laws
 *    withheld them (19.11.2026).
 *
 * Everything else is counted, not failed: the causes per §, the §§ the
 * draft amends that the annex does not show (`unplaced`), the §§ the annex
 * shows a change at that no instruction names (`nicht-gefunden` — each one
 * a candidate gap in our reading of the draft), and the §§ two checks judge
 * differently (`zwei Urteile`: the annex check withholds a § whose
 * Lesefassung the oracle confirms).
 *
 * Exit code 1 when an invariant fails, 2 when the run could not measure.
 */
import { writeFileSync } from 'node:fs'
import type { ConsolidatedTextResponse, DraftsResponse, ExplanationsResponse, RisConsultationsResponse, TextComparisonResponse } from '../../shared/types'
import { annexUnitId, articleUnitLaws } from '../../shared/utils/explanationKey'
import { KONS_MAX_PARAGRAPHS, annexKeepsUnit, consolidationBalance } from '../../server/utils/kons/consolidate'
import { showsInstructedChange, type Lesefassung } from '../../app/utils/lesefassung'
import { annexParas, groupAnnexRows, placeAtParagraphs, type ParaPlacement } from '../../app/utils/annexGroups'
import { argAssigned } from '../lib/args'

const BASE = argAssigned('base') ?? process.env.BASE ?? 'http://localhost:3000'
const GP = argAssigned('gp') ?? 'XXVIII'
const ONLY = argAssigned('only')?.split(',').map(Number) ?? null
const JSON_OUT = argAssigned('json')
const RIS_ONLY = process.argv.includes('--ris')

/**
 * GET with patience: a dev server restarts its worker on every edit to a
 * server file, and a cold `/konsolidiert` of a Sammelgesetz takes a minute.
 * A 404 is an answer and returned as null; everything else is retried.
 */
async function get<T>(path: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(300_000) })
      if (res.status === 404) return null
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1000 * Number(res.headers.get('retry-after') ?? 5)))
        continue
      }
      if (res.ok) return (await res.json()) as T
    } catch {
      // Connection refused while the worker restarts, or a timeout.
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt))
  }
  throw new Error(`${path}: keine Antwort nach 8 Versuchen`)
}

interface DraftReport {
  citation: string
  annex: 'tabelle' | 'pdf' | 'keine'
  touched: number
  shown: number
  notRun: string | null
  causes: Record<string, number>
  /** Hard failures, as sentences. */
  failures: string[]
  /** §§ the annex shows a change at and no instruction names. */
  notFound: string[]
  /** §§ the draft amends that no § block of the annex takes. */
  unplaced: string[]
  /** §§ the annex check withholds while the Lesefassung is confirmed. */
  twoVerdicts: string[]
  /** Begründung passages no § block of the annex takes. */
  explanationsUnplaced: number
  explanationsTotal: number
}

async function measure(base: string, citation: string): Promise<DraftReport> {
  const annex = await get<TextComparisonResponse>(`${base}/gegenueberstellung`)
  const kons = await get<ConsolidatedTextResponse>(`${base}/konsolidiert`)
  const erl = await get<ExplanationsResponse>(`${base}/erlaeuterungen`)
  const report: DraftReport = {
    citation,
    annex: !annex?.available ? 'keine' : annex.readFrom === 'pdf' ? 'pdf' : 'tabelle',
    touched: kons?.touched ?? 0, shown: kons?.paragraphs.length ?? 0, notRun: kons?.notRun ?? null,
    causes: {}, failures: [], notFound: [], unplaced: [], twoVerdicts: [],
    explanationsUnplaced: 0, explanationsTotal: 0,
  }
  if (!kons) {
    report.failures.push('keine Antwort von /konsolidiert')
    return report
  }
  for (const w of kons.withheld) report.causes[w.cause] = (report.causes[w.cause] ?? 0) + 1

  const balance = consolidationBalance(kons)
  if (!balance.balanced) report.failures.push(`balance: ${balance.missing} ohne Ergebnis, doppelt: ${balance.twice.join(' ')}`)
  const unloaded = report.causes['nicht-geladen'] ?? 0
  if (unloaded > 0 && kons.touched <= KONS_MAX_PARAGRAPHS) report.failures.push(`obergrenze: ${unloaded} §§ „nicht geladen", obwohl ${kons.touched} geänderte §§ unter ${KONS_MAX_PARAGRAPHS} liegen`)

  if (!annex?.available) {
    // No annex on the page: every § the draft amends is `kein-anhang` — any
    // other cause means the Lesefassung read an annex the section did not.
    const other = kons.withheld.filter((w) => w.cause !== 'kein-anhang')
    if (kons.paragraphs.length > 0 || other.length > 0) report.failures.push(`quelle: Abschnitt ohne Beilage, Lesefassung mit ${kons.paragraphs.length} gezeigten und ${other.length} anders begründeten §§`)
    return report
  }
  if (kons.notRun === null && kons.paragraphs.length === 0 && kons.withheld.length > 0 && kons.withheld.every((w) => w.cause === 'kein-anhang')) {
    report.failures.push('quelle: Abschnitt mit Beilage, Lesefassung ohne')
  }

  // The section's own pass (`placeAtParagraphs`), over the whole annex.
  const placement = placeAtParagraphs(annex.rows, kons, erl?.paragraphs ?? [])
  const ran = kons.notRun === null
  for (const o of placement.lost) report.failures.push(`verloren: ein Ergebnis des Servers steht an keinem Block und an keinem Gesetzesende — ${o.law ? `${o.law}: ` : ''}${o.id}`)
  const ends = [...placement.ends.byGroup.entries(), ...placement.ends.rest.map((r) => [r.law ?? '', r] as const)]
  for (const [law, end] of ends) {
    for (const o of end.outcomes) {
      const label = `${law && !law.startsWith('#') ? `${law}: ` : ''}${o.id}`
      if (o.lesefassung.kind === 'shown') report.failures.push(`ortlos: bestätigter § ohne Block — ${label}`)
      else report.unplaced.push(`${label} (${o.lesefassung.cause})`)
    }
    // The Begründung that finds no § block — shown at the end of its law.
    report.explanationsUnplaced += end.explanations.length
  }
  report.explanationsTotal = erl?.paragraphs.length ?? 0
  // The section as it renders, unfiltered and uncut — each § block with ALL
  // its rows, the withheld ones included: they stand on the page only as
  // the notice, and a repealed § withheld whole is struck rows all the same
  // (61/ME, EStG § 70). Grouped by the placement each row maps to, which is
  // one per block (`placeAtParagraphs`).
  const { groups } = groupAnnexRows(annex.rows, { matches: null, hidden: [] })
  // A block's unit as the page and the oracle read it: „Artikel 53." in a law divided into Artikel.
  const articleLaws = articleUnitLaws(annex.rows)
  /** Each server outcome (by the object `outcomeIndex` hands every block it is placed at) and the blocks it stands at. */
  const blocksOf = new Map<Lesefassung, string[]>()
  for (const g of groups) {
    const { paras } = annexParas(g, { limit: Number.POSITIVE_INFINITY, folding: true, placed: placement.byRow })
    const rowsOf = new Map<ParaPlacement, typeof g.rows>()
    for (const row of g.rows) {
      const at = placement.byRow.get(row)
      if (at) rowsOf.set(at, [...(rowsOf.get(at) ?? []), row])
    }
    for (const [at, rows] of rowsOf) {
      const first = rows[0]!
      const label = `${g.article ? `${g.article}: ` : ''}${first.para ?? '(ohne §)'}`
      const repealed = rows.every((r) => r.change === 'removed')
      const { lesefassungen } = at
      if (ran && lesefassungen.length === 0 && !at.outcomeElsewhere && annexUnitId(first.para, articleLaws.has(first.law ?? '')) && showsInstructedChange(rows) && !repealed) report.failures.push(`stumm: ${label} zeigt eine Änderung und sagt nichts zur Lesefassung`)
      for (const { lesefassung } of lesefassungen) {
        if (lesefassung.kind === 'withheld' && lesefassung.cause === 'entfaellt' && annexKeepsUnit(rows.filter((r) => r.check !== 'withheld'))) {
          report.failures.push(`entfällt-stehend: ${label} — die Beilage zeigt die Einheit danach stehend, die Seite sagt nichts`)
        }
        // By identity: `outcomeIndex` hands out each outcome's own object, and
        // what the page makes up itself (`nicht-gefunden`) is new per block.
        blocksOf.set(lesefassung, [...(blocksOf.get(lesefassung) ?? []), label])
      }
    }
    for (const p of paras) {
      const label = `${g.article ? `${g.article}: ` : ''}${p.gld ?? '(ohne §)'}`
      for (const l of p.lesefassungen) {
        if (l.lesefassung.kind === 'withheld' && l.lesefassung.cause === 'nicht-gefunden') report.notFound.push(label)
        if (l.lesefassung.kind === 'shown' && p.blocks.some((b) => b.kind === 'withheld')) report.twoVerdicts.push(label)
      }
    }
  }
  for (const [lesefassung, labels] of blocksOf) {
    if (labels.length < 2) continue
    const what = lesefassung.kind === 'shown' ? 'bestätigter §' : `Ergebnis (${lesefassung.cause})`
    report.failures.push(`doppelt: ein ${what} an ${labels.length} Blöcken — ${labels.join(' | ')}`)
  }
  return report
}

/** The drafts to measure: their API base and the label the report prints. */
async function draftsToMeasure(): Promise<{ base: string; citation: string }[] | null> {
  if (RIS_ONLY) {
    const list = await get<RisConsultationsResponse>(`/api/ris-drafts?gp=${GP}`)
    // `--only=4D9E1224,…` names RIS-only drafts by a part of their id.
    const parts = argAssigned('only')?.split(',') ?? null
    return list ? list.items.filter((d) => !parts || parts.some((p) => d.id.includes(p))).map((d) => ({ base: `/api/ris-drafts/${d.id}`, citation: d.id.slice(6, 14) })) : null
  }
  const list = await get<DraftsResponse>(`/api/drafts?gp=${GP}`)
  return list
    ? list.items.filter((d) => !ONLY || ONLY.includes(d.inr)).sort((a, b) => a.inr - b.inr).map((d) => ({ base: `/api/drafts/${GP}/${d.inr}`, citation: d.citation }))
    : null
}

const drafts = await draftsToMeasure()
if (!drafts) {
  console.error('Die Liste der Entwürfe kam nicht.')
  process.exit(2)
}
const reports: DraftReport[] = []
for (const [i, d] of drafts.entries()) {
  const r = await measure(d.base, d.citation)
  reports.push(r)
  const causes = Object.entries(r.causes).map(([k, v]) => `${k} ${v}`).join(', ')
  console.log(`${String(i + 1).padStart(3)}/${drafts.length} ${d.citation.padEnd(8)} ${r.annex.padEnd(7)} ${r.shown}/${r.touched}${r.notRun ? ` (nicht gelaufen: ${r.notRun})` : ''}${causes ? ` — ${causes}` : ''}${r.failures.length ? `  ✗ ${r.failures.length}` : ''}`)
}

const sum = (f: (r: DraftReport) => number): number => reports.reduce((n, r) => n + f(r), 0)
const causes: Record<string, number> = {}
for (const r of reports) for (const [k, v] of Object.entries(r.causes)) causes[k] = (causes[k] ?? 0) + v
const failures = reports.flatMap((r) => r.failures.map((f) => `${r.citation}: ${f}`))

console.log(`\n${reports.length} Entwürfe, ${sum((r) => r.touched)} geänderte §§, ${sum((r) => r.shown)} mit Lesefassung`)
console.log(`Gründe: ${Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`)
const notRun: Record<string, number> = {}
for (const r of reports) if (r.notRun) notRun[r.notRun] = (notRun[r.notRun] ?? 0) + 1
console.log(`nicht gelaufen: ${Object.entries(notRun).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}`)
console.log(`ohne Block in der Beilage (ans Gesetzesende): ${sum((r) => r.unplaced.length)} §§ in ${reports.filter((r) => r.unplaced.length).length} Entwürfen`)
console.log(`„nicht gefunden" (Beilage zeigt Änderung, keine Anweisung): ${sum((r) => r.notFound.length)} §§ in ${reports.filter((r) => r.notFound.length).length} Entwürfen`)
console.log(`zwei Urteile (Beilage zurückgehalten, Lesefassung bestätigt): ${sum((r) => r.twoVerdicts.length)} §§`)
console.log(`Begründungen ohne §-Block: ${sum((r) => r.explanationsUnplaced)} von ${sum((r) => r.explanationsTotal)}`)
console.log(failures.length ? `\n✗ ${failures.length} Verletzungen:\n${failures.map((f) => `  ${f}`).join('\n')}` : '\n✓ keine Verletzung')

if (JSON_OUT) writeFileSync(JSON_OUT, `${JSON.stringify({ gp: GP, base: BASE, at: new Date().toISOString(), reports }, null, 1)}\n`)
process.exit(failures.length ? 1 : 0)
