/**
 * Two texts of a Land's draft, § by § (22.10.2026), for the draft page's
 * station sections — as the Ministerialentwurf's page hangs a comparison on
 * each station that produced one:
 *
 *   geltend → entwurf    „Was ändert der Entwurf?" — from the Land's
 *                        Textgegenüberstellung, `landTguService.ts`
 *   entwurf → rv         „Was sich nach der Begutachtung geändert hat"
 *   rv → ausschuss       „Was der Ausschuss an der Regierungsvorlage geändert hat"
 *   entwurf → lgbl       „Was sich vom Entwurf bis zum kundgemachten Gesetz …"
 *
 * The Begutachtungsentwurf is the Land's PDF; the Regierungsvorlage and the
 * committee report are the Landtag's PDFs (same template, same reader,
 * `landLawDiff.ts`); the Kundmachung is the Landesgesetzblatt's XML in RIS.
 * Measured before it was built — docs/architecture.md §12.44, with the cross
 * check that settles the readers: the committee report against the
 * Kundmachung splits into the same units in nearly every draft, and what
 * differs is the editing for publication („Hektar" → „ha"), not the reading.
 *
 * NOT `rv → lgbl` for the Landtag: it would mix the committee's changes with
 * that editing, which is not the committee's.
 *
 * THE KUNDMACHUNG MUST BE CERTAIN. Named by the Land's own record
 * (Oberösterreich's Landtag) — or, for Salzburg, found by our title search
 * and then decided by text: a Gesetz by the Regierungsvorlage RIS links each
 * Landesgesetzblatt to (`resolveSearched`, §12.48), a Verordnung by the
 * Landesgesetzblatt that holds its text (`resolveVerordnung`, §12.50). The
 * title search alone is wrong about two times in a hundred, a single
 * candidate included, and held against the wrong law a comparison would
 * report a whole draft rewritten: the one error this layer must not make.
 *
 * And a comparison in which not one unit pairs is no comparison: a draft and
 * its own Kundmachung share at least the law they amend. Shown, it would read
 * as every instruction dropped and replaced (`NOTHING_PAIRS`).
 */
import type { LandCode, LandDraftDetail, LandKundmachungCertainty, LandLawDiffResponse, LandTextDocument, LandTextStation } from '#shared/types'
import { LAND_NAME, landDraftPath } from '#shared/utils/laender'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { DERIVED_CACHE } from '../cache/base'
import { summarizeDiff } from '../diff/lawDiff'
import type { LawUnit } from '../lawtext/lawUnits'
import { upstreamBytes, upstreamText, type UpstreamPolicy } from '../upstream/fetch'
import { diffLandDraft, landDraftUnits, lgblUnits, packageChanges } from './landLawDiff'
import { fetchLgblIndex, lgblFullText, lgblRecord, lgblXmlUrl, type LgblRecord } from './lgblIndex'
import { lgblWords } from './lgblSearch'
import { containedIn, MIN_SHINGLES, pickByVorlage, SAME_TITLE_JACCARD, shingles, titleJaccard } from './vorlageMatch'
import { amendmentChain, followsOn, lastAmendments } from './amendmentChain'
import { compareTgu } from './landTguService'
import { draftsSharingKundmachung } from './sources'

const POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 2, upstreamHostsOnly: true }
const PDF_MAX_BYTES = 30 * 1024 * 1024

/** The pairs the page asks for; anything else is no comparison of ours. */
export const LAND_TEXT_PAIRS: readonly (readonly [LandTextStation, LandTextStation])[] = [
  ['geltend', 'entwurf'],
  ['entwurf', 'rv'],
  ['rv', 'ausschuss'],
  ['entwurf', 'lgbl'],
]

const NOT_CERTAIN = 'Diese Kundmachung hat der Monitor selbst über den Titel gefunden, und die beiden Texte bestätigen sie nicht sicher — er vergleicht hier deshalb nicht.'

const NOTHING_PAIRS = 'Die beiden Texte haben keinen einzigen Teil gemeinsam — der Monitor zeigt hier keinen Vergleich, statt alles als neu zu melden.'

const emptyStats = { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 }

