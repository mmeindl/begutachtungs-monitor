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
 * (`pnpm audit:verordnungen`): of the 472 records the join tied to a real
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
import { gpWindow } from '#shared/utils/gp'
import { sortConsultations } from '#shared/utils/risConsultations'
import { classifyRisRecord, ministryCodeOf, type RisClass } from './risJoin'
import { getRisBegutCorpus, getRisMapForGp } from './ris'
import { hasDocument, isOpenOn, risDocumentUrl, type RisBegutFlat } from './risRecord'

const RIS_ONLY_TTL_S = 60 * 30

const KIND: Record<RisClass, RisConsultationKind> = {
  verordnung: 'verordnung',
  gesetz: 'gesetz',
  other: 'unbestimmt',
}

/** Today in Vienna, ISO — the same basis `reconcileActive` uses for list 81. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * "BMLUK (Bundesministerium für …)" → the long name alone.
 * Falls back to the whole string, never to an empty label.
 */
function ministryNameOf(stelle: string | null): string {
  const m = /^[A-ZÄÖÜ]{2,8}\s*\((.+)\)\s*$/.exec(stelle ?? '')
  return m ? m[1]! : (stelle ?? '')
}

function toConsultation(r: RisBegutFlat, day: string): RisConsultation {
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
    // A record whose Frist has no end cannot be claimed to be running.
    active: isOpenOn(r, day),
    // Der Ausgang wird hier nicht ermittelt: Dieses Modul liest den Korpus,
    // den die Seite ohnehin hält, der Abgleich kostet Jahrgänge des
    // Bundesgesetzblatts. Wer ihn braucht, mischt ihn mit einem Zeitbudget
    // dazu (`bgblService.getBgblOutcomesForGp`, §12.32).
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

export interface RisOnlyResult {
  items: RisConsultation[]
  withGegenstand: number
  undecided: number
}

/**
 * Every Begutachtung of one GP's window that has no Ministerialentwurf.
 *
 * Costs nothing upstream that the site does not already pay: both the corpus
 * and the GP's join map are the same cached leaves the detail pages read
 * (`ris.ts`). Cached again here because the set derivation runs over a few
 * thousand records and the answer is identical for every visitor.
 */
export const getRisOnlyForGp = defineCachedFunction(
  async (gp: string): Promise<RisOnlyResult> => {
    const w = gpWindow(gp)
    if (!w) return { items: [], withGegenstand: 0, undecided: 0 }

    const [corpus, map] = await Promise.all([getRisBegutCorpus(), getRisMapForGp(gp)])

    // Claimed by a Ministerialentwurf: the record the join chose for it.
    // Those are already on a monitor page, under the ME's own citation.
    const claimed = new Set<string>()
    for (const row of map.rows) if (row.risId) claimed.add(row.risId)

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

    const day = today()
    const inGp = corpus.records.filter((r) => inWindow(r, w))
    const items = inGp
      .filter((r) => !claimed.has(r.id))
      .map((r) => toConsultation(r, day))
      .sort(sortConsultations)

    return { items, withGegenstand: inGp.length - items.length, undecided }
  },
  { name: 'ris-only-gp', base: DERIVED_CACHE, getKey: (gp: string) => gp, maxAge: RIS_ONLY_TTL_S, swr: false },
)

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
  return {
    ...toConsultation(r, today()),
    mainDocument: r.mainDocument,
    explanations: hasDocument(r.explanations) ? r.explanations : null,
    textComparison: hasDocument(r.textComparison) ? r.textComparison : null,
    coverLetter: hasDocument(r.coverLetter) ? r.coverLetter : null,
    // Der Rest, den der Satz führt — WFA, Vorblatt, Digicheck, Anhänge.
    // Gelesen wird er nur von der Volltextsuche (§12.31); die
    // Entwurfsseite zeigt weiter die vier benannten, weil sie über die
    // etwas sagen kann.
    otherDocuments: r.otherDocuments.map((d) => ({ name: d.name, formats: d.urls })),
  }
}
