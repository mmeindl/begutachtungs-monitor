#!/usr/bin/env vite-node
/**
 * Records one draft's Lesefassung run as an offline fixture (`tests/konsGolden.test.ts`).
 *
 * `annexGateGolden.test.ts` freezes what the annex check concludes from a
 * real draft. What `consolidate` concludes — the engine, the guard, the
 * oracle's five checks, the second witness, one outcome per § — had
 * synthetic tests only, and a drift in it reached the page unseen until a
 * hand-run round (audit of 20.11.2026). This script writes down the other
 * half: the draft, every answer its sources gave, and the outcome of every §.
 *
 * The sources are the page's own (`kons/konsService.ts`): `resolveKonsLaw`,
 * `fetchParagraphXml` and `draftRenditionOf`, with Nitro's cache wrapper as
 * a pass-through, over the harness cache. The annex is read from RIS as the
 * section's source choice reads it first (`annexSourceFor`): its XML table,
 * or the PDF where the XML is a scan.
 *
 * Everything written out comes from the RIS OGD API (CC BY 4.0,
 * data.bka.gv.at). Parliament's copy of the annex is deliberately not used.
 *
 * Usage:  npx vite-node -c vitest.config.ts scripts/ci/konsGoldenRecord.ts -- --only=<Titelteil> --out=tests/fixtures/kons-<name>.json [--gp=XXVIII]
 */
import { writeFileSync } from 'node:fs'
import type { ConsolidatedTextResponse } from '../../shared/types'
import type { KonsSources } from '../../server/utils/kons/consolidate'
import type { DraftRendition } from '../../server/utils/kons/draftWitness'
import type { KonsLawAtDate, KonsParagraphRef } from '../../server/utils/ris/konsLaw'
import { parseAnnexPdf } from '../../server/utils/annex/annexPdf'
import { pagesOf } from '../../server/utils/annex/annexPdfPages'
import { parseTextComparison, type ComparisonRow } from '../../server/utils/annex/comparisonRows'
import { isScanned } from '../../server/utils/annex/tableCells'
import { draftArticles } from '../../server/utils/lawtext/draftArticles'
import { parseRisXml } from '../../server/utils/lawtext/risXml'
import { getText } from '../../server/utils/ris/konsLaw'
import { compactKonsLaw, lawKey, outcomesOf, type KonsFixture, type RecordedKonsLaw } from '../lib/konsGoldenKeys'
import { installFetchCache } from '../lib/harnessCache'
import { argAssigned } from '../lib/args'
import { risJson as risQuery, scriptUserAgent } from '../lib/http'
import { asArray, pickTextComparisons } from '../lib/ris'

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any
g.defineCachedFunction = (fn: unknown) => fn
// `kons/konsCache.ts` reads the layer name as a Nitro auto-import.
g.DERIVED_CACHE = '/derived'
installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')
const { resolveKonsLaw, fetchParagraphXml } = await import('../../server/utils/kons/konsCache')
const { draftRenditionOf } = await import('../../server/utils/kons/draftRendition')
const { consolidate } = await import('../../server/utils/kons/consolidate')

const SCRIPT = 'ci/konsGoldenRecord'
const risJson = (params: Record<string, string>): Promise<any> => risQuery(params, { script: SCRIPT })

