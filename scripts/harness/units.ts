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
 * Reported beside it, not asserted: ids that carry `#dup` (a number recurring
 * in one law's key: two Artikel of the same title, or a line the source
 * numbered twice) and ids that occur twice in one law — keys a join cannot
 * use, which the consumers refuse rather than pair (`lawDiff.uniqueIndex`).
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
import { novaoNumber, segmentUnits, type LawUnit, type TextBlock } from '../../server/utils/lawtext/lawUnits'
import { parseParliamentHtml } from '../../server/utils/lawtext/parliamentHtml'
import { parseRisXml } from '../../server/utils/lawtext/risXml'
import { articleBlocks } from '../../server/utils/lawtext/draftArticles'
import { normalizeText } from '../../server/utils/lawtext/normalize'
import { argAssigned, argFlag } from '../lib/args'

interface Census {
  /** Instruction blocks in the input */
  lines: number
  /** Numbered instruction lines in no unit, and unnumbered ones in none after a unit opened */
  lost: TextBlock[]
  /** Instruction lines in more than one unit */
  doubled: TextBlock[]
  /** Unit ids marked `#dup` */
  dupIds: number
  /** Ids that occur twice under one law key */
  sameIds: number
}

/** Census of one `segmentUnits` run: `units` must be `segmentUnits(blocks)`. */
function instructionCensus(blocks: readonly TextBlock[], units: readonly LawUnit[]): Census {
  const index = new Map(blocks.map((b, i) => [b, i] as const))
  const owners = new Array<number>(blocks.length).fill(0)
  let pos = 0
  for (const u of units) {
    for (const [k, bb] of u.blocks.entries()) {
      const at = index.get(bb)
      if (at !== undefined) {
        owners[at]!++
        pos = Math.max(pos, at + 1)
        continue
      }
      // The opener, copied with its number cut off.
      if (k !== 0 || bb.kind !== 'novao') continue
      const want = normalizeText(bb.text)
      for (let j = pos; j < blocks.length; j++) {
        const src = blocks[j]!
        if (owners[j] === 0 && src.cls === bb.cls && src.gld === bb.gld && normalizeText(src.text).endsWith(want)) {
          owners[j]!++
          pos = j + 1
          break
        }
      }
    }
  }
  const lost: TextBlock[] = []
  const doubled: TextBlock[] = []
  let lines = 0
  let opened = false
  for (const [i, b] of blocks.entries()) {
    if (b.kind === 'article') opened = false
    if (owners[i]! > 0) opened = true
    if (b.kind !== 'novao') continue
    lines++
    if (owners[i]! > 1) doubled.push(b)
    else if (owners[i] === 0 && (novaoNumber(b.text) !== null || opened)) lost.push(b)
  }
  const seen = new Set<string>()
  let sameIds = 0
  for (const u of units) {
    const key = `${u.article ?? ''}\u0000${u.id}`
    if (seen.has(key)) sameIds++
    seen.add(key)
  }
  return { lines, lost, doubled, dupIds: units.filter((u) => u.id.includes('#dup')).length, sameIds }
}

// --- CLI ----------------------------------------------------------------------
const cacheDir = process.env.HARNESS_CACHE ?? '.harness-cache'
const extraDir = argAssigned('dir')
const list = argFlag('list')

interface Tally { docs: number; lines: number; lost: number; doubled: number; dupIds: number; sameIds: number; hit: Set<string> }
const tallies = new Map<string, Tally>()
const report: string[] = []
const add = (path: string, doc: string, blocks: readonly TextBlock[], scope: string | null): void => {
  const c = instructionCensus(blocks, segmentUnits(blocks))
  const t = tallies.get(path) ?? { docs: 0, lines: 0, lost: 0, doubled: 0, dupIds: 0, sameIds: 0, hit: new Set<string>() }
  tallies.set(path, t)
  t.lines += c.lines
  t.lost += c.lost.length
  t.doubled += c.doubled.length
  t.dupIds += c.dupIds
  t.sameIds += c.sameIds
  if (c.lost.length + c.doubled.length > 0) t.hit.add(doc)
  for (const b of c.lost) report.push(`LOST    ${path.padEnd(18)} ${doc.slice(0, 12)} ${(scope ?? '').slice(0, 40).padEnd(40)} :: ${normalizeText(b.text).slice(0, 110)}`)
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
  console.log(`  ${path.padEnd(16)} Dokumente ${String(docsOf.get(path) ?? 0).padStart(5)}  Zeilen ${String(t.lines).padStart(6)}  verloren ${String(t.lost).padStart(4)}  doppelt ${String(t.doubled).padStart(3)}  betroffen ${String(t.hit.size).padStart(3)}   | #dup ${t.dupIds}, gleiche Id ${t.sameIds}`)
}
if (list || failed > 0) for (const line of report) console.log(line)
if (failed > 0) {
  console.log(`\n${failed} Anweisungszeile(n) nicht in genau einer Einheit.`)
  process.exit(1)
}
