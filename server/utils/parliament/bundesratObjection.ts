/**
 * The Bundesrat's Einspruch against a law's Beschluss (Art. 42 B-VG) — read
 * where the law's record is read: the draft page and the page of a Vorlage
 * or Antrag (`enactmentOfItem`), the station map behind the lists
 * (`stationMap.ts`), the outcome behind „Geltende Fassung"
 * (`getDraftOutcome`) and the comparison against the Bundesgesetzblatt
 * (`lawDiffService.ts`). 14.11.2026.
 *
 * WHY IT IS READ AT ALL. Until then an Einspruch was invisible: the law's
 * Verlauf ends in „Beschluss im Bundesrat" — the Bundesrat's decision to
 * object — and Parliament links the Kundmachung on the Einspruch's own item,
 * not on the law. So 84/A XXVII, law since BGBl. I Nr. 11/2020 by a
 * Beharrungsbeschluss, read as „Beschlossen – nicht kundgemacht", and the
 * list of laws without a Begutachtung, which reads RIS, contradicted the
 * page it links to.
 *
 * TWO WITNESSES, ONE CLAIM. The law's own Verlauf carries the stage
 * „Antrag, Einspruch zu erheben, angenommen <EBR>" (`findBundesratObjection`),
 * with the day and the EBR's number. The period's list of EBR items (list
 * 101, document type EBR: 8 in GP XXVII, 1 in XXV, none in XXIV, XXVI and
 * XXVIII; 14.11.2026) names, through each EBR's „Bezug zu", the law it
 * objects to (`getEbrIndexForGp`). The stage is read first; the list supplies
 * the EBR where the stage links none and stands alone, without a day, where
 * the reader missed the stage. What followed is read off the EBR's own record
 * (`readObjectionOutcome`).
 *
 * Enrichment like everything after the Vorlage: a list past its budget adds
 * nothing, an EBR whose record does not answer leaves the outcome `unknown`
 * and says so on the page.
 */
import type { BundesratObjection, ProcedureRoot } from '#shared/types'
import { parliamentItemUrl } from '#shared/utils/procedureRoot'
import {
  EBR_DOKTYP,
  extractBgblLink,
  findBundesratDecisionDate,
  findBundesratObjection,
  lawOfEbr,
  readObjectionOutcome,
  type EbrContent,
  type ObjectionAnchor,
  type RawPhase,
} from './detailJson'
import { getGegenstand } from './drafts'
import { assertListHeader, assertRowsMatchGp, fetchFilterList } from '../upstream/parliament'
import { mapWithConcurrency } from '../pool'
import { answerWithinBudget } from '../http/budget'
import { DERIVED_CACHE } from '../cache/base'
import { keepIncompleteFor, type Gathered } from '../cache/gathered'
import { staleWithin } from '../cache/stale'
import { DAY_STALE_S } from '../cache/ttl'

/** The station map's lifetime (`stationMap.ts`, `STATION_MAP_TTL_S`): an
 *  Einspruch moves on the same scale of days as a station. */
const EBR_INDEX_TTL_S = 60 * 60 * 6
/** Ten minutes for a list in which an EBR's record could not be read, as
 *  for the station map. */
const INCOMPLETE_INDEX_TTL_MS = 10 * 60 * 1000
/** Two at a time: a period holds a handful (24 in GP XXII, the most). */
const CONCURRENCY = 2
/** Column of list 101 that carries the document type (`DOKTYP`). */
const DOKTYP_COLUMN = 11

/** One EBR item of a period and the law it objects to — null where its
 *  record could not be read or names none. */
export interface EbrEntry {
  ebr: NonNullable<ObjectionAnchor['ebr']>
  law: { gp: string; ityp: 'I' | 'A'; inr: number } | null
}

/**
 * Every EBR item of one period, each with its law. One list call — never
 * `{GP_CODE}` alone, which is the whole Verhandlungsgegenstände list (76.395
 * rows for GP XXVII) — narrowed upstream by `ITYP` and `DOKTYP`, and the
 * narrowing asserted on every row as for the Anträge (`getAntraegeForGp`):
 * the API ignores a key it does not know, and an answer that ignored this
 * one is every Vorlage and Bericht of the period. Then one Gegenstand read
 * per row, through the leaf cache the pages share.
 *
 * Derived (the mapping is ours) and held as long as the station map; a list
 * with an unread record only ten minutes. No prewarm line of its own: the
 * station map's build asks for it, and a period without an Einspruch costs
 * the one list call.
 */
const buildEbrIndex = defineCachedFunction(
  async (gp: string): Promise<Gathered<EbrEntry[]>> => {
    const res = await fetchFilterList(101, { GP_CODE: [gp], ITYP: ['I'], DOKTYP: [EBR_DOKTYP] })
    const rows = res.rows ?? []
    assertRowsMatchGp(rows, gp, 101)
    assertListHeader(101, res)
    if (rows.some((r) => !Array.isArray(r) || r[DOKTYP_COLUMN] !== EBR_DOKTYP)) {
      throw createError({ statusCode: 502, statusMessage: `Upstream-Filter hat nicht gegriffen (Liste 101, DOKTYP EBR, GP ${gp})` })
    }
    let complete = true
    const value = await mapWithConcurrency(rows, CONCURRENCY, async (row): Promise<EbrEntry> => {
      const inr = Number(row[2])
      const ebr = { gp, inr, citation: `${inr} d.B.`, url: parliamentItemUrl({ gp, ityp: 'I', inr }) }
      try {
        const detail = await getGegenstand(gp, 'I', inr)
        return { ebr, law: lawOfEbr((detail.content as EbrContent | null | undefined)?.reference) }
      } catch {
        complete = false
        return { ebr, law: null }
      }
    })
    return { value, complete }
  },
  {
    name: 'ebr-index',
    base: DERIVED_CACHE,
    getKey: (gp: string) => gp,
    ...staleWithin(EBR_INDEX_TTL_S, DAY_STALE_S, keepIncompleteFor(INCOMPLETE_INDEX_TTL_MS)),
  },
)

