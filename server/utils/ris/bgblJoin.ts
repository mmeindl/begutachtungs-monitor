/**
 * From a Verordnungsentwurf to its Kundmachung in BGBl II
 * (docs/architecture.md §12.32).
 *
 * PURE MODULE — relative imports only, so vitest and the measurement
 * scripts can execute it directly.
 *
 * THE PROBLEM. Two thirds of the corpus are Verordnungsentwürfe, and for
 * them the monitor ends at the Frist today: no Gegenstand at Parliament, no
 * Regierungsvorlage, no station after it. The path exists all the same —
 * Begutachtung → Erlassung by the ressort → Kundmachung in **BGBl II** — it
 * just does not run through Parliament. What is missing is the key: the
 * Begut record and the BGBl record share none, so one has to be built.
 *
 * THE SAME MECHANICS AS RIS↔ME, deliberately. `risJoin.ts` has already
 * measured and calibrated title similarity, Ressort lineage and a date
 * window for exactly this task; this module borrows the parts instead of
 * opening a second school of similarity. What differs here stands below:
 * the noise word and the direction of the date.
 *
 * WHAT THE JOIN MAY NOT DO. „Nicht kundgemacht" is the statement that hurts
 * — it reads as „das Ressort hat die Verordnung fallen gelassen". A missed
 * match therefore does not say „wir wissen es nicht", it says something
 * false about a Ressort. Hence the high threshold, hence the ambiguity
 * margin, and hence `BgblOutcome`'s third state: `unknown`, for everything
 * the window cannot decide yet.
 */
import { ministryCodeOf, ministryScore } from './ministryCodes'
import { daysBetween, normalizeTitleText, titleComponents } from './titleSimilarity'

/** One Bundesgesetzblatt record, as much of it as the join needs. */
export interface BgblRecord {
  /** `BGBLA_2026_II_50` */
  id: string
  /** `Teil1` | `Teil2` | `Teil3` */
  teil: string
  /** „BGBl. II Nr. 50/2026" */
  nummer: string
  /** ISO date of issue. */
  datum: string
  kurztitel: string | null
  titel: string | null
  /** „BMASGPK (Bundesministerium für …)" — the same spelling as in Begut. */
  stelle: string | null
}

/** The draft's side of the join, as far as it is read. */
export interface BgblJoinDraft {
  kurztitel: string | null
  titel: string | null
  stelle: string | null
  /** End of the Begutachtungsfrist, ISO. Without it no window can be drawn. */
  ende: string | null
}

/**
 * Is this Jahrgang still growing?
 *
 * `bgblService.ts` cuts the corpus by year and caches the two kinds of year
 * differently: the running one for six hours, because it gains a piece a few
 * times a week, the closed one for the lifetime of a published document,
 * because it cannot change any more. Which of the two a year is decides the
 * whole thing, and the obvious answer — „the year of today, and everything
 * after it" — carries one day on which it is wrong.
 *
 * ON 1 JANUARY the Jahrgang that closed hours ago moves into the closed
 * namespace, and its first fresh read there is pinned for 30 days. A
 * Kundmachung dated in the last days of December that RIS indexes AFTER that
 * read therefore stays invisible until February. That is not a cosmetic
 * delay: by then the Frist of the draft behind it can be older than 180 days,
 * and `stateOf` stops saying `ausstehend` and says `keine` — „bisher nicht
 * kundgemacht" about a Verordnung that has been in force since New Year's
 * Eve. §12.32 forbids exactly that sentence, and a wrong one is worse than a
 * missing one, because it reads as a statement about the Ressort.
 *
 * So a Jahrgang stays running for a grace period: until the end of January
 * the year before is still asked on the six-hour lifetime. The price is one
 * more RIS read per six hours on one extra year, for one month a year — the
 * same order as the running year costs all year round.
 *
 * `today` is passed in, not read here: the Vienna day is decided in one place
 * (`#shared/utils/format.todayIso` — on New Year's night the UTC year lags
 * Austria's by an hour), and a test can pin the clock without mocking Date.
 */
