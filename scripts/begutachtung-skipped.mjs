#!/usr/bin/env node
/**
 * Measures how many laws of one Gesetzgebungsperiode reached the
 * Bundesgesetzblatt WITHOUT ever having been in Begutachtung — the base rate
 * behind "a quarter of the bills were never publicly consulted".
 *
 * Usage:   node scripts/begutachtung-skipped.mjs XXVIII [cacheDir]
 *
 * Plain Node >= 18, no dependencies. Two list-101 calls plus one list-81
 * call, then one detail call per Regierungsvorlage and per Gesetzesantrag
 * (~280 for GP XXVIII), four at a time, raw JSON cached in `cacheDir`
 * (default `.cache/begutachtung-skipped/`) so a rerun is free. Output: a
 * summary on stdout and `<cacheDir>/<GP>-skipped.json` with one row per
 * enacted law.
 *
 * ---------------------------------------------------------------------------
 * WHY THE DENOMINATOR IS "ENACTED LAWS", NOT "REGIERUNGSVORLAGEN"
 *
 * Counting Regierungsvorlagen without a Ministerialentwurf measures only the
 * polite half of the bypass. A government that wants to avoid Begutachtung
 * does not file a Regierungsvorlage without one — it routes the bill through
 * its own MPs as an Initiativantrag, which is not a Regierungsvorlage at all
 * and therefore invisible to that count. In the 54-Novellen corpus of
 * `docs/api-exploration.md`, 25 of 54 amendments came via Initiativantrag or
 * Ausschussantrag.
 *
 * So the unit here is the **BGBl I number**: of the laws that actually
 * passed, how many went through a public consultation first? Three routes
 * lead to one:
 *
 *   Regierungsvorlage WITH a Ministerialentwurf  -> consulted
 *   Regierungsvorlage WITHOUT one                -> not consulted
 *   Initiativantrag (selbständiger Antrag, ART=A)-> not consulted, by
 *                                                   construction: an
 *                                                   Antrag of MPs has no
 *                                                   ministerial draft stage
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A HAND-MAINTAINED EXEMPTION LIST
 *
 * Some laws are exempt by design and calling them "skipped" is simply wrong:
 * the Bundesfinanzgesetze and the Bundesfinanzrahmengesetz follow the
 * constitutional budget timetable and never go to Begutachtung. Label a BFG
 * "ohne Begutachtung" and any reader who knows the procedure discards the
 * whole number.
 *
 * There is NO structured signal for this — measured 2026-09-15 on GP XXVIII:
 * list 101's `Gruppe` column is null on all 117 Regierungsvorlagen, and the
 * `THEMEN` tag "Budget und Finanzen" covers both the genuinely exempt
 * Bundesfinanzgesetz 2026 AND the Anti-Mogelpackungs-Gesetz and the
 * Preisauszeichnungsgesetz, which are ordinary consumer law. A keyword or
 * THEMEN rule would exempt precisely the cases that are the finding.
 *
 * Hence EXEMPT below: explicit, per item, with a reason — and the script
 * prints every non-exempt skipper in full so the list is maintained by
 * READING the corpus, not by guessing a rule. Same review loop as
 * `scripts/classifier-audit.ts`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = 'https://www.parlament.gv.at'
const HEADERS = {
  'User-Agent': 'begutachtungs-monitor/0.1 (ziviltech-prototyp; scripts/begutachtung-skipped)',
  Accept: 'application/json',
}
const CONCURRENCY = 4

/**
 * Laws that reach the Nationalrat without Begutachtung by design, keyed
 * `<GP>/<ITYP>/<INR>`. Every entry needs a reason — an exemption without one
 * is indistinguishable from a case someone found inconvenient.
 *
 * Reviewed for GP XXVIII on 2026-09-15. Deliberately NOT exempt:
 *  - 10 d.B. Bundeshaushaltsgesetz 2013, Änderung — the BHG is the organic
 *    budget law, but an amendment to it is ordinary legislation and could
 *    have been consulted. Flagged for review rather than waved through.
 *  - 87/91 d.B. Budgetsanierungsmaßnahmengesetz II — budget-flavoured by
 *    title, but substantively an omnibus (pensions, fees). The budget
 *    exemption covers the Bundesfinanzgesetz procedure, not everything with
 *    "Budget" in its name.
 *
 * TWO CANDIDATE CLASSES the first run surfaced, left in the count on purpose
 * until someone who knows the procedure rules on them (see
 * `outreach/verfahrensfragen.md` Q3):
 *
 *  a) **Budgetprovisorium** — 71/A and 123/A (Gesetzliches Budgetprovisorium
 *     2025). Budget procedure like the BFG, but filed as an Initiativantrag
 *     during government formation. If the budget exemption is about the
 *     subject matter it applies; if it is about the Art-51 timetable it does
 *     not.
 *  b) **Parliament's own organisational law** — Geschäftsordnungsgesetz
 *     (322/A), Informationsordnungsgesetz (323/A), Bundesbezügegesetz
 *     (562/A, 935/A), Klubfinanzierungsgesetz (950/A), Parteienfinanzierung
 *     (353/A), Parlamentsmitarbeitergesetz. Here the Initiativantrag is
 *     arguably the constitutionally CORRECT route — these are the
 *     Nationalrat's own affairs, and a ministerial draft would be the odd
 *     thing. Roughly six of the 87.
 *
 * Both classes move the headline by a few points, not by half. Whichever way
 * they are ruled, the finding survives — which is the point of listing them
 * openly rather than tuning the number.
 */
