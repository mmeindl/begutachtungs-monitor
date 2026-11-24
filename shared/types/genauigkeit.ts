import type { ConsolidatedWithheldCause } from './annex'

/**
 * The figures `/genauigkeit` shows (19.11.2026): what each comparison of the
 * monitor is held against, and how often that holds. Measured by the
 * harnesses in `scripts/harness/`, written by `scripts/harness/genauigkeit.ts`
 * into `shared/data/genauigkeit.json` — never typed by hand: the count of
 * Lesefassungen shown moved by two within one day (19.11.2026), and a figure
 * copied into copy goes stale without anyone seeing it.
 *
 * Counts only. What they mean in words is `shared/utils/genauigkeit.ts`.
 */

/** One kind of fault, injected on purpose: how often it was tried, and how often the check caught it. */
export interface GenauigkeitFault {
  /** The harness's key for the class, the first word of its label („Wort-weg", „R-neu"). */
  key: string
  tried: number
  caught: number
}

/** Per annex path: the RIS table (`table`) and the PDF read by its geometry (`pdf`). */
export interface GenauigkeitPaths<T> {
  pdf: T
  table: T
}

export interface GenauigkeitRecord {
  /** The day of the measurement, `YYYY-MM-DD`. */
  date: string
  /** The commit whose code was measured, abbreviated. */
  commit: string
  /** The Gesetzgebungsperiode the drafts are from. */
  gp: string
  /**
   * Floored fault classes tried fewer than 20 times, so the floor did not
   * hold them, written only where the builder was told to let them stand
   * (`--erlaube-ungehalten`, 20.11.2026). No sentence reads it yet. `path`
   * is `pdf` or `table`, typed as a string: the record is a JSON import, and
   * an import keeps no literal — typed narrower, the first record that
   * carries the field fails the typecheck.
   */
  unheld?: { path: string; key: string; tried: number }[]
  /**
   * The commit each record of the round names, written only where they are
   * not one clean commit and the builder was told to go on
   * (`--erlaube-gemischt`, 20.11.2026); `commit` is then the one named on
   * the command line, or the one checked out. No sentence reads it yet.
   */
  mixed?: Record<string, string>

  /** „Ganzer Paragraph in der vorgeschlagenen Fassung": our own consolidated text, gated by the ministry's annex. */
  lesefassung: {
    /**
     * The bench (`kons.ts --oracle`): enacted amendments, their instructions
     * applied to the text before, the result held against the text RIS
     * carries after entry into force, the annex of the draft they came from
     * as the gate.
     */
    bench: {
      bgbl: number
      laws: number
      /** §§ the bench could score. */
      checked: number
      /** What the page would show: plausible, and confirmed by the annex. */
      shown: number
      /** Of those, word for word the law in force. */
      identical: number
      /** Of those, with a word the law does not carry. */
      invented: number
      /** Of those, the law with something left out. */
      incomplete: number
      /** Of those, anything else that is not the law (half applied, left as it stood). */
      otherwise: number
      /** Without the annex: every § the engine refused nothing in. */
      ungated: { shown: number; identical: number }
      /**
       * Beside `shown`: the plausible §§ the oracle contradicts that the
       * second witness, the draft's own PDF, shows (`kons.ts`, `witness`),
       * and of those, word for word the law in force. Absent in rounds
       * before 20.11.2026; no sentence reads it yet.
       */
      witnessed?: { shown: number; identical: number }
      /**
       * The same laws on the path a reader meets (`kons.ts --entwurf`,
       * 23.11.2026): the page's own composition of each draft, held against
       * the enacted law where the draft's instructions went into it unchanged
       * on the same text in force. The figures above apply the ENACTED
       * instructions, which no page does.
       */
      draftPath: {
        drafts: number
        failed: number
        shown: number
        /** §§ with one right answer: same instruction, same text in force. */
        comparable: number
        /** Of those, word for word the enacted law. */
        identical: number
        /** The comparable §§ that are not, by name. */
        differs: { me: string; law: string; id: string }[]
        instructionChanged: number
        stockMoved: number
        noInstructionLine: number
        notAmended: number
        /** Amended by the law, its enacted text unreadable; absent in a record before 23.11.2026. */
        enactedUnread?: number
        /** No law of the bench joined to the draft's Artikel; absent in a record before 23.11.2026. */
        noLawJoined?: number
        /** The draft's Artikel became law in none of the Bundesgesetzblätter that came of it; absent before 24.11.2026. */
        notEnacted?: number
      }
    }
    /** Faults injected into confirmed results (`faultInjection.ts`, its result classes). */
    faults: GenauigkeitPaths<GenauigkeitFault[]>
    /** Every § the Ministerialentwürfe of the period change, and what the page does with it (`accounting.ts`). */
    funnel: {
      drafts: number
      changed: number
      shown: number
      causes: Partial<Record<ConsolidatedWithheldCause, number>>
      /** Of `shown`, those shown on the draft's own text where the annex did not confirm them (`draftWitness`); absent in rounds before 20.11.2026. */
      witnessed?: number
      /** Drafts the engine did not run on, per reason: they have no §§ in `changed` (23.11.2026). */
      notRun: Record<string, number>
    }
    /**
     * The same for the drafts that stand in RIS only (`accounting.ts --ris`).
     * `outside`: of `changed`, the §§ with nothing to compose (repealed, or of
     * a law enacted anew); `composing`: the drafts with at least one § that
     * can be composed. Both absent in rounds before 21.11.2026.
     */
    risOnly: { drafts: number; changed: number; shown: number; outside?: number; composing?: number; witnessed?: number; notRun: Record<string, number> }
  }

