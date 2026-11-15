/**
 * The Anliegen an das Parlament of a period and the page of one — the
 * Nuxt-aware glue around the pure readers in `anliegen.ts` and `list143.ts`
 * (step 1 of `docs/research/umsetzungsplan-petitionen-volksbegehren.md`).
 *
 * WHAT IT READS:
 *  - list 101, three calls per period — `{ GP_CODE, ITYP: ['PET'] }`,
 *    `{ …, ITYP: ['BI'] }`, `{ …, ITYP: ['I'], DOKTYP: ['VOLKBG'] }` (GP
 *    XXVIII: 29, 36 and 5 rows on 14.11.2026). Not through `getItemsForGp`:
 *    that read is the Vorlagen', and a Volksbegehren in it would have to be
 *    filtered out by every consumer. Never `{ GP_CODE }` alone (76,000 rows).
 *  - list 143, the same three filters, for the counts and `AKTIV`. Never
 *    without `GP_CODE` and `ITYP`: unfiltered 655,099 rows. List 305 holds
 *    supporters by name, postcode and town and is read nowhere.
 *  - the item's detail JSON, through a leaf of its own that keeps the record
 *    REDUCED (`reduceAnliegenContent`): the Erstunterzeichner of a
 *    Bürgerinitiative and the addressees of the committee's requests never
 *    reach a cache.
 *
 * The API ignores a filter key it does not know and answers with the whole
 * list, so every answer is checked against its own `count` and every row
 * against the period and the kind asked for, before anything is cached.
 */
import type { AnliegenCounts, AnliegenDetail, AnliegenKind, AnliegenListResponse, AnliegenRoot, AnliegenRow, AnliegenState } from '#shared/types'
import {
  ANLIEGEN_NR_KINDS,
  BUNDESRAT_SEGMENT,
  anliegenArrivedInGp,
  anliegenIsBundesrat,
  anliegenItemType,
  anliegenParliamentUrl,
  anliegenStateOf,
} from '#shared/utils/anliegen'
import { gpHasEnded } from '#shared/utils/gp'
import { withinBudget } from '../http/budget'
import { mapWithConcurrency } from '../pool'
import { LIST_STALE_S, SETTLED_STALE_S, SETTLED_TTL_S, UPSTREAM_LIST_TTL_S } from '../cache/ttl'
import { staleWithin } from '../cache/stale'
import {
  assertListHeader,
  assertRowsMatchGp,
  fetchFilterList,
  fetchGegenstand,
  type FilterListResponse,
} from '../upstream/parliament'
import {
  ANLIEGEN_FILTERS,
  VOLKSBEGEHREN_FIRST_GP,
  anliegenIsFollowed,
  assembleAnliegenDetail,
  anliegenTitleOf,
  assertAnliegenContent,
  bundesratRowOf,
  lastStepDate,
  readAnliegenCourse,
  reduceAnliegenContent,
  rowIsAnliegen,
  rowIsBundesratParticipation,
  type AnliegenContent,
} from './anliegen'
import { mapVorlageRow } from './list101'
import { mapParticipationRow, type ParticipationRow } from './list143'
import type { NotFollowedData } from './vorlageDetail'

/**
 * Detail reads at a time — the committee reads' limit, as for the Anträge.
 * Eight was tried on 15.11.2026 and bought nothing: a cold period reads at
 * 23 to 28 records a second at four and at eight alike (GP XXIV 13 to 17 s,
 * XXVII 13 to 18 s), with the reader's own work under 0.1 s for a whole
 * period. The limit is not this pool.
 */
const READ_CONCURRENCY = 4

/**
 * How long the list's WHOLE answer waits — lists and records together — before
 * it answers with what came (15.11.2026). Until then only the records had a
 * budget (20 s), behind two rounds of list reads that had none but the
 * client's 8 s × 3 attempts each: 40–88 s with Parliament slow, 502 after
 * 61 s for GP XXVII. Kept at the records' old 20 s: under the homepage
 * block's 30-s browser budget, and with Parliament fast (0.2–0.8 s a call)
 * a cold running period answers whole in about 5 s. What is not in by then
 * runs on into its cache (`withinBudget`): a kind's list is named in
 * `unread.kinds`, a record's row keeps `state: null`.
 */
