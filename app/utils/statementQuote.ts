/**
 * What becomes of a Stellungnahme filed at Parliament, in Parliament's own
 * words — the sentence its form shows above the fields (15.11.2026). The
 * door cards quote it above their buttons (`SourceQuote`), so the reader
 * knows what filing brings before filing.
 *
 * QUOTED, NEVER OURS: the monitor says nothing of its own about what a
 * Stellungnahme achieves (framing rule, CLAUDE.md). The form says where it
 * goes; that is all the card claims, with Parliament as the source.
 *
 * Two wordings, read off the rendered forms on 15.11.2026: the
 * Begutachtung's names the ministry („dem zuständigen Ressort", 162/ME);
 * every form after it names the Klubs only — Regierungsvorlage (688 d.B.),
 * Ausschussantrag (684 d.B.), Petition (21/PET), Bürgerinitiative (7/BI).
 * Left out on purpose: the form's second sentence on publication („Mit Ihrem
 * Einverständnis …"), which the reader decides on the form itself.
 *
 * NOT CHECKED, so no quote: an Initiativantrag, a Gesetzesantrag des
 * Bundesrates, a Staatsvertrag, a Petition an den Bundesrat — none had an
 * open window to read (`statementQuoteFor`).
 */
import type { ProcedureItemKind } from '#shared/types'

export const STATEMENT_QUOTE_SOURCE = 'Parlament'

/** The Begutachtung's form (a Ministerialentwurf). */
export const STATEMENT_QUOTE_BEGUTACHTUNG =
  'Ihre Stellungnahme wird den parlamentarischen Klubs und dem zuständigen Ressort für ihre Arbeit zur Verfügung gestellt.'

/** Every form after the Begutachtung that was read: Vorlage, Ausschussantrag, Anliegen. */
export const STATEMENT_QUOTE_PARLAMENT =
  'Ihre Stellungnahme wird den parlamentarischen Klubs für ihre Arbeit zur Verfügung gestellt.'

const READ_KINDS: ReadonlySet<ProcedureItemKind> = new Set(['regierungsvorlage', 'ausschussantrag'])

/** The quote for an item's page after the Begutachtung; null where its form was not read. */
export function statementQuoteFor(kind: ProcedureItemKind): string | null {
  return READ_KINDS.has(kind) ? STATEMENT_QUOTE_PARLAMENT : null
}