const EXEMPT = {
  'XXVIII/I/66': 'Bundesfinanzrahmengesetz 2025–2028 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/67': 'Bundesfinanzgesetz 2025 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/68': 'Bundesfinanzgesetz 2026 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/88': 'Begründung von Vorbelastungen — Budgetvollzug, kein Gesetzesvorhaben im üblichen Sinn',
  'XXVIII/I/494': 'Bundesfinanzgesetz 2027 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/495': 'Bundesfinanzgesetz 2028 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/496': 'Bundesfinanzrahmengesetz 2027–2030 — Budgetverfahren (Art 51 B-VG)',
}

const gp = process.argv[2]
if (!gp || !/^[IVXLC]+$/.test(gp)) {
  console.error('Usage: node scripts/begutachtung-skipped.mjs <GP, e.g. XXVIII> [cacheDir]')
  process.exit(1)
}
const cacheDir = process.argv[3] ?? join('.cache', 'begutachtung-skipped')
await mkdir(join(cacheDir, gp), { recursive: true })

async function cachedJson(file, load) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    const data = await load()
    await writeFile(file, JSON.stringify(data))
    return data
  }
}

async function fetchJson(url, init) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: HEADERS, signal: AbortSignal.timeout(15_000) })
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`)
      if (!res.ok) throw new Error(`HTTP ${res.status} (not retried)`)
      return await res.json()
    } catch (err) {
      if (attempt === 2 || String(err).includes('not retried')) throw err
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
}

function filterList(listId, body) {
  return fetchJson(`${BASE}/Filter/api/filter/data/${listId}?js=eval&showAll=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Run `task` over `items` with a fixed number of workers, in order-free fashion. */
async function pool(items, task) {
  const out = []
  let i = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < items.length) out.push(await task(items[i++]))
    }),
  )
  return out
}

/** "Bundesgesetzblatt I Nr. 73/2025" -> "I 73/2025"; anything else -> null. */
function bgblKey(title) {
  const m = /Nr\.\s*(\d+)\s*\/\s*(\d{4})/.exec(String(title ?? ''))
  if (!m) return null
  const teil = /\bI+\b/.exec(String(title ?? ''))?.[0] ?? 'I'
  return `${teil} ${m[1]}/${m[2]}`
}

