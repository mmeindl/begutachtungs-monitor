#!/usr/bin/env node
/**
 * The treaties of a period (`DOKTYP` „RVS", step 5 of
 * `docs/research/umsetzungsplan-weitere-wege.md`) through the PRODUCTION
 * readers — `treatyKindOf`, `extractBgblLink`, `pickBgblForTreaty`,
 * `findHouseDecisionDate` — and what each of them answers, so the page's
 * claims rest on a measurement and not on two read records.
 *
 * Usage:   pnpm corpus:staatsvertraege -- [GP …] [--cache=dir]
 *          (default: XXVII XXVIII, cache `.cache/staatsvertraege/`)
 *
 * Reads list 101's treaties of each period (`{ GP_CODE, ITYP: ['I'],
 * DOKTYP: ['RVS'] }`, `VHG` in column 17), every treaty's detail record, the
 * BGBl Jahrgänge from the period's first year to today (RIS, through
 * `bgblRecordOf`; closed years seeded from `.cache/ohne-begutachtung/` where
 * that run cached them, the running year always read fresh once), and the
 * period's Ministerialentwürfe (list 81 and each detail record, seeded from
 * the same cache), whose stage records may link a treaty as their Vorlage.
 * One request at a time to Parliament, paced.
 *
 * Measured per period:
 *  - `VHG` (RVS / RVS15) against the Verlauf's Art.-15a stage (`treatyKindOf`);
 *  - `statementsstate`, `vote`, the „Genehmigung" stage, titles beginning
 *    „Einspruch";
 *  - Parliament's BGBl link present, its Teil, and the RIS key
 *    (`pickBgblForTreaty`) agreeing with it;
 *  - the delay from the Nationalrat's Beschluss (and from the Bundesrat's) to
 *    the issue — median, p90, max;
 *  - RVS15 always in Teil I;
 *  - the approved treaties without a Kundmachung, with their age;
 *  - the Kundmachung the production rule states (`resolveTreatyBgbl`: RIS's
 *    key first, Parliament's link where RIS has none);
 *  - the Ministerialentwürfe whose Vorlage is a treaty.
 */
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GP_STARTS, gpEndedOn } from '../../shared/utils/gp'
import { bgblShort, spanInDays, todayIso } from '../../shared/utils/format'
import { extractBgblLink, findBundesratDecisionDate, findHouseDecisionDate, findRvLinks, parseStages, type RawBgblLink, type RawStage } from '../../server/utils/parliament/detailJson'
import { DOKTYP_COLUMN } from '../../server/utils/parliament/list101'
import { mapDraftRow } from '../../server/utils/parliament/list81'
import { stripHtmlToText } from '../../server/utils/parliament/htmlText'
import { treatyKindOf, type VorlageContent } from '../../server/utils/parliament/vorlageDetailAssembly'
import { pickBgblForTreaty } from '../../server/utils/ris/bgblVorlage'
import { resolveTreatyBgbl } from '../../server/utils/parliament/staatsvertraege'
import type { BgblRecord } from '../../server/utils/ris/bgblJoin'
import { PARLIAMENT, getJson } from '../lib/http'
import { cachedJson } from '../lib/diskCache'
import { fetchBgblRecords } from '../lib/corpus'
import { sleep } from '../lib/async'

const SCRIPT = 'corpus/staatsvertraege'
const PAUSE_MS = 400
const VHG_COLUMN = 17

const args = process.argv.slice(2)
const cacheDir = args.find((a) => a.startsWith('--cache='))?.slice('--cache='.length) ?? join('.cache', 'staatsvertraege')
const periods = args.filter((a) => /^[IVXLC]+$/.test(a))
if (!periods.length) periods.push('XXVII', 'XXVIII')
for (const gp of periods) {
  if (!GP_STARTS[gp]) {
    console.error(`GP ${gp}: der Kalender (GP_STARTS) kennt die Periode nicht.`)
    process.exit(1)
  }
}
const today = todayIso()
const say = (line = '') => console.log(line)
const http = { script: SCRIPT, attempts: 3, backoffMs: (n: number) => 1000 * n, timeoutMs: 60_000 }

interface ListAnswer {
  rows?: unknown[][]
}

function filterList(listId: number, body: unknown): Promise<ListAnswer> {
  return getJson<ListAnswer>(`${PARLIAMENT}/Filter/api/filter/data/${listId}?js=eval&showAll=true`, { ...http, method: 'POST', body })
}

/** A cached file, else a seed from another run's cache, else the loader — paced. */
async function cachedOrSeeded<T>(file: string, seed: string | null, load: () => Promise<T>): Promise<T> {
  return cachedJson(file, async () => {
    if (seed) {
      try {
        return JSON.parse(await readFile(seed, 'utf8')) as T
      } catch {
        // no seed: read upstream
      }
    }
    const data = await load()
    await sleep(PAUSE_MS)
    return data
  })
}

