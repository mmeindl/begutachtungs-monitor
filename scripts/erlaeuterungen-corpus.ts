/**
 * Can the Erläuterungen be read, or only linked? — the measurement that gates
 * the Erläuterungen package (`TODO.md`, docs/architecture.md §12.29).
 *
 * The relevance check starts at the Allgemeiner Teil: what is this law
 * supposed to do. The page has been offering that document as a PDF link and
 * nothing else. Before a section prints it inline, three numbers have to exist,
 * and one draft read by eye is not a number — the Verordnung note in `TODO.md`
 * was written that way and got two of its three claims wrong:
 *
 *  1. HOW MANY drafts carry an Erläuterungen document as XML at all?
 *  2. Of those, how many say „Allgemeiner Teil" in a typed heading — i.e. can
 *     the part be isolated without guessing? And how long is it, because a
 *     section that prints 40.000 characters inline is not a triage aid.
 *  3. In the Besonderer Teil, how often does a passage heading name its § —
 *     the join key for hanging passages beside the Textgegenüberstellung,
 *     which is the second half of the package and not built here.
 *
 *     pnpm audit:erlaeuterungen                    # drafts since 2024-01-01
 *     pnpm audit:erlaeuterungen -- --since 2020-01-01
 *     pnpm audit:erlaeuterungen -- --all           # the whole corpus (~3.200 documents)
 *     pnpm audit:erlaeuterungen -- --sample 120    # a deterministic subset of the window
 *     pnpm audit:erlaeuterungen -- --show BEGUT_…  # print one document's parse
 *     pnpm audit:erlaeuterungen -- --join          # step 2: passages against the annex's §§
 *
 * Runs through `parseExplanations`, the shipped parser: the numbers are what
 * the page would show. Reads only; nothing is written.
 */
import { createHash } from 'node:crypto'
import { classifyRisRecord, type RisClass } from '../server/utils/ris/risJoin'
import { parseExplanations, type ExplanationsDocument } from '../server/utils/explanations'
import { explanationsByParagraph } from '../server/utils/explanationsJoin'
import { explanationKey, explanationParaId } from '../shared/utils/explanationKey'
import { parseRisXml } from '../server/utils/lawText'
import { draftArticles } from '../server/utils/lawTitles'
import { parseTextComparison } from '../server/utils/annex/comparisonRows'
import { isScanned } from '../server/utils/annex/tableCells'
import { hasDocument, type RisBegutFlat } from '../server/utils/ris/risRecord'
import { fetchRisBegutCorpus } from './risCorpus'

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null
}

const since = arg('since') ?? '2024-01-01'
const all = process.argv.includes('--all')
const sample = Number(arg('sample') ?? 0)
const show = arg('show')
const join = process.argv.includes('--join')
const CONCURRENCY = 4

if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
  console.error('--since expects an ISO date, e.g. 2024-01-01')
  process.exit(1)
}

const USER_AGENT = 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at; scripts/erlaeuterungen-corpus)'

async function fetchText(url: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw lastError
}

/** Deterministic subset: the same `--sample 120` twice reads the same documents. */
function stableOrder(records: RisBegutFlat[]): RisBegutFlat[] {
  return [...records].sort((a, b) =>
    createHash('sha1').update(a.id).digest('hex').localeCompare(createHash('sha1').update(b.id).digest('hex')),
  )
}

async function pool<T, R>(items: T[], n: number, run: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) {
        out[i] = await run(items[i]!, i)
        process.stderr.write(`\rdocuments: ${Math.min(next, items.length)}/${items.length}`)
      }
    }),
  )
  process.stderr.write('\n')
  return out
}

interface Row {
  record: RisBegutFlat
  cls: RisClass
  doc: ExplanationsDocument | null
  error: string | null
}

