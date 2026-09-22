/**
 * What the RIS Begut corpus holds beyond the Ministerialentwürfe — the
 * evidence behind the Verordnungen facet (docs/architecture.md §12.16).
 *
 * The monitor's list of open consultations comes from Parliament's list 81,
 * which knows Ministerialentwürfe only. RIS publishes the *whole*
 * pre-parliamentary Begutachtung, Verordnungsentwürfe included, and those
 * never reach Parliament at all — so the homepage's "Jetzt in Begutachtung"
 * was naming a fraction of what is open without saying so.
 *
 * This script measures the fraction, and what a Verordnung record actually
 * carries, because the first note on the subject guessed low: it recorded
 * "one main document, no Erläuterungen, no Gegenüberstellung" from a single
 * record read by eye. Run before trusting any number here again:
 *
 *     pnpm audit:verordnungen                # whole corpus
 *     pnpm audit:verordnungen -- --on 2026-09-17   # what was open that day
 *
 * Reads only: one pass over the cached corpus fetch, nothing written.
 */
import { readFileSync } from 'node:fs'
import {
  classifyRisRecord,
  dedupeMeRows,
  joinRisToMe,
  type MeListRow,
  type RisBegutRecord,
  type RisClass,
} from '../server/utils/ris/risJoin'
import { ministryCodeOf } from '../server/utils/ris/ministryCodes'
import { hasDocument, isOpenOn, type RisBegutFlat } from '../server/utils/ris/risRecord'
import { argPair } from './lib/args'
import { fetchRisBegutCorpus } from './lib/corpus'

const onDate = argPair('on')
if (onDate && !/^\d{4}-\d{2}-\d{2}$/.test(onDate)) {
  console.error('--on expects an ISO date, e.g. 2026-09-17')
  process.exit(1)
}

// Ascending by EndeBegutachtungsfrist, so the "open on this day" list below
// reads oldest deadline first. The shared pass is the one the other corpus
// scripts use, mapper and retry included; this script carried its own copy of
// the paging until 22.09.2026 and had no retry at all.
const corpus = await fetchRisBegutCorpus('verordnungen-corpus', 'Ascending')
const records = corpus.records.map((r) => ({ r, cls: classifyRisRecord(r) }))

console.log(`RIS Begut corpus: ${corpus.records.length} records (upstream hits: ${corpus.hits})`)

// --- class split -----------------------------------------------------------

const byClass = new Map<RisClass, number>()
for (const { cls } of records) byClass.set(cls, (byClass.get(cls) ?? 0) + 1)
console.log('\n## Class split (title-based, classifyRisRecord)')
for (const [cls, n] of [...byClass].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cls.padEnd(11)} ${String(n).padStart(5)}  ${((n / records.length) * 100).toFixed(1)} %`)
}

// --- the trap: records without a Frist -------------------------------------
//
// `InBegutachtungAm` filters on EndeBegutachtungsfrist, and that field is
// optional (api-exploration.md §2). Every count of "open" records is a lower
// bound, and this is how far below the bound it can sit.

const noEnde = records.filter(({ r }) => !r.ende)
const noBeginn = records.filter(({ r }) => !r.beginn)
console.log('\n## Missing dates (the lower-bound trap)')
console.log(`  no EndeBegutachtungsfrist:   ${noEnde.length} (${((noEnde.length / records.length) * 100).toFixed(1)} %)`)
console.log(`  no BeginnBegutachtungsfrist: ${noBeginn.length}`)
const noEndeVo = noEnde.filter(({ cls }) => cls === 'verordnung').length
console.log(`  of the undated, Verordnungen: ${noEndeVo}`)

// --- documents per record --------------------------------------------------

function documentReport(label: string, rows: { r: RisBegutFlat; cls: RisClass }[]): void {
  if (!rows.length) {
    console.log(`\n## ${label}: none`)
    return
  }
  const pct = (n: number) => `${String(n).padStart(5)}  ${((n / rows.length) * 100).toFixed(1)} %`
  console.log(`\n## ${label} (n = ${rows.length})`)
  console.log(`  main document, any format  ${pct(rows.filter(({ r }) => hasDocument(r.mainDocument)).length)}`)
  console.log(`  main document as XML       ${pct(rows.filter(({ r }) => r.mainDocument.xml).length)}`)
  console.log(`  main document as HTML      ${pct(rows.filter(({ r }) => r.mainDocument.html).length)}`)
  console.log(`  Erläuterungen              ${pct(rows.filter(({ r }) => hasDocument(r.explanations)).length)}`)
  console.log(`  Textgegenüberstellung      ${pct(rows.filter(({ r }) => hasDocument(r.textComparison)).length)}`)
  console.log(`  Begleitschreiben           ${pct(rows.filter(({ r }) => r.coverLetter !== null).length)}`)
}

const verordnungen = records.filter(({ cls }) => cls === 'verordnung')
documentReport('Verordnungen — what the record carries', verordnungen)
documentReport(
  'Gesetze — the same, for comparison',
  records.filter(({ cls }) => cls === 'gesetz'),
)

// --- per-year ratio --------------------------------------------------------
//
// One day is an anecdote. The ratio per Beginn year is the claim.

