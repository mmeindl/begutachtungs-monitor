/**
 * Can the promulgated text be read as a station — and does the comparison
 * against it say anything sensible? The measurement that gates the BGBl
 * station (docs/architecture.md §12.33).
 *
 * The station bar of the § comparison ends at the Plenum version today. The
 * last version, though, is the promulgated one, and it is exactly the one
 * that answers the question the product is about: what is left of the draft
 * once it became law. Before building, three numbers have to exist:
 *
 *  1. HOW MANY drafts get there at all, and does Parliament carry a BGBl
 *     citation for them?
 *  2. IS THE DOCUMENT READABLE — XML, and does the shipped parser
 *     (`parseLawUnitsFromRis`) break it into units?
 *  3. IS THE COMPARISON PLAUSIBLE? That is the real check. Between the last
 *     parliamentary version and the Kundmachung almost nothing may change —
 *     whoever measures differences by the hundred there has no result but an
 *     alignment fault. A comparison that says „geändert" everywhere looks
 *     like a finding and is a defect.
 *
 *     pnpm corpus:bgbl-station                 # GP XXVIII
 *     pnpm corpus:bgbl-station -- --gp XXVII
 *     pnpm corpus:bgbl-station -- --sample 20  # fewer drafts
 *     pnpm corpus:bgbl-station -- --cache      # RIS traffic from disk
 *     pnpm corpus:bgbl-station -- --scope      # the draft's laws only (below)
 *
 * `--scope` asks a fourth question (docs/architecture.md §12.33, 30.09.2026):
 * where the act carries more laws than the draft — a ministry's draft
 * kundgemacht inside someone else's Sammelgesetz —, what do the pairs between
 * two LATER stations count? Every such pair runs twice through the shipped
 * modules: `diffLawPackage` alone, as the page did until 30.09.2026, and
 * after `scopeToDraft`, as it does since. The stations come from
 * `findLawStations`, the Vorlage behind the Kundmachung from
 * `findComparisonRvLink` — the page's own path, not the type filter below. A
 * draft Parliament has only as a PDF is counted and skipped: the page reads
 * it from RIS (`getRisMapForGp`), which this script does not rebuild.
 *
 * Runs through the same parsers as the page. Read-only; nothing is written.
 */
import { bundlesOtherDrafts, extractBgblLink, findComparisonRvLink, mapTextEvolution, parseStages } from '../../server/utils/parliament/detailJson'
import { parseLawUnits, parseLawUnitsFromRis, type LawUnit } from '../../server/utils/lawtext/lawUnits'
import { diffLawPackage, scopeToDraft, summarizeDiff } from '../../server/utils/diff/lawDiff'
import { findLawStations } from '../../server/utils/diff/stationDocuments'
import { isLawStationPair } from '../../shared/utils/lawStations'
import type { LawStationId } from '../../shared/types'
import { installFetchCache } from '../lib/harnessCache'
import { argAssigned, argFlag, argPair } from '../lib/args'
import { PARLIAMENT, RIS_API, getJson as fetchJson, getText as fetchText, type HttpOptions } from '../lib/http'

if (argFlag('cache')) installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

const gp = argPair('gp') ?? 'XXVIII'
const sample = Number(argPair('sample')) || 0
const dump = argFlag('dump')
const only = Number(argPair('only') ?? argAssigned('only')) || 0
const scope = argFlag('scope')
const SCRIPT = 'corpus/bgblStation'
/** Three attempts on anything, 45 s each: one run reads hundreds of documents. */
const PATIENT: HttpOptions = { script: SCRIPT, attempts: 3, backoffMs: (retry) => 1_200 * retry, timeoutMs: 45_000, retryOnHttpError: true }
const getJson = (url: string): Promise<unknown> =>
  fetchJson(url, { ...PATIENT, onExhausted: (u) => new Error(`nicht erreichbar: ${u}`) })
const getText = (url: string): Promise<string> => fetchText(url, { script: SCRIPT, timeoutMs: 45_000 })

