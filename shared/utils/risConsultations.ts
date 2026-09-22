/**
 * The words and the order for a Begutachtung without a parliamentary
 * Gegenstand (docs/architecture.md §12.16).
 *
 * The vocabulary lives here rather than in the components because each of
 * these strings is a claim about a document, made in three places (card,
 * dense row, detail page) plus both feeds — and a claim stated five times is
 * a claim that drifts.
 *
 * Auto-imported; pure module so vitest can import it relatively.
 */
import type { RisConsultation, RisConsultationKind } from '../types'
import { compareDrafts } from './draftOrder'

/** The type word on a card or row. Short — it sits in a meta line. */
export const RIS_KIND_LABEL: Record<RisConsultationKind, string> = {
  verordnung: 'Verordnungsentwurf',
  gesetz: 'Gesetzesentwurf',
  // Not "Sonstiges": the record is a draft like the others, only its title
  // names no type word (Staatsverträge, Vereinbarungen nach Art. 15a B-VG,
  // programmes). Claiming less is the honest move, not claiming a category.
  unbestimmt: 'Entwurf',
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/** Plural, for counts and headings. */
export const RIS_KIND_PLURAL: Record<RisConsultationKind, string> = {
  verordnung: 'Verordnungsentwürfe',
  gesetz: 'Gesetzesentwürfe',
  unbestimmt: 'Entwürfe',
}

/**
 * What the type means for someone deciding whether to read on. One sentence,
 * procedural — never a judgement about the instrument or the ministry
 * (framing rule, CLAUDE.md).
 *
 * Null where the honest answer is nothing. `unbestimmt` used to explain our
 * own classifier („Der Titel nennt keine Rechtsform, deshalb steht hier
 * keine") and `gesetz` carried a second sentence about gaps in the official
 * lists — both are facts about how the monitor is built, told to a reader
 * who asked about a draft. A page that explains its own machinery to
 * everyone is answering a question nobody has.
 */
export const RIS_KIND_HINT: Record<RisConsultationKind, string | null> = {
  verordnung:
    'Eine Verordnung erlässt ein Ministerium selbst, auf Grundlage eines Gesetzes; sie geht nicht durch das Parlament.',
  gesetz:
    'Ein Gesetzesentwurf, zu dem das Parlament keinen Ministerialentwurf führt.',
  unbestimmt: null,
}

/**
 * The one fact a row of this kind owes the reader — and it changes with the
 * state, because the question does: while the Frist runs it is where a
 * Stellungnahme goes, afterwards it is why no count stands where the
 * neighbouring rows carry one.
 *
 * It replaces „nicht im Parlament" (until 18.09.2026). That label named an
 * absence in the Parliament's own vocabulary, so it had to be glossed —
 * seven times, in seven wordings, the homepage version leaning on
 * „Gegenstand", a word the site defines nowhere. Both sentences here state
 * the fact the absence is made of, which is what a label has to do if the
 * glosses are to go away.
 */
export function risFilingNote(active: boolean): string {
  return active
    ? 'Stellungnahme direkt ans Ministerium'
    : 'Stellungnahmen nicht veröffentlicht'
}

/**
 * Open first with the nearest Frist leading, then the ended ones most
 * recently first — `compareDrafts`, the one comparator both kinds of row
 * use (`shared/utils/draftOrder.ts`).
 *
 * It was always deliberately the SAME order `/api/drafts` produces, and
 * since `/entwuerfe` became one list holding both kinds that is no longer a
 * convention to keep by hand but the literal same function. A second
 * implementation would sort the merged list differently from the endpoints
 * that feed it.
 */
export function sortConsultations(a: RisConsultation, b: RisConsultation): number {
  return compareDrafts(a, b)
}

/**
 * The identity of a record without a Gegenstand — the RIS document ID, the
 * only stable handle these have, since there is no Geschäftszahl.
 *
 * Two shapes occur in the corpus: `BEGUT_COO_2026_100_2_1836568` and the
 * GUID form `BEGUT_C769778C_3342_41D1_A1DF_931D7F4BBF1B`.
 *
 * It lives here, next to the vocabulary, because since 18.09.2026 it is
 * what TELLS THE TWO KINDS OF PAGE APART: `/entwuerfe/:id` and
 * `/entwuerfe/:gp/:inr` share one namespace, so the `BEGUT_` prefix decides
 * which page a URL is — in the route's `validate`, in the `.ics` route and
 * in the API handler. Three copies of that rule would be three chances for
 * a valid link to 404.
 */
export const RIS_ID_RE = /^BEGUT_[A-Za-z0-9_]{1,120}$/
