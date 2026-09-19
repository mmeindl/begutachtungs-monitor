/**
 * GET /api/bgbl/teil2 → wie viele Kundmachungen des Bundesgesetzblatts
 * Teil II je Jahrgang vorliegen (docs/architecture.md §12.32).
 *
 * DAS IST DER AUFWÄRMER, und deshalb gibt es ihn. Der Abgleich einer
 * Verordnungsseite liest bis zu drei Jahrgänge, das sind kalt rund 21
 * Anfragen ans RIS — die dürfen nicht auf einem Besucher landen
 * (`deploy/systemd/begutachtungs-monitor-prewarm.service`, dieselbe
 * Überlegung wie bei der RIS↔ME-Karte). Aufgerufen wird er nächtlich und nach
 * jedem Deploy, weil der Nitro-Cache in Produktion im Speicher liegt.
 *
 * Die Zahlen sind dabei kein Beiwerk: Ein Jahrgang, der plötzlich leer ist,
 * ist genau das stille Versagen, das ein „nicht kundgemacht" auf jeder
 * Verordnungsseite erzeugen würde.
 */
export default defineEventHandler(async () => {
  const now = new Date().getFullYear()
  const years = [now - 2, now - 1, now]
  const counts = await Promise.all(
    years.map(async (year) => ({ year, records: (await getBgblTeil2Year(year)).length })),
  )
  return { years: counts }
})
