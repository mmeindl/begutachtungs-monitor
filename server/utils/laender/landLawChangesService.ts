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
import type { LandCode, LandLawDiffResponse } from '#shared/types'
import { DERIVED_CACHE } from '../cache/base'
import { onlyComplete, type Gathered } from '../cache/gathered'
import { summarizeDiff } from '../diff/lawDiff'
import type { LawUnit } from '../lawtext/lawUnits'
import { mapWithConcurrency } from '../pool'
import { upstreamText } from '../upstream/fetch'
import { konsParagraphHistory, konsRefsOfLgbl, lgblNummer } from './landKonsLaws'
import { diffLandDraft, lgblUnits } from './landLawDiff'
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
const WEEK_S = 60 * 60 * 24 * 7

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
  if (!nummer || !lgblXmlUrl) return off('Den Text dieses Landesgesetzblatts konnte der Monitor nicht lesen.')
  const [{ refs, complete: searchComplete }, lgblXml] = await Promise.all([konsRefsOfLgbl(land, nummer), upstreamText(lgblXmlUrl, TEXT_POLICY)])
  const versions = refs.map(konsVersionOf).filter((v): v is LandKonsVersion => v !== null)
  const news = versions.filter((v) => namesAsLast(v.organ, nummer))
  const repeals = versions.filter((v) => repealedBy(v.organ, nummer))
  if (!news.length && !repeals.length) {
    return { ...off('Eine konsolidierte Fassung, die dieses Landesgesetzblatt nennt, verzeichnet das RIS nicht.'), complete: searchComplete }
  }

  // One version per § and law that is this Landesgesetzblatt's; several (a staged Inkrafttreten) is not one wording.
  const byKey = new Map<string, LandKonsVersion[]>()
  for (const v of [...news, ...repeals]) byKey.set(`${v.gesetzesnummer}|${v.key}`, [...(byKey.get(`${v.gesetzesnummer}|${v.key}`) ?? []), v])
  if (byKey.size > MAX_PARAGRAPHS) return off(`Dieses Landesgesetzblatt ändert mehr als ${MAX_PARAGRAPHS} Paragraphen; den Vergleich zeigt der Monitor dafür nicht.`)

  const laws = [...new Set(versions.map((v) => v.law))]
  const instructions = lgblInstructedParagraphs(lgblUnits(lgblXml))
  const instructionLaws = [...instructions.keys()]
  const withheld: LandLawDiffResponse['withheld'] = []
  let complete = searchComplete
  const oldUnits: LawUnit[] = []
  const newUnits: LawUnit[] = []

  const entries = [...byKey.values()]
  await mapWithConcurrency(entries, CONCURRENCY, async (vs) => {
    const v = vs[0]!
    const createdHere = v.stammnorm === nummer
    // A law this Landesgesetzblatt enacts: no instructions, no earlier wording — its §§ stand as new.
    if (createdHere) {
      if (vs.length !== 1 || shiftedRecord(v, promulgated)) return void withheld.push({ law: v.law, id: v.key, reason: 'unpaired' })
      const unit = await unitOf(v).catch(() => {
        complete = false
        return undefined
      })
      if (unit === undefined) return void withheld.push({ law: v.law, id: v.key, reason: 'unchecked' })
      if (unit) newUnits.push(unit)
      return
    }
    const lawKey = instructionLawFor(v.law, instructionLaws, laws.length)
    const named = lawKey === undefined ? null : isNamed(instructions.get(lawKey), v.key)
    if (named === null) return void withheld.push({ law: v.law, id: v.key, reason: 'unpaired' })
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
      if ((pair.kind === 'pair' && !oldUnit) || (!repeal && !newUnit)) return void withheld.push({ law: v.law, id: v.key, reason: 'unpaired' })
      if (oldUnit) oldUnits.push(oldUnit)
      if (newUnit) newUnits.push(newUnit)
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

  const byOrder = (a: LawUnit, b: LawUnit) => (a.article ?? '').localeCompare(b.article ?? '', 'de') || a.id.localeCompare(b.id, 'de', { numeric: true })
  oldUnits.sort(byOrder)
  newUnits.sort(byOrder)
  if (!oldUnits.length && !newUnits.length) {
    return { value: { ...off('Keinen Paragraphen dieses Landesgesetzblatts konnte der Monitor sicher vergleichen.').value, withheld }, complete }
  }
  const units = diffLandDraft(oldUnits, newUnits)
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
  { name: 'land-law-changes-4', base: DERIVED_CACHE, getKey: (land: LandCode, nr: string) => `${land}-${nr.replace(/\D+/g, '-')}`, maxAge: WEEK_S, swr: false, validate: onlyComplete },
)
