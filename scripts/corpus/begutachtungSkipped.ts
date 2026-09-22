#!/usr/bin/env node
/**
 * Measures how many laws of one Gesetzgebungsperiode reached the
 * Bundesgesetzblatt WITHOUT ever having been in Begutachtung — the base rate
 * behind "a quarter of the bills were never publicly consulted".
 *
 * Usage:   npx vite-node scripts/corpus/begutachtungSkipped.ts XXVIII [cacheDir]
 *
 * Two list-101 calls plus one list-81 call, then one detail call per
 * Regierungsvorlage and per Gesetzesantrag (~280 for GP XXVIII), four at a
 * time, raw JSON cached in `cacheDir` (default
 * `.cache/begutachtung-skipped/`) so a rerun is free. Output: a summary on
 * stdout and `<cacheDir>/<GP>-skipped.json` with one row per enacted law.
 *
 * Was plain Node with no dependencies until 22.09.2026, which bought nothing
 * and cost a typecheck: `tsconfig.tools.json` covers every `.ts` under
 * `scripts/`, so 1.330 lines of `.mjs` were the one half of the repo that
 * nothing looked at.
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
 * `scripts/audit/classifier.ts`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PARLIAMENT as BASE, getJson } from '../lib/http'
import { cachedJson } from '../lib/diskCache'
import { pool } from '../lib/async'
import type { MeAntragReport, SkippedRow } from '../lib/skippedReport'

const SCRIPT = 'corpus/begutachtungSkipped'
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
const EXEMPT: Record<string, string> = {
  'XXVIII/I/66': 'Bundesfinanzrahmengesetz 2025–2028 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/67': 'Bundesfinanzgesetz 2025 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/68': 'Bundesfinanzgesetz 2026 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/88': 'Begründung von Vorbelastungen — Budgetvollzug, kein Gesetzesvorhaben im üblichen Sinn',
  'XXVIII/I/494': 'Bundesfinanzgesetz 2027 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/495': 'Bundesfinanzgesetz 2028 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/496': 'Bundesfinanzrahmengesetz 2027–2030 — Budgetverfahren (Art 51 B-VG)',

  /* GP XXVII, kuratiert 2026-09-16 durch Lesen aller 535 übersprungenen
   * Titel. 27 Posten tragen einen Budgetverfahrens-Titel, 21 davon sind
   * ausgenommen. Die übrigen sechs bleiben mit Begründung in der Zählung —
   * siehe unten, direkt nach der Liste. */
  'XXVII/I/55': 'Bundesfinanzgesetz 2020 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/380': 'Bundesfinanzgesetz 2021 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/1034': 'Bundesfinanzgesetz 2022 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/1669': 'Bundesfinanzgesetz 2023 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/2178': 'Bundesfinanzgesetz 2024 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/56': 'Bundesfinanzrahmengesetz 2020–2023 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/484': 'Bundesfinanzrahmengesetz 2021–2024 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/811': 'BFRG 2021–2024 und BFG 2021, Änderung — Änderung innerhalb des Budgetverfahrens',
  'XXVII/I/1035': 'Bundesfinanzrahmengesetz 2022–2025 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/1444': 'BFRG 2022–2025 und BFG 2022, Änderung — Änderung innerhalb des Budgetverfahrens',
  'XXVII/I/1670': 'Bundesfinanzrahmengesetz 2023–2026 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/2170': 'BFRG 2023–2026 und BFG 2023, Änderung — Änderung innerhalb des Budgetverfahrens',
  'XXVII/I/2179': 'Bundesfinanzrahmengesetz 2024–2027 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/343': 'Vorbelastungen BM Digitalisierung und Wirtschaftsstandort — Budgetvollzug',
  'XXVII/I/412': 'Vorbelastungen BM Klimaschutz — Budgetvollzug',
  'XXVII/I/1144': 'Vorbelastungen BM Klimaschutz — Budgetvollzug',
  'XXVII/I/1745': 'Vorbelastungen BM Klimaschutz — Budgetvollzug',
  'XXVII/I/1770': 'Vorbelastungen BM Klimaschutz — Budgetvollzug',
  'XXVII/I/2269': 'Vorbelastungen BM Klimaschutz — Budgetvollzug',
  'XXVII/I/2270': 'Vorbelastungen BM Klimaschutz — Budgetvollzug',
  'XXVII/A/1560': 'Vorbelastungen BM Digitalisierung und Wirtschaftsstandort, Änderung — Budgetvollzug',
}

