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
 *
 * WHAT FAILED IS NOT KEPT (25.10.2026, `gathered.ts`): an answer resting on
 * a read that failed — a RIS read of the Textgegenüberstellung's check, the
 * Land's record of drafts sharing the Kundmachung — goes out, and is not
 * held for the day.
 */
import type { LandCode, LandDraftDetail, LandLawDiffResponse, LandTextStation } from '#shared/types'
import { landDraftPath } from '#shared/utils/laender'
import { DERIVED_CACHE } from '../cache/base'
import { onlyComplete, type Gathered } from '../cache/gathered'
import { summarizeDiff } from '../diff/lawDiff'
import { diffLandDraft, packageChanges } from './landLawDiff'
import { compareTgu } from './landTguService'
import { draftsSharingKundmachung } from './sources'
import { NOT_A_DRAFT } from './texts/read'
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

const whole = (value: LandLawDiffResponse): Gathered<LandLawDiffResponse> => ({ value, complete: true })

export async function compareLandTexts(
  land: LandCode,
  detail: LandDraftDetail,
  from: LandTextStation,
  to: LandTextStation,
): Promise<Gathered<LandLawDiffResponse>> {
  if (!detail.comparisons.some(([a, b]) => a === from && b === to)) {
    return whole(unavailable(from, to, 'Für diesen Entwurf gibt es diese beiden Texte nicht.'))
  }
  if (from === 'geltend') return compareTgu(land, detail)
  const sources = textSources(land, detail)
  const a = sources[from]
  const b = sources[to]
  if (!a || !b) return whole(unavailable(from, to, 'Das Land hat einen der beiden Texte nicht veröffentlicht.'))
  const docs = { fromDocument: a.document, toDocument: b.document }
  const read = await Promise.all([a.read(), b.read()])
  // What the Land filed as the draft and evidently is none is not read as it (`notADraft`).
  if (read.some((r) => r.notDraft)) return whole(unavailable(from, to, NOT_A_DRAFT, docs))
  const [x, y] = read.map((r) => r.units)
  if (!x?.length || !y?.length) {
    const missing = !x?.length ? a.document.label : b.document.label
    return whole(unavailable(from, to, `In „${missing}“ fand der Monitor keinen Gesetzestext, den er Paragraph für Paragraph lesen kann.`, docs))
  }
  const units = diffLandDraft(x, y)
  const { added, dropped } = packageChanges(x, y)
  const s = summarizeDiff(units)
  if (!s.unchanged && !s.changed) return whole(unavailable(from, to, NOTHING_PAIRS, docs))
  const stage = detail.draft.stage
  // The other drafts in the same Kundmachung are a warning above the list:
  // where the Land's record could not be read, the answer goes out without
  // it and is not kept — else the warning is gone for a day.
  let complete = true
  const shared = to === 'lgbl' && stage && stage !== 'unknown' && stage.detail
    ? await draftsSharingKundmachung(land, stage.detail, detail.draft.id).catch(() => {
        complete = false
        return []
      })
    : []
  return {
    value: {
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
    },
    complete,
  }
}

/**
 * Held a day, in the derived layer: the documents do not change, but the
 * reader does, and a stale comparison must not outlive a fix to it. Only a
 * complete answer is held (`onlyComplete`).
 */
const readLandComparison = defineCachedFunction(
  (land: LandCode, number: string, from: LandTextStation, to: LandTextStation, detail: LandDraftDetail): Promise<Gathered<LandLawDiffResponse>> =>
    compareLandTexts(land, detail, from, to),
  {
    name: 'land-law-diff',
    base: DERIVED_CACHE,
    getKey: (land: LandCode, number: string, from: LandTextStation, to: LandTextStation) => `${land}-${number}-${from}-${to}`,
    maxAge: 60 * 60 * 24,
    swr: false,
    // An answer with a § unchecked for want of RIS, or without the drafts
    // sharing its Kundmachung, goes out once and is not kept. An entry of
    // the shape before 25.10.2026 has no `complete` and is read again.
    validate: onlyComplete,
  },
)

/** The comparison of one pair, for every caller: the route and the Begründungsvergleich. */
export async function cachedLandComparison(land: LandCode, number: string, from: LandTextStation, to: LandTextStation, detail: LandDraftDetail): Promise<LandLawDiffResponse> {
  return (await readLandComparison(land, number, from, to, detail)).value
}
