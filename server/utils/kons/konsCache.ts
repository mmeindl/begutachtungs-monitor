/**
 * The cached RIS Bundesrecht lookups, shared by everything that needs the
 * standing law.
 *
 * `ris/konsLaw.ts` is deliberately free of Nitro globals so the harnesses can
 * run it directly, which leaves the caching to be done somewhere else. It
 * was being done twice: the § names (`diff/paraTitleService.ts`) and the annex
 * check (`annex/annexGuardService.ts`) both want the same § document of the same
 * law at the same date, and two cached functions over one upstream document
 * means two copies in memory and two chances to key them differently.
 *
 * Both layers are the ones `cache/base.ts` prescribes:
 *
 *  - the § document is a **fetched** payload — a NOR version never changes,
 *    so it is kept for a month, and its *parse* is deliberately not cached:
 *    the structure rules live in `lawtext/konsTree.ts` and keep changing, so a
 *    cached tree would hide the next change to them for a month.
 *  - the law resolution is **derived** — `resolveLawByBgbl` walks pages of
 *    RIS results and decides which law a BGBl means, which is our reasoning
 *    and not RIS's answer.
 *
 * ONE READ PER (NUMBER, DAY), whoever asks (12.11.2026). The resolution is
 * keyed by the name and clause its caller brings, and four callers bring
 * four different ones for the same law: the § names pass the Artikel
 * heading without the clause, the annex check, the Lesefassung and the
 * amended laws pass the draft's own. Each key paid the same RIS pages — on
 * 95/ME the § names re-read three pages of the Ärztegesetz a second after
 * the Gegenüberstellung had. So the pages sit under the resolution in a
 * cache of their own (`readKonsRecords`), keyed by what the query asks and
 * nothing else; the resolutions above it differ, as their answers may, and
 * cost no request.
 *
 * Only the reads that pay upstream are served stale while they refresh
 * (`staleWithin`): the records and the history, the leaves. The resolution
 * above them recomputes in milliseconds and stays `swr: false`, so the
 * limits do not add up (`cache/stale.ts`).
 */
