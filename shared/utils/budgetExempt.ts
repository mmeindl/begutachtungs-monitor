/**
 * Laws that skip the Begutachtung BY DESIGN — the budget procedure — and may
 * therefore never be called „ohne Begutachtung" (docs/research/begutachtung-uebersprungen.md
 * §3).
 *
 * One table for the measurement (`scripts/corpus/begutachtungSkipped.ts`)
 * and the list (`server/utils/ris/skippedLaws.ts`, the open Vorlagen of
 * `server/api/dashboard/zweite-runde.get.ts`), moved out of the script on
 * 09.11.2026: a hand-maintained table that exists twice drifts.
 *
 * WHY A TABLE AND NOT A RULE. There is no structured signal for the budget
 * procedure: list 101's `Gruppe` column is null on every Regierungsvorlage of
 * GP XXVIII, and the THEMEN tag „Budget und Finanzen" covers the
 * Bundesfinanzgesetz 2026 as well as the Anti-Mogelpackungs-Gesetz and the
 * Preisauszeichnungsgesetz, which are ordinary consumer law. A keyword or
 * THEMEN rule would exempt precisely the cases that are the finding.
 *
 * THE ONE RULE beside the table (`isBudgetLawTitle`), for the years nobody
 * has curated yet: a title that STARTS with „Bundesfinanzgesetz" or
 * „Bundesfinanzrahmengesetz". Those two names belong to the Art-51 timetable
 * and to nothing else; an amendment to them within the budget procedure
 * starts with the same word. Narrower on purpose than „contains Budget":
 * the Budgetsanierungsmaßnahmengesetz and the Budgetprovisorium stay out,
 * as the table keeps them out (below). The Vorbelastungen are table-only —
 * GP XXVII shows four of them bundled with substantive law.
 *
 * PURE MODULE — no imports, so server, app, scripts and vitest read the
 * same table.
 */

/**
 * Laws that reach the Nationalrat without Begutachtung by design, keyed
 * `<GP>/<ITYP>/<INR>`. Every entry needs a reason — an exemption without one
 * is indistinguishable from a case someone found inconvenient.
 *
 * Reviewed for GP XXVIII on 2026-09-15. Deliberately NOT exempt:
 *  - 10 d.B. Bundeshaushaltsgesetz 2013, Änderung — the BHG is the organic
 *    budget law, but an amendment to it is ordinary legislation and could
 *    have been consulted. Flagged for review rather than waved through.
 *  - 87/91 d.B. Budgetsanierungsmaßnahmengesetz II — budget-flavoured by
 *    title, but substantively an omnibus (pensions, fees). The budget
 *    exemption covers the Bundesfinanzgesetz procedure, not everything with
 *    "Budget" in its name.
 *
 * TWO CANDIDATE CLASSES the first run surfaced, left in the count on purpose
 * until someone who knows the procedure rules on them — an open question for
 * a procedural expert, not one this table can settle:
 *
 *  a) **Budgetprovisorium** — 71/A and 123/A (Gesetzliches Budgetprovisorium
 *     2025). Budget procedure like the BFG, but filed as an Initiativantrag
 *     during government formation. If the budget exemption is about the
 *     subject matter it applies; if it is about the Art-51 timetable it does
 *     not.
 *  b) **Parliament's own organisational law** — Geschäftsordnungsgesetz
 *     (322/A), Informationsordnungsgesetz (323/A), Bundesbezügegesetz
 *     (562/A, 935/A), Klubfinanzierungsgesetz (950/A), Parteienfinanzierung
 *     (353/A), Parlamentsmitarbeitergesetz. Here the Initiativantrag is
 *     arguably the constitutionally CORRECT route — these are the
 *     Nationalrat's own affairs, and a ministerial draft would be the odd
 *     thing. Roughly six of the 87.
 *
 * Both classes move the headline by a few points, not by half. Whichever way
 * they are ruled, the finding survives — which is the point of listing them
 * openly rather than tuning the number.
 */
