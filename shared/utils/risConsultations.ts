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
 */
export const RIS_KIND_HINT: Record<RisConsultationKind, string> = {
  verordnung:
    'Eine Verordnung erlässt ein Ministerium selbst, auf Grundlage eines Gesetzes. Sie geht nicht ins Parlament – deshalb gibt es dazu keinen Gegenstand auf parlament.gv.at.',
  gesetz:
    'Ein Gesetzesentwurf, zu dem das Parlament keinen Ministerialentwurf führt. Beide amtlichen Listen haben Lücken; dieser Entwurf steht nur im RIS.',
  unbestimmt:
    'Der Titel dieses Entwurfs nennt keine Rechtsform, deshalb steht hier keine. Das Dokument selbst sagt es.',
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