import type { ClauseName } from '../lawtext/draftArticles'
import { getText, konsRecordsOfNummer, paragraphHistory, resolveLawByBgbl, type KonsRecord } from '../ris/konsLaw'
import { lawsOfBgbl } from '../ris/bgblLaws'
import { DERIVED_ANALYSIS_TTL_S, KONS_HISTORY_STALE_S, KONS_RECENT_DAYS, KONS_RECORDS_STALE_S, PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import { storageKeyOf } from '../cache/key'
import { DOCUMENT_CACHE } from '../cache/base'
import { staleWithin, type StaleEntry } from '../cache/stale'

/** One § document as RIS sent it, keyed by its NOR — parsed fresh by callers. On disk (`DOCUMENT_CACHE`): a NOR version never changes. */
export const fetchParagraphXml = defineCachedFunction(
  (nor: string, xmlUrl: string): Promise<string> => getText(xmlUrl),
  { name: 'kons-para-xml', base: DOCUMENT_CACHE, getKey: (nor: string) => nor, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/** What `readKonsRecords` stores: the records, and the day they were asked for, which its `validate` reads. */
export interface KonsRecordsAt {
  date: string
  records: KonsRecord[]
}

/**
 * Served stale only where the day asked about lies far enough back. RIS
 * consolidates an amendment days, now and then weeks, after its Kundmachung,
 * and until then the law on a recent day still lacks it — so for a draft of
 * the last `KONS_RECENT_DAYS` days a stored answer counts only within its
 * TTL, as before 12.11.2026. Past that, what RIS says the law was on that
 * day is settled.
 */
export function konsRecordsSettled(entry: StaleEntry & { value?: KonsRecordsAt }): boolean {
  const date = entry.value?.date
  if (!date) return false
  const mtime = entry.mtime ?? 0
  if (Date.now() - mtime <= DERIVED_ANALYSIS_TTL_S * 1000) return true
  // Midnight UTC of the day asked about, against when the answer was read.
  return Date.parse(date) < mtime - KONS_RECENT_DAYS * 24 * 60 * 60 * 1000
}

/**
 * The consolidated § versions in force on `date` whose Kundmachung carries
 * BGBl number `nummer` — the RIS pages under every law resolution, read once
 * per (number, day) for every section of a page (see the header).
 * **Derived**, like the resolution it replaces as the leaf: what it keeps is
 * `konsRefOf`'s reading of each record, a few hundred bytes a §, not the
 * pages RIS sent — those run to megabytes for a large law, and the derived
 * layer dies with a parser change, the reading with it.
 *
 * Stale within `KONS_RECORDS_STALE_S` while it refreshes, but only for a
 * settled day (`konsRecordsSettled`). A failure throws and is not stored.
 */
export const readKonsRecords = defineCachedFunction(
  async (nummer: string, date: string): Promise<KonsRecordsAt> => ({ date, records: await konsRecordsOfNummer(nummer, date) }),
  {
    name: 'kons-bgbl-fassung',
    base: DERIVED_CACHE,
    getKey: (nummer: string, date: string) => storageKeyOf(`${nummer}|${date}`),
    ...staleWithin(DERIVED_ANALYSIS_TTL_S, KONS_RECORDS_STALE_S, konsRecordsSettled),
  },
)

/**
 * Which law a Stammnorm means at a date, with its § index.
 *
 * `title` is the Artikel's own law name and matters more than it looks: one
 * BGBl can promulgate several laws, and it is the title that tells the
 * Bankwesengesetz from the Bausparkassengesetz when both came from BGBl. Nr.
 * 532/1993. It is part of the key, because a lookup with a title and one
 * without can legitimately give different answers.
 *
 * Over `readKonsRecords`, so it costs no request of its own — except where
 * the cited Stammnorm finds no law and the clause's name is searched
 * (`misquotedStammnorm`, one query, rare). `swr: false`: it recomputes in
 * milliseconds over a leaf that is already served stale.
 *
 * **Null is an answer; a failure is not.** `resolveLawByBgbl` returns null
 * when RIS knows no such law or cannot tell two apart, and that is a stable
 * fact worth keeping for a day. It *throws* when RIS is unreachable or
 * ignored the filter, and that has to leave here: an error caught into null
 * was cached like the answer, so one hiccup made a law "unresolvable" for
 * twenty-four hours and every § of it went out labelled as if there were
 * nothing to check against.
 */
export const resolveKonsLaw = defineCachedFunction(
  async (organ: string, nummer: string, date: string, title: string, clause: ClauseName | null = null) =>
    resolveLawByBgbl({ organ, nummer }, date, title || undefined, clause, async (n, d) => (await readKonsRecords(n, d)).records),
  {
    name: 'kons-law-by-bgbl',
    base: DERIVED_CACHE,
    getKey: (organ: string, nummer: string, date: string, title: string, clause: ClauseName | null = null) => storageKeyOf(`${organ}|${nummer}|${date}|${title}|${clause ? `${clause.name}|${clause.abbreviation ?? ''}` : ''}`),
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
  },
)

/**
 * A law's version history, for the one case that needs it: a § missing on
 * the Stichtag (`bridgeVersionGap`). **Derived**, like the law
 * resolution above: it walks result pages and keeps our reading of each
 * record, not a document RIS sent. RIS adds versions as laws are amended, so
 * a day — then served stale within `KONS_HISTORY_STALE_S` while it
 * refreshes: up to twenty pages (the Ärztegesetz twelve) are what a
 * visitor would otherwise wait for once a day. Null (too long a history)
 * is an answer like any other.
 */
export const readParagraphHistory = defineCachedFunction(
  (gesetzesnummer: string) => paragraphHistory(gesetzesnummer),
  {
    name: 'kons-history',
    base: DERIVED_CACHE,
    getKey: (gesetzesnummer: string) => gesetzesnummer,
    ...staleWithin(DERIVED_ANALYSIS_TTL_S, KONS_HISTORY_STALE_S),
  },
)

/**
 * The laws a Bundesgesetzblatt changed (`ris/bgblLaws.ts`), for the BGBl
 * station's „Geltende Fassung". **Derived**, a day: an empty list — RIS has
 * not consolidated the change yet — is an answer for that long and no
 * longer; the consolidation trails the Kundmachung by days. A failure
 * throws through and is not stored.
 */
export const readBgblLaws = defineCachedFunction(
  (number: string) => lawsOfBgbl(number),
  {
    name: 'kons-bgbl-gesetze',
    base: DERIVED_CACHE,
    getKey: (number: string) => storageKeyOf(number.replace(/\s+/g, ' ').trim()),
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
  },
)