export async function getEbrIndexForGp(gp: string): Promise<EbrEntry[]> {
  return (await buildEbrIndex(gp)).value
}

/** The entry of the EBR that objects to `item`, or null. */
export function ebrEntryForLaw(index: readonly EbrEntry[], item: ProcedureRoot): EbrEntry | null {
  return index.find((e) => e.law?.gp === item.gp && e.law.ityp === item.ityp && e.law.inr === item.inr) ?? null
}

/** The entry for the EBR item `inr` of period `gp` — its law, for the
 *  redirect from the EBR's own address — or null. */
export function ebrEntryOf(index: readonly EbrEntry[], gp: string, inr: number): EbrEntry | null {
  return index.find((e) => e.ebr.gp === gp && e.ebr.inr === inr) ?? null
}

/** What a reader of the law gets out of its Einspruch. */
export interface ObjectionRead {
  objection: BundesratObjection
  /** The Bundesrat's Beschluss in the sense of the procedure's end: its
   *  decision on a changed text; null for every other outcome — the
   *  Einspruch is not one. Replaces `findBundesratDecisionDate` of the law. */
  bundesratDecidedAt: string | null
  /** The Kundmachung Parliament links on the EBR item, or null. */
  bgbl: { number: string; url: string } | null
  /** False where a read it needed did not answer: the EBR's record, or the
   *  period's list where the stage linked no EBR. */
  complete: boolean
}

/**
 * The Einspruch against the Beschluss of `item`, from its `phase` record —
 * or null where neither witness names one. `listBudgetMs` bounds the wait for
 * the period's EBR list; past it the stage alone decides.
 */
export async function readBundesratObjection(
  item: ProcedureRoot,
  phase: RawPhase[] | null | undefined,
  currentGp: string | null | undefined,
  listBudgetMs: number,
): Promise<ObjectionRead | null> {
  const anchor = findBundesratObjection(phase)
  let complete = true
  let listed: EbrEntry | null = null
  if (!anchor?.ebr) {
    const index = await answerWithinBudget(getEbrIndexForGp(item.gp), listBudgetMs)
    if (index.answered) listed = ebrEntryForLaw(index.value, item)
    // Missing the list only matters where the stage stands without its EBR.
    else if (anchor) complete = false
  }
  if (!anchor && !listed) return null

  const ebr = anchor?.ebr ?? listed?.ebr ?? null
  let content: EbrContent | null = null
  if (ebr) {
    try {
      content = ((await getGegenstand(ebr.gp, 'I', ebr.inr)).content ?? null) as EbrContent | null
    } catch {
      complete = false
    }
  }
  const read = readObjectionOutcome(content, ebr?.gp ?? item.gp, currentGp)
  const link = extractBgblLink(content?.status?.bgbllinks)
  return {
    objection: {
      date: anchor?.date ?? null,
      ebr: ebr ? { citation: ebr.citation, url: ebr.url } : null,
      outcome: read.outcome,
      decidedAt: read.decidedAt,
      ...(read.unknownCause ? { unknownCause: read.unknownCause } : {}),
    },
    bundesratDecidedAt: read.bundesratDecidedAt,
    bgbl: link?.number ? { number: link.number, url: link.url } : null,
    complete,
  }
}

/**
 * The Bundesrat's Beschluss date of a law as the procedure means it: the
 * Einspruch's reader's where one was read, the law's own stage otherwise.
 */
export function bundesratDecisionOf(phase: RawPhase[] | null | undefined, read: ObjectionRead | null): string | null {
  return read ? read.bundesratDecidedAt : findBundesratDecisionDate(phase)
}

/**
 * The Kundmachung of an item whose record links none, where an Einspruch
 * against it — named by its Verlauf's stage, else by the period's EBR list,
 * as in `readBundesratObjection` — links one on its own item: for readers
 * that need the number alone (`lawDiffService.ts`, „Geltende Fassung").
 * 1105/A's stage links no EBR, and without the list its comparison said
 * „bisher nicht als Gesetz kundgemacht" under „Gesetz geworden".
 * Throws where the list or the EBR's record fails, as the item's own read
 * would: a failed lookup is no answer.
 */
export async function bgblViaObjection(
  item: ProcedureRoot,
  phase: RawPhase[] | null | undefined,
): Promise<{ number: string; url: string } | null> {
  const ebr = findBundesratObjection(phase)?.ebr ?? ebrEntryForLaw(await getEbrIndexForGp(item.gp), item)?.ebr
  if (!ebr) return null
  const content = (await getGegenstand(ebr.gp, 'I', ebr.inr)).content as EbrContent | null | undefined
  const link = extractBgblLink(content?.status?.bgbllinks)
  return link?.number ? { number: link.number, url: link.url } : null
}

/** Outcomes after which no Kundmachung can come while they stand. */
export function objectionBlocksPromulgation(objection: BundesratObjection | null | undefined): boolean {
  return objection?.outcome === 'pending' || objection?.outcome === 'lapsed'
}
