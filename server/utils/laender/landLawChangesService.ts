/**
 * What a Landesgesetz changed, § by § — the comparison of a law's page
 * („Was das Gesetz geändert hat", 12.11.2026), assembled from RIS one § at
 * a time (`landLawChanges.ts` holds the rules).
 *
 * MEMORY: no law is loaded whole. The consolidated records that name the
 * Landesgesetzblatt come from one filtered search; each § then from its own
 * history query (`Abschnitt` = that §) and its two XML documents, three at a
 * time. Past `MAX_PARAGRAPHS` the section is off for that law, said in a
 * sentence — a Sammelnovelle of hundreds of §§ is the Landesgesetzblatt's to
 * read. The answer, a few kB per §, is held a week; one that rests on a
 * failed read is not held (`onlyComplete`).
 */
import { gapDe } from '#shared/utils/gaps'
import type { LandCode, LandLawDiffResponse } from '#shared/types'
import { DERIVED_CACHE } from '../cache/base'
import { onlyComplete, type Gathered } from '../cache/gathered'
import { SETTLED_TTL_S } from '../cache/ttl'
import { diffKnownPairs, summarizeDiff } from '../diff/lawDiff'
import type { LawUnit } from '../lawtext/lawUnits'
import { mapWithConcurrency } from '../pool'
import { upstreamText } from '../upstream/fetch'
import { konsParagraphHistory, konsRefsOfLgbl, lgblNummer } from './landKonsLaws'
import { comparedText, lgblUnits } from './landLawDiff'
import {
  instructionLawFor,
  lgblInstructedParagraphs,
  isNamed,
  konsUnit,
  konsVersionOf,
  namesAsLast,
  pairOf,
  repealedBy,
  shiftedRecord,
  type LandKonsVersion,
} from './landLawChanges'
import { TEXT_POLICY } from './texts/read'

const MAX_PARAGRAPHS = 150
const CONCURRENCY = 3

const empty = { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 }

function off(reason: string): Gathered<LandLawDiffResponse> {
  return {
    value: { from: 'vorher', to: 'nachher', available: false, unavailableReason: reason, units: [], stats: empty, fromDocument: null, toDocument: null, addedLaws: [], droppedLaws: [], sharedWith: [], withheld: [] },
    complete: true,
  }
}

/** The § text of one version, from its XML; null where it could not be read or holds none. */
async function unitOf(v: LandKonsVersion): Promise<LawUnit | null> {
  if (!v.xmlUrl) return null
  return konsUnit(await upstreamText(v.xmlUrl, TEXT_POLICY), v, v.law)
}

/**
 * The comparison for one Landesgesetzblatt. `nr` „LGBl. Nr. 31/2026",
 * `lgblXmlUrl` its own XML (for the instructions), `url` its ELI address
 * (for the credit and „Zitieren"), `promulgated` its Kundmachungsdatum
 * (`pairOf`).
 */