/**
 * SCHRITT 2: Landen die Passagen des Besonderen Teils an ihrem Paragraphen?
 *
 * Gemessen wird der Join selbst, nicht seine Zutaten: je Entwurf werden das
 * Hauptdokument (für die Artikel), die Textgegenüberstellung und die
 * Erläuterungen gelesen — alle drei durch die Produktionsparser — und dann
 * gezählt, was zueinander findet. Die drei Zahlen, auf die es ankommt:
 *
 *  - **Deckung:** Anteil der §§ der Beilage, die eine Begründung bekommen.
 *    Das ist, was der Leser sieht.
 *  - **Verlust:** Passagen, die keinen § der Beilage treffen. Sie sind nicht
 *    falsch, sie sind unsichtbar — und wenn es viele sind, ist der Schlüssel
 *    der falsche und nicht die Beilage unvollständig.
 *  - **Verworfen:** Passagen, deren Gesetz in einem Mehrgesetzespaket nicht
 *    bestimmbar war. Das ist die Regel aus `explanationsJoin.ts` bei der
 *    Arbeit, und ihre Kosten müssen sichtbar sein.
 */
async function measureJoin(records: RisBegutFlat[]): Promise<void> {
  const usable = records.filter((r) => r.explanations?.xml && r.textComparison?.xml && r.mainDocument.xml)
  console.log(`\n\n# Schritt 2 — Passagen am Paragraphen`)
  console.log(`Entwürfe mit Erläuterungen, Gegenüberstellung und Entwurfstext als XML: ${usable.length} von ${records.length}`)

  interface JoinRow {
    id: string
    cite: string
    /** §§ der Beilage (Gesetz + Paragraph), die überhaupt Zeilen tragen */
    paras: number
    /** davon mit Begründung */
    matched: number
    /** Passagen, die keinen § der Beilage treffen */
    orphans: number
    /** Passagen, in einem Mehrgesetzespaket ohne bestimmbares Gesetz verworfen */
    dropped: number
    /** Passagen des Besonderen Teils insgesamt (mit Text und §-Adresse) */
    passages: number
    note: string | null
  }

  // Ein Entwurf im Detail: die drei Schlüsselmengen nebeneinander. Ohne das
  // sieht man nur, DASS nichts zueinander findet, nie warum.
  if (show) {
    for (const record of usable) {
      const [mainXml, annexXml, erlXml] = await Promise.all([
        fetchText(record.mainDocument.xml!),
        fetchText(record.textComparison!.xml!),
        fetchText(record.explanations!.xml!),
      ])
      const articles = draftArticles(parseRisXml(mainXml))
      const parse = parseTextComparison(annexXml, articles)
      const doc = parseExplanations(erlXml)
      console.log(`\n## ${record.id} — ${(record.kurztitel ?? record.titel ?? '').slice(0, 70)}`)
      console.log(`\nArtikel des Entwurfs (${articles.length}):`)
      for (const a of articles) console.log(`  numeral=${a.numeral ?? '—'}  key=${a.key ?? '—'}`)
      const annexParas = new Map<string, number>()
      for (const row of parse.rows) {
        if (row.kind !== 'pair') continue
        const para = explanationParaId(row.para)
        if (para) annexParas.set(explanationKey(row.law, para), (annexParas.get(explanationKey(row.law, para)) ?? 0) + 1)
      }
      console.log(`\n§§ der Beilage (${annexParas.size}):`)
      for (const [k, n] of [...annexParas].slice(0, 25)) console.log(`  ${JSON.stringify(k)}  ${n} Zeilen`)
      const entries = explanationsByParagraph(doc, articles)
      console.log(`\nPassagen des Besonderen Teils (${doc.special?.passages.length ?? 0}), daraus ${entries.length} Einträge:`)
      for (const p of (doc.special?.passages ?? []).slice(0, 25)) {
        console.log(`  „${p.heading}"  article=${p.article ?? '—'}  §§=${p.paragraphs.join(',') || '—'}  Absätze=${p.text.length}`)
      }
      console.log(`\nEinträge:`)
      for (const e of entries.slice(0, 25)) console.log(`  ${JSON.stringify(explanationKey(e.law, e.para))}  ${annexParas.has(explanationKey(e.law, e.para)) ? 'TREFFER' : 'kein Ziel'}`)
    }
    return
  }

  const rows = await pool(usable, CONCURRENCY, async (record): Promise<JoinRow> => {
    const cite = (record.kurztitel ?? record.titel ?? '').slice(0, 60)
    try {
      const [mainXml, annexXml, erlXml] = await Promise.all([
        fetchText(record.mainDocument.xml!),
        fetchText(record.textComparison!.xml!),
        fetchText(record.explanations!.xml!),
      ])
      if (isScanned(annexXml)) return { id: record.id, cite, paras: 0, matched: 0, orphans: 0, dropped: 0, passages: 0, note: 'Beilage ist ein Scan' }
      const articles = draftArticles(parseRisXml(mainXml))
      const parse = parseTextComparison(annexXml, articles)
      if (!parse.rows.length) return { id: record.id, cite, paras: 0, matched: 0, orphans: 0, dropped: 0, passages: 0, note: parse.unreadable ?? 'Beilage ohne Zeilen' }
      /**
       * Die Beilage hat ihre Gesetzesgrenzen nicht markiert, das Paket hat
       * aber mehrere: Dann trägt § 14 der Beilage keine Auskunft darüber,
       * welches Gesetz gemeint ist, und zwei Erläuterungspassagen können
       * genau darauf zeigen. Hier wird **nicht** angehängt — dieselbe
       * Verweigerung, die `ComparisonRow.law` für sich selbst schon
       * ausspricht. Als Fehlschlag gezählt wäre das eine falsche Zahl über
       * den Join; es ist eine Eigenschaft der Beilage.
       */
      if (parse.refusal && articles.filter((a) => a.key !== null).length > 1) {
        return { id: record.id, cite, paras: 0, matched: 0, orphans: 0, dropped: 0, passages: 0, note: 'Beilage ohne Gesetzesgrenzen, Paket mit mehreren Gesetzen' }
      }

      // Die §§ der Beilage, unter demselben Schlüssel wie die Einträge.
      const annexParas = new Set<string>()
      for (const row of parse.rows) {
        if (row.kind !== 'pair') continue
        const para = explanationParaId(row.para)
        if (para) annexParas.add(explanationKey(row.law, para))
      }

      const doc = parseExplanations(erlXml)
      const passages = (doc.special?.passages ?? []).filter((p) => p.heading && p.text.length && p.paragraphs.length)
      const entries = explanationsByParagraph(doc, articles)
      const hit = new Set<string>()
      let orphans = 0
      for (const e of entries) {
        const key = explanationKey(e.law, e.para)
        if (annexParas.has(key)) hit.add(key)
        else orphans++
      }
      // Verworfen: Passagen, die Einträge hätten liefern müssen und keine lieferten.
      const expected = passages.reduce((n, p) => n + p.paragraphs.length, 0)
      return {
        id: record.id,
        cite,
        paras: annexParas.size,
        matched: hit.size,
        orphans,
        dropped: expected - entries.length,
        passages: passages.length,
        note: null,
      }
    } catch (err) {
      return { id: record.id, cite, paras: 0, matched: 0, orphans: 0, dropped: 0, passages: 0, note: String(err).slice(0, 80) }
    }
  })

  const ran = rows.filter((r) => r.note === null && r.paras > 0 && r.passages > 0)
  const notes = rows.filter((r) => r.note !== null)
  const refused = notes.filter((r) => r.note?.startsWith('Beilage ohne Gesetzesgrenzen'))
  const sum = (f: (r: JoinRow) => number) => ran.reduce((n, r) => n + f(r), 0)
  const paras = sum((r) => r.paras)
  const matched = sum((r) => r.matched)
  const entries = matched + sum((r) => r.orphans)

  console.log(`\n## Auswertbar (Beilage mit §§ UND Besonderer Teil mit Passagen): ${ran.length}`)
  console.log(`  ohne Besonderen Teil oder ohne §§ in der Beilage  ${rows.length - ran.length - notes.length}`)
  console.log(`  Beilage nicht lesbar oder ohne Gesetzesgrenzen    ${notes.length}`)
  console.log(`  davon bewusst nicht angehängt (Grenzen fehlen)    ${refused.length}`)
  console.log(`\n## Der Join (n = ${ran.length} Entwürfe)`)
  console.log(`  §§ in den Beilagen                    ${String(paras).padStart(6)}`)
  console.log(`  davon mit Begründung am Paragraphen   ${String(matched).padStart(6)}  ${((matched / paras) * 100).toFixed(1)} %`)
  console.log(`  Einträge aus den Erläuterungen        ${String(entries).padStart(6)}`)
  console.log(`  davon ohne § in der Beilage (Verlust) ${String(entries - matched).padStart(6)}  ${((1 - matched / entries) * 100).toFixed(1)} %`)
  console.log(`  verworfen (Gesetz nicht bestimmbar)   ${String(sum((r) => r.dropped)).padStart(6)}`)

  // Die Verteilung je Entwurf: ein Mittelwert über Entwürfe verschiedener
  // Größe verbirgt genau den Fall, der zählt — den Entwurf, bei dem nichts
  // zueinander findet.
  const share = ran.map((r) => r.matched / r.paras).sort((a, b) => a - b)
  const at = (q: number) => share[Math.min(share.length - 1, Math.floor(q * share.length))] ?? 0
  console.log(`  Deckung je Entwurf                    p10 ${(at(0.1) * 100).toFixed(0)} % · Median ${(at(0.5) * 100).toFixed(0)} % · p90 ${(at(0.9) * 100).toFixed(0)} %`)
  const none = ran.filter((r) => r.matched === 0)
  console.log(`  Entwürfe ganz ohne Treffer            ${String(none.length).padStart(6)}  ${((none.length / ran.length) * 100).toFixed(1)} %`)
  for (const r of none.slice(0, 12)) {
    console.log(`     ${r.id}  ${r.paras} §§, ${r.passages} Passagen, ${r.orphans} ohne Ziel`)
    console.log(`       ${r.cite}`)
  }
  if (notes.length) {
    console.log(`\n## Nicht ausgewertet (${notes.length})`)
    for (const r of notes.slice(0, 10)) console.log(`  ${r.id}  ${r.note}`)
  }
}

