/**
 * Wird aus dem Verordnungsentwurf eine Kundmachung — und können wir das
 * sagen, ohne zu raten? Die Messung, die den Join Entwurf → BGBl II gatet
 * (`TODO.md`, docs/architecture.md §12.32).
 *
 * Zwei Drittel des Korpus sind Verordnungsentwürfe, und für sie endet der
 * Monitor mit der Frist. Der Weg danach ist die Kundmachung im BGBl II; der
 * Schlüssel dorthin muss aus Titel, Ressort und Datum gebaut werden, wie beim
 * RIS↔ME-Join. Bevor eine Seite „kundgemacht" oder „bisher nicht kundgemacht"
 * behauptet, müssen drei Zahlen existieren:
 *
 *  1. WIE VIELE Entwürfe finden eine Kundmachung — und wie verteilt sich das
 *     über die Zeit seit dem Fristende? Ein Entwurf von letzter Woche ist
 *     nicht „liegen geblieben", er ist jung.
 *  2. WIE SICHER ist ein Treffer: Punktzahl, Abstand zum zweiten, und was
 *     knapp unter der Schwelle liegt.
 *  3. WIE LANGE dauert es (Fristende → Ausgabedatum) — die Verordnungshälfte
 *     von „wie schnell wird aus einem Entwurf Recht".
 *
 *     pnpm audit:bgbl2                      # Fristende ab 2024-01-01
 *     pnpm audit:bgbl2 -- --since 2023-01-01
 *     pnpm audit:bgbl2 -- --misses 25       # unbestätigte Entwürfe ansehen
 *     pnpm audit:bgbl2 -- --show <BEGUT-ID> # die Kandidaten eines Entwurfs
 *     pnpm audit:bgbl2 -- --near            # die Beinahe-Treffer je Schwelle
 *
 * Läuft durch `joinDraftToBgbl`, die ausgelieferte Regel: Was hier gezählt
 * wird, ist das, was die Seite sagen würde. Liest nur; schreibt nichts.
 */
import { classifyRisRecord } from '../server/utils/ris/risJoin'
import {
  BGBL_ACCEPT,
  BGBL_MARGIN,
  bgblCandidates,
  joinDraftToBgbl,
  type BgblJoinDraft,
} from '../server/utils/ris/bgblJoin'
import { fetchBgblRecords, fetchRisBegutCorpus } from './risCorpus'

const args = process.argv.slice(2)
function flag(name: string): string | null {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? '') : null
}
const has = (name: string) => args.includes(`--${name}`)

const since = flag('since') ?? '2024-01-01'
const today = new Date().toISOString().slice(0, 10)

function pct(n: number, of: number): string {
  return of ? `${((n / of) * 100).toFixed(1)} %` : '–'
}
function quantile(xs: readonly number[], q: number): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!
}
function daysSince(iso: string): number {
  return Math.round((Date.parse(today) - Date.parse(iso)) / 86_400_000)
}

const corpus = await fetchRisBegutCorpus('bgbl2-corpus')
// Das Kundmachungsfenster beginnt vor dem Entwurfsfenster, weil eine
// Kundmachung der Frist vorauslaufen darf (BGBL_WINDOW_DAYS), und endet
// heute: Was danach kommt, weiß niemand.
const from = new Date(Date.parse(since) - 40 * 86_400_000).toISOString().slice(0, 10)
const bgbl = await fetchBgblRecords('bgbl2-corpus', from, today)
const teil2 = bgbl.filter((r) => r.teil === 'Teil2')

interface Row {
  id: string
  draft: BgblJoinDraft
  title: string
  age: number
}
const drafts: Row[] = corpus.records
  .filter((r) => classifyRisRecord(r) === 'verordnung' && r.ende && r.ende >= since && r.ende <= today)
  .map((r) => ({
    id: r.id,
    draft: { kurztitel: r.kurztitel, titel: r.titel, stelle: r.stelle, ende: r.ende },
    title: r.kurztitel ?? r.titel ?? '(ohne Titel)',
    age: daysSince(r.ende!),
  }))

console.log(`\nBGBl-Sätze ${from} … ${today}: ${bgbl.length}, davon Teil II ${teil2.length}`)
console.log(`Verordnungsentwürfe mit Fristende ab ${since}: ${drafts.length}\n`)

if (has('show')) {
  const id = flag('show')!
  const row = drafts.find((d) => d.id === id || d.title.toLowerCase().includes(id.toLowerCase()))
  if (!row) {
    console.log(`Kein Entwurf zu „${id}".`)
    process.exit(1)
  }
  console.log(`▸ ${row.title}\n   ${row.id} · Frist bis ${row.draft.ende} · ${row.draft.stelle}\n`)
  for (const c of bgblCandidates(row.draft, teil2).slice(0, 8)) {
    const mark = c.ministry > 0 ? (c.score >= BGBL_ACCEPT ? '✓' : ' ') : '✗'
    console.log(
      `  ${mark} ${c.score.toFixed(3)} · ${c.record.nummer} · ${c.record.datum} (+${c.days} T) · Ressort ${c.ministry} · ${(c.record.kurztitel ?? c.record.titel ?? '').slice(0, 58)}`,
    )
  }
  process.exit(0)
}

