#!/usr/bin/env vite-node
/**
 * Verification harness for the amendment engine (docs/architecture.md §12.12).
 *
 * Usage:  npx vite-node scripts/kons-harness.ts BGBLA_2022_I_187 [Kurztitel]
 *         npx vite-node scripts/kons-harness.ts --discover=12
 *
 * `--discover=N` takes the N most recent Bundesgesetze that amend exactly one
 * law ("Bundesgesetz, mit dem das X geändert wird") and runs all of them, so
 * the numbers are a corpus result rather than an anecdote.
 *
 * The idea, and the reason a consolidated law text is publishable at all:
 * for an amendment already promulgated, RIS holds **both** the law before it
 * and the law after it. Each consolidated paragraph version names the
 * amendment that produced it in its `Kundmachungsorgan` ("… zuletzt geändert
 * durch BGBl. I Nr. 187/2022"), so the before/after pair is exact — no date
 * arithmetic, which matters because amendments are routinely retroactive
 * (GSpG § 20: promulgated 2022-12-06, in force from 2022-01-01).
 *
 * The authentic Bundesgesetzblatt (`Applikation=BgblAuth`) publishes the
 * amendment in the same legistic XML as `Begut`, so the instructions are the
 * enacted ones — no drift between what was drafted and what was passed.
 *
 * Three numbers come out, and only the third licenses publication:
 *   angewendet — instructions the engine could carry out at all
 *   geprüft    — paragraphs RIS can confirm or refute
 *   identisch  — paragraphs where the engine produced the law that exists
 */
import { applyNovelle, instructionsFromUnits, type StandingLaw } from '../server/utils/lawApply'
import { plainText, type LawNode } from '../server/utils/lawStructure'
import { parseRisXml, segmentUnits } from '../server/utils/lawText'
import { fetchAllVersions, fetchParagraphTree, getText, resolveGesetzesnummer, versionPairFor, type KonsParagraphRef } from '../server/utils/risKons'
import { extraTokens, verdictFor } from '../server/utils/applyReport'

interface Verdict {
  bgbl: string
  law: string
  instructions: number
  read: number
  applied: number
  checked: number
  identical: number
  untouched: number
  incomplete: number
  divergent: number
  note: string | null
}

const RIS = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'
const UA = { 'User-Agent': 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)', Accept: 'application/json' }
const verbose = !process.argv.includes('--quiet')

