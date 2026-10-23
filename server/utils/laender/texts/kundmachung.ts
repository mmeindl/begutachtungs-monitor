/**
 * Which Landesgesetzblatt is a draft's own, where the Land does not say and
 * only our title search names one (Salzburg; docs/architecture.md
 * §12.47–50). Decided by text, once per draft, and held a week: the list
 * reads the title search, the draft's page reads this.
 *
 *  - A Gesetz: the candidates are the title search's find and every
 *    Landesgesetzblatt after the draft that names the same last amendment of
 *    the law; the one whose Regierungsvorlage — linked in RIS's metadata —
 *    holds the draft's text wins. Where no candidate came from a
 *    Regierungsvorlage (a law the Landtag moved itself), the title find is
 *    held to `followsOn`.
 *  - A Verordnung has no Regierungsvorlage; its Landesgesetzblatt IS its
 *    text. The candidates are those of the same kind within two years whose
 *    titles nearly equal the find, and the one that holds the draft wins.
 *
 * Null: nothing is certain, and nothing is compared against it.
 */
import type { LandCode, LandConsultation, LandKundmachungCertainty, LandLandtag, LandProcedureStep } from '#shared/types'
import { DERIVED_CACHE } from '../../cache/base'
import { upstreamText } from '../../upstream/fetch'
import { amendmentChain, followsOn, lastAmendments } from '../amendmentChain'
import { fetchLgblIndex, lgblFullText, lgblRecord, type LgblRecord } from '../lgblIndex'
import { lgblWords } from '../lgblSearch'
import { containedIn, MIN_SHINGLES, pickByVorlage, SAME_TITLE_JACCARD, shingles, titleJaccard } from '../vorlageMatch'
import { draftSource, pdfPages, readLgbl, TEXT_POLICY, type ReadText } from './read'
import { salzburgLandtag } from './salzburgLandtag'

/** At most this many documents are read to decide one draft. */
const MAX_CANDIDATES = 5

export interface ResolvedKundmachung {
  record: LgblRecord
  certainBy: LandKundmachungCertainty
  /** The title search's find, where it was another. */
  searched: string | null
  /** The Landtag's procedure and facts, read off the Landesgesetzblatt's Regierungsvorlage and report (Salzburg). */
  landtag: { procedure: LandProcedureStep[]; landtag: LandLandtag | null } | null
}

const lawText = (draft: ReadText) => (draft.units?.length ? draft.units.map((u) => `${u.heading ?? ''} ${u.text}`).join(' ') : draft.text)

type Decision = Pick<ResolvedKundmachung, 'record' | 'certainBy'>

async function resolveVerordnung(land: LandCode, startedAt: string, titleNr: string, draft: ReadText): Promise<Decision | null> {
  const index = await fetchLgblIndex(land)
  const found = index.find((e) => e.nr === titleNr)
  if (!found) return null
  const until = `${Number(startedAt.slice(0, 4)) + 2}${startedAt.slice(4)}`
  const words = lgblWords(found.titel)
  const candidates = index
    .filter((e) => e.typ === found.typ && e.datum >= startedAt && e.datum <= until && titleJaccard(lgblWords(e.titel), words) >= SAME_TITLE_JACCARD)
    .slice(0, MAX_CANDIDATES)
  const own = shingles(lawText(draft))
  if (own.size < MIN_SHINGLES) return null
  const scored = await Promise.all(candidates.map(async (e) => {
    const record = await lgblRecord(land, e.nr).catch(() => null)
    const xml = record?.xmlUrl ? await upstreamText(record.xmlUrl, TEXT_POLICY).catch(() => '') : ''
    return { candidate: record, share: containedIn(own, shingles(xml.replace(/<[^>]+>/g, ' '))) }
  }))
  const winner = pickByVorlage(scored)
  return winner ? { record: winner, certainBy: 'wortlaut' } : null
}