const LIST_BUDGET_MS = 20_000

/**
 * How long one Anliegen's page waits for its record and its counts, read side
 * by side (15.11.2026). One attempt's timeout (8 s) and a quick retry fit; the
 * client's worst case of three hanging attempts (~25 s), once twice in a row
 * with list 143 after it, does not. A record not in by then is a 504 with
 * the client's own words; counts not in are null, „nicht abrufbar".
 */
const DETAIL_BUDGET_MS = 10_000

/** One Anliegen as list 101 names it. */
export interface AnliegenListEntry {
  root: AnliegenRoot
  title: string
  /** Einlangen, ISO; null where the row has no sortable date. */
  arrivedAt: string | null
  parliamentUrl: string
  /** „56/PET-BR/2024" — only a Petition an den Bundesrat's, whose citation carries a year the root does not. */
  citation?: string
}

/** The filter body of one kind's read — the same for lists 101 and 143. */
function filterOf(gp: string, kind: AnliegenKind): Record<string, string[]> {
  const f = ANLIEGEN_FILTERS[kind]
  return f.doktyp ? { GP_CODE: [gp], ITYP: [f.ityp], DOKTYP: [f.doktyp] } : { GP_CODE: [gp], ITYP: [f.ityp] }
}

/** The answer holds what its `count` says, and only rows of the period and kind asked for. */
function assertAnliegenRows(res: FilterListResponse, listId: number, gp: string, kind: AnliegenKind): unknown[][] {
  const rows = res.rows ?? []
  assertRowsMatchGp(rows, gp, listId)
  if (typeof res.count === 'number' && res.count !== rows.length) {
    throw createError({ statusCode: 502, statusMessage: `Upstream-Liste unvollständig (Liste ${listId}, ${rows.length} von ${res.count} Zeilen, ${kind}, GP ${gp})` })
  }
  if (!rows.every((row) => rowIsAnliegen(row, gp, kind))) {
    throw createError({ statusCode: 502, statusMessage: `Upstream-Filter hat nicht gegriffen (Liste ${listId}, ${kind}, GP ${gp})` })
  }
  return rows
}

/**
 * The Petitionen, Bürgerinitiativen or Volksbegehren of one period, from
 * list 101 — ONE KIND PER CACHE ENTRY, so a failed read of one kind takes
 * the others down neither on the way nor in the cache. Derived, because the
 * mapping is ours; the checks run inside the cache, so an answer that
 * ignored the filter is never stored, and a throw is never cached (as no
 * list at all, let alone as an empty one).
 */
export const getAnliegenOfKind = defineCachedFunction(
  async (gp: string, kind: AnliegenKind): Promise<AnliegenListEntry[]> => {
    const res = await fetchFilterList(101, filterOf(gp, kind))
    const rows = assertAnliegenRows(res, 101, gp, kind)
    assertListHeader(101, res)
    return rows.map((row): AnliegenListEntry => {
      const v = mapVorlageRow(row)
      const root: AnliegenRoot = { gp, kind, inr: v.inr }
      // A member who handed a Petition in is never named, also not in its title (64/PET XXII).
      return { root, title: anliegenTitleOf(v.title), arrivedAt: v.date || null, parliamentUrl: anliegenParliamentUrl(root) }
    })
  },
  {
    name: 'anliegen-kind',
    base: DERIVED_CACHE,
    getKey: (gp: string, kind: AnliegenKind) => `${gp}-${kind}`,
    ...staleWithin(UPSTREAM_LIST_TTL_S, LIST_STALE_S),
  },
)

/**
 * The kinds of a period, each read on its own: the entries that came, and
 * the kinds whose read failed — named, never counted as none. A Volksbegehren
 * before GP XXII is not followed (`anliegenIsFollowed`) and not read.
 */
function followedKinds(gp: string): AnliegenKind[] {
  return ANLIEGEN_NR_KINDS.filter((kind) => anliegenIsFollowed({ gp, kind, inr: 1 }))
}