/** As much of a detail record as the measurement reads. */
type TreatyRecord = VorlageContent & {
  statementsstate?: unknown
  vote?: unknown
  status?: { number?: unknown; bgbllinks?: RawBgblLink[] | null }
  stages?: RawStage[]
}

const gegenstand = (gp: string, ityp: string, inr: number, seedDir: string | null) =>
  cachedOrSeeded<{ content?: TreatyRecord }>(
    join(cacheDir, gp, `${ityp}-${inr}.json`),
    seedDir ? join(seedDir, gp, `${ityp}-${inr}.json`) : null,
    () => getJson(`${PARLIAMENT}/gegenstand/${gp}/${ityp}/${inr}?json=True`, http),
  )

// ---------------------------------------------------------------------------
// 1. The Bundesgesetzblatt, every Teil, from the first period's first year
// ---------------------------------------------------------------------------

await mkdir(cacheDir, { recursive: true })
const firstYear = Math.min(...periods.map((gp) => Number(GP_STARTS[gp]!.slice(0, 4))))
const thisYear = Number(today.slice(0, 4))
const records: BgblRecord[] = []
for (let y = firstYear; y <= thisYear; y++) {
  const seed = y < thisYear ? join('.cache', 'ohne-begutachtung', `bgbl-${y}-v2.json`) : null
  records.push(...(await cachedOrSeeded(join(cacheDir, `bgbl-${y}-${y < thisYear ? 'closed' : today}.json`), seed, () => fetchBgblRecords(SCRIPT, `${y}-01-01`, `${y}-12-31`))))
}
const byNumber = new Map(records.map((r) => [r.nummer, r]))

const quantile = (xs: number[], q: number): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]!
}
const spread = (xs: number[]) => `n=${xs.length} · Median ${quantile(xs, 0.5) ?? '–'} · p90 ${quantile(xs, 0.9) ?? '–'} · max ${xs.length ? Math.max(...xs) : '–'} Tage`

say(`Staatsverträge (DOKTYP RVS) — gemessen ${today}; BGBl ${firstYear}–${thisYear}: ${records.length} Datensätze, davon Teil III ${records.filter((r) => r.teil === 'Teil3').length}`)

// ---------------------------------------------------------------------------
// 2. Per period
// ---------------------------------------------------------------------------

// Every period's list first: a Ministerialentwurf of one period may link a
// treaty of the next (a carry-over).
const treatyKeys = new Set<string>()
const listOf = new Map<string, unknown[][]>()
for (const gp of periods) {
  await mkdir(join(cacheDir, gp), { recursive: true })
  const rows = (await cachedOrSeeded(join(cacheDir, gp, 'list101-rvs.json'), null, () => filterList(101, { GP_CODE: [gp], ITYP: ['I'], DOKTYP: ['RVS'] }))).rows ?? []
  if (rows.some((r) => r[DOKTYP_COLUMN] !== 'RVS')) throw new Error(`Liste 101 (${gp}): der DOKTYP-Filter hat nicht gegriffen`)
  listOf.set(gp, rows)
  for (const r of rows) treatyKeys.add(`${gp}/${Number(r[2])}`)
}