async function resolveGesetz(land: LandCode, startedAt: string, titleNr: string, unique: boolean, draft: ReadText): Promise<Decision | null> {
  const title = await lgblRecord(land, titleNr)
  if (!title) return null
  const candidates = new Map<string, LgblRecord>([[title.nr, title]])
  for (const [stamm, last] of lastAmendments(draft.text)) {
    for (const rec of await lgblFullText(land, last).catch(() => [])) {
      if (candidates.has(rec.nr) || rec.nr.endsWith(` ${last}`) || !rec.xmlUrl || (rec.datum ?? '') < startedAt) continue
      const text = await upstreamText(rec.xmlUrl, TEXT_POLICY).catch(() => '')
      if (lastAmendments(text.replace(/<[^>]+>/g, ' ')).get(stamm) === last) candidates.set(rec.nr, rec)
    }
  }
  const withVorlage = [...candidates.values()].filter((r) => r.vorlageUrl).slice(0, MAX_CANDIDATES)
  const own = shingles(lawText(draft))
  if (withVorlage.length && own.size >= MIN_SHINGLES) {
    const scored = await Promise.all(withVorlage.map(async (record) => {
      const pages = await pdfPages(record.vorlageUrl!).catch(() => [])
      return { candidate: record, share: containedIn(own, shingles(pages.join(' '))) }
    }))
    const winner = pickByVorlage(scored)
    if (winner) return { record: winner, certainBy: 'vorlage' }
    // A title find with a Regierungsvorlage that does not hold the draft is
    // no find; one without falls through to the texts' own rule.
    if (title.vorlageUrl) return null
  }
  const chain = amendmentChain(draft.text, (await readLgbl(title.xmlUrl)).text)
  return followsOn(chain, unique) ? { record: title, certainBy: chain === 'same' ? 'kette' : 'treffer' } : null
}

async function resolve(land: LandCode, draft: LandConsultation): Promise<ResolvedKundmachung | null> {
  const stage = draft.stage
  if (!stage || stage === 'unknown' || stage.station !== 'bgbl' || stage.via !== 'suche' || !stage.detail || !draft.startedAt) return null
  const source = draftSource(draft.documents, '')
  if (!source) return null
  const text = await source.read()
  const found = draft.kind === 'verordnung'
    ? await resolveVerordnung(land, draft.startedAt, stage.detail, text)
    : await resolveGesetz(land, draft.startedAt, stage.detail, stage.unique === true, text)
  if (!found) return null
  return {
    ...found,
    searched: found.record.nr !== stage.detail ? stage.detail : null,
    landtag: land === 'sbg' ? await salzburgLandtag(found.record).catch(() => null) : null,
  }
}

/**
 * Whose finds are decided by text, and of which kind. Salzburg names no
 * Kundmachung at all; Oberösterreich's Landtag names every Gesetz's, so only
 * its Verordnungen rest on the search — decided by the method measured on
 * Salzburg's 371 (§12.50), which reads the texts and nothing of the Land.
 */
export const RESOLVED: Partial<Record<LandCode, readonly LandConsultation['kind'][]>> = { sbg: ['gesetz', 'verordnung'], ooe: ['verordnung'] }

/**
 * Held a week in the derived layer: the documents do not change once
 * published, and a week bounds how long a fix to the decision takes to
 * reach a draft already read. `false` caches „not certain" too — a draft
 * whose text no candidate holds stays so until one is published.
 */
export const resolveKundmachung = defineCachedFunction(
  async (land: LandCode, draft: LandConsultation): Promise<ResolvedKundmachung | false> =>
    (RESOLVED[land]?.includes(draft.kind) ? await resolve(land, draft) : null) ?? false,
  {
    name: 'land-kundmachung',
    base: DERIVED_CACHE,
    getKey: (land: LandCode, draft: LandConsultation) => `${land}-${draft.id}-${draft.stage && draft.stage !== 'unknown' ? draft.stage.detail : ''}`,
    maxAge: 60 * 60 * 24 * 7,
    swr: true,
  },
)
