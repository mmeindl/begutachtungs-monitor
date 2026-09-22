import type { DraftSummary } from './drafts'
import type { RisConsultation } from './ris'

/* ------------------------------------------------------------------ *
 * Volltextsuche über die laufenden Begutachtungen (§12.31)
 * ------------------------------------------------------------------ */

/**
 * Der Textausschnitt um eine Fundstelle, in drei Teilen.
 *
 * Drei Teile und kein fertiges Markup: Der Server liefert Text, die Seite
 * setzt die Marke. Ein `<mark>` aus dem Server wäre HTML aus einer
 * Nutzereingabe, und davon gibt es keine sichere Fassung.
 */
export interface BegutSearchSnippet {
  before: string
  match: string
  after: string
}

/**
 * Ein Treffer, als das, was er ist: ein Entwurf — mit Gegenstand im
 * Parlament oder ohne. Kein gemeinsamer Zeilentyp mit leeren Feldern; die
 * beiden Arten unterscheiden sich in dem, was es über sie GIBT (§12.28).
 */
export type BegutSearchEntry =
  | { kind: 'draft'; draft: DraftSummary }
  | { kind: 'ris'; consultation: RisConsultation }

export interface BegutSearchHit {
  entry: BegutSearchEntry
  /**
   * Das Dokument, in dem das Wort steht: „im Entwurfstext", „in den
   * Erläuterungen", … Null, wenn wir es in keinem lesbaren Dokument des
   * Satzes gefunden haben — das RIS durchsucht auch Anlagen und PDFs, die
   * wir nicht auswerten (gemessen: 72,2 % der Treffer sind benennbar).
   */
  place: string | null
  /** Die Stelle im Dokument, wie es sie führt: „§ 5.", „Zu § 5:". */
  designation: string | null
  snippet: BegutSearchSnippet | null
  /**
   * Das Wort steht AUSSCHLIESSLICH in einer Ressortnennung — im Verteiler
   * des Begleitschreibens, in einer Unterschriftszeile.
   *
   * Jedes Begleitschreiben listet alle Ministerien als Empfänger, also
   * trifft jedes Portfolio-Wort jeden Entwurf: „klima" liefert eine
   * Druckgeräteaufstellungsverordnung. Gemessen am 21.09.2026 sind 3 von 7
   * Treffern zu „klima" von dieser Art. Die Zeile bleibt trotzdem stehen —
   * das RIS hat den Satz geliefert, und bei der UVP-G-Novelle, die den
   * Ressortnamen in dutzenden §§ austauscht, IST er der Gegenstand.
   */
  ministryOnly: boolean
}

export interface BegutSearchResponse {
  /** Die Suche, wie sie ans RIS ging — normalisiert, mit Stern. */
  query: string
  /** Wie viele Begutachtungen heute offen sind, also durchsucht wurden. */
  corpusSize: number
  /** Treffer laut RIS, auch die, die wir nicht auflösen konnten. */
  total: number
  hits: BegutSearchHit[]
}
