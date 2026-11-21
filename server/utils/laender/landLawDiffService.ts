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
 *
 * THE KUNDMACHUNG MUST BE CERTAIN — named by the Land, or decided by text
 * (`texts/kundmachung.ts`). `textSources` offers no other. Held
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
import { gapDe } from '#shared/utils/gaps'
import type { LandCode, LandDraftDetail, LandLawDiffResponse, LandTextDocument, LandTextStation, LawDiffUnit } from '#shared/types'
import { landDraftPath } from '#shared/utils/laender'
import { DERIVED_CACHE } from '../cache/base'
import { storageKeyOf } from '../cache/key'
import { onlyComplete, type Gathered } from '../cache/gathered'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { summarizeDiff } from '../diff/lawDiff'
import type { LawUnit } from '../lawtext/lawUnits'
import { announcedKey, announcedReading, announcedVerdict } from './announcedText'
import { comparedText, diffLandDraft, packageChanges } from './landLawDiff'
import { compareTgu } from './landTguService'
import { draftsSharingKundmachung } from './sources'
import { NOT_A_DRAFT, textlessPages, type ReadText } from './texts/read'
import { cachedPdfPages } from './texts/pdfPagesService'
import { textSources } from './texts/stations'

/** Every pair a Land's page can ask for; which a draft has, `comparisonsOf` says. */
export const LAND_TEXT_PAIRS: readonly (readonly [LandTextStation, LandTextStation])[] = [
  ['geltend', 'entwurf'],
  ['entwurf', 'rv'],
  ['rv', 'ausschuss'],
  ['rv', 'lgbl'],
  ['antrag', 'lgbl'],
  // A Landesgesetz's page: the wording before it against the wording it brought (`landLawChangesService.ts`).
  ['vorher', 'nachher'],
  ['entwurf', 'lgbl'],
]

const NOTHING_PAIRS = gapDe('unreadable', 'Die beiden Texte haben keinen Teil gemeinsam; statt alles als neu zu melden, zeigt der Monitor keinen Vergleich.')

const emptyStats = { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 }

function unavailable(from: LandTextStation, to: LandTextStation, reason: string, rest: Partial<LandLawDiffResponse> = {}): LandLawDiffResponse {
  return {
    from, to, available: false, unavailableReason: reason, units: [], stats: emptyStats,
    fromDocument: null, toDocument: null, addedLaws: [], droppedLaws: [], sharedWith: [], withheld: [], ...rest,
  }
}

const SHARED_UNKNOWN = gapDe('unavailable', 'ob dieselbe Kundmachung auch andere Entwürfe des Landes umsetzt. Was hier als neu erscheint, kann aus einem solchen Entwurf stammen.')

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
  // The PDFs through the cached read: the Erläuterungen and the
  // Begründungsvergleich read the same documents (`pdfPagesService.ts`).
  if (from === 'geltend') return compareTgu(land, detail, cachedPdfPages)
  const sources = textSources(land, detail, cachedPdfPages)
  const a = sources[from]
  const b = sources[to]
  if (!a || !b) return whole(unavailable(from, to, gapDe('unreadable', 'Einen der beiden Texte fand der Monitor unter den Dokumenten des Landes nicht.')))
  const read = await Promise.all([a.read(), b.read()])
  const compared = compareReadTexts(from, to, read, [a.document, b.document])
  if (!compared.available) return whole(compared)
  const stage = detail.draft.stage
  // The other drafts in the same Kundmachung are a warning above the list:
  // where the Land's record could not be read, the answer says so in the
  // warning's place and is not kept — else the warning is gone for a day.
  // Until 21.11.2026 it went out with nothing in that place.
  let complete = true
  const shared = to === 'lgbl' && stage && stage !== 'unknown' && stage.detail
    ? await draftsSharingKundmachung(land, stage.detail, detail.draft.id).catch(() => {
        complete = false
        return []
      })
    : []
  const sharedWith = shared.map((d) => ({ title: d.title, path: landDraftPath(d.land, d.id), deadline: d.deadline, startedAt: d.startedAt }))
  return {
    value: complete ? { ...compared, sharedWith } : { ...compared, sharedWith, sharedUnknown: SHARED_UNKNOWN },
    complete,
  }
}

/**
 * Two texts of a draft as read, compared — the step every station pair
 * shares, apart from the reads and the drafts sharing a Kundmachung.
 * Exported for the Länder station harness (`scripts/harness/landStations.ts`),
 * so what it measures is this decision and not a copy of it.
 */
