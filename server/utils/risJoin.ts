/**
 * RIS Begut ↔ Parliament ME join (docs/ris-join.md).
 *
 * PURE MODULE — no Nuxt auto-imports, no I/O, so vitest can execute it
 * directly and the regression test can replay the GP XXVII corpus.
 *
 * ruleVersion 1 (2026-09-06) is the corpus-test scorer; ruleVersion 2
 * (2026-09-07) adds what the first live GP XXVIII run taught (docs/ris-join.md
 * §3a). Any change to weights, bands or normalisation must keep
 * tests/risJoin.test.ts green on BOTH GPs or bump `RULE_VERSION` and
 * regenerate data/ris-me-map-gp27.json.
 */

import type { ConsultationSummary } from '../../shared/types'

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One RIS Begut record, flattened from the OGD search result. */
export interface RisBegutRecord {
  /** `Metadaten.Technisch.ID`, e.g. BEGUT_COO_2026_100_2_1836568 */
  id: string
  kurztitel: string | null
  titel: string | null
  /** `Bundesrecht.Begut.Abkuerzung` */
  abk: string | null
  /** `Bundesrecht.Begut.EinbringendeStelle`, "CODE (long name)" */
  stelle: string | null
  /** ISO date `BeginnBegutachtungsfrist` */
  beginn: string | null
  /** ISO date `EndeBegutachtungsfrist` */
  ende: string | null
}

/** One list-81 row, reduced to the join inputs (duplicates per INR allowed). */
export interface MeListRow {
  gp: string
  inr: number
  /** "95/ME" */
  cite: string
  title: string
  /** list-81 column 6, e.g. "BKA" */
  ministryCode: string
  /** ISO date of Einlangen */
  arrival: string
  /** ISO date of the Frist; null when upstream has none */
  frist: string | null
  /**
   * Optional full title from the detail JSON (`description`, "Ministerial-
   * entwurf betreffend …"). When present and equal to a RIS Titel/Kurztitel
   * after normalisation, the title score is 1.0 (`exactTitle`).
   */
  description?: string | null
}