const matched: { row: Row; score: number; margin: number; days: number }[] = []
const missed: Row[] = []
for (const row of drafts) {
  const hit = joinDraftToBgbl(row.draft, teil2)
  if (hit) matched.push({ row, score: hit.score, margin: hit.margin, days: hit.days })
  else missed.push(row)
}

console.log('── 1. Wie viele finden ihre Kundmachung')
console.log(`   Treffer: ${matched.length} von ${drafts.length} (${pct(matched.length, drafts.length)})\n`)

// Nach Alter des Fristendes: Die Frage „wurde erlassen?" ist erst nach einer
// Weile beantwortbar, und die Kurve zeigt, ab wann.
const buckets: [string, number, number][] = [
  ['bis 30 Tage her', 0, 30],
  ['31–90 Tage', 31, 90],
  ['91–180 Tage', 91, 180],
  ['181–365 Tage', 181, 365],
  ['über ein Jahr', 366, 99_999],
]
console.log('   Nach Zeit seit Fristende:')
for (const [label, lo, hi] of buckets) {
  const inB = drafts.filter((d) => d.age >= lo && d.age <= hi)
  const hitB = matched.filter((m) => m.row.age >= lo && m.row.age <= hi)
  if (inB.length) console.log(`     ${label.padEnd(16)} ${String(hitB.length).padStart(4)}/${String(inB.length).padEnd(4)} ${pct(hitB.length, inB.length)}`)
}

console.log('\n── 2. Wie sicher sind die Treffer')
const scores = matched.map((m) => m.score)
const margins = matched.map((m) => m.margin)
console.log(`   Punktzahl: Median ${quantile(scores, 0.5).toFixed(3)} · p10 ${quantile(scores, 0.1).toFixed(3)} · Minimum ${Math.min(...scores).toFixed(3)}`)
console.log(`   Abstand zum zweiten: Median ${quantile(margins, 0.5).toFixed(3)} · p10 ${quantile(margins, 0.1).toFixed(3)}`)
console.log(`   Perfekte Titelgleichheit (1.000): ${scores.filter((s) => s >= 0.999).length} (${pct(scores.filter((s) => s >= 0.999).length, scores.length)})`)

// Was die Schwelle und die Marge kosten: die Fälle, die nur an ihnen
// scheitern. Eine Schwelle, die man nur an ihren Treffern prüft, prüft man
// nicht.
let blockedByScore = 0
let blockedByMargin = 0
let blockedByMinistry = 0
for (const row of missed) {
  const all = bgblCandidates(row.draft, teil2)
  const own = all.filter((c) => c.ministry > 0)
  const best = own[0]
  if (!best) {
    if (all[0] && all[0].score >= BGBL_ACCEPT) blockedByMinistry++
    continue
  }
  if (best.score < BGBL_ACCEPT) blockedByScore++
  else blockedByMargin++
}
console.log(`\n   Ohne Treffer, aber ein Kandidat des eigenen Ressorts lag über der Schwelle und zu nah am zweiten: ${blockedByMargin}`)
console.log(`   Bester eigener Kandidat unter der Schwelle (${BGBL_ACCEPT}): ${blockedByScore}`)
console.log(`   Über der Schwelle, aber fremdes Ressort (verworfen): ${blockedByMinistry}`)

console.log('\n── 3. Wie lange dauert es')
const lags = matched.map((m) => m.days)
if (lags.length) {
  console.log(
    `   Fristende → Ausgabedatum: Median ${quantile(lags, 0.5)} Tage · p10 ${quantile(lags, 0.1)} · p90 ${quantile(lags, 0.9)} · max ${Math.max(...lags)}`,
  )
  console.log(`   Vor dem Fristende kundgemacht: ${lags.filter((d) => d < 0).length}`)
}

if (has('near')) {
  console.log('\n── Beinahe-Treffer (eigenes Ressort, Punktzahl 0,45–Schwelle)')
  for (const row of missed) {
    const best = bgblCandidates(row.draft, teil2).filter((c) => c.ministry > 0)[0]
    if (!best || best.score < 0.45 || best.score >= BGBL_ACCEPT) continue
    console.log(`   ${best.score.toFixed(3)} ${row.title.slice(0, 52)}`)
    console.log(`         → ${best.record.nummer} ${(best.record.kurztitel ?? '').slice(0, 52)}`)
  }
}

if (has('misses')) {
  const n = Number(flag('misses')) || 20
  console.log(`\n── Ohne Kundmachung, älteste Frist zuerst (${n})`)
  for (const row of [...missed].sort((a, b) => b.age - a.age).slice(0, n)) {
    const best = bgblCandidates(row.draft, teil2).filter((c) => c.ministry > 0)[0]
    console.log(`   ${row.draft.ende} (vor ${row.age} T) ${row.title.slice(0, 60)}`)
    if (best) console.log(`      bester Kandidat ${best.score.toFixed(3)} · ${best.record.nummer} ${(best.record.kurztitel ?? '').slice(0, 48)}`)
  }
}

console.log(`\n(Schwelle ${BGBL_ACCEPT}, Marge ${BGBL_MARGIN})`)
