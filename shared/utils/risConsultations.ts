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
 * recently first.
 *
 * Deliberately the SAME order `/api/drafts` produces for the
 * Ministerialentwürfe: the two lists sit under one another on the homepage
 * and are scanned the same way, so a second ordering would only be a second
 * thing to learn. The acting reader's question is "which deadline ends
 * next?", so a closed item must never lead while something is open.
 */
export function sortConsultations(a: RisConsultation, b: RisConsultation): number {
  if (a.active !== b.active) return a.active ? -1 : 1
  if (a.active) {
    if (a.deadline && b.deadline) {
      return a.deadline.localeCompare(b.deadline) || a.title.localeCompare(b.title, 'de-AT')
    }
    // Open without a Frist carries no urgency — after the dated ones.
    if (a.deadline !== b.deadline) return a.deadline ? -1 : 1
    return (b.startedAt ?? '').localeCompare(a.startedAt ?? '')
  }
  const aEnd = a.deadline ?? a.startedAt ?? ''
  const bEnd = b.deadline ?? b.startedAt ?? ''
  return bEnd.localeCompare(aEnd) || a.title.localeCompare(b.title, 'de-AT')
}
