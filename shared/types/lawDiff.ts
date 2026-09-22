import type { LawDiffSegment, TraceLink } from './common'

// ---------------------------------------------------------------------------
// ME → RV text comparison (docs/ris-join.md §6)
// ---------------------------------------------------------------------------

/**
 * A station of the procedure whose law text can be one side of the §
 * comparison (`shared/utils/lawStations.ts`, docs/architecture.md §12.18).
 *
 * Not the same list as the five reader-facing stations in
 * `app/utils/spine.ts`: Begutachtung and Bundesgesetzblatt publish no
 * Gesetzestext of their own, and these four do.
 *
 * `bgbl` joined on 19.09.2026 and differs from the four before it: its
 * version is not at Parliament but in RIS, and between it and the Plenum
 * version NO actor negotiates any more (docs/architecture.md §12.33).
 */
export type LawStationId = 'me' | 'rv' | 'ausschuss' | 'plenum' | 'bgbl'

export type LawUnitChange = 'unchanged' | 'changed' | 'inserted' | 'removed'

/** One law in force that a draft would amend. */
export interface AmendedLaw {
  /** The law's Kurztitel from RIS; the draft's own Artikel title where RIS
   *  could not resolve it; the bare BGBl citation as a last resort. */
  title: string
  /** The Stammnorm citation from the Promulgationsklausel, null where the
   *  clause names none (a Stammnorm that is no BGBl at all, e.g. the UGB's
   *  "dRGBl. S. 219/1897"). */
  bgbl: string | null
  /** RIS consolidated text at `asOf`, null when no Gesetzesnummer resolved. */
  risUrl: string | null
}

export interface AmendedLawsResponse {
  gp: string
  inr: number
  /** ISO date of the law version linked — the draft's Einlangen. */
  asOf: string | null
  /** The draft creates law rather than amending it, so there is no standing
   *  text to compare against. Distinct from an empty `laws` list, which can
   *  also mean the draft text was not readable. */
  createsNewLaw: boolean
  laws: AmendedLaw[]
}

/**
 * Whether the Ressort's reasoning for ONE Paragraph changed between the
 * Ministerialentwurf and the Regierungsvorlage (docs/architecture.md
 * §12.10b).
 */
export interface ReasoningDiffEntry {
  /** „§ 54c" — the Paragraph whose reasoning is compared here. */
  paragraph: string
  /** Word diff of the two passages; null when too long to compute. */
  segments: LawDiffSegment[] | null
  /**
   * Both versions in full — only when `segments` is missing because the word
   * comparison hit its ceiling. The section then shows them side by side
   * instead of opening an empty drawer.
   */
  fromText: string | null
  toText: string | null
  /** Share of changed words, 0 to 1 — the number behind `changed`. */
  drift: number
  /** From 2 % diverging words up: below that it is punctuation. */
  changed: boolean
}

/**
 * The Ressort's reasoning, Paragraph by Paragraph, between the
 * Ministerialentwurf and the Regierungsvorlage (docs/architecture.md
 * §12.10b).
 *
 * Measured over GP XXVIII: 1.515 §§ stand on both sides, and for 728 of them
 * (48 %) the reasoning changed — the section has something to show, often.
 *
 * TWO LEVELS, BECAUSE THERE ARE TWO: computed per Paragraph (`paragraphs`),
 * shown at the Novellierungsanordnung — several instructions amend the same
 * Paragraph. `units` maps from `unitKey` to the Paragraph, so as with
 * `paragraphtitel` it is the comparison's own key and not a second alignment
 * problem.
 */
export interface ReasoningDiffResponse {
  gp: string
  inr: number
  /**
   * Same contract shape as `LawDiffResponse`, deliberately: the section is the
   * second half of that one, and the page prints the sibling's reason.
   */
  available: boolean
  unavailableReason: string | null
  /** The two documents that were read, for the credit line. */
  sources: TraceLink[]
  /** `unitKey` → „§ 11": which change points at which Paragraph. */
  units: Record<string, string>
  /** „§ 11" → the comparison, once per Paragraph. */
  paragraphs: Record<string, ReasoningDiffEntry>
  /** How many §§ could be compared, and how many of them changed. */
  stats: { compared: number; changed: number }
}

/**
 * GET /api/drafts/:gp/:inr/paragraphtitel — the heading of each § a
 * change amends, looked up in the standing law (docs/architecture.md §12.11).
 *
 * Keyed by `unitKey` (shared/utils/diffKey.ts) so it merges straight onto the
 * diff units — `article|id|change`, because a Regierungsvorlage can carry a
 * removed and an inserted unit with the same Ziffer number. A
 * missing key means no name could be resolved with certainty, which is the
 * normal case for a Stammgesetz and for any § the lookup could not verify.
 */
