/**
 * Begutachtungen that RIS publishes and Parliament has no Gegenstand for
 * (docs/architecture.md §12.16).
 *
 * The monitor's list of consultations comes from Parliament's list 81, which
 * carries Ministerialentwürfe and nothing else. RIS publishes the whole
 * pre-parliamentary Begutachtung, and two thirds of it — Verordnungsentwürfe
 * above all — never reaches Parliament. Until this module the homepage said
 * "Jetzt in Begutachtung" over a list that was missing half of what was open
 * (4 of 8 on 2026-09-17), which is not a narrower focus but a wrong claim.
 *
 * WHAT DECIDES MEMBERSHIP, and why not the title. A record belongs here when
 * the shipped RIS↔ME join found no Ministerialentwurf for it — a structural
 * fact about two upstream sources, not a guess about a title. The title
 * classifier (`classifyRisRecord`) then only *labels* the row, and that
 * order matters: it was built as a score penalty inside the join, where
 * dates and titles could outvote it, and promoting it to the membership
 * rule would have made every one of its mistakes a missing or invented row.
 *
 * As a label it was checked against the join as an oracle
 * (`pnpm corpus:verordnungen`): of the 472 records the join tied to a real
 * Ministerialentwurf across GP XXVII and XXVIII, not one is classified
 * `verordnung`. So the label errs, if at all, toward calling a Verordnung a
 * law — never toward denying a law its Parliament page.
 *
 * THE RESIDUE IS THE POINT. A few records here look like laws and have no
 * Ministerialentwurf: on GP XXVIII the Teilpensionsgesetz (2025-06-18), the
 * Bäderhygienegesetz-Novelle (2026-08-10) and a UWG-Novelle (2026-06-10),
 * each verified by hand against the whole list-81 corpus. That is the second
 * half of the completeness claim — neither official list is complete, and
 * this is the direction Parliament's own list misses.
 */
import type {
  RisConsultation,
  RisConsultationDetail,
  RisConsultationKind,
} from '#shared/types'
import { gpWindow, previousGp, windowPeriodFor } from '#shared/utils/gp'
import { sortConsultations } from '#shared/utils/risConsultations'
import { classifyRisRecord, type RisClass } from './risJoin'
import { ministryCodeOf, ministryNameOf } from './ministryCodes'
import { getRisBegutCorpus, getRisMapForGp } from './begutCorpus'
import { hasDocument, risDocumentUrl, withRisActiveOn, type RisBegutFlat } from './risRecord'

const RIS_ONLY_TTL_S = 60 * 30

const KIND: Record<RisClass, RisConsultationKind> = {
  verordnung: 'verordnung',
  gesetz: 'gesetz',
  other: 'unbestimmt',
}

function toConsultation(r: RisBegutFlat): RisConsultation {
  const title = r.kurztitel ?? r.titel ?? '(ohne Titel)'
  return {
    id: r.id,
    kind: KIND[classifyRisRecord(r)],
    title,
    // Only when it adds something: on most records the Kurztitel is a
    // shortening of the Titel, and printing both would be noise.
    longTitle: r.titel && r.titel !== title ? r.titel : null,
    ministryCode: ministryCodeOf(r.stelle),
    ministryName: ministryNameOf(r.stelle),
    startedAt: r.beginn,
    deadline: r.ende,
    // PLACEHOLDER, not an answer: whether a Frist runs depends on the
    // calendar day, and this object is cached for half an hour. Every reader
    // decides it for itself with `withRisActiveOn` at request time
    // (`risRecord.ts`); a record whose Frist has no end is never running.
    active: false,
    // The outcome is not determined here: this module reads the corpus the
    // page holds anyway, while the match costs whole years of the
    // Bundesgesetzblatt. Whoever needs it mixes it in under a time budget
    // (`bgblService.getBgblOutcomesForGp`, §12.32).
    outcome: null,
    risUrl: risDocumentUrl(r.id),
  }
}

function inWindow(r: RisBegutFlat, w: { from: string; to: string | null }): boolean {
  // Anchored on Beginn: a consultation belongs to the period it started in,
  // the same way a Ministerialentwurf stays with the GP it was filed in.
  if (!r.beginn) return false
  return r.beginn >= w.from && (w.to === null || r.beginn <= w.to)
}

interface RisOnlyResult {
  items: RisConsultation[]
  withGegenstand: number
  undecided: number
}

