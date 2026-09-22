/**
 * Lässt sich der kundgemachte Text als Station lesen — und sagt der
 * Vergleich gegen ihn etwas Vernünftiges? Die Messung, die die BGBl-Station
 * gatet (`TODO.md`, docs/architecture.md §12.33).
 *
 * Die Stationsleiste des § -Vergleichs endet heute bei der Plenarfassung. Die
 * letzte Fassung ist aber die kundgemachte, und genau sie beantwortet die
 * Frage, um die es dem Produkt geht: Was ist vom Entwurf übrig geblieben, als
 * daraus Recht wurde. Vor dem Bau müssen drei Zahlen existieren:
 *
 *  1. WIE VIELE Entwürfe kommen überhaupt dorthin, und trägt das Parlament
 *     für sie eine BGBl-Fundstelle?
 *  2. IST DAS DOKUMENT LESBAR — XML, und gliedert es der ausgelieferte
 *     Parser (`parseLawUnitsFromRis`) in Einheiten?
 *  3. IST DER VERGLEICH PLAUSIBEL? Das ist die eigentliche Prüfung. Zwischen
 *     der letzten parlamentarischen Fassung und der Kundmachung darf sich
 *     fast nichts ändern — wer dort massenhaft Unterschiede misst, hat kein
 *     Ergebnis, sondern einen Ausrichtungsfehler. Ein Vergleich, der überall
 *     „geändert" sagt, sieht aus wie ein Befund und ist ein Defekt.
 *
 *     pnpm audit:bgbl-station                 # GP XXVIII
 *     pnpm audit:bgbl-station -- --gp XXVII
 *     pnpm audit:bgbl-station -- --sample 20  # weniger Entwürfe
 *     pnpm audit:bgbl-station -- --cache      # RIS-Verkehr von der Platte
 *
 * Läuft durch dieselben Parser wie die Seite. Liest nur; schreibt nichts.
 */
import { extractBgblLink, mapTextEvolution } from '../server/utils/parliament/detailJson'
import { parseLawUnits, parseLawUnitsFromRis, type LawUnit } from '../server/utils/lawtext/lawUnits'
import { diffLawPackage, summarizeDiff } from '../server/utils/diff/lawDiff'
import { installFetchCache } from './lib/harnessCache'
import { argFlag, argPair } from './lib/args'
import { PARLIAMENT, RIS_API, getJson as fetchJson, getText as fetchText, type HttpOptions } from './lib/http'

if (argFlag('cache')) installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

const gp = argPair('gp') ?? 'XXVIII'
const sample = Number(argPair('sample')) || 0
const SCRIPT = 'bgbl-station-corpus'
/** Drei Versuche auf alles, 45 s je Versuch: ein Lauf liest hunderte Dokumente. */
const PATIENT: HttpOptions = { script: SCRIPT, attempts: 3, backoffMs: (retry) => 1_200 * retry, timeoutMs: 45_000, retryOnHttpError: true }
const getJson = (url: string): Promise<unknown> =>
  fetchJson(url, { ...PATIENT, onExhausted: (u) => new Error(`nicht erreichbar: ${u}`) })
const getText = (url: string): Promise<string> => fetchText(url, { script: SCRIPT, timeoutMs: 45_000 })

