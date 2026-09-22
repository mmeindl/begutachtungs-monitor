#!/usr/bin/env vite-node
/**
 * Records one draft's gate run as an offline fixture (`tests/annexGateGolden.test.ts`).
 *
 * The weekly drift alarm is the only thing that watches the gate's *verdicts*,
 * and it watches them once a week, over the network, against a baseline that
 * has to be pulled by hand. On 19.09.2026 four engine commits moved verdicts
 * in twelve drafts and every test stayed green: `annexGolden.test.ts` freezes
 * what the two parsers make of a document, not what the gate concludes from
 * it. This script closes that gap by writing down the other half — the draft,
 * its annex, every answer RIS gave, and the verdict for every §.
 *
 * `AnnexSources` is the seam that makes it offline: the gate takes its two RIS
 * lookups as an interface, so recording them needs no HTTP cassette and the
 * replay in the test is the shipped decision, not a copy of it.
 *
 * Everything written out comes from the RIS OGD API (CC-BY 4.0,
 * data.bka.gv.at) — the settled source for draft texts and their
 * Textgegenüberstellung. Parliament's copy of the same annex is deliberately
 * not used here: it is the one excluded from open data (CLAUDE.md, §12.11).
 *
 * Usage:  npx vite-node scripts/gate-golden-record.ts -- --only=Organtransplantations --out=tests/fixtures/gate-organtransplantation.json
 */
import { writeFileSync } from 'node:fs'
import {
  notRunReason,
  verifyAnnex,
  type AnnexDraft,
  type AnnexSources,
} from '../server/utils/annexCheck'
import { parseAnnexPdf } from '../server/utils/annexPdf'
import { pagesOf } from '../server/utils/annexPdfPages'
import { plainText } from '../server/utils/lawStructure'
import { parseRisXml } from '../server/utils/lawText'
import { draftArticles } from '../server/utils/lawTitles'
import { fetchParagraphTree, getText, resolveLawByBgbl, type KonsLawAtDate, type KonsParagraphRef } from '../server/utils/risKons'
import { isScanned, parseTextComparison, type ComparisonRow } from '../server/utils/textComparison'
import { compactLaw, resolveKey, standingKey, type RecordedLaw } from './gate-golden-keys'
import { installFetchCache } from './harness-cache'

installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

const RIS = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'
const UA = { 'User-Agent': 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)', Accept: 'application/json' }

/* eslint-disable @typescript-eslint/no-explicit-any */
const asArray = <T>(x: T | T[] | null | undefined): T[] => (x === null || x === undefined ? [] : Array.isArray(x) ? x : [x])
const arg = (name: string): string | null => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null

