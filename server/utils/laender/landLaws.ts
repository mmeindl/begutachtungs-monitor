/**
 * Landesgesetze without a draft in the Land's register (10.11.2026,
 * docs/architecture.md §12.70): what RIS says about each law, which of them
 * the list carries as rows, and — for Salzburg alone — whether the page may
 * say „ohne Begutachtung".
 *
 * PURE MODULE: RIS's records, the register's drafts and the Landtag
 * documents' text come in; nothing is fetched here
 * (`landLawsService.ts` fetches and caches).
 *
 * THE RULE THAT CARRIES THE STATEMENT, measured before it was built
 * (`scripts/corpus/laenderOhneBegutachtung.ts`, 10.11.2026): a Land has no
 * key from draft to law like the Bund's stage record, only the title search
 * (`matchLgbl`), and every consulted law it misses would read as
 * unconsulted. Salzburg's Regierungsvorlagen close the general part of their
 * Erläuterungen with „Ergebnis(se) des Begutachtungsverfahrens" — on 264 of
 * 264 Vorlagen of laws the title search joined to a draft. So:
 *
 *  - consulted: a draft joins (the Land's record or the title search), or
 *    the Vorlage carries the heading;
 *  - none — „ohne Begutachtung": no join, no draft of the register with a
 *    similar title before the Beschluss, and the Vorlage read in full
 *    without the heading (or, for an Initiativantrag, the Antrag read in full
 *    without the word „Begutachtung");
 *  - silent: everything else — the budget laws, a similar draft, a document
 *    that could not be read, a law RIS gives no route for.
 *
 * Under-claiming is the point: a wrong „ohne Begutachtung" is the worst
 * outcome this layer can produce, a missing one costs a sentence.
 */