export function isRunningYear(year: number, today: string): boolean {
  const thisYear = Number(today.slice(0, 4))
  return year >= (today.slice(5, 7) === '01' ? thisYear - 1 : thisYear)
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * The window between the end of the Frist and the date of issue, in days.
 *
 * The lower bound is negative and not zero: a Kundmachung CAN fall before
 * the formal end of the Frist, when the Verordnung is urgent and the ressort
 * lets the Begutachtung run in parallel. −30 admits that case without
 * catching the preceding version of the same Verordnung.
 *
 * The upper bound is generous because it costs nothing: the title decides,
 * the date only narrows. Measured (`pnpm corpus:bgbl2`), the median lies far
 * below it; what the 540 days prevent is the match on the NEXT Novelle of
 * the same text two years later.
 */
export const BGBL_WINDOW_DAYS: readonly [number, number] = [-30, 540]

/**
 * The title similarity at which a match counts, and how far ahead of the
 * second it has to lie. Both values are measured, not set — the calibration
 * is in `docs/architecture.md` §12.32.
 */
export const BGBL_ACCEPT = 0.72
export const BGBL_MARGIN = 0.08
/**
 * How far the second-best Kundmachung has to lie away in time before a tie
 * on the titles can be decided after all.
 *
 * On a tie the time decides, in favour of the first Kundmachung AFTER the
 * end of the Frist — unless the two lie less than 60 days apart, because
 * below that the order says nothing either (a Berichtigung or a second part
 * can come out of the same Begutachtung). The first version refused exactly
 * these cases as ambiguous, which cost 21 drafts, among them candidates
 * scoring 1,000 (docs/architecture.md §12.32).
 */
const BGBL_TIE_DAYS = 60

/**
 * A Verordnung's formulaic preamble, which says nothing about the title.
 *
 * „Verordnung des Bundesministers für Finanzen, mit der die
 * Sachbezugswerteverordnung geändert wird" carries four words of content and
 * a dozen of formula. The Ressort already sits in its own field — left in
 * the title we would compare it twice and let „Finanzen" against „Finanzen"
 * support a match the title does not give.
 */
const PREAMBLE_RE =
  /^verordnung\s+(?:des|der)\s+bundesminister(?:s|in)?[^,]*,\s*/i
/**
 * „Verordnung" itself is to Teil II what „Bundesgesetz" is to Teil I: on
 * both sides of every record, hence noise. `risJoin.STOP` throws
 * „bundesgesetz" away for the same reason, but cannot throw „verordnung"
 * away — there it tells the kinds apart.
 */
const NOISE_RE = /\b(?:verordnungen|verordnung|kundmachung|novelle)\b/gi

/** The title without formula and without the noise word — what is compared. */
export function bgblTitleCore(title: string | null | undefined): string {
  const t = (title ?? '').replace(PREAMBLE_RE, ' ').replace(NOISE_RE, ' ')
  return normalizeTitleText(t)
}

/** Every draft title against every Kundmachung title; the best one counts. */
export function bgblTitleScore(draft: BgblJoinDraft, record: BgblRecord): number {
  let best = 0
  for (const a of [draft.kurztitel, draft.titel]) {
    const left = bgblTitleCore(a)
    if (!left) continue
    for (const b of [record.kurztitel, record.titel]) {
      const right = bgblTitleCore(b)
      if (!right) continue
      const c = titleComponents(left, right)
      // `cont` is load-bearing, because the Kundmachung often SHORTENS the
      // draft's title („Änderung der Honigverordnung" against the full
      // Verordnung title); `jac` holds against it where containment alone
      // would be too cheap.
      const s = Math.max(c.jac, c.cont * 0.9, c.lcp * 0.85)
      if (s > best) best = s
    }
  }
  return Math.round(best * 1000) / 1000
}

/** One scored candidate. */
interface BgblCandidate {
  record: BgblRecord
  score: number
  /** Days between the end of the Frist and the date of issue. */
  days: number
  /** 1 the same Ressort, 0.5 a legal successor, 0 a foreign one. */
  ministry: number
}

/** The result: one match, with its distance to the second best. */
interface BgblMatch extends BgblCandidate {
  margin: number
}

/**
 * A draft's candidates, scored and sorted descending.
 *
 * Kept apart from the verdict so the measurement can see what just missed —
 * a threshold checked only against its hits is not checked at all.
 */
export function bgblCandidates(draft: BgblJoinDraft, records: readonly BgblRecord[]): BgblCandidate[] {
  if (!draft.ende) return []
  const codes = new Set([ministryCodeOf(draft.stelle)])
  const out: BgblCandidate[] = []
  for (const record of records) {
    if (record.teil !== 'Teil2' || !record.datum) continue
    const days = daysBetween(draft.ende, record.datum)
    if (days < BGBL_WINDOW_DAYS[0] || days > BGBL_WINDOW_DAYS[1]) continue
    const ministry = ministryScore(codes, ministryCodeOf(record.stelle))
    const score = bgblTitleScore(draft, record)
    if (score <= 0) continue
    out.push({ record, score, days, ministry })
  }
  // By score, and on a tie the earlier date: if the same text is amended
  // twice, the first Kundmachung after the Frist is the one from this
  // Begutachtung.
  return out.sort((a, b) => b.score - a.score || a.days - b.days)
}

/**
 * The Kundmachung belonging to a draft — or null.
 *
 * A foreign Ressort is a hard no, not a deduction. Two titles can resemble
 * each other by accident („Ratenzahlungs-Verordnung" of the E-Control board
 * against a ressort's Verordnung); that two different bodies issue the same
 * Verordnung cannot be. The lineage groups from `risJoin` absorb the change
 * of government that can fall between Frist and Kundmachung.
 */
export function joinDraftToBgbl(draft: BgblJoinDraft, records: readonly BgblRecord[]): BgblMatch | null {
  const ranked = bgblCandidates(draft, records).filter((c) => c.ministry > 0)
  const best = ranked[0]
  if (!best || best.score < BGBL_ACCEPT) return null
  const second = ranked[1]
  const margin = best.score - (second?.score ?? 0)
  // A tie on the titles: then the time decides, in favour of the FIRST
  // Kundmachung after the end of the Frist — `bgblCandidates` already sorts
  // for that. If the two lie close together, the time says nothing either,
  // and then two answers are none.
  if (second && margin < BGBL_MARGIN && second.days - best.days < BGBL_TIE_DAYS) return null
  return { ...best, margin: Math.round(margin * 1000) / 1000 }
}