const corpus = await fetchRisBegutCorpus('erlaeuterungen-corpus')
const inWindow = corpus.records.filter((r) => all || (r.beginn ?? '') >= since)
const withXml = inWindow.filter((r) => r.explanations?.xml)
let targets = show ? corpus.records.filter((r) => r.id === show) : withXml
if (sample > 0 && !show) targets = stableOrder(targets).slice(0, sample)

console.log(`# Erläuterungen im RIS-Begut-Korpus`)
console.log(`Korpus ${corpus.records.length} Sätze · Fenster ${all ? 'alle' : `Beginn ab ${since}`}: ${inWindow.length} Sätze`)
console.log(
  `  Erläuterungen-Dokument vorhanden   ${String(inWindow.filter((r) => hasDocument(r.explanations)).length).padStart(5)}` +
  `  ${((inWindow.filter((r) => hasDocument(r.explanations)).length / inWindow.length) * 100).toFixed(1)} %`,
)
console.log(`  davon als XML lesbar angeboten     ${String(withXml.length).padStart(5)}  ${((withXml.length / inWindow.length) * 100).toFixed(1)} %`)
console.log(`  gelesen in diesem Lauf            ${String(targets.length).padStart(5)}`)

if (join) {
  await measureJoin(targets)
  process.exit(0)
}

