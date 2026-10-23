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
import { keepIncompleteFor, type Gathered } from '../../cache/gathered'
import { upstreamText } from '../../upstream/fetch'
import { amendmentChain, followsOn, lastAmendments } from '../amendmentChain'
import { fetchLgblIndex, lgblFullText, lgblRecord, type LgblRecord } from '../lgblIndex'
import { lgblWords } from '../lgblSearch'
import { containedIn, MIN_SHINGLES, pickByVorlage, SAME_TITLE_JACCARD, shingles, titleJaccard, VORLAGE_CONTAINED } from '../vorlageMatch'
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

/**
 * What the texts say about the title search's find: decided (for it or for
 * another), refuted, or neither (null).
 *
 * REFUTED (23.10.2026): the find's own Regierungsvorlage holds less than
 * half of what deciding needs (`REFUTED_BELOW`), no other candidate's does,
 * the draft reads as law text, and every read answered. Until then such a
 * find stood on the page as „Gesetz geworden" though the check had found it
 * was not this draft's (`if (title.vorlageUrl) return null`, „no find").
 */
export type KundmachungVerdict = ResolvedKundmachung | 'widerlegt' | null

/**
 * Half the decision threshold — the margin `pickByVorlage` keeps to a
 * runner-up. Over the 153 title finds of Salzburg's Gesetze in GP XXVII and
 * XXVIII (23.10.2026): 143 at ≥ 0,6; three at 0,54–0,59, reworked after the
 * Begutachtung and right; six at 0,00–0,14 — two decided for another
 * Landesgesetzblatt by its Vorlage, three refuted, and one whose „Entwurf" is
 * a Stellungnahme the Land filed in its place: no law text, so it refutes
 * nothing.
 */
const REFUTED_BELOW = VORLAGE_CONTAINED / 2

/**
 * Whether every read a decision rested on answered. A read that failed is
 * read as empty — what it would have added is missing — and the decision is
 * then held an hour, not a week, and refutes nothing (`cache/gathered.ts`):
 * a Vorlage that timed out holds none of the draft.
 */
interface Reads { complete: boolean }
function soft<T>(reads: Reads, read: Promise<T>, empty: T): Promise<T> {
  return read.catch(() => {
    reads.complete = false
    return empty
  })
}

async function resolveVerordnung(land: LandCode, startedAt: string, titleNr: string, draft: ReadText, reads: Reads): Promise<Decision | null> {
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
    const record = await soft(reads, lgblRecord(land, e.nr), null)
    const xml = record?.xmlUrl ? await soft(reads, upstreamText(record.xmlUrl, TEXT_POLICY), '') : ''
    return { candidate: record, share: containedIn(own, shingles(xml.replace(/<[^>]+>/g, ' '))) }
  }))
  const winner = pickByVorlage(scored)
  return winner ? { record: winner, certainBy: 'wortlaut' } : null
}

async function resolveGesetz(land: LandCode, startedAt: string, titleNr: string, unique: boolean, draft: ReadText, reads: Reads): Promise<Decision | 'widerlegt' | null> {
  const title = await lgblRecord(land, titleNr)
  if (!title) return null
  const candidates = new Map<string, LgblRecord>([[title.nr, title]])
  for (const [stamm, last] of lastAmendments(draft.text)) {
    for (const rec of await soft(reads, lgblFullText(land, last), [])) {
      if (candidates.has(rec.nr) || rec.nr.endsWith(` ${last}`) || !rec.xmlUrl || (rec.datum ?? '') < startedAt) continue
      const text = await soft(reads, upstreamText(rec.xmlUrl, TEXT_POLICY), '')
      if (lastAmendments(text.replace(/<[^>]+>/g, ' ')).get(stamm) === last) candidates.set(rec.nr, rec)
    }
  }
  const withVorlage = [...candidates.values()].filter((r) => r.vorlageUrl).slice(0, MAX_CANDIDATES)
  const own = shingles(lawText(draft))
  if (withVorlage.length && own.size >= MIN_SHINGLES) {
    const scored = await Promise.all(withVorlage.map(async (record) => {
      const pages = await soft(reads, pdfPages(record.vorlageUrl!), [])
      return { candidate: record, share: containedIn(own, shingles(pages.join(' '))) }
    }))
    const winner = pickByVorlage(scored)
    if (winner) return { record: winner, certainBy: 'vorlage' }
    // A title find with a Regierungsvorlage that does not hold the draft is
    // no find — refuted where it holds next to nothing of a draft read as
    // law text; one without falls through to the texts' own rule.
    if (title.vorlageUrl) {
      const titleShare = scored.find((x) => x.candidate.nr === title.nr)?.share ?? 1
      return reads.complete && draft.units?.length && titleShare < REFUTED_BELOW ? 'widerlegt' : null
    }
  }
  const chain = amendmentChain(draft.text, (await readLgbl(title.xmlUrl)).text)
  return followsOn(chain, unique) ? { record: title, certainBy: chain === 'same' ? 'kette' : 'treffer' } : null
}

async function resolve(land: LandCode, draft: LandConsultation, reads: Reads): Promise<KundmachungVerdict> {
  const stage = draft.stage
  if (!stage || stage === 'unknown' || stage.station !== 'bgbl' || stage.via !== 'suche' || !stage.detail || !draft.startedAt) return null
  const source = draftSource(draft.documents, '')
  if (!source) return null
  const text = await source.read()
  const found = draft.kind === 'verordnung'
    ? await resolveVerordnung(land, draft.startedAt, stage.detail, text, reads)
    : await resolveGesetz(land, draft.startedAt, stage.detail, stage.unique === true, text, reads)
  if (!found || found === 'widerlegt') return found
  return {
    ...found,
    searched: found.record.nr !== stage.detail ? stage.detail : null,
    landtag: land === 'sbg' ? await soft(reads, salzburgLandtag(found.record, reads), null) : null,
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
 * reach a draft already read. „Not certain" is held too — a draft whose text
 * no candidate holds stays so until one is published — but a decision that
 * rests on a failed read only an hour (`INCOMPLETE_MS`): until 23.10.2026 a
 * Vorlage that timed out counted as one that holds none of the draft, and
 * that stood for the week.
 */
const INCOMPLETE_MS = 60 * 60 * 1000
export const resolveKundmachung = defineCachedFunction(
  async (land: LandCode, draft: LandConsultation): Promise<Gathered<KundmachungVerdict>> => {
    const reads: Reads = { complete: true }
    const value = RESOLVED[land]?.includes(draft.kind) ? await resolve(land, draft, reads) : null
    return { value, complete: reads.complete }
  },
  {
    name: 'land-kundmachung',
    base: DERIVED_CACHE,
    getKey: (land: LandCode, draft: LandConsultation) => `${land}-${draft.id}-${draft.stage && draft.stage !== 'unknown' ? draft.stage.detail : ''}`,
    maxAge: 60 * 60 * 24 * 7,
    swr: true,
    validate: keepIncompleteFor(INCOMPLETE_MS),
  },
)
