#!/usr/bin/env vite-node
/**
 * Audit of the § names shown beside a change (docs/architecture.md §12.11).
 *
 * Usage:  npx vite-node scripts/audit/paraTitle.ts [GP] [maxDrafts]
 *         (needs a dev server on :3000 for the API routes)
 *
 * `maxDrafts` counts drafts that HAVE a comparison, not rows scanned — the
 * report says over how many it ran.
 *
 * It prints two blocks. The first is **coverage**, counted with the rule the
 * page itself uses (`shared/utils/unitName`), so the §12.11 figure has a command
 * behind it instead of being re-derived by hand. The second is the older and
 * more important question:
 *
 * Coverage is not correctness. A count of names on screen says nothing about
 * whether any of them belongs to the paragraph it sits on — which is how a
 * wrong heading survived three green checks on 2026-09-09. This asks the
 * other question, three ways per name:
 *
 *   1. **the law** — the Artikel title must name the law RIS resolved, even
 *      though the join itself was made by Stammnorm BGBl number. Two
 *      independent signals; a wrong law fails both only by coincidence.
 *   2. **the paragraph** — extracted from the instruction by a plain regex
 *      here, never by novao.ts, so a bug in the parser cannot certify itself.
 *   3. **the heading** — refetched from RIS at the draft's own Einlangen date.
 *
 * Anything the regex cannot read is counted as unverifiable, never as a pass.
 *
 * Known false positives in check 1, both verified by hand and both cases
 * where a title match would have been *worse* than the BGBl join: an Artikel
 * may cite a law by abbreviation ("Änderung des COVID-19-FondsG"), and RIS
 * carries the law's current name after a rename ("Waldfondsgesetz" →
 * "Waldresilienzfondsgesetz").
 */
import { getText, resolveLawByBgbl } from '../../server/utils/ris/konsLaw'
import { fetchParagraphTree } from '../../server/utils/harness/risKonsHistory'
import { parseParliamentHtml } from '../../server/utils/lawtext/parliamentHtml'
import { parseRisXml } from '../../server/utils/lawtext/risXml'
import { promulgationByArticle } from '../../server/utils/lawtext/draftArticles'
import { unitName } from '../../shared/utils/unitName'

const GP = process.argv[2] ?? 'XXVIII'
const MAX_DRAFTS = Number(process.argv[3] ?? 40)
const BASE = `http://localhost:3000/api/drafts/${GP}`

/**
 * One draft may not take the run down.
 *
 * A cold `/paragraphtitel` does up to 120 RIS lookups and runs past undici's
 * five-minute header timeout; the rejection came from `fetch`, not from
 * `.json()`, so the per-call `.catch()` never saw it and an hour of warming
 * ended in an uncaught TypeError and no report at all (25.09.2026).
 */
async function json<T>(url: string, fallback: T, timeoutMs = 15 * 60 * 1000): Promise<T> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return (await res.json()) as T
  } catch {
    console.log(`  … keine Antwort: ${url}`)
    return fallback
  }
}

const map = await json<any>(`http://localhost:3000/api/ris-map/${GP}`, { rows: [] })
const list = await json<any>(`http://localhost:3000/api/drafts?gp=${GP}`, { items: [] })
const arrived = new Map<number, string>(list.items.map((i: any) => [i.inr, i.arrivedAt]))

/**
 * "Änderung des Telekommunikationsgesetzes 2021" names "Telekommunikationsgesetz
 * 2021": German genitive appends -s/-es, so compare by token prefix rather
 * than by equality.
 */
function namesLaw(article: string, kurztitel: string): boolean {
  const tok = (s: string) => s.toLowerCase().replace(/[–—-]/g, ' ').split(/[^a-zäöüß0-9]+/).filter((t) => t.length >= 3)
  const arts = tok(article)
  return tok(kurztitel).every((k) => arts.some((a) => a.startsWith(k.slice(0, Math.min(6, k.length))) || k.startsWith(a.slice(0, Math.min(6, a.length)))))
}
function paraOf(text: string): string | null {
  const t = text.replace(/\s+/g, ' ')
  if (/folgende[rnms]?\s+§/i.test(t)) return null
  const m = /^(?:In|Dem|Der|Im)?\s*§+\s*(\d+[a-z]*)\b/.exec(t)
  return m ? `§ ${m[1]}` : null
}