// ---------------------------------------------------------------------------
// 1. The corpus: every Regierungsvorlage and every Gesetzesantrag of the GP
// ---------------------------------------------------------------------------

console.error(`Lade Liste 101 (Regierungsvorlagen und Anträge) für GP ${gp} …`)

const rvList = await cachedJson(join(cacheDir, gp, 'list101-rv.json'), () =>
  filterList(101, { GP_CODE: [gp], ITYP: ['I'], VHG: ['RV'] }),
)
const antragList = await cachedJson(join(cacheDir, gp, 'list101-a.json'), () =>
  filterList(101, { GP_CODE: [gp], ITYP: ['A'] }),
)
const meList = await cachedJson(join(cacheDir, gp, 'list81.json'), () =>
  filterList(81, { GP_CODE: [gp] }),
)

// list-81 INRs = the drafts that were actually in Begutachtung. Used to
// verify a Regierungsvorlage's `preconst` pointer rather than trust it.
const consultedInr = new Set((meList.rows ?? []).map((r) => Number(r[2])))

const rvItems = (rvList.rows ?? []).map((r) => ({
  ityp: 'I', inr: String(r[2]), citation: r[7], title: r[6], date: r[4],
}))
// ART=A is the selbständiger Antrag on a Bundesgesetz. A(E) is an
// Entschließungsantrag (a request to the government, never a law) and AMIN a
// Ministeranklage — neither can reach the Bundesgesetzblatt.
const antragItems = (antragList.rows ?? [])
  .filter((r) => r[5] === 'A')
  .map((r) => ({ ityp: 'A', inr: String(r[2]), citation: r[7], title: r[6], date: r[4] }))

console.error(
  `  ${rvItems.length} Regierungsvorlagen, ${antragItems.length} Gesetzesanträge, ` +
  `${consultedInr.size} Ministerialentwürfe in Begutachtung.`,
)

// ---------------------------------------------------------------------------
// 2. Detail per item: did it become law, and did a Begutachtung precede it?
// ---------------------------------------------------------------------------

console.error(`Lade ${rvItems.length + antragItems.length} Detail-JSONs (${CONCURRENCY} parallel) …`)

const resolved = await pool([...rvItems, ...antragItems], async (item) => {
  const detail = await cachedJson(
    join(cacheDir, gp, `${item.ityp}-${item.inr}.json`),
    () => fetchJson(`${BASE}/gegenstand/${gp}/${item.ityp}/${item.inr}?json=True`),
  )
  const content = detail?.content ?? {}

  // Enacted? The BGBl link on the item's own status block. Absent on
  // everything that was rejected, withdrawn or is still in the house.
  const links = Array.isArray(content.status?.bgbllinks) ? content.status.bgbllinks : []
  const bgbl = links.map((l) => bgblKey(l?.title)).filter(Boolean)

  // Consulted? Only a Regierungsvorlage can be: `preconst[]` names the
  // Ministerialentwurf. The pointer is verified against list 81 — it is not
  // a universal field (126 d.B. carries no `preconst` key at all), so its
  // absence alone is not proof, and its presence is checked, not believed.
  const pre = Array.isArray(content.preconst) ? content.preconst : []
  const me = pre.find((p) => p?.ityp === 'ME') ?? null
  const meVerified = me ? (me.gp_code !== gp || consultedInr.has(Number(me.inr))) : false

  return {
    ...item,
    bgbl,
    enacted: bgbl.length > 0,
    me: me ? `${me.gp_code}/ME/${me.inr}` : null,
    meVerified,
    consulted: item.ityp === 'I' && me !== null && meVerified,
    exemptReason: EXEMPT[`${gp}/${item.ityp}/${item.inr}`] ?? null,
  }
})

// ---------------------------------------------------------------------------
// 3. One row per BGBl number — the unit of the base rate
// ---------------------------------------------------------------------------

