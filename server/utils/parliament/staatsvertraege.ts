/**
 * Where a treaty's Vorlage stands, from its list-101 row and RIS — the pure
 * decisions behind `/api/staatsvertraege` (step 5 of 14.11.2026).
 *
 * PURE MODULE — relative imports only, so vitest executes it directly.
 *
 * THE LIST ROW ANSWERS THE STATE: a treaty takes no Stellungnahmen, so no
 * flag needs reading, and `STATUS` „5" (erledigt) stood beside „Beschluss im
 * Nationalrat" in the record on 158 of 158 treaties of GP XXVI–XXVIII, and
 * nothing but „Genehmigung" there (`pnpm corpus:staatsvertraege`,
 * 14.11.2026). The Kundmachung: `resolveTreatyBgbl`, the one rule the page,
 * the station map and the list share.
 */
import type { TreatyKind, TreatyRow, TreatyState } from '../../../shared/types'
import { GP_STARTS } from '../../../shared/utils/gp'
import type { BgblRecord } from '../ris/bgblJoin'
import { pickBgblForTreaty } from '../ris/bgblVorlage'
import { BGBL_AUTH_FROM } from '../ris/skippedLaws'
import type { ItemRow } from './list101'

/** A treaty's Kundmachung and where it was read. */
export interface TreatyBgbl {
  /** As the source spells it („BGBl. III Nr. 66/2026" from RIS,
   *  „Bundesgesetzblatt III Nr. 128/2019" from Parliament). */
  number: string
  url: string | null
  /** The issue date where the source carries it (RIS); null otherwise. */
  date: string | null
  source: 'ris' | 'parliament'
}

/**
 * THE RULE FOR A TREATY'S KUNDMACHUNG (decided by the maintainer,
 * 14.11.2026): RIS's exact key — period and Vorlage number on a Teil-III or
 * Teil-I record (`pickBgblForTreaty`) — wins; Parliament's `bgbllinks` only
 * where RIS has no record. Parliament's link can be wrong: 1041 d.B. XXVII
 * links BGBl. I Nr. 187/2021, the COVID-19-Zweckzuschussgesetz, while RIS
 * keys the Vereinbarung to I Nr. 193/2021. Where RIS has none, the link
 * stands (510 d.B. XXVI ⇒ III Nr. 128/2019, a record RIS keys to no
 * Vorlage). The disagreement itself is not shown. One function for the
 * page, the station map and the list, so they cannot say two numbers.
 *
 * `ris` null means RIS ANSWERED with no record. A caller whose lookup did
 * not answer (past its budget, a Jahrgang unread) does not call this: it
 * shows neither number and says the Kundmachung cannot be told just now
 * (`EnactmentInfo.bgblUnread`, the list's `bgblUnread`), and its result is
 * not kept as complete (14.11.2026).
 */
export function resolveTreatyBgbl(
  ris: { number: string; url?: string | null; datum?: string | null } | null | undefined,
  link: { number: string | null; url: string } | null | undefined,
): TreatyBgbl | null {
  if (ris?.number) return { number: ris.number, url: ris.url ?? null, date: ris.datum ?? null, source: 'ris' }
  if (link?.number) return { number: link.number, url: link.url, date: null, source: 'parliament' }
  return null
}

/**
 * The Jahrgänge a period's treaties can be promulgated in: every one from
 * the year the period convened to today's — a Kundmachung can come years
 * after the approval (2,023 days at most in GP XXVII, `pnpm
 * corpus:staatsvertraege`) — but none before the Bundesgesetzblatt in RIS
 * begins (`BGBL_AUTH_FROM`): such a year reads as empty, not as missing
 * (15.11.2026). A period that ended before it still reads the years from
 * then on, where its late Kundmachungen stand. Empty where the calendar has
 * no row for the period.
 */
