/**
 * One RIS Begut record, flattened from the OGD JSON
 * (docs/api-exploration.md §2).
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest and
 * the corpus audit in `scripts/corpus/verordnungen.ts` can execute it
 * directly. It used to live inside `begutCorpus.ts`, which pulls in the Nitro cache
 * and `#shared/*`; a measurement script could then only re-implement the
 * flattening, and a re-implemented mapper measures itself, not the product.
 */
import type { RisConsultation } from '../../../shared/types'
import { todayIso } from '../../../shared/utils/format'
import type { RisBegutRecord } from './risJoin'

/** The formats RIS offers for one document of a Begut record. */
export interface RisDocumentUrls {
  html: string | null
  xml: string | null
  pdf: string | null
}

/** RIS record plus the document URLs the UI needs. */
export interface RisBegutFlat extends RisBegutRecord {
  geaendert: string | null
  mainDocument: RisDocumentUrls
  /**
   * The ressort's own Textgegenüberstellung, when the draft carries one.
   * RIS offers it as XML, Parliament only as PDF (docs/api-exploration.md
   * §2c) — which is why this comes from here and not from the Parliament
   * document list the rest of the detail page uses.
   */
  textComparison: RisDocumentUrls | null
  /**
   * EVERY document of that annex, in the order RIS lists them — the first of
   * them is `textComparison` above.
   *
   * A ressort may publish one draft's Gegenüberstellung in parts:
   * „Textgegenüberstellung (Verordnung)" beside „(Anlagen)",
   * „(Artikel1)" beside „(Artikel 2)". Measured over the 400 most recent Begut
   * records (26.09.2026), **2 of the 240 records with an annex** do, and until
   * then only the first was ever read.
   *
   * Two fields rather than one, and the reason is that they answer two
   * questions. `textComparison` is the document a reader is sent to and the
   * one the search labels „in der Textgegenüberstellung"; this is the input of
   * the annex engine, which has to read the parts as ONE annex or hold half a
   * Gegenüberstellung against the whole draft (`annex/annexSource.ts`). They
   * cannot drift apart: both are built here, from the same match, in the same
   * expression.
   *
   * The further parts deliberately stay in `otherDocuments` as well. That is
   * where a reader finds them under the ressort's own name today, and where
   * the full-text search reads them (§12.31); taking them out would remove a
   * document from the page in the name of classifying it better.
   */
  textComparisonParts: RisDocumentUrls[]
  /**
   * Documents under an OLDER annex name — „begtxt", „GGUe",
   * „Textüberstellung" — that may be the Gegenüberstellung, and only where
   * the name rule above found none. Empty whenever `textComparisonParts` is
   * not, so every record the name rule reads is read exactly as before.
   *
   * A candidate, not an annex: whether it IS one is decided by its content,
   * when the annex engine reads it (`annex/olderAnnex.ts`). That is why it is
   * a field of its own and not a part of `textComparison`: that one is the
   * document a reader is sent to under the label „Textgegenüberstellung",
   * and the label must not stand on a name that only says „maybe".
   */
  textComparisonCandidates: RisDocumentUrls[]
  /**
   * The Erläuterungen as their own RIS document — the Allgemeiner Teil a
   * reader triages a draft by, and the "Zu Z 4 (§ 54c …)" passages under it.
   * Carried for every record class; on a Verordnungsentwurf it is the only
   * reasoning the procedure publishes at all, because there is no
   * parliamentary Kurzinformation to fall back on.
   */
  explanations: RisDocumentUrls | null
  /**
   * The ressort's Begleitschreiben (`ContentType: "Letter"`) — it names the
   * address a Stellungnahme goes to. For a Ministerialentwurf that is a
   * convenience beside Parliament's own form; for a Verordnungsentwurf it is
   * the ONLY answer to "where do I send it?", because there is no form.
   */
  coverLetter: RisDocumentUrls | null
  /**
   * EVERYTHING ELSE the record carries as text — and the reason for it is
   * measured (22.09.2026, docs/architecture.md §12.31).
   *
   * Across the 8 consultations running that day the records carry **41 text
   * documents**, the four fields above reach **25**. What the full-text
   * search could therefore not read: every WFA (8×), every Digicheck (3×),
   * every Vorblatt (2×), one Anhang — and two that are not a foreign kind
   * of document at all but our own naming rules: `SAG_TGÜ` (the
   * Gegenüberstellung of a Sammelnovelle with a law prefix) and `Entwurf EB
   * Klimagesetz` (the Erläuterungen, abbreviated „EB" by the ressort).
   *
   * The list is therefore NOT an attempt to replace the four fields: they
   * keep their rules, their ranking and their labels, and the annex engine
   * with its pinned baseline stays untouched. It is the remainder the search
   * may read, so that a hit inside a WFA does not end as „nicht gefunden"
   * — with the ressort's own name as the place it was found, because we
   * cannot read it better than the ressort wrote it.
   */
  otherDocuments: { name: string; urls: RisDocumentUrls }[]
}