export async function getAnliegenForGp(gp: string, budgetMs?: number): Promise<{ entries: AnliegenListEntry[]; unreadKinds: AnliegenKind[] }> {
  const kinds = followedKinds(gp)
  // With a budget, a kind not in by then is unread too; its read runs on into the cache.
  const lists = await Promise.all(kinds.map((kind) => {
    const read = getAnliegenOfKind(gp, kind)
    return budgetMs === undefined ? read.catch(() => null) : withinBudget(read, budgetMs)
  }))
  const entries: AnliegenListEntry[] = []
  const unreadKinds: AnliegenKind[] = []
  lists.forEach((list, i) => {
    if (list) entries.push(...list)
    else unreadKinds.push(kinds[i]!)
  })
  return { entries, unreadKinds }
}

/** List 143 of one period, the three kinds, header and rows checked. */
export const getAnliegenParticipation = defineCachedFunction(
  async (gp: string): Promise<ParticipationRow[]> => {
    const parts = await Promise.all(ANLIEGEN_NR_KINDS.map(async (kind) => {
      const res = await fetchFilterList(143, filterOf(gp, kind))
      const rows = assertAnliegenRows(res, 143, gp, kind)
      assertListHeader(143, res)
      return rows.map(mapParticipationRow)
    }))
    return parts.flat()
  },
  { name: 'anliegen-participation', base: DERIVED_CACHE, getKey: (gp: string) => gp, ...staleWithin(UPSTREAM_LIST_TTL_S, LIST_STALE_S) },
)

/**
 * Every Petition an den Bundesrat, from list 101 `{ ITYP: ['PET-BR'] }` —
 * once, not per period: the Bundesrat has none, and list 101's first column
 * (XX to XXVII on 15.11.2026) is no address. Every row is checked against
 * type, document type and its own `HIS_URL` „/gegenstand/BR/PET-BR/<nr>"
 * (`bundesratRowOf`), the answer against its `count`, before anything is
 * cached. 42 rows on 15.11.2026, the last of April 2024.
 */
export const getBundesratPetitions = defineCachedFunction(
  async (): Promise<AnliegenListEntry[]> => {
    const res = await fetchFilterList(101, { ITYP: ['PET-BR'] })
    const rows = res.rows ?? []
    if (typeof res.count === 'number' && res.count !== rows.length) {
      throw createError({ statusCode: 502, statusMessage: `Upstream-Liste unvollständig (Liste 101, ${rows.length} von ${res.count} Zeilen, PET-BR)` })
    }
    const read = rows.map(bundesratRowOf)
    if (read.some((r) => r === null)) {
      throw createError({ statusCode: 502, statusMessage: 'Upstream-Filter hat nicht gegriffen (Liste 101, PET-BR)' })
    }
    assertListHeader(101, res)
    return rows.map((row, i): AnliegenListEntry => {
      const { inr, citation } = read[i]!
      const v = mapVorlageRow(row)
      const root: AnliegenRoot = { gp: BUNDESRAT_SEGMENT, kind: 'petition-bundesrat', inr }
      return { root, title: v.title, arrivedAt: v.date || null, parliamentUrl: anliegenParliamentUrl(root), ...(citation ? { citation } : {}) }
    })
  },
  { name: 'anliegen-bundesrat', base: DERIVED_CACHE, getKey: () => 'all', ...staleWithin(UPSTREAM_LIST_TTL_S, LIST_STALE_S) },
)

/**
 * List 143 for the Petitionen an den Bundesrat, `{ ITYP: ['PET-BR'] }`: it
 * answers for that type as for the others (15.11.2026: 42 rows, period
 * column „BR", the counts in columns 19 and 20, `AKTIV` „N" on all). Not
 * without `ITYP`: unfiltered, the list holds 655,099 rows. Every row checked
 * for „BR" and `PET-BR`.
 */
