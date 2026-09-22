/**
 * Woher stammt die Kurzinformation des Parlaments? — die Messung hinter einer
 * Lizenzfrage (`docs/architecture.md` §13.1, `outreach/verfahrensfragen.md` E3).
 *
 * WARUM DIESE FRAGE GESTELLT WIRD. Unter „Worum geht es?" druckt die
 * Entwurfsseite `content.shortinfo` des Parlaments — Ziele, Inhalt,
 * Hauptgesichtspunkte. Das ist Prosa, keine Metadate, und sie kommt aus dem
 * Datensatz, den das Parlament ausdrücklich von der Weiterverwendung als Open
 * Data ausnimmt. Damit ist sie der eine Block der Seite, für den die Zusage
 * „der Monitor zeigt daraus ausschließlich Metadaten" nicht trägt.
 *
 * Der Verdacht, der die Frage entschärfen würde: Die Kurzinformation ist gar
 * kein Text des Parlaments, sondern der des Ressorts — Vorblatt und
 * Erläuterungen, redaktionell gekürzt. Dieselben Dokumente veröffentlicht das
 * RIS unter CC BY 4.0. Stimmt der Verdacht, ist die Lösung nicht, den
 * Abschnitt zu löschen, sondern ihn aus der geklärten Quelle zu lesen.
 *
 * WAS GEMESSEN WIRD. Je Entwurf wird `teil2` der Kurzinformation (die Prosa
 * unter „Hauptgesichtspunkte des Entwurfs") in Wortfenster zerlegt und
 * gezählt, wie viele davon **wörtlich** in den Erläuterungen des Ressorts
 * stehen, gelesen durch den Produktionsparser. `teil1` (Ziele/Inhalt) wird
 * getrennt ausgewiesen und NICHT gegen die Erläuterungen gehalten: Diese
 * Listen stammen aus dem Vorblatt, und das ist ein eigenes RIS-Dokument, das
 * `flattenRisRecord` heute nicht mitführt. Was hier „ungedeckt" heißt, heißt
 * also nicht „vom Parlament geschrieben" — es heißt „hier nicht geprüft".
 *
 *     pnpm audit:kurzinfo                 # GP XXVII, alle gejointen Entwürfe
 *     pnpm audit:kurzinfo -- --sample 60  # die ersten 60 (nach Nummer)
 *     pnpm audit:kurzinfo -- --show 1     # einen Entwurf im Detail zeigen
 *
 * GP XXVII, weil dort die Zuordnung Entwurf ↔ RIS-Datensatz als Datei
 * vorliegt (`data/ris-me-map-gp27.json`, 350 Zeilen, 337 gejoint) — das
 * Skript braucht damit keinen zweiten Join neben dem ausgelieferten.
 * Nur lesend; nichts wird geschrieben.
 */
import { readFileSync } from 'node:fs'
import { hasReadableText, parseExplanations } from '../server/utils/explanations'
import { decodeEntities } from '../server/utils/parliament/htmlText'
import { normalizeText, stripMarkup } from '../server/utils/lawText'
import { fetchRisBegutCorpus } from './risCorpus'

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null
}

const GP = 'XXVII'
const sample = Number(arg('sample') ?? 0)
const show = arg('show')
const CONCURRENCY = 4
/**
 * Acht Wörter. Kürzer trifft Floskeln der Legistik („in der Fassung des
 * Bundesgesetzes"), die in jedem zweiten Dokument stehen und Deckung
 * vortäuschen; länger zerbricht an jeder redaktionellen Kürzung des
 * Parlaments und misst dann die Kürzung statt der Herkunft.
 */
const SHINGLE = 8

const USER_AGENT = 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at; scripts/kurzinfo-herkunft)'

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init?.headers }, signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw lastError
}

/** Vergleichsform: ohne Markup, ohne Entities, kleingeschrieben, ein Leerzeichen. */
function words(html: string): string[] {
  return normalizeText(decodeEntities(stripMarkup(html)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}§\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Anteil der Wortfenster aus `needle`, die wörtlich in `haystack` stehen. */
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
  /** Titel des Entwurfs beim Parlament — für die Duplikatgruppen unten. */
  title: string
  /** Fingerabdruck der Kurzinformation; gleiche Kurzinformation = gleicher Wert. */
  fingerprint: string
  /** Zeichen der beiden Teile, roh — sagt, wie viel Gewicht teil2 überhaupt hat. */
  chars1: number
  chars2: number
  windows: number
  hits: number
  note: string | null
}

const pct = (n: number, of: number) => (of === 0 ? '—' : `${((n / of) * 100).toFixed(1)} %`)

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))
  return sorted[i]!
}

