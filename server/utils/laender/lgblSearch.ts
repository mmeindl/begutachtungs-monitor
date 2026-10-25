/**
 * The Kundmachung of a Land's draft, found by the monitor itself in the
 * Landesgesetzblatt (22.10.2026) — for the Länder whose own pages stop at
 * the Begutachtung (Salzburg, Wien, Oberösterreich's Verordnungen).
 *
 * BY TITLE, and measured before it was built (docs/architecture.md §12.43):
 * on the 83 Oberösterreich Gesetze whose Landtag record names the LGBl, 77
 * right, 2 wrong, 4 not found; on Salzburg's closed drafts since 2015,
 * 91,5 % found. The rule that carried it:
 *
 * - Candidates: the Land's LGBl of the matching type (a Gesetz is a
 *   Landes(verfassungs)gesetz, a Verordnung a Verordnung or Kundmachung),
 *   kundgemacht 0–730 days after the draft's start (or Fristende).
 * - Similarity on the DISTINCTIVE words only — law names, places, the
 *   subject. The template („Gesetz, mit dem das Salzburger … geändert
 *   wird") is stop words: whole-string similarity made the
 *   Wettunternehmergesetz look like the Landwirtschaftskammergesetz.
 * - Accepted when at least 80 % of the draft's words stand in the LGBl's
 *   title; the best by F1, and among equals the earliest.
 *
 * Two guards were built and taken out again the same day, each refuted by
 * the oracle:
 * - An F1 floor against omnibus laws: all seven oracle finds below F1 0,4
 *   are RIGHT — a short-named law („Oö. Deregulierungsgesetz 2025") is
 *   kundgemacht under a title that lists every law it amends.
 * - One LGBl, one draft: the oracle holds two Begutachtungen of the
 *   Feuerwehrgesetz (2023, 2024) and one Kundmachung. A second round
 *   shares the first one's LGBl. (The twelve Salzburg „drafts" claiming
 *   one LGBl were one draft filed as twelve annexes — `salzburgDrafts`.)
 *
 * What it cannot see: the same law amended twice inside the window takes
 * the earlier Kundmachung (both oracle errors). Hence the asymmetry the
 * page keeps, as for the Bund's Verordnungen (§12.32): a find stands with
 * its link, to be checked; a miss is „keine Kundmachung gefunden", never
 * „nicht kundgemacht".
 */
import type { LandConsultation, LandStage } from '#shared/types'

export interface LgblEntry {
  /** „LGBl. Nr. 57/2026" */
  nr: string
  /** RIS's type: Landesgesetz, Landesverfassungsgesetz, Verordnung, Kundmachung, Sonstiges. */
  typ: string
  titel: string
  /** ISO date of the Kundmachung. */
  datum: string
  /** The ELI link RIS gives. */
  url: string | null
}

/** Per draft: the find, or why there is none. */
export type LgblResult =
  | { state: 'gefunden'; stage: LandStage }
  | { state: 'nicht-gefunden' }
  /** Begun before the authentic Landesgesetzblatt in RIS (2015; Wien 2014). */
  | { state: 'vor-ris' }

const WINDOW_DAYS = 730
const MIN_CONTAINMENT = 0.8

const TYPES: Record<LandConsultation['kind'], ReadonlySet<string>> = {
  gesetz: new Set(['Landesgesetz', 'Landesverfassungsgesetz']),
  verordnung: new Set(['Verordnung', 'Kundmachung']),
}

const MONTHS = 'jänner|januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember'
const STOP = new Set(`gesetz gesetzes landesgesetz verordnung kundmachung landesverfassungsgesetz mit dem der die das des den wird werden
geändert geaendert änderung aenderung erlassen erlassung und sowie über ueber zur zum von vom für fuer ein eine einer eines im in an auf
salzburger salzburg oö oberösterreichische oberösterreich wiener wien tiroler tirol kärntner kärnten landesregierung landeshauptmannes landeshauptfrau landeshauptmann land landes
inkl textgegenüberstellung tgü erläuterungen novelle betreffend durch`.split(/\s+/))

