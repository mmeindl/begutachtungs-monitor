/**
 * Whether a Land's draft carries out a Grundsatzgesetz or implements a
 * Vereinbarung gemäß Art. 15a B-VG — the fact on every Land draft page
 * under the EU fact. Nuxt-aware glue around
 * the pure reader (`ausfuehrung.ts`).
 *
 * READS NOTHING THE EU FACT DOES NOT. The pages and the Erläuterungen come
 * from the one read both facts share (`laender/landDraftTexts.ts`); new are
 * only the Kundmachung's RIS record per cited act, cached as a published
 * document.
 *
 * Two halves, as the EU fact: the FINDING (reader output and the documents
 * it read) is what the prewarm build keeps on disk (`bundLandStore.ts`);
 * the VIEW adds the Kundmachung's day and RIS page, and the act's page where
 * the map has one — read per request, never stored with the finding.
 *
 * A failure is not an answer: a draft PDF that did not arrive
 * leaves the finding incomplete, served and not stored.
 */
import type { BgblICitation, BundesrechtFinding, LandBundesrechtResponse, LandCode, TraceLink } from '#shared/types'
import { DERIVED_CACHE } from '../cache/base'
import { onlyComplete, type Gathered } from '../cache/gathered'
import { readLandDraftTexts } from '../laender/landDraftTexts'
import { NOT_A_DRAFT } from '../laender/texts/read'
import type { LandDraftRecord } from '../laender/texts/stations'
import { ausfuehrungDocumentsOf, readAusfuehrung } from './ausfuehrung'
import { bgblActFor } from './bgblActService'
import type { LandAusfuehrungFact } from './bundLandStore'

/** The finding for one Land's draft, as the store keeps it. */
export async function assembleLandAusfuehrung(land: LandCode, detail: LandDraftRecord): Promise<Gathered<LandAusfuehrungFact>> {
  const texts = await readLandDraftTexts(land, detail)
  if (texts.erl.unavailableReason === NOT_A_DRAFT) return { value: { findings: [], sources: [] }, complete: true }
  const docs = ausfuehrungDocumentsOf(texts.input)
  const found = readAusfuehrung(docs)
  const sources: TraceLink[] = []
  for (const f of found) {
    const doc = docs[f.document]
    const label = f.inExplanations ? 'Erläuterungen' : doc?.title ?? 'Entwurf'
    if (doc?.url && !sources.some((s) => s.url === doc.url && s.label === label)) sources.push({ label, url: doc.url })
  }
  return {
    value: { findings: found.map(({ sentence: _sentence, ...rest }) => rest), sources },
    complete: texts.complete,
  }
}

/** The cached half; a finding missing a read is served, not stored. */
export const readLandAusfuehrung = defineCachedFunction(
  (land: LandCode, number: string, detail: LandDraftRecord): Promise<Gathered<LandAusfuehrungFact>> => assembleLandAusfuehrung(land, detail),
  {
    name: 'land-bundesrecht',
    base: DERIVED_CACHE,
    getKey: (land: LandCode, number: string) => `${land}-${number}`,
    maxAge: 60 * 60 * 24,
    swr: false,
    validate: onlyComplete,
  },
)

/**
 * The page's view of a finding: the Kundmachung's day and RIS page where
 * the clause cites one, the act page where `hasPage` says the map has it.
 * A Grundsatzgesetz the draft names without citing it takes the act the
 * map placed the draft under (`mapped`, `federalActNamed`) — the same
 * resolution, so the fact and the act page never disagree. A RIS record
 * that does not answer costs the view its date, not its line.
 */
export async function viewOfFact(fact: LandAusfuehrungFact, hasPage: (key: string) => boolean, mapped: BgblICitation | null = null): Promise<LandBundesrechtResponse> {
  const findings: BundesrechtFinding[] = await Promise.all(fact.findings.map(async (f) => {
    const bgbl = f.act.bgbl ?? (f.kind === 'grundsatzgesetz' ? mapped : null)
    const act = bgbl ? await bgblActFor(bgbl).catch(() => null) : null
    const key = bgbl ? `${bgbl.year}-${bgbl.number}` : null
    return {
      kind: f.kind,
      name: f.act.name,
      bgbl,
      partial: f.act.partial,
      path: f.kind === 'grundsatzgesetz' && bgbl && key && hasPage(key) ? `/bundesrecht/${bgbl.year}/${bgbl.number}` : null,
      kundmachung: act?.datum ?? null,
      risUrl: act?.page ?? null,
    }
  }))
  return { findings, sources: fact.sources }
}