/**
 * Every Begutachtung of one GP's window that has no Ministerialentwurf.
 *
 * Costs nothing upstream that the site does not already pay: both the corpus
 * and the GP's join map are the same cached leaves the detail pages read
 * (`begutCorpus.ts`). Cached again here because the set derivation runs over a few
 * thousand records and the answer is identical for every visitor.
 *
 * The records it returns are DAY-INDEPENDENT, which is what makes that last
 * sentence true: `active` is left at `false` here and applied by the caller
 * with `withRisActiveOn`, so no reader inherits the calendar day of whoever
 * filled the cache.
 */
export const getRisOnlyForGp = defineCachedFunction(
  async (gp: string): Promise<RisOnlyResult> => {
    /* NO CALENDAR ROW YET — the period that convened before anybody
     * extended `GP_STARTS` (§12.35). The predecessor then answers for it,
     * WHOLE: window and join map together, never this period's map on the
     * predecessor's window. The map decides which records a
     * Ministerialentwurf has already claimed, and an empty one would
     * republish every claimed record as „ohne Gegenstand im Parlament" —
     * right next to the draft it belongs to. The rule itself, and why it
     * disables itself, is `windowPeriodFor`. */
    const bearer = windowPeriodFor(gp)
    if (bearer !== null && bearer !== gp) return await getRisOnlyForGp(bearer)
    const w = bearer === null ? null : gpWindow(bearer)
    if (!w) return { items: [], withGegenstand: 0, undecided: 0 }

    /* ZWEI KARTEN, und die zweite ist keine Vorsicht, sondern eine Korrektur
     * (§12.36). Ein Record wird nach seinem RIS-**Beginn** einer Periode
     * zugeschlagen, sein Ministerialentwurf nach dem **Einlangen** im
     * Parlament — und die beiden Daten liegen ein paar Tage auseinander. An
     * einer Periodengrenze fallen sie damit auf verschiedene Seiten: der
     * Entwurf steht noch in Liste 81 der alten Periode, sein Record schon im
     * Fenster der neuen. Die Karte der neuen Periode kennt nur deren eigene
     * Entwürfe, beansprucht ihn also nicht — und der Record erschiene als
     * „Begutachtung ohne Gegenstand im Parlament", was das eine ist, was er
     * nicht ist. Mit dem Carry-over daneben (`getCarryOverDrafts`) stünde
     * derselbe Entwurf zweimal auf der Startseite: einmal als
     * Ministerialentwurf, einmal als Verordnungsentwurf.
     *
     * Gemessen am 25.09.2026 mit einer Grenze am 20.09.2026: 137/ME
     * (Klimagesetz), 138/ME (UVP-G) und 139/ME (CO2-Speicherung) sind in der
     * Karte der XXVIII sauber `matched`, ihre Records liegen im Fenster der
     * XXIX. Drei Doppelungen aus drei Tagen Versatz.
     *
     * Nur die VORPERIODE, und nur diese Richtung: RIS veröffentlicht die
     * Begutachtung, wenn sie beginnt, das Parlament verzeichnet den Entwurf,
     * wenn er einlangt — der Versatz geht also „Entwurf früher, Record
     * später", und damit ist die Karte, die fehlt, immer die der Periode
     * davor. */
    const prev = previousGp(gp)
    const [corpus, map, prevMap] = await Promise.all([
      getRisBegutCorpus(),
      getRisMapForGp(gp),
      prev ? getRisMapForGp(prev).catch(() => null) : Promise.resolve(null),
    ])

    // Claimed by a Ministerialentwurf: the record the join chose for it.
    // Those are already on a monitor page, under the ME's own citation.
    const claimed = new Set<string>()
    for (const row of map.rows) if (row.risId) claimed.add(row.risId)
    for (const row of prevMap?.rows ?? []) if (row.risId) claimed.add(row.risId)

    // KNOWN AND UNFIXED, deliberately. An `ambiguous` row chose no record,
    // so the record that really is that Ministerialentwurf stays unclaimed
    // and would appear below as "no Gegenstand at Parliament" — which is the
    // one thing it is not. Holding the row's candidates out is not the fix:
    // `candidates` is every RIS record whose Beginn falls in the window, so
    // excluding them would hide the genuine Verordnungen sitting next to the
    // draft. The count is surfaced instead, and it is zero in both measured
    // periods (GP XXVII and XXVIII, `data/ris-me-map-gp27.json` and
    // `tests/risJoin.test.ts`) — a real number to watch, not a silent risk.
    const undecided = map.counts.ambiguous

    // A day-independent baseline order — `sortConsultations` reads `active`,
    // so with the flag undecided this is "latest Frist end first". The list
    // endpoint re-sorts once it has applied the day; the feeds and the
    // sitemap order themselves anyway.
    const inGp = corpus.records.filter((r) => inWindow(r, w))
    const items = inGp
      .filter((r) => !claimed.has(r.id))
      .map((r) => toConsultation(r))
      .sort(sortConsultations)

    return { items, withGegenstand: inGp.length - items.length, undecided }
  },
  { name: 'ris-only-gp', base: DERIVED_CACHE, getKey: (gp: string) => gp, maxAge: RIS_ONLY_TTL_S, swr: false },
)

