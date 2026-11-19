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

  /** „Ganzer Paragraph danach": our own consolidated text, gated by the ministry's annex. */
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
    }
    /** Faults injected into confirmed results (`faultInjection.ts`, its result classes). */
    faults: GenauigkeitPaths<GenauigkeitFault[]>
    /** Every § the Ministerialentwürfe of the period change, and what the page does with it (`accounting.ts`). */
    funnel: {
      drafts: number
      changed: number
      shown: number
      causes: Partial<Record<ConsolidatedWithheldCause, number>>
    }
    /** The same for the drafts that stand in RIS only (`accounting.ts --ris`). */
    risOnly: { drafts: number; changed: number; shown: number }
  }

  /** „Was ändert der Entwurf?": the ministry's Textgegenüberstellung, checked against RIS and the draft. */
  annex: {
    /** Drafts of the period with a readable annex (`annexPdf.ts`, both paths). */
    drafts: number
    confirmed: number
    withheld: number
    /** Of the withheld, because the annex's text in force is not RIS's. */
    withheldStanding: number
    unchecked: number
    /** Faults injected into confirmed annex §§ (`faultInjection.ts`, its annex classes), caught by the gate as shipped. */
    faults: GenauigkeitPaths<GenauigkeitFault[]>
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
  }

  laender: {
    /** A Land's Textgegenüberstellung, its right column against the draft (`landGuard.ts`). */
    tgu: {
      lands: string[]
      documents: number
      shown: number
      /** §§ with enough new words to be judged. */
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
      /** Hits that are the documents' own, each with its reason (`landStationsAccepted.json`). */
      accepted: number
      /** Instructions withheld because one side did not read the text they announce. */
      withheld: number
      withheldPairs: number
      /** Instructions shown and named „nicht lesbar" because neither side read it. */
      unread: number
      unreadPairs: number
    }
  }
}
