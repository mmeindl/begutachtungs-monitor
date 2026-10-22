/**
 * Measurement (22.10.2026): what mapping `<ueberschrift typ="art">` to an
 * Artikel heading would change in the RIS parser (`lawtext/risXml.ts`).
 * The Landesgesetzblatt uses the type for its Artikel; federal documents in
 * RIS do too. For every cached RIS document that contains it: units and
 * Artikel as parsed now, and with the type mapped.
 *
 *   pnpm exec vite-node scripts/corpus/artMapping.ts -- [--dump]
 */
import { readFileSync } from 'node:fs'
import { parseLawUnitsFromRis } from '../../server/utils/lawtext/lawUnits'

// The list: `grep -l 'typ="art"' .harness-cache/*.bin` (file names only), in /tmp/art-files.txt.
const files = readFileSync('/tmp/art-files.txt', 'utf8').split('\n').filter(Boolean)
const dump = process.argv.includes('--dump')
const rows: Record<string, { docs: number; same: number; unitsBefore: number; unitsAfter: number; artBefore: number; artAfter: number }> = {}
for (const f of files) {
  const xml = readFileSync(`.harness-cache/${f.replace(/^\.\//, '')}`, 'utf8')
  if (!xml.includes('<risdok')) continue
  const kind = /h-creator="(?:PWRIVIE\d+\.)?([A-Za-z0-9]+)2RIS/.exec(xml)?.[1] ?? 'other'
  let before, after
  try {
    before = parseLawUnitsFromRis(xml)
    after = parseLawUnitsFromRis(xml.replace(/<ueberschrift typ="art"/g, '<ueberschrift typ="g1"'))
  } catch { continue }
  const sig = (us: typeof before) => us.map((u) => `${u.articleNumber ?? '-'}|${u.id}|${u.text.length}`).join('\n')
  const r = (rows[kind] ??= { docs: 0, same: 0, unitsBefore: 0, unitsAfter: 0, artBefore: 0, artAfter: 0 })
  r.docs++
  if (sig(before) === sig(after)) r.same++
  r.unitsBefore += before.length
  r.unitsAfter += after.length
  r.artBefore += new Set(before.map((u) => u.articleNumber)).size
  r.artAfter += new Set(after.map((u) => u.articleNumber)).size
  if (dump && sig(before) !== sig(after) && kind === 'BEGUT') {
    console.log(`${f}: units ${before.length}→${after.length}, articles ${new Set(before.map((u) => u.articleNumber)).size}→${new Set(after.map((u) => u.articleNumber)).size}`)
    console.log('   before', before.slice(0, 4).map((u) => `${u.articleNumber}|${u.id}`).join('  '))
    console.log('   after ', after.slice(0, 4).map((u) => `${u.articleNumber?.slice(0, 40)}|${u.id}`).join('  '))
  }
}
console.table(rows)
