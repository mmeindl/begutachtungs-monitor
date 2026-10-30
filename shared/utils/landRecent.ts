/**
 * The Länder in the homepage's two track sections — „Beschlossen, noch
 * nicht kundgemacht" and „Zuletzt Gesetz geworden" (30.10.2026): which of a
 * Land's drafts each may show, and how they sort in among the Bund's rows.
 *
 * PURE MODULE, like `enactedOrder.ts` and `decidedOrder.ts`: each section
 * claims something about every row it shows, and a claim belongs where it
 * can be tested.
 */
import type { LandCode, LandConsultation, LandStage } from '../types'
import { HOME_LIST_LENGTH } from './draftOrder'
import { spanInDays } from './format'
import { PROMULGATION_WINDOW_DAYS } from './promulgation'

const stageOf = (d: LandConsultation): LandStage | null =>
  d.stage && d.stage !== 'unknown' ? d.stage : null

/**
 * A Land's law in its Landesgesetzblatt, as far as the homepage may say so.
 *
 * Gesetze only: the heading says „Gesetz geworden", and the Bund's half
 * holds no Verordnung either.
 *
 * THE BAR IS THE LISTS' BAR, minus one case. The Land's own record, a find
 * decided by text (`certainBy`), and the search's single candidate stand as
 * „Gesetz geworden" on every list; the single candidate held 57 of 57 times
 * over Oberösterreich's oracle (§12.44). Left out: a find among several
 * candidates that no text has decided — the lists show it, the front door
 * does not pick among guesses. Holding the front door to certain finds only
 * would drop Burgenland outright, where no text decides yet, and Salzburg
 * whenever its verdict map is cold (measured 30.10.2026).
 */
export function isEnactedLandLaw(d: LandConsultation): boolean {
  const s = stageOf(d)
  if (d.active || d.kind !== 'gesetz' || s?.station !== 'bgbl') return false
  return s.via !== 'suche' || s.certainBy !== undefined || s.unique === true
}

/**
 * Decided by the Landtag, not yet in the Landesgesetzblatt — only where the
 * LAND records both stations. Kärnten's stations are our join of its lists
 * (`joined`): there the Kundmachung may stand in RIS under a title the
 * search missed, so „noch nicht kundgemacht" is not ours to say
 * (`landStatusDe`). And a Beschluss older than `PROMULGATION_WINDOW_DAYS` is
 * no longer a law on its way — the Bund's measure, as the guard against a
 * Kundmachung that is not coming; no Land has given a reason for another.
 */
export function isDecidedLandLaw(d: LandConsultation, today: string): boolean {
  const s = stageOf(d)
  if (d.active || d.kind !== 'gesetz' || s?.station !== 'parlament' || s.joined || s.via === 'suche' || !s.date) return false
  const age = spanInDays(s.date, today)
  return age !== null && age >= 0 && age <= PROMULGATION_WINDOW_DAYS
}

/** The date the station was reached — the Kundmachung's or the Beschluss's. */
export function landStationDate(d: LandConsultation): string | null {
  return stageOf(d)?.date ?? null
}

/** „LGBl. Nr. 45/2026" → 2026045, for ties within one Landesgesetzblatt. */
function lgblOrder(d: LandConsultation): number {
  const m = /(\d+)\s*\/\s*(\d{4})/.exec(stageOf(d)?.detail ?? '')
  return m ? Number(m[2]) * 10_000 + Number(m[1]) : 0
}

/** Newest station first; within a day, the higher number of one Landesgesetzblatt. */
function compareNewest(a: LandConsultation, b: LandConsultation): number {
  return (landStationDate(b) ?? '').localeCompare(landStationDate(a) ?? '') || lgblOrder(b) - lgblOrder(a)
}

/**
 * At most `HOME_LIST_LENGTH` per Land, newest station first over all of
 * them — so the page, which applies the reader's choice by filtering, can
 * fill its five rows from any choice of Länder and keeps the order. A draft
 * without a date cannot be placed and stays out.
 */
export function newestPerLand(items: readonly LandConsultation[]): LandConsultation[] {
  const byLand = new Map<LandCode, LandConsultation[]>()
  for (const d of items) {
    if (!landStationDate(d)) continue
    byLand.set(d.land, [...(byLand.get(d.land) ?? []), d])
  }
  return [...byLand.values()]
    .flatMap((drafts) => drafts.sort(compareNewest).slice(0, HOME_LIST_LENGTH))
    .sort(compareNewest)
}

export type Merged<A, B> = { from: 'a'; item: A } | { from: 'b'; item: B }

/**
 * Two lists, each already newest first, merged newest first — WITHOUT
 * reordering either. The Bundesgesetzblatt orders its own rows by number
 * (`pickEnacted`), and no date may overrule that; between the Bund and a
 * Land, and between Länder, there is no common number, so the date of the
 * station decides there. Ties go to `a`.
 *
 * A row without a date (the Bund's issue date is looked up under a budget
 * and may be missing this once) is no newer than the row before it in its
 * own list, so it takes that row's date; a first row without one goes first.
 */
export function mergeNewestFirst<A, B>(
  a: readonly A[],
  dateA: (x: A) => string | null | undefined,
  b: readonly B[],
  dateB: (x: B) => string | null | undefined,
): Merged<A, B>[] {
  const out: Merged<A, B>[] = []
  let i = 0
  let j = 0
  let lastA = '9999-12-31'
  let lastB = '9999-12-31'
  while (i < a.length || j < b.length) {
    const da = i < a.length ? (dateA(a[i]!) ?? lastA) : null
    const db = j < b.length ? (dateB(b[j]!) ?? lastB) : null
    if (da !== null && (db === null || da >= db)) {
      out.push({ from: 'a', item: a[i++]! })
      lastA = da
    } else {
      out.push({ from: 'b', item: b[j++]! })
      lastB = db!
    }
  }
  return out
}
