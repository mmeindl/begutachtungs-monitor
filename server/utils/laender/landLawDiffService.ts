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
 * (Oberösterreich's Landtag) — or, for Salzburg's Gesetze, found by our title
 * search AND confirmed by the two texts' promulgation clauses (`followsOn`).
 * The title search alone is wrong about two times in a hundred, a single
 * candidate included (sbg-27156: a draft of 2022 matched to the 2024
 * amendment of the same law), and held against the wrong law a comparison
 * would report a whole draft rewritten: the one error this layer must not
 * make. Measured against an oracle that never looks at a title — the
 * Regierungsvorlage whose text the draft is, linked to its Landesgesetzblatt
 * in RIS's own metadata (§12.47). Salzburg's Verordnungen have no such
 * oracle and stay out.
 *
 * And a comparison in which not one unit pairs is no comparison: a draft and
 * its own Kundmachung share at least the law they amend. Shown, it would read
 * as every instruction dropped and replaced (`NOTHING_PAIRS`).
 */
import type { LandCode, LandDraftDetail, LandLawDiffResponse, LandTextDocument, LandTextStation } from '#shared/types'
import { LAND_NAME, landDraftPath } from '#shared/utils/laender'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { DERIVED_CACHE } from '../cache/base'
import { summarizeDiff } from '../diff/lawDiff'
import type { LawUnit } from '../lawtext/lawUnits'
import { upstreamBytes, upstreamText, type UpstreamPolicy } from '../upstream/fetch'
import { diffLandDraft, landDraftUnits, lgblUnits, packageChanges } from './landLawDiff'
import { lgblXmlUrl } from './lgblIndex'
import { amendmentChain, followsOn } from './amendmentChain'
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
    fromDocument: null, toDocument: null, addedLaws: [], droppedLaws: [], sharedWith: [], withheld: 0, ...rest,
  }
}

interface Source {
  document: LandTextDocument
  /** The units, and the text they were read from — the promulgation clause is checked on it. */
  read: () => Promise<{ units: LawUnit[] | null; text: string }>
  /** A Kundmachung of our own finding, which must pass `followsOn` before it is compared. */
  searched?: { unique: boolean }
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
      // Our own find only for Salzburg's Gesetze, the class the oracle
      // measured (§12.47); it is then held to `followsOn` after reading.
      if (stage.via === 'suche' && !(land === 'sbg' && detail.draft.kind === 'gesetz')) return null
      const nr = stage.detail
      return {
        document: { label: nr, url: stage.url ?? null, publisher: 'RIS (CC BY 4.0)' },
        read: async () => {
          const xmlUrl = await lgblXmlUrl(land, nr)
          if (!xmlUrl) return { units: null, text: '' }
          const xml = await upstreamText(xmlUrl, POLICY)
          return { units: lgblUnits(xml), text: xml.replace(/<[^>]+>/g, ' ') }
        },
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
  const docs = { fromDocument: a.document, toDocument: b.document }
  const [ra, rb] = await Promise.all([a.read(), b.read()])
  const x = ra.units
  const y = rb.units
  if (b.searched && !followsOn(amendmentChain(ra.text, rb.text), b.searched.unique)) {
    return unavailable(from, to, NOT_CERTAIN, docs)
  }
  if (!x?.length || !y?.length) {
    return unavailable(from, to, `Im ${!x?.length ? a.document.label : b.document.label} fand der Monitor keinen Gesetzestext, den er Paragraph für Paragraph lesen kann.`, docs)
  }
  const units = diffLandDraft(x, y)
  const { added, dropped } = packageChanges(x, y)
  const s = summarizeDiff(units)
  if (!s.unchanged && !s.changed) return unavailable(from, to, NOTHING_PAIRS, docs)
  const shared = to === 'lgbl' && detail.draft.stage && detail.draft.stage !== 'unknown' && detail.draft.stage.detail
    ? await draftsSharingKundmachung(land, detail.draft.stage.detail, detail.draft.id).catch(() => [])
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
