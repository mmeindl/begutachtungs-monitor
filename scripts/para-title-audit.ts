#!/usr/bin/env vite-node
/**
 * Audit of the § names shown beside a change (docs/architecture.md §12.11).
 *
 * Usage:  npx vite-node scripts/para-title-audit.ts [GP] [maxDrafts]
 *         (needs a dev server on :3000 for the API routes)
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
import { getText, resolveLawByBgbl, fetchParagraphTree } from '../server/utils/risKons'
import { parseRisXml, parseParliamentHtml } from '../server/utils/lawText'
import { promulgationByArticle } from '../server/utils/lawTitles'

const GP = process.argv[2] ?? 'XXVIII'
const MAX_DRAFTS = Number(process.argv[3] ?? 40)
const BASE = `http://localhost:3000/api/consultations/${GP}`
const map = await (await fetch(`http://localhost:3000/api/ris-map/${GP}`)).json()
const list = await (await fetch(`http://localhost:3000/api/consultations?gp=${GP}`)).json()
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

let names = 0, ok = 0, badLaw = 0, badHeading = 0, skipped = 0, noClause = 0
const problems: string[] = []
for (const row of map.rows.filter((r: any) => r.risDocument?.xml).slice(0, MAX_DRAFTS)) {
  const asOf = arrived.get(row.inr)
  if (!asOf) continue
  const diff = await (await fetch(`${BASE}/${row.inr}/diff`)).json().catch(() => null)
  if (!diff?.available) continue
  const titles = (await (await fetch(`${BASE}/${row.inr}/paragraphtitel`)).json().catch(() => ({ titles: {} }))).titles ?? {}
  if (!Object.keys(titles).length) continue

  // Same sources as the service: the diff's Artikel are the RV's, so the
  // RV's clauses must be read too, or the audit blames its own blind spot.
  const clauses = new Map<any, any>()
  for (const [a, b] of promulgationByArticle(parseRisXml(await getText(row.risDocument.xml)))) clauses.set(a, b)
  if (diff.me?.url?.endsWith('.html')) for (const [a, b] of promulgationByArticle(parseParliamentHtml(await getText(diff.me.url)))) clauses.set(a, b)
  if (diff.rv?.url) for (const [a, b] of promulgationByArticle(parseParliamentHtml(await getText(diff.rv.url)))) clauses.set(a, b)
  const laws = new Map<string, any>()
  for (const u of diff.units) {
    const shown = titles[`${u.article ?? ''}|${u.id}|${u.change}`]
    if (!shown) continue
    names++
    const bgbl = clauses.get(u.article)
    if (!bgbl) { noClause++; continue }
    const ck = `${bgbl.organ}|${bgbl.nummer}`
    if (!laws.has(ck)) laws.set(ck, await resolveLawByBgbl(bgbl, asOf).catch(() => null))
    const law = laws.get(ck)
    if (!law) { problems.push(`${row.inr}/ME ${u.id}: Titel ohne aufgelöstes Gesetz`); badLaw++; continue }
    // (1) does the Artikel title actually name this law?
    if (u.article && law.kurztitel && !namesLaw(u.article, law.kurztitel)) {
      badLaw++
      if (problems.length < 8) problems.push(`${row.inr}/ME ${u.id} GESETZ: Artikel "${u.article}" ≠ "${law.kurztitel}"`)
      continue
    }
    const para = paraOf(u.rvText ?? u.meText ?? '')
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
  if (names > 400) break
}
console.log(`\nangezeigte Namen ${names}`)
console.log(`  Gesetz+§+Überschrift bestätigt : ${ok}`)
console.log(`  falsches Gesetz                : ${badLaw}`)
console.log(`  falsche Überschrift            : ${badHeading}`)
console.log(`  nicht unabhängig prüfbar       : ${skipped}`)
console.log(`  Klausel im Audit nicht gefunden: ${noClause}`)
for (const p of problems) console.log('  ✗', p)
