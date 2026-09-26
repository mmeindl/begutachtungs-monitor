#!/usr/bin/env vite-node
/**
 * Binnenauslassungen in Ganz-§-Zeilen: wie oft sie vorkommen, und was die
 * Segmentierung an den Auslassungsmarken dem Orakel einbringt
 * (docs/architecture.md §12.12a).
 *
 * Usage:  npx vite-node scripts/corpus/innerElision.ts -- [--limit=400]
 *
 * **Warum eine eigene Messung.** Das Orakel (`kons/tguOracle.ts`) verlangte
 * die Spalte der Beilage als *zusammenhängende* Zeichenfolge. Auf dem
 * PDF-Pfad ist eine Zeile ein ganzer Paragraph, und wo das Ressort darin
 * unveränderte Strecken auslässt, ist die Zeile unser § mit Löchern — eine
 * Teilfolge des Ausgangstextes, nie eine Teilzeichenfolge. Ob das eine
 * Randerscheinung ist oder die Regel, entscheidet, ob die Segmentierung
 * gebaut gehört; deshalb steht die Häufigkeit hier neben dem Ertrag.
 *
 * Gemessen werden die beiden Enthaltungsprüfungen des Orakels (Check 1 gegen
 * den geltenden Text im RIS, Check 2 gegen die vorgeschlagene Fassung), und
 * zwar durch dieselbe Funktion, die der Server benutzt — nicht durch eine
 * Kopie davon, die auseinanderlaufen kann. Was das **Tor** am Ende zeigt,
 * sagt diese Messung nicht: dazu gehören Verweigerung, Plausibilität und
 * Check 3, und die Vorhersage „hebt, was das Tor zeigen kann" war an dieser
 * Stelle schon einmal falsch (§12.12a).
 */
import { parseAnnexPdf } from '../../server/utils/annex/annexPdf'
import { pagesOf } from '../../server/utils/annex/annexPdfPages'
import { parseTextComparison, type ComparisonParse } from '../../server/utils/annex/comparisonRows'
import { isScanned } from '../../server/utils/annex/tableCells'
import { designationKey } from '../../server/utils/annex/annexText'
import { printedStretches } from '../../server/utils/annex/elision'
import { stripMarkers, unaccountedStretch } from '../../server/utils/kons/tguOracle'
import { plainText } from '../../server/utils/lawtext/konsTree'
import { parseRisXml } from '../../server/utils/lawtext/risXml'
import { draftArticles, type DraftArticle } from '../../server/utils/lawtext/draftArticles'
import { getText, resolveLawByBgbl, type KonsLawAtDate } from '../../server/utils/ris/konsLaw'
import { fetchParagraphTree } from '../../server/utils/harness/risKonsHistory'
import { installFetchCache } from '../lib/harnessCache'
import { argAssigned } from '../lib/args'
import { risJson as risQuery, scriptUserAgent } from '../lib/http'
import { ANNEX_NAME_RE, asArray } from '../lib/ris'

installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')
const SCRIPT = 'corpus/innerElision'
/* eslint-disable @typescript-eslint/no-explicit-any */
const risJson = (params: Record<string, string>): Promise<any> => risQuery(params, { script: SCRIPT })

/** Eine Auslassungsmarke irgendwo in der Zelle — die Klasse, die gezählt wird. */
const MARK_RE = /\.{2,}|…/