/* GP XXVII — die sechs Budget-Titel, die NICHT ausgenommen sind, jeweils mit
 * Grund. Sie stehen hier und nicht in EXEMPT, weil das Nichtausnehmen genauso
 * eine Entscheidung ist wie das Ausnehmen und genauso nachlesbar sein muss.
 *
 * a) VORBELASTUNG PLUS SACHGESETZ — die Ermächtigung ist Budgetvollzug, das
 *    mitgeführte Gesetz ist es nicht, und der Sachteil hätte begutachtet
 *    werden können. Gleiche Linie wie beim Budgetsanierungsmaßnahmengesetz II
 *    in GP XXVIII: ein Titel mit „Budget" darin macht noch kein
 *    Budgetverfahren.
 *      3656/A  Vorbelastungen BMAW; CHIP-GESETZ-BEGLEITMASSNAHMENGESETZ
 *      3085/A  Vorbelastungen BMAW; Unternehmens-Energiekostenzuschussgesetz, Änderung
 *      2829/A  Vorbelastungen BMDW; Unternehmens-Energiekostenzuschussgesetz u.a., Änderung
 *      1778/A  Vorbelastungen; COVID-19-Bundesvermögen-Ermächtigungen, Änderung
 *
 * b) BUDGETPROVISORIUM — Budgetmaterie, aber als Initiativantrag während der
 *    Regierungsbildung eingebracht. Identisch zu 71/A und 123/A in GP XXVIII,
 *    die dort ebenfalls in der Zählung bleiben, solange niemand mit
 *    Verfahrenskenntnis darüber entschieden hat (`verfahrensfragen.md` B2).
 *      282/A, 112/A  Gesetzliches Budgetprovisorium 2020
 */

/**
 * Welche Klubs waren wann in der Regierung? Braucht es, um die Frage zu
 * beantworten, die jede Fachperson als erste stellt: ein Initiativantrag ist
 * Parlamentsrecht — aber von wem? Ein Antrag der Regierungsklubs ist ein
 * Regierungsvorhaben auf dem kurzen Weg, ein Oppositionsantrag ist es nicht.
 *
 * Die Tabelle ist handgepflegt wie EXEMPT, und aus demselben Grund: es gibt
 * kein Feld dafür. `frak_code` sagt den Klub, nicht seine Rolle — und die
 * Rolle wechselt mitten in der Periode. Datum ist das Einlangen des Antrags.
 *
 * Vorsicht bei XXVIII: die ÖVP-Grüne-Regierung war ab 24.10.2024 nur noch
 * geschäftsführend UND ohne Mehrheit im Haus. „Nur Koalitionsklubs" heißt in
 * diesem Fenster also nicht dasselbe wie danach; der Bericht trennt deshalb
 * nach Ära statt nur zu summieren.
 */
interface Era {
  from: string
  clubs: string[]
  label: string
}

const COALITIONS: Record<string, Era[]> = {
  XXVIII: [
    { from: '2024-10-24', clubs: ['V', 'G'], label: 'ÖVP-Grüne (geschäftsführend, ohne Mehrheit)' },
    { from: '2025-03-03', clubs: ['V', 'S', 'N'], label: 'ÖVP-SPÖ-NEOS' },
  ],
  XXVII: [
    { from: '2019-10-23', clubs: [], label: 'Beamtenregierung Bierlein (keine Klubs)' },
    { from: '2020-01-07', clubs: ['V', 'G'], label: 'ÖVP-Grüne' },
  ],
}

const gp = process.argv[2] ?? ''
if (!gp || !/^[IVXLC]+$/.test(gp)) {
  console.error('Usage: npx vite-node scripts/corpus/begutachtungSkipped.ts <GP, e.g. XXVIII> [cacheDir]')
  process.exit(1)
}
const cacheDir = process.argv[3] ?? join('.cache', 'begutachtung-skipped')
await mkdir(join(cacheDir, gp), { recursive: true })

/** Drei Versuche auf 5xx und Verbindungsabbruch; ein 4xx ist die Antwort und wird nicht wiederholt. */
function fetchJson<T>(url: string, body?: unknown): Promise<T> {
  return getJson<T>(url, {
    script: SCRIPT,
    attempts: 3,
    backoffMs: (retry) => 500 * retry,
    timeoutMs: 15_000,
    ...(body === undefined ? {} : { method: 'POST' as const, body }),
  })
}

interface ListAnswer {
  count?: number
  rows?: unknown[][]
}

function filterList(listId: number, body: unknown, { showAll = true } = {}): Promise<ListAnswer> {
  return fetchJson<ListAnswer>(`${BASE}/Filter/api/filter/data/${listId}?js=eval${showAll ? '&showAll=true' : ''}`, body)
}

/** Welche Klubs waren am Tag `date` in der Regierung? */
function coalitionAt(date: string | null): Era | { clubs: string[]; label: string } {
  const d = String(date ?? '').slice(0, 10)
  const eras = COALITIONS[gp] ?? []
  let hit: Era | null = null
  for (const era of eras) if (d >= era.from) hit = era
  return hit ?? { clubs: [], label: 'Regierung unbekannt (GP nicht in COALITIONS)' }
}

/* Titelvergleich für die Vorgeschichte-Prüfung (§3c). Bewusst grob: Titel
 * sind kurz, die Schreibweise schwankt ("42.KFG-Novelle" vs "42. KFG-
 * Novelle"). Die Kalibrierung steht im Bericht — echte ME→RV-Paare werden
 * mit demselben Maß gemessen, damit man sieht, was es taugt. */
