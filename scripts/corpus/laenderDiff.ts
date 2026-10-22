/**
 * Measurement (22.10.2026): can a Land's draft be held against its
 * Kundmachung at § level? The draft is the Land's PDF (`draftPdfLaw.ts`),
 * the Kundmachung the Landesgesetzblatt's RIS XML (`parseLawUnitsFromRis`).
 * For every Oberösterreich Gesetz whose Landtag record names its LGBl:
 * parse both, diff, and print what the diff claims, for reading by hand.
 *
 *   pnpm corpus:laender-diff [--limit N] [--dump] [--id 2026-16120]
 *
 * Reads the drafts through a running dev server (BASE, default :3000).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { diffLandDraft, landDraftUnits, lgblUnits } from '../../server/utils/laender/landLawDiff'
import { summarizeDiff } from '../../server/utils/diff/lawDiff'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const args = process.argv.slice(2)
const limit = Number(args[args.indexOf('--limit') + 1]) || 5
const dump = args.includes('--dump')
const only = args.includes('--id') ? args[args.indexOf('--id') + 1] : null
const CACHE = '.harness-cache/laender-diff'
mkdirSync(CACHE, { recursive: true })

async function cached(url: string): Promise<Buffer> {
  const file = `${CACHE}/${createHash('sha1').update(url).digest('hex')}`
  if (existsSync(file)) return readFileSync(file)
  const res = await fetch(url, { headers: { 'user-agent': 'begutachtungs-monitor/0.1; scripts/corpus/laenderDiff' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(file, buf)
  return buf
}

async function pdfPages(buf: Buffer): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buf))
  return (await extractText(pdf, { mergePages: false })).text as string[]
}

async function lgblXmlUrl(nr: string): Promise<string | null> {
  const n = /(\d+\/\d{4})/.exec(nr)?.[1]
  const q = new URLSearchParams({ Applikation: 'LgblAuth', Bundesland_SucheInOberoesterreich: 'true', Lgblnummer: n! })
  const body = JSON.parse((await cached(`https://data.bka.gv.at/ris/api/v2.6/Landesrecht?${q}`)).toString('utf8'))
  const refs = body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference
  const ref = Array.isArray(refs) ? refs[0] : refs
  const content = ref?.Data?.Dokumentliste?.ContentReference
  const urls = (Array.isArray(content) ? content[0] : content)?.Urls?.ContentUrl ?? []
  return (Array.isArray(urls) ? urls : [urls]).map((u: { Url: string }) => u.Url).find((u: string) => u.endsWith('.xml')) ?? null
}

const oracle = JSON.parse(readFileSync('tests/fixtures/laender/lgbl-oracle-ooe-2026-10-22.json', 'utf8')) as { drafts: { id: string; lgbl: string; deadline: string }[] }
const picks = oracle.drafts.filter((d) => !only || d.id === `ooe-${only}`).sort((a, b) => b.deadline.localeCompare(a.deadline)).slice(0, only ? 1 : limit)

for (const d of picks) {
  const number = d.id.slice(4)
  try {
    const detail = await (await fetch(`${BASE}/api/laender/ooe/${number}`)).json()
    const doc = detail.draft.documents.find((x: { title: string }) => /Begutachtungsentwurf/i.test(x.title)) ?? detail.draft.documents[0]
    const draftUnits = landDraftUnits(await pdfPages(await cached(doc.url)))
    if (!draftUnits) { console.log(`${number}: no enacting clause in the PDF`); continue }
    const xmlUrl = await lgblXmlUrl(d.lgbl)
    if (!xmlUrl) { console.log(`${number}: no XML for ${d.lgbl}`); continue }
    const kundmachung = lgblUnits((await cached(xmlUrl)).toString('utf8'))
    const diff = diffLandDraft(draftUnits, kundmachung)
    const s = summarizeDiff(diff)
    const arts = (u: typeof draftUnits) => new Set(u.map((x) => x.articleNumber)).size
    console.log(`${number} → ${d.lgbl}: draft ${draftUnits.length} units/${arts(draftUnits)} art, LGBl ${kundmachung.length}/${arts(kundmachung)} | ${JSON.stringify(s)}`)
    if (dump) {
      for (const u of diff) {
        if (u.change === 'unchanged') continue
        console.log(`  [${u.change}${u.editorial ? ' editorial' : ''}] Art ${u.fromArticleKey ?? '?'}→${u.articleKey ?? '?'} ${u.fromId ?? '-'}→${u.id}`)
        if (u.change === 'changed' && u.segments) {
          const shown = u.segments.filter((g) => g.type !== 'equal').slice(0, 6).map((g) => `${g.type === 'inserted' ? '+' : '-'}«${g.text.slice(0, 90)}»`)
          console.log('     ', shown.join('  '))
        } else {
          console.log('     ', (u.toText ?? u.fromText ?? '').slice(0, 160))
        }
      }
    }
  } catch (err) {
    console.log(`${number}: ${err instanceof Error ? err.message : err}`)
  }
}
