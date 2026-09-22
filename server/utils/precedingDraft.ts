/**
 * Gab es vor dieser Regierungsvorlage eine Begutachtung? — die zweite
 * Meinung zu `preconst`, ohne die „ohne Begutachtung" eine ungeprüfte
 * Behauptung wäre.
 *
 * WARUM ES DAS GIBT. Die Vorlage nennt ihren Ministerialentwurf in
 * `content.preconst[]` — strukturiert, eindeutig, und damit die einzige
 * Grundlage, auf der eine Zeile auf unsere eigene Entwurfsseite zeigt.
 * `preconst` ist aber kein universelles Feld (`api-exploration.md` §101):
 * gemessen am 18.09.2026 tragen auf GP XXVIII **32 von 117
 * Regierungsvorlagen gar kein `preconst`** — nicht eine hat die Liste ohne
 * ME-Eintrag, sie fehlt schlicht. Ein fehlender Zeiger heißt deshalb
 * zunächst nur „wir haben keine Seite dafür", nie „es gab keine
 * Begutachtung" — und genau das Zweite stand bis heute in der Zeile.
 *
 * WAS GEPRÜFT WIRD. Dieselbe Gegenprobe, die
 * `begutachtung-uebersprungen.md` §2 einmal offline gemacht hat: Liste 81
 * derselben GP, Titelvergleich, und nur Entwürfe, die vor dem Einlangen der
 * Vorlage begonnen haben. Findet sie einen plausiblen Entwurf, sagt die
 * Zeile nichts; findet sie keinen, ist „ohne Begutachtung" zweifach belegt.
 *
 * KALIBRIERUNG (GP XXVIII, 18.09.2026, `titleComponents().jac` gegen die 85
 * echten ME→RV-Paare, die `preconst` benennt):
 *
 * | Schwelle | erkennt echte Paare | schlägt bei den 32 ohne Zeiger an |
 * |---------:|--------------------:|----------------------------------:|
 * |     0,40 |               72/81 |                                 3 |
 * |     0,50 |               72/81 |                                 3 |
 * |     0,60 |               69/81 |                                 1 |
 * |     0,70 |               63/81 |                                 0 |
 *
 * 0,50 ist der Knick: darunter wird die Prüfung nicht empfindlicher, darüber
 * verliert sie echte Paare. Die drei Treffer bei den 32 sind die generische
 * ASVG-Familie, die §2 schon als Fehltreffer ausgewiesen hat (293, 299 d.B.
 * gegen 38/ME, 405 d.B. gegen 23/ME) — sie verlieren damit die Notiz, obwohl
 * sie sie verdient hätten. **Die Richtung ist Absicht:** eine
 * zurückgehaltene Notiz nimmt einer Zeile eine Information, eine falsche
 * Notiz behauptet öffentlich etwas über ein Regierungsvorhaben. Das erste
 * ist zu ertragen, das zweite nicht.
 *
 * WAS SIE NICHT KANN. Neun der 81 echten Paare bleiben unter 0,50, weil der
 * Titel sich zwischen Entwurf und Vorlage wirklich ändert (Sammelnovellen,
 * Umbenennungen). Für Zeilen MIT Zeiger ist das folgenlos — die werden nie
 * geprüft. Für eine Zeile ohne Zeiger heißt es: rund jede zehnte
 * Vorgeschichte, die es gäbe, fände diese Prüfung nicht. Und sie sieht nur
 * die eigene GP; ein Entwurf aus der Vorperiode fällt durch.
 *
 * Reines Modul — nur relative Importe, damit vitest es direkt ausführt.
 */
import type { DraftSummary } from '../../shared/types'
import { titleComponents } from './risJoin'

/** Siehe Kalibrierungstabelle oben. */
const PRECEDING_DRAFT_MIN_JACCARD = 0.5

/**
 * Der plausibelste Ministerialentwurf vor dieser Vorlage, oder null.
 *
 * Jaccard, nicht die Containment-Zahl aus dem RIS-Join: dort ist `cont`
 * tragend, weil RIS jedes geänderte Gesetz aufzählt und der kürzere Titel im
 * längeren aufgeht. Hier stehen auf beiden Seiten Parlamentstitel derselben
 * Schreibkonvention, und `cont` wird dann zur Falle — „Allgemeines
 * Sozialversicherungsgesetz, Änderung" geht in jeder ASVG-Sammelnovelle
 * restlos auf und erreicht 1,00 gegen einen Entwurf, mit dem die Vorlage
 * nichts zu tun hat.
 */
export function findPrecedingDraft(
  vorlage: { title: string; date: string | null },
  drafts: DraftSummary[],
): DraftSummary | null {
  const filedAt = (vorlage.date ?? '').slice(0, 10)
  let best: { draft: DraftSummary; jac: number } | null = null
  for (const draft of drafts) {
    const startedAt = (draft.arrivedAt ?? '').slice(0, 10)
    // Ein Entwurf, der nach dem Einlangen der Vorlage begann, kann ihre
    // Vorgeschichte nicht sein. Fehlt ein Datum, wird nicht ausgeschlossen —
    // die Titelschwelle trägt die Entscheidung dann allein.
    if (filedAt && startedAt && startedAt > filedAt) continue
    const { jac } = titleComponents(draft.title, vorlage.title)
    if (jac < PRECEDING_DRAFT_MIN_JACCARD) continue
    if (!best || jac > best.jac) best = { draft, jac }
  }
  return best?.draft ?? null
}
