/**
 * Was ein Suchfeld mit einem Leerzeichen macht (docs/architecture.md §12.31).
 *
 * BIS 22.09.2026 GAR NICHTS: Die Liste suchte den ganzen Eingabestring als
 * EINEN Teilstring, „klima gesetz" fand also nichts, während der Volltext
 * daneben dieselben Wörter mit UND verknüpfte und zwei Entwürfe lieferte.
 * Solange die zwei Suchen auf zwei Seiten standen, fiel das nicht auf; unter
 * einem Feld stehen damit zwei Regeln für dieselbe Taste.
 *
 * UND, nicht ODER — weil das RIS es so macht und weil es die nützlichere
 * Regel ist: Wer zwei Wörter tippt, grenzt ein. Was innerhalb eines Wortes
 * gilt, bleibt unterschiedlich und muss es bleiben: Die Liste sucht
 * Teilstrings („klimages" findet das Klimagesetz), das RIS ganze Wörter mit
 * Stern. Das ist keine Inkonsistenz, sondern der Unterschied zwischen einem
 * Titel von acht Wörtern und einem Dokument von achtzig Seiten.
 *
 * Reines Modul in `shared`, weil beide Endpunkte UND die Zeilen, die die
 * Seite clientseitig filtert (`vorlageRows`), dieselbe Regel brauchen.
 */

/** Die Eingabe in Wörter. Leer, wenn nichts Suchbares übrig bleibt. */
export function queryTokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Trägt dieser Heuhaufen alle Wörter der Suche?
 *
 * Ohne Wörter ist die Antwort ja: Ein leeres Feld filtert nicht.
 */
export function matchesQuery(haystack: string, q: string): boolean {
  const tokens = queryTokens(q)
  if (!tokens.length) return true
  const hay = haystack.toLowerCase()
  return tokens.every((t) => hay.includes(t))
}