export function treatyYearsOfPeriod(gp: string, today: string): number[] {
  const start = GP_STARTS[gp]
  if (!start) return []
  const first = Math.max(Number(start.slice(0, 4)), Number(BGBL_AUTH_FROM.slice(0, 4)))
  const now = Number(today.slice(0, 4))
  const years: number[] = []
  for (let y = first; y <= now; y++) years.push(y)
  return years
}

/** List 101's `VHG` of an Art.-15a-Vereinbarung (388 d.B. XXVIII). */
export const AGREEMENT_15A_VHG = 'RVS15'

/** The kind by the row's `VHG` — the list's reading of what `treatyKindOf`
 *  reads off the record's Verlauf; the two agreed on all 169 treaties of GP
 *  XXVI–XXVIII. */
export function treatyKindOfVhg(vhg: string | null | undefined): TreatyKind {
  return (vhg ?? '').trim() === AGREEMENT_15A_VHG ? 'vereinbarung-15a' : 'staatsvertrag'
}

/** List 101's `STATUS` once the house is done with an item. */
const STATUS_ERLEDIGT = '5'

/**
 * The state, by finality: a Kundmachung found; erledigt — approved — without
 * one, „ausstehend" while the period runs and only „im RIS bisher nicht
 * verzeichnet" after it; before the house, or lapsed with the period.
 * `bgbl` null with `bgblUnread` upstream: the same states without
 * `promulgated`, and the list says why.
 */
export function treatyStateOf(status: string, bgbl: object | null, running: boolean): TreatyState {
  if (bgbl) return 'promulgated'
  if (status === STATUS_ERLEDIGT) return running ? 'approved' : 'unlisted'
  return running ? 'pending' : 'lapsed'
}

/**
 * One row; `records` null when the Jahrgänge could not be read. `link` is
 * Parliament's BGBl link from the item's record, read only where RIS has no
 * record (`resolveTreatyBgbl`); its issue date from the same Jahrgänge, by
 * its number, where they carry it.
 */
export function treatyRowOf(
  row: ItemRow,
  records: readonly BgblRecord[] | null,
  running: boolean,
  link: { number: string | null; url: string } | null = null,
): TreatyRow {
  const ris = records ? pickBgblForTreaty(records, row.gp, row.inr) : null
  // Unread Jahrgänge are no „RIS has no record": the link waits for RIS's
  // answer, and the list says why (`bgblUnread`).
  const hit = records ? resolveTreatyBgbl(ris ? { number: ris.nummer, datum: ris.datum } : null, link) : null
  const date = hit?.date ?? (hit && records ? records.find((r) => r.nummer === shortBgbl(hit.number))?.datum ?? null : null)
  return {
    gp: row.gp,
    inr: row.inr,
    citation: row.citation,
    title: row.title,
    date: row.date,
    parliamentUrl: row.parliamentUrl,
    treatyKind: treatyKindOfVhg(row.vhg),
    state: treatyStateOf(row.status, hit, running),
    bgbl: hit ? { number: hit.number, date } : null,
  }
}

/** „Bundesgesetzblatt III Nr. 1/2019" → „BGBl. III Nr. 1/2019", RIS's spelling. */
function shortBgbl(number: string): string {
  return number.replace(/^Bundesgesetzblatt\b/, 'BGBl.')
}

/** Whether a row's Kundmachung needs Parliament's link: RIS answered with
 *  no record for it and the house is done with it. Unread Jahrgänge are no
 *  answer — the link is not read then (`treatyRowOf`). */
export function needsTreatyLink(row: Pick<ItemRow, 'gp' | 'inr' | 'status'>, records: readonly BgblRecord[] | null): boolean {
  return row.status === STATUS_ERLEDIGT && records !== null && !pickBgblForTreaty(records, row.gp, row.inr)
}

/** Newest arrival first, then the higher number — the list's date order. */
export function compareTreatyRows(a: TreatyRow, b: TreatyRow): number {
  return b.date.localeCompare(a.date) || b.inr - a.inr
}
