/**
 * The five stations of a Begutachtungsverfahren, one row each.
 *
 * What a visitor comes to find out, by lifecycle state:
 *  - while the Frist runs — until when, how do I take part, how many others
 *    already did;
 *  - after it — did a Regierungsvorlage come, and what changed after the
 *    Begutachtung;
 *  - later — did it become law, what did parliament do with it, and how long
 *    each step took.
 *
 * Five stations answer that. The shape before this one did not: it drew the
 * text VERSIONS as the stations and the procedural stages as the arrows
 * between them, which is accurate about the documents and wrong about the
 * reading. It made the Begutachtung — this product's entire subject — an
 * arrow between two boxes, and two of its five arrows (Ausarbeitung im
 * Ressort, Kundmachung) had nothing observable behind them at all.
 *
 * What that costs and why it is worth it:
 *  - **Geltendes Recht** is not a step of the procedure. It is a fact about
 *    the Entwurf — how many laws in force it would change — and it reads as
 *    one. A draft that creates new law has no predecessor text, and the
 *    same fact line says that too.
 *  - **Ausarbeitung im Ressort** happens before anything is published. We
 *    can observe nothing about it, so a row for it would be an empty
 *    promise.
 *  - **Ausschussfassung and Plenarfassung** are two documents answering one
 *    visitor question: what did parliament do with it? One station,
 *    Parlament, whose fact line names the body that changed the text; both
 *    texts stay as documents in the Parlament section.
 *  - **Kundmachung** is the act that the Bundesgesetzblatt row reports by
 *    existing. Naming it twice said the same word twice.
 *
 * Comparisons stay attached to the station that PRODUCED them, and are
 * phrased as the question they answer rather than as the name of a
 * procedure: "Was ändert der Entwurf?" belongs to the Entwurf, "Was sich
 * nach der Begutachtung geändert hat" to the Regierungsvorlage.
 *
 * Pure module: no Nuxt auto-imports, derived entirely from
 * DraftDetail — the statement count included, so a bar built from
 * this fetches nothing.
 */
import type { DraftDetail } from '../types'
import { formatDateDe } from './format'

export type StationId = 'entwurf' | 'begutachtung' | 'rv' | 'parlament' | 'bgbl'

/** done: happened. current: where the procedure is now. open: still ahead.
 *  never: can no longer be reached (GP over). */
export type StationState = 'done' | 'current' | 'open' | 'never'

/** 'parlament' is reserved rather than used: the committee and plenary
 *  comparisons are not built (the diff endpoint still takes a fixed ME/RV
 *  pair), so that station hands out no comparison yet. */
export type ComparisonId = 'vorschlag' | 'begutachtung' | 'parlament'

export interface Station {
  id: StationId
  name: string
  state: StationState
  /**
   * Plain-text facts, rendered joined by " · ". Temporal, never causal:
   * "nach der Begutachtung", not "durch die Stellungnahmen" (framing rule,
   * CLAUDE.md).
   */
  facts: string[]
  /** The comparison this station produced, as the question it answers; null
   *  where none exists or none can be shown. */
  comparison: { id: ComparisonId, question: string } | null
}

/**
 * What only the standing-law lookup can tell us (`/geltendesrecht`): that
 * the draft creates law rather than changing it, and how many laws in force
 * it would change. Neither can be derived from DraftDetail, so both
 * are passed in rather than guessed.
 */
export interface StationContext {
  createsNewLaw?: boolean
  amendedLawCount?: number
}

const AUSSCHUSS = 'Geändert im Ausschuss'
const PLENUM = 'Geändert im Plenum'

const carries = (d: DraftDetail, prefix: string) =>
  d.textEvolution.some((doc) => doc.title.startsWith(prefix))

/**
 * What parliament did with the Regierungsvorlage. One function, because the
 * bar's fact line and the page's Parlament section must never be able to
 * disagree about it.
 *
 * 'amended' does not wait for the Kundmachung: a committee or plenary text
 * either exists or it does not, and that is observable at any point.
 * 'unchanged' is the one that has to wait — before the Kundmachung the same
 * absence only means the bill is still being dealt with, and claiming a
 * finding there would be false.
 */
export function parliamentOutcome(
  d: DraftDetail,
): 'unchanged' | 'amended' | 'pending' | 'lapsed' | null {
  const e = d.enactment
  if (!e) return null
  if (carries(d, AUSSCHUSS) || carries(d, PLENUM)) return 'amended'
  if (e.bgblNumber) return 'unchanged'
  return d.gpEnded ? 'lapsed' : 'pending'
}

/** Empty slots are dropped rather than rendered, so a row never reads "· ·". */
const kept = (...facts: (string | null | undefined)[]): string[] =>
  facts.filter((f): f is string => Boolean(f))

