/**
 * What becomes of a Stellungnahme filed at Parliament, in Parliament's own
 * words — the sentence its form shows above the fields (15.11.2026). The
 * door cards quote it above their buttons (`SourceQuote`), so the reader
 * knows what filing brings before filing.
 *
 * QUOTED, NEVER OURS: the monitor says nothing of its own about what a
 * Stellungnahme achieves (framing rule, CLAUDE.md). The form says where it
 * goes, with Parliament as the source. The closed note under the quote
 * (`STATEMENT_EXPECTATION_DE`, 23.11.2026) adds the procedure, from
 * Parliament's Fachinfo and the Länder's own rules: no vote, who decides,
 * no answer due. It promises no effect and denies none.
 *
 * Two wordings, read off the rendered forms on 15.11.2026: the
 * Begutachtung's names the ministry („dem zuständigen Ressort", 162/ME);
 * every form after it names the Klubs only — Regierungsvorlage (688 d.B.),
 * Ausschussantrag (684 d.B.), Petition (21/PET), Bürgerinitiative (7/BI),
 * and an Initiativantrag (684/A, rendered on 16.11.2026: its door had no
 * quote until then, for want of an open window on the day the others were
 * read).
 * Left out on purpose: the form's second sentence on publication („Mit Ihrem
 * Einverständnis …"), which the reader decides on the form itself.
 *
 * NOT READ, so no quote and no note: a Gesetzesantrag des Bundesrates and a
 * Petition an den Bundesrat. Neither had an open form on 23.11.2026 (none of
 * the 33 items then taking Stellungnahmen, none of the 42 petitions), and
 * the forms differ on who receives a Stellungnahme, so their wording is not
 * inferred (`statementQuoteFor`).
 *
 * NO FORM AT ALL: a Staatsvertrag. All 28 in the monitor carry Parliament's
 * `statementsstate` „Keine Begutachtung bei dem Doktyp "RVS" möglich", and
 * the page read (729 d.B.) shows no form (23.11.2026).
 */
import type { LandCode, LandDraftKind, ProcedureItemKind } from '#shared/types'

export const STATEMENT_QUOTE_SOURCE = 'Parlament'

/** The Begutachtung's form (a Ministerialentwurf). */
export const STATEMENT_QUOTE_BEGUTACHTUNG =
  'Ihre Stellungnahme wird den parlamentarischen Klubs und dem zuständigen Ressort für ihre Arbeit zur Verfügung gestellt.'

/** Every form after the Begutachtung that was read: Vorlage, Antrag, Ausschussantrag, Anliegen. */
export const STATEMENT_QUOTE_PARLAMENT =
  'Ihre Stellungnahme wird den parlamentarischen Klubs für ihre Arbeit zur Verfügung gestellt.'

/** Which round a door card's note speaks of: who takes the Stellungnahme up differs. */
export type StatementRound =
  | 'begutachtung'
  | 'parlament'
  | 'anliegen'
  | 'ministerium'
  | 'land'
  | 'land-verordnung'
  | 'vorarlberg'

const NO_VOTE = 'Eine Stellungnahme ist keine Abstimmung.'
const NO_ANSWER = 'Eine Antwort ist nicht vorgesehen, und ob eine Änderung auf eine bestimmte Stellungnahme zurückgeht, lässt sich von außen meist nicht erkennen.'
const PAGE_SHOWS = 'Was sich am Text ändert, zeigt diese Seite, soweit es veröffentlicht ist.'
const PAGE_SHOWS_LAND = 'Was sich am Text ändert, zeigt diese Seite, soweit das Land es veröffentlicht.'
const taken = (who: string) => `Welche Stellungnahmen aufgegriffen werden, ${who}.`

/**
 * Per round, what its rules say (read in RIS on 23.11.2026). The Länder
 * share a text: no constitution, Landtag rule of procedure or Burgenland's
 * Begutachtung law requires an answer to a submitter. Vorarlberg alone has
 * the government list what it did not take up, for the Landtag (§ 10 GO
 * Vorarlberger Landtag), on a Gesetzesvorlage. A Verordnung is the
 * government's own, so the Landtag is not named there.
 */
const EXPECTATION_TEXT_DE: Readonly<Record<StatementRound, string>> = {
  begutachtung: [NO_VOTE, taken('entscheiden das zuständige Ministerium und die Abgeordneten'), NO_ANSWER, PAGE_SHOWS].join(' '),
  parlament: [NO_VOTE, taken('entscheiden die Abgeordneten und ihre Klubs'), NO_ANSWER, PAGE_SHOWS].join(' '),
  anliegen: [NO_VOTE, 'Wie es weitergeht, entscheiden der zuständige Ausschuss und der Nationalrat.', 'Eine Antwort auf einzelne Stellungnahmen ist nicht vorgesehen.'].join(' '),
  ministerium: [NO_VOTE, taken('entscheidet das zuständige Ministerium'), NO_ANSWER].join(' '),
  land: [NO_VOTE, taken('entscheiden die Landesregierung und der Landtag'), NO_ANSWER, PAGE_SHOWS_LAND].join(' '),
  'land-verordnung': [NO_VOTE, taken('entscheidet die Landesregierung'), NO_ANSWER, PAGE_SHOWS_LAND].join(' '),
  vorarlberg: [NO_VOTE, taken('entscheiden die Landesregierung und der Landtag'), 'Vorschläge, die sie nicht übernimmt, stellt die Landesregierung für den Landtag zusammen.', NO_ANSWER, PAGE_SHOWS_LAND].join(' '),
}

const FACHINFO = {
  label: 'Fachinfo des Parlaments zur Begutachtung',
  href: 'https://www.parlament.gv.at/fachinfos/rlw/Wie-funktionieren-Begutachtungsverfahren-zu-Gesetzentwuerfen',
} as const

/** Only where a public page of the institution says it; a Land's rule stands in its law. */
const EXPECTATION_SOURCE: Partial<Record<StatementRound, { label: string; href: string }>> = {
  begutachtung: FACHINFO,
  parlament: FACHINFO,
  anliegen: {
    label: 'Häufige Fragen des Parlaments',
    href: 'https://www.parlament.gv.at/beteiligen/hilfe/haeufige-fragen#stellungnahmen',
  },
}

/** The closed note on a door card: what a reader can expect after filing. */
export const STATEMENT_EXPECTATION_DE = {
  label: 'Was Sie danach erwarten können',
  text: (round: StatementRound): string => EXPECTATION_TEXT_DE[round],
  source: (round: StatementRound) => EXPECTATION_SOURCE[round] ?? null,
} as const

/** A Land's door: a Verordnung is the government's, Vorarlberg's Gesetz has its list. */
export function landStatementRound(land: LandCode, kind: LandDraftKind): StatementRound {
  if (kind === 'verordnung') return 'land-verordnung'
  return land === 'vbg' ? 'vorarlberg' : 'land'
}

const READ_KINDS: ReadonlySet<ProcedureItemKind> = new Set(['regierungsvorlage', 'initiativantrag', 'ausschussantrag'])

/** The quote for an item's page after the Begutachtung; null where its form was not read. */
export function statementQuoteFor(kind: ProcedureItemKind): string | null {
  return READ_KINDS.has(kind) ? STATEMENT_QUOTE_PARLAMENT : null
}
