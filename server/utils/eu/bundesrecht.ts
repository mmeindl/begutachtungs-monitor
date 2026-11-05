/**
 * Whether Bundesrecht in force already names an EU act — rule D4 of
 * docs/architecture.md §12.66, widened on 04.11.2026.
 *
 * PURE MODULE — a label in, a search phrase out; a RIS answer in, a verdict
 * out. The service (`euService.ts`) runs the query and caches it.
 *
 * WHY A SEARCH OVER ALL OF BUNDESRECHT. The first form of D4 read the
 * Paragraph a Novellierungsanordnung addresses in the law the draft amends,
 * which catches an amendment restating the Umsetzungshinweis of the law it
 * changes — and nothing else. A new law that replaces an old one (the
 * Elektrizitätswirtschaftsgesetz, 32/ME, in place of the ElWOG 2010) has no
 * Paragraph to read, so every act it names counted as new, and the page
 * printed „Umsetzungsfrist bis 01.07.1995" beside „Begutachtung ab
 * 07.07.2025". The widened rule asks the one question D4 was for: has the
 * Republic transposed this act already, somewhere? RIS's full-text search
 * over the consolidated Bundesrecht answers it, as of the first day of the
 * Begutachtung (probed 04.11.2026, Fassung vom 07.07.2025: „94/22/EG" 13
 * hits, „2009/31/EG" 18, „2019/944" 5 — and „2024/1069", „2023/2864" 0).
 *
 * WHAT COUNTS. Bundesgesetze, Verordnungen and Kundmachungen; not the
 * Staatsverträge, whose annexes list directives without transposing any
 * (an Assoziierungsabkommen names 94/22/EG). And a hit counts only where
 * the Paragraph that names the act TRANSPOSES it — measured the same
 * evening: „named anywhere" took the deadline off the
 * Nachhaltigkeitsberichtsgesetz (4/ME), because the
 * CBCR-Veröffentlichungsgesetz refers to 2022/2464 in a definition, and off
 * three more drafts for a mention in the Bundesfinanzgesetz 2025, the
 * FMA-Kostenverordnung and the Kreditdienstleistergesetz. RIS answers per
 * Paragraph, each a small document of its own, so the service reads every
 * hit through the same Umsetzungshinweis reader the draft's text goes
 * through (`transposesAct`): „Mit diesem Bundesgesetz wird die Richtlinie …
 * umgesetzt" is a transposition, „im Sinne der Richtlinie …" is not.
 */
import type { EuActKind } from './actCitations'
import { readUmsetzungshinweis } from './umsetzungshinweis'

/**
 * The phrase RIS is asked for: the act's number as every law writes it —
 * „2024/1069" for the citation form since 2015, „2009/31/EG" for the old
 * one, „1907/2006" for an old-form regulation („Nr. 1907/2006"). Taken
 * from the label the parser built, so it carries no stray words — with one
 * step back: the parser writes every year with four digits, the laws write
 * an act of 1998 or earlier with two („Richtlinie 94/22/EG", „98/70/EG";
 * four digits only from 1999 on). Asked with „1994/22/EG", RIS found
 * nothing and the Mineralrohstoffgesetz's transposition stayed invisible
 * (32/ME, 04.11.2026).
 */
const PHRASE_RE = /(\d{2,4})\/(\d{1,4})(\/(?:EU|EG|EWG|EGKS|Euratom|JI|GASP))?(?![\d/])/

export function bundesrechtPhrase(label: string): string | null {
  const m = PHRASE_RE.exec(label)
  if (!m) return null
  const [, year, number, suffix = ''] = m
  const twoDigit = suffix && year!.length === 4 && Number(year) <= 1998
  return `${twoDigit ? year!.slice(2) : year}/${number}${suffix}`
}

/** The BrKons query for one phrase as of one day (`konsQuery` adds the application). */
export function bundesrechtSearchParams(phrase: string, asOf: string): Record<string, string> {
  return { Suchworte: `"${phrase}"`, 'Fassung.FassungVom': asOf, DokumenteProSeite: 'OneHundred' }
}