export function stations(d: DraftDetail, ctx: StationContext = {}): Station[] {
  const e = d.enactment

  /** Which body changed the text — the one thing the parliament station can
   *  report without a comparison behind it. */
  const ausschuss = carries(d, AUSSCHUSS)
  const plenum = carries(d, PLENUM)
  const amended = ausschuss && plenum
    ? 'im Ausschuss und im Plenum geändert'
    : ausschuss
      ? 'im Ausschuss geändert'
      : plenum
        ? 'im Plenum geändert'
        : null

  const outcome = parliamentOutcome(d)
  /** Whether parliament is still holding the text — orthogonal to WHAT it
   *  did with it, so the two are read separately. */
  const running = e && !e.bgblNumber ? (d.gpEnded ? 'GP beendet' : 'in Behandlung') : null

  /** The head of the old chain, as a fact of the draft that produces it. */
  const changes = ctx.createsNewLaw
    ? 'neues Gesetz'
    : ctx.amendedLawCount === 1
      ? 'ändert 1 Gesetz'
      : ctx.amendedLawCount
        ? `ändert ${ctx.amendedLawCount} Gesetze`
        : null

  const n = d.statements.total
  const count = n === 0
    ? d.active ? 'noch keine Stellungnahmen' : 'keine Stellungnahmen'
    : n === 1
      ? '1 Stellungnahme'
      : `${n} Stellungnahmen`

  return [
    {
      id: 'entwurf',
      name: 'Entwurf',
      state: 'done',
      facts: kept(formatDateDe(d.arrivedAt), changes),
      // Nothing to hold a new law against, so the question is not asked:
      // the annex would answer with a generic "not available", which reads
      // as a gap in our data instead of a fact about the draft.
      comparison: ctx.createsNewLaw
        ? null
        : { id: 'vorschlag', question: 'Was ändert der Entwurf?' },
    },
    {
      id: 'begutachtung',
      name: 'Begutachtung',
      state: d.active ? 'current' : 'done',
      // The countdown deliberately stays with the badge and the CTA —
      // repeating "Noch 1 Tag" here put the same three words on the page
      // three times. The bar carries the date. While the Frist runs that
      // date leads, because it is the fact a reader can act on; afterwards
      // the count leads, because it is the result.
      facts: d.active
        ? kept(d.deadline ? `Frist bis ${formatDateDe(d.deadline)}` : 'keine Frist angegeben', count)
        : kept(count, d.deadline ? `Frist endete ${formatDateDe(d.deadline)}` : 'keine Frist angegeben'),
      comparison: null,
    },
    {
      id: 'rv',
      name: 'Regierungsvorlage',
      state: e ? 'done' : d.active ? 'open' : d.gpEnded ? 'never' : 'current',
      // "bisher keine" is temporal, never accusatory (framing rule), and it
      // is only claimed once the Frist has ended — while it runs the
      // Vorlage is simply not due yet. Once the GP itself is over the
      // temporal word would mislead the other way, and the boundary becomes
      // the state.
      facts: e
        ? kept(e.rvDate ? formatDateDe(e.rvDate) : e.rvCitation)
        : d.active
          ? ['ausstehend']
          : d.gpEnded
            ? ['keine – GP beendet']
            : kept(
                'bisher keine',
                d.handoff?.date ? `seit ${formatDateDe(d.handoff.date)} beim Ressort` : null,
              ),
      comparison: e
        ? { id: 'begutachtung', question: 'Was sich nach der Begutachtung geändert hat' }
        : null,
    },
    {
      id: 'parlament',
      name: 'Parlament',
      // No date: the payload carries none for this station — the trace of a
      // Ministerialentwurf ends at the Regierungsvorlage, and parliament's
      // own dates live on the Vorlage's record, not on ours. So the row
      // says what happened, not when.
      state: !e
        ? d.gpEnded && !d.active ? 'never' : 'open'
        : e.bgblNumber
          ? 'done'
          : d.gpEnded ? 'never' : 'current',
      // The outcome word is what happened; `running` is whether it is over.
      // Both are needed, because a text amended in the Ausschuss can still
      // be on its way ("in Behandlung · im Ausschuss geändert") or have died
      // with the GP — the outcome alone would not say which.
      facts: outcome === null
        ? []
        : outcome === 'unchanged'
          ? ['Text unverändert beschlossen']
          : kept(running, amended),
      comparison: null,
    },
    {
      id: 'bgbl',
      name: 'Bundesgesetzblatt',
      // The GP is the boundary here as it is for the Vorlage: while it runs a
      // law can still come, whatever the Frist says; once it is over, nothing.
      state: e?.bgblNumber ? 'done' : d.gpEnded ? 'never' : 'open',
      // "ausstehend" while the chain can still continue; nothing at all once
      // it cannot, because the station before it already says why.
      facts: e?.bgblNumber
        ? [e.bgblNumber.replace(/^Bundesgesetzblatt\b/, 'BGBl.')]
        : d.gpEnded
          ? []
          : ['ausstehend'],
      comparison: null,
    },
  ]
}

/**
 * Where the text is now: the station the procedure stands on, and once it
 * stands on none, the last one it reached. Exactly one per bar — this is
 * what the yellow dot marks.
 */
export function markedStation(list: Station[]): StationId | null {
  const current = list.find((s) => s.state === 'current')
  if (current) return current.id
  const done = list.filter((s) => s.state === 'done')
  return done[done.length - 1]?.id ?? null
}
