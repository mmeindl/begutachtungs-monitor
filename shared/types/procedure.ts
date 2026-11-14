import type { DraftDocument } from './common'
import type { CommitteeConsultation } from './statements'
import type { EnactmentInfo } from './drafts'

/**
 * The Gegenstand a procedure page starts from.
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

/**
 * What an item of type `I` or `A` is, read from its document type (`DOKTYP`)
 * — the item kinds a law can start from in the Nationalrat (14.11.2026,
 * `docs/research/umsetzungsplan-weitere-wege.md`): a Regierungsvorlage
 * (`RV`), a selbständiger Antrag of members (`A`, Art `A`), a committee's
 * own motion (`BUA`, „Bericht und Antrag"), a motion of the Bundesrat
 * (`GABR`, `GABR13`) and a treaty (`RVS`). The type alone names none of
 * them: all but the members' Antrag are `I`.
 */
export type ProcedureItemKind = 'regierungsvorlage' | 'initiativantrag' | 'ausschussantrag' | 'bundesratsantrag' | 'staatsvertrag'

/** The page's path segment per item kind (`/entwuerfe/<gp>/<segment>/<nr>`,
 *  `shared/utils/procedureRoot.ts`). */
export type VorlageKind = 'vorlage' | 'antrag' | 'ausschussantrag' | 'bundesratsantrag' | 'staatsvertrag'

/** Who moved a `bundesratsantrag`: the Bundesrat (`GABR`) or a third of its
 *  members (`GABR13`). */
export type BundesratMotionVariant = 'bundesrat' | 'drittel'

/**
 * What a `staatsvertrag` item is (14.11.2026): a treaty the Nationalrat
 * approves (Art. 50 B-VG; list 101's `VHG` „RVS"), promulgated in BGBl. III,
 * or an agreement between the Bund and the Länder (Art. 15a B-VG; `VHG`
 * „RVS15"), promulgated in BGBl. I (388 d.B. XXVIII ⇒ I Nr. 16/2026). Both
 * are `DOKTYP` „RVS". Read off the record's Verlauf, never off its title
 * (`treatyKindOf`).
 */
export type TreatyKind = 'staatsvertrag' | 'vereinbarung-15a'

/** Why Parliament takes no Stellungnahmen on an item kind: `treaty` — a
 *  treaty's Vorlage (`RVS`). The words are the page's (`FILING_CLOSED_DE`). */
export type FilingClosedReason = 'treaty'

export type ItemFiling = { possible: true } | { possible: false; reason: FilingClosedReason }

/**
 * Another item the record names under „Bezug zu" (`content.reference`) — for
 * a committee's motion the Regierungsvorlage or Antrag it came out of, and
 * the committee's own motion item (`GAA`). `path` is our page of it, only
 * where the monitor has one (`pageKindOf`); null otherwise.
 */
export interface RelatedItem {
  gp: string
  ityp: string
  inr: number
  /** Parliament's citation („14/A", „312 d.B."). */
  citation: string
  /** Parliament's short title of it; null where none. */
  title: string | null
  /** Its kind where the monitor follows it, else null. */
  kind: ProcedureItemKind | null
  path: string | null
  /**
   * The Ministerialentwurf behind it, which went through the Begutachtung
   * (14.11.2026): the draft a Regierungsvorlage's record names (`preconst`),
   * or the one whose text an Antrag carries (`ANTRAG_PATHS`). Null where none
   * is known — which claims nothing either way. Says nothing about the text
   * of the item that names this one.
   */
  consultedDraft: { gp: string; inr: number; path: string } | null
}

/**
 * The page of a Regierungsvorlage or selbständiger Antrag that came to the
 * Nationalrat without a Begutachtung (`/entwuerfe/<GP>/vorlage|antrag/<nr>`). Everything here is read from the item's own
 * detail JSON — there is no list-81 row, no Frist, no draft documents.
 */
export interface VorlageDetail {
  gp: string
  ityp: 'I' | 'A'
  inr: number
  /** What the item is, from its `DOKTYP` (`pageKindOf`). */
  itemKind: ProcedureItemKind
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
  /** The committee that moved a committee's motion, in the nominative
   *  („Budgetausschuss"), parsed from the record's description („Bericht und
   *  Antrag des Budgetausschusses über den Entwurf …"); null on every other
   *  kind and where the description does not parse. Never the
   *  Berichterstatter of `names[]`: no deputy is named. */
  committee: string | null
  /** Who moved a motion of the Bundesrat (14.11.2026), from its `DOKTYP`:
   *  the Bundesrat itself (`GABR`, „Gesetzesantrag des Bundesrates") or a
   *  third of its members (`GABR13`, Parliament's type „Gesetzesantrag von
   *  einem Drittel der Mitglieder des Bundesrates", § 21 Abs. 6 GO-BR); null
   *  on every other kind. The members are never named. */
  variant: BundesratMotionVariant | null
  /** What a treaty's Vorlage is (`treatyKindOf`, 14.11.2026): a
   *  Staatsvertrag or an Art.-15a-Vereinbarung; null on every other kind. */
  treatyKind: TreatyKind | null
  /**
   * Whether Parliament takes Stellungnahmen on this kind of item at all.
   * `possible: false` only where its record refuses them for the kind — a
   * treaty's Vorlage (`statementsstate` „9 …" on all 169 of GP XXVI–XXVIII,
   * `pnpm corpus:staatsvertraege`): no door, no statements section, one
   * sentence in their place (`FILING_CLOSED_DE`). `possible: true` says only
   * that the kind is not refused; whether the window is open now is
   * `enactment.filingOpen`.
   */
  filing: ItemFiling
  /** The items the record names under „Bezug zu", in upstream order. */
  relatedItems: RelatedItem[]
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