import type { LandCode, LandConsultation, LandLaw, LandLawBegutachtung, LandLawLinkedDoc, LandLawRoute } from '#shared/types'
import { isSafeLinkHref, safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { lgblWords, type LgblEntry } from './lgblSearch'

/** The two RIS types that are laws; Verordnungen and Kundmachungen have no Landtag. */
export const LAW_TYPES: ReadonlySet<string> = new Set(['Landesgesetz', 'Landesverfassungsgesetz'])

/**
 * What a law's RIS record says beyond the index's title and date — the
 * `LgblAuth` fields the survey of 10.11.2026 found per Land (§12.70):
 * Salzburg and Oberösterreich (until 2024) link Vorlage, Antrag and report;
 * Burgenland and Vorarlberg give their numbers; Wien names an
 * Initiativantrag only; Steiermark writes the route into `Materialien`
 * („XIX. GPStLT RV EZ 1409/1 AB EZ 1409/3"); Niederösterreich, Tirol and
 * Wien link the Landtag's item; Kärnten gives none of it.
 */
export interface LgblLawMeta {
  kurztitel: string | null
  beschluss: string | null
  periode: string | null
  vorlage: string | null
  vorlageUrl: string | null
  antrag: string | null
  antragUrl: string | null
  ausschuss: string | null
  ausschussUrl: string | null
  materialien: string | null
  materialienUrl: string | null
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim() : null)
const link = (v: unknown) => {
  const s = str(v)
  return s ? safeExternalUrl(s) : null
}

/** The fields of one `Metadaten.Landesrecht`, for a law only. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RIS's envelope
export function lawMetaOf(m: any): LgblLawMeta {
  const a = m?.LgblAuth ?? {}
  return {
    kurztitel: str(m?.Kurztitel),
    beschluss: /^\d{4}-\d{2}-\d{2}$/.test(String(a.BeschlussDatum ?? '')) ? String(a.BeschlussDatum) : null,
    periode: str(a.Gesetzgebungsperiode),
    vorlage: str(a.Regierungsvorlage),
    vorlageUrl: link(a.RegierungsvorlageLink),
    antrag: str(a.Initiativantrag),
    antragUrl: link(a.InitiativantragLink),
    ausschuss: str(a.Ausschussbericht),
    ausschussUrl: link(a.AusschussberichtLink),
    materialien: str(a.Materialien),
    // Only ever a link for the reader, never fetched: the scheme is checked,
    // not the server's host list (Niederösterreich's Landtag is not on it).
    materialienUrl: isSafeLinkHref(str(a.MaterialienLink)) ? str(a.MaterialienLink) : null,
  }
}

/* Steiermark's materials as RIS writes them: „XIX. GPStLT RV EZ 1409/1 AB EZ 1409/3", „… IA EZ 1498/1 …". */
const STMK_ROUTE_RE = /\b(RV|IA)\s+EZ\s+(\d+\/\d+)/

/**
 * The route as RIS states it, and only as it states it: a field (or
 * Steiermark's materials) naming a Regierungsvorlage or an Initiativantrag.
 * Where RIS names both, the Vorlage leads — the Antrag then is the
 * Landtag's companion. An absent field is no statement: Wien names only
 * Initiativanträge, and a law without one is not therefore a Vorlage.
 */
export function routeOf(land: LandCode, meta: LgblLawMeta): LandLawRoute | null {
  if (meta.vorlage || meta.vorlageUrl) {
    // Kärnten's link (eight laws of 2023) is the year's list of Vorlagen, not this one.
    return { kind: 'vorlage', number: wienLabel(meta.vorlage), url: land === 'ktn' ? null : meta.vorlageUrl }
  }
  if (meta.antrag || meta.antragUrl) {
    return { kind: 'antrag', number: wienLabel(meta.antrag), url: meta.antragUrl }
  }
  if (land === 'stmk' && meta.materialien) {
    const m = STMK_ROUTE_RE.exec(meta.materialien)
    // The link redirects to the archive's search, not to the item: not offered (§12.70).
    if (m) return { kind: m[1] === 'RV' ? 'vorlage' : 'antrag', number: `EZ ${m[2]}`, url: null }
  }
  return null
}

/* Wien writes the word itself into the field („Initiativantrag"): no number. */
function wienLabel(v: string | null): string | null {
  return v && /^\d/.test(v) ? v : null
}

/**
 * The Landtag's own item, where RIS links one that lands on it: Wien's
 * Infodat, Tirol's Landtagsevidenz, Niederösterreich's current Landtag site
 * (its old host answered 404 on a sample, 10.11.2026). Not Steiermark's
 * link, which redirects to a search page, nor Kärnten's yearly list.
 */
export function materialsOf(land: LandCode, meta: LgblLawMeta): LandLawLinkedDoc | null {
  const url = meta.materialienUrl
  if (!url) return null
  const host = (() => {
    try {
      return new URL(url).host
    } catch {
      return ''
    }
  })()
  const lands = host === 'www.wien.gv.at' || host === 'lte.tirol.gv.at' || host === 'noe-landtag.gv.at'
  if (!lands) return null
  const label = meta.materialien && meta.materialien !== 'Materialien' ? meta.materialien : null
  return { label: label ?? 'Gegenstand im Landtag', url }
}

/**
 * „Gesetz vom 30. September 2026, mit dem …" — the Landtag's Beschluss, as
 * the title of every Land's law carries it; the day Steiermark, Tirol and
 * Kärnten give in no field.
 */
const MONTHS = ['jänner', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']
export function titleDecisionDate(title: string): string | null {
  const m = /^\s*(?:Landes)?(?:verfassungs)?gesetz\s+vom\s+(\d{1,2})\.\s*(Jänner|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i.exec(title)
  if (!m) return null
  const month = MONTHS.indexOf(m[2]!.toLowerCase().replace('januar', 'jänner')) + 1
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
}

/**
 * Salzburg's budget laws, which say nothing either way (as the Bund's do,
 * `shared/utils/budgetExempt.ts`): the yearly Landeshaushaltsgesetz and its
 * amendments — a short title that STARTS with „Landeshaushaltsgesetz", or a
 * title that enacts „den Landeshaushalt für das Haushaltsjahr". Not the
 * Allgemeines Landeshaushaltsgesetz, the organic law: an amendment to it is
 * ordinary legislation, as the Bund keeps the BHG out of its table.
 */
export function isLandBudgetLaw(title: string, kurztitel: string | null): boolean {
  return /^Landeshaushaltsgesetz\b/.test(kurztitel ?? '') || /\bmit dem der Landeshaushalt für das Haushaltsjahr\b/.test(title)
}

/* ------------------------------------------------------------------ *
 * The Landtag documents' signal (Salzburg)
 * ------------------------------------------------------------------ */

/** What one Landtag document says about a Begutachtung, read from its whole text. */
export interface DocSignal {
  /** The Erläuterungen' heading „Ergebnis(se) des Begutachtungsverfahrens". */
  heading: boolean
  /** A sentence saying that there was none, or that it was dispensed with. */
  negative: boolean
  /** The word „Begutachtung" anywhere — for an Antrag, a doubt. */
  mentions: boolean
}

const HEADING_RE = /Ergebnis(?:se)?\s+des\s+Begutachtungs/i
const NEGATIVE_RE = /(?:(?:kein\w*|ohne|nicht)\s+(?:\S+\s+){0,3}Begutachtung\w*|Begutachtung\w*\s+(?:\S+\s+){0,6}(?:abgesehen|entfallen|unterblieben|nicht durchgeführt|verzichtet))/i
const MENTION_RE = /Begutachtung/i

/** The script's three readings (`laenderOhneBegutachtung.ts`, `docSignal`), as one pure function. */
export function docSignalOf(text: string): DocSignal {
  const t = text.replace(/\s+/g, ' ')
  return { heading: HEADING_RE.test(t), negative: NEGATIVE_RE.test(t), mentions: MENTION_RE.test(t) }
}

/* ------------------------------------------------------------------ *
 * The relaxed title check (the script's `unknown` tier)
 * ------------------------------------------------------------------ */

const DAY_MS = 86_400_000
/** How far before the Beschluss a draft may have begun (the title search's own window). */
export const SIMILAR_WINDOW_DAYS = 730
/** Overlap of distinctive title words, shared / smaller set — the script's chosen threshold. */
export const SIMILAR_THRESHOLD = 0.5

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return shared / Math.min(a.size, b.size)
}

/**
 * Whether a Gesetz draft of the register, begun up to two years before the
 * Beschluss (or the Kundmachung, where RIS dates no Beschluss), shares at
 * least half of the law's distinctive title words. Such a law says nothing:
 * its draft may be the one the title search missed.
 */
export function hasSimilarDraft(law: { titel: string; datum: string }, decidedAt: string | null, drafts: readonly LandConsultation[]): boolean {
  const end = decidedAt ?? law.datum
  const words = lgblWords(law.titel)
  return drafts.some((d) => {
    if (d.kind !== 'gesetz') return false
    const ref = d.startedAt ?? d.deadline ?? d.placedAt ?? null
    if (!ref || ref > end || Date.parse(ref) < Date.parse(end) - SIMILAR_WINDOW_DAYS * DAY_MS) return false
    return overlap(words, lgblWords(d.title)) >= SIMILAR_THRESHOLD - 1e-9
  })
}

/* ------------------------------------------------------------------ *
 * The classification
 * ------------------------------------------------------------------ */

/** The Länder whose sources can carry a Begutachtung statement per law. */
export const STATEMENT_LANDS: ReadonlySet<LandCode> = new Set(['sbg'])

/** What is known about one law when it is classified. */
export interface LawFacts {
  land: LandCode
  /** A draft of the register joins (the Land's record or the title search); null where the join could not be read. */
  joined: boolean | null
  budget: boolean
  /** A draft of the register with a similar title (`hasSimilarDraft`); null where the register could not be read. */
  similarDraft: boolean | null
  route: LandLawRoute | null
  /** The Vorlage's signal, read in full; null where it was not read or the read failed. */
  vorlage: DocSignal | null
  /** The Antrag's signal, likewise. */
  antrag: DocSignal | null
  /**
   * The committee report's signal: `undefined` where RIS links no report,
   * null where it links one that was not read. A report that names a
   * Begutachtung without saying there was none is a doubt; one that says
   * there was none („… ohne Begutachtungsverfahren vorgenommen werden
   * solle", three of Salzburg's 38 on 10.11.2026) is not.
   */
  report?: DocSignal | null
}

/**
 * The statement a law's row and page may make (`LandLawBegutachtung`), in
 * this order: consulted by a draft, consulted by the Vorlage's heading
 * (unless the Vorlage also says there was none), silent for the reasons
 * that keep it so, and „none" last and only on full evidence.
 */
export function classifyLandLaw(f: LawFacts): LandLawBegutachtung {
  if (f.joined) return { kind: 'consulted', by: 'draft' }
  if (!STATEMENT_LANDS.has(f.land)) return { kind: 'silent', reason: 'unsupported' }
  if (f.vorlage?.heading) {
    // A heading followed by „ein Begutachtungsverfahren wurde nicht durchgeführt" is no evidence either way.
    return f.vorlage.negative ? { kind: 'silent', reason: 'contradictory' } : { kind: 'consulted', by: 'heading' }
  }
  if (f.budget) return { kind: 'silent', reason: 'budget' }
  if (f.joined === null || f.similarDraft === null) return { kind: 'silent', reason: 'unread' }
  if (f.similarDraft) return { kind: 'silent', reason: 'similar-draft' }
  if (!f.route) return { kind: 'silent', reason: 'no-route' }
  if (!f.route.url) return { kind: 'silent', reason: 'no-route' }
  if (f.route.kind === 'vorlage' && !f.vorlage) return { kind: 'silent', reason: 'unread' }
  // An Initiativantrag: read in full, and not one mention of a Begutachtung —
  // a government draft passed on as a motion may say where it was consulted.
  if (f.route.kind === 'antrag') {
    if (!f.antrag) return { kind: 'silent', reason: 'unread' }
    if (f.antrag.mentions) return { kind: 'silent', reason: 'mentions' }
  }
  if (f.report === null) return { kind: 'silent', reason: 'unread' }
  if (f.report && f.report.mentions && !f.report.negative) return { kind: 'silent', reason: 'mentions' }
  return { kind: 'none' }
}

/* ------------------------------------------------------------------ *
 * The rows
 * ------------------------------------------------------------------ */

/** An index entry that carries a law's fields (`lgblIndex.ts`). */
export type LawEntry = LgblEntry & { meta: LgblLawMeta }

export function isLawEntry(e: LgblEntry): e is LawEntry {
  return LAW_TYPES.has(e.typ) && !!e.meta
}

/** „LGBl. Nr. 57/2026" → { year: 2026, number: 57 }. */
export function lgblParts(nr: string): { year: number; number: number } | null {
  const m = /Nr\.\s*(\d{1,4})\/(\d{4})\b/.exec(nr)
  return m ? { year: Number(m[2]), number: Number(m[1]) } : null
}

/** „LGBl. Nr. 57/2026" → „57/2026": one key for the Land's record, the title search and RIS. */
export function lgblNrKey(nr: string): string | null {
  const p = lgblParts(nr)
  return p ? `${p.number}/${p.year}` : null
}

/** The law as a row and a page know it, before the statement. */
export function landLawOf(land: LandCode, e: LawEntry, begutachtung: LandLawBegutachtung): LandLaw | null {
  const parts = lgblParts(e.nr)
  if (!parts) return null
  return {
    land,
    nr: e.nr,
    year: parts.year,
    number: parts.number,
    typ: e.typ === 'Landesverfassungsgesetz' ? 'Landesverfassungsgesetz' : 'Landesgesetz',
    title: e.titel,
    shortTitle: e.meta.kurztitel,
    date: e.datum,
    decidedAt: e.meta.beschluss ?? titleDecisionDate(e.titel),
    url: e.url,
    route: routeOf(land, e.meta),
    begutachtung,
  }
}

/**
 * Where the Land's register begins, as the list may use it: a law is a row
 * only where every draft that could join it — begun up to two years before
 * it — would still stand in the register. Wien keeps a year, Niederösterreich
 * and Vorarlberg only what runs: their laws get a page, and no row that
 * would read as „no draft before it" where the Land simply took the draft
 * down. Null: the register holds nothing dated.
 */
export function rowsFrom(drafts: readonly LandConsultation[]): string | null {
  let first: string | null = null
  for (const d of drafts) {
    if (d.kind !== 'gesetz') continue
    const date = d.startedAt ?? d.deadline ?? d.placedAt ?? null
    if (date && (!first || date < first)) first = date
  }
  if (!first) return null
  return new Date(Date.parse(first) + SIMILAR_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10)
}