async function main(): Promise<void> {
  const map = JSON.parse(readFileSync('data/ris-me-map-gp27.json', 'utf8')) as { rows: MapRow[] }
  let joined = map.rows.filter((r) => r.status === 'matched' && r.risId)
  if (sample > 0) joined = joined.slice(0, sample)
  if (show) joined = joined.filter((r) => String(r.inr) === show)
  console.error(`${GP}: ${joined.length} Entwürfe mit RIS-Datensatz`)

  console.error('RIS-Korpus …')
  const corpus = await fetchRisBegutCorpus('kurzinfo-herkunft')
  const byId = new Map(corpus.records.map((r) => [r.id, r]))

  const rows: Row[] = []
  const queue = [...joined]
  let done = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const item = queue.shift()
      if (!item) return
      const row: Row = { inr: item.inr, cite: item.cite, title: '', fingerprint: '', chars1: 0, chars2: 0, windows: 0, hits: 0, note: null }
      try {
        const record = byId.get(item.risId!)
        const xmlUrl = record?.explanations?.xml ?? null
        const detail = JSON.parse(await fetchText(`https://www.parlament.gv.at/gegenstand/${GP}/ME/${item.inr}?json=True`)) as
          { content?: { title?: string | null; shortinfo?: { teil1?: string | null; teil2?: string | null } | null } }
        const si = detail.content?.shortinfo
        const teil1 = si?.teil1 ?? ''
        const teil2 = si?.teil2 ?? ''
        row.title = (detail.content?.title ?? '').slice(0, 60)
        row.chars1 = stripMarkup(teil1).length
        row.chars2 = stripMarkup(teil2).length
        row.fingerprint = words(`${teil1} ${teil2}`).join(' ')
        if (!si || (!teil1 && !teil2)) { row.note = 'keine Kurzinformation'; rows.push(row); continue }
        if (!teil2) { row.note = 'keine Prosa (nur Ziele/Inhalt)'; rows.push(row); continue }
        if (!xmlUrl) { row.note = 'keine Erläuterungen als XML'; rows.push(row); continue }

        // Der Heuhaufen ist das ROHE Dokument, nicht die Lesung davon: Die
        // Frage ist die Herkunft eines Textes, nicht was unser Parser davon
        // auswählt. `parseExplanations` lässt Tabellen und Abbildungen weg
        // und trennt Allgemeinen von Besonderem Teil — beides richtig für die
        // Seite und falsch für diese Messung. Dazu der Entwurfstext selbst:
        // Die Kurzinformation zitiert stellenweise aus ihm.
        const xml = await fetchText(xmlUrl)
        const main = record?.mainDocument?.xml ? await fetchText(record.mainDocument.xml).catch(() => '') : ''
        const ministry = `${stripMarkup(xml)} ${stripMarkup(main)}`
        // Ein Scan trägt keinen Text. Ohne diese Schranke misst das Skript
        // „0 % gedeckt" und meint „nichts zu vergleichen" — ein Artefakt, das
        // wie ein Befund aussieht.
        const readable = parseExplanations(xml)
        const ministryWords = words(ministry)
        if (ministryWords.length < 200 || !hasReadableText(readable)) {
          row.note = 'Erläuterungen ohne Textebene (Scan)'
          rows.push(row)
          continue
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
      rows.push(row)
      process.stderr.write(`\rEntwürfe: ${++done}/${joined.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  process.stderr.write('\n')
  if (show) return

  // ZUERST die Duplikate, denn sie entscheiden, worüber die Deckung unten
  // überhaupt etwas sagt: Trägt ein Entwurf die Kurzinformation eines anderen,
  // misst ein Vergleich mit SEINEN Dokumenten die Verwechslung, nicht die
  // Herkunft des Textes.
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
  console.log(`  Median ${(quantile(covers, 0.5) * 100).toFixed(1)} %   p10 ${(quantile(covers, 0.1) * 100).toFixed(1)} %   p90 ${(quantile(covers, 0.9) * 100).toFixed(1)} %`)
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