/** XML-to-JSON trap: one element → bare object, several → array. */
export function asArray<T>(x: T | T[] | null | undefined): T[] {
  if (x === null || x === undefined) return []
  return Array.isArray(x) ? x : [x]
}

/** ISO date `YYYY-MM-DD` or null; RIS dates arrive as `YYYY-MM-DD` or `YYYY-MM-DDT…`. */
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v)
  return m ? m[1]! : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * The annex is named inconsistently across ressorts: "Textgegenüberstellung",
 * "TGÜ", "TGG", and a misspelt "Textgegenbüberstellung" all occur in the
 * corpus, so the match has to be loose (docs/api-exploration.md §2c).
 *
 * **The prefixed abbreviation is read since 26.09.2026** — "SAG_TGÜ",
 * "GuKG-Novelle_2024_TGÜ": 4 of the 400 most recent records, all readable.
 */
const TEXT_COMPARISON_NAME = /gegen.?über|(^|_)TG(Ü|G|UE)$/i

/**
 * The Erläuterungen document, by its full word.
 */
const EXPLANATIONS_NAME = /erl(ä|ae|a)uterung/i

/**
 * What ends a token in a document name: anything but a letter. An underscore,
 * digit, dot, space or bracket does not — which is the point, because `\b`
 * treats `_` as a word character and the ressorts write „SVÄG_2024_EB_…".
 */
const NOT_LETTER = '[^A-Za-zÄÖÜäöüß]'

/**
 * **The abbreviation anywhere in the name, measured 27.09.2026**
 * (`pnpm corpus:dokument-namen`, docs/architecture.md §12.13 „Die Abkürzung
 * mitten im Namen"). The anchored rule above missed „TGÜ Anpassung QJF-G",
 * „42. KFG-Nov.TGÜ.11.05.2026", „IFG-TGÜ (2025-05-07)", „TxtGGÜ", „TextGG":
 * 11 of 139 Gesetzesentwürfe of GP XXVIII whose RIS record carries the
 * Gegenüberstellung — every one of the drafts `annex/annexSource.ts` had
 * counted as „nur beim Parlament". A letter on either side still keeps a
 * name out („AnhangTGÜ").
 */
const TEXT_COMPARISON_TOKEN = new RegExp(`(^|${NOT_LETTER})(TG(Ü|G|UE)|TxtGGÜ|TxTGGÜ|TxtGG|TextGG|TGGÜ)($|${NOT_LETTER})`, 'i')

/**
 * The Erläuterungen under an abbreviation (same measurement, §12.31): „EB",
 * „EBs", „Erl", „Erl.", „Erläut", „Erläuternde Bemerkungen", and the old BMF
 * form „begerl". „EB" only in capitals — as a lower-case token it is a
 * syllable. „Erledigung" and „Erlass" stay out because a letter follows.
 */
const EXPLANATIONS_EB = new RegExp(`(^|${NOT_LETTER})EBs?($|${NOT_LETTER})`)
const EXPLANATIONS_ERL = new RegExp(`(^|${NOT_LETTER})(erl|erläut|erläuternde|begerl)($|${NOT_LETTER})`, 'i')

/**
 * One document carrying several: „Vbl.Erl.TxtGGÜ", „Vorblatt_Erl-Bü-ARG",
 * „Materialien". A bundle is a different document, not a differently named
 * one, and neither field takes it through a token — only through the full
 * word, as before.
 */
const BUNDLE_MARK = new RegExp(`(^|${NOT_LETTER})(vorbl|vbl|vb)|materiali`, 'i')

/**
 * The names are compared in NFC. Seven document names in the corpus are
 * decomposed („Erläuterungen" with a + U+0308), look like every other one and
 * match nothing.
 */
function nameForm(name: string): string {
  return name.normalize('NFC').trim()
}

function explanationsToken(name: string): boolean {
  return EXPLANATIONS_EB.test(name) || EXPLANATIONS_ERL.test(name)
}

