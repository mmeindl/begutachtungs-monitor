/**
 * Where does Parliament's Kurzinformation come from? — the measurement behind
 * a licence question (`docs/architecture.md` §13.1,
 * `outreach/verfahrensfragen.md` E3).
 *
 * WHY THE QUESTION IS ASKED. Under „Worum geht es?" the draft page prints
 * Parliament's `content.shortinfo` — Ziele, Inhalt, Hauptgesichtspunkte. That
 * is prose, not metadata, and it comes from the dataset Parliament expressly
 * excludes from re-use as open data. It is therefore the one block of the
 * page for which the promise „der Monitor zeigt daraus ausschließlich
 * Metadaten" does not hold.
 *
 * The suspicion that would defuse the question: the Kurzinformation is not a
 * text of Parliament's at all but the ressort's — Vorblatt and Erläuterungen,
 * editorially shortened. RIS publishes the same documents under CC BY 4.0. If
 * the suspicion holds, the answer is not to delete the section but to read it
 * from the settled source.
 *
 * WHAT IS MEASURED. Per draft, `teil2` of the Kurzinformation (the prose under
 * „Hauptgesichtspunkte des Entwurfs") is cut into word windows and it is
 * counted how many of them stand **verbatim** in the ressort's Erläuterungen,
 * read through the production parser. `teil1` (Ziele/Inhalt) is reported
 * separately and NOT held against the Erläuterungen: those lists come from the
 * Vorblatt, which is a RIS document of its own that `flattenRisRecord` does
 * not carry today. So what is called „ungedeckt" here does not mean „vom
 * Parlament geschrieben" — it means „hier nicht geprüft".
 *
 *     pnpm corpus:kurzinfo                 # GP XXVII, every joined draft
 *     pnpm corpus:kurzinfo -- --sample 60  # the first 60 (by number)
 *     pnpm corpus:kurzinfo -- --show 1     # show one draft in detail
 *
 * GP XXVII, because the mapping draft ↔ RIS record exists there as a file
 * (`data/ris-me-map-gp27.json`, 350 rows, 337 joined) — so the script needs
 * no second join beside the shipped one. Read-only; nothing is written.
 */
import { readFileSync } from 'node:fs'
import { hasReadableText, parseExplanations } from '../../server/utils/explanations/risExplanations'
import { decodeEntities } from '../../server/utils/parliament/htmlText'
import { normalizeText, stripMarkup } from '../../server/utils/lawtext/normalize'
import { fetchRisBegutCorpus } from '../lib/corpus'
import { argPair } from '../lib/args'
import { PARLIAMENT, getText, type HttpOptions } from '../lib/http'
import { pool } from '../lib/async'
import { pct, quantileOfSorted } from '../lib/fmt'

const GP = 'XXVII'
const sample = Number(argPair('sample') ?? 0)
const show = argPair('show')
const CONCURRENCY = 4
/**
 * Eight words. Shorter catches legistic formulae („in der Fassung des
 * Bundesgesetzes") that stand in every second document and feign coverage;
 * longer breaks on every editorial cut Parliament makes and then measures the
 * cut instead of the provenance.
 */
const SHINGLE = 8

/** Three attempts on any failure — a missing document would silently shrink the sample. */
const FETCH: HttpOptions = { script: 'corpus/kurzinfo', attempts: 3, backoffMs: (retry) => 500 * retry, retryOnHttpError: true }
const fetchText = (url: string): Promise<string> => getText(url, FETCH)