for (const gp of periods) {
  const rows = listOf.get(gp) ?? []
  const ended = gpEndedOn(gp)
  say()
  say(`=== GP ${gp}${ended ? ` (beendet ${ended})` : ' (läuft)'} — ${rows.length} Staatsvertrags-Vorlagen ===`)

  const counts = new Map<string, number>()
  const count = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1)
  const delayNr: number[] = []
  const delayBr: number[] = []
  const pending: string[] = []
  const disagreements: string[] = []

  let i = 0
  for (const row of rows) {
    const inr = Number(row[2])
    const vhg = String(row[VHG_COLUMN] ?? '')
    process.stderr.write(`\r${gp}: ${++i}/${rows.length}`)
    const c = (await gegenstand(gp, 'I', inr, null)).content ?? {}
    const kind = treatyKindOf(c)
    count(`VHG ${vhg}`)
    const expected = vhg === 'RVS15' ? 'vereinbarung-15a' : vhg === 'RVS' ? 'staatsvertrag' : '?'
    if (kind !== expected) disagreements.push(`  Art. ${inr} d.B.: VHG ${vhg}, Verlauf sagt ${kind}`)
    count(`statementsstate ${String(c.statementsstate ?? '(fehlt)').slice(0, 1)}`)
    if (c.vote) count('vote vorhanden')
    const title = stripHtmlToText(c.title ?? '')
    if (/^Einspruch\b/.test(title)) count('Titel beginnt „Einspruch"')
    const stages = (c.phase ?? []).flatMap((p) => (p.stages ?? []).map((s) => stripHtmlToText(s?.text ?? '')))
    if (stages.some((t) => /:\s*Genehmigung\b/.test(t))) count('Stufe „Genehmigung"')
    if (stages.some((t) => /Antrag, Einspruch zu erheben/.test(t))) count('Einspruch des Bundesrates im Verlauf')
    const status = String(c.status?.number ?? '')
    count(`Status ${status || '(leer)'}`)

    const decidedAt = findHouseDecisionDate(c.phase)
    const brDecidedAt = findBundesratDecisionDate(c.phase)
    if (decidedAt) count('Beschluss im Nationalrat')
    const link = extractBgblLink(c.status?.bgbllinks)
    const ris = pickBgblForTreaty(records, gp, inr)
    const linkTeil = link?.number ? /\b(I{1,3})\s+Nr\./.exec(link.number)?.[1] ?? '?' : null
    if (link) count(`Link vorhanden (Teil ${linkTeil})`)
    if (ris) count(`RIS-Schlüssel trifft (${ris.teil})`)
    if (link && ris) count(bgblShort(link.number ?? '') === ris.nummer ? 'Link = RIS' : 'Link ≠ RIS')
    if (link && !ris) count('nur Link')
    // The production rule (`resolveTreatyBgbl`): what page and list state.
    const resolved = resolveTreatyBgbl(ris ? { number: ris.nummer, datum: ris.datum } : null, link)
    count(`Regel: Kundmachung aus ${resolved ? (resolved.source === 'ris' ? 'RIS' : 'Parlament-Link') : '– (keine)'}`)
    if (!link && ris) count('nur RIS')
    if (link && ris && bgblShort(link.number ?? '') !== ris.nummer) disagreements.push(`  ${inr} d.B.: Link ${link.number}, RIS ${ris.nummer}`)
    if (link && !ris) disagreements.push(`  ${inr} d.B.: Link ${link.number}, RIS-Schlüssel ohne Treffer (${byNumber.get(bgblShort(link.number ?? ''))?.gp ?? 'kein'} / ${byNumber.get(bgblShort(link.number ?? ''))?.regierungsvorlagen.join(',') ?? '–'})`)
    if (vhg === 'RVS15' && (ris ?? (link ? { teil: `Teil${linkTeil === 'I' ? '1' : linkTeil === 'III' ? '3' : '?'}` } : null))) {
      const teil = ris?.teil ?? (linkTeil === 'I' ? 'Teil1' : `Teil ${linkTeil}`)
      count(`RVS15 in ${teil}`)
    }
    const issued = ris?.datum ?? (link?.number ? byNumber.get(bgblShort(link.number))?.datum ?? null : null)
    const dNr = spanInDays(decidedAt, issued)
    const dBr = spanInDays(brDecidedAt, issued)
    if (dNr !== null) delayNr.push(dNr)
    if (dBr !== null) delayBr.push(dBr)
    if (decidedAt && !link && !ris) pending.push(`  ${inr} d.B. ${vhg.padEnd(5)} genehmigt ${decidedAt} (${spanInDays(decidedAt, today)} Tage) · Status ${status} · ${title.slice(0, 90)}`)
  }
  process.stderr.write('\n')
  for (const [k, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) say(`  ${String(n).padStart(4)}  ${k}`)
  say(`  Verzug Beschluss NR → Ausgabe: ${spread(delayNr)}`)
  say(`  Verzug Beschluss BR → Ausgabe: ${spread(delayBr)}`)
  say(`  Verzug > 120 Tage (NR): ${delayNr.filter((d) => d > 120).length}`)
  say(`--- Abweichungen (${disagreements.length}) ---`)
  for (const d of disagreements) say(d)
  say(`--- Genehmigt, keine Kundmachung gefunden (${pending.length}) ---`)
  for (const p of pending) say(p)

  // The Ministerialentwürfe whose stage record links a treaty as Vorlage.
  const list81 = (await cachedOrSeeded(join(cacheDir, gp, 'list81.json'), join('.cache', 'ohne-begutachtung', gp, 'list81.json'), () => filterList(81, { GP_CODE: [gp] }))).rows ?? []
  const drafts = list81.map(mapDraftRow)
  const unique = [...new Set(drafts.map((d) => d.inr))]
  let j = 0
  let unread = 0
  const meTreaties: string[] = []
  for (const meInr of unique) {
    process.stderr.write(`\r${gp} ME: ${++j}/${unique.length}`)
    try {
      const me = await gegenstand(gp, 'ME', meInr, join('.cache', 'ohne-begutachtung'))
      for (const l of findRvLinks(parseStages(me.content?.stages))) {
        if (treatyKeys.has(`${l.gp}/${l.inr}`)) meTreaties.push(`  ${meInr}/ME ${gp} → ${l.label} ${l.gp}`)
      }
    } catch {
      unread++
    }
  }
  process.stderr.write('\n')
  say(`--- Ministerialentwürfe mit Staatsvertrags-Vorlage (${meTreaties.length} von ${unique.length}, ${unread} nicht lesbar) ---`)
  for (const m of meTreaties) say(m)
}
