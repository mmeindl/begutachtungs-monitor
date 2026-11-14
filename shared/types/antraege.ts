/**
 * Every selbständiger Antrag on a Bundesgesetz of one period (list 101,
 * `ITYP A`, `ART A`) — the rows of the list's option „Alle Initiativanträge"
 * (`/api/antraege`, decision 1 of 14.11.2026).
 *
 * A procedural state per row, never who moved it: no club, no deputy, no
 * count per club (the framing rule). How each state is decided:
 * `server/utils/parliament/antraege.ts`.
 */

/**
 * Where an Antrag stands.
 *
 *  - `open` — the Nationalrat takes Stellungnahmen on it: its own
 *    `statementsstate` read `1` and its period runs. Verified per item.
 *  - `pending` — still in the house, its flag read and not `1`.
 *  - `pending-unverified` — still in the house, its flag not read in time:
 *    no claim either way.
 *  - `rejected` — Parliament's record says „abgelehnt": a negative committee
 *    report adopted, or a second reading that failed.
 *  - `withdrawn` — „Zurückgezogen".
 *  - `merged` — „Miterledigt" with another item: dealt with in another
 *    report, no decision of its own. Never `rejected`, never `lapsed`
 *    (`shared/utils/miterledigung.ts`).
 *  - `decided` — the third-reading vote carried (list 101's `VOTE`), no
 *    Kundmachung found.
 *  - `promulgated` — RIS names the Antrag on a Teil-I Kundmachung.
 *  - `lapsed` — the period ended while it was still in the house.
 *  - `ended` — erledigt (list status `5`) and nothing above could be read:
 *    the weakest state the list column carries.
 */
export type AntragState =
  | 'open'
  | 'pending'
  | 'pending-unverified'
  | 'rejected'
  | 'withdrawn'
  | 'merged'
  | 'decided'
  | 'promulgated'
  | 'lapsed'
  | 'ended'

export interface AntragRow {
  gp: string
  inr: number
  /** „497/A". */
  citation: string
  /** Parliament's short title, the movers' clubs taken off (`mapAntragRow`). */
  title: string
  /** Einlangen, ISO; '' where upstream has none. */
  date: string
  parliamentUrl: string
  state: AntragState
  /** The Kundmachung, where `promulgated`. */
  bgbl: { number: string; date: string } | null
  /** The item a `merged` Antrag was miterledigt with, as Parliament cites
   *  it („1637 d.B."); null where the record names none. */
  mergedWith: string | null
}

export interface AntraegeResponse {
  gp: string
  /** Whether the period runs — the only one in which a row can be `open`. */
  running: boolean
  items: AntragRow[]
  /**
   * The BGBl Jahrgänge could not be read: no row is `promulgated`, and a
   * carried vote reads `decided` — true, but short of the Kundmachung. The
   * list says so.
   */
  bgblUnread: boolean
}
