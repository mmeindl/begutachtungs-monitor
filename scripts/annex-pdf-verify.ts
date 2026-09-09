#!/usr/bin/env vite-node
/**
 * Checks the annex PDF parser against the standing law in RIS (docs/api-exploration.md §2c).
 *
 * The annex's *left* column claims to be the law as it stands when the draft
 * is published. RIS holds that text independently, so the claim is checkable —
 * a self-check the XML path does not even have. Elision ("(1) und (2) …") means
 * the column is a deliberate subset, so the test is **containment** of the
 * column's words in the RIS paragraph, never equality.
 *
 * The reference date is the draft's `BeginnBegutachtungsfrist`, not a value
 * passed in. Taking it from the command line made the score swing from 66,7 %
 * to 88,9 % on one and the same document (8/ME, 2026-09-09) — the measurement
 * was then saying more about the argument than about the parser.
 *
 * Multi-law packages are scored per law. The annex's Artikel headings are
 * cross-checked against the draft's own Artikel list (`annexBoundaries.ts`),
 * each § is looked up in the Stammnorm of *its* law, and a package whose
 * boundaries do not survive that check is refused rather than guessed — in
 * the multi-law annexes 15,1 % of § designations recur in another law of the
 * same package, so a misplaced boundary scores the parser against unrelated
 * text and would flatter or damn it at random.
 *
 * Usage:  npx vite-node scripts/annex-pdf-verify.ts --gp=XXVIII [--limit=N] [--only=8]
 */
import { getDocumentProxy } from 'unpdf'
import { parseAnnexPdf, type AnnexPage } from '../server/utils/annexPdf'
import { plainText } from '../server/utils/lawStructure'
import { parseRisXml } from '../server/utils/lawText'
import { draftArticles, type DraftArticle } from '../server/utils/lawTitles'
import { fetchParagraphTree, getText, resolveLawByBgbl, type KonsLawAtDate } from '../server/utils/risKons'
import { isScanned } from '../server/utils/textComparison'
import { installFetchCache } from './harness-cache'

installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

const RIS = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'
const UA = { 'User-Agent': 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)', Accept: 'application/json' }

/* eslint-disable @typescript-eslint/no-explicit-any */
const asArray = <T,>(x: T | T[] | null | undefined): T[] => (x === null || x === undefined ? [] : Array.isArray(x) ? x : [x])

