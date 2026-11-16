/**
 * What becomes of a Rückmeldung given on the Commission's portal „Ihre
 * Meinung zählt", in the Commission's own words — the sentence the portal
 * shows on an initiative's page for the stage whose window is open. The EU
 * door card quotes it above its button (`SourceQuote`), as a draft's door
 * quotes Parliament's form (`statementQuote.ts`), so the reader knows what
 * giving feedback brings before giving it.
 *
 * QUOTED, NEVER OURS: the monitor says nothing of its own about what a
 * contribution achieves (framing rule, CLAUDE.md).
 *
 * SOURCE: the portal's own German page text, its text file
 * (`…/better-regulation/assets/i18n/de.json`, the file the stage names in
 * `shared/utils/euPortal.ts` come from), keys
 * `page.initiativeDetails.<stage>.feedbackmessage`, read on 15.11.2026.
 * One sentence per stage, verbatim. The adoption's sentence speaks of the
 * legislative debate, so it is quoted only for the feedback period on a
 * legislative proposal; any other adoption (a Commission act, a
 * communication) gets none.
 *
 * NO QUOTE, by the drafts' rule (no quote where the text was not read):
 * any stage not below (INIT_PLANNED, ROADMAP, a stage the portal adds
 * later) and an adoption that is no legislative proposal.
 *
 * THE EUROPEAN CITIZENS' INITIATIVE has its own quote (`EU_ECI_QUOTE`):
 * the three sentences under the heading of the German home page of the
 * Commission's site for the instrument (citizens-initiative.europa.eu),
 * read on 16.11.2026, verbatim and unbroken. They say what a million
 * signatures bring and promise no more than the Commission does: it
 * decides what to do.
 */

export const EU_FEEDBACK_QUOTE_SOURCE = 'Europäische Kommission'

const BY_STAGE: Readonly<Record<string, string>> = {
  /** Sondierung (call for evidence). */
  PLANNING_WORKFLOW: 'Ihr Feedback wird bei der Entwicklung und Erarbeitung dieser Initiative berücksichtigt.',
  /** Öffentliche Konsultation. */
  OPC_LAUNCHED: 'Ihr Feedback wird bei der Entwicklung und Erarbeitung dieser Initiative berücksichtigt. Wir fassen alle eingehenden Rückmeldungen in einem Bericht zusammen und erläutern, wie wir ihnen Rechnung getragen haben.',
  /** Entwurf eines Rechtsakts der Kommission. */
  ISC_WORKFLOW: 'Die Rückmeldungen werden bei der Fertigstellung dieser Initiative berücksichtigt.',
}

/** The door of a European Citizens' Initiative in collection. */
export const EU_ECI_QUOTE =
  'Mit einer Europäischen Bürgerinitiative können Sie die EU mitgestalten und die Europäische Kommission auffordern, neue Gesetze vorzuschlagen. Dafür benötigen Sie eine Million gültige Unterschriften. Falls eine Initiative erfolgreich ist, entscheidet die Kommission, welche Maßnahmen sie ergreift.'

/** The adoption's sentence: only for feedback on a legislative proposal. */
export const EU_FEEDBACK_QUOTE_PROPOSAL =
  'Alle eingegangenen Rückmeldungen werden von der Europäischen Kommission zusammengefasst und dem Europäischen Parlament und dem Rat vorgelegt, um in die Gesetzgebungsdebatte einfließen zu können.'

/**
 * The Commission's sentence for an open window of this stage; null where
 * none was read. `onProposal`: the window is feedback on a legislative
 * proposal — the only case in which the adoption's sentence applies.
 */
export function euFeedbackQuoteFor(stage: string, onProposal: boolean): string | null {
  if (stage === 'ADOPTION_WORKFLOW') return onProposal ? EU_FEEDBACK_QUOTE_PROPOSAL : null
  return BY_STAGE[stage] ?? null
}
