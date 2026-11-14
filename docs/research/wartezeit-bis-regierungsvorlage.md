# Wie lange es bis zur Regierungsvorlage dauert

**Stand 14.11.2026.** Dieser Text stand bis zu diesem Tag als Abschnitt
„Wie lange es bis zur Regierungsvorlage dauert" auf der Seite
`/so-funktionierts`. Die Seite wurde aufgelöst; der Abschnitt beschreibt die
Gesamtheit der Entwürfe und nicht einen einzelnen, gehört also in den
Jahresbericht 2027 und nicht an einen Entwurf. Hier steht er, bis es den
Bericht gibt.

Die Zahlen sind nicht hier gepflegt: Sie stehen in `app/utils/outcomes.ts`
(`rvBaseRateFor`), die Marke von 180 Tagen in `shared/utils/rvLatency.ts`
(`RV_LATENCY_CONTEXT_DAYS`). Ändert sich dort etwas, gilt der Code.

## Der Ablauf

Nach der Begutachtung übermittelt das Parlament die Stellungnahmen an das
Ressort, meist wenige Tage nach Fristende. Dort wird der Entwurf überarbeitet,
bis die Regierung ihn als Vorlage beschließt – oder nicht.

## Der Maßstab

Gemessen wird an der letzten abgeschlossenen Gesetzgebungsperiode. Gezählt
wird ab dem Ende der Begutachtungsfrist, nicht ab der Übermittlung.

| GP | Entwürfe | davon mit Regierungsvorlage | Median bis zur Vorlage | binnen 180 Tagen | 90. Perzentil |
|---|---|---|---|---|---|
| XXVII | 353 | 296 | 40 Tage | 89,5 % | 189 Tage |
| XXVI | 163 | 114 | 28 Tage | 91,2 % | 148 Tage |

In der XXVII. GP wurden also 296 von 353 Entwürfen zur Regierungsvorlage. Die
Hälfte dieser Vorlagen kam binnen 40 Tagen nach Fristende, 9 von 10 binnen
6 Monaten.

## Wie die Seite den Maßstab verwendet

An diesen beiden Marken – Median und 180 Tage – zeigt der Balken bei einem
Entwurf, der in der laufenden Gesetzgebungsperiode noch auf seine
Regierungsvorlage wartet, wie lange er schon wartet (`RvWaitBar`). Ein Urteil
ist das nicht: Auch nach 6 Monaten kommt noch etwa jede zehnte Vorlage.

## Für den Jahresbericht

- Die Verteilung je Gesetzgebungsperiode, nicht nur ihre zwei Marken.
- Vorlagen, die erst in einer späteren Periode kamen (`rvInLaterGp`: 4 in der
  XXVII., 14 in der XXVI. GP).
- Entwürfe, die ein Ministerium in die Vorlage eines anderen überführt hat
  („genannt"; die Regel steht in `docs/decisions.md`): Ob die Tabelle oben
  sie als Entwürfe ohne Vorlage zählt, ist vor dem Bericht zu prüfen.