/**
 * Die RIS-Begutachtungen der Vorperiode, deren Frist noch läuft
 * (docs/architecture.md §12.36).
 *
 * Die zweite Hälfte des Carry-over, und die GRÖSSERE: `inWindow` verankert
 * einen Record an seinem **Beginn**, nicht an der Überlappung — eine
 * Verordnung, die zwei Wochen vor dem Wechsel aufgelegt wurde, gehört damit
 * bis zum Schluss ins Fenster der alten Periode, auch wenn ihre Frist
 * mitten in die neue läuft. Gemessen am 25.09.2026 über den Bestand:
 * **20 Records** trugen ihre Frist über den 23.10.2019, **5** über den
 * 24.10.2024 — gegen 4 und 2 Ministerialentwürfe.
 *
 * **Warum `windowPeriodFor` hier die Abbruchbedingung ist.** Solange die
 * neue Periode noch keine `GP_STARTS`-Zeile hat, antwortet die Vorperiode
 * ohnehin schon ganz für sie (oben) — der Carry-over wäre dann derselbe
 * Bestand ein zweites Mal. Er greift also erst, wenn die Zeile ergänzt ist,
 * und genau dort entsteht das Loch: der Kommentar an `GP_STARTS` fordert
 * diese Zeile ausdrücklich an, und ohne diese Funktion wäre das Ergänzen der
 * Tabelle der Moment, in dem die laufenden Verordnungsfristen aus Startseite,
 * Feed und Kalender fallen. Die eine Abhilfe darf die andere nicht
 * aufheben.
 */
export async function getCarryOverRisConsultations(currentGp: string): Promise<RisConsultation[]> {
  if (windowPeriodFor(currentGp) !== currentGp) return []
  const prev = previousGp(currentGp)
  if (!prev) return []
  try {
    const { items } = await getRisOnlyForGp(prev)
    /* `active` wie überall zur Anfragezeit, nicht aus dem Cache — der
     * Bestand oben ist absichtlich tagunabhängig. */
    return withRisActiveOn(items).filter((item) => item.active)
  } catch {
    // Eine Ergänzung darf die Liste, die sie ergänzt, nie mitreißen.
    return []
  }
}

/**
 * One record with its documents, by RIS ID.
 *
 * Reads the cached corpus rather than fetching the single document: the
 * corpus is one leaf the site holds anyway, and a per-ID fetch would add an
 * upstream request per page view for data already in memory.
 */
export async function getRisConsultation(id: string): Promise<RisConsultationDetail | null> {
  const corpus = await getRisBegutCorpus()
  const r = corpus.records.find((x) => x.id === id)
  if (!r) return null
  // Uncached, but the day is still decided here and not in `toConsultation`,
  // so there is exactly one rule for `active` in this file.
  const [item] = withRisActiveOn([toConsultation(r)])
  return {
    ...item!,
    mainDocument: r.mainDocument,
    explanations: hasDocument(r.explanations) ? r.explanations : null,
    textComparison: hasDocument(r.textComparison) ? r.textComparison : null,
    coverLetter: hasDocument(r.coverLetter) ? r.coverLetter : null,
    // Everything else the record carries — WFA, Vorblatt, Digicheck,
    // Anhänge. Only the full-text search reads it (§12.31); the draft page
    // still shows the four named documents, because those are the ones it
    // can say something about.
    otherDocuments: r.otherDocuments.map((d) => ({ name: d.name, formats: d.urls })),
  }
}