function unavailable(from: LandTextStation, to: LandTextStation, reason: string, rest: Partial<LandLawDiffResponse> = {}): LandLawDiffResponse {
  return {
    from, to, available: false, unavailableReason: reason, units: [], stats: emptyStats,
    fromDocument: null, toDocument: null, addedLaws: [], droppedLaws: [], sharedWith: [], withheld: 0, kundmachung: null, ...rest,
  }
}

interface Source {
  document: LandTextDocument
  /** The units, and the text they were read from — the promulgation clause is checked on it. */
  read: () => Promise<{ units: LawUnit[] | null; text: string }>
  /** A Kundmachung of our own finding, which must pass `followsOn` before it is compared. */
  searched?: { unique: boolean }
}

async function readLgbl(xmlUrl: string | null): Promise<{ units: LawUnit[] | null; text: string }> {
  if (!xmlUrl) return { units: null, text: '' }
  const xml = await upstreamText(xmlUrl, POLICY)
  return { units: lgblUnits(xml), text: xml.replace(/<[^>]+>/g, ' ') }
}

/** At most this many Regierungsvorlagen are read to decide one draft. */
const MAX_VORLAGEN = 5

/**
 * Which Landesgesetzblatt is this draft's, where only our search named one
 * (§12.48): the title search's find and every Landesgesetzblatt after the
 * draft that names the same last amendment of the law are the candidates,
 * and the one whose Regierungsvorlage holds the draft's text wins
 * (`pickByVorlage`) — the oracle's own test (§12.47). Where no candidate
 * came from a Regierungsvorlage (a law the Landtag moved itself), the title
 * find is held to `followsOn`. Null: nothing is certain.
 */
/**
 * A Verordnung has no Regierungsvorlage; its Landesgesetzblatt IS its text.
 * The candidates are the Landesgesetzblätter of the same kind within two
 * years whose titles nearly equal the search's find — sibling Verordnungen
 * of one day, a second amendment of the same Verordnung — and the one that
 * holds the draft's text wins (§12.50).
 */
async function resolveVerordnung(
  land: LandCode,
  startedAt: string | null,
  titleNr: string,
  draft: { units: LawUnit[] | null; text: string },
): Promise<{ record: LgblRecord; certainBy: LandKundmachungCertainty } | null> {
  const index = await fetchLgblIndex(land)
  const found = index.find((e) => e.nr === titleNr)
  if (!found || !startedAt) return null
  const until = `${Number(startedAt.slice(0, 4)) + 2}${startedAt.slice(4)}`
  const words = lgblWords(found.titel)
  const candidates = index
    .filter((e) => e.typ === found.typ && e.datum >= startedAt && e.datum <= until && titleJaccard(lgblWords(e.titel), words) >= SAME_TITLE_JACCARD)
    .slice(0, MAX_VORLAGEN)
  const draftText = draft.units?.length ? draft.units.map((u) => `${u.heading ?? ''} ${u.text}`).join(' ') : draft.text
  const draftShingles = shingles(draftText)
  if (draftShingles.size < MIN_SHINGLES) return null
  const scored = await Promise.all(candidates.map(async (e) => {
    const record = await lgblRecord(land, e.nr).catch(() => null)
    const xml = record?.xmlUrl ? await upstreamText(record.xmlUrl, POLICY).catch(() => '') : ''
    return { candidate: record, share: containedIn(draftShingles, shingles(xml.replace(/<[^>]+>/g, ' '))) }
  }))
  const winner = pickByVorlage(scored)
  return winner ? { record: winner, certainBy: 'wortlaut' } : null
}