/* eslint-disable @typescript-eslint/no-explicit-any */
async function risJson(params: Record<string, string>): Promise<any> {
  const res = await fetch(`${RIS}?${new URLSearchParams(params)}`, { headers: UA, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

function asArray<T>(x: T | T[] | null | undefined): T[] {
  return x === null || x === undefined ? [] : Array.isArray(x) ? x : [x]
}

/** The Bundesgesetze that amend exactly one law — the cases a harness can score. */
async function discoverSingleLawAmendments(count: number): Promise<{ id: string; law: string }[]> {
  const out: { id: string; law: string }[] = []
  for (let page = 1; page <= 5 && out.length < count; page++) {
    const body = await risJson({
      Applikation: 'BgblAuth',
      DokumenteProSeite: 'OneHundred',
      Seitennummer: String(page),
      'Sortierung.SortedByColumn': 'Kundmachungsdatum',
      'Sortierung.SortDirection': 'Descending',
    })
    for (const ref of asArray<any>(body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference)) {
      const id = ref?.Data?.Metadaten?.Technisch?.ID
      const titel = String(ref?.Data?.Metadaten?.Bundesrecht?.Titel ?? '').replace(/<br\/>[\s\S]*/, '').trim()
      const m = /^Bundesgesetz, mit dem das ([^,]+?) geändert wird$/.exec(titel)
      if (id && m && out.length < count) out.push({ id, law: m[1]! })
    }
  }
  return out
}

async function verify(bgblId: string, kurztitelArg?: string): Promise<Verdict> {
  const meta = await risJson({ Applikation: 'BgblAuth', Suchworte: bgblId, DokumenteProSeite: 'Ten' })
  const ref = asArray<any>(meta?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference).find((r) => r?.Data?.Metadaten?.Technisch?.ID === bgblId)
  const blank = (note: string): Verdict => ({ bgbl: bgblId, law: kurztitelArg ?? '?', instructions: 0, read: 0, applied: 0, checked: 0, identical: 0, untouched: 0, incomplete: 0, divergent: 0, note })
  if (!ref) return blank('BGBl nicht gefunden')

  const bundesrecht = ref.Data.Metadaten.Bundesrecht
  const bgblNumber: string = bundesrecht.BgblAuth?.Bgblnummer
  const kundmachung: string = bundesrecht.BgblAuth?.Ausgabedatum ?? ''
  const xmlUrl: string | undefined = asArray<any>(ref.Data.Dokumentliste.ContentReference)
    .flatMap((c) => asArray<any>(c.Urls.ContentUrl))
    .find((u) => u.DataType === 'Xml')?.Url
  if (!xmlUrl) return blank('kein XML')

  const units = segmentUnits(parseRisXml(await getText(xmlUrl)))
  const { instructions, refused } = instructionsFromUnits(units.filter((u) => u.blocks.some((b) => b.kind === 'novao')))
  const total = instructions.length + refused.length
  if (total === 0) return blank('keine Novellierungsanordnungen')

  const kurztitel = kurztitelArg ?? String(bundesrecht.Kurztitel ?? '')
  const gesetzesnummer = await resolveGesetzesnummer(kurztitel)
  if (!gesetzesnummer) return { ...blank(`Kurztitel "${kurztitel}" nicht im BrKons`), law: kurztitel, instructions: total, read: instructions.length }

  const versions = await fetchAllVersions(gesetzesnummer)
  const pairs = new Map<string, { before: KonsParagraphRef | null; after: KonsParagraphRef }>()
  for (const [label, list] of versions) {
    const pair = versionPairFor(list, bgblNumber)
    if (pair) pairs.set(label, pair)
  }

  /** The newest version that already existed when this amendment was promulgated. */
  const lastBefore = (list: readonly KonsParagraphRef[]): KonsParagraphRef | null => {
    const candidates = list.filter((v) => (v.inkrafttreten ?? '9999') <= kundmachung)
    return candidates[candidates.length - 1] ?? list[0] ?? null
  }

  // Only the paragraphs the instructions name are fetched — a law like the
  // Umsatzsteuergesetz has hundreds, and loading all to change six is a
  // minute of RIS traffic for nothing. "Im gesamten Gesetzestext" needs all.
  const wanted = new Set<string>(pairs.keys())
  let wholeText = false
  for (const { op } of instructions) {
    const address = 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
    if (!address) continue
    if (address.level === 'document') wholeText = true
    if (address.para) wanted.add(address.para.replace(/\s+/g, ' '))
  }
  const paragraphs: LawNode[] = []
  for (const [label, list] of versions) {
    if (!wholeText && !wanted.has(label)) continue
    const chosen = pairs.get(label)?.before ?? (pairs.has(label) ? null : lastBefore(list))
    if (!chosen) continue
    const tree = await fetchParagraphTree(chosen)
    if (tree) paragraphs.push(tree)
  }
  const law: StandingLaw = { paragraphs }

  const { law: after, results } = applyNovelle(law, instructions)
  const applied = results.filter((r) => r.applied).length

  if (verbose) {
    console.log(`\n${bgblNumber} vom ${kundmachung} — ${kurztitel}`)
    console.log(`  ${total} Anweisungen, ${instructions.length} gelesen, ${applied} angewendet; ${law.paragraphs.length}/${versions.size} Paragraphen geladen`)
    for (const r of refused) console.log(`    ✗ [Grammatik] ${r.reason} — ${r.line.slice(0, 100)}`)
    for (const r of results.filter((x) => !x.applied)) console.log(`    ✗ [Anwendung] ${r.reason} — ${r.line.slice(0, 100)}`)
  }

  let checked = 0
  let identical = 0
  let untouched = 0
  let incomplete = 0
  const divergences: { label: string; got: string; expected: string; before: string }[] = []
  for (const [label, pair] of [...pairs].sort()) {
    const id = /(\d+[a-z]*)/.exec(label)?.[1]
    const node = after.paragraphs.find((p) => p.id === id)
    const truthTree = await fetchParagraphTree(pair.after)
    if (!node || !truthTree) continue
    checked++
    const got = plainText(node)
    const expected = plainText(truthTree)
    const beforeNode = law.paragraphs.find((p) => p.id === id)
    const beforeText = beforeNode ? plainText(beforeNode) : null
    const verdict = verdictFor(beforeText, got, expected)
    const mark = { identisch: '✓', 'unverändert': '·', 'unvollständig': '~', abweichend: '✗' }[verdict]
    if (verdict === 'identisch') identical++
    else if (verdict === 'unverändert') untouched++
    else if (verdict === 'unvollständig') incomplete++
    else divergences.push({ label, got, expected, before: beforeText ?? '' })
    if (verbose) {
      const what = verdict === 'identisch' ? `identisch (Fassung ab ${pair.after.inkrafttreten})` : verdict === 'unvollständig' ? 'unvollständig — nichts Eigenes erfunden' : verdict === 'unverändert' ? 'unverändert gelassen' : 'eigene Abweichung'
      console.log(`    ${mark}  ${label.padEnd(9)} ${what}`)
    }
  }
  if (verbose) {
    for (const d of divergences) {
      const extra = extraTokens(d.before, d.got, d.expected)
      console.log(`    --- ${d.label} — Engine änderte, RIS nicht: +[${extra.inserted.slice(0, 8).join(' ')}] -[${extra.removed.slice(0, 8).join(' ')}]`)
    }
  }

  return { bgbl: bgblNumber, law: kurztitel, instructions: total, read: instructions.length, applied, checked, identical, untouched, incomplete, divergent: divergences.length, note: null }
}

/** The first place two texts part company, with context on both sides. */
function firstDifference(a: string, b: string): string {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return `…${a.slice(Math.max(0, i - 30), i + 70)}…`
}

// --- CLI ----------------------------------------------------------------------
const discover = process.argv.find((a) => a.startsWith('--discover='))
const ids = process.argv.slice(2).filter((a) => /^BGBLA_/.test(a))
const cases: { id: string; law?: string }[] = discover
  ? await discoverSingleLawAmendments(Number(discover.split('=')[1] ?? 10))
  : ids.map((id) => ({ id, law: process.argv[process.argv.indexOf(id) + 1]?.startsWith('-') ? undefined : process.argv[process.argv.indexOf(id) + 1] }))

if (cases.length === 0) {
  console.error('Usage: npx vite-node scripts/kons-harness.ts <BGBl-ID> [Kurztitel] | --discover=N')
  process.exit(1)
}

const verdicts: Verdict[] = []
for (const c of cases) {
  try {
    verdicts.push(await verify(c.id, c.law))
  } catch (err) {
    console.log(`\n${c.id}: ${String(err)}`)
  }
}

const scored = verdicts.filter((v) => v.note === null)
const sum = (pick: (v: Verdict) => number) => scored.reduce((n, v) => n + pick(v), 0)
console.log(`\n${'='.repeat(78)}`)
console.log(`Prüfstand über ${scored.length} Novellen${verdicts.length > scored.length ? ` (${verdicts.length - scored.length} nicht auswertbar)` : ''}`)
const pct = (n: number, of: number) => (of === 0 ? '—' : `${((n / of) * 100).toFixed(1)} %`)
console.log(`  Anweisungen           : ${sum((v) => v.instructions)}`)
console.log(`  grammatikalisch gelesen: ${sum((v) => v.read)} (${pct(sum((v) => v.read), sum((v) => v.instructions))})`)
console.log(`  angewendet             : ${sum((v) => v.applied)} (${pct(sum((v) => v.applied), sum((v) => v.instructions))})`)
console.log(`  geprüfte Paragraphen   : ${sum((v) => v.checked)}`)
console.log(`    identisch mit dem RIS: ${sum((v) => v.identical)} (${pct(sum((v) => v.identical), sum((v) => v.checked))})`)
console.log(`    unverändert gelassen : ${sum((v) => v.untouched)} (${pct(sum((v) => v.untouched), sum((v) => v.checked))})  — ungefährlich, wird verweigert`)
console.log(`    unvollständig        : ${sum((v) => v.incomplete)} (${pct(sum((v) => v.incomplete), sum((v) => v.checked))})  — nichts Eigenes erfunden`)
console.log(`    eigene Abweichung    : ${sum((v) => v.divergent)} (${pct(sum((v) => v.divergent), sum((v) => v.checked))})  — die einzige gefährliche Klasse`)
for (const v of verdicts.filter((x) => x.note)) console.log(`  ? ${v.bgbl}: ${v.note}`)