/** A list-81 row set deduped by INR. */
export interface MeItem {
  gp: string
  inr: number
  cite: string
  title: string
  ministryCodes: string[]
  arrival: string
  frist: string | null
  description: string | null
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type RisClass = 'gesetz' | 'verordnung' | 'other'
export type JoinStatus = 'matched' | 'matched_weak' | 'ambiguous' | 'unmatched'
export type JoinTier = 'A' | 'B' | 'C'

export interface TitleScore {
  jac: number
  cont: number
  covMe: number
  lcp: number
  nA: number
  nB: number
  field: 'kurztitel' | 'titel' | 'abk' | null
  score: number
  abkMatch: boolean
  exactTitle: boolean
}

export interface JoinCandidate {
  risId: string
  risKurztitel: string | null
  risTitel: string | null
  risCode: string
  risClass: RisClass
  beginn: string
  ende: string | null
  /** RIS Beginn − Parliament arrival, in days */
  dateOffset: number
  /** RIS Ende − Parliament Frist, in days; null when either is missing */
  endOffset: number | null
  dateScore: number
  endScore: number
  ministryScore: number
  classPenalty: number
  title: TitleScore
  score: number
  /** Jaccard of ME core title vs RIS Kurztitel, used only for tie-breaks */
  ktJac: number
}

export interface JoinRow {
  cite: string
  inr: number
  status: JoinStatus
  tier: JoinTier | null
  risId: string | null
  duplicates: string[]
  reason: string | null
  candidates: JoinCandidate[]
}

// ---------------------------------------------------------------------------
// Rule parameters (ruleVersion 1)
// ---------------------------------------------------------------------------

export const RULE_VERSION = 2

/** v2: Ende outweighs Beginn — it is the sharper signal (336/337 on GP XXVII). */
export const JOIN_WEIGHTS = { date: 0.2, end: 0.3, ministry: 0.15, title: 0.35 }
export const CLASS_PENALTY: Record<RisClass, number> = { gesetz: 0, other: 0.05, verordnung: 0.15 }
export const ACCEPT_THRESHOLD = 0.75
export const AMBIGUITY_MARGIN = 0.1
/**
 * Candidate window for RIS Beginn relative to Parliament arrival, days.
 * v2: a record whose Ende equals the Frist is a candidate regardless of the
 * Beginn offset (12/ME XXVIII: RIS published 18 days before Parliament).
 */
export const BEGINN_WINDOW: readonly [number, number] = [-14, 7]

/** RIS spells some codes without umlauts. */
const SPELLING: Record<string, string> = { BMKOES: 'BMKÖS' }

/**
 * Ministry lineage groups for GP XXVII (competence moves, state-secretary
 * drafts filed under BKA). Derived from co-occurrence on the corpus — must
 * be re-derived per GP, see docs/ris-join.md §4.
 */
export const MINISTRY_LINEAGE: readonly (readonly string[])[] = [
  ['BMA', 'BMAW', 'BMDW', 'BMAFJ', 'BMASGK'],
  ['BMSGPK', 'BMASGK', 'BMAFJ'],
  ['BMLRT', 'BML', 'BMNT', 'BMK'],
  ['BMVIT', 'BMK', 'BMNT'],
  ['BMJ', 'BMVRDJ'],
  ['BKA', 'BMEUV', 'BMFFIM', 'BMVRDJ', 'BMKÖS'],
  // GP XXVIII (government of March 2025): successor codes
  ['BMBWF', 'BMB', 'BMFWF'],
  ['BMK', 'BMLUK', 'BMIMI', 'BML'],
  ['BMSGPK', 'BMASGPK'],
  ['BMAW', 'BMWET', 'BMWKMS', 'BMDW'],
  ['BKA', 'BMEIF'],
]

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

const STOP = new Set(
  `ministerialentwurf betreffend entwurf eines eine einer ein des der die das den dem mit und sowie wird werden geändert geaendert aenderung änderung änderungen erlassen erlassung bundesgesetz bundesgesetzes bundesgesetze bg über ueber zur zum für fuer im in an auf von vom durch bundesministers bundesministerin bundesministeriums bundesminister ua bzw sonstige weitere andere weiterer anderer aufhebung aufgehoben begutachtung`.split(
    /\s+/,
  ),
)
const ROMAN = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'])

/**
 * Parliament appends package abbreviations as " – ABK" segments
 * ("Sanktionengesetz 2024 – SanktG"). Returns the core title and the set of
 * abbreviations (lower-cased).
 */
export function splitParliamentTitle(title: string): { core: string; abks: Set<string> } {
  const core: string[] = []
  const abks = new Set<string>()
  for (const part of (title ?? '').split(';')) {
    const segs = part.split(/\s[–—]\s/).map((s) => s.trim())
    core.push(segs[0] ?? '')
    for (const s of segs.slice(1)) {
      if (s.length <= 30 && !/\s(des|der|die|das|und|mit|über)\s/.test(s.toLowerCase())) {
        abks.add(s.toLowerCase().replace(/\s+/g, ' '))
      } else {
        core.push(s)
      }
    }
  }
  return { core: core.join('; '), abks }
}

export function normalizeTitleText(s: string | null | undefined): string {
  let t = (s ?? '').normalize('NFC').toLowerCase().replace(/ß/g, 'ss')
  t = t.replace(/ministerialentwurf betreffend/g, '')
  t = t.replace(/\bu\.a\.?/g, '')
  t = t.replace(/[–—\-/;:,.()[\]„“"'’‚‘§]/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

function stem(t: string): string {
  t = t.replace(/(gesetz|buch|statut|vertrag|gesetzbuch|kodex|ordnung)es$/, '$1')
  t = t.replace(/(gesetz|gesetzbuch|buch)s$/, '$1')
  return t
}

const tokenCache = new Map<string, string[]>()

/** Ordered, stemmed, stop-word-free tokens of a title. */
export function titleTokens(s: string | null | undefined): string[] {
  const key = s ?? ''
  const hit = tokenCache.get(key)
  if (hit) return hit
  const out: string[] = []
  for (const t of normalizeTitleText(key).split(' ')) {
    if (!t || STOP.has(t)) continue
    if (t.length === 1 && !ROMAN.has(t) && !/^\d$/.test(t)) continue
    const m = /^(.{6,}?)(novelle|paket)$/.exec(t)
    if (m) {
      out.push(stem(m[1]!), m[2]!)
      continue
    }
    out.push(stem(t))
  }
  tokenCache.set(key, out)
  return out
}

function tokenSet(s: string | null | undefined): Set<string> {
  return new Set(titleTokens(s))
}

function softMatch(a: string, b: string): boolean {
  if (a === b) return true
  return a.length >= 8 && b.length >= 8 && (a.startsWith(b) || b.startsWith(a))
}

/** Count of tokens in A that have a soft match in B. */
function softIntersection(A: Set<string>, B: Set<string>): number {
  let n = 0
  for (const a of A) {
    for (const b of B) {
      if (softMatch(a, b)) {
        n++
        break
      }
    }
  }
  return n
}

const round3 = (x: number) => Math.round(x * 1000) / 1000

interface TitleComponents {
  jac: number
  cont: number
  covMe: number
  lcp: number
  nA: number
  nB: number
}

const componentCache = new Map<string, TitleComponents>()

/**
 * Similarity components between the ME core title and one RIS title field.
 * `cont` (containment of the shorter side) is the load-bearing number;
 * Jaccard alone fails because RIS enumerates every amended law.
 */
export function titleComponents(meCore: string, risText: string): TitleComponents {
  const key = `${meCore}\0${risText}`
  const cached = componentCache.get(key)
  if (cached) return cached
  const A = tokenSet(meCore)
  const B = tokenSet(risText)
  let result: TitleComponents
  if (A.size === 0 || B.size === 0) {
    result = { jac: 0, cont: 0, covMe: 0, lcp: 0, nA: A.size, nB: B.size }
  } else {
    const ia = softIntersection(A, B)
    const ib = softIntersection(B, A)
    const union = A.size + B.size - Math.min(ia, ib)
    const jac = union ? Math.min(ia, ib) / union : 0
    const minSize = Math.min(A.size, B.size)
    const cont = minSize ? Math.min(ia, ib) / minSize : 0
    const covMe = ia / A.size
    const a = titleTokens(meCore).join(' ')
    const b = titleTokens(risText).join(' ')
    let n = 0
    const len = Math.min(a.length, b.length)
    while (n < len && a[n] === b[n]) n++
    const lcp = a && b ? n / len : 0
    result = { jac: round3(jac), cont: round3(cont), covMe: round3(covMe), lcp: round3(lcp), nA: A.size, nB: B.size }
  }
  componentCache.set(key, result)
  return result
}

/** Abbreviations a RIS record announces: `Abkuerzung` plus "(ABK)" / "– ABK" in the titles. */
export function risAbbreviations(r: RisBegutRecord): Set<string> {
  const out = new Set<string>()
  if (r.abk) out.add(r.abk.toLowerCase().trim().replace(/\s+/g, ' '))
  for (const f of [r.kurztitel, r.titel]) {
    const s = f ?? ''
    for (const m of s.matchAll(/[–—-]\s*([A-ZÄÖÜ][\w\-.ÄÖÜäöü]*(?:\s\d{4})?(?:\s(?:Teil\s)?[IVX]+)?)\)?\s*$/g)) {
      out.add(m[1]!.toLowerCase().trim())
    }
    for (const m of s.matchAll(/\(([A-ZÄÖÜ][\w\-.ÄÖÜäöü]{1,20}(?:\s\d{4})?)\)/g)) {
      out.add(m[1]!.toLowerCase().trim())
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// RIS record classification (Gesetz / Verordnung / other)
// ---------------------------------------------------------------------------

interface ClassSignals {
  voHead: boolean
  voAny: boolean
  gesHead: boolean
  gesAny: boolean
  other: boolean
}

function classSignals(s: string | null): ClassSignals {
  const t = (s ?? '').toLowerCase()
  return {
    voHead:
      /^\s*(entwurf (einer|der|zur) )?(verordnung|kundmachung)/.test(t) ||
      /^\s*(entwurf (einer|der) )?(novelle|neuerlassung|änderung|erlassung)\b.*(verordnung|ordnung\b|-v\b|\bv\b|v \d{4}|\w+vo\b|-vo\b)/.test(t),
    voAny:
      /verordnung|\bvo\b|-vo\b|\w+vo\s*\d{4}|ausbildungsordnung|betriebsordnung|prüfungsordnung|wahlordnung|studienordnung|lehrplan|\bv\b\s*\d{4}|\w+v\s*\d{4}\b|-v\b|kundmachung/.test(
        t,
      ),
    gesHead:
      /^\s*(entwurf (eines|des) )?(bundes(verfassungs)?gesetz|sammelgesetz|gesetz\b)/.test(t) ||
      /^\s*(entwurf (eines|des) )?(novelle|neuerlassung|änderung|erlassung)\b.*(gesetz|\bg\b|g \d{4}|-g\b|\bbg\b)/.test(t),
    gesAny: /gesetz|novelle|\bg\s*\d{4}\b|-g\b|\bbvg\b|b-vg|\bbg\b/.test(t),
    other:
      /staatsvertrag|abkommen\b|vereinbarung gemäß|vereinbarung zwischen|vereinbarung nach|richtlinie des|kundmachung|übereinkommen|protokoll\b|vertrag zwischen|15a b-vg|art\. 15a|artikel 15a|leitlinie|erlass\b|rundschreiben|strategie|programm\b|plan\b/.test(
        t,
      ),
  }
}

/**
 * RIS Begut has no type field; roughly two thirds of its records are
 * Verordnungen that never reach Parliament. Title-based classification,
 * Titel first (the type word leads), then Kurztitel.
 */
export function classifyRisRecord(r: Pick<RisBegutRecord, 'kurztitel' | 'titel'>): RisClass {
  const kt = classSignals(r.kurztitel)
  const ti = classSignals(r.titel)
  for (const s of [ti, kt]) {
    if (s.voHead && !s.gesHead) return 'verordnung'
    if (s.gesHead && !s.voHead) return 'gesetz'
  }
  const anyVo = kt.voAny || ti.voAny
  const anyG = kt.gesAny || ti.gesAny
  const oth = kt.other || ti.other
  if (oth && !anyG && !anyVo) return 'other'
  if (anyVo && !anyG) return 'verordnung'
  if (anyG && !anyVo) return 'gesetz'
  if (anyG && anyVo) {
    const s = (r.titel || r.kurztitel || '').toLowerCase()
    const pv = /verordnung|\bvo\b|\w+vo\b/.exec(s)
    const pg = /gesetz/.exec(s)
    if (pv && pg) return pv.index < pg.index ? 'verordnung' : 'gesetz'
    return pv ? 'verordnung' : 'gesetz'
  }
  return 'other'
}

// ---------------------------------------------------------------------------
// Ministry
// ---------------------------------------------------------------------------

/** "BKA (Bundeskanzleramt)" → "BKA"; two long-name-only variants mapped by hand. */
export function ministryCodeOf(stelle: string | null): string {
  const m = /^([A-ZÄÖÜ]{2,8})\s*\(/.exec(stelle ?? '')
  if (m) return m[1]!
  const s = (stelle ?? '').toLowerCase()
  if (s.includes('eu und verfassung')) return 'BMEUV'
  if (s.includes('frauen, familie, integration und medien')) return 'BMFFIM'
  if (s.includes('europa, integration und familie')) return 'BMEIF'
  return stelle ?? ''
}

export function ministryScore(meCodes: ReadonlySet<string>, risCode: string): number {
  const rc = SPELLING[risCode] ?? risCode
  if (meCodes.has(rc)) return 1
  for (const g of MINISTRY_LINEAGE) {
    if (g.includes(rc) && [...meCodes].some((c) => g.includes(c))) return 0.5
  }
  return 0
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

/** Days between two ISO dates (b − a). Both must be `YYYY-MM-DD`. */
export function daysBetween(a: string, b: string): number {
  const pa = a.slice(0, 10).split('-').map(Number)
  const pb = b.slice(0, 10).split('-').map(Number)
  const ta = Date.UTC(pa[0]!, pa[1]! - 1, pa[2]!)
  const tb = Date.UTC(pb[0]!, pb[1]! - 1, pb[2]!)
  return Math.round((tb - ta) / DAY_MS)
}

export function dateScore(offset: number): number {
  if (offset === 0 || offset === -1) return 1
  if (offset >= -3 && offset <= 1) return 0.8
  if (offset >= -7 && offset <= 3) return 0.6
  if (offset >= -14 && offset <= 7) return 0.3
  return 0
}

export function endScore(offset: number | null): number {
  if (offset === null) return 0
  if (offset === 0) return 1
  if (Math.abs(offset) <= 3) return 0.5
  return 0
}

export function titleScore(meCore: string, meAbks: ReadonlySet<string>, r: RisBegutRecord, description: string | null): TitleScore {
  let best: TitleScore | null = null
  const normDesc = description ? normalizeTitleText(description) : null
  // v2: RIS `Abkuerzung` is a third title field — ministries put the whole
  // package name there ("MinroG-Novelle IE-R 2025"), which is what
  // Parliament uses as the title.
  for (const field of ['kurztitel', 'titel', 'abk'] as const) {
    const text = r[field]
    if (!text) continue
    const c = titleComponents(meCore, text)
    let s: number
    if (c.cont >= 0.99 && Math.min(c.nA, c.nB) >= 2) s = 0.9 + 0.1 * Math.max(c.jac, c.lcp)
    else if (c.cont >= 0.99) s = Math.max(0.6, c.jac, c.lcp)
    else s = Math.max(c.cont * 0.8, c.jac, c.lcp * 0.9, c.covMe * 0.9)
    const exactTitle = normDesc !== null && normDesc.length > 0 && normDesc === normalizeTitleText(text)
    if (exactTitle) s = 1
    const cand: TitleScore = { ...c, field, score: round3(Math.min(s, 1)), abkMatch: false, exactTitle }
    if (!best || cand.score > best.score || (cand.score === best.score && cand.jac > best.jac)) best = cand
  }
  if (!best) best = { jac: 0, cont: 0, covMe: 0, lcp: 0, nA: 0, nB: 0, field: null, score: 0, abkMatch: false, exactTitle: false }
  const ra = risAbbreviations(r)
  const kt = (r.kurztitel ?? '').toLowerCase()
  const ti = (r.titel ?? '').toLowerCase()
  let abkHit = false
  for (const a of meAbks) {
    if (ra.has(a) || (a.length >= 4 && (kt.includes(a) || ti.includes(a)))) {
      abkHit = true
      break
    }
  }
  best.abkMatch = abkHit
  if (abkHit) best.score = Math.max(best.score, 0.9)
  return best
}

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------

/** Adapter: mapped list-81 summaries → join input rows (duplicates per INR are fine). */
export function toMeListRows(items: readonly ConsultationSummary[]): MeListRow[] {
  return items.map((c) => ({
    gp: c.gp,
    inr: c.inr,
    cite: c.citation,
    title: c.title,
    ministryCode: c.ministryCode,
    arrival: c.arrivedAt.slice(0, 10),
    frist: c.deadline ? c.deadline.slice(0, 10) : null,
  }))
}

/** Collapse list-81 rows (one per co-submitting ministry) into one item per INR. */
export function dedupeMeRows(rows: readonly MeListRow[]): MeItem[] {
  const byInr = new Map<number, MeItem>()
  for (const r of rows) {
    const item = byInr.get(r.inr)
    if (!item) {
      byInr.set(r.inr, {
        gp: r.gp,
        inr: r.inr,
        cite: r.cite,
        title: r.title,
        ministryCodes: [r.ministryCode],
        arrival: r.arrival,
        frist: r.frist,
        description: r.description ?? null,
      })
    } else {
      if (!item.ministryCodes.includes(r.ministryCode)) item.ministryCodes.push(r.ministryCode)
      if (!item.description && r.description) item.description = r.description
    }
  }
  return [...byInr.values()]
}

interface ScoredRis extends RisBegutRecord {
  code: string
  cls: RisClass
}

function candidateOrder(a: JoinCandidate, b: JoinCandidate): number {
  return (
    b.score - a.score ||
    b.title.score - a.title.score ||
    b.ktJac - a.ktJac ||
    Math.abs(a.dateOffset) - Math.abs(b.dateOffset)
  )
}

/** Two RIS records that are the same consultation published twice. */
function isRisDuplicate(a: JoinCandidate, b: JoinCandidate): boolean {
  if (a.risCode !== b.risCode || a.ende !== b.ende) return false
  if (Math.abs(daysBetween(a.beginn, b.beginn)) > 1) return false
  const c = titleComponents(a.risKurztitel ?? '', b.risKurztitel ?? '')
  const c2 = titleComponents(a.risTitel ?? '', b.risTitel ?? '')
  return Math.max(c.jac, c2.jac) >= 0.8 || Math.max(c.cont, c2.cont) >= 0.99
}

/**
 * Join deduped MEs against RIS Begut records. Deterministic; the order of
 * `mes` and `ris` only matters for ties (stable sorts throughout).
 */
export function joinRisToMe(mes: readonly MeItem[], ris: readonly RisBegutRecord[]): JoinRow[] {
  const scored: ScoredRis[] = ris
    .filter((r) => r.beginn)
    .map((r) => ({ ...r, code: ministryCodeOf(r.stelle), cls: classifyRisRecord(r) }))

  const rows: JoinRow[] = []
  const allPairs: { cite: string; c: JoinCandidate }[] = []

  for (const m of mes) {
    const { core, abks } = splitParliamentTitle(m.title)
    const meCodes = new Set(m.ministryCodes)
    const candidates: JoinCandidate[] = []
    for (const r of scored) {
      const off = daysBetween(m.arrival, r.beginn!)
      const endOffset = r.ende && m.frist ? daysBetween(m.frist, r.ende) : null
      if ((off < BEGINN_WINDOW[0] || off > BEGINN_WINDOW[1]) && endOffset !== 0) continue
      const t = titleScore(core, abks, r, m.description)
      const ds = dateScore(off)
      const es = endScore(endOffset)
      const ms = ministryScore(meCodes, r.code)
      const penalty = CLASS_PENALTY[r.cls]
      const score = round3(
        JOIN_WEIGHTS.date * ds + JOIN_WEIGHTS.end * es + JOIN_WEIGHTS.ministry * ms + JOIN_WEIGHTS.title * t.score - penalty,
      )
      const c: JoinCandidate = {
        risId: r.id,
        risKurztitel: r.kurztitel,
        risTitel: r.titel,
        risCode: r.code,
        risClass: r.cls,
        beginn: r.beginn!,
        ende: r.ende,
        dateOffset: off,
        endOffset,
        dateScore: ds,
        endScore: es,
        ministryScore: ms,
        classPenalty: penalty,
        title: t,
        score,
        ktJac: titleComponents(core, r.kurztitel ?? '').jac,
      }
      candidates.push(c)
      allPairs.push({ cite: m.cite, c })
    }
    candidates.sort(candidateOrder)
    rows.push({ cite: m.cite, inr: m.inr, status: 'unmatched', tier: null, risId: null, duplicates: [], reason: null, candidates })
  }

  // Greedy 1:1 assignment over all pairs, best score first.
  const assignedRis = new Map<string, string>()
  const assignedMe = new Map<string, JoinCandidate>()
  allPairs.sort((x, y) => candidateOrder(x.c, y.c))
  for (const { cite, c } of allPairs) {
    if (c.score < ACCEPT_THRESHOLD) break
    if (assignedMe.has(cite) || assignedRis.has(c.risId)) continue
    assignedMe.set(cite, c)
    assignedRis.set(c.risId, cite)
  }

  for (const row of rows) {
    const c = row.candidates
    if (c.length === 0) {
      row.reason = `no RIS record with Beginn within [${BEGINN_WINDOW[0]},+${BEGINN_WINDOW[1]}] days`
      continue
    }
    const best = c[0]!
    if (best.score < ACCEPT_THRESHOLD) {
      // v2 Fristabweichung: Beginn, ministry and title all exact, only the
      // Ende disagrees between the two official publications (84/ME XXVII:
      // RIS typo one month off; 56/ME XXVIII: same). Three of four signals
      // is a match; the deadline discrepancy is data to show, not a reason
      // to drop the row.
      const frist = c.filter(
        (x) => x.dateScore === 1 && x.ministryScore === 1 && x.title.score >= 0.9 && x.risClass !== 'verordnung' && !assignedRis.has(x.risId),
      )
      // Rivals that are Verordnungen do not count: they are never MEs (84/ME
      // XXVII sits next to two HSWO Verordnungen with the same dates).
      if (frist.length === 1 && c.every((x) => x === frist[0] || x.risClass === 'verordnung' || x.score < 0.6)) {
        row.status = 'matched'
        row.tier = 'B'
        row.risId = frist[0]!.risId
        row.reason = `Fristabweichung: RIS-Ende ${frist[0]!.endOffset === null ? 'fehlt' : `${frist[0]!.endOffset > 0 ? '+' : ''}${frist[0]!.endOffset} Tage`}`
        assignedRis.set(frist[0]!.risId, row.cite)
        continue
      }
      const weak = c.filter(
        // v2: class 'other' admitted — RIS titles like "Verbot der … Genitalbilder"
        // (11/ME XXVIII, a StGB amendment) carry no type word at all.
        (x) => x.dateScore >= 0.8 && x.endScore === 1 && x.ministryScore === 1 && x.risClass !== 'verordnung' && !assignedRis.has(x.risId),
      )
      if (weak.length === 1 && c.every((x) => x === weak[0] || x.score < 0.5)) {
        row.status = 'matched_weak'
        row.tier = 'C'
        row.risId = weak[0]!.risId
        row.reason = `dates+ministry unique, title score ${weak[0]!.title.score.toFixed(2)}`
        continue
      }
      row.reason = `best candidate below acceptance (score ${best.score.toFixed(2)})`
      continue
    }
    const chosen = assignedMe.get(row.cite)
    if (!chosen) {
      row.status = 'ambiguous'
      row.reason =
        'best candidate(s) already assigned to another ME: ' +
        c
          .filter((x) => x.score >= ACCEPT_THRESHOLD)
          .map((x) => `${(x.risKurztitel ?? '').slice(0, 50)}->${assignedRis.get(x.risId) ?? '?'}`)
          .join('; ')
      continue
    }
    const dups = c.filter((x) => x !== chosen && x.score >= ACCEPT_THRESHOLD && isRisDuplicate(chosen, x))
    const rivals = c.filter(
      (x) =>
        x !== chosen &&
        !dups.includes(x) &&
        x.score >= ACCEPT_THRESHOLD &&
        chosen.score - x.score < AMBIGUITY_MARGIN &&
        !assignedRis.has(x.risId),
    )
    if (rivals.length) {
      row.status = 'ambiguous'
      row.reason = `${rivals.length} rival(s) within margin: ${rivals.map((r) => (r.risKurztitel ?? '').slice(0, 60)).join('; ')}`
      continue
    }
    row.status = 'matched'
    row.risId = chosen.risId
    row.duplicates = dups.map((x) => x.risId)
    row.tier = chosen.score >= 0.9 ? 'A' : 'B'
    const notes: string[] = []
    if (dups.length) notes.push(`dup RIS record(s): ${dups.length}`)
    if (chosen !== best) notes.push(`assignment overrode top-scored candidate ${best.risId}`)
    row.reason = notes.length ? notes.join(' | ') : null
  }
  return rows
}