export const getBundesratParticipation = defineCachedFunction(
  async (): Promise<ParticipationRow[]> => {
    const res = await fetchFilterList(143, { ITYP: ['PET-BR'] })
    const rows = res.rows ?? []
    if (typeof res.count === 'number' && res.count !== rows.length) {
      throw createError({ statusCode: 502, statusMessage: `Upstream-Liste unvollständig (Liste 143, ${rows.length} von ${res.count} Zeilen, PET-BR)` })
    }
    if (!rows.every(rowIsBundesratParticipation)) {
      throw createError({ statusCode: 502, statusMessage: 'Upstream-Filter hat nicht gegriffen (Liste 143, PET-BR)' })
    }
    assertListHeader(143, res)
    return rows.map(mapParticipationRow)
  },
  { name: 'anliegen-bundesrat-participation', base: DERIVED_CACHE, getKey: () => 'all', ...staleWithin(UPSTREAM_LIST_TTL_S, LIST_STALE_S) },
)

/** List 143 for the item's own kind: the period's three kinds, or the Bundesrat's. */
function participationFor(root: AnliegenRoot): Promise<ParticipationRow[]> {
  return anliegenIsBundesrat(root.kind) ? getBundesratParticipation() : getAnliegenParticipation(root.gp)
}

/** The read behind both record leaves: the detail JSON, reduced before anything stores it. */
async function readAnliegenRecord(gp: string, ityp: string, inr: number): Promise<AnliegenContent | null> {
  return reduceAnliegenContent((await fetchGegenstand(gp, ityp, inr)).content as AnliegenContent | null | undefined)
}

/**
 * The detail JSON of one Anliegen of the running period, reduced before it
 * is stored — a leaf of its own rather than the shared `gegenstand` leaf,
 * which keeps every record whole: through it the Erstunterzeichner's name
 * would sit in the cache. Errors never land in the cache; a 404 propagates
 * fresh on every call.
 */
const getAnliegenRecord = defineCachedFunction(readAnliegenRecord, {
  // v2 since 15.11.2026: the reduced record no longer keeps a presenter's
  // name (`reduceAnliegenContent`); entries written before carry it, so
  // the new name leaves them unread until they expire. v3 the same day:
  // no member named in a motion or a title, no media reference.
  name: 'anliegen-gegenstand-v3',
  // Derived, not fetched: the reduction is our code, and an entry written
  // by an older reducer must not outlive it on disk.
  base: DERIVED_CACHE,
  getKey: (gp: string, ityp: string, inr: number) => `${gp}-${ityp}-${inr}`,
  ...staleWithin(UPSTREAM_LIST_TTL_S, LIST_STALE_S),
})

/**
 * The same record of an ENDED period: nothing in it moves any more — a
 * Petition stops, a Bürgerinitiative and a Volksbegehren move on under a new
 * number in the next period — so it is held as long as the Länder's closed
 * periods (`land-stmk-past-period`, `SETTLED_TTL_S`). GP XXVII alone has 222
 * items: with the running period's half hour, every second visit of an old
 * period's list paid the 20-second budget again and still came back with
 * „Stand nicht gelesen" rows (15.11.2026).
 */
const getSettledAnliegenRecord = defineCachedFunction(readAnliegenRecord, {
  // v2 since 15.11.2026: see `anliegen-gegenstand-v3`.
  name: 'anliegen-gegenstand-settled-v2',
  base: DERIVED_CACHE,
  getKey: (gp: string, ityp: string, inr: number) => `${gp}-${ityp}-${inr}`,
  ...staleWithin(SETTLED_TTL_S, SETTLED_STALE_S),
})

/**
 * A Petition an den Bundesrat's record: settled once its course has ended —
 * passed to the administration, its report taken note of, withdrawn (all 42
 * on 15.11.2026) —, else held like the running period's, so an open one is
 * read again within the half hour.
 */
const getBundesratRecord = defineCachedFunction(readAnliegenRecord, {
  name: 'anliegen-gegenstand-br',
  base: DERIVED_CACHE,
  getKey: (gp: string, ityp: string, inr: number) => `${gp}-${ityp}-${inr}`,
  ...staleWithin(SETTLED_TTL_S, SETTLED_STALE_S, (entry: { value?: unknown; mtime?: number }) =>
    readAnliegenCourse(entry.value as AnliegenContent | null, 'petition-bundesrat').end !== 'offen' ||
    Date.now() - (entry.mtime ?? 0) <= UPSTREAM_LIST_TTL_S * 1000),
})