async function resolveSearched(
  land: LandCode,
  startedAt: string | null,
  titleNr: string,
  unique: boolean,
  draft: { units: LawUnit[] | null; text: string },
  titleText: string,
): Promise<{ record: LgblRecord; certainBy: LandKundmachungCertainty } | null> {
  const title = await lgblRecord(land, titleNr)
  if (!title) return null
  const candidates = new Map<string, LgblRecord>([[title.nr, title]])
  for (const [stamm, last] of lastAmendments(draft.text)) {
    for (const rec of await lgblFullText(land, last).catch(() => [])) {
      if (candidates.has(rec.nr) || rec.nr.endsWith(` ${last}`) || !rec.xmlUrl) continue
      if (startedAt && (rec.datum ?? '') < startedAt) continue
      const own = await upstreamText(rec.xmlUrl, POLICY).catch(() => '')
      if (lastAmendments(own.replace(/<[^>]+>/g, ' ')).get(stamm) === last) candidates.set(rec.nr, rec)
    }
  }
  const withVorlage = [...candidates.values()].filter((r) => r.vorlageUrl).slice(0, MAX_VORLAGEN)
  const draftText = draft.units?.length ? draft.units.map((u) => `${u.heading ?? ''} ${u.text}`).join(' ') : draft.text
  const draftShingles = shingles(draftText)
  if (withVorlage.length && draftShingles.size >= MIN_SHINGLES) {
    const scored = await Promise.all(withVorlage.map(async (record) => {
      const pages = await pdfPages(record.vorlageUrl!).catch(() => [])
      return { candidate: record, share: containedIn(draftShingles, shingles(pages.join(' '))) }
    }))
    const winner = pickByVorlage(scored)
    if (winner) return { record: winner, certainBy: 'vorlage' }
    // A title find with a Regierungsvorlage that does not hold the draft is
    // no find; one without falls through to the texts' own rule.
    if (title.vorlageUrl) return null
  }
  const chain = amendmentChain(draft.text, titleText)
  return followsOn(chain, unique) ? { record: title, certainBy: chain === 'same' ? 'kette' : 'treffer' } : null
}

async function pdfPages(url: string): Promise<string[]> {
  const { bytes } = await upstreamBytes(url, { ...POLICY, maxBytes: PDF_MAX_BYTES })
  const { extractText, getDocumentProxy } = await import('unpdf')
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false })
  return Array.isArray(text) ? text : [text]
}

const pdfSource = (label: string, url: string, publisher: string): Source => ({
  document: { label, url, publisher },
  read: async () => {
    const pages = await pdfPages(url)
    return { units: landDraftUnits(pages), text: pages.join('\n') }
  },
})

/** Where each text of the draft is, by the Land's own record; null where there is none. */
function sourceOf(land: LandCode, detail: LandDraftDetail, station: LandTextStation): Source | null {
  const landName = `Land ${LAND_NAME[land]}`
  switch (station) {
    // Read with the draft's text from one document (`compareTgu`), never alone.
    case 'geltend':
      return null
    case 'entwurf': {
      const docs = detail.draft.documents
      const doc = docs.find((d) => /Begutachtungsentwurf|Entwurf/i.test(d.title)) ?? docs[0]
      const url = doc ? safeExternalUrl(doc.url) : null
      return doc && url ? pdfSource(doc.title, url, landName) : null
    }
    case 'rv': {
      const step = detail.procedure?.find((s) => s.station === 'rv')
      const url = step?.url ? safeExternalUrl(step.url) : null
      const beilage = /Beilage\s+\d+\/\d{4}/.exec(step?.label ?? '')?.[0]
      return url ? pdfSource(`Regierungsvorlage${beilage ? `, ${beilage}` : ''}`, url, 'Oö. Landtag') : null
    }
    case 'ausschuss': {
      const report = detail.landtag?.report
      const url = report?.url ? safeExternalUrl(report.url) : null
      return url ? pdfSource(report!.label, url, 'Oö. Landtag') : null
    }
    case 'lgbl': {
      const stage = detail.draft.stage
      if (!stage || stage === 'unknown' || stage.station !== 'bgbl' || !stage.detail) return null
      // Our own find only for Salzburg, the Land the oracles measured
      // (§12.47–50); it is then made certain after reading, or refused.
      if (stage.via === 'suche' && land !== 'sbg') return null
      const nr = stage.detail
      return {
        document: { label: nr, url: stage.url ?? null, publisher: 'RIS (CC BY 4.0)' },
        read: async () => readLgbl(await lgblXmlUrl(land, nr)),
        ...(stage.via === 'suche' ? { searched: { unique: stage.unique === true } } : {}),
      }
    }
  }
}