/** The title reduced to what can match: no date, no years, no punctuation. */
export function lgblNorm(title: string): string {
  return title.toLowerCase()
    .replace(new RegExp(`\\bvom \\d{1,2}\\. (?:${MONTHS}) \\d{4}`, 'gu'), ' ')
    .replace(/\b(?:der|des) (?:oö\. |salzburger |wiener |tiroler |kärntner )?landesregierung\b/gu, ' ')
    .replace(/\b(?:entwurf|begutachtung)\b/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    // Years wander between draft and Kundmachung („Novelle 2024" → „2025").
    .replace(/\b(?:19|20)\d\d\b/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The distinctive words: the title without its template. */
export function lgblWords(title: string): Set<string> {
  return new Set(lgblNorm(title).split(' ').filter((w) => w.length > 1 && !STOP.has(w)))
}

const DAY_MS = 86_400_000

interface Claim { entry: LgblEntry; f1: number; candidates: number }

/** The best candidate for one draft, before the one-draft-per-LGBl guard. */
function bestFor(draft: LandConsultation, index: readonly IndexedEntry[], ref: string): Claim | null {
  const full = bestForWords(lgblWords(draft.title), draft, index, ref)
  if (full) return full
  // A draft that explains itself in brackets the Kundmachung leaves out
  // („… Fischereiverordnung geändert wird (Managementmaßnahme Signalkrebs
  // Pacifastacus leniusculus)", „(NG-VO)"): once more without them, where
  // what remains still says what law it is — two distinctive words, or one
  // that is a law's name.
  const core = lgblWords(draft.title.replace(/\([^)]*\)/g, ' '))
  const named = core.size === 1 && /^.{8,}(?:gesetz|verordnung|ordnung|statut)$/.test([...core][0]!)
  return core.size >= 2 || named ? bestForWords(core, draft, index, ref) : null
}

function bestForWords(words: Set<string>, draft: LandConsultation, index: readonly IndexedEntry[], ref: string): Claim | null {
  if (!words.size) return null
  const from = Date.parse(ref)
  const to = from + WINDOW_DAYS * DAY_MS
  let best: Claim | null = null
  let candidates = 0
  for (const e of index) {
    if (!TYPES[draft.kind].has(e.entry.typ)) continue
    const at = Date.parse(e.entry.datum)
    if (at < from || at > to) continue
    let shared = 0
    for (const w of words) if (e.words.has(w)) shared++
    if (shared / words.size < MIN_CONTAINMENT - 1e-9) continue
    const f1 = (2 * shared) / (words.size + e.words.size)
    candidates++
    if (!best || f1 > best.f1 + 1e-4 || (Math.abs(f1 - best.f1) <= 1e-4 && e.entry.datum < best.entry.datum)) {
      best = { entry: e.entry, f1, candidates: 0 }
    }
  }
  if (best) best.candidates = candidates
  return best
}

interface IndexedEntry { entry: LgblEntry; words: Set<string> }

/**
 * Every closed draft of one Land against that Land's Landesgesetzblatt.
 * Drafts the Land records itself (`stage` set) and running ones are left
 * out: the first have their answer, the second cannot have one yet.
 */
export function matchLgbl(
  drafts: readonly LandConsultation[],
  lgbl: readonly LgblEntry[],
  today: string,
): Map<string, LgblResult> {
  const results = new Map<string, LgblResult>()
  if (!lgbl.length) return results
  const index: IndexedEntry[] = lgbl.map((entry) => ({ entry, words: lgblWords(entry.titel) }))
  const risSince = lgbl.reduce((min, e) => (e.datum < min ? e.datum : min), lgbl[0]!.datum)

  for (const d of drafts) {
    if (d.stage !== undefined) continue
    const ref = d.startedAt ?? d.deadline
    if (!ref || (d.deadline !== null && d.deadline >= today)) continue
    const claim = bestFor(d, index, ref)
    if (claim) {
      results.set(d.id, {
        state: 'gefunden',
        stage: {
          station: 'bgbl',
          label: 'Kundgemacht',
          detail: claim.entry.nr,
          date: claim.entry.datum,
          url: claim.entry.url,
          via: 'suche',
          unique: claim.candidates === 1,
        },
      })
    } else {
      // A miss means something only where RIS covers the window: a draft
      // begun before the Land's first LGBl in RIS may have been kundgemacht
      // before it too.
      results.set(d.id, { state: ref < risSince ? 'vor-ris' : 'nicht-gefunden' })
    }
  }
  return results
}
