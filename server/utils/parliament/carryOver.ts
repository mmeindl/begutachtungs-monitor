/**
 * Die Begutachtungen, deren Frist über den Periodenwechsel hinausläuft
 * (docs/architecture.md §12.35).
 *
 * Liste 81 ist hart nach Gesetzgebungsperiode partitioniert, und jede Seite,
 * die „was ist gerade offen" beantwortet, liest die laufende Periode. In dem
 * Moment, in dem `getCurrentGp()` umspringt, verschwinden damit
 * Begutachtungen, deren Frist noch läuft — von der Startseite, aus
 * `/feed.xml` und aus `/kalender.ics`. Gemessen am 25.09.2026: am 24.10.2024
 * waren 2 Entwürfe der XXVII noch offen (352/ME bis +18 Tage), am 23.10.2019
 * 4 der XXVI (169/ME bis +40 Tage). Für ein Kalender-Abo ist das der härteste
 * Fall: die App ersetzt bei jedem Refresh die ganze Menge, eine noch 18 Tage
 * entfernte Frist wäre also aus dem Kalender gefallen.
 *
 * KEIN benannter Rückfall wie bei den Rechenschaftsabschnitten, sondern ein
 * Merge — und hier ist er richtig. Dort ist die Periode die Aussage („die
 * meisten Stellungnahmen DIESER Periode"), hier ist sie Verwaltung: eine
 * laufende Frist ist eine laufende Frist, und die Abschnitte, die sie zeigen,
 * behaupten „jetzt", nicht „in dieser Periode".
 *
 * OHNE BEDINGUNG, und das ist die eigentliche Entscheidung. Eine Bedingung
 * müsste sich am Alter der neuen Periode festmachen, und genau das geht
 * nicht: 2024 kam der erste Entwurf der neuen Periode +54 Tage nach der
 * Konstituierung, da waren die alten Fristen (+18) längst vorbei — 2019 aber
 * kam er +15 Tage, während die alten noch bis +40 liefen. Jede Schwelle über
 * die neue Periode wäre an einem der beiden Wechsel falsch gewesen. Also
 * wird schlicht immer nachgesehen und nichts behalten, was nicht läuft.
 *
 * Das ist im Normalbetrieb messbar folgenlos: über die abgeschlossenen
 * Perioden XXVII, XXVI, XXV und XXIV (1.390 Entwürfe, 25.09.2026) trägt
 * **kein einziger** noch `AKTIV='J'`. Die Menge ist dort leer, nicht
 * beinahe leer.
 */
import type { DraftSummary } from '#shared/types'
import { previousGp } from '#shared/utils/gp'
import { getDraftsForGp, reconcileActive } from './drafts'

/**
 * Die noch laufenden Begutachtungen der Periode VOR `currentGp`.
 *
 * Kostet einen Liste-81-Abruf hinter demselben 30-Minuten-Leaf-Cache, den
 * die übrigen Listen ohnehin benutzen — und der Rückfall der Rangliste
 * (`rankedPeriod.ts`) liest dieselbe Periode, teilt sich also im
 * Periodenwechsel den Eintrag.
 *
 * Wirft nie: eine Ergänzung darf die Liste, die sie ergänzt, nicht
 * mitreißen. Fällt der Abruf aus, zeigt die Seite die laufende Periode
 * allein — also das, was sie vor dieser Datei gezeigt hat.
 */
export async function getCarryOverDrafts(currentGp: string): Promise<DraftSummary[]> {
  const prev = previousGp(currentGp)
  if (!prev) return []
  try {
    const { items } = await getDraftsForGp(prev)
    /* `reconcileActive` VOR dem Filter: die AKTIV-Spalte kann einer schon
     * abgelaufenen Frist nachhinken (oben berechnet, 30 Minuten gecacht),
     * und genau hier entschiede das über eine Zeile, die niemand mehr
     * beantworten kann. Ein Datensatz ohne Frist bleibt damit draußen,
     * sobald das Flag fällt — über vier beendete Perioden ist das keiner. */
    return items.map(reconcileActive).filter((item) => item.active)
  } catch {
    return []
  }
}