/** The record of one item, through the leaf its period (or its chamber) decides. */
function anliegenRecordOf(root: AnliegenRoot, currentGp: string | null): Promise<AnliegenContent | null> {
  const read = anliegenIsBundesrat(root.kind)
    ? getBundesratRecord
    : currentGp && gpHasEnded(root.gp, currentGp) ? getSettledAnliegenRecord : getAnliegenRecord
  return read(root.gp, anliegenItemType(root.kind), root.inr)
}

/** The row of list 143 for one item, or null. */
function participationRowOf(rows: readonly ParticipationRow[], root: AnliegenRoot): ParticipationRow | null {
  const ityp = anliegenItemType(root.kind)
  return rows.find((r) => r.ityp === ityp && r.inr === root.inr) ?? null
}

/** Counts of one item: null where list 143 failed or has no row — a failed read is not 0. */
function countsOf(row: ParticipationRow | null): AnliegenCounts {
  return { statements: row?.statements ?? null, support: row?.support ?? null }
}

/**
 * The page of one Anliegen. 404 with Parliament's address where the record is
 * another item — the detail endpoint has answered with one of the same
 * number (`volksbegehren.md` §5.1) — as the Vorlagen' refusal does.
 *
 * The record and list 143 are read side by side, both within
 * `DETAIL_BUDGET_MS`: a record not in by then is a 504, a record that failed
 * its own error (404 included); counts not in are null. What did not arrive
 * runs on into its cache.
 */
export async function getAnliegenDetail(root: AnliegenRoot, currentGp: string | null = null): Promise<AnliegenDetail> {
  // A Volksbegehren before GP XXII: refused before any read, its record is too thin to be true.
  const followed = anliegenIsFollowed(root)
  const deadline = Date.now() + DETAIL_BUDGET_MS
  const countsRead = followed ? withinBudget(participationFor(root), DETAIL_BUDGET_MS) : null
  let content: AnliegenContent | null = null
  if (followed) {
    // Settled first, so that `withinBudget`'s null means „not in time" and a failure keeps its own status.
    const read = await withinBudget(
      anliegenRecordOf(root, currentGp).then((value) => ({ value }), (error: unknown) => ({ error })),
      Math.max(0, deadline - Date.now()),
    )
    if (!read) throw createError({ statusCode: 504, statusMessage: 'Parlament-API nicht erreichbar' })
    if ('error' in read) throw read.error
    content = read.value
  }
  if (!content || !assertAnliegenContent(content, root)) {
    const data: NotFollowedData = {
      parliamentUrl: anliegenParliamentUrl(root),
      followedAt: null,
      // The refusal says from which period on Volksbegehren are followed.
      ...(followed ? {} : { anliegenFrom: VOLKSBEGEHREN_FIRST_GP }),
    }
    throw createError({ statusCode: 404, statusMessage: 'Kein Gegenstand, den der Monitor verfolgt', data })
  }
  // List 143 failed or not in time: the counts stay unread, never 0.
  const participation = await countsRead
  return assembleAnliegenDetail(root, content, countsOf(participation ? participationRowOf(participation, root) : null))
}

