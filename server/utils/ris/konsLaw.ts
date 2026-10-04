/**
 * RIS OGD client for `Applikation=BrKons` — the consolidated standing law
 * (docs/api-exploration.md §2a).
 *
 * Deliberately free of Nitro globals (no `defineCachedFunction`), so the
 * verification harness in `scripts/` can run it under vite-node. Caching is
 * the caller's job; when this reaches a request path it gets the same leaf
 * cache as `ris/begutCorpus.ts`.
 *
 * Two gotchas, both learned the hard way (2026-09-08):
 * - Unsupported parameters are **ignored, not rejected**: `Abkuerzung=GSpG`
 *   returned the entire 441.147-document corpus with HTTP 200. Every query
 *   here is sanity-checked against a plausible hit count.
 * - `Gesetzesnummer` and `Fassung.FassungVom` do filter, and together they
 *   are what makes a verification harness possible: they address the law as
 *   it stood on any given day.
 */

import { sameRisStammnorm, type BgblCitation } from '../lawtext/bgblCitation'
import { bestNameScore, pickClearWinner } from '../text/clearWinner'
import { namesCompatible } from '../lawtext/lawNames'
import { RIS_API_BASE, upstreamJson, upstreamText, type UpstreamPolicy } from '../upstream/fetch'
import { safeExternalUrl } from '../../../shared/utils/safeExternalUrl'

const TIMEOUT_MS = 20_000
/**
 * Three attempts, 600 ms more between each — a consolidated law is hundreds
 * of documents, and a single transient failure used to drop a whole Novelle
 * out of a harness run, which silently changed the sample the percentages
 * were computed over. `retryOnHttpError` keeps what the two hand-written
 * loops here did: they retried every non-OK status, not just 5xx.
 */
const KONS_POLICY: UpstreamPolicy = {
  timeoutMs: TIMEOUT_MS,
  retries: 2,
  backoffMs: (attempt) => 600 * attempt,
  retryOnHttpError: true,
  // `getText` reads URLs out of RIS records (the Erläuterungen, a § XML):
  // held to the upstream hosts.
  upstreamHostsOnly: true,
}
/**
 * More hits than this means the filter was ignored (the whole corpus is
 * ~441.000 documents). It used to be 3.000, "more than any single law has" —
 * the ASVG has 5.115 paragraph versions, and two of its Novellen dropped out
 * of the harness with a phantom "RIS ignorierte den Filter" (2026-09-09).
 * The per-document check below is what actually guards against an ignored
 * filter; the number is only a fast fail for the pathological case.
 */
export const IMPLAUSIBLE_HITS = 50_000