/** List 81 of one period: the numbers of the Ministerialentwürfe. */
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

/** A Kundmachung's Kurztitel, from the same RIS record — cached with it. */
const kurztitel = new Map<string, string | null>()

/** A Kundmachung's XML main document, by its document number. */
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
  kurztitel.set(nummer, ref?.Data?.Metadaten?.Bundesrecht?.Kurztitel ?? null)
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
 * A draft's last parliamentary version, as an HTML address.
 *
 * Through `mapTextEvolution`, the shipped mapper — the first version of this
 * script read the groups itself and from the WRONG Gegenstand (the
 * Regierungsvorlage instead of the Ministerialentwurf) and therefore found
 * nothing to compare. The stations hang on the draft, and `findLawStations`
 * reads them exactly there.
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

// ---------------------------------------------------------------------------
// `--scope`: the pairs between two later stations, before and after
// ---------------------------------------------------------------------------

type Counts = { total: number; unchanged: number; substantive: number; inserted: number; removed: number }
interface ScopeRow {
  inr: number
  bgbl: string
  act: string | null
  /** `bundlesOtherDrafts` on the Vorlage: the page cuts only where this is true. */
  bundles: boolean | null
  /** me→bgbl: laws of the act the draft does not carry (`diffLawPackage`). */
  actLawsBeyondDraft: number
  /** The laws cut from the earliest later station, by name — the list to read. */
  cut: string[]
  /** me→rv: the draft's laws the Vorlage does not pair. A name here AND in `cut` is a pairing fault, not a foreign law. */
  draftUnpaired: string[]
  pairs: { pair: string; before: Counts; after: Counts; outside: number; outsideUnits: number; onlyInToAfter: number }[]
}
const scopeRows: ScopeRow[] = []
let scopeMePdf = 0
const scopeMePdfBundled: number[] = []