/**
 * The rows of the list for one period, and every Petition an den Bundesrat
 * beside them (the Bundesrat has no period; the page decides where they
 * stand). `open` and the counts from list 143
 * (null where it did not answer or has no row for the item); `lastStepAt`
 * and `state` from each item's record — ONE read per item, as far as the
 * records arrive within the budget. The rest runs on into the leaf cache,
 * and its row says null, never a guessed date or state.
 *
 * ONE BUDGET FOR THE WHOLE ANSWER (`LIST_BUDGET_MS`, 15.11.2026). The six
 * to eight list reads (list 101 and list 143, per kind and for the
 * Bundesrat) start together — none needs another's answer, and eight stay
 * under the twelve a station map holds and the host's sixteen slots
 * (`upstream/fetch.ts`) —; the records follow the lists, four at a time,
 * with what is left of the budget. A kind whose list is not in by the
 * deadline is in `unread.kinds`, the Bundesrat's in `bundesrat.unread`.
 *
 * The Petitionen an den Bundesrat queue BEHIND the period's records: those
 * that arrived within the period's days first (they stand under „Alle"),
 * the others last (only their own tab shows them). None arrived since April
 * 2024, so on the running period's list they take no record read from its
 * own rows; their records are held for a week once their course has ended
 * (`getBundesratRecord`), so after the first read they cost nothing. Not
 * left out: the tab lists all of them from this same answer.
 *
 * 502 only where every kind failed: then there is no list to show, and the
 * page shows the failure, not an empty list.
 */
export async function getAnliegenRows(gp: string, currentGp: string): Promise<AnliegenListResponse> {
  const deadline = Date.now() + LIST_BUDGET_MS
  const left = () => Math.max(0, deadline - Date.now())
  // Started before the lists are awaited, and awaited after the records: they overlap both.
  const participationRead = withinBudget(getAnliegenParticipation(gp), LIST_BUDGET_MS)
  const bundesratParticipationRead = withinBudget(getBundesratParticipation(), LIST_BUDGET_MS)
  const [{ entries, unreadKinds }, bundesratEntries] = await Promise.all([
    getAnliegenForGp(gp, LIST_BUDGET_MS),
    withinBudget(getBundesratPetitions(), LIST_BUDGET_MS),
  ])
  if (unreadKinds.length && unreadKinds.length === followedKinds(gp).length) {
    throw createError({ statusCode: 502, statusMessage: `Die Listen der Anliegen der GP ${gp} sind gerade nicht abrufbar` })
  }
  const bundesrat = { entries: bundesratEntries ?? [], unread: bundesratEntries === null }
  const inPeriod = bundesrat.entries.filter((e) => anliegenArrivedInGp(e.arrivedAt, gp))
  const outside = bundesrat.entries.filter((e) => !anliegenArrivedInGp(e.arrivedAt, gp))
  const periodEnded = gpHasEnded(gp, currentGp)
  const read = new Map<string, { lastStepAt: string | null; state: AnliegenState }>()
  const keyOf = (root: AnliegenRoot) => `${root.kind}-${root.inr}`
  await withinBudget(
    mapWithConcurrency([...entries, ...inPeriod, ...outside], READ_CONCURRENCY, async (entry) => {
      try {
        const content = await anliegenRecordOf(entry.root, currentGp)
        if (content && assertAnliegenContent(content, entry.root)) {
          read.set(keyOf(entry.root), {
            lastStepAt: lastStepDate(content, entry.root.kind),
            // The Bundesrat has no period that could end an item.
            state: anliegenStateOf(entry.root, readAnliegenCourse(content, entry.root.kind), anliegenIsBundesrat(entry.root.kind) ? false : periodEnded),
          })
        }
      } catch {
        // One record that fails leaves its row without a last step and a state.
      }
    }),
    left(),
  )
  const [participation, bundesratParticipation] = await Promise.all([participationRead, bundesratParticipationRead])
  const rowOf = (entry: AnliegenListEntry, list: ParticipationRow[] | null): AnliegenRow => {
    const row = list ? participationRowOf(list, entry.root) : null
    const r = read.get(keyOf(entry.root))
    return {
      root: entry.root,
      title: entry.title,
      ...(entry.citation ? { citation: entry.citation } : {}),
      arrivedAt: entry.arrivedAt,
      lastStepAt: r?.lastStepAt ?? null,
      state: r?.state ?? null,
      // No row for the item in an answer that came is no answer either.
      open: row ? row.active : null,
      counts: countsOf(row),
    }
  }
  return {
    gp,
    currentGp,
    rows: entries.map((e) => rowOf(e, participation)),
    unread: { kinds: unreadKinds },
    bundesrat: { rows: bundesrat.entries.map((e) => rowOf(e, bundesratParticipation)), unread: bundesrat.unread },
  }
}
