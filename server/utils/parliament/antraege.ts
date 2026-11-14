/**
 * Where every Initiativantrag of a period stands (step 3 of
 * `docs/research/umsetzungsplan-weitere-wege.md`, 14.11.2026) — the pure
 * half of `/api/antraege`.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest and
 * `scripts/corpus/antraege.ts` run the same decisions as the endpoint.
 *
 * THREE SOURCES, EACH FOR WHAT ONLY IT CAN SAY:
 *  - list 101's row: `Status` (in the house or erledigt) and whether the
 *    third reading carried (`voteCarried`). One call for the period.
 *  - RIS's Teil-I records: the Kundmachung, by the exact key
 *    (`Initiativantrag`, `pickBgblIForItem`). Pages read for every period
 *    already.
 *  - the item's own record, only where the row cannot answer: the flag
 *    `statementsstate` for every Antrag still in the house in the running
 *    period (the claim „Stellungnahme möglich" is that flag, never the list
 *    column — measured by `corpus:antraege`), and Parliament's prose for an
 *    erledigtes Antrag whose vote did not carry, which may be a rejection, a
 *    withdrawal or a „Miterledigung". `Status` `5` alone cannot tell those
 *    apart (GP XXVII: 56 abgelehnt, 7 zurückgezogen, 14 miterledigt among
 *    the 77 without a vote, read 14.11.2026), and calling a Miterledigung
 *    „abgelehnt" would be false.
 *
 * WHAT A ROW NEVER SAYS: „ohne Begutachtung" (no check exists for an Antrag
 * before its law), a club, a count per club.
 */
import type { AntragRow, AntragState } from '../../../shared/types'
import { bgblLong } from '../../../shared/utils/format'
import { isMiterledigt, mergedWithOf } from '../../../shared/utils/miterledigung'
import { isFilingOpen } from './detailJson'
import { stripHtmlToText } from './htmlText'
import type { AntragListRow } from './list101'

/** List 101's `Status` while the Nationalrat or the Bundesrat still has the item (`STATUS_IN_PROCEDURE`). */
export const ANTRAG_STATUS_IN_HOUSE: ReadonlySet<string> = new Set(['1', '2', '3', '4'])

/** What an Antrag's own record adds to its row. */
export interface AntragReading {
  /** `statementsstate` is `1`. */
  filingOpen: boolean
  /** The end Parliament's prose names, or null where it names none of these. */
  outcome: 'rejected' | 'withdrawn' | 'merged' | 'decided' | null
  /** The item a Miterledigung names („565 d.B."), else null. */
  mergedWith: string | null
}

/**
 * Parliament's `status.description`, read for the end it names. A
 * Beschluss first: „Beschlossen im Nationalrat" stands on a decided item,
 * and nothing that follows may turn it into a rejection. „Miterledig…"
 * before „abgelehnt": a Miterledigung is no decision on the item.
 */
export function readAntragOutcome(description: string | null | undefined): AntragReading['outcome'] {
  const text = stripHtmlToText(description ?? '')
  if (/Beschlossen im Nationalrat/.test(text)) return 'decided'
  if (isMiterledigt(text)) return 'merged'
  if (/Zurückgezogen/.test(text)) return 'withdrawn'
  if (/\babgelehnt\b/i.test(text)) return 'rejected'
  return null
}

/** The two facts the classifier takes from a detail JSON's `content`. */
export function readAntragDetail(content: { statementsstate?: unknown; status?: { description?: string | null } | null; phase?: { stages?: { text?: string | null }[] | null }[] | null } | null | undefined): AntragReading {
  const description = content?.status?.description
  return { filingOpen: isFilingOpen(content), outcome: readAntragOutcome(description), mergedWith: mergedWithOf(description, content?.phase) }
}

/**
 * Whether the row needs the item's own record: every Antrag still in the
 * house in the running period (its flag), and every Antrag the house is done
 * with whose vote did not carry and that RIS does not name (its end).
 */
export function needsReading(row: Pick<AntragListRow, 'status' | 'voteCarried'>, running: boolean, promulgated: boolean): boolean {
  if (promulgated) return false
  if (running && ANTRAG_STATUS_IN_HOUSE.has(row.status)) return true
  return !row.voteCarried && (row.status === '4' || row.status === '5')
}

/**
 * One row's state. `reading` is undefined where the record was not asked
 * for or did not arrive — then the weakest state the row carries.
 */
export function classifyAntrag(
  row: Pick<AntragListRow, 'status' | 'voteCarried'>,
  ctx: { running: boolean; promulgated: boolean; reading?: AntragReading },
): AntragState {
  if (ctx.promulgated) return 'promulgated'
  const r = ctx.reading
  const inHouse = ANTRAG_STATUS_IN_HOUSE.has(row.status)
  if (ctx.running && inHouse) {
    if (!r) return 'pending-unverified'
    if (r.filingOpen) return 'open'
    if (row.voteCarried || r.outcome === 'decided') return 'decided'
    return r.outcome ?? 'pending'
  }
  if (row.voteCarried) return 'decided'
  // A period that ended: what the house did, where its record says it.
  if (r?.outcome) return r.outcome
  // Erledigt with no end that could be read: what the column says, no more.
  if (row.status === '5') return 'ended'
  // Still in the house when the period ended — status 1 to 4 (a status 4
  // without a vote is one adjourned in committee, read 14.11.2026).
  return 'lapsed'
}

/** The row for the list, from the three sources. */
export function antragRowOf(
  row: AntragListRow,
  state: AntragState,
  bgbl: { nummer: string; datum: string } | null,
  reading?: AntragReading,
): AntragRow {
  return {
    gp: row.gp,
    inr: row.inr,
    citation: row.citation,
    title: row.title,
    date: row.date,
    parliamentUrl: row.parliamentUrl,
    state,
    bgbl: state === 'promulgated' && bgbl ? { number: bgblLong(bgbl.nummer), date: bgbl.datum } : null,
    mergedWith: state === 'merged' ? reading?.mergedWith ?? null : null,
  }
}

/** How far up the list a state stands: where one can take part first (decision of 14.11.2026). */
const STATE_RANK: Record<AntragState, number> = {
  open: 0,
  pending: 1,
  'pending-unverified': 1,
  decided: 2,
  promulgated: 2,
  rejected: 2,
  withdrawn: 2,
  merged: 2,
  ended: 2,
  lapsed: 2,
}

/** Open first, then newest Einlangen first — participation and date, never outcome. */
export function compareAntragRows(a: Pick<AntragRow, 'state' | 'date' | 'inr'>, b: Pick<AntragRow, 'state' | 'date' | 'inr'>): number {
  return STATE_RANK[a.state] - STATE_RANK[b.state] || b.date.localeCompare(a.date) || b.inr - a.inr
}