const STOPWORDS = new Set(['und', 'der', 'die', 'das', 'des', 'aenderung', 'bundesgesetz', 'mit', 'dem', 'ueber', 'zur', 'von', 'sowie', 'gesetz'])
const titleTokens = (s: string | null | undefined): Set<string> =>
  new Set(
    String(s ?? '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, ' ').trim()
      .split(' ').filter((t) => t.length > 3 && !STOPWORDS.has(t)),
  )
function titleSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const A = titleTokens(a), B = titleTokens(b)
  if (!A.size || !B.size) return 0
  let shared = 0
  for (const t of A) if (B.has(t)) shared++
  return shared / (A.size + B.size - shared)
}

/** "Bundesgesetzblatt I Nr. 73/2025" -> "I 73/2025"; anything else -> null. */
function bgblKey(title: unknown): string | null {
  const m = /Nr\.\s*(\d+)\s*\/\s*(\d{4})/.exec(String(title ?? ''))
  if (!m) return null
  const teil = /\bI+\b/.exec(String(title ?? ''))?.[0] ?? 'I'
  return `${teil} ${m[1]}/${m[2]}`
}

// ---------------------------------------------------------------------------
// 1. The corpus: every Regierungsvorlage and every Gesetzesantrag of the GP
// ---------------------------------------------------------------------------

console.error(`Lade Liste 101 (Regierungsvorlagen und Anträge) für GP ${gp} …`)

const rvList = await cachedJson<ListAnswer>(join(cacheDir, gp, 'list101-rv.json'), () =>
  filterList(101, { GP_CODE: [gp], ITYP: ['I'], VHG: ['RV'] }),
)
const antragList = await cachedJson<ListAnswer>(join(cacheDir, gp, 'list101-a.json'), () =>
  filterList(101, { GP_CODE: [gp], ITYP: ['A'] }),
)
const meList = await cachedJson<ListAnswer>(join(cacheDir, gp, 'list81.json'), () =>
  filterList(81, { GP_CODE: [gp] }),
)

// list-81 INRs = the drafts that were actually in Begutachtung. Used to
// verify a Regierungsvorlage's `preconst` pointer rather than trust it.
const consultedInr = new Set((meList.rows ?? []).map((r) => Number(r[2])))

interface Item {
  ityp: string
  inr: string
  citation: string
  title: string
  date: string
}

const rvItems: Item[] = (rvList.rows ?? []).map((r) => ({
  ityp: 'I', inr: String(r[2]), citation: r[7] as string, title: r[6] as string, date: r[4] as string,
}))
// ART=A is the selbständiger Antrag on a Bundesgesetz. A(E) is an
// Entschließungsantrag (a request to the government, never a law) and AMIN a
// Ministeranklage — neither can reach the Bundesgesetzblatt.
const antragItems: Item[] = (antragList.rows ?? [])
  .filter((r) => r[5] === 'A')
  .map((r) => ({ ityp: 'A', inr: String(r[2]), citation: r[7] as string, title: r[6] as string, date: r[4] as string }))

console.error(
  `  ${rvItems.length} Regierungsvorlagen, ${antragItems.length} Gesetzesanträge, ` +
  `${consultedInr.size} Ministerialentwürfe in Begutachtung.`,
)

// ---------------------------------------------------------------------------
// 2. Detail per item: did it become law, and did a Begutachtung precede it?
// ---------------------------------------------------------------------------

console.error(`Lade ${rvItems.length + antragItems.length} Detail-JSONs (${CONCURRENCY} parallel) …`)

interface ItemDetail {
  content?: {
    title?: string
    einlangen?: string
    status?: { bgbllinks?: { title?: string }[] }
    preconst?: { ityp?: string; gp_code?: string; inr?: string | number }[]
    names?: { funktext?: string; frak_code?: string }[]
    stages?: { text?: string }[]
  }
}

type Resolved = Item & Omit<SkippedRow, 'bgbl' | keyof Item> & { bgbl: string[] }