/* A law can be reached from more than one Gegenstand (a Regierungsvorlage
 * whose Ausschuss merged an Initiativantrag shows the same BGBl on both).
 * Counting Gegenstände would then double-count the law, so the BGBl number is
 * the key — and where two routes claim one number, the consulted route wins
 * and the collision is reported rather than silently resolved. */
const laws = new Map()
const collisions = []
for (const item of resolved.filter((r) => r.enacted)) {
  for (const key of item.bgbl) {
    const prev = laws.get(key)
    if (!prev) {
      laws.set(key, item)
      continue
    }
    collisions.push({ bgbl: key, a: prev.citation, b: item.citation })
    if (item.consulted && !prev.consulted) laws.set(key, item)
  }
}

// `item.bgbl` is the item's own list of BGBl numbers; the key is the one this
// row is about, so it is spread LAST and wins.
const all = [...laws.entries()].map(([bgbl, item]) => ({ ...item, bgbl }))
const consulted = all.filter((l) => l.consulted)
const exempt = all.filter((l) => !l.consulted && l.exemptReason)
const skipped = all.filter((l) => !l.consulted && !l.exemptReason)
const skippedRv = skipped.filter((l) => l.ityp === 'I')
const skippedAntrag = skipped.filter((l) => l.ityp === 'A')

const base = consulted.length + skipped.length
const pct = (n) => (base ? ((n / base) * 100).toFixed(1) : '0.0')

// ---------------------------------------------------------------------------
// 4. Report — the skipped list in full, because that is what gets reviewed
// ---------------------------------------------------------------------------

const out = []
const say = (s = '') => { out.push(s); console.log(s) }

say(`\n=== Begutachtung übersprungen — GP ${gp} ===\n`)
say(`Kundgemachte Gesetze (BGBl-Nummern) gesamt: ${all.length}`)
say(`  davon ausgenommen (Budgetverfahren o. Ä.): ${exempt.length}`)
say(`  Bezugsgröße nach Ausnahmen:               ${base}\n`)
say(`Mit Begutachtung:   ${String(consulted.length).padStart(4)}  (${pct(consulted.length)} %)`)
say(`Ohne Begutachtung:  ${String(skipped.length).padStart(4)}  (${pct(skipped.length)} %)`)
say(`    als Regierungsvorlage ohne Ministerialentwurf: ${skippedRv.length}`)
say(`    als Initiativantrag von Abgeordneten:          ${skippedAntrag.length}`)

if (collisions.length) {
  say(`\n${collisions.length} BGBl-Nummer(n) über zwei Gegenstände erreichbar (einmal gezählt):`)
  for (const c of collisions) say(`  ${c.bgbl}: ${c.a} / ${c.b}`)
}

say(`\n--- Ohne Begutachtung, vollständig (Prüfliste für EXEMPT) ---`)
for (const l of [...skipped].sort((a, b) => a.bgbl.localeCompare(b.bgbl))) {
  say(`  BGBl. ${l.bgbl.padEnd(11)} ${String(l.citation).padEnd(20)} ${l.date}  ${l.title}`)
}

if (exempt.length) {
  say(`\n--- Ausgenommen, mit Begründung ---`)
  for (const l of exempt) say(`  BGBl. ${l.bgbl.padEnd(11)} ${String(l.citation).padEnd(20)} ${l.exemptReason}`)
}

const rowsFile = join(cacheDir, `${gp}-skipped.json`)
await writeFile(rowsFile, JSON.stringify({
  gp,
  measuredAt: new Date().toISOString().slice(0, 10),
  totals: {
    laws: all.length, exempt: exempt.length, base,
    consulted: consulted.length, skipped: skipped.length,
    skippedRv: skippedRv.length, skippedAntrag: skippedAntrag.length,
  },
  collisions,
  rows: all,
}, null, 1))
say(`\nZeilen: ${rowsFile}`)
say(`Bericht: ${join(cacheDir, `${gp}-skipped.txt`)}`)
await writeFile(join(cacheDir, `${gp}-skipped.txt`), out.join('\n') + '\n')