/** Die Vergleichsform des Orakels, Zeichen für Zeichen (`tguOracle.key`). */
function key(t: string): string {
  return stripMarkers(t).replace(/[\s"'„“‚‘]/g, '')
}

/**
 * Die alte Prüfung: die ganze Zelle als eine Zeichenfolge.
 *
 * Steht hier und nicht mehr im Server, weil der Vorher-Wert sonst nirgends
 * mehr zu haben wäre — eine Messung ohne Ausgangspunkt ist keine.
 */
function containedWhole(text: string, cell: string): boolean {
  return text.includes(key(cell))
}

/**
 * Die neue Prüfung — **die des Servers**, nicht eine Kopie davon.
 *
 * Stand hier bis 26.09.2026 als eigene Schleife, Zeichen für Zeichen
 * dieselbe. Das war einmal richtig (die alte Prüfung braucht ihren
 * Ausgangspunkt, und den gibt es sonst nirgends mehr) und wurde falsch, als
 * die Prüfung um den Überschriftenstapel wuchs: eine Messung, die eine Kopie
 * misst, berichtet den Ertrag des Servers nicht.
 */
function containedPiecewise(text: string, cell: string): boolean {
  return unaccountedStretch(text, cell) === null
}

interface Tally {
  drafts: number
  draftsWithInner: number
  rows: number
  inner: number
  innerProposed: number
  checked: number
  wholeOk: number
  pieceOk: number
  /** Zeilen ohne Marke: die Segmentierung ändert hier nichts — die beiden Regeln von 26.09. schon. */
  unmarked: number
  unmarkedGain: number
  unmarkedLoss: number
  misses: string[]
}
const mk = (): Tally => ({ drafts: 0, draftsWithInner: 0, rows: 0, inner: 0, innerProposed: 0, checked: 0, wholeOk: 0, pieceOk: 0, unmarked: 0, unmarkedGain: 0, unmarkedLoss: 0, misses: [] })
const tally: Record<'pdf' | 'xml', Tally> = { pdf: mk(), xml: mk() }

const limit = Number(argAssigned('limit') ?? 400)
const docs: any[] = []
for (let page = 1; page <= 4 && docs.length < limit; page++) {
  const body = await risJson({ Applikation: 'Begut', DokumenteProSeite: 'OneHundred', Seitennummer: String(page) })
  const refs = asArray<any>(body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference)
  if (refs.length === 0) break
  docs.push(...refs)
}
console.log(`${docs.length} Begut-Sätze aus dem RIS\n`)

for (const doc of docs.slice(0, limit)) {
  const meta = doc?.Data?.Metadaten
  const begut = meta?.Bundesrecht?.Begut
  const cite = String(begut?.Begutachtungsverfahrennummer ?? meta?.Bundesrecht?.Kurztitel ?? meta?.Technisch?.ID ?? '?').slice(0, 30)
  const beginn: string | null = begut?.BeginnBegutachtungsfrist ?? null
  const contents = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
  const main = contents.find((c) => c?.ContentType === 'MainDocument')
  const annex = contents.find((c) => ANNEX_NAME_RE.test(String(c?.Name ?? '')))
  if (!annex || !beginn) continue
  try {
    const annexXml = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
    const pdfUrl = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Pdf')?.Url ?? null
    const annexXmlText = annexXml ? await getText(annexXml) : null
    const readable = annexXmlText !== null && !isScanned(annexXmlText)
    if (!readable && !pdfUrl) continue
    const mainXml = asArray<any>(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
    if (!mainXml) continue
    const articles = draftArticles(parseRisXml(await getText(mainXml)))
    const amending = articles.filter((a) => a.amends)
    if (amending.length === 0) continue
    const parsed: ComparisonParse = readable
      ? parseTextComparison(annexXmlText!, articles)
      : parseAnnexPdf(await pagesOf(new Uint8Array(await (await fetch(pdfUrl!, { headers: { 'User-Agent': scriptUserAgent(SCRIPT) } })).arrayBuffer())), articles)
    if (parsed.refusal) continue

    const t = tally[readable ? 'xml' : 'pdf']
    t.drafts++
    // Ein RIS-Nachschlag je Gesetz des Pakets, nicht je Zeile — dieselbe
    // Auflösung wie in `harness/annexPdf.ts`.
    const byKey = new Map<string | null, DraftArticle>(articles.map((a) => [a.key, a]))
    const resolved = new Map<string | null, KonsLawAtDate | null>()
    const lawOf = async (k: string | null): Promise<KonsLawAtDate | null> => {
      if (resolved.has(k)) return resolved.get(k)!
      const article = k === null ? (amending.length === 1 ? amending[0]! : null) : byKey.get(k)
      const law = article?.bgbl ? await resolveLawByBgbl(article.bgbl, beginn, article.title).catch(() => null) : null
      resolved.set(k, law)
      return law
    }

    let hit = false
    for (const r of parsed.rows) {
      // Genau die Zeilen, über die das Orakel urteilt (`oracleVerdict`).
      if (r.kind !== 'pair' || r.elided || r.change === 'unchanged') continue
      t.rows++
      const inner = MARK_RE.test(r.current)
      if (inner) { t.inner++; hit = true }
      if (MARK_RE.test(r.proposed)) t.innerProposed++
      if (!r.current) continue

      const gld = r.gld ?? r.para
      const dk = gld ? designationKey(gld) : null
      if (!dk) continue
      const law = await lawOf(r.law)
      if (!law) continue
      const entry = Object.entries(law.paragraphs).find(([label]) => designationKey(label) === dk)
      if (!entry) continue
      const tree = await fetchParagraphTree(entry[1])
      if (!tree) continue
      const standing = key(plainText(tree))
      const whole = containedWhole(standing, r.current)
      const piece = containedPiecewise(standing, r.current)
      if (!inner) {
        // Ohne Marke ist die Zelle ein Stück, die Segmentierung also wirkungslos.
        // Was hier auseinandergeht, sind die beiden Regeln vom 26.09. (Kennung
        // überall, Überschriftenstapel) — deshalb in beide Richtungen gezählt:
        // ein Verlust wäre ein Rückschritt, ein Gewinn ist der Ertrag.
        t.unmarked++
        if (!whole && piece) t.unmarkedGain++
        if (whole && !piece) t.unmarkedLoss++
        continue
      }
      t.checked++
      if (whole) t.wholeOk++
      if (piece) t.pieceOk++
      else if (t.misses.length < 12) {
        const bad = printedStretches(r.current).find((s) => key(s) !== '' && !standing.includes(key(s))) ?? '—'
        t.misses.push(`${cite} ${gld}: ${bad.slice(0, 96)}`)
      }
    }
    if (hit) t.draftsWithInner++
  } catch (err) {
    console.log(`  ? ${cite} ${String(err).slice(0, 90)}`)
  }
}

for (const path of ['pdf', 'xml'] as const) {
  const t = tally[path]
  const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)} %` : '—')
  console.log(`\n${'='.repeat(74)}`)
  console.log(path === 'pdf' ? 'PDF-Pfad (eine Zeile ist ein ganzer Paragraph)' : 'Tabellenpfad (eine Zeile ist ein Absatz)')
  console.log(`  Entwürfe mit lesbarer Beilage            : ${t.drafts}`)
  console.log(`  …davon mit Binnenauslassung in einer Substanzzeile: ${t.draftsWithInner} (${pct(t.draftsWithInner, t.drafts)})`)
  console.log(`  Substanzzeilen                           : ${t.rows}`)
  console.log(`    geltende Spalte mit Auslassungsmarke   : ${t.inner} (${pct(t.inner, t.rows)})`)
  console.log(`    vorgeschlagene Spalte mit Marke        : ${t.innerProposed} (${pct(t.innerProposed, t.rows)})`)
  console.log(`  Check 1 gegen den geltenden Text im RIS, Zeilen mit Marke: ${t.checked}`)
  console.log(`    alt  (ganze Zelle als eine Zeichenfolge): ${t.wholeOk} (${pct(t.wholeOk, t.checked)})`)
  console.log(`    neu  (an den Marken segmentiert)        : ${t.pieceOk} (${pct(t.pieceOk, t.checked)})`)
  console.log(`  Zeilen ohne Marke: ${t.unmarked}, davon neu bestanden: ${t.unmarkedGain}, neu verloren: ${t.unmarkedLoss} (Verlust muss 0 sein)`)
  for (const m of t.misses) console.log(`      · ${m}`)
}