/**
 * How firmly a name says „Textgegenüberstellung": 2 for the full word or the
 * shipped anchored form, 1 for the abbreviation as a token, 0 for no.
 *
 * Two ranks rather than one widened pattern, so that the widening is strictly
 * additive: wherever a record carries a name the old rule read, the pick
 * below reads exactly that as before — in the same order, with no new part
 * next to it. Measured: 2 records (2014, 2016) would otherwise have gained a
 * part; neither is in the drift baseline, but the rule should not depend on
 * that.
 */
export function textComparisonNameRank(raw: string): 0 | 1 | 2 {
  const name = nameForm(raw)
  if (TEXT_COMPARISON_NAME.test(name)) return 2
  if (TEXT_COMPARISON_TOKEN.test(name) && !BUNDLE_MARK.test(name) && !explanationsToken(name)) return 1
  return 0
}

/** The same two ranks for the Erläuterungen; a name that is also a Gegenüberstellung is a bundle. */
export function explanationsNameRank(raw: string): 0 | 1 | 2 {
  const name = nameForm(raw)
  if (EXPLANATIONS_NAME.test(name)) return 2
  if (explanationsToken(name) && !TEXT_COMPARISON_TOKEN.test(name) && !/materiali/i.test(name)) return 1
  return 0
}

/**
 * Every item carrying the best rank, in the given order — the parts of a
 * Gegenüberstellung published as several documents.
 *
 * ONE rule for the request path and the measurement scripts. It stood as
 * three literals kept in step by hand (`risRecord.ts`, `annex/annexSource.ts`,
 * `scripts/lib/ris.ts`), and the reason given for that — a script must not
 * widen what counts as an annex without the site widening with it — is
 * exactly what a single import guarantees and three literals do not.
 */
export function pickTextComparisons<T>(items: readonly T[], nameOf: (item: T) => string): T[] {
  const ranked = items.map((item) => ({ item, rank: textComparisonNameRank(nameOf(item)) }))
  const best = Math.max(0, ...ranked.map((r) => r.rank))
  return best === 0 ? [] : ranked.filter((r) => r.rank === best).map((r) => r.item)
}

/**
 * The older names of the annex, before the ressorts wrote „TGÜ" — measured
 * 30.09.2026 over the whole RIS Begut corpus (docs/architecture.md §12.13,
 * „Die älteren Formen"). „begtxt" is the BMF's Begutachtungstext beside
 * „begmat" (the Materialien, i.e. the Erläuterungen) and „begVorblatt_WFA";
 * „GGUe" and „Textüberstellung" are other ressorts' forms. 80 records carry
 * one of them and no name the rule above reads, GP XXIV to XXVII.
 *
 * „begmat"/„Materialien" is deliberately NOT here: where it stands alone it
 * is a bundle — Vorblatt, Erläuterungen and Gegenüberstellung in one
 * document — and reading the whole of it as an annex turns the Vorblatt's
 * tables into „changed" rows. That is a different document, not a
 * differently named one.
 */
const OLDER_TEXT_COMPARISON_NAME = new RegExp(`begtxt|(^|${NOT_LETTER})GGUe($|${NOT_LETTER})|textüberstellung`, 'i')

/**
 * The documents that may be the Gegenüberstellung by an older name, in RIS's
 * order — and none at all where the name rule picks something. The second
 * half is what makes this strictly additive: a record the rule reads today
 * cannot gain a candidate.
 */
export function pickOlderTextComparisons<T>(items: readonly T[], nameOf: (item: T) => string): T[] {
  if (pickTextComparisons(items, nameOf).length > 0) return []
  return items.filter((item) => OLDER_TEXT_COMPARISON_NAME.test(nameForm(nameOf(item))))
}

/** The first item of the best Erläuterungen rank, if any. */
export function pickExplanations<T>(items: readonly T[], nameOf: (item: T) => string): T | undefined {
  let found: T | undefined
  let best = 0
  for (const item of items) {
    const rank = explanationsNameRank(nameOf(item))
    if (rank > best) {
      best = rank
      found = item
      if (rank === 2) break
    }
  }
  return found
}

/** Human-readable RIS page of one Begut record. */
export function risDocumentUrl(id: string): string {
  return `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Begut&Dokumentnummer=${encodeURIComponent(id)}`
}