const rows: Row[] = await pool(targets, CONCURRENCY, async (record) => {
  const cls = classifyRisRecord(record)
  try {
    const xml = await fetchText(record.explanations!.xml!)
    return { record, cls, doc: parseExplanations(xml), error: null }
  } catch (err) {
    return { record, cls, doc: null, error: String(err) }
  }
})

if (show) {
  for (const { record, doc, error } of rows) {
    console.log(`\n## ${record.id} — ${(record.kurztitel ?? record.titel ?? '').slice(0, 80)}`)
    if (error || !doc) {
      console.log(`  FEHLER ${error}`)
      continue
    }
    for (const part of doc.parts) {
      console.log(`\n  [${part.kind}] ${part.heading ?? '(ohne Überschrift)'} — ${part.chars} Zeichen, ${part.passages.length} Passagen, ${part.dropped} verworfen`)
      for (const p of part.passages.slice(0, 40)) {
        const address = [...p.items, ...p.paragraphs].join(' ')
        console.log(`     · ${(p.heading ?? '(Fließtext)').slice(0, 70).padEnd(72)}${address ? `→ ${address}` : ''}`)
        if (p.text[0]) console.log(`       ${p.text[0].slice(0, 100)}…`)
      }
    }
  }
  process.exit(0)
}

// --- what the parse found --------------------------------------------------