/** The part of a BrKons search answer this module reads. */
export interface BrKonsSearchAnswer {
  OgdSearchResult?: {
    OgdDocumentResults?: {
      Hits?: { '#text'?: string }
      OgdDocumentReference?: BrKonsHit | BrKonsHit[] | null
    }
  }
}
interface BrKonsHit {
  Data?: {
    Metadaten?: { Technisch?: { ID?: string }; Bundesrecht?: { Kurztitel?: string; BrKons?: { Typ?: string } } }
    Dokumentliste?: { ContentReference?: BrKonsContent | BrKonsContent[] | null }
  }
}
interface BrKonsContent {
  ContentType?: string
  Urls?: { ContentUrl?: BrKonsUrl | BrKonsUrl[] | null }
}
interface BrKonsUrl { DataType?: string; Url?: string }

/** A Staatsvertrag or an Art.-15a-Vereinbarung lists acts; it transposes none. */
export function typCountsAsBundesrecht(typ: string | null | undefined): boolean {
  return !!typ && !/^(?:Vertrag|Vereinbarung)/i.test(typ)
}

/** One Paragraph of Bundesrecht that names the act: its NOR and its XML. */
export interface BundesrechtHit {
  nor: string
  kurztitel: string
  xmlUrl: string | null
}

function asList<T>(x: T | T[] | null | undefined): T[] {
  return x === null || x === undefined ? [] : Array.isArray(x) ? x : [x]
}

/**
 * The Paragraphs of Bundesgesetze, Verordnungen and Kundmachungen the
 * answer holds, once each, and how many hits RIS counted in all (the page
 * carries at most a hundred).
 */
export function bundesrechtHits(answer: BrKonsSearchAnswer): { total: number; hits: BundesrechtHit[] } {
  const results = answer?.OgdSearchResult?.OgdDocumentResults
  const total = Number(results?.Hits?.['#text'] ?? 0) || 0
  const hits = new Map<string, BundesrechtHit>()
  for (const h of asList(results?.OgdDocumentReference)) {
    const meta = h?.Data?.Metadaten
    const nor = meta?.Technisch?.ID
    if (!nor || !typCountsAsBundesrecht(meta?.Bundesrecht?.BrKons?.Typ) || hits.has(nor)) continue
    const main = asList(h?.Data?.Dokumentliste?.ContentReference).find((c) => c?.ContentType === 'MainDocument')
    const xmlUrl = asList(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
    hits.set(nor, { nor, kurztitel: meta?.Bundesrecht?.Kurztitel ?? '', xmlUrl })
  }
  return { total, hits: [...hits.values()] }
}

/**
 * Whether the law in force is asked about an act at all (05.11.2026): every
 * act that is transposed — a directive, dated or not, and a framework
 * decision —, not only a directive with a transposition date. 2002/73/EG
 * has no deadline in the Cellar and counted new on bgld-c372 beside its
 * restated siblings, though the Landes-Gleichbehandlungsgesetz lists it.
 * NOT a regulation or a decision: they are carried out, often by several
 * laws, and a draft that adds „begleitende Maßnahmen zur Durchführung der
 * Verordnung (EU) 2024/1309" is a draft for it even where another law
 * already flanks it (Tirol's Technische Bauvorschriften beside its
 * Bauordnung 2022). Measured over the stored facts of GP XXVIII: of 82 acts
 * counted new unasked, the search found 26 in force — 7 directives, all
 * rightly old, and 19 regulations and decisions, mostly flanked elsewhere.
 * The Bund's per-§ check of the addressed § still reads every kind.
 */
export function askedOfLawInForce(kind: EuActKind): boolean {
  return kind === 'richtlinie' || kind === 'rahmenbeschluss'
}

/**
 * Whether one Paragraph's text transposes the act — names it inside an
 * Umsetzungshinweis or a flanking clause — rather than merely referring to
 * it. The reader is the draft's own (`umsetzungshinweis.ts`).
 */
export function transposesAct(paragraphText: string, celex: string): boolean {
  const r = readUmsetzungshinweis(paragraphText)
  return (r.signal === 'umsetzung' || r.signal === 'durchfuehrung') && r.acts.some((a) => a.celex === celex)
}