const resolved: Resolved[] = await pool([...rvItems, ...antragItems], CONCURRENCY, async (item) => {
  const detail = await cachedJson<ItemDetail>(
    join(cacheDir, gp, `${item.ityp}-${item.inr}.json`),
    () => fetchJson(`${BASE}/gegenstand/${gp}/${item.ityp}/${item.inr}?json=True`),
  )
  const content = detail?.content ?? {}

  // Enacted? The BGBl link on the item's own status block. Absent on
  // everything that was rejected, withdrawn or is still in the house.
  const links = Array.isArray(content.status?.bgbllinks) ? content.status.bgbllinks : []
  const bgbl = links.map((l) => bgblKey(l?.title)).filter((b): b is string => b !== null)

  // Consulted? Only a Regierungsvorlage can be: `preconst[]` names the
  // Ministerialentwurf. The pointer is verified against list 81 — it is not
  // a universal field (126 d.B. carries no `preconst` key at all), so its
  // absence alone is not proof, and its presence is checked, not believed.
  const pre = Array.isArray(content.preconst) ? content.preconst : []
  const me = pre.find((p) => p?.ityp === 'ME') ?? null
  const meVerified = me ? (me.gp_code !== gp || consultedInr.has(Number(me.inr))) : false

  // Wer hat eingebracht? `names[]` führt die namentlich genannten
  // Antragsteller:innen mit Klubkürzel (`frak_code`). Die "Kolleginnen und
  // Kollegen" des Antragstexts stehen NICHT darin — "nur Koalitionsklubs"
  // heißt also immer: die namentlich Genannten sind es.
  const clubs = [...new Set(
    (Array.isArray(content.names) ? content.names : [])
      .filter((n) => /Eingebracht/i.test(String(n?.funktext ?? '')))
      .map((n) => n?.frak_code).filter((c): c is string => Boolean(c)),
  )].sort()

  return {
    ...item,
    bgbl,
    enacted: bgbl.length > 0,
    einlangen: String(content.einlangen ?? '').slice(0, 10) || null,
    clubs,
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
const laws = new Map<string, Resolved>()
const collisions: { bgbl: string; a: string; b: string }[] = []
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
const all: SkippedRow[] = [...laws.entries()].map(([bgbl, item]) => ({ ...item, bgbl }))
const consulted = all.filter((l) => l.consulted)
const exempt = all.filter((l) => !l.consulted && l.exemptReason)
const skipped = all.filter((l) => !l.consulted && !l.exemptReason)
const skippedRv = skipped.filter((l) => l.ityp === 'I')
const skippedAntrag = skipped.filter((l) => l.ityp === 'A')

const base = consulted.length + skipped.length
const pct = (n: number) => (base ? ((n / base) * 100).toFixed(1) : '0.0')

// ---------------------------------------------------------------------------
// 3b. Wer bringt die Initiativanträge ein?
// ---------------------------------------------------------------------------

/* Ohne diese Zeile ist die Zahl angreifbar, und zwar zu Recht: "Initiativ-
 * anträge sind Parlamentsrecht, das ist doch kein Befund." Stimmt — solange
 * es die Abgeordneten sind. Sind es die Regierungsklubs, ist es ein
 * Regierungsvorhaben, das den Entwurfsschritt auslässt. */

// Wie viele Klubs hat dieses Haus? Aus dem Korpus statt hart kodiert.
const allClubs = new Set(resolved.flatMap((r) => r.clubs))

function classifyClubs(item: SkippedRow): SkippedRow & { kind: string; era: string } {
  const { clubs: koa, label } = coalitionAt(item.einlangen ?? item.date)
  const fromKoa = item.clubs.filter((c) => koa.includes(c))
  const fromOpp = item.clubs.filter((c) => !koa.includes(c))
  const kind = item.clubs.length === 0
    ? 'ohne Klubangabe'
    : allClubs.size > 0 && item.clubs.length === allClubs.size
      ? 'alle Klubs'
      : fromOpp.length === 0
        ? 'nur Regierungsklubs'
        : fromKoa.length === 0
          ? 'nur Opposition'
          : 'übergreifend'
  return { ...item, kind, era: label }
}
const antragKinds = skippedAntrag.map(classifyClubs)
const koaAntraege = antragKinds.filter((l) => l.kind === 'nur Regierungsklubs')

// ---------------------------------------------------------------------------
// 3c. Vorgeschichte: war der Inhalt vorher als Ministerialentwurf in Begutachtung?
// ---------------------------------------------------------------------------

/* Der Rechts-, Legislativ- und Wissenschaftliche Dienst des Parlaments hat in
 * seinem Fachdossier vom 31.10.2024 festgehalten, dass Gesetzgebungsverfahren
 * als Ministerialentwurf beginnen und dann als selbständiger Antrag ins Haus
 * kommen — in der Tagung 2023/24 bei 19 der 93 Anträge von ÖVP und Grünen.
 * Solche Gesetze WAREN in Begutachtung, und dieses Skript zählte sie bis
 * 16.09.2026 trotzdem als übersprungen. Also: nachmessen.
 *
 * Der strukturierte Weg dorthin existiert nicht. Die `stages` eines
 * Ministerialentwurfs führen zwar einen Nachfolger-Zeiger, aber gemessen auf
 * GP XXVIII zeigen alle 96 vorhandenen Zeiger auf eine Regierungsvorlage und
 * kein einziger auf einen Antrag. Der Weg ME → Initiativantrag ist in den
 * Daten unsichtbar — deshalb hier über Titel und Datum, deshalb als
 * KANDIDATENLISTE zum Nachlesen und nicht als stille Umbuchung.
 *
 * Der Befund wird berichtet, nicht angewendet: die Kopfzahl bleibt, darunter
 * steht die Spanne. Gleiche Linie wie bei den Ausnahmen — wer die Korrektur
 * anders beurteilt, sieht beide Zahlen. */

const meRows = (meList.rows ?? []).map((r) => ({ inr: String(r[2]) }))
console.error(`Lade ${meRows.length} Ministerialentwurf-Details (Vorgeschichte-Prüfung) …`)

// Titel kommt aus dem Detail-JSON, nicht aus der Liste: Liste 81 führt auf
// Spalte 4 den Betreff und auf Spalte 6 das RESSORT — eine Verwechslung, die
// lautlos Unsinn vergleicht (einmal passiert, 16.09.2026).
const meDetails = await pool(meRows, CONCURRENCY, async (me) => {
  const detail = await cachedJson<ItemDetail>(
    join(cacheDir, gp, `ME-${me.inr}.json`),
    () => fetchJson(`${BASE}/gegenstand/${gp}/ME/${me.inr}?json=True`),
  )
  const c = detail?.content ?? {}
  const stages = Array.isArray(c.stages) ? c.stages : []
  let frist: string | null = null
  for (const s of stages) {
    const m = /Ende der Begutachtungsfrist\s+(\d{2})\.(\d{2})\.(\d{4})/.exec(String(s.text ?? ''))
    if (m) frist = `${m[3]}-${m[2]}-${m[1]}`
  }
  return {
    inr: me.inr,
    title: c.title ?? '',
    start: String(c.einlangen ?? '').slice(0, 10) || null,
    frist,
    // Wurde der Entwurf selbst zur Regierungsvorlage? Dann ist ein
    // gleichnamiger Antrag eher ein zweites Vorhaben zur selben Materie.
    rv: stages.flatMap((s) => [...String(s.text ?? '').matchAll(/\/gegenstand\/[IVXLC]+\/I\/(\d+)/g)].map((m) => m[1]!))[0] ?? null,
  }
})

/* Kalibrierung: dasselbe Titelmaß an Paaren, die nachweislich zusammengehören
 * (Entwurf → seine eigene Regierungsvorlage). Sagt dem Leser, wie viel die
 * Schwelle unten wert ist, statt ihn raten zu lassen. */
const rvTitle = new Map(rvItems.map((r) => [r.inr, r.title]))
const calib = meDetails
  .filter((m) => m.rv && rvTitle.has(m.rv))
  .map((m) => titleSimilarity(m.title, rvTitle.get(m.rv!)))
  .sort((a, b) => a - b)
const calibMiss = calib.filter((s) => s < 0.5).length

type Vorgeschichte = (typeof antragKinds)[number] & {
  meInr: string
  meTitle: string
  meStart: string | null
  meFrist: string | null
  meBecameRv: boolean
  score: number
  strong: boolean
  fristOffen: boolean
}
const vorgeschichte: Vorgeschichte[] = []
for (const a of antragKinds) {
  const when = a.einlangen ?? a.date
  const best = meDetails
    .filter((m) => m.start && m.title && m.start < String(when).slice(0, 10))
    .map((m) => ({ me: m, score: titleSimilarity(a.title, m.title) }))
    .filter((x) => x.score >= 0.5)
    .sort((x, y) => y.score - x.score)[0]
  if (!best) continue
  vorgeschichte.push({
    ...a,
    meInr: best.me.inr,
    meTitle: best.me.title,
    meStart: best.me.start,
    meFrist: best.me.frist,
    meBecameRv: Boolean(best.me.rv),
    score: Number(best.score.toFixed(2)),
    // Titel identisch UND der Entwurf ist nie Regierungsvorlage geworden:
    // dann ist der Antrag die plausibelste Fortsetzung.
    strong: best.score === 1 && !best.me.rv,
    // Antrag eingebracht, bevor die Frist ablief — begutachtet wurde dann
    // zwar, aber am laufenden Verfahren vorbei.
    fristOffen: Boolean(best.me.frist && String(when).slice(0, 10) <= best.me.frist),
  })
}
vorgeschichte.sort((a, b) => String(a.einlangen).localeCompare(String(b.einlangen)))
const vgAbgelaufen = vorgeschichte.filter((v) => !v.fristOffen)
const vgStark = vorgeschichte.filter((v) => v.strong)
const korrHoch = skipped.length - vorgeschichte.length
const korrNiedrig = skipped.length - vgAbgelaufen.length
const korrStark = skipped.length - vgStark.length

/* Der Titelabgleich ist die schwache Fassung dieser Prüfung. Die starke
 * vergleicht die Gesetzestexte und steht in `scripts/corpus/meAntragJoin.ts`;
 * wenn sie gelaufen ist, liegt ihr Ergebnis hier und hat Vorrang. Getrennte
 * Skripte, weil der Textabgleich pro Gegenstand ein Dokument lädt und damit
 * eine ganz andere Laufzeit hat als der Rest. */
let textJoin: MeAntragReport | null = null
try { textJoin = JSON.parse(await readFile(join(cacheDir, `${gp}-me-antrag.json`), 'utf8')) as MeAntragReport } catch { /* the join file is optional */ }
// `strong` trägt die Korrektur, `schwach` nur die Spanne — die Grenze ist im
// Join-Skript an einer Lücke in den Daten abgelesen, nicht gewählt.
const bestaetigt = (textJoin?.hits ?? []).filter((h) => h.strong)
const schwach = (textJoin?.hits ?? []).filter((h) => !h.strong)
const korrBestaetigt = skipped.length - bestaetigt.length
const korrMitSchwachen = skipped.length - bestaetigt.length - schwach.length

// ---------------------------------------------------------------------------
// 3d. Ist „ohne Begutachtung" dasselbe wie „ohne Öffentlichkeit"? Nein.
// ---------------------------------------------------------------------------

/* Seit § 23b GOG-NR (in Kraft 01.08.2021) veröffentlicht das Parlament jede
 * Gesetzesinitiative und lässt Stellungnahmen dazu zu — auch zu Anträgen und
 * zu Regierungsvorlagen. Ein Gesetz, das die ministerielle Begutachtung
 * ausgelassen hat, ist also nicht automatisch ohne öffentliche Beteiligung
 * geblieben.
 *
 * Es ist nicht dasselbe Verfahren: keine Frist, kein eingeladener Kreis, kein
 * Ressort, das die Stellungnahmen bekommt und einarbeiten könnte — aber es
 * ist auch nicht nichts. Wer „nie öffentlich begutachtet" sagt, muss diese
 * Zahl kennen, bevor er es sagt.
 *
 * Liste 142, `BEZUG_ITYP` = A (Anträge) bzw. I (Regierungsvorlagen). Die
 * Spalte mit dem Bezugsgegenstand wird über die Kopfzeile gesucht, nicht über
 * einen Index — siehe die Spaltenfalle in §2 der Doku. */
/* ZWEI FALLEN, beide am 16.09.2026 einmal hineingetappt:
 *
 * 1. `GP_CODE` ist die Periode der STELLUNGNAHME, `BEZUG_GP_CODE` die des
 *    Gegenstands, auf den sie sich bezieht. Für „Stellungnahmen zu den
 *    Gesetzen dieser Periode" ist nur die zweite richtig.
 *
 * 2. **Die Liste ist bei 100.000 Zeilen gedeckelt, auch mit `showAll=true`.**
 *    GP XXVII, BEZUG_ITYP=A: `count` meldet 180.709, geliefert werden
 *    100.000. Wer `rows` zählt, zählt still 55 % der Wahrheit.
 *
 * Deshalb wird hier pro Gegenstand gefragt und NUR `count` gelesen — ohne
 * `showAll`, also eine 20-Zeilen-Antwort. Das ist exakt, unabhängig von der
 * Deckelung, und kostet eine kleine Anfrage pro Gesetz. Die Zahl kann so
 * nicht mehr von einem Limit abhängen, das niemand im Ergebnis sieht. */
const stnFile = join(cacheDir, gp, 'list142-counts.json')
let stnCounts: Record<string, number>
try {
  stnCounts = JSON.parse(await readFile(stnFile, 'utf8')) as Record<string, number>
} catch {
  console.error(`Zähle Stellungnahmen (§ 23b) für ${skipped.length} Gesetze, eine Anfrage je Gesetz …`)
  stnCounts = {}
  await pool(skipped, CONCURRENCY, async (l) => {
    const res = await filterList(
      142,
      { BEZUG_GP_CODE: [gp], BEZUG_ITYP: [l.ityp], BEZUG_INR: [Number(l.inr)] },
      { showAll: false },
    )
    stnCounts[l.citation] = Number(res?.count ?? 0)
  })
  await writeFile(stnFile, JSON.stringify(stnCounts, null, 1))
}
const mitStn = skipped
  .map((l) => ({ ...l, stn: stnCounts[l.citation] ?? 0 }))
  .filter((l) => l.stn > 0)
  .sort((a, b) => b.stn - a.stn)
const stnSumme = mitStn.reduce((s, l) => s + l.stn, 0)

// ---------------------------------------------------------------------------
// 4. Report — the skipped list in full, because that is what gets reviewed
// ---------------------------------------------------------------------------

const out: string[] = []
const say = (s = '') => { out.push(s); console.log(s) }

say(`\n=== Begutachtung übersprungen — GP ${gp} ===\n`)
say(`Kundgemachte Gesetze (BGBl-Nummern) gesamt: ${all.length}`)
say(`  davon ausgenommen (Budgetverfahren o. Ä.): ${exempt.length}`)
say(`  Bezugsgröße nach Ausnahmen:               ${base}\n`)
say(`Mit Begutachtung:   ${String(consulted.length).padStart(4)}  (${pct(consulted.length)} %)`)
say(`Ohne Begutachtung:  ${String(skipped.length).padStart(4)}  (${pct(skipped.length)} %)`)
say(`    als Regierungsvorlage ohne Ministerialentwurf: ${skippedRv.length}`)
say(`    als Initiativantrag von Abgeordneten:          ${skippedAntrag.length}`)

say(`\n--- Wer hat die ${skippedAntrag.length} Initiativanträge eingebracht? ---`)
const kindCounts = new Map()
for (const l of antragKinds) kindCounts.set(l.kind, (kindCounts.get(l.kind) ?? 0) + 1)
for (const kind of ['nur Regierungsklubs', 'übergreifend', 'alle Klubs', 'nur Opposition', 'ohne Klubangabe']) {
  const n = kindCounts.get(kind) ?? 0
  if (!n) continue
  say(`  ${kind.padEnd(20)} ${String(n).padStart(4)}  (${((n / skippedAntrag.length) * 100).toFixed(1)} % der Anträge, ${pct(n)} % aller Gesetze)`)
}
for (const era of COALITIONS[gp] ?? []) {
  const sub = antragKinds.filter((l) => l.era === era.label)
  if (!sub.length) continue
  say(`  ${era.label}: ${sub.length} Anträge, davon ${sub.filter((l) => l.kind === 'nur Regierungsklubs').length} nur von Regierungsklubs`)
}
const kombis = new Map()
for (const l of antragKinds) { const k = l.clubs.join('+') || '—'; kombis.set(k, (kombis.get(k) ?? 0) + 1) }
say(`  häufigste Klub-Kombinationen: ${[...kombis].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}×`).join(', ')}`)
say(`\n  ⇒ Regierungs- oder Koalitionsvorhaben ohne Begutachtung: ${skippedRv.length} + ${koaAntraege.length} = ` +
  `${skippedRv.length + koaAntraege.length} von ${base} (${pct(skippedRv.length + koaAntraege.length)} %).`)
say(`     Die übrigen ${skipped.length - skippedRv.length - koaAntraege.length} sind übergreifende, All-Klub- oder Oppositionsanträge.`)
say(`     Achtung: von dieser Zahl geht die Vorgeschichte-Korrektur (§3c) noch ab — siehe unten.`)

say(`\n--- Vorgeschichte: vorher als Ministerialentwurf in Begutachtung? ---`)
if (textJoin) {
  const offen = bestaetigt.filter((h) => h.fristOffen).length
  say(`  TEXTABGLEICH (maßgeblich, scripts/corpus/meAntragJoin.ts, Stand ${textJoin.measuredAt}):`)
  say(`    ${bestaetigt.length} der ${skippedAntrag.length} Initiativanträge setzen nachweislich einen begutachteten`)
  say(`    Ministerialentwurf fort — Textdeckung ab ${(textJoin.method.threshold * 100).toFixed(0)} %, kalibriert an`)
  say(`    ${textJoin.calibration.truePairs} wahren Paaren (${(100 * textJoin.calibration.trueP05).toFixed(0)} % im 5 %-Quantil) gegen ${textJoin.calibration.noisePairs} falsche (max ${(100 * textJoin.calibration.noiseMax).toFixed(1)} %).`)
  for (const h of bestaetigt) {
    say(`      ${h.einlangen}  ${String(h.citation).padEnd(9)} ${String(h.meInr + '/ME').padEnd(8)} ${(h.score * 100).toFixed(0)} % ` +
      `${h.fristOffen ? '⚠ eingebracht, während die Frist lief  ' : ''}${h.title.slice(0, 58)}`)
  }
  say(`\n  ⇒ Ohne Begutachtung, korrigiert: ${korrBestaetigt} von ${base} (${pct(korrBestaetigt)} %), roh ${skipped.length} (${pct(skipped.length)} %).`)
  if (schwach.length) {
    say(`     Mit den ${schwach.length} schwachen Treffern (Containment unter ${textJoin.strongThreshold}): ${korrMitSchwachen} (${pct(korrMitSchwachen)} %).`)
    say(`     Zu berichten ist die Spanne ${pct(korrMitSchwachen)}–${pct(korrBestaetigt)} %.`)
  }
  if (offen) say(`     Davon ${offen} Anträge eingebracht, WÄHREND die Begutachtungsfrist zum gleichen Entwurf noch lief.`)
  if (textJoin.antraegeZuKurz) {
    say(`     ${textJoin.antraegeZuKurz} Anträge sind zu kurz für ein Texturteil und zählen weiter als „ohne`)
    say(`     Begutachtung" — bei ihnen ist das eine Annahme, keine Messung.`)
  }
  say(`     Untergrenze der Korrektur: das Verfahren findet nur, was textlich fortgeführt wurde.`)
  say(`     Ein zwischen Begutachtung und Einbringung neu geschriebener Entwurf fällt durch.`)
  say(`\n  Der Titelabgleich unten ist die verworfene Vorfassung — er steht noch da, weil`)
  say(`  er zeigt, wie viel ein Titel NICHT trägt: ${vorgeschichte.length} Kandidaten gegenüber ${bestaetigt.length} belegten.`)
} else {
  say(`  (Kein Textabgleich vorhanden. Für die belastbare Zahl:`)
  say(`   npx vite-node scripts/corpus/meAntragJoin.ts ${gp} — der Titelabgleich unten überschätzt deutlich.)`)
}
say(`  Kalibrierung des Titelmaßes an ${calib.length} echten Entwurf→Regierungsvorlage-Paaren:`)
say(`    Median ${(calib[Math.floor(calib.length / 2)] ?? 0).toFixed(2)}, ` +
  `unter der Schwelle 0.50 lägen ${calibMiss} davon — so viele echte Paare übersieht das Maß.`)