async function risJson(params: Record<string, string>): Promise<any> {
  const res = await fetch(`${RIS}?${new URLSearchParams(params)}`, { headers: UA, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

const only = arg('only')
const out = arg('out')
const gp = arg('gp') ?? 'XXVIII'
if (!only || !out) {
  console.error('Usage: gate-golden-record.ts --only=<Titelteil> --out=<fixture.json> [--gp=XXVIII]')
  process.exit(2)
}

const docs: any[] = []
for (let page = 1; page <= 4; page++) {
  const body = await risJson({ Applikation: 'Begut', 'Begut.Gesetzgebungsperiode': gp, DokumenteProSeite: 'OneHundred', Seitennummer: String(page) })
  const refs = asArray<any>(body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference)
  if (refs.length === 0) break
  docs.push(...refs)
}

const doc = docs.find((d) => {
  const m = d?.Data?.Metadaten?.Bundesrecht
  return `${m?.Begut?.Begutachtungsverfahrennummer ?? ''} ${m?.Kurztitel ?? ''} ${m?.Titel ?? ''}`.toLowerCase().includes(only.toLowerCase())
})
if (!doc) {
  console.error(`Kein Entwurf in GP ${gp} passt auf „${only}".`)
  process.exit(1)
}

const meta = doc.Data.Metadaten
const begut = meta?.Bundesrecht?.Begut
const asOf: string | null = begut?.BeginnBegutachtungsfrist ?? null
if (!asOf) {
  console.error('Der Entwurf nennt keinen Beginn der Begutachtungsfrist — ohne ihn hat das Tor keinen Stichtag.')
  process.exit(1)
}

const contents = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
const mainRef = contents.find((c) => c?.ContentType === 'MainDocument')
const annexRef = contents.find((c) => /gegen.?über|^TG(Ü|G|UE)$/i.test(String(c?.Name ?? '')))
const urlOf = (ref: any, type: 'Xml' | 'Pdf'): string | null => asArray<any>(ref?.Urls?.ContentUrl).find((u) => u?.DataType === type)?.Url ?? null

const draftUrl = urlOf(mainRef, 'Xml')
const annexXmlUrl = urlOf(annexRef, 'Xml')
const annexPdfUrl = urlOf(annexRef, 'Pdf')
if (!draftUrl || !annexRef) {
  console.error('Der Entwurf trägt kein XML oder keine Textgegenüberstellung.')
  process.exit(1)
}

const draftXml = await getText(draftUrl)
const blocks = parseRisXml(draftXml)
const articles = draftArticles(blocks)

const annexXml = annexXmlUrl ? await getText(annexXmlUrl) : null
const readable = annexXml !== null && !isScanned(annexXml)

let rows: readonly ComparisonRow[]
let annexPages: unknown = null
if (readable) {
  const parse = parseTextComparison(annexXml!, articles)
  if (parse.refusal) { console.error(`Die Beilage wurde verweigert: ${parse.refusal}`); process.exit(1) }
  rows = parse.rows
} else {
  if (!annexPdfUrl) { console.error('Beilage ohne lesbares XML und ohne PDF.'); process.exit(1) }
  const bytes = new Uint8Array(await (await fetch(annexPdfUrl, { headers: UA })).arrayBuffer())
  // Rounded and without blank runs, exactly as `annex-uwg-pages.json` is kept:
  // `linesFromPage` and `columnBoundary` skip empty runs and the parse is
  // identical either way, but the dump is a third of the size.
  const pages = (await pagesOf(bytes)).map((p) => ({
    ...p,
    items: p.items.filter((i) => i.text.trim() !== '').map((i) => ({ ...i, x: Math.round(i.x * 100) / 100, y: Math.round(i.y * 100) / 100, width: Math.round(i.width * 100) / 100 })),
  }))
  annexPages = pages
  const parse = parseAnnexPdf(pages as never, articles)
  if (parse.refusal) { console.error(`Die Beilage wurde verweigert: ${parse.refusal}`); process.exit(1) }
  rows = parse.rows
}

// The live sources, wrapped so every question and every answer is written
// down. Recording the *answer* rather than the HTTP body is what keeps the
// fixture readable and small: the gate asks for a law at a date and for one
// §'s standing text, and those two answers are the whole of its input.
const resolveCalls: Record<string, KonsLawAtDate | null> = {}
const standingCalls: Record<string, { text: string; heading: string } | null> = {}
const sources: AnnexSources = {
  resolveLaw: async (organ, nummer, date, title) => {
    const law = await resolveLawByBgbl({ organ, nummer }, date, title || undefined).catch(() => null)
    resolveCalls[resolveKey(organ, nummer, date, title)] = law
    return law
  },
  standingText: async (ref) => {
    const tree = await fetchParagraphTree(ref)
    const value = tree === null ? null : { text: [...tree.context, plainText(tree)].join(' '), heading: [...tree.context, tree.heading ?? ''].join(' ') }
    standingCalls[standingKey(ref)] = value
    return value
  },
}

const draft: AnnexDraft = { articles, asOf, blocks }
const check = await verifyAnnex(rows, draft, sources)

// Thinned only after the run, so `consulted` is decided by what the gate
// actually asked — see `RecordedLaw`.
const wasConsulted = (ref: KonsParagraphRef): boolean => standingKey(ref) in standingCalls
const compacted: Record<string, RecordedLaw | null> = {}
for (const [key, law] of Object.entries(resolveCalls)) compacted[key] = law === null ? null : compactLaw(law, wasConsulted)

const fixture = {
  cite: String(begut?.Begutachtungsverfahrennummer ?? meta?.Bundesrecht?.Kurztitel ?? '?'),
  id: String(meta?.Technisch?.ID ?? '?'),
  gp,
  asOf,
  path: readable ? 'xml' : 'pdf',
  urls: { draft: draftUrl, annex: readable ? annexXmlUrl : annexPdfUrl },
  draftXml,
  annexXml: readable ? annexXml : null,
  annexPages,
  recorded: { resolveLaw: compacted, standingText: standingCalls },
  expected: {
    ran: check.ran,
    notRunReason: notRunReason(check),
    judged: check.judged,
    verdicts: check.verdicts,
    withheldCauses: check.withheldCauses,
  },
}

writeFileSync(out, `${JSON.stringify(fixture, null, 1)}\n`)
const counts = Object.values(check.verdicts).reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {})
console.log(`${fixture.cite} (${fixture.path}-Pfad) → ${out}`)
console.log(`  Urteile: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}; Gründe: ${Object.values(check.withheldCauses).join(', ') || '—'}`)
console.log(`  aufgezeichnet: ${Object.keys(resolveCalls).length} Gesetze, ${Object.keys(standingCalls).length} Paragraphen`)
console.log(`  Größe: ${(JSON.stringify(fixture).length / 1024).toFixed(0)} kB`)
