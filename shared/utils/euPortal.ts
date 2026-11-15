/**
 * The words of the Commission's portal „Ihre Meinung zählt" that both the
 * pages and the feeds print (15.11.2026): its stages and the kinds of act
 * the Commission foresees. Here once, so `/feed.xml?quelle=eu` and the
 * list on `/eu-recht` cannot name one window two ways.
 *
 * Pure module: auto-imported in `app/`, imported relatively by the server
 * and by vitest.
 */

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