say(`  Kandidaten unter den ${skippedAntrag.length} Initiativanträgen: ${vorgeschichte.length}` +
  ` (${vorgeschichte.filter((v) => v.strong).length} stark: Titel identisch und der Entwurf wurde nie Regierungsvorlage)`)
for (const v of vorgeschichte) {
  say(`   ${v.einlangen}  ${String(v.citation).padEnd(9)} ${v.title}`)
  say(`       ← ${v.meInr}/ME ab ${v.meStart}, Frist bis ${v.meFrist ?? '—'}  [Titel ${v.score.toFixed(2)}${v.strong ? ', stark' : ''}]` +
    `${v.meBecameRv ? '  [Entwurf wurde selbst Regierungsvorlage → schwacher Kandidat]' : ''}` +
    `${v.fristOffen ? '  ⚠ Antrag eingebracht, WÄHREND die Frist noch lief' : ''}`)
}
if (vorgeschichte.length) {
  say(`\n  Frist abgelaufen, dann Antrag: ${vgAbgelaufen.length} — begutachtet, aber nicht als Regierungsvorlage weitergeführt.`)
  say(`  Frist noch offen bei Einbringung: ${vorgeschichte.length - vgAbgelaufen.length} — am laufenden Verfahren vorbei.`)
  say(`\n  ⇒ Kopfzahl ohne Begutachtung: ${skipped.length} von ${base} (${pct(skipped.length)} %).`)
  say(`    Nur die ${vgStark.length} starken Kandidaten abgezogen:  ${korrStark} (${pct(korrStark)} %)  ← belastbare Untergrenze der Korrektur`)
  say(`    Die ${vgAbgelaufen.length} mit abgelaufener Frist abgezogen: ${korrNiedrig} (${pct(korrNiedrig)} %)`)
  say(`    Alle ${vorgeschichte.length} Kandidaten abgezogen:        ${korrHoch} (${pct(korrHoch)} %)  ← Obergrenze, enthält schwache Titeltreffer`)
  say(`    Zu berichten ist die Spanne ${pct(korrHoch)}–${pct(korrStark)} %, nicht die Kopfzahl allein.`)
  say(`    Beide Enden sind unsicher: schwache Treffer überschätzen die Korrektur,`)
  say(`    die ${calibMiss} verfehlten Kalibrierungspaare unterschätzen sie.`)
  // Dieselbe Korrektur auf die Regierungs-Zahl von oben, sonst stehen zwei
  // Zahlen nebeneinander, von denen nur eine korrigiert ist.
  const regBasis = skippedRv.length + koaAntraege.length
  const koaCitations = new Set(koaAntraege.map((l) => String(l.citation)))
  const abzug = textJoin
    ? bestaetigt.filter((h) => koaCitations.has(String(h.citation))).length
    : vorgeschichte.filter((v) => v.kind === 'nur Regierungsklubs').length
  say(`\n  ⇒ Regierungs-/Koalitionsvorhaben ohne Begutachtung: ${regBasis - abzug} von ${base} ` +
    `(${pct(regBasis - abzug)} %) nach Abzug der ${abzug} belegten Vorgeschichte-Fälle, ` +
    `unkorrigiert ${regBasis} (${pct(regBasis)} %).`)
}