/** Liste 81 einer Periode: die Nummern der Ministerialentwürfe. */
async function draftNumbers(): Promise<number[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = await fetchJson<any>(`${PARLIAMENT}/Filter/api/filter/data/81?js=eval&showAll=true&export=true`, {
    script: SCRIPT,
    method: 'POST',
    body: { GP_CODE: [gp] },
    timeoutMs: 60_000,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = body?.rows ?? []
  return [...new Set(rows.map((r) => Number(r[2])))].sort((a, b) => a - b)
}

/** Das XML-Hauptdokument einer Kundmachung, über ihre Dokumentnummer. */
async function bgblXmlUrl(nummer: string): Promise<string | null> {
  const p = new URLSearchParams({
    Applikation: 'BgblAuth',
    DokumenteProSeite: 'Ten',
    Seitennummer: '1',
    Bgblnummer: nummer.replace(/^Bundesgesetzblatt\b/, 'BGBl.'),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = await getJson(`${RIS_API}?${p}`)
  let ref = r?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference
  if (!ref) return null
  ref = Array.isArray(ref) ? ref[0] : ref
  let crs = ref?.Data?.Dokumentliste?.ContentReference
  crs = Array.isArray(crs) ? crs : [crs]
  for (const cr of crs) {
    if (cr?.ContentType !== 'MainDocument') continue
    let urls = cr?.Urls?.ContentUrl ?? []
    urls = Array.isArray(urls) ? urls : [urls]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xml = urls.find((u: any) => u?.DataType === 'Xml')?.Url
    if (xml) return String(xml)
  }
  return null
}

/**
 * Die letzte parlamentarische Fassung eines Entwurfs, als HTML-Adresse.
 *
 * Über `mapTextEvolution`, den ausgelieferten Mapper — die erste Fassung
 * dieses Skripts las die Gruppen selbst und aus dem FALSCHEN Gegenstand (der
 * Regierungsvorlage statt des Ministerialentwurfs) und fand deshalb nichts
 * zu vergleichen. Die Stationen hängen am Entwurf, `findLawStations` liest
 * sie genau dort.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lastParliamentaryText(content: any): { label: string; url: string } | null {
  const order = ['plenum', 'ausschuss', 'rv']
  const versions = mapTextEvolution(content?.statements?.documents)
  for (const id of order) {
    const hit = versions.find((v) => v.stationId === id && v.url.endsWith('.html'))
    if (hit) return { label: hit.station, url: hit.url }
  }
  return null
}

interface Row {
  inr: number
  bgbl: string
  xml: boolean
  units: number
  compared: {
    label: string
    total: number
    unchanged: number
    changed: number
    editorial: number
    inserted: number
    removed: number
    onlyInTo: number
    onlyInFrom: number
  } | null
  note: string | null
}

const numbers = await draftNumbers()
console.log(`\nGP ${gp}: ${numbers.length} Ministerialentwürfe in Liste 81`)

const rows: Row[] = []
let withBgbl = 0
let checked = 0
for (const inr of numbers) {
  if (sample && checked >= sample) break
  let content: unknown
  try {
    content = await getJson(`${PARLIAMENT}/gegenstand/${gp}/ME/${inr}?json=True`)
  } catch {
    continue
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = (content as any)?.content ?? {}
  // Die BGBl-Fundstelle hängt an der Regierungsvorlage, nicht am Entwurf.
  //
  // NUR `/I/`-Gegenstände, und das ist eine Korrektur: Die erste Fassung nahm
  // den ERSTEN `/gegenstand/`-Link aus `stages[]` und erwischte damit für
  // mehrere Entwürfe die Vorlage eines fremden Sammelgesetzes — 19/ME
  // („Standort-Entwicklungsgesetz") landete beim Budgetbegleitgesetz und
  // verglich zwei verschiedene Gesetze gegeneinander: 0 von 653 Einheiten
  // deckungsgleich. Das sah aus wie ein Befund über die Ausrichtung und war
  // ein Fehler der Messung. Die Produktion löst die Vorlage über
  // `parliament/stationMap.ts` sauber auf; hier reicht der Typfilter.
  const rvLink = (c?.stages ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .flatMap((s: any) => String(s?.text ?? '').match(/\/gegenstand\/[^"']+/g) ?? [])
    .find((l: string) => l.includes(`/${gp}/I/`))
  let bgbl: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rvContent: any = null
  if (rvLink) {
    try {
      const rv = await getJson(`${PARLIAMENT}${rvLink}?json=True`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rvContent = (rv as any)?.content ?? null
      bgbl = extractBgblLink(rvContent?.status?.bgbllinks)?.number ?? null
    } catch {
      /* ohne RV keine Kundmachung */
    }
  }
  if (!bgbl) continue
  withBgbl++
  checked++

  const row: Row = { inr, bgbl, xml: false, units: 0, compared: null, note: null }
  try {
    const xmlUrl = await bgblXmlUrl(bgbl)
    if (!xmlUrl) {
      row.note = 'kein XML-Hauptdokument'
      rows.push(row)
      continue
    }
    row.xml = true
    const units: LawUnit[] = parseLawUnitsFromRis(await getText(xmlUrl))
    row.units = units.length
    if (!units.length) row.note = 'keine Einheiten'

    // Die Gegenprobe: letzte parlamentarische Fassung gegen die Kundmachung.
    const last = lastParliamentaryText(c)
    if (last && units.length) {
      const html = await getText(last.url)
      const { units: diff, lawsOnlyInTo, lawsOnlyInFrom } = diffLawPackage(parseLawUnits(html), units)
      const st = summarizeDiff(diff)
      row.compared = {
        label: last.label,
        total: st.total,
        unchanged: st.unchanged,
        changed: st.changed,
        editorial: st.editorial,
        inserted: st.inserted,
        removed: st.removed,
        onlyInTo: lawsOnlyInTo.length,
        onlyInFrom: lawsOnlyInFrom.length,
      }
    }
  } catch (err) {
    row.note = String(err).slice(0, 50)
  }
  rows.push(row)
  process.stderr.write(`\r${rows.length} geprüft`)
}
process.stderr.write('\n')

const withXml = rows.filter((r) => r.xml)
const withUnits = rows.filter((r) => r.units > 0)
const cmp = rows.filter((r) => r.compared && r.compared.total > 0)
const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)} %` : '–')

console.log(`\n── 1. Erreichbarkeit`)
console.log(`   mit BGBl-Fundstelle am Gegenstand: ${withBgbl}`)
console.log(`── 2. Lesbarkeit`)
console.log(`   Kundmachung als XML:      ${withXml.length}/${rows.length} (${pct(withXml.length, rows.length)})`)
console.log(`   in Einheiten gegliedert:  ${withUnits.length}/${rows.length} (${pct(withUnits.length, rows.length)})`)
if (withUnits.length) {
  const us = withUnits.map((r) => r.units).sort((a, b) => a - b)
  console.log(`   Einheiten je Kundmachung: Median ${us[Math.floor(us.length / 2)]} · max ${us[us.length - 1]}`)
}

console.log(`── 3. Plausibilität: letzte parlamentarische Fassung → Kundmachung`)
if (cmp.length) {
  const shares = cmp.map((r) => r.compared!.unchanged / r.compared!.total).sort((a, b) => a - b)
  const median = shares[Math.floor(shares.length / 2)]!
  console.log(`   verglichen: ${cmp.length} Entwürfe`)
  console.log(`   unveränderte Einheiten: Median ${(median * 100).toFixed(1)} % · Minimum ${(shares[0]! * 100).toFixed(1)} %`)
  console.log(`   vollständig deckungsgleich: ${cmp.filter((r) => r.compared!.changed === 0).length}`)
  console.log(`\n   Die auffälligen (unter 80 % deckungsgleich):`)
  for (const r of cmp.filter((r) => r.compared!.unchanged / r.compared!.total < 0.8)) {
    const c = r.compared!
    console.log(`     ${r.inr}/ME ${r.bgbl} · ${c.label} · ${c.unchanged}/${c.total} unverändert`)
  }
} else {
  console.log('   nichts vergleichbar')
}

console.log(`\n── Je Entwurf`)
for (const r of rows) {
  const c = r.compared
  console.log(
    `   ${String(r.inr).padStart(4)}/ME ${r.bgbl.padEnd(30)} ${String(r.units).padStart(4)} Einh.` +
    (c
      ? ` · ${c.label.slice(0, 18).padEnd(18)} ${c.unchanged}/${c.total} gleich · geändert ${c.changed} (davon redaktionell ${c.editorial}) · neu ${c.inserted} · weg ${c.removed} · Gesetze nur rechts ${c.onlyInTo}/nur links ${c.onlyInFrom}`
      : ' · nichts zu vergleichen'),
  )
}

const broken = rows.filter((r) => r.note)
if (broken.length) {
  console.log(`\n── Ohne Ergebnis (${broken.length})`)
  for (const r of broken.slice(0, 15)) console.log(`   ${r.inr}/ME ${r.bgbl}: ${r.note}`)
}