export async function compareLandLawChanges(land: LandCode, nr: string, lgblXmlUrl: string | null, url: string | null, promulgated: string | null): Promise<Gathered<LandLawDiffResponse>> {
  const nummer = lgblNummer(nr)
  if (!nummer || !lgblXmlUrl) return off(gapDe('unreadable', 'der Text dieses Landesgesetzblatts.'))
  const [{ refs, complete: searchComplete }, lgblXml] = await Promise.all([konsRefsOfLgbl(land, nummer), upstreamText(lgblXmlUrl, TEXT_POLICY)])
  const versions = refs.map(konsVersionOf).filter((v): v is LandKonsVersion => v !== null)
  const news = versions.filter((v) => namesAsLast(v.organ, nummer))
  const repeals = versions.filter((v) => repealedBy(v.organ, nummer))
  if (!news.length && !repeals.length) {
    return { ...off(gapDe('notPublished', 'Eine konsolidierte Fassung, die dieses Landesgesetzblatt nennt, verzeichnet das RIS nicht.')), complete: searchComplete }
  }

  // One version per § and law that is this Landesgesetzblatt's; several (a staged Inkrafttreten) is not one wording.
  const byKey = new Map<string, LandKonsVersion[]>()
  for (const v of [...news, ...repeals]) byKey.set(`${v.gesetzesnummer}|${v.key}`, [...(byKey.get(`${v.gesetzesnummer}|${v.key}`) ?? []), v])
  if (byKey.size > MAX_PARAGRAPHS) return off(gapDe('outOfScope', `ein Vergleich für ein Landesgesetzblatt, das mehr als ${MAX_PARAGRAPHS} Paragraphen ändert.`))

  const laws = [...new Set(versions.map((v) => v.law))]
  const instructions = lgblInstructedParagraphs(lgblUnits(lgblXml))
  const instructionLaws = [...instructions.keys()]
  const withheld: LandLawDiffResponse['withheld'] = []
  let complete = searchComplete
  // Each § as RIS pairs its two versions: the earlier wording (none for a new §) and the later one (none for a repeal).
  const pairs: [LawUnit | null, LawUnit | null][] = []

  const entries = [...byKey.values()]
  await mapWithConcurrency(entries, CONCURRENCY, async (vs) => {
    const v = vs[0]!
    const createdHere = v.stammnorm === nummer
    // A law this Landesgesetzblatt enacts: no instructions, no earlier wording — its §§ stand as new.
    // One it cannot read in a single certain version is named so (`enactedUnread`, 19.11.2026): until
    // then it was named „unpaired" — „eine Anweisung nennt ihn; seine Fassung davor …", false of a § no
    // instruction names and that had none before — and one whose XML held no text was dropped uncounted.
    if (createdHere) {
      if (vs.length !== 1 || shiftedRecord(v, promulgated)) return void withheld.push({ law: v.law, id: v.key, reason: 'enactedUnread' })
      const unit = await unitOf(v).catch(() => {
        complete = false
        return undefined
      })
      if (unit === undefined) return void withheld.push({ law: v.law, id: v.key, reason: 'unchecked' })
      if (!unit) return void withheld.push({ law: v.law, id: v.key, reason: 'enactedUnread' })
      pairs.push([null, unit])
      return
    }
    const lawKey = instructionLawFor(v.law, instructionLaws, laws.length)
    // No instruction's law matched to this one (or none read at all): whether an instruction names the § is
    // not known. Named „unpaired" until 20.11.2026, whose sentence says an instruction names it.
    if (lawKey === undefined) return void withheld.push({ law: v.law, id: v.key, reason: 'lawUnmatched' })
    const named = isNamed(instructions.get(lawKey), v.key)
    if (!named) return void withheld.push({ law: v.law, id: v.key, reason: 'uninstructed' })
    if (vs.length !== 1) return void withheld.push({ law: v.law, id: v.key, reason: 'unpaired' })
    try {
      const history = (await konsParagraphHistory(land, v.gesetzesnummer, v.key)).map(konsVersionOf).filter((h): h is LandKonsVersion => h !== null)
      const pair = pairOf(v, history, promulgated)
      if (pair.kind === 'unpaired') return void withheld.push({ law: v.law, id: v.key, reason: 'unpaired' })
      const repeal = repealedBy(v.organ, nummer)
      const [oldUnit, newUnit] = await Promise.all([
        pair.kind === 'pair' ? unitOf(pair.old) : Promise.resolve(null),
        repeal ? Promise.resolve(null) : unitOf(v),
      ])
      // Neither side read: a repeal (no new wording) of a § whose history holds no earlier one (`new`)
      // pushed nothing and was dropped uncounted until 20.11.2026.
      if ((pair.kind === 'pair' && !oldUnit) || (!repeal && !newUnit) || (!oldUnit && !newUnit)) return void withheld.push({ law: v.law, id: v.key, reason: 'unpaired' })
      pairs.push([oldUnit, newUnit])
    } catch {
      complete = false
      withheld.push({ law: v.law, id: v.key, reason: 'unchecked' })
    }
  })

  // Instructions that name a § RIS ties to no version of this Landesgesetzblatt: counted, never dropped.
  for (const [lawKey, keys] of instructions) {
    const law = laws.find((l) => instructionLawFor(l, instructionLaws, laws.length) === lawKey) ?? (lawKey ?? laws[0] ?? null)
    for (const key of keys) {
      // A range names what RIS has in it; nothing to count of its own.
      if (/-/.test(key)) continue
      if (![...byKey.values()].some((vs) => vs[0]!.key === key && (law === null || vs[0]!.law === law))) withheld.push({ law, id: key, reason: 'unpaired' })
    }
  }

  const unitOfPair = ([a, b]: [LawUnit | null, LawUnit | null]) => (b ?? a)!
  const byOrder = (x: [LawUnit | null, LawUnit | null], y: [LawUnit | null, LawUnit | null]) => (unitOfPair(x).article ?? '').localeCompare(unitOfPair(y).article ?? '', 'de') || unitOfPair(x).id.localeCompare(unitOfPair(y).id, 'de', { numeric: true })
  pairs.sort(byOrder)
  if (!pairs.length) {
    return { value: { ...off(gapDe('unreadable', 'Keinen Paragraphen dieses Landesgesetzblatts konnte der Monitor sicher vergleichen.')).value, withheld }, complete }
  }
  // Compared pair by pair, as RIS pairs them (20.11.2026): the § comparison's own alignment re-paired the
  // two versions of one § by heading and likeness, and 46 of 1,937 §§ stood twice, „neu" beside „entfallen".
  // The texts cleaned as every Land comparison cleans them (`comparedText`).
  const clean = (u: LawUnit | null): LawUnit | null => u && { ...u, text: comparedText(u.text), blocks: u.blocks.map((b) => ({ ...b, text: comparedText(b.text) })) }
  const units = diffKnownPairs(pairs.map(([a, b]) => [clean(a), clean(b)] as const))
  const s = summarizeDiff(units)
  const single = laws.length === 1 ? laws[0]! : null
  return {
    value: {
      from: 'vorher',
      to: 'nachher',
      available: true,
      unavailableReason: null,
      units,
      stats: { total: s.total, unchanged: s.unchanged, changed: s.changed, editorial: s.editorial, inserted: s.inserted, removed: s.removed },
      fromDocument: { label: 'Fassung davor', url: null, publisher: 'RIS (CC BY 4.0)' },
      // „Salzburger … idF LGBl. Nr. 31/2026": what „Zitieren" cites a § by, where the Landesgesetzblatt changes one law.
      toDocument: { label: single ? `${single} idF ${nr}` : nr, url, publisher: 'RIS (CC BY 4.0)' },
      addedLaws: [],
      droppedLaws: [],
      sharedWith: [],
      withheld,
    },
    complete,
  }
}

/** Held a week in the derived layer; an answer resting on a failed read is not held. */
export const readLandLawChanges = defineCachedFunction(
  (land: LandCode, nr: string, lgblXmlUrl: string | null, url: string | null, promulgated: string | null) => compareLandLawChanges(land, nr, lgblXmlUrl, url, promulgated),
  { name: 'land-law-changes-9', base: DERIVED_CACHE, getKey: (land: LandCode, nr: string) => `${land}-${nr.replace(/\D+/g, '-')}`, maxAge: SETTLED_TTL_S, swr: false, validate: onlyComplete },
)
