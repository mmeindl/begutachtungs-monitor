/**
 * How far the monitor can follow each Land, in one place (25.10.2026): the
 * comparison table on /so-funktionierts and the fold „Wie vollständig die
 * Länder-Entwürfe sind" on the list read these facts, so the two cannot
 * drift apart. Each cell says what the Land publishes, or — where the
 * monitor fills a gap itself — how; never more than was measured
 * (outreach/laender-luecken.md holds the numbers).
 *
 * Pure module (auto-imported; vitest imports it relatively).
 */
import type { LandCode } from '../types'

/**
 * The questions the table answers, one row each, in its order. Cells of
 * two or three words (25.10.2026): five columns must fit the text column of
 * /so-funktionierts; with sentences in them the table scrolled sideways even
 * on a desktop and hid two Länder. The sentences are the fold's (`summary`).
 */
export const COVERAGE_ROWS = [
  { key: 'verordnungen', label: 'Verordnungsentwürfe' },
  { key: 'archive', label: 'Abgeschlossene Begutachtungen' },
  { key: 'frist', label: 'Frist' },
  { key: 'way', label: 'Weg nach der Begutachtung' },
  { key: 'kundmachung', label: 'Kundmachung' },
  { key: 'tgu', label: '„Was ändert der Entwurf?“' },
  { key: 'texts', label: 'Texte im Vergleich' },
  { key: 'statements', label: 'Stellungnahmen veröffentlicht' },
] as const

export type CoverageRow = (typeof COVERAGE_ROWS)[number]['key']

export interface LandCoverage {
  cells: Record<CoverageRow, string>
  /**
   * The fold's line: what the list holds of this Land, and what it does not.
   * `complete` where the Land shows everything the list needs.
   */
  summary: string
  complete: boolean
}

export const LAND_COVERAGE: Record<LandCode, LandCoverage> = {
  ktn: {
    cells: {
      verordnungen: 'ja',
      archive: 'seit 2021, ohne Datum',
      frist: 'ja, teils gerechnet',
      way: 'Vorlage und Beschluss',
      kundmachung: 'über das Beschlussdatum',
      tgu: 'ganze Paragraphen und Absätze',
      texts: 'Vorlage, Gesetz',
      statements: 'nach Fristende',
    },
    summary: 'datiert abgeschlossene Begutachtungen nicht; ein Entwurf ohne Regierungsvorlage steht deshalb in keinem Zeitraum. Bei manchen Verordnungen ist die Frist vom Monitor gerechnet.',
    complete: false,
  },
  ooe: {
    cells: {
      verordnungen: 'ja, ohne Beginn',
      archive: 'seit 2020',
      frist: 'ja',
      way: 'jeder Schritt',
      kundmachung: 'vom Landtag genannt',
      tgu: 'ja',
      texts: 'Vorlage, Ausschuss, Gesetz',
      statements: 'ab der Vorlage',
    },
    summary: 'zeigt alle Gesetzesentwürfe seit 2020 mit ihrem Weg bis zur Kundmachung. Verordnungsentwürfe nennen keinen Beginn; sie stehen beim Ende ihrer Frist.',
    complete: true,
  },
  sbg: {
    cells: {
      verordnungen: 'ja',
      archive: 'seit 2004',
      frist: 'ja',
      way: 'über das RIS',
      kundmachung: 'aus dem Text entschieden',
      tgu: 'wo beigelegt',
      texts: 'Vorlage, Gesetz',
      statements: 'mit Zustimmung',
    },
    summary: 'zeigt alle Entwürfe seit 2004. Bei abgeschlossenen nennt das Land die Frist nicht mehr, nur den Beginn.',
    complete: true,
  },
  t: {
    cells: {
      verordnungen: 'ja, ohne Frist',
      archive: 'einige Wochen',
      frist: 'nur Gesetze',
      way: 'jeder Schritt',
      kundmachung: 'vom Landtag genannt',
      tgu: 'ja',
      texts: 'Vorlage, Gesetz',
      statements: 'ja',
    },
    summary: 'führt Gesetzesentwürfe nur einige Wochen auf seiner Liste; ältere fehlen. Verordnungsentwürfe nennen keine Frist.',
    complete: false,
  },
  w: {
    cells: {
      verordnungen: 'ja',
      archive: 'höchstens 1 Jahr',
      frist: 'ja',
      way: '–',
      kundmachung: 'Suche über den Titel',
      tgu: 'ja',
      texts: '–',
      statements: 'ja',
    },
    summary: 'zeigt einen Entwurf höchstens ein Jahr lang; ältere fehlen, und was aus ihnen wurde, lässt sich nicht verfolgen.',
    complete: false,
  },
}

/** The Länder the monitor does not read yet — a gap of the monitor, not of the Länder. */
export const LAENDER_NOT_READ = ['Burgenland', 'Niederösterreich', 'Steiermark', 'Vorarlberg'] as const