// Loosely typed: the OGD JSON is generated from XML and not contractual.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function flattenRisRecord(doc: any): RisBegutFlat | null {
  const meta = doc?.Data?.Metadaten
  const id = str(meta?.Technisch?.ID)
  if (!id) return null
  const b = meta?.Bundesrecht ?? {}
  const bg = b?.Begut ?? {}
  const references = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
  /** Formats of one reference, or null when the reference is absent. */
  const formatsOf = (ref: any): RisDocumentUrls | null => {
    if (!ref) return null
    const list = asArray<any>(ref?.Urls?.ContentUrl)
    const of = (type: string) => str(list.find((u) => u?.DataType === type)?.Url)
    return { html: of('Html'), xml: of('Xml'), pdf: of('Pdf') }
  }
  const nameOf = (c: any) => String(c?.Name ?? '')
  const main = references.find((c) => c?.ContentType === 'MainDocument')
  const tguAll = pickTextComparisons(references, nameOf)
  const tgu = tguAll[0]
  const erl = pickExplanations(references, nameOf)
  const letter = references.find((c) => c?.ContentType === 'Letter')
  const classified = new Set([main, tgu, erl, letter].filter(Boolean))
  return {
    id,
    kurztitel: str(b?.Kurztitel),
    titel: str(b?.Titel),
    abk: str(bg?.Abkuerzung),
    stelle: str(bg?.EinbringendeStelle) ?? str(meta?.Technisch?.Organ),
    beginn: isoDate(bg?.BeginnBegutachtungsfrist),
    ende: isoDate(bg?.EndeBegutachtungsfrist),
    geaendert: isoDate(meta?.Allgemein?.Geaendert),
    mainDocument: formatsOf(main) ?? { html: null, xml: null, pdf: null },
    textComparison: formatsOf(tgu),
    // In RIS's own order, and the first is `textComparison`: the engine reads
    // the parts as one annex, so „(Artikel1)" must not arrive after
    // „(Artikel 2)".
    textComparisonParts: tguAll.map(formatsOf).filter((u): u is RisDocumentUrls => u !== null),
    // They stay in `otherDocuments` as well, like the further parts above:
    // until the content says otherwise they are what the ressort called them.
    textComparisonCandidates: pickOlderTextComparisons(references, nameOf).map(formatsOf).filter((u): u is RisDocumentUrls => u !== null && hasDocument(u)),
    explanations: formatsOf(erl),
    // By ContentType, not by name: "Begleitschreiben Begutachtungsentwurf"
    // is the usual wording, but the type is what RIS actually commits to.
    coverLetter: formatsOf(letter),
    // Without a readable format a reference is not a document: a record's
    // embedded GIFs (formulas, logos, rasterised tables) drop out here by
    // themselves, because `formatsOf` returns nothing but nulls for them.
    otherDocuments: references
      .filter((c) => c && !classified.has(c))
      .map((c) => ({ name: String(c?.Name ?? '').trim(), urls: formatsOf(c) }))
      .filter((d): d is { name: string; urls: RisDocumentUrls } => d.name.length > 0 && hasDocument(d.urls)),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Whether a document reference carries at least one usable format. */
export function hasDocument(d: RisDocumentUrls | null): boolean {
  return Boolean(d && (d.html || d.xml || d.pdf))
}

/**
 * Was this record in Begutachtung on `isoDay`?
 *
 * Both dates are required, and that is the known bound on every count built
 * on this: `EndeBegutachtungsfrist` is optional upstream
 * (docs/api-exploration.md §2), so a record without a Frist is invisible to
 * this predicate — the same bound RIS's own `InBegutachtungAm` filter has.
 * Every "N open" figure derived here is therefore a LOWER bound, and the UI
 * says so rather than claiming completeness.
 */
export function isOpenOn(r: Pick<RisBegutFlat, 'beginn' | 'ende'>, isoDay: string): boolean {
  return Boolean(r.beginn && r.ende && r.beginn <= isoDay && r.ende >= isoDay)
}

/**
 * Decides `active` for a list of RIS records on `day`.
 *
 * Runs at request time, never inside a cached function — the flag is a
 * statement about the calendar day, and a cached one keeps yesterday's
 * answer until its TTL runs out. That is the same rule `reconcileActive`
 * states for the Parliament half in `parliament/drafts.ts`, and the reason the
 * records `getRisOnlyForGp` caches carry a meaningless `active: false`:
 * every reader has to decide the day for itself.
 *
 * `day` defaults to today, which is what every caller wants; the parameter
 * exists so the rule can be tested without a clock. Today is the Vienna
 * calendar day (`todayIso`), not the server's UTC one: this used to slice
 * `new Date().toISOString()`, so between 00:00 and 02:00 Vienna time the
 * server held a record open that the browser had already closed.
 */
export function withRisActiveOn(items: RisConsultation[], day: string = todayIso()): RisConsultation[] {
  return items.map((item) => {
    const active = isOpenOn({ beginn: item.startedAt, ende: item.deadline }, day)
    return active === item.active ? item : { ...item, active }
  })
}
