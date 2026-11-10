import type { DraftDocument } from './common'
import type { CommitteeConsultation } from './statements'
import type { EnactmentInfo } from './drafts'

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

/**
 * The page of a Regierungsvorlage or selbständiger Antrag that came to the
 * Nationalrat without a Begutachtung (`/entwuerfe/<GP>/vorlage|antrag/<nr>`,
 * docs/architecture.md §12.69). Everything here is read from the item's own
 * detail JSON — there is no list-81 row, no Frist, no draft documents.
 */
export interface VorlageDetail {
  gp: string
  ityp: 'I' | 'A'
  inr: number
  /** „589 d.B.", „1007/A". */
  citation: string
  /** Parliament's short title („Behinderteneinstellungsgesetz, Änderung"). */
  title: string
  /** The bill's official title („Bundesgesetz, mit dem …"); null where the
   *  record carries none in a form that names no person. */
  officialTitle: string | null
  parliamentUrl: string
  /** Einlangen (Vorlage) or Einbringung (Antrag), ISO; null when undated. */
  arrivedAt: string | null
  /** The Ressort that submitted a Vorlage, as Parliament names it
   *  (`names[].ltext`); null on an Antrag or where the record names none. */
  ministry: string | null
  /** The Klubs of an Antrag's movers, in upstream order, by upstream's own
   *  club names; null on a Vorlage, or where a code could not be named — the
   *  byline then says „von Abgeordneten" without clubs rather than half of
   *  them. No deputy is named. */
  moverClubs: string[] | null
  /** The item's own documents (its text, Erläuterungen, …). */
  documents: DraftDocument[]
  /** Parliament's later versions — Ausschuss- and Plenarfassung. */
  textEvolution: DraftDocument[]
  /** The procedure from the item's own record, read as a Vorlage's is
   *  (`enactmentOfItem`); `rvCitation`/`rvUrl` name the item itself. */
  enactment: EnactmentInfo
  /**
   * The fact „ohne Begutachtung", true ONLY where the evidence carries it:
   * the law is among the period's laws without a Begutachtung
   * (`getLawsWithoutBegutachtung`), or — a Vorlage not yet promulgated — the
   * second round's check found no draft (`none`). False in every other case,
   * including a check that did not answer in time: then the page says
   * nothing about it, neither way.
   */
  withoutBegutachtung: boolean
  /**
   * The committee's own consultation, read from the item's Verlauf
   * (`readCommitteeConsultation`) — an Ausschussbegutachtung. Where it is
   * there, `withoutBegutachtung` is false whatever the list says, and the
   * page states this instead (10.11.2026).
   */
  committeeConsultation: CommitteeConsultation | null
  /** The item's Gesetzgebungsperiode is over. */
  gpEnded: boolean
  /** A Vorlage whose record names its Ministerialentwurf (`preconst`): the
   *  draft's page, which tells this Vorlage's story — the page redirects. */
  draftPath: string | null
}
