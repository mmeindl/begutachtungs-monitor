/**
 * Two texts of a Land's draft, § by § (22.10.2026), for the draft page's
 * station sections — as the Ministerialentwurf's page hangs a comparison on
 * each station that produced one. WHICH texts a draft has, and so which
 * pairs exist, is decided in `texts/stations.ts` and handed to the page as
 * `LandDraftDetail.comparisons`; this service compares what it is asked for
 * and nothing it was not offered.
 *
 * The Begutachtungsentwurf is the Land's PDF; the Regierungsvorlage and the
 * committee report are the Landtag's PDFs (the same reader,
 * `landLawDiff.ts`); the Kundmachung is the Landesgesetzblatt's XML in RIS.
 * Measured before it was built — docs/architecture.md §12.44.
 *
 * THE KUNDMACHUNG MUST BE CERTAIN — named by the Land, or decided by text
 * (`texts/kundmachung.ts`, §12.47–50). `textSources` offers no other. Held
 * against the wrong law a comparison would report a whole draft rewritten:
 * the one error this layer must not make.
 *
 * And a comparison in which not one unit pairs is no comparison: a draft and
 * its own Kundmachung share at least the law they amend. Shown, it would read
 * as every instruction dropped and replaced (`NOTHING_PAIRS`).
 */
import type { LandCode, LandDraftDetail, LandLawDiffResponse, LandTextStation } from '#shared/types'
import { landDraftPath } from '#shared/utils/laender'
import { DERIVED_CACHE } from '../cache/base'
import { summarizeDiff } from '../diff/lawDiff'
import { diffLandDraft, packageChanges } from './landLawDiff'
import { compareTgu } from './landTguService'
import { draftsSharingKundmachung } from './sources'
import { textSources } from './texts/stations'

/** Every pair a Land's page can ask for; which a draft has, `comparisonsOf` says. */
export const LAND_TEXT_PAIRS: readonly (readonly [LandTextStation, LandTextStation])[] = [
  ['geltend', 'entwurf'],
  ['entwurf', 'rv'],
  ['rv', 'ausschuss'],
  ['rv', 'lgbl'],
  ['entwurf', 'lgbl'],
]

const NOTHING_PAIRS = 'Die beiden Texte haben keinen einzigen Teil gemeinsam — der Monitor zeigt hier keinen Vergleich, statt alles als neu zu melden.'

const emptyStats = { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 }

function unavailable(from: LandTextStation, to: LandTextStation, reason: string, rest: Partial<LandLawDiffResponse> = {}): LandLawDiffResponse {
  return {
    from, to, available: false, unavailableReason: reason, units: [], stats: emptyStats,
    fromDocument: null, toDocument: null, addedLaws: [], droppedLaws: [], sharedWith: [], withheld: [], ...rest,
  }
}

export async function compareLandTexts(
  land: LandCode,
  detail: LandDraftDetail,
  from: LandTextStation,
  to: LandTextStation,
): Promise<LandLawDiffResponse> {
  if (!detail.comparisons.some(([a, b]) => a === from && b === to)) {
    return unavailable(from, to, 'Für diesen Entwurf gibt es diese beiden Texte nicht.')
  }
  if (from === 'geltend') return compareTgu(land, detail)
  const sources = textSources(land, detail)
  const a = sources[from]
  const b = sources[to]
  if (!a || !b) return unavailable(from, to, 'Das Land hat einen der beiden Texte nicht veröffentlicht.')
  const docs = { fromDocument: a.document, toDocument: b.document }
  const [x, y] = (await Promise.all([a.read(), b.read()])).map((r) => r.units)
  if (!x?.length || !y?.length) {
    const missing = !x?.length ? a.document.label : b.document.label
    return unavailable(from, to, `In „${missing}“ fand der Monitor keinen Gesetzestext, den er Paragraph für Paragraph lesen kann.`, docs)
  }
  const units = diffLandDraft(x, y)
  const { added, dropped } = packageChanges(x, y)
  const s = summarizeDiff(units)
  if (!s.unchanged && !s.changed) return unavailable(from, to, NOTHING_PAIRS, docs)
  const stage = detail.draft.stage
  const shared = to === 'lgbl' && stage && stage !== 'unknown' && stage.detail
    ? await draftsSharingKundmachung(land, stage.detail, detail.draft.id).catch(() => [])
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
    withheld: [],
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