export const EXEMPT: Readonly<Record<string, string>> = {
  'XXVIII/I/66': 'Bundesfinanzrahmengesetz 2025–2028 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/67': 'Bundesfinanzgesetz 2025 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/68': 'Bundesfinanzgesetz 2026 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/88': 'Begründung von Vorbelastungen — Budgetvollzug, kein Gesetzesvorhaben im üblichen Sinn',
  'XXVIII/I/494': 'Bundesfinanzgesetz 2027 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/495': 'Bundesfinanzgesetz 2028 — Budgetverfahren (Art 51 B-VG)',
  'XXVIII/I/496': 'Bundesfinanzrahmengesetz 2027–2030 — Budgetverfahren (Art 51 B-VG)',

  /* GP XXVII, curated 2026-09-16 by reading all 535 skipped titles. 27 items
   * carry a budget-procedure title, 21 of them are exempt. The other six stay
   * in the count with a reason — see below, right after the list. */
  'XXVII/I/55': 'Bundesfinanzgesetz 2020 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/380': 'Bundesfinanzgesetz 2021 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/1034': 'Bundesfinanzgesetz 2022 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/1669': 'Bundesfinanzgesetz 2023 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/2178': 'Bundesfinanzgesetz 2024 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/56': 'Bundesfinanzrahmengesetz 2020–2023 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/484': 'Bundesfinanzrahmengesetz 2021–2024 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/811': 'BFRG 2021–2024 und BFG 2021, Änderung — Änderung innerhalb des Budgetverfahrens',
  'XXVII/I/1035': 'Bundesfinanzrahmengesetz 2022–2025 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/1444': 'BFRG 2022–2025 und BFG 2022, Änderung — Änderung innerhalb des Budgetverfahrens',
  'XXVII/I/1670': 'Bundesfinanzrahmengesetz 2023–2026 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/2170': 'BFRG 2023–2026 und BFG 2023, Änderung — Änderung innerhalb des Budgetverfahrens',
  'XXVII/I/2179': 'Bundesfinanzrahmengesetz 2024–2027 — Budgetverfahren (Art 51 B-VG)',
  'XXVII/I/343': 'Vorbelastungen BM Digitalisierung und Wirtschaftsstandort — Budgetvollzug',
  'XXVII/I/412': 'Vorbelastungen BM Klimaschutz — Budgetvollzug',
  'XXVII/I/1144': 'Vorbelastungen BM Klimaschutz — Budgetvollzug',
  'XXVII/I/1745': 'Vorbelastungen BM Klimaschutz — Budgetvollzug',
  'XXVII/I/1770': 'Vorbelastungen BM Klimaschutz — Budgetvollzug',
  'XXVII/I/2269': 'Vorbelastungen BM Klimaschutz — Budgetvollzug',
  'XXVII/I/2270': 'Vorbelastungen BM Klimaschutz — Budgetvollzug',
  'XXVII/A/1560': 'Vorbelastungen BM Digitalisierung und Wirtschaftsstandort, Änderung — Budgetvollzug',
}

/* GP XXVII — the six budget titles that are NOT exempt, each with its reason.
 * They stand here and not in EXEMPT because not exempting something is just as
 * much a decision as exempting it and has to be just as readable.
 *
 * a) VORBELASTUNG PLUS A SUBSTANTIVE LAW — the authorisation is Budgetvollzug,
 *    the law carried along with it is not, and the substantive part could have
 *    gone to Begutachtung. Same line as with the Budgetsanierungsmaßnahmen-
 *    gesetz II in GP XXVIII: a title with „Budget" in it does not yet make a
 *    Budgetverfahren.
 *      3656/A  Vorbelastungen BMAW; CHIP-GESETZ-BEGLEITMASSNAHMENGESETZ
 *      3085/A  Vorbelastungen BMAW; Unternehmens-Energiekostenzuschussgesetz, Änderung
 *      2829/A  Vorbelastungen BMDW; Unternehmens-Energiekostenzuschussgesetz u.a., Änderung
 *      1778/A  Vorbelastungen; COVID-19-Bundesvermögen-Ermächtigungen, Änderung
 *
 * b) BUDGETPROVISORIUM — budget matter, but filed as an Initiativantrag during
 *    the formation of a government. Identical to 71/A and 123/A in GP XXVIII,
 *    which stay in the count there too for as long as nobody with knowledge of
 *    the procedure has decided otherwise — another of the open questions for
 *    a procedural expert.
 *      282/A, 112/A  Gesetzliches Budgetprovisorium 2020
 */

/** The table's entry for one Gegenstand, or null — the table alone, as the measurement reads it. */
export function exemptReasonFor(gp: string, ityp: string, inr: number | string): string | null {
  return EXEMPT[`${gp}/${ityp}/${inr}`] ?? null
}

/** „Bundesfinanzgesetz 2029", „Bundesfinanzrahmengesetz 2029 bis 2032" — see the header. */
const BUDGET_LAW_TITLE = /^\s*Bundesfinanz(?:rahmen)?gesetz/i

/** Does the title name a law of the budget procedure? Only its start counts. */
export function isBudgetLawTitle(title: string | null | undefined): boolean {
  return BUDGET_LAW_TITLE.test(title ?? '')
}

/**
 * Why this law is exempt from „ohne Begutachtung", or null: the table entry
 * of any of its carrying items, else the title rule over any of its titles
 * (Parliament's and RIS's spell the same law differently).
 */
export function budgetExemptReason(
  gp: string,
  items: readonly { ityp: 'I' | 'A'; inr: number }[],
  titles: readonly (string | null | undefined)[],
): string | null {
  for (const item of items) {
    const reason = exemptReasonFor(gp, item.ityp, item.inr)
    if (reason) return reason
  }
  return titles.some(isBudgetLawTitle) ? 'Bundesfinanz(rahmen)gesetz — Budgetverfahren (Art 51 B-VG)' : null
}
