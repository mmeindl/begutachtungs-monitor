import type { LawDiffSegment, TraceLink } from './common'

// ---------------------------------------------------------------------------
// ME → RV text comparison (docs/ris-join.md §6)
// ---------------------------------------------------------------------------

/**
 * A station of the procedure whose law text can be one side of the §
 * comparison (`shared/utils/lawStations.ts`, docs/architecture.md §12.18).
 *
 * Not the same list as the five reader-facing stations in
 * `shared/utils/stations.ts`: Begutachtung and Bundesgesetzblatt publish no
 * Gesetzestext of their own, and these four do.
 *
 * `bgbl` ist seit 19.09.2026 dabei und ist anders als die vier davor: Seine
 * Fassung steht nicht beim Parlament, sondern im RIS, und zwischen ihr und
 * der Plenarfassung handelt KEIN Akteur mehr (§12.33).
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
 * Ob sich die Begründung des Ressorts zu EINEM Paragraphen zwischen Entwurf
 * und Regierungsvorlage geändert hat (docs/architecture.md §12.10b).
 */
export interface ReasoningDiffEntry {
  /** „§ 54c" — der Paragraph, dessen Begründung hier verglichen wird. */
  paragraph: string
  /** Wortdiff der beiden Passagen; null, wenn zu lang zum Rechnen. */
  segments: LawDiffSegment[] | null
  /**
   * Beide Fassungen im Ganzen — nur, wenn `segments` fehlt, weil der
   * Wortvergleich an seiner Schranke abgebrochen hat. Dann zeigt die Anzeige
   * sie nebeneinander, statt eine leere Lade aufzuklappen.
   */
  fromText: string | null
  toText: string | null
  /** Anteil geänderter Wörter, 0 bis 1 — die Zahl hinter `changed`. */
  drift: number
  /** Ab 2 % abweichender Wörter: unterhalb davon sind es Satzzeichen. */
  changed: boolean
}

/**
 * Die Begründungen des Ressorts, Paragraph für Paragraph, zwischen Entwurf
 * und Regierungsvorlage (docs/architecture.md §12.10b).
 *
 * Gemessen über die XXVIII. GP: 1.515 §§ stehen auf beiden Seiten, bei 728
 * davon (48 %) hat sich die Begründung geändert — die Anzeige hat also
 * etwas zu zeigen, und zwar oft.
 *
 * ZWEI EBENEN, WEIL ES ZWEI SIND: Gerechnet wird je Paragraph
 * (`paragraphs`), gezeigt wird an der Novellierungsanordnung — mehrere
 * Anordnungen ändern denselben Paragraphen. `units` schlägt von `unitKey` auf
 * den Paragraphen um, wie bei `paragraphtitel` also derselbe Schlüssel wie im
 * Vergleich und kein zweites Ausrichtungsproblem.
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
  /** Die beiden gelesenen Dokumente, für die Quellenzeile. */
  sources: TraceLink[]
  /** `unitKey` → „§ 11": welche Änderung auf welchen Paragraphen zeigt. */
  units: Record<string, string>
  /** „§ 11" → der Vergleich, einmal je Paragraph. */
  paragraphs: Record<string, ReasoningDiffEntry>
  /** Wie viele §§ verglichen werden konnten und wie viele sich geändert haben. */
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
   * `unitKey` → „§ 6": der Paragraph, den die Anweisung adressiert. Steht
   * neben dem Namen, weil „Z 2" die Nummer der Novellierungsanordnung ist und
   * nicht die des Paragraphen — ohne ihn schwebt der Name über einer
   * Bezeichnung, die den § gar nicht nennt. Unabhängig von `titles`: der §
   * steht in der Anweisung, der Name kommt aus dem RIS und kann fehlen.
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
 * (`scripts/stations-corpus.ts`).
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
   * Dasselbe für die spätere Seite. Seit es die BGBl-Station gibt, kann auch
   * RECHTS ein RIS-Dokument stehen — die Kundmachung liegt beim Parlament
   * überhaupt nicht (§12.33), und die Quellenzeile muss das sagen dürfen.
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
