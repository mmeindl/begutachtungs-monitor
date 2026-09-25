#!/usr/bin/env vite-node
/**
 * What a Periodenwechsel does to the Startseite — the measurement behind the
 * named fallback of „Wo am meisten mitgeredet wurde" and „Zuletzt Gesetz
 * geworden" (docs/architecture.md §12.35).
 *
 * Usage:   npx vite-node scripts/corpus/periodenwechsel.ts XXVII XXVIII
 *          (the period that ended, then the one that convened)
 *
 * Both accountability sections read list 81/101 of the RUNNING
 * Gesetzgebungsperiode, and on the day a new one constitutes itself that
 * period is empty. The question this answers is not whether there is a gap —
 * there always is — but HOW LONG it lasts and what the page shows meanwhile,
 * because the conditions that switch the fallback on are cut to it
 * (`canRankPeriod`, `getRecentlyEnacted`). Re-run it at the next Wechsel to
 * check the conditions against the period that actually happened.
 *
 * Three answers, in the order the page is read:
 *
 *  (a) OFFENE LISTE — Begutachtungen of the old period whose Frist was still
 *      running on the cutover day. They vanish from `/`, `/feed.xml` and
 *      `/kalender.ics` the moment `getCurrentGp()` flips, while anyone can
 *      still file a Stellungnahme on them. NOT fixed by §12.35; open item.
 *  (b) RANGLISTE — when the new period's list 81 first holds one row and
 *      when it holds five, in days after the konstituierende Sitzung.
 *  (c) KUNDMACHUNGEN — the first law of the new period that came out of a
 *      Ministerialentwurf, which is the first row „Zuletzt Gesetz geworden"
 *      could show.
 *
 * One list-81 call per period, one list-101 call, and a detail JSON for the
 * earliest finished Vorlagen. Nothing is cached: it is three calls plus a
 * bounded scan, and it runs a handful of times per decade.
 */
import { PARLIAMENT as BASE, getJson } from '../lib/http'
import { pool } from '../lib/async'
import { mapDraftRow } from '../../server/utils/parliament/list81'
import { GP_STARTS, GP_RE } from '../../shared/utils/gp'

const SCRIPT = 'corpus/periodenwechsel'
const CONCURRENCY = 4

/**
 * How many of the new period's finished Vorlagen are opened looking for the
 * first Kundmachung. Generous on purpose — Einlangen does not order
 * promulgations (up to 91 days apart, §12.23), and this runs once.
 */
const SCAN = 45

const [oldGp, newGp] = process.argv.slice(2)
if (!oldGp || !newGp || !GP_RE.test(oldGp) || !GP_RE.test(newGp)) {
  console.error('Usage: npx vite-node scripts/corpus/periodenwechsel.ts <alte GP> <neue GP>')
  process.exit(1)
}
const start = GP_STARTS[newGp]
if (!start) {
  console.error(`Kein Beginn für GP ${newGp} in GP_STARTS (shared/utils/gp.ts) — Zeile ergänzen.`)
  process.exit(1)
}

function post<T>(list: number, body: unknown): Promise<T> {
  return getJson<T>(`${BASE}/Filter/api/filter/data/${list}?js=eval&showAll=true`, {
    script: SCRIPT,
    method: 'POST',
    body,
    attempts: 3,
    backoffMs: (retry) => 500 * retry,
    timeoutMs: 25_000,
  })
}

const daysIn = (iso: string) => Math.round((Date.parse(iso) - Date.parse(start)) / 86_400_000)

async function drafts(gp: string) {
  const res = await post<{ rows?: unknown[][] }>(81, { GP_CODE: [gp] })
  return (res.rows ?? []).map(mapDraftRow)
}

console.log(`\n=== ${oldGp} → ${newGp}, konstituiert ${start} ===`)