/** Comparison form: no markup, no entities, lowercased, single spaces. */
function words(html: string): string[] {
  return normalizeText(decodeEntities(stripMarkup(html)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}§\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** The share of `needle`'s word windows that stand verbatim in `haystack`. */
function coverage(needle: string[], haystack: string): { windows: number; hits: number } {
  if (needle.length < SHINGLE) return { windows: 0, hits: 0 }
  let hits = 0
  let windows = 0
  for (let i = 0; i + SHINGLE <= needle.length; i++) {
    windows++
    if (haystack.includes(needle.slice(i, i + SHINGLE).join(' '))) hits++
  }
  return { windows, hits }
}

interface MapRow { inr: number; cite: string; status: string; risId: string | null }

interface Row {
  inr: number
  cite: string
  /** The draft's title at Parliament — for the duplicate groups below. */
  title: string
  /** Fingerprint of the Kurzinformation; same Kurzinformation = same value. */
  fingerprint: string
  /** Characters of the two parts, raw — says how much weight teil2 carries at all. */
  chars1: number
  chars2: number
  windows: number
  hits: number
  note: string | null
}

async function main(): Promise<void> {
  const map = JSON.parse(readFileSync('data/ris-me-map-gp27.json', 'utf8')) as { rows: MapRow[] }
  let joined = map.rows.filter((r) => r.status === 'matched' && r.risId)
  if (sample > 0) joined = joined.slice(0, sample)
  if (show) joined = joined.filter((r) => String(r.inr) === show)
  console.error(`${GP}: ${joined.length} Entwürfe mit RIS-Datensatz`)

  console.error('RIS-Korpus …')
  const corpus = await fetchRisBegutCorpus('corpus/kurzinfo')
  const byId = new Map(corpus.records.map((r) => [r.id, r]))

  const rows: Row[] = await pool(joined, CONCURRENCY, async (item): Promise<Row> => {
    const row: Row = { inr: item.inr, cite: item.cite, title: '', fingerprint: '', chars1: 0, chars2: 0, windows: 0, hits: 0, note: null }
    try {
      const record = byId.get(item.risId!)
      const xmlUrl = record?.explanations?.xml ?? null
      const detail = JSON.parse(await fetchText(`${PARLIAMENT}/gegenstand/${GP}/ME/${item.inr}?json=True`)) as
        { content?: { title?: string | null; shortinfo?: { teil1?: string | null; teil2?: string | null } | null } }
      const si = detail.content?.shortinfo
      const teil1 = si?.teil1 ?? ''
      const teil2 = si?.teil2 ?? ''
      row.title = (detail.content?.title ?? '').slice(0, 60)
      row.chars1 = stripMarkup(teil1).length
      row.chars2 = stripMarkup(teil2).length
      row.fingerprint = words(`${teil1} ${teil2}`).join(' ')
      if (!si || (!teil1 && !teil2)) { row.note = 'keine Kurzinformation'; return row }
      if (!teil2) { row.note = 'keine Prosa (nur Ziele/Inhalt)'; return row }
      if (!xmlUrl) { row.note = 'keine Erläuterungen als XML'; return row }

      // The haystack is the RAW document, not our reading of it: the
      // question is where a text comes from, not what our parser picks out
      // of it. `parseExplanations` leaves out tables and figures and splits
      // the Allgemeiner from the Besonderer Teil — both right for the page
      // and wrong for this measurement. Plus the draft text itself: the
      // Kurzinformation quotes from it in places.
      const xml = await fetchText(xmlUrl)
      const main = record?.mainDocument?.xml ? await fetchText(record.mainDocument.xml).catch(() => '') : ''
      const ministry = `${stripMarkup(xml)} ${stripMarkup(main)}`
      // A scan carries no text. Without this guard the script measures
      // „0 % gedeckt" and means „nothing to compare" — an artefact that
      // looks like a finding.
      const readable = parseExplanations(xml)
      const ministryWords = words(ministry)
      if (ministryWords.length < 200 || !hasReadableText(readable)) {
        row.note = 'Erläuterungen ohne Textebene (Scan)'
        return row
      }
      const haystack = ministryWords.join(' ')
      const { windows, hits } = coverage(words(teil2), haystack)
      row.windows = windows
      row.hits = hits
      if (windows === 0) row.note = 'Prosa zu kurz für ein Fenster'
      if (show) {
        console.log(`\n${row.cite} — Deckung ${pct(hits, windows)} (${hits}/${windows} Fenster)`)
        console.log(`\nKurzinformation teil2:\n${normalizeText(decodeEntities(stripMarkup(teil2))).slice(0, 600)}`)
        console.log(`\nDokumente des Ressorts (Ausschnitt):\n${normalizeText(ministry).slice(0, 600)}`)
      }
    } catch (err) {
      row.note = `Fehler: ${String(err).slice(0, 60)}`
    }
    return row
  }, (n, total) => process.stderr.write(`\rEntwürfe: ${n}/${total}`))
  process.stderr.write('\n')
  if (show) return

  // THE DUPLICATES FIRST, because they decide what the coverage below says
  // anything about at all: where a draft carries another one's
  // Kurzinformation, a comparison against ITS documents measures the mix-up,
  // not where the text comes from.
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    if (!r.fingerprint) continue
    groups.set(r.fingerprint, [...(groups.get(r.fingerprint) ?? []), r])
  }
  const dupes = [...groups.values()].filter((g) => g.length > 1)
  const duped = new Set(dupes.flat().map((r) => r.inr))

  const measured = rows.filter((r) => r.windows > 0 && !duped.has(r.inr))
  const covers = measured.map((r) => r.hits / r.windows).sort((a, b) => a - b)
  const high = measured.filter((r) => r.hits / r.windows >= 0.9).length
  const low = measured.filter((r) => r.hits / r.windows < 0.5).length
  const chars1 = rows.reduce((s, r) => s + r.chars1, 0)
  const chars2 = rows.reduce((s, r) => s + r.chars2, 0)

  console.log(`\n# Herkunft der Kurzinformation — GP ${GP}\n`)
  console.log(`Entwürfe geprüft: ${rows.length}`)
  for (const [note, n] of [...rows.reduce((m, r) => (r.note ? m.set(r.note.replace(/:.*/, ''), (m.get(r.note.replace(/:.*/, '')) ?? 0) + 1) : m), new Map<string, number>())]) {
    console.log(`  ${note}: ${n}`)
  }
  console.log(`\n## Fremde Kurzinformation`)
  console.log(`Entwürfe, deren Kurzinformation Wort für Wort die eines anderen Entwurfs ist: ${duped.size} in ${dupes.length} Gruppen`)
  for (const g of dupes.slice(0, 12)) {
    console.log(`  ${g.map((r) => r.cite).join(' = ')}`)
    for (const r of g) console.log(`      ${r.cite.padEnd(9)} ${r.title}`)
  }

  console.log(`\n## Herkunft (ohne die Duplikate oben)`)
  console.log(`Messbar (Prosa + Erläuterungen-XML): ${measured.length}`)
  console.log(`Deckung der Prosa durch den Text des Ressorts, ${SHINGLE}-Wort-Fenster, wörtlich:`)
  console.log(`  Median ${(quantileOfSorted(covers, 0.5) * 100).toFixed(1)} %   p10 ${(quantileOfSorted(covers, 0.1) * 100).toFixed(1)} %   p90 ${(quantileOfSorted(covers, 0.9) * 100).toFixed(1)} %`)
  console.log(`  ≥ 90 % gedeckt: ${high} (${pct(high, measured.length)})`)
  console.log(`  < 50 % gedeckt: ${low} (${pct(low, measured.length)})`)
  console.log(`\nGewicht der beiden Teile über alle Entwürfe (Zeichen ohne Markup):`)
  console.log(`  teil1 (Ziele/Inhalt, gegen das Vorblatt NICHT geprüft): ${chars1.toLocaleString('de-AT')} (${pct(chars1, chars1 + chars2)})`)
  console.log(`  teil2 (Prosa, hier gemessen):                           ${chars2.toLocaleString('de-AT')} (${pct(chars2, chars1 + chars2)})`)
  const worst = measured.sort((a, b) => a.hits / a.windows - b.hits / b.windows).slice(0, 8)
  console.log(`\nSchwächste Deckung (zum Nachsehen mit --show <inr>):`)
  for (const r of worst) console.log(`  ${r.cite.padEnd(9)} ${pct(r.hits, r.windows).padStart(7)}  (${r.hits}/${r.windows})`)
}

await main()