const ok = rows.filter((r) => r.doc !== null)
const failed = rows.filter((r) => r.doc === null)
const empty = ok.filter((r) => r.doc!.chars === 0)
const readable = ok.filter((r) => r.doc!.chars > 0)

function pct(n: number, of: number): string {
  return `${String(n).padStart(5)}  ${of ? ((n / of) * 100).toFixed(1) : '0.0'} %`
}

function quantiles(values: number[]): string {
  if (!values.length) return '—'
  const s = [...values].sort((a, b) => a - b)
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!
  return `Median ${at(0.5)} · p90 ${at(0.9)} · max ${s[s.length - 1]}`
}

console.log(`\n## Gelesen (n = ${rows.length})`)
console.log(`  Abruf oder Parser gescheitert     ${pct(failed.length, rows.length)}`)
console.log(`  ohne jeden Text (Scan im XML)     ${pct(empty.length, rows.length)}`)
console.log(`  lesbarer Text                     ${pct(readable.length, rows.length)}`)

function partReport(label: string, rows: Row[]): void {
  if (!rows.length) return
  const general = rows.filter((r) => r.doc?.general)
  const labelled = rows.filter((r) => r.doc?.general && !r.doc.generalInferred)
  const inferred = rows.filter((r) => r.doc?.generalInferred)
  const special = rows.filter((r) => r.doc?.special)
  const neither = rows.filter((r) => r.doc && !r.doc.general && !r.doc.special)
  console.log(`\n## ${label} (n = ${rows.length})`)
  console.log(`  Allgemeiner Teil verfügbar        ${pct(general.length, rows.length)}`)
  console.log(`    davon vom Ressort so benannt    ${pct(labelled.length, rows.length)}`)
  console.log(`    davon erschlossen (unbenannt)   ${pct(inferred.length, rows.length)}`)
  console.log(`  „Besonderer Teil" erkannt         ${pct(special.length, rows.length)}`)
  console.log(`  weder noch                        ${pct(neither.length, rows.length)}`)
  console.log(`  WFA-Teil im Dokument (Veto)       ${pct(rows.filter((r) => r.doc?.parts.some((p) => p.kind === 'wfa')).length, rows.length)}`)
  console.log(`  Länge Allgemeiner Teil (Zeichen)  ${quantiles(general.map((r) => r.doc!.general!.chars))}`)
  console.log(`  Passagen im Allgemeinen Teil      ${quantiles(general.map((r) => r.doc!.general!.passages.length))}`)
  const dropped = general.filter((r) => r.doc!.general!.dropped > 0)
  console.log(`  Allg. Teil mit Tabelle/Abbildung  ${pct(dropped.length, general.length)}`)
}

partReport('Alle lesbaren Dokumente', readable)
partReport('Gesetzesentwürfe', readable.filter((r) => r.cls === 'gesetz'))
partReport('Verordnungsentwürfe', readable.filter((r) => r.cls === 'verordnung'))