export interface ParagraphTitlesResponse {
  /** ISO date of the law version the titles were read from (the draft's Einlangen) */
  asOf: string | null
  titles: Record<string, string>
  /**
   * `unitKey` → „§ 6": the Paragraph the instruction addresses. Kept beside
   * the name, because „Z 2" is the Novellierungsanordnung's number and not
   * the Paragraph's — without it the name floats above a designation that
   * never names the §. Independent of `titles`: the § stands in the
   * instruction, the name comes from RIS and can be missing.
   */
  paragraphs: Record<string, string>
}

/** One § (or one Novellierungsanordnung) of the law text, in both versions. */
export interface LawDiffUnit {
  /** Artikel title of a package, law title otherwise, null when unknown */
  article: string | null
  /** Unit id on the later side of the pair (or the earlier one, for removed units): "§5", "Z3" */
  id: string
  /** The same unit's id on the earlier side; differs from `id` after renumbering */
  fromId: string | null
  heading: string | null
  /**
   * The § heading(s) the unit quotes — a readable name for a change whose own
   * text is a legistic instruction. Quoted from the law, never generated, so
   * it needs no machine-generated marking (docs/architecture.md §12.11).
   */
  quotedHeading: string | null
  change: LawUnitChange
  /**
   * Changed, but every inserted or removed piece is a citation, a number, a
   * date or punctuation (shifted cross-references, date formats). Decided by
   * what the changed words are, not by how many there are. False for the
   * other states and when the word diff was too long to compute.
   */
  editorial: boolean
  /** The text at the earlier station of the compared pair (`LawDiffResponse.from`) */
  fromText: string | null
  /** The text at the later station (`LawDiffResponse.to`) */
  toText: string | null
  /** Word-level diff for changed units; null when unchanged, inserted, removed or too long */
  segments: LawDiffSegment[] | null
}

/**
 * One law of a package that only one of the two documents carries — the
 * Regierungsvorlage merged it in from another draft, or the package lost it
 * on the way. Reported as a law, never as its individual paragraphs.
 */
export interface LawPackageEntry {
  /** The article title, i.e. the law it changes */
  article: string
  /** How many units (§§ or Novellierungsanordnungen) it brings */
  units: number
}

/**
 * One station this draft has a law text for — the selector's options.
 *
 * Present but not comparable is a real state and says which: a text
 * published only as a PDF can be named and linked, never diffed. Measured
 * over GP XXVI–XXVIII it never happens for the parliamentary stations and
 * regularly for the draft itself in the older periods
 * (`scripts/corpus/stationen.ts`).
 */
export interface LawStationOption {
  id: LawStationId
  label: string
  /** Whether this station's text can be one side of a comparison. */
  comparable: boolean
  /** The document itself, for the source line; null when nothing is published. */
  document: TraceLink | null
}

export interface LawDiffResponse {
  gp: string
  inr: number
  /** The compared pair, always earlier → later. */
  from: LawStationId
  to: LawStationId
  /** False when one of the two texts is not available as HTML (the older periods are PDF-only for the draft). */
  available: boolean
  /** German, user-facing: why no comparison can be shown */
  unavailableReason: string | null
  /** The two compared documents, for attribution and links */
  fromDocument: TraceLink | null
  toDocument: TraceLink | null
  /** Where the earlier text was read: Parliament HTML, or the RIS XML when Parliament has only a PDF (older periods, draft side only) */
  fromSource: 'parlament' | 'ris' | null
  /**
   * The same for the later side. Since the BGBl station exists a RIS document
   * can stand on the RIGHT too — the Kundmachung is not at Parliament at all
   * (docs/architecture.md §12.33), and the credit line has to be able to say
   * so.
   */
  toSource: 'parlament' | 'ris' | null
  /** Every station this draft published a text for, in procedural order. */
  stations: LawStationOption[]
  /** `editorial` counts the subset of `changed` that is only citations, numbers, dates, punctuation */
  stats: { total: number; unchanged: number; changed: number; editorial: number; inserted: number; removed: number }
  /** Laws the later text carries and the earlier one never had — a collective act merged in from other drafts. Their units are NOT in `units` or `stats`. */
  lawsOnlyInTo: LawPackageEntry[]
  /** Laws the earlier text carried and the later one does not. Their units are NOT in `units` or `stats`. */
  lawsOnlyInFrom: LawPackageEntry[]
  units: LawDiffUnit[]
}