say(`\n--- Stellungnahmen im Parlament (§ 23b GOG-NR, seit 01.08.2021) ---`)
say(`  ${mitStn.length} der ${skipped.length} Gesetze ohne Begutachtung haben im Parlament Stellungnahmen bekommen: ${stnSumme} Stück.`)
for (const l of mitStn.slice(0, 10)) say(`    ${String(l.stn).padStart(4)}  ${String(l.citation).padEnd(9)} ${l.title.slice(0, 66)}`)
if (mitStn.length > 10) say(`    … und ${mitStn.length - 10} weitere.`)
say(`  ⇒ „ohne Begutachtung" heißt NICHT „ohne Öffentlichkeit". Kein Fristenlauf,`)
say(`    kein eingeladener Kreis, kein Ressort als Empfänger — aber eine offene Tür,`)
say(`    die genutzt wird. Die Formulierung im Produkt muss das aushalten.`)

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
    // §3b: Anträge der Regierungsklubs, und beide zusammen — die Zahl, die
    // den Einwand "Initiativanträge sind halt Parlamentsrecht" beantwortet.
    koalitionsantraege: koaAntraege.length,
    regierungsvorhabenOhneBegutachtung: skippedRv.length + koaAntraege.length,
    // §3c: Kandidaten mit Begutachtungs-Vorgeschichte und die Spanne, die
    // sie aufmachen. Berichtet, nicht angewendet.
    // Maßgeblich, sobald corpus/meAntragJoin.ts gelaufen ist.
    vorgeschichteBelegt: textJoin ? bestaetigt.length : null,
    skippedKorrigiertBelegt: textJoin ? korrBestaetigt : null,
    // Die Titel-Vorfassung; bleibt als Kontrast stehen.
    vorgeschichte: vorgeschichte.length,
    vorgeschichteStark: vgStark.length,
    vorgeschichteFristAbgelaufen: vgAbgelaufen.length,
    vorgeschichteFristOffen: vorgeschichte.length - vgAbgelaufen.length,
    skippedKorrigiert: { stark: korrStark, fristAbgelaufen: korrNiedrig, alle: korrHoch },
  },
  antragKinds: [...kindCounts].map(([kind, n]) => ({ kind, n })),
  vorgeschichte,
  collisions,
  rows: all,
}, null, 1))
say(`\nZeilen: ${rowsFile}`)
say(`Bericht: ${join(cacheDir, `${gp}-skipped.txt`)}`)
await writeFile(join(cacheDir, `${gp}-skipped.txt`), out.join('\n') + '\n')