export async function compareLandTexts(
  land: LandCode,
  detail: LandDraftDetail,
  from: LandTextStation,
  to: LandTextStation,
): Promise<LandLawDiffResponse> {
  if (from === 'geltend') return compareTgu(land, detail)
  const a = sourceOf(land, detail, from)
  const b = sourceOf(land, detail, to)
  if (!a || !b) {
    return unavailable(from, to, to === 'lgbl' && !b
      ? 'Verglichen wird nur, wo die Kundmachung feststeht.'
      : 'Das Land hat einen der beiden Texte nicht veröffentlicht.', { fromDocument: a?.document ?? null, toDocument: b?.document ?? null })
  }
  let docs = { fromDocument: a.document, toDocument: b.document }
  const [ra, rbTitle] = await Promise.all([a.read(), b.read()])
  let rb = rbTitle
  let kundmachung: LandLawDiffResponse['kundmachung'] = null
  const stage = detail.draft.stage
  if (to === 'lgbl' && stage && stage !== 'unknown' && stage.detail) {
    if (b.searched) {
      const resolved = detail.draft.kind === 'verordnung'
        ? await resolveVerordnung(land, detail.draft.startedAt, stage.detail, ra)
        : await resolveSearched(land, detail.draft.startedAt, stage.detail, b.searched.unique, ra, rbTitle.text)
      if (!resolved) return unavailable(from, to, NOT_CERTAIN, { ...docs, kundmachung: { nr: stage.detail, url: stage.url ?? null, date: stage.date, certainBy: null, searched: stage.detail } })
      const other = resolved.record.nr !== stage.detail
      if (other) {
        rb = await readLgbl(resolved.record.xmlUrl)
        docs = { ...docs, toDocument: { label: resolved.record.nr, url: resolved.record.url, publisher: 'RIS (CC BY 4.0)' } }
      }
      kundmachung = { nr: resolved.record.nr, url: resolved.record.url, date: resolved.record.datum, certainBy: resolved.certainBy, searched: stage.detail }
    } else {
      kundmachung = { nr: stage.detail, url: stage.url ?? null, date: stage.date, certainBy: 'land', searched: null }
    }
  }
  const x = ra.units
  const y = rb.units
  if (!x?.length || !y?.length) {
    return unavailable(from, to, `Im ${!x?.length ? a.document.label : b.document.label} fand der Monitor keinen Gesetzestext, den er Paragraph für Paragraph lesen kann.`, docs)
  }
  const units = diffLandDraft(x, y)
  const { added, dropped } = packageChanges(x, y)
  const s = summarizeDiff(units)
  if (!s.unchanged && !s.changed) return unavailable(from, to, NOTHING_PAIRS, { ...docs, kundmachung })
  const shared = kundmachung
    ? await draftsSharingKundmachung(land, kundmachung.nr, detail.draft.id).catch(() => [])
    : []
  return {
    from,
    to,
    available: true,
    unavailableReason: null,
    units,
    stats: { total: s.total, unchanged: s.unchanged, changed: s.changed, editorial: s.editorial, inserted: s.inserted, removed: s.removed },
    ...docs,
    addedLaws: added,
    droppedLaws: dropped,
    sharedWith: shared.map((d) => ({ title: d.title, path: landDraftPath(d.land, d.id), deadline: d.deadline, startedAt: d.startedAt })),
    withheld: 0,
    kundmachung,
  }
}

/**
 * Held a day, in the derived layer: the documents do not change, but the
 * reader does, and a stale comparison must not outlive a fix to it.
 */
export const cachedLandComparison = defineCachedFunction(
  (land: LandCode, number: string, from: LandTextStation, to: LandTextStation, detail: LandDraftDetail): Promise<LandLawDiffResponse> =>
    compareLandTexts(land, detail, from, to),
  {
    name: 'land-law-diff',
    base: DERIVED_CACHE,
    getKey: (land: LandCode, number: string, from: LandTextStation, to: LandTextStation) => `${land}-${number}-${from}-${to}`,
    maxAge: 60 * 60 * 24,
    swr: false,
  },
)