async function risJson(params: Record<string, string>): Promise<any> {
  const res = await fetch(`${RIS}?${new URLSearchParams(params)}`, { headers: UA, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

async function pagesOf(bytes: Uint8Array): Promise<AnnexPage[]> {
  const doc = await getDocumentProxy(bytes)
  const out: AnnexPage[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    out.push({
      width: page.getViewport({ scale: 1 }).width,
      items: content.items
        .filter((i: any) => typeof i.str === 'string')
        .map((i: any) => ({ x: i.transform[4], y: i.transform[5], width: i.width ?? 0, text: i.str })),
    })
  }
  return out
}

/**
 * What is not comparable, on either side.
 *
 * Three of these were the ruler blaming the parse for its own gaps
 * (2026-09-09), which is the third time in this project that the measuring
 * instrument was worse than the thing measured:
 *
 * - **Elision.** "(1) bis (3) …" says three Absätze are unchanged and left
 *   out. It is the annex's own syntax; "bis" is not law text, and it was the
 *   single most frequent "missing" word in the corpus. The same syntax runs
 *   over §§ and Ziffern too: "§ 21. bis § 25. …", "1. bis 100. …".
 * - **The row's own designation.** RIS keeps "§ 217." as the paragraph's
 *   marker, not as its text, so the column's designation can never be found
 *   and "217" counted as a missing word.
 * - **RIS's editorial notes.** "(Anm.: Abs. 2 aufgehoben durch …)" is not
 *   law; `lawStructure.ts` strips it from the RIS side, and the annex copies
 *   it verbatim — so it has to go from the column side as well, or the
 *   asymmetry is scored against the parse.
 * - **RIS web-view boilerplate.** A few annexes paste "Beachte für folgende
 *   Bestimmung" along with the text; it is in no XML.
 *
 * What is *no longer* discounted: Abschnitt, Hauptstück and Teil headings.
 * The premise was that RIS files them outside the §. It does not — they are
 * inside every § document, and `parseKonsParagraph` was dropping them
 * (§ 12 of one law carries six). They are compared now, from `node.context`.
 */
/** Below this many comparable words a row says nothing about the parse. */
const MIN_PROSE_TOKENS = 15

/** A chain of designations joined by "bis"/"und", closed by three dots. */
const ELISION_RE = /(?:§+\s*)?\(?\d+[a-z]*\)?\.?(?:\s*(?:bis|und|,)\s*(?:§+\s*)?\(?\d+[a-z]*\)?\.?)*\s*(?:\.\.\.|…)/g
/** "§ 217." — the designation form, which ends in a period; a citation does not. */
const DESIGNATION_RE = /(?:^|\s)§+\s*\d+[a-z]*\.(?=\s|$)/g
const ANNOTATION_RE = /\(Anm\.:[^()]*(?:\([^()]*\)[^()]*)*\)/g
const BOILERPLATE_RE = /Beachte für folgende Bestimmung/gi

const tokens = (t: string): string[] =>
  t
    .replace(ANNOTATION_RE, ' ')
    .replace(BOILERPLATE_RE, ' ')
    .replace(ELISION_RE, ' ')
    .replace(DESIGNATION_RE, ' ')
    .replace(/(?:\.\.\.|…)/g, ' ')
    .toLowerCase()
    .replace(/[„“”"'‚‘’]/g, '')
    .replace(/[­‑]/g, '-')
    .split(/[^\p{L}\p{N}§-]+/u)
    .filter((w) => w.length > 2)

interface DraftResult {
  cite: string
  source: 'xml' | 'pdf'
  checked: number
  clean: number
  note: string | null
  worst: string[]
  /** Every row's coverage ratio, for the distribution — a mean hides the shape */
  ratios: number[]
  /** Rows carrying enough prose to be evidence either way, and their clean count */
  substantial: number
  substantialClean: number
  tooShort: number
  /** Amending Artikel in the draft — 1 for a plain Novelle, N for a package */
  laws: number
  /** Rows the boundary check could attribute to a law, and rows it could not */
  attributed: number
  unattributed: number
  /** Why a row carries no law: the annex left it outside every boundary, or RIS has no such law */
  noLaw: number
  unresolvedLaw: number
}

async function verify(doc: any): Promise<DraftResult | null> {
  const meta = doc?.Data?.Metadaten
  const begut = meta?.Bundesrecht?.Begut
  const cite = String(begut?.Begutachtungsverfahrennummer ?? begut?.Verfahrensnummer ?? meta?.Bundesrecht?.Kurztitel ?? meta?.Technisch?.ID ?? '?').slice(0, 34)
  const beginn: string | null = begut?.BeginnBegutachtungsfrist ?? null
  const blank = (note: string, laws = 0): DraftResult => ({ cite, source: 'pdf', checked: 0, clean: 0, note, worst: [], ratios: [], substantial: 0, substantialClean: 0, tooShort: 0, laws, attributed: 0, unattributed: 0, noLaw: 0, unresolvedLaw: 0 })
  if (!beginn) return blank('kein Beginn der Begutachtungsfrist')

  const contents = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
  const main = contents.find((c) => c?.ContentType === 'MainDocument')
  const annex = contents.find((c) => /gegen.?über|^TG(Ü|G|UE)$/i.test(String(c?.Name ?? '')))
  if (!annex) return null
  const annexXml = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  const pdfUrl = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Pdf')?.Url ?? null
  if (!pdfUrl) return blank('Beilage ohne PDF')
  // Only the rasterised ones are this parser's job; the readable XML has its
  // own path and is the better source where it exists.
  if (annexXml && !isScanned(await getText(annexXml))) return null

  const mainXml = asArray<any>(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  if (!mainXml) return blank('Entwurf ohne XML')
  const articles = draftArticles(parseRisXml(await getText(mainXml)))
  const amending = articles.filter((a) => a.amends)
  if (amending.length === 0) return blank('keine Promulgationsklausel — Stammgesetz oder unlesbar')

  const bytes = new Uint8Array(await (await fetch(pdfUrl, { headers: { 'User-Agent': UA['User-Agent'] } })).arrayBuffer())
  const parsed = parseAnnexPdf(await pagesOf(bytes), articles)
  if (parsed.refusal) return blank(`verweigert: ${parsed.refusal.slice(0, 52)}`, amending.length)

  // One RIS lookup per law of the package, not per row. A law whose Stammnorm
  // is not a BGBl at all (the UGB is "dRGBl. S. 219/1897") has nothing to
  // resolve — its rows are set aside, not scored against a wrong law.
  const byKey = new Map<string | null, DraftArticle>(articles.map((a) => [a.key, a]))
  const resolved = new Map<string | null, KonsLawAtDate | null>()
  const lawOf = async (key: string | null): Promise<KonsLawAtDate | null> => {
    if (resolved.has(key)) return resolved.get(key)!
    const article = key === null ? (amending.length === 1 ? amending[0]! : null) : byKey.get(key)
    // The Artikel's own title is what tells the Bankwesengesetz from the
    // Bausparkassengesetz when both were promulgated by BGBl. Nr. 532/1993.
    const law = article?.bgbl ? await resolveLawByBgbl(article.bgbl, beginn, article.title).catch(() => null) : null
    resolved.set(key, law)
    return law
  }

  let checked = 0
  let clean = 0
  const worst: string[] = []
  const ratios: number[] = []
  let substantial = 0
  let substantialClean = 0
  let tooShort = 0
  let attributed = 0
  let unattributed = 0
  let noLaw = 0
  let unresolvedLaw = 0
  for (const row of parsed.rows) {
    if (row.kind !== 'pair' || !row.gld || !row.current) continue
    const id = /(\d+[a-z]*(?:\.\d+)?|[IVXL]+)/.exec(row.gld)?.[1]
    if (!id) continue
    const law = await lawOf(row.law)
    if (!law) {
      unattributed++
      if (row.law === null) noLaw++
      else unresolvedLaw++
      continue
    }
    attributed++
    // RIS prints an Anlage as "Anl. 1", never as "§ 1" — looking it up among
    // the paragraphs compared a schedule against an unrelated provision.
    const isAnlage = /^(?:Anlage|Anhang)/i.test(row.gld)
    const wanted = isAnlage ? new RegExp(`^Anl\\.?\\s*${id}\\b`, 'i') : new RegExp(`^§+\\s*${id.replace('.', '\\.')}(?![.\\d])`)
    const entry = Object.entries(law.paragraphs).find(([label]) => wanted.test(label))
    if (!entry) continue
    const tree = await fetchParagraphTree(entry[1])
    if (!tree) continue
    checked++
    // The headings above the § belong to a group of §§ and are deliberately
    // out of `plainText`; the annex prints them over the § all the same.
    const have = new Set(tokens([...tree.context, plainText(tree)].join(' ')))
    const want = tokens(row.current)
    if (want.length === 0) continue
    const missing = want.filter((w) => !have.has(w))
    const ratio = 1 - missing.length / want.length
    ratios.push(ratio)
    // A row that is a heading plus "(1) bis (3) …" carries almost no prose:
    // the annex deliberately shows nothing of the provision, and RIS files the
    // group heading above it elsewhere. Such a row is not evidence about the
    // parse in either direction, so it is counted and set aside rather than
    // scored (2026-09-09).
    if (want.length >= MIN_PROSE_TOKENS) {
      substantial++
      if (ratio >= 0.99) substantialClean++
    } else tooShort++
    if (ratio >= 0.99) clean++
    else worst.push(`${row.gld} ${(ratio * 100).toFixed(0)} % (fehlt: ${missing.slice(0, 6).join(' ')})`)
    if (dumpWorst && ratio < 0.5) {
      console.log(`\n    ### ${cite} ${row.gld} — ${(ratio * 100).toFixed(0)} % gedeckt`)
      console.log(`      LAW   : ${row.law ?? '—'}`)
      console.log(`      SPALTE: ${row.current.slice(0, 230)}`)
      console.log(`      RIS   : ${plainText(tree).slice(0, 230)}`)
    }
  }
  return { cite, source: 'pdf', checked, clean, note: null, worst, ratios, substantial, substantialClean, tooShort, laws: amending.length, attributed, unattributed, noLaw, unresolvedLaw }
}

// --- CLI ----------------------------------------------------------------------
const gp = process.argv.find((a) => a.startsWith('--gp='))?.slice('--gp='.length) ?? 'XXVIII'
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice('--limit='.length) ?? 400)
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? null
const dumpWorst = process.argv.includes('--dump-worst')

const docs: any[] = []
for (let page = 1; page <= 4 && docs.length < limit; page++) {
  const body = await risJson({
    Applikation: 'Begut',
    'Begut.Gesetzgebungsperiode': gp,
    DokumenteProSeite: 'OneHundred',
    Seitennummer: String(page),
  })
  const refs = asArray<any>(body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference)
  if (refs.length === 0) break
  docs.push(...refs)
}
console.log(`GP ${gp}: ${docs.length} Entwürfe aus dem RIS\n`)

const results: DraftResult[] = []
for (const doc of docs.slice(0, limit)) {
  const label = `${doc?.Data?.Metadaten?.Bundesrecht?.Begut?.Begutachtungsverfahrennummer ?? ''} ${doc?.Data?.Metadaten?.Bundesrecht?.Kurztitel ?? ''} ${doc?.Data?.Metadaten?.Bundesrecht?.Titel ?? ''}`
  if (only && !label.toLowerCase().includes(only.toLowerCase())) continue
  try {
    const r = await verify(doc)
    if (!r) continue
    results.push(r)
    if (r.note) console.log(`  ·  ${r.cite.padEnd(9)} ${r.note}`)
    else console.log(`  ${r.clean === r.checked ? '✓' : '✗'}  ${r.cite.padEnd(9)} ${r.clean}/${r.checked} Paragraphen ≥99 % im RIS${r.worst.length ? ` — ${r.worst.slice(0, 2).join('; ')}` : ''}`)
  } catch (err) {
    console.log(`  ?  ${String(doc?.Data?.Metadaten?.Bundesrecht?.Kurztitel ?? '?').slice(0, 9).padEnd(9)} ${String(err).slice(0, 90)}`)
  }
}

const scored = results.filter((r) => r.note === null && r.checked > 0)
const checked = scored.reduce((n, r) => n + r.checked, 0)
const clean = scored.reduce((n, r) => n + r.clean, 0)
console.log(`\n${'='.repeat(74)}`)
console.log(`Gerasterte Beilagen mit PDF-Textebene, gegen den geltenden Text im RIS`)
console.log(`  auswertbare Entwürfe   : ${scored.length} von ${results.length} mit gerasterter Beilage`)
console.log(`  geprüfte Paragraphen   : ${checked}`)
console.log(`  ≥99 % im RIS gedeckt   : ${clean} (${checked ? ((clean / checked) * 100).toFixed(1) : '—'} %)`)
const sub = scored.reduce((n, r) => n + r.substantial, 0)
const subClean = scored.reduce((n, r) => n + r.substantialClean, 0)
console.log(`  davon mit echtem Fließtext (≥ ${MIN_PROSE_TOKENS} Wörter): ${sub}`)
console.log(`    ≥99 % gedeckt        : ${subClean} (${sub ? ((subClean / sub) * 100).toFixed(1) : '—'} %)`)
console.log(`  zu kurz zum Prüfen (Überschrift/Auslassung): ${scored.reduce((n, r) => n + r.tooShort, 0)}`)
const packages = results.filter((r) => r.laws > 1)
console.log(`  Sammelgesetze              : ${packages.length} (${packages.reduce((n, r) => n + r.laws, 0)} Gesetze), abgegrenzt: ${packages.filter((r) => r.note === null).length}`)
console.log(`  Zeilen ohne Gesetzeszuordnung: ${scored.reduce((n, r) => n + r.unattributed, 0)} von ${scored.reduce((n, r) => n + r.attributed + r.unattributed, 0)}`)
console.log(`    außerhalb jeder Artikelgrenze: ${scored.reduce((n, r) => n + r.noLaw, 0)}`)
console.log(`    Stammnorm im RIS nicht auflösbar: ${scored.reduce((n, r) => n + r.unresolvedLaw, 0)}`)
const all = scored.flatMap((r) => r.ratios).sort((a, b) => a - b)
if (all.length) {
  const q = (p: number) => all[Math.min(all.length - 1, Math.floor(all.length * p))]!
  console.log(`  Deckungsgrad je Paragraph: Median ${(q(0.5) * 100).toFixed(0)} %, p25 ${(q(0.25) * 100).toFixed(0)} %, p10 ${(q(0.1) * 100).toFixed(0)} %`)
  const buckets = [0.5, 0.8, 0.9, 0.95, 0.99, 1.01]
  let low = 0
  for (const b of buckets) {
    const n = all.filter((r) => r >= low && r < b).length
    console.log(`    ${(low * 100).toFixed(0).padStart(3)}–${(Math.min(b, 1) * 100).toFixed(0).padStart(3)} % : ${String(n).padStart(4)}`)
    low = b
  }
}
for (const [note, n] of [...results.filter((r) => r.note).reduce((m, r) => m.set(r.note!.replace(/\(\d+ Gesetze\)/, '(N Gesetze)').replace(/BGBl\.[^ ]* \d+\/\d+/, 'BGBl. …'), (m.get(r.note!.replace(/\(\d+ Gesetze\)/, '(N Gesetze)').replace(/BGBl\.[^ ]* \d+\/\d+/, 'BGBl. …')) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])) {
  console.log(`  ·  ${String(n).padStart(3)}× ${note}`)
}