export interface KonsParagraphRef {
  nor: string
  /** "§ 5", "Art. 3", "Anlage 2" as RIS prints it */
  label: string
  /** "5", "5a" — the identifier a Novellierungsanordnung addresses */
  id: string
  inkrafttreten: string | null
  ausserkrafttreten: string | null
  /**
   * "BGBl. Nr. 620/1989 zuletzt geändert durch BGBl. I Nr. 187/2022" — the
   * amendment that produced *this* version. The one exact join from a
   * Bundesgesetzblatt to the consolidated text it created, and the reason
   * the harness needs no dates: an amendment may take effect retroactively
   * (GSpG § 20, promulgated 2022-12-06, in force from 2022-01-01), so no
   * date derived from the promulgation can identify the version pair.
   */
  kundmachungsorgan: string | null
  /** The law's Stammnorm — the exact join key from a draft's Promulgationsklausel */
  stammnorm: BgblCitation | null
  gesetzesnummer: string | null
  xmlUrl: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function asArray<T>(x: T | T[] | null | undefined): T[] {
  return x === null || x === undefined ? [] : Array.isArray(x) ? x : [x]
}

export function konsJson(url: string): Promise<any> {
  return upstreamJson<any>(url, { ...KONS_POLICY, accept: 'application/json' })
}

/** One RIS document, retried like `konsJson` and for the same reason. */
export function getText(url: string): Promise<string> {
  return upstreamText(url, KONS_POLICY)
}

export function konsQuery(params: Record<string, string>): string {
  const q = new URLSearchParams({ Applikation: 'BrKons', ...params })
  return `${RIS_API_BASE}?${q.toString()}`
}

export function konsRefOf(ref: any): KonsParagraphRef | null {
  const meta = ref?.Data?.Metadaten
  const nor = meta?.Technisch?.ID
  const b = meta?.Bundesrecht?.BrKons
  if (!nor || !b) return null
  const main = asArray<any>(ref?.Data?.Dokumentliste?.ContentReference).find((c) => c?.ContentType === 'MainDocument')
  // Held to the upstream allowlist: the server fetches it.
  const xmlUrl = safeExternalUrl(asArray<any>(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url)
  const label = String(b.ArtikelParagraphAnlage ?? '')
  return {
    nor,
    label,
    id: String(b.Paragraphnummer ?? label.replace(/^[^\d]*/, '')),
    inkrafttreten: b.Inkrafttretensdatum ?? null,
    ausserkrafttreten: b.Ausserkrafttretensdatum ?? null,
    kundmachungsorgan: typeof b.Kundmachungsorgan === 'string' ? b.Kundmachungsorgan.trim() : null,
    stammnorm:
      typeof b.StammnormPublikationsorgan === 'string' && typeof b.StammnormBgblnummer === 'string'
        ? { organ: b.StammnormPublikationsorgan.trim(), nummer: b.StammnormBgblnummer.trim() }
        : null,
    gesetzesnummer: typeof b.Gesetzesnummer === 'string' ? b.Gesetzesnummer : null,
    xmlUrl,
  }
}

export interface KonsLawAtDate {
  gesetzesnummer: string
  kurztitel: string
  /**
   * The paragraphs in force on the requested date, by printed label ("§ 20").
   *
   * A plain record, not a Map: results of this shape are put through
   * `defineCachedFunction`, which serialises to JSON. A Map survives the
   * first call in-process and comes back as `{}` from the cache afterwards —
   * so the lookup worked exactly once and then silently returned nothing.
   */
  paragraphs: Record<string, KonsParagraphRef>
}

/**
 * The law a Promulgationsklausel names, as it stood on `date`.
 *
 * `Kundmachungsorgannummer` narrows to the BGBl number; the Stammnorm pair
 * then decides, because the number alone collides across Teile — 84/2001 is
 * both the Audiovisuelle Mediendienste-Gesetz (BGBl. I) and an Amtssitz law
 * (BGBl. III). It also matches versions whose *amendment* carried that
 * number, which the same check drops.
 *
 * That still leaves the commonest ambiguity, because **one BGBl regularly
 * creates several laws**: 532/1993 promulgated the Bankwesengesetz and the
 * Bausparkassengesetz, 107/2017 the Börsegesetz 2018, the E-Geldgesetz 2010
 * and the Alternativfinanzierungsgesetz, 663/1994 the Umsatzsteuergesetz and
 * its Binnenmarkt-Anhang. The Stammnorm pair cannot separate those, and 90 of
 * the 342 laws in this period's collective drafts failed on exactly that —
 * with the right citation (measured 2026-09-09).
 *
 * `name` resolves it where the caller knows which law it means: the amending
 * Artikel says "Änderung des Bankwesengesetzes", and RIS carries the Kurztitel
 * of every law it returns. The name has to fit one candidate clearly better
 * than every other, so this disambiguates on evidence and still refuses when
 * there is none.
 *
 * Returns null unless exactly one law survives. An ambiguous or missing
 * match must yield no heading rather than a heading from the wrong law:
 * a wrong name on someone's paragraph is worse than no name.
 */
export async function resolveLawByBgbl(bgbl: BgblCitation, date: string, name?: string | null): Promise<KonsLawAtDate | null> {
  const byLaw = new Map<string, { kurztitel: string; abkuerzung: string; paragraphs: Record<string, KonsParagraphRef> }>()
  let seen = 0
  for (let page = 1; page <= 20; page++) {
    const body = await konsJson(
      konsQuery({ Kundmachungsorgannummer: bgbl.nummer, 'Fassung.FassungVom': date, DokumenteProSeite: 'OneHundred', Seitennummer: String(page) }),
    )
    const results = body?.OgdSearchResult?.OgdDocumentResults
    const hits = Number(results?.Hits?.['#text'] ?? 0)
    if (hits > IMPLAUSIBLE_HITS) throw new Error(`RIS ignorierte den Filter: ${hits} Treffer für ${bgbl.organ} ${bgbl.nummer}`)
    const refs = asArray<any>(results?.OgdDocumentReference)
    for (const r of refs) {
      const p = konsRefOf(r)
      if (!p?.gesetzesnummer || !p.stammnorm || !sameRisStammnorm(p.stammnorm, bgbl)) continue
      const meta = r?.Data?.Metadaten?.Bundesrecht
      const entry = byLaw.get(p.gesetzesnummer) ?? {
        kurztitel: meta?.Kurztitel ?? '',
        abkuerzung: typeof meta?.BrKons?.Abkuerzung === 'string' ? meta.BrKons.Abkuerzung : '',
        paragraphs: {} as Record<string, KonsParagraphRef>,
      }
      // One version per label at a given date; keep the first RIS returns.
      entry.paragraphs[p.label] ??= p
      byLaw.set(p.gesetzesnummer, entry)
    }
    seen += refs.length
    if (seen >= hits || refs.length === 0) break
  }
  if (byLaw.size === 0) return null
  const chosen = byLaw.size === 1 ? soleUnlessContradicted([...byLaw][0]!, name) : (name ? pickByName(byLaw, name) : null)
  if (!chosen) return null
  const [gesetzesnummer, entry] = chosen
  return { gesetzesnummer, kurztitel: entry.kurztitel, paragraphs: entry.paragraphs }
}

/**
 * The only law of a BGBl — unless the caller's name shares not one word with
 * it. A single candidate used to be taken on the number alone, and a draft
 * that cites the wrong Stammnorm then got the wrong law: 58/ME XXVIII cites
 * the BVergGVS 2012 as „BGBl. I Nr. 10/2013", which is the
 * Bundesverwaltungsgerichtsgesetz — 21 §§ were withheld against that law's
 * text and the page called the ministry's annex doubtful (03.10.2026,
 * §12.41).
 *
 * Zero, not a threshold: a sole candidate needs no proof against rivals, only
 * no contradiction, and noisy titles score low without being wrong
 * (Versorgungssicherungsgesetz, StAG, AWG 2002 at 0,50). A refusal is safe —
 * the §§ go unchecked; a wrong law is not.
 */
export function soleUnlessContradicted<T extends { kurztitel: string; abkuerzung: string }>(only: [string, T], name: string | null | undefined): [string, T] | null {
  const [, entry] = only
  if (!name || !(entry.kurztitel || entry.abkuerzung)) return only
  const fits = bestNameScore(name, [entry.kurztitel, entry.abkuerzung]) > 0 || namesCompatible(name, entry.kurztitel)
  return fits ? only : null
}

/** A name is evidence only when it fits one law of the BGBl clearly better than any other. */
const NAME_MATCH = 0.6

/**
 * Of several laws born from the same BGBl, the one the caller named — or none.
 *
 * "Clearly better than every other" is the whole test: two laws of one BGBl
 * are often near-namesakes ("Umsatzsteuergesetz 1994" and "Umsatzsteuergesetz
 * 1994 – Anhang (Binnenmarkt)"), and a tie has to end in a refusal rather
 * than in whichever RIS happened to return first.
 *
 * Exported for its own tests: every caller that resolves one law of a package
 * depends on this rule, and until 19.09.2026 two of them passed the empty
 * string and never reached it.
 */
export function pickByName<T extends { kurztitel: string; abkuerzung?: string }>(byLaw: Map<string, T>, name: string): [string, T] | null {
  return pickClearWinner(byLaw, name, ([, entry]) => [entry.kurztitel, entry.abkuerzung ?? ''], NAME_MATCH)
}

/** One version of one § in a law's history, with the amendment that made it. */
export interface KonsVersion {
  ref: KonsParagraphRef
  /** „10/2026" — the BGBl the version came in by; null for the Stammfassung. */
  novelle: string | null
  /** The Kundmachungsorgan line, which is where RIS says „aufgehoben durch …". */
  kundmachung: string
}

/** Above this many history pages a law is too large to walk for one gap. */
const HISTORY_PAGES = 20

/**
 * Every version of every § of one law, or null where the history is longer
 * than `HISTORY_PAGES` pages. RIS has no filter by § on this endpoint
 * (`Paragraph`, `Paragraph.Von` are ignored, measured 03.10.2026), so the
 * walk is per law, and the caller asks only for the gaps it needs.
 */
export async function paragraphHistory(gesetzesnummer: string): Promise<KonsVersion[] | null> {
  const out: KonsVersion[] = []
  let seen = 0
  for (let page = 1; ; page++) {
    if (page > HISTORY_PAGES) return null
    const body = await konsJson(konsQuery({ Gesetzesnummer: gesetzesnummer, DokumenteProSeite: 'OneHundred', Seitennummer: String(page) }))
    const results = body?.OgdSearchResult?.OgdDocumentResults
    const hits = Number(results?.Hits?.['#text'] ?? 0)
    if (hits > IMPLAUSIBLE_HITS) throw new Error(`RIS ignorierte den Filter: ${hits} Treffer für Gesetzesnummer ${gesetzesnummer}`)
    const refs = asArray<any>(results?.OgdDocumentReference)
    for (const r of refs) {
      const ref = konsRefOf(r)
      const b = r?.Data?.Metadaten?.Bundesrecht?.BrKons
      if (!ref || ref.gesetzesnummer !== gesetzesnummer) continue
      const novelle = asArray<unknown>(b?.NovellenBgblnummer).map(String).filter(Boolean).at(-1) ?? null
      out.push({ ref, novelle, kundmachung: typeof b?.Kundmachungsorgan === 'string' ? b.Kundmachungsorgan : '' })
    }
    seen += refs.length
    if (seen >= hits || refs.length === 0) return out
  }
}

const yearOf = (nummer: string | null) => Number(/\/(\d{4})\b/.exec(nummer ?? '')?.[1]) || null

/**
 * The version of a § that stood on `date` where RIS has a hole there —
 * a version ends before the date and its successor starts after it — or
 * null.
 *
 * The hole is a data error with one signature, and only that signature is
 * bridged (03.10.2026, §12.42). The Kulturgüterrückgabegesetz's §§ 1, 2, 20
 * … end on 2025-03-24, their successors begin on 2026-03-25 by BGBl. I Nr.
 * 10/2026, and § 0 of the same law ends on 2026-03-24 — a year typed wrong.
 * On 34/ME's Stichtag, 2025-07-22, eleven §§ had no version at all.
 *
 * Bridged only when every condition holds:
 *  - nothing covers the date — a repeal is a version of its own („aufgehoben
 *    durch …") and covers it, so a repealed § never has this hole;
 *  - the successor came by an amendment of a LATER year than the date: an
 *    amendment that did not exist yet cannot have ended the old version then;
 *  - neither side is a repeal.
 * The earlier version is what stood: the amendment that replaced it was not
 * yet law.
 */
export function bridgeVersionGap(versions: readonly KonsVersion[], date: string): KonsParagraphRef | null {
  const from = (v: KonsVersion) => v.ref.inkrafttreten ?? ''
  const to = (v: KonsVersion) => v.ref.ausserkrafttreten
  if (versions.some((v) => from(v) <= date && (to(v) === null || to(v)! >= date))) return null
  const before = versions.filter((v) => to(v) !== null && to(v)! < date).sort((a, b) => to(b)!.localeCompare(to(a)!))[0]
  const after = versions.filter((v) => from(v) > date).sort((a, b) => from(a).localeCompare(from(b)))[0]
  if (!before || !after) return null
  if (/aufgehoben/i.test(before.kundmachung) || /aufgehoben/i.test(after.kundmachung)) return null
  const amended = yearOf(after.novelle)
  if (amended === null || amended <= Number(date.slice(0, 4))) return null
  return before.ref
}
