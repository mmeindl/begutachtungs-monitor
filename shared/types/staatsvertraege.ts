/**
 * Every treaty's Vorlage of one period (list 101, `ITYP I`, `DOKTYP RVS`) —
 * the rows of the list's option „Staatsverträge" (`/api/staatsvertraege`,
 * decision 3 of 14.11.2026: an option of its own, outside „Alle Arten").
 *
 * No row ever says „Stellungnahme möglich": Parliament takes none on a
 * treaty's Vorlage (`ItemFiling`). How each state is decided:
 * `server/utils/parliament/staatsvertraege.ts`.
 */
import type { TreatyKind } from './procedure'

/**
 * Where a treaty stands.
 *
 *  - `pending` — before the Nationalrat, its period running.
 *  - `approved` — erledigt (list status `5`), no Kundmachung found, its
 *    period running: „Kundmachung ausstehend", never overdue (decision 5).
 *  - `unlisted` — the same after its period: „im RIS bisher nicht
 *    verzeichnet", a statement about the search.
 *  - `promulgated` — RIS names the Vorlage on a Teil-III (or, an
 *    Art.-15a-Vereinbarung, Teil-I) Kundmachung, or — where RIS has no
 *    record — Parliament's record links one.
 *  - `lapsed` — the period ended while it was before the house.
 */
export type TreatyState = 'pending' | 'approved' | 'unlisted' | 'promulgated' | 'lapsed'

export interface TreatyRow {
  gp: string
  inr: number
  /** „119 d.B." */
  citation: string
  title: string
  /** Einlangen, ISO; '' where upstream has none. */
  date: string
  parliamentUrl: string
  /** From list 101's `VHG`: „RVS15" an Art.-15a-Vereinbarung, else a Staatsvertrag. */
  treatyKind: TreatyKind
  state: TreatyState
  /** The Kundmachung, where `promulgated` (`resolveTreatyBgbl`: RIS's key
   *  first, Parliament's link where RIS has none); `date` null where the
   *  Jahrgänge carry no issue date for it. */
  bgbl: { number: string; date: string | null } | null
}

export interface StaatsvertraegeResponse {
  gp: string
  /** Whether the period runs. */
  running: boolean
  items: TreatyRow[]
  /**
   * The BGBl Jahrgänge could not be read: no row is `promulgated`, and an
   * approved treaty reads `approved` or `unlisted` — the list says so.
   */
  bgblUnread: boolean
}