console.log('\n## Per year of BeginnBegutachtungsfrist')
const years = new Map<string, { gesetz: number; verordnung: number; other: number }>()
for (const { r, cls } of records) {
  const y = r.beginn?.slice(0, 4) ?? 'unknown'
  const slot = years.get(y) ?? { gesetz: 0, verordnung: 0, other: 0 }
  slot[cls]++
  years.set(y, slot)
}
console.log('  year    Gesetz  Verordn.   other   Verordnungen share')
for (const [y, s] of [...years].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12)) {
  const total = s.gesetz + s.verordnung + s.other
  console.log(
    `  ${y.padEnd(8)}${String(s.gesetz).padStart(5)}${String(s.verordnung).padStart(9)}${String(s.other).padStart(9)}` +
    `        ${((s.verordnung / total) * 100).toFixed(0)} %`,
  )
}

// --- what was open on a given day -----------------------------------------

if (onDate) {
  const open = records.filter(({ r }) => isOpenOn(r, onDate))
  console.log(`\n## In Begutachtung on ${onDate}: ${open.length} records`)
  for (const { r, cls } of open.sort((a, b) => (a.r.ende ?? '').localeCompare(b.r.ende ?? ''))) {
    const docs = [
      hasDocument(r.explanations) ? 'Erl' : null,
      hasDocument(r.textComparison) ? 'TGÜ' : null,
      r.coverLetter ? 'Begl' : null,
    ].filter(Boolean)
    console.log(
      `  ${cls.padEnd(11)} bis ${r.ende}  ${ministryCodeOf(r.stelle).padEnd(8)} ` +
      `${(r.kurztitel ?? r.titel ?? '').slice(0, 58).padEnd(58)} [${docs.join(' ')}]`,
    )
  }
  const vo = open.filter(({ cls }) => cls === 'verordnung').length
  console.log(
    `  → Parliament's list 81 can carry at most ${open.length - vo} of these; ` +
    `${vo} are Verordnungen and appear nowhere on parlament.gv.at.`,
  )
}

// --- the classifier as a visible label ------------------------------------
//
// `classifyRisRecord` was built as a PENALTY inside the RIS↔ME join: a wrong
// guess cost a little score and the date and title signals outvoted it. The
// Verordnungen facet promotes it to a label on screen, which is a factual
// claim about a document, so it needs an accuracy check it never had.
//
// Two oracles, both from data rather than from reading titles by hand:
//
//  A. A record the join tied to a Ministerialentwurf CANNOT be a Verordnung —
//     Parliament's list 81 carries Gesetzesentwürfe only. Every such record
//     the classifier calls a Verordnung is an outright error.
//  B. A record with no ME counterpart that the classifier calls a Gesetz is
//     either a classifier error, a join miss, or the case Steinhammer named:
//     a Gesetzesentwurf published in RIS that never appeared at Parliament.
//     The three are distinguishable only by hand, so this prints them all.
//
// Runs against the committed fixtures, so it is offline and reproducible.

const fixture = <T>(f: string): T =>
  JSON.parse(readFileSync(new URL(`../tests/fixtures/${f}`, import.meta.url), 'utf8')) as T

console.log('\n\n# The classifier as a label — join as oracle (fixtures, offline)')
for (const gp of ['gp27', 'gp28']) {
  const ris = fixture<RisBegutRecord[]>(`ris-begut-${gp}.json`)
  const mes = dedupeMeRows(fixture<MeListRow[]>(`me-${gp}.json`))
  const rows = joinRisToMe(mes, ris)

  // Claimed = chosen by an ME, plus the RIS twins the join recognised as
  // duplicates of a chosen one. A twin is the same draft published twice.
  const claimed = new Set<string>()
  for (const r of rows) {
    if (r.risId) claimed.add(r.risId)
    for (const d of r.duplicates) claimed.add(d)
  }

  const unjoined = ris.filter((r) => !claimed.has(r.id))
  const byClass: Record<string, number> = {}
  for (const r of unjoined) byClass[classifyRisRecord(r)] = (byClass[classifyRisRecord(r)] ?? 0) + 1

  console.log(`\n## ${gp.toUpperCase()} — RIS in window ${ris.length}, MEs ${mes.length}, joined ${claimed.size}, unjoined ${unjoined.length}`)
  console.log('   unjoined by class:', JSON.stringify(byClass))

  const oracleA = ris.filter((r) => claimed.has(r.id) && classifyRisRecord(r) === 'verordnung')
  console.log(`   ORACLE A — joined to an ME yet classified 'verordnung': ${oracleA.length}`)
  for (const r of oracleA) console.log(`      ! ${(r.kurztitel ?? r.titel ?? '').slice(0, 92)}`)

  const oracleB = unjoined.filter((r) => classifyRisRecord(r) === 'gesetz')
  console.log(`   ORACLE B — no ME counterpart yet classified 'gesetz': ${oracleB.length}`)
  for (const r of oracleB) console.log(`      ? ${r.beginn} ${(r.kurztitel ?? r.titel ?? '').slice(0, 86)}`)

  const oracleC = unjoined.filter((r) => classifyRisRecord(r) === 'other')
  console.log(`   no ME counterpart, classified 'other': ${oracleC.length}`)
  for (const r of oracleC) console.log(`      ~ ${r.beginn} ${(r.kurztitel ?? r.titel ?? '').slice(0, 86)}`)
}