export function compareReadTexts(from: LandTextStation, to: LandTextStation, read: readonly [ReadText, ReadText], named: readonly [LandTextDocument, LandTextDocument]): LandLawDiffResponse {
  // The document read, where the draft's content chose another than its title (`draftByContent`).
  const docs = { fromDocument: read[0].document ?? named[0], toDocument: read[1].document ?? named[1] }
  // What the Land filed as the draft and evidently is none is not read as it (`notADraft`).
  if (read.some((r) => r.notDraft)) return unavailable(from, to, NOT_A_DRAFT, docs)
  const [x, y] = read.map((r) => r.units)
  if (!x?.length || !y?.length) {
    const missing = !x?.length ? docs.fromDocument.label : docs.toDocument.label
    return unavailable(from, to, gapDe('unreadable', `In „${missing}“ fand der Monitor keinen Gesetzestext, den er Paragraph für Paragraph lesen kann.`), docs)
  }
  const all = diffLandDraft(x, y)
  const { added, dropped } = packageChanges(x, y)
  const overall = summarizeDiff(all)
  if (!overall.unchanged && !overall.changed) return unavailable(from, to, NOTHING_PAIRS, docs)
  const { units, withheld, unread } = settleAnnounced(all, x, y)
  const s = summarizeDiff(units)
  // Pages inside either PDF without text: what stood on them reads as removed or new (`textlessPages`).
  const droppedPages = textlessPages(read[0].pages) + textlessPages(read[1].pages)
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
    sharedWith: [],
    withheld,
    ...(unread.length ? { unreadAnnounced: unread } : {}),
    ...(droppedPages ? { droppedPages } : {}),
  }
}

/**
 * The instructions whose announced text a reader did not find in its place
 * (`announcedText.ts`, 19.11.2026): withheld where the two sides read it
 * differently — the diff would show as new or gone what both documents
 * carry (Salzburg 33884's Abschussplan rows, Oberösterreich 16103's
 * table-of-contents entry) —, named as unread where both lack it alike.
 */
function settleAnnounced(all: LawDiffUnit[], x: readonly LawUnit[], y: readonly LawUnit[]): {
  units: LawDiffUnit[]
  withheld: LandLawDiffResponse['withheld']
  unread: NonNullable<LandLawDiffResponse['unreadAnnounced']>
} {
  const before = announcedReading(x, comparedText)
  const after = announcedReading(y, comparedText)
  const units: LawDiffUnit[] = []
  const withheld: LandLawDiffResponse['withheld'] = []
  const unread: NonNullable<LandLawDiffResponse['unreadAnnounced']> = []
  for (const u of all) {
    const from = u.fromId === null || u.fromText === null ? undefined : before.get(announcedKey(u.fromId, u.fromText))
    const to = u.change === 'removed' || u.toText === null ? undefined : after.get(announcedKey(u.id, u.toText))
    const verdict = announcedVerdict(u.change, from, to)
    if (verdict === 'withhold') {
      withheld.push({ law: u.article, id: u.id, ...(u.fromId && u.fromId !== u.id ? { fromId: u.fromId } : {}), reason: 'announced' })
      continue
    }
    if (verdict === 'unread') unread.push({ law: u.article, id: u.id })
    units.push(u)
  }
  return { units, withheld, unread }
}

/**
 * Held a day, in the derived layer: the documents do not change, but the
 * reader does, and a stale comparison must not outlive a fix to it. Only a
 * complete answer is held (`onlyComplete`).
 *
 * Keyed by the pair AND what names its two documents (21.11.2026): the
 * Kundmachung (`stage.detail`) and the addresses the texts are read from.
 * Keyed by land, number and pair alone, a Vorlage whose PDF the Land
 * replaced, or a Kundmachung decided anew, was answered for a day from the
 * comparison of the old one. Encoded (`cache/key.ts`): URLs and free text.
 */
const readLandComparison = defineCachedFunction(
  (land: LandCode, number: string, from: LandTextStation, to: LandTextStation, detail: LandDraftDetail): Promise<Gathered<LandLawDiffResponse>> =>
    compareLandTexts(land, detail, from, to),
  {
    name: 'land-law-diff',
    base: DERIVED_CACHE,
    getKey: (land: LandCode, number: string, from: LandTextStation, to: LandTextStation, detail: LandDraftDetail) => {
      const sources = textSources(land, detail)
      const stage = detail.draft.stage
      const kundmachung = stage && stage !== 'unknown' ? stage.detail ?? '' : ''
      return storageKeyOf(`${land}-${number}-${from}-${to}|${kundmachung}|${sources[from]?.document.url ?? ''}|${sources[to]?.document.url ?? ''}`)
    },
    maxAge: DERIVED_ANALYSIS_TTL_S,
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
