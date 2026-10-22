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
import type { BgblOutcomeState } from '../../../shared/types'
import { daysUntil } from '../../../shared/utils/format'
import { ministryCodeOf, ministryScore } from './ministryCodes'
import { daysBetween, normalizeTitleText, titleComponents, titleTokens, type TitleComponents } from './titleSimilarity'

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
  /**
   * The parliamentary key of a Teil-I law, for the exact join from a
   * Vorlage to its Kundmachung (`bgblVorlage.ts`, 03.10.2026): the
   * Gesetzgebungsperiode („XXVIII"), the Regierungsvorlagen it enacts (525
   * for „525 d.B."; empty for a law from an Initiativantrag, and on every
   * Teil-II record) and the day of the Nationalrat's Beschluss, ISO. Null
   * and empty where RIS carries none.
   */
  gp: string | null
  regierungsvorlagen: number[]
  datumNationalrat: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The Vorlage numbers of a `Regierungsvorlage` field — `{ item: "525" }`,
 * and by the shape RIS uses for every repeatable field (`CelexNummer`)
 * `{ item: ["525", "526"] }` for a law that enacts more than one. Anything
 * that is not a whole number is dropped rather than guessed at.
 */
function vorlagenOf(field: any): number[] {
  const raw = [field?.item ?? []].flat()
  return raw
    .map((v: unknown) => String(v ?? '').trim())
    .filter((v: string) => /^\d+$/.test(v))
    .map(Number)
}

/**
 * One `OgdDocumentReference` of the `BgblAuth` application → a record, or
 * null without an ID. The one reading of that shape: the service's year
 * pages and the corpus scripts both go through it, so a field added here
 * reaches both (it was written out twice until 03.10.2026).
 */
