/**
 * The Gegenstand a procedure page starts from (docs/architecture.md §12.69).
 *
 * Until 10.11.2026 every procedure page was rooted on a Ministerialentwurf,
 * and every service took `(gp, inr)` with the item type implied. A law that
 * came to the Nationalrat without a Begutachtung starts from the
 * Regierungsvorlage (`I`) or the selbständiger Antrag (`A`) itself — same
 * period, same number space per type, so `(gp, inr)` alone no longer names
 * one item: XXVIII/97/ME and 97 d.B. of XXVIII are different laws.
 */
export type ProcedureItemType = 'ME' | 'I' | 'A'

export interface ProcedureRoot {
  gp: string
  ityp: ProcedureItemType
  inr: number
}

/** The two roots without a Begutachtung, as the page's path segment names them. */
export type VorlageKind = 'vorlage' | 'antrag'