function counts(units: ReturnType<typeof diffLawPackage>['units']): Counts {
  const s = summarizeDiff(units)
  return { total: s.total, unchanged: s.unchanged, substantive: s.changed - s.editorial, inserted: s.inserted, removed: s.removed }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function measureScope(inr: number, bgbl: string, c: any, bgblUnits: LawUnit[], rv: any): Promise<void> {
  const found = findLawStations(c)
  const meHtml = found.get('me')?.html
  if (!meHtml) {
    scopeMePdf++
    if (bundlesOtherDrafts(rv?.preconst, gp, inr)) scopeMePdfBundled.push(inr)
    return
  }
  const text = new Map<LawStationId, LawUnit[]>([['bgbl', bgblUnits]])
  text.set('me', parseLawUnits(await getText(meHtml)))
  for (const id of ['rv', 'ausschuss', 'plenum'] as const) {
    const html = found.get(id)?.html
    if (html) text.set(id, parseLawUnits(await getText(html)))
  }
  const draft = text.get('me')!
  const row: ScopeRow = {
    inr,
    bgbl,
    act: kurztitel.get(bgbl) ?? null,
    bundles: bundlesOtherDrafts(rv?.preconst, gp, inr),
    actLawsBeyondDraft: diffLawPackage(draft, bgblUnits).lawsOnlyInTo.length,
    cut: [],
    draftUnpaired: text.has('rv') ? diffLawPackage(draft, text.get('rv')!).lawsOnlyInFrom.map((e) => e.article) : [],
    pairs: [],
  }
  for (const from of ['rv', 'ausschuss', 'plenum'] as const) {
    for (const to of ['ausschuss', 'plenum', 'bgbl'] as const) {
      if (!isLawStationPair(from, to) || !text.has(from) || !text.has(to)) continue
      const f = text.get(from)!
      const t = text.get(to)!
      const before = diffLawPackage(f, t)
      const scoped = scopeToDraft(draft, f, t)
      const after = diffLawPackage(scoped.from, scoped.to)
      if (before.unpaired || after.unpaired) continue
      if (!row.cut.length) row.cut = scoped.outside.map((e) => `${e.article} [${e.units}]`)
      row.pairs.push({
        pair: `${from}>${to}`,
        before: counts(before.units),
        after: counts(after.units),
        outside: scoped.outside.length,
        outsideUnits: scoped.outside.reduce((n, e) => n + e.units, 0),
        onlyInToAfter: after.lawsOnlyInTo.length,
      })
    }
  }
  scopeRows.push(row)
}

function reportScope(): void {
  console.log(`\n── 4. Der Akt ist größer als der Entwurf (--scope)`)
  console.log(`   Entwürfe mit lesbarer Kundmachung und Parlaments-HTML des Entwurfs: ${scopeRows.length} (Entwurf nur als PDF, übersprungen: ${scopeMePdf}, davon mit bündelnder Vorlage: ${scopeMePdfBundled.join(', ') || 'keiner'})`)
  const beyond = scopeRows.filter((r) => r.actLawsBeyondDraft > 0)
  console.log(`   Kundmachung trägt Gesetze, die der Entwurf nicht trägt: ${beyond.length}`)
  const moved = scopeRows.filter((r) => r.pairs.some((p) => p.outside > 0 || p.after.total !== p.before.total))
  console.log(`   … davon würde ein Schnitt ein Paar zwischen zwei späteren Stationen bewegen: ${moved.length}`)
  const label = (b: boolean | null) => (b === true ? 'bündelt andere Entwürfe' : b === false ? 'nur dieser Entwurf' : 'preconst fehlt')
  for (const b of [true, false, null]) {
    const n = moved.filter((r) => r.bundles === b)
    console.log(`     Vorlage ${label(b).padEnd(24)} ${String(n.length).padStart(3)}: ${n.map((r) => r.inr).join(', ')}`)
  }
  // As shipped: the page cuts only where the Vorlage bundles other drafts
  // (`bundlesOtherDrafts`); every other row keeps its whole-text count.
  const byPair = new Map<string, { drafts: number; before: number; after: number; subBefore: number; subAfter: number }>()
  for (const r of scopeRows) {
    const cut = r.bundles === true
    for (const p of r.pairs) {
      const e = byPair.get(p.pair) ?? { drafts: 0, before: 0, after: 0, subBefore: 0, subAfter: 0 }
      const now = cut ? p.after : p.before
      if (now.total !== p.before.total) e.drafts++
      e.before += p.before.total
      e.after += now.total
      e.subBefore += p.before.substantive
      e.subAfter += now.substantive
      byPair.set(p.pair, e)
    }
  }
  console.log(`   Wie ausgeliefert (nur bündelnde Vorlagen geschnitten):`)
  for (const [pair, e] of byPair) {
    console.log(`     ${pair.padEnd(17)} bewegt ${String(e.drafts).padStart(3)} · Einheiten ${e.before} → ${e.after} · substanziell geändert ${e.subBefore} → ${e.subAfter}`)
  }
  // Every pair of every draft whose numbers move — the list to read, not a
  // rate: a draft cut to nothing would be a fault of the pairing, not a fix.
  const fmt = (x: Counts) => `${x.total} (gleich ${x.unchanged}, subst. ${x.substantive}, neu ${x.inserted}, weg ${x.removed})`
  for (const r of moved) {
    console.log(`\n   ${r.inr}/ME ${r.bgbl}${r.act ? ` (${r.act})` : ''} · Akt-Gesetze jenseits des Entwurfs ${r.actLawsBeyondDraft} · Vorlage ${label(r.bundles)}`)
    if (r.cut.length <= 6) for (const name of r.cut) console.log(`     ✂ ${name.slice(0, 150)}`)
    for (const name of r.draftUnpaired) console.log(`     ⚠ im Entwurf, in der Vorlage ungepaart: ${name.slice(0, 140)}`)
    for (const p of r.pairs.filter((q) => q.outside > 0)) {
      console.log(`     ${p.pair.padEnd(17)} ${fmt(p.before)} → ${fmt(p.after)} · außerhalb ${p.outside} Gesetze/${p.outsideUnits} Einh. · danach nur rechts ${p.onlyInToAfter}`)
    }
  }
  const unmoved = beyond.filter((r) => !moved.includes(r))
  if (unmoved.length) {
    console.log(`\n   Akt größer, aber kein späteres Paar betroffen (die Vorlage ist schon nur der Entwurf):`)
    for (const r of unmoved) console.log(`     ${r.inr}/ME ${r.bgbl}${r.act ? ` (${r.act})` : ''} · ${r.actLawsBeyondDraft} Gesetze`)
  }
}

const numbers = await draftNumbers()
console.log(`\nGP ${gp}: ${numbers.length} Ministerialentwürfe in Liste 81`)

const rows: Row[] = []
let withBgbl = 0
let checked = 0
for (const inr of numbers) {
  if (sample && checked >= sample) break
  if (only && inr !== only) continue
  let content: unknown
  try {
    content = await getJson(`${PARLIAMENT}/gegenstand/${gp}/ME/${inr}?json=True`)
  } catch {
    continue
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = (content as any)?.content ?? {}
  // The BGBl citation hangs on the Regierungsvorlage, not on the draft.
  //
  // `/I/` Gegenstände ONLY, and that is a correction: the first version took
  // the FIRST `/gegenstand/` link out of `stages[]` and so caught, for
  // several drafts, the Vorlage of an unrelated Sammelgesetz — 19/ME
  // („Standort-Entwicklungsgesetz") ended up at the Budgetbegleitgesetz and
  // compared two different laws against each other: 0 of 653 units alike.
  // That looked like a finding about the alignment and was a fault of the
  // measurement. Production resolves the Vorlage cleanly through
  // `parliament/stationMap.ts`; the type filter is enough here.
  //
  // Under `--scope` the page's own path instead (`lawDiffService.ts`): the
  // Vorlage whose text the draft's station list carries. The two differ only
  // for a split draft, and there the page's choice is the one to measure.
  const rvText = findLawStations(c).get('rv')
  const pageRv = scope ? findComparisonRvLink(parseStages(c?.stages), rvText?.html ?? rvText?.fallbackUrl) : null
  const rvLink = scope
    ? pageRv && `/gegenstand/${pageRv.gp}/I/${pageRv.inr}`
    : (c?.stages ?? [])
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
      /* no Regierungsvorlage, no Kundmachung */
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
    if (scope && units.length) await measureScope(inr, bgbl, c, units, rvContent)

    // The counter-check: last parliamentary version against the Kundmachung.
    const last = lastParliamentaryText(c)
    if (last && units.length) {
      const html = await getText(last.url)
      const { units: diff, lawsOnlyInTo, lawsOnlyInFrom } = diffLawPackage(parseLawUnits(html), units)
      const st = summarizeDiff(diff)
      // `--dump` prints the units that are neither equal nor merely editorial
      // — the residue a reader would be shown as a real change between the
      // last parliamentary version and the Kundmachung. Almost nothing may
      // change there, so every one of them is either a finding about the
      // procedure or a fault of our parse, and a count cannot tell which.
      if (dump) {
        for (const u of diff.filter((x) => x.change === 'changed' && !x.editorial)) {
          const a = String(u.fromText ?? '')
          const b = String(u.toText ?? '')
          // Where the two texts first part company, with a window around it.
          // The head of such a unit is identical for hundreds of characters —
          // printing the head says nothing about the difference, which is the
          // mistake the first version of this dump made.
          let at = 0
          while (at < a.length && at < b.length && a[at] === b[at]) at++
          const from = Math.max(0, at - 60)
          console.log(`\n    ### ${inr}/ME ${u.article ?? '—'} / ${u.id} — gleich bis Zeichen ${at} von ${a.length}/${b.length}`)
          console.log(`      PARLAMENT: …${JSON.stringify(a.slice(from, at + 160))}`)
          console.log(`      RIS      : …${JSON.stringify(b.slice(from, at + 160))}`)
        }
      }
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

if (scope) reportScope()