let names = 0, ok = 0, badLaw = 0, badHeading = 0, skipped = 0, noClause = 0, ambiguous = 0
// Coverage, counted with the rule the page itself uses (`shared/utils/unitName`)
// rather than with a second one: the §12.11 numbers had no command behind
// them and were re-derived by hand every time.
let drafts = 0, unanswered = 0, changed = 0, byQuoted = 0, byLookup = 0, byOwn = 0
const shares: number[] = []
const problems: string[] = []
for (const row of map.rows.filter((r: any) => r.risDocument?.xml)) {
  if (drafts >= MAX_DRAFTS) break
  const asOf = arrived.get(row.inr)
  if (!asOf) continue
  const diff = await json<any>(`${BASE}/${row.inr}/diff`, null)
  if (!diff?.available) continue
  // A draft whose names never arrived is NOT a draft with no names: counting
  // the timeout as zero would report the server's load as the engine's
  // coverage. It leaves the sample and says so.
  const titleResponse = await json<any>(`${BASE}/${row.inr}/paragraphtitel`, null)
  if (!titleResponse) { unanswered++; continue }
  const titles = titleResponse.titles ?? {}
  drafts++
  let n = 0, named = 0
  for (const u of diff.units) {
    if (u.change === 'unchanged') continue
    n++
    const key = `${u.article ?? ''}|${u.id}|${u.change}`
    if (!unitName(u, titles, key)) continue
    named++
    if (u.quotedHeading) byQuoted++
    else if (titles[key]) byLookup++
    else byOwn++
  }
  changed += n
  if (n > 0) shares.push(named / n)
  // The correctness half refetches a RIS paragraph per name and is the
  // expensive one; it stops at 400 names while the coverage count above runs
  // on, because a coverage figure cut off mid-corpus would be a different
  // number than the one it reports.
  if (!Object.keys(titles).length || names > 400) continue

  // Same sources as the service: the diff's Artikel are the later side's, so
  // that document's clauses must be read too, or the audit blames its own
  // blind spot. The audit runs the default pair (ME → RV).
  const clauses = new Map<any, any>()
  for (const [a, b] of promulgationByArticle(parseRisXml(await getText(row.risDocument.xml)))) clauses.set(a, b)
  if (diff.fromDocument?.url?.endsWith('.html')) for (const [a, b] of promulgationByArticle(parseParliamentHtml(await getText(diff.fromDocument.url)))) clauses.set(a, b)
  if (diff.toDocument?.url) for (const [a, b] of promulgationByArticle(parseParliamentHtml(await getText(diff.toDocument.url)))) clauses.set(a, b)
  const laws = new Map<string, any>()
  for (const u of diff.units) {
    const shown = titles[`${u.article ?? ''}|${u.id}|${u.change}`]
    if (!shown) continue
    names++
    const bgbl = clauses.get(u.article)
    if (!bgbl) { noClause++; continue }
    const ck = `${bgbl.organ}|${bgbl.nummer}`
    if (!laws.has(ck)) laws.set(ck, await resolveLawByBgbl(bgbl, asOf).catch(() => null))
    // NOT a wrong law: the audit resolves **without** the Artikel name, so
    // that check (1) below stays independent of the join — and one
    // Bundesgesetzblatt regularly creates several laws (532/1993 the BWG and
    // the BSpG). Where the name is the only thing that separates them, the
    // service resolves and the audit cannot; that is unverifiable, not wrong,
    // and counting it as a failure said "153 wrong laws" about a run in which
    // none was wrong (25.09.2026).
    const law = laws.get(ck)
    if (!law) {
      ambiguous++
      if (problems.length < 8) problems.push(`${row.inr}/ME ${u.id}: ${ck} schafft mehrere Gesetze — ohne Namen nicht auflösbar`)
      continue
    }
    // (1) does the Artikel title actually name this law?
    if (u.article && law.kurztitel && !namesLaw(u.article, law.kurztitel)) {
      badLaw++
      if (problems.length < 8) problems.push(`${row.inr}/ME ${u.id} GESETZ: Artikel "${u.article}" ≠ "${law.kurztitel}"`)
      continue
    }
    const para = paraOf(u.toText ?? u.fromText ?? '')
    if (!para) { skipped++; continue }
    const ref = law.paragraphs?.[para]
    if (!ref) { skipped++; continue }
    const tree = await fetchParagraphTree(ref).catch(() => null)
    if (tree?.heading === shown) ok++
    else {
      badHeading++
      if (problems.length < 8) problems.push(`${row.inr}/ME ${u.id} ${para}: gezeigt "${shown}" · RIS "${tree?.heading}"`)
    }
  }
}
shares.sort((a, b) => a - b)
const named = byQuoted + byLookup + byOwn
console.log(`\nDeckung über ${drafts} Entwürfe mit Vergleich · ${changed} geänderte Einheiten`)
console.log(`  zitierte Überschrift der Anweisung : ${byQuoted}`)
console.log(`  Nachschlag im geltenden Recht      : ${byLookup}`)
console.log(`  eigene Überschrift (neues Gesetz)  : ${byOwn}`)
console.log(`  benannt                            : ${named} (${changed ? Math.round((named / changed) * 100) : 0} %)`)
console.log(`  Median je Entwurf                  : ${shares.length ? Math.round(shares[(shares.length - 1) >> 1]! * 100) : 0} %`)
console.log(`  Entwürfe ohne jeden Namen          : ${shares.filter((x) => x === 0).length}`)
if (unanswered) console.log(`  nicht gewertet (keine Antwort)     : ${unanswered}`)

console.log(`\nangezeigte Namen ${names}`)
console.log(`  Gesetz+§+Überschrift bestätigt : ${ok}`)
console.log(`  falsches Gesetz                : ${badLaw}`)
console.log(`  falsche Überschrift            : ${badHeading}`)
console.log(`  nicht unabhängig prüfbar       : ${skipped}`)
console.log(`  BGBl. schafft mehrere Gesetze  : ${ambiguous} (Auflösung hängt am Namen, den die Prüfung nicht benutzen darf)`)
console.log(`  Klausel im Audit nicht gefunden: ${noClause}`)
for (const p of problems) console.log('  ✗', p)
