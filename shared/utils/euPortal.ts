/**
 * The words of the Commission's portal „Ihre Meinung zählt" that both the
 * pages and the feeds print (15.11.2026): its stages and the kinds of act
 * the Commission foresees. Here once, so `/feed.xml?quelle=eu` and the
 * list on `/eu-recht` cannot name one window two ways.
 *
 * Pure module: auto-imported in `app/`, imported relatively by the server
 * and by vitest.
 */
import type { EuFeedbackOrganisationType } from '../types/eu'

/**
 * The stage names: the portal's own German words, read on 15.11.2026 from
 * its text file (`…/better-regulation/assets/i18n/de.json`; „Fahrpläne"
 * there, the singular here).
 */
export const EU_PORTAL_STAGE_DE: Readonly<Record<string, string>> = {
  INIT_PLANNED: 'In Vorbereitung',
  ROADMAP: 'Fahrplan',
  PLANNING_WORKFLOW: 'Sondierung',
  OPC_LAUNCHED: 'Öffentliche Konsultation',
  ISC_WORKFLOW: 'Entwurf eines Rechtsakts',
  ADOPTION_WORKFLOW: 'Annahme durch die Kommission',
}

/** A window's stage in the portal's words; the portal's code where the monitor has none — never nothing. */
export function windowStageDe(stage: string): string {
  return EU_PORTAL_STAGE_DE[stage] ?? stage
}

/**
 * The kind of act the Commission foresees, in the monitor's words — the
 * portal's own German labels for these codes were not read. Every code of
 * the 49 open initiatives of 15.11.2026 (PROP_REG 20, REG_DEL 10, REG_IMPL
 * 10, COMMUNIC 3, PROP_DIR 2, DEC_DEL 1, REG 1, REPORT 1, SWD 1) and their
 * obvious siblings.
 */
export const EU_ACT_TYPE_DE: Readonly<Record<string, string>> = {
  PROP_REG: 'Vorschlag für eine Verordnung',
  PROP_DIR: 'Vorschlag für eine Richtlinie',
  PROP_DEC: 'Vorschlag für einen Beschluss',
  REG_DEL: 'Delegierte Verordnung',
  REG_IMPL: 'Durchführungsverordnung',
  DIR_DEL: 'Delegierte Richtlinie',
  DIR_IMPL: 'Durchführungsrichtlinie',
  DEC_DEL: 'Delegierter Beschluss',
  DEC_IMPL: 'Durchführungsbeschluss',
  REG: 'Verordnung',
  DIR: 'Richtlinie',
  DEC: 'Beschluss',
  COMMUNIC: 'Mitteilung',
  REPORT: 'Bericht',
  SWD: 'Arbeitsunterlage der Kommissionsdienststellen',
}

/** The foreseen act in words; the portal's code where the table has none; null where the portal names none. */
export function actTypeDe(code: string | null | undefined): string | null {
  if (!code) return null
  return EU_ACT_TYPE_DE[code] ?? code
}

/**
 * The eight kinds of organisation a contributor can choose on the portal,
 * in the portal's codes and in the order the page lists them (a fixed
 * order, never by count). Only a row of one of these kinds can name an
 * organisation (`namedOrganisationOf`, `server/utils/eu/portalFeedback.ts`);
 * `EU_CITIZEN`, `NON_EU_CITIZEN`, `OTHER` and any code not here are
 * counted and never named. `ACADEMIC_RESEARCH_INSTITTUTION` is the portal's
 * own misspelling, kept verbatim: it is the code the rows carry (78 of
 * 1,500 rows read on 15.11.2026).
 */
export const EU_FEEDBACK_ORGANISATION_TYPES: readonly EuFeedbackOrganisationType[] = [
  'BUSINESS_ASSOCIATION',
  'COMPANY',
  'NGO',
  'PUBLIC_AUTHORITY',
  'ACADEMIC_RESEARCH_INSTITTUTION',
  'TRADE_UNION',
  'ENVIRONMENTAL_ORGANISATION',
  'CONSUMER_ORGANISATION',
]

/**
 * How far the list of contributions to one window is read (16.11.2026,
 * docs/decisions.md, „On approach, the newest 500, more on request"). The
 * portal answers 100 rows a page (it caps `size` there); the first reading
 * is five pages, the newest 500, and each press of „Weitere … lesen" one
 * more step of five pages, up to fifty pages — 5,000 rows a window. The
 * server refuses any other step; the page counts its button's number with
 * them.
 */
export const EU_FEEDBACK_PAGE_SIZE = 100
export const EU_FEEDBACK_STEP_PAGES = 5
export const EU_FEEDBACK_MAX_PAGES = 50