export function bgblRecordOf(doc: any): BgblRecord | null {
  const m = doc?.Data?.Metadaten
  const b = m?.Bundesrecht?.BgblAuth
  const id = String(m?.Technisch?.ID ?? '')
  if (!id) return null
  return {
    id,
    teil: String(b?.Teil ?? ''),
    nummer: String(b?.Bgblnummer ?? ''),
    datum: String(b?.Ausgabedatum ?? '').slice(0, 10),
    kurztitel: m?.Bundesrecht?.Kurztitel ?? null,
    titel: m?.Bundesrecht?.Titel ?? null,
    stelle: m?.Technisch?.Einbringer ?? m?.Technisch?.Organ ?? null,
    gp: String(b?.Gesetzgebungsperiode ?? '').trim() || null,
    regierungsvorlagen: vorlagenOf(b?.Regierungsvorlage),
    datumNationalrat: String(b?.DatumNationalrat ?? '').slice(0, 10) || null,
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** The draft's side of the join, as far as it is read. */
export interface BgblJoinDraft {
  kurztitel: string | null
  titel: string | null
  stelle: string | null
  /** End of the Begutachtungsfrist, ISO. Without it no window can be drawn. */
  ende: string | null
  /**
   * Start of the Begutachtung, ISO (22.10.2026). A Kundmachung issued before
   * it cannot be its result, so the verdict never chooses one. Optional: a
   * draft without it is joined as before.
   */
  beginn?: string | null
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

/**
 * From when on the Bundesgesetzblatt's silence means something.
 *
 * Measured (`pnpm corpus:bgbl2`): between the end of the Frist and the
 * Kundmachung lie a median of 57 days, p90 197. By age of the Frist's end,
 * 0 % of the drafts from the last 30 days find a Kundmachung, 31,6 % after
 * 31–90 days, 71,4 % after 91–180 and 92,3 % after 181–365. „Bisher keine
 * Kundmachung" before that point would therefore be a statement about the
 * clock, not about the Ressort.
 */
export const BGBL_SILENCE_MEANS_SOMETHING_DAYS = 180

/**
 * What became of a Verordnungsentwurf, as a state the page may print.
 *
 * **A failure is not an answer** (docs/architecture.md §12.13), and here
 * that rule has a name: `ausstehend`. A draft whose Frist ended six weeks
 * ago is not „nicht kundgemacht" — it is young. Telling the two apart is the
 * whole difference between an accountability statement and an insinuation,
 * which is why this moved out of `bgblService.ts` on 23.09.2026: it was the
 * one rule of that file no test could execute.
 *
 * `now` is there so a test can pin the clock without mocking Date; the day
 * itself is Vienna's, decided in `#shared/utils/format` like every other day
 * decision here.
 */
export function bgblOutcomeState(
  ende: string | null,
  active: boolean,
  found: boolean,
  now: Date = new Date(),
): BgblOutcomeState {
  if (found) return 'kundgemacht'
  if (active || !ende) return 'begutachtung'
  // Whole calendar days since the Frist ended, counted like everywhere else
  // (`daysUntil`). The rounded millisecond difference this used to take
  // crossed the threshold in the middle of the afternoon, and a day early on
  // the UTC server. A Frist that will not parse now reads as young rather
  // than as „keine": a failure is not an answer (§12.13).
  const days = -(daysUntil(ende, now) ?? 0)
  return days < BGBL_SILENCE_MEANS_SOMETHING_DAYS ? 'ausstehend' : 'keine'
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
 * Never before the Begutachtung BEGAN, though (22.10.2026). A Frist is often
 * shorter than 30 days, and then the window reaches back past the Beginn —
 * to Kundmachungen that cannot be this consultation's result, because it had
 * not started. The verdict skips them (`BgblJoinDraft.beginn`). Measured over
 * the 3.018 Verordnungsentwürfe of GP XXII–XXVIII, five decisions changed:
 * three wrong matches went (the BMUKK's Grundausbildungsverordnung for the
 * BMWF's, issued the day before; the EAG-Investitionszuschüsseverordnung-Gas
 * for the Wasserstoff one, eight days before; the „cannabinomimetisch"
 * Räuchermischungen-Verordnung for the draft about „arzneilich wirksame
 * Stoffe", two days before), and two refused ties now resolve right —
 * Saisonkontingentverordnung 2022 and Winterfahrverbotskalender A 10 2024,
 * each kept out by a rival from the week before the Beginn.
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
 *
 * „Apart" is the distance in days, either way round — since 22.10.2026, when
 * the Kundmachungen from before the end of the Frist moved to the back of
 * the order (`timeRank`), the rival can lie before the best as well as after
 * it.
 */
const BGBL_TIE_DAYS = 60

/**
 * The order of time among tied titles: the Kundmachungen after the end of
 * the Frist first, earliest first; then those from before it, nearest to the
 * Frist first (22.10.2026).
 *
 * Until then the plain day count decided, and it put the window's negative
 * days FIRST — the opposite of what the comments said. A Verordnung amended
 * twice a year carries the same title every time, and the Kundmachung of
 * the PREVIOUS draft, issued while this one was still in Begutachtung, won
 * the tie: „Änderung der Lehrberufslisteverordnung" (Begutachtung 27.06. bis
 * 25.07.2024) read as kundgemacht with BGBl. II Nr. 179/2024 of 03.07.2024
 * — the June draft's — instead of Nr. 376/2024 of 18.12.2024. A Kundmachung
 * before the Frist stays possible (`BGBL_WINDOW_DAYS`), but only where no
 * equal one came after it, and never one from before the Begutachtung began.
 */
function timeRank(days: number): number {
  return days >= 0 ? days : BGBL_WINDOW_DAYS[1] - days
}

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
 * Where the content of a Verordnung's title begins: „, mit der …", „über …",
 * „betreffend …". No ministry name contains these words.
 */
const CONTENT_START_RE = /,\s*(?:mit|durch)\s+(?:der|dem|die|welcher|welchem)\b|\s(?:über|betreffend|hinsichtlich)\s/i

/**
 * The preamble cut — at the first comma, unless that comma still lies
 * inside the ministry's name (21.10.2026).
 *
 * The first comma was the only cut until then, and it broke on the
 * ministries of 2025, whose names carry commas: „für Land- und
 * Forstwirtschaft, Klima- und Umweltschutz, Regionen und
 * Wasserwirtschaft" lost only its first part, the rest of the name stayed
 * in every BMLUK title, and that remnant alone scored 0,720 — exactly
 * `BGBL_ACCEPT`. Eight BMLUK drafts, one of them still in Begutachtung,
 * were „kundgemacht" as the one Schutzwaldverordnung of BGBl. II Nr.
 * 303/2026. So where a comma comes BEFORE the content starts, the cut moves
 * to the content's start.
 *
 * Only there. Cutting every title at its content start was tried and moved
 * 21 of 1.720 matches since 2013, right ones among them: the first comma
 * sometimes lies inside the content („… Bildungsleistungen
 * (USt-BildungsleistungsVO, UStBLV)"), both sides are then cut to the same
 * tail, and that is what makes them match at 1,000.
 */
function cutPreamble(title: string): string {
  const preamble = PREAMBLE_RE.exec(title)
  if (!preamble) return title
  const content = CONTENT_START_RE.exec(title)
  if (content && title.indexOf(',') < content.index) {
    return ` ${title.slice(content.index).replace(/^,\s*/, '')}`
  }
  return title.replace(PREAMBLE_RE, ' ')
}
/**
 * „Verordnung" itself is to Teil II what „Bundesgesetz" is to Teil I: on
 * both sides of every record, hence noise. `risJoin.STOP` throws
 * „bundesgesetz" away for the same reason, but cannot throw „verordnung"
 * away — there it tells the kinds apart.
 */
const NOISE_RE = /\b(?:verordnungen|verordnung|kundmachung|novelle)\b/gi

/** The title without formula and without the noise word — what is compared. */
export function bgblTitleCore(title: string | null | undefined): string {
  const t = cutPreamble(title ?? '').replace(NOISE_RE, ' ')
  return normalizeTitleText(t)
}

/**
 * What the join reads off a Kundmachung, worked out once per record instead
 * of once per draft × record pair (22.10.2026).
 *
 * A period's join asks about the same Kundmachung for every draft whose
 * window covers it — about 770 times per draft in GP XXVII. Per pair it
 * parsed the issue date (`daysBetween`, a quarter of the join's time), read
 * the Stelle's code with a regex and cut the preamble of both titles. Held
 * weakly by the record: the Jahrgang arrays live in the derived cache, and
 * the facts go with them.
 */
interface RecordFacts {
  /** The issue date as a day number, so the window is one subtraction. */
  day: number
  /** `ministryCodeOf` the Stelle. */
  code: string
  /** The distinct title cores, cut on first use — most records are never scored. */
  cores: readonly string[] | null
}

const recordFacts = new WeakMap<BgblRecord, RecordFacts>()

function factsOf(record: BgblRecord): RecordFacts {
  let facts = recordFacts.get(record)
  if (!facts) {
    facts = { day: dayNumber(record.datum), code: ministryCodeOf(record.stelle), cores: null }
    recordFacts.set(record, facts)
  }
  return facts
}

/**
 * Days since 1970-01-01 — `daysBetween` from a fixed start, so the
 * difference of two of them is exactly `daysBetween` of the two dates (both
 * count whole UTC days).
 */
function dayNumber(iso: string): number {
  return daysBetween('1970-01-01', iso)
}

/**
 * The cores worth comparing: empty ones dropped, and a Kurztitel that cuts to
 * the same core as the Titel compared once — it scores the same twice.
 */
function distinctCores(...titles: (string | null)[]): string[] {
  const out: string[] = []
  for (const title of titles) {
    const core = bgblTitleCore(title)
    if (core && !out.includes(core)) out.push(core)
  }
  return out
}

function coresOf(record: BgblRecord, facts: RecordFacts): readonly string[] {
  return (facts.cores ??= distinctCores(record.kurztitel, record.titel))
}

/**
 * The containment a pair may count — `cont`, unless one side is a single
 * word that the other side does not carry verbatim (22.10.2026).
 *
 * `titleComponents` matches two words of eight letters or more when one
 * begins with the other, which is what lets „AltlastenatlasVO" find
 * „Altlastenatlas-VO". On a side of ONE word that soft match is the whole
 * containment, and it is far too cheap: „Psychotropen" (of the
 * „Psychotropen-Grenzmengenverordnung") begins „Psychotropenverordnung",
 * „Lehrberuf" begins „Lehrberufsliste", „Wasserstoff" begins
 * „Wasserstoffverordnung" — each scored 0,900 against `BGBL_ACCEPT` 0,72.
 * `risJoin` refuses the same case by requiring two words. Measured over the
 * 1.405 matches of GP XXV–XXVIII: 13 rested on such a prefix, nine of them
 * plainly wrong — and the wrong ones did not only claim a number, they also
 * tied with the right Kundmachung and kept 13 drafts from their own.
 *
 * Exact, the single word still counts („Mutterschutzverordnung" against
 * „Mutterschutzverordnung – MSchV"); soft, it is left to `jac` and `lcp`,
 * which keep the right prefix matches: „Novelle der
 * Schweinegesundheits-Verordnung" scores 0,850 by its common beginning
 * with „1. Novelle der Schweinegesundheitsverordnung".
 */
function containment(c: TitleComponents, left: string, right: string): number {
  if (Math.min(c.nA, c.nB) !== 1) return c.cont
  // `nA`/`nB` count distinct words, so a side of one may name it twice.
  const [single, other] = c.nA === 1 ? [titleTokens(left)[0], titleTokens(right)] : [titleTokens(right)[0], titleTokens(left)]
  return single !== undefined && other.includes(single) ? c.cont : 0
}

/** Every draft core against every Kundmachung core; the best pair counts. */
function coreScore(lefts: readonly string[], rights: readonly string[]): number {
  let best = 0
  for (const left of lefts) {
    for (const right of rights) {
      const c = titleComponents(left, right)
      // `cont` is load-bearing, because the Kundmachung often SHORTENS the
      // draft's title („Änderung der Honigverordnung" against the full
      // Verordnung title); `jac` holds against it where containment alone
      // would be too cheap.
      const s = Math.max(c.jac, containment(c, left, right) * 0.9, c.lcp * 0.85)
      if (s > best) best = s
    }
  }
  return Math.round(best * 1000) / 1000
}

/** Every draft title against every Kundmachung title; the best one counts. */
export function bgblTitleScore(draft: BgblJoinDraft, record: BgblRecord): number {
  return coreScore(distinctCores(draft.kurztitel, draft.titel), coresOf(record, factsOf(record)))
}

/** One scored candidate. */
interface BgblCandidate {
  record: BgblRecord
  score: number
  /** Days between the end of the Frist and the date of issue. */
  days: number
  /** 1 the same Ressort, 0.5 a legal successor, 0 a foreign one. */
  ministry: number
  /** Issued before the Begutachtung began — never this draft's Kundmachung. */
  beforeBeginn: boolean
}

/** The result: one match, with its distance to the second best. */
interface BgblMatch extends BgblCandidate {
  margin: number
}

/**
 * The candidates in the window, scored and sorted descending — all of them,
 * or for the `verdict` only those it may choose: of the draft's own Ressort
 * and its lineage, and not issued before the Begutachtung began.
 *
 * Both are checked BEFORE the titles are compared (22.10.2026). A foreign
 * record is refused whatever its title scores, so scoring it bought nothing
 * but the comparison itself — and those were most of them: the window of a
 * GP XXVII draft holds on average 772 records of Teil II, 118 of them of its
 * own Ressort. Comparing every one took 7,4 s for the period and filled the
 * title memo with pairs that could never match.
 */
function rankCandidates(draft: BgblJoinDraft, records: readonly BgblRecord[], verdict: boolean): BgblCandidate[] {
  if (!draft.ende) return []
  const codes = new Set([ministryCodeOf(draft.stelle)])
  const ende = dayNumber(draft.ende)
  const beginn = draft.beginn ? draft.beginn.slice(0, 10) : null
  const lefts = distinctCores(draft.kurztitel, draft.titel)
  // `ministryScore` walks the lineage groups for every foreign Stelle; a
  // window holds a few dozen Stellen, not hundreds of them.
  const ministryByCode = new Map<string, number>()
  const out: BgblCandidate[] = []
  for (const record of records) {
    if (record.teil !== 'Teil2' || !record.datum) continue
    const facts = factsOf(record)
    const days = facts.day - ende
    if (days < BGBL_WINDOW_DAYS[0] || days > BGBL_WINDOW_DAYS[1]) continue
    const beforeBeginn = beginn !== null && record.datum < beginn
    if (verdict && beforeBeginn) continue
    let ministry = ministryByCode.get(facts.code)
    if (ministry === undefined) {
      ministry = ministryScore(codes, facts.code)
      ministryByCode.set(facts.code, ministry)
    }
    if (verdict && ministry <= 0) continue
    const score = coreScore(lefts, coresOf(record, facts))
    if (score <= 0) continue
    out.push({ record, score, days, ministry, beforeBeginn })
  }
  // By score, and on a tie by `timeRank`: if the same text is amended twice,
  // the first Kundmachung after the Frist is the one from this Begutachtung.
  return out.sort((a, b) => b.score - a.score || timeRank(a.days) - timeRank(b.days))
}

/**
 * A draft's candidates, scored and sorted descending.
 *
 * Kept apart from the verdict so the measurement can see what just missed —
 * a threshold checked only against its hits is not checked at all. That is
 * also why this one still scores the foreign Stellen and the Kundmachungen
 * from before the Beginn, flagged (`ministry` 0, `beforeBeginn`): the
 * verdict below skips both unscored.
 */
export function bgblCandidates(draft: BgblJoinDraft, records: readonly BgblRecord[]): BgblCandidate[] {
  return rankCandidates(draft, records, false)
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
  // The same ranking as `bgblCandidates(…).filter((c) => c.ministry > 0 &&
  // !c.beforeBeginn)` — the sort is stable, so dropping those records first
  // changes no order — without scoring what would be thrown away. Nor is a
  // record from before the Beginn a rival in the tie below: it cannot be
  // this draft's at all.
  const ranked = rankCandidates(draft, records, true)
  const best = ranked[0]
  if (!best || best.score < BGBL_ACCEPT) return null
  const second = ranked[1]
  const margin = best.score - (second?.score ?? 0)
  // A tie on the titles: then the time decides, in favour of the FIRST
  // Kundmachung after the end of the Frist — `rankCandidates` already sorts
  // for that. If the two lie close together, the time says nothing either,
  // and then two answers are none; and where the score prefers one and the
  // time the other, there is no answer either.
  const unclear = (rival: BgblCandidate) =>
    best.score - rival.score < BGBL_MARGIN &&
    (Math.abs(rival.days - best.days) < BGBL_TIE_DAYS || timeRank(rival.days) < timeRank(best.days))
  // The rivals are the second — and every Kundmachung from before the Frist,
  // which the order now puts behind those after it. Before 22.10.2026 it
  // stood in front, where the check between the first two saw it; moving it
  // back must not hide it from that check. Compared with the second alone,
  // „Änderung der Suchtgiftverordnung" (Frist 16.04.2020) would read as Nr.
  // 215/2020 (+32 days), though Nr. 145/2020 (−7 days) carries the same
  // title. (Every near-tie instead of the second: one decision in 2.402
  // changes, and it loses a right match — a draft in two parts, both
  // promulgated on the same day.)
  if (ranked.slice(1).some((c, i) => (i === 0 || c.days < 0) && unclear(c))) return null
  return { ...best, margin: Math.round(margin * 1000) / 1000 }
}