  /** „Was ändert der Entwurf?": the ministry's Textgegenüberstellung, checked against RIS and the draft. */
  annex: {
    /** Drafts of the period with a readable annex (`annexPdf.ts`, both paths). */
    drafts: number
    /**
     * The whole of which `drafts` is a part (23.11.2026): the period's drafts
     * in RIS, those with an annex, those read, those with no amending clause
     * (mostly new laws), and those whose annex the reader refuses.
     */
    population: { listed: number; withAnnex: number; readable: number; noClause: number; unreadable: number }
    confirmed: number
    withheld: number
    /** Of the withheld, because the annex's text in force is not RIS's. */
    withheldStanding: number
    unchecked: number
    /** Faults injected into confirmed annex §§ (`faultInjection.ts`, its annex classes), caught by the gate as shipped. */
    faults: GenauigkeitPaths<GenauigkeitFault[]>
    /**
     * What the page shows of the §§ it does not withhold, since the mark stands
     * on top of the gate (`annex/annexMark.ts`, 21.11.2026): without a mark,
     * with „nicht bestätigt", with „nicht geprüft" (the gate's and the draft
     * check's). `confirmed` and `unchecked` above are the gate's own verdicts,
     * which no longer say what a reader sees: a § the gate verifies may carry
     * either mark, and one it leaves unchecked for having nothing to compare
     * carries none.
     */
    marks: { shown: number; clean: number; unconfirmed: number; unchecked: number }
    /**
     * Faults put into §§ the page showed without a mark, judged through the
     * whole chain the page runs — gate, draft check, Lesefassung, mark
     * (`faultInjection.ts`, `chain`): caught where the § is then withheld or
     * carries a mark. `withheld` is the first of the two, and the difference
     * is not small: a wrong word in the new text is never withheld, the § is
     * shown with „nicht bestätigt" — so a sentence that says „caught" has to
     * say which. `held` on a class the round held to the floor on that path
     * (only ever `true`; a boolean for the same reason as `unheld`'s `path`).
     */
    chain: GenauigkeitPaths<(GenauigkeitFault & { withheld: number; held?: boolean })[]>
  }

  /** The comparisons between the Bund's stations (`station.ts`). */
  stations: {
    drafts: number
    pairs: number
    /** Invariant breaches; must be 0. */
    breaches: number
    /** The two null comparisons, where the same text is held against itself from another source. */
    nullUnits: number
    /** Units in them that do not come out identical. */
    nullResidues: number
    /** Of those, the ones not marked „redaktionell": they would read as a change. */
    nullSubstantive: number
    /** Of the editorial ones, a BGBl number the draft left open („xxx/2026“) and the law filled in. */
    nullPlaceholders: number
    /**
     * One token changed in a unit of a real text (`station.ts --mutationen`,
     * 20.11.2026): a digit, a sign, „nicht", „und" for „oder". Caught where
     * the page shows the unit as a change of substance; absent in a round
     * before that day.
     */
    faults?: GenauigkeitFault[]
  }

  laender: {
    /** When the Länder's list was fetched: their harnesses read it from the cache, so it can be older than `date`. */
    listFetchedAt: string | null
    /** A Land's Textgegenüberstellung, its right column against the draft (`landGuard.ts`). */
    tgu: {
      lands: string[]
      documents: number
      /** §§ the comparisons carry as changed or new. */
      compared: number
      /** Of those, the §§ the page shows. */
      shown: number
      /** §§ of the same documents withheld by any check, the earlier ones included (`compared` only holds what passed them). */
      withheldAll: number
      /** Kärnten's §§ shown without the draft rules, which it is not asked of: each carries „nicht geprüft". */
      kaernten: { shown: number }
      /**
       * The right column word for word against the wording the draft
       * quotes for the § (`landTguStrict.ts`, 20.11.2026): `held` are
       * shown, `differs` withheld, `unchecked` shown on the older rule
       * alone (the new words occur in the draft).
       */
      /**
       * `onlyStruck`: of `held`, §§ that add no word: nothing new to hold, and the Länder's check does not read what they strike.
       * `noWordCompared`: of `held`, §§ with no new word compared, those and the ones whose new text is a bare designation.
       * `markedHeld`: of `held`, §§ shown with „nicht geprüft" because what they strike could not be confirmed (`struckNotHeld`).
       */
      strict: { held: number; differs: number; unchecked: number; onlyStruck: number; noWordCompared: number; markedHeld: number }
      /** A word, figure or citation misread in the left column, over the §§ without a mark: caught where the § is withheld or marked. */
      left: GenauigkeitFault[]
      /** A sentence the draft keeps, shown as struck: caught where the § is withheld or carries „nicht geprüft". */
      struckKept: GenauigkeitFault
      /** §§ with enough new words for the older rule to judge. */
      judged: number
      /** Of those, whose new text the draft carries. */
      found: number
      faults: GenauigkeitFault[]
    }
    /** The comparisons between a Land's stations (`landStations.ts`). */
    stations: {
      pairs: number
      compared: number
      /** Invariant hits not accounted for; must be 0. */
      hits: number
      /** Hits read and accepted, each with its reason (`landStationsAccepted.json`). */
      accepted: number
      /** Of those, an open fault of our reader rather than the documents' own. */
      acceptedReader: number
      /** Pairs that could not be compared at all (`pairs - compared`). */
      notCompared: number
      /** The Länder with at least one pair compared. */
      lands: string[]
      /** Oberösterreich's committee text against its Landesgesetzblatt, the Länder's one null comparison. */
      nullComparison: { units: number; residues: number; substantive: number }
      /** Instructions withheld because one side did not read the text they announce. */
      withheld: number
      withheldPairs: number
      /** Instructions shown and named „nicht lesbar" because neither side read it. */
      unread: number
      unreadPairs: number
    }
  }
}