const only = argAssigned('only')
const out = argAssigned('out')
const gp = argAssigned('gp') ?? 'XXVIII'
if (!only || !out) {
  console.error('Usage: scripts/ci/konsGoldenRecord.ts -- --only=<Titelteil> --out=<fixture.json> [--gp=XXVIII]')
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
const asOf: string | null = meta?.Bundesrecht?.Begut?.BeginnBegutachtungsfrist ?? null
if (!asOf) {
  console.error('Der Entwurf nennt keinen Beginn der Begutachtungsfrist.')
  process.exit(1)
}
const contents = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
const urlOf = (ref: any, type: 'Xml' | 'Pdf'): string | null => asArray<any>(ref?.Urls?.ContentUrl).find((u) => u?.DataType === type)?.Url ?? null
const mainRef = contents.find((c) => c?.ContentType === 'MainDocument')
const annexRef = pickTextComparisons(contents, (c) => String(c?.Name ?? ''))[0]
const draftUrl = urlOf(mainRef, 'Xml')
const draftPdf = urlOf(mainRef, 'Pdf')
if (!draftUrl || !annexRef) {
  console.error('Der Entwurf trägt kein XML oder keine Textgegenüberstellung.')
  process.exit(1)
}
const draftXml = await getText(draftUrl)
const blocks = parseRisXml(draftXml)

const annexXmlUrl = urlOf(annexRef, 'Xml')
const annexXml = annexXmlUrl ? await getText(annexXmlUrl) : null
const path: 'xml' | 'pdf' = annexXml !== null && !isScanned(annexXml) ? 'xml' : 'pdf'
let rows: ComparisonRow[] | null = null

// The page's sources, each answer written down as it is given.
const laws: Record<string, KonsLawAtDate | null> = {}
const xml: Record<string, string> = {}
let rendition: DraftRendition | null | undefined
const sources: KonsSources = {
  resolveLaw: async (organ, nummer, date, title, clause) => {
    const law = await resolveKonsLaw(organ, nummer, date, title, clause)
    laws[lawKey(organ, nummer, date, title, clause)] = law
    return law
  },
  paragraphXml: async (ref) => {
    const text = await fetchParagraphXml(ref.nor, ref.xmlUrl!)
    xml[ref.nor] = text
    return text
  },
  annexRows: async (articles) => {
    if (path === 'xml') {
      const parse = parseTextComparison(annexXml!, articles)
      rows = parse.refusal ? null : [...parse.rows]
    } else {
      const pdfUrl = urlOf(annexRef, 'Pdf')
      if (!pdfUrl) return null
      const bytes = new Uint8Array(await (await fetch(pdfUrl, { headers: { 'User-Agent': scriptUserAgent(SCRIPT) } })).arrayBuffer())
      const parse = parseAnnexPdf(await pagesOf(bytes), articles)
      rows = parse.refusal ? null : [...parse.rows]
    }
    return rows
  },
  draftRendition: async () => {
    rendition = await draftRenditionOf(draftPdf)
    // `draftRenditionOf` answers null for a failure too, which is right on
    // the page and wrong in a recording: a PDF the cache lacks is no answer.
    if (rendition === null && draftPdf) {
      console.error(`Die Fassung des Entwurfs ließ sich nicht lesen: ${draftPdf}`)
      process.exit(1)
    }
    return rendition
  },
}

const result: ConsolidatedTextResponse = await consolidate({ gp, inr: null, risId: String(meta?.Technisch?.ID ?? '') }, blocks, asOf, sources)
if (draftArticles(blocks).length === 0) console.warn('Hinweis: kein Artikel gelesen.')

const fetched = (ref: KonsParagraphRef): boolean => ref.nor in xml
const recordedLaws: Record<string, RecordedKonsLaw | null> = {}
for (const [key, law] of Object.entries(laws)) recordedLaws[key] = law === null ? null : compactKonsLaw(law, fetched)

const fixture: KonsFixture & { id: string; gp: string; urls: Record<string, string | null> } = {
  cite: String(meta?.Bundesrecht?.Begut?.Begutachtungsverfahrennummer ?? meta?.Bundesrecht?.Kurztitel ?? '?'),
  id: String(meta?.Technisch?.ID ?? '?'),
  gp,
  asOf,
  path,
  urls: { draft: draftUrl, annex: path === 'xml' ? annexXmlUrl : urlOf(annexRef, 'Pdf'), draftPdf },
  draftXml,
  recorded: { resolveLaw: recordedLaws, paragraphXml: xml, annexRows: rows, ...(rendition === undefined ? {} : { rendition }) },
  expected: outcomesOf(result),
}
writeFileSync(out, `${JSON.stringify(fixture, null, 1)}\n`)
const counts = Object.values(fixture.expected.outcomes).reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {})
console.log(`${fixture.cite} (${path}-Pfad) → ${out}`)
console.log(`  ${fixture.expected.touched} Paragraphen: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`)
console.log(`  aufgezeichnet: ${Object.keys(laws).length} Gesetze, ${Object.keys(xml).length} Paragraphen, Zeuge ${rendition === undefined ? 'nicht gefragt' : rendition ? 'gelesen' : 'keine Fassung'}`)
console.log(`  Größe: ${(JSON.stringify(fixture).length / 1024).toFixed(0)} kB`)
