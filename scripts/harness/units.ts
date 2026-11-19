#!/usr/bin/env vite-node
/**
 * Zählung der Anweisungen — every instruction line `segmentUnits` is given
 * lands in exactly one unit.
 *
 * WHY THIS EXISTS. A unit is what both sides of a station comparison and the
 * Lesefassung's engine read; a line that is in no unit is neither compared,
 * applied nor refused — it is not there, and nothing downstream can say so.
 * That happened, silently, from 08.09. to 19.11.2026: „25a." read as „25"
 * opened a second Z25, and the short real Z 25 was dropped as a
 * table-of-contents echo. 25 lines over 296 cached Bundesgesetzblätter, and
 * on the page a committee change missing and a kept line shown as
 * „entfallen" (95/ME rv→ausschuss). No unit test had the numbering, and the
 * BGBl bench filed the §§ concerned as „unverändert — ungefährlich". The
 * invariant is cheap to state and was never checked; this checks it over
 * every text on disk.
 *
 * THE INVARIANT, per document:
 *   · a numbered instruction line (`novaoNumber`) is in exactly one unit;
 *   · an unnumbered one is in exactly one unit once a unit is open in its
 *     Artikel — before that it is the Promulgationsklausel or prose the
 *     source mistagged, and belongs to no unit by design;
 *   · no instruction line is in two units.
 * A line is in a unit when the unit holds the block itself, or — for the
 * line that opens it — the block with its number cut off (`segmentUnits`
 * copies the opener). Units come out in input order, so one forward pass
 * pairs them.
 *
 * Reported beside it, not asserted: ids that carry `#dup` and ids that occur
 * twice in one law. **A `#dup` is a reading, not a loss** (decided
 * 19.11.2026): it marks a number the source gives twice under one law's key,
 * and every consumer is built for it — the page prints the number without
 * the mark (`displayId`), the citation names no place for it
 * (`lawUnitCiteDe`), the § comparison pairs it by heading and similarity and
 * takes it for a sign of several laws in one Artikel (`lawDiff`). Each one is
 * counted by its cause, read from the unit before it and from the source
 * lines the two opened on (`scripts/lib/unitCensus.ts`):
 *   · wiederholt — the source prints the number twice (Waffengesetz, two
 *     instructions „82." in one Bundesgesetzblatt; a draft that prints
 *     „Variante A" and „Variante B" under one number; an old draft whose
 *     Textgegenüberstellung prints each § in both columns);
 *   · verdoppelt — the same number as the unit before, but the source printed
 *     it once: the reader gave the number a second time — a first line with
 *     no number promoted to „1." in front of the printed „1." (`segmentUnits`,
 *     the single-respect rule), a table row of a schedule read as an
 *     instruction. A reader fault, not a reading;
 *   · neu gezählt — the numbering starts over: one law amended in two Artikel
 *     of the same title (VBG 1948, Artikel 7 and 11), or an old draft whose
 *     Artikel no reader can split;
 *   · Folge — the units after such a restart;
 *   · ohne Nummer — the id carries no number at all: a reader fault, not a
 *     reading (Parliament's Word export that cuts „§ 27." into a symbol span
 *     „§" and the number outside it, TKG 2021, `lawtext/parliamentHtml.ts`).
 * A gate on the count would fail on the source's own numbering; a rise in a
 * class is what to read. Ids that occur twice in one law are the third
 * occurrence of a number („Z1#dup" again) — the comparison pairs those by
 * similarity (`lawDiff.uniqueIndex` leaves them out of the id step).
 *
 * THE CORPUS IS WHAT IS ON DISK — the harness cache (`HARNESS_CACHE`, as the
 * other harnesses fill it), read on every path production reads it:
 *   · Bundesgesetzblatt XML, per amending Artikel (`kons/consolidate.ts`, the
 *     engine's input) and whole (`parseLawUnitsFromRis`, the bgbl station);
 *   · RIS Begut XML of the drafts, the same two ways (the Lesefassung, the
 *     annex and the me station);
 *   · Landesgesetzblatt XML, per Artikel, raw — production's `lgblUnits`
 *     (`laender/landLawDiff.ts`) prepares it first, so this is the reader's
 *     robustness, not the Land page;
 *   · Parliament's law-text HTML (ME, RV, Ausschuss, Beschluss), whole
 *     (`parseLawUnits`, every Parliament station);
 *   · `--dir=<path>`: further RIS XML files (e.g. `.cache/novao/xml`).
 * A document fetched under two addresses is counted once.
 *
 * A GATE: exits 1 when a line is lost or doubled, and prints each one.
 *
 * Usage: HARNESS_CACHE=… pnpm harness:units [--dir=.cache/novao/xml] [--list]
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { segmentUnits, type TextBlock } from '../../server/utils/lawtext/lawUnits'
import { parseParliamentHtml } from '../../server/utils/lawtext/parliamentHtml'
import { parseRisXml } from '../../server/utils/lawtext/risXml'
import { articleBlocks } from '../../server/utils/lawtext/draftArticles'
import { normalizeText } from '../../server/utils/lawtext/normalize'
import { argAssigned, argFlag } from '../lib/args'
import { instructionCensus, noDups, type DupCauses } from '../lib/unitCensus'

// --- CLI ----------------------------------------------------------------------
const cacheDir = process.env.HARNESS_CACHE ?? '.harness-cache'
const extraDir = argAssigned('dir')
const list = argFlag('list')

interface Tally { docs: number; lines: number; lost: number; doubled: number; dupIds: DupCauses; sameIds: number; hit: Set<string> }
const tallies = new Map<string, Tally>()
const report: string[] = []
const add = (path: string, doc: string, blocks: readonly TextBlock[], scope: string | null): void => {
  const c = instructionCensus(blocks, segmentUnits(blocks))
  const t = tallies.get(path) ?? { docs: 0, lines: 0, lost: 0, doubled: 0, dupIds: noDups(), sameIds: 0, hit: new Set<string>() }
  tallies.set(path, t)
  t.lines += c.lines
  t.lost += c.lost.length
  t.doubled += c.doubled.length
  for (const k of Object.keys(t.dupIds) as (keyof DupCauses)[]) t.dupIds[k] += c.dupIds[k]
  t.sameIds += c.sameIds
  if (c.lost.length + c.doubled.length > 0) t.hit.add(doc)
  for (const b of c.lost) report.push(`LOST    ${path.padEnd(18)} ${doc.slice(0, 12)} ${(scope ?? '').slice(0, 40).padEnd(40)} :: ${normalizeText(b.text).slice(0, 110)}`)
  for (const { unit, prev } of c.verdoppelt) report.push(`#DUP    ${path.padEnd(18)} ${doc.slice(0, 12)} ${(scope ?? '').slice(0, 40).padEnd(40)} :: ${unit.id} verdoppelt — davor ${prev.id}: ${normalizeText(prev.text).slice(0, 60)} | ${normalizeText(unit.text).slice(0, 60)}`)
  for (const b of c.doubled) report.push(`DOUBLED ${path.padEnd(18)} ${doc.slice(0, 12)} ${(scope ?? '').slice(0, 40).padEnd(40)} :: ${normalizeText(b.text).slice(0, 110)}`)
}
const docsOf = new Map<string, number>()
const count = (path: string) => docsOf.set(path, (docsOf.get(path) ?? 0) + 1)

const seen = new Set<string>()
const once = (blocks: readonly TextBlock[]): boolean => {
  const novao = blocks.filter((b) => b.kind === 'novao')
  if (novao.length === 0) return false
  const sig = `${novao.length}|${novao.slice(0, 8).map((b) => b.text.slice(0, 60)).join('|')}`
  if (seen.has(sig)) return false
  seen.add(sig)
  return true
}

const readXml = (name: string, xml: string, head: string): void => {
  let blocks: TextBlock[]
  try {
    blocks = parseRisXml(xml)
  } catch {
    return
  }
  if (!once(blocks)) return
  const source = head.includes('BGBLAuth') ? 'BGBl' : head.includes('LGBLAuth') ? 'LGBl' : 'Begut'
  // Per amending Artikel, as the engine reads it (`consolidate`).
  count(`${source}/Artikel`)
  for (const { blocks: part, article } of articleBlocks(blocks).filter((p) => p.article.amends)) add(`${source}/Artikel`, name, part, article.title ?? article.number)
  // Whole, as the station comparison reads it — not for a Landesgesetzblatt, which production prepares first.
  if (source !== 'LGBl') {
    count(`${source}/Dokument`)
    add(`${source}/Dokument`, name, blocks, null)
  }
}

for (const name of readdirSync(cacheDir).filter((n) => n.endsWith('.bin'))) {
  const buf = readFileSync(join(cacheDir, name))
  const head = buf.subarray(0, 2000).toString('latin1')
  if (head.includes('<risdok')) {
    const xml = buf.toString('utf8')
    if (xml.includes('novao')) readXml(name, xml, head)
    continue
  }
  if (!/<html/i.test(head)) continue
  const html = buf.toString('utf8')
  if (!html.includes('NovAo')) continue
  let blocks: TextBlock[]
  try {
    blocks = parseParliamentHtml(html)
  } catch {
    continue
  }
  if (!once(blocks)) continue
  count('Parlament/HTML')
  add('Parlament/HTML', name, blocks, (/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' '))
}
if (extraDir) {
  for (const name of readdirSync(extraDir).filter((n) => n.endsWith('.xml'))) {
    const xml = readFileSync(join(extraDir, name), 'utf8')
    readXml(name, xml, xml.slice(0, 2000))
  }
}

let failed = 0
console.log('Zählung der Anweisungen — jede Anweisungszeile in genau einer Einheit')
for (const [path, t] of [...tallies].sort()) {
  failed += t.lost + t.doubled
  const d = t.dupIds
  const dups = d.wiederholt + d.verdoppelt + d.neu + d.folge + d.ohneNummer
  console.log(`  ${path.padEnd(16)} Dokumente ${String(docsOf.get(path) ?? 0).padStart(5)}  Zeilen ${String(t.lines).padStart(6)}  verloren ${String(t.lost).padStart(4)}  doppelt ${String(t.doubled).padStart(3)}  betroffen ${String(t.hit.size).padStart(3)}   | #dup ${dups} (wiederholt ${d.wiederholt}, verdoppelt ${d.verdoppelt}, neu gezählt ${d.neu}, Folge ${d.folge}, ohne Nummer ${d.ohneNummer}), gleiche Id ${t.sameIds}`)
}
if (list || failed > 0) for (const line of report) console.log(line)
if (failed > 0) {
  console.log(`\n${failed} Anweisungszeile(n) nicht in genau einer Einheit.`)
  process.exit(1)
}