// (a) Was am Stichtag noch offen war — und von der Startseite verschwindet.
const old = await drafts(oldGp)
const stillOpen = old.filter((d) => d.deadline && d.deadline >= start)
console.log(`\n(a) Offene Begutachtungen der ${oldGp} am Stichtag: ${stillOpen.length}`)
for (const d of stillOpen) {
  console.log(
    `    ${d.citation.padEnd(10)} Frist ${d.deadline} (+${daysIn(d.deadline!)} Tage)  ` +
    `${String(d.statementCount).padStart(4)} SN  ${d.title.slice(0, 50)}`,
  )
}

// (b) Wann die Rangliste wieder eine Rangliste ist.
const fresh = await drafts(newGp)
const arrivals = fresh
  .map((d) => d.arrivedAt.slice(0, 10))
  .filter(Boolean)
  .sort()
console.log(`\n(b) Liste 81 der ${newGp}: ${fresh.length} Entwürfe insgesamt`)
for (const n of [1, 3, 5]) {
  const at = arrivals[n - 1]
  console.log(`    ${n}. Entwurf: ${at ?? '—'}${at ? `  (+${daysIn(at)} Tage)` : ''}`)
}

// (c) Die erste Kundmachung der neuen Periode, die aus einer Begutachtung kam.
const res101 = await post<{ rows?: unknown[][] }>(101, {
  GP_CODE: [newGp],
  ITYP: ['I'],
  VHG: ['RV'],
})
const finished = (res101.rows ?? [])
  .filter((r) => String(r[10]) === '5')
  .map((r) => ({ inr: Number(r[2]), date: String(r[16] ?? '').slice(0, 10), citation: String(r[7]) }))
  .sort((a, b) => a.date.localeCompare(b.date))
  .slice(0, SCAN)

const scanned = await pool(finished, CONCURRENCY, async (v) => {
  try {
    const d = await getJson<{ content?: Record<string, unknown> }>(
      `${BASE}/gegenstand/${newGp}/I/${v.inr}?json=True`,
      { script: SCRIPT, attempts: 3, backoffMs: (r) => 500 * r, timeoutMs: 25_000 },
    )
    const status = d.content?.status as { bgbllinks?: { link?: string }[] } | undefined
    const entry = (status?.bgbllinks ?? []).find((l) => (l?.link ?? '').includes('Abfrage=BgblAuth'))
    const m = /BGBLA_(\d{4})_([IVX]+)_(\d+)/.exec(entry?.link ?? '')
    if (!m) return null
    const pre = (d.content?.preconst ?? []) as { ityp?: string; gp_code?: string; inr?: number }[]
    const me = pre.find((p) => p?.ityp === 'ME' && p.gp_code && p.inr != null)
    return {
      ...v,
      bgbl: `${m[2]} Nr. ${m[3]}/${m[1]}`,
      order: Number(m[1]) * 100_000 + Number(m[3]),
      me: me ? `${me.gp_code}/${me.inr}/ME` : null,
    }
  } catch {
    return null
  }
})

const enacted = scanned
  .filter((x): x is NonNullable<typeof x> => x !== null)
  .sort((a, b) => a.order - b.order)
console.log(`\n(c) Erste Kundmachungen der ${newGp} (aus ${finished.length} frühesten fertigen Vorlagen):`)
for (const e of enacted.slice(0, 6)) {
  console.log(
    `    BGBl. ${e.bgbl.padEnd(13)} ${e.citation.padEnd(10)} Vorlage eingelangt ${e.date}  ` +
    `ME: ${e.me ?? '— (keine Begutachtung)'}`,
  )
}
const first = enacted.find((e) => e.me)
console.log(
  first
    ? `    → erste mögliche Zeile: BGBl. ${first.bgbl} aus ${first.me}, ` +
    `Vorlage eingelangt ${first.date} = +${daysIn(first.date)} Tage`
    : '    → keine Kundmachung aus einer Begutachtung im Scan-Fenster',
)
console.log()