// --- the long tail ---------------------------------------------------------
//
// The median Allgemeiner Teil is a page and a half; the longest are two orders
// of magnitude above it. Which is a fact about the drafts (a Budgetbegleitgesetz
// explains fifty laws) and a demand on the section: it clamps and expands, it
// does not print whatever it finds. Printed with the id so an outlier can be
// re-read with `--show` instead of being taken on trust.

const longest = readable
  .filter((r) => r.doc!.general)
  .sort((a, b) => b.doc!.general!.chars - a.doc!.general!.chars)
  .slice(0, 8)
console.log(`\n## Die längsten Allgemeinen Teile`)
for (const r of longest) {
  const g = r.doc!.general!
  console.log(
    `  ${String(g.chars).padStart(7)} Zeichen  ${String(g.passages.length).padStart(3)} Passagen  ` +
    `${r.doc!.generalInferred ? 'erschlossen' : 'benannt    '}  ${r.doc!.special ? 'mit BT ' : 'ohne BT'}  ` +
    `${r.record.id}\n      ${(r.record.kurztitel ?? r.record.titel ?? '').slice(0, 80)}`,
  )
}

// --- the Besonderer Teil as an address -------------------------------------
//
// The second half of the package: every passage that names its § can be hung
// beside that § in the Textgegenüberstellung. This counts the key, it does not
// join anything — the join is its own step with its own measurement.

const passages = readable.flatMap((r) => r.doc!.special?.passages ?? []).filter((p) => p.heading)
const named = passages.filter((p) => p.paragraphs.length > 0)
const itemOnly = passages.filter((p) => p.paragraphs.length === 0 && p.items.length > 0)
console.log(`\n## Besonderer Teil — adressieren die Passagen einen Paragraphen? (n = ${passages.length} Passagen)`)
console.log(`  Überschrift nennt einen §         ${pct(named.length, passages.length)}`)
console.log(`  nur eine Novellierungsanordnung   ${pct(itemOnly.length, passages.length)}`)
console.log(`  nennt beides (Z und §)            ${pct(passages.filter((p) => p.paragraphs.length && p.items.length).length, passages.length)}`)
console.log(`  Passagen je Entwurf               ${quantiles(readable.filter((r) => r.doc!.special).map((r) => r.doc!.special!.passages.length))}`)

// --- what we refuse to call the Allgemeiner Teil ---------------------------
//
// The strict rule costs coverage, and the cost has to be visible: these are the
// part headings of documents where no „Allgemeiner Teil" was found. A WFA
// form-sheet among them is the rule working; a plainly general part among them
// is a missed case and belongs in the pattern.

const missing = readable.filter((r) => !r.doc!.general)
const headings = new Map<string, number>()
for (const r of missing) {
  for (const p of r.doc!.parts) headings.set(p.heading ?? '(ohne Überschrift)', (headings.get(p.heading ?? '(ohne Überschrift)') ?? 0) + 1)
}
console.log(`\n## Ohne erkannten Allgemeinen Teil: ${missing.length} Dokumente, ihre Teil-Überschriften (top 25)`)
for (const [heading, n] of [...headings].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`  ${String(n).padStart(4)}  ${heading.slice(0, 90)}`)
}

// What the refusal costs, in words rather than in counts: the opening line of
// every refused document. Reasoning („Mit dieser Verordnung wird …") means the
// rule is too strict; a form-sheet („Ziel(e)") means it is doing its job.
console.log(`\n## Und was dort steht — erster Absatz je Dokument (${Math.min(missing.length, 30)} von ${missing.length})`)
for (const r of missing.slice(0, 30)) {
  const first = r.doc!.parts.flatMap((p) => p.passages).flatMap((p) => p.text)[0] ?? '(kein Text)'
  console.log(`  ${r.cls.padEnd(11)} ${r.record.id}`)
  console.log(`     ${(r.record.kurztitel ?? r.record.titel ?? '').slice(0, 88)}`)
  console.log(`     „${first.slice(0, 150)}…"`)
}

if (failed.length) {
  console.log(`\n## Fehler (${failed.length})`)
  for (const r of failed.slice(0, 15)) console.log(`  ${r.record.id}  ${r.error}`)
}
