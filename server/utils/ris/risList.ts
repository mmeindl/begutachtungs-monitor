/**
 * Der Filter von `/api/ris-drafts` — die Hälfte der Liste, die das RIS
 * veröffentlicht und das Parlament nicht kennt (docs/architecture.md
 * §12.16).
 *
 * Rein, also unter Test: Welche Zeilen ein Stationschip zeigt, ist hier eine
 * Aussage über das Verfahren und keine Layoutfrage.
 */
// Reines Modul, nur relative Importe (`risRecord.ts`), damit vitest die
// Regel ohne die Nuxt-Aliase ausführen kann.
import type {
  BgblOutcome,
  DraftStation,
  DraftStatus,
  RisConsultation,
  RisConsultationKind,
} from '../../../shared/types'
import { matchesQuery } from '../../../shared/utils/textMatch'
import { stripMinistryMentions, type MinistryToken } from '../searchHaystack'

/**
 * Welche Hälfte der Stationsachse diese Anfrage meint.
 *
 * Diese Hälfte steht bei der Begutachtung und kommt nie weiter: kein
 * Gegenstand im Parlament, also nie eine Regierungsvorlage (§12.16).
 *
 * Sie war einen Nachmittag lang aus der Stationsachse GANZ draußen, weil
 * der Chip „Begutachtung" sonst 245 Zeilen zeigt, davon 198
 * Verordnungsentwürfe. Das war die falsche Abhilfe gegen eine richtige
 * Beobachtung: die Zahl ist der Korpus, kein Fehler — und der Preis war
 * hoch. „Begutachtung + Stellungnahme möglich" zeigte 4 statt 7 Zeilen,
 * drei laufende Verordnungs-Begutachtungen verschwanden, und der Link der
 * Startseite („Alle 7 offenen Entwürfe") führte auf eine Liste mit 4.
 *
 * Also: unter `begutachtung` gehören sie dazu, weil sie dort stehen. Aus
 * `rv` und `parlament` sind sie draußen, weil sie die nicht erreichen
 * können — das ist keine Auswahl, das ist das Verfahren. Wer nur die eine
 * Sorte will, hat den Art-Filter daneben, und die Zählzeile nennt beide
 * Hälften einzeln.
 *
 * SEIT 19.09.2026 GILT DAS FÜR `bgbl` NICHT MEHR. Der Satz „sie können
 * die späteren Stationen nicht erreichen" stimmte, solange niemand das
 * Bundesgesetzblatt las: Eine Verordnung geht nicht durchs Parlament, wird
 * aber sehr wohl kundgemacht — in Teil II (§12.32). Wer nach der Station
 * „Bundesgesetzblatt" filtert, meint beide Hälften, und die Hälfte, die
 * dort still gefehlt hat, ist die größere.
 */
export function risStationWants(stations: readonly DraftStation[]): { begutachtung: boolean; bgbl: boolean } {
  return {
    begutachtung: !stations.length || stations.includes('begutachtung'),
    bgbl: stations.includes('bgbl'),
  }
}

export interface RisListFilter {
  wants: { begutachtung: boolean; bgbl: boolean }
  status: DraftStatus
  art: RisConsultationKind | undefined
  ministry: string | undefined
  /** Bereits kleingeschrieben. */
  q: string | undefined
  /** Das Ressortvokabular der Periode, als Streichliste für den Langtitel. */
  ministryTokens: readonly MinistryToken[]
  /** Leer, wo der Ausgang nicht rechtzeitig kam — dann filtert `bgbl` nichts. */
  outcomes: Record<string, BgblOutcome>
}

export function filterRisConsultations<T extends RisConsultation>(
  items: readonly T[],
  filter: RisListFilter,
): T[] {
  const { wants, status, art, ministry, q, outcomes } = filter
  return items.filter((item) => {
    if (!wants.begutachtung && !(wants.bgbl && outcomes[item.id]?.state === 'kundgemacht')) return false
    if (status === 'open' && !item.active) return false
    if (status === 'closed' && item.active) return false
    if (art && item.kind !== art) return false
    if (ministry && item.ministryCode.toUpperCase() !== ministry) return false
    if (q) {
      // No aliases here: the alias file is keyed by gp/inr and these records
      // have neither. The long title is in the haystack instead — on a
      // Verordnung it is where the subject matter actually appears.
      //
      // OHNE DIE RESSORTNENNUNG, seit 21.09.2026 (§12.31). Die Regel dahinter
      // ist **gesucht wird, was die Zeile zeigt**: Der Langtitel einer
      // Verordnung beginnt mit „Verordnung des Bundesministers für <ganzes
      // Portfolio>", der Ressortname enthält dasselbe noch einmal, und
      // beides steht nirgends auf der Seite. „klima" traf so 36 Zeilen, 2
      // davon führten das Wort im Kurztitel.
      //
      // Der KURZTITEL wird deshalb NICHT gestrichen, auch wenn er dieselbe
      // Klausel trägt („Verordnung der Bundesministerin für
      // Landesverteidigung über den Krankentransport") — er steht in der
      // Zeile, der Leser sieht das Wort, also muss er danach suchen können.
      // Das Kürzel bleibt aus demselben Grund; für das Ressort als solches
      // gibt es den eigenen Filter.
      // Mehrere Wörter mit UND, dieselbe Regel wie in `/api/drafts`.
      const haystack = `${item.title} ${stripMinistryMentions(item.longTitle ?? '', filter.ministryTokens)} ${item.ministryCode}`
      if (!matchesQuery(haystack, q)) return false
    }
    return true
  })
}
