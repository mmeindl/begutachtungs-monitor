#!/usr/bin/env vite-node
/**
 * Records one Land draft's Textgegenüberstellung as an offline fixture
 * (`tests/landTguGolden.test.ts`, 21.11.2026), from the caches alone — no
 * request leaves the machine.
 *
 * Oberösterreich, Salzburg, Tirol and Wien: what the reader hands the guard
 * — the §§ `compareTgu` compared, before the draft rules withheld any, and
 * the draft's blocks — as `harness/landGuard.ts` keeps them in its
 * `corpus.jsonl`, with the verdict of every § (`lib/landTguGolden.ts`).
 * Kärnten, whose right column the draft rules are not asked of: the page
 * geometry of its document (`pagesOf`, coordinates rounded to two decimals)
 * and what its reader makes of it (`ktnTguReading`).
 *
 * Re-record in the SAME commit that changes the guard or Kärnten's reader on
 * purpose, and read the diff of the verdicts: that diff is the change.
 *
 * Usage:
 *   npx vite-node -c vitest.config.ts scripts/ci/landTguGoldenRecord.ts -- --run=<landGuard --out dir> --draft=sbg-34574 --out=tests/fixtures/laender/tgu-sbg-34574.json
 *   npx vite-node -c vitest.config.ts scripts/ci/landTguGoldenRecord.ts -- --draft=ktn-29457-2025-9 --out=tests/fixtures/laender/tgu-ktn-29457-2025-9.json
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { LandDraftDetail, LawDiffUnit } from '../../shared/types'
import type { TextBlock } from '../../server/utils/lawtext/lawUnits'
import { pagesOf } from '../../server/utils/annex/annexPdfPages'
import { tguDocument } from '../../server/utils/laender/landTguService'
import { amendedLawsOf } from '../../server/utils/laender/landTgu'
import { ktnTguReading } from '../../server/utils/laender/landTguKaernten'
import { argAssigned } from '../lib/args'
import { tguVerdicts } from '../lib/landTguGolden'

const run = argAssigned('run')
const draft = argAssigned('draft')
const out = argAssigned('out')
if (!draft || !out || (!draft.startsWith('ktn-') && !run)) {
  console.error('Usage: landTguGoldenRecord.ts -- [--run=<landGuard --out dir>] --draft=<id> --out=<file>   (--run for every Land but Kärnten)')
  process.exit(1)
}

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex')
const EU = '.cache/eu-laender'
const land = draft.slice(0, draft.indexOf('-'))
const number = draft.slice(draft.indexOf('-') + 1)
const detailFile = `${EU}/server/${sha1(`/api/laender/${land}/${encodeURIComponent(number)}`)}.json`
if (!existsSync(detailFile)) throw new Error(`kein Detail im Cache: ${draft}`)
const detail = JSON.parse(readFileSync(detailFile, 'utf8')) as LandDraftDetail
const doc = land === 'w' ? (tguDocument(detail) ?? detail.draft.documents.at(-1)) : tguDocument(detail)
if (!doc) throw new Error(`keine Textgegenüberstellung: ${draft}`)
// Provenance: the Land's documents of the draft, by title and address.
const source = { title: detail.draft.title, documents: detail.draft.documents.map((d) => ({ title: d.title, url: d.url })) }

if (land === 'ktn') {
  const file = [`${EU}/docs/${sha1(doc.url)}.pdf`, `.harness-cache/land-guard-docs/${sha1(doc.url)}.pdf`].find((f) => existsSync(f))
  if (!file) throw new Error(`PDF nicht im Cache: ${doc.url}`)
  const round = (n: number) => Math.round(n * 100) / 100
  const pages = (await pagesOf(new Uint8Array(readFileSync(file)))).map((p) => ({ ...p, items: p.items.map((i) => ({ ...i, x: round(i.x), y: round(i.y), width: round(i.width) })) }))
  const laws = amendedLawsOf(detail.draft.title)
  writeFileSync(out, `${JSON.stringify({ draft, land, source, laws, pages, reading: ktnTguReading(pages, laws) })}\n`)
} else {
  const line = readFileSync(`${run}/corpus.jsonl`, 'utf8').split('\n').find((l) => l.includes(`"draft":"${draft}"`))
  if (!line) throw new Error(`nicht in ${run}/corpus.jsonl: ${draft}`)
  const { layout, units, blocks } = JSON.parse(line) as { layout: string; units: LawDiffUnit[]; blocks: TextBlock[] | null }
  writeFileSync(out, `${JSON.stringify({ draft, land, layout, source, units, blocks, verdicts: tguVerdicts(units, blocks) })}\n`)
}
console.log(`geschrieben: ${out}`)
